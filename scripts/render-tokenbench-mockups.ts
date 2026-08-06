import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MOCKUP_PAGES, MOCKUP_THEMES, MOCKUP_VIEWPORTS } from './mockup-manifest';

const output = resolve('.stitch/designs/renders');
await mkdir(output, { recursive: true });

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
);

try {
  for (const mockup of MOCKUP_PAGES) {
    for (const theme of MOCKUP_THEMES) {
      for (const viewport of MOCKUP_VIEWPORTS) {
        const page = await browser.newPage({ viewport });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(`${pathToFileURL(resolve(mockup.file)).href}?theme=${theme}`);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForFunction(
          (expectedTheme) => document.documentElement.dataset.theme === expectedTheme,
          theme,
        );
        await page.evaluate(
          () => new Promise<void>((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()))),
        );
        await page.screenshot({
          path: resolve(output, `${mockup.id}-${viewport.width}-${theme}.png`),
          fullPage: true,
        });
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
}
