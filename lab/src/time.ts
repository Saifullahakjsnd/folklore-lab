// Local wall-clock time <-> UTC instants, via the IANA time zone database (Intl).
// Every local-time rule in the locked hypotheses goes through this file.
//
// Intl is the ground truth but costs ~14 us per call, and a 75-year trial makes millions of
// lookups. So for each zone we scan 1940-2030 once, day by day, find every UTC-offset change
// and pin it to the minute with a binary search; lookups then use that table. Tests compare
// the table with Intl directly (random instants and every transition).

export const HOUR_MS = 3_600_000
export const DAY_MS = 86_400_000
const MINUTE_MS = 60_000

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

/** Local parts straight from Intl (slow; the reference implementation). */
export function intlLocalParts(instant: number, timeZone: string): LocalParts {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(new Date(instant)).map((p) => [p.type, p.value]))
  return {date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute)}
}

/** UTC offset from Intl (slow), in ms, positive east of Greenwich, whole minutes. */
export function intlUtcOffset(instant: number, timeZone: string): number {
  const p = intlLocalParts(instant, timeZone)
  const asUtc = Date.UTC(Number(p.date.slice(0, 4)), Number(p.date.slice(5, 7)) - 1, Number(p.date.slice(8, 10)), p.hour, p.minute)
  return asUtc - Math.floor(instant / MINUTE_MS) * MINUTE_MS
}

interface ZoneTable {
  from: number
  to: number
  transitions: number[] // instants at which a new offset starts, ascending
  offsets: number[] // offsets[0] applies before transitions[0]; offsets[i + 1] from transitions[i]
}

const TABLE_FROM = Date.UTC(1940, 0, 1)
const TABLE_TO = Date.UTC(2030, 0, 1)
const tables = new Map<string, ZoneTable>()

function zoneTable(timeZone: string): ZoneTable {
  let table = tables.get(timeZone)
  if (table) return table
  const transitions: number[] = []
  const offsets = [intlUtcOffset(TABLE_FROM, timeZone)]
  for (let t = TABLE_FROM + DAY_MS; t <= TABLE_TO; t += DAY_MS) {
    const current = intlUtcOffset(t, timeZone)
    if (current === offsets.at(-1)) continue
    // The offset changed within (t - 1 day, t]: find the first minute with the new offset.
    let lo = (t - DAY_MS) / MINUTE_MS
    let hi = t / MINUTE_MS
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2)
      if (intlUtcOffset(mid * MINUTE_MS, timeZone) === current) hi = mid
      else lo = mid
    }
    transitions.push(hi * MINUTE_MS)
    offsets.push(current)
  }
  table = {from: TABLE_FROM, to: TABLE_TO, transitions, offsets}
  tables.set(timeZone, table)
  return table
}

/** The zone's offset changes between 1940 and 2030 (exposed for tests). */
export const zoneTransitions = (timeZone: string) => [...zoneTable(timeZone).transitions]

/** Offset of local time from UTC at an instant, in ms (positive east of Greenwich). */
export function utcOffset(instant: number, timeZone: string): number {
  const table = zoneTable(timeZone)
  if (instant < table.from || instant >= table.to) return intlUtcOffset(instant, timeZone)
  let lo = 0
  let hi = table.transitions.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (table.transitions[mid]! <= instant) lo = mid + 1
    else hi = mid
  }
  return table.offsets[lo]!
}

export function localParts(instant: number, timeZone: string): LocalParts {
  const local = new Date(instant + utcOffset(instant, timeZone))
  return {date: local.toISOString().slice(0, 10), hour: local.getUTCHours(), minute: local.getUTCMinutes()}
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
  const matches = new Set(
    [...offsets]
      .map((offset) => wall - offset)
      .filter((t) => {
        const p = localParts(t, timeZone)
        return p.date === date && p.hour === hh && p.minute === mm
      }),
  )
  if (matches.size === 0) throw new LocalTimeError(`${date} ${time} does not exist in ${timeZone}`)
  if (matches.size > 1) throw new LocalTimeError(`${date} ${time} occurs twice in ${timeZone}`)
  return [...matches][0]!
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
 * Whole-hour UTC instants whose LOCAL time lies between fromDate fromTime and toDate toTime,
 * inclusive. Defined on instants, so it needs neither endpoint to exist as a wall time:
 * in 1950 London sprang forward at 02:00, so "02:00" did not exist that night.
 */
export function instantsWithLocalTimeBetween(fromDate: string, fromTime: string, toDate: string, toTime: string, timeZone: string): number[] {
  const lower = `${fromDate}T${fromTime}`
  const upper = `${toDate}T${toTime}`
  const key = (t: number) => {
    const p = localParts(t, timeZone)
    return `${p.date}T${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
  }
  return hourInstants(localDay(fromDate, timeZone).start, localDay(toDate, timeZone).end).filter((t) => {
    const k = key(t)
    return k >= lower && k <= upper
  })
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
