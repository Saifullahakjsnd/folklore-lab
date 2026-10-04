import {canonicalize} from '@folklore/lab/canonical'
import {sha256Hex} from '@folklore/lab/hash'
import {missingFields} from '@folklore/lab/preregistration'
import {useEffect, useState} from 'react'
import {useClient, useCurrentUser, type DocumentActionComponent} from 'sanity'

type Preview = {ok: true; json: string; sha: string; version: number} | {ok: false; error: string}

// Draft -> Pre-registered. Shows the canonical JSON and its hash before confirming, then
// creates the preregistration document (create fails if one already exists: write-once)
// and marks the hypothesis locked, in one transaction.
export const LockHypothesisAction: DocumentActionComponent = (props) => {
  const {id, draft, published, onComplete} = props
  const client = useClient({apiVersion: '2026-06-09'})
  const user = useCurrentUser()
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !published) return
    let cancelled = false
    try {
      const parsed = JSON.parse(String(published.definition ?? '')) as Record<string, unknown>
      const missing = missingFields(parsed)
      if (missing.length > 0) {
        setPreview({ok: false, error: `Missing required fields: ${missing.join(', ')}`})
        return
      }
      if (parsed._id !== id) {
        setPreview({ok: false, error: `definition._id is "${String(parsed._id)}", document is "${id}"`})
        return
      }
      const json = canonicalize(parsed)
      void sha256Hex(json).then((sha) => !cancelled && setPreview({ok: true, json, sha, version: Number(parsed.version)}))
    } catch (error) {
      setPreview({ok: false, error: (error as Error).message})
    }
    return () => {
      cancelled = true
    }
  }, [open, published, id])

  const status = String(published?.status ?? draft?.status ?? 'draft')
  if (status !== 'draft') return null

  const isRobot = Boolean(user?.id.startsWith('p-'))
  const blocked = Boolean(draft) || !published || isRobot
  return {
    label: 'Lock (pre-register)',
    tone: 'critical',
    disabled: blocked || busy,
    title: isRobot
      ? 'Only a person can lock a hypothesis'
      : draft || !published
        ? 'Publish first: only the published version can be locked'
        : 'Hash the definition and lock it before any data is seen',
    onHandle: () => setOpen(true),
    dialog: open
      ? {
          type: 'confirm',
          tone: 'critical',
          confirmButtonText: 'Lock it',
          message: !preview ? (
            'Computing hash…'
          ) : preview.ok ? (
            <div>
              <p>
                Locking is permanent. After this, any change is a <strong>deviation</strong> and a new version.
              </p>
              <p>
                SHA-256: <code>{preview.sha}</code>
              </p>
              <pre style={{maxHeight: 300, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 11}}>
                {preview.json}
              </pre>
            </div>
          ) : (
            <p>Cannot lock: {preview.error}</p>
          ),
          onCancel: () => {
            setOpen(false)
            setPreview(null)
          },
          onConfirm: async () => {
            if (!preview?.ok || !user || isRobot) return
            setBusy(true)
            try {
              await client
                .transaction()
                .create({
                  _id: `preregistration-${id}`,
                  _type: 'preregistration',
                  hypothesis: {_type: 'reference', _ref: id, _weak: true},
                  hypothesisId: id,
                  version: preview.version,
                  sha256: preview.sha,
                  canonicalJson: preview.json,
                  lockedAt: new Date().toISOString(),
                  lockedBy: `${user.name} (${user.id})`,
                  executedBy: 'Folklore Lab Studio: Lock action',
                })
                .patch(id, (p) => p.set({status: 'preregistered'}))
                .commit()
            } finally {
              setBusy(false)
              setOpen(false)
              setPreview(null)
              onComplete()
            }
          },
        }
      : null,
  }
}
