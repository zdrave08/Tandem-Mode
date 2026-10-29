import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir } from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);
const MAX_FILES = 300;

async function listViaGit(cwd: string): Promise<string[] | null> {
  try {
    const { stdout } = await execFileAsync("git", ["ls-files"], { cwd, maxBuffer: 10 * 1024 * 1024 });
    return stdout.split("\n").filter(Boolean);
  } catch {
    return null;
  }
}

async function listViaFs(cwd: string): Promise<string[]> {
  const results: string[] = [];
  async function walk(dir: string): Promise<void> {
    if (results.length >= MAX_FILES) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= MAX_FILES) return;
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        results.push(path.relative(cwd, full));
      }
    }
  }
  await walk(cwd);
  return results;
}

/** A byte-for-byte stable string until the repo content changes; part of the fixed prefix for worker calls. */
export async function buildRepoMap(cwd: string): Promise<string> {
  const files = (await listViaGit(cwd)) ?? (await listViaFs(cwd));
  const truncated = files.length > MAX_FILES;
  const listed = files.slice(0, MAX_FILES).sort();
  return (
    listed.join("\n") + (truncated ? `\n... (truncated, ${files.length} files in total)` : "")
  );
}
