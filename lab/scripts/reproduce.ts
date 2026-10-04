// Reproduces every trial from the raw snapshot and compares with the published results.
// Exits non-zero if any unit table or any number differs. Prints the true count reproduced.
//
//   node lab/scripts/reproduce.ts            compare against lab/results/ (CI)
//   node lab/scripts/reproduce.ts --write    (re)write lab/results/units/ and units.json
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {canonicalize} from '../src/canonical.ts'
import {sha256Hex} from '../src/hash.ts'
import {loadRegistry} from '../src/registry.ts'
import {loadSnapshot} from '../src/snapshot.ts'
import {analyseUnits, extractUnits, finaliseFamily, slotOf, type FamilyResult, type TrialResult} from '../src/trials.ts'

const labDir = join(import.meta.dirname, '..')
const dataDir = join(labDir, '..', 'ingest', 'data')
const resultsDir = join(labDir, 'results')
const write = process.argv.includes('--write')

const published = JSON.parse(readFileSync(join(resultsDir, 'trials-4dc5ac6ec55c.json'), 'utf8')) as {snapshotSha256: string; family: FamilyResult[]}
const registry = await loadRegistry(labDir)
if (registry.failures.length > 0) throw new Error(`lock failures: ${JSON.stringify(registry.failures)}`)
const {manifest, series} = await loadSnapshot(dataDir)
if (manifest.snapshotSha256 !== published.snapshotSha256) throw new Error('snapshot differs from the one the results were computed on')
const calls = JSON.parse(readFileSync(join(dataDir, 'groundhog', 'groundhog-calls.json'), 'utf8')).calls as Record<string, string>
const data = {series, groundhogCalls: new Map(Object.entries(calls).map(([y, c]) => [Number(y), c]))}

const unitsDir = join(resultsDir, 'units')
const indexPath = join(resultsDir, 'units.json')
const committedIndex: Record<string, string> = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : {}
const index: Record<string, string> = {}
const results: TrialResult[] = []
const problems: string[] = []
mkdirSync(unitsDir, {recursive: true})

for (const {hypothesis, lock} of registry.active) {
  const table = extractUnits(hypothesis, data)
  const json = canonicalize(table)
  index[hypothesis._id] = await sha256Hex(json)
  if (write) writeFileSync(join(unitsDir, `${hypothesis._id}.json`), json + '\n')
  else if (committedIndex[hypothesis._id] !== index[hypothesis._id]) problems.push(`${hypothesis._id}: unit table differs from the committed one`)
  results.push(await analyseUnits(hypothesis, lock, table))
}
const slots = (registry.active[0]!.hypothesis.correctionFamily as {members: string[]}).members.map(slotOf)
const family = finaliseFamily(results, slots)

let reproduced = 0
for (const r of family) {
  const p = published.family.find((x) => x.hypothesisId === r.hypothesisId)
  if (p && canonicalize(p) === canonicalize(r)) reproduced++
  else problems.push(`${r.hypothesisId}: numbers differ from the published result`)
}
if (write) writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n')
console.log(`numbers sha256: ${await sha256Hex(canonicalize(family))}`)
console.log(`reproduced ${reproduced} of ${family.length} trials from the raw snapshot`)
for (const p of problems) console.error(`DIFFERS  ${p}`)
if (problems.length > 0) process.exit(1)
