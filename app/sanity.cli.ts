import {defineCliConfig} from 'sanity/cli'

// The dev server defaults to port 3333, which is not assigned to this project.
// Set a port here before running `sanity dev` (see docs/BUILD_LOG.md).
export default defineCliConfig({
  app: {
    organizationId: process.env.SANITY_ORG_ID ?? '',
    entry: './src/App.tsx',
  },
})
