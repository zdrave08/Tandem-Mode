import { chatCompletionOnce } from "../deepseek/client.js";
import type { TandemEnv } from "../config/env.js";
import type { UsageInfo } from "../deepseek/types.js";
import { isPlan, type Plan } from "./types.js";

const PLANNER_SYSTEM_PROMPT = `You are the planner in the Tandem Mode coding agent. You receive a task and a map
of the repository. Split the task into small, independent steps that a worker model
(with no access to this conversation, only the tools read_file/list_dir/search/edit/
git_diff/shell/view_image) can carry out on its own.

Respond ONLY with valid JSON, with no markdown fences, in exactly this schema:
{
  "summary": "short description of the approach",
  "tasks": [
    { "id": "t1", "description": "...", "files": ["..."], "acceptanceCriteria": "..." }
  ]
}`;

const MAX_ATTEMPTS = 2;

export async function runPlanner(
  env: TandemEnv,
  task: string,
  repoMap: string,
  signal?: AbortSignal
): Promise<{ plan: Plan; usage: UsageInfo }> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await chatCompletionOnce(env, {
      model: "deepseek-v4-pro",
      thinking: { reasoningEffort: "max" },
      jsonOutput: true,
      messages: [
        { role: "system", content: PLANNER_SYSTEM_PROMPT },
        { role: "user", content: `Task:\n${task}\n\nRepository map:\n${repoMap}` },
      ],
      ...(signal ? { signal } : {}),
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(result.content);
    } catch {
      lastError = new Error(`Planner did not return valid JSON (attempt ${attempt}):\n${result.content.slice(0, 500)}`);
      continue;
    }
    if (!isPlan(parsed)) {
      lastError = new Error(`Planner JSON does not follow the expected schema (attempt ${attempt}):\n${result.content.slice(0, 500)}`);
      continue;
    }

    return { plan: parsed, usage: result.usage };
  }

  // Known behavior: json_object mode occasionally returns empty/invalid
  // content (probably transient API flakiness, not a consistent error;
  // see docs/api-notes.md). One retry covers it without crashing the caller.
  throw lastError ?? new Error("Planner failed after multiple attempts.");
}
