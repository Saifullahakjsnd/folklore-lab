import Link from 'next/link'
import {fetchPublic, JOURNAL_QUERY, type HypothesisRow} from '../../lib/sanity'
import {FailureBanner, Hash, NoticeBanner, OpenMeteoCredit, Stamp} from '../components'

export const revalidate = 60

const fmt = (n: number, digits = 1) => n.toFixed(digits)
const fmtP = (p: number) => (p < 0.001 ? p.toExponential(1) : p.toFixed(3))

export default async function JournalPage() {
  const result = await fetchPublic<HypothesisRow[]>(JOURNAL_QUERY)
  return (
    <main>
      <h1>Journal of Proverb Studies</h1>
      <p className="lede">
        Six weather proverbs, each turned into a falsifiable hypothesis, hashed and locked before any data was fetched, then tested
        against 75 years of hourly reanalysis. Every number below comes from the code, never from a person or a model.
      </p>
      {!result.ok ? (
        <FailureBanner>{result.error}. The journal cannot be shown until Sanity responds.</FailureBanner>
      ) : result.data.length === 0 ? (
        <NoticeBanner>No pre-registered hypotheses are published in the dataset yet.</NoticeBanner>
      ) : (
        <Journal rows={result.data} />
      )}
      <OpenMeteoCredit />
    </main>
  )
}

function Journal({rows}: {rows: HypothesisRow[]}) {
  const awaiting = rows.filter((r) => !r.trial || r.trial.blinded).length
  return (
    <>
      {awaiting > 0 && (
        <NoticeBanner>
          {awaiting} of {rows.length} trials have no published result yet. Their hypotheses are locked; the data has not been analysed or is
          still blinded.
        </NoticeBanner>
      )}
      <table>
        <caption>Summary of all pre-registered trials</caption>
        <thead>
          <tr>
            <th scope="col">Proverb</th>
            <th scope="col">n</th>
            <th scope="col">Effect (95% CI)</th>
            <th scope="col">Holm-adjusted p</th>
            <th scope="col">Verdict</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const t = r.trial && !r.trial.blinded ? r.trial : null
            return (
              <tr key={r._id}>
                <th scope="row">
                  <Link href={`/trial/${r._id}`}>{r.title}</Link>
                </th>
                <td>{t ? t.n : '–'}</td>
                <td>{t ? `${fmt(t.effect)} ${t.effectUnits} (${fmt(t.ciLow)} to ${fmt(t.ciHigh)})` : '–'}</td>
                <td>{t ? fmtP(t.adjustedP) : '–'}</td>
                <td>
                  <Stamp verdict={r.verdict?.outcome ?? null} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <ul className="cards">
        {rows.map((r) => (
          <li key={r._id} className="card">
            <Stamp verdict={r.verdict?.outcome ?? null} />
            <h2>
              <Link href={`/trial/${r._id}`}>{r.title}</Link>
            </h2>
            <p>{r.statement}</p>
            {r.preregistration ? (
              <p className="meta">
                Locked {new Date(r.preregistration.lockedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC · SHA-256{' '}
                <Hash value={r.preregistration.sha256} />
              </p>
            ) : (
              <p className="meta">No pre-registration record found for this hypothesis.</p>
            )}
            {r.verdict?.summary && <p>{r.verdict.summary}</p>}
          </li>
        ))}
      </ul>
    </>
  )
}
