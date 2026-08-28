# Tandem Mode

[![npm version](https://img.shields.io/npm/v/tandem-mode.svg)](https://www.npmjs.com/package/tandem-mode)
[![license](https://img.shields.io/npm/l/tandem-mode.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/tandem-mode.svg)](./package.json)
[![good first issues](https://img.shields.io/github/issues/zdrave08/Tandem-Mode/good%20first%20issue)](https://github.com/zdrave08/Tandem-Mode/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)

**English** | [Srpski](./README.sr.md)

A terminal coding agent built specifically for the DeepSeek API — not a generic
LLM harness with DeepSeek bolted on. Interactive REPL, planner/worker/reviewer
orchestration, cache-aware prompt architecture, and Windows-first from the
start.

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
  `web_search`.
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
  to; `/paste` grabs an image from the system clipboard. Windows uses
  PowerShell/.NET, Linux requires `xclip`, and macOS uses `pngpaste` with an
  `osascript` fallback when `pngpaste` is absent.
- **Web search** — isolated calls to DeepSeek's Responses API when the agent
  needs something outside the repo (an error message, a library's docs).
- **Session persistence** — every session is a JSONL file; `/resume` continues
  the latest (or a named) one, `/fork` branches off without touching the
  original.
- **Safety** — destructive actions (file edits, shell commands not on a small
  read-only allowlist) always ask for confirmation; `y`/`n`/`a` where `a`
  remembers the choice for that tool for the rest of the session. `--yes`
  bypasses this for CI but always prints what it auto-approved.
- **Cost control** — usage is read only from the API's own `usage` field,
  never estimated. A budget (`/budget`, `--budget`) hard-stops the loop before
  the next API call if exceeded, without losing the session. `/usage` also
  shows what the session would have cost off-peak, and the REPL warns you at
  startup if you're currently in a peak-pricing window.
- **ESC to interrupt** — cancels the in-flight call (and any running shell
  command) cleanly, keeping whatever was generated so far.
- **Windows-first** — the shell tool runs PowerShell natively, file edits
  preserve the original CRLF/LF line ending style, paths are handled with
  `path.resolve` throughout.

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
model/reasoning effort. On Windows the key is stored DPAPI-encrypted
(tied to your OS user account, same protection Credential Manager itself
relies on) in `%LOCALAPPDATA%\TandemMode\credentials.dat` — never in a
config file or log. Linux/macOS storage isn't implemented yet (`DEEPSEEK_API_KEY`
works everywhere in the meantime) — see good-first-issues.

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

### REPL commands

| Command | Effect |
|---|---|
| `/plan <task>` | Planner/worker/reviewer orchestration |
| `/model [name]` | Show or switch model |
| `/thinking [on\|off]` | Toggle thinking mode |
| `/effort [low\|high\|max]` | Show or set reasoning effort |
| `/status` | Current session/settings |
| `/usage` | Tokens, cost, off-peak projection |
| `/budget [amount]` | Show or set the session budget |
| `/new` | Start a fresh session |
| `/fork` | New session, carrying over the current history |
| `/resume [id]` | Continue the latest (or a named) session |
| `/paste [message]` | Send a clipboard image to the agent (PowerShell/.NET, `xclip`, or `pngpaste`/`osascript` by platform) |
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
  "maxReviewLoops": 3
}
```

The API key is never stored in these files — it lives DPAPI-encrypted on
Windows (or `DEEPSEEK_API_KEY` env var, which takes priority, for CI use).

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
