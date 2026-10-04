import {describe, expect, test} from 'vitest'
import {decideApproval} from '../src/approval.ts'
import {canonicalize} from '../src/canonical.ts'
import {sha256Hex} from '../src/hash.ts'
import type {VerdictCheckInput} from '../src/policy.ts'

const known = {runtimeId: 'ppruntime1', agentId: 'ppagent01', curatorIds: ['pCurator1']}

async function cleanCheck(): Promise<VerdictCheckInput> {
  const definition = {_id: 'hypothesis-x-v1', version: 1}
  const canonicalJson = canonicalize(definition)
  const sha256 = await sha256Hex(canonicalJson)
  return {
    hypothesisDefinition: JSON.stringify(definition),
    preregistration: {hypothesisId: 'hypothesis-x-v1', sha256, canonicalJson},
    trial: {hypothesisId: 'hypothesis-x-v1', lockSha256: sha256, blinded: false, computedVerdict: 'Supported', stage: 'unblinded'},
    outcome: 'Supported',
  }
}

describe('server-side verdict approval', () => {
  test('a named curator approving the computed verdict on a clean trial is allowed', async () => {
    expect(await decideApproval({id: 'pCurator1', provider: 'github', name: 'Owner'}, known, await cleanCheck())).toEqual({ok: true, approver: 'Owner (pCurator1)'})
  })

  test('the agent, the runtime, an unknown robot and a non-curator person are all refused with 403', async () => {
    for (const caller of [
      {id: 'ppagent01', provider: 'sanity-token'},
      {id: 'ppruntime1', provider: 'sanity-token'},
      {id: 'ppother', provider: 'sanity-token'},
      {id: 'pCurator1', provider: 'sanity-token'}, // a robot cannot borrow a curator's id
      {id: 'pVisitor2', provider: 'google'},
    ]) {
      const d = await decideApproval(caller, known, await cleanCheck())
      expect(d).toMatchObject({ok: false, status: 403})
    }
  })

  test('a curator cannot approve a verdict on an edited hypothesis or a different outcome (409)', async () => {
    const edited = {...(await cleanCheck()), hypothesisDefinition: JSON.stringify({_id: 'hypothesis-x-v1', version: 2})}
    expect(await decideApproval({id: 'pCurator1', provider: 'github'}, known, edited)).toMatchObject({ok: false, status: 409})
    const wrongOutcome = {...(await cleanCheck()), outcome: 'Contradicted'}
    expect(await decideApproval({id: 'pCurator1', provider: 'github'}, known, wrongOutcome)).toMatchObject({ok: false, status: 409})
  })
})
