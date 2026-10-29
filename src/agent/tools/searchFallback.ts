import { open, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Built-in content search, used when ripgrep (`rg`) is not installed. It covers what the agent
 * needs (regex, glob filter, case folding, line numbers) with no external dependency, but it is
 * simpler than ripgrep: only a fixed list of folders is skipped, `.gitignore` is not read.
 */

const SKIP_DIRS = new Set([".git", "node_modules", "bin", "obj", "dist", ".vs", ".idea", ".tandem", "packages", ".next", "build"]);
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_MATCHES_PER_FILE = 200;
const MAX_MATCHES_TOTAL = 500;
const MAX_LINE_CHARS = 300;
const DEADLINE_MS = 25_000;

/** Expands `{a,b}` groups (not nested), so `*.{ts,tsx}` becomes two patterns. */
function expandBraces(glob: string): string[] {
  const m = /\{([^{}]*)\}/.exec(glob);
  if (!m) return [glob];
  const [whole, inner] = [m[0], m[1] ?? ""];
  return inner.split(",").flatMap((alt) => expandBraces(glob.replace(whole, alt)));
}

function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i] as string;
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // `**/` matches any number of folders, including none; a bare `**` matches anything.
        if (glob[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 2;
        } else {
          re += ".*";
          i += 1;
        }
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${re}$`, "i");
}

/** A glob without a slash matches the file name anywhere (like ripgrep); one with a slash matches the relative path. */
function buildGlobMatcher(glob: string | undefined): (relPath: string) => boolean {
  if (!glob) return () => true;
  const matchers = expandBraces(glob).map((g) => ({ re: globToRegExp(g.replace(/^\.\//, "")), hasSlash: g.includes("/") }));
  return (relPath) => {
    const base = relPath.slice(relPath.lastIndexOf("/") + 1);
    return matchers.some((m) => m.re.test(m.hasSlash ? relPath : base));
  };
}

async function looksBinary(file: string): Promise<boolean> {
  const handle = await open(file, "r");
  try {
    const buf = Buffer.alloc(8000);
    const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
    return buf.subarray(0, bytesRead).includes(0);
  } finally {
    await handle.close();
  }
}

export interface FallbackResult {
  output: string;
  isError: boolean;
}

export async function searchFallback(opts: {
  cwd: string;
  searchPath: string;
  pattern: string;
  glob?: string | undefined;
  caseInsensitive: boolean;
  signal?: AbortSignal | undefined;
}): Promise<FallbackResult> {
  let regex: RegExp;
  try {
    regex = new RegExp(opts.pattern, opts.caseInsensitive ? "i" : "");
  } catch (err) {
    return { output: `Invalid regex: ${(err as Error).message}`, isError: true };
  }

  const root = path.resolve(opts.cwd, opts.searchPath);
  let rootStat;
  try {
    rootStat = await stat(root);
  } catch (err) {
    return { output: `Search error: ${(err as Error).message}`, isError: true };
  }

  const matchesGlob = buildGlobMatcher(opts.glob);
  const deadline = Date.now() + DEADLINE_MS;
  const out: string[] = [];
  let timedOut = false;
  let capped = false;

  const rel = (file: string): string => path.relative(opts.cwd, file).split(path.sep).join("/");

  async function searchFile(file: string): Promise<void> {
    const relPath = rel(file);
    if (!matchesGlob(relPath)) return;
    try {
      const size = (await stat(file)).size;
      if (size > MAX_FILE_BYTES || (await looksBinary(file))) return;
      const text = await readFile(file, "utf8");
      const lines = text.split(/\r\n|\n/);
      let inFile = 0;
      for (let i = 0; i < lines.length; i++) {
        if (!regex.test(lines[i] as string)) continue;
        const line = (lines[i] as string).trim();
        out.push(`${relPath}:${i + 1}:${line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS)}…` : line}`);
        if (++inFile >= MAX_MATCHES_PER_FILE) break;
        if (out.length >= MAX_MATCHES_TOTAL) {
          capped = true;
          return;
        }
      }
    } catch {
      // Unreadable or vanished file: skip it, the same as ripgrep does.
    }
  }

  async function walk(dir: string): Promise<void> {
    if (capped || timedOut) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      if (opts.signal?.aborted || capped) return;
      if (Date.now() > deadline) {
        timedOut = true;
        return;
      }
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) await walk(full);
      } else if (e.isFile()) {
        await searchFile(full);
      }
    }
  }

  if (rootStat.isFile()) await searchFile(root);
  else await walk(root);

  const notes = [
    "(ripgrep is not installed; used the built-in search: .gitignore is not applied)",
    ...(capped ? [`(stopped after ${MAX_MATCHES_TOTAL} matches; narrow the pattern, path or glob)`] : []),
    ...(timedOut ? ["(stopped after 25s; narrow the path or glob)"] : []),
  ];
  const body = out.length > 0 ? out.join("\n") : "(no matches)";
  return { output: `${body}\n${notes.join("\n")}`, isError: false };
}
