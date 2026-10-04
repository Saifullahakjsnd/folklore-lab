// Extracts Punxsutawney Phil's yearly call from the Groundhog Club page saved by the owner
// (groundhog.org blocks scripted requests). Writes only the facts (year -> call) with the
// page's URL, SHA-256 and save time; the page itself is the Club's content and stays out of git.
//
// Mapping (locked H5): "More winter" = shadow, "Early spring" = no shadow. Any other category
// is kept verbatim, and the locked rule excludes it. Each call is cross-checked against the
// row's details text ("Saw Shadow" / "No Shadow"); disagreements are reported, not resolved.
import {readFileSync, statSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

const dir = join(import.meta.dirname, '..', 'data', 'groundhog')
const htmlFile = join(dir, 'groundhog-org-past-predictions.html')
const bytes = readFileSync(htmlFile)
const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) => b.toString(16).padStart(2, '0')).join('')
const html = bytes.toString('utf8')

const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1]
const title = html.match(/<title>([^<]*)<\/title>/)?.[1]
if (!canonical?.includes('groundhog.org/groundhog-day/history-past-predictions')) throw new Error(`unexpected page: ${canonical}`)

const text = html
  .replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/(p|div|li|tr|td|th|h\d)>/gi, '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/[ \t]+/g, ' ')
const lines = text.split('\n').map((s) => s.trim()).filter(Boolean)

// The predictions table starts after its "Prediction" / "Details" header row.
const start = lines.findIndex((l, i) => l === 'Prediction' && lines[i + 1] === 'Details')
if (start < 0) throw new Error('predictions table header not found')

const rows: {year: number; category: string; details: string}[] = []
for (let i = start + 2; i < lines.length; i++) {
  if (!/^(18|19|20)\d\d$/.test(lines[i]!)) continue
  rows.push({year: Number(lines[i]), category: lines[i + 1] ?? '', details: lines[i + 2] ?? ''})
}

const callOf = (category: string) =>
  /more winter/i.test(category) ? 'shadow' : /early spring/i.test(category) ? 'no shadow' : category.replace(/^[^\p{L}]+/u, '').trim()
const detailsSay = (details: string) =>
  /\bno shadow\b/i.test(details) ? 'no shadow' : /\b(saw|see|sees|seen)\b[^.;]*\bshadow\b/i.test(details) ? 'shadow' : null

const calls: Record<string, string> = {}
const disagreements: {year: number; category: string; details: string}[] = []
for (const r of rows) {
  if (calls[r.year] !== undefined) throw new Error(`duplicate year ${r.year}`)
  const call = callOf(r.category)
  calls[r.year] = call
  const said = detailsSay(r.details)
  if (said !== null && (call === 'shadow' || call === 'no shadow') && said !== call) disagreements.push(r)
}

const saved = statSync(htmlFile).mtime.toISOString()
const out = {
  source: {
    publisher: 'Punxsutawney Groundhog Club',
    title,
    url: canonical,
    pageSha256: sha256,
    savedAt: saved,
    savedBy: 'project owner, from their own browser (groundhog.org blocks scripted requests); file kept out of git',
    parser: 'ingest/scripts/parse-groundhog.ts',
  },
  mapping: {'More winter': 'shadow', 'Early spring': 'no shadow', other: 'kept verbatim; excluded by the locked H5 rule'},
  yearsOnPage: rows.length,
  firstYear: Math.min(...rows.map((r) => r.year)),
  lastYear: Math.max(...rows.map((r) => r.year)),
  disagreements,
  calls,
}
writeFileSync(join(dir, 'groundhog-calls.json'), JSON.stringify(out, null, 2) + '\n')

const inWindow = Object.entries(calls).filter(([y]) => Number(y) >= 1950 && Number(y) <= 2024)
const tally = inWindow.reduce<Record<string, number>>((t, [, c]) => ({...t, [c]: (t[c] ?? 0) + 1}), {})
console.log(`page sha256 ${sha256}, saved ${saved}`)
console.log(`${rows.length} years on page (${out.firstYear}-${out.lastYear}); 1950-2024: ${inWindow.length} years`, tally)
console.log(`categories seen: ${JSON.stringify([...new Set(rows.map((r) => r.category))])}`)
console.log(`call/details disagreements: ${disagreements.length}`, disagreements.map((d) => d.year))
