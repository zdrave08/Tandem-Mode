import type { TandemEnv } from "../config/env.js";
import type { ChatMessage, ThinkingConfig } from "../deepseek/types.js";
import type { UsageAccumulator } from "../agent/usage.js";
import { gitDiffTool } from "../agent/tools/gitDiff.js";
import { buildRepoMap } from "./repoMap.js";
import { runPlanner } from "./planner.js";
import { runReviewer, type VerifyResult } from "./reviewer.js";
import { runShell } from "../agent/tools/shell.js";
import type { Plan } from "./types.js";

const WORKER_SYSTEM_PROMPT = `Ti si worker u Tandem Mode orkestraciji. Dobijaš JEDAN konkretan task iz
plana ispod, sa mapom repozitorijuma. Nemaš pristup razgovoru koji je
proizveo plan — sve što ti treba je ovde. Izvrši task koristeći alate
(read_file, list_dir, search, edit, git_diff, shell, view_image). Kad
završiš, odgovori sažeto bez tool poziva da se petlja zaustavi.`;

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
  usage: UsageAccumulator;
  signal?: AbortSignal;
  runWorkerTurn: (turn: WorkerTurn) => Promise<void>;
}

function buildStablePrefix(plan: Plan, repoMap: string): string {
  return `${WORKER_SYSTEM_PROMPT}\n\nPlan (ceo, za kontekst):\n${JSON.stringify(plan)}\n\nMapa repozitorijuma:\n${repoMap}`;
}

async function runVerify(command: string, cwd: string, signal?: AbortSignal): Promise<VerifyResult> {
  console.log(`\n🧪 Verify: ${command}\n`);
  try {
    const { output, exitCode } = await runShell(command, cwd, signal);
    console.log(exitCode === 0 ? "  prošlo" : `  palo (exit ${exitCode})`);
    return { command, exitCode, output };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    return { command, exitCode: null, output: (err as Error).message };
  }
}

export async function runOrchestration(task: string, opts: OrchestrationOptions): Promise<void> {
  console.log("\n📋 Planiram...\n");
  const repoMap = await buildRepoMap(opts.cwd);
  const { plan, usage: plannerUsage } = await runPlanner(opts.env, task, repoMap, opts.signal);
  opts.usage.add("deepseek-v4-pro", plannerUsage);

  console.log(`Plan: ${plan.summary}`);
  plan.tasks.forEach((t, i) => console.log(`  ${i + 1}. [${t.id}] ${t.description}`));

  const stablePrefix = buildStablePrefix(plan, repoMap);
  const workerThinking: ThinkingConfig = { reasoningEffort: "high" };

  for (const t of plan.tasks) {
    if (opts.signal?.aborted) return;
    console.log(`\n🔧 Worker: ${t.description}\n`);
    const messages: ChatMessage[] = [
      { role: "system", content: stablePrefix },
      { role: "user", content: `Task: ${t.description}\nKriterijum prihvatanja: ${t.acceptanceCriteria}` },
    ];
    await opts.runWorkerTurn({ messages, model: "deepseek-v4-flash", thinking: workerThinking, ...(opts.signal ? { signal: opts.signal } : {}) });
  }

  let loops = 0;
  for (;;) {
    if (opts.signal?.aborted) return;
    console.log("\n🔍 Reviewer proverava...\n");
    const diffResult = await gitDiffTool.execute({}, { cwd: opts.cwd, env: opts.env, usage: opts.usage });
    const verify = opts.verifyCommand ? await runVerify(opts.verifyCommand, opts.cwd, opts.signal) : undefined;
    const { result: review, usage: reviewUsage } = await runReviewer(opts.env, task, plan, diffResult.output, verify, opts.signal);
    opts.usage.add("deepseek-v4-pro", reviewUsage);

    if (review.approved) {
      console.log(`✅ Reviewer odobrio. ${review.notes}\n`);
      return;
    }

    loops++;
    console.log(`⚠ Reviewer traži izmene (${loops}/${opts.maxReviewLoops}): ${review.notes}`);
    review.corrections.forEach((c) => console.log(`  - ${c.description}`));

    if (loops >= opts.maxReviewLoops) {
      console.log(`\n❌ Dostignut max_review_loops (${opts.maxReviewLoops}) bez odobrenja — proveri ručno.\n`);
      return;
    }

    for (const correction of review.corrections) {
      if (opts.signal?.aborted) return;
      console.log(`\n🔧 Worker (korekcija): ${correction.description}\n`);
      const messages: ChatMessage[] = [
        { role: "system", content: stablePrefix },
        { role: "user", content: `Korekcija od reviewera: ${correction.description}` },
      ];
      await opts.runWorkerTurn({ messages, model: "deepseek-v4-flash", thinking: workerThinking, ...(opts.signal ? { signal: opts.signal } : {}) });
    }
  }
}
