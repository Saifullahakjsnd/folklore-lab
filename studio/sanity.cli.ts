import {defineCliConfig} from 'sanity/cli'
import {dataset, projectId} from './env'

export default defineCliConfig({
  api: {projectId, dataset},
  server: {port: 3336},
  studioHost: 'folklore-lab',
  deployment: {appId: 'l063n1zh4aie0vqyoi5n1eno'},
})
