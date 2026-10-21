import { spawn } from "node:child_process";
import type { ToolDefinition } from "./types.js";

const MAX_OUTPUT_CHARS = 20_000;
const HARD_MAX_BUFFER_CHARS = 5_000_000;
const TIMEOUT_MS = 120_000;

// Konzervativna bela lista — read-only komande koje ne traže odobrenje.
// Sve što ne poklopi ovde se tretira kao destruktivno; bolje suvišno
// pitati nego tiho izvršiti nešto nepovratno.
const SAFE_COMMAND_PATTERNS: RegExp[] = [
  /^git\s+(status|log|diff|show|branch|remote(\s+-v)?)\b/i,
  /^(ls|dir)\b/i,
  /^pwd$/i,
  /^(cat|type)\s+\S/i,
  /^echo\s+/i,
  /^(php|node|npm|pnpm|npx|python|python3)\s+(-v|--version|-l)\b/i,
  /^(which|where)\s+\S/i,
];

export function runShell(
  command: string,
  cwd: string,
  signal?: AbortSignal
): Promise<{ output: string; exitCode: number | null }> {
  const isWindows = process.platform === "win32";
  const exe = isWindows ? "powershell.exe" : "/bin/sh";
  const args = isWindows ? ["-NoProfile", "-NonInteractive", "-Command", command] : ["-c", command];

  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { cwd });
    let output = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`Komanda je prekinuta posle ${TIMEOUT_MS / 1000}s (timeout).`));
    }, TIMEOUT_MS);

    const onAbort = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      const abortError = new Error("Komanda prekinuta (ESC).");
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
        child.kill();
        reject(
          new Error(
            `Komanda je prekinuta jer je izlaz premašio ${HARD_MAX_BUFFER_CHARS} karaktera (verovatno čita binarne/velike fajlove umesto teksta).`
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
    "Izvrši komandu u sistemskoj školjki (PowerShell na Windows-u, sh na Linux/macOS) u radnom direktorijumu.",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "Komanda za izvršavanje." },
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
      const truncated = output.length > MAX_OUTPUT_CHARS ? output.slice(0, MAX_OUTPUT_CHARS) + "\n... (isečeno)" : output;
      return {
        output: `[exit code ${exitCode}]\n${truncated || "(nema izlaza)"}`,
        isError: exitCode !== 0,
      };
    } catch (err) {
      return { output: `Greška pri izvršavanju komande: ${(err as Error).message}`, isError: true };
    }
  },
};
