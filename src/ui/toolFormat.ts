/**
 * Readable display of tool calls and their results in the terminal.
 * Pure functions with no Ink/React dependency, so they can be checked outside the UI.
 */

export interface DiffLine {
  kind: "removed" | "added" | "more";
  text: string;
}

export interface FormattedCall {
  title: string;
  diff?: DiffLine[];
}

export interface FormattedResult {
  /** One line instead of the raw output; when unset, the first few lines are shown. */
  summary?: string;
}

const MAX_DIFF_LINES = 8;
const MAX_LINE_CHARS = 120;

function str(value: unknown): string {
  return typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
}

function clip(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

function diffSide(text: string, kind: "removed" | "added"): DiffLine[] {
  const lines = text.split(/\r?\n/);
  const shown: DiffLine[] = lines.slice(0, MAX_DIFF_LINES).map((l) => ({ kind, text: clip(l, MAX_LINE_CHARS) || " " }));
  if (lines.length > MAX_DIFF_LINES) {
    shown.push({ kind: "more", text: `… +${lines.length - MAX_DIFF_LINES}` });
  }
  return shown;
}

export function formatToolCall(name: string, args: Record<string, unknown>): FormattedCall {
  switch (name) {
    case "read_file": {
      const offset = args["offset"] !== undefined ? `:${str(args["offset"])}` : "";
      return { title: `Read(${str(args["path"])}${offset})` };
    }
    case "list_dir":
      return { title: `List(${str(args["path"]) || "."})` };
    case "search": {
      const where = str(args["glob"]) || str(args["path"]);
      return { title: `Search("${clip(str(args["pattern"]), 60)}"${where ? ` in ${where}` : ""})` };
    }
    case "edit": {
      const oldString = str(args["oldString"]);
      const newString = str(args["newString"]);
      const all = args["replaceAll"] ? ", all" : "";
      const diff: DiffLine[] = [];
      if (oldString) diff.push(...diffSide(oldString, "removed"));
      if (newString) diff.push(...diffSide(newString, "added"));
      return { title: `Edit(${str(args["path"])}${all})`, diff };
    }
    case "shell":
      return { title: `Shell(${clip(str(args["command"]), 100)})` };
    case "git_diff": {
      const parts = [args["staged"] ? "staged" : "", str(args["path"])].filter(Boolean);
      return { title: `GitDiff(${parts.join(", ")})` };
    }
    case "view_image":
      return { title: `ViewImage(${str(args["path"])})` };
    case "web_search":
      return { title: `WebSearch("${clip(str(args["query"]), 80)}")` };
    default:
      return { title: `${name}(${clip(JSON.stringify(args), 100)})` };
  }
}

function countLines(output: string): number {
  return output === "" ? 0 : output.split("\n").length;
}

export function formatToolResult(name: string, output: string, isError: boolean): FormattedResult {
  if (isError) return {};

  switch (name) {
    case "read_file": {
      const truncated = /\n\.\.\. \(truncated, (\d+) lines total\)\s*$/.exec(output);
      if (truncated) {
        return { summary: `${countLines(output) - 1} lines read (file has ${truncated[1]})` };
      }
      return { summary: `${countLines(output)} lines read` };
    }
    case "search": {
      if (output.trim() === "(no matches)") return { summary: "no matches" };
      return { summary: `${countLines(output.trim())} matching lines` };
    }
    case "list_dir": {
      if (output.trim() === "(empty)") return { summary: "empty" };
      return { summary: `${countLines(output.trim())} entries` };
    }
    case "edit":
      return { summary: output.trim().split("\n")[0] ?? "" };
    default:
      return {};
  }
}
