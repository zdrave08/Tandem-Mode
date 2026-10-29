import type { UsageInfo } from "../deepseek/types.js";
import { estimateCallCost, isPeakHour } from "./pricing.js";

interface UsageEntry {
  model: "deepseek-v4-pro" | "deepseek-v4-flash";
  usage: UsageInfo;
  isPeak: boolean;
}

/** Strictly from the API `usage` field; never a client-side token estimate. */
export class UsageAccumulator {
  private entries: UsageEntry[] = [];

  add(model: "deepseek-v4-pro" | "deepseek-v4-flash", usage: UsageInfo): void {
    this.entries.push({ model, usage, isPeak: isPeakHour(new Date()) });
  }

  get callCount(): number {
    return this.entries.length;
  }

  totals(): UsageInfo {
    return this.entries.reduce<UsageInfo>(
      (acc, e) => ({
        promptTokens: acc.promptTokens + e.usage.promptTokens,
        completionTokens: acc.completionTokens + e.usage.completionTokens,
        totalTokens: acc.totalTokens + e.usage.totalTokens,
        promptCacheHitTokens: acc.promptCacheHitTokens + e.usage.promptCacheHitTokens,
        promptCacheMissTokens: acc.promptCacheMissTokens + e.usage.promptCacheMissTokens,
        reasoningTokens: acc.reasoningTokens + e.usage.reasoningTokens,
      }),
      {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        promptCacheHitTokens: 0,
        promptCacheMissTokens: 0,
        reasoningTokens: 0,
      }
    );
  }

  estimatedCostUsd(): number {
    return this.entries.reduce((sum, e) => sum + estimateCallCost(e.model, e.usage, e.isPeak), 0);
  }

  /** What this session would have cost had every call fallen into the off-peak window. */
  offPeakEquivalentCostUsd(): number {
    return this.entries.reduce((sum, e) => sum + estimateCallCost(e.model, e.usage, false), 0);
  }
}
