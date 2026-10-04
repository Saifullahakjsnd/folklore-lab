---
title: "Folklore Lab: six weather proverbs, pre-registered, locked, and judged against 75 years of data"
published: false
tags: sanitychallenge, devchallenge, webdev, nextjs
---

*This is a submission for the Sanity Challenge: Path Two, "Vibe-Code Something Strange".*

**Folklore Lab turns weather proverbs into falsifiable hypotheses, hashes and locks each one before seeing a single data point, then publishes every verdict with its effect size in a public *Journal of Proverb Studies*.**

**Demo:** https://folklore-lab.vercel.app (no login) · **Sanity project ID:** `1jioj3uy` · **Code:** https://github.com/Saifullahakjsnd/folklore-lab

| Proverb | n | Effect [95% CI] | Holm-adjusted p | Verdict |
| --- | --- | --- | --- | --- |
| Rain before seven, fine by eleven | 27,394 days | -30.95 pp [-32.45, -29.45] | < 1e-300 | **Contradicted** |
| Red sky at night, shepherd's delight | 27,392 days | 7.97 pp [5.73, 10.13] | 3.9e-11 | **Supported** |
| Mackerel sky and mares' tails | 27,393 days | -4.25 pp [-6.34, -2.18] | 1.2e-4 | **Contradicted** |
| St Swithin's Day | 75 years | 0.43 days [-1.32, 2.28] | 1.00 | **Inconclusive** |
| Groundhog Day | 75 years | 50.67 % hits [38.67, 62.67] | 1.00 | **Inconclusive** |
| Ring around the moon | 27,391 days | 5.01 pp [3.43, 6.54] | 1.3e-11 | **Supported** |

*pp = percentage points. "Holm-adjusted" corrects across all six tests. Every number above comes from `lab/stats.ts` output; the full results file is in the repo.*

**CI reproduced 6 of 6 verdicts from the raw snapshot** (`node lab/scripts/reproduce.ts`), and any visitor can re-run all six in their own browser at `/replicate`.

## What I Built

A lab bench for folklore. Each proverb becomes a precise, testable claim: rain before 07:00, a dry hour at 11:00, cloud layers at the sunset hour, the moon above the horizon. The claim is canonicalised, hashed with SHA-256 and locked **before** any weather is downloaded. Only then does the pipeline fetch 75 years (1950–2024) of hourly ERA5 reanalysis for four points: London, a point 150 km west of London, Plymouth and Punxsutawney. That is 2.63 million point-hours. Each locked test then runs with a seeded block bootstrap, a Holm correction across all six, and verdict rules that were also fixed in advance.

Two proverbs held up (red sky at night; ring around the moon, by a hair). Two were contradicted: "rain before seven" gets it backwards, because morning rain tends to *persist*. Two were inconclusive with only 75 years of data. They are published exactly as computed.

## Demo

- **Journal:** https://folklore-lab.vercel.app/journal — the verdict table and stamped cards.
- **One proverb end to end:** https://folklore-lab.vercel.app/trial/hypothesis-rain-before-seven-v1 — the locked hypothesis beside its result, the lock hash, and every data download.
- **Replicate:** https://folklore-lab.vercel.app/replicate/hypothesis-rain-before-seven-v1 — press the button and your browser recomputes all six trials from cached data, with no network needed.
- **Pipeline (public mirror of the Lab Bench):** https://folklore-lab.vercel.app/pipeline
- **Methods:** https://folklore-lab.vercel.app/methods — rendered from the locked definitions themselves.
- **Video:** TODO (2–3 min, captioned).

## Code

https://github.com/Saifullahakjsnd/folklore-lab. The raw weather is the GitHub release `snapshot-era5-hourly-1950-2024-v1`; only checksums are in git.

```
lab/        canonical JSON + SHA-256 locks, deviations, errata, time zones, astronomy, stats.ts, trial runner, server policy
ingest/     rate-limited, checksummed, resumable Open-Meteo fetcher
studio/     Sanity Studio: schema, Lock action, append-only types
workflows/  trialLifecycle definition + test-bench tests
web/        Next.js journal, /replicate (Web Worker)
```

## My Build Process

Built with **Claude Code** (Claude Opus 5.5) as the agent, in the open: a coordinator wrote guidance into the repo and the agent answered in `docs/REPORT.md`. The full log is `docs/BUILD_LOG.md`. The parts worth reading:

**Prompts that worked.** The opening prompt gave a strict order and one hard rule: "Do NOT fetch any weather data yet. All six hypotheses must be locked and hashed before any data is seen." Every later decision bent around that sentence. Asking for "exact where it can be, tolerance where it can't" produced a better replication page than asking for "identical".

**Prompts that failed, and where the model got stuck:**

- **Time zones, three times.**
  - Britain stayed on summer time all year from 1968 to 1971, so "winter = GMT" is wrong for three winters.
  - "02:00" did not exist in London on 16 April 1950 (clocks sprang forward at 02:00 until 1980), so a night window ending at 02:00 crashed. The lock defined the window on instants, so the lock was right and the code was wrong.
  - `Intl` is too slow for 75 years of hours, so a transition table, checked against `Intl`, does the lookups.
- **Statistics.** SciPy's Fisher test treats near-tied tables differently from R's (tolerance 1e-14 vs 1e-7), and the locks named R. The reference fixtures rebuild R's rule on SciPy's distribution.
- **Floating point.** I quoted `0.7 + 0.1 + 0.2 === 0.9999999999999999`. It is exactly 1, and a test caught the mistake. The real trap (`0.2 + 0.7 + 0.1`) is why rainfall is summed in integer tenths of a millimetre.
- **Libraries.** I wrote astronomy code against suncalc 1.x; suncalc 2.1 returns degrees, not radians. That later became an erratum (see below).
- **Browsers are not Node.** The in-browser replication matches every hash, count and verdict exactly, but p-values differ in the last 2 of 17 digits, because JavaScript leaves `Math.exp`/`Math.log` accuracy to each engine. The page now says exactly that, rather than "identical".

**Workflows.** The `trialLifecycle` definition runs on the Sanity Workflows 0.36.0 test bench, and its gates are tested:

- People lock, unblind and approve. The runtime fetches and analyses. The agent can only draft.
- A hash mismatch moves a trial to Abandoned.
- The obvious gate, `$actor.kind == "person"`, **gates nothing**: the engine labels robots as people. The commonly suggested fix ("ids starting `p-` are robots") fails in this project too, because our robot tokens resolve to `g-…` ids. The gate is a named-curator allowlist, and the server enforces the same rule.

Status: TODO (deployed / not deployed).

**What I cut:** TODO.

## Sanity Project Details

- **Project ID:** `1jioj3uy`, dataset `production` (public, readable without a token).
- **Public GROQ query:**
  `https://1jioj3uy.api.sanity.io/v2026-06-09/data/query/production?query=*[_type=="trial"]{hypothesisId,effect,ciLow,ciHigh,adjustedP,computedVerdict}`
- **Schema, and why each type exists:**

| Type | Why it exists |
| --- | --- |
| `hypothesis` | The full operational definition as JSON: the exact bytes that are hashed. Read-only once locked. |
| `preregistration` | Canonical JSON, SHA-256, lock time and who locked. Write-once (create fails if one exists). |
| `deviation` | A locked hypothesis can't be edited, only superseded, with a recorded reason and whether any data had been seen. |
| `erratum` | A disclosed label error that cannot change any result. Not a deviation; the hash stays. |
| `dataSnapshot` | Every download's query URL, time and SHA-256, as one document with chunks as an array (a document per chunk would burn the document cap). |
| `trial` | Counts, effect, CI, p, adjusted p, computed verdict, the lock hash it ran against, and stage history as an array. |
| `verdict` | Valid only if the trial's hash still matches its pre-registration *and* the outcome equals the computed verdict. Approved by a person. |
| `proverb`, `location` | Citations, and coordinates with their sources. |

- **Workflow stages:** Draft → Pre-registered → Data fetched → Analysed (blinded) → Unblinded → Verdict approved, with Abandoned on any hash mismatch.

## Honesty section

- **The repo went public (2026-10-04T07:46Z) before the first weather request (07:52:16Z),** so the lock commits are third-party verifiable rather than asserted. Git commit dates are written by the committer; the public repo and GitHub's push records are the independent part.
- **Deviation 001 was found by my own fetcher.** It refuses to download any point whose coordinates aren't inside a lock, and it caught that red-sky v1 named its second point without hashing the coordinates. v2 was locked before any data; v1 is kept and marked superseded.
- **The H6 erratum is not a deviation.** The moon-altitude threshold is labelled "radians", but suncalc 2.1 reports degrees. The threshold is 0, so no number can change, and filing a deviation would blur what a deviation means.
- **Gridded reanalysis is not station data.** ERA5 cells are about 25 km across and smooth local showers. "Red sky" and "ring around the moon" are crude cloud proxies, and the locks said so before any data.
- **The fetch was stopped twice by host memory pressure, and once by a malformed response.** Each time the safeguards (per-chunk checksums, temp-file-then-rename, a manifest only after all 32 chunks verify, no blind retry) left no partial snapshot. 34 requests in all, every one HTTP 200.
- **The results were committed by hash before anyone saw them,** and the published numbers match that hash. The owner authorised unblinding ("do whatever the best option and maximizes winning") and the agent performed it; that is stated as it happened.
- **Ring around the moon is "Supported" by 0.009 percentage points** over the pre-set 5 pp bar, and its CI dips below the bar.
- **"Supported" is stricter than the spec asked.** It requires the effect to reach the smallest effect of interest, not just p < 0.05, because with 27,000 days almost anything is significant.

## Why it's new

Nobody else in the field tests folklore, and here pre-registration isn't a promise in a README; the schema enforces it:

- a locked hash;
- edits routed to deviations;
- verdicts that validate only against matching hashes;
- a public replication any visitor can run;
- a results hash published before the results were read.

## Data sources and licences

- **Weather:** data by [Open-Meteo.com](https://open-meteo.com/) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)), from the Copernicus Climate Change Service ERA5 reanalysis.
- **Punxsutawney Phil's calls:** the Punxsutawney Groundhog Club's published record (facts only; the page's SHA-256 is in the repo).
- **Coordinates:** Wikipedia.
- **Astronomy:** checked against JPL Horizons and NASA GSFC moon phase tables.

## Agent Session

TODO: a curated session uploaded through DEV's Agent Sessions uploader, scanned for secrets before publishing.
