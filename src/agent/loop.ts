import type { TandemEnv } from "../config/env.js";
import { streamChatCompletion } from "../deepseek/client.js";
import { MAX_RETRIES, describeError, isTransientError, retryDelayMs, sleep } from "../deepseek/errors.js";
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
  | { type: "retrying"; attempt: number; max: number; delayMs: number; reason: string }
  | { type: "max_iterations_reached" }
  | { type: "budget_exceeded"; spentUsd: number; budgetUsd: number }
  | { type: "interrupted" };

export interface AgentLoopOptions {
  env: TandemEnv;
  model: "deepseek-v4-pro" | "deepseek-v4-flash";
  /** `undefined` = thinking mode is off for this call. */
  thinking?: ThinkingConfig;
  cwd: string;
  session: Session;
  usage: UsageAccumulator;
  maxIterations?: number;
  /**
   * Called when the iteration limit is reached. `true` = continue for another `maxIterations` calls,
   * `false` (or no callback) = stop with `max_iterations_reached`.
   */
  onIterationLimit?: (info: { iterations: number }) => Promise<boolean>;
  /** Stops BEFORE the next call if the accumulated cost is >= this. */
  budgetUsd?: number;
  /** ESC in the REPL: aborts the current API call/tool and keeps the partial result. */
  signal?: AbortSignal;
  /** Called before every destructive action. */
  approve: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

// Reasoning models (especially reasoningEffort: "max") can fall into a long thinking
// loop and generate hundreds of thousands of tokens before the final answer.
// Without this cap `reasoning += ev.delta` grows without bound, token by token, and
// exhausts the heap even on small projects, regardless of tool output.
const MAX_REASONING_CHARS = 200_000;

/**
 * `messages` must already contain the system message + the initial user request (and the
 * history when a session is resumed); the caller is responsible for writing THOSE messages
 * to the session before calling. The loop persists only the messages it generates itself
 * (assistant/tool).
 */
export async function* runAgentLoop(
  messages: ChatMessage[],
  opts: AgentLoopOptions
): AsyncGenerator<AgentEvent> {
  const ctx: ToolContext = { cwd: opts.cwd, env: opts.env, usage: opts.usage, ...(opts.signal ? { signal: opts.signal } : {}) };
  const maxIterations = opts.maxIterations ?? 25;
  // The limit moves by another "chunk" each time the user (or autoContinue) allows continuing.
  let limit = maxIterations;
  // Consecutive failed attempts of the current model call; reset once a call succeeds.
  let retryAttempt = 0;

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
    // Once anything has streamed in, a failed call cannot be repeated without duplicating output.
    let received = false;

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
            received = true;
            if (reasoning.length < MAX_REASONING_CHARS) {
              reasoning += ev.delta;
            }
            yield { type: "reasoning_delta", delta: ev.delta };
            break;
          case "content_delta":
            received = true;
            content += ev.delta;
            yield { type: "content_delta", delta: ev.delta };
            break;
          case "tool_call_delta": {
            received = true;
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
      if (!isAbortError(err)) {
        // A dropped connection or a 429/5xx before any output: wait and repeat this same call.
        if (!received && retryAttempt < MAX_RETRIES && isTransientError(err)) {
          const delayMs = retryDelayMs(retryAttempt);
          retryAttempt++;
          yield { type: "retrying", attempt: retryAttempt, max: MAX_RETRIES, delayMs, reason: describeError(err) };
          try {
            await sleep(delayMs, opts.signal);
          } catch {
            yield { type: "interrupted" };
            return;
          }
          iteration--;
          continue;
        }
        throw err;
      }
      // Aborted mid-stream: keep whatever has arrived so far as a message, but without
      // tool_calls (incomplete arguments cannot be executed reliably).
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
    retryAttempt = 0;

    const toolCalls: ToolCall[] = [...toolCallBuf.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, v]) => ({
        id: v.id ?? "",
        type: "function" as const,
        function: { name: v.name ?? "", arguments: v.args },
      }));

    // `tools` is sent on EVERY call in this loop, so the docs require returning the
    // reasoning_content of every previous turn, not only the ones that called a tool
    // (otherwise a documented 400, see docs/api-notes.md #2).
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
        // Stays {}: the tool will report missing/invalid arguments.
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
