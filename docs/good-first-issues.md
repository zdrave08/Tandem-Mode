# Good first issues (drafts)

**English** | [Srpski](./good-first-issues.sr.md)

Ready to be posted as GitHub issues. Each is deliberately scoped to be
independent of the others and small enough for a first PR.

---

### 1. `/compact` — manual context compaction

**Problem:** Long sessions accumulate a lot of tool output (full file dumps,
shell output) in `state.messages`. There's no way to shrink that without
starting a fresh session with `/new` and losing context.

**Ask:** Add a `/compact` command that summarizes the current conversation
(one call to the model, asking it to produce a compact summary of what's been
done and decided so far) and replaces `state.messages` with
`[system, summaryAsUserOrSystemMessage]`, keeping the session file going
(append the summary, don't lose the original history on disk).

**Files:** `src/repl/commands.ts`, `src/repl/state.ts`.

---

### 2. `/diff` — show the working-tree diff without invoking the agent

**Problem:** `git_diff` exists as a tool the *agent* can call, but there's no
quick way for the *user* to just see what's changed so far without spending a
turn asking the agent to run it.

**Ask:** A `/diff` REPL command that runs the same logic as
`src/agent/tools/gitDiff.ts` (including the `--intent-to-add` trick for new
files) directly, printing the diff to the terminal — no API call.

**Files:** `src/repl/commands.ts` (new case), can reuse `gitDiffTool.execute`.

---

### 3. `/save-profile` and `/profile` — named config profiles

**Problem:** Config is currently global/project/session only. Someone who
wants two personas (e.g. "fast and cheap" vs. "thorough") has to keep editing
flags or `~/.tandem/config.json` by hand.

**Ask:** `/save-profile <name>` saves the current runtime config (model,
effort, budget, maxReviewLoops) to `~/.tandem/profiles/<name>.json`.
`/profile <name>` loads one into the current session. `/profile` with no
argument lists saved profiles.

**Files:** new `src/config/profiles.ts`, wire into `src/repl/commands.ts`.

---

### 4. Notification hook on task/orchestration completion

**Problem:** `/plan` runs can take a while. There's no way to know it's done
without watching the terminal.

**Ask:** A config option (e.g. `notifyCommand` in `TandemConfig`) that, when
set, runs a shell command (or posts to a webhook URL) when a `/plan`
orchestration finishes — approved, rejected, or hit `max_review_loops`.
Keep it generic (a shell command the user configures) rather than baking in
Slack specifically — a Slack webhook is then just one example in the docs of
what to put there.

**Files:** `src/config/schema.ts`, `src/orchestrator/orchestrate.ts`.

---

### 5. Reviewer should see build/test results, not just the git diff

**Problem:** The reviewer (`src/orchestrator/reviewer.ts`) currently only
gets the original task, the plan, and `git diff`. It can't tell if the change
actually builds or if tests pass — it's judging code shape, not correctness.

**Ask:** Let the orchestrator run a configurable build/test command (e.g. from
`package.json` scripts, or a project-level `.tandem/config.json` field) after
the workers finish, and pass the output to the reviewer alongside the diff.
This is real M4 scope (the benchmark harness needs the same build/test
runner) — worth designing once and reusing in both places.

**Files:** `src/orchestrator/orchestrate.ts`, `src/orchestrator/reviewer.ts`,
`src/config/schema.ts`.

---

### 6. Linux/macOS API key storage

**Problem:** `src/config/credentials.ts` only works on Windows (DPAPI via
PowerShell). We tried a cross-platform library here first (`cross-keychain`)
and dropped it — its backend auto-detection took 15-18 seconds per call on
Windows even with the native binding present and selected, which is an
unacceptable startup delay for a CLI. Direct DPAPI calls are ~500ms instead.

**Ask:** Add `getStoredApiKey`/`setStoredApiKey`/`deleteStoredApiKey`
implementations for macOS (the `security` CLI, which ships with the OS) and
Linux (`libsecret`/`secret-tool`, or a `gnome-keyring` equivalent), following
the same three-function shape. Keep it fast — measure it, the whole reason
this file doesn't use a generic library is that "cross-platform" and "fast on
each platform" turned out to be in tension. `DEEPSEEK_API_KEY` already covers
non-Windows users in the meantime.

**Files:** `src/config/credentials.ts`.
