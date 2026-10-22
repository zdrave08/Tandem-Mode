import { runShell } from "../agent/tools/shell.js";
import { t } from "../i18n/index.js";

export type NotifyOutcome = "approved" | "max_review_loops" | "error";

export interface NotifyInfo {
  outcome: NotifyOutcome;
  task: string;
  /** Reviewer notes, or the error message for outcome "error". */
  notes: string;
  /** How many times the reviewer asked for changes. */
  reviewLoops: number;
  costUsd: number;
}

// The notification must never hold up the end of a run for long.
const NOTIFY_TIMEOUT_MS = 15_000;
const MAX_TASK_CHARS = 500;
const MAX_NOTES_CHARS = 1_000;

// Environment values cannot contain NUL bytes.
function envValue(text: string, max: number): string {
  return text.replaceAll("\0", "").slice(0, max);
}

/**
 * Runs the user's `notifyCommand` after a /plan run. Details go in as environment
 * variables, never spliced into the command text, so a task or review note cannot
 * inject shell code. A failing command only prints a warning.
 */
export async function notifyCompletion(command: string | undefined, cwd: string, info: NotifyInfo): Promise<void> {
  if (!command) return;
  try {
    const { exitCode, output } = await runShell(command, cwd, undefined, {
      timeoutMs: NOTIFY_TIMEOUT_MS,
      env: {
        TANDEM_OUTCOME: info.outcome,
        TANDEM_TASK: envValue(info.task, MAX_TASK_CHARS),
        TANDEM_NOTES: envValue(info.notes, MAX_NOTES_CHARS),
        TANDEM_REVIEW_LOOPS: String(info.reviewLoops),
        TANDEM_COST_USD: info.costUsd.toFixed(4),
      },
    });
    if (exitCode !== 0) {
      console.warn(t("notifyFailed", { reason: `exit code ${exitCode}: ${output.trim().slice(0, 200)}` }));
    }
  } catch (err) {
    console.warn(t("notifyFailed", { reason: err instanceof Error ? err.message : String(err) }));
  }
}
