// Records the approval shot. A PERSON approves: this opens a visible browser (fresh profile,
// so no other account's session is reused), records the screen, and watches the public
// dataset for new verdict documents. It never clicks Approve; you do.
//
//   node web/scripts/record-approval.ts
//
// Sign in to the Sanity Dashboard as the folklore-lab account, open "Folklore Lab Bench",
// select a trial, press "Approve verdict". Repeat for all six. The recording stops when six
// verdicts exist, after 20 minutes, or when you close the window.
import {chromium} from '@playwright/test'
import {mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

const LAB_BENCH = 'https://www.sanity.io/@omdlbkvbu/application/kwdguc66v0akx78kq5m0apbl'
const QUERY_URL = `https://1jioj3uy.api.sanity.io/v2026-06-09/data/query/production?query=${encodeURIComponent('*[_type == "verdict"]{_id, outcome, approvedBy}')}`
const ROOT = join(import.meta.dirname, '..', '..', 'docs', 'media')
const SIZE = {width: 1280, height: 720}

async function verdicts(): Promise<{_id: string; outcome: string; approvedBy: string}[]> {
  const res = await fetch(QUERY_URL, {cache: 'no-store'})
  return ((await res.json()) as {result: {_id: string; outcome: string; approvedBy: string}[]}).result
}

mkdirSync(join(ROOT, 'clips'), {recursive: true})
mkdirSync(join(ROOT, 'shots'), {recursive: true})
const profile = mkdtempSync(join(tmpdir(), 'folklore-approval-'))
const videoDir = join(ROOT, 'clips', '.tmp-approval')
rmSync(videoDir, {recursive: true, force: true})

const context = await chromium.launchPersistentContext(profile, {headless: false, viewport: SIZE, recordVideo: {dir: videoDir, size: SIZE}})
const page = context.pages()[0] ?? (await context.newPage())
await page.goto(LAB_BENCH)
console.log('Recording. Sign in, open "Folklore Lab Bench", and approve each trial. Close the window when done.')

let closed = false
context.on('close', () => {
  closed = true
})
const seen = new Set((await verdicts()).map((v) => v._id))
console.log(`verdicts already present: ${seen.size}`)
const deadline = Date.now() + 20 * 60_000
while (!closed && Date.now() < deadline && seen.size < 6) {
  await new Promise((r) => setTimeout(r, 3000))
  for (const v of await verdicts().catch(() => [])) {
    if (seen.has(v._id)) continue
    seen.add(v._id)
    console.log(`approved: ${v._id} = ${v.outcome} by ${v.approvedBy}`)
    if (!closed) await page.screenshot({path: join(ROOT, 'shots', `08-approved-${seen.size}.png`)}).catch(() => {})
  }
}
if (!closed) {
  await new Promise((r) => setTimeout(r, 4000)) // hold the final state on screen
  await context.close()
}
const file = readdirSync(videoDir).find((f) => f.endsWith('.webm'))
if (file) {
  renameSync(join(videoDir, file), join(ROOT, 'clips', '08-approval.webm'))
  console.log(`saved docs/media/clips/08-approval.webm (${seen.size} verdicts exist)`)
}
rmSync(videoDir, {recursive: true, force: true})
rmSync(profile, {recursive: true, force: true})
