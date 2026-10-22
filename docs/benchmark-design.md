# Benchmark design (M4)

**English** | [Srpski](./benchmark-design.sr.md)

**Status:** built and run once — see [`benchmark-results.md`](./benchmark-results.md)
for the actual numbers. This document stays as the design rationale; what's
below under "still open" is what a *second, larger* run should add.

## Goal

Test the hypothesis from the plan (section 7): does orchestration
(Pro planner + Flash workers + Pro reviewer) keep most of Pro-only's quality
at meaningfully lower Pro-token cost? This is **not asserted anywhere** until
this benchmark actually shows it — see plan section 7.

## The three configurations

Same task set run three ways:

1. **Pro-only** — `deepseek-v4-pro`, no orchestration, single agent loop.
2. **Flash-only** — `deepseek-v4-flash`, no orchestration, single agent loop.
3. **Orchestration** — `/plan`, as built in M3.

## The 12 measurement dimensions (spec point 30)

| # | Dimension | How it's measured |
|---|---|---|
| 1 | Completion | Did the agent produce a final answer, or hit `max_iterations_reached` / `budget_exceeded` / an unrecoverable error? |
| 2 | Correctness | Does `verify` (task-defined check command) exit 0 against the resulting diff? |
| 3 | Build | Does the task's `build` command (if any) succeed? |
| 4 | Test | Does the task's `test` command (if any) pass? |
| 5 | Unnecessary changes | Files touched outside what the task's acceptance criteria implies — diffed against a human-reviewed "expected files" list per task |
| 6 | Failed attempts | Count of `tool_call_result` events with `isError: true` |
| 7 | Self-correction | A failed attempt followed by a successful retry of a related action, before giving up |
| 8 | Architecture | Qualitative — not automatable. Scored by manual review (or a separate LLM-judge pass) of the diff's design quality, not by the harness itself |
| 9 | Tokens | From `UsageAccumulator.totals()` — real API `usage` fields, never estimated |
| 10 | Requests | `UsageAccumulator.callCount` |
| 11 | Cost | `UsageAccumulator.estimatedCostUsd()`, plus the off-peak equivalent for context |
| 12 | Time | Wall-clock duration of the run |

Dimensions 1–4, 6, 9–12 are directly automatable from what the agent loop
and usage accumulator already expose. Dimension 5 needs a per-task "expected
files" annotation to compare against. Dimension 7 needs a small heuristic
(same tool name + same or overlapping args, error then success, within N
iterations of each other). Dimension 8 is deliberately left manual/qualitative
— an automated score there would just be noise dressed up as data.

## Task format (planned shape for `src/benchmark/types.ts`)

```ts
interface BenchmarkTask {
  id: string;
  description: string;      // the prompt given to the agent
  expectedFiles: string[];  // for dimension 5
  setup?: string;           // shell command to reset the target repo to baseline
  build?: string;           // e.g. "php -l %file%" or "npm run build"
  test?: string;            // e.g. "npm test"
  verify: string;           // exits 0 if the task's goal was actually achieved
}
```

## What's still open for a second run

Run 1 used four small, single-file bugs against `bulk-price-wizard`
(a real, private WooCommerce plugin — see `docs/benchmark-results.md`). To
actually stress-test the orchestration hypothesis rather than just exercise
the harness, a follow-up run should add:

- **Larger, genuinely multi-file tasks** — something that plausibly benefits
  from decomposition (e.g. "add a new filter option end-to-end: DTO, query,
  UI, validation"), since run 1's single-line bugs gave orchestration nothing
  to parallelize and only measured its coordination overhead.
- **More tasks per class** (run 1 had one task per bug type) for the
  cost/time numbers to be less anecdotal.
- **A real build/test dimension** — this target has no PHPUnit setup, so
  "test" was `null` for every run in round 1. A target (or fixture) with
  actual tests would make dimensions 3–4 meaningful instead of `php -l` only.
- Comparing task sets across *different* target repos, to see how much of
  round 1's result is about task size specifically vs. this particular
  codebase.

## Reporting

Whatever the numbers say goes in the README as-is — plan section 4 in the
master plan is explicit that a negative or mixed result is still credible
data, not a launch blocker.
