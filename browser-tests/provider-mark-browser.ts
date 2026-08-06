import { expect, test, type Page } from '@playwright/test';
import {
  decisionSummaryEnvelope,
  fulfillJson,
  readyCodingLeaderboard,
  stubBenchmarkDirectory,
  stubLeaderboard,
} from './tokenbench-fixtures';

function previewOrigin(): string {
  const baseURL = test.info().project.use.baseURL;
  if (typeof baseURL !== 'string') throw new Error('Playwright baseURL is required for origin-scoped browser coverage.');
  return new URL(baseURL).origin;
}

async function blockExternalRequests(page: Page, origin: string): Promise<void> {
  await page.route((url) => url.origin !== origin && (url.protocol === 'http:' || url.protocol === 'https:'), (route) => route.abort());
}

test('provider marks switch Brandfetch variants with the site theme without changing their requested dimensions', async ({ page }) => {
  const origin = previewOrigin();
  let releaseInitialAssets = () => {};
  const initialAssetsReleased = new Promise<void>((resolve) => { releaseInitialAssets = resolve; });
  let signalInitialRequest = () => {};
  const initialRequest = new Promise<void>((resolve) => { signalInitialRequest = resolve; });
  let heldInitialAsset = true;

  await page.setViewportSize({ width: 1440, height: 1000 });
  await blockExternalRequests(page, origin);
  await page.route('https://cdn.brandfetch.io/**', async (route) => {
    signalInitialRequest();
    if (heldInitialAsset) await initialAssetsReleased;
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#137fec"/></svg>',
    });
  });
  await stubBenchmarkDirectory(page, origin, decisionSummaryEnvelope());
  await page.route((url) => url.origin === origin && url.pathname.startsWith('/api/benchmarks/leaderboards/'), (route) => fulfillJson(route, {
    error: 'Published benchmark data is unavailable for this fixture route.',
  }, 503));
  await stubLeaderboard(page, origin, 'llm-coding', readyCodingLeaderboard());

  await page.goto('/leaderboards/llm/coding/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('table', { name: 'Coding benchmark' })).toBeVisible({ timeout: 15_000 });
  const mark = page.locator('.leaderboard-desktop-table .leaderboard-provider img.provider-mark').first();
  await expect(mark).toHaveAttribute('src', /\/theme\/dark\/icon/);
  await initialRequest;

  const reservedBounds = await mark.evaluate((image) => {
    const bounds = image.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height };
  });
  expect(reservedBounds).toEqual({ width: 20, height: 20 });

  heldInitialAsset = false;
  releaseInitialAssets();
  await expect.poll(() => mark.evaluate((image) => ({
    naturalWidth: (image as HTMLImageElement).naturalWidth,
    naturalHeight: (image as HTMLImageElement).naturalHeight,
  }))).toEqual({ naturalWidth: 400, naturalHeight: 200 });
  await expect.poll(() => mark.evaluate((image) => {
    const bounds = image.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height };
  })).toEqual(reservedBounds);

  await page.getByRole('button', { name: 'Toggle light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(mark).toHaveAttribute('src', /\/theme\/light\/icon/);
  await expect.poll(() => mark.evaluate((image) => {
    const bounds = image.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height };
  })).toEqual(reservedBounds);
});
