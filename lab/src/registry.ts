import {existsSync, readdirSync, readFileSync} from 'node:fs'
import {join} from 'node:path'
import {checkLock, type LockCheck, type PreregistrationLock} from './preregistration.ts'

export type Hypothesis = Record<string, unknown> & {_id: string; version: number}

// A deviation records why a locked hypothesis was replaced. The superseded version keeps
// its lock (history is never rewritten); the new version must be locked in its own right.
export interface Deviation {
  _id: string
  _type: 'deviation'
  preregistration: {hypothesisId: string; sha256: string}
  supersededBy: string
  whatChanged: string
  reason: string
  consequence: string
  createdAt: string
  dataSeenBeforeDeviation: boolean
}

export interface RegistryEntry {
  hypothesis: Hypothesis
  lock: PreregistrationLock
}

export interface Registry {
  active: RegistryEntry[]
  superseded: RegistryEntry[]
  deviations: Deviation[]
  failures: {hypothesisId: string; problem: string}[]
}

const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T

const jsonFiles = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : []

const describe = (result: Exclude<LockCheck, {ok: true}>) =>
  `${result.reason}: lock ${result.expected}, recomputed ${result.actual}`

// Loads every hypothesis with its lock and checks each hash. Anything that fails is reported
// in `failures`; callers that act on data (fetch, trial) must refuse to run if it is non-empty.
export async function loadRegistry(labDir: string): Promise<Registry> {
  const deviations = jsonFiles(join(labDir, 'deviations')).map((f) => readJson<Deviation>(join(labDir, 'deviations', f)))
  const supersededIds = new Set(deviations.map((d) => d.preregistration.hypothesisId))
  const registry: Registry = {active: [], superseded: [], deviations, failures: []}
  const locked = new Map<string, PreregistrationLock>()

  for (const file of jsonFiles(join(labDir, 'hypotheses'))) {
    const hypothesis = readJson<Hypothesis>(join(labDir, 'hypotheses', file))
    const lockFile = join(labDir, 'preregistration', `${hypothesis._id}.lock.json`)
    if (!existsSync(lockFile)) {
      registry.failures.push({hypothesisId: hypothesis._id, problem: 'not locked'})
      continue
    }
    const lock = readJson<PreregistrationLock>(lockFile)
    const result = await checkLock(hypothesis, lock)
    if (!result.ok) {
      registry.failures.push({hypothesisId: hypothesis._id, problem: describe(result)})
      continue
    }
    locked.set(hypothesis._id, lock)
    ;(supersededIds.has(hypothesis._id) ? registry.superseded : registry.active).push({hypothesis, lock})
  }

  for (const d of deviations) {
    const old = locked.get(d.preregistration.hypothesisId)
    if (!old) registry.failures.push({hypothesisId: d.preregistration.hypothesisId, problem: `deviation ${d._id} names an unverified hypothesis`})
    else if (old.sha256 !== d.preregistration.sha256) {
      registry.failures.push({hypothesisId: d.preregistration.hypothesisId, problem: `deviation ${d._id} cites a different hash`})
    }
    if (!locked.has(d.supersededBy)) {
      registry.failures.push({hypothesisId: d.supersededBy, problem: `replacement named by deviation ${d._id} is not locked`})
    }
  }
  return registry
}
