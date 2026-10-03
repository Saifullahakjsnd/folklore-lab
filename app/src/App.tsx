import type {SanityConfig} from '@sanity/sdk'
import {SanityApp} from '@sanity/sdk-react'

const config: SanityConfig[] = [{projectId: '1jioj3uy', dataset: 'production'}]

export default function App() {
  return (
    <SanityApp config={config} fallback={<div>Loading…</div>}>
      <main>Lab Bench: scaffold only.</main>
    </SanityApp>
  )
}
