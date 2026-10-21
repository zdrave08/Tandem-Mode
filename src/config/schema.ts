export interface TandemConfig {
  defaultModel?: "deepseek-v4-pro" | "deepseek-v4-flash";
  defaultReasoningEffort?: "low" | "high" | "max";
  budgetUsd?: number;
  baseUrl?: string;
  maxReviewLoops?: number;
  /** Shell komanda (build/test) koju orkestracija pokreće pre svakog review-a; izlaz ide reviewer-u. */
  verifyCommand?: string;
}

export const DEFAULT_CONFIG: Required<Pick<TandemConfig, "defaultModel" | "defaultReasoningEffort" | "maxReviewLoops">> = {
  defaultModel: "deepseek-v4-pro",
  defaultReasoningEffort: "high",
  maxReviewLoops: 3,
};
