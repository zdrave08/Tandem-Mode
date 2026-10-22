import type { TandemEnv } from "../config/env.js";
import { chatCompletionOnce } from "../deepseek/client.js";
import type { ChatMessage, UsageInfo } from "../deepseek/types.js";

// Tool output is where long sessions grow (file dumps, shell output), so it is
// cut hard in the transcript the summarizer sees. The summary only needs the gist.
const MAX_TOOL_OUTPUT_CHARS = 1_500;
const MAX_TOOL_ARGS_CHARS = 300;
const MAX_TRANSCRIPT_CHARS = 300_000;

export const SUMMARY_MODEL = "deepseek-v4-flash";

const SUMMARIZER_SYSTEM_PROMPT = `You compact the history of a coding-agent session so work can continue from your
summary alone. Write a dense summary with these parts, skipping any that are empty:
- Goal: what the user is trying to achieve, plus constraints and preferences they stated.
- Done: files read or changed (exact paths), commands run and their results.
- Decisions: what was decided and why.
- State: where things stand right now, including failing tests or errors still open.
- Next: what was about to happen or is still to do.
Keep exact file paths, identifiers and error messages that matter. Do not invent anything
that is not in the conversation. No preamble. Reply in the language the user wrote in.`;

export const SUMMARY_PREFIX =
  "Summary of our conversation so far (the earlier messages were compacted to save context):";

const SUMMARY_ACK = "Understood. I'll continue from this summary.";

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)} … (truncated, ${text.length} chars)` : text;
}

/** Plain-text rendering of the history. Text avoids tool_call/tool pairing rules in the summarizer request. */
export function buildTranscript(messages: ChatMessage[]): string {
  const toolNames = new Map<string, string>();
  for (const m of messages) {
    for (const call of m.toolCalls ?? []) toolNames.set(call.id, call.function.name);
  }

  const parts: string[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "user") {
      parts.push(`USER:\n${m.content ?? ""}`);
    } else if (m.role === "assistant") {
      const calls = (m.toolCalls ?? [])
        .map((c) => `[called ${c.function.name}(${truncate(c.function.arguments, MAX_TOOL_ARGS_CHARS)})]`)
        .join("\n");
      const text = [m.content ?? "", calls].filter(Boolean).join("\n");
      if (text) parts.push(`ASSISTANT:\n${text}`);
    } else {
      const name = (m.toolCallId && toolNames.get(m.toolCallId)) || "tool";
      parts.push(`TOOL RESULT (${name}):\n${truncate(m.content ?? "", MAX_TOOL_OUTPUT_CHARS)}`);
    }
  }

  const transcript = parts.join("\n\n");
  if (transcript.length <= MAX_TRANSCRIPT_CHARS) return transcript;
  // Too long even after trimming tool output: keep the most recent part.
  return `[earlier part of the conversation omitted]\n\n${transcript.slice(-MAX_TRANSCRIPT_CHARS)}`;
}

export interface CompactResult {
  /** `[system, summary, acknowledgement]` — ready to replace the live history. */
  messages: ChatMessage[];
  summary: string;
  usage: UsageInfo;
}

/** One model call. Throws on API errors or an empty summary; the caller's history is never touched here. */
export async function compactConversation(
  env: TandemEnv,
  messages: ChatMessage[],
  systemPrompt: string,
  signal?: AbortSignal
): Promise<CompactResult> {
  const response = await chatCompletionOnce(env, {
    model: SUMMARY_MODEL,
    messages: [
      { role: "system", content: SUMMARIZER_SYSTEM_PROMPT },
      { role: "user", content: `Conversation to summarize:\n\n${buildTranscript(messages)}` },
    ],
    ...(signal ? { signal } : {}),
  });

  const summary = response.content.trim();
  if (!summary) throw new Error("The model returned an empty summary.");

  // The acknowledgement keeps user/assistant alternation, so the next user turn
  // never follows another user message.
  return {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `${SUMMARY_PREFIX}\n\n${summary}` },
      { role: "assistant", content: SUMMARY_ACK },
    ],
    summary,
    usage: response.usage,
  };
}
