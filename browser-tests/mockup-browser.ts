import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MOCKUP_PAGES, MOCKUP_THEMES, MOCKUP_VIEWPORTS } from '../scripts/mockup-manifest';

const CHECK_VIEWPORTS = [...MOCKUP_VIEWPORTS, { width: 320, height: 844 }] as const;

function mockupUrl(file: string, theme: string): string {
  return `${pathToFileURL(resolve(file)).href}?theme=${theme}`;
}

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
        await page.goto(mockupUrl(mockup.file, theme));

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
    await page.goto(mockupUrl(MOCKUP_PAGES[0].file, theme));
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

test('shared navigation, language, and theme controls are keyboard-operable across mockup pages and themes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });

  for (const mockup of MOCKUP_PAGES) {
    for (const theme of MOCKUP_THEMES) {
      await test.step(`${mockup.id} ${theme}`, async () => {
        await page.goto(mockupUrl(mockup.file, theme));

        const menu = page.locator('[data-menu-toggle]');
        const nav = page.locator('[data-primary-nav]');
        await menu.focus();
        await expect(menu).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(menu).toHaveAttribute('aria-expanded', 'true');
        await expect(nav).toHaveAttribute('data-open', '');
        await page.keyboard.press('Enter');
        await expect(menu).toHaveAttribute('aria-expanded', 'false');
        await expect(nav).not.toHaveAttribute('data-open');

        const language = page.getByLabel('Language');
        await language.selectOption('ja');
        await expect(language).toHaveValue('ja');

        const themeToggle = page.locator('[data-theme-toggle]');
        const nextTheme = theme === 'dark' ? 'light' : 'dark';
        await themeToggle.focus();
        await expect(themeToggle).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page.locator('html')).toHaveAttribute('data-theme', nextTheme);
        await expect(themeToggle).toHaveAttribute('aria-pressed', String(nextTheme === 'dark'));
      });
    }
  }
});

test('decision controls retain their representative selected states in both themes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });

  for (const theme of MOCKUP_THEMES) {
    await test.step(`calculator ${theme}`, async () => {
      await page.goto(mockupUrl(MOCKUP_PAGES[0].file, theme));
      const openAiProvider = page.locator('input[name="provider"][value="openai"]');
      await openAiProvider.check();
      await expect(openAiProvider).toBeChecked();
      await expect(openAiProvider.locator('xpath=..')).toHaveAttribute('aria-checked', 'true');
      await expect(page.locator('input[name="provider"][value="alibaba"]').locator('xpath=..')).toHaveAttribute('aria-checked', 'false');
    });

    await test.step(`compare hub ${theme}`, async () => {
      await page.goto(mockupUrl(MOCKUP_PAGES[1].file, theme));
      const firstModel = page.getByRole('combobox', { name: 'First model' });
      await firstModel.fill('GPT-4o');
      await expect(firstModel).toHaveValue('GPT-4o');
      const provider = page.locator('#provider-filter');
      await provider.selectOption({ label: 'OpenAI' });
      await expect(provider).toHaveValue('OpenAI');
      await expect(page.locator('[data-compare-action]')).toBeDisabled();
    });

    await test.step(`compare detail ${theme}`, async () => {
      await page.goto(mockupUrl(MOCKUP_PAGES[2].file, theme));
      const outputHeavy = page.locator('input[name="workload"][value="output-heavy"]');
      await outputHeavy.check();
      await expect(outputHeavy).toBeChecked();
    });

    await test.step(`value leaderboard ${theme}`, async () => {
      await page.goto(mockupUrl(MOCKUP_PAGES[4].file, theme));
      const includeEstimated = page.locator('#include-estimated');
      await expect(includeEstimated).toBeChecked();
      await includeEstimated.uncheck();
      await expect(includeEstimated).not.toBeChecked();
      await includeEstimated.check();
      await expect(includeEstimated).toBeChecked();
    });
  }
});
