import { expect, test, type Page } from '@playwright/test';
import { FRONTEND_TEST_CATALOG } from '../src/frontend/test-fixtures';
import {
  HANDLER_COMPARISON_PATH,
  comparisonDirectoryEnvelope,
  decisionSummaryEnvelope,
  emptyCodingLeaderboard,
  fulfillJson,
  readyCodingLeaderboard,
  readyMediaLeaderboard,
  staleCodingLeaderboard,
  stubBenchmarkDirectory,
  stubHandlerBackedComparison,
  stubLeaderboard,
} from './tokenbench-fixtures';

const viewports = [
  { width: 320, layout: 'compact', cards: true },
  { width: 375, layout: 'compact', cards: true },
  { width: 768, layout: 'tablet', cards: false },
  { width: 1024, layout: 'desktop', cards: false },
  { width: 1440, layout: 'wide', cards: false },
] as const;

type Theme = 'dark' | 'light';

function previewOrigin(): string {
  const baseURL = test.info().project.use.baseURL;
  if (typeof baseURL !== 'string') throw new Error('Playwright baseURL is required for origin-scoped browser coverage.');
  return new URL(baseURL).origin;
}

function handlerBackedAssetMode(): 'vite-source' | 'as-served' {
  return process.env.TOKENBENCH_BROWSER_ASSET_MODE === 'production' ? 'as-served' : 'vite-source';
}

async function blockExternalRequests(page: Page, origin = previewOrigin()): Promise<void> {
  await page.route((url) => url.origin !== origin && (url.protocol === 'http:' || url.protocol === 'https:'), (route) => route.abort());
}

async function setStoredTheme(page: Page, theme: Theme): Promise<void> {
  if (page.url() === 'about:blank') {
    await page.goto(previewOrigin() + '/', { waitUntil: 'domcontentloaded' });
  }
  await page.evaluate((storedTheme) => window.localStorage.setItem('tokenbench:theme', storedTheme), theme);
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function installInteractiveRouteStubs(page: Page): Promise<void> {
  const origin = previewOrigin();
  await blockExternalRequests(page, origin);
  await page.route(origin + '/api/catalog', (route) => fulfillJson(route, FRONTEND_TEST_CATALOG));
  await stubBenchmarkDirectory(page, origin);
  await page.route((url) => url.origin === origin && url.pathname.startsWith('/api/benchmarks/leaderboards/'), (route) => fulfillJson(route, {
    error: 'Published benchmark data is unavailable for this fixture route.',
  }, 503));
  await stubLeaderboard(page, origin, 'llm-coding', readyCodingLeaderboard());
  await stubLeaderboard(page, origin, 'media-text-to-image', readyMediaLeaderboard());
  await stubHandlerBackedComparison(page, origin, { assetMode: handlerBackedAssetMode() });
}

async function assertHydratedRouteFrame(
  page: Page,
  route: HydrationMatrixRoute,
): Promise<void> {
  const h1 = page.getByRole('heading', { name: route.heading, level: 1 });
  await expect(h1).toHaveCount(1);
  await expect(page.locator('h1')).toHaveCount(1);
  if (route.visuallyVisibleHeading !== false) await expect(h1).toBeVisible();
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.getByRole('banner')).toHaveCount(1);
  await expect(page.getByRole('contentinfo')).toHaveCount(1);
  await expect(page.locator('nav[aria-label="Primary navigation"]')).toHaveCount(1);
  await expect(page.locator('.static-page-shell')).toHaveCount(0);
  await expect(page.locator(route.hydratedClientMarker)).toBeVisible();
  await assertNoHorizontalOverflow(page);
}

async function assertCompactMenuPresence(page: Page): Promise<void> {
  const menu = page.locator('.menu-button');
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAccessibleName('Open navigation');
  await expect(menu).toHaveAttribute('aria-controls', 'primary-navigation');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
}

interface HydrationMatrixRoute {
  readonly path: string;
  readonly heading: string;
  readonly hydratedClientMarker: string;
  readonly visuallyVisibleHeading?: boolean;
}

const hydrationMatrix: readonly HydrationMatrixRoute[] = [
  { path: '/', heading: 'Stop Guessing Your AI Costs. Start Optimizing.', hydratedClientMarker: '.home-page' },
  { path: '/tools/', heading: 'AI cost decision tools', hydratedClientMarker: '.tools-page' },
  { path: '/tools/subscriptions-vs-apis/', heading: 'Subscription vs. API cost calculator', hydratedClientMarker: '.calculator-page', visuallyVisibleHeading: false },
  { path: '/leaderboards/', heading: 'Model leaderboards', hydratedClientMarker: '.leaderboard-directory-page' },
  { path: '/leaderboards/llm/coding/', heading: 'AI coding model benchmarks', hydratedClientMarker: '.leaderboard-results[aria-label="AI coding model benchmarks"]' },
  { path: '/leaderboards/media/text-to-image/', heading: 'Text-to-image model rankings', hydratedClientMarker: '.leaderboard-results[aria-label="Text-to-image model rankings"]' },
  { path: '/compare/', heading: 'Compare AI models', hydratedClientMarker: '.comparison-hub-page[data-combobox-open]' },
  { path: HANDLER_COMPARISON_PATH, heading: 'Alpha vs Beta', hydratedClientMarker: '.comparison-detail-page[data-client-hydrated="true"]' },
  { path: '/guides/', heading: 'Spend smarter on AI', hydratedClientMarker: '.guides-shell main.guides-main:not(.article-main)' },
  { path: '/guides/track-claude-code-usage/', heading: 'How to Track Claude Code Usage, Tokens, and Spend', hydratedClientMarker: '.guides-shell main.guides-main.article-main' },
];

async function openCalculator(page: Page, catalog = FRONTEND_TEST_CATALOG, status = 200, expectCalculator = true) {
  const origin = previewOrigin();
  await blockExternalRequests(page, origin);
  await page.route(origin + '/api/catalog', (route) => route.fulfill({
    status,
    contentType: 'application/json',
    headers: { etag: `"${catalog.revision}"` },
    body: JSON.stringify(catalog),
  }));
  await page.goto('/tools/subscriptions-vs-apis/');
  if (expectCalculator) await expect(page.getByRole('heading', { name: /API[- ]equivalent value/i })).toBeVisible({ timeout: 15_000 });
}

async function openCodingLeaderboard(page: Page) {
  const origin = previewOrigin();
  await blockExternalRequests(page, origin);
  await stubLeaderboard(page, origin, 'llm-coding', readyCodingLeaderboard());
  await page.goto('/leaderboards/llm/coding/');
  await expect(page.getByRole('table', { name: 'AI coding model benchmarks' })).toBeVisible({ timeout: 15_000 });
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

async function activateSkipLinkAndAssertTarget(page: Page, targetId: string): Promise<void> {
  const skipLink = page.locator('.skip-link');
  await page.keyboard.press('Tab');
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toHaveAttribute('href', `#${targetId}`);
  await page.keyboard.press('Enter');

  await expect.poll(() => page.evaluate(() => ({
    hash: window.location.hash,
    focusedId: (document.activeElement as HTMLElement | null)?.id ?? null,
  }))).toEqual({ hash: `#${targetId}`, focusedId: targetId });
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
    for (const selector of ['select[aria-label="Language"]', 'button[aria-label="Toggle light theme"]', 'a.evidence-link']) {
      expectVisibleFocus(await tabTo(page, selector));
    }
  });

  test('keeps dark foreground accents readable while retaining the exact primary background', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 1000 });
    await openCalculator(page);
    await page.locator('a.evidence-link').first().hover();

    const styles = await page.evaluate(() => {
      const parseColor = (color: string) => {
        const channels = color.match(/[\d.]+/g)?.map(Number) ?? [];
        return { red: channels[0] ?? 0, green: channels[1] ?? 0, blue: channels[2] ?? 0, alpha: channels[3] ?? 1 };
      };
      const backgroundFor = (element: Element) => {
        let current: Element | null = element;
        while (current) {
          const background = getComputedStyle(current).backgroundColor;
          if (parseColor(background).alpha > 0.99) return background;
          current = current.parentElement;
        }
        return getComputedStyle(document.body).backgroundColor;
      };
      const luminance = (color: string) => {
        const { red, green, blue } = parseColor(color);
        const convert = (channel: number) => {
          const normalized = channel / 255;
          return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * convert(red) + 0.7152 * convert(green) + 0.0722 * convert(blue);
      };
      const sample = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`Missing contrast sample: ${selector}`);
        const foreground = getComputedStyle(element).color;
        const background = backgroundFor(element);
        const lighter = Math.max(luminance(foreground), luminance(background));
        const darker = Math.min(luminance(foreground), luminance(background));
        return { foreground, background, ratio: (lighter + 0.05) / (darker + 0.05) };
      };

      return {
        primaryBackground: getComputedStyle(document.querySelector('.value-summary-card') as Element).backgroundColor,
        samples: [sample('a.evidence-link'), sample('.control-block legend'), sample('.choice-check'), sample('.field-label output')],
      };
    });

    expect(styles.primaryBackground).toBe('rgb(0, 7, 205)');
    for (const sample of styles.samples) expect(sample.ratio).toBeGreaterThanOrEqual(4.5);
  });

  test('gives the shared skip and brand links 44px targets', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 1000 });
    await openCalculator(page);

    const targets = await page.evaluate(() => ['.skip-link', '.brand-home'].map((selector) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing target: ${selector}`);
      const bounds = element.getBoundingClientRect();
      return { selector, width: bounds.width, height: bounds.height };
    }));

    for (const target of targets) {
      expect(target.width, `${target.selector} width`).toBeGreaterThanOrEqual(44);
      expect(target.height, `${target.selector} height`).toBeGreaterThanOrEqual(44);
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

  test('defaults dark, persists both theme choices, and changes language without resetting catalog controls', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 1000 });
    await openCalculator(page);
    const initialProvider = await page.locator('input[name="provider"]:checked').inputValue();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: 'Toggle light theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('tokenbench:theme'))).toBe('light');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.getByRole('button', { name: 'Toggle dark theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('tokenbench:theme'))).toBe('dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('combobox', { name: 'Language' }).selectOption('zh-TW');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
    await expect(page.locator('input[name="provider"]:checked')).toHaveValue(initialProvider);

    await page.evaluate(() => {
      const banner = document.createElement('iframe');
      banner.className = 'goog-te-banner-frame';
      banner.dataset.translateChrome = 'banner-frame';
      const injectedBanner = document.createElement('div');
      injectedBanner.className = 'VIpgJd-ZVi9od-ORHb-OEVmcd';
      injectedBanner.dataset.translateChrome = 'injected-banner';
      const secondaryBanner = document.createElement('div');
      secondaryBanner.className = 'VIpgJd-ZVi9od-aZ2wEe-wOHMyf';
      secondaryBanner.dataset.translateChrome = 'secondary-banner';
      const translateWrapper = document.createElement('div');
      translateWrapper.className = 'skiptranslate';
      translateWrapper.dataset.translateChrome = 'wrapper';
      const nestedFrame = document.createElement('iframe');
      nestedFrame.dataset.translateChrome = 'nested-frame';
      translateWrapper.append(nestedFrame);
      document.body.style.top = '40px';
      document.documentElement.style.marginTop = '40px';
      document.body.prepend(banner, injectedBanner, secondaryBanner, translateWrapper);
    });
    await expect.poll(() => page.locator('[data-translate-chrome]').evaluateAll((elements) => (
      elements.length === 5 && elements.every((element) => {
        const style = getComputedStyle(element);
        return element.getAttribute('aria-hidden') === 'true'
          && style.display === 'none'
          && style.height === '0px'
          && style.visibility === 'hidden';
      })
    ))).toBe(true);
    await expect.poll(() => page.evaluate(() => ({
      top: document.body.style.getPropertyValue('top'),
      priority: document.body.style.getPropertyPriority('top'),
    }))).toEqual({ top: '0px', priority: 'important' });
    await expect.poll(() => page.evaluate(() => ({
      marginTop: document.documentElement.style.getPropertyValue('margin-top'),
      priority: document.documentElement.style.getPropertyPriority('margin-top'),
    }))).toEqual({ marginTop: '0px', priority: 'important' });
  });

  test('uses reference-matched outlined choices and selected preset states', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 1000 });
    await openCalculator(page, {
      ...FRONTEND_TEST_CATALOG,
      plans: [
        ...FRONTEND_TEST_CATALOG.plans,
        { ...FRONTEND_TEST_CATALOG.plans[0], id: 'provider-b:starter', providerId: 'provider-b', displayName: 'Provider B Starter' },
      ],
    });

    const choiceStyles = await page.evaluate(() => {
      const provider = getComputedStyle(document.querySelector('.provider-choice.choice-selected') as HTMLElement);
      const selected = getComputedStyle(document.querySelector('.provider-choice.choice-selected') as HTMLElement);
      const unselected = getComputedStyle(document.querySelector('.provider-choice:not(.choice-selected)') as HTMLElement);
      return {
        selectedRadius: provider.borderRadius,
        selectedShadow: provider.boxShadow,
        selectedBorder: selected.borderColor,
        selectedBackground: selected.backgroundColor,
        unselectedBorder: unselected.borderColor,
        unselectedBackground: unselected.backgroundColor,
      };
    });

    expect(choiceStyles.selectedRadius).toBe('4px');
    expect(choiceStyles.selectedShadow).toBe('none');
    expect(choiceStyles.selectedBorder).not.toBe(choiceStyles.unselectedBorder);
    expect(choiceStyles.selectedBackground).not.toBe(choiceStyles.unselectedBackground);
    const monthlyUsage = page.getByLabel('Expected monthly usage');
    const usagePosition = await page.getByText('Expected monthly usage').boundingBox();
    const presetsPosition = await page.getByText('Presets', { exact: true }).boundingBox();
    expect(usagePosition?.y).toBeLessThan(presetsPosition?.y ?? 0);
    await expect(monthlyUsage).toHaveValue('10,000,000');
    await expect(page.getByRole('button', { name: 'Balanced' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Output-heavy' }).click();
    await expect(page.getByRole('button', { name: 'Balanced' })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('button', { name: 'Output-heavy' })).toHaveAttribute('aria-pressed', 'true');
    await monthlyUsage.fill('12345678');
    await expect(monthlyUsage).toHaveValue('12,345,678');
  });

  test('renders loading, empty, error, bootstrap, and stale catalog states', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 1000 });
    const origin = previewOrigin();
    await blockExternalRequests(page, origin);
    await page.route(origin + '/api/catalog', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FRONTEND_TEST_CATALOG) });
    });
    await page.goto('/tools/subscriptions-vs-apis/', { waitUntil: 'domcontentloaded' });
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

test.describe('leaderboard browser harness', () => {
  test('keeps decision-pick facts readable and full links touch-sized at directory breakpoints', async ({ page }) => {
    const origin = previewOrigin();
    await blockExternalRequests(page, origin);
    await stubBenchmarkDirectory(page, origin, decisionSummaryEnvelope());
    await page.setViewportSize({ width: 375, height: 1000 });
    const summaryResponse = page.waitForResponse((response) => response.url() === `${origin}/api/benchmarks`);
    await page.goto('/leaderboards/');
    expect((await summaryResponse).status()).toBe(200);
    await expect(page.getByRole('region', { name: 'Coding leaders' })).toBeVisible({ timeout: 15_000 });

    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ['dark', 'light'] as const) {
        if (await page.locator('html').getAttribute('data-theme') !== theme) {
          await page.getByRole('button', { name: `Toggle ${theme} theme` }).click();
        }
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

        const cards = await page.locator('.decision-pick-card').evaluateAll((elements) => elements.map((element) => {
          const label = element.querySelector('dt');
          const value = element.querySelector('dd');
          const fullLink = element.querySelector('.decision-pick-card-heading > a');
          if (!label || !value || !fullLink) throw new Error('Decision pick card is missing a fact or full-view link.');
          return {
            labelFontSize: Number.parseFloat(getComputedStyle(label).fontSize),
            valueFontSize: Number.parseFloat(getComputedStyle(value).fontSize),
            fullLinkHeight: fullLink.getBoundingClientRect().height,
          };
        }));

        expect(cards).toHaveLength(6);
        for (const [index, card] of cards.entries()) {
          expect(card.labelFontSize, `${width}px ${theme} card ${index + 1} fact label`).toBeGreaterThanOrEqual(12);
          expect(card.valueFontSize, `${width}px ${theme} card ${index + 1} fact value`).toBeGreaterThanOrEqual(12);
          expect(card.fullLinkHeight, `${width}px ${theme} card ${index + 1} full link`).toBeGreaterThanOrEqual(44);
        }
        await assertNoHorizontalOverflow(page);
      }
    }
  });

  test('keeps every desktop sort control at a 44px minimum hit target', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 1000 });
    await openCodingLeaderboard(page);

    const targets = await page.locator('.leaderboard-desktop-table thead button').evaluateAll((elements) => elements.map((element) => {
      const bounds = element.getBoundingClientRect();
      return { label: element.getAttribute('aria-label'), width: bounds.width, height: bounds.height };
    }));

    expect(targets).toHaveLength(4);
    for (const target of targets) {
      expect(target.width, `${target.label} width`).toBeGreaterThanOrEqual(44);
      expect(target.height, `${target.label} height`).toBeGreaterThanOrEqual(44);
    }
  });

  test('keeps table semantics, named filters, and equivalent model cards across leaderboard breakpoints', async ({ page }) => {
    const origin = previewOrigin();
    await page.setViewportSize({ width: 1024, height: 1000 });
    await openCodingLeaderboard(page);
    await stubLeaderboard(page, origin, 'media-text-to-image', readyMediaLeaderboard());

    const codingTable = page.getByRole('table', { name: 'AI coding model benchmarks' });
    await expect(codingTable).toBeVisible();
    await expect(page.getByRole('form', { name: 'Leaderboard filters' })).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Search model or provider' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Workload profile' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Input-heavy' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Balanced' })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Output-heavy' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Sort leaderboard' })).toBeVisible();
    expect(await page.locator('.leaderboard-desktop-table th[aria-sort]').evaluateAll((headers) => headers.map((header) => header.getAttribute('aria-sort')))).toEqual(['none', 'descending', 'none', 'none']);
    await page.getByRole('button', { name: 'Sort by position' }).click();
    await expect(page.locator('th[aria-sort]', { has: page.getByRole('button', { name: 'Sort by position' }) })).toHaveAttribute('aria-sort', 'ascending');
    const codingNames = await codingTable.locator('tbody th[scope="row"] .leaderboard-model > span:first-child').allTextContents();
    expect(codingNames).toEqual(['Alpha', 'Beta']);

    for (const width of [320, 375, 768]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/leaderboards/llm/coding/');
      await expect(page.locator('.leaderboard-desktop-table')).toBeHidden();
      const codingCards = page.getByRole('list', { name: 'AI coding model benchmark cards' });
      await expect(codingCards).toBeVisible();
      expect(await codingCards.getByRole('heading', { level: 3 }).allTextContents()).toEqual(codingNames);
      await assertNoHorizontalOverflow(page);
    }

    await page.setViewportSize({ width: 1024, height: 1000 });
    await page.goto('/leaderboards/media/text-to-image/');
    const mediaTable = page.getByRole('table', { name: 'Text-to-image model rankings' });
    await expect(mediaTable).toBeVisible();
    expect(await page.locator('.leaderboard-desktop-table th[aria-sort]').evaluateAll((headers) => headers.map((header) => header.getAttribute('aria-sort')))).toEqual(['ascending', 'none', 'none', 'none']);
    const mediaNames = await mediaTable.locator('tbody th[scope="row"] .leaderboard-model > span:first-child').allTextContents();
    expect(mediaNames).toEqual(['Canvas', 'Prism']);

    await page.setViewportSize({ width: 375, height: 1000 });
    await page.goto('/leaderboards/media/text-to-image/');
    const mediaCards = page.getByRole('list', { name: 'Text-to-image model ranking cards' });
    await expect(mediaCards).toBeVisible();
    expect(await mediaCards.getByRole('heading', { level: 3 }).allTextContents()).toEqual(mediaNames);
  });

  test('keeps stale, empty, and unavailable leaderboard states explicit', async ({ page }) => {
    const origin = previewOrigin();
    const openCodingState = async (value: unknown, status = 200) => {
      await page.unrouteAll();
      await blockExternalRequests(page, origin);
      await stubLeaderboard(page, origin, 'llm-coding', value, status);
      await page.goto('/leaderboards/llm/coding/');
    };

    await page.setViewportSize({ width: 375, height: 1000 });
    await openCodingState(staleCodingLeaderboard());
    await expect(page.getByRole('status')).toContainText('Stale benchmark data', { timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Retry benchmark refresh' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'AI coding model benchmark cards' })).toBeVisible();
    await expect(page.locator('footer[aria-label="Stale leaderboard evidence"]')).toContainText('Stale');

    await openCodingState(emptyCodingLeaderboard());
    await expect(page.getByText('No published entries match these filters')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('footer[aria-label="Filtered leaderboard evidence"]')).toBeVisible();

    await openCodingState({ error: 'Published benchmark data is unavailable.' }, 503);
    const unavailable = page.getByRole('region', { name: 'AI coding model benchmarks results' }).getByRole('status');
    await expect(unavailable).toContainText('Unavailable', { timeout: 15_000 });
    await expect(unavailable.getByRole('button', { name: 'Retry benchmark request' })).toBeVisible();
  });
});

test.describe('motion and named call-to-action coverage', () => {
  test('respects reduced-motion preferences for animated and transitional UI', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await blockExternalRequests(page);
    await page.goto('/guides/');
    await expect(page.getByRole('heading', { name: 'Spend smarter on AI', level: 1 })).toBeVisible();
    const motion = await page.locator('.guide-card').first().evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        prefersReducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        animationDuration: style.animationDuration,
        transitionDuration: style.transitionDuration,
      };
    });
    expect(motion.prefersReducedMotion).toBe(true);
    expect(Number.parseFloat(motion.animationDuration)).toBeLessThanOrEqual(0.001);
    expect(Number.parseFloat(motion.transitionDuration)).toBeLessThanOrEqual(0.001);
  });

  test('keeps named home and leaderboard primary calls-to-action visible in both themes', async ({ page }) => {
    const origin = previewOrigin();
    await blockExternalRequests(page, origin);
    await stubLeaderboard(page, origin, 'llm-coding', readyCodingLeaderboard());
    await page.setViewportSize({ width: 1024, height: 1000 });

    for (const theme of ['dark', 'light'] as const) {
      await setStoredTheme(page, theme);
      await page.goto('/');
      for (const [path, name] of [
        ['/', 'Calculate your costs'],
        ['/leaderboards/llm/coding/', 'Talk to MonoMind'],
      ] as const) {
        await page.goto(path);
        const cta = page.getByRole('link', { name });
        await expect(cta).toBeVisible();
        const presentation = await cta.evaluate((element) => {
          const style = getComputedStyle(element);
          const bounds = element.getBoundingClientRect();
          return {
            background: style.backgroundColor,
            color: style.color,
            display: style.display,
            height: bounds.height,
            opacity: style.opacity,
            text: element.textContent?.trim(),
            visibility: style.visibility,
          };
        });
        expect(presentation.text).toBeTruthy();
        expect(presentation.display).not.toBe('none');
        expect(presentation.visibility).toBe('visible');
        expect(Number.parseFloat(presentation.opacity)).toBeGreaterThan(0);
        expect(presentation.height).toBeGreaterThanOrEqual(44);
        expect(presentation.background).not.toBe('transparent');
        expect(presentation.color).not.toBe('transparent');
      }
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    }
  });
});

test.describe('guides browser harness', () => {
  for (const width of [320, 768, 1440]) {
    test(`${width}px guide hub stays readable without horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await blockExternalRequests(page);
      await page.goto('/guides/');

      await expect(page.getByRole('heading', { name: 'Spend smarter on AI', level: 1 })).toBeVisible();
      await expect(page.locator('.guide-card')).toHaveCount(5);
      if (width < 768) {
        const menu = page.getByRole('button', { name: 'Open navigation' });
        await menu.focus();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('button', { name: 'Close navigation' })).toHaveAttribute('aria-expanded', 'true');
      }
      await expect(page.getByRole('link', { name: 'Guides', exact: true })).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('link', { name: 'Powered by MonoMind AI Lab' })).toHaveAttribute('href', 'https://monomind.one/');
      await expect(page.getByRole('link', { name: 'Sources' })).toHaveAttribute('href', '/sources/');
      await expect(page.getByRole('link', { name: 'Methodology' })).toHaveAttribute('href', '/methodology/');
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
    await blockExternalRequests(page);
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'How to Track Claude Code Usage, Tokens, and Spend', level: 1 })).toBeVisible();
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://tokenbench.monomind.one${path}`);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /subscription limits differ from API billing/i);
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(2);
    await expect(page.getByRole('link', { name: /Models, usage, and limits/i })).toHaveAttribute('href', /^https:\/\/support\.claude\.com/);
    await expect(page.getByRole('heading', { name: 'Related guides' })).toBeVisible();
  });

  test('guide theme control defaults dark and persists both theme choices', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 1000 });
    await blockExternalRequests(page);
    await page.goto('/guides/openrouter-guide-model-routing-cost-controls/');

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: 'Toggle light theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('tokenbench:theme'))).toBe('light');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.getByRole('button', { name: 'Toggle dark theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('tokenbench:theme'))).toBe('dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});

test.describe('generated static route runtime', () => {
  const hydratingLeaderboardRoutes = [
    ['/leaderboards/', 'Model leaderboards'],
    ['/leaderboards/llm/overall/', 'Overall AI model benchmarks'],
    ['/leaderboards/llm/coding/', 'AI coding model benchmarks'],
    ['/leaderboards/llm/agentic/', 'AI agentic model benchmarks'],
    ['/leaderboards/llm/human-preference/', 'Human preference AI model rankings'],
    ['/leaderboards/llm/value/', 'AI model value frontier'],
    ['/leaderboards/llm/pricing-context/', 'AI model pricing and context'],
    ['/leaderboards/multimodal/vision-documents/', 'Vision and document AI benchmarks'],
    ['/leaderboards/media/text-to-image/', 'Text-to-image model rankings'],
    ['/leaderboards/media/image-editing/', 'AI image-editing model rankings'],
    ['/leaderboards/media/text-to-video/', 'Text-to-video model rankings'],
    ['/leaderboards/media/image-to-video/', 'Image-to-video model rankings'],
    ['/leaderboards/media/video-editing/', 'AI video-editing model rankings'],
  ] as const;

  test('ships a raw crawlable compare hub, then mounts its active-revision directory without external requests', async ({ page, request, baseURL }) => {
    await page.setViewportSize({ width: 1024, height: 1000 });
    if (!baseURL) throw new Error('Playwright baseURL is required for origin-scoped route stubs.');
    const rawResponse = await request.get('/compare/');
    const rawHtml = await rawResponse.text();
    expect(rawResponse.ok()).toBe(true);
    expect(rawHtml).toContain('class="app-shell static-page-shell"');
    expect(rawHtml).toContain('<h1>Compare AI models</h1>');

    const previewOrigin = new URL(baseURL).origin;
    const browserContext = page.context();
    const approvedStaticExternalOrigins = new Set([
      'https://fonts.googleapis.com',
      'https://fonts.gstatic.com',
      'https://translate.google.com',
    ]);
    const benchmarkProviderHostSuffixes = [
      'benchlm.ai',
      'lmarena.ai',
      'openrouter.ai',
      'huggingface.co',
      'github.com',
      'raw.githubusercontent.com',
    ];
    const benchmarkRequests: string[] = [];
    const benchmarkProviderRequests: string[] = [];
    const unexpectedRequests: string[] = [];
    await browserContext.route(/^https?:\/\//, (route) => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.origin !== previewOrigin) {
        if (benchmarkProviderHostSuffixes.some((host) => requestUrl.hostname === host || requestUrl.hostname.endsWith(`.${host}`))) {
          benchmarkProviderRequests.push(route.request().url());
        }
        if (approvedStaticExternalOrigins.has(requestUrl.origin)) return route.abort();
        unexpectedRequests.push(route.request().url());
        return route.abort();
      }
      if (requestUrl.pathname.startsWith('/api/')) {
        benchmarkRequests.push(`${requestUrl.pathname}${requestUrl.search}`);
        if (requestUrl.pathname === '/api/benchmarks' && requestUrl.search === '' && requestUrl.hash === '') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(comparisonDirectoryEnvelope()),
          });
        }
        unexpectedRequests.push(route.request().url());
        return route.abort();
      }
      return route.fallback();
    });

    await page.goto('/compare/');
    await expect(page.locator('.static-page-shell')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Compare AI models', level: 1 })).toBeVisible();
    await expect(page.getByText('Published revision: browser-benchmark-r1')).toBeVisible();
    await page.getByRole('combobox', { name: 'First model' }).fill('alpha');
    await page.getByRole('combobox', { name: 'Second model' }).fill('beta');
    await expect(page.getByRole('link', { name: 'Compare selected models' })).toHaveAttribute('href', '/compare/alpha-vs-beta');
    await expect(page.locator('#calculator')).toHaveCount(0);
    // StrictMode may remount the effect in the development preview, but every
    // same-origin API request must remain this one exact no-query endpoint.
    expect(benchmarkRequests).not.toHaveLength(0);
    expect(new Set(benchmarkRequests)).toEqual(new Set(['/api/benchmarks']));
    expect(benchmarkProviderRequests).toEqual([]);
    expect(unexpectedRequests).toEqual([]);
  });

  test('ships crawlable leaderboard HTML and replaces it with the interactive app when JavaScript executes', async ({ page, request, baseURL }) => {
    await page.setViewportSize({ width: 1024, height: 1000 });
    if (!baseURL) throw new Error('Playwright baseURL is required for origin-scoped route stubs.');
    const previewOrigin = new URL(baseURL).origin;
    const browserContext = page.context();
    await browserContext.route(/^https?:\/\//, (route) => (
      new URL(route.request().url()).origin === previewOrigin ? route.fallback() : route.abort()
    ));
    await browserContext.route(`${previewOrigin}/api/benchmarks/leaderboards/**`, (route) => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Published benchmark data is unavailable.' }),
    }));

    const externalNavigationResults = [];
    for (const protocol of ['http', 'https']) {
      const externalUrl = `${protocol}://external.example/api/benchmarks/leaderboards/llm-overall?profile=balanced`;
      const externalPage = await browserContext.newPage();
      externalNavigationResults.push(await externalPage.goto(externalUrl).then(() => 'fulfilled', () => 'aborted'));
      await externalPage.close();
    }
    expect(externalNavigationResults).toEqual(['aborted', 'aborted']);

    for (const [pathname, h1] of hydratingLeaderboardRoutes) {
      const response = await request.get(pathname);
      const rawHtml = await response.text();
      expect(response.ok(), pathname).toBe(true);
      expect(rawHtml, pathname).toContain('class="app-shell static-page-shell"');
      expect(rawHtml, pathname).toContain(`<h1>${h1}</h1>`);

      await page.goto(pathname);
      await expect(page.locator('.static-page-shell'), pathname).toHaveCount(0);
      await expect(page.locator('.app-shell'), pathname).toBeVisible();
      await expect(page.getByRole('heading', { name: h1, level: 1 }), pathname).toBeVisible();
      await expect(page.locator('h1'), pathname).toHaveCount(1);
      await expect(page.locator('#calculator'), pathname).toHaveCount(0);
      if (pathname !== '/leaderboards/') {
        await expect(page.getByRole('form', { name: 'Leaderboard filters' }), pathname).toBeVisible();
        const unavailableState = page.getByRole('region', { name: `${h1} results` }).getByRole('status');
        await expect(unavailableState.getByText('Unavailable', { exact: true }), pathname).toBeVisible();
        await expect(unavailableState.getByRole('button', { name: 'Retry benchmark request' }), pathname).toBeVisible();
      }
    }
  });

  test('does not mount the legacy calculator over server-rendered dynamic or unknown shells', async ({ page, request }) => {
    const origin = previewOrigin();
    await blockExternalRequests(page, origin);
    const shellResponse = await request.get('/compare/');
    const shellHtml = await shellResponse.text();

    for (const pathname of ['/compare/model-a-vs-model-b', '/not-a-tokenbench-route']) {
      const url = origin + pathname;
      await page.route(url, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: shellHtml }));
      await page.goto(pathname);
      await expect(page.locator('.static-page-shell'), pathname).toBeVisible();
      await expect(page.locator('#calculator'), pathname).toHaveCount(0);
      await page.unroute(url);
    }
  });
});

test.describe('home and tools route runtime', () => {
  test('adapts the home decision showcase grids from desktop to mobile', async ({ page }) => {
    await blockExternalRequests(page);

    await page.setViewportSize({ width: 1024, height: 1000 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Stop Guessing Your AI Costs. Start Optimizing.', level: 1 })).toBeVisible();

    const desktop = await page.evaluate(() => {
      const columnsFor = (label: string) => {
        const element = document.querySelector(`[aria-label="${label}"]`);
        if (!element) throw new Error(`Missing ${label}`);
        const styles = getComputedStyle(element);
        return { display: styles.display, columns: styles.gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length };
      };
      return {
        terminal: columnsFor('TokenBench decision workflow'),
        features: columnsFor('TokenBench decision features'),
        teasers: columnsFor('TokenBench benchmark teasers'),
      };
    });
    expect(desktop.terminal).toEqual({ display: 'grid', columns: 2 });
    expect(desktop.features).toEqual({ display: 'grid', columns: 4 });
    expect(desktop.teasers).toEqual({ display: 'grid', columns: 3 });

    await page.setViewportSize({ width: 768, height: 1000 });
    const tablet = await page.evaluate(() => {
      const columnsFor = (label: string) => {
        const element = document.querySelector(`[aria-label="${label}"]`);
        if (!element) throw new Error(`Missing ${label}`);
        return getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length;
      };
      return {
        terminal: columnsFor('TokenBench decision workflow'),
        features: columnsFor('TokenBench decision features'),
        teasers: columnsFor('TokenBench benchmark teasers'),
      };
    });
    expect(tablet).toEqual({ terminal: 2, features: 2, teasers: 2 });

    await page.setViewportSize({ width: 375, height: 1000 });
    const mobile = await page.evaluate(() => {
      const columnsFor = (label: string) => {
        const element = document.querySelector(`[aria-label="${label}"]`);
        if (!element) throw new Error(`Missing ${label}`);
        return getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length;
      };
      return {
        terminal: columnsFor('TokenBench decision workflow'),
        features: columnsFor('TokenBench decision features'),
        teasers: columnsFor('TokenBench benchmark teasers'),
      };
    });
    expect(mobile).toEqual({ terminal: 1, features: 1, teasers: 1 });
  });

  test('mounts the interactive tools directory without replacing static-only routes', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 1000 });
    await blockExternalRequests(page);
    await page.goto('/tools/');

    await expect(page.locator('.static-page-shell')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'AI cost decision tools', level: 1 })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Available TokenBench tools' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open subscription vs. API calculator' })).toHaveAttribute('href', '/tools/subscriptions-vs-apis/');
  });
});

test.describe('handler-backed comparison browser coverage', () => {
  test('renders a server comparison document from the real Pages handler before hydration', async ({ browser }) => {
    const origin = previewOrigin();
    const context = await browser.newContext({ baseURL: origin, javaScriptEnabled: false });
    const page = await context.newPage();
    try {
      await blockExternalRequests(page, origin);
      await stubHandlerBackedComparison(page, origin, { assetMode: handlerBackedAssetMode() });

      await page.goto(HANDLER_COMPARISON_PATH);
      await expect(page.getByRole('heading', { name: 'Alpha vs Beta', level: 1 })).toBeVisible();
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('#comparison-initial-data')).toHaveCount(1);
      await expect(page.getByRole('heading', { name: 'Source metrics', level: 2 })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Comparison summary', level: 2 })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Comparable metric detail', level: 3 })).toBeVisible();
      await expect(page.getByRole('table', { name: 'Source metric comparison' }).getByRole('rowheader', { name: 'Coding' })).toBeVisible();
      await expect(page.getByRole('table', { name: 'Route pricing and context comparison' }).getByRole('row', { name: /Verification status/ })).toBeVisible();
      await expect(page.locator('.comparison-provenance')).toHaveCount(1);
      await expect(page.getByRole('heading', { name: 'Workload view' })).toHaveCount(0);
      await expect(page.locator('.comparison-model-heading img.provider-mark')).toHaveCount(0);
      await expect(page.locator('.comparison-model-heading .provider-mark-fallback')).toHaveCount(2);
      const rootText = await page.locator('#root').innerText();
      expect(rootText).not.toContain('benchlm:category:coding');
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://tokenbench.monomind.one/compare/alpha-vs-beta');
    } finally {
      await context.close();
    }
  });

  test('hydrates the handler-backed comparison with route-sensitive claims and no Task 5 regressions', async ({ page }) => {
    test.setTimeout(90_000);
    const origin = previewOrigin();
    const hydrationErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && /hydration|didn't match|server rendered html/i.test(message.text())) hydrationErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.setViewportSize({ width: 1024, height: 1000 });
    await blockExternalRequests(page, origin);
    if (process.env.VITE_BRANDFETCH_CLIENT_ID) {
      await page.route('https://cdn.brandfetch.io/**', (route) => route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#137fec"/></svg>',
      }));
    }
    await stubHandlerBackedComparison(page, origin, { assetMode: handlerBackedAssetMode() });
    const devEntryResponse = handlerBackedAssetMode() === 'vite-source'
      ? page.waitForResponse((response) => response.url() === `${origin}/src/main.tsx`)
      : null;

    await page.goto(HANDLER_COMPARISON_PATH, { waitUntil: 'networkidle' });
    if (devEntryResponse) await devEntryResponse;
    await expect(page.locator('.app-shell')).toHaveAttribute('data-layout', 'desktop', { timeout: 15_000 });
    await expect(page.locator('.comparison-detail-page')).toHaveAttribute('data-client-hydrated', 'true');
    await expect(page.getByRole('heading', { name: 'Workload view' })).toHaveCount(0);
    await expect(page.locator('.comparison-provenance')).toHaveCount(1);
    const pricingTable = page.getByRole('table', { name: 'Route pricing and context comparison' });
    const inputPrice = pricingTable.getByRole('row', { name: /Input API price/ });
    const verification = pricingTable.getByRole('row', { name: /Verification status/ });
    const inputPriceHighlight = page.getByText(/^Input API price:/);
    await expect(inputPrice).toContainText('$0.5');
    await expect(verification).toContainText('Primary');
    await expect(inputPriceHighlight).toContainText('Alpha has the lower verified rate');

    await page.getByLabel('Alpha pricing route').selectOption('openrouter:provider:alpha');

    await expect(inputPrice).toContainText('$2');
    await expect(inputPriceHighlight).toContainText('Beta has the lower verified rate');
    await expect(inputPriceHighlight).not.toContainText('Alpha has the lower verified rate');
    await expect(page.getByRole('heading', { name: 'Evidence provenance' }).locator('xpath=ancestor::section[1]')).toContainText('Alpha — route openrouter:provider:alpha · source openrouter · provider openrouter');
    if (process.env.VITE_BRANDFETCH_CLIENT_ID) {
      await expect(page.locator('.comparison-model-heading img.provider-mark')).toHaveCount(2);
    }

    for (const viewport of [{ width: 1440, height: 1000 }, { width: 375, height: 1000 }]) {
      await page.setViewportSize(viewport);
      for (const theme of ['dark', 'light'] as const) {
        await setStoredTheme(page, theme);
        await page.reload({ waitUntil: 'networkidle' });
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.locator('.comparison-detail-page')).toHaveAttribute('data-client-hydrated', 'true');
        await assertNoHorizontalOverflow(page);
      }
    }

    expect(hydrationErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});

test.describe('viewport and theme hydration matrix', () => {
  test('keeps every primary route semantic and overflow-safe across supported viewports and themes', async ({ page }) => {
    test.setTimeout(180_000);
    await installInteractiveRouteStubs(page);

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: 1000 });
      for (const theme of ['dark', 'light'] as const) {
        for (const route of hydrationMatrix) {
          await setStoredTheme(page, theme);
          await page.goto(route.path, { waitUntil: 'domcontentloaded' });
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
          await assertHydratedRouteFrame(page, route);
          if (viewport.width < 768) await assertCompactMenuPresence(page);
        }
      }
    }
  });
});

test.describe('keyboard and chart accessibility regressions', () => {
  test('moves focus to the home main landmark when the skip link is activated', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1000 });
    await blockExternalRequests(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Stop Guessing Your AI Costs. Start Optimizing.', level: 1 })).toBeVisible();

    await page.keyboard.press('Tab');
    await expect(page.locator('.skip-link')).toBeFocused();
    await page.keyboard.press('Enter');

    await expect.poll(() => page.evaluate(() => ({
      hash: window.location.hash,
      focusedId: (document.activeElement as HTMLElement | null)?.id ?? null,
      focusedRole: document.activeElement?.getAttribute('role') ?? null,
    }))).toEqual({ hash: '#page-content', focusedId: 'page-content', focusedRole: null });
  });

  test('moves focus to the calculator when the calculator skip link is activated', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1000 });
    await openCalculator(page);

    await activateSkipLinkAndAssertTarget(page, 'calculator');
  });

  test('moves focus to the persistent calculator target while the catalog is still loading', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1000 });
    const origin = previewOrigin();
    await blockExternalRequests(page, origin);
    let releaseCatalogRequest: (() => void) | undefined;
    const catalogRequestReleased = new Promise<void>((resolve) => {
      releaseCatalogRequest = resolve;
    });
    await page.route(origin + '/api/catalog', async (route) => {
      await catalogRequestReleased;
      await fulfillJson(route, FRONTEND_TEST_CATALOG);
    });

    try {
      await page.goto('/tools/subscriptions-vs-apis/', { waitUntil: 'domcontentloaded' });
      await expect(page.getByLabel('Loading verified catalog')).toBeVisible();
      await activateSkipLinkAndAssertTarget(page, 'calculator');
    } finally {
      releaseCatalogRequest?.();
    }
  });

  for (const guide of [
    { path: '/guides/', heading: 'Spend smarter on AI', name: 'guide hub' },
    { path: '/guides/track-claude-code-usage/', heading: 'How to Track Claude Code Usage, Tokens, and Spend', name: 'guide article' },
  ]) {
    test(`moves focus to guide content when the ${guide.name} skip link is activated`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 1000 });
      await blockExternalRequests(page);
      await page.goto(guide.path);
      await expect(page.getByRole('heading', { name: guide.heading, level: 1 })).toBeVisible();

      await activateSkipLinkAndAssertTarget(page, 'guide-content');
    });
  }

  test('closes the compact navigation when Escape is pressed from the focused toggle', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 1000 });
    await blockExternalRequests(page);
    await page.goto('/');
    const menu = page.locator('.menu-button');
    await expect(menu).toHaveAccessibleName('Open navigation');
    await menu.focus();
    await page.keyboard.press('Enter');
    await expect(menu).toHaveAccessibleName('Close navigation');
    await expect(menu).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('Escape');
    await expect(menu).toHaveAccessibleName('Open navigation');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
  });

  test('describes the plotted current tokens and API-equivalent value in chart accessibility text', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 1000 });
    await openCalculator(page);
    const chart = page.getByRole('img', { name: /API-equivalent value trend/i });
    await expect(chart).toBeVisible();

    const expected = await page.evaluate(() => {
      const currentTokens = document.querySelector('.chart-column-current > span:last-child')?.textContent?.trim();
      const apiEquivalentValue = document.querySelector('.value-summary-card .value-metric strong')?.textContent?.trim();
      const chartElement = document.querySelector('.trend-chart');
      const describedBy = chartElement?.getAttribute('aria-describedby')?.split(/\s+/).filter(Boolean) ?? [];
      const describedText = describedBy.map((id) => document.getElementById(id)?.textContent?.trim() ?? '').join(' ');
      return {
        currentTokens,
        apiEquivalentValue,
        accessibilityText: [
          chartElement?.getAttribute('aria-label'),
          chartElement?.getAttribute('aria-description'),
          describedText,
        ].filter(Boolean).join(' '),
      };
    });
    expect(expected.currentTokens).toBeTruthy();
    expect(expected.apiEquivalentValue).toBeTruthy();
    expect(expected.accessibilityText).toContain(expected.currentTokens!);
    expect(expected.accessibilityText).toContain(expected.apiEquivalentValue!);
  });
});
