import type { TandemEnv } from "../config/env.js";
import type { UsageInfo } from "./types.js";

export interface WebSearchResult {
  text: string;
  usage: UsageInfo;
}

function parseResponsesUsage(raw: Record<string, unknown>): UsageInfo {
  return {
    promptTokens: Number(raw["input_tokens"] ?? 0),
    completionTokens: Number(raw["output_tokens"] ?? 0),
    totalTokens: Number(raw["total_tokens"] ?? 0),
    // Responses API caching is fully automatic: it does not report hit/miss
    // separately the way Chat Completions does (docs/api-notes.md #5).
    promptCacheHitTokens: Number(raw["cached_tokens"] ?? 0),
    promptCacheMissTokens: 0,
    reasoningTokens: 0,
  };
}

/** `/responses` is stateless: an isolated call, with no effect on the main tool-calling loop or its cache. */
export async function runWebSearch(env: TandemEnv, query: string, signal?: AbortSignal): Promise<WebSearchResult> {
  const response = await fetch(`${env.baseUrl}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.apiKey}`,
    },
    ...(signal ? { signal } : {}),
    body: JSON.stringify({
      model: "deepseek-v4-flash",
      input: query,
      tools: [{ type: "web_search" }],
      tool_choice: { type: "web_search" },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`DeepSeek Responses API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const output = (data["output"] as Array<Record<string, unknown>> | undefined) ?? [];
  const message = output.find((item) => item["type"] === "message");
  const content = message?.["content"] as Array<Record<string, unknown>> | undefined;
  const text = content?.find((c) => typeof c["text"] === "string")?.["text"] as string | undefined;

  if (!text) {
    throw new Error("Web search response contained no text.");
  }

  return { text, usage: parseResponsesUsage((data["usage"] as Record<string, unknown>) ?? {}) };
}
