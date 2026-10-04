// Sun and moon via suncalc 2.1.0, as named in the locked hypotheses.
// suncalc 2.x reports altitudes in DEGREES, refraction-corrected (the moon also
// parallax-corrected), and treats dates as UTC instants.
import {getMoonIllumination, getMoonPosition, getPosition, getTimes} from 'suncalc'
import {localToUtc, nearestHour} from './time.ts'

/** Sunset S(D) = getTimes(12:00 local D, lat, lon).sunset, as a UTC instant (ms). */
export function sunset(date: string, lat: number, lon: number, timeZone: string): number {
  const s = getTimes(new Date(localToUtc(date, '12:00', timeZone)), lat, lon).sunset
  if (!s) throw new Error(`No sunset on ${date} at ${lat},${lon}`)
  return s.getTime()
}

/** Sunset hour H(D): S(D) rounded to the nearest whole UTC hour (half past rounds up). */
export const sunsetHour = (date: string, lat: number, lon: number, timeZone: string) =>
  nearestHour(sunset(date, lat, lon, timeZone))

/** Apparent moon altitude, degrees. */
export const moonAltitudeDeg = (instant: number, lat: number, lon: number) =>
  getMoonPosition(new Date(instant), lat, lon).altitude

/** Illuminated fraction of the moon, 0 (new) to 1 (full). */
export const moonFraction = (instant: number) => getMoonIllumination(new Date(instant)).fraction

/** Apparent sun altitude, degrees (used only to test against an external ephemeris). */
export const sunAltitudeDeg = (instant: number, lat: number, lon: number) => getPosition(new Date(instant), lat, lon).altitude
