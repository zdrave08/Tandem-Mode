import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { runAgentLoop } from "../agent/loop.js";
import { runOrchestration, type WorkerTurn } from "../orchestrator/orchestrate.js";
import { createSession, appendSessionMessage, type Session } from "../agent/session.js";
import { UsageAccumulator } from "../agent/usage.js";
import type { TandemEnv } from "../config/env.js";
import type { ChatMessage, ThinkingConfig } from "../deepseek/types.js";
import type { BenchmarkTask } from "./tasks/bulkPriceWizard.js";
import type { BenchmarkConfigName, BenchmarkResult } from "./types.js";

const execFileAsync = promisify(execFile);

const SYSTEM_PROMPT = `You are a coding agent fixing a reported bug in a WordPress/WooCommerce
plugin. Use the available tools (read_file, list_dir, search, edit, git_diff,
shell) to find and fix exactly the bug described. When you are done, reply
concisely without further tool calls.`;

interface RunStats {
  failedAttempts: number;
  completed: boolean;
  toolHistory: { name: string; isError: boolean }[];
}

async function resetRepo(repoPath: string, baselineRef: string): Promise<void> {
  await execFileAsync("git", ["reset", "--hard", baselineRef], { cwd: repoPath });
  await execFileAsync("git", ["clean", "-fd"], { cwd: repoPath });
}

async function runHeadlessTurn(
  messages: ChatMessage[],
  model: "deepseek-v4-pro" | "deepseek-v4-flash",
  thinking: ThinkingConfig | undefined,
  env: TandemEnv,
  cwd: string,
  session: Session,
  usage: UsageAccumulator,
  stats: RunStats
): Promise<void> {
  for await (const ev of runAgentLoop(messages, {
    env,
    model,
    cwd,
    session,
    usage,
    ...(thinking ? { thinking } : {}),
    approve: async () => true,
    maxIterations: 30,
  })) {
    if (ev.type === "tool_call_result") {
      stats.toolHistory.push({ name: ev.name, isError: ev.result.isError });
      if (ev.result.isError) stats.failedAttempts++;
    }
    if (ev.type === "final") {
      stats.completed = true;
    }
  }
}

function detectSelfCorrection(history: { name: string; isError: boolean }[]): boolean {
  for (let i = 0; i < history.length; i++) {
    if (!history[i]?.isError) continue;
    for (let j = i + 1; j < history.length; j++) {
      if (history[j]?.name === history[i]?.name && !history[j]?.isError) return true;
    }
  }
  return false;
}

export async function runOneAttempt(
  env: TandemEnv,
  config: BenchmarkConfigName,
  task: BenchmarkTask,
  repoPath: string,
  baselineRef: string
): Promise<BenchmarkResult> {
  await resetRepo(repoPath, baselineRef);
  await task.injectBug(repoPath);
  await execFileAsync("git", ["add", "-A"], { cwd: repoPath });
  await execFileAsync("git", ["commit", "-m", `bench: inject ${task.id}`], { cwd: repoPath });
  const { stdout: bugCommitRaw } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoPath });
  const bugCommit = bugCommitRaw.trim();

  const session = await createSession(repoPath);
  const usage = new UsageAccumulator();
  const stats: RunStats = { failedAttempts: 0, completed: false, toolHistory: [] };

  const startedAt = Date.now();

  if (config === "orchestration") {
    await runOrchestration(task.description, {
      cwd: repoPath,
      env,
      maxReviewLoops: 3,
      usage,
      runWorkerTurn: (turn: WorkerTurn) =>
        runHeadlessTurn(turn.messages, turn.model, turn.thinking, env, repoPath, session, usage, stats),
    });
    // Orchestration has no single "final" signal like the plain loop: "completed" here
    // means the pipeline ran to the end without an exception, not that the reviewer
    // approved (that is covered by the "correct" dimension via the verify script).
    stats.completed = true;
  } else {
    const model: "deepseek-v4-pro" | "deepseek-v4-flash" = config === "pro-only" ? "deepseek-v4-pro" : "deepseek-v4-flash";
    const systemMsg: ChatMessage = { role: "system", content: SYSTEM_PROMPT };
    const userMsg: ChatMessage = { role: "user", content: task.description };
    await appendSessionMessage(session, systemMsg);
    await appendSessionMessage(session, userMsg);
    await runHeadlessTurn(
      [systemMsg, userMsg],
      model,
      { reasoningEffort: "high" },
      env,
      repoPath,
      session,
      usage,
      stats
    );
  }

  const durationMs = Date.now() - startedAt;

  const { stdout: diffOut } = await execFileAsync("git", ["diff", "--name-only", bugCommit], { cwd: repoPath });
  const touchedFiles = diffOut
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  let buildPassed: boolean | null = null;
  const phpFiles = touchedFiles.filter((f) => f.endsWith(".php"));
  if (phpFiles.length > 0) {
    buildPassed = true;
    for (const f of phpFiles) {
      try {
        await execFileAsync("php", ["-l", path.join(repoPath, f)]);
      } catch {
        buildPassed = false;
      }
    }
  }

  let correct = false;
  try {
    await execFileAsync("php", [task.verifyScript, repoPath]);
    correct = true;
  } catch {
    correct = false;
  }

  const unnecessaryFileChanges = touchedFiles.filter((f) => !task.expectedFiles.includes(f)).length;

  return {
    taskId: task.id,
    config,
    completed: stats.completed,
    correct,
    buildPassed,
    testPassed: null,
    unnecessaryFileChanges,
    failedAttempts: stats.failedAttempts,
    selfCorrected: detectSelfCorrection(stats.toolHistory),
    usage: usage.totals(),
    requestCount: usage.callCount,
    costUsd: usage.estimatedCostUsd(),
    offPeakCostUsd: usage.offPeakEquivalentCostUsd(),
    durationMs,
  };
}

export async function runBenchmark(
  env: TandemEnv,
  tasks: BenchmarkTask[],
  configs: BenchmarkConfigName[],
  repoPath: string,
  baselineRef: string,
  onProgress?: (line: string) => void
): Promise<BenchmarkResult[]> {
  const log = onProgress ?? ((line: string) => console.log(line));
  const results: BenchmarkResult[] = [];

  for (const task of tasks) {
    for (const config of configs) {
      log(`\n=== ${task.id} / ${config} ===`);
      try {
        const result = await runOneAttempt(env, config, task, repoPath, baselineRef);
        log(
          `  completed=${result.completed} correct=${result.correct} build=${result.buildPassed} ` +
            `failedAttempts=${result.failedAttempts} selfCorrected=${result.selfCorrected} ` +
            `unnecessaryFiles=${result.unnecessaryFileChanges} requests=${result.requestCount} ` +
            `cost=$${result.costUsd.toFixed(4)} time=${(result.durationMs / 1000).toFixed(1)}s`
        );
        results.push(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`  ERROR — pokušaj pukao, beleži se kao neuspešan i nastavlja se dalje: ${message}`);
        results.push({
          taskId: task.id,
          config,
          completed: false,
          correct: false,
          buildPassed: null,
          testPassed: null,
          unnecessaryFileChanges: 0,
          failedAttempts: 0,
          selfCorrected: false,
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            promptCacheHitTokens: 0,
            promptCacheMissTokens: 0,
            reasoningTokens: 0,
          },
          requestCount: 0,
          costUsd: 0,
          offPeakCostUsd: 0,
          durationMs: 0,
          error: message,
        });
        // Put the repo back in a clean state even after a failure mid-attempt, so the
        // next task/config does not inherit a half-modified working tree.
        await resetRepo(repoPath, baselineRef).catch(() => {});
      }
    }
  }

  await resetRepo(repoPath, baselineRef);
  return results;
}
