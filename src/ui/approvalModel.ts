import { t } from "../i18n/index.js";
import { formatToolCall } from "./toolFormat.js";

/** Pseudo-tool used to ask "continue after the iteration limit?" through the same approval flow. */
export const CONTINUE_TOOL = "__continue__";

export type ChoiceId = "yes" | "always" | "no";

export interface BodyLine {
  text: string;
  color?: "red" | "green";
  dim?: boolean;
}

export interface ApprovalCopy {
  title: string;
  body: BodyLine[];
  question: string;
  options: Array<{ id: ChoiceId; label: string }>;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
}

/** What the approval box says for a given tool call. A shell command is always shown in full, never shortened. */
export function buildApprovalCopy(toolName: string, args: Record<string, unknown>): ApprovalCopy {
  if (toolName === CONTINUE_TOOL) {
    return {
      title: t("approvalTitleContinue"),
      body: [{ text: t("continueAsk", { n: Number(args["iterations"] ?? 0) }) }],
      question: t("approvalQuestionContinue", { chunk: Number(args["chunk"] ?? 0) }),
      options: [
        { id: "yes", label: t("approvalYes") },
        { id: "always", label: t("approvalAlwaysContinue") },
        { id: "no", label: t("approvalNo") },
      ],
    };
  }

  const options: ApprovalCopy["options"] = [
    { id: "yes", label: t("approvalYes") },
    { id: "always", label: t("approvalAlways", { tool: toolName }) },
    { id: "no", label: t("approvalNo") },
  ];

  if (toolName === "shell") {
    return {
      title: t("approvalTitleShell"),
      body: [{ text: str(args["command"]) }],
      question: t("approvalQuestionShell"),
      options,
    };
  }

  if (toolName === "edit") {
    const call = formatToolCall(toolName, args);
    const diff: BodyLine[] = (call.diff ?? []).map((l) =>
      l.kind === "removed"
        ? { text: `- ${l.text}`, color: "red" as const }
        : l.kind === "added"
          ? { text: `+ ${l.text}`, color: "green" as const }
          : { text: `  ${l.text}`, dim: true }
    );
    return {
      title: t("approvalTitleEdit", { path: str(args["path"]) }),
      body: diff,
      question: t("approvalQuestionEdit"),
      options,
    };
  }

  return {
    title: t("approvalTitleTool", { tool: toolName }),
    body: [{ text: JSON.stringify(args) }],
    question: t("approvalQuestionTool", { tool: toolName }),
    options,
  };
}

export interface KeyInfo {
  upArrow?: boolean;
  downArrow?: boolean;
  return?: boolean;
  escape?: boolean;
  tab?: boolean;
  ctrl?: boolean;
}

export type KeyAction = { type: "move"; index: number } | { type: "choose"; id: ChoiceId };

/**
 * Maps a key press to what the menu should do. Arrows/Tab move the highlight, Enter confirms it,
 * 1-3 or y/a/n pick directly, Esc and Ctrl+C mean "no".
 */
export function keyToAction(input: string, key: KeyInfo, index: number, ids: ChoiceId[]): KeyAction | null {
  const count = ids.length;
  if (key.upArrow) return { type: "move", index: (index - 1 + count) % count };
  if (key.downArrow || key.tab) return { type: "move", index: (index + 1) % count };
  if (key.return) {
    const id = ids[index];
    return id ? { type: "choose", id } : null;
  }
  if (key.escape || (key.ctrl && input === "c")) return { type: "choose", id: "no" };

  const lower = input.toLowerCase();
  if (lower === "y") return { type: "choose", id: "yes" };
  if (lower === "a" && ids.includes("always")) return { type: "choose", id: "always" };
  if (lower === "n") return { type: "choose", id: "no" };
  if (/^[1-9]$/.test(input)) {
    const id = ids[Number(input) - 1];
    return id ? { type: "choose", id } : null;
  }
  return null;
}
