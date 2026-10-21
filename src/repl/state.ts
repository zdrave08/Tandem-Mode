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
  verifyCommand?: string;
  autoApprove: boolean;
  /** Alati koje je korisnik označio "uvek dozvoli" za trenutnu sesiju. */
  alwaysApprovedTools: Set<string>;
  session: Session;
  messages: ChatMessage[];
  usage: UsageAccumulator;
}
