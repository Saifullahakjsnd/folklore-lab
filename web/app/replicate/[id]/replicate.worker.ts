// Recomputes every trial in the visitor's browser with the same lab code that produced the
// published results: check each lock hash, check each unit table's hash, run lab/stats.ts,
// apply Holm across the family and the locked verdict rules, and hash the numbers.
import {canonicalize} from '@folklore/lab/canonical'
import {sha256Hex} from '@folklore/lab/hash'
import {checkLock} from '@folklore/lab/preregistration'
import {analyseUnits, finaliseFamily, type TrialResult} from '@folklore/lab/trials'
import bundleJson from '../../../data/replication.json'
import type {ReplicationBundle, WorkerMessage} from '../../../lib/replication'

const bundle = bundleJson as unknown as ReplicationBundle
const post = (m: WorkerMessage) => postMessage(m)

addEventListener('message', async () => {
  const t0 = performance.now()
  try {
    const results: TrialResult[] = []
    for (const t of bundle.trials) {
      const id = t.hypothesis._id
      const lock = await checkLock(t.hypothesis, t.lock)
      post({type: 'progress', hypothesisId: id, step: 'lock', ok: lock.ok, ...(lock.ok ? {} : {detail: lock.reason})})
      const unitsHash = await sha256Hex(canonicalize(t.units))
      post({type: 'progress', hypothesisId: id, step: 'units', ok: unitsHash === t.unitsSha256})
      results.push(await analyseUnits(t.hypothesis, t.lock, t.units))
      post({type: 'progress', hypothesisId: id, step: 'statistics', ok: true})
    }
    const family = finaliseFamily(results, bundle.familySlots)
    post({type: 'done', family, numbersSha256: await sha256Hex(canonicalize(family)), ms: performance.now() - t0})
  } catch (error) {
    post({type: 'error', message: (error as Error).message})
  }
})
