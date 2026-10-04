// Trial runner on SYNTHETIC series only. No weather data is used in tests.
import {join} from 'node:path'
import {beforeAll, describe, expect, test} from 'vitest'
import {lockHypothesis} from '../src/preregistration.ts'
import {loadRegistry, type Registry} from '../src/registry.ts'
import {makeSeries, sumTenths, type PointSeries} from '../src/series.ts'
import {mulberry32} from '../src/stats.ts'
import {HOUR_MS} from '../src/time.ts'
import {finaliseFamily, rateUnitsFor, runTrial, slotOf, TrialRefused, type TrialData} from '../src/trials.ts'

const START = Date.parse('1950-01-01T00:00:00Z')
const HOURS = (Date.parse('2025-01-01T00:00:00Z') - START) / HOUR_MS
const VARS = ['precipitation', 'cloud_cover', 'cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high', 'wind_gusts_10m', 'temperature_2m']

function synthetic(pointId: string, seed: number): PointSeries {
  const rng = mulberry32(seed)
  const raw: Record<string, (number | null)[]> = Object.fromEntries(VARS.map((v) => [v, new Array<number | null>(HOURS)]))
  for (let i = 0; i < HOURS; i++) {
    raw.precipitation![i] = rng() < 0.12 ? Math.round(rng() * 30) / 10 : 0
    for (const c of ['cloud_cover', 'cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high']) raw[c]![i] = Math.floor(rng() * 101)
    raw.wind_gusts_10m![i] = 10 + Math.round(rng() * 60)
    raw.temperature_2m![i] = Math.round((5 + 10 * Math.sin((2 * Math.PI * i) / 8766) + rng() * 6) * 10) / 10
  }
  return makeSeries(pointId, START, raw)
}

function blank(pointId: string): PointSeries {
  return makeSeries(pointId, START, Object.fromEntries(VARS.map((v) => [v, new Array(HOURS).fill(0)])))
}

let registry: Registry
let data: TrialData
const familySlots = [
  'hypothesis-rain-before-seven',
  'hypothesis-red-sky-at-night',
  'hypothesis-mackerel-sky',
  'hypothesis-st-swithins-day',
  'hypothesis-groundhog-day',
  'hypothesis-ring-around-the-moon',
]

beforeAll(async () => {
  registry = await loadRegistry(join(import.meta.dirname, '..'))
  const calls = new Map<number, string>()
  const rng = mulberry32(7)
  for (let y = 1950; y <= 2024; y++) calls.set(y, rng() < 0.85 ? 'shadow' : 'no shadow')
  calls.set(1960, 'no record') // excluded by the locked rule
  data = {
    series: new Map(
      ['location-london', 'location-london-west-150km', 'location-plymouth', 'location-punxsutawney'].map((id, i) => [id, synthetic(id, 100 + i)]),
    ),
    groundhogCalls: calls,
  }
})

const entry = (slot: string) => {
  const e = registry.active.find((x) => slotOf(x.hypothesis._id) === slot)
  if (!e) throw new Error(`no active ${slot}`)
  return e
}

describe('the real locks run end to end on synthetic data', () => {
  test('six trials, Holm across the family, a verdict each, deterministic', async () => {
    const results = []
    for (const {hypothesis, lock} of registry.active) results.push(await runTrial(hypothesis, lock, data))
    const family = finaliseFamily(results, familySlots)
    expect(family).toHaveLength(6)
    for (const r of family) {
      expect(r.adjustedP).toBeGreaterThanOrEqual(r.p)
      expect(r.ciLow).toBeLessThanOrEqual(r.ciHigh)
      expect(['Supported', 'Contradicted', 'Not supported', 'Inconclusive']).toContain(r.verdict)
    }
    const h5 = family.find((r) => r.slot === 'hypothesis-groundhog-day')!
    expect(h5.n).toBe(74)
    expect(h5.excluded).toBe(1)
    const h4 = family.find((r) => r.slot === 'hypothesis-st-swithins-day')!
    expect(h4.n).toBe(75)
    const h1 = family.find((r) => r.slot === 'hypothesis-rain-before-seven')!
    expect(h1.n).toBe(27394)

    const again = await runTrial(entry('hypothesis-rain-before-seven').hypothesis, entry('hypothesis-rain-before-seven').lock, data)
    expect(again).toEqual(h1 && results.find((r) => r.slot === 'hypothesis-rain-before-seven'))
  }, 300_000)
})

describe('pre-registration is enforced at trial time', () => {
  test('a hypothesis edited after lock is refused', async () => {
    const {hypothesis, lock} = entry('hypothesis-rain-before-seven')
    const edited = {...hypothesis, predictor: {...(hypothesis.predictor as object), threshold: 0.3}}
    await expect(runTrial(edited, lock, data)).rejects.toThrow(/hash-mismatch; file a deviation/)
  })

  test('a lock whose definition differs from what the runner implements is refused', async () => {
    const {hypothesis} = entry('hypothesis-rain-before-seven')
    const changed = {...hypothesis, _id: 'hypothesis-rain-before-seven-v9', outcome: {...(hypothesis.outcome as object), comparator: '<='}}
    const lock = await lockHypothesis(changed, {lockedAt: 'test', lockedBy: 'test', executedBy: 'test'})
    await expect(runTrial(changed, lock, data)).rejects.toThrow(TrialRefused)
  })
})

describe('operational definitions on hand-built series', () => {
  const at = (iso: string) => (Date.parse(iso) - START) / HOUR_MS

  test('H1: rain stamped 07:00 BST counts for 05:00-07:00; rain stamped 05:00 BST does not', () => {
    const london = blank('location-london')
    const p = london.values.precipitation!
    p[at('2024-07-01T06:00:00Z')] = 2 // 0.2 mm in 06:00-07:00 local (BST)
    p[at('2024-07-02T04:00:00Z')] = 5 // 0.5 mm in 04:00-05:00 local: outside the window
    p[at('2024-07-03T10:00:00Z')] = 2 // 0.2 mm in 10:00-11:00 local: before the outcome window
    p[at('2024-07-03T05:00:00Z')] = 2 // and 0.2 mm in 05:00-06:00 local: predictor
    const {days, units} = rateUnitsFor(entry('hypothesis-rain-before-seven').hypothesis, {series: new Map([['location-london', london]])})
    const flags = (d: string) => {
      const i = days.indexOf(d)
      return [units.predictor[i], units.outcome[i], units.excluded[i]]
    }
    expect(flags('2024-07-01')).toEqual([1, 1, 0])
    expect(flags('2024-07-02')).toEqual([0, 1, 0])
    expect(flags('2024-07-03')).toEqual([1, 1, 0])
  }, 60_000)

  test('H1 in British Standard Time (January 1970): the window is 04:00-06:00 UTC', () => {
    const london = blank('location-london')
    london.values.precipitation![at('1970-01-15T07:00:00Z')] = 2 // covers 06:00-07:00 UTC = 07:00-08:00 BST: outside
    london.values.precipitation![at('1970-01-16T05:00:00Z')] = 2 // covers 04:00-05:00 UTC = 05:00-06:00 BST: inside
    const {days, units} = rateUnitsFor(entry('hypothesis-rain-before-seven').hypothesis, {series: new Map([['location-london', london]])})
    expect(units.predictor[days.indexOf('1970-01-15')]).toBe(0)
    expect(units.predictor[days.indexOf('1970-01-16')]).toBe(1)
  }, 60_000)

  test('a missing hour excludes the unit instead of counting it as dry', () => {
    const london = blank('location-london')
    london.values.precipitation![at('2024-07-01T11:00:00Z')] = Number.NaN // 11:00-12:00 BST
    const {days, units} = rateUnitsFor(entry('hypothesis-rain-before-seven').hypothesis, {series: new Map([['location-london', london]])})
    expect(units.excluded[days.indexOf('2024-07-01')]).toBe(1)
  }, 60_000)

  test('precipitation sums are exact: 0.2 + 0.7 + 0.1 mm reaches 1 mm', () => {
    const s = makeSeries('p', START, {precipitation: [0.2, 0.7, 0.1]})
    expect(0.2 + 0.7 + 0.1).toBeLessThan(1) // the floating-point trap
    expect(sumTenths(s, [START + HOUR_MS * 0, START + HOUR_MS, START + 2 * HOUR_MS])).toBe(10)
  })
})
