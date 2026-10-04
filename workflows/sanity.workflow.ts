// Deploy with `pnpm --filter @folklore/workflows exec sanity-workflows deploy --check` first.
// Needs Workflows enabled for the organisation (owner toggle). Not deployed yet.
import {defineWorkflowConfig} from '@sanity/workflow-engine/define'
import {trialLifecycle} from './src/trialLifecycle.ts'

export default defineWorkflowConfig({
  deployments: [
    {
      name: 'production',
      tag: 'production',
      expectedMinReaderModel: 10,
      workflowResource: {type: 'dataset', id: '1jioj3uy.production'},
      definitions: [trialLifecycle],
    },
  ],
})
