import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'apps/web/e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'pnpm --filter @gasscope/api exec tsx src/index.ts',
      url: 'http://localhost:4000/healthz',
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        DATA_MODE: 'memory',
        DEMO_HOURS: '6',
        DEMO_SEED: '1559',
        ALLOW_INSECURE_MUTATIONS: 'true',
        API_PORT: '4000',
      },
    },
    {
      command: 'pnpm --filter @gasscope/web exec next dev --port 3000',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 180_000,
      env: {
        NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000',
      },
    },
  ],
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } } },
    { name: 'phone', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
  ],
})
