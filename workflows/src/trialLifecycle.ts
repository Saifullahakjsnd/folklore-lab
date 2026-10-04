// trialLifecycle: Draft -> Pre-registered -> Data fetched -> Analysed (blinded) -> Unblinded
// -> Verdict approved, with Abandoned reachable from every stage after lock.
//
// Who may act (spec): people lock, unblind and approve; the runtime fetches and analyses;
// the agent may only draft. Gates sit on action filters, the caller-bound site.
//
// F33 (Workflows 0.36.0): the engine reports every resolved actor as kind "person", robot
// tokens included, so `$actor.kind == "person"` gates nothing. The working discriminator is
// the id namespace: robot tokens have ids starting "p-". The agent and the runtime both run
// on robot tokens. The runtime is told apart by its exact token id, supplied at start.
// All of this is advisory: the server routes enforce the same rules (guards can be bypassed).
import {defineAction, defineActivity, defineField, defineStage, defineTransition, defineWorkflow} from '@sanity/workflow-engine/define'

export const PERSON_ONLY = '!string::startsWith($actor.id, "p-")'
export const RUNTIME_ONLY = '$actor.id == $fields.runtimeActorId'

const toAbandoned = defineTransition({name: 'to-abandoned', title: 'Deviation filed', to: 'abandoned', when: '$anyActivityFailed'})

/** Runtime-only action that fails the stage's activity when the lock hash no longer matches. */
const hashMismatch = defineAction({
  name: 'hash-mismatch',
  title: 'Hash mismatch: file a deviation',
  filter: RUNTIME_ONLY,
  status: 'failed',
})

export const trialLifecycle = defineWorkflow({
  name: 'trial-lifecycle',
  title: 'Trial lifecycle',
  description: 'One hypothesis from draft to an approved verdict, with pre-registration enforced.',
  initialStage: 'draft',
  start: {requirements: [{type: 'singleSubject', name: 'one-open-trial', title: 'A trial is already open for this hypothesis'}]},
  fields: [
    defineField({type: 'subject', name: 'subject', title: 'Hypothesis', required: true, initialValue: {type: 'input'}}),
    defineField({type: 'string', name: 'runtimeActorId', title: 'Runtime token id', required: true, initialValue: {type: 'input'}}),
  ],
  stages: [
    defineStage({
      name: 'draft',
      title: 'Draft',
      activities: [
        defineActivity({
          name: 'lock',
          title: 'Lock the pre-registration',
          actions: [defineAction({name: 'lock', title: 'Lock', filter: PERSON_ONLY, status: 'done'})],
        }),
      ],
      transitions: [defineTransition({name: 'to-preregistered', to: 'preregistered'})],
    }),
    defineStage({
      name: 'preregistered',
      title: 'Pre-registered',
      activities: [
        defineActivity({
          name: 'fetch',
          title: 'Fetch and checksum the data',
          actions: [defineAction({name: 'record-fetch', title: 'Snapshot stored', filter: RUNTIME_ONLY, status: 'done'}), hashMismatch],
        }),
      ],
      transitions: [toAbandoned, defineTransition({name: 'to-data-fetched', to: 'dataFetched', when: '$allActivitiesDone'})],
    }),
    defineStage({
      name: 'dataFetched',
      title: 'Data fetched',
      activities: [
        defineActivity({
          name: 'analyse',
          title: 'Run lab/stats.ts (results stay hidden)',
          actions: [defineAction({name: 'record-analysis', title: 'Analysis stored', filter: RUNTIME_ONLY, status: 'done'}), hashMismatch],
        }),
      ],
      transitions: [toAbandoned, defineTransition({name: 'to-analysed', to: 'analysedBlinded', when: '$allActivitiesDone'})],
    }),
    defineStage({
      name: 'analysedBlinded',
      title: 'Analysed (blinded)',
      activities: [
        defineActivity({
          name: 'unblind',
          title: 'Reveal the results',
          actions: [defineAction({name: 'unblind', title: 'Unblind', filter: PERSON_ONLY, status: 'done'}), hashMismatch],
        }),
      ],
      transitions: [toAbandoned, defineTransition({name: 'to-unblinded', to: 'unblinded', when: '$allActivitiesDone'})],
    }),
    defineStage({
      name: 'unblinded',
      title: 'Unblinded',
      activities: [
        defineActivity({
          name: 'approve',
          title: 'Approve the verdict the locked rules produced',
          actions: [defineAction({name: 'approve-verdict', title: 'Approve verdict', filter: PERSON_ONLY, status: 'done'}), hashMismatch],
        }),
      ],
      transitions: [toAbandoned, defineTransition({name: 'to-approved', to: 'verdictApproved', when: '$allActivitiesDone'})],
    }),
    defineStage({name: 'verdictApproved', title: 'Verdict approved'}),
    defineStage({name: 'abandoned', title: 'Abandoned (deviation filed)'}),
  ],
})
