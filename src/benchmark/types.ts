import type { UsageInfo } from "../deepseek/types.js";

export type BenchmarkConfigName = "pro-only" | "flash-only" | "orchestration";

export interface BenchmarkTask {
  id: string;
  /** Prompt given to the agent, verbatim. */
  description: string;
  /** For dimension 5 (unnecessary changes): the files a reasonable fix should touch. */
  expectedFiles: string[];
  /** Shell command that resets the target repo to a clean starting state before the turn. */
  setup?: string;
  /** E.g. "php -l %file%" or "npm run build". */
  build?: string;
  /** E.g. "npm test". */
  test?: string;
  /** Shell command that exits 0 if the task is really fulfilled. */
  verify: string;
}

export interface BenchmarkResult {
  taskId: string;
  config: BenchmarkConfigName;
  completed: boolean;
  correct: boolean;
  buildPassed: boolean | null;
  testPassed: boolean | null;
  unnecessaryFileChanges: number;
  failedAttempts: number;
  selfCorrected: boolean;
  usage: UsageInfo;
  requestCount: number;
  costUsd: number;
  offPeakCostUsd: number;
  durationMs: number;
  /** Dimension 8 (architecture) is qualitative on purpose: filled in by hand/afterwards, not here. */
  architectureNotes?: string;
  /** Set when the attempt itself failed (network error, malformed JSON, etc.); the other fields are then default/empty. */
  error?: string;
}
