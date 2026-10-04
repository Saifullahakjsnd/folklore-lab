# Folklore Lab

[![CI](https://github.com/Saifullahakjsnd/folklore-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/Saifullahakjsnd/folklore-lab/actions/workflows/ci.yml)

Six weather proverbs, each turned into a falsifiable hypothesis, **hashed and locked before any weather data was fetched**, then tested against 75 years (1950–2024) of hourly ERA5 reanalysis. The verdicts, with effect sizes and confidence intervals, are published in a public *Journal of Proverb Studies*.

Built for the Sanity Challenge on DEV, Path Two. The build log is the heart of the project: [`docs/BUILD_LOG.md`](docs/BUILD_LOG.md).

## Status

| Piece | State |
| --- | --- |
| Six hypotheses locked (SHA-256) | Done, before any data. One deviation (red-sky v1 → v2) and one erratum, both filed before any data |
| Weather snapshot | Fetcher built and tested offline; **not run yet** |
| Statistics (`lab/stats.ts`) | Done; checked against SciPy/statsmodels reference values |
| Trial runner | Done; tested on synthetic series only |
| Sanity Studio schema | Done; not yet deployed |
| Workflows (`trialLifecycle`) | Passes the Workflows 0.36.0 test bench; not yet deployed |
| Public site | Journal, trial, methods, pipeline, how-it-works |
| CI reproduction of every trial | Waiting for the snapshot |

## Layout

```
lab/        canonical JSON + hashing, locks, deviations, errata, time zones, astronomy, stats, trial runner, policy
ingest/     Open-Meteo snapshot fetcher (rate-limited, checksummed, resumable)
studio/     Sanity Studio: schema, Lock action, append-only types
workflows/  trialLifecycle definition and its bench tests
web/        Next.js public journal
app/        App SDK Lab Bench (scaffold)
agent/      optional proposal agent (scaffold)
docs/       BUILD_LOG.md, REPORT.md, GUIDANCE.md
```

## Verify the locks yourself

```sh
pnpm install
node lab/scripts/verify-locks.ts   # recomputes every hash; exits non-zero on any mismatch
pnpm -r test
```

## Data and licence

Weather data by [Open-Meteo.com](https://open-meteo.com/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), from the Copernicus Climate Change Service ERA5 reanalysis. It is gridded, modelled data (about 25 km cells), not station readings, and it smooths local showers.
