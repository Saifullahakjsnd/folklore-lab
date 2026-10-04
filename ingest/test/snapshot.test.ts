// Fetch -> load, end to end, offline: the real fetcher writes a snapshot from a fake
// Open-Meteo, and lab's loader verifies and reads it back.
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, test} from 'vitest'
import type {Registry} from '../../lab/src/index.ts'
import {at} from '../../lab/src/series.ts'
import {loadSnapshot, SnapshotInvalid} from '../../lab/src/snapshot.ts'
import {chunkPaths, runFetch, type FetchDeps} from '../src/fetcher.ts'
import {buildPlan} from '../src/plan.ts'

const HOURLY = ['precipitation', 'cloud_cover', 'cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high', 'wind_gusts_10m', 'temperature_2m']
const london = {_id: 'location-london', name: 'London', lat: 51.51, lon: -0.13, timeZone: 'Europe/London'}

function plan() {
  const data = {
    endpoint: 'https://archive-api.open-meteo.com/v1/archive',
    models: 'era5',
    hourly: HOURLY,
    timezone: 'GMT',
    cellSelection: 'land',
    units: {temperature: 'celsius', windSpeed: 'kmh', precipitation: 'mm'},
    timeformat: 'iso8601',
    startDate: '1950-01-01',
    endDate: '1951-12-31',
    points: ['location-london'],
  }
  const registry: Registry = {
    active: [{hypothesis: {_id: 'h', version: 1, location: london, data}, lock: {hypothesisId: 'h', version: 1, canonicalJson: '{}', sha256: 'x', lockedAt: '', lockedBy: '', executedBy: ''}}],
    superseded: [],
    deviations: [],
    failures: [],
  }
  return buildPlan(registry, 1)
}

// Hour index i carries precipitation i % 7 tenths, so values are checkable after loading.
function body(url: string) {
  const u = new URL(url)
  const start = Date.parse(`${u.searchParams.get('start_date')}T00:00Z`)
  const end = Date.parse(`${u.searchParams.get('end_date')}T00:00Z`) + 86_400_000
  const time: string[] = []
  for (let t = start; t < end; t += 3_600_000) time.push(new Date(t).toISOString().slice(0, 16))
  const hourly: Record<string, unknown[]> = {time}
  const hourly_units: Record<string, string> = {}
  for (const v of HOURLY) {
    hourly[v] = time.map((iso) => (v === 'precipitation' ? ((Date.parse(`${iso}Z`) / 3_600_000) % 7) / 10 : 50))
    hourly_units[v] = v === 'precipitation' ? 'mm' : v === 'wind_gusts_10m' ? 'km/h' : v === 'temperature_2m' ? '°C' : '%'
  }
  return JSON.stringify({latitude: 51.5, longitude: -0.25, elevation: 20, utc_offset_seconds: 0, hourly_units, hourly})
}

async function snapshot() {
  const dir = mkdtempSync(join(tmpdir(), 'folklore-snapshot-'))
  let clock = Date.parse('2026-10-04T00:00:00Z')
  const deps: FetchDeps = {
    fetch: async (url) => new Response(body(url), {status: 200}),
    now: () => clock,
    sleep: async (ms) => {
      clock += ms
    },
    log: () => {},
  }
  const p = plan()
  await runFetch(p, dir, deps, {snapshotId: 's', lockManifestSha256: 'l'})
  return {dir, p}
}

describe('snapshot round trip', () => {
  test('loads a verified snapshot into one contiguous series per point', async () => {
    const {dir} = await snapshot()
    const {series, manifest} = await loadSnapshot(dir)
    expect(manifest.chunks).toHaveLength(2)
    const s = series.get('location-london')!
    expect(s.length).toBe(730 * 24)
    const t = Date.parse('1951-03-01T05:00:00Z')
    expect(at(s, 'precipitation', t)).toBe((t / 3_600_000) % 7) // stored in tenths
    expect(at(s, 'cloud_cover', t)).toBe(50)
  })

  test('a chunk whose bytes changed after download is refused', async () => {
    const {dir, p} = await snapshot()
    const file = chunkPaths(dir, p.chunks[1]!).data
    writeFileSync(file, readFileSync(file, 'utf8').replace('"elevation":20', '"elevation":21'))
    await expect(loadSnapshot(dir)).rejects.toThrow(SnapshotInvalid)
  })

  test('an edited manifest is refused', async () => {
    const {dir} = await snapshot()
    const path = join(dir, 'manifest.json')
    const m = JSON.parse(readFileSync(path, 'utf8'))
    m.lockManifestSha256 = 'something else'
    writeFileSync(path, JSON.stringify(m))
    await expect(loadSnapshot(dir)).rejects.toThrow(/manifest hash/)
  })
})
