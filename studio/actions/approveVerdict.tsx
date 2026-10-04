import {canonicalize} from '@folklore/lab/canonical'
import {sha256Hex} from '@folklore/lab/hash'
import {useEffect, useState} from 'react'
import {useClient, useCurrentUser, type DocumentActionComponent} from 'sanity'

const API_VERSION = '2026-06-09'

interface Check {
  ok: boolean
  reasons: string[]
  hypothesisId: string
  computedVerdict: string
}

// Unblinded -> Verdict approved. A person (the signed-in Studio user; robot tokens cannot sign
// in) approves the verdict the locked rules computed: there is no way to type a different one.
// Before confirming, the hypothesis is re-hashed against its pre-registration.
export const ApproveVerdictAction: DocumentActionComponent = (props) => {
  const {id, published, onComplete} = props
  const client = useClient({apiVersion: API_VERSION})
  const user = useCurrentUser()
  const [open, setOpen] = useState(false)
  const [check, setCheck] = useState<Check | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !published) return
    let cancelled = false
    void (async () => {
      const hypothesisId = String(published.hypothesisId)
      const data = await client.fetch<{definition?: string; prereg?: {sha256: string}; verdict?: string} | null>(
        `{"definition": *[_id == $h][0].definition, "prereg": *[_type == "preregistration" && hypothesisId == $h][0]{sha256}, "verdict": *[_type == "verdict" && trial._ref == $t][0]._id}`,
        {h: hypothesisId, t: id},
      )
      const reasons: string[] = []
      if (!data?.definition || !data.prereg) reasons.push('hypothesis or pre-registration not found')
      else {
        const current = await sha256Hex(canonicalize(JSON.parse(data.definition)))
        if (current !== data.prereg.sha256) reasons.push('the hypothesis no longer matches its lock: a deviation is required')
        if (published.lockSha256 !== data.prereg.sha256) reasons.push('this trial ran against a different lock hash')
      }
      if (published.blinded) reasons.push('the trial is still blinded')
      if (published.stage !== 'unblinded') reasons.push(`the trial is in stage "${String(published.stage)}", not "unblinded"`)
      if (data?.verdict) reasons.push('a verdict already exists for this trial')
      if (!cancelled) setCheck({ok: reasons.length === 0, reasons, hypothesisId, computedVerdict: String(published.computedVerdict)})
    })()
    return () => {
      cancelled = true
    }
  }, [open, published, client, id])

  if (!published || published.stage !== 'unblinded') return null

  return {
    label: 'Approve verdict',
    tone: 'positive',
    disabled: busy || !user,
    title: 'Approve the verdict the locked rules computed (a person, never the agent)',
    onHandle: () => setOpen(true),
    dialog: open
      ? {
          type: 'confirm',
          tone: 'positive',
          confirmButtonText: 'Approve',
          message: !check ? (
            'Checking the lock hash…'
          ) : check.ok ? (
            <div>
              <p>
                Approve <strong>{check.computedVerdict}</strong> for <code>{check.hypothesisId}</code>?
              </p>
              <p>This is the verdict the pre-registered rules produced. Approving publishes it to the journal under your name.</p>
            </div>
          ) : (
            <div>
              <p>Cannot approve:</p>
              <ul>
                {check.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          ),
          onCancel: () => {
            setOpen(false)
            setCheck(null)
          },
          onConfirm: async () => {
            if (!check?.ok || !user) return
            setBusy(true)
            const now = new Date().toISOString()
            const approver = `${user.name} (${user.id})`
            try {
              await client
                .transaction()
                .create({
                  _id: `verdict-${check.hypothesisId}`,
                  _type: 'verdict',
                  trial: {_type: 'reference', _ref: id},
                  outcome: check.computedVerdict,
                  approvedBy: approver,
                  approvedAt: now,
                })
                .patch(id, (p) =>
                  p
                    .set({stage: 'verdictApproved'})
                    .append('stageHistory', [
                      {_key: `approve-${Date.now()}`, _type: 'transition', from: 'unblinded', to: 'verdictApproved', at: now, by: approver, actorKind: 'person'},
                    ]),
                )
                .commit()
            } finally {
              setBusy(false)
              setOpen(false)
              setCheck(null)
              onComplete()
            }
          },
        }
      : null,
  }
}
