import type { TandemEnv } from "../config/env.js";
import type { ChatMessage, ThinkingConfig } from "../deepseek/types.js";
import type { UsageAccumulator } from "../agent/usage.js";
import { gitDiffTool } from "../agent/tools/gitDiff.js";
import { buildRepoMap } from "./repoMap.js";
import { runPlanner } from "./planner.js";
import { runReviewer, type VerifyResult } from "./reviewer.js";
import { runShell } from "../agent/tools/shell.js";
import { notifyCompletion } from "./notify.js";
import { t } from "../i18n/index.js";
import type { Plan } from "./types.js";

const WORKER_SYSTEM_PROMPT = `You are a worker in a Tandem Mode orchestration. You get ONE concrete task from
the plan below, with a repository map. You have no access to the conversation
that produced the plan — everything you need is here. Carry out the task using the tools
(read_file, list_dir, search, edit, git_diff, shell, view_image). When
you are done, answer concisely without tool calls so the loop stops.`;

export interface WorkerTurn {
  messages: ChatMessage[];
  model: "deepseek-v4-pro" | "deepseek-v4-flash";
  thinking?: ThinkingConfig;
  signal?: AbortSignal;
}

export interface OrchestrationOptions {
  cwd: string;
  env: TandemEnv;
  maxReviewLoops: number;
  verifyCommand?: string;
  notifyCommand?: string;
  usage: UsageAccumulator;
  signal?: AbortSignal;
  runWorkerTurn: (turn: WorkerTurn) => Promise<void>;
}

function buildStablePrefix(plan: Plan, repoMap: string): string {
  return `${WORKER_SYSTEM_PROMPT}\n\nPlan (full, for context):\n${JSON.stringify(plan)}\n\nRepository map:\n${repoMap}`;
}

async function runVerify(command: string, cwd: string, signal?: AbortSignal): Promise<VerifyResult> {
  console.log(t("orchVerify", { command }));
  try {
    const { output, exitCode } = await runShell(command, cwd, signal);
    console.log(exitCode === 0 ? t("orchVerifyPassed") : t("orchVerifyFailed", { code: String(exitCode) }));
    return { command, exitCode, output };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    return { command, exitCode: null, output: (err as Error).message };
  }
}

export async function runOrchestration(task: string, opts: OrchestrationOptions): Promise<void> {
  console.log(t("orchPlanning"));
  const repoMap = await buildRepoMap(opts.cwd);
  const { plan, usage: plannerUsage } = await runPlanner(opts.env, task, repoMap, opts.signal);
  opts.usage.add("deepseek-v4-pro", plannerUsage);

  console.log(t("orchPlan", { summary: plan.summary }));
  plan.tasks.forEach((planTask, i) => console.log(`  ${i + 1}. [${planTask.id}] ${planTask.description}`));

  const stablePrefix = buildStablePrefix(plan, repoMap);
  const workerThinking: ThinkingConfig = { reasoningEffort: "high" };

  for (const planTask of plan.tasks) {
    if (opts.signal?.aborted) return;
    console.log(t("orchWorker", { description: planTask.description }));
    const messages: ChatMessage[] = [
      { role: "system", content: stablePrefix },
      { role: "user", content: `Task: ${planTask.description}\nAcceptance criteria: ${planTask.acceptanceCriteria}` },
    ];
    await opts.runWorkerTurn({ messages, model: "deepseek-v4-flash", thinking: workerThinking, ...(opts.signal ? { signal: opts.signal } : {}) });
  }

  let loops = 0;
  for (;;) {
    if (opts.signal?.aborted) return;
    console.log(t("orchReviewer"));
    const diffResult = await gitDiffTool.execute({}, { cwd: opts.cwd, env: opts.env, usage: opts.usage });
    const verify = opts.verifyCommand ? await runVerify(opts.verifyCommand, opts.cwd, opts.signal) : undefined;
    const { result: review, usage: reviewUsage } = await runReviewer(opts.env, task, plan, diffResult.output, verify, opts.signal);
    opts.usage.add("deepseek-v4-pro", reviewUsage);

    if (review.approved) {
      console.log(t("orchApproved", { notes: review.notes }));
      await notifyCompletion(opts.notifyCommand, opts.cwd, {
        outcome: "approved",
        task,
        notes: review.notes,
        reviewLoops: loops,
        costUsd: opts.usage.estimatedCostUsd(),
      });
      return;
    }

    loops++;
    console.log(t("orchChangesRequested", { loops, max: opts.maxReviewLoops, notes: review.notes }));
    review.corrections.forEach((c) => console.log(`  - ${c.description}`));

    if (loops >= opts.maxReviewLoops) {
      console.log(t("orchMaxLoops", { max: opts.maxReviewLoops }));
      await notifyCompletion(opts.notifyCommand, opts.cwd, {
        outcome: "max_review_loops",
        task,
        notes: review.notes,
        reviewLoops: loops,
        costUsd: opts.usage.estimatedCostUsd(),
      });
      return;
    }

    for (const correction of review.corrections) {
      if (opts.signal?.aborted) return;
      console.log(t("orchWorkerCorrection", { description: correction.description }));
      const messages: ChatMessage[] = [
        { role: "system", content: stablePrefix },
        { role: "user", content: `Correction from the reviewer: ${correction.description}` },
      ];
      await opts.runWorkerTurn({ messages, model: "deepseek-v4-flash", thinking: workerThinking, ...(opts.signal ? { signal: opts.signal } : {}) });
    }
  }
}
