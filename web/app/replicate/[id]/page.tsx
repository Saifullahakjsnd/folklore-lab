import type {Metadata} from 'next'
import Link from 'next/link'
import {notFound} from 'next/navigation'
import bundleJson from '../../../data/replication.json'
import type {ReplicationBundle} from '../../../lib/replication'
import {Hash, OpenMeteoCredit} from '../../components'
import {Replicator} from './Replicator'

// Reads only the static bundle shipped with the site: no Sanity, no Open-Meteo.
const bundle = bundleJson as unknown as ReplicationBundle

export const metadata: Metadata = {title: 'Replicate'}

export function generateStaticParams() {
  return bundle.trials.map((t) => ({id: t.hypothesis._id}))
}

export default async function ReplicatePage({params}: {params: Promise<{id: string}>}) {
  const {id} = await params
  const trial = bundle.trials.find((t) => t.hypothesis._id === id)
  if (!trial) notFound()
  return (
    <main>
      <p>
        <Link href={`/trial/${id}`}>← Back to the trial</Link>
      </p>
      <h1>Replicate: {String((trial.hypothesis.proverb as {text: string}).text)}</h1>
      <dl>
        <dt>Lock SHA-256</dt>
        <dd>
          <Hash value={trial.lock.sha256} />
        </dd>
        <dt>Data snapshot SHA-256</dt>
        <dd>
          <Hash value={bundle.snapshotSha256} />
        </dd>
        <dt>Unit table SHA-256</dt>
        <dd>
          <Hash value={trial.unitsSha256} />
        </dd>
        <dt>Results committed before unblinding</dt>
        <dd>
          <Hash value={bundle.numbersSha256} />
        </dd>
        <dt>Computed at</dt>
        <dd>
          {bundle.resultsRunAt}, git <code>{bundle.resultsGitSha.slice(0, 12)}</code>
        </dd>
      </dl>
      <p className="meta">
        Two links, both checked. <strong>Raw snapshot → unit table:</strong> the per-day (or per-year) predictor and outcome flags are rebuilt
        from the 32 checksummed downloads by <code>lab/scripts/reproduce.ts</code> in CI and must match the hash above.{' '}
        <strong>Unit table → numbers:</strong> re-run here, in your browser.
      </p>
      <Replicator
        hypothesisId={id}
        published={bundle.trials.map((t) => t.published)}
        committedNumbersSha256={bundle.numbersSha256}
        publishedNode={`the Node ${bundle.resultsNode} run that produced the published numbers`}
      />
      <OpenMeteoCredit />
    </main>
  )
}
