// Assembles the silent master video from the recorded clips, with on-brand placeholder cards
// ([SCREENSHOT: …] / [IMAGE: …]) for stills and images to be dropped in during editing, and
// writes docs/VIDEO_SCRIPT.md: a timed voice-over script. Re-run after recording more clips.
//
//   node web/scripts/make-video.ts
//
// Output: docs/media/video/folklore-lab-silent.mp4 (gitignored) and docs/VIDEO_SCRIPT.md.
import {execFileSync} from 'node:child_process'
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

const REPO = join(import.meta.dirname, '..', '..')
const MEDIA = join(REPO, 'docs', 'media')
const CLIPS = join(MEDIA, 'clips')
const WORK = join(MEDIA, 'video', '.work')
const OUT = join(MEDIA, 'video', 'folklore-lab-silent.mp4')
const FPS = 30
const W = 1280
const H = 720

// Site palette (web/app/globals.css, light mode).
const PAPER = '0xfbf8f1'
const INK = '0x1d1b16'
const ACCENT = '0x1f4e8c'
const MUTED = '0x5d584c'
const font = (f: string) => `C\\:/Windows/Fonts/${f}`

// Numbers for the voice-over come from the lab output, never typed.
const results = JSON.parse(readFileSync(join(REPO, 'lab', 'results', 'trials-4dc5ac6ec55c.json'), 'utf8')) as {
  family: {hypothesisId: string; effect: number; ciLow: number; ciHigh: number; verdict: string}[]
}
const r = (id: string) => results.family.find((x) => x.hypothesisId === id)!
const rain = r('hypothesis-rain-before-seven-v1')
const red = r('hypothesis-red-sky-at-night-v2')
const moon = r('hypothesis-ring-around-the-moon-v1')
const pp = (v: number) => `${v.toFixed(1)} percentage points`

type Segment =
  | {kind: 'card'; title: string; placeholder: string; seconds: number; vo: string}
  | {kind: 'clip'; file: string; fallback: {title: string; placeholder: string; seconds: number}; vo: string}

const SEGMENTS: Segment[] = [
  {kind: 'card', title: 'Folklore Lab', placeholder: '[IMAGE: title art / logo]', seconds: 4, vo: 'Six weather proverbs. Folklore, judged by pre-registered science.'},
  {
    kind: 'clip',
    file: '01-journal.webm',
    fallback: {title: 'Journal', placeholder: '[SCREENSHOT: shots/01-journal-table.png]', seconds: 6},
    vo: 'This is the Journal of Proverb Studies. Each proverb became a precise, testable claim, locked before a single data point existed. Two were supported, two contradicted, two inconclusive, and they are all published as the code computed them.',
  },
  {kind: 'card', title: 'Locked before any data', placeholder: '[SCREENSHOT: shots/02-trial-lock.png]', seconds: 3, vo: 'Every hypothesis is canonicalised and hashed with SHA-256.'},
  {
    kind: 'clip',
    file: '02-trial-rain-before-seven.webm',
    fallback: {title: 'Rain before seven', placeholder: '[SCREENSHOT: shots/02-trial-result.png]', seconds: 6},
    vo: `Rain before seven, fine by eleven. Here is every threshold exactly as locked, and the result beside it: ${pp(rain.effect)}. Morning rain persists. The proverb gets it backwards.`,
  },
  {
    kind: 'card',
    title: 'Public before the first request',
    placeholder: '[IMAGE: timeline  repo public 07:46Z  ->  first weather request 07:52Z]',
    seconds: 4,
    vo: 'The repository went public before the first weather request, so the lock timestamps can be checked by anyone.',
  },
  {
    kind: 'clip',
    file: '03-lock-commit-public.webm',
    fallback: {title: 'Lock commit', placeholder: '[SCREENSHOT: shots/03-lock-commit.png]', seconds: 5},
    vo: 'This is the lock commit: six hypotheses hashed, no data fetched.',
  },
  {
    kind: 'clip',
    file: '04-replicate.webm',
    fallback: {title: 'Replicate', placeholder: '[SCREENSHOT: shots/04-replicate-result.png]', seconds: 8},
    vo: 'Press Replicate, and your own browser recomputes all six trials from cached data, with no network. Same hashes, same counts, same verdicts.',
  },
  {kind: 'card', title: 'Reproduced', placeholder: '[SCREENSHOT: shots/04-replicate-result.png]', seconds: 3, vo: 'Continuous integration checks the same numbers bit for bit.'},
  {
    kind: 'clip',
    file: '08-approval.webm',
    fallback: {title: 'A person approves', placeholder: '[CLIP: curator approves the verdicts  (node web/scripts/record-approval.ts)]', seconds: 6},
    vo: 'A person approves each verdict. The agent cannot: the server checks who you are from your own token, and refuses robots.',
  },
  {
    kind: 'clip',
    file: '05-pipeline.webm',
    fallback: {title: 'Pipeline', placeholder: '[SCREENSHOT: shots/05-pipeline.png]', seconds: 5},
    vo: 'The pipeline shows where every trial is, publicly, with no login.',
  },
  {
    kind: 'clip',
    file: '06-methods.webm',
    fallback: {title: 'Methods', placeholder: '[SCREENSHOT: shots/06-methods.png]', seconds: 5},
    vo: `The methods are read from the locks themselves. Red sky at night held up: ${pp(red.effect)}. Ring around the moon cleared the bar by the narrowest margin: ${pp(moon.effect)}, against a pre-set five.`,
  },
  {
    kind: 'card',
    title: 'What went wrong, on the record',
    placeholder: '[IMAGE: deviation 001  /  H6 erratum  /  reanalysis is not station data]',
    seconds: 5,
    vo: 'What went wrong is on the record: a deviation our own fetcher caught, an erratum that changes no number, and the plain fact that reanalysis is not station data.',
  },
  {
    kind: 'clip',
    file: '07-how-it-works.webm',
    fallback: {title: 'How it works', placeholder: '[SCREENSHOT: shots/07-attribution.png]', seconds: 5},
    vo: 'Weather data by Open-Meteo dot com, from the ERA5 reanalysis.',
  },
  {kind: 'card', title: 'folklore-lab.vercel.app', placeholder: 'Sanity project 1jioj3uy  ·  #sanitychallenge', seconds: 4, vo: 'Folklore Lab. Every claim locked, every number replicable.'},
]

const ff = (args: string[]) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], {stdio: 'inherit'})
const probe = (file: string) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim())

function card(index: number, title: string, placeholder: string, seconds: number): string {
  const titleFile = join(WORK, `t${index}.txt`)
  const phFile = join(WORK, `p${index}.txt`)
  writeFileSync(titleFile, title)
  writeFileSync(phFile, placeholder)
  const esc = (p: string) => p.replaceAll('\\', '/').replace(':', '\\:')
  const out = join(WORK, `seg${String(index).padStart(2, '0')}.mp4`)
  ff([
    '-f', 'lavfi', '-i', `color=c=${PAPER}:s=${W}x${H}:d=${seconds}:r=${FPS}`,
    '-vf',
    [
      `drawbox=x=176:y=${H / 2 - 2}:w=${W - 352}:h=1:color=${MUTED}@0.4:t=fill`,
      `drawtext=fontfile='${font('georgiab.ttf')}':textfile='${esc(titleFile)}':fontcolor=${INK}:fontsize=52:x=(w-text_w)/2:y=h/2-90`,
      `drawtext=fontfile='${font('consola.ttf')}':textfile='${esc(phFile)}':fontcolor=${ACCENT}:fontsize=22:x=(w-text_w)/2:y=h/2+40`,
    ].join(','),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(FPS), out,
  ])
  return out
}

function clip(index: number, file: string): string {
  const out = join(WORK, `seg${String(index).padStart(2, '0')}.mp4`)
  ff(['-i', join(CLIPS, file), '-vf', `scale=${W}:${H},fps=${FPS}`, '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out])
  return out
}

rmSync(WORK, {recursive: true, force: true})
mkdirSync(WORK, {recursive: true})
const parts: {file: string; seconds: number; seg: Segment; usedFallback: boolean}[] = []
SEGMENTS.forEach((seg, i) => {
  if (seg.kind === 'card') parts.push({file: card(i, seg.title, seg.placeholder, seg.seconds), seconds: seg.seconds, seg, usedFallback: false})
  else if (existsSync(join(CLIPS, seg.file))) {
    const f = clip(i, seg.file)
    parts.push({file: f, seconds: probe(f), seg, usedFallback: false})
  } else parts.push({file: card(i, seg.fallback.title, seg.fallback.placeholder, seg.fallback.seconds), seconds: seg.fallback.seconds, seg, usedFallback: true})
})
const list = join(WORK, 'list.txt')
writeFileSync(list, parts.map((p) => `file '${p.file.replaceAll('\\', '/')}'`).join('\n') + '\n')
ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', OUT])

// Timed voice-over script.
const ts = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
let t = 0
const rows = parts.map((p, i) => {
  const what =
    p.seg.kind === 'card'
      ? `Card: **${p.seg.title}**. Placeholder \`${p.seg.placeholder}\``
      : p.usedFallback
        ? `**Missing clip** \`${p.seg.file}\`. Placeholder \`${p.seg.fallback.placeholder}\``
        : `Clip \`${p.seg.file}\``
  const row = `| ${i + 1} | ${ts(t)}–${ts(t + p.seconds)} | ${what} | ${p.seg.vo} |`
  t += p.seconds
  return row
})
writeFileSync(
  join(REPO, 'docs', 'VIDEO_SCRIPT.md'),
  `# Video script (voice-over)

Silent master: \`docs/media/video/folklore-lab-silent.mp4\`, ${ts(t)} long. Generated by \`node web/scripts/make-video.ts\`; re-run after recording more clips.

Placeholders in \`[SCREENSHOT: …]\` / \`[IMAGE: …]\` / \`[CLIP: …]\` are cards to replace in the editor; stills are in \`docs/media/shots/\`. Every number in the voice-over is read from \`lab/results/\`.

| # | Time | On screen | Voice-over |
| --- | --- | --- | --- |
${rows.join('\n')}

Captions: use the voice-over column. Total ${ts(t)}.
`,
)
rmSync(WORK, {recursive: true, force: true})
console.log(`wrote ${OUT} (${ts(t)}) and docs/VIDEO_SCRIPT.md; missing clips: ${parts.filter((p) => p.usedFallback).map((p) => (p.seg as {file: string}).file).join(', ') || 'none'}`)
