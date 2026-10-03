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
