// Restores the raw weather chunks from the GitHub release and verifies each one against the
// SHA-256 in the committed manifest. Used by CI and by anyone replicating the trials.
// Usage: node ingest/scripts/download-snapshot.ts [targetDataDir]
import {copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs'
import {basename, dirname, join} from 'node:path'

export const RELEASE_BASE = 'https://github.com/Saifullahakjsnd/folklore-lab/releases/download/snapshot-era5-hourly-1950-2024-v1'

const sourceDir = join(import.meta.dirname, '..', 'data')
const target = process.argv[2] ?? sourceDir
const manifest = JSON.parse(readFileSync(join(sourceDir, 'manifest.json'), 'utf8')) as {chunks: {file: string; sha256: string}[]}
mkdirSync(target, {recursive: true})
if (target !== sourceDir) copyFileSync(join(sourceDir, 'manifest.json'), join(target, 'manifest.json'))

const sha256 = async (bytes: Uint8Array) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) => b.toString(16).padStart(2, '0')).join('')

let fetched = 0
for (const chunk of manifest.chunks) {
  const path = join(target, chunk.file)
  if (existsSync(path) && (await sha256(readFileSync(path))) === chunk.sha256) continue
  const res = await fetch(`${RELEASE_BASE}/${basename(chunk.file)}`)
  if (!res.ok) throw new Error(`${chunk.file}: HTTP ${res.status}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  const actual = await sha256(bytes)
  if (actual !== chunk.sha256) throw new Error(`${chunk.file}: sha256 ${actual} != manifest ${chunk.sha256}`)
  mkdirSync(dirname(path), {recursive: true})
  writeFileSync(`${path}.tmp`, bytes)
  renameSync(`${path}.tmp`, path)
  fetched++
}
console.log(`${manifest.chunks.length} chunks verified in ${target} (${fetched} downloaded)`)
