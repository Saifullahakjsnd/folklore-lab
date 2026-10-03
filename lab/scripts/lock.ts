// Locks every hypothesis in lab/hypotheses that has no lock yet. Existing locks are
// never overwritten: an edit to a locked hypothesis must go through a deviation and a
// new version, not a re-lock.
import {existsSync, readdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {canonicalize} from '../src/canonical.ts'
import {sha256Hex} from '../src/hash.ts'
import {lockHypothesis, type PreregistrationLock} from '../src/preregistration.ts'

const root = join(import.meta.dirname, '..')
const hypothesesDir = join(root, 'hypotheses')
const locksDir = join(root, 'preregistration')

const lockedBy = process.env.LOCKED_BY
if (!lockedBy) throw new Error('Set LOCKED_BY to the person authorising the lock')
const executedBy = process.env.EXECUTED_BY ?? 'unspecified'
const lockedAt = new Date().toISOString()

// Recorded with the locks; it drafts prose only and produces no number.
const environment = {
  draftingModel: {
    provider: 'Google Gemini API (generativelanguage.googleapis.com/v1beta)',
    model: 'gemini-3.7-flash',
    version: '3.7-flash-08-2026',
    stability: 'stable (non-preview), released 2026-08-13',
    deprecation: 'No shutdown date announced (https://ai.google.dev/gemini-api/docs/deprecations, retrieved 2026-10-04)',
    verifiedAt: '2026-10-04',
  },
  hypothesisAuthor: 'Operational definitions drafted by Claude Code (claude-opus-5-5); decisions approved by the project owner.',
  weatherDataFetchedBeforeLock: false,
}

const lockPath = (id: string) => join(locksDir, `${id}.lock.json`)
const files = readdirSync(hypothesesDir).filter((f) => f.endsWith('.json')).sort()

const locks: PreregistrationLock[] = []
for (const file of files) {
  const hypothesis = JSON.parse(readFileSync(join(hypothesesDir, file), 'utf8')) as Record<string, unknown>
  const id = String(hypothesis._id)
  if (existsSync(lockPath(id))) {
    console.log(`already locked, left untouched: ${id}`)
    locks.push(JSON.parse(readFileSync(lockPath(id), 'utf8')) as PreregistrationLock)
    continue
  }
  const lock = await lockHypothesis(hypothesis, {lockedAt, lockedBy, executedBy})
  writeFileSync(lockPath(id), JSON.stringify(lock, null, 2) + '\n', {flag: 'wx'})
  console.log(`locked ${id} sha256=${lock.sha256}`)
  locks.push(lock)
}

const body = {
  locks: locks.map(({hypothesisId, version, sha256, lockedAt, lockedBy}) => ({hypothesisId, version, sha256, lockedAt, lockedBy})),
  environment,
}
const manifest = {...body, manifestSha256: await sha256Hex(canonicalize(body))}
writeFileSync(join(locksDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`manifest sha256=${manifest.manifestSha256}`)
