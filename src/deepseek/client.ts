import type { TandemEnv } from "../config/env.js";
import type { ChatCompletionParams, ChatCompletionResult, ChatMessage, StreamEvent, UsageInfo } from "./types.js";

async function* readSseLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        yield line;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function parseUsage(raw: Record<string, unknown>): UsageInfo {
  const completionDetails = raw["completion_tokens_details"] as
    | Record<string, unknown>
    | undefined;

  return {
    promptTokens: Number(raw["prompt_tokens"] ?? 0),
    completionTokens: Number(raw["completion_tokens"] ?? 0),
    totalTokens: Number(raw["total_tokens"] ?? 0),
    promptCacheHitTokens: Number(raw["prompt_cache_hit_tokens"] ?? 0),
    promptCacheMissTokens: Number(raw["prompt_cache_miss_tokens"] ?? 0),
    reasoningTokens: Number(completionDetails?.["reasoning_tokens"] ?? 0),
  };
}

function toWireMessage(msg: ChatMessage): Record<string, unknown> {
  const wire: Record<string, unknown> = { role: msg.role, content: msg.content };
  if (msg.reasoningContent !== undefined) wire["reasoning_content"] = msg.reasoningContent;
  if (msg.toolCalls !== undefined) wire["tool_calls"] = msg.toolCalls;
  if (msg.toolCallId !== undefined) wire["tool_call_id"] = msg.toolCallId;
  return wire;
}

export async function* streamChatCompletion(
  env: TandemEnv,
  params: ChatCompletionParams
): AsyncGenerator<StreamEvent> {
  const response = await fetch(`${env.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.apiKey}`,
    },
    ...(params.signal ? { signal: params.signal } : {}),
    body: JSON.stringify({
      model: params.model,
      messages: params.messages.map(toWireMessage),
      tools: params.tools,
      stream: true,
      // Without this, usage arrives as null in every chunk.
      stream_options: { include_usage: true },
      thinking: params.thinking
        ? { type: "enabled", reasoning_effort: params.thinking.reasoningEffort }
        : { type: "disabled" },
      response_format: params.jsonOutput ? { type: "json_object" } : undefined,
    }),
  });

  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => "");
    throw new Error(`DeepSeek API error ${response.status}: ${body}`);
  }

  for await (const line of readSseLines(response.body)) {
    if (!line.startsWith("data:")) continue;

    const payload = line.slice("data:".length).trim();
    if (payload === "[DONE]") continue;
    if (!payload) continue;

    const parsed = JSON.parse(payload) as Record<string, unknown>;

    if (parsed["usage"]) {
      yield { type: "usage", usage: parseUsage(parsed["usage"] as Record<string, unknown>) };
    }

    const choices = parsed["choices"] as Array<Record<string, unknown>> | undefined;
    const choice = choices?.[0];
    const delta = choice?.["delta"] as Record<string, unknown> | undefined;

    if (delta) {
      if (typeof delta["content"] === "string" && delta["content"].length > 0) {
        yield { type: "content_delta", delta: delta["content"] };
      }
      if (typeof delta["reasoning_content"] === "string" && delta["reasoning_content"].length > 0) {
        yield { type: "reasoning_delta", delta: delta["reasoning_content"] };
      }
      const toolCalls = delta["tool_calls"] as Array<Record<string, unknown>> | undefined;
      if (toolCalls) {
        for (const tc of toolCalls) {
          const fn = tc["function"] as Record<string, unknown> | undefined;
          const event: Extract<StreamEvent, { type: "tool_call_delta" }> = {
            type: "tool_call_delta",
            index: Number(tc["index"] ?? 0),
          };
          if (typeof tc["id"] === "string") event.id = tc["id"];
          if (typeof fn?.["name"] === "string") event.name = fn["name"];
          if (typeof fn?.["arguments"] === "string") event.argumentsDelta = fn["arguments"];
          yield event;
        }
      }
    }

    const finishReason = choice?.["finish_reason"];
    if (typeof finishReason === "string") {
      yield { type: "done", finishReason };
    }
  }
}

/** Non-streaming call for planner/reviewer: no tools, just text/JSON + usage all at once. */
export async function chatCompletionOnce(
  env: TandemEnv,
  params: Omit<ChatCompletionParams, "tools">
): Promise<ChatCompletionResult> {
  const response = await fetch(`${env.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.apiKey}`,
    },
    ...(params.signal ? { signal: params.signal } : {}),
    body: JSON.stringify({
      model: params.model,
      messages: params.messages.map(toWireMessage),
      stream: false,
      thinking: params.thinking
        ? { type: "enabled", reasoning_effort: params.thinking.reasoningEffort }
        : { type: "disabled" },
      response_format: params.jsonOutput ? { type: "json_object" } : undefined,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`DeepSeek API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const message = (data["choices"] as Array<Record<string, unknown>> | undefined)?.[0]?.["message"] as
    | Record<string, unknown>
    | undefined;

  return {
    content: typeof message?.["content"] === "string" ? message["content"] : "",
    reasoningContent: typeof message?.["reasoning_content"] === "string" ? message["reasoning_content"] : "",
    usage: parseUsage((data["usage"] as Record<string, unknown>) ?? {}),
  };
}
