# Contributing to Tandem Mode

**English** | [Srpski](./CONTRIBUTING.sr.md)

Thanks for taking a look. This is a small, early-stage project — a solo
side effort turned open-source, not a company product — so process here is
intentionally light.

## Setup

```bash
git clone https://github.com/zdrave08/Tandem-Mode.git
cd Tandem-Mode
pnpm install
cp .env.example .env   # or let `pnpm dev` walk you through the first-run wizard
pnpm typecheck
pnpm dev "read package.json and tell me the version" --yes
```

You'll need a DeepSeek API key ([platform.deepseek.com](https://platform.deepseek.com))
to run anything that actually calls the model.

## Ground rules

- **TypeScript, strict.** `pnpm typecheck` must pass before a PR — no `any`
  escapes without a specific reason, `exactOptionalPropertyTypes` is on.
- **No unverified API behavior.** Anything about the DeepSeek API that isn't
  obvious from a type signature should be checked against a live call or the
  official docs and written down in [`docs/api-notes.md`](./docs/api-notes.md)
  (Serbian, the canonical version) / [`docs/api-notes.en.md`](./docs/api-notes.en.md)
  (English), not assumed from a blog post or another project's code. See
  that file for the format — Status / Nalaz / Izvor / Datum.
- **Windows is first-class**, not an afterthought. If you touch path handling,
  the shell tool, or file I/O, test on Windows or say clearly in the PR that
  you didn't and it needs a check.
- **Safety.** Nothing that mutates files, runs shell commands, or otherwise
  changes state should ever happen silently. If you add a tool, give it a
  correct `isDestructive()` — when in doubt, treat it as destructive.
- **Small PRs.** One thing at a time is easier to review than a redesign.

## Where things live

- `src/deepseek/` — API client (chat completions, vision, web search)
- `src/agent/` — the tool-calling loop, tools, sessions, usage tracking
- `src/orchestrator/` — planner/worker/reviewer
- `src/repl/` — slash commands, runtime state, first-run wizard
- `src/cli.tsx` — Ink UI, REPL and single-shot entry points

## Adding a tool

Look at an existing one first (`src/agent/tools/readFile.ts` is a simple
read-only example, `src/agent/tools/edit.ts` a destructive one). A tool is a
plain object: `name`, `description`, a JSON-schema `parameters`, `isDestructive(args)`,
and `execute(args, ctx)`. Register it in `src/agent/tools/index.ts`.

## Good first issues

Look for the `good first issue` label, or check
[`docs/good-first-issues.md`](./docs/good-first-issues.md) for six scoped
drafts — `/compact`, `/diff`, `/save-profile`/`/profile`, a notification hook
on task completion, the reviewer seeing build/test results (not just the git
diff), and Linux/macOS API key storage are all open. Section 4 of the
[development plan](./deepseek-cli-development-plan.md) (Serbian only — it's
the maintainer's working roadmap, not user-facing docs) has additional context
for the remaining entries.

Browsing and claiming issues is easiest with the
[GitHub CLI](https://cli.github.com/) (`gh`):

```bash
# Windows (winget)
winget install --id GitHub.cli
# macOS
brew install gh
# Linux
# see https://github.com/cli/cli/blob/trunk/docs/install_linux.md

gh auth login
gh issue list --repo zdrave08/Tandem-Mode --label "good first issue"
```

## Reporting bugs / API surprises

If DeepSeek's actual behavior doesn't match what `docs/api-notes.md` says,
that's a genuinely useful bug report even if nothing in the code is wrong —
open an issue with the request/response you saw.

## License

By contributing, you agree your contribution is licensed under the project's
[MIT license](./LICENSE).
