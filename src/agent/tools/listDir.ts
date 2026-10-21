import { readdir } from "node:fs/promises";
import path from "node:path";
import type { ToolDefinition } from "./types.js";

export const listDirTool: ToolDefinition = {
  name: "list_dir",
  description: "List the contents of a directory (non-recursive).",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the directory. Defaults to the working directory." },
    },
    required: [],
  },
  isDestructive: () => false,
  async execute(args, ctx) {
    const dirPath = String(args["path"] ?? ".");
    const resolved = path.resolve(ctx.cwd, dirPath);

    try {
      const entries = await readdir(resolved, { withFileTypes: true });
      const lines = entries
        .map((e) => `${e.isDirectory() ? "d" : "-"} ${e.name}`)
        .sort();
      return { output: lines.join("\n") || "(empty)", isError: false };
    } catch (err) {
      return { output: `Error listing ${resolved}: ${(err as Error).message}`, isError: true };
    }
  },
};
