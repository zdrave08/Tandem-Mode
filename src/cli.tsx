#!/usr/bin/env node
import React, { useEffect, useState } from "react";
import { render, Text, Box, useApp, useStdin } from "ink";
import readline from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile } from "node:fs/promises";
import { resolveApiKey, resolveBaseUrl } from "./config/env.js";
import { loadConfig } from "./config/store.js";
import { resolveLanguage, setLanguage, t, type Language } from "./i18n/index.js";
import { DEFAULT_CONFIG } from "./config/schema.js";
import { runFirstRunWizard } from "./repl/wizard.js";
import { handleCommand } from "./repl/commands.js";
import { SYSTEM_PROMPT } from "./repl/system-prompt.js";
import { runAgentLoop, type AgentEvent } from "./agent/loop.js";
import { UsageAccumulator } from "./agent/usage.js";
import { isPeakHour } from "./agent/pricing.js";
import { saveClipboardImage } from "./agent/clipboard.js";
import { runOrchestration } from "./orchestrator/orchestrate.js";
import { notifyCompletion } from "./orchestrator/notify.js";
import { appendSessionMessage, createSession, findLatestSession, loadSessionMessages } from "./agent/session.js";
import type { RuntimeState } from "./repl/state.js";
import type { ChatMessage, ThinkingConfig } from "./deepseek/types.js";
import { formatToolCall, formatToolResult, type DiffLine } from "./ui/toolFormat.js";
import { formatStatusLine } from "./ui/status.js";
import { describeError } from "./deepseek/errors.js";
import { ApprovalMenu } from "./ui/ApprovalMenu.js";
import { CONTINUE_TOOL } from "./ui/approvalModel.js";

function approvalText(toolName: string, args: Record<string, unknown>): string {
  if (toolName === CONTINUE_TOOL) {
    return t("continuePrompt", { chunk: Number(args["chunk"] ?? 0) });
  }
  return t("approvalPrompt", { call: `${toolName}(${JSON.stringify(args)})` });
}

function diffColor(kind: DiffLine["kind"]): "red" | "green" | undefined {
  return kind === "removed" ? "red" : kind === "added" ? "green" : undefined;
}

function diffPrefix(kind: DiffLine["kind"]): string {
  return kind === "removed" ? "- " : kind === "added" ? "+ " : "  ";
}

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

// Only the last N characters are shown while the model is thinking: enough for the
// "Thinking…" preview, and it stops Ink from re-rendering/re-laying-out the whole
// (potentially huge) growing string on every token, which is an O(n²) cost and can exhaust the heap.
const REASONING_DISPLAY_CAP = 4_000;

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
  const [pending, setPending] = useState<{
    toolName: string;
    args: Record<string, unknown>;
    /** Set when the boxed menu answers; otherwise `askApproval` (a line reader) does. */
    resolve?: (response: ApprovalResponse) => void;
  } | null>(null);
  // The menu needs raw keyboard input; without a real TTY the old line-based prompt is used.
  const { isRawModeSupported } = useStdin();
  const [usageLine, setUsageLine] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [iter, setIter] = useState<{ n: number; max: number } | null>(null);
  const [retryNote, setRetryNote] = useState<string | null>(null);

  useEffect(() => {
    /** Shows the approval menu (TTY) or falls back to the line reader, and clears the prompt afterwards. */
    function askUser(toolName: string, args: Record<string, unknown>): Promise<ApprovalResponse> {
      const answer = new Promise<ApprovalResponse>((resolve) => {
        if (isRawModeSupported) {
          setPending({ toolName, args, resolve });
        } else {
          setPending({ toolName, args });
          void askApproval(toolName, args).then(resolve);
        }
      });
      return answer.finally(() => setPending(null));
    }

    async function run(): Promise<void> {
      const approve = async (toolName: string, args: Record<string, unknown>): Promise<boolean> => {
        if (state.autoApprove) {
          console.error(t("autoApproved", { call: `${toolName}(${JSON.stringify(args)})` }));
          return true;
        }
        if (state.alwaysApprovedTools.has(toolName)) return true;
        const response = await askUser(toolName, args);
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
        maxIterations: state.maxIterations,
        onIterationLimit: async ({ iterations }) => {
          const chunk = state.maxIterations;
          // Auto-continue only with a budget: the budget hard-stops the loop before the next call.
          if (state.autoContinue && turn.budgetUsd !== undefined) {
            setNotice(
              t("autoContinued", {
                n: iterations,
                spent: `$${state.usage.estimatedCostUsd().toFixed(4)}`,
                budget: `$${turn.budgetUsd.toFixed(2)}`,
              })
            );
            return true;
          }
          if (state.alwaysApprovedTools.has(CONTINUE_TOOL)) return true;
          // --yes means "no questions" (scripts/CI): nobody can answer, so do not wait on stdin.
          if (state.autoApprove) {
            setNotice(t("continueStopped"));
            return false;
          }
          const response = await askUser(CONTINUE_TOOL, { iterations, chunk });
          if (response.always && response.approved) state.alwaysApprovedTools.add(CONTINUE_TOOL);
          return response.approved;
        },
        ...(turn.thinking !== undefined ? { thinking: turn.thinking } : {}),
        ...(turn.budgetUsd !== undefined ? { budgetUsd: turn.budgetUsd } : {}),
        ...(turn.signal !== undefined ? { signal: turn.signal } : {}),
      })) {
        handleEvent(event);
      }

      function handleEvent(event: AgentEvent): void {
        switch (event.type) {
          case "reasoning_delta":
            setRetryNote(null);
            setReasoning((prev) => {
              const next = prev + event.delta;
              return next.length > REASONING_DISPLAY_CAP ? next.slice(-REASONING_DISPLAY_CAP) : next;
            });
            break;
          case "content_delta":
            setRetryNote(null);
            setContent((prev) => prev + event.delta);
            break;
          case "tool_call_start":
            setRetryNote(null);
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
          case "iteration":
            setIter({ n: event.n, max: event.max });
            break;
          case "retrying":
            setRetryNote(
              t("retrying", {
                attempt: event.attempt,
                max: event.max,
                seconds: Math.max(1, Math.round(event.delayMs / 1000)),
                reason: event.reason,
              })
            );
            break;
          case "max_iterations_reached":
            setNotice((prev) => prev ?? t("maxIterations"));
            break;
          case "budget_exceeded":
            setNotice(
              t("budgetExceeded", { budget: `$${event.budgetUsd.toFixed(2)}`, spent: `$${event.spentUsd.toFixed(4)}` })
            );
            break;
          case "interrupted":
            setNotice(t("interrupted"));
            break;
        }
      }
    }

    run()
      .catch((err: unknown) => {
        setError(describeError(err));
        setNotice(t("errorSessionSaved"));
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

      {toolLog.map((entry) => {
        const lines = entry.output?.split("\n") ?? [];
        const preview = lines.slice(0, 3).join("\n");
        const more = lines.length > 3;
        const call = formatToolCall(entry.name, entry.args);
        const summary = entry.output !== undefined ? formatToolResult(entry.name, entry.output, entry.isError === true).summary : undefined;
        return (
          <Box key={entry.id} flexDirection="column">
            <Text color={entry.status === "denied" ? "yellow" : entry.isError ? "red" : "cyan"}>
              ⏺ {call.title}
              {entry.status === "running" ? "…" : entry.status === "denied" ? t("toolDenied") : ""}
            </Text>
            {call.diff?.map((line, i) => {
              const color = diffColor(line.kind);
              return (
                <Text key={i} {...(color ? { color } : { dimColor: true })}>
                  {"  "}
                  {diffPrefix(line.kind)}
                  {line.text}
                </Text>
              );
            })}
            {summary ? (
              <Text dimColor>
                {"  ⎿  "}
                {summary}
              </Text>
            ) : (
              preview && (
                <Text dimColor {...(entry.isError ? { color: "red" } : {})}>
                  {"  ⎿  "}
                  {preview.slice(0, 400)}
                  {more || preview.length > 400 ? t("toolMoreLines", { count: lines.length }) : ""}
                </Text>
              )
            )}
          </Box>
        );
      })}

      {pending?.resolve && (
        <ApprovalMenu
          toolName={pending.toolName}
          args={pending.args}
          onChoice={(id) => pending.resolve?.({ approved: id !== "no", always: id === "always" })}
        />
      )}

      {pending && !pending.resolve && pending.toolName === CONTINUE_TOOL && (
        <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
          <Text color="yellow" bold>
            {t("continueAsk", { n: Number(pending.args["iterations"] ?? 0) })}
          </Text>
          <Text dimColor>{t("continueHint", { chunk: Number(pending.args["chunk"] ?? 0) })}</Text>
        </Box>
      )}

      {pending && !pending.resolve && pending.toolName !== CONTINUE_TOOL && (
        <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
          <Text color="yellow" bold>
            {t("destructiveAction", { call: `${pending.toolName}(${JSON.stringify(pending.args)})` })}
          </Text>
          <Text dimColor>{t("approvalHint")}</Text>
        </Box>
      )}

      {content.length > 0 && <Text>{content}</Text>}

      {usageLine && <Text color="gray">{usageLine}</Text>}
      {retryNote && <Text color="yellow">{retryNote}</Text>}
      {notice && <Text color="yellow">{notice}</Text>}
      {error && <Text color="red">{t("errorPrefix", { message: error })}</Text>}

      <StatusBar state={state} turn={turn} iter={iter} />
    </Box>
  );
}

function StatusBar({
  state,
  turn,
  iter,
}: {
  state: RuntimeState;
  turn: TurnConfig;
  iter: { n: number; max: number } | null;
}) {
  const status = formatStatusLine({
    model: turn.model,
    mode: t(`statusMode_${state.activeMode}`),
    costUsd: state.usage.estimatedCostUsd(),
    ...(turn.budgetUsd !== undefined ? { budgetUsd: turn.budgetUsd } : {}),
    ...(iter ? { call: iter, callLabel: t("statusCalls", { n: iter.n, max: iter.max }) } : {}),
  });
  const color = status.level === "danger" ? "red" : status.level === "warn" ? "yellow" : "gray";
  return <Text color={color}>{`▌ ${status.text}`}</Text>;
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
    render(<TurnView state={state} turn={turn} askApproval={askApproval} onDone={resolve} />, { exitOnCtrlC: false });
  });
}

async function runTurn(
  state: RuntimeState,
  userText: string,
  askApproval: Approver,
  signal?: AbortSignal
): Promise<void> {
  state.activeMode = "chat";
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
  state.activeMode = "plan";
  try {
    await runOrchestration(task, {
      cwd: state.cwd,
      env: state.env,
      maxReviewLoops: state.maxReviewLoops,
      ...(state.verifyCommand !== undefined ? { verifyCommand: state.verifyCommand } : {}),
      ...(state.notifyCommand !== undefined ? { notifyCommand: state.notifyCommand } : {}),
      usage: state.usage,
      ...(signal !== undefined ? { signal } : {}),
      runWorkerTurn: (turn) => runTurnConfig(state, turn, askApproval),
    });
  } catch (err) {
    if (isAbortError(err)) {
      console.log(t("orchestrationInterrupted"));
    } else {
      const message = describeError(err);
      console.error(t("orchestrationError", { message }));
      await notifyCompletion(state.notifyCommand, state.cwd, {
        outcome: "error",
        task,
        notes: message,
        reviewLoops: 0,
        costUsd: state.usage.estimatedCostUsd(),
      });
    }
  } finally {
    state.activeMode = "chat";
  }
}

function parseApprovalAnswer(raw: string): ApprovalResponse {
  const lower = raw.trim().toLowerCase();
  if (lower === "a" || lower === "always") return { approved: true, always: true };
  return { approved: lower === "y", always: false };
}

/** For single-shot turns: its own for-await line reader, only for y/n/a approvals. */
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
    console.log(`\n${approvalText(toolName, args)}`);
    return new Promise<ApprovalResponse>((resolve) => {
      resolveRef.current = resolve;
    });
  };

  return { approve, close: () => rl.close() };
}

/**
 * `.question()` is unreliable on piped/non-TTY stdin after the first call
 * (a known Node quirk: the second call never resolves). So lines are read
 * exclusively through `for await...of rl`, which delivers every line reliably,
 * with a manual state machine for approvals instead of a nested
 * `.question()`.
 */
async function runRepl(state: RuntimeState): Promise<void> {
  await showBanner(state);
  console.log(t("replHint"));
  if (isPeakHour(new Date())) {
    console.log(t("peakWarning"));
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
    console.log(`\n${approvalText(toolName, args)}`);
    return new Promise<ApprovalResponse>((resolve) => {
      approvalRef.current = resolve;
    });
  };

  // ESC interrupts the current turn. Works only on a real TTY: piped/scripted
  // input generates no keypress events, so the interrupt is a silent no-op there.
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
      console.log(t("waitForTurn"));
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
        console.log(t("usageLine", { syntax: "/plan <task>" }));
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
          console.log(t("pasteNoImage"));
          showPrompt();
          continue;
        }
        const relPath = path.relative(state.cwd, destPath);
        const text = `[image pasted from the clipboard: ${relPath}] ${extra || "Look at the image and describe what you see."}`;
        beginTurn((signal) => runTurn(state, text, askApproval, signal));
      } catch (err) {
        console.log(t("errorPrefix", { message: err instanceof Error ? err.message : String(err) }));
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

// ANSI styling for the plain-text parts (rule and prompt), which are printed outside Ink.
const ESC = String.fromCharCode(27);
const ANSI_DIM = `${ESC}[2m`;
const ANSI_BOLD_CYAN = `${ESC}[1;36m`;
const ANSI_RESET = `${ESC}[0m`;

/** Dim horizontal rule the width of the terminal; separates turns the way a boxed UI would. */
function rule(): string {
  const width = Math.max(20, Math.min(process.stdout.columns ?? 80, 120));
  return `${ANSI_DIM}${"─".repeat(width)}${ANSI_RESET}`;
}

const TTY_PROMPT = `${ANSI_BOLD_CYAN}❯${ANSI_RESET} `;

/**
 * Reads one line with a fresh readline interface, then closes it. On a TTY the interface must not
 * exist while a turn runs: readline and Ink would both consume the same keystrokes (echoing letters
 * and submitting lines while the approval menu is waiting for a key). Returns `null` on Ctrl+C/Ctrl+D.
 */
function promptLine(history: string[]): Promise<{ line: string | null; history: string[] }> {
  return new Promise((resolve) => {
    // Ink releases stdin when a turn ends; without this the process could exit while we wait for input.
    process.stdin.ref();
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: TTY_PROMPT,
      history,
      historySize: 200,
      terminal: true,
    });
    let answered = false;
    rl.once("line", (line) => {
      answered = true;
      // `history` exists at runtime (newest first) but is missing from the Node typings we build against.
      const updated = (rl as unknown as { history: string[] }).history;
      rl.close();
      resolve({ line, history: updated });
    });
    rl.once("close", () => {
      if (!answered) resolve({ line: null, history });
    });
    console.log(rule());
    rl.prompt();
  });
}

/**
 * Interactive REPL for a real terminal. Unlike `runRepl` (piped input), a turn is awaited, so the
 * approval menu and ESC/Ctrl+C get the keyboard to themselves while the agent works.
 */
async function runReplTty(state: RuntimeState): Promise<void> {
  await showBanner(state);
  console.log(t("replHint"));
  if (isPeakHour(new Date())) {
    console.log(t("peakWarning"));
  }

  // ESC or Ctrl+C interrupts the running turn; nothing is listening for a turn while the prompt waits.
  const abortRef: { current: AbortController | null } = { current: null };
  readline.emitKeypressEvents(process.stdin);
  process.stdin.on("keypress", (_str, key: { name?: string; ctrl?: boolean } | undefined) => {
    if (abortRef.current && (key?.name === "escape" || (key?.ctrl === true && key.name === "c"))) {
      abortRef.current.abort();
    }
  });

  // Never called on a TTY: TurnView shows the menu itself. It only satisfies the type.
  const menuOnly: Approver = async () => ({ approved: false, always: false });

  const runTurnOf = async (run: (signal: AbortSignal) => Promise<void>): Promise<void> => {
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await run(controller.signal);
    } finally {
      abortRef.current = null;
    }
  };

  let history: string[] = [];
  for (;;) {
    const answer = await promptLine(history);
    history = answer.history;
    if (answer.line === null) break;
    const line = answer.line.trim();
    if (!line) continue;

    if (line.startsWith("/plan ")) {
      const task = line.slice("/plan ".length).trim();
      if (!task) {
        console.log(t("usageLine", { syntax: "/plan <task>" }));
        continue;
      }
      await runTurnOf((signal) => runPlanTask(state, task, menuOnly, signal));
      continue;
    }

    if (line === "/paste" || line.startsWith("/paste ")) {
      const extra = line.slice("/paste".length).trim();
      try {
        const destDir = path.join(state.cwd, ".tandem", "tmp");
        await mkdir(destDir, { recursive: true });
        const destPath = path.join(destDir, `paste-${Date.now()}.png`);
        if (!(await saveClipboardImage(destPath))) {
          console.log(t("pasteNoImage"));
          continue;
        }
        const relPath = path.relative(state.cwd, destPath);
        const text = `[image pasted from the clipboard: ${relPath}] ${extra || "Look at the image and describe what you see."}`;
        await runTurnOf((signal) => runTurn(state, text, menuOnly, signal));
      } catch (err) {
        console.log(t("errorPrefix", { message: describeError(err) }));
      }
      continue;
    }

    if (line.startsWith("/")) {
      if ((await handleCommand(line, state)) === "exit") break;
      continue;
    }

    await runTurnOf((signal) => runTurn(state, line, menuOnly, signal));
  }
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
  maxIterations?: number;
  autoContinue: boolean;
  language?: Language;
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
  let maxIterations: number | undefined;
  let autoContinue = false;
  let language: Language | undefined;

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
    } else if (arg === "--max-iterations") {
      const value = Number(argv[++i]);
      if (Number.isInteger(value) && value > 0) maxIterations = value;
    } else if (arg === "--auto-continue") {
      autoContinue = true;
    } else if (arg === "--lang") {
      const value = argv[++i];
      if (value === "en" || value === "sr") language = value;
    } else if (arg !== undefined) {
      rest.push(arg);
    }
  }

  const parsed: ParsedArgv = { prompt: rest.join(" ").trim(), resume, autoApprove, plan, autoContinue };
  if (model !== undefined) parsed.model = model;
  if (effort !== undefined) parsed.effort = effort;
  if (budgetUsd !== undefined) parsed.budgetUsd = budgetUsd;
  if (maxReviewLoops !== undefined) parsed.maxReviewLoops = maxReviewLoops;
  if (maxIterations !== undefined) parsed.maxIterations = maxIterations;
  if (language !== undefined) parsed.language = language;
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
  setLanguage(resolveLanguage(parsed.language, process.env["TANDEM_LANG"], config.language));
  let apiKey = await resolveApiKey();

  if (!apiKey) {
    if (!process.stdin.isTTY) {
      console.error(t("noApiKey"));
      process.exitCode = 1;
      return;
    }
    const wizardConfig = await runFirstRunWizard();
    Object.assign(config, wizardConfig);
    setLanguage(resolveLanguage(parsed.language, process.env["TANDEM_LANG"], config.language));
    apiKey = await resolveApiKey();
    if (!apiKey) {
      console.error(t("keyNotSaved"));
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
      console.error(t("noSessionToResume"));
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
    maxIterations: parsed.maxIterations ?? config.maxIterations ?? DEFAULT_CONFIG.maxIterations,
    autoContinue: parsed.autoContinue || config.autoContinue === true,
    activeMode: "chat",
    autoApprove: parsed.autoApprove,
    alwaysApprovedTools: new Set(),
    session,
    messages,
    usage: new UsageAccumulator(),
  };
  if (config.verifyCommand) state.verifyCommand = config.verifyCommand;
  if (config.notifyCommand) state.notifyCommand = config.notifyCommand;
  const budgetUsd = parsed.budgetUsd ?? config.budgetUsd;
  if (budgetUsd !== undefined) state.budgetUsd = budgetUsd;
  if (state.autoContinue && state.budgetUsd === undefined) {
    console.error(t("autoContinueNeedsBudget"));
  }

  if (parsed.prompt) {
    // On a TTY the turn shows its own approval menu; the line reader is only for piped input.
    const approver = process.stdin.isTTY
      ? { approve: (async () => ({ approved: false, always: false })) as Approver, close: () => {} }
      : createLineApprover();
    const controller = new AbortController();
    if (process.stdin.isTTY) {
      readline.emitKeypressEvents(process.stdin);
      process.stdin.on("keypress", (_str, key: { name?: string; ctrl?: boolean } | undefined) => {
        if (key?.name === "escape" || (key?.ctrl === true && key.name === "c")) controller.abort();
      });
    }
    if (parsed.plan) {
      await runPlanTask(state, parsed.prompt, approver.approve, controller.signal);
    } else {
      await runTurn(state, parsed.prompt, approver.approve, controller.signal);
    }
    approver.close();
  } else if (process.stdin.isTTY && process.stdout.isTTY) {
    await runReplTty(state);
  } else {
    await runRepl(state);
  }
}

main().catch((err: unknown) => {
  console.error(describeError(err));
  process.exitCode = 1;
});
