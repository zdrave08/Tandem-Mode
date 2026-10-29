import { readdir } from "node:fs/promises";
import path from "node:path";
import type { ToolDefinition } from "./types.js";

const MAX_DEPTH = 3;
const MAX_ENTRIES = 500;

// Folders that are almost never what the agent is looking for and can hold thousands of entries.
// Only skipped below the top level, so listing one of them directly still works.
const NOISE_DIRS = new Set([".git", "node_modules", "bin", "obj", "dist", ".vs", ".idea", ".tandem", "packages"]);

interface Walk {
  lines: string[];
  skipped: Set<string>;
  more: number;
}

async function walk(dir: string, level: number, maxDepth: number, state: Walk): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  // Same ordering as the flat listing: sorted by the rendered "d name" / "- name" key.
  const sorted = entries
    .map((e) => ({ e, key: `${e.isDirectory() ? "d" : "-"} ${e.name}` }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  for (const { e, key } of sorted) {
    if (state.lines.length >= MAX_ENTRIES) {
      state.more++;
      continue;
    }
    state.lines.push(`${"  ".repeat(level)}${key}`);
    if (!e.isDirectory() || level + 1 >= maxDepth) continue;
    if (NOISE_DIRS.has(e.name)) {
      state.skipped.add(e.name);
      continue;
    }
    try {
      await walk(path.join(dir, e.name), level + 1, maxDepth, state);
    } catch {
      // An unreadable subfolder (permissions, broken link) must not fail the whole listing.
      state.lines.push(`${"  ".repeat(level + 1)}(cannot read)`);
    }
  }
}

export const listDirTool: ToolDefinition = {
  name: "list_dir",
  description:
    `List the contents of a directory. By default only that directory (depth 1). Pass depth 2 or 3 to get a nested tree in ONE call ` +
    `(indented, "d" = directory, "-" = file) instead of listing folder by folder; prefer that for getting an overview of a project. ` +
    `At depth > 1, ${[...NOISE_DIRS].join(", ")} are shown but not entered.`,
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the directory. Defaults to the working directory." },
      depth: {
        type: "integer",
        description: `How many levels to list, 1 to ${MAX_DEPTH}. Defaults to 1.`,
      },
    },
    required: [],
  },
  isDestructive: () => false,
  async execute(args, ctx) {
    const dirPath = String(args["path"] ?? ".");
    const resolved = path.resolve(ctx.cwd, dirPath);
    const requested = Number(args["depth"] ?? 1);
    const depth = Number.isFinite(requested) ? Math.min(MAX_DEPTH, Math.max(1, Math.floor(requested))) : 1;

    try {
      const state: Walk = { lines: [], skipped: new Set(), more: 0 };
      await walk(resolved, 0, depth, state);

      const out = [...state.lines];
      if (state.more > 0) out.push(`... (${state.more} more entries not shown; list a subfolder or lower the depth)`);
      if (depth > 1 && state.skipped.size > 0) out.push(`(not entered: ${[...state.skipped].sort().join(", ")})`);
      return { output: out.join("\n") || "(empty)", isError: false };
    } catch (err) {
      return { output: `Error listing ${resolved}: ${(err as Error).message}`, isError: true };
    }
  },
};
