import type { TandemEnv } from "../config/env.js";
import { streamChatCompletion } from "../deepseek/client.js";
import type { ChatMessage, ThinkingConfig, ToolCall, UsageInfo } from "../deepseek/types.js";
import { findTool, toolSpecs, type ToolContext, type ToolResult } from "./tools/index.js";
import { appendSessionMessage, type Session } from "./session.js";
import type { UsageAccumulator } from "./usage.js";

export type AgentEvent =
  | { type: "reasoning_delta"; delta: string }
  | { type: "content_delta"; delta: string }
  | { type: "tool_call_start"; id: string; name: string; args: Record<string, unknown> }
  | { type: "tool_call_result"; id: string; name: string; result: ToolResult }
  | { type: "tool_call_denied"; id: string; name: string }
  | { type: "usage"; usage: UsageInfo }
  | { type: "final"; content: string }
  | { type: "iteration"; n: number; max: number }
  | { type: "max_iterations_reached" }
  | { type: "budget_exceeded"; spentUsd: number; budgetUsd: number }
  | { type: "interrupted" };

export interface AgentLoopOptions {
  env: TandemEnv;
  model: "deepseek-v4-pro" | "deepseek-v4-flash";
  /** `undefined` = thinking mode isključen za ovaj poziv. */
  thinking?: ThinkingConfig;
  cwd: string;
  session: Session;
  usage: UsageAccumulator;
  maxIterations?: number;
  /**
   * Pozvano kad se dostigne granica iteracija. `true` = nastavi za još `maxIterations` poziva,
   * `false` (ili bez ovog callback-a) = stani sa `max_iterations_reached`.
   */
  onIterationLimit?: (info: { iterations: number }) => Promise<boolean>;
  /** Prekida PRE sledećeg poziva ako je akumulirana cena >= ovome. */
  budgetUsd?: number;
  /** ESC u REPL-u — prekida trenutni API poziv/alat, čuva parcijalan rezultat. */
  signal?: AbortSignal;
  /** Pozvano pre svake destruktivne akcije. */
  approve: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

// Reasoning modeli (posebno reasoningEffort: "max") mogu ući u dugu petlju
// razmišljanja i generisati stotine hiljada tokena pre finalnog odgovora.
// Bez ovog kapa `reasoning += ev.delta` raste neograničeno po tokenu i
// blokira heap čak i na malim projektima, nezavisno od izlaza alata.
const MAX_REASONING_CHARS = 200_000;

/**
 * `messages` mora već sadržati system + početni user zahtev (i istoriju ako
 * se nastavlja sesija) — pozivalac je odgovoran da TE poruke upiše u sesiju
 * pre poziva. Petlja perzistuje samo poruke koje sama generiše (assistant/tool).
 */
export async function* runAgentLoop(
  messages: ChatMessage[],
  opts: AgentLoopOptions
): AsyncGenerator<AgentEvent> {
  const ctx: ToolContext = { cwd: opts.cwd, env: opts.env, usage: opts.usage, ...(opts.signal ? { signal: opts.signal } : {}) };
  const maxIterations = opts.maxIterations ?? 25;
  // Granica se pomera za još jedan "komad" svaki put kad korisnik (ili autoContinue) dozvoli nastavak.
  let limit = maxIterations;

  for (let iteration = 0; ; iteration++) {
    if (iteration >= limit) {
      const proceed = opts.onIterationLimit ? await opts.onIterationLimit({ iterations: iteration }) : false;
      if (!proceed) {
        yield { type: "max_iterations_reached" };
        return;
      }
      limit += maxIterations;
    }

    if (opts.signal?.aborted) {
      yield { type: "interrupted" };
      return;
    }

    if (opts.budgetUsd !== undefined) {
      const spent = opts.usage.estimatedCostUsd();
      if (spent >= opts.budgetUsd) {
        yield { type: "budget_exceeded", spentUsd: spent, budgetUsd: opts.budgetUsd };
        return;
      }
    }

    yield { type: "iteration", n: iteration + 1, max: limit };

    let reasoning = "";
    let content = "";
    const toolCallBuf = new Map<number, { id?: string; name?: string; args: string }>();

    try {
      for await (const ev of streamChatCompletion(opts.env, {
        model: opts.model,
        messages,
        tools: toolSpecs,
        ...(opts.thinking !== undefined ? { thinking: opts.thinking } : {}),
        ...(opts.signal ? { signal: opts.signal } : {}),
      })) {
        switch (ev.type) {
          case "reasoning_delta":
            if (reasoning.length < MAX_REASONING_CHARS) {
              reasoning += ev.delta;
            }
            yield { type: "reasoning_delta", delta: ev.delta };
            break;
          case "content_delta":
            content += ev.delta;
            yield { type: "content_delta", delta: ev.delta };
            break;
          case "tool_call_delta": {
            const buf = toolCallBuf.get(ev.index) ?? { args: "" };
            if (ev.id) buf.id = ev.id;
            if (ev.name) buf.name = ev.name;
            if (ev.argumentsDelta) buf.args += ev.argumentsDelta;
            toolCallBuf.set(ev.index, buf);
            break;
          }
          case "usage":
            opts.usage.add(opts.model, ev.usage);
            yield { type: "usage", usage: ev.usage };
            break;
          case "done":
            break;
        }
      }
    } catch (err) {
      if (!isAbortError(err)) throw err;
      // Prekinuto usred streama — sačuvaj šta god je stiglo do sad kao poruku,
      // ali bez tool_calls (nepotpuni argumenti se ne mogu pouzdano izvršiti).
      if (content || reasoning) {
        const partialMessage: ChatMessage = {
          role: "assistant",
          content: content || null,
          ...(reasoning ? { reasoningContent: reasoning } : {}),
        };
        messages.push(partialMessage);
        await appendSessionMessage(opts.session, partialMessage);
      }
      yield { type: "interrupted" };
      return;
    }

    const toolCalls: ToolCall[] = [...toolCallBuf.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, v]) => ({
        id: v.id ?? "",
        type: "function" as const,
        function: { name: v.name ?? "", arguments: v.args },
      }));

    // `tools` se šalje na SVAKI poziv u ovoj petlji, pa dokumentacija traži
    // da se reasoning_content svakog prethodnog poteza vrati — ne samo onih
    // koji su zvali alat (inače dokumentovano 400, videti docs/api-notes.md #2).
    const assistantMessage: ChatMessage = {
      role: "assistant",
      content: content || null,
      ...(reasoning ? { reasoningContent: reasoning } : {}),
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
    };

    messages.push(assistantMessage);
    await appendSessionMessage(opts.session, assistantMessage);

    if (toolCalls.length === 0) {
      yield { type: "final", content };
      return;
    }

    for (const call of toolCalls) {
      if (opts.signal?.aborted) {
        yield { type: "interrupted" };
        return;
      }

      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
      } catch {
        // Ostaje {} — alat će prijaviti nedostajuće/neispravne argumente.
      }

      const tool = findTool(call.function.name);
      if (!tool) {
        const toolMsg: ChatMessage = {
          role: "tool",
          toolCallId: call.id,
          content: `Unknown tool: ${call.function.name}`,
        };
        messages.push(toolMsg);
        await appendSessionMessage(opts.session, toolMsg);
        continue;
      }

      yield { type: "tool_call_start", id: call.id, name: tool.name, args };

      if (tool.isDestructive(args)) {
        const approved = await opts.approve(tool.name, args);
        if (!approved) {
          yield { type: "tool_call_denied", id: call.id, name: tool.name };
          const toolMsg: ChatMessage = {
            role: "tool",
            toolCallId: call.id,
            content: "The user denied running this tool.",
          };
          messages.push(toolMsg);
          await appendSessionMessage(opts.session, toolMsg);
          continue;
        }
      }

      const result = await tool.execute(args, ctx);

      if (opts.signal?.aborted) {
        yield { type: "interrupted" };
        return;
      }

      yield { type: "tool_call_result", id: call.id, name: tool.name, result };

      const toolMsg: ChatMessage = { role: "tool", toolCallId: call.id, content: result.output };
      messages.push(toolMsg);
      await appendSessionMessage(opts.session, toolMsg);
    }
  }
}
