# Folklore Lab — Build Log

Agent: Claude Code (model `claude-opus-5-5`) on Windows 11, Node v24.12.0, pnpm 12.8.1.
Everything below is written as it happens. Dates are absolute.

---

## 2026-10-03 — Session 1: verification before any code

### Opening prompt (worked)

> Read CLAUDE.md and "Folklore Lab (Path Two).md" in full before doing anything. Then, in order:
> 1. Verify GEMINI_API_KEY authenticates with one cheap call. If it fails, stop and report.
> 2. Confirm every item marked "Verify" against current live docs (Sanity Workflows package names, App SDK, Open-Meteo variable names, call limit, attribution). Write findings to docs/BUILD_LOG.md.
> 3. Scaffold the pnpm workspace per the spec stack.
> Do NOT fetch any weather data yet. All six hypotheses must be locked and hashed before any data is seen.
> Stop there and report before writing feature code.

Why it worked: it gave a strict order and a hard stop. It also named the one thing that would void the project (seeing data before locking), so the agent never touched the archive endpoint.

### 1. Gemini key: authenticates

- Call: `GET https://generativelanguage.googleapis.com/v1beta/models` with header `x-goog-api-key`. Listing models is free.
- Result: **HTTP 200**. The key has the unusual `AQ.` prefix but still works against the Generative Language API.
- Models visible to this key include `gemini-2.5-flash` (version `001`, stable), `gemini-2.5-pro`, `gemini-3-flash-preview`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.7-flash`, `gemini-3.8-flash`, `gemini-flash-latest` and `gemini-pro-latest`.
- Not yet exercised: `generateContent`. Billing and quota for generation are still unconfirmed.
- Decision deferred: which model ID to pin. It must be one fixed ID, not a `-latest` alias, so evaluations record an exact model and version.
- AI SDK packages exist on npm (2026-10-03): `ai@7.0.127`, `@ai-sdk/google@4.0.87`, `@ai-sdk/mcp@2.0.66`. All need Node ≥ 22.

### 2. Verify items

#### Open-Meteo Historical Weather API (source: https://open-meteo.com/en/docs/historical-weather-api, /en/terms, /en/pricing, /en/licence, retrieved 2026-10-03)

| Item | Spec said | Confirmed |
| --- | --- | --- |
| Endpoint | `archive-api.open-meteo.com/v1/archive` | `/v1/archive` ✅ |
| Hourly vars | `precipitation, cloud_cover, cloud_cover_low, cloud_cover_mid, cloud_cover_high, wind_gusts_10m` | All six names exact ✅ |
| Daily vars | `precipitation_sum, temperature_2m_mean, sunset` | All three exact ✅. `sunset` comes back as ISO 8601 local time when `timezone` is set |
| Timezone | `timezone=Europe/London` | Takes any IANA tz name; timestamps are then local time ✅ |
| Free limits | "daily call limit" | **< 10,000 calls/day, 5,000/hour, 600/minute** (terms); pricing page also lists **300,000/month** |
| Call weighting | — | **A request counts as more than one call when it has more than 10 variables or covers more than 2 weeks for one location.** Counts are fractional, e.g. 2 weeks × 15 vars = 1.5 calls |
| Licence | CC BY 4.0 | CC BY 4.0 ✅ |
| Attribution | "required credit" | Required link beside any displayed data: `<a href="https://open-meteo.com/">Weather data by Open-Meteo.com</a>`. Also credit the underlying reanalysis ("Copernicus Climate Change Service C3S", ECMWF ERA5). Research citation: Zippenfenig, P. (2023). Open-Meteo.com Weather API [Computer software]. Zenodo. https://doi.org/10.5281/ZENODO.7970649 |
| Data delay | — | ERA5 / ERA5-Land: daily with a 5-day delay (irrelevant here; we stop at 2024) |

**Where the model got stuck (1):** the summarised fetch of the pricing page said the *free tier* excludes the historical API. The raw HTML said otherwise: "Historical, climate, ensemble, and satellite radiation APIs require the Professional API Plan or higher" refers to the paid *Standard* plan. The free non-commercial endpoint is a separate thing. Lesson: never trust a summarised page for a go/no-go fact; grep the raw text.

**Call budget (worked out now, before any fetch):**
1950-01-01 to 2024-12-31 is 27,394 days per location. With 9 variables (≤ 10) the weight is days ÷ 14, so about **1,957 calls per location**. Point count: London, the red-sky point about 150 km west of London, Plymouth and Punxsutawney, so 4 points and **about 7,830 calls**. That is under the daily cap but over the hourly cap of 5,000. One decade-chunk request weighs about 261 calls. The fetcher must therefore throttle to about 15 decade requests per hour and finish across at least 2 hours, or split across days. About 4 × 27,394 × 24 ≈ **2.6M hourly rows**.

**New finding that changes the pre-registration — model choice:**
the default `models=best_match` blends ECMWF IFS (9 km, 2017 onward), ERA5 (0.25°, 1940 onward) and ERA5-Land (0.1°, 1950 onward). Under the default, the grid and model would change partway through the 1950–2024 series. ERA5-Land also has no cloud-layer variables. To get one consistent series, the request should pin `models=era5`. This must be decided and written into the locked hypotheses **before** the fetch. It is a pre-registration parameter, not a fetcher detail.

#### Sanity Workflows (source: https://www.sanity.io/docs/workflows and sub-pages, npm registry, retrieved 2026-10-03)

- Status: **early access**, "one fixed 0.x stack". The current release is **0.36.0** (2026-09-30). The spec's "around 0.33" is out of date; 0.33 is the minimum the quick start asks for.
- **All published Workflows packages release in lockstep at one identical version, and their internal ranges are exact.** Pin them all with `--save-exact`.
- Package names, all on npm at 0.36.0:
  - `@sanity/workflow-engine`: definition language and runtime (`@sanity/workflow-engine/define` exports `defineWorkflow`, `defineStage`, `defineField`). Node ≥ 20.
  - `@sanity/workflow-cli`: binary **`sanity-workflows`** (`deploy`, `deploy --check`, `--dry-run`, `start`, `fire-action`, `show`, `nuke`). Reads `sanity.workflow.ts`. Node ≥ 20.12. **The "CLI missing from npm" report no longer holds.**
  - `@sanity/workflow-studio-plugin`: Studio plugin (peers `sanity ^6.15`, `react ^19.2.7`, `styled-components ^6.4.2`).
  - `@sanity/workflow-engine-test`: in-memory **test bench** (`createBench`, `GuardDeniedError`, `subjectField`). Runs with Vitest, needs no project and no network.
  - Also: `@sanity/workflow-studio` (adapter for custom Document Actions), `@sanity/workflow-react`, `@sanity/workflow-sdk` (App SDK integration), `@sanity/workflow-components`, `@sanity/workflow-diagram`, `@sanity/workflow-mcp`, `@sanity/workflow-blueprint` (experimental).
  - `@sanity/workflows` does **not** exist.
- Storage: the engine owns `sanity.workflow.definition`, `sanity.workflow.instance` and guard documents.
- **Guards are advisory, confirmed by the docs:** "Engine verdicts are advisory by design… Anyone whose token allows a raw Content Lake mutation can skip the engine… It is not a security boundary." The only enforcement that holds is dataset access control or custom roles. So server-side checks on lock and approve stay mandatory, as the spec says.
- Engine actors have kind `person | agent | system`, resolved from the token. There is no way to pass a synthetic actor, so the agent needs its own token to be distinguishable.

#### Public dataset and document IDs (source: https://www.sanity.io/docs/content-lake/ids, retrieved 2026-10-03)

- **Confirmed and widened:** "Any document ID containing a dot is considered private… The root path is accessible without authentication, while all subpaths are private." This applies to *every* dotted ID, not only workflow instances.
- **The spec's example ID `hypothesis.rain-before-seven.v1` would be invisible on the public dataset.** Use dot-free deterministic IDs instead, e.g. `hypothesis-rain-before-seven-v1`.
- Workflow instance ID format: not stated on the pages read. Public pages read workflow state through the server-side read-only proxy regardless.
- API version: any ISO date is valid. The current docs' examples use `v2026-06-09`. The post's query URL will use a fixed date chosen at build time.

#### App SDK (source: https://www.sanity.io/docs/app-sdk/*, retrieved 2026-10-03)

- Packages: `@sanity/sdk@3.7.0`, `@sanity/sdk-react@3.7.0` (peer `react ^19.2`). Docs require Node 22.12+.
- Scaffold: `pnpm dlx sanity@latest init --template app-quickstart`. Config goes in `sanity.cli.ts` as `defineCliConfig({ app: { organizationId, entry: './src/App.tsx' } })`. The app wraps itself in `<SanityApp config={...}>`.
- Runs inside the Sanity Dashboard (login required). Dev is `sanity dev` and deploy is `sanity deploy`.
- **Port conflict:** the App SDK dev server defaults to **3333**, which is not our assigned port. The `SANITY_ORG_ID` value is also still empty in `.env.local`.

#### Toolchain checks (sibling findings, re-verified 2026-10-03)

- `sanity@6.17.0` has engines `node >= 22.12` ✅
- **TypeScript `latest` is 7.0.2.** Its package has no classic `main` entry and exposes only `./unstable/*` APIs, so tools that call the JS compiler API (Next's type check, typescript-eslint, Sanity typegen) are at risk. **Pinned to `typescript@5.9.3`.**
- `next@16.3.8`, `next-sanity@13.3.4` (peers `sanity ^5.29 || ^6`), `vitest@5.0.3`, `@playwright/test@1.63.0`, `@axe-core/playwright@4.13.0`, `suncalc@2.1.0`.

#### Discrepancy between CLAUDE.md and the spec

CLAUDE.md says "the spec requires an MCP client to reach the Sanity Context endpoint". The spec contains no such requirement. The spec wins, so the MCP client is optional (useful for the optional agent only).

### Still to verify (not in this session's scope)

- A primary source for Punxsutawney Phil's yearly predictions (Groundhog Club or NOAA).
- One citable folklore source per proverb.
- Exact Gemini model ID to pin, and one `generateContent` call.

### 3. Scaffold (pnpm workspace)

Layout follows the spec: `studio/ web/ lab/ workflows/ app/ agent/ ingest/ docs/`, packages named `@folklore/*`. These are configs and placeholders only; there is no feature code yet.

- Root: `typescript@5.9.3` (pinned, see above), `@types/node@24`, `vitest@5.0.3`. `tsconfig.base.json` is strict, with `erasableSyntaxOnly` so Node 24 can run `.ts` directly (no tsx dependency).
- `studio`: `sanity@6.17.0`, `@sanity/vision@6.17.0`, React 19.3, styled-components 6.5. Dev on **port 3336**. Schema list is empty.
- `web`: `next@16.3.8` (Turbopack), `next-sanity@13.3.4`, `@sanity/client@8.9`, Playwright 1.63, axe-core 4.13. Dev on **port 3003**.
- `workflows`: `@sanity/workflow-engine`, `-engine-test` and `-cli`, all exact **0.36.0** (lockstep).
- `app`: `@sanity/sdk@3.7.0`, `@sanity/sdk-react@3.7.0`. Port not set yet (default 3333 is not ours).
- `lab`: `suncalc@2.1.0`. `agent`: `ai@7`, `@ai-sdk/google@4`, `@ai-sdk/mcp@2`, `zod@4`. `ingest`: no deps yet.

Checks run on 2026-10-03:
- `pnpm -r typecheck`: 7/7 packages pass.
- `pnpm -r test`: passes (no tests yet).
- `next build`: passes (TS check inside Next runs on 5.9.3).
- `sanity build`: passes.

Friction:
- The install took about 9 minutes even with the warm store. pnpm 12's "Lockfile passes supply-chain policies" step checks all ~900 entries against the registry (2m36s on one run). This is not a problem, but it is the slowest step.
- No ignored-build warnings appeared.
- One deprecation warning: transitive `uuid@10.0.0`.

**No weather data has been fetched.** The archive endpoint has not been called once.

---

## 2026-10-04 — Session 1 (cont.): the six hypotheses are locked

### Prompt (worked)

> All three answered — you can lock. 1. models=era5: YES … a blend that switches models across 1950-2024 makes the series INHOMOGENEOUS … 2. Do NOT pin gemini-2.5-flash … Pin the newest STABLE NON-PREVIEW flash, with its exact dated version string … 3. App SDK dev port: 3436 … Now lock all six hypotheses before any weather call.

### Pre-lock decisions (owner-approved, before any data)

| Decision | Choice | Why |
| --- | --- | --- |
| Reanalysis model | `models=era5` in every query | Homogeneous 1950–2024 series. `best_match` switches models (ERA5-Land, ERA5, IFS from 2017), so a trend could be a model change. ERA5-Land lacks cloud layers. Confirmed valid value in Open-Meteo's site source (`{ value: 'era5', label: 'ERA5', caption: '25 km, Global' }`) |
| Verdict rule | **Supported also requires effect ≥ smallest effect of interest** | With ~27k daily units almost any difference is significant. Under the spec's literal rule a 0.4 pp effect would be stamped Supported. **Departure from the spec**, recorded inside every lock |
| Time handling | Fetch **hourly only, in UTC**; local days, daily sums and daily mean temperature computed in lab code; sunset and moon from suncalc | One tested place for DST. Open-Meteo's own DST handling for daily aggregates is undocumented. `temperature_2m` replaces the daily variables: 7 hourly variables, same call weight |
| Drafting model | `gemini-3.7-flash`, version `3.7-flash-08-2026` | Newest stable flash *with a dated version string*. `gemini-3.8-flash` (newer, stable) reports version `"3.0"`, which is undated. No shutdown date announced for either (deprecations page, 2026-10-04). One `generateContent` call succeeded |
| Document IDs | Hyphens only (`hypothesis-rain-before-seven-v1`) | Dotted IDs are private in the Content Lake. **Departure from the spec's example ID**. The lock code refuses dotted IDs |
| App SDK dev port | `SANITY_APP_PORT` (3436), read from env | 3333 is best-track's Studio |

Facts confirmed for the definitions (Open-Meteo docs, retrieved 2026-10-04):
- `precipitation` is a **"preceding hour sum"** with 0.1 mm precision. A value stamped 07:00 covers 06:00–07:00.
- Cloud layers and `temperature_2m` are instantaneous.
- `cell_selection` defaults to `land`. Units default to mm, km/h and °C, and all are pinned explicitly.

Coordinates come from the Wikipedia coordinates API (retrieved 2026-10-04), rounded to 2 decimal places:
- London 51.51, −0.13
- Plymouth 50.37, −4.14
- Punxsutawney 40.95, −78.98
- The red-sky point is derived: same latitude as London, 150 km west → −2.29.

### What a lock contains

Each `lab/hypotheses/h*.json` is self-contained, so editing a referenced document cannot silently change a locked test. Each one holds:
- the proverb text and the location with its coordinates;
- the full data query spec (endpoint, model, variables, units, timezone, period);
- the time rules (preceding-hour semantics, local-day definition, DST windows);
- predictor and outcome, both with exact interval boundaries;
- the effect definition and the test (with the R function whose semantics it must match);
- the bootstrap (method, B = 10,000, block length, mulberry32 seed 20261004, percentile type 7);
- the Holm family of all six, the smallest effect of interest, ordered verdict rules, and the missing-data rule.

Locking (`lab/scripts/lock.ts`) works like this:
1. Canonical JSON (RFC 8785 subset: sorted keys, no whitespace) is hashed with SHA-256 via Web Crypto.
2. Each lock is written once with `wx`. An existing lock is never overwritten, and a re-run leaves it untouched.
3. `lab/scripts/verify-locks.ts` recomputes every hash and exits non-zero on a mismatch, a missing lock or a corrupt lock, ready for CI.

Tests: 11 pass. They cover hash stability across key order and formatting, ECMAScript number output, rejection of NaN, undefined and Dates, the known `abc` digest, a mismatch after an edit, a tampered lock, missing fields, and dotted IDs.

| Hypothesis | SHA-256 |
| --- | --- |
| hypothesis-rain-before-seven-v1 | `78d56fd9d5ecfd0a5ad94009a7bfbaaf78b28ec1bbcaeb3ebd2a6943a1f5041c` |
| hypothesis-red-sky-at-night-v1 | `ef501d9f6753894c250bb713fdb01bad14c2ad6d12f8cbb56b4c79f68224970d` |
| hypothesis-mackerel-sky-v1 | `f4d7b4c45587557fb2aea08c6f0aeec2a2b615e8ca7e3021aaa15cca76a62eed` |
| hypothesis-st-swithins-day-v1 | `e522e70e2ee564f7fed373728e25b187fa35f27d6cd143fb754594c43ea517e3` |
| hypothesis-groundhog-day-v1 | `79d3bc46942527353c6c577806dcd3ae6e7ddef7174fe239e3436994fdff58c3` |
| hypothesis-ring-around-the-moon-v1 | `2e770a4ecb68925d3532090d01c9788b278f1c27563e37c312e801c49ab2081f` |

Manifest SHA-256: `6fa775a973f80466a6c1862b351054a3531f71569b0e6666ce0b1cdd1a4de50d`. Locked at `2026-10-03T22:05:16.672Z` (UTC; 2026-10-04 local), with **zero weather data fetched**.

### Honesty notes for the post

- **Prior knowledge exists.** The drafting agent's training includes general claims, for example that Phil's call is often reported as right well under half the time, and that "red sky at night" has a meteorological rationale. No project data was seen. The defence is the lock itself: definitions and verdict rules were fixed before any download. The predicted direction is always the proverb's own claim, never a guess at what the data will show.
- **Phil's source.** The predictor source is locked as the Groundhog Club's published record. NOAA's page is deliberately not used as the predictor source because it also reports outcomes. `groundhog.org` returned HTTP 403 to a scripted HEAD request; retrieval is a later step.
- **H5's normal** (1991–2020) comes from the same ERA5 series, so it is in-sample. That is stated in the lock.
- **The git timestamp is self-asserted** until pushed. Pushing the lock commit to GitHub before the first fetch gives a third-party timestamp.

### Where the model got stuck

- A long multi-file bash heredoc failed with `unexpected EOF while looking for matching '`. The fix was to write files with the editor tool instead of shell heredocs.
- `| head` on the lock re-run caused an EPIPE crash after the manifest had been written. Harmless (the manifest hash was unchanged), but a reminder not to pipe scripts that write files.

---

## 2026-10-04 — Session 1 (cont.): first deviation, and the snapshot fetcher

### Deviation 001: filed before any data existed

While writing the fetcher, I made it refuse any point whose coordinates are not inside a verified lock. The rule immediately caught a hole in my own lock:
- **H2 v1 (red sky) named the point 150 km west of London only by its ID**, `location-london-west-150km`.
- Its coordinates (51.51, −2.29) lived only in the throwaway generator script, so they were outside the hash. They could have been changed after seeing data without breaking v1.

What I did, using the spec's own mechanism:
- Filed `lab/deviations/deviation-red-sky-at-night-v1-001.json` (what changed, why, consequence, `dataSeenBeforeDeviation: false`).
- Locked **H2 v2** (`8f2265688bbe…`), identical except for `data.pointLocations` and its own ID in the family list.
- v1 keeps its lock and is marked *superseded*. History is not rewritten.
- v2 takes v1's slot in the Holm family of six.
- Committed and pushed before the fetch (`3588cd5`).

`lab/src/registry.ts` now loads hypotheses, locks and deviations together. It fails on any hash mismatch, any deviation citing a wrong hash, and any replacement that is not locked.

Lesson for the post: the first deviation came from the code, not a reviewer. Building the consumer of a lock is how you find out what the lock forgot.

### Open-Meteo call weighting: assumption, not confirmed

Raw text of the pricing page (retrieved 2026-10-04):

> "Requests for data covering more than 10 weather variables or extending over a period of more than 2 weeks for a single location are considered multiple API calls. To calculate the number of API calls accurately, fractional counts are used. For example, a request for 2 weeks of data with 15 weather variables will be calculated as 1.5 API calls, while 4 weeks of data equals 3.0 API calls."

**These two examples do not fit one linear rule.** Linear in time, 4 weeks would be 2.0. They are only consistent if the second example also has 15 variables (2 × 1.5 = 3.0).

The fetcher therefore *assumes* `weight = (days / 14) × max(1, variables / 10)`. With 7 variables that gives:
- 260.9 per decade chunk;
- 1,956.7 per point;
- **7,826.9 for 4 points**.

Limits (terms page, verbatim): "Less than 10'000 API calls per day, 5'000 per hour and 600 per minute". The fetcher self-limits to a rolling 4,000 per hour, 450 per minute and 9,500 per day, so the run takes about 2¼ hours.

If the real weighting is heavier, the first sign will be an HTTP 429. The fetcher then stops with no retry, and I stop and report.

Confirmed by the owner: no other build on this machine uses Open-Meteo, so the per-IP allowance is ours alone.

**Why decade chunks.** The weight scales with days, so chunking does not change the total. A decade request (~261) stays under the per-minute cap; a whole-period request per point (~1,957) would exceed it more than three times over in a single request.

**What is not optimised.** Punxsutawney only needs 3 Feb–16 Mar of each year, but the lock says 1950-01-01 to 2024-12-31. Fetching a narrower window would mean arguing afterwards that it is equivalent. Fetch exactly what was locked.

### Fetcher design (`ingest/`)

- `plan.ts` builds every URL from **verified, active locks only**. It refuses on any lock failure, on hypotheses whose data specs differ, on a point without locked coordinates, on conflicting coordinates, or on a non-GMT timezone.
- `fetcher.ts`:
  - rolling hour, minute and day ledgers, persisted in `ingest/data/fetch-log.ndjson`, so a resumed run still respects earlier usage;
  - the daily budget is checked **before the first request**;
  - **any non-200, network error or malformed body stops the run, with no retry**;
  - responses are validated: UTC offset 0, the exact expected hour count, the first timestamp, every variable present with the right length, and units (mm, km/h, °C, %);
  - raw bytes are saved exactly as received, temp file then rename, with a sidecar holding the query URL, retrieval time, SHA-256, byte count, the grid cell Open-Meteo chose, and null counts;
  - a re-run skips chunks whose bytes still match their checksum and query URL, and refetches anything else;
  - `manifest.json` is written only after all 32 chunks re-verify from disk.
- Raw chunks are gitignored and go to release assets. The manifest and fetch log are committed.

Tests: 11 offline, using a fake clock and a fake Open-Meteo:
- the real plan shape;
- exact decade coverage;
- refusal paths;
- rolling limits never exceeded;
- 429 stops at once with no retry and no manifest;
- resume skips verified chunks and refetches a tampered one;
- a malformed response saves nothing;
- an over-budget plan makes zero requests.

**Mutation check:** I removed the rate-limit wait (the limits test failed), then made a 429 retry instead of stopping (two tests failed). Both were restored. The tests actually guard the behaviour.

A dry run against the real locks gave 32 chunks and 7,826.9 estimated units. No network was touched.

---

## 2026-10-04 — Session 1 (cont.): time zones and astronomy, tested against primary sources

### Where the model got stuck: suncalc 2.x is not suncalc 1.x

I wrote `astronomy.ts` from memory of suncalc 1.x: radians, default export, `@types/suncalc`. The installed **suncalc 2.1.0**, the version named in the locks, differs on all three counts:
- **altitudes are in degrees**, refraction-corrected, and the moon's is also parallax-corrected;
- it has named ESM exports;
- it ships its own types (`@types/suncalc` describes 1.x and was removed);
- `getTimes` takes an optional `utcOffset`. Without it, it uses the solar day nearest the given instant, which is what the lock intends (12:00 local).

Caught by reading `index.d.ts` and the source before running anything.

**Consequence for a lock:** H6 (`hypothesis-ring-around-the-moon-v1`) writes the moon-altitude threshold as `> 0` with units `radians`. Under 2.1.0 the value is in degrees. Because the threshold is zero, the predicate gives identical results in either unit, so no number changes. The lock text is still factually wrong, and I have raised it in docs/REPORT.md as a judgement call: a documented erratum, or a formal deviation and v2.

### Where the model got stuck: "winter is GMT" is false for 1968–71

The IANA tz source (`github.com/eggert/tz`, file `europe`) has Europe/London on UTC+1 all year from 1968-10-27 to 1971-10-31 ("British Standard Time"). Three winters of H1's 05:00–07:00 window sit an hour earlier in UTC than a naive rule would put them. All local-time conversion goes through `Intl` with the tz database, and a test pins the 1970 case.

### Time rules as code (`lab/src/time.ts`)

- `localToUtc(date, 'HH:MM', tz)` **throws** for a wall time that does not exist (spring-forward gap) or occurs twice (fall-back). A locked window can never land silently on an ambiguous hour.
- `localDay` gives 23, 24 or 25 hours. `accumulationStamps(a, b)` returns stamps with a < t ≤ b, matching Open-Meteo's preceding-hour sums. `nearestHour` rounds half past up.
- Tests:
  - H1 window = stamps 06:00 and 07:00 local;
  - H6 night = 5 instants (4 on the spring-forward night, 6 on the fall-back night);
  - New York and London DST days;
  - leap days;
  - the 1968–71 case.

### Astronomy checked against JPL and NASA, not memory

`lab/scripts/build-astro-fixtures.ts` fetched reference values into `lab/test/fixtures/astronomy.json`, storing each source query and the retrieval time:
- JPL Horizons topocentric elevations over London (moon refracted; sun airless) for 2024 and 1965 / 1958;
- NASA GSFC moon phase instants (UT) for 2024 and 1965.

The USNO API was unreachable from this machine (connection failure).

Measured agreement of suncalc 2.1.0:

| Check | Agreement |
| --- | --- |
| Moon altitude, above +5° | within 0.005° (2024 and 1965) |
| Moon altitude, near or below the horizon | within 0.17°; same sign everywhere outside ±0.25° |
| Sunset vs Horizons' −0.833° crossing | 1.8 s (2024-06-21), 1.2 s (1958-12-21) |
| Illumination at NASA full / new / quarter instants | ≥ 0.998 / ≤ 0.002 / 0.501 |

**A test failed, and the test was wrong.** In 1965 the moon was off by 0.17° even at large *negative* elevations. Horizons applies no refraction below the horizon, while suncalc keeps its near-horizon term. The tight tolerance now applies only above +5°. H6 uses only the sign of the altitude, and the sign agrees.

Tests: lab 29 pass, ingest 11 pass.

---

## 2026-10-04 — Session 1 (cont.): `lab/stats.ts`, checked against SciPy and statsmodels

`lab/src/stats.ts` is pure TypeScript with no dependencies:
- Lanczos `lgamma`; `erfc` by a positive-term series below 2 and a Lentz continued fraction above;
- Fisher's exact test, the exact binomial test, Mann-Whitney U (tie and continuity corrected), Holm, and quantile type 7;
- the mulberry32 PRNG, a circular block bootstrap, and a stratified bootstrap;
- the locked verdict rules as one function.

**Reference values come from established libraries.** `lab/scripts/stats_fixtures.py`, run with Python 3.13.9, NumPy 2.3.5, SciPy 1.16.3 and statsmodels 0.14.5, writes `lab/test/fixtures/stats.json`. R is not installed here.

**Where the model got stuck (statistics):** the locks name R semantics, and SciPy is not R in one place. `scipy.stats.fisher_exact` treats two tables as equally probable within a relative 1e-14, while R's `fisher.test` uses 1e-7. The fixture therefore rebuilds the R rule on SciPy's hypergeometric pmf and records `fisher_exact` alongside. They agree on all 10 tables (no near-ties occur). Where SciPy does match R as locked:
- `binomtest` (its source uses `rerr = 1 + 1e-7`, as R does);
- asymptotic `mannwhitneyu` with continuity correction (equals R `wilcox.test(exact = FALSE, correct = TRUE)`);
- statsmodels Holm (equals R `p.adjust`);
- NumPy's default `quantile` (equals type 7).

**Agreement:**
- p-values within 1e-9 relative, including a Fisher p of 9e-20 on a 27k-day table;
- `lgamma` and the normal upper tail within 1e-12;
- Holm within 1e-15.

**Determinism:** the same seed gives an identical bootstrap; a different seed gives a different one. Blocks are 7 consecutive indices and wrap around. Undefined resamples are dropped and counted.

**Verdict rules:** tested case by case, including "significant but below the smallest effect of interest → Not supported" (the owner-approved departure from the spec) and the Groundhog null of 50% with a smallest effect of interest of 60%.

**Stuck, briefly:** `lgamma(1)` is exactly 0, so a purely relative tolerance failed on 9e-16 rounding. The test helper now takes an absolute floor.

**Mutation check:** removing the Mann-Whitney continuity correction fails the reference test.

Unrecorded detail now fixed in code before any data: the PRNG draw order. The circular bootstrap draws block starts in order. The stratified bootstrap fills group 0 then group 1 from one generator. Committed before the fetch.

Tests: lab 46, ingest 11.

---

## 2026-10-04 — Session 1 (cont.): the trial runner, and the time zones bite twice more

`lab/src/trials.ts` implements the six operational definitions literally and runs them through `stats.ts`:
- **It refuses** unless the hypothesis still matches its lock. The message ends: "file a deviation instead".
- **It asserts the lock's structure** (comparators, windows, units, period, test name) against what the code implements, and reads every threshold from the lock. An edited lock can never be silently computed some other way. A test locks a variant with `<=` in place of `<` and confirms the runner refuses it.
- `finaliseFamily` applies Holm across all six slots, then the locked verdict rules.

Tested on **synthetic series only**: 57 lab tests, including the six real locks run end to end with B = 10,000.

### Where the model got stuck (time zones, again)

1. **"02:00" did not exist in 1950.** Running H6 over synthetic data threw `1950-04-16 02:00 does not exist in Europe/London`. Until 1980, UK clocks sprang forward at 02:00 GMT, not 01:00. My code converted the wall time "02:00 local" to UTC. **The lock was right and the code was wrong:** the lock defines the night as *instants whose local time lies in 22:00–02:00*, which needs neither endpoint to exist. The fix, `instantsWithLocalTimeBetween`, works on instants. A test pins the 1950 night (instants at 22, 23, 00 and 01 local). Converting a wall time to UTC raises an error on gaps and overlaps, which is why this surfaced instead of silently shifting an hour.
2. **Speed.** `Intl` costs about 14 µs per call, and a 75-year trial makes millions of lookups. `time.ts` now scans 1940–2030 once per zone, pins every offset change to the minute, and answers lookups from that table. `Intl` remains the reference: a test compares the table with `Intl` at 20,000 random instants per zone and ±3 h around every transition. London has more than 140 transitions in 1950–2024, and none between Oct 1968 and Oct 1971.

### Where the model got stuck (my own claims)

- **I quoted a false floating-point example.** I wrote that `0.7 + 0.1 + 0.2 === 0.9999999999999999`; it evaluates to exactly `1`. A test caught it. I then searched by computation: `0.2 + 0.7 + 0.1` gives `0.9999999999999999`, and that is the example now in the code and test. The underlying trap is real: a day with exactly 1.0 mm could fail "≥ 1 mm". So precipitation is held and summed in **integer tenths of a millimetre**. That is exact decimal arithmetic at Open-Meteo's stored precision, not a change of rule.
- **I wrote one test with the wrong expectation.** Under 1970's BST, the stamp 06:00 UTC covers 06:00–07:00 local, which is *inside* `[05:00, 07:00)`. The test was wrong, not the code. Corrected with a stamp that is genuinely outside.

### Erratum (not a deviation): H6 moon-altitude units

The owner ruled Option A (GUIDANCE 00:18Z). `lab/errata/erratum-ring-around-the-moon-v1-001.json` records that H6 labels the moon-altitude threshold "radians", while suncalc 2.1.0 reports degrees.

**Why it is not a deviation:** the threshold is 0 and the comparator is `>`, so the predicate is identical in either unit, and no count, p-value or verdict can change. Deviation 001 was different in kind: unhashed coordinates *could* have changed results. Keeping that line sharp matters more than paper tidiness. The runner asserts the locked threshold is exactly 0, so the erratum's claim is enforced in code.

**TypeScript pin changed: 5.9.3 → 6.0.3** (coordinator finding F35: TS 7 ships no JS API, and typescript-eslint supports only versions below 6.1). Re-verified: `pnpm -r typecheck` (7 packages), `next build` and `sanity build` all pass on 6.0.3.

---

## 2026-10-04 — Session 1 (cont.): Studio schema, and the Workflows spike succeeds on the bench

### Studio schema (`studio/schemaTypes`)

Ten types. The design choice that matters: **`hypothesis.definition` is the full locked JSON as one text field.** The locked definitions mix types (some thresholds are numbers, some strings, some null), and Sanity arrays add `_key`s, so a field-by-field Sanity copy would never re-hash to the lab's lock. One JSON field is hashed exactly as the lab hashes it. Readable fields (title, statement, proverb and location references) sit beside it for display and querying.

- The whole hypothesis document is read-only once `status` leaves `draft`. Delete and unpublish disappear once it is locked.
- **Lock action:** shows the canonical JSON and SHA-256 before confirming. It then creates the `preregistration` (create fails if one exists, so it is write-once) and sets the status, in one transaction. It refuses robot tokens by the `p-` id prefix.
- `preregistration`, `deviation`, `erratum`, `dataSnapshot` and `trial` are append-only: no delete, unpublish, duplicate or publish actions.
- `verdict` validation: the trial's lock hash must equal its preregistration's hash, the trial must not be blinded, and the outcome must equal the code's computed verdict.
- F34 (document cap): the 32 snapshot chunks and the trial's stage history are arrays inside one document each.
- The production dataset's ACL is **public**, so importing publishes the locks. `studio/import/preregistration.ndjson` (26 documents) is built and verified but **not imported**; that waits on the owner.

### Workflows spike: passed, no fallback needed (so far)

The spec's 2-hour spike: install the engine and run one definition through its test bench. Done in well under the timebox, on `@sanity/workflow-engine` and `@sanity/workflow-engine-test` 0.36.0.

`workflows/src/trialLifecycle.ts` has the stages Draft → Pre-registered → Data fetched → Analysed (blinded) → Unblinded → Verdict approved, plus Abandoned from any stage after lock.

**Where the model would have got stuck without F33:** the obvious gate, `$actor.kind == "person"`, gates nothing. The engine relabels every actor as a person. I confirmed it on the bench: with that gate, an actor passed as `kind: 'agent'` could lock. The gate used instead:
- people: `!string::startsWith($actor.id, "p-")` (robot tokens have `p-` ids);
- runtime: `$actor.id == $fields.runtimeActorId` (an exact token id supplied at start), so neither a person nor the agent can impersonate it.

Gates sit on action `filter`s, the caller-bound site. Transition `when` conditions are caller-blind by design (Workflows conditions docs).

Bench tests (6), all passing:
- the happy path;
- the agent cannot lock;
- a robot claiming `kind: 'person'` cannot lock or approve, and neither can the runtime;
- a person cannot perform runtime steps, and the agent cannot impersonate the runtime;
- a hash mismatch moves the trial to Abandoned;
- only one open trial per hypothesis (single-subject start requirement).

**Mutation check:** swapping in the naive `kind` gate fails 2 tests, and removing the runtime gate fails 1.

`workflows/sanity.workflow.ts` passes `sanity-workflows deploy --check` (validation only, dataset not contacted). The real deploy needs Workflows enabled for the org, an owner toggle. All gates stay advisory, so the server routes must enforce them too.

---

## 2026-10-04 — Session 1 (cont.): F33's fix does not hold here; the gate is now an allowlist

While building the server routes I checked what Sanity's `/users/me` returns for our robot (Editor) token, printing only id shapes, never names or emails:

| Source | Robot token (provider `sanity-token`) | Human (project administrator) |
| --- | --- | --- |
| `/users/me` and project member `id` | `pp…` (no hyphen) | `p…` |
| account-global `sanityUserId` | **`g-1…`** | `gR…` |
| project member `isRobot` | true | false |

The engine's `fetchActor` (read in `@sanity/workflow-engine` 0.36.0 `dist/index.js`) takes `$actor.id` from the account-global id. For our robot it bridges to the `sanityUserId`, so **the robot's `$actor.id` is `g-1…`**. The engine's own `classifyPrincipalId` treats any id starting `g` as global and only `p-` as robot. So the gate F33 recommends, `!string::startsWith($actor.id, "p-")`, **would admit this project's robot tokens as people**. My earlier bench tests passed only because I wrote the robot ids as `p-…`, copying F33's description instead of observing real ones.

**Fix (no reliance on id shapes):**
- **Workflow:** people are an *allowlist*. A workflow input `curators` (type `assignees`, user members only; the docs say robots cannot be assignment members) is copied into each person-gated activity's `seat` field with `fieldRead`. The action filter is `count($fields.seat[@.type == 'user']) > 0 && $assigned`, so only listed humans match, never a role alone. The runtime is matched by its exact engine-resolved id.
- **Server (`lab/src/policy.ts`):** robots are recognised by Sanity's own `provider: "sanity-token"`. The runtime and agent are matched by exact id. People must also be on the curator allowlist.
- **Studio Lock action:** the `p-` check is gone. It was meaningless, because Studio ids are project-scoped `p…` for humans too, and robot tokens cannot sign in to the Studio at all.

**Tests:**
- Bench, 8 tests: a `g-` robot cannot lock (and the test asserts F33's rule would have admitted it); a non-curator person cannot lock; a legacy `p-` robot with an admin role cannot lock.
- **Mutation:** restoring F33's `p-` gate fails 4 of the 8.
- Policy, 8 tests.

**Limitation, stated plainly:** all of this is advisory against a raw write token. Hard enforcement would need dataset access control or custom roles in the Content Lake. A token with write access can still create a `preregistration` or `verdict` directly. The defence is detection: every verdict re-hashes against its lock, and CI recomputes everything.

---

## 2026-10-04T07:51Z — The repo is public; the fetch starts after this entry is pushed

**The repository went public at 2026-10-04T07:46Z UTC, before the first Open-Meteo request.** At 07:51Z the GitHub API reported `private: false, visibility: public`, and both commits below were publicly readable:

| Commit | What | Committer date (UTC) |
| --- | --- | --- |
| `78b647e` | Lock and hash all six pre-registered hypotheses (no data fetched) | 2026-10-03T22:06:29Z |
| `3588cd5` | Deviation 001: red-sky v1 → v2 | 2026-10-03T22:18:04Z |

**What is independently verifiable, stated precisely:**
- Git committer dates are written by the committer's machine, so on their own they are an assertion.
- What a third party can check is that the repository, public since 07:46Z, already contained these locks.
- The fetch log (`ingest/data/fetch-log.ndjson`, committed after the fetch) and the snapshot manifest record every request's time, all after that moment.
- GitHub's own push records hold the times the lock commits reached GitHub (2026-10-03, about 22:07Z onward).

The owner's pre-flight secret scan before going public found only false positives: sha512 integrity lines in `pnpm-lock.yaml`. No `.env` file was ever committed.

---

## 2026-10-04 — H5's predictor: Punxsutawney Phil's record

- `groundhog.org` returns 403 to every scripted request. In Chrome it showed a bot-detection "security verification" page that did not clear by itself. **I did not complete or bypass the bot check**; I closed the tab and asked the owner.
- The owner saved the page from their own browser: "History & Past Predictions - Punxsutawney Groundhog Club" (canonical `https://www.groundhog.org/groundhog-day/history-past-predictions/`). Saved 2026-10-04T12:33:49Z; page SHA-256 `295be64d838f39123f519c1d91cdc7bb78deded1e2627b21c7e2832a8e0a38a6`; 1,296,018 bytes.
- **The page is the Club's content, so it is not committed.** `ingest/data/groundhog/groundhog-calls.json` holds only the extracted facts (year → call) with that provenance. `ingest/scripts/parse-groundhog.ts` regenerates it from the saved page.
- Mapping (as locked): "More winter" = shadow, "Early spring" = no shadow. Anything else is kept verbatim and excluded by the locked rule. "—No prediction." appears on the page but not in 1950–2024.
- **1950–2024: 75 of 75 years have a call** (58 shadow, 17 no shadow). These are predictor counts only; no outcome has been looked at.
- **Cross-check:** each call is compared with its row's details text. 69 of 75 match automatically (0 disagreements). The other 6 phrase it differently: 2021–2023 "Shadow at 7:2x AM", and 2001, 2014, 2015 "six more weeks of winter". By reading, all six agree with their parsed call (shadow).

---

## 2026-10-04T13:00Z — Locks imported to the public dataset

- 26 documents (6 proverbs, 4 locations, 7 hypotheses including the superseded red-sky v1, 7 pre-registrations, 1 deviation, 1 erratum) imported into `production` with `createIfNotExists`, so nothing already present can be overwritten. This went through the HTTP mutate API (`lab/scripts/import-to-sanity.ts`) with the Editor token (F3), and ran while the fetch was rate-limit idle. Result: 26 created.
- **Anonymous (token-free) reads return all 26.** Recomputing each hypothesis's hash from the definition *as stored in Sanity* matches its pre-registration for all 7, so anyone can re-derive the locks from the public dataset alone.

---

## 2026-10-04T14:22Z — The snapshot is complete

- **32 of 32 chunks verified; manifest written. Snapshot SHA-256 `4dc5ac6ec55c5bf95a4486d63a3e99f78a9f20a5a53a0aa0429fc3b2e686ee57`.** It was fetched under lock manifest `45c200e6…`, the current one.
- **34 requests, all HTTP 200, no 429.** First request 07:52:16Z, after the repo went public at 07:46Z. Last 14:22:25Z.
- Estimated weight 8,348.6 against the 7,826.9 plan. The difference is exactly two lost requests (below), not Open-Meteo weighting differently from the assumed rule.
- 2,629,824 point-hours × 7 variables = 18.4M values, 117.7 MB raw. **Zero nulls** in every variable.
- ERA5 cells chosen by Open-Meteo: London 51.5, −0.25; red-sky point 51.5, −2.25; Plymouth 50.5, −4.25; Punxsutawney 41, −79.

### What went wrong during the fetch, and what the safeguards did

1. **Host memory pressure stopped it twice** (07:54Z after 2 chunks; 13:51Z after 30). The machine had 0.3 GB free, with Chrome at 6.5 GB. Claude Code stops background shells under memory pressure while the session is idle. The first stop came after Open-Meteo had answered the third request but before it was written: one lost request, and no partial file. The second stop came during a rate-limit wait: nothing lost. Both times there was no manifest, so no partial snapshot could pass as complete. Resume re-verified every saved chunk by checksum and skipped it. The last two chunks were run in the foreground.
2. **One HTTP 200 that was not JSON** (Plymouth 2000–09, 13:39Z). The fetcher aborted without retrying and without saving, as designed. But it had discarded the body, so the cause is unknown: my design gap. It now keeps rejected bytes in `ingest/data/failed/`. The re-request succeeded, and nothing has failed since.

Committed: `ingest/data/manifest.json` (every chunk's query URL, retrieval time, SHA-256, bytes, grid cell, null counts) and `ingest/data/fetch-log.ndjson` (every request with time, weight and status). The raw chunks go to a GitHub release.

---

## 2026-10-04T14:35Z — Six trials run, blinded; results committed by hash before unblinding

- `node lab/scripts/run-trials.ts ingest/data/groundhog/groundhog-calls.json`: snapshot verified, **6 of 6 trials ran, 0 refused**, then the Holm correction across the family and the locked verdict rules. It took 98 seconds.
- **Nobody has seen a number.** The script writes results to a gitignored file and prints only which trials ran and a hash.
- **Commitment:** `lab/results/blinded-commitment.json` publishes `numbersSha256 = 28df6c2f…`, the SHA-256 of the canonical JSON of all six results. It is pushed before unblinding, so the published numbers can be checked against a value fixed in advance.
- **Determinism, shown blind:** a second full run gave the identical `numbersSha256`.

## 2026-10-04 — Raw chunks published as a GitHub release

- Release `snapshot-era5-hourly-1950-2024-v1`: 32 assets (117.7 MB), with the Open-Meteo / C3S ERA5 attribution in its notes. Only `ingest/data/manifest.json` (checksums) is in git.
- The snapshot manifest is hashed, so download URLs are not written into it. Release asset URLs are deterministic (`…/releases/download/<tag>/<file>`).
- `node ingest/scripts/download-snapshot.ts [dir]` restores and verifies every chunk. **Tested from scratch:** 32 downloads in 53 s, all SHA-256 matching the committed manifest, and the loader rebuilt 657,456 contiguous hours per point.
