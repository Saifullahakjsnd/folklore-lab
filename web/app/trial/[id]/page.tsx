import Link from 'next/link'
import {notFound} from 'next/navigation'
import {fetchPublic} from '../../../lib/sanity'
import {FailureBanner, Hash, NoticeBanner, OpenMeteoCredit, Stamp} from '../../components'

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
  trial: {stage: string; blinded: boolean; snapshot: {snapshotSha256: string; chunks: {queryUrl: string}[]} | null} | null
  verdict: {outcome: string; summary: string; caveats: string[]} | null
}

const QUERY = `*[_type == "hypothesis" && _id == $id][0]{
  _id, title, status, version, statement, definition,
  "location": location->{name, lat, lon, timeZone},
  "preregistration": *[_type == "preregistration" && hypothesisId == ^._id][0]{sha256, lockedAt, lockedBy, executedBy},
  "deviations": *[_type == "deviation" && (hypothesisId == ^._id || supersededBy._ref == ^._id)]{_id, whatChanged, reason, consequence, createdAt, dataSeenBeforeDeviation},
  "errata": *[_type == "erratum" && hypothesisId == ^._id]{_id, field, locked, correct, effect, whyNotADeviation},
  "supersededBy": *[_type == "deviation" && hypothesisId == ^._id][0].supersededBy->{_id, title},
  "trial": *[_type == "trial" && hypothesisId == ^._id] | order(runAt desc)[0]{stage, blinded, "snapshot": dataSnapshot->{snapshotSha256, chunks[]{queryUrl}}},
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
      <Stamp verdict={h.verdict?.outcome ?? null} />
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
        <h2 id="result">Data and result</h2>
        {!h.trial ? (
          <NoticeBanner>No data has been fetched for this hypothesis yet.</NoticeBanner>
        ) : h.trial.blinded ? (
          <NoticeBanner>Analysed, but still blinded: results stay hidden until a person unblinds them.</NoticeBanner>
        ) : (
          <>
            {h.trial.snapshot && (
              <p>
                Data snapshot <Hash value={h.trial.snapshot.snapshotSha256} />, {h.trial.snapshot.chunks.length} checksummed downloads.
              </p>
            )}
            <p>
              <Link href={`/replicate/${h._id}`}>Replicate this trial from the cached snapshot</Link>
            </p>
            {h.verdict?.summary && <p>{h.verdict.summary}</p>}
            {h.verdict?.caveats?.length ? (
              <ul>
                {h.verdict.caveats.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </section>
      <OpenMeteoCredit />
    </main>
  )
}
