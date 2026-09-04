#!/usr/bin/env node
import React, { useEffect, useState } from "react";
import { render, Text, Box, useApp } from "ink";
import readline from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile } from "node:fs/promises";
import { resolveApiKey, resolveBaseUrl } from "./config/env.js";
import { loadConfig } from "./config/store.js";
import { DEFAULT_CONFIG } from "./config/schema.js";
import { runFirstRunWizard } from "./repl/wizard.js";
import { handleCommand } from "./repl/commands.js";
import { SYSTEM_PROMPT } from "./repl/system-prompt.js";
import { runAgentLoop, type AgentEvent } from "./agent/loop.js";
import { UsageAccumulator } from "./agent/usage.js";
import { isPeakHour } from "./agent/pricing.js";
import { saveClipboardImage } from "./agent/clipboard.js";
import { runOrchestration } from "./orchestrator/orchestrate.js";
import { appendSessionMessage, createSession, findLatestSession, loadSessionMessages } from "./agent/session.js";
import type { RuntimeState } from "./repl/state.js";
import type { ChatMessage, ThinkingConfig } from "./deepseek/types.js";

interface ApprovalResponse {
  approved: boolean;
  always: boolean;
}
type Approver = (toolName: string, args: Record<string, unknown>) => Promise<ApprovalResponse>;
export type ModelId = "deepseek-v4-pro" | "deepseek-v4-flash";

export interface TurnConfig {
  messages: ChatMessage[];
  model: ModelId;
  thinking?: ThinkingConfig;
  budgetUsd?: number;
  signal?: AbortSignal;
}

interface ToolLogEntry {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: "running" | "done" | "denied";
  output?: string;
  isError?: boolean;
}

function TurnView({
  state,
  turn,
  askApproval,
  onDone,
}: {
  state: RuntimeState;
  turn: TurnConfig;
  askApproval: Approver;
  onDone: () => void;
}) {
  const { exit } = useApp();
  const [reasoning, setReasoning] = useState("");
  const [content, setContent] = useState("");
  const [toolLog, setToolLog] = useState<ToolLogEntry[]>([]);
  const [pending, setPending] = useState<{ toolName: string; args: Record<string, unknown> } | null>(null);
  const [usageLine, setUsageLine] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    async function run(): Promise<void> {
      const approve = async (toolName: string, args: Record<string, unknown>): Promise<boolean> => {
        if (state.autoApprove) {
          console.error(`[--yes] auto-odobreno: ${toolName}(${JSON.stringify(args)})`);
          return true;
        }
        if (state.alwaysApprovedTools.has(toolName)) return true;
        setPending({ toolName, args });
        const response = await askApproval(toolName, args);
        setPending(null);
        if (response.always) state.alwaysApprovedTools.add(toolName);
        return response.approved;
      };

      for await (const event of runAgentLoop(turn.messages, {
        env: state.env,
        model: turn.model,
        cwd: state.cwd,
        session: state.session,
        usage: state.usage,
        approve,
        ...(turn.thinking !== undefined ? { thinking: turn.thinking } : {}),
        ...(turn.budgetUsd !== undefined ? { budgetUsd: turn.budgetUsd } : {}),
        ...(turn.signal !== undefined ? { signal: turn.signal } : {}),
      })) {
        handleEvent(event);
      }

      function handleEvent(event: AgentEvent): void {
        switch (event.type) {
          case "reasoning_delta":
            setReasoning((prev) => prev + event.delta);
            break;
          case "content_delta":
            setContent((prev) => prev + event.delta);
            break;
          case "tool_call_start":
            setToolLog((prev) => [...prev, { id: event.id, name: event.name, args: event.args, status: "running" }]);
            break;
          case "tool_call_result":
            setToolLog((prev) =>
              prev.map((t) =>
                t.id === event.id ? { ...t, status: "done", output: event.result.output, isError: event.result.isError } : t
              )
            );
            break;
          case "tool_call_denied":
            setToolLog((prev) => prev.map((t) => (t.id === event.id ? { ...t, status: "denied" } : t)));
            break;
          case "usage": {
            const total = state.usage.totals();
            setUsageLine(
              `tokens: ${total.promptTokens} in (${total.promptCacheHitTokens} cached) / ${total.completionTokens} out · ~$${state.usage.estimatedCostUsd().toFixed(4)} · ${state.usage.callCount} calls`
            );
            break;
          }
          case "final":
            setContent(event.content);
            break;
          case "max_iterations_reached":
            setNotice("Dostignut je maksimalan broj iteracija bez finalnog odgovora.");
            break;
          case "budget_exceeded":
            setNotice(
              `Budžet od $${event.budgetUsd.toFixed(2)} je dostignut (potrošeno ~$${event.spentUsd.toFixed(4)}). Petlja je zaustavljena pre sledećeg poziva — sesija je sačuvana, poveci budžet sa /budget i nastavi.`
            );
            break;
          case "interrupted":
            setNotice("⏹ Prekinuto (ESC). Sesija je sačuvana do ove tačke.");
            break;
        }
      }
    }

    run()
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        exit();
        onDone();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Box flexDirection="column" gap={1}>
      {reasoning.length > 0 && (
        <Box flexDirection="column">
          <Text dimColor>✻ Thinking…</Text>
          <Text dimColor>{reasoning}</Text>
        </Box>
      )}

      {toolLog.map((t) => {
        const lines = t.output?.split("\n") ?? [];
        const preview = lines.slice(0, 3).join("\n");
        const more = lines.length > 3;
        return (
          <Box key={t.id} flexDirection="column">
            <Text color={t.status === "denied" ? "yellow" : t.isError ? "red" : "cyan"}>
              ⏺ {t.name}({JSON.stringify(t.args)})
              {t.status === "running" ? "…" : t.status === "denied" ? " (odbijeno)" : ""}
            </Text>
            {preview && (
              <Text dimColor>
                {"  ⎿  "}
                {preview.slice(0, 400)}
                {more || preview.length > 400 ? ` … (${lines.length} linija)` : ""}
              </Text>
            )}
          </Box>
        );
      })}

      {pending && (
        <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
          <Text color="yellow" bold>
            Destruktivna akcija: {pending.toolName}({JSON.stringify(pending.args)})
          </Text>
          <Text dimColor>y = dozvoli, n = odbij, a = uvek dozvoli ovaj alat ovoj sesiji (odgovor ispod)</Text>
        </Box>
      )}

      {content.length > 0 && <Text>{content}</Text>}

      {usageLine && <Text color="gray">{usageLine}</Text>}
      {notice && <Text color="yellow">{notice}</Text>}
      {error && <Text color="red">Greška: {error}</Text>}
    </Box>
  );
}

function truncatePath(p: string, max = 50): string {
  return p.length > max ? `…${p.slice(-(max - 1))}` : p;
}

function Banner({ state }: { state: RuntimeState }) {
  const { exit } = useApp();
  useEffect(() => {
    exit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">
        ✻ Tandem Mode
      </Text>
      <Text dimColor>{truncatePath(state.cwd)}</Text>
    </Box>
  );
}

async function showBanner(state: RuntimeState): Promise<void> {
  await render(<Banner state={state} />).waitUntilExit();
}

async function runTurnConfig(state: RuntimeState, turn: TurnConfig, askApproval: Approver): Promise<void> {
  await new Promise<void>((resolve) => {
    render(<TurnView state={state} turn={turn} askApproval={askApproval} onDone={resolve} />);
  });
}

async function runTurn(
  state: RuntimeState,
  userText: string,
  askApproval: Approver,
  signal?: AbortSignal
): Promise<void> {
  const userMsg: ChatMessage = { role: "user", content: userText };
  state.messages.push(userMsg);
  await appendSessionMessage(state.session, userMsg);

  const thinking = state.thinkingEnabled ? { reasoningEffort: state.reasoningEffort } : undefined;
  const turn: TurnConfig = { messages: state.messages, model: state.model };
  if (thinking !== undefined) turn.thinking = thinking;
  if (state.budgetUsd !== undefined) turn.budgetUsd = state.budgetUsd;
  if (signal !== undefined) turn.signal = signal;

  await runTurnConfig(state, turn, askApproval);
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

async function runPlanTask(
  state: RuntimeState,
  task: string,
  askApproval: Approver,
  signal?: AbortSignal
): Promise<void> {
  try {
    await runOrchestration(task, {
      cwd: state.cwd,
      env: state.env,
      maxReviewLoops: state.maxReviewLoops,
      usage: state.usage,
      ...(signal !== undefined ? { signal } : {}),
      runWorkerTurn: (turn) => runTurnConfig(state, turn, askApproval),
    });
  } catch (err) {
    if (isAbortError(err)) {
      console.log("⏹ Orkestracija prekinuta (ESC).");
    } else {
      console.error(`Greška u orkestraciji: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

function parseApprovalAnswer(raw: string): ApprovalResponse {
  const lower = raw.trim().toLowerCase();
  if (lower === "a" || lower === "always") return { approved: true, always: true };
  return { approved: lower === "y", always: false };
}

/** Za single-shot poteze: sopstveni for-await čitač linija samo za y/n/a odobrenja. */
function createLineApprover(): { approve: Approver; close: () => void } {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const resolveRef: { current: ((response: ApprovalResponse) => void) | null } = { current: null };

  const consumeLines = async (): Promise<void> => {
    for await (const rawLine of rl) {
      if (resolveRef.current) {
        resolveRef.current(parseApprovalAnswer(rawLine));
        resolveRef.current = null;
      }
    }
  };
  void consumeLines();

  const approve: Approver = (toolName, args) => {
    console.log(`\nDozvoli izvršavanje ${toolName}(${JSON.stringify(args)})? (y/n/a — a = uvek dozvoli ovaj alat)`);
    return new Promise<ApprovalResponse>((resolve) => {
      resolveRef.current = resolve;
    });
  };

  return { approve, close: () => rl.close() };
}

/**
 * `.question()` je nepouzdan na piped/non-TTY stdin-u posle prvog poziva
 * (poznata Node quirka — drugi poziv nikad ne razrešava). Zato se čitanje
 * linija radi isključivo preko `for await...of rl`, koje pouzdano isporučuje
 * svaku liniju, uz ručni state-machine za odobrenje umesto ugnježdenog
 * `.question()`.
 */
async function runRepl(state: RuntimeState): Promise<void> {
  await showBanner(state);
  console.log("/help za komande, /exit za izlaz.\n");
  if (isPeakHour(new Date())) {
    console.log("⚠ Trenutno je peak sat (01–04h ili 06–10h UTC) — cene su duplo veće nego off-peak.\n");
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "> " });
  let closed = false;
  rl.on("close", () => {
    closed = true;
  });
  const showPrompt = (): void => {
    if (!closed) rl.prompt();
  };

  const approvalRef: { current: ((response: ApprovalResponse) => void) | null } = { current: null };
  let turnActive = false;
  let lastTurn: Promise<void> = Promise.resolve();

  const askApproval: Approver = (toolName, args) => {
    console.log(`\nDozvoli izvršavanje ${toolName}(${JSON.stringify(args)})? (y/n/a — a = uvek dozvoli ovaj alat)`);
    return new Promise<ApprovalResponse>((resolve) => {
      approvalRef.current = resolve;
    });
  };

  // ESC prekida trenutni potez. Radi samo na pravom TTY-ju — piped/scriptovani
  // unos ne generiše keypress evente, pa je interrupt tiho no-op tamo.
  const abortRef: { current: AbortController | null } = { current: null };
  readline.emitKeypressEvents(process.stdin);
  process.stdin.on("keypress", (_str, key: { name?: string } | undefined) => {
    if (key?.name === "escape" && abortRef.current) {
      abortRef.current.abort();
    }
  });

  showPrompt();

  for await (const rawLine of rl) {
    const line = rawLine.trim();

    if (approvalRef.current) {
      approvalRef.current(parseApprovalAnswer(line));
      approvalRef.current = null;
      continue;
    }

    if (!line) {
      showPrompt();
      continue;
    }

    if (turnActive) {
      console.log("Sačekaj da se trenutni potez završi.");
      continue;
    }

    const beginTurn = (run: (signal: AbortSignal) => Promise<void>): void => {
      turnActive = true;
      const controller = new AbortController();
      abortRef.current = controller;
      lastTurn = run(controller.signal).finally(() => {
        abortRef.current = null;
        turnActive = false;
        showPrompt();
      });
    };

    if (line.startsWith("/plan ")) {
      const task = line.slice("/plan ".length).trim();
      if (!task) {
        console.log("Upotreba: /plan <opis zadatka>");
        showPrompt();
        continue;
      }
      beginTurn((signal) => runPlanTask(state, task, askApproval, signal));
      continue;
    }

    if (line === "/paste" || line.startsWith("/paste ")) {
      const extra = line.slice("/paste".length).trim();
      try {
        const destDir = path.join(state.cwd, ".tandem", "tmp");
        await mkdir(destDir, { recursive: true });
        const destPath = path.join(destDir, `paste-${Date.now()}.png`);
        const ok = await saveClipboardImage(destPath);
        if (!ok) {
          console.log("Nema slike u clipboard-u.");
          showPrompt();
          continue;
        }
        const relPath = path.relative(state.cwd, destPath);
        const text = `[slika zalepljena iz clipboard-a: ${relPath}] ${extra || "Pogledaj sliku i opiši šta vidiš."}`;
        beginTurn((signal) => runTurn(state, text, askApproval, signal));
      } catch (err) {
        console.log(`Greška: ${err instanceof Error ? err.message : String(err)}`);
        showPrompt();
      }
      continue;
    }

    if (line.startsWith("/")) {
      const outcome = await handleCommand(line, state);
      if (outcome === "exit") break;
      showPrompt();
      continue;
    }

    beginTurn((signal) => runTurn(state, line, askApproval, signal));
  }

  await lastTurn;
  if (!closed) rl.close();
}

interface ParsedArgv {
  prompt: string;
  resume: boolean;
  autoApprove: boolean;
  plan: boolean;
  model?: "deepseek-v4-pro" | "deepseek-v4-flash";
  effort?: "low" | "high" | "max";
  budgetUsd?: number;
  maxReviewLoops?: number;
}

function parseArgv(argv: string[]): ParsedArgv {
  const rest: string[] = [];
  let resume = false;
  let autoApprove = false;
  let plan = false;
  let model: ParsedArgv["model"];
  let effort: ParsedArgv["effort"];
  let budgetUsd: number | undefined;
  let maxReviewLoops: number | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--resume" || arg === "-r") {
      resume = true;
    } else if (arg === "--yes" || arg === "-y") {
      autoApprove = true;
    } else if (arg === "--plan") {
      plan = true;
    } else if (arg === "--model") {
      const value = argv[++i];
      if (value === "deepseek-v4-pro" || value === "deepseek-v4-flash") model = value;
    } else if (arg === "--effort") {
      const value = argv[++i];
      if (value === "low" || value === "high" || value === "max") effort = value;
    } else if (arg === "--budget") {
      const value = Number(argv[++i]);
      if (Number.isFinite(value) && value > 0) budgetUsd = value;
    } else if (arg === "--max-review-loops") {
      const value = Number(argv[++i]);
      if (Number.isFinite(value) && value > 0) maxReviewLoops = value;
    } else if (arg !== undefined) {
      rest.push(arg);
    }
  }

  const parsed: ParsedArgv = { prompt: rest.join(" ").trim(), resume, autoApprove, plan };
  if (model !== undefined) parsed.model = model;
  if (effort !== undefined) parsed.effort = effort;
  if (budgetUsd !== undefined) parsed.budgetUsd = budgetUsd;
  if (maxReviewLoops !== undefined) parsed.maxReviewLoops = maxReviewLoops;
  return parsed;
}

async function printVersion(): Promise<void> {
  const packageJsonPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  const { version } = JSON.parse(await readFile(packageJsonPath, "utf8")) as { version: string };
  console.log(version);
}

async function main(): Promise<void> {
  const rawArgv = process.argv.slice(2);
  if (rawArgv.includes("--version") || rawArgv.includes("-v")) {
    await printVersion();
    return;
  }

  const cwd = process.cwd();
  const parsed = parseArgv(rawArgv);

  const config = await loadConfig(cwd);
  let apiKey = await resolveApiKey();

  if (!apiKey) {
    if (!process.stdin.isTTY) {
      console.error(
        "Nema DeepSeek API ključa. Postavi DEEPSEEK_API_KEY env promenljivu ili pokreni tandem interaktivno da odradiš first-run wizard."
      );
      process.exitCode = 1;
      return;
    }
    const wizardConfig = await runFirstRunWizard();
    Object.assign(config, wizardConfig);
    apiKey = await resolveApiKey();
    if (!apiKey) {
      console.error("Ključ nije sačuvan ispravno — pokušaj ponovo.");
      process.exitCode = 1;
      return;
    }
  }

  const env = { apiKey, baseUrl: resolveBaseUrl(config) };

  let session;
  let messages: ChatMessage[];
  if (parsed.resume) {
    const existing = await findLatestSession(cwd);
    if (!existing) {
      console.error("Nema prethodne sesije za nastavak u ovom direktorijumu.");
      process.exitCode = 1;
      return;
    }
    session = existing;
    messages = await loadSessionMessages(existing.filePath);
  } else {
    session = await createSession(cwd);
    const systemMsg: ChatMessage = { role: "system", content: SYSTEM_PROMPT };
    messages = [systemMsg];
    await appendSessionMessage(session, systemMsg);
  }

  const state: RuntimeState = {
    env,
    cwd,
    model: parsed.model ?? config.defaultModel ?? DEFAULT_CONFIG.defaultModel,
    thinkingEnabled: true,
    reasoningEffort: parsed.effort ?? config.defaultReasoningEffort ?? DEFAULT_CONFIG.defaultReasoningEffort,
    maxReviewLoops: parsed.maxReviewLoops ?? config.maxReviewLoops ?? DEFAULT_CONFIG.maxReviewLoops,
    autoApprove: parsed.autoApprove,
    alwaysApprovedTools: new Set(),
    session,
    messages,
    usage: new UsageAccumulator(),
  };
  const budgetUsd = parsed.budgetUsd ?? config.budgetUsd;
  if (budgetUsd !== undefined) state.budgetUsd = budgetUsd;

  if (parsed.prompt) {
    const approver = createLineApprover();
    const controller = new AbortController();
    if (process.stdin.isTTY) {
      readline.emitKeypressEvents(process.stdin);
      process.stdin.on("keypress", (_str, key: { name?: string } | undefined) => {
        if (key?.name === "escape") controller.abort();
      });
    }
    if (parsed.plan) {
      await runPlanTask(state, parsed.prompt, approver.approve, controller.signal);
    } else {
      await runTurn(state, parsed.prompt, approver.approve, controller.signal);
    }
    approver.close();
  } else {
    await runRepl(state);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
