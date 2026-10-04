// Fetches reference astronomy values for the tests and stores them, with their source
// URLs and retrieval date, in test/fixtures/astronomy.json. Run once; commit the output.
//   - Moon/Sun topocentric elevation over London: JPL Horizons API (ssd.jpl.nasa.gov)
//   - Moon phase instants: NASA GSFC "Phases of the Moon" tables (F. Espenak), UT
import {writeFileSync} from 'node:fs'
import {join} from 'node:path'

const retrievedAt = new Date().toISOString()
const LONDON = {lat: 51.51, lon: -0.13}

async function horizons(body: '301' | '10', start: string, stop: string, step: string, apparent: 'AIRLESS' | 'REFRACTED') {
  const params = new URLSearchParams({
    format: 'text',
    COMMAND: `'${body}'`,
    OBJ_DATA: "'NO'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'OBSERVER'",
    CENTER: "'coord@399'",
    COORD_TYPE: "'GEODETIC'",
    SITE_COORD: `'${LONDON.lon},${LONDON.lat},0'`,
    START_TIME: `'${start}'`,
    STOP_TIME: `'${stop}'`,
    STEP_SIZE: `'${step}'`,
    QUANTITIES: "'4'",
    APPARENT: `'${apparent}'`,
    TIME_ZONE: "'+00:00'",
  })
  const url = `https://ssd.jpl.nasa.gov/api/horizons.api?${params.toString()}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Horizons HTTP ${res.status}`)
  const text = await res.text()
  const block = text.split('$$SOE')[1]?.split('$$EOE')[0]
  if (!block) throw new Error(`Horizons returned no ephemeris:\n${text.slice(0, 500)}`)
  const months: Record<string, string> = {Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'}
  const rows = block
    .trim()
    .split('\n')
    .map((line) => {
      const m = line.match(/^\s*(\d{4})-(\w{3})-(\d{2}) (\d{2}:\d{2})\s+\S*\s+([-\d.]+)\s+([-\d.]+)/)
      if (!m) throw new Error(`Unparsed Horizons row: ${line}`)
      return {utc: `${m[1]}-${months[m[2]!]}-${m[3]}T${m[4]}:00Z`, azimuthDeg: Number(m[5]), elevationDeg: Number(m[6])}
    })
  return {source: url, apparent, rows}
}

async function nasaPhases(page: string, year: number) {
  const url = `https://eclipse.gsfc.nasa.gov/phase/${page}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`NASA HTTP ${res.status}`)
  const lines = (await res.text()).replace(/<[^>]*>/g, '').split('\n')
  const start = lines.findIndex((l) => new RegExp(`^\\s*${year}\\s`).test(l))
  if (start < 0) throw new Error(`Year ${year} not found on ${url}`)
  const names = ['new', 'firstQuarter', 'full', 'lastQuarter'] as const
  const phases: {phase: (typeof names)[number]; utc: string}[] = []
  const months: Record<string, string> = {Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'}
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]!
    if (i > start && /^\s*\d{4}\s/.test(line)) break
    if (!line.trim()) break
    // Columns are fixed-width: year (0-5) then four 18-character phase columns.
    for (let col = 0; col < 4; col++) {
      const cell = line.slice(6 + col * 18, 6 + (col + 1) * 18)
      const m = cell.match(/(\w{3})\s+(\d{1,2})\s+(\d{2}:\d{2})/)
      if (m) phases.push({phase: names[col]!, utc: `${year}-${months[m[1]!]}-${m[2]!.padStart(2, '0')}T${m[3]}:00Z`})
    }
  }
  return {source: url, timeScale: 'Universal Time (UT)', year, phases}
}

const fixtures = {
  retrievedAt,
  location: LONDON,
  moonElevation: [
    await horizons('301', '2024-01-25 18:00', '2024-01-26 06:00', '1 h', 'REFRACTED'),
    await horizons('301', '1965-06-15 00:00', '1965-06-16 00:00', '1 h', 'REFRACTED'),
  ],
  sunElevationAirless: [
    await horizons('10', '2024-06-21 19:50', '2024-06-21 20:50', '1 m', 'AIRLESS'),
    await horizons('10', '1958-12-21 15:30', '1958-12-21 16:30', '1 m', 'AIRLESS'),
  ],
  moonPhases: [await nasaPhases('phases2001.html', 2024), await nasaPhases('phases1901.html', 1965)],
}

const out = join(import.meta.dirname, '..', 'test', 'fixtures', 'astronomy.json')
writeFileSync(out, JSON.stringify(fixtures, null, 2) + '\n')
console.log(`wrote ${out}`)
console.log(fixtures.moonPhases.map((p) => `${p.year}: ${p.phases.length} phases, first ${JSON.stringify(p.phases[0])}`).join('\n'))
