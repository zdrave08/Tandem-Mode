/**
 * Decides whether a shell command is read-only and may run without asking.
 *
 * A command is safe only if EVERY part of it is safe. The command is split on `;`, `&&`, `||`
 * and `|`, and each part must start with a known read-only command. Anything that could write
 * or run something hidden makes the whole command "not safe": redirections, backticks,
 * `$(...)`, `{ ... }` blocks, a bare `&`, newlines. Being wrong in this direction only costs an
 * extra approval prompt; being wrong in the other direction would run something silently.
 */

// Read-only commands allowed at the start of a segment.
const SAFE_START: RegExp[] = [
  // git: inspection only. `branch` only in its listing forms, never with a name (which creates/deletes).
  /^git\s+(status|log|diff|show|ls-files|rev-parse)\b/i,
  /^git\s+branch(\s+(-a|-r|-v|-vv|--list|--show-current|--all|--remotes))*$/i,
  /^git\s+remote(\s+-v)?$/i,
  // Unix-style and cmd-style listing/reading.
  /^(ls|dir)\b/i,
  /^pwd$/i,
  /^(cat|type|head|tail|wc|grep|findstr)\s+\S/i,
  /^echo\b/i,
  /^(which|where)\s+\S/i,
  /^(php|node|npm|pnpm|npx|python|python3)\s+(-v|--version|-l)\b/i,
  // PowerShell read-only cmdlets and their aliases.
  /^(Get-ChildItem|gci|Get-Content|gc|Select-String|sls|Get-Item|gi|Get-Location|gl|Test-Path|Resolve-Path|Measure-Object|measure|Get-FileHash)\b/i,
];

// Allowed after a `|`: filters that only reshape their input. (`ForEach-Object` is not here on
// purpose: it needs a `{ }` script block, which is rejected outright.)
const SAFE_PIPE: RegExp[] = [
  ...SAFE_START,
  /^(head|tail|wc|uniq|sort)\b/i,
  /^(Select-Object|select|Sort-Object|Format-Table|ft|Format-List|fl|Out-String|Get-Unique|Group-Object|group|Where-Object|where)\b/i,
];

// `2>&1` just merges stderr into stdout; it is the one redirection that is harmless.
const MERGE_STDERR = /\s*2>&1/g;

// Redirections (> <), backticks, `$(`, braces, and newlines can write files or hide a second command.
// `--output` makes git diff/log/show write a file.
const FORBIDDEN = /[<>`{}\r\n]|\$\(|--output\b/;

export function isReadOnlyCommand(command: string): boolean {
  const cleaned = command.replace(MERGE_STDERR, "").trim();
  if (cleaned === "" || FORBIDDEN.test(cleaned)) return false;

  // Split while keeping the separators, so we know which segments follow a pipe.
  const parts = cleaned.split(/(\|\||&&|;|\|)/);
  let afterPipe = false;
  let sawCommand = false;

  for (const part of parts) {
    const token = part.trim();
    if (token === "|") {
      afterPipe = true;
      continue;
    }
    if (token === "||" || token === "&&" || token === ";") {
      afterPipe = false;
      continue;
    }
    if (token === "") {
      // An empty piece is fine at the very end ("cmd;"), but not between pipes ("a | | b").
      continue;
    }
    // A lone `&` (background / PowerShell call operator) is never safe.
    if (/(^|[^&])&([^&]|$)/.test(token)) return false;
    const allowed = afterPipe ? SAFE_PIPE : SAFE_START;
    if (!allowed.some((p) => p.test(token))) return false;
    sawCommand = true;
  }
  return sawCommand;
}
