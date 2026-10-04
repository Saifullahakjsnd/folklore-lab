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

## 2026-10-04T00:30Z — agent
STATE: trial runner done on synthetic data (57 lab tests); TypeScript now 6.0.3 per F35; weather fetch still not started.
BLOCKED_ON: owner — repo visibility before the fetch (still private). Nothing else.

Done since 00:10Z:
- lab/src/trials.ts: six definitions; refuses unless the lock hash matches; asserts the lock structure against the code; Holm + verdicts across the family.
- Time zones: "02:00" did not exist on 1950-04-16 (UK sprang forward at 02:00 until 1980). The H6 night is now selected by instants, as the lock wording says. The lock was right and my code was wrong. The per-zone transition table is checked against Intl.
- H6 units: erratum recorded per your Option A ruling, with the not-a-deviation reasoning. File: lab/errata/.
- F35 applied: typescript 6.0.3. Typecheck (7 packages), next build and sanity build all pass.
- F33 noted. The approval gate (not built yet) will use the actor-ID namespace, never $actor.kind, plus a server-side check.
- F34 noted. Event history will live in arrays inside documents, not one document per event.

Next: Studio schema for the content model; then the fetch, as soon as the repo is public.

## 2026-10-04T00:45Z — agent
STATE: Studio schema built (typecheck + sanity build pass); import file of the locks ready; nothing imported or deployed to Sanity yet.
BLOCKED_ON: owner — a second visibility decision. The production dataset's ACL mode is PUBLIC (checked with the project API). Importing the locks therefore publishes them immediately, the same trade-off as making the repo public. Say "import" and I will import, deploy the schema and deploy the Studio. Repo visibility still blocks the fetch.

Done:
- F33 checked: no approval gate existed anywhere, so nothing fake was built. The Studio Lock action refuses robot tokens by id prefix "p-", never $actor.kind. Server-side enforcement comes with the API routes.
- H6 erratum recorded as Option A (00:22Z entry, lab/errata/).
- Studio schema: 10 types; pre-registration as data. hypothesis.definition is the hashed JSON, and the document is read-only once locked. preregistration, deviation, erratum, dataSnapshot and trial are append-only (no delete, unpublish or duplicate). Verdict validation requires the trial's hash to match its preregistration and the outcome to equal the code's computed verdict.
- F34 applied: snapshot chunks and trial stage history are arrays inside one document each. About 40 documents in total.
- Import file: studio/import/preregistration.ndjson, built by lab/scripts/build-sanity-import.ts. 26 documents, no dotted ids, every definition re-hashed against its lock before writing.
- Dataset today holds only 12 system documents (checked by id and type; none are ours).

Next (unblocked): the Workflows spike on the in-memory test bench (needs no org enablement). The person-only approval gate will use the actor-id namespace, as F33 says.

## 2026-10-04T01:00Z — agent
STATE: Workflows spike passed on the bench (trialLifecycle, 6 tests, gate per F33); definition validated with deploy --check; nothing deployed.
BLOCKED_ON: owner — (1) repo visibility (blocks the fetch); (2) "import" go-ahead for the public dataset (00:45Z entry); (3) when ready: enable Workflows for the org, then I deploy trialLifecycle. Work continues meanwhile.

- F33 independently confirmed on the bench: with `$actor.kind == "person"` as the gate, an actor passed as kind "agent" could lock. The engine relabels it. My gate uses `!string::startsWith($actor.id, "p-")` for people and an exact runtime token id for runtime steps. Mutation-checked.
- No fallback needed so far. The server-side enforcement of the same rules is still to build (the next item, with the web API routes).
