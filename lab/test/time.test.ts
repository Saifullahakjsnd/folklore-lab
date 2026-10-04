import {describe, expect, test} from 'vitest'
import {
  accumulationStamps,
  addDays,
  HOUR_MS,
  hourInstants,
  LocalTimeError,
  localDay,
  localParts,
  localToUtc,
  nearestHour,
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
    const night = (d: string) => hourInstants(localToUtc(d, '22:00', LON), localToUtc(addDays(d, 1), '02:00', LON))
    expect(night('2024-07-01')).toHaveLength(5)
    expect(night('2024-03-30')).toHaveLength(4)
    expect(night('2024-10-26')).toHaveLength(6)
  })

  test('nearest hour rounds half past up', () => {
    const t = Date.parse('2024-06-21T20:30:00Z')
    expect(iso(nearestHour(t - 1000))).toBe('2024-06-21T20:00')
    expect(iso(nearestHour(t))).toBe('2024-06-21T21:00')
  })
})
