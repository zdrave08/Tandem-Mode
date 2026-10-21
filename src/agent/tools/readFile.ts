import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { ToolDefinition } from "./types.js";

const MAX_LINES = 2000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const readFileTool: ToolDefinition = {
  name: "read_file",
  description:
    "Read a file's contents with line numbers (cat -n style). The path may be relative to the working directory.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the file." },
      offset: { type: "integer", description: "Line to start from (1-indexed). Defaults to 1." },
      limit: { type: "integer", description: `Maximum number of lines to read. Defaults to ${MAX_LINES}.` },
    },
    required: ["path"],
  },
  isDestructive: () => false,
  async execute(args, ctx) {
    const filePath = String(args["path"] ?? "");
    const offset = Math.max(1, Number(args["offset"] ?? 1));
    const limit = Math.max(1, Number(args["limit"] ?? MAX_LINES));
    const resolved = path.resolve(ctx.cwd, filePath);

    try {
      const stats = await stat(resolved);
      if (stats.size > MAX_FILE_BYTES) {
        return {
          output: `File is too large to read (${stats.size} bytes, limit ${MAX_FILE_BYTES}). It is probably not a text source file (e.g. a state/binary/vendored file) — check the path or use the shell tool with limited output.`,
          isError: true,
        };
      }
      const raw = await readFile(resolved, "utf8");
      const lines = raw.split(/\r\n|\n/);
      const slice = lines.slice(offset - 1, offset - 1 + limit);
      const numbered = slice
        .map((line, i) => `${String(offset + i).padStart(6, " ")}\t${line}`)
        .join("\n");
      const truncated = offset - 1 + limit < lines.length;
      return {
        output: numbered + (truncated ? `\n... (truncated, ${lines.length} lines total)` : ""),
        isError: false,
      };
    } catch (err) {
      return { output: `Error reading ${resolved}: ${(err as Error).message}`, isError: true };
    }
  },
};
