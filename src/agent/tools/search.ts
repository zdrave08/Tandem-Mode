import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolDefinition } from "./types.js";

const execFileAsync = promisify(execFile);
const MAX_OUTPUT_CHARS = 20_000;

export const searchTool: ToolDefinition = {
  name: "search",
  description: "Search file contents with a regex pattern using ripgrep (rg).",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regex pattern to search for." },
      path: { type: "string", description: "Directory or file to search. Defaults to the working directory." },
      glob: { type: "string", description: "Optional glob file filter, e.g. '*.ts'." },
      caseInsensitive: { type: "boolean", description: "Case-insensitive search." },
    },
    required: ["pattern"],
  },
  isDestructive: () => false,
  async execute(args, ctx) {
    const pattern = String(args["pattern"] ?? "");
    const searchPath = String(args["path"] ?? ".");
    const glob = args["glob"] ? String(args["glob"]) : undefined;
    const caseInsensitive = Boolean(args["caseInsensitive"]);

    const rgArgs = ["--line-number", "--with-filename", "--max-count", "200"];
    if (caseInsensitive) rgArgs.push("--ignore-case");
    if (glob) rgArgs.push("--glob", glob);
    rgArgs.push("--", pattern, searchPath);

    try {
      const { stdout } = await execFileAsync("rg", rgArgs, { cwd: ctx.cwd, maxBuffer: 10 * 1024 * 1024 });
      const output = stdout.length > MAX_OUTPUT_CHARS ? stdout.slice(0, MAX_OUTPUT_CHARS) + "\n... (truncated)" : stdout;
      return { output: output.trim() || "(no matches)", isError: false };
    } catch (err) {
      const e = err as { code?: string | number; message: string };
      if (e.code === "ENOENT") {
        return {
          output: "ripgrep (rg) is not installed or not on PATH. Install it for the search tool to work.",
          isError: true,
        };
      }
      // rg vraća exit code 1 kad nema poklapanja — to nije greška alata.
      if (e.code === 1) {
        return { output: "(no matches)", isError: false };
      }
      return { output: `Search error: ${e.message}`, isError: true };
    }
  },
};
