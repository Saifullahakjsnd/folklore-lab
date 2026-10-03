// Recomputes the hash of every hypothesis and compares it with its lock, and checks that
// every deviation points at a verified old version and a locked replacement.
// Exits non-zero on any failure (used by CI).
import {join} from 'node:path'
import {loadRegistry} from '../src/registry.ts'

const registry = await loadRegistry(join(import.meta.dirname, '..'))
for (const {lock} of registry.active) console.log(`ok          ${lock.hypothesisId} ${lock.sha256}`)
for (const {lock} of registry.superseded) console.log(`superseded  ${lock.hypothesisId} ${lock.sha256}`)
for (const d of registry.deviations) console.log(`deviation   ${d._id}: ${d.preregistration.hypothesisId} -> ${d.supersededBy}`)
for (const f of registry.failures) console.error(`FAIL        ${f.hypothesisId}: ${f.problem}`)
if (registry.failures.length > 0) process.exit(1)
