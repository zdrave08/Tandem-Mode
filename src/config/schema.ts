export interface TandemConfig {
  defaultModel?: "deepseek-v4-pro" | "deepseek-v4-flash";
  defaultReasoningEffort?: "low" | "high" | "max";
  budgetUsd?: number;
  baseUrl?: string;
  maxReviewLoops?: number;
  /** Model calls per chunk of an agent turn (default 25); at the limit the user is asked whether to continue. */
  maxIterations?: number;
  /** Continue automatically at the iteration limit instead of asking. Only honored when a budget is set. */
  autoContinue?: boolean;
  /** Shell komanda (build/test) koju orkestracija pokreće pre svakog review-a; izlaz ide reviewer-u. */
  verifyCommand?: string;
  /** Shell command run when a /plan run ends (approved, max review loops, or error); details come as TANDEM_* env vars. */
  notifyCommand?: string;
  /** UI language; the --lang flag and TANDEM_LANG env override it. */
  language?: "en" | "sr";
}

export const DEFAULT_CONFIG: Required<
  Pick<TandemConfig, "defaultModel" | "defaultReasoningEffort" | "maxReviewLoops" | "maxIterations">
> = {
  defaultModel: "deepseek-v4-pro",
  defaultReasoningEffort: "high",
  maxReviewLoops: 3,
  maxIterations: 25,
};
