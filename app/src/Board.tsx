import {useQuery} from '@sanity/sdk-react'

const STAGES: [string, string][] = [
  ['draft', 'Draft'],
  ['preregistered', 'Pre-registered'],
  ['dataFetched', 'Data fetched'],
  ['analysedBlinded', 'Analysed (blinded)'],
  ['unblinded', 'Unblinded'],
  ['verdictApproved', 'Verdict approved'],
  ['abandoned', 'Abandoned'],
]

interface Row {
  _id: string
  title: string
  status: string
  stage: string | null
  verdict: string | null
}

const QUERY = `*[_type == "hypothesis" && status != "superseded"] | order(_id asc){
  _id, title, status,
  "stage": *[_type == "trial" && hypothesisId == ^._id] | order(runAt desc)[0].stage,
  "verdict": *[_type == "trial" && hypothesisId == ^._id] | order(runAt desc)[0].computedVerdict
}`

// Live board: useQuery subscribes, so a lock, approval or deviation moves the card at once.
export function Board({selected, onSelect}: {selected: string | null; onSelect: (id: string) => void}) {
  const {data, isPending} = useQuery<Row[]>({query: QUERY})
  const stageOf = (r: Row) => r.stage ?? (r.status === 'preregistered' ? 'preregistered' : 'draft')
  return (
    <section aria-label="Trials by stage" className={`board${isPending ? ' pending' : ''}`}>
      {STAGES.map(([stage, label]) => {
        const items = data.filter((r) => stageOf(r) === stage)
        return (
          <div key={stage} className="column">
            <h2>
              {label} <span className="count">{items.length}</span>
            </h2>
            {items.map((r) => (
              <button key={r._id} type="button" className={`card${selected === r._id ? ' selected' : ''}`} onClick={() => onSelect(r._id)}>
                <strong>{r.title}</strong>
                <span className="muted">{r._id}</span>
                {r.verdict && <span className="verdict">{r.verdict}</span>}
              </button>
            ))}
          </div>
        )
      })}
    </section>
  )
}
