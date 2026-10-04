// Builds studio/import/preregistration.ndjson from the lab's locked files: proverbs,
// locations, hypotheses (definition = the locked JSON), preregistrations, deviations, errata.
// Refuses to write anything unless every lock verifies and every hypothesis document's
// definition re-hashes to its lock. Import with `sanity dataset import` (NDJSON, not a JSON array).
import {mkdirSync, readdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {canonicalize} from '../src/canonical.ts'
import {sha256Hex} from '../src/hash.ts'
import {loadRegistry} from '../src/registry.ts'

const labDir = join(import.meta.dirname, '..')
const out = join(labDir, '..', 'studio', 'import', 'preregistration.ndjson')
const registry = await loadRegistry(labDir)
if (registry.failures.length > 0) throw new Error(`Refusing: ${JSON.stringify(registry.failures)}`)

type Doc = Record<string, unknown> & {_id: string; _type: string}
const ref = (id: string, weak = false) => ({_type: 'reference', _ref: id, ...(weak ? {_weak: true} : {})})
const docs = new Map<string, Doc>()
const add = (doc: Doc) => {
  if (doc._id.includes('.')) throw new Error(`dotted id ${doc._id} would be private`)
  const existing = docs.get(doc._id)
  if (existing && JSON.stringify(existing) !== JSON.stringify(doc)) throw new Error(`conflicting documents for ${doc._id}`)
  docs.set(doc._id, doc)
}

interface Loc {_id: string; name: string; lat: number; lon: number; timeZone: string; coordinateSource: {url: string; retrievedAt: string; note: string}}
const supersededIds = new Set(registry.superseded.map((e) => e.hypothesis._id))

for (const {hypothesis: h, lock} of [...registry.active, ...registry.superseded]) {
  const proverb = h.proverb as {_id: string; text: string}
  const location = h.location as Loc
  const data = h.data as {pointLocations?: Loc[]}
  add({_id: proverb._id, _type: 'proverb', text: proverb.text, sources: []})
  for (const loc of [location, ...(data.pointLocations ?? [])]) {
    add({
      _id: loc._id,
      _type: 'location',
      name: loc.name,
      lat: loc.lat,
      lon: loc.lon,
      timeZone: loc.timeZone,
      coordinateSource: {_type: 'citation', title: 'Wikipedia coordinates API', ...loc.coordinateSource},
    })
  }
  const definition = JSON.stringify(h, null, 2)
  if ((await sha256Hex(canonicalize(JSON.parse(definition)))) !== lock.sha256) throw new Error(`${h._id}: definition does not re-hash to its lock`)
  const supersedes = h.supersedes as {hypothesisId?: string} | undefined
  add({
    _id: h._id,
    _type: 'hypothesis',
    title: proverb.text,
    status: supersededIds.has(h._id) ? 'superseded' : 'preregistered',
    version: h.version,
    draftedBy: 'agent',
    proverb: ref(proverb._id),
    location: ref(location._id),
    statement: h.statement,
    definition,
    ...(supersedes?.hypothesisId ? {supersedes: ref(supersedes.hypothesisId, true)} : {}),
  })
  add({
    _id: `preregistration-${h._id}`,
    _type: 'preregistration',
    hypothesis: ref(h._id, true),
    hypothesisId: lock.hypothesisId,
    version: lock.version,
    sha256: lock.sha256,
    canonicalJson: lock.canonicalJson,
    lockedAt: lock.lockedAt,
    lockedBy: lock.lockedBy,
    executedBy: lock.executedBy,
  })
}

for (const d of registry.deviations) {
  add({
    _id: d._id,
    _type: 'deviation',
    preregistration: ref(`preregistration-${d.preregistration.hypothesisId}`, true),
    hypothesisId: d.preregistration.hypothesisId,
    lockedSha256: d.preregistration.sha256,
    supersededBy: ref(d.supersededBy, true),
    whatChanged: d.whatChanged,
    reason: d.reason,
    consequence: d.consequence,
    createdAt: d.createdAt,
    dataSeenBeforeDeviation: d.dataSeenBeforeDeviation,
  })
}

const errataDir = join(labDir, 'errata')
for (const f of readdirSync(errataDir).filter((x) => x.endsWith('.json'))) {
  const e = JSON.parse(readFileSync(join(errataDir, f), 'utf8')) as Doc & {hypothesisId: string}
  add({...e, hypothesis: ref(e.hypothesisId, true)})
}

const order = ['proverb', 'location', 'hypothesis', 'preregistration', 'deviation', 'erratum']
const sorted = [...docs.values()].sort((a, b) => order.indexOf(a._type) - order.indexOf(b._type) || a._id.localeCompare(b._id))
mkdirSync(join(out, '..'), {recursive: true})
writeFileSync(out, sorted.map((d) => JSON.stringify(d)).join('\n') + '\n')
const counts = Object.fromEntries(order.map((t) => [t, sorted.filter((d) => d._type === t).length]))
console.log(`wrote ${sorted.length} documents to ${out}`, counts)
