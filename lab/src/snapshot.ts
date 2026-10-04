// Loads a weather snapshot written by ingest/: verifies the manifest's own hash and every
// chunk's SHA-256 before reading a single value, checks that each point's chunks join
// hour to hour, and returns one hourly series per point. Refuses on any mismatch: a trial
// must never run on data that differs from what was downloaded.
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {canonicalize} from './canonical.ts'
import {makeSeries, type PointSeries} from './series.ts'
import {HOUR_MS} from './time.ts'

export class SnapshotInvalid extends Error {}

interface ManifestChunk {
  pointId: string
  startDate: string
  endDate: string
  sha256: string
  file: string
  queryUrl: string
}

export interface SnapshotManifest {
  snapshotId: string
  snapshotSha256: string
  lockManifestSha256: string
  spec: {hourly: string[]}
  chunks: ManifestChunk[]
  [key: string]: unknown
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function loadSnapshot(dataDir: string): Promise<{manifest: SnapshotManifest; series: Map<string, PointSeries>}> {
  const manifest = JSON.parse(readFileSync(join(dataDir, 'manifest.json'), 'utf8')) as SnapshotManifest
  const {snapshotSha256, ...body} = manifest
  const recomputed = await sha256Bytes(new TextEncoder().encode(canonicalize(body)))
  if (recomputed !== snapshotSha256) throw new SnapshotInvalid(`manifest hash ${recomputed} != recorded ${snapshotSha256}`)

  const byPoint = new Map<string, {start: number; values: Record<string, (number | null)[]>; end: number}[]>()
  for (const chunk of manifest.chunks) {
    const bytes = readFileSync(join(dataDir, chunk.file))
    const sha = await sha256Bytes(bytes)
    if (sha !== chunk.sha256) throw new SnapshotInvalid(`${chunk.file}: sha256 ${sha} != manifest ${chunk.sha256}`)
    const json = JSON.parse(new TextDecoder().decode(bytes)) as {utc_offset_seconds: number; hourly: Record<string, unknown[]>}
    if (json.utc_offset_seconds !== 0) throw new SnapshotInvalid(`${chunk.file}: not UTC`)
    const time = json.hourly.time as string[]
    const start = Date.parse(`${time[0]}:00Z`)
    const values: Record<string, (number | null)[]> = {}
    for (const v of manifest.spec.hourly) values[v] = json.hourly[v] as (number | null)[]
    const list = byPoint.get(chunk.pointId) ?? []
    list.push({start, values, end: start + (time.length - 1) * HOUR_MS})
    byPoint.set(chunk.pointId, list)
  }

  const series = new Map<string, PointSeries>()
  for (const [pointId, chunks] of byPoint) {
    chunks.sort((a, b) => a.start - b.start)
    for (let i = 1; i < chunks.length; i++) {
      if (chunks[i]!.start !== chunks[i - 1]!.end + HOUR_MS) {
        throw new SnapshotInvalid(`${pointId}: gap or overlap between chunks at ${new Date(chunks[i - 1]!.end).toISOString()}`)
      }
    }
    const joined: Record<string, (number | null)[]> = {}
    for (const v of manifest.spec.hourly) joined[v] = chunks.flatMap((c) => c.values[v]!)
    series.set(pointId, makeSeries(pointId, chunks[0]!.start, joined))
  }
  return {manifest, series}
}
