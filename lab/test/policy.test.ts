import {describe, expect, test} from 'vitest'
import {canonicalize} from '../src/canonical.ts'
import {sha256Hex} from '../src/hash.ts'
import {authorize, classifyActor, Forbidden, verdictBlockers, type VerdictCheckInput} from '../src/policy.ts'

// Ids as the server sees them from /users/me (project-scoped: our robot is "pp…", a human "p…"). Robots are
// told apart by provider "sanity-token", never by id shape.
const known = {runtimeId: 'ppruntime1', agentId: 'ppagent01', curatorIds: ['pCurator1']}
const robot = (id: string) => ({id, provider: 'sanity-token'})
const human = (id: string) => ({id, provider: 'google'})

describe('who may act (server-side, not advisory)', () => {
  test("classification uses Sanity's own provider report and exact ids, never an id prefix or a self-reported kind", () => {
    expect(classifyActor(human('pCurator1'), known)).toBe('curator')
    expect(classifyActor(human('pVisitor2'), known)).toBe('person')
    expect(classifyActor(robot('ppruntime1'), known)).toBe('runtime')
    expect(classifyActor(robot('ppagent01'), known)).toBe('agent')
    expect(classifyActor(robot('ppother99'), known)).toBe('unknown-robot')
  })

  test("a robot carrying a curator's id, or the runtime id without being a robot, gains nothing", () => {
    expect(classifyActor(robot('pCurator1'), known)).toBe('unknown-robot')
    expect(classifyActor(human('ppruntime1'), known)).toBe('person')
  })

  test('the agent can propose but never lock, unblind or approve', () => {
    expect(() => authorize('propose', 'agent')).not.toThrow()
    for (const action of ['lock', 'unblind', 'approve-verdict'] as const) expect(() => authorize(action, 'agent')).toThrow(Forbidden)
  })

  test('only named curators lock, unblind and approve; only the runtime records fetches and analyses', () => {
    for (const action of ['lock', 'unblind', 'approve-verdict'] as const) {
      expect(() => authorize(action, 'curator')).not.toThrow()
      expect(() => authorize(action, 'person')).toThrow(Forbidden)
      expect(() => authorize(action, 'runtime')).toThrow(Forbidden)
      expect(() => authorize(action, 'unknown-robot')).toThrow(Forbidden)
    }
    for (const action of ['record-fetch', 'record-analysis', 'hash-mismatch'] as const) {
      expect(() => authorize(action, 'runtime')).not.toThrow()
      expect(() => authorize(action, 'person')).toThrow(Forbidden)
      expect(() => authorize(action, 'agent')).toThrow(Forbidden)
    }
  })
})

describe('verdicts only on matching hashes', () => {
  async function ok(): Promise<VerdictCheckInput> {
    const definition = {_id: 'hypothesis-x-v1', version: 1, predictor: {threshold: 0.2}}
    const canonicalJson = canonicalize(definition)
    const sha256 = await sha256Hex(canonicalJson)
    return {
      hypothesisDefinition: JSON.stringify(definition, null, 2),
      preregistration: {hypothesisId: 'hypothesis-x-v1', sha256, canonicalJson},
      trial: {hypothesisId: 'hypothesis-x-v1', lockSha256: sha256, blinded: false, computedVerdict: 'Inconclusive', stage: 'unblinded'},
      outcome: 'Inconclusive',
    }
  }

  test('a clean trial may get its computed verdict', async () => {
    expect(await verdictBlockers(await ok())).toEqual([])
  })

  test('an edit to the hypothesis after lock blocks the verdict', async () => {
    const input = await ok()
    input.hypothesisDefinition = JSON.stringify({_id: 'hypothesis-x-v1', version: 1, predictor: {threshold: 0.3}})
    expect(await verdictBlockers(input)).toContain('hypothesis was edited after lock: file a deviation')
  })

  test('a trial that ran on another hash, is blinded, is in the wrong stage, or a hand-typed verdict, is blocked', async () => {
    const input = await ok()
    input.trial = {...input.trial, lockSha256: 'f'.repeat(64), blinded: true, stage: 'analysedBlinded'}
    input.outcome = 'Supported'
    const reasons = await verdictBlockers(input)
    expect(reasons).toEqual(
      expect.arrayContaining([
        'trial ran against a different hash',
        'trial is still blinded',
        'trial is in stage "analysedBlinded", not "unblinded"',
        'the locked rules give "Inconclusive", not "Supported"',
      ]),
    )
  })

  test('a tampered pre-registration record is detected', async () => {
    const input = await ok()
    input.preregistration = {...input.preregistration, canonicalJson: input.preregistration.canonicalJson.replace('0.2', '0.3')}
    expect(await verdictBlockers(input)).toContain('pre-registration record is corrupt')
  })
})
