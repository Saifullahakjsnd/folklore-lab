import {defineCliConfig} from 'sanity/cli'

// Port and org come from launch.ps1 (SANITY_APP_PORT=3436); 3333 belongs to a sibling Studio.
const port = Number(process.env.SANITY_APP_PORT)
if (!Number.isInteger(port) || port <= 0) throw new Error('SANITY_APP_PORT is not set; start the shell via launch.ps1')

export default defineCliConfig({
  app: {
    organizationId: process.env.SANITY_ORG_ID ?? '',
    entry: './src/App.tsx',
  },
  server: {port},
})
