# Folklore Lab: standalone build spec (Path Two)

Oct 3, 2026 · @hassan

## Overview and standards

Build Folklore Lab: a Path Two app that turns six weather proverbs into falsifiable hypotheses, locks each one before seeing any data, tests it against more than 70 years of hourly weather, and publishes every verdict with its effect size in a public "Journal of Proverb Studies". The target is a full score on the unofficial scorecard: all four judging criteria at 5 and every checklist item present.

### The challenge rules this build must satisfy

- **Event.** The Sanity Challenge on DEV, Path Two: "Vibe-Code Something Strange." Prompt your way to a working app with an AI-native IDE, Next.js or Astro on the front and Sanity behind it.
- **Judging criteria.**
  - Quality and honesty of the build process writeup.
  - Functionality of the finished app.
  - Thoughtfulness of the schema behind it.
  - Creativity and originality.
- **The brief's bar.** The build is judged as much as the result, and a rough app with an honest writeup beats a polished one with three sentences. Bonus points for reaching past the Studio: an App SDK app with real-time data, and Workflows that model a process as data so an agent can move a draft forward and a person can approve it.
- **Requirements.**
  - A DEV post using the Path Two template with the `#sanitychallenge` tag.
  - The Sanity project ID or a public dataset URL.
  - Testing credentials if anything needs a login.
  - Only one submission per path.
- **Encouraged.** A public agent session uploaded through DEV's Agent Sessions uploader.

### What earns a 5 on each criterion

| Criterion | What the build must show |
| --- | --- |
| Build process writeup | BUILD\_LOG excerpts with prompts that worked and failed, where the model got stuck on time zones and statistics, what was cut, and a public agent session |
| Functionality | A public journal where every trial can be re-run from cached data with identical results; App SDK lab bench with public mirrors; visible failure states |
| Schema | Pre-registration encoded as data: a locked hash, edits after lock routed to a deviation, verdicts allowed only on matching hashes |
| Creativity | Folk sayings judged by pre-registered science, with verdict stamps; no other entry in the field does this |

### Scope

- **In:** six proverbs, three locations, 1950 to 2024 (the 1940s are left out because early reanalysis data is less reliable), a Workflow from draft to verdict, an App SDK lab bench, a public journal, and an optional agent that drafts new hypotheses.
- **Out:** user accounts for the public, real-time forecasts, proverbs with no measurable proxy.

### Ground rules

- **Check the docs first.** Read the current Sanity docs before coding against Workflows or the App SDK; both are new and Workflows packages are 0.x. Anything marked **Verify** in this spec comes from other entrants' posts or memory and must be confirmed first.
- **Never invent facts.** Never make up data, IDs, citations or API fields. Every stored fact carries a source URL and a retrieval date.
- **Code computes, the model writes.** Deterministic code produces every statistic and verdict; any model only drafts hypotheses and prose. Every number shown must come from `lab/stats.ts` output.
- **Snapshot the data.** Save every weather download with its query URL, retrieval date and SHA-256 checksum, so CI can reproduce every trial.
- **Keep a build log from day one.** Write to `docs/BUILD_LOG.md`: prompts that worked, prompts that failed, where you got stuck, how you fixed it, and what you cut. This file is the heart of the Path Two post.
- **Keep secrets server-side.** Never commit or expose tokens. Before making the agent session public, scan the transcript for secrets.

### Stack

| Layer | Choice | Note |
| --- | --- | --- |
| Runtime | Node 22.12+, TypeScript, pnpm workspaces | **Verify:** one entrant reported Studio v6 needs Node 22.12 or later |
| Content | Sanity Studio, deployed with `sanity deploy` | Custom document actions for locking |
| Public site | Next.js (App Router) on Vercel | No login on any public page |
| Workflows | Sanity Workflows engine | **Verify** package names (entrants used `@sanity/workflow-engine`, `@sanity/workflow-cli`, `@sanity/workflow-studio-plugin` around 0.33) |
| App | Sanity App SDK (`@sanity/sdk-react`) | Runs inside the Sanity Dashboard; needs a login |
| Analysis | Pure TypeScript statistics with a seeded random generator; an astronomy library such as suncalc for the moon | Reproducible in CI |
| Tests | Vitest (unit), Playwright (end-to-end), axe-core (accessibility) | All run in CI |
| CI | GitHub Actions | Typecheck, lint, test, build, trial reproduction; badge in README |

### Repo layout

```
/studio      Sanity Studio: schemas, lock action, read-only rules, desk structure
/web         Next.js public journal + API routes (read-only proxies, replicate, propose)
/lab         stats.ts, hypotheses runner, canonical JSON + hashing, Open-Meteo client
/workflows   trialLifecycle definition, effect runtime, workflow tests
/app         App SDK Lab Bench
/agent       optional hypothesis-drafting agent and its guard
/ingest      snapshot fetcher; data manifest with checksums (large files as GitHub release assets)
/docs        BUILD_LOG.md, decision records, screenshots, video script
```

### Sanity setup

- **Project and dataset.** One project with a `production` dataset that is publicly readable, so judges can run GROQ without a token.
- **Stable IDs.** Deterministic document IDs (for example `hypothesis.rain-before-seven.v1`), so re-runs update instead of duplicating.
- **Imports.** Use NDJSON with `sanity dataset import`; one entrant hit a failure importing a JSON array instead.
- **CORS.** Add the production site and localhost as CORS origins.
- **Public query URL for the post.** **Verify** the current API version date:

```
https://<projectId>.api.sanity.io/v2025-02-19/data/query/production?query=*[_type=="verdict"]
```

### Workflows and App SDK rules

- **Spike first.** Spend a 2-hour timebox installing the Workflows engine and running one definition through its test bench. One entrant reported a documented CLI missing from npm.
- **Fallback if the spike fails.** Model the process as documents with the same stages and transitions, enforced in server code, and say so plainly in the post.
- **Public proxy for workflow state.** **Verify:** an entrant reported workflow instance documents use dotted IDs that public datasets do not serve anonymously. Public pages read workflow state through a server-side, read-only proxy.
- **Guards are advisory.** A write token can bypass workflow guards, so enforce who may lock and approve in server code as well, and test it.
- **The App SDK needs a login.** App SDK apps open inside the Sanity Dashboard. Every Lab Bench view needs a public read-only mirror, and the post must give test credentials or a video for the gated parts.

### Agent rules (optional hypothesis-drafting agent)

- **Drafts only.** The agent outputs a hypothesis as JSON matching the `hypothesis` schema, with a rationale per threshold. The server rejects any lock or approval from the agent's credentials.
- **No invented facts.** It may cite only the proverb and folklore sources it was given.
- **Model choice.** Any model, but record its name and version in the build log.

## Data, content model and core logic

Each proverb becomes a locked, hashed hypothesis tested against a checksummed weather snapshot, and a verdict can only exist for a trial whose hash still matches its pre-registration.

### Data sources

| Source | What to pull | Terms | Verify |
| --- | --- | --- | --- |
| [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api) | Hourly precipitation, cloud cover (total, low, mid, high), wind gusts; daily precipitation sum, mean temperature, sunset | CC BY 4.0 with attribution; free for non-commercial use within a daily call limit | Variable names, call limit, attribution wording |
| Punxsutawney Phil's published predictions by year | Shadow or no shadow per year | Facts, cite the source | Find a primary source (the Groundhog Club or NOAA's climate page about Groundhog Day) |
| A folklore reference per proverb | Wording and origin | Cite | One citable source each |

Example request; split long periods into chunks by decade:

```
https://archive-api.open-meteo.com/v1/archive?latitude=51.51&longitude=-0.13&start_date=1950-01-01&end_date=1959-12-31&hourly=precipitation,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,wind_gusts_10m&daily=precipitation_sum,temperature_2m_mean,sunset&timezone=Europe%2FLondon
```

The data is gridded reanalysis (modelled), not station readings. State this in the post's limitations.

### The six pre-registered hypotheses

| # | Proverb | Location | Predictor | Outcome | Comparison |
| --- | --- | --- | --- | --- | --- |
| 1 | Rain before seven, fine by eleven | London | At least 0.2 mm of rain from 05:00 to 06:59 local time | Under 0.1 mm from 11:00 to 11:59 | Days with the predictor vs all days |
| 2 | Red sky at night, shepherd's delight | London | At the sunset hour: total cloud at most 25% at a point about 150 km west, and mid plus high cloud at least 20% overhead | Next-day rain under 1 mm | Those evenings vs all evenings |
| 3 | Mackerel sky and mares' tails make tall ships carry low sails | Plymouth | At 09:00: high cloud at least 50% and low cloud at most 20% | Within 24 h: at least 1 mm of rain or a gust of at least 50 km/h | Those mornings vs all mornings |
| 4 | St Swithin's Day: if it rains, for forty days it will remain | London | At least 1 mm of rain on 15 July | Number of days with at least 1 mm from 16 July to 24 August | Wet-15-July years vs dry years |
| 5 | Groundhog Day: a shadow means six more weeks of winter | Punxsutawney, PA | Phil's published prediction | Mean temperature from 3 February to 16 March below that window's 1991-2020 average | Hit rate vs 50% |
| 6 | Ring around the moon, rain soon | London | Night (22:00-02:00) with high cloud at least 40%, low cloud at most 20%, and the moon above the horizon and at least half lit | At least 1 mm of rain 24 to 48 h later | Those nights vs all nights |

The proxies are deliberately simple and written down before any data is fetched. That is the point of pre-registration, and the post should say so.

### Statistics plan (locked with each hypothesis)

- **Effect.** The difference between the outcome rate with the predictor and the baseline rate, in percentage points. Hypothesis 4 uses the difference in mean rainy days; hypothesis 5 uses the hit rate.
- **Confidence intervals.** 95% intervals from 10,000 block-bootstrap resamples (7-day blocks, which handle weather persistence), with a fixed seed.
- **Tests.** Fisher's exact test (1, 2, 3, 6), Mann-Whitney U (4) and a binomial test against 0.5 (5).
- **Multiple comparisons.** Holm-Bonferroni across the six primary hypotheses at alpha 0.05.
- **Smallest effect of interest.** 5 percentage points (1-3, 6), 2 rainy days (4), and a 60% hit rate (5).
- **Verdict rules:**
  - **Supported:** adjusted p below 0.05 and the effect in the predicted direction.
  - **Contradicted:** adjusted p below 0.05 and the effect in the opposite direction.
  - **Not supported:** the confidence interval excludes the smallest effect of interest.
  - **Inconclusive:** otherwise.
- **Code.** All analysis is in `lab/stats.ts`, pure and seeded, so CI can reproduce every number.

### Content model

| Type | Key fields |
| --- | --- |
| `proverb` | text, origin, sources\[\] |
| `location` | name, lat, lon, time zone |
| `hypothesis` | proverb (ref), statement, location (ref), period, predictor {variable, hours, aggregation, comparator, threshold, conditions\[\]}, outcome {same shape}, comparison, test, alpha, smallest effect, correction family, version |
| `preregistration` | hypothesis (ref), canonicalJson, sha256, lockedAt, lockedBy |
| `dataSnapshot` | location (ref), query URL, variables\[\], retrievedAt, sha256, file URL (a GitHub release asset, because the files are large) |
| `trial` | preregistration (ref), dataSnapshot (ref), n, summary counts, statistic, p, adjusted p, effect, CI low, CI high, runAt, git SHA, reproducedInCi |
| `verdict` | trial (ref), outcome (Supported, Contradicted, Not supported, Inconclusive), plain-language summary, caveats\[\], approvedBy |
| `deviation` | preregistration (ref), what changed, reason, createdAt, consequence |

**Validation and enforcement:**

- **Locking.** Once a `preregistration` exists, the hypothesis is read-only in the Studio, through a custom document action and read-only fields.
- **Hash check before every trial.** The server recomputes the SHA-256 of the hypothesis's canonical JSON. If it differs from the pre-registration, the trial is refused and a `deviation` is required.
- **Verdicts.** A verdict can only reference a trial whose pre-registration hash matches. Adjusted p-values are computed across the whole family in code, never typed.

### Workflow: `trialLifecycle`

The agent may only draft. People lock, unblind and approve. The runtime performs the fetch and analysis.

| From | To | Who | Guard | Effect |
| --- | --- | --- | --- | --- |
| Draft | Pre-registered | Person | All required fields set | Write canonical JSON, hash and lock time |
| Pre-registered | Data fetched | Runtime | Hash still matches | Fetch Open-Meteo, store snapshot and checksum |
| Data fetched | Analysed (blinded) | Runtime | Snapshot checksum valid | Run `lab/stats.ts`; results stay hidden |
| Analysed (blinded) | Unblinded | Person | None | Reveal results |
| Unblinded | Verdict approved | Person (not the agent) | Verdict follows the locked rules | Publish to the journal |
| Any stage after lock | Deviation filed | Automatic, on hash mismatch | None | Mark the trial abandoned with a public reason; a new version must be pre-registered |

**Build order:**

1. Spike the Workflows engine for 2 hours.
2. If it fails, enforce the same transitions in server code and declare the fallback in the post.
3. Read workflow state on public pages through the read-only proxy.

### App SDK: Lab Bench (logged-in curators)

- **Board.** A board of hypotheses by stage, with live updates.
- **Lock view.** Shows the canonical JSON and hash before confirming.
- **Actions.** Unblind and approve-verdict buttons, and the deviation log.
- **Public mirror.** Every view has one at `/pipeline`, read through the proxy. The post gives test credentials and a video for the Lab Bench.

### Optional agent: Propose a proverb

A public form takes a proverb. The agent drafts a structured hypothesis (JSON matching the `hypothesis` schema) with a rationale for each threshold. It lands in Draft for a person to edit and lock; the server rejects any lock or approval from the agent's credentials.

## Site, evaluation and delivery

The build is done when a judge can follow the judge path below without logging in, CI reproduces every verdict, and every checklist item at the end is ticked.

### Public site

- **`/journal`:** the six verdicts as stamped cards and a summary table (proverb, n, effect, CI, adjusted p, verdict).
- **`/trial/[id]`:** the pre-registration card (hash, lock time, every threshold), the data query link, results, verdict, and any deviations.
- **`/replicate/[id]`:** re-runs the analysis from the cached snapshot and shows that the hash and numbers match.
- **`/pipeline`:** the public mirror of the Lab Bench, showing each trial's stage.
- **`/propose`:** the optional proverb form; the agent's draft lands in Draft.
- **`/methods`:** the statistics plan.
- **`/how-it-works`:** schema, workflow, data attribution (including Open-Meteo's required credit), and the Workflows status (engine or declared fallback).

**Demo standards for every page:**

- **Instant start.** No login anywhere; the journal is the first screen.
- **Visible failures.** Loading states, and a banner naming what failed when Sanity, Open-Meteo or the model is unavailable; never a silent fallback.
- **Replication never needs the network.** `/replicate` works from the cached snapshot even if Open-Meteo is down.
- **Accessibility.** Mobile layout, full keyboard use, and axe-core with zero serious violations in CI.
- **Rate limits.** Rate-limit `/propose` and the replicate endpoint.

### Measured results for the post

- The six-row verdict table (proverb, n, effect with CI, adjusted p, verdict).
- "CI reproduced 6 of 6 verdicts from snapshots", or the true count.
- The workflow test count and pass rate.
- One honest sentence on any hypothesis that came out Inconclusive and why (usually sample size).

### Tests and CI

- **Statistics.** Each test matches reference values computed with an established library and stored as fixtures; the bootstrap is identical across runs with the seed.
- **Hashing.** Canonical JSON hashing is stable across key order and formatting.
- **Time.** Local hours across daylight-saving changes, and the moon's position and illumination for known dates.
- **Workflow.**
  - The agent cannot lock or approve.
  - An edit after lock creates a deviation.
  - A trial on a mismatched hash is refused.
- **Reproduction.** CI recomputes every trial from the snapshots and fails if any number differs.
- **End-to-end.** Playwright runs the judge path below, plus axe-core.
- **CI on every push.** Typecheck, lint, unit tests, build and trial reproduction; a CI badge in the README.

### DEV post

- **Template.** Path Two headings: What I Built, Demo, Code, My Build Process, Sanity Project Details, Agent Session. Tag `#sanitychallenge`.
- **First screen.** One-line pitch, demo link, the verdict table and the project ID.
- **My Build Process (the most important section).**
  - The AI-native IDE or agent used.
  - Prompts that worked and prompts that failed.
  - Where the model got stuck (for example time zones, statistics, Workflows APIs) and how you course-corrected.
  - What you cut, and how the Workflows spike and App SDK went.
- **Sanity Project Details.**
  - The project ID and public GROQ query URL.
  - The schema as a type list or diagram, explaining why each modelling choice exists.
  - The workflow stages.
- **Honesty sections.** Known limitations (crude proxies, reanalysis data, small samples) and data sources with licences.
- **Why it's new.** One paragraph: no other entry tests folklore, and pre-registration is enforced by the schema itself.
- **Agent session.** A curated session uploaded through the Agent Sessions uploader, set to Make Public.
- **Video.** 2 to 3 minutes with captions: one proverb, its locked hypothesis, the data, the verdict; replication; the Lab Bench locking and approving; a deviation being filed when a locked hypothesis is edited.

### Judge path (post, video and Playwright)

1. Open `/journal` and read the six verdicts.
2. Open "Rain before seven" to see the locked pre-registration, the data link and the result.
3. Click Replicate and watch the same numbers come back.
4. Open `/pipeline` to see each trial's stage; use the test credentials or the video for the Lab Bench.
5. Submit a new proverb and see the agent's draft land in Draft, unable to lock itself.

### Acceptance checklist

- [ ] The post states Path Two and uses the template
- [ ] Project ID and public dataset query URL appear in the post
- [ ] Live demo works with no login
- [ ] Public repo is linked, with a README and CI badge
- [ ] A 2-3 minute video walkthrough is linked
- [ ] A public agent session is embedded
- [ ] Testing instructions and Lab Bench credentials are in the post
- [ ] The verdict table and reproduction count appear near the top
- [ ] Known-limitations and what-didn't-work sections
- [ ] Real, cited public data
- [ ] The schema is shown in the post, with reasons
- [ ] The App SDK Lab Bench works, with a public mirror
- [ ] The Workflows definition runs (or the declared fallback)
- [ ] Build process notes: prompts that worked and failed, where the model got stuck
- [ ] A paragraph on why the idea is new

### Risks and Verify list

- **Verify** Open-Meteo variable names, limits and attribution, and find a primary source for Phil's record.
- **Verify** Workflows package names and the App SDK setup in the current docs.
- **Proxies:** the red-sky and moon-halo proxies are crude; the pre-registration says so before the data is seen.
- **Reanalysis data:** it smooths local showers, so state this as a limitation.
- **Workflows packages** are 0.x; the server-side fallback must be ready.
