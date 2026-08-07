import { expect, test } from '@playwright/test';

function previewOrigin(): string {
  const baseURL = test.info().project.use.baseURL;
  if (typeof baseURL !== 'string') throw new Error('Playwright baseURL is required');
  return new URL(baseURL).origin;
}

test('local preview renders clearly labeled sample coding rows from its own API', async ({ page }) => {
  const origin = previewOrigin();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route((url) => url.origin !== origin && (url.protocol === 'http:' || url.protocol === 'https:'), (route) => route.abort());

  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.origin === origin
      && url.pathname === '/api/benchmarks/leaderboards/llm-coding'
      && url.searchParams.get('limit') === '50';
  });
  await page.goto('/leaderboards/llm/coding/', { waitUntil: 'domcontentloaded' });
  const response = await responsePromise;

  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/json');
  const payload = await response.json() as { freshness: { status: string; message?: string } };
  expect(payload.freshness).toMatchObject({
    status: 'stale',
    message: expect.stringContaining('LOCAL SAMPLE'),
  });

  await expect(page.getByRole('status')).toContainText('LOCAL SAMPLE');
  await expect(page.getByRole('table', { name: 'Coding benchmark' })).toContainText('Sample Atlas');
  await expect(page.getByRole('table', { name: 'Coding benchmark' })).toContainText('Sample Orbit');
});
