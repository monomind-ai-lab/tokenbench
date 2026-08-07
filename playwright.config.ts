import { defineConfig } from '@playwright/test';

const webServerEnv = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => name !== 'FORCE_COLOR' && name !== 'NO_COLOR'),
) as Record<string, string>;

// Browser assertions treat console errors as application regressions. Vite's
// development HMR client retries a WebSocket that Chromium blocks in this
// isolated localhost harness, producing unrelated console errors on every
// document navigation. The app is exercised through its production entry
// points, so disable HMR for the deterministic browser server.
webServerEnv.DISABLE_HMR = 'true';

export default defineConfig({
  testDir: './browser-tests',
  testMatch: 'responsive-browser.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  outputDir: '/tmp/tokenbench-playwright-results',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    launchOptions: {
      executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    },
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  webServer: {
    command: 'env -u FORCE_COLOR -u NO_COLOR npm run dev -- --port 4173 --host 127.0.0.1',
    env: webServerEnv,
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
