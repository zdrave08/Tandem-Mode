import type { TandemEnv } from "../config/env.js";
import type { ChatMessage } from "../deepseek/types.js";
import type { Session } from "../agent/session.js";
import type { UsageAccumulator } from "../agent/usage.js";

export interface RuntimeState {
  env: TandemEnv;
  cwd: string;
  model: "deepseek-v4-pro" | "deepseek-v4-flash";
  thinkingEnabled: boolean;
  reasoningEffort: "low" | "high" | "max";
  budgetUsd?: number;
  maxReviewLoops: number;
  /** Model calls per "chunk" of one turn; at the limit the user is asked whether to continue. */
  maxIterations: number;
  /** Continue without asking at the iteration limit (applies only when a budget is set). */
  autoContinue: boolean;
  /** What it is doing right now, for the status line. */
  activeMode: "chat" | "plan";
  verifyCommand?: string;
  notifyCommand?: string;
  autoApprove: boolean;
  /** Tools the user marked "always allow" for the current session. */
  alwaysApprovedTools: Set<string>;
  session: Session;
  messages: ChatMessage[];
  usage: UsageAccumulator;
}
