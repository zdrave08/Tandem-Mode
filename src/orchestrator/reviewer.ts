import { chatCompletionOnce } from "../deepseek/client.js";
import type { TandemEnv } from "../config/env.js";
import type { UsageInfo } from "../deepseek/types.js";
import { isReviewResult, type Plan, type ReviewResult } from "./types.js";

const REVIEWER_SYSTEM_PROMPT = `You are the reviewer in the Tandem Mode coding agent. You receive the original task,
the plan the worker(s) carried out, and the git diff of the actual changes. Check whether the
diff really fulfills the task and the plan's acceptance criteria, contains no
unnecessary changes, and that the code is reasonable. If a check result
(build/test) is attached, a non-zero exit code means the change does not pass — in that case do not
approve, and name the concrete error from the output in "corrections".

Respond ONLY with valid JSON, with no markdown fences, in exactly this schema:
{
  "approved": true|false,
  "notes": "brief justification",
  "corrections": [{ "description": "...", "files": ["..."] }]
}
"corrections" is an empty array if approved is true.`;

const MAX_ATTEMPTS = 2;
const MAX_VERIFY_CHARS = 6000;

export interface VerifyResult {
  command: string;
  exitCode: number | null;
  output: string;
}

function formatVerify(verify: VerifyResult): string {
  // Build/test errors are usually at the end of the output, so keep the tail, not the head.
  const out = verify.output.length > MAX_VERIFY_CHARS ? "...(truncated)\n" + verify.output.slice(-MAX_VERIFY_CHARS) : verify.output;
  return `\n\nCheck result (${verify.command}), exit code ${verify.exitCode ?? "n/a (not run)"}:\n${out || "(no output)"}`;
}

export async function runReviewer(
  env: TandemEnv,
  originalTask: string,
  plan: Plan,
  gitDiff: string,
  verify?: VerifyResult,
  signal?: AbortSignal
): Promise<{ result: ReviewResult; usage: UsageInfo }> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await chatCompletionOnce(env, {
      model: "deepseek-v4-pro",
      thinking: { reasoningEffort: "high" },
      jsonOutput: true,
      messages: [
        { role: "system", content: REVIEWER_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Original task:\n${originalTask}\n\nPlan:\n${JSON.stringify(plan, null, 2)}\n\nGit diff:\n${gitDiff.slice(0, 15000)}${verify ? formatVerify(verify) : ""}`,
        },
      ],
      ...(signal ? { signal } : {}),
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      lastError = new Error(`Reviewer did not return valid JSON (attempt ${attempt}):\n${response.content.slice(0, 500)}`);
      continue;
    }
    if (!isReviewResult(parsed)) {
      lastError = new Error(`Reviewer JSON does not follow the expected schema (attempt ${attempt}):\n${response.content.slice(0, 500)}`);
      continue;
    }

    const result: ReviewResult = {
      approved: parsed.approved,
      notes: parsed.notes ?? "",
      corrections: parsed.corrections ?? [],
    };
    return { result, usage: response.usage };
  }

  throw lastError ?? new Error("Reviewer failed after multiple attempts.");
}
