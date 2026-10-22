import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface Profile {
  model?: "deepseek-v4-pro" | "deepseek-v4-flash";
  reasoningEffort?: "low" | "high" | "max";
  budgetUsd?: number;
  maxReviewLoops?: number;
}

// The name becomes a file name, so it is restricted to a safe charset: no path
// separators, no dots, no way to leave the profiles directory.
const NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;

function profilesDir(): string {
  return path.join(os.homedir(), ".tandem", "profiles");
}

/** Lower-cases and validates; returns `null` for a name that cannot be used. */
export function normalizeProfileName(raw: string): string | null {
  const name = raw.trim().toLowerCase();
  return NAME_PATTERN.test(name) ? name : null;
}

export function profilePath(name: string): string {
  return path.join(profilesDir(), `${name}.json`);
}

/** Throws an Error with a reason on a malformed file; only known fields are kept. */
export function parseProfile(raw: unknown): Profile {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("expected a JSON object");
  }
  const input = raw as Record<string, unknown>;
  const profile: Profile = {};

  if (input["model"] !== undefined) {
    if (input["model"] !== "deepseek-v4-pro" && input["model"] !== "deepseek-v4-flash") {
      throw new Error(`unknown model ${JSON.stringify(input["model"])}`);
    }
    profile.model = input["model"];
  }
  if (input["reasoningEffort"] !== undefined) {
    const effort = input["reasoningEffort"];
    if (effort !== "low" && effort !== "high" && effort !== "max") {
      throw new Error(`unknown reasoningEffort ${JSON.stringify(effort)}`);
    }
    profile.reasoningEffort = effort;
  }
  if (input["budgetUsd"] !== undefined) {
    const budget = input["budgetUsd"];
    if (typeof budget !== "number" || !Number.isFinite(budget) || budget <= 0) {
      throw new Error("budgetUsd must be a positive number");
    }
    profile.budgetUsd = budget;
  }
  if (input["maxReviewLoops"] !== undefined) {
    const loops = input["maxReviewLoops"];
    if (typeof loops !== "number" || !Number.isInteger(loops) || loops <= 0) {
      throw new Error("maxReviewLoops must be a positive integer");
    }
    profile.maxReviewLoops = loops;
  }
  return profile;
}

export async function saveProfile(name: string, profile: Profile): Promise<string> {
  const filePath = profilePath(name);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(profile, null, 2) + "\n", "utf8");
  return filePath;
}

/** `null` if there is no such profile; throws on a malformed file. */
export async function loadProfile(name: string): Promise<Profile | null> {
  let raw: string;
  try {
    raw = await readFile(profilePath(name), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("not valid JSON");
  }
  return parseProfile(parsed);
}

export async function listProfiles(): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(profilesDir());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  return entries
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -".json".length))
    .filter((n) => NAME_PATTERN.test(n))
    .sort();
}

export function describeProfile(profile: Profile): string {
  const parts: string[] = [];
  if (profile.model) parts.push(`model=${profile.model}`);
  if (profile.reasoningEffort) parts.push(`effort=${profile.reasoningEffort}`);
  if (profile.budgetUsd !== undefined) parts.push(`budget=$${profile.budgetUsd.toFixed(2)}`);
  if (profile.maxReviewLoops !== undefined) parts.push(`loops=${profile.maxReviewLoops}`);
  return parts.join(" ");
}
