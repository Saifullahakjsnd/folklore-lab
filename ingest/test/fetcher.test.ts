import {existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {beforeEach, describe, expect, test} from 'vitest'
import type {Registry} from '../../lab/src/index.ts'
import {chunkPaths, FetchAborted, runFetch, type FetchDeps} from '../src/fetcher.ts'
import {buildPlan, chunkPeriods, estimateWeight, type Plan} from '../src/plan.ts'

const HOURLY = ['precipitation', 'cloud_cover', 'cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high', 'wind_gusts_10m', 'temperature_2m']
const london = {_id: 'location-london', name: 'London', lat: 51.51, lon: -0.13, timeZone: 'Europe/London'}
const west = {_id: 'location-london-west-150km', name: 'West', lat: 51.51, lon: -2.29, timeZone: 'Europe/London'}

function data(points: string[], extra: Record<string, unknown> = {}, period = {startDate: '1950-01-01', endDate: '2024-12-31'}) {
  return {
    endpoint: 'https://archive-api.open-meteo.com/v1/archive',
    models: 'era5',
    hourly: HOURLY,
    timezone: 'GMT',
    cellSelection: 'land',
    units: {temperature: 'celsius', windSpeed: 'kmh', precipitation: 'mm'},
    timeformat: 'iso8601',
    ...period,
    points,
    ...extra,
  }
}

function registry(entries: {id: string; location: object; data: object}[]): Registry {
  return {
    active: entries.map((e) => ({
      hypothesis: {_id: e.id, version: 1, location: e.location, data: e.data},
      lock: {hypothesisId: e.id, version: 1, canonicalJson: '{}', sha256: `sha-${e.id}`, lockedAt: '', lockedBy: '', executedBy: ''},
    })),
    superseded: [],
    deviations: [],
    failures: [],
  }
}

describe('plan', () => {
  test('the real shape: 4 points, 32 decade chunks, ~7,828 weighted calls', () => {
    const plan = buildPlan(
      registry([
        {id: 'h1', location: london, data: data(['location-london'])},
        {id: 'h2', location: london, data: data(['location-london', 'location-london-west-150km'], {pointLocations: [london, west]})},
        {id: 'h3', location: {...london, _id: 'location-plymouth', lat: 50.37, lon: -4.14}, data: data(['location-plymouth'])},
        {id: 'h5', location: {...london, _id: 'location-punxsutawney', lat: 40.95, lon: -78.98}, data: data(['location-punxsutawney'])},
      ]),
    )
    expect(plan.points).toHaveLength(4)
    expect(plan.chunks).toHaveLength(32)
    expect(plan.totalWeight).toBeCloseTo((4 * 27394) / 14, 6)
    expect(Math.max(...plan.chunks.map((c) => c.weight))).toBeLessThan(450)
    const url = new URL(plan.chunks[0]!.url)
    expect(url.searchParams.get('models')).toBe('era5')
    expect(url.searchParams.get('timezone')).toBe('GMT')
    expect(url.searchParams.get('hourly')).toBe(HOURLY.join(','))
  })

  test('decade chunks cover the period exactly', () => {
    const periods = chunkPeriods('1950-01-01', '2024-12-31', 10)
    expect(periods).toHaveLength(8)
    expect(periods[0]).toEqual({startDate: '1950-01-01', endDate: '1959-12-31'})
    expect(periods.at(-1)).toEqual({startDate: '2020-01-01', endDate: '2024-12-31'})
  })

  test('weight assumption: 14 days of up to 10 variables is one call', () => {
    expect(estimateWeight(14, 7)).toBe(1)
    expect(estimateWeight(14, 15)).toBe(1.5)
  })

  test('refuses a point without locked coordinates', () => {
    expect(() =>
      buildPlan(registry([{id: 'h2', location: london, data: data(['location-london', 'location-london-west-150km'])}])),
    ).toThrow(/without locked coordinates/)
  })

  test('refuses when any lock failed', () => {
    const r = registry([{id: 'h1', location: london, data: data(['location-london'])}])
    r.failures.push({hypothesisId: 'h1', problem: 'hash-mismatch'})
    expect(() => buildPlan(r)).toThrow(/Refusing to plan/)
  })

  test('refuses hypotheses that lock different data specs', () => {
    expect(() =>
      buildPlan(
        registry([
          {id: 'h1', location: london, data: data(['location-london'])},
          {id: 'h2', location: london, data: data(['location-london'], {models: 'best_match'})},
        ]),
      ),
    ).toThrow(/different data spec/)
  })
})

// --- runner, with a fake clock and a fake Open-Meteo ---

function smallPlan(): Plan {
  return buildPlan(
    registry([
      {id: 'h1', location: london, data: data(['location-london', 'location-london-west-150km'], {pointLocations: [london, west]}, {startDate: '1950-01-01', endDate: '1952-12-31'})},
    ]),
    1, // one-year chunks: 2 points x 3 years = 6 chunks of ~26 weighted calls
  )
}

function fakeBody(url: string, override: Record<string, unknown> = {}) {
  const u = new URL(url)
  const start = Date.parse(`${u.searchParams.get('start_date')}T00:00Z`)
  const end = Date.parse(`${u.searchParams.get('end_date')}T00:00Z`) + 86_400_000
  const time: string[] = []
  for (let t = start; t < end; t += 3_600_000) time.push(new Date(t).toISOString().slice(0, 16))
  const hourly: Record<string, unknown[]> = {time}
  const hourly_units: Record<string, string> = {}
  for (const v of HOURLY) {
    hourly[v] = time.map((_, i) => (i === 0 ? null : 1))
    hourly_units[v] = v === 'precipitation' ? 'mm' : v === 'wind_gusts_10m' ? 'km/h' : v === 'temperature_2m' ? '°C' : '%'
  }
  return JSON.stringify({latitude: 51.5, longitude: -0.25, elevation: 20, utc_offset_seconds: 0, hourly_units, hourly, ...override})
}

function harness(respond: (url: string, call: number) => Response | Promise<Response>) {
  let clock = Date.parse('2026-10-04T00:00:00Z')
  const calls: {url: string; t: number}[] = []
  const deps: FetchDeps = {
    fetch: async (url) => {
      calls.push({url, t: clock})
      return respond(url, calls.length)
    },
    now: () => clock,
    sleep: async (ms) => {
      clock += ms
    },
    log: () => {},
  }
  return {deps, calls, advance: (ms: number) => (clock += ms)}
}

const ok = (url: string) => new Response(fakeBody(url), {status: 200})
const options = {snapshotId: 'snapshot-test', lockManifestSha256: 'lock-manifest', limits: {maxWeightPerHour: 60, maxWeightPerMinute: 30, maxWeightPerDay: 500}}

describe('runFetch', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'folklore-ingest-'))
  })

  test('fetches every chunk with checksums, respects rolling limits, then writes the manifest', async () => {
    const plan = smallPlan()
    const {deps, calls} = harness(ok)
    const result = await runFetch(plan, dir, deps, options)
    expect(result).toMatchObject({fetched: 6, skipped: 0})
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
    expect(manifest.chunks).toHaveLength(6)
    expect(manifest.chunks[0].nullCounts.precipitation).toBe(1)
    expect(manifest.snapshotSha256).toMatch(/^[0-9a-f]{64}$/)
    // no rolling hour above 60 and no rolling minute above 30 weighted calls
    for (const c of calls) {
      const w = (span: number) => calls.filter((d) => d.t > c.t - span && d.t <= c.t).length * plan.chunks[0]!.weight
      expect(w(3_600_000)).toBeLessThanOrEqual(60)
      expect(w(60_000)).toBeLessThanOrEqual(30)
    }
    expect(calls.length).toBe(6)
  })

  test('HTTP 429 stops the run at once: no retry, no manifest, earlier chunks kept', async () => {
    const plan = smallPlan()
    const {deps, calls} = harness((url, n) => (n === 3 ? new Response('rate limited', {status: 429}) : ok(url)))
    await expect(runFetch(plan, dir, deps, options)).rejects.toThrow(/HTTP 429.*Not retrying/)
    expect(calls).toHaveLength(3)
    expect(existsSync(join(dir, 'manifest.json'))).toBe(false)
    expect(existsSync(chunkPaths(dir, plan.chunks[0]!).data)).toBe(true)
    expect(existsSync(chunkPaths(dir, plan.chunks[2]!).data)).toBe(false)
  })

  test('a re-run skips verified chunks and refetches a corrupted one', async () => {
    const plan = smallPlan()
    const first = harness((url, n) => (n === 4 ? new Response('down', {status: 503}) : ok(url)))
    await expect(runFetch(plan, dir, first.deps, options)).rejects.toThrow(FetchAborted)
    writeFileSync(chunkPaths(dir, plan.chunks[0]!).data, '{"tampered":true}')
    const second = harness(ok)
    second.advance(86_400_000) // next day, so the daily budget is fresh
    const result = await runFetch(plan, dir, second.deps, options)
    expect(second.calls.map((c) => c.url)).toEqual([plan.chunks[0]!.url, ...plan.chunks.slice(3).map((c) => c.url)])
    expect(result).toMatchObject({fetched: 4, skipped: 2})
    expect(existsSync(join(dir, 'manifest.json'))).toBe(true)
  })

  test('a malformed response aborts and saves nothing for that chunk', async () => {
    const plan = smallPlan()
    const {deps} = harness((url) => new Response(fakeBody(url, {utc_offset_seconds: 3600}), {status: 200}))
    await expect(runFetch(plan, dir, deps, options)).rejects.toThrow(/expected UTC/)
    expect(existsSync(chunkPaths(dir, plan.chunks[0]!).data)).toBe(false)
    const failed = readdirSync(join(dir, 'failed'))
    expect(failed.filter((f) => f.endsWith('.body'))).toHaveLength(1)
    expect(failed.filter((f) => f.endsWith('.json'))).toHaveLength(1)
  })

  test('an over-budget plan stops before any request', async () => {
    const plan = smallPlan()
    const {deps, calls} = harness(ok)
    await expect(runFetch(plan, dir, deps, {...options, limits: {...options.limits, maxWeightPerDay: 100}})).rejects.toThrow(/Daily budget/)
    expect(calls).toHaveLength(0)
  })
})
