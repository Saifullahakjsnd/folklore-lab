import type {NextConfig} from 'next'

const nextConfig: NextConfig = {
  // lab/ ships TypeScript source; /replicate runs it in the browser.
  transpilePackages: ['@folklore/lab'],
}

export default nextConfig
