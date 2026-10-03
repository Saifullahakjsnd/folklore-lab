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

## Model provider — Google Gemini

This build uses Gemini, not Anthropic. The key is `GEMINI_API_KEY` in `.env.local`, loaded for you by `launch.ps1`.

- **Prefer the Vercel AI SDK over a provider-specific SDK.** The spec requires an MCP client to reach the Sanity Context endpoint, and the AI SDK gives you Gemini models plus MCP tool discovery in one place. Discover tools with MCP `tools/list` at runtime; never hardcode tool schemas.
- **Record the exact model name and version in every evaluation result**, as the spec requires. All arms of the evaluation must use the same model.
- **Verify** the current Gemini model IDs and the AI SDK provider package name against live docs before coding. Do not rely on remembered model names.
- The key format supplied does not match the usual Google AI Studio pattern, so make a single cheap call to confirm it authenticates before building anything on top of it. If it fails, stop and report rather than working around it.

## Findings from a sibling agent — re-verify cheaply, then rely on them

The `best-track` agent verified these against live Sanity docs on 2026-10-03. Reported, not gospel: confirm with one cheap check, then trust them.

- Studio v6 requires **Node 22.12+** (confirmed in `sanity@6.17.0`).
- Deploying the **schema** is a separate step from deploying the Studio: `sanity schema deploy`.
- **TypeScript resolves to 7.0.2**, a new major version. Confirm Next.js and Sanity tolerate it and pin to 5.x if not. This will bite you the same way it bit the sibling repo.
- pnpm may print an **ignored builds** warning; some install scripts need approving with `pnpm approve-builds`.
- The shared pnpm store is already warm at `C:\Users\ncai\AppData\Local\pnpm\store\v11`, so your install should be fast.

## Reporting protocol — read this

Coordination happens through two files in this repository. You never read any
sibling project folder; that rule stands.

- **`docs/REPORT.md`** — you write. Append-only, newest at the bottom. Write an
  entry when you finish a meaningful step, hit a blocker, depart from the spec,
  or need a judgement call. Start each entry with a timestamp line, then
  `STATE:` (one line) and `BLOCKED_ON:` (`none`, or exactly what you need).
- **`docs/GUIDANCE.md`** — you read. Answers and sequencing arrive here. Check
  the tail before starting new work, and again after writing a blocked entry.

Rules that make this work:

- **Never inline long URLs, query strings or hashes in a report.** Line wrapping
  destroys them. Write them to a file and reference the path. A 743-character
  TAP query was already lost this way once.
- **Do not idle waiting for a reply.** Write the entry, then continue with
  anything unblocked. Only stop if genuinely blocked.
- **Append, never rewrite.** The exchange is part of the build-process record and
  gets read by judges, so an honest trail beats a tidy one.
- Both files are committed. Keep secrets out of them — reference variable names,
  never values.
