import { en, type MessageKey } from "./en.js";
import { sr } from "./sr.js";

export type Language = "en" | "sr";
export const LANGUAGES: readonly Language[] = ["en", "sr"];
export const DEFAULT_LANGUAGE: Language = "en";

const tables: Record<Language, Record<MessageKey, string>> = { en, sr };

let current: Language = DEFAULT_LANGUAGE;

export function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "sr";
}

export function setLanguage(language: Language): void {
  current = language;
}

/** First valid candidate wins; callers pass them in priority order (flag > env > config). */
export function resolveLanguage(...candidates: unknown[]): Language {
  return candidates.find(isLanguage) ?? DEFAULT_LANGUAGE;
}

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const template = tables[current][key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}
