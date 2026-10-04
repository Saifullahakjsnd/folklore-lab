import {canonicalize} from '@folklore/lab/canonical'
import {sha256Hex} from '@folklore/lab/hash'
import {useAuthToken, useCurrentUser, useQuery} from '@sanity/sdk-react'
import {useEffect, useState} from 'react'

interface DetailData {
  _id: string
  title: string
  definition: string
  prereg: {sha256: string; canonicalJson: string; lockedAt: string; lockedBy: string} | null
  trial: {
    _id: string
    stage: string
    blinded: boolean
    lockSha256: string
    computedVerdict: string
    effect: number
    effectUnits: string
    ciLow: number
    ciHigh: number
    adjustedP: number
  } | null
  verdict: {_id: string; outcome: string; approvedBy: string; approvedAt: string} | null
  deviations: {_id: string; whatChanged: string; dataSeenBeforeDeviation: boolean}[]
  errata: {_id: string; field: string; locked: string; correct: string}[]
}

const QUERY = `*[_id == $id][0]{
  _id, title, definition,
  "prereg": *[_type == "preregistration" && hypothesisId == ^._id][0]{sha256, canonicalJson, lockedAt, lockedBy},
  "trial": *[_type == "trial" && hypothesisId == ^._id] | order(runAt desc)[0]{_id, stage, blinded, lockSha256, computedVerdict, effect, effectUnits, ciLow, ciHigh, adjustedP},
  "verdict": *[_type == "verdict" && trial._ref in *[_type == "trial" && hypothesisId == ^.^._id]._id][0]{_id, outcome, approvedBy, approvedAt},
  "deviations": *[_type == "deviation" && (hypothesisId == ^._id || supersededBy._ref == ^._id)]{_id, whatChanged, dataSeenBeforeDeviation},
  "errata": *[_type == "erratum" && hypothesisId == ^._id]{_id, field, locked, correct}
}`

const fmtP = (p: number) => (p === 0 ? '< 1e-300' : p < 0.001 ? p.toExponential(2) : p.toFixed(3))

export function Detail({hypothesisId}: {hypothesisId: string}) {
  const {data} = useQuery<DetailData | null>({query: QUERY, params: {id: hypothesisId}})
  const user = useCurrentUser()
  const token = useAuthToken()
  const [recomputed, setRecomputed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!data?.definition) return
    let cancelled = false
    void sha256Hex(canonicalize(JSON.parse(data.definition))).then((h) => !cancelled && setRecomputed(h))
    return () => {
      cancelled = true
    }
  }, [data?.definition])

  if (!data) return <p className="pad">Not found.</p>
  const lockMatches = Boolean(data.prereg && recomputed === data.prereg.sha256)
  const trial = data.trial
  const canApprove = Boolean(trial && trial.stage === 'unblinded' && !trial.blinded && !data.verdict && lockMatches && trial.lockSha256 === data.prereg?.sha256 && user)

  // Approval goes through the server, which identifies you from your own token, checks the
  // curator allowlist and the lock hash, and writes the verdict with a server-held token.
  const approve = async () => {
    if (!trial || !canApprove) return
    if (!token) {
      setMessage('No session token is available in this app; approve from the Studio instead.')
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('https://folklore-lab.vercel.app/api/verdicts/approve', {
        method: 'POST',
        headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
        body: JSON.stringify({trialId: trial._id}),
      })
      const body = (await res.json()) as {ok: boolean; outcome?: string; reasons?: string[]}
      setMessage(body.ok ? `Approved by the server: ${body.outcome}` : `Refused (HTTP ${res.status}): ${(body.reasons ?? []).join('; ')}`)
    } catch (error) {
      setMessage(`Approval request failed: ${(error as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="detail" aria-label={`Details for ${data.title}`}>
      <h2>{data.title}</h2>
      <p className="muted">
        Public mirror: <a href={`https://folklore-lab.vercel.app/trial/${data._id}`}>folklore-lab.vercel.app/trial/{data._id}</a>
      </p>

      <h3>Lock</h3>
      {data.prereg ? (
        <dl>
          <dt>Stored SHA-256</dt>
          <dd>
            <code>{data.prereg.sha256}</code>
          </dd>
          <dt>Recomputed now</dt>
          <dd>
            <code>{recomputed ?? '…'}</code> {recomputed && (lockMatches ? '✓ matches' : '✗ MISMATCH: deviation required')}
          </dd>
          <dt>Locked</dt>
          <dd>
            {data.prereg.lockedAt} by {data.prereg.lockedBy}
          </dd>
        </dl>
      ) : (
        <p className="warn">Not locked.</p>
      )}
      <details>
        <summary>Canonical JSON (the hashed bytes)</summary>
        <pre>{data.prereg?.canonicalJson}</pre>
      </details>

      <h3>Result</h3>
      {!trial ? (
        <p className="muted">No trial yet.</p>
      ) : trial.blinded ? (
        <p className="muted">Analysed, still blinded.</p>
      ) : (
        <p>
          <strong>{trial.computedVerdict}</strong>: {trial.effect.toFixed(2)} {trial.effectUnits} [{trial.ciLow.toFixed(2)}, {trial.ciHigh.toFixed(2)}], Holm p{' '}
          {fmtP(trial.adjustedP)}
        </p>
      )}
      {data.verdict ? (
        <p>
          Verdict approved by {data.verdict.approvedBy} at {data.verdict.approvedAt}.
        </p>
      ) : (
        <button type="button" onClick={approve} disabled={!canApprove || busy}>
          {busy ? 'Approving…' : `Approve verdict${trial ? `: ${trial.computedVerdict}` : ''}`}
        </button>
      )}
      {message && <p role="status">{message}</p>}

      <h3>Deviation log</h3>
      {data.deviations.length === 0 && data.errata.length === 0 ? (
        <p className="muted">None.</p>
      ) : (
        <ul>
          {data.deviations.map((d) => (
            <li key={d._id}>
              <strong>{d._id}</strong> ({d.dataSeenBeforeDeviation ? 'after' : 'before'} any data): {d.whatChanged}
            </li>
          ))}
          {data.errata.map((e) => (
            <li key={e._id}>
              <strong>{e._id}</strong> (erratum, not a deviation): {e.field} locked as “{e.locked}”, correct is “{e.correct}”.
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
