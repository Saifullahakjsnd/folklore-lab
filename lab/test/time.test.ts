import {describe, expect, test} from 'vitest'
import {
  accumulationStamps,
  addDays,
  HOUR_MS,
  hourInstants,
  instantsWithLocalTimeBetween,
  intlLocalParts,
  intlUtcOffset,
  LocalTimeError,
  localDay,
  localParts,
  localToUtc,
  nearestHour,
  utcOffset,
  zoneTransitions,
} from '../src/time.ts'

const LON = 'Europe/London'
const NY = 'America/New_York'
const iso = (t: number) => new Date(t).toISOString().slice(0, 16)
const hours = (d: {start: number; end: number}) => (d.end - d.start) / HOUR_MS

describe('local time to UTC', () => {
  test('GMT in winter, BST in summer', () => {
    expect(iso(localToUtc('2024-01-15', '05:00', LON))).toBe('2024-01-15T05:00')
    expect(iso(localToUtc('2024-07-01', '05:00', LON))).toBe('2024-07-01T04:00')
  })

  // tzdata (github.com/eggert/tz, file "europe"): Europe/London was on UTC+1 all year
  // from 1968-10-27 to 1971-10-31 ("1:00 - BST 1971 Oct 31 2:00u").
  test('British Standard Time 1968-71: 05:00 local in January 1970 is 04:00 UTC', () => {
    expect(iso(localToUtc('1970-01-15', '05:00', LON))).toBe('1970-01-15T04:00')
    expect(iso(localToUtc('1972-01-15', '05:00', LON))).toBe('1972-01-15T05:00')
  })

  test('a wall time in the spring-forward gap does not exist', () => {
    expect(() => localToUtc('2024-03-31', '01:30', LON)).toThrow(LocalTimeError)
    expect(() => localToUtc('2024-03-10', '02:30', NY)).toThrow(/does not exist/)
  })

  test('a wall time in the fall-back overlap is ambiguous', () => {
    expect(() => localToUtc('2024-10-27', '01:30', LON)).toThrow(/occurs twice/)
    expect(() => localToUtc('2024-11-03', '01:30', NY)).toThrow(/occurs twice/)
  })

  test('round-trips through localParts', () => {
    const t = localToUtc('1955-08-24', '23:00', LON)
    expect(localParts(t, LON)).toEqual({date: '1955-08-24', hour: 23, minute: 0})
  })
})

describe('local days', () => {
  test('are 23 h on spring-forward days and 25 h on fall-back days', () => {
    expect(hours(localDay('2024-07-01', LON))).toBe(24)
    expect(hours(localDay('2024-03-31', LON))).toBe(23)
    expect(hours(localDay('2024-10-27', LON))).toBe(25)
    expect(hours(localDay('2024-03-10', NY))).toBe(23)
    expect(hours(localDay('2024-11-03', NY))).toBe(25)
  })

  test('addDays crosses month and leap-year boundaries', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2023-02-28', 1)).toBe('2023-03-01')
    expect(addDays('1999-12-31', 2)).toBe('2000-01-02')
  })
})

describe('locked windows', () => {
  test('H1: rain over [05:00, 07:00) uses the preceding-hour sums stamped 06:00 and 07:00 local', () => {
    const d = '2024-07-01'
    const stamps = accumulationStamps(localToUtc(d, '05:00', LON), localToUtc(d, '07:00', LON))
    expect(stamps.map((t) => localParts(t, LON).hour)).toEqual([6, 7])
    expect(stamps.map(iso)).toEqual(['2024-07-01T05:00', '2024-07-01T06:00'])
  })

  test('a local day accumulates 23, 24 or 25 hourly sums', () => {
    for (const [d, n] of [['2024-07-01', 24], ['2024-03-31', 23], ['2024-10-27', 25]] as const) {
      const {start, end} = localDay(d, LON)
      expect(accumulationStamps(start, end)).toHaveLength(n)
    }
  })

  test('H6: the 22:00-02:00 night has 5 instants, 4 on the spring-forward night, 6 on the fall-back night', () => {
    const night = (d: string) => instantsWithLocalTimeBetween(d, '22:00', addDays(d, 1), '02:00', LON)
    expect(night('2024-07-01')).toHaveLength(5)
    expect(night('2024-03-30')).toHaveLength(4)
    expect(night('2024-10-26')).toHaveLength(6)
  })

  // In 1950 London sprang forward at 02:00 GMT (to 03:00 BST), so "02:00" did not exist on
  // 16 April. The locked window is defined on instants, so the night simply has 4 of them.
  test('H6 in 1950: the night ending at a 02:00 that does not exist still has 4 instants', () => {
    expect(() => localToUtc('1950-04-16', '02:00', LON)).toThrow(/does not exist/)
    const night = instantsWithLocalTimeBetween('1950-04-15', '22:00', '1950-04-16', '02:00', LON)
    expect(night.map((t) => localParts(t, LON).hour)).toEqual([22, 23, 0, 1])
  })

  test('nearest hour rounds half past up', () => {
    const t = Date.parse('2024-06-21T20:30:00Z')
    expect(iso(nearestHour(t - 1000))).toBe('2024-06-21T20:00')
    expect(iso(nearestHour(t))).toBe('2024-06-21T21:00')
  })
})

describe('transition table agrees with Intl', () => {
  for (const tz of [LON, NY]) {
    test(`${tz}: 20,000 random instants 1950-2025 and every transition +/- 3 h`, () => {
      let seed = 12345
      const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
      const from = Date.UTC(1950, 0, 1)
      const span = Date.UTC(2025, 0, 1) - from
      const instants: number[] = []
      for (let i = 0; i < 20000; i++) instants.push(from + Math.floor(rand() * span / 60000) * 60000)
      for (const tr of zoneTransitions(tz)) for (let m = -180; m <= 180; m += 30) instants.push(tr + m * 60000)
      for (const t of instants) {
        expect(utcOffset(t, tz)).toBe(intlUtcOffset(t, tz))
        expect(localParts(t, tz)).toEqual(intlLocalParts(t, tz))
      }
    })
  }

  test('London has transitions in 1950-2024 but none between Oct 1968 and Oct 1971', () => {
    const tr = zoneTransitions(LON).filter((t) => t >= Date.UTC(1950, 0, 1) && t < Date.UTC(2025, 0, 1))
    expect(tr.length).toBeGreaterThan(140)
    expect(tr.filter((t) => t > Date.UTC(1968, 9, 28) && t < Date.UTC(1971, 9, 30))).toEqual([])
  })
})
