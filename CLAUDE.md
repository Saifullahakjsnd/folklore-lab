# Folklore Lab — build brief (Path Two)

**Source of truth:** `Folklore Lab (Path Two).md` in this directory. Read it end to end before writing code. This file is the operating brief; where the two disagree, the spec wins.

## What you own

A Path Two app that turns six weather proverbs into falsifiable hypotheses, locks each one before seeing any data, tests it against more than 70 years of hourly weather, and publishes every verdict with its effect size in a public Journal of Proverb Studies.

You own **only this directory**. Never read or write sibling folders (`../best-track`, `../pothole-shelter`, …) — four other agents are working in them in parallel.

## Assigned ports — do not change

| Service | Port |
| --- | --- |
| Next.js dev | 3003 |
| Sanity Studio | 3336 |

## Toolchain

Node v24.12.0 (spec wants 22.12+), pnpm 12.8.1, pnpm workspaces. **Use pnpm, never npm** — the hard-linked shared store is what keeps five repos inside the disk budget.

## Non-negotiable ground rules

- **Check the current Sanity docs first.** Workflows and the App SDK are new and Workflows packages are 0.x. Do not code against remembered APIs or package names.
- **Everything marked "Verify" in the spec is unconfirmed.** That explicitly includes the Workflows package names and the Open-Meteo variable names, call limit and attribution wording. Confirm before relying on them.
- **Never invent facts.** No made-up data, IDs, citations or API fields. Every stored fact carries a source URL and retrieval date.
- **Code computes, the model writes.** Deterministic code produces every statistic and verdict; a model only drafts hypotheses and prose. Every number shown must come from `lab/stats.ts` output.
- **Pre-registration is the whole point.** A hypothesis is hashed and locked before any data is seen. Edits after lock route to a deviation. A verdict may only exist for a trial whose hash still matches.
- **Snapshot the data.** Save every weather download with its query URL, retrieval date and SHA-256 so CI can reproduce every trial. **This is the data-heavy build** — roughly 2M rows across 3 locations. Keep large files out of git: push them to GitHub release assets and commit only the checksum manifest.
- **Build log from day one.** `docs/BUILD_LOG.md`: prompts that worked, prompts that failed, where you got stuck (expect time zones and statistics), how you fixed it, what you cut. This file is the heart of the Path Two post.
- **Secrets stay server-side.** Never commit tokens. Scan the transcript before making any agent session public.

## Definition of done — all four criteria at 5

| Criterion | What must be true |
| --- | --- |
| Build process writeup | BUILD_LOG excerpts with prompts that worked and failed, where the model got stuck, what was cut, plus a public agent session |
| Functionality | Public journal where every trial re-runs from cached data with identical results; App SDK lab bench with public mirrors; visible failure states |
| Schema | Pre-registration encoded as data: locked hash, edits after lock routed to a deviation, verdicts only on matching hashes |
| Creativity | Folk sayings judged by pre-registered science, with verdict stamps |

## First moves

1. Read the spec fully.
2. Confirm the Workflows package names and Open-Meteo API details against live docs; record findings in `docs/BUILD_LOG.md`.
3. Lock all six hypotheses **before** fetching any weather data — the pre-registration claim is void otherwise.
4. Scaffold the pnpm workspace, then make your first commit.

## Honesty requirement

The data is gridded reanalysis, not station readings. It smooths local showers. State this as a limitation in the post — do not let the write-up imply station-grade measurement.
