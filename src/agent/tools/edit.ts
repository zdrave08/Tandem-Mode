import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ToolDefinition } from "./types.js";

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let idx = 0;
  for (;;) {
    idx = haystack.indexOf(needle, idx);
    if (idx === -1) break;
    count++;
    idx += needle.length;
  }
  return count;
}

export const editTool: ToolDefinition = {
  name: "edit",
  description:
    "Replace an exact string in a file with a new string. `oldString` must be unique in the file unless replaceAll=true. Preserves the original line-ending style (CRLF/LF).",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the file." },
      oldString: { type: "string", description: "Exact text to replace (with enough context to be unique)." },
      newString: { type: "string", description: "Replacement text." },
      replaceAll: { type: "boolean", description: "Replace all occurrences instead of requiring uniqueness." },
    },
    required: ["path", "oldString", "newString"],
  },
  // Uvek menja fajl na disku.
  isDestructive: () => true,
  async execute(args, ctx) {
    const filePath = String(args["path"] ?? "");
    const oldString = String(args["oldString"] ?? "");
    const newString = String(args["newString"] ?? "");
    const replaceAll = Boolean(args["replaceAll"]);
    const resolved = path.resolve(ctx.cwd, filePath);

    if (oldString === newString) {
      return { output: "oldString and newString are identical — nothing to change.", isError: true };
    }

    let raw: string;
    try {
      raw = await readFile(resolved, "utf8");
    } catch (err) {
      return { output: `Error reading ${resolved}: ${(err as Error).message}`, isError: true };
    }

    const eol = raw.includes("\r\n") ? "\r\n" : "\n";
    const normalized = raw.replace(/\r\n/g, "\n");
    const needle = oldString.replace(/\r\n/g, "\n");
    const replacement = newString.replace(/\r\n/g, "\n");

    const occurrences = countOccurrences(normalized, needle);
    if (occurrences === 0) {
      return { output: `oldString not found in ${filePath}.`, isError: true };
    }
    if (occurrences > 1 && !replaceAll) {
      return {
        output: `oldString appears ${occurrences} times in ${filePath} — add more context to make it unique, or pass replaceAll=true.`,
        isError: true,
      };
    }

    const updated = replaceAll
      ? normalized.split(needle).join(replacement)
      : normalized.replace(needle, replacement);

    const finalContent = eol === "\r\n" ? updated.replace(/\n/g, "\r\n") : updated;

    try {
      await writeFile(resolved, finalContent, "utf8");
    } catch (err) {
      return { output: `Error writing ${resolved}: ${(err as Error).message}`, isError: true };
    }

    return {
      output: `Edited ${filePath} (${occurrences} ${occurrences === 1 ? "replacement" : "replacements"}).`,
      isError: false,
    };
  },
};
