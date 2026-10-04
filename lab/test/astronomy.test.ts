// Reference values: test/fixtures/astronomy.json (JPL Horizons and NASA GSFC moon phase
// tables; source URLs and retrieval date are stored in the fixture).
import {describe, expect, test} from 'vitest'
import fixtures from './fixtures/astronomy.json' with {type: 'json'}
import {moonAltitudeDeg, moonFraction, sunset, sunsetHour} from '../src/astronomy.ts'

const {lat, lon} = fixtures.location

describe('moon altitude vs JPL Horizons (refracted, topocentric London)', () => {
  for (const set of fixtures.moonElevation) {
    // Below the horizon Horizons applies no refraction while suncalc keeps its near-horizon
    // refraction term (about +0.17 deg), so only altitudes above +5 deg get the tight bound.
    test(`${set.rows[0]!.utc.slice(0, 10)}: within 0.02 deg above +5 deg, within 0.25 deg elsewhere, same sign`, () => {
      for (const row of set.rows) {
        const ours = moonAltitudeDeg(Date.parse(row.utc), lat, lon)
        const tolerance = row.elevationDeg >= 5 ? 0.02 : 0.25
        expect(Math.abs(ours - row.elevationDeg)).toBeLessThan(tolerance)
        if (Math.abs(row.elevationDeg) > 0.25) expect(Math.sign(ours)).toBe(Math.sign(row.elevationDeg))
      }
    })
  }
})

describe('sunset vs JPL Horizons (airless solar elevation crossing -0.833 deg)', () => {
  for (const set of fixtures.sunElevationAirless) {
    const date = set.rows[0]!.utc.slice(0, 10)
    test(`${date}: within 10 s`, () => {
      let reference = Number.NaN
      for (let i = 1; i < set.rows.length; i++) {
        const a = set.rows[i - 1]!
        const b = set.rows[i]!
        if (a.elevationDeg >= -0.833 && b.elevationDeg < -0.833) {
          const ta = Date.parse(a.utc)
          reference = ta + ((a.elevationDeg + 0.833) / (a.elevationDeg - b.elevationDeg)) * (Date.parse(b.utc) - ta)
        }
      }
      expect(Number.isFinite(reference)).toBe(true)
      expect(Math.abs(sunset(date, lat, lon, 'Europe/London') - reference)).toBeLessThan(10_000)
    })
  }

  test('sunset hour on midsummer 2024 (20:21 UTC) rounds to 20:00 UTC', () => {
    expect(new Date(sunsetHour('2024-06-21', lat, lon, 'Europe/London')).toISOString()).toBe('2024-06-21T20:00:00.000Z')
  })
})

describe('moon illumination vs NASA phase instants', () => {
  for (const year of fixtures.moonPhases) {
    test(`${year.year}: full >= 0.995, new <= 0.005, quarters 0.49-0.51`, () => {
      for (const {phase, utc} of year.phases) {
        const f = moonFraction(Date.parse(utc))
        if (phase === 'full') expect(f).toBeGreaterThanOrEqual(0.995)
        else if (phase === 'new') expect(f).toBeLessThanOrEqual(0.005)
        else {
          expect(f).toBeGreaterThan(0.49)
          expect(f).toBeLessThan(0.51)
        }
      }
    })
  }
})
