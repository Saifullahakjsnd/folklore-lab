// Hourly series per point, indexed by UTC instant.
//
// Precipitation is held in integer tenths of a millimetre (Open-Meteo stores it at 0.1 mm
// precision). Summing tenths is exact, whereas summing decimal millimetres in floating point
// is not: 0.2 + 0.7 + 0.1 === 0.9999999999999999, which would fail a ">= 1 mm" rule on a day
// with exactly 1.0 mm. Missing values are NaN.
import {HOUR_MS} from './time.ts'

export interface PointSeries {
  pointId: string
  start: number // UTC ms of the first stamp
  length: number
  values: Record<string, Float64Array>
}

export const PRECIP = 'precipitation'

export function toTenths(mm: number | null): number {
  return mm === null ? Number.NaN : Math.round(mm * 10)
}

export function makeSeries(pointId: string, start: number, raw: Record<string, readonly (number | null)[]>): PointSeries {
  const lengths = new Set(Object.values(raw).map((v) => v.length))
  if (lengths.size !== 1) throw new Error(`${pointId}: variables have different lengths`)
  const length = [...lengths][0]!
  const values: Record<string, Float64Array> = {}
  for (const [name, series] of Object.entries(raw)) {
    values[name] = Float64Array.from(series, (v) => (name === PRECIP ? toTenths(v) : v === null ? Number.NaN : v))
  }
  return {pointId, start, length, values}
}

/** Value at a whole-hour UTC instant; NaN if missing or outside the series. */
export function at(series: PointSeries, variable: string, instant: number): number {
  const column = series.values[variable]
  if (!column) throw new Error(`${series.pointId}: no variable ${variable}`)
  const i = (instant - series.start) / HOUR_MS
  if (!Number.isInteger(i) || i < 0 || i >= series.length) return Number.NaN
  return column[i]!
}

/** Sum of precipitation (tenths of a mm) over the given stamps; NaN if any is missing. */
export function sumTenths(series: PointSeries, stamps: readonly number[]): number {
  let total = 0
  for (const t of stamps) total += at(series, PRECIP, t)
  return total
}

/** Maximum of a variable over the given stamps; NaN if any is missing. */
export function maxOf(series: PointSeries, variable: string, stamps: readonly number[]): number {
  let m = -Infinity
  for (const t of stamps) {
    const v = at(series, variable, t)
    if (Number.isNaN(v)) return Number.NaN
    if (v > m) m = v
  }
  return m
}

/** Threshold in mm expressed in tenths, exactly. */
export const mmToTenths = (mm: number) => Math.round(mm * 10)
