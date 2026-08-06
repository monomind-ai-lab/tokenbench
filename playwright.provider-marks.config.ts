import { defineConfig } from '@playwright/test';

const webServerEnv = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => name !== 'FORCE_COLOR' && name !== 'NO_COLOR'),
) as Record<string, string>;

// Browser coverage needs a public test identifier so the real ProviderMark
// component renders a Brandfetch URL. Requests remain intercepted in the test.
webServerEnv.VITE_BRANDFETCH_CLIENT_ID ??= 'browser-test';

export default defineConfig({
  testDir: './browser-tests',
  testMatch: 'provider-mark-browser.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  outputDir: '/tmp/tokenbench-provider-mark-playwright-results',
  use: {
    baseURL: 'http://127.0.0.1:4174',
    headless: true,
    launchOptions: {
      executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    },
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  webServer: {
    command: 'env -u FORCE_COLOR -u NO_COLOR npm run dev -- --port 4174 --host 127.0.0.1',
    env: webServerEnv,
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
