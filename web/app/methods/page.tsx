import type {Metadata} from 'next'
import Link from 'next/link'
import {fetchPublic} from '../../lib/sanity'
import {FailureBanner, NoticeBanner} from '../components'

export const metadata: Metadata = {title: 'Methods'}
export const revalidate = 300

interface Row {
  _id: string
  title: string
  definition: string
}

interface Definition {
  comparison: string
  effect: {definition: string; units: string; nullValue: number}
  test: {name: string; sidedness: string; implementation: string}
  smallestEffect: {value: number; units: string}
  bootstrap: {method: string; resamples: number; blockLength: number; blockUnit: string; ci: string; prng: {algorithm: string; seed: number}}
  correctionFamily: {method: string; alpha: number}
  verdictRules: {order: string; rules: {verdict: string; when: string}[]; departureFromSpec: string}
  missingData: string
}

// Rendered from the locked definitions themselves, so this page cannot drift from what was locked.
export default async function MethodsPage() {
  const result = await fetchPublic<Row[]>(`*[_type == "hypothesis" && status == "preregistered"] | order(_id asc){_id, title, definition}`)
  return (
    <main>
      <h1>Methods</h1>
      <p className="lede">
        The statistics plan is part of each locked hypothesis. Everything on this page is read from those locked definitions; all analysis
        runs in <code>lab/stats.ts</code>, pure and seeded, so CI can reproduce every number.
      </p>
      {!result.ok ? (
        <FailureBanner>{result.error}</FailureBanner>
      ) : result.data.length === 0 ? (
        <NoticeBanner>No locked hypotheses are published yet, so there is no plan to show.</NoticeBanner>
      ) : (
        <Plan rows={result.data.map((r) => ({...r, d: JSON.parse(r.definition) as Definition}))} />
      )}
    </main>
  )
}

function Plan({rows}: {rows: (Row & {d: Definition})[]}) {
  const shared = rows[0]!.d
  return (
    <>
      <table>
        <caption>Per-hypothesis plan</caption>
        <thead>
          <tr>
            <th scope="col">Hypothesis</th>
            <th scope="col">Comparison</th>
            <th scope="col">Effect</th>
            <th scope="col">Test</th>
            <th scope="col">Smallest effect of interest</th>
            <th scope="col">Bootstrap</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({_id, title, d}) => (
            <tr key={_id}>
              <th scope="row">
                <Link href={`/trial/${_id}`}>{title}</Link>
              </th>
              <td>{d.comparison}</td>
              <td>{d.effect.definition}</td>
              <td>
                {d.test.name}, {d.test.sidedness}
              </td>
              <td>
                {d.smallestEffect.value} {d.smallestEffect.units}
              </td>
              <td>
                {d.bootstrap.method}, B = {d.bootstrap.resamples.toLocaleString('en')}, blocks of {d.bootstrap.blockLength} {d.bootstrap.blockUnit},{' '}
                {d.bootstrap.prng.algorithm} seed {d.bootstrap.prng.seed}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Multiple comparisons</h2>
      <p>
        {shared.correctionFamily.method} across all six primary hypotheses at alpha {shared.correctionFamily.alpha}. Adjusted p-values are
        computed in code, never typed.
      </p>
      <h2>Verdict rules</h2>
      <p>{shared.verdictRules.order}</p>
      <ol>
        {shared.verdictRules.rules.map((r) => (
          <li key={r.verdict}>
            <strong>{r.verdict}</strong>: {r.when}
          </li>
        ))}
      </ol>
      <p className="meta">{shared.verdictRules.departureFromSpec}</p>
      <h2>Confidence intervals</h2>
      <p>{shared.bootstrap.ci}</p>
      <h2>Missing data</h2>
      <p>{shared.missingData}</p>
    </>
  )
}
