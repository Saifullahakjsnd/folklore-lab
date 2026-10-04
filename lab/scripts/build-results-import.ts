// Builds studio/import/results.ndjson from the snapshot manifest and the unblinded results:
// one dataSnapshot document (chunks as an array) and one trial document per hypothesis.
// Verdict documents are NOT created here: approving a verdict is a person's action.
import {readFileSync, writeFileSync} from 'node:fs'
import {basename, join} from 'node:path'
import {canonicalize} from '../src/canonical.ts'
import {sha256Hex} from '../src/hash.ts'
import {loadRegistry} from '../src/registry.ts'
import type {FamilyResult} from '../src/trials.ts'

const labDir = join(import.meta.dirname, '..')
const RELEASE = 'https://github.com/Saifullahakjsnd/folklore-lab/releases/download/snapshot-era5-hourly-1950-2024-v1'
const resultsFile = process.argv[2]
const unblindedAt = process.argv[3]
if (!resultsFile || !unblindedAt) throw new Error('usage: build-results-import.ts <results.json> <unblindedAt ISO>')

const manifest = JSON.parse(readFileSync(join(labDir, '..', 'ingest', 'data', 'manifest.json'), 'utf8'))
const results = JSON.parse(readFileSync(resultsFile, 'utf8')) as {
  runAt: string
  gitSha: string
  snapshotSha256: string
  family: FamilyResult[]
}
const commitment = JSON.parse(readFileSync(join(labDir, 'results', 'blinded-commitment.json'), 'utf8'))
if ((await sha256Hex(canonicalize(results.family))) !== commitment.numbersSha256) throw new Error('results do not match the blinded commitment')
if (results.snapshotSha256 !== manifest.snapshotSha256) throw new Error('results were computed on a different snapshot')

const registry = await loadRegistry(labDir)
const lockOf = new Map(registry.active.map((e) => [e.hypothesis._id, e.lock]))
const snapshotId = 'snapshot-era5-hourly-1950-2024-v1'
const fetchedAt = (manifest.chunks as {retrievedAt: string}[]).map((c) => c.retrievedAt).sort().at(-1)

const docs: Record<string, unknown>[] = [
  {
    _id: snapshotId,
    _type: 'dataSnapshot',
    snapshotId: manifest.snapshotId,
    source: manifest.source,
    attribution: manifest.attribution,
    licence: manifest.licence,
    snapshotSha256: manifest.snapshotSha256,
    lockManifestSha256: manifest.lockManifestSha256,
    spec: JSON.stringify(manifest.spec, null, 2),
    chunks: manifest.chunks.map((c: Record<string, unknown> & {grid: {latitude: number; longitude: number}}, i: number) => ({
      _key: `chunk-${i}`,
      _type: 'chunk',
      pointId: c.pointId,
      startDate: c.startDate,
      endDate: c.endDate,
      queryUrl: c.queryUrl,
      retrievedAt: c.retrievedAt,
      sha256: c.sha256,
      bytes: c.bytes,
      fileUrl: `${RELEASE}/${basename(String(c.file))}`,
      gridLatitude: c.grid.latitude,
      gridLongitude: c.grid.longitude,
    })),
  },
]

for (const r of results.family) {
  const lock = lockOf.get(r.hypothesisId)
  if (!lock || lock.sha256 !== r.lockSha256) throw new Error(`${r.hypothesisId}: result lock hash does not match the current lock`)
  docs.push({
    _id: `trial-${r.hypothesisId}`,
    _type: 'trial',
    preregistration: {_type: 'reference', _ref: `preregistration-${r.hypothesisId}`, _weak: true},
    hypothesisId: r.hypothesisId,
    slot: r.slot,
    lockSha256: r.lockSha256,
    dataSnapshot: {_type: 'reference', _ref: snapshotId, _weak: true},
    snapshotSha256: results.snapshotSha256,
    stage: 'unblinded',
    stageHistory: [
      {_key: 'h1', _type: 'transition', from: 'draft', to: 'preregistered', at: lock.lockedAt, by: lock.lockedBy, actorKind: 'person'},
      {_key: 'h2', _type: 'transition', from: 'preregistered', to: 'dataFetched', at: fetchedAt, by: 'ingest/scripts/fetch.ts', actorKind: 'runtime'},
      {_key: 'h3', _type: 'transition', from: 'dataFetched', to: 'analysedBlinded', at: results.runAt, by: 'lab/scripts/run-trials.ts', actorKind: 'runtime'},
      {
        _key: 'h4',
        _type: 'transition',
        from: 'analysedBlinded',
        to: 'unblinded',
        at: unblindedAt,
        by: 'Claude Code, on the owner’s instruction (see docs/BUILD_LOG.md)',
        actorKind: 'agent',
        note: 'Results matched the blinded commitment 28df6c2f… before being read.',
      },
    ],
    test: r.test,
    n: r.n,
    excluded: r.excluded,
    counts: Object.entries(r.counts).map(([name, value], i) => ({_key: `c${i}`, _type: 'count', name, value})),
    ...(r.statistic === null ? {} : {statistic: r.statistic}),
    p: r.p,
    adjustedP: r.adjustedP,
    effect: r.effect,
    effectUnits: r.effectUnits,
    ciLow: r.ciLow,
    ciHigh: r.ciHigh,
    undefinedResamples: r.undefinedResamples,
    nullValue: r.nullValue,
    sesoi: r.sesoi,
    computedVerdict: r.verdict,
    blinded: false,
    runAt: results.runAt,
    gitSha: results.gitSha,
    reproducedInCi: false,
  })
}

const out = join(labDir, '..', 'studio', 'import', 'results.ndjson')
writeFileSync(out, docs.map((d) => JSON.stringify(d)).join('\n') + '\n')
console.log(`wrote ${docs.length} documents (1 snapshot, ${docs.length - 1} trials) to ${out}`)
