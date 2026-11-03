import type { NextConfig } from 'next'

const pages = process.env.GITHUB_PAGES === 'true'
const basePath = pages ? '/Gas-Tracker' : ''

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@gasscope/shared', '@gasscope/analytics', '@gasscope/api'],
  ...(pages
    ? {
        output: 'export' as const,
        basePath,
        assetPrefix: basePath,
        trailingSlash: true,
        distDir: '.next-pages',
        images: { unoptimized: true },
      }
    : {}),
}

export default nextConfig
