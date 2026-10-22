# Good first issues (drafts)

**English** | [Srpski](./good-first-issues.sr.md)

Ready to be posted as GitHub issues. Each is deliberately scoped to be
independent of the others and small enough for a first PR.

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
