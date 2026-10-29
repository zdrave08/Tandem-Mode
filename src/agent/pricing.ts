/**
 * Prices per 1M tokens (August 2026). Check periodically against the official
 * pricing page, since the API itself has no price-check endpoint.
 */
export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheHitInputPerMillion: number;
}

export const PRICING: Record<"deepseek-v4-pro" | "deepseek-v4-flash", ModelPricing> = {
  "deepseek-v4-flash": { inputPerMillion: 0.22, outputPerMillion: 0.66, cacheHitInputPerMillion: 0.007 },
  "deepseek-v4-pro": { inputPerMillion: 0.66, outputPerMillion: 1.98, cacheHitInputPerMillion: 0.022 },
};

const PEAK_WINDOWS_UTC: Array<[number, number]> = [
  [1, 4],
  [6, 10],
];

export function isPeakHour(date: Date): boolean {
  const hour = date.getUTCHours();
  return PEAK_WINDOWS_UTC.some(([start, end]) => hour >= start && hour < end);
}

export function estimateCallCost(
  model: keyof typeof PRICING,
  usage: { promptCacheHitTokens: number; promptCacheMissTokens: number; completionTokens: number },
  isPeak: boolean
): number {
  const p = PRICING[model];
  const peakMultiplier = isPeak ? 2 : 1;
  const inputCost =
    (usage.promptCacheMissTokens / 1_000_000) * p.inputPerMillion * peakMultiplier +
    (usage.promptCacheHitTokens / 1_000_000) * p.cacheHitInputPerMillion * peakMultiplier;
  const outputCost = (usage.completionTokens / 1_000_000) * p.outputPerMillion * peakMultiplier;
  return inputCost + outputCost;
}
