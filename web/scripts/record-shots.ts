// Records the automated video shots of the live site with Playwright (one clip per shot,
// silent, for voice-over later) and saves a still screenshot of each key moment.
//
//   node web/scripts/record-shots.ts [shotNumber...]
//
// Output: docs/media/clips/NN-name.webm (gitignored) and docs/media/shots/NN-name.png.
// The approval shot is NOT here: a person approves verdicts (see record-approval.ts).
import {chromium, type Page} from '@playwright/test'
import {mkdirSync, readdirSync, renameSync, rmSync} from 'node:fs'
import {join} from 'node:path'

const SITE = 'https://folklore-lab.vercel.app'
const ROOT = join(import.meta.dirname, '..', '..', 'docs', 'media')
const CLIPS = join(ROOT, 'clips')
const SHOTS = join(ROOT, 'shots')
const SIZE = {width: 1280, height: 720}

const pause = (page: Page, ms: number) => page.waitForTimeout(ms)
async function glide(page: Page, pixels: number, steps = 12) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, pixels / steps)
    await pause(page, 120)
  }
}
const still = (page: Page, name: string) => page.screenshot({path: join(SHOTS, `${name}.png`)})

interface Shot {
  n: number
  name: string
  run: (page: Page) => Promise<void>
}

const SHOT_LIST: Shot[] = [
  {
    n: 1,
    name: 'journal',
    run: async (page) => {
      await page.goto(`${SITE}/journal`, {waitUntil: 'networkidle'})
      await pause(page, 2500)
      await still(page, '01-journal-table')
      await glide(page, 520)
      await pause(page, 2000)
      await still(page, '01-journal-cards')
      await glide(page, 600)
      await pause(page, 2000)
    },
  },
  {
    n: 2,
    name: 'trial-rain-before-seven',
    run: async (page) => {
      await page.goto(`${SITE}/trial/hypothesis-rain-before-seven-v1`, {waitUntil: 'networkidle'})
      await pause(page, 2500)
      await still(page, '02-trial-lock')
      await page.getByText('Every threshold, exactly as locked').click()
      await pause(page, 1500)
      await glide(page, 400)
      await pause(page, 2000)
      await still(page, '02-trial-locked-json')
      await page.getByRole('heading', {name: 'Result'}).scrollIntoViewIfNeeded()
      await pause(page, 2500)
      await still(page, '02-trial-result')
      await glide(page, 300)
      await pause(page, 2000)
    },
  },
  {
    n: 3,
    name: 'lock-commit-public',
    run: async (page) => {
      await page.goto('https://github.com/Saifullahakjsnd/folklore-lab/commit/78b647e', {waitUntil: 'domcontentloaded'})
      await pause(page, 3500)
      await still(page, '03-lock-commit')
      await glide(page, 400)
      await pause(page, 2000)
    },
  },
  {
    n: 4,
    name: 'replicate',
    run: async (page) => {
      await page.goto(`${SITE}/replicate/hypothesis-rain-before-seven-v1`, {waitUntil: 'networkidle'})
      await pause(page, 2000)
      await still(page, '04-replicate-hashes')
      await page.getByRole('button', {name: 'Replicate'}).click()
      await pause(page, 1500)
      await page.getByText('Checks per trial').scrollIntoViewIfNeeded()
      await page.getByText(/Reproduced in your browser|Not reproduced|Replication failed/).waitFor({timeout: 240_000})
      await pause(page, 1500)
      await still(page, '04-replicate-checks')
      await glide(page, 450)
      await pause(page, 2500)
      await still(page, '04-replicate-result')
    },
  },
  {
    n: 5,
    name: 'pipeline',
    run: async (page) => {
      await page.goto(`${SITE}/pipeline`, {waitUntil: 'networkidle'})
      await pause(page, 3000)
      await still(page, '05-pipeline')
      await glide(page, 400)
      await pause(page, 2000)
    },
  },
  {
    n: 6,
    name: 'methods',
    run: async (page) => {
      await page.goto(`${SITE}/methods`, {waitUntil: 'networkidle'})
      await pause(page, 2500)
      await still(page, '06-methods')
      await glide(page, 600)
      await pause(page, 2000)
    },
  },
  {
    n: 7,
    name: 'how-it-works',
    run: async (page) => {
      await page.goto(`${SITE}/how-it-works`, {waitUntil: 'networkidle'})
      await pause(page, 2500)
      await still(page, '07-how-it-works')
      await page.getByText('Weather data by Open-Meteo.com').last().scrollIntoViewIfNeeded()
      await pause(page, 2500)
      await still(page, '07-attribution')
    },
  },
]

mkdirSync(CLIPS, {recursive: true})
mkdirSync(SHOTS, {recursive: true})
const wanted = process.argv.slice(2).map(Number)
const browser = await chromium.launch()
try {
  for (const shot of SHOT_LIST.filter((s) => wanted.length === 0 || wanted.includes(s.n))) {
    const tmp = join(CLIPS, `.tmp-${shot.n}`)
    rmSync(tmp, {recursive: true, force: true})
    const context = await browser.newContext({viewport: SIZE, recordVideo: {dir: tmp, size: SIZE}, colorScheme: 'light'})
    const page = await context.newPage()
    const t0 = Date.now()
    try {
      await shot.run(page)
    } finally {
      await context.close() // flushes the video
    }
    const file = readdirSync(tmp).find((f) => f.endsWith('.webm'))
    if (!file) throw new Error(`shot ${shot.n}: no video written`)
    const out = join(CLIPS, `${String(shot.n).padStart(2, '0')}-${shot.name}.webm`)
    rmSync(out, {force: true})
    renameSync(join(tmp, file), out)
    rmSync(tmp, {recursive: true, force: true})
    console.log(`shot ${shot.n} ${shot.name}: ${((Date.now() - t0) / 1000).toFixed(1)} s -> ${out}`)
  }
} finally {
  await browser.close()
}
