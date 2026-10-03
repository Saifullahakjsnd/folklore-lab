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
