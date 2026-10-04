// Writes web/data/replication.json: everything /replicate needs to recompute every trial in the
// browser with no network: each locked hypothesis, its lock record, its unit table (with the
// SHA-256 CI checks against the raw snapshot), and the published result.
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {canonicalize} from '../src/canonical.ts'
import {sha256Hex} from '../src/hash.ts'
import {loadRegistry} from '../src/registry.ts'
import {slotOf, type FamilyResult} from '../src/trials.ts'

const labDir = join(import.meta.dirname, '..')
const results = JSON.parse(readFileSync(join(labDir, 'results', 'trials-4dc5ac6ec55c.json'), 'utf8')) as {
  snapshotSha256: string
  gitSha: string
  runAt: string
  node: string
  family: FamilyResult[]
}
const commitment = JSON.parse(readFileSync(join(labDir, 'results', 'blinded-commitment.json'), 'utf8')) as {numbersSha256: string}
const unitsIndex = JSON.parse(readFileSync(join(labDir, 'results', 'units.json'), 'utf8')) as Record<string, string>
const registry = await loadRegistry(labDir)
if (registry.failures.length > 0) throw new Error('lock failures')
if ((await sha256Hex(canonicalize(results.family))) !== commitment.numbersSha256) throw new Error('results do not match the commitment')

const trials = []
for (const {hypothesis, lock} of registry.active) {
  const units = JSON.parse(readFileSync(join(labDir, 'results', 'units', `${hypothesis._id}.json`), 'utf8'))
  if ((await sha256Hex(canonicalize(units))) !== unitsIndex[hypothesis._id]) throw new Error(`${hypothesis._id}: unit table hash mismatch`)
  const published = results.family.find((r) => r.hypothesisId === hypothesis._id)
  if (!published) throw new Error(`${hypothesis._id}: no published result`)
  trials.push({hypothesis, lock, units, unitsSha256: unitsIndex[hypothesis._id], published})
}

const bundle = {
  snapshotSha256: results.snapshotSha256,
  numbersSha256: commitment.numbersSha256,
  resultsGitSha: results.gitSha,
  resultsRunAt: results.runAt,
  resultsNode: results.node,
  familySlots: (registry.active[0]!.hypothesis.correctionFamily as {members: string[]}).members.map(slotOf),
  trials,
}
mkdirSync(join(labDir, '..', 'web', 'data'), {recursive: true})
const out = join(labDir, '..', 'web', 'data', 'replication.json')
writeFileSync(out, JSON.stringify(bundle) + '\n')
console.log(`wrote ${out}: ${trials.length} trials, ${(JSON.stringify(bundle).length / 1024).toFixed(0)} KB`)
