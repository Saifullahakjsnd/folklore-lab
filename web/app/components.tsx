import Link from 'next/link'
import type {ReactNode} from 'react'

export function FailureBanner({children}: {children: ReactNode}) {
  return (
    <div role="alert" className="banner banner-failure">
      <strong>Something failed.</strong> {children}
    </div>
  )
}

export function NoticeBanner({children}: {children: ReactNode}) {
  return (
    <div role="status" className="banner banner-notice">
      {children}
    </div>
  )
}

const STAMP_CLASS: Record<string, string> = {
  Supported: 'stamp-supported',
  Contradicted: 'stamp-contradicted',
  'Not supported': 'stamp-not-supported',
  Inconclusive: 'stamp-inconclusive',
}

/** Verdict stamp. The text always carries the meaning; colour only reinforces it. */
export function Stamp({verdict}: {verdict: string | null}) {
  if (!verdict) return <span className="stamp stamp-pending">Awaiting data</span>
  return <span className={`stamp ${STAMP_CLASS[verdict] ?? ''}`}>{verdict}</span>
}

export function Hash({value}: {value: string}) {
  return (
    <code className="hash" title={value}>
      {value}
    </code>
  )
}

export function Nav() {
  return (
    <nav aria-label="Main">
      <Link href="/journal">Journal</Link>
      <Link href="/pipeline">Pipeline</Link>
      <Link href="/methods">Methods</Link>
      <Link href="/how-it-works">How it works</Link>
    </nav>
  )
}

export function OpenMeteoCredit() {
  return (
    <p className="credit">
      <a href="https://open-meteo.com/">Weather data by Open-Meteo.com</a> (
      <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>), from the Copernicus Climate Change Service ERA5 reanalysis.
      Gridded reanalysis, not station readings.
    </p>
  )
}
