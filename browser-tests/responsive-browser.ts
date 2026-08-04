import { expect, test, type Page } from '@playwright/test';
import { FRONTEND_TEST_CATALOG } from '../src/frontend/test-fixtures';

const viewports = [
  { width: 320, layout: 'compact', cards: true },
  { width: 375, layout: 'compact', cards: true },
  { width: 768, layout: 'tablet', cards: false },
  { width: 1024, layout: 'desktop', cards: false },
  { width: 1440, layout: 'wide', cards: false },
] as const;

async function openCalculator(page: Page, catalog = FRONTEND_TEST_CATALOG, status = 200, expectCalculator = true) {
  await page.route('https://*/*', (route) => route.abort());
  await page.route('http://127.0.0.1:4173/api/catalog', (route) => route.fulfill({
    status,
    contentType: 'application/json',
    headers: { etag: `"${catalog.revision}"` },
    body: JSON.stringify(catalog),
  }));
  await page.goto('/');
  if (expectCalculator) await expect(page.getByRole('heading', { name: /API[- ]equivalent value/i })).toBeVisible({ timeout: 15_000 });
}

async function tabTo(page: Page, selector: string) {
  for (let index = 0; index < 180; index += 1) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate((target) => {
      const element = document.activeElement as HTMLElement | null;
      if (!element?.matches(target) || !element.matches(':focus-visible')) return null;
      const style = getComputedStyle(element);
      return { outlineWidth: style.outlineWidth, outlineStyle: style.outlineStyle, outlineColor: style.outlineColor };
    }, selector);
    if (focused) return focused;
  }
  throw new Error(`Tab did not reach visible focus for ${selector}`);
}

function expectVisibleFocus(style: { outlineWidth: string; outlineStyle: string; outlineColor: string }) {
  expect(style.outlineStyle).toBe('solid');
  expect(Number.parseFloat(style.outlineWidth)).toBeGreaterThan(0);
  const color = style.outlineColor.replace(/\s/g, '');
  expect(color).not.toBe('');
  expect(color).not.toBe('transparent');
  expect(color).not.toBe('rgba(0,0,0,0)');
}

test.describe('responsive calculator browser harness', () => {
  for (const viewport of viewports) {
    test(`${viewport.width}px renders the expected mode without document overflow`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: 1000 });
      await openCalculator(page);

      await expect(page.locator('.app-shell')).toHaveAttribute('data-layout', viewport.layout);
      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        header: document.querySelector('.header-inner')?.getBoundingClientRect().toJSON(),
        nav: document.querySelector('.primary-nav')?.getBoundingClientRect().toJSON(),
        actions: document.querySelector('.header-actions')?.getBoundingClientRect().toJSON(),
        rangeHeights: Array.from(document.querySelectorAll<HTMLInputElement>("input[type='range']")).map((input) => input.getBoundingClientRect().height),
        controlsColumns: getComputedStyle(document.querySelector('.control-grid') as Element).gridTemplateColumns,
        resultsColumns: getComputedStyle(document.querySelector('.results-grid') as Element).gridTemplateColumns,
        comparisonTableDisplay: getComputedStyle(document.querySelector('.comparison-table') as Element).display,
        comparisonCardsDisplay: getComputedStyle(document.querySelector('.comparison-cards') as Element).display,
      }));

      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
      expect(dimensions.rangeHeights.every((height) => height >= 44)).toBe(true);
      expect(dimensions.comparisonCardsDisplay).toBe(viewport.cards ? 'grid' : 'none');
      expect(dimensions.comparisonTableDisplay).toBe(viewport.cards ? 'none' : 'table');
      expect(dimensions.controlsColumns.split(' ').length).toBe(viewport.width >= 768 ? 2 : 1);
      expect(dimensions.resultsColumns.split(' ').length).toBe(viewport.width >= 800 ? 2 : 1);

      if (viewport.width < 768) {
        expect(dimensions.header?.right).toBeLessThanOrEqual(dimensions.clientWidth + 0.5);
        expect(dimensions.nav?.right).toBeLessThanOrEqual(dimensions.clientWidth + 0.5);
        expect(dimensions.actions?.right).toBeLessThanOrEqual(dimensions.clientWidth + 0.5);
      }
    });
  }

  for (const viewport of viewports) {
    test(`${viewport.width}px keyboard Tab reaches provider, plan, model, and workload controls with visible focus`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: 1000 });
      await openCalculator(page);
      await page.locator('body').click({ position: { x: 2, y: 2 } });
      for (const selector of ['input[name="provider"]', 'input[name="plan"]', 'input[type="checkbox"]', '#monthly-tokens', 'input[type="range"]']) {
        expect(await tabTo(page, selector)).toEqual(expect.objectContaining({ outlineWidth: '3px', outlineStyle: 'solid' }));
      }
    });
  }

  test('reaches language, theme, and usable evidence links with a visible keyboard focus outline', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 1000 });
    await openCalculator(page);
    const evidenceLinks = page.getByRole('link', { name: /View evidence for/i });
    expect(await evidenceLinks.count()).toBeGreaterThan(0);
    const first = evidenceLinks.first();
    await expect(first).toBeVisible();
    await expect(first).toHaveAttribute('href', /^https:\/\//);
    await expect(first).toHaveAttribute('target', '_blank');
    await expect(first).toHaveAttribute('rel', 'noreferrer');
    await page.locator('body').click({ position: { x: 2, y: 2 } });
    for (const selector of ['select[aria-label="Language"]', 'button[aria-label="Toggle dark theme"]', 'a.evidence-link']) {
      expectVisibleFocus(await tabTo(page, selector));
    }
  });

  test('desktop calculator does not cover the comparison after scrolling to it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openCalculator(page);

    const comparisonOwnsVisibleContent = await page.evaluate(() => {
      const comparison = document.querySelector('#comparison');
      if (!comparison) return false;
      comparison.scrollIntoView({ block: 'start', behavior: 'instant' });
      const rect = comparison.getBoundingClientRect();
      const sampleX = Math.min(window.innerWidth - 1, rect.left + 120);
      const sampleY = Math.min(window.innerHeight - 1, Math.max(90, rect.top + 120));
      const topElement = document.elementFromPoint(sampleX, sampleY);
      return topElement ? comparison.contains(topElement) : false;
    });

    expect(comparisonOwnsVisibleContent).toBe(true);
  });

  test('persists dark theme and applies the selected language without changing the catalog controls', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 1000 });
    await openCalculator(page);
    const initialProvider = await page.locator('input[name="provider"]:checked').inputValue();
    await page.getByRole('button', { name: 'Toggle dark theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('combobox', { name: 'Language' }).selectOption('zh-TW');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
    await expect(page.locator('input[name="provider"]:checked')).toHaveValue(initialProvider);
  });

  test('renders loading, empty, error, bootstrap, and stale catalog states', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 1000 });
    await page.route('https://*/*', (route) => route.abort());
    await page.route('http://127.0.0.1:4173/api/catalog', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FRONTEND_TEST_CATALOG) });
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByLabel('Loading verified catalog')).toBeVisible();
    await expect(page.getByRole('heading', { name: /API[- ]equivalent value/i })).toBeVisible({ timeout: 15_000 });

    await page.unrouteAll();
    await openCalculator(page, { ...FRONTEND_TEST_CATALOG, plans: [], modelOffers: [] }, 200, false);
    await expect(page.getByText('No providers available')).toBeVisible();

    await page.unrouteAll();
    await page.evaluate(() => window.localStorage.clear());
    await openCalculator(page, FRONTEND_TEST_CATALOG, 503, false);
    await expect(page.getByRole('alert')).toContainText('Catalog unavailable');
    await expect(page.getByRole('heading', { name: /Individual Subscription Plans/i })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('checked-in verified bootstrap');

    await page.unrouteAll();
    await openCalculator(page, { ...FRONTEND_TEST_CATALOG, freshness: { status: 'stale', checkedAt: '2026-08-02T00:00:00.000Z' } });
    await expect(page.getByText('The published catalog is stale; verify pricing before making a decision.')).toBeVisible();
  });
});

test.describe('guides browser harness', () => {
  for (const width of [320, 768, 1440]) {
    test(`${width}px guide hub stays readable without horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.route('https://*/*', (route) => route.abort());
      await page.goto('/guides/');

      await expect(page.getByRole('heading', { name: 'Spend smarter on AI', level: 1 })).toBeVisible();
      await expect(page.locator('.guide-card')).toHaveCount(5);
      await expect(page.getByRole('link', { name: 'Guides', exact: true })).toHaveAttribute('aria-current', 'page');
      const dimensions = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    });
  }

  test('article ships crawlable body, unique metadata, structured data, and cross-links', async ({ page, request }) => {
    const path = '/guides/track-claude-code-usage/';
    const response = await request.get(path);
    const rawHtml = await response.text();
    expect(rawHtml).toContain('<h1>How to Track Claude Code Usage, Tokens, and Spend</h1>');
    expect(rawHtml).toContain('Official references');
    expect(rawHtml).toContain('application/ld+json');

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.route('https://*/*', (route) => route.abort());
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'How to Track Claude Code Usage, Tokens, and Spend', level: 1 })).toBeVisible();
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://ai-plans.monomind.one${path}`);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /subscription limits differ from API billing/i);
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(2);
    await expect(page.getByRole('link', { name: /Models, usage, and limits/i })).toHaveAttribute('href', /^https:\/\/support\.claude\.com/);
    await expect(page.getByRole('heading', { name: 'Related guides' })).toBeVisible();
  });

  test('guide theme control persists the selected dark mode', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 1000 });
    await page.route('https://*/*', (route) => route.abort());
    await page.goto('/guides/openrouter-guide-model-routing-cost-controls/');
    await page.getByRole('button', { name: 'Toggle dark theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});
