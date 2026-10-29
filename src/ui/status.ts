export interface StatusInput {
  model: string;
  /** Već prevedena oznaka režima ("chat" / "plan"). */
  mode: string;
  costUsd: number;
  budgetUsd?: number;
  /** Trenutni poziv modela u ovom potezu i trenutna granica; nepoznato pre prvog poziva. */
  call?: { n: number; max: number };
  /** Prevedena oznaka poziva, npr. "call 12/25" — gradi je pozivalac (i18n). */
  callLabel?: string;
}

export type StatusLevel = "normal" | "warn" | "danger";

export interface StatusLine {
  text: string;
  level: StatusLevel;
}

/** Skraćuje "deepseek-v4-pro" na "v4-pro" da linija stane u uski terminal. */
export function shortModel(model: string): string {
  return model.replace(/^deepseek-/, "");
}

export function statusLevel(input: Pick<StatusInput, "costUsd" | "budgetUsd" | "call">): StatusLevel {
  let level: StatusLevel = "normal";
  const rank = (l: StatusLevel): number => (l === "danger" ? 2 : l === "warn" ? 1 : 0);
  const raise = (l: StatusLevel): void => {
    if (rank(l) > rank(level)) level = l;
  };

  if (input.budgetUsd !== undefined && input.budgetUsd > 0) {
    const ratio = input.costUsd / input.budgetUsd;
    if (ratio >= 0.95) raise("danger");
    else if (ratio >= 0.8) raise("warn");
  }
  if (input.call && input.call.max > 0) {
    const ratio = input.call.n / input.call.max;
    if (ratio >= 0.96) raise("danger");
    else if (ratio >= 0.8) raise("warn");
  }
  return level;
}

export function formatStatusLine(input: StatusInput): StatusLine {
  const cost = input.budgetUsd !== undefined
    ? `$${input.costUsd.toFixed(4)} / $${input.budgetUsd.toFixed(2)}`
    : `$${input.costUsd.toFixed(4)}`;
  const parts = [shortModel(input.model), input.mode, cost];
  if (input.callLabel) parts.push(input.callLabel);
  return { text: parts.join(" · "), level: statusLevel(input) };
}
