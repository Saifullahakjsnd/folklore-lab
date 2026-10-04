import type {Metadata} from 'next'
import type {ReactNode} from 'react'
import {Nav} from './components'
import './globals.css'

export const metadata: Metadata = {
  title: {default: 'Journal of Proverb Studies', template: '%s · Journal of Proverb Studies'},
  description: 'Weather proverbs judged by pre-registered science: locked hypotheses, 75 years of hourly data, verdicts with effect sizes.',
}

export default function RootLayout({children}: {children: ReactNode}) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#content">
          Skip to content
        </a>
        <header>
          <p className="masthead">Folklore Lab</p>
          <Nav />
        </header>
        <div id="content">{children}</div>
      </body>
    </html>
  )
}
