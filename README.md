# Tandem Mode

[![npm version](https://img.shields.io/npm/v/tandem-mode.svg)](https://www.npmjs.com/package/tandem-mode)
[![license](https://img.shields.io/npm/l/tandem-mode.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/tandem-mode.svg)](./package.json)
[![good first issues](https://img.shields.io/github/issues/zdrave08/Tandem-Mode/good%20first%20issue)](https://github.com/zdrave08/Tandem-Mode/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)

**English** | [Srpski](./README.sr.md)

A terminal coding agent built specifically for the DeepSeek API — not a generic
LLM harness with DeepSeek bolted on. Interactive REPL, planner/worker/reviewer
orchestration, cache-aware prompt architecture, and first-class support for
Windows, macOS, and Linux.

> **Independent open-source project. Not affiliated with or endorsed by
> DeepSeek.**

## Status

M0–M4 of the [development plan](./deepseek-cli-development-plan.md) are done.
Published on npm, usable today for real coding tasks against a local repo.

First benchmark run is in — see [full results](./docs/benchmark-results.md).
Headline: all three configurations (Pro-only, Flash-only, orchestration)
fixed 4/4 injected bugs correctly in a real WooCommerce plugin, with a clean
`php -l` and zero unnecessary file changes. But for this class of task
(single-file, well-scoped fixes), orchestration cost ~9.5× more and took
~19× longer than Pro-only for the same correctness — the opposite of what
you'd want orchestration for. Read as: orchestration's overhead needs a
bigger, more decomposable task to pay for itself, which this first run didn't
test. Reported as-is, not adjusted to fit expectations.

## Features

- **Agentic loop** — `deepseek-v4-pro`/`deepseek-v4-flash` with tool calling:
  `read_file`, `list_dir`, `search`, `edit`, `git_diff`, `shell`, `view_image`,
  `web_search`. `list_dir` can return a nested tree (`depth` up to 3) in one call,
  and `search` uses ripgrep when it is installed and a built-in search when not,
  so nothing extra has to be installed.
- **Resilient API calls** — connection drops, timeouts, `429` and `5xx` are
  retried up to 3 times with backoff (the status line shows the retry); other
  errors surface at once, with the underlying cause (e.g. `ECONNRESET`) and a
  note that the session is saved.
- **Two entry points** — interactive REPL for normal work, single-shot mode
  (`tandem "task" --yes`) for scripting and CI.
- **Orchestration** (`/plan`) — a planner produces a JSON task list, workers
  execute each task with a fresh minimal context, a reviewer checks the git
  diff against the original task and either approves or requests corrections
  (capped by `max_review_loops`).
- **Cache-aware prompts** — the worker's system prompt + repo map + plan stay
  byte-identical across calls in one orchestration run, so DeepSeek's context
  cache actually hits. Measured live: cache-hit tokens grew call over call
  within a single `/plan` run.
- **Vision** — `view_image` lets the agent look at a screenshot you point it
  to; `/paste` grabs an image straight from the clipboard (Windows, macOS,
  and Linux via X11/`xclip` or Wayland/`wl-clipboard`).
- **Web search** — isolated calls to DeepSeek's Responses API when the agent
  needs something outside the repo (an error message, a library's docs).
- **Session persistence** — every session is a JSONL file; `/resume` continues
  the latest (or a named) one, `/fork` branches off without touching the
  original.
- **Safety** — destructive actions (file edits, shell commands not on a small
  read-only allowlist) always ask for confirmation. A shell command skips the
  prompt only if every part of it (`;`, `&&`, `|`) is read-only, and never with a
  redirection, backticks, `$(...)` or a `{ }` block. `y`/`n`/`a` where `a`
  remembers the choice for that tool for the rest of the session. `--yes`
  bypasses this for CI but always prints what it auto-approved.
- **Cost control** — usage is read only from the API's own `usage` field,
  never estimated. A budget (`/budget`, `--budget`) hard-stops the loop before
  the next API call if exceeded, without losing the session. `/usage` also
  shows what the session would have cost off-peak, and the REPL warns you at
  startup if you're currently in a peak-pricing window.
- **Status line** — the last line of every turn shows model, mode (chat/plan),
  cost (and budget), and the current call out of the iteration limit; it turns
  yellow, then red, as you approach the budget or the limit.
- **Readable tool output** — `edit` shows a red/green diff, `read_file`, `search`
  and `list_dir` collapse to a one-line summary (`120 lines read`, `no matches`).
- **Approval menu** — in a terminal, an action that needs approval opens a boxed
  prompt (the diff for an edit, the full command for the shell) with *Yes / Yes,
  don't ask again for this tool / No*. Pick with ↑/↓ and Enter, with `1`–`3`, or
  with `y` / `a` / `n`; Esc denies. Turns are separated by a rule and the next
  prompt is a plain `❯` line with history (↑/↓). With piped input the old `y/n/a`
  line prompt is used.
- **ESC to interrupt** — cancels the in-flight call (and any running shell
  command) cleanly, keeping whatever was generated so far.
- **Cross-platform** — the shell tool runs PowerShell natively on Windows and
  `sh` on macOS/Linux, file edits preserve the original CRLF/LF line ending
  style, paths are handled with `path.resolve` throughout.

## Quick start

```bash
npm install -g tandem-mode
tandem            # interactive REPL
tandem "explain what this repo does" --yes   # one-shot
```

Or from source (useful for contributing, or to track `main` instead of the
latest npm release):

```bash
git clone https://github.com/zdrave08/Tandem-Mode.git
cd Tandem-Mode
pnpm install
pnpm dev            # interactive REPL
pnpm dev "explain what this repo does" --yes   # one-shot
```

On first run you'll be asked for a DeepSeek API key (get one at
[platform.deepseek.com](https://platform.deepseek.com)) and a default
model/reasoning effort. The key is stored in your OS's own secure credential
store — never in a config file or log:

- **Windows** — DPAPI-encrypted (tied to your OS user account) in
  `%LOCALAPPDATA%\TandemMode\credentials.dat`.
- **macOS** — the login Keychain, via the built-in `security` CLI.
- **Linux** — the Secret Service (gnome-keyring, KWallet, or similar), via
  `secret-tool` (install `libsecret-tools` if it's missing).

`DEEPSEEK_API_KEY` works everywhere and always takes priority, for CI use.

## Usage

```bash
tandem                              # interactive REPL
tandem "fix the off-by-one in foo.ts"
tandem --plan "add dark mode to the settings page"
tandem "task" --model deepseek-v4-flash --effort low --budget 0.50 --yes
```

| Flag | Effect |
|---|---|
| `--resume` / `-r` | Continue the latest session in this directory |
| `--yes` / `-y` | Auto-approve destructive actions (prints what it approved) |
| `--plan` | Run planner/worker/reviewer orchestration instead of a single turn |
| `--model` | `deepseek-v4-pro` or `deepseek-v4-flash` |
| `--effort` | `low`, `high`, or `max` reasoning effort |
| `--budget` | Hard USD cap for the run |
| `--max-review-loops` | Cap on orchestration correction cycles (default 3) |
| `--max-iterations` | Model calls per chunk of a turn (default 25); at the limit the agent asks whether to continue |
| `--auto-continue` | Continue at the iteration limit without asking — only together with a budget (`--budget`) |

### REPL commands

| Command | Effect |
|---|---|
| `/plan <task>` | Planner/worker/reviewer orchestration |
| `/model [name]` | Show or switch model |
| `/thinking [on\|off]` | Toggle thinking mode |
| `/effort [low\|high\|max]` | Show or set reasoning effort |
| `/status` | Current session/settings |
| `/diff [--staged] [path]` | Working-tree diff, no API call |
| `/usage` | Tokens, cost, off-peak projection |
| `/budget [amount]` | Show or set the session budget |
| `/new` | Start a fresh session |
| `/save-profile <name>` | Save model, effort, budget and review loops as a named profile |
| `/profile [name]` | Load a saved profile, or list them |
| `/compact` | Summarize the history into a new session to free up context; the old session stays on disk |
| `/fork` | New session, carrying over the current history |
| `/resume [id]` | Continue the latest (or a named) session |
| `/paste [message]` | Send a clipboard image to the agent |
| `/clear` | Clear the screen |
| `/help` | This list |
| `/exit` | Quit |

Press **ESC** at any time during a turn to interrupt it.

## Architecture

```
tandem (no args)  ─┬─> interactive REPL ─┬─> single turn: agent loop (tools)
                    │                     └─> /plan: planner → worker(s) → reviewer
tandem "task"     ──┘   (single-shot, same agent loop, for scripts/CI)
```

- `src/deepseek/` — thin client for DeepSeek's OpenAI-compatible API
  (streaming + non-streaming chat completions, vision, web search via
  Responses API). See [`docs/api-notes.en.md`](./docs/api-notes.en.md)
  (Serbian original: [`docs/api-notes.md`](./docs/api-notes.md)) for the
  API behavior this is built against, verified live rather than assumed.
- `src/agent/` — the tool-calling loop, tool implementations, session
  persistence, usage/cost tracking.
- `src/orchestrator/` — planner/worker/reviewer, repo-map generation, the
  cache-aware stable-prefix construction.
- `src/repl/` — slash commands, runtime config, the first-run wizard.
- `src/cli.tsx` — Ink-based terminal UI and the REPL/single-shot entry points.

## Configuration

Layered: **session** (in-REPL commands) > **project** (`.tandem/config.json`
in the current directory) > **global** (`~/.tandem/config.json`).

```json
{
  "defaultModel": "deepseek-v4-pro",
  "defaultReasoningEffort": "high",
  "budgetUsd": 5,
  "maxReviewLoops": 3,
  "maxIterations": 25,
  "autoContinue": false,
  "verifyCommand": "pnpm typecheck && pnpm test",
  "notifyCommand": "curl -s -d \"Tandem: $TANDEM_OUTCOME\" https://ntfy.sh/my-topic",
  "language": "en"
}
```

`maxIterations` is how many model calls one turn may make before Tandem stops and
asks "continue for N more calls? (y/n/a)"; `a` remembers the answer for the rest of
the session. With `autoContinue` (or `--auto-continue`) it continues on its own, but
only when a budget is set, because the budget is the hard stop before the next API
call. In non-interactive runs (`--yes`) without `--auto-continue` it stops instead of
waiting for an answer, and the session is saved so you can send "continue".

`verifyCommand` runs before each `/plan` review round and its result goes to
the reviewer. `language` is the UI language (`en` or `sr`, default `en`); the
`--lang` flag and the `TANDEM_LANG` environment variable override it, in that
order. The first-run wizard asks for it.

`notifyCommand` runs when a `/plan` run ends: reviewer approved, `max_review_loops`
reached, or an error (not when you interrupt it with ESC). The details come in as
environment variables, never spliced into the command text: `TANDEM_OUTCOME`
(`approved`, `max_review_loops` or `error`), `TANDEM_TASK`, `TANDEM_NOTES` (the
reviewer's notes, or the error message), `TANDEM_REVIEW_LOOPS` and `TANDEM_COST_USD`.
The command runs in your shell (PowerShell on Windows, `sh` elsewhere) with a 15 s
limit, and a failure only prints a warning. Any shell command works, so Slack,
ntfy, a desktop notification or a webhook are all just examples:

```json
{ "notifyCommand": "curl -s -d \"Tandem: $TANDEM_OUTCOME\" https://ntfy.sh/my-topic" }
```

On Windows (PowerShell) the variables are written `$env:TANDEM_OUTCOME`.

Like `verifyCommand`, `notifyCommand` runs without asking, so only put it in a
project's `.tandem/config.json` if you trust that project.

**Profiles:** `/save-profile <name>` stores the current model, reasoning effort,
budget and review loops in `~/.tandem/profiles/<name>.json`, and `/profile <name>`
loads them back into the running session (only the fields present in the file are
applied). `/profile` alone lists the saved ones. Names use `a-z`, `0-9`, `-` and `_`.
Profiles never include `verifyCommand` or the API key.

The API key is never stored in these files — it lives in the OS credential
store (or `DEEPSEEK_API_KEY` env var, which takes priority, for CI use).

## Development

See [CONTRIBUTING.md](./CONTRIBUTING.md).

```bash
pnpm install
pnpm typecheck
pnpm dev "some task"
```

## Disclaimer

This is an independent, community-run project. It is not affiliated with,
endorsed by, or sponsored by DeepSeek.

## License

[MIT](./LICENSE)
