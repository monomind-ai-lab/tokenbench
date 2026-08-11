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
    status: 'fresh',
    message: expect.stringContaining('LOCAL SAMPLE'),
  });

  await expect(page.locator('footer[aria-label="Published leaderboard evidence"]')).toContainText('LOCAL SAMPLE');
  await expect(page.getByRole('table', { name: 'Coding benchmark' })).toContainText('Sample Atlas');
  await expect(page.getByRole('table', { name: 'Coding benchmark' })).toContainText('Sample Orbit');
  const gptRow = page.getByRole('row', { name: /#3 GPT-5\.6 Sol/ });
  await expect(gptRow).toBeVisible();
  await expect(gptRow.getByText('78.0', { exact: true })).toBeVisible();
});

test('local preview accepts the summary through the frontend runtime contract', async ({ page }) => {
  const origin = previewOrigin();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route((url) => url.origin !== origin && (url.protocol === 'http:' || url.protocol === 'https:'), (route) => route.abort());

  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.origin === origin && url.pathname === '/api/benchmarks';
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const response = await responsePromise;

  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/json');
  const market = page.getByRole('region', { name: 'Market at a glance' });
  await expect(market).toContainText('Sample Atlas');
  await expect(market.locator('.home-snapshot-provenance')).toContainText('LOCAL SAMPLE');
});

test('correct score and last-good evidence survive a refresh outage', async ({ page }) => {
  const origin = previewOrigin();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route((url) => url.origin !== origin && (url.protocol === 'http:' || url.protocol === 'https:'), (route) => route.abort());

  await page.goto('/leaderboards/llm/coding/');
  const freshRow = page.getByRole('row', { name: /#3 GPT-5\.6 Sol/ });
  await expect(freshRow).toBeVisible();
  await expect(freshRow.getByText('78.0', { exact: true })).toBeVisible();

  await page.setExtraHTTPHeaders({ 'x-tokenbench-preview-state': '503' });
  await page.reload();
  await expect(page.getByText('Showing the last published revision while refresh is unavailable.')).toBeVisible();
  const cachedRow = page.getByRole('row', { name: /#3 GPT-5\.6 Sol/ });
  await expect(cachedRow).toBeVisible();
  await expect(cachedRow.getByText('78.0', { exact: true })).toBeVisible();
});

test('leaderboard metadata, share URL, footer, and width stay canonical', async ({ page }) => {
  const origin = previewOrigin();
  await page.setViewportSize({ width: 390, height: 900 });
  await page.route((url) => url.origin !== origin && (url.protocol === 'http:' || url.protocol === 'https:'), (route) => route.abort());

  for (const [path, heading, cardsLabel, score] of [
    ['/leaderboards/llm/coding/', 'Coding benchmark', 'Coding benchmark cards', '78.0'],
    ['/leaderboards/llm/overall/', 'Overall benchmarks', 'Overall benchmark cards', '81.5'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    const resultCards = page.getByRole('list', { name: cardsLabel });
    await expect(resultCards.getByRole('heading', { name: 'GPT-5.6 Sol' })).toBeVisible();
    await expect(resultCards.getByText(score, { exact: true })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://tokenbench.monomind.one${path}`);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.+/);
    await expect(page).toHaveTitle(/TokenBench/);
    await page.getByRole('button', { name: 'Share Leaderboard' }).click();
    await expect(page.getByRole('textbox', { name: 'Share URL' })).toHaveValue(`https://tokenbench.monomind.one${path}`);
    await page.getByRole('button', { name: 'Close share dialog' }).click();
    await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Data sources' })).toHaveCount(0);
    await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Methodology' })).toBeVisible();
    await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Privacy' })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  }
});
