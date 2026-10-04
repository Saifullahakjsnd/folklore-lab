// Imports an NDJSON file into the production dataset with createIfNotExists, so a document
// that already exists is never overwritten (pre-registrations are write-once). Uses the
// project Editor token (F3: a Deploy Studio token cannot create documents).
// Usage: SANITY_API_WRITE_TOKEN=... node lab/scripts/import-to-sanity.ts studio/import/preregistration.ndjson
import {readFileSync} from 'node:fs'

const file = process.argv[2]
const token = process.env.SANITY_API_WRITE_TOKEN
if (!file || !token) throw new Error('usage: SANITY_API_WRITE_TOKEN=... node import-to-sanity.ts <file.ndjson>')
const docs = readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as {_id: string; _type: string})
for (const d of docs) if (d._id.includes('.')) throw new Error(`refusing dotted id ${d._id}`)

const url = 'https://1jioj3uy.api.sanity.io/v2026-06-09/data/mutate/production?returnIds=true&visibility=sync'
const res = await fetch(url, {
  method: 'POST',
  headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
  body: JSON.stringify({mutations: docs.map((d) => ({createIfNotExists: d}))}),
})
const body = (await res.json()) as {transactionId?: string; results?: {id: string; operation: string}[]; error?: unknown}
if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(body).slice(0, 500)}`)
const ops = (body.results ?? []).reduce<Record<string, number>>((t, r) => ({...t, [r.operation]: (t[r.operation] ?? 0) + 1}), {})
console.log(`transaction ${body.transactionId}: ${docs.length} documents sent`, ops)
