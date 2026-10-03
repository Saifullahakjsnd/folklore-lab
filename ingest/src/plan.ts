// Builds the download plan from verified locks only. Every query parameter and every
// coordinate comes from locked hypothesis content; nothing is configured here.
import type {Registry} from '../../lab/src/index.ts'

export interface PointLocation {
  _id: string
  name: string
  lat: number
  lon: number
  timeZone: string
}

export interface DataSpec {
  endpoint: string
  models: string
  hourly: string[]
  timezone: string
  cellSelection: string
  units: {temperature: string; windSpeed: string; precipitation: string}
  timeformat: string
  startDate: string
  endDate: string
}

export interface Chunk {
  point: PointLocation
  startDate: string
  endDate: string
  days: number
  expectedHours: number
  url: string
  weight: number
}

export interface Plan {
  spec: DataSpec
  points: PointLocation[]
  chunks: Chunk[]
  totalWeight: number
  hypotheses: {hypothesisId: string; sha256: string}[]
}

// Open-Meteo pricing (retrieved 2026-10-04): requests over 10 variables or over 2 weeks for
// one location count as several calls, fractionally. ASSUMPTION, not confirmed: weight =
// (days / 14) * max(1, variables / 10). Open-Meteo's own two examples do not fit one linear
// rule unless the second also assumes 15 variables (see docs/BUILD_LOG.md).
export const estimateWeight = (days: number, variables: number) => (days / 14) * Math.max(1, variables / 10)

const SPEC_KEYS = ['endpoint', 'models', 'hourly', 'timezone', 'cellSelection', 'units', 'timeformat', 'startDate', 'endDate'] as const

const DAY_MS = 86_400_000
const dayIndex = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY_MS

export function chunkPeriods(startDate: string, endDate: string, chunkYears: number) {
  const startYear = Number(startDate.slice(0, 4))
  const endYear = Number(endDate.slice(0, 4))
  const periods: {startDate: string; endDate: string}[] = []
  for (let y = startYear - (startYear % chunkYears); y <= endYear; y += chunkYears) {
    const from = `${y}-01-01` < startDate ? startDate : `${y}-01-01`
    const to = `${y + chunkYears - 1}-12-31` > endDate ? endDate : `${y + chunkYears - 1}-12-31`
    if (from <= to) periods.push({startDate: from, endDate: to})
  }
  return periods
}

export function buildUrl(spec: DataSpec, point: PointLocation, startDate: string, endDate: string): string {
  const params = new URLSearchParams([
    ['latitude', String(point.lat)],
    ['longitude', String(point.lon)],
    ['start_date', startDate],
    ['end_date', endDate],
    ['hourly', spec.hourly.join(',')],
    ['models', spec.models],
    ['timezone', spec.timezone],
    ['cell_selection', spec.cellSelection],
    ['temperature_unit', spec.units.temperature],
    ['wind_speed_unit', spec.units.windSpeed],
    ['precipitation_unit', spec.units.precipitation],
    ['timeformat', spec.timeformat],
  ])
  return `${spec.endpoint}?${params.toString()}`
}

export function buildPlan(registry: Registry, chunkYears = 10): Plan {
  if (registry.failures.length > 0) {
    throw new Error(`Refusing to plan: ${registry.failures.map((f) => `${f.hypothesisId} (${f.problem})`).join('; ')}`)
  }
  if (registry.active.length === 0) throw new Error('Refusing to plan: no active locked hypotheses')

  let spec: DataSpec | undefined
  const points = new Map<string, PointLocation>()
  for (const {hypothesis} of registry.active) {
    const data = hypothesis.data as DataSpec & {points: string[]; pointLocations?: PointLocation[]}
    const candidate = Object.fromEntries(SPEC_KEYS.map((k) => [k, data[k]])) as unknown as DataSpec
    if (!spec) spec = candidate
    else if (JSON.stringify(candidate) !== JSON.stringify(spec)) {
      throw new Error(`Refusing to plan: ${hypothesis._id} locks a different data spec`)
    }
    const known = [hypothesis.location as PointLocation, ...(data.pointLocations ?? [])]
    for (const id of data.points) {
      const loc = known.find((l) => l._id === id)
      if (!loc || typeof loc.lat !== 'number' || typeof loc.lon !== 'number') {
        throw new Error(`Refusing to plan: ${hypothesis._id} names point ${id} without locked coordinates`)
      }
      const seen = points.get(id)
      if (seen && (seen.lat !== loc.lat || seen.lon !== loc.lon)) {
        throw new Error(`Refusing to plan: point ${id} has conflicting locked coordinates`)
      }
      points.set(id, {_id: loc._id, name: loc.name, lat: loc.lat, lon: loc.lon, timeZone: loc.timeZone})
    }
  }
  if (!spec) throw new Error('unreachable')
  if (spec.timezone !== 'GMT') throw new Error(`Refusing to plan: locked timezone is ${spec.timezone}, expected GMT`)

  const sortedPoints = [...points.values()].sort((a, b) => a._id.localeCompare(b._id))
  const chunks: Chunk[] = []
  for (const point of sortedPoints) {
    for (const period of chunkPeriods(spec.startDate, spec.endDate, chunkYears)) {
      const days = dayIndex(period.endDate) - dayIndex(period.startDate) + 1
      chunks.push({
        point,
        ...period,
        days,
        expectedHours: days * 24,
        url: buildUrl(spec, point, period.startDate, period.endDate),
        weight: estimateWeight(days, spec.hourly.length),
      })
    }
  }
  return {
    spec,
    points: sortedPoints,
    chunks,
    totalWeight: chunks.reduce((sum, c) => sum + c.weight, 0),
    hypotheses: registry.active.map(({lock}) => ({hypothesisId: lock.hypothesisId, sha256: lock.sha256})),
  }
}
