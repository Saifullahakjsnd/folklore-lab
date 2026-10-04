// Downloads the planned chunks into a snapshot directory.
//
// Safeguards: each chunk is written to a temp file and renamed only when complete, with a
// sidecar recording its query URL, retrieval time and SHA-256. Any HTTP error (including 429)
// or malformed response stops the run at once, with no retries. A re-run skips chunks
// whose bytes still match their recorded checksum. The snapshot manifest is written only
// after every chunk is present and verified, so a partial download never looks complete.
import {existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, appendFileSync} from 'node:fs'
import {dirname, join, relative} from 'node:path'
import {canonicalize} from '../../lab/src/index.ts'
import type {Chunk, Plan} from './plan.ts'

export interface RateLimits {
  maxWeightPerHour: number
  maxWeightPerMinute: number
  maxWeightPerDay: number
}

// Open-Meteo free tier: < 10,000 calls/day, 5,000/hour, 600/minute. We stay well below.
export const DEFAULT_LIMITS: RateLimits = {maxWeightPerHour: 4000, maxWeightPerMinute: 450, maxWeightPerDay: 9500}

export interface FetchDeps {
  fetch: (url: string, init: {headers: Record<string, string>}) => Promise<Response>
  now: () => number
  sleep: (ms: number) => Promise<void>
  log: (line: string) => void
}

export interface ChunkMeta {
  pointId: string
  startDate: string
  endDate: string
  queryUrl: string
  retrievedAt: string
  sha256: string
  bytes: number
  estimatedWeight: number
  grid: {latitude: number; longitude: number; elevation: number | null}
  hours: number
  nullCounts: Record<string, number>
}

export class FetchAborted extends Error {}

const USER_AGENT = 'folklore-lab snapshot fetcher (non-commercial research; github.com/Saifullahakjsnd/folklore-lab)'
const HOUR_MS = 3_600_000
const MINUTE_MS = 60_000
const DAY_MS = 86_400_000

export const chunkPaths = (dataDir: string, chunk: Pick<Chunk, 'point' | 'startDate' | 'endDate'>) => {
  const base = join(dataDir, 'raw', chunk.point._id, `${chunk.point._id}_${chunk.startDate}_${chunk.endDate}`)
  return {data: `${base}.json`, meta: `${base}.meta.json`}
}

export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

function writeAtomic(file: string, contents: string | Uint8Array) {
  mkdirSync(dirname(file), {recursive: true})
  const tmp = `${file}.tmp`
  writeFileSync(tmp, contents)
  renameSync(tmp, file)
}

async function verifiedMeta(dataDir: string, chunk: Chunk): Promise<ChunkMeta | null> {
  const paths = chunkPaths(dataDir, chunk)
  if (!existsSync(paths.data) || !existsSync(paths.meta)) return null
  const meta = JSON.parse(readFileSync(paths.meta, 'utf8')) as ChunkMeta
  if (meta.queryUrl !== chunk.url) return null
  return (await sha256Bytes(readFileSync(paths.data))) === meta.sha256 ? meta : null
}

interface LedgerEntry {
  t: number
  weight: number
}

function readLedger(logFile: string): LedgerEntry[] {
  if (!existsSync(logFile)) return []
  return readFileSync(logFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as {t: string; weight: number})
    .map((e) => ({t: Date.parse(e.t), weight: e.weight}))
}

const usedSince = (ledger: LedgerEntry[], since: number) =>
  ledger.filter((e) => e.t > since).reduce((sum, e) => sum + e.weight, 0)

// Earliest time at which `weight` more units fit inside the rolling window.
function readyAt(ledger: LedgerEntry[], now: number, windowMs: number, max: number, weight: number): number {
  const inWindow = ledger.filter((e) => e.t > now - windowMs).sort((a, b) => a.t - b.t)
  let used = inWindow.reduce((sum, e) => sum + e.weight, 0)
  let at = now
  for (const e of inWindow) {
    if (used + weight <= max) break
    used -= e.weight
    at = e.t + windowMs + 1
  }
  return used + weight <= max ? at : Number.POSITIVE_INFINITY
}

function validate(body: Uint8Array, chunk: Chunk, plan: Plan): Omit<ChunkMeta, 'queryUrl' | 'retrievedAt' | 'sha256' | 'bytes' | 'estimatedWeight' | 'pointId' | 'startDate' | 'endDate'> {
  let json: {
    error?: boolean
    reason?: string
    latitude: number
    longitude: number
    elevation?: number
    utc_offset_seconds: number
    hourly?: Record<string, unknown[]>
    hourly_units?: Record<string, string>
  }
  try {
    json = JSON.parse(new TextDecoder().decode(body))
  } catch {
    throw new FetchAborted(`${chunk.url}: response is not JSON`)
  }
  if (json.error) throw new FetchAborted(`${chunk.url}: API error: ${json.reason}`)
  if (json.utc_offset_seconds !== 0) throw new FetchAborted(`${chunk.url}: expected UTC, got offset ${json.utc_offset_seconds}`)
  const hourly = json.hourly
  if (!hourly || !Array.isArray(hourly.time)) throw new FetchAborted(`${chunk.url}: no hourly.time array`)
  if (hourly.time.length !== chunk.expectedHours) {
    throw new FetchAborted(`${chunk.url}: expected ${chunk.expectedHours} hours, got ${hourly.time.length}`)
  }
  const first = `${chunk.startDate}T00:00`
  if (hourly.time[0] !== first) throw new FetchAborted(`${chunk.url}: first timestamp ${String(hourly.time[0])}, expected ${first}`)
  const expectedUnits: Record<string, string> = {precipitation: 'mm', wind_gusts_10m: 'km/h', temperature_2m: '°C'}
  const nullCounts: Record<string, number> = {}
  for (const variable of plan.spec.hourly) {
    const series = hourly[variable]
    if (!Array.isArray(series) || series.length !== chunk.expectedHours) {
      throw new FetchAborted(`${chunk.url}: variable ${variable} missing or wrong length`)
    }
    const unit = expectedUnits[variable] ?? (variable.startsWith('cloud_cover') ? '%' : undefined)
    if (unit && json.hourly_units?.[variable] !== unit) {
      throw new FetchAborted(`${chunk.url}: ${variable} unit ${json.hourly_units?.[variable]}, expected ${unit}`)
    }
    nullCounts[variable] = series.filter((v) => v === null).length
  }
  return {
    grid: {latitude: json.latitude, longitude: json.longitude, elevation: json.elevation ?? null},
    hours: hourly.time.length,
    nullCounts,
  }
}

export interface RunResult {
  fetched: number
  skipped: number
  manifestFile: string
}

export async function runFetch(
  plan: Plan,
  dataDir: string,
  deps: FetchDeps,
  options: {limits?: RateLimits; snapshotId: string; lockManifestSha256: string},
): Promise<RunResult> {
  const limits = options.limits ?? DEFAULT_LIMITS
  const logFile = join(dataDir, 'fetch-log.ndjson')
  const ledger = readLedger(logFile)

  const pending: Chunk[] = []
  const metas = new Map<Chunk, ChunkMeta>()
  for (const chunk of plan.chunks) {
    const meta = await verifiedMeta(dataDir, chunk)
    if (meta) metas.set(chunk, meta)
    else pending.push(chunk)
  }
  const pendingWeight = pending.reduce((sum, c) => sum + c.weight, 0)
  const usedToday = usedSince(ledger, deps.now() - DAY_MS)
  if (usedToday + pendingWeight > limits.maxWeightPerDay) {
    throw new FetchAborted(
      `Daily budget: ${usedToday.toFixed(1)} used in the last 24 h + ${pendingWeight.toFixed(1)} pending > ${limits.maxWeightPerDay}. Stopping before any request.`,
    )
  }
  deps.log(`${metas.size} chunks verified on disk, ${pending.length} to fetch (~${pendingWeight.toFixed(1)} weighted calls)`)

  for (const chunk of pending) {
    const paths = chunkPaths(dataDir, chunk)
    rmSync(paths.data, {force: true})
    rmSync(paths.meta, {force: true})

    const now = deps.now()
    const at = Math.max(
      readyAt(ledger, now, HOUR_MS, limits.maxWeightPerHour, chunk.weight),
      readyAt(ledger, now, MINUTE_MS, limits.maxWeightPerMinute, chunk.weight),
    )
    if (!Number.isFinite(at)) throw new FetchAborted(`Chunk weight ${chunk.weight} exceeds a rate window on its own`)
    if (at > now) {
      deps.log(`rate limit: waiting ${Math.ceil((at - now) / 1000)} s`)
      await deps.sleep(at - now)
    }

    const startedAt = deps.now()
    ledger.push({t: startedAt, weight: chunk.weight})
    let response: Response
    try {
      response = await deps.fetch(chunk.url, {headers: {'User-Agent': USER_AGENT}})
    } catch (error) {
      appendLog(logFile, startedAt, chunk, 'network-error')
      throw new FetchAborted(`${chunk.url}: network error: ${(error as Error).message}`)
    }
    appendLog(logFile, startedAt, chunk, response.status)
    if (!response.ok) {
      const text = (await response.text()).slice(0, 300)
      throw new FetchAborted(`${chunk.url}: HTTP ${response.status} ${text}. Not retrying.`)
    }
    const body = new Uint8Array(await response.arrayBuffer())
    let checked: ReturnType<typeof validate>
    try {
      checked = validate(body, chunk, plan)
    } catch (error) {
      // Keep the rejected bytes so the failure can be diagnosed instead of retried blind.
      const stem = join(dataDir, 'failed', `${new Date(startedAt).toISOString().replace(/[:.]/g, '-')}_${chunk.point._id}_${chunk.startDate}`)
      writeAtomic(`${stem}.body`, body)
      writeAtomic(
        `${stem}.json`,
        JSON.stringify({url: chunk.url, status: response.status, contentType: response.headers.get('content-type'), bytes: body.byteLength, error: (error as Error).message}, null, 2) + '\n',
      )
      throw error
    }
    const meta: ChunkMeta = {
      pointId: chunk.point._id,
      startDate: chunk.startDate,
      endDate: chunk.endDate,
      queryUrl: chunk.url,
      retrievedAt: new Date(startedAt).toISOString(),
      sha256: await sha256Bytes(body),
      bytes: body.byteLength,
      estimatedWeight: chunk.weight,
      ...checked,
    }
    writeAtomic(paths.data, body)
    writeAtomic(paths.meta, JSON.stringify(meta, null, 2) + '\n')
    metas.set(chunk, meta)
    deps.log(`saved ${relative(dataDir, paths.data)} sha256=${meta.sha256.slice(0, 12)} grid=${meta.grid.latitude},${meta.grid.longitude}`)
  }

  // Every chunk must re-verify from disk before the manifest exists.
  for (const chunk of plan.chunks) {
    if (!(await verifiedMeta(dataDir, chunk))) throw new FetchAborted(`${chunk.url}: not verified on disk; no manifest written`)
  }
  const body = {
    snapshotId: options.snapshotId,
    source: 'Open-Meteo Historical Weather API',
    attribution: 'Weather data by Open-Meteo.com (https://open-meteo.com/), CC BY 4.0. Reanalysis: Copernicus Climate Change Service (C3S) ERA5, ECMWF.',
    licence: 'https://creativecommons.org/licenses/by/4.0/',
    lockManifestSha256: options.lockManifestSha256,
    hypotheses: plan.hypotheses,
    spec: plan.spec,
    weightAssumption: '(days / 14) * max(1, variables / 10); unconfirmed, see docs/BUILD_LOG.md',
    totalEstimatedWeight: plan.totalWeight,
    chunks: plan.chunks.map((chunk) => {
      const meta = metas.get(chunk)
      if (!meta) throw new FetchAborted('unreachable: chunk without meta')
      return {...meta, file: relative(dataDir, chunkPaths(dataDir, chunk).data).replaceAll('\\', '/')}
    }),
  }
  const snapshotSha256 = await sha256Bytes(new TextEncoder().encode(canonicalize(body)))
  const manifestFile = join(dataDir, 'manifest.json')
  writeAtomic(manifestFile, JSON.stringify({...body, snapshotSha256}, null, 2) + '\n')
  deps.log(`manifest written: ${plan.chunks.length} chunks, snapshotSha256=${snapshotSha256}`)
  return {fetched: pending.length, skipped: plan.chunks.length - pending.length, manifestFile}
}

function appendLog(logFile: string, t: number, chunk: Chunk, status: number | string) {
  mkdirSync(dirname(logFile), {recursive: true})
  appendFileSync(logFile, JSON.stringify({t: new Date(t).toISOString(), url: chunk.url, weight: chunk.weight, status}) + '\n')
}
