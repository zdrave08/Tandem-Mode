import { chatCompletionOnce } from "../deepseek/client.js";
import type { TandemEnv } from "../config/env.js";
import type { UsageInfo } from "../deepseek/types.js";
import { isReviewResult, type Plan, type ReviewResult } from "./types.js";

const REVIEWER_SYSTEM_PROMPT = `Ti si reviewer u Tandem Mode coding agentu. Dobijaš originalni zadatak,
plan koji je worker(i) izvršio, i git diff stvarnih izmena. Proveri da li
diff zaista ispunjava zadatak i kriterijume prihvatanja iz plana, da nema
nepotrebnih izmena, i da je kod razuman. Ako je priložen rezultat provere
(build/test), exit code različit od 0 znači da izmena ne prolazi — tada ne
odobravaj, a u "corrections" navedi konkretnu grešku iz izlaza.

Odgovori ISKLJUČIVO validnim JSON-om, bez markdown ograda, tačno ove šeme:
{
  "approved": true|false,
  "notes": "kratko obrazloženje",
  "corrections": [{ "description": "...", "files": ["..."] }]
}
"corrections" je prazan niz ako je approved true.`;

const MAX_ATTEMPTS = 2;
const MAX_VERIFY_CHARS = 6000;

export interface VerifyResult {
  command: string;
  exitCode: number | null;
  output: string;
}

function formatVerify(verify: VerifyResult): string {
  // Greške build/test alata su obično na kraju izlaza, pa čuvamo rep, ne glavu.
  const out = verify.output.length > MAX_VERIFY_CHARS ? "...(isečeno)\n" + verify.output.slice(-MAX_VERIFY_CHARS) : verify.output;
  return `\n\nRezultat provere (${verify.command}), exit code ${verify.exitCode ?? "n/a (nije pokrenuto)"}:\n${out || "(nema izlaza)"}`;
}

export async function runReviewer(
  env: TandemEnv,
  originalTask: string,
  plan: Plan,
  gitDiff: string,
  verify?: VerifyResult,
  signal?: AbortSignal
): Promise<{ result: ReviewResult; usage: UsageInfo }> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await chatCompletionOnce(env, {
      model: "deepseek-v4-pro",
      thinking: { reasoningEffort: "high" },
      jsonOutput: true,
      messages: [
        { role: "system", content: REVIEWER_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Originalni zadatak:\n${originalTask}\n\nPlan:\n${JSON.stringify(plan, null, 2)}\n\nGit diff:\n${gitDiff.slice(0, 15000)}${verify ? formatVerify(verify) : ""}`,
        },
      ],
      ...(signal ? { signal } : {}),
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      lastError = new Error(`Reviewer nije vratio validan JSON (pokušaj ${attempt}):\n${response.content.slice(0, 500)}`);
      continue;
    }
    if (!isReviewResult(parsed)) {
      lastError = new Error(`Reviewer JSON ne prati očekivanu šemu (pokušaj ${attempt}):\n${response.content.slice(0, 500)}`);
      continue;
    }

    const result: ReviewResult = {
      approved: parsed.approved,
      notes: parsed.notes ?? "",
      corrections: parsed.corrections ?? [],
    };
    return { result, usage: response.usage };
  }

  throw lastError ?? new Error("Reviewer nije uspeo posle više pokušaja.");
}
