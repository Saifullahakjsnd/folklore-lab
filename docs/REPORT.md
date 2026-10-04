# REPORT — folklore-lab

Append-only. You (the agent) write here. Newest entry at the BOTTOM.
Do not edit or delete earlier entries.

Entry format — copy this shape, with the heading at column zero:

```
    ## 2026-10-04T05:30Z — agent
    STATE: one line, what is true now
    BLOCKED_ON: none, or exactly what you need and from whom

    body: findings, decisions taken, questions, anything needing review
```

Write an entry whenever you finish a meaningful step, hit a blocker, make a
decision that departs from the spec, or need a judgement call.

Never inline long URLs, query strings or hashes — line wrapping destroys them.
Write them to a file and reference the path.

Entries begin below this line.

---

## 2026-10-03T23:50Z — agent
STATE: six hypotheses locked and pushed; fetcher built and tested offline; no weather data fetched.
BLOCKED_ON: owner — make the GitHub repo public (or approve the OpenTimestamps alternative) before the weather fetch starts. Only the fetch is blocked.

Done:
- Locks for all six hypotheses: lab/preregistration/ (hashes in manifest.json; listed in docs/BUILD_LOG.md).
- Deviation 001 filed before any data: red-sky v1 left the west point's coordinates unhashed; v2 is locked and takes its slot. Record in lab/deviations/.
- Pushed to origin/main up to e24d435. The repo API still returns 404, so the repo is private and the push timestamps are not publicly checkable yet.
- Snapshot fetcher in ingest/: 32 decade chunks, about 7,827 estimated weighted calls, 11 offline tests (mutation-checked). Dry-run URLs: run `node ingest/scripts/fetch.ts --dry-run`.

Departures from the spec, all recorded in docs/BUILD_LOG.md:
- Hyphenated IDs instead of the dotted example (F1).
- "Supported" also requires the effect to reach the smallest effect of interest.
- Hourly-only UTC fetch with local days computed in code.
- Workflows at 0.36.0, not ~0.33 (F16).

Guidance read up to 23:48Z. F1, F16, F18, F21 and F22 match what I found independently (F22: one generateContent call to gemini-3.7-flash succeeded). F3 and F5 noted for when I import to Sanity; I will record the trial expiry then.

Next (unblocked, starting now):
1. lab time and astronomy utilities with DST and moon tests.
2. lab/stats.ts with reference fixtures.
3. Studio schema for the content model.

## 2026-10-04T00:05Z — agent
STATE: time and astronomy layer done and tested against JPL Horizons and NASA; weather fetch still not started.
BLOCKED_ON: owner — (1) repo visibility before the fetch (still private, API 404); (2) ruling on the H6 units erratum below.

Done since 23:50Z:
- lab/src/time.ts: IANA-based local/UTC conversion that refuses nonexistent or ambiguous wall times; local days of 23/24/25 hours; locked-window helpers.
- lab/src/astronomy.ts: suncalc 2.1.0 wrappers. suncalc agrees with JPL within 0.005 deg (moon above 5 deg) and within 2 s (sunset).
- Fixtures with source queries: lab/test/fixtures/astronomy.json.
- Tests: lab 29, ingest 11, all pass.

Judgement call needed — H6 units erratum:
- The locked H6 says the moon-altitude threshold is "> 0 radians". suncalc 2.1.0 (the version the lock names) reports degrees.
- With a zero threshold, the predicate is identical in either unit, so no result can change.
- Option A (my recommendation): record it as an erratum in the build log and the post. No new version. The hash stays.
- Option B: file deviation 002 and lock H6 v2 with "degrees". Cleaner on paper, but a second deviation for a change with no computational effect.
- Either way it is disclosed. I will not touch H6 until you rule.

Findings worth sharing with the other builds:
- Europe/London was UTC+1 all year from 1968-10-27 to 1971-10-31 (tzdata). Any "winter = GMT" shortcut is wrong for those winters.
- suncalc 2.x returns degrees, not radians, has named exports and bundles its own types. @types/suncalc is for 1.x.

Next (unblocked): lab/stats.ts (Fisher, Mann-Whitney, binomial, Holm, block bootstrap, seeded PRNG) with reference fixtures.

## 2026-10-04T00:10Z — agent
STATE: lab/stats.ts done and matches SciPy/statsmodels reference values; weather fetch still not started.
BLOCKED_ON: owner — (1) repo visibility before the fetch (still private); (2) ruling on the H6 units erratum (entry 00:05Z). Neither blocks the work below.

Done:
- lab/src/stats.ts with reference fixtures lab/test/fixtures/stats.json, from lab/scripts/stats_fixtures.py (versions recorded inside).
- One difference between SciPy and R: Fisher tie tolerance (1e-14 vs 1e-7). The fixture rebuilds R's rule; details in docs/BUILD_LOG.md.
- Tests: lab 46, ingest 11, all pass; one mutation check caught.

Next (unblocked): the trial runner (lab/src/trials.ts). It turns a snapshot plus a locked hypothesis into counts, effect, p, CI and verdict, and is tested on synthetic series only. After that, the Studio schema.
