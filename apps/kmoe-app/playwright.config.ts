import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: [['list']],
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'pnpm exec vite --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 }
      }
    },
    {
      name: 'large-desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1728, height: 1117 }
      }
    },
    {
      name: 'tablet-chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 1024, height: 1366 },
        hasTouch: true,
        deviceScaleFactor: 2
      }
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['iPhone 14'],
        browserName: 'chromium'
      }
    }
  ]
})
