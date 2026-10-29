import { spawn, type ChildProcess } from "node:child_process";
import type { ToolDefinition } from "./types.js";

const MAX_OUTPUT_CHARS = 20_000;
const HARD_MAX_BUFFER_CHARS = 5_000_000;
const TIMEOUT_MS = 120_000;

// Conservative allowlist: read-only commands that do not need approval.
// Anything that does not match here is treated as destructive; better to ask
// needlessly than to silently run something irreversible.
const SAFE_COMMAND_PATTERNS: RegExp[] = [
  /^git\s+(status|log|diff|show|branch|remote(\s+-v)?)\b/i,
  /^(ls|dir)\b/i,
  /^pwd$/i,
  /^(cat|type)\s+\S/i,
  /^echo\s+/i,
  /^(php|node|npm|pnpm|npx|python|python3)\s+(-v|--version|-l)\b/i,
  /^(which|where)\s+\S/i,
];

export interface RunShellOptions {
  /** Extra environment variables, merged over the current process environment. */
  env?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * `child.kill()` only stops the shell itself; a command it started (node, curl, ...)
 * keeps running and keeps the pipes open, which holds the whole CLI process open
 * after a timeout or abort. On Windows the whole process tree is killed, and on every
 * platform the pipes are closed so nothing keeps the event loop alive.
 */
function terminate(child: ChildProcess): void {
  if (child.pid !== undefined && process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" }).on("error", () => {});
  } else {
    child.kill();
  }
  child.stdout?.destroy();
  child.stderr?.destroy();
}

export function runShell(
  command: string,
  cwd: string,
  signal?: AbortSignal,
  options: RunShellOptions = {}
): Promise<{ output: string; exitCode: number | null }> {
  const isWindows = process.platform === "win32";
  const exe = isWindows ? "powershell.exe" : "/bin/sh";
  const args = isWindows ? ["-NoProfile", "-NonInteractive", "-Command", command] : ["-c", command];
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { cwd, ...(options.env ? { env: { ...process.env, ...options.env } } : {}) });
    let output = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      terminate(child);
      reject(new Error(`Command aborted after ${timeoutMs / 1000}s (timeout).`));
    }, timeoutMs);

    const onAbort = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      terminate(child);
      const abortError = new Error("Command aborted (ESC).");
      abortError.name = "AbortError";
      reject(abortError);
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    const onData = (chunk: Buffer): void => {
      if (settled) return;
      output += chunk.toString("utf8");
      if (output.length > HARD_MAX_BUFFER_CHARS) {
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        terminate(child);
        reject(
          new Error(
            `Command aborted because its output exceeded ${HARD_MAX_BUFFER_CHARS} characters (probably reading binary/large files instead of text).`
          )
        );
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(err);
    });
    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve({ output, exitCode });
    });
  });
}

export const shellTool: ToolDefinition = {
  name: "shell",
  description:
    "Run a command in the system shell (PowerShell on Windows, sh on Linux/macOS) in the working directory.",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "Command to run." },
    },
    required: ["command"],
  },
  isDestructive(args) {
    const command = String(args["command"] ?? "").trim();
    return !SAFE_COMMAND_PATTERNS.some((p) => p.test(command));
  },
  async execute(args, ctx) {
    const command = String(args["command"] ?? "");
    try {
      const { output, exitCode } = await runShell(command, ctx.cwd, ctx.signal);
      const truncated = output.length > MAX_OUTPUT_CHARS ? output.slice(0, MAX_OUTPUT_CHARS) + "\n... (truncated)" : output;
      return {
        output: `[exit code ${exitCode}]\n${truncated || "(no output)"}`,
        isError: exitCode !== 0,
      };
    } catch (err) {
      return { output: `Error running command: ${(err as Error).message}`, isError: true };
    }
  },
};
