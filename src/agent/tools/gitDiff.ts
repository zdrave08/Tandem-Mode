import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolDefinition } from "./types.js";

const execFileAsync = promisify(execFile);
const MAX_OUTPUT_CHARS = 30_000;

// Tandem's own session logs and pasted images live under .tandem/ in the working
// directory. They are not part of the user's change, and in repos that don't
// ignore .tandem they would show up as untracked files in every diff.
// `**/` also covers a .tandem in a subdirectory that Tandem was started from earlier.
const SELF_PATHSPECS = [":(exclude,glob)**/.tandem/sessions/**", ":(exclude,glob)**/.tandem/tmp/**"];

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
    const pathspecs = ["--", ...(scopePath ? [scopePath] : []), ...SELF_PATHSPECS];
    const gitArgs = ["diff", ...(staged ? ["--cached"] : []), ...pathspecs];

    try {
      const { stdout } = await execFileAsync("git", gitArgs, { cwd: ctx.cwd, maxBuffer: 10 * 1024 * 1024 });
      if (staged) {
        const output = stdout.length > MAX_OUTPUT_CHARS ? stdout.slice(0, MAX_OUTPUT_CHARS) + "\n... (truncated)" : stdout;
        return { output: output.trim() || "(no changes)", isError: false };
      }

      const { stdout: untracked } = await execFileAsync(
        "git",
        ["ls-files", "--others", "--exclude-standard", "-z", ...pathspecs],
        { cwd: ctx.cwd },
      );
      const files = untracked.split("\0").filter(Boolean);
      const untrackedDiffs = new Array<string>(files.length).fill("");
      let nextFile = 0;
      const worker = async () => {
        while (nextFile < files.length) {
          const index = nextFile++;
          const file = files[index];
          if (!file) {
            continue;
          }
          try {
            await execFileAsync("git", ["diff", "--no-index", "--", "/dev/null", file], {
              cwd: ctx.cwd,
              maxBuffer: 10 * 1024 * 1024,
            });
          } catch (err) {
            untrackedDiffs[index] = (err as { stdout?: string }).stdout ?? "";
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(8, files.length) }, () => worker()),
      );
      const output = [stdout, ...untrackedDiffs].join("");
      const truncated = output.length > MAX_OUTPUT_CHARS ? output.slice(0, MAX_OUTPUT_CHARS) + "\n... (truncated)" : output;
      return { output: truncated.trim() || "(no changes)", isError: false };
    } catch (err) {
      return { output: `git diff error: ${(err as Error).message}`, isError: true };
    }
  },
};
