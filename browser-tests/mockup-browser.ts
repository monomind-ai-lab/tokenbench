import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MOCKUP_PAGES, MOCKUP_THEMES, MOCKUP_VIEWPORTS } from '../scripts/mockup-manifest';

const CHECK_VIEWPORTS = [...MOCKUP_VIEWPORTS, { width: 320, height: 844 }] as const;

for (const mockup of MOCKUP_PAGES) {
  for (const theme of MOCKUP_THEMES) {
    for (const viewport of CHECK_VIEWPORTS) {
      test(`${mockup.id} ${viewport.width}px ${theme}`, async ({ page }) => {
        const consoleErrors: string[] = [];
        page.on('console', (message) => {
          if (message.type() === 'error') consoleErrors.push(message.text());
        });

        await page.setViewportSize(viewport);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(`${pathToFileURL(resolve(mockup.file)).href}?theme=${theme}`);

        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.locator('h1')).toHaveCount(1);
        const brand = page.locator('.brand-home img');
        await expect(brand).toHaveCount(1);
        expect(await brand.evaluate((image: HTMLImageElement) => ({
          complete: image.complete,
          naturalWidth: image.naturalWidth,
        }))).toEqual({ complete: true, naturalWidth: 512 });

        const geometry = await page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          targets: [...document.querySelectorAll<HTMLElement>('button, a, input, select')]
            .filter((node) => {
              const style = getComputedStyle(node);
              return style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length > 0;
            })
            .map((node) => {
              const hitTarget = node.matches('input[type="checkbox"], input[type="radio"]')
                ? node.closest<HTMLElement>('label') ?? node
                : node;
              const rect = hitTarget.getBoundingClientRect();
              return {
                tag: node.tagName.toLowerCase(),
                className: node.className,
                text: node.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80) ?? '',
                width: rect.width,
                height: rect.height,
              };
            }),
        }));

        expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
        expect(
          geometry.targets.filter(({ width, height }) => width < 44 || height < 44),
          'visible interactive targets smaller than 44×44 CSS pixels',
        ).toEqual([]);

        if (mockup.id === 'compare-detail' || mockup.id === 'leaderboard-value') {
          const tables = page.locator('table');
          const cards = page.locator(
            mockup.id === 'compare-detail' ? '.comparison-mobile-cards' : '.leaderboard-mobile-cards',
          );
          if (viewport.width < 768) {
            for (const table of await tables.all()) await expect(table).toBeHidden();
            for (const cardCollection of await cards.all()) await expect(cardCollection).toBeVisible();
          } else {
            for (const table of await tables.all()) await expect(table).toBeVisible();
            for (const cardCollection of await cards.all()) await expect(cardCollection).toBeHidden();
          }
        }

        expect(consoleErrors).toEqual([]);
      });
    }
  }
}

test('keyboard focus is visible in both themes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const theme of MOCKUP_THEMES) {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${pathToFileURL(resolve(MOCKUP_PAGES[0].file)).href}?theme=${theme}`);
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement;
      const style = getComputedStyle(active);
      return { width: style.outlineWidth, style: style.outlineStyle, color: style.outlineColor };
    });
    expect(focus.style).toBe('solid');
    expect(Number.parseFloat(focus.width)).toBeGreaterThan(0);
    expect(focus.color).not.toBe('transparent');
  }
});
