import {defineCliConfig} from 'sanity/cli'

// Port and org come from launch.ps1 (SANITY_APP_PORT=3436; 3333 belongs to a sibling Studio).
const port = Number(process.env.SANITY_APP_PORT ?? 3436)

export default defineCliConfig({
  app: {
    organizationId: process.env.SANITY_ORG_ID ?? '',
    entry: './src/App.tsx',
    title: 'Folklore Lab Bench',
  },
  server: {port},
  deployment: {appId: 'kwdguc66v0akx78kq5m0apbl'},
})
