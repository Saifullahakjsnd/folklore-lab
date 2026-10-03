// Usage: node scripts/fetch.ts [--dry-run]
// Verifies every lock, builds the plan from locked content and downloads the snapshot.
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {loadRegistry} from '../../lab/src/index.ts'
import {FetchAborted, runFetch} from '../src/fetcher.ts'
import {buildPlan} from '../src/plan.ts'

const labDir = join(import.meta.dirname, '..', '..', 'lab')
const dataDir = join(import.meta.dirname, '..', 'data')

const registry = await loadRegistry(labDir)
const plan = buildPlan(registry) // throws if any lock fails
const lockManifest = JSON.parse(readFileSync(join(labDir, 'preregistration', 'manifest.json'), 'utf8')) as {manifestSha256: string}

console.log(`locks verified: ${plan.hypotheses.map((h) => h.hypothesisId).join(', ')}`)
console.log(`points: ${plan.points.map((p) => `${p._id} (${p.lat}, ${p.lon})`).join('; ')}`)
console.log(`chunks: ${plan.chunks.length}, estimated weight: ${plan.totalWeight.toFixed(1)} calls`)

if (process.argv.includes('--dry-run')) {
  for (const chunk of plan.chunks) console.log(`${chunk.weight.toFixed(1).padStart(6)}  ${chunk.url}`)
  process.exit(0)
}

try {
  const result = await runFetch(
    plan,
    dataDir,
    {
      fetch: (url, init) => fetch(url, init),
      now: () => Date.now(),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      log: (line) => console.log(`[${new Date().toISOString()}] ${line}`),
    },
    {snapshotId: 'snapshot-era5-hourly-1950-2024-v1', lockManifestSha256: lockManifest.manifestSha256},
  )
  console.log(`done: fetched ${result.fetched}, skipped ${result.skipped}, manifest ${result.manifestFile}`)
} catch (error) {
  if (error instanceof FetchAborted) {
    console.error(`ABORTED: ${error.message}`)
    process.exit(2)
  }
  throw error
}
