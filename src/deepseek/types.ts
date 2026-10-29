export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: ChatRole;
  /** `null` is legal for an assistant message that is only tool_calls, with no text. */
  content: string | null;
  /** Only for role "assistant" when tools are in play. */
  reasoningContent?: string;
  toolCalls?: ToolCall[];
  /** Only for role "tool": which call this result closes. */
  toolCallId?: string;
}

export interface ToolSpec {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ThinkingConfig {
  reasoningEffort: "low" | "high" | "max";
}

export interface ChatCompletionParams {
  model: "deepseek-v4-pro" | "deepseek-v4-flash";
  messages: ChatMessage[];
  thinking?: ThinkingConfig;
  tools?: ToolSpec[];
  /** Requires a valid JSON string as `content`; the schema is described in the prompt, the API does not enforce it. */
  jsonOutput?: boolean;
  signal?: AbortSignal;
}

export interface ChatCompletionResult {
  content: string;
  reasoningContent: string;
  usage: UsageInfo;
}

export interface UsageInfo {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  promptCacheHitTokens: number;
  promptCacheMissTokens: number;
  reasoningTokens: number;
}

export type StreamEvent =
  | { type: "content_delta"; delta: string }
  // Shown to the user. Without tools the API silently ignores this if it is sent back in
  // the history; with tools, the previous reasoning_content must be sent back with the next
  // call in the same tool-calling sequence, so the agent loop keeps it and passes it on.
  | { type: "reasoning_delta"; delta: string }
  // A fragment of one tool call (OpenAI style): the first fragment per `index` carries
  // `id`+`name`, all later ones carry only a piece of `argumentsDelta`; the caller
  // merges them by `index`.
  | { type: "tool_call_delta"; index: number; id?: string; name?: string; argumentsDelta?: string }
  | { type: "usage"; usage: UsageInfo }
  | { type: "done"; finishReason: string | null };
