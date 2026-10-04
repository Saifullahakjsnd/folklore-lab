// Runs every active locked hypothesis against the verified snapshot.
//
// BLINDED: results go to ingest/data/results/ (gitignored) and are NOT printed. The console
// shows only which trials ran or were refused, and the SHA-256 of the results file, which
// commits to the numbers without revealing them. A person unblinds; until then nobody,
// including the agent running this script, looks at effects, p-values or verdicts.
//
// Usage: node lab/scripts/run-trials.ts [path/to/groundhog-calls.json]
import {execSync} from 'node:child_process'
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {canonicalize} from '../src/canonical.ts'
import {sha256Hex} from '../src/hash.ts'
import {loadRegistry} from '../src/registry.ts'
import {loadSnapshot} from '../src/snapshot.ts'
import {finaliseFamily, runTrial, slotOf, TrialRefused, type TrialData, type TrialResult} from '../src/trials.ts'

const labDir = join(import.meta.dirname, '..')
const dataDir = join(labDir, '..', 'ingest', 'data')

const registry = await loadRegistry(labDir)
if (registry.failures.length > 0) throw new Error(`Refusing: lock failures ${JSON.stringify(registry.failures)}`)

const {manifest, series} = await loadSnapshot(dataDir)
const lockManifest = JSON.parse(readFileSync(join(labDir, 'preregistration', 'manifest.json'), 'utf8')) as {
  manifestSha256: string
  environment: {draftingModel: {model: string; version: string}}
}
if (manifest.lockManifestSha256 !== lockManifest.manifestSha256) {
  throw new Error('Refusing: the snapshot was fetched under a different lock manifest than the current one')
}
console.log(`snapshot ${manifest.snapshotId} verified (${manifest.chunks.length} chunks)`)

const callsPath = process.argv[2]
const groundhogCalls = callsPath
  ? new Map(Object.entries(JSON.parse(readFileSync(callsPath, 'utf8')).calls as Record<string, string>).map(([y, c]) => [Number(y), c]))
  : undefined
const data: TrialData = groundhogCalls ? {series, groundhogCalls} : {series}

const results: TrialResult[] = []
const refused: {hypothesisId: string; reason: string}[] = []
for (const {hypothesis, lock} of registry.active) {
  try {
    results.push(await runTrial(hypothesis, lock, data))
    console.log(`ran      ${hypothesis._id}`)
  } catch (error) {
    if (!(error instanceof TrialRefused)) throw error
    refused.push({hypothesisId: hypothesis._id, reason: error.message})
    console.log(`refused  ${hypothesis._id}: ${error.message}`)
  }
}

const familySlots = (registry.active[0]!.hypothesis.correctionFamily as {members: string[]}).members.map(slotOf)
const complete = refused.length === 0
const body = {
  blinded: true,
  runAt: new Date().toISOString(),
  gitSha: execSync('git rev-parse HEAD', {cwd: labDir}).toString().trim(),
  snapshotSha256: manifest.snapshotSha256,
  lockManifestSha256: manifest.lockManifestSha256,
  node: process.version,
  // No model computes anything here; recorded because the spec asks every result to carry it.
  draftingModel: lockManifest.environment.draftingModel,
  family: complete ? finaliseFamily(results, familySlots) : null,
  trials: results,
  refused,
  note: complete ? 'All six ran; Holm and verdicts computed.' : 'Not every trial ran; Holm-adjusted p and verdicts wait for the full family.',
}
const json = JSON.stringify(body, null, 2) + '\n'
mkdirSync(join(dataDir, 'results'), {recursive: true})
const file = join(dataDir, 'results', `trials-${manifest.snapshotSha256.slice(0, 12)}.json`)
writeFileSync(file, json)
console.log(`results written (blinded, not printed): ${file}`)
console.log(`results sha256: ${await sha256Hex(canonicalize(body))}`)
