import type {Metadata} from 'next'
import Link from 'next/link'
import {fetchPublic} from '../../lib/sanity'
import {FailureBanner, NoticeBanner} from '../components'

export const metadata: Metadata = {title: 'Pipeline'}
export const revalidate = 30

const ORDER = ['draft', 'preregistered', 'dataFetched', 'analysedBlinded', 'unblinded', 'verdictApproved', 'abandoned']
const LABEL: Record<string, string> = {
  draft: 'Draft',
  preregistered: 'Pre-registered',
  dataFetched: 'Data fetched',
  analysedBlinded: 'Analysed (blinded)',
  unblinded: 'Unblinded',
  verdictApproved: 'Verdict approved',
  abandoned: 'Abandoned',
}

interface Row {
  _id: string
  title: string
  status: string
  stage: string | null
}

// Public read-only mirror of the Lab Bench board. Stage comes from the trial document; a
// locked hypothesis without a trial is "pre-registered", a draft is "draft".
export default async function PipelinePage() {
  const result = await fetchPublic<Row[]>(
    `*[_type == "hypothesis" && status != "superseded"] | order(_id asc){_id, title, status,
      "stage": *[_type == "trial" && hypothesisId == ^._id] | order(runAt desc)[0].stage}`,
  )
  return (
    <main>
      <h1>Pipeline</h1>
      <p className="lede">Where every trial is in its lifecycle. This is the public mirror of the curators’ Lab Bench, which needs a login.</p>
      {!result.ok ? (
        <FailureBanner>{result.error}</FailureBanner>
      ) : result.data.length === 0 ? (
        <NoticeBanner>No hypotheses are published yet.</NoticeBanner>
      ) : (
        <ol className="cards">
          {ORDER.map((stage) => {
            const items = result.data.filter((r) => (r.stage ?? (r.status === 'preregistered' ? 'preregistered' : 'draft')) === stage)
            return (
              <li key={stage} className="card">
                <h2>{LABEL[stage]}</h2>
                {items.length === 0 ? (
                  <p className="meta">None</p>
                ) : (
                  <ul>
                    {items.map((r) => (
                      <li key={r._id}>
                        <Link href={`/trial/${r._id}`}>{r.title}</Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </main>
  )
}
