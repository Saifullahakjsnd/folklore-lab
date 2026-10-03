// Recomputes the hash of every hypothesis and compares it with its lock.
// Exits non-zero on any mismatch, missing lock or corrupt lock (used by CI).
import {existsSync, readdirSync, readFileSync} from 'node:fs'
import {join} from 'node:path'
import {checkLock, type PreregistrationLock} from '../src/preregistration.ts'

const root = join(import.meta.dirname, '..')
const files = readdirSync(join(root, 'hypotheses')).filter((f) => f.endsWith('.json')).sort()

let failures = 0
for (const file of files) {
  const hypothesis = JSON.parse(readFileSync(join(root, 'hypotheses', file), 'utf8')) as Record<string, unknown>
  const id = String(hypothesis._id)
  const lockFile = join(root, 'preregistration', `${id}.lock.json`)
  if (!existsSync(lockFile)) {
    console.error(`NOT LOCKED  ${id}`)
    failures++
    continue
  }
  const result = await checkLock(hypothesis, JSON.parse(readFileSync(lockFile, 'utf8')) as PreregistrationLock)
  if (result.ok) {
    console.log(`ok          ${id} ${result.sha256}`)
  } else {
    console.error(`${result.reason.toUpperCase()}  ${id} expected ${result.expected} got ${result.actual}`)
    failures++
  }
}
if (failures > 0) process.exit(1)
