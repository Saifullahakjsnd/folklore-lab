import Link from 'next/link'
import {Fragment} from 'react'
import {notFound} from 'next/navigation'
import {fetchPublic} from '../../../lib/sanity'
import {FailureBanner, formatP, Hash, NoticeBanner, OpenMeteoCredit, Stamp} from '../../components'

export const revalidate = 60

interface TrialPage {
  _id: string
  title: string
  status: string
  version: number
  statement: string
  definition: string
  location: {name: string; lat: number; lon: number; timeZone: string} | null
  preregistration: {sha256: string; lockedAt: string; lockedBy: string; executedBy: string} | null
  deviations: {_id: string; whatChanged: string; reason: string; consequence: string; createdAt: string; dataSeenBeforeDeviation: boolean}[]
  errata: {_id: string; field: string; locked: string; correct: string; effect: string; whyNotADeviation: string}[]
  supersededBy: {_id: string; title: string} | null
  trial: {
    stage: string
    blinded: boolean
    test: string
    n: number
    excluded: number
    counts: {name: string; value: number}[]
    statistic: number | null
    p: number
    adjustedP: number
    effect: number
    effectUnits: string
    ciLow: number
    ciHigh: number
    nullValue: number
    sesoi: number
    computedVerdict: string
    runAt: string
    gitSha: string
    snapshot: {snapshotSha256: string; chunks: {queryUrl: string; pointId: string; startDate: string}[]} | null
  } | null
  verdict: {outcome: string; summary: string; caveats: string[]} | null
}

const QUERY = `*[_type == "hypothesis" && _id == $id][0]{
  _id, title, status, version, statement, definition,
  "location": location->{name, lat, lon, timeZone},
  "preregistration": *[_type == "preregistration" && hypothesisId == ^._id][0]{sha256, lockedAt, lockedBy, executedBy},
  "deviations": *[_type == "deviation" && (hypothesisId == ^._id || supersededBy._ref == ^._id)]{_id, whatChanged, reason, consequence, createdAt, dataSeenBeforeDeviation},
  "errata": *[_type == "erratum" && hypothesisId == ^._id]{_id, field, locked, correct, effect, whyNotADeviation},
  "supersededBy": *[_type == "deviation" && hypothesisId == ^._id][0].supersededBy->{_id, title},
  "trial": *[_type == "trial" && hypothesisId == ^._id] | order(runAt desc)[0]{
    stage, blinded, test, n, excluded, counts[]{name, value}, statistic, p, adjustedP, effect, effectUnits, ciLow, ciHigh,
    nullValue, sesoi, computedVerdict, runAt, gitSha,
    "snapshot": dataSnapshot->{snapshotSha256, chunks[]{queryUrl, pointId, startDate}}
  },
  "verdict": *[_type == "verdict" && trial->hypothesisId == ^._id][0]{outcome, summary, caveats}
}`

export default async function TrialDetail({params}: {params: Promise<{id: string}>}) {
  const {id} = await params
  const result = await fetchPublic<TrialPage | null>(QUERY, {id})
  if (!result.ok) {
    return (
      <main>
        <h1>Trial</h1>
        <FailureBanner>{result.error}</FailureBanner>
      </main>
    )
  }
  const h = result.data
  if (!h) notFound()
  return (
    <main>
      <p>
        <Link href="/journal">← Journal</Link>
      </p>
      <Stamp verdict={h.verdict?.outcome ?? (h.trial && !h.trial.blinded ? h.trial.computedVerdict : null)} approved={Boolean(h.verdict)} />
      <h1>{h.title}</h1>
      <p className="lede">{h.statement}</p>
      {h.status === 'superseded' && (
        <NoticeBanner>
          This version was superseded by a deviation and will never be tested.
          {h.supersededBy && (
            <>
              {' '}
              See <Link href={`/trial/${h.supersededBy._id}`}>{h.supersededBy._id}</Link>.
            </>
          )}
        </NoticeBanner>
      )}

      <section aria-labelledby="prereg">
        <h2 id="prereg">Pre-registration</h2>
        {h.preregistration ? (
          <dl>
            <dt>SHA-256</dt>
            <dd>
              <Hash value={h.preregistration.sha256} />
            </dd>
            <dt>Locked</dt>
            <dd>{h.preregistration.lockedAt}</dd>
            <dt>Locked by</dt>
            <dd>{h.preregistration.lockedBy}</dd>
            <dt>Executed by</dt>
            <dd>{h.preregistration.executedBy}</dd>
            <dt>Location</dt>
            <dd>{h.location ? `${h.location.name} (${h.location.lat}, ${h.location.lon}; ${h.location.timeZone})` : '–'}</dd>
          </dl>
        ) : (
          <FailureBanner>No pre-registration record exists for this hypothesis, so no trial may run on it.</FailureBanner>
        )}
        <details>
          <summary>Every threshold, exactly as locked (the hashed JSON)</summary>
          <pre>{h.definition}</pre>
        </details>
      </section>

      {h.deviations.length > 0 && (
        <section aria-labelledby="deviations">
          <h2 id="deviations">Deviations</h2>
          {h.deviations.map((d) => (
            <article key={d._id} className="card">
              <h3>{d._id}</h3>
              <p>
                <strong>What changed:</strong> {d.whatChanged}
              </p>
              <p>
                <strong>Why:</strong> {d.reason}
              </p>
              <p>
                <strong>Consequence:</strong> {d.consequence}
              </p>
              <p className="meta">
                Filed {d.createdAt}, {d.dataSeenBeforeDeviation ? 'after' : 'before'} any data was seen.
              </p>
            </article>
          ))}
        </section>
      )}

      {h.errata.length > 0 && (
        <section aria-labelledby="errata">
          <h2 id="errata">Errata</h2>
          {h.errata.map((e) => (
            <article key={e._id} className="card">
              <p>
                <code>{e.field}</code>: locked as “{e.locked}”, correct is “{e.correct}”.
              </p>
              <p>{e.effect}</p>
              <p className="meta">{e.whyNotADeviation}</p>
            </article>
          ))}
        </section>
      )}

      <section aria-labelledby="result">
        <h2 id="result">Result</h2>
        {!h.trial ? (
          <NoticeBanner>No data has been analysed for this hypothesis.</NoticeBanner>
        ) : h.trial.blinded ? (
          <NoticeBanner>Analysed, but still blinded: results stay hidden until a person unblinds them.</NoticeBanner>
        ) : (
          <Result t={h.trial} id={h._id} definition={h.definition} />
        )}
        {h.verdict?.summary && <p>{h.verdict.summary}</p>}
        {h.verdict?.caveats?.length ? (
          <ul>
            {h.verdict.caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        ) : null}
      </section>
      <OpenMeteoCredit />
    </main>
  )
}

function Result({t, id, definition}: {t: NonNullable<TrialPage['trial']>; id: string; definition: string}) {
  const d = JSON.parse(definition) as {predictor: {threshold?: unknown}; comparison: string; effect: {definition: string}}
  const f = (v: number) => v.toFixed(2)
  return (
    <div className="side-by-side">
      <div>
        <h3>Locked before any data</h3>
        <dl>
          <dt>Comparison</dt>
          <dd>{d.comparison}</dd>
          <dt>Effect</dt>
          <dd>{d.effect.definition}</dd>
          <dt>Test</dt>
          <dd>{t.test}</dd>
          <dt>Null value</dt>
          <dd>
            {t.nullValue} {t.effectUnits}
          </dd>
          <dt>Smallest effect of interest</dt>
          <dd>
            {t.sesoi} {t.effectUnits}
          </dd>
        </dl>
      </div>
      <div>
        <h3>What the data said</h3>
        <dl>
          <dt>Units analysed</dt>
          <dd>
            {t.n} ({t.excluded} excluded under the locked missing-data rule)
          </dd>
          {t.counts.map((c) => (
            <Fragment key={c.name}>
              <dt>{c.name}</dt>
              <dd>{c.value}</dd>
            </Fragment>
          ))}
          <dt>Effect [95% CI]</dt>
          <dd>
            <strong>
              {f(t.effect)} {t.effectUnits}
            </strong>{' '}
            [{f(t.ciLow)}, {f(t.ciHigh)}]
          </dd>
          <dt>p</dt>
          <dd>{formatP(t.p)}</dd>
          <dt>Holm-adjusted p</dt>
          <dd>{formatP(t.adjustedP)}</dd>
          <dt>Verdict (locked rules)</dt>
          <dd>
            <strong>{t.computedVerdict}</strong>
          </dd>
          <dt>Computed</dt>
          <dd>
            {t.runAt}, git <code>{t.gitSha.slice(0, 12)}</code>
          </dd>
        </dl>
        <p>
          <Link href={`/replicate/${id}`}>Replicate these numbers in your browser</Link> from the cached data, no network needed.
        </p>
        {t.snapshot && (
          <details>
            <summary>
              The data: snapshot <code className="hash">{t.snapshot.snapshotSha256.slice(0, 16)}…</code>, {t.snapshot.chunks.length} checksummed
              downloads
            </summary>
            <ul>
              {t.snapshot.chunks.map((c) => (
                <li key={c.queryUrl}>
                  <a href={c.queryUrl}>
                    {c.pointId}, from {c.startDate}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  )
}
