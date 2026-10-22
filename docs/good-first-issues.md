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

### 5. Notification hook on task/orchestration completion

**Problem:** `/plan` runs can take a while. There's no way to know it's done
without watching the terminal.

**Ask:** A config option (e.g. `notifyCommand` in `TandemConfig`) that, when
set, runs a shell command (or posts to a webhook URL) when a `/plan`
orchestration finishes — approved, rejected, or hit `max_review_loops`.
Keep it generic (a shell command the user configures) rather than baking in
Slack specifically — a Slack webhook is then just one example in the docs of
what to put there.

**Files:** `src/config/schema.ts`, `src/orchestrator/orchestrate.ts`.
