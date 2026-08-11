import { expect, test } from '@playwright/test';

function previewOrigin(): string {
  const baseURL = test.info().project.use.baseURL;
  if (typeof baseURL !== 'string') throw new Error('Playwright baseURL is required');
  return new URL(baseURL).origin;
}

async function blockExternalRequests(page: import('@playwright/test').Page): Promise<void> {
  const origin = previewOrigin();
  await page.route(
    (url) => url.origin !== origin && (url.protocol === 'http:' || url.protocol === 'https:'),
    (route) => route.abort(),
  );
}

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
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

test('Popular Models renders the weekly top 100 and searches every retained model', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await blockExternalRequests(page);

  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 1_000 });
    await page.goto('/models/', { waitUntil: 'networkidle' });

    await expect(page.getByRole('heading', { name: 'Popular AI models', level: 1 })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://tokenbench.monomind.one/models/');
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /weekly top 100/i);
    const directoryJsonLd = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(directoryJsonLd.some((value) => value.includes('CollectionPage'))).toBe(true);
    expect(directoryJsonLd.some((value) => value.includes('ItemList'))).toBe(true);
    const initial = JSON.parse((await page.locator('#models-initial-data').textContent()) ?? '{}') as { data?: { models?: unknown[] } };
    expect(initial.data?.models).toHaveLength(100);
    await expect(page.getByRole('link', { name: 'GPT-5.6 Sol' }).first()).toHaveAttribute('href', '/models/gpt-5-6-sol/');
    await expectNoHorizontalOverflow(page);

    const search = page.getByLabel('Search retained models');
    await search.fill('Sample Model 101');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.getByRole('link', { name: 'Sample Model 101' }).first()).toBeVisible();
    await expect(page).toHaveURL(/\/models\/\?q=Sample\+Model\+101$/);

    await search.fill('Retained Fixture');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.getByRole('link', { name: 'Retained Fixture' }).first()).toBeVisible();
    await expect(page.locator('.model-status-archived:visible')).toHaveText('Archived');
    await expectNoHorizontalOverflow(page);
  }
  expect(errors).toEqual([]);
});

test('model profile SSR exposes corrected evidence, missing facts, route conflict, and canonical metadata', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await blockExternalRequests(page);

  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 1_000 });
    await page.goto('/models/gpt-5-6-sol/', { waitUntil: 'networkidle' });

    await expect(page.getByRole('heading', { name: 'GPT-5.6 Sol', level: 1 })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://tokenbench.monomind.one/models/gpt-5-6-sol/');
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /benchmark scores.*route pricing/i);
    const profileJsonLd = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(profileJsonLd.some((value) => value.includes('Dataset'))).toBe(true);
    await expect(page.getByRole('article', { name: 'Coding' })).toContainText('78.0');
    await expect(page.locator('dl[aria-label="Capability radar values"]')).toContainText('Unavailable');
    await expect(page.locator('.model-price-route')).toHaveCount(2);
    await expect(page.locator('.evidence-conflict')).toHaveText('conflict');
    await expect(page.getByRole('heading', { name: 'Benchmark ledger', level: 2 })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
  expect(errors).toEqual([]);
});

test('retained model fallback, alias redirect, no-JavaScript HTML, and true 404 stay explicit', async ({ browser, page }) => {
  const origin = previewOrigin();
  await blockExternalRequests(page);

  const alias = await page.request.get(`${origin}/models/legacy-sol/`, { maxRedirects: 0 });
  expect(alias.status()).toBe(308);
  expect(alias.headers().location).toBe('/models/gpt-5-6-sol/');

  const missing = await page.goto('/models/unknown-fixture/', { waitUntil: 'domcontentloaded' });
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Model profile not found', level: 1 })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex,follow/);
  await expect(page.locator('#model-profile-initial-data')).toHaveCount(0);

  const noJavaScript = await browser.newContext({ baseURL: origin, javaScriptEnabled: false, viewport: { width: 390, height: 1_000 } });
  const noJavaScriptPage = await noJavaScript.newPage();
  try {
    await noJavaScriptPage.goto('/models/retained-fixture/');
    await expect(noJavaScriptPage.getByRole('heading', { name: 'Retained Fixture', level: 1 })).toBeVisible();
    await expect(noJavaScriptPage.getByRole('status')).toContainText('prior valid revision');
    await expect(noJavaScriptPage.locator('#model-profile-initial-data')).toHaveCount(1);
    await expect(noJavaScriptPage.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://tokenbench.monomind.one/models/retained-fixture/');
    await expectNoHorizontalOverflow(noJavaScriptPage);
  } finally {
    await noJavaScript.close();
  }
});
