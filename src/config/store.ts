import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { TandemConfig } from "./schema.js";

function globalConfigPath(): string {
  return path.join(os.homedir(), ".tandem", "config.json");
}

function projectConfigPath(cwd: string): string {
  return path.join(cwd, ".tandem", "config.json");
}

async function readConfigFile(filePath: string): Promise<TandemConfig> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as TandemConfig;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

/** Global < project. Session-level overrides (slash commands) live in the runtime state, not here. */
export async function loadConfig(cwd: string): Promise<TandemConfig> {
  const [global, project] = await Promise.all([
    readConfigFile(globalConfigPath()),
    readConfigFile(projectConfigPath(cwd)),
  ]);
  return { ...global, ...project };
}

export async function saveGlobalConfig(partial: TandemConfig): Promise<void> {
  const filePath = globalConfigPath();
  const existing = await readConfigFile(filePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify({ ...existing, ...partial }, null, 2) + "\n", "utf8");
}
