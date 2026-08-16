import { defineConfig } from '@playwright/test';

const webServerEnv = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => name !== 'FORCE_COLOR' && name !== 'NO_COLOR'),
) as Record<string, string>;

export default defineConfig({
  testDir: './browser-tests',
  testMatch: 'responsive-browser.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  outputDir: '/tmp/tokenbench-production-playwright-results',
  use: {
    baseURL: 'http://127.0.0.1:4175',
    headless: true,
    launchOptions: {
      executablePath: process.env.CHROME_PATH ?? '/Applications/ego lite.app/Contents/MacOS/ego lite',
    },
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  webServer: {
    command: 'npx wrangler pages dev dist --ip 127.0.0.1 --port 4175',
    env: webServerEnv,
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
