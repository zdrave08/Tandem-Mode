import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolDefinition } from "./types.js";

const execFileAsync = promisify(execFile);
const MAX_OUTPUT_CHARS = 30_000;

export const gitDiffTool: ToolDefinition = {
  name: "git_diff",
  description: "Show the git diff for the working directory (unstaged changes), optionally for a single path.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Limit the diff to this path." },
      staged: { type: "boolean", description: "Show staged changes (--cached) instead of the working tree." },
    },
    required: [],
  },
  isDestructive: () => false,
  async execute(args, ctx) {
    const staged = Boolean(args["staged"]);
    const scopePath = args["path"] ? String(args["path"]) : undefined;
    const gitArgs = ["diff", ...(staged ? ["--cached"] : []), ...(scopePath ? ["--", scopePath] : [])];

    // Plain `git diff` ne prikazuje potpuno nove (untracked) fajlove.
    // --intent-to-add ih markira u indeksu bez stage-ovanja sadržaja, pa se
    // pojave u diff-u kao dodati fajlovi — bezopasno i reverzibilno.
    try {
      await execFileAsync("git", ["add", "--intent-to-add", "--all", ...(scopePath ? ["--", scopePath] : [])], {
        cwd: ctx.cwd,
      });
    } catch {
      // Nije git repo ili git nije dostupan — poziv ispod će to jasno prijaviti.
    }

    try {
      const { stdout } = await execFileAsync("git", gitArgs, { cwd: ctx.cwd, maxBuffer: 10 * 1024 * 1024 });
      const output = stdout.length > MAX_OUTPUT_CHARS ? stdout.slice(0, MAX_OUTPUT_CHARS) + "\n... (truncated)" : stdout;
      return { output: output.trim() || "(no changes)", isError: false };
    } catch (err) {
      return { output: `git diff error: ${(err as Error).message}`, isError: true };
    }
  },
};
