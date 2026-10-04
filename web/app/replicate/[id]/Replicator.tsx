'use client'

import type {FamilyResult} from '@folklore/lab/trials'
import {useEffect, useRef, useState} from 'react'
import type {WorkerMessage} from '../../../lib/replication'

interface Props {
  hypothesisId: string
  published: FamilyResult[]
  committedNumbersSha256: string
  publishedNode: string
}

type Step = 'lock' | 'units' | 'statistics'
const STEPS: Step[] = ['lock', 'units', 'statistics']
const STEP_LABEL: Record<Step, string> = {lock: 'lock hash', units: 'unit table hash', statistics: 'statistics'}

// Integers, counts and verdicts must match exactly. Floating-point values must agree to a
// stated relative tolerance: JavaScript leaves Math.exp / Math.log accuracy to each engine,
// so a browser's V8 can differ from the Node build that produced the published numbers in
// the last one or two of 17 significant digits. Bit-exact reproduction is checked in CI on
// the same engine as the published run.
const EXACT: (keyof FamilyResult)[] = ['n', 'excluded', 'statistic', 'verdict']
const FLOAT: (keyof FamilyResult)[] = ['effect', 'ciLow', 'ciHigh', 'p', 'adjustedP']
const TOLERANCE = 1e-12

const show = (v: unknown) => (typeof v === 'number' ? (v === 0 ? '0 (underflow; < 1e-300)' : v.toPrecision(17)) : String(v))
const relDiff = (a: unknown, b: unknown) =>
  typeof a === 'number' && typeof b === 'number' && a !== b ? Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)) : 0

interface Comparison {
  exactOk: boolean
  floatsOk: boolean
  maxRel: number
  bitIdentical: boolean
}

function compare(published: FamilyResult[], recomputed: FamilyResult[]): Comparison {
  let exactOk = published.length === recomputed.length
  let maxRel = 0
  let bitIdentical = exactOk
  for (const p of published) {
    const r = recomputed.find((x) => x.hypothesisId === p.hypothesisId)
    if (!r) {
      exactOk = false
      continue
    }
    for (const k of EXACT) if (p[k] !== r[k]) exactOk = false
    if (JSON.stringify(p.counts) !== JSON.stringify(r.counts)) exactOk = false
    for (const k of FLOAT) {
      if (p[k] !== r[k]) bitIdentical = false
      maxRel = Math.max(maxRel, relDiff(p[k], r[k]))
    }
  }
  return {exactOk, floatsOk: maxRel <= TOLERANCE, maxRel, bitIdentical: bitIdentical && exactOk}
}

export function Replicator({hypothesisId, published, committedNumbersSha256, publishedNode}: Props) {
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

  const checksOk = Object.values(progress).every((s) => STEPS.every((k) => s[k] !== false))
  const cmp = result ? compare(published, result.family) : null
  const reproduced = Boolean(cmp && checksOk && cmp.exactOk && cmp.floatsOk)
  const mine = result?.family.find((r) => r.hypothesisId === hypothesisId)
  const pub = published.find((r) => r.hypothesisId === hypothesisId)

  return (
    <section aria-labelledby="replicate-run">
      <h2 id="replicate-run">Re-run it in your browser</h2>
      <p>
        Recomputes all six trials (the Holm correction needs the whole family) from the cached unit tables, with the same{' '}
        <code>lab/stats.ts</code> code. Nothing is fetched: it works with the network down. Expect 20 to 90 seconds.
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
            {published.map(({hypothesisId: id}) => (
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

      {result && cmp && (
        <div role="status" className={`banner ${reproduced ? 'banner-notice' : 'banner-failure'}`}>
          {reproduced ? (
            <>
              <strong>Reproduced in your browser</strong> in {(result.ms / 1000).toFixed(1)} s. Across all six trials every lock hash, unit-table
              hash, count and verdict is identical, and every floating-point value agrees with the published one to{' '}
              {cmp.maxRel === 0 ? 'the last bit' : `within ${cmp.maxRel.toExponential(1)} relative (tolerance ${TOLERANCE})`}.
              {!cmp.bitIdentical && (
                <>
                  {' '}
                  Not bit-identical: JavaScript leaves <code>Math.exp</code>/<code>Math.log</code> accuracy to each engine, so your browser differs
                  from {publishedNode} in the last digits. Bit-exact reproduction is checked by CI on the same engine as the published run.
                </>
              )}
            </>
          ) : (
            <>
              <strong>Not reproduced.</strong> A hash, count or verdict differs, or a value differs by more than {TOLERANCE} relative (largest:{' '}
              {cmp.maxRel.toExponential(1)}).
            </>
          )}
        </div>
      )}

      {result && mine && pub && (
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
            {[...EXACT, ...FLOAT].map((k) => (
              <tr key={k}>
                <th scope="row">{k}</th>
                <td>{show(pub[k])}</td>
                <td>{show(mine[k])}</td>
                <td>{pub[k] === mine[k] ? '✓ identical' : `within ${relDiff(pub[k], mine[k]).toExponential(1)} relative`}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">numbers SHA-256 (bit-exact, all six)</th>
              <td>
                <code className="hash">{committedNumbersSha256}</code>
              </td>
              <td>
                <code className="hash">{result.numbersSha256}</code>
              </td>
              <td>{result.numbersSha256 === committedNumbersSha256 ? '✓ identical' : 'differs (engine-level last digits; see above)'}</td>
            </tr>
          </tbody>
        </table>
      )}
    </section>
  )
}
