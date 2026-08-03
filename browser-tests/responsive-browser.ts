import { expect, test, type Page } from '@playwright/test';
import { FRONTEND_TEST_CATALOG } from '../src/frontend/test-fixtures';

const viewports = [
  { width: 320, layout: 'compact', cards: true },
  { width: 375, layout: 'compact', cards: true },
  { width: 768, layout: 'tablet', cards: false },
  { width: 1024, layout: 'desktop', cards: false },
  { width: 1440, layout: 'wide', cards: false },
] as const;

async function openCalculator(page: Page) {
  await page.route('https://*/*', (route) => route.abort());
  await page.route('http://127.0.0.1:4173/api/catalog', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { etag: `"${FRONTEND_TEST_CATALOG.revision}"` },
    body: JSON.stringify(FRONTEND_TEST_CATALOG),
  }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /API-equivalent value/i })).toBeVisible();
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

  test('keyboard Tab navigation reaches language, theme, and evidence links with visible focus', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 1000 });
    await openCalculator(page);
    await page.locator('body').click({ position: { x: 2, y: 2 } });

    const seen = new Map<string, { focusVisible: boolean; outlineWidth: string }>();
    for (let index = 0; index < 140 && seen.size < 3; index += 1) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const element = document.activeElement as HTMLElement | null;
        if (!element) return null;
        const label = element.getAttribute('aria-label') ?? '';
        const key = label.startsWith('View evidence') ? 'evidence' : label === 'Language' ? 'language' : label === 'Toggle dark theme' ? 'theme' : '';
        if (!key) return null;
        const style = getComputedStyle(element);
        return { key, focusVisible: element.matches(':focus-visible'), outlineWidth: style.outlineWidth };
      });
      if (focused) seen.set(focused.key, focused);
    }

    expect(seen.get('language')).toEqual(expect.objectContaining({ focusVisible: true, outlineWidth: '3px' }));
    expect(seen.get('theme')).toEqual(expect.objectContaining({ focusVisible: true, outlineWidth: '3px' }));
    expect(seen.get('evidence')).toEqual(expect.objectContaining({ focusVisible: true, outlineWidth: '3px' }));
  });
});
