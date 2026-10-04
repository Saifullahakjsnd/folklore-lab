import type {Metadata} from 'next'
import {OpenMeteoCredit} from '../components'

export const metadata: Metadata = {title: 'How it works'}

const TYPES: [string, string][] = [
  ['proverb', 'The saying, its origin, and citations.'],
  ['location', 'Coordinates and IANA time zone, with the source of the coordinates.'],
  ['hypothesis', 'The full operational definition as JSON, the thing that is hashed. Read-only once locked.'],
  ['preregistration', 'Canonical JSON, SHA-256, lock time and the person who locked it. Write-once.'],
  ['deviation', 'Why a locked hypothesis was replaced by a new version, and whether any data had been seen.'],
  ['erratum', 'A disclosed label error that cannot change a result. Not a deviation; the hash stays.'],
  ['dataSnapshot', 'Every download: query URL, retrieval time and SHA-256, as one document with an array of chunks.'],
  ['trial', 'Counts, effect, CI, p and adjusted p, all from lab/stats.ts, plus the lock hash it ran against.'],
  ['verdict', 'Allowed only if the trial hash matches its pre-registration and the outcome equals the computed verdict.'],
]

const STAGES: [string, string, string][] = [
  ['Draft', 'Agent or person', 'A hypothesis is drafted; the agent can do no more than this.'],
  ['Pre-registered', 'Person', 'Canonical JSON hashed and locked before any data is fetched.'],
  ['Data fetched', 'Runtime', 'Snapshot stored with checksums; refused if the hash no longer matches.'],
  ['Analysed (blinded)', 'Runtime', 'lab/stats.ts runs; results stay hidden.'],
  ['Unblinded', 'Person', 'Results revealed.'],
  ['Verdict approved', 'Person, never the agent', 'The verdict the locked rules produced is published.'],
  ['Abandoned', 'Automatic', 'On a hash mismatch: a deviation is filed and a new version must be locked.'],
]

export default function HowItWorks() {
  return (
    <main>
      <h1>How it works</h1>
      <h2>Pre-registration as data</h2>
      <p>
        Each hypothesis is canonicalised (sorted keys, no whitespace) and hashed with SHA-256 before any weather data exists. Every trial
        recomputes that hash first and refuses to run if it differs. Editing a locked hypothesis does not change it: it creates a deviation and
        a new version that must be locked in its own right.
      </p>
      <table>
        <caption>Document types in the Sanity dataset</caption>
        <thead>
          <tr>
            <th scope="col">Type</th>
            <th scope="col">Why it exists</th>
          </tr>
        </thead>
        <tbody>
          {TYPES.map(([type, why]) => (
            <tr key={type}>
              <th scope="row">
                <code>{type}</code>
              </th>
              <td>{why}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Workflow: trial lifecycle</h2>
      <table>
        <caption>Stages, and who may move a trial into each</caption>
        <thead>
          <tr>
            <th scope="col">Stage</th>
            <th scope="col">Who</th>
            <th scope="col">What happens</th>
          </tr>
        </thead>
        <tbody>
          {STAGES.map(([stage, who, what]) => (
            <tr key={stage}>
              <th scope="row">{stage}</th>
              <td>{who}</td>
              <td>{what}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <strong>Workflows status:</strong> the definition runs on the Sanity Workflows 0.36.0 engine and passes its in-memory test bench,
        including the rule that the agent can never lock or approve. It is not yet deployed to the project. Workflow guards are advisory, so
        the server enforces the same rules on every write.
      </p>
      <h2>Data and attribution</h2>
      <OpenMeteoCredit />
      <p>
        The weather is ERA5 reanalysis (about 25 km grid cells), pinned for the whole 1950–2024 period so the series never switches model. It
        is modelled, not measured at a station, and it smooths local showers.
      </p>
    </main>
  )
}
