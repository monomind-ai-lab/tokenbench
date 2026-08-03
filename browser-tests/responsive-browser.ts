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
  if (expectCalculator) await expect(page.getByRole('heading', { name: /API-equivalent value/i })).toBeVisible();
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
        resultsColumns: getComputedStyle(document.querySelector('.results-content') as Element).gridTemplateColumns,
        comparisonTableDisplay: getComputedStyle(document.querySelector('.comparison-table') as Element).display,
        comparisonCardsDisplay: getComputedStyle(document.querySelector('.comparison-cards') as Element).display,
      }));

      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
      expect(dimensions.rangeHeights.every((height) => height >= 44)).toBe(true);
      expect(dimensions.comparisonCardsDisplay).toBe(viewport.cards ? 'grid' : 'none');
      expect(dimensions.comparisonTableDisplay).toBe(viewport.cards ? 'none' : 'table');
      expect(dimensions.controlsColumns.split(' ').length).toBe(viewport.width >= 768 ? 2 : 1);
      expect(dimensions.resultsColumns.split(' ').length).toBe(viewport.width >= 1024 ? 2 : 1);

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

  test('renders usable source evidence links for published offers', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 1000 });
    await openCalculator(page);
    const evidenceLinks = page.getByRole('link', { name: /View evidence for/i });
    expect(await evidenceLinks.count()).toBeGreaterThan(0);
    const first = evidenceLinks.first();
    await expect(first).toBeVisible();
    await expect(first).toHaveAttribute('href', /^https:\/\//);
    await expect(first).toHaveAttribute('target', '_blank');
    await expect(first).toHaveAttribute('rel', 'noreferrer');
    await first.focus();
    await expect(first).toBeFocused();
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
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FRONTEND_TEST_CATALOG) });
    });
    const navigation = page.goto('/');
    await expect(page.getByLabel('Loading verified catalog')).toBeVisible();
    await navigation;
    await expect(page.getByRole('heading', { name: /API-equivalent value/i })).toBeVisible();

    await page.unrouteAll();
    await openCalculator(page, { ...FRONTEND_TEST_CATALOG, plans: [], modelOffers: [] }, 200, false);
    await expect(page.getByText('No providers available')).toBeVisible();

    await page.unrouteAll();
    await page.evaluate(() => window.localStorage.clear());
    await openCalculator(page, FRONTEND_TEST_CATALOG, 503, false);
    await expect(page.getByRole('alert')).toContainText('Catalog unavailable');
    await expect(page.getByText('bootstrap', { exact: true })).toBeVisible();

    await page.unrouteAll();
    await openCalculator(page, { ...FRONTEND_TEST_CATALOG, freshness: { status: 'stale', checkedAt: '2026-08-02T00:00:00.000Z' } });
    await expect(page.getByText('The published catalog is stale; verify pricing before making a decision.')).toBeVisible();
  });
});
