import { defineConfig } from '@playwright/test';

const webServerEnv = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => name !== 'FORCE_COLOR' && name !== 'NO_COLOR'),
) as Record<string, string>;

webServerEnv.DISABLE_HMR = 'true';

export default defineConfig({
  testDir: './browser-tests',
  testMatch: 'local-preview-benchmark-api-browser.ts',
  workers: 1,
  reporter: 'line',
  outputDir: '/tmp/tokenbench-local-preview-playwright-results',
  use: {
    baseURL: 'http://127.0.0.1:4176',
    headless: true,
    launchOptions: {
      executablePath: process.env.CHROME_PATH ?? '/Applications/ego lite.app/Contents/MacOS/ego lite',
    },
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  webServer: {
    command: 'env -u FORCE_COLOR -u NO_COLOR npm run dev -- --port 4176 --host 127.0.0.1',
    env: webServerEnv,
    url: 'http://127.0.0.1:4176',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
