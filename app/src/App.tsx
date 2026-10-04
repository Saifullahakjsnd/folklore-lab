import type {SanityConfig} from '@sanity/sdk'
import {SanityApp} from '@sanity/sdk-react'
import {Suspense, useState} from 'react'
import {Board} from './Board'
import {Detail} from './Detail'
import './App.css'

const config: SanityConfig[] = [{projectId: '1jioj3uy', dataset: 'production'}]

// Folklore Lab Bench: the curators' view of the trial lifecycle, live from the Content Lake.
// Every view has a public, read-only mirror on the journal site (/pipeline, /trial/[id]).
export default function App() {
  const [selected, setSelected] = useState<string | null>(null)
  return (
    <SanityApp config={config} fallback={<p className="pad">Connecting to the Content Lake…</p>}>
      <div className="bench">
        <header>
          <h1>Folklore Lab Bench</h1>
          <p className="muted">
            Public mirror: <a href="https://folklore-lab.vercel.app/pipeline">folklore-lab.vercel.app/pipeline</a>
          </p>
        </header>
        <Suspense fallback={<p className="pad">Loading the board…</p>}>
          <Board selected={selected} onSelect={setSelected} />
        </Suspense>
        {selected && (
          <Suspense fallback={<p className="pad">Loading {selected}…</p>}>
            <Detail hypothesisId={selected} />
          </Suspense>
        )}
      </div>
    </SanityApp>
  )
}
