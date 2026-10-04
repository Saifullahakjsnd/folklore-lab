import {ActionDisabledError, type Actor} from '@sanity/workflow-engine'
import {createBench, subjectField} from '@sanity/workflow-engine-test'
import {describe, expect, test} from 'vitest'
import {trialLifecycle} from '../src/trialLifecycle.ts'

// Id shapes as observed in this project (2026-10-04): a human's account-global id is "g" +
// letters; a robot token resolves to a sanityUserId starting "g-". Legacy robots use "p-".
const person: Actor = {kind: 'person', id: 'gRcurator01', roles: ['administrator']}
const otherPerson: Actor = {kind: 'person', id: 'gRvisitor02', roles: ['editor']}
const runtime: Actor = {kind: 'person', id: 'g-1runtime01', roles: ['editor']} // robot; the engine labels it "person" (F33)
const agent: Actor = {kind: 'agent', id: 'g-1agent01', roles: ['editor']}
const robotClaimingPerson: Actor = {kind: 'person', id: 'g-1agent01', roles: ['editor']}
const legacyRobot: Actor = {kind: 'person', id: 'p-legacy01', roles: ['administrator']}

async function start() {
  const hypothesis = {_id: 'hypothesis-rain-before-seven-v1', _type: 'hypothesis', title: 'Rain before seven'}
  const bench = createBench({now: '2026-10-04T00:00:00.000Z', documents: [hypothesis]})
  await bench.deployDefinitions({expectedMinReaderModel: 10, definitions: [trialLifecycle]})
  const {instance} = await bench.startInstance({
    definition: 'trial-lifecycle',
    initialFields: [
      subjectField(hypothesis._id, {type: 'hypothesis'}),
      {type: 'string', name: 'runtimeActorId', value: runtime.id},
      {type: 'assignees', name: 'curators', value: [{type: 'user', id: person.id}]},
    ],
  })
  const fire = (activity: string, action: string, actor: Actor) => bench.fireAction({instanceId: instance._id, activity, action, actor})
  const allowed = async (action: string, actor: Actor) => {
    const evaluation = await bench.evaluate({instanceId: instance._id, actor})
    return evaluation.currentStage.activities.flatMap((a) => a.actions).find((a) => a.action.name === action)?.allowed ?? false
  }
  return {bench, instance, fire, allowed, stage: () => bench.currentStage(instance._id)}
}

describe('trialLifecycle on the Workflows 0.36.0 test bench', () => {
  test('happy path: person locks, runtime fetches and analyses, person unblinds and approves', async () => {
    const t = await start()
    expect(await t.stage()).toBe('draft')
    await t.fire('lock', 'lock', person)
    expect(await t.stage()).toBe('preregistered')
    await t.fire('fetch', 'record-fetch', runtime)
    expect(await t.stage()).toBe('dataFetched')
    await t.fire('analyse', 'record-analysis', runtime)
    expect(await t.stage()).toBe('analysedBlinded')
    await t.fire('unblind', 'unblind', person)
    expect(await t.stage()).toBe('unblinded')
    await t.fire('approve', 'approve-verdict', person)
    expect(await t.stage()).toBe('verdictApproved')
  })

  test('the agent cannot lock', async () => {
    const t = await start()
    expect(await t.allowed('lock', agent)).toBe(false)
    await expect(t.fire('lock', 'lock', agent)).rejects.toBeInstanceOf(ActionDisabledError)
    expect(await t.stage()).toBe('draft')
  })

  test('a robot whose engine id starts "g-" (as ours do) cannot lock, even though the F33 "p-" test would admit it', async () => {
    const t = await start()
    expect(runtime.id.startsWith('p-')).toBe(false) // F33's gate would have classed this robot as a person
    expect(await t.allowed('lock', runtime)).toBe(false)
    await expect(t.fire('lock', 'lock', runtime)).rejects.toBeInstanceOf(ActionDisabledError)
  })

  test('a person who is not a named curator cannot lock; neither can a legacy p- robot with a high role', async () => {
    const t = await start()
    await expect(t.fire('lock', 'lock', otherPerson)).rejects.toBeInstanceOf(ActionDisabledError)
    await expect(t.fire('lock', 'lock', legacyRobot)).rejects.toBeInstanceOf(ActionDisabledError)
    expect(await t.stage()).toBe('draft')
  })

  test('F33: a robot token that claims kind "person" still cannot lock or approve', async () => {
    const t = await start()
    expect(await t.allowed('lock', robotClaimingPerson)).toBe(false)
    await expect(t.fire('lock', 'lock', robotClaimingPerson)).rejects.toBeInstanceOf(ActionDisabledError)
    await t.fire('lock', 'lock', person)
    await t.fire('fetch', 'record-fetch', runtime)
    await t.fire('analyse', 'record-analysis', runtime)
    await t.fire('unblind', 'unblind', person)
    await expect(t.fire('approve', 'approve-verdict', robotClaimingPerson)).rejects.toBeInstanceOf(ActionDisabledError)
    await expect(t.fire('approve', 'approve-verdict', runtime)).rejects.toBeInstanceOf(ActionDisabledError)
    expect(await t.stage()).toBe('unblinded')
  })

  test('a person cannot perform runtime steps, and the agent cannot impersonate the runtime', async () => {
    const t = await start()
    await t.fire('lock', 'lock', person)
    await expect(t.fire('fetch', 'record-fetch', person)).rejects.toBeInstanceOf(ActionDisabledError)
    await expect(t.fire('fetch', 'record-fetch', agent)).rejects.toBeInstanceOf(ActionDisabledError)
    expect(await t.stage()).toBe('preregistered')
  })

  test('a hash mismatch after lock abandons the trial (deviation required)', async () => {
    const t = await start()
    await t.fire('lock', 'lock', person)
    await t.fire('fetch', 'record-fetch', runtime)
    await t.fire('analyse', 'hash-mismatch', runtime)
    expect(await t.stage()).toBe('abandoned')
  })

  test('only one open trial per hypothesis', async () => {
    const t = await start()
    await expect(
      t.bench.startInstance({
        definition: 'trial-lifecycle',
        initialFields: [
          subjectField('hypothesis-rain-before-seven-v1', {type: 'hypothesis'}),
          {type: 'string', name: 'runtimeActorId', value: runtime.id},
          {type: 'assignees', name: 'curators', value: [{type: 'user', id: person.id}]},
        ],
      }),
    ).rejects.toThrow()
  })
})
