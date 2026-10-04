'use client'

import type {FamilyResult} from '@folklore/lab/trials'
import {useEffect, useRef, useState} from 'react'
import {COMPARED, type WorkerMessage} from '../../../lib/replication'

interface Props {
  hypothesisId: string
  published: FamilyResult
  committedNumbersSha256: string
  trialIds: string[]
}

type Step = 'lock' | 'units' | 'statistics'
const STEPS: Step[] = ['lock', 'units', 'statistics']
const STEP_LABEL: Record<Step, string> = {lock: 'lock hash', units: 'unit table hash', statistics: 'statistics'}

// Full precision, so a difference in the last digits is visible rather than rounded away.
const show = (v: unknown) => (typeof v === 'number' ? (v === 0 ? '0 (underflow; < 1e-300)' : v.toPrecision(17)) : String(v))
const relDiff = (a: unknown, b: unknown) =>
  typeof a === 'number' && typeof b === 'number' && a !== b ? Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)) : 0

export function Replicator({hypothesisId, published, committedNumbersSha256, trialIds}: Props) {
  const worker = useRef<Worker | null>(null)
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [progress, setProgress] = useState<Record<string, Partial<Record<Step, boolean>>>>({})
  const [result, setResult] = useState<{family: FamilyResult[]; numbersSha256: string; ms: number} | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => () => worker.current?.terminate(), [])

  const start = () => {
    worker.current?.terminate()
    setState('running')
    setProgress({})
    setResult(null)
    setError(null)
    const w = new Worker(new URL('./replicate.worker.ts', import.meta.url), {type: 'module'})
    worker.current = w
    w.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const m = event.data
      if (m.type === 'progress') setProgress((p) => ({...p, [m.hypothesisId]: {...p[m.hypothesisId], [m.step]: m.ok}}))
      else if (m.type === 'done') {
        setResult(m)
        setState('done')
      } else {
        setError(m.message)
        setState('error')
      }
    }
    w.onerror = (e) => {
      setError(e.message || 'The replication worker failed to start.')
      setState('error')
    }
    w.postMessage('start')
  }

  const mine = result?.family.find((r) => r.hypothesisId === hypothesisId)
  const allMatch = mine ? COMPARED.every((k) => mine[k] === published[k]) : false

  return (
    <section aria-labelledby="replicate-run">
      <h2 id="replicate-run">Re-run it in your browser</h2>
      <p>
        Recomputes all six trials (the Holm correction needs the whole family) from the cached unit tables, with the same{' '}
        <code>lab/stats.ts</code> code. Nothing is fetched: it works with the network down. Expect about 20 to 60 seconds.
      </p>
      <button type="button" onClick={start} disabled={state === 'running'}>
        {state === 'running' ? 'Recomputing…' : state === 'idle' ? 'Replicate' : 'Run again'}
      </button>

      {state !== 'idle' && (
        <table>
          <caption>Checks per trial</caption>
          <thead>
            <tr>
              <th scope="col">Trial</th>
              {STEPS.map((s) => (
                <th key={s} scope="col">
                  {STEP_LABEL[s]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trialIds.map((id) => (
              <tr key={id}>
                <th scope="row">{id}</th>
                {STEPS.map((s) => {
                  const v = progress[id]?.[s]
                  return <td key={s}>{v === undefined ? (state === 'running' ? '…' : '–') : v ? '✓ matches' : '✗ MISMATCH'}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {error && (
        <div role="alert" className="banner banner-failure">
          <strong>Replication failed.</strong> {error}
        </div>
      )}

      {result && mine && (
        <>
          <div role="status" className={`banner ${allMatch && result.numbersSha256 === committedNumbersSha256 ? 'banner-notice' : 'banner-failure'}`}>
            {allMatch && result.numbersSha256 === committedNumbersSha256 ? (
              <>
                <strong>Identical.</strong> Every number below matches the published result, and the hash of all six recomputed results equals
                the hash committed before unblinding. Took {(result.ms / 1000).toFixed(1)} s.
              </>
            ) : (
              <>
                <strong>Differs.</strong> The recomputed numbers do not match the published ones.
              </>
            )}
          </div>
          <table>
            <caption>Published vs recomputed: {hypothesisId}</caption>
            <thead>
              <tr>
                <th scope="col">Quantity</th>
                <th scope="col">Published</th>
                <th scope="col">Recomputed now</th>
                <th scope="col">Match</th>
              </tr>
            </thead>
            <tbody>
              {COMPARED.map((k) => (
                <tr key={k}>
                  <th scope="row">{k}</th>
                  <td>{show(published[k])}</td>
                  <td>{show(mine[k])}</td>
                  <td>{published[k] === mine[k] ? '✓ identical' : `differs by ${relDiff(published[k], mine[k]).toExponential(1)} (relative)`}</td>
                </tr>
              ))}
              <tr>
                <th scope="row">numbers SHA-256 (all six)</th>
                <td>
                  <code className="hash">{committedNumbersSha256}</code>
                </td>
                <td>
                  <code className="hash">{result.numbersSha256}</code>
                </td>
                <td>{result.numbersSha256 === committedNumbersSha256 ? '✓' : '✗'}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}
