// Local wall-clock time <-> UTC instants, via the IANA time zone database (Intl).
// Every local-time rule in the locked hypotheses goes through this file.

export const HOUR_MS = 3_600_000
export const DAY_MS = 86_400_000

export interface LocalParts {
  date: string // YYYY-MM-DD
  hour: number
  minute: number
}

const formatters = new Map<string, Intl.DateTimeFormat>()
function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatters.set(timeZone, f)
  }
  return f
}

export function localParts(instant: number, timeZone: string): LocalParts {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(new Date(instant)).map((p) => [p.type, p.value]))
  return {date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute)}
}

/** Offset of local time from UTC at an instant, in ms (positive east of Greenwich). */
export function utcOffset(instant: number, timeZone: string): number {
  const p = localParts(instant, timeZone)
  const asUtc = Date.UTC(Number(p.date.slice(0, 4)), Number(p.date.slice(5, 7)) - 1, Number(p.date.slice(8, 10)), p.hour, p.minute)
  return asUtc - Math.floor(instant / 60_000) * 60_000
}

export class LocalTimeError extends Error {}

/**
 * The UTC instant at which local wall-clock `date` `HH:MM` occurs in `timeZone`.
 * Throws if that wall time does not exist (spring-forward gap) or occurs twice (fall-back),
 * so no locked window can silently land on an ambiguous hour.
 */
export function localToUtc(date: string, time: string, timeZone: string): number {
  const [hh, mm] = time.split(':').map(Number) as [number, number]
  const wall = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), hh, mm)
  const offsets = new Set([utcOffset(wall - DAY_MS, timeZone), utcOffset(wall, timeZone), utcOffset(wall + DAY_MS, timeZone)])
  const matches = [...offsets]
    .map((offset) => wall - offset)
    .filter((t) => {
      const p = localParts(t, timeZone)
      return p.date === date && p.hour === hh && p.minute === mm
    })
  const unique = [...new Set(matches)]
  if (unique.length === 0) throw new LocalTimeError(`${date} ${time} does not exist in ${timeZone}`)
  if (unique.length > 1) throw new LocalTimeError(`${date} ${time} occurs twice in ${timeZone}`)
  return unique[0]!
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/** Local day D as the UTC interval [00:00 D, 00:00 D+1). */
export function localDay(date: string, timeZone: string): {start: number; end: number} {
  return {start: localToUtc(date, '00:00', timeZone), end: localToUtc(addDays(date, 1), '00:00', timeZone)}
}

/** Whole-hour UTC instants t with from <= t <= to (both inclusive). */
export function hourInstants(from: number, to: number): number[] {
  const out: number[] = []
  for (let t = Math.ceil(from / HOUR_MS) * HOUR_MS; t <= to; t += HOUR_MS) out.push(t)
  return out
}

/**
 * Stamps whose preceding-hour sums make up the accumulation over [from, to):
 * the whole-hour instants t with from < t <= to.
 */
export function accumulationStamps(from: number, to: number): number[] {
  return hourInstants(from + 1, to)
}

/** Round an instant to the nearest whole UTC hour; exactly half past rounds up. */
export function nearestHour(instant: number): number {
  return Math.floor(instant / HOUR_MS + 0.5) * HOUR_MS
}
