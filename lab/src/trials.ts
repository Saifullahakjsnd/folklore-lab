// Turns a locked hypothesis plus snapshot series into a trial result, and a family of six
// results into Holm-adjusted p-values and verdicts.
//
// Each hypothesis's operational definition is implemented literally below. Thresholds are
// read from the locked content, and every structural element the code implements
// (comparators, units, windows, period) is asserted against the lock, so an edited lock can
// never be silently computed some other way. A trial is refused unless the lock verifies.
import {moonAltitudeDeg, moonFraction, sunsetHour} from './astronomy.ts'
import {checkLock, type PreregistrationLock} from './preregistration.ts'
import type {Hypothesis} from './registry.ts'
import {at, maxOf, mmToTenths, sumTenths, type PointSeries} from './series.ts'
import {binomTest, circularBlockBootstrap, fisherExact, holm, mannWhitneyU, stratifiedBootstrap, verdict, type Verdict} from './stats.ts'
import {accumulationStamps, addDays, DAY_MS, hourInstants, instantsWithLocalTimeBetween, localDay, localToUtc} from './time.ts'

export class TrialRefused extends Error {}

export interface TrialData {
  series: ReadonlyMap<string, PointSeries>
  /** Punxsutawney Phil's recorded call per year (H5 only). */
  groundhogCalls?: ReadonlyMap<number, string>
}

export interface TrialResult {
  hypothesisId: string
  lockSha256: string
  slot: string
  test: string
  n: number
  excluded: number
  counts: Record<string, number>
  statistic: number | null
  p: number
  effect: number
  effectUnits: string
  ciLow: number
  ciHigh: number
  undefinedResamples: number
  nullValue: number
  sesoi: number
}

export interface FamilyResult extends TrialResult {
  adjustedP: number
  verdict: Verdict
}

// ---------- lock assertions ----------

type Json = Record<string, unknown>
const obj = (v: unknown, what: string): Json => {
  if (typeof v !== 'object' || v === null) throw new TrialRefused(`lock field ${what} is missing`)
  return v as Json
}
function expectLock(actual: unknown, expected: unknown, what: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TrialRefused(`lock ${what} is ${JSON.stringify(actual)}; the runner implements ${JSON.stringify(expected)}`)
  }
}
function condition(block: Json, variable: string): Json {
  const list = block.conditions as Json[]
  const c = list.find((x) => x.variable === variable)
  if (!c) throw new TrialRefused(`lock has no condition on ${variable}`)
  return c
}
const num = (v: unknown, what: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new TrialRefused(`lock ${what} is not a number`)
  return v
}

/** Slot = hypothesis id without its version suffix, e.g. "hypothesis-red-sky-at-night". */
export const slotOf = (id: string) => id.replace(/-v\d+$/, '')

function point(h: Hypothesis, data: TrialData, id: string): PointSeries {
  const s = data.series.get(id)
  if (!s) throw new TrialRefused(`no snapshot series for ${id}`)
  return s
}

function dates(first: string, last: string): string[] {
  const out: string[] = []
  for (let d = first; d <= last; d = addDays(d, 1)) out.push(d)
  return out
}

// ---------- rate hypotheses (H1, H2, H3, H6) ----------

interface RateUnits {
  predictor: Uint8Array
  outcome: Uint8Array
  excluded: Uint8Array
}

function rateUnits(n: number, evaluate: (i: number) => {predictor: boolean; outcome: boolean} | null): RateUnits {
  const units = {predictor: new Uint8Array(n), outcome: new Uint8Array(n), excluded: new Uint8Array(n)}
  for (let i = 0; i < n; i++) {
    const r = evaluate(i)
    if (r === null) units.excluded[i] = 1
    else {
      units.predictor[i] = r.predictor ? 1 : 0
      units.outcome[i] = r.outcome ? 1 : 0
    }
  }
  return units
}

function analyseRate(h: Hypothesis, units: RateUnits, base: Pick<TrialResult, 'hypothesisId' | 'lockSha256' | 'slot'>): TrialResult {
  const bootstrap = obj(h.bootstrap, 'bootstrap')
  expectLock(bootstrap.method, 'circular block bootstrap (Politis & Romano)', 'bootstrap.method')
  expectLock(obj(h.effect, 'effect').units, 'percentage points', 'effect.units')
  expectLock(obj(h.test, 'test').name, "Fisher's exact test", 'test.name')
  const n = units.predictor.length
  const tally = (indices: ArrayLike<number>) => {
    let a = 0, b = 0, c = 0, d = 0
    for (let k = 0; k < indices.length; k++) {
      const i = indices[k]!
      if (units.excluded[i]) continue
      if (units.predictor[i]) units.outcome[i] ? a++ : b++
      else units.outcome[i] ? c++ : d++
    }
    return {a, b, c, d}
  }
  const effectOf = ({a, b, c, d}: {a: number; b: number; c: number; d: number}) =>
    a + b === 0 ? null : 100 * (a / (a + b) - (a + c) / (a + b + c + d))
  const all = Int32Array.from({length: n}, (_, i) => i)
  const counts = tally(all)
  const effect = effectOf(counts)
  if (effect === null) throw new TrialRefused(`${h._id}: no unit has the predictor`)
  const boot = circularBlockBootstrap(
    n,
    num(bootstrap.blockLength, 'bootstrap.blockLength'),
    num(bootstrap.resamples, 'bootstrap.resamples'),
    num(obj(bootstrap.prng, 'bootstrap.prng').seed, 'seed'),
    (idx) => effectOf(tally(idx)),
  )
  return {
    ...base,
    test: "Fisher's exact test",
    n: n - countOnes(units.excluded),
    excluded: countOnes(units.excluded),
    counts: {predictorOutcome: counts.a, predictorNoOutcome: counts.b, noPredictorOutcome: counts.c, noPredictorNoOutcome: counts.d},
    statistic: null,
    p: fisherExact(counts.a, counts.b, counts.c, counts.d),
    effect,
    effectUnits: 'percentage points',
    ciLow: boot.ciLow,
    ciHigh: boot.ciHigh,
    undefinedResamples: boot.undefinedResamples,
    nullValue: 0,
    sesoi: num(obj(h.smallestEffect, 'smallestEffect').value, 'smallestEffect.value'),
  }
}

const countOnes = (a: Uint8Array) => a.reduce((s, v) => s + v, 0)

function checkPeriod(h: Hypothesis) {
  const period = obj(h.period, 'period')
  expectLock([period.start, period.end], ['1950-01-01', '2024-12-31'], 'period')
}

function h1(h: Hypothesis, data: TrialData) {
  checkPeriod(h)
  const pred = obj(h.predictor, 'predictor')
  const out = obj(h.outcome, 'outcome')
  expectLock([pred.variable, pred.hours, pred.aggregation, pred.comparator], ['precipitation', {from: '05:00 D', to: '07:00 D', interval: '[from, to) local'}, 'sum', '>='], 'H1 predictor')
  expectLock([out.variable, out.hours, out.aggregation, out.comparator], ['precipitation', {from: '11:00 D', to: '12:00 D', interval: '[from, to) local'}, 'sum', '<'], 'H1 outcome')
  const loc = obj(h.location, 'location')
  const tz = String(loc.timeZone)
  const s = point(h, data, String(loc._id))
  const predMin = mmToTenths(num(pred.threshold, 'predictor.threshold'))
  const outMax = mmToTenths(num(out.threshold, 'outcome.threshold'))
  const days = dates('1950-01-01', '2024-12-31')
  return {
    days,
    units: rateUnits(days.length, (i) => {
      const d = days[i]!
      const early = sumTenths(s, accumulationStamps(localToUtc(d, '05:00', tz), localToUtc(d, '07:00', tz)))
      const late = sumTenths(s, accumulationStamps(localToUtc(d, '11:00', tz), localToUtc(d, '12:00', tz)))
      if (Number.isNaN(early) || Number.isNaN(late)) return null
      return {predictor: early >= predMin, outcome: late < outMax}
    }),
  }
}

function h2(h: Hypothesis, data: TrialData) {
  checkPeriod(h)
  const pred = obj(h.predictor, 'predictor')
  const out = obj(h.outcome, 'outcome')
  const west = condition(pred, 'cloud_cover')
  const overhead = condition(pred, 'cloud_cover_mid + cloud_cover_high')
  expectLock([west.point, west.comparator, overhead.point, overhead.comparator], ['location-london-west-150km', '<=', 'location-london', '>='], 'H2 predictor conditions')
  expectLock([out.variable, out.aggregation, out.comparator], ['precipitation', 'sum', '<'], 'H2 outcome')
  const loc = obj(h.location, 'location')
  const tz = String(loc.timeZone)
  const [lat, lon] = [num(loc.lat, 'lat'), num(loc.lon, 'lon')]
  const london = point(h, data, 'location-london')
  const westSeries = point(h, data, 'location-london-west-150km')
  const westMax = num(west.threshold, 'west threshold')
  const overheadMin = num(overhead.threshold, 'overhead threshold')
  const outMax = mmToTenths(num(out.threshold, 'outcome.threshold'))
  const days = dates('1950-01-01', '2024-12-30')
  return {
    days,
    units: rateUnits(days.length, (i) => {
      const d = days[i]!
      const H = sunsetHour(d, lat, lon, tz)
      const w = at(westSeries, 'cloud_cover', H)
      const mh = at(london, 'cloud_cover_mid', H) + at(london, 'cloud_cover_high', H)
      const next = localDay(addDays(d, 1), tz)
      const rain = sumTenths(london, accumulationStamps(next.start, next.end))
      if (Number.isNaN(w) || Number.isNaN(mh) || Number.isNaN(rain)) return null
      return {predictor: w <= westMax && mh >= overheadMin, outcome: rain < outMax}
    }),
  }
}

function h3(h: Hypothesis, data: TrialData) {
  checkPeriod(h)
  const pred = obj(h.predictor, 'predictor')
  const out = obj(h.outcome, 'outcome')
  const high = condition(pred, 'cloud_cover_high')
  const low = condition(pred, 'cloud_cover_low')
  const rain = condition(out, 'precipitation')
  const gust = condition(out, 'wind_gusts_10m')
  expectLock([high.comparator, low.comparator, rain.comparator, gust.comparator, out.aggregation], ['>=', '<=', '>=', '>=', 'any condition true'], 'H3 comparators')
  expectLock(obj(pred.hours, 'hours').anchor, 'instant T0 = 09:00 local D', 'H3 anchor')
  const loc = obj(h.location, 'location')
  const tz = String(loc.timeZone)
  const s = point(h, data, String(loc._id))
  const [highMin, lowMax] = [num(high.threshold, 'high'), num(low.threshold, 'low')]
  const [rainMin, gustMin] = [mmToTenths(num(rain.threshold, 'rain')), num(gust.threshold, 'gust')]
  const days = dates('1950-01-01', '2024-12-30')
  return {
    days,
    units: rateUnits(days.length, (i) => {
      const t0 = localToUtc(days[i]!, '09:00', tz)
      const hi = at(s, 'cloud_cover_high', t0)
      const lo = at(s, 'cloud_cover_low', t0)
      const window = accumulationStamps(t0, t0 + DAY_MS)
      const total = sumTenths(s, window)
      const maxGust = maxOf(s, 'wind_gusts_10m', window)
      if ([hi, lo, total, maxGust].some(Number.isNaN)) return null
      return {predictor: hi >= highMin && lo <= lowMax, outcome: total >= rainMin || maxGust >= gustMin}
    }),
  }
}

function h6(h: Hypothesis, data: TrialData) {
  checkPeriod(h)
  const pred = obj(h.predictor, 'predictor')
  const out = obj(h.outcome, 'outcome')
  const high = condition(pred, 'cloud_cover_high')
  const low = condition(pred, 'cloud_cover_low')
  const alt = condition(pred, 'moon altitude')
  const frac = condition(pred, 'moon illuminated fraction')
  expectLock([high.comparator, low.comparator, alt.comparator, frac.comparator], ['>=', '<=', '>', '>='], 'H6 comparators')
  expectLock(alt.threshold, 0, 'H6 moon altitude threshold (zero, so degrees and radians agree)')
  expectLock(pred.aggregation, 'at least one instant where every condition holds at once', 'H6 aggregation')
  expectLock([out.comparator, out.aggregation], ['>=', 'sum'], 'H6 outcome')
  const loc = obj(h.location, 'location')
  const tz = String(loc.timeZone)
  const [lat, lon] = [num(loc.lat, 'lat'), num(loc.lon, 'lon')]
  const s = point(h, data, String(loc._id))
  const [highMin, lowMax, fracMin] = [num(high.threshold, 'high'), num(low.threshold, 'low'), num(frac.threshold, 'fraction')]
  const rainMin = mmToTenths(num(out.threshold, 'outcome.threshold'))
  const days = dates('1950-01-01', '2024-12-29')
  return {
    days,
    units: rateUnits(days.length, (i) => {
      const d = days[i]!
      const instants = instantsWithLocalTimeBetween(d, '22:00', addDays(d, 1), '02:00', tz)
      let halo = false
      for (const t of instants) {
        const hi = at(s, 'cloud_cover_high', t)
        const lo = at(s, 'cloud_cover_low', t)
        if (Number.isNaN(hi) || Number.isNaN(lo)) return null
        if (!halo && hi >= highMin && lo <= lowMax && moonAltitudeDeg(t, lat, lon) > 0 && moonFraction(t) >= fracMin) halo = true
      }
      const later = localDay(addDays(d, 2), tz)
      const rain = sumTenths(s, accumulationStamps(later.start, later.end))
      if (Number.isNaN(rain)) return null
      return {predictor: halo, outcome: rain >= rainMin}
    }),
  }
}

// ---------- yearly hypotheses (H4, H5) ----------

function dailyTenths(s: PointSeries, date: string, tz: string): number {
  const {start, end} = localDay(date, tz)
  return sumTenths(s, accumulationStamps(start, end))
}

function h4(h: Hypothesis, data: TrialData, base: Pick<TrialResult, 'hypothesisId' | 'lockSha256' | 'slot'>): TrialResult {
  checkPeriod(h)
  const pred = obj(h.predictor, 'predictor')
  const out = obj(h.outcome, 'outcome')
  expectLock([pred.comparator, out.aggregation], ['>=', 'count of local days with daily precipitation >= 1 mm'], 'H4 definition')
  expectLock(obj(h.test, 'test').name, 'Mann-Whitney U', 'test.name')
  expectLock(obj(h.bootstrap, 'bootstrap').method, 'stratified bootstrap of years', 'bootstrap.method')
  const loc = obj(h.location, 'location')
  const tz = String(loc.timeZone)
  const s = point(h, data, String(loc._id))
  const wetMin = mmToTenths(num(pred.threshold, 'predictor.threshold'))
  const rainyMin = mmToTenths(num(out.threshold, 'outcome.threshold'))
  const wet: number[] = []
  const dry: number[] = []
  let excluded = 0
  for (let year = 1950; year <= 2024; year++) {
    const swithin = dailyTenths(s, `${year}-07-15`, tz)
    const window = dates(`${year}-07-16`, `${year}-08-24`).map((d) => dailyTenths(s, d, tz))
    if (Number.isNaN(swithin) || window.some(Number.isNaN)) {
      excluded++
      continue
    }
    const rainyDays = window.filter((v) => v >= rainyMin).length
    ;(swithin >= wetMin ? wet : dry).push(rainyDays)
  }
  if (wet.length === 0 || dry.length === 0) throw new TrialRefused(`${h._id}: a group is empty (wet ${wet.length}, dry ${dry.length})`)
  const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const bootstrap = obj(h.bootstrap, 'bootstrap')
  const boot = stratifiedBootstrap([wet.length, dry.length], num(bootstrap.resamples, 'resamples'), num(obj(bootstrap.prng, 'prng').seed, 'seed'), ([w, d]) =>
    mean(Array.from(w!, (i) => wet[i]!)) - mean(Array.from(d!, (i) => dry[i]!)),
  )
  const mw = mannWhitneyU(wet, dry)
  return {
    ...base,
    test: 'Mann-Whitney U',
    n: wet.length + dry.length,
    excluded,
    counts: {wetYears: wet.length, dryYears: dry.length},
    statistic: mw.U,
    p: mw.p,
    effect: mean(wet) - mean(dry),
    effectUnits: 'days',
    ciLow: boot.ciLow,
    ciHigh: boot.ciHigh,
    undefinedResamples: boot.undefinedResamples,
    nullValue: 0,
    sesoi: num(obj(h.smallestEffect, 'smallestEffect').value, 'smallestEffect.value'),
  }
}

function h5(h: Hypothesis, data: TrialData, base: Pick<TrialResult, 'hypothesisId' | 'lockSha256' | 'slot'>): TrialResult {
  checkPeriod(h)
  const out = obj(h.outcome, 'outcome')
  expectLock([out.variable, out.comparator], ['temperature_2m', '<'], 'H5 outcome')
  expectLock(obj(h.test, 'test').name, 'exact binomial test', 'test.name')
  expectLock(obj(h.effect, 'effect').nullValue, 50, 'effect.nullValue')
  if (!data.groundhogCalls) throw new TrialRefused(`${h._id}: no record of Phil's calls supplied`)
  const loc = obj(h.location, 'location')
  const tz = String(loc.timeZone)
  const s = point(h, data, String(loc._id))
  const dailyMean = (date: string) => {
    const {start, end} = localDay(date, tz)
    const values = hourInstants(start, end - 1).map((t) => at(s, 'temperature_2m', t))
    return values.some(Number.isNaN) ? Number.NaN : values.reduce((a, b) => a + b, 0) / values.length
  }
  const windowMean = (year: number) => {
    const means = dates(`${year}-02-03`, `${year}-03-16`).map(dailyMean)
    return means.some(Number.isNaN) ? Number.NaN : means.reduce((a, b) => a + b, 0) / means.length
  }
  const normals: number[] = []
  for (let y = 1991; y <= 2020; y++) {
    const w = windowMean(y)
    if (Number.isNaN(w)) throw new TrialRefused(`${h._id}: normal-period year ${y} has missing temperatures`)
    normals.push(w)
  }
  const normal = normals.reduce((a, b) => a + b, 0) / normals.length
  const hits: number[] = []
  let excluded = 0
  for (let year = 1950; year <= 2024; year++) {
    const call = data.groundhogCalls.get(year)
    const w = windowMean(year)
    if ((call !== 'shadow' && call !== 'no shadow') || Number.isNaN(w)) {
      excluded++
      continue
    }
    const cold = w < normal
    hits.push((call === 'shadow') === cold ? 1 : 0)
  }
  const k = hits.reduce((a, b) => a + b, 0)
  const bootstrap = obj(h.bootstrap, 'bootstrap')
  const boot = stratifiedBootstrap([hits.length], num(bootstrap.resamples, 'resamples'), num(obj(bootstrap.prng, 'prng').seed, 'seed'), ([g]) => {
    let sum = 0
    for (const i of g!) sum += hits[i]!
    return (100 * sum) / g!.length
  })
  return {
    ...base,
    test: 'exact binomial test',
    n: hits.length,
    excluded,
    counts: {hits: k, misses: hits.length - k, normalTimes1000: Math.round(normal * 1000)},
    statistic: k,
    p: binomTest(k, hits.length, 0.5),
    effect: (100 * k) / hits.length,
    effectUnits: 'percent hit rate',
    ciLow: boot.ciLow,
    ciHigh: boot.ciHigh,
    undefinedResamples: boot.undefinedResamples,
    nullValue: 50,
    sesoi: num(obj(h.smallestEffect, 'smallestEffect').value, 'smallestEffect.value'),
  }
}

// ---------- entry points ----------

const RATE: Record<string, (h: Hypothesis, d: TrialData) => {days: string[]; units: RateUnits}> = {
  'hypothesis-rain-before-seven': h1,
  'hypothesis-red-sky-at-night': h2,
  'hypothesis-mackerel-sky': h3,
  'hypothesis-ring-around-the-moon': h6,
}

/** Per-unit predictor/outcome/excluded flags for a rate hypothesis (H1, H2, H3, H6). */
export function rateUnitsFor(hypothesis: Hypothesis, data: TrialData): {days: string[]; units: RateUnits} {
  const rate = RATE[slotOf(hypothesis._id)]
  if (!rate) throw new TrialRefused(`${hypothesis._id} is not a rate hypothesis`)
  return rate(hypothesis, data)
}

/** Run one trial. Refuses unless the hypothesis still matches its lock. */
export async function runTrial(hypothesis: Hypothesis, lock: PreregistrationLock, data: TrialData): Promise<TrialResult> {
  const check = await checkLock(hypothesis, lock)
  if (!check.ok) throw new TrialRefused(`${hypothesis._id}: ${check.reason}; file a deviation instead`)
  const slot = slotOf(hypothesis._id)
  const base = {hypothesisId: hypothesis._id, lockSha256: lock.sha256, slot}
  const rate = RATE[slot]
  if (rate) return analyseRate(hypothesis, rate(hypothesis, data).units, base)
  if (slot === 'hypothesis-st-swithins-day') return h4(hypothesis, data, base)
  if (slot === 'hypothesis-groundhog-day') return h5(hypothesis, data, base)
  throw new TrialRefused(`no runner for ${slot}`)
}

/** Holm across the whole family, then the locked verdict rules. */
export function finaliseFamily(results: readonly TrialResult[], familySlots: readonly string[]): FamilyResult[] {
  const slots = results.map((r) => r.slot).sort()
  expectLock(slots, [...familySlots].sort(), 'correction family')
  const adjusted = holm(results.map((r) => r.p))
  return results.map((r, i) => ({
    ...r,
    adjustedP: adjusted[i]!,
    verdict: verdict({adjustedP: adjusted[i]!, effect: r.effect, ciHigh: r.ciHigh, nullValue: r.nullValue, sesoi: r.sesoi}),
  }))
}
