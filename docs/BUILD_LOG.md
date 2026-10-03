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
