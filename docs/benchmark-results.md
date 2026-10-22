# Benchmark results — run 1

**English** | [Srpski](./benchmark-results.sr.md)

**Date:** 2026-08-27
**Target:** `bulk-price-wizard` — a real WooCommerce plugin (~1.6 MB,
no build tooling, no test suite) not yet public. Benchmarked against a
dedicated local copy, never the maintainer's working repository.

**Method:** four known bugs deliberately injected into a clean baseline
commit (SWE-bench style — real codebase, precise/reproducible bug, objective
verify script), each run against all three configurations. Verification is a
standalone PHP script per task (see `src/benchmark/fixtures/bulk-price-wizard/`)
that requires the plugin's own classes directly, with minimal WP/WC stubs —
no bug leakage: the agent never sees the verify script, only the task
description.

## Headline result

**All 12 runs (4 tasks × 3 configurations) fixed the bug correctly, with a
clean `php -l` and zero unnecessary file changes.** On correctness, there is
no difference between Pro-only, Flash-only, and orchestration for this class
of task.

The differentiator is cost and time — and it goes the opposite direction
from the plan's hypothesis (section 7):

| Configuration | Total cost | Total time | Total requests | Failed attempts |
|---|---|---|---|---|
| **Pro-only** | **$0.0122** | **44s** | 16 | **0** |
| Flash-only | $0.0090 | 77s | 29 | 8 |
| Orchestration | $0.1157 | 844s (14 min) | 92 | 28 |

Orchestration cost **~9.5×** Pro-only and **~19×** more wall-clock time, for
identical correctness, on every single task in this set.

## Per-task detail

| Task | Config | Correct | Build | Requests | Failed attempts | Cost | Time |
|---|---|---|---|---|---|---|---|
| money-rounding | pro-only | ✅ | ✅ | 4 | 0 | $0.0024 | 12.2s |
| money-rounding | flash-only | ✅ | ✅ | 7 | 3 | $0.0013 | 23.1s |
| money-rounding | orchestration | ✅ | ✅ | 22 | 6 | $0.0143 | 115.7s |
| percent-decrease | pro-only | ✅ | ✅ | 4 | 0 | $0.0034 | 9.9s |
| percent-decrease | flash-only | ✅ | ✅ | 4 | 0 | $0.0012 | 6.4s |
| percent-decrease | orchestration | ✅ | ✅ | 25 | 9 | $0.0465 | 325.7s |
| min-price-guard | pro-only | ✅ | ✅ | 4 | 0 | $0.0038 | 13.1s |
| min-price-guard | flash-only | ✅ | ✅ | 12 | 4 | $0.0053 | 38.2s |
| min-price-guard | orchestration | ✅ | ✅ | 28 | 8 | $0.0445 | 323.7s |
| validator-percent-cap | pro-only | ✅ | ✅ | 4 | 0 | $0.0026 | 9.2s |
| validator-percent-cap | flash-only | ✅ | ✅ | 6 | 1 | $0.0012 | 9.6s |
| validator-percent-cap | orchestration | ✅ | ✅ | 17 | 5 | $0.0104 | 78.4s |

Raw JSON: [`benchmark-results-2026-08-27.json`](./benchmark-results-2026-08-27.json).

## What this means for the plan's hypothesis

Plan section 7: *"Orkestracija zadržava većinu ili sav kvalitet Pro-only
pristupa uz značajno manju potrošnju Pro tokena."*

**Half confirmed, half refuted, for this task size class.** Quality (measured
as correctness — did the bug actually get fixed) is fully kept: 4/4 for every
configuration. But cost is not reduced — it's the opposite, by close to an
order of magnitude, and by a much larger margin in wall-clock time. Pro-only
was also cheaper than Flash-only on two of four tasks, because Pro's fewer
failed attempts (0 across the board) more than offset its higher per-token
price.

**Reading, not yet proven:** these are single-file, single-line bugs with an
obvious fix once located — exactly the case where a planner/worker/reviewer
split adds pure coordination overhead (planning steps, a worker that
re-investigates what the planner already described, a review pass, on top of
whatever failed attempts each stage has on its own) with nothing to parallelize
or decompose. The plan's premise for orchestration paying off — large,
multi-file tasks with independent sub-parts a single context can't hold well —
was never exercised by this task set. **Open item for a future benchmark run:**
add larger, genuinely multi-file/multi-step tasks and see whether the
cost/time picture inverts, per the plan's own methodology of testing rather
than asserting the hypothesis.

## What's not included

- **Dimension 5 (unnecessary changes) came back 0 for all 12 runs** — a
  clean signal, but this task set doesn't stress it; a task where the correct
  fix genuinely spans multiple files would be a better test of whether the
  agent over-edits.
- **Dimension 8 (architecture)** is deliberately not scored here — see
  `docs/benchmark-design.md`, it's qualitative by design.
- **Build/test dimensions** are `php -l` only — this plugin has no PHPUnit
  setup, so "test" is `null` for every run, not a failure.
- A harness bug surfaced and was fixed mid-run: the benchmark's own
  `.tandem/` session log wasn't gitignored in the target copy, so the first
  attempt's reviewer flagged it as an "unnecessary file" and told a worker to
  delete it — which crashed the run because the harness was still appending
  to that file. Fixed by gitignoring `.tandem/` in the benchmark copy *and*
  making `appendSessionMessage` recreate its file if it disappears
  mid-session, since an agent deleting a file it's told is "unnecessary" is a
  real scenario, not just a benchmark artifact.
- A second run crashed when the planner returned an empty response — an
  intermittent API response, not a schema violation. `runPlanner`/`runReviewer`
  now retry once, and `runBenchmark` records a failed attempt (rather than
  crashing the whole suite) if a task/config combination still errors out.
