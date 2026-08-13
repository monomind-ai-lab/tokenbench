import { expect, test, type Page } from '@playwright/test';
import type { CatalogResponse } from '../src/catalog/contracts';
import { parseComparisonViewModel } from '../src/frontend/comparison-contracts';
import { FRONTEND_TEST_CATALOG } from '../src/frontend/test-fixtures';
import { themeBootstrapMarkup } from '../src/brand/theme-bootstrap';
import { buildBlankTestCheatsheetPdf } from '../src/newsletter/test-cheatsheet';
import {
  HANDLER_COMPARISON_PATH,
  HANDLER_SPARSE_COMPARISON_PATH,
  comparisonDirectoryEnvelope,
  correctedPublicScoreLeaderboard,
  decisionSummaryEnvelope,
  emptyCodingLeaderboard,
  fulfillJson,
  readyCodingLeaderboard,
  readyFilterControlsLeaderboard,
  readyMediaLeaderboard,
  stubNewsletterSignup,
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

function contrastRatio(left: string, right: string): number {
  const channels = (color: string) => {
    const values = color.match(/[\d.]+/gu)?.slice(0, 3).map(Number);
    if (!values || values.length !== 3) throw new Error(`Expected a computed RGB color, received ${color}.`);
    return values.map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
  };
  const luminance = (color: string) => {
    const [red, green, blue] = channels(color);
    return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
  };
  const lighter = Math.max(luminance(left), luminance(right));
  const darker = Math.min(luminance(left), luminance(right));
  return (lighter + 0.05) / (darker + 0.05);
}

const CALCULATOR_PATH = '/tools/subscriptions-vs-apis/';
const CATALOG_CACHE_KEY = 'tokenbench:catalog:v2';
const CATALOG_FIXTURE_IDENTITY_HEADER = 'x-tokenbench-browser-catalog-fixture';

interface CatalogFixture {
  expectNextDelivery: () => Promise<void>;
}

function catalogFixtureSignature(catalog: CatalogResponse): string {
  return `revision=${catalog.revision};plans=${catalog.plans.map((plan) => plan.id).join(',') || '-'};models=${catalog.modelOffers.map((offer) => offer.id).join(',') || '-'}`;
}

function isCatalogUrl(url: URL, origin: string): boolean {
  return url.origin === origin && url.pathname === '/api/catalog';
}

async function clearCatalogFixtureCache(page: Page): Promise<void> {
  // The test page can have navigated to the origin only to set its theme before
  // this helper is called. Clear the catalog cache in that already-open page
  // and before every following document so fixture responses cannot be masked
  // by a prior calculator scenario.
  await page.addInitScript((cacheKey) => {
    window.localStorage.removeItem(cacheKey);
  }, CATALOG_CACHE_KEY);
  if (page.url() !== 'about:blank') {
    await page.evaluate((cacheKey) => window.localStorage.removeItem(cacheKey), CATALOG_CACHE_KEY);
  }
}

async function installCatalogFixture(page: Page, catalog: CatalogResponse, status = 200): Promise<CatalogFixture> {
  const origin = previewOrigin();
  const signature = catalogFixtureSignature(catalog);
  const description = `catalog fixture ${signature}`;
  const body = JSON.stringify(catalog);

  await page.route((url) => isCatalogUrl(url, origin), (route) => route.fulfill({
    status,
    contentType: 'application/json',
    headers: {
      etag: `"${signature}"`,
      'cache-control': 'no-store',
      [CATALOG_FIXTURE_IDENTITY_HEADER]: signature,
    },
    body,
  }));

  return {
    expectNextDelivery: async () => {
      const response = await page.waitForResponse((candidate) => isCatalogUrl(new URL(candidate.url()), origin), { timeout: 15_000 });
      const headers = response.headers();
      expect(response.status(), `Expected ${description} to be delivered with status ${status}.`).toBe(status);
      expect(headers[CATALOG_FIXTURE_IDENTITY_HEADER], `Expected the browser to receive ${description}, not a cached or competing catalog response.`).toBe(signature);

      if (status >= 200 && status < 300) {
        expect(await response.json() as CatalogResponse, `Expected the browser to receive the full ${description} payload.`).toEqual(catalog);
        await expect.poll(async () => page.evaluate((cacheKey) => {
          const raw = window.localStorage.getItem(cacheKey);
          if (!raw) return null;
          try {
            const catalog = JSON.parse(raw)?.catalog;
            if (!catalog || typeof catalog.revision !== 'string' || !Array.isArray(catalog.plans) || !Array.isArray(catalog.modelOffers)) return null;
            return catalog;
          } catch {
            return null;
          }
        }, CATALOG_CACHE_KEY), {
          message: `Expected TokenBench to cache the delivered ${description} fixture.`,
        }).toEqual(catalog);
      }
    },
  };
}

async function resetCatalogFixtureLifecycle(page: Page): Promise<void> {
  await page.unrouteAll({ behavior: 'wait' });
  await clearCatalogFixtureCache(page);
}

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

async function stubStaticPageThirdPartyAssets(page: Page): Promise<void> {
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://translate.google.com/**', (route) => route.fulfill({ contentType: 'application/javascript', body: '' }));
}

async function setStoredTheme(page: Page, theme: Theme): Promise<void> {
  if (page.url() === 'about:blank') {
    await page.goto(previewOrigin() + '/', { waitUntil: 'domcontentloaded' });
  }
  await page.evaluate((storedTheme) => {
    window.localStorage.setItem('tokenbench:theme', storedTheme);
    window.localStorage.setItem('tokenbench:theme:explicit', 'true');
  }, theme);
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

const INTERNAL_FIXTURE_REVISIONS = ['browser-benchmark-r1', 'browser-catalog-r1', 'test-revision'] as const;

async function assertFirstViewportOmitsInternalRevisions(page: Page): Promise<void> {
  const visibleText = await page.evaluate(() => {
    const textNodes: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      const text = node.textContent?.trim();
      if (!parent || !text) continue;
      const bounds = parent.getBoundingClientRect();
      if (bounds.bottom > 0 && bounds.top < window.innerHeight) textNodes.push(text);
    }
    return textNodes.join(' ');
  });

  for (const revision of INTERNAL_FIXTURE_REVISIONS) expect(visibleText).not.toContain(revision);
}

async function installInteractiveRouteStubs(page: Page): Promise<CatalogFixture> {
  const origin = previewOrigin();
  await resetCatalogFixtureLifecycle(page);
  await blockExternalRequests(page, origin);
  const catalogFixture = await installCatalogFixture(page, FRONTEND_TEST_CATALOG);
  await stubBenchmarkDirectory(page, origin);
  await page.route((url) => url.origin === origin && url.pathname.startsWith('/api/benchmarks/leaderboards/'), (route) => fulfillJson(route, {
    error: 'Published benchmark data is unavailable for this fixture route.',
  }, 503));
  await stubLeaderboard(page, origin, 'llm-coding', readyCodingLeaderboard());
  await stubLeaderboard(page, origin, 'media-text-to-image', readyMediaLeaderboard());
  await stubHandlerBackedComparison(page, origin, { assetMode: handlerBackedAssetMode() });
  return catalogFixture;
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

async function assertCompareHubPickerInteractive(page: Page): Promise<void> {
  const firstModel = page.getByRole('combobox', { name: 'First model' });
  await firstModel.focus();
  await expect(firstModel).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('listbox', { name: 'Available models' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(firstModel).toHaveAttribute('aria-expanded', 'false');
}

async function assertHandlerComparisonClientInteractions(page: Page): Promise<void> {
  const currentTheme = await page.locator('html').getAttribute('data-theme');
  const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
  const themeToggle = page.getByRole('button', { name: `Toggle ${nextTheme} theme` });
  await expect(themeToggle).toBeVisible();
  await themeToggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', nextTheme);

  await assertCompareHubPickerInteractive(page);

  const menu = page.locator('.menu-button');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await menu.click();
  await expect(menu).toHaveAccessibleName('Close navigation');
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await menu.click();
  await expect(menu).toHaveAccessibleName('Open navigation');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
}

interface BrowserErrorCapture {
  readonly consoleErrors: string[];
  readonly pageErrors: string[];
  readonly failedRequests: string[];
}

function captureBrowserErrors(page: Page): BrowserErrorCapture {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.url()} (${request.failure()?.errorText ?? 'unknown failure'})`);
  });
  return { consoleErrors, pageErrors, failedRequests };
}

async function assertInteractiveHandlerComparison(page: Page): Promise<void> {
  await expect(page.locator('.app-shell')).toHaveAttribute('data-layout', 'compact', { timeout: 15_000 });
  await expect(page.locator('.comparison-detail-page')).toHaveAttribute('data-client-hydrated', 'true');
  await assertHandlerComparisonClientInteractions(page);
}

interface HydrationMatrixRoute {
  readonly path: string;
  readonly heading: string;
  readonly hydratedClientMarker: string;
  readonly visuallyVisibleHeading?: boolean;
}

const hydrationMatrix: readonly HydrationMatrixRoute[] = [
  { path: '/', heading: 'Transparent AI Costs. Verified Benchmarks.', hydratedClientMarker: '.home-page' },
  { path: '/tools/', heading: 'AI cost decision tools', hydratedClientMarker: '.tools-page' },
  { path: '/tools/subscriptions-vs-apis/', heading: 'Should you subscribe or pay as you go?', hydratedClientMarker: '.calculator-page' },
  { path: '/leaderboards/', heading: 'Model leaderboards', hydratedClientMarker: '.leaderboard-directory-page' },
  { path: '/leaderboards/llm/coding/', heading: 'Coding benchmark', hydratedClientMarker: '.leaderboard-results[aria-label="Coding benchmark"]' },
  { path: '/leaderboards/media/text-to-image/', heading: 'Text to image', hydratedClientMarker: '.leaderboard-results[aria-label="Text to image"]' },
  { path: '/compare/', heading: 'Compare models side by side', hydratedClientMarker: '.comparison-hub-page' },
  { path: HANDLER_COMPARISON_PATH, heading: 'Alpha vs Beta', hydratedClientMarker: '.comparison-detail-page[data-client-hydrated="true"]' },
  { path: '/guides/', heading: 'Spend smarter on AI', hydratedClientMarker: '.guides-shell main.guides-main:not(.article-main)' },
  { path: '/guides/track-claude-code-usage/', heading: 'How to Track Claude Code Usage, Tokens, and Spend', hydratedClientMarker: '.guides-shell main.guides-main.article-main' },
];

const hydrationThemes = ['dark', 'light'] as const;
const HYDRATION_MATRIX_CASES_PER_VIEWPORT = hydrationThemes.length * hydrationMatrix.length;
const HYDRATION_MATRIX_EXPECTED_CELL_MS = 2_000;
const HYDRATION_MATRIX_FULL_LOAD_OVERHEAD_MS = 35_000;
const HYDRATION_MATRIX_VIEWPORT_TIMEOUT_MS = HYDRATION_MATRIX_FULL_LOAD_OVERHEAD_MS
  + HYDRATION_MATRIX_CASES_PER_VIEWPORT * HYDRATION_MATRIX_EXPECTED_CELL_MS;
const HYDRATION_MATRIX_NAVIGATION_TIMEOUT_MS = 10_000;
const HYDRATION_MATRIX_CELL_TIMEOUT_MS = 15_000;

async function openCalculator(page: Page, catalog = FRONTEND_TEST_CATALOG, status = 200, expectCalculator = true) {
  const origin = previewOrigin();
  await resetCatalogFixtureLifecycle(page);
  await blockExternalRequests(page, origin);
  const catalogFixture = await installCatalogFixture(page, catalog, status);
  const catalogDelivery = catalogFixture.expectNextDelivery();
  await page.goto(CALCULATOR_PATH);
  await catalogDelivery;
  if (expectCalculator) await expect(page.getByRole('heading', { name: 'API-equivalent monthly cost' })).toBeVisible({ timeout: 15_000 });
}

async function openCodingLeaderboard(page: Page) {
  const origin = previewOrigin();
  await blockExternalRequests(page, origin);
  await stubBenchmarkDirectory(page, origin, decisionSummaryEnvelope());
  await stubLeaderboard(page, origin, 'llm-coding', readyCodingLeaderboard());
  await page.goto('/leaderboards/llm/coding/');
  await expect(page.getByRole('table', { name: 'Coding benchmark' })).toBeVisible({ timeout: 15_000 });
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
  test('successful provider images keep requested dimensions before and after an oversized Brandfetch asset loads', async ({ page }) => {
    const origin = previewOrigin();
    const requestedSizes = [20, 24, 32] as const;
    let releaseResponses = () => {};
    const responsesReleased = new Promise<void>((resolve) => { releaseResponses = resolve; });
    let signalFirstRequest = () => {};
    const firstRequest = new Promise<void>((resolve) => { signalFirstRequest = resolve; });

    await page.setViewportSize({ width: 320, height: 1000 });
    await blockExternalRequests(page, origin);
    await page.route('https://cdn.brandfetch.io/**', async (route) => {
      signalFirstRequest();
      await responsesReleased;
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#137fec"/></svg>',
      });
    });
    await page.goto('/');
    await page.evaluate((sizes) => {
      const fixture = document.createElement('div');
      fixture.id = 'provider-mark-success-fixture';
      fixture.style.display = 'flex';
      fixture.style.gap = '4px';
      for (const size of sizes) {
        const image = document.createElement('img');
        image.className = 'provider-mark';
        image.alt = `Provider ${size}`;
        image.width = size;
        image.height = size;
        image.src = `https://cdn.brandfetch.io/example.com/w/${size}/h/${size}/theme/light/icon?c=browser-test`;
        fixture.append(image);
      }
      document.body.append(fixture);
    }, requestedSizes);
    await firstRequest;

    const marks = page.locator('#provider-mark-success-fixture img.provider-mark');
    const beforeLoad = await marks.evaluateAll((images) => images.map((image) => {
      const bounds = image.getBoundingClientRect();
      return { width: bounds.width, height: bounds.height };
    }));
    expect(beforeLoad).toEqual(requestedSizes.map((size) => ({ width: size, height: size })));

    releaseResponses();
    await expect.poll(() => marks.evaluateAll((images) => images.map((image) => ({
      naturalWidth: (image as HTMLImageElement).naturalWidth,
      naturalHeight: (image as HTMLImageElement).naturalHeight,
    })))).toEqual(requestedSizes.map(() => ({ naturalWidth: 400, naturalHeight: 200 })));

    const afterLoad = await marks.evaluateAll((images) => images.map((image) => {
      const bounds = image.getBoundingClientRect();
      return { width: bounds.width, height: bounds.height };
    }));
    expect(afterLoad).toEqual(beforeLoad);
    await assertNoHorizontalOverflow(page);
  });

  test('calculator result explains how to recover when the selected provider has no verified models', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 1000 });
    await openCalculator(page, { ...FRONTEND_TEST_CATALOG, modelOffers: [] }, 200, false);

    const result = page.getByRole('region', { name: 'Calculated plan value' });
    await expect(result.getByText('No verified models are available for this provider')).toBeVisible({ timeout: 15_000 });
    await expect(result).toContainText('Choose another provider or retry catalog refresh.');
  });

  test('rejects a catalog response that reuses fixture IDs but changes its pricing payload', async ({ page }) => {
    const origin = previewOrigin();
    const mutatedCatalog: CatalogResponse = {
      ...FRONTEND_TEST_CATALOG,
      modelOffers: FRONTEND_TEST_CATALOG.modelOffers.map((offer, index) => index === 0
        ? { ...offer, inputMicroDollarsPerMillion: offer.inputMicroDollarsPerMillion + 1 }
        : offer),
    };
    const expectedSignature = catalogFixtureSignature(FRONTEND_TEST_CATALOG);

    await resetCatalogFixtureLifecycle(page);
    await blockExternalRequests(page, origin);
    const fixture = await installCatalogFixture(page, FRONTEND_TEST_CATALOG);
    // Register this competing response after the normal fixture so it wins the
    // route match while preserving the same revision, IDs, marker, and ETag.
    await page.route((url) => isCatalogUrl(url, origin), (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        etag: `"${expectedSignature}"`,
        'cache-control': 'no-store',
        [CATALOG_FIXTURE_IDENTITY_HEADER]: expectedSignature,
      },
      body: JSON.stringify(mutatedCatalog),
    }));

    const delivery = fixture.expectNextDelivery();
    await page.goto(CALCULATOR_PATH);
    await expect(delivery).rejects.toThrow(/receive the full catalog fixture/i);
  });

  test('calculator keeps its four decisions, result actions, and provider fallback usable across target viewports and themes', async ({ page }) => {
    test.setTimeout(120_000);

    for (const width of [320, 375, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ['dark', 'light'] as const) {
        await setStoredTheme(page, theme);
        await openCalculator(page);

        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        for (const heading of [
          'Choose a provider and plan',
          'Choose the models you actually use',
          'Describe your message-level workload',
          'Review the recommendation',
        ]) {
          await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
        }

        const shareAction = page.getByRole('button', { name: 'Share result', exact: true });
        await expect(shareAction).toBeVisible();
        const shareBounds = await shareAction.evaluate((element) => element.getBoundingClientRect().toJSON());
        expect(shareBounds.width).toBeGreaterThanOrEqual(44);
        expect(shareBounds.height).toBeGreaterThanOrEqual(44);

        const providerFallback = page.locator('.provider-choice .provider-mark-fallback').first();
        await expect(providerFallback).toBeVisible();
        const fallbackBounds = await providerFallback.evaluate((element) => element.getBoundingClientRect().toJSON());
        expect(fallbackBounds.width).toBe(20);
        expect(fallbackBounds.height).toBe(20);

        if (width < 768) {
          const resultAction = page.getByRole('button', { name: 'View result', exact: true });
          await expect(resultAction).toBeVisible();
          const resultBounds = await resultAction.evaluate((element) => element.getBoundingClientRect().toJSON());
          expect(resultBounds.width).toBeGreaterThanOrEqual(44);
          expect(resultBounds.height).toBeGreaterThanOrEqual(44);
        }
        await assertNoHorizontalOverflow(page);
        await assertFirstViewportOmitsInternalRevisions(page);
        await page.unrouteAll();
      }
    }
  });

  for (const viewport of viewports) {
    test(`${viewport.width}px renders the expected mode without document overflow`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: 1000 });
      await openCalculator(page);
      await expect(page.locator('.model-mix-details')).toHaveAttribute('open', '');
      await page.locator('.model-list input[type="checkbox"]').nth(1).check();

      await expect(page.locator('.app-shell')).toHaveAttribute('data-layout', viewport.layout);
      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        header: document.querySelector('.header-inner')?.getBoundingClientRect().toJSON(),
        nav: document.querySelector('.primary-nav')?.getBoundingClientRect().toJSON(),
        actions: document.querySelector('.header-actions')?.getBoundingClientRect().toJSON(),
        rangeHeights: Array.from(document.querySelectorAll<HTMLInputElement>("input[type='range']"))
          .map((input) => input.getBoundingClientRect().height)
          .filter((height) => height > 0),
        controlsColumns: getComputedStyle(document.querySelector('.control-grid') as Element).gridTemplateColumns,
        resultsColumns: getComputedStyle(document.querySelector('.results-grid') as Element).gridTemplateColumns,
        comparisonTableDisplay: getComputedStyle(document.querySelector('.comparison-table') as Element).display,
        comparisonCardsDisplay: getComputedStyle(document.querySelector('.comparison-cards') as Element).display,
      }));

      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
      expect(dimensions.rangeHeights.length).toBeGreaterThan(0);
      expect(dimensions.rangeHeights.every((height) => height >= 44)).toBe(true);
      expect(dimensions.comparisonCardsDisplay).toBe(viewport.cards ? 'grid' : 'none');
      expect(dimensions.comparisonTableDisplay).toBe(viewport.cards ? 'none' : 'table');
      expect(dimensions.controlsColumns.split(' ').length).toBe(viewport.width >= 768 ? 2 : 1);
      expect(dimensions.resultsColumns.split(' ').length).toBe(viewport.width >= 800 && viewport.width < 1024 ? 2 : 1);

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
      await page.locator('.model-list input[type="checkbox"]').nth(1).check();
      await page.locator('body').click({ position: { x: 2, y: 2 } });
      for (const selector of ['input[name="provider"]', 'input[name="plan"]', 'input[type="checkbox"]', '#conversations-per-day', 'input[type="range"]']) {
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
    await setStoredTheme(page, 'dark');
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
        samples: [sample('a.evidence-link'), sample('.control-block legend'), sample('.choice-check'), sample('.workload-field label')],
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
    await expect.poll(() => page.evaluate(() => localStorage.getItem('tokenbench:theme'))).toBeNull();
    await page.getByRole('button', { name: 'Toggle light theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('tokenbench:theme'))).toBe('light');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('tokenbench:theme:explicit'))).toBe('true');
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

  test('uses reference-matched outlined choices and editable message-level workload controls', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 1000 });
    const providerBSourceId = 'provider-b-subscription';
    await openCalculator(page, {
      ...FRONTEND_TEST_CATALOG,
      provenance: [
        ...FRONTEND_TEST_CATALOG.provenance,
        {
          ...FRONTEND_TEST_CATALOG.provenance[0],
          id: providerBSourceId,
          providerId: 'provider-b',
          sourceUrl: 'https://provider-b.example/pricing',
        },
      ],
      plans: [
        ...FRONTEND_TEST_CATALOG.plans,
        {
          ...FRONTEND_TEST_CATALOG.plans[0],
          id: 'provider-b:starter',
          providerId: 'provider-b',
          displayName: 'Provider B Starter',
          sourceId: providerBSourceId,
        },
      ],
    });

    const readChoiceStyles = () => page.evaluate(() => {
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
    await expect.poll(async () => {
      const styles = await readChoiceStyles();
      return {
        borderDistinct: styles.selectedBorder !== styles.unselectedBorder,
        backgroundDistinct: styles.selectedBackground !== styles.unselectedBackground,
      };
    }).toEqual({ borderDistinct: true, backgroundDistinct: true });
    const choiceStyles = await readChoiceStyles();

    expect(choiceStyles.selectedRadius).toBe('4px');
    expect(choiceStyles.selectedShadow).toBe('none');
    await expect(page.getByRole('spinbutton', { name: 'Conversations per day' })).toHaveValue('10');
    await expect(page.getByRole('spinbutton', { name: 'Messages per conversation' })).toHaveValue('8');
    const outputTokens = page.getByRole('spinbutton', { name: 'Average output tokens per message' });
    await expect(outputTokens).toHaveValue('250');
    await outputTokens.fill('400');
    await expect(outputTokens).toHaveValue('400');
    const advanced = page.locator('.model-mix-details');
    await expect(advanced).toHaveAttribute('open', '');
    await page.locator('.model-list input[type="checkbox"]').nth(1).check();
    await expect(page.getByRole('status', { name: 'Default API mapping' })).toContainText('Advanced override is active.');
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
    await expect(page.getByRole('heading', { name: 'API-equivalent monthly cost' })).toBeVisible({ timeout: 15_000 });

    await page.unrouteAll();
    await openCalculator(page, { ...FRONTEND_TEST_CATALOG, plans: [], modelOffers: [] }, 200, false);
    await expect(page.getByText('No providers available')).toBeVisible();

    await page.unrouteAll();
    await page.evaluate(() => window.localStorage.clear());
    await openCalculator(page, FRONTEND_TEST_CATALOG, 503, false);
    await expect(page.getByRole('alert')).toContainText('Catalog unavailable');
    await expect(page.getByRole('heading', { name: /Individual Subscription Plans/i })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('checked-in verified bootstrap');
    await expect.poll(() => page.evaluate((cacheKey) => window.localStorage.getItem(cacheKey), CATALOG_CACHE_KEY)).toBeNull();

    await page.unrouteAll();
    await openCalculator(page, { ...FRONTEND_TEST_CATALOG, freshness: { status: 'stale', checkedAt: '2026-08-02T00:00:00.000Z' } });
    await expect(page.getByText('The published catalog is stale; verify pricing before making a decision.')).toBeVisible();
  });
});

test.describe('leaderboard browser harness', () => {
  test('renders corrected public coding and overall scores with canonical share metadata', async ({ page }) => {
    const origin = previewOrigin();
    await blockExternalRequests(page, origin);
    await stubBenchmarkDirectory(page, origin, decisionSummaryEnvelope());
    await stubLeaderboard(page, origin, 'llm-coding', correctedPublicScoreLeaderboard('llm-coding'));
    await stubLeaderboard(page, origin, 'llm-overall', correctedPublicScoreLeaderboard('llm-overall'));

    for (const [path, tableName, cardsLabel, score] of [
      ['/leaderboards/llm/coding/', 'Coding benchmark', 'Coding benchmark cards', '78.0'],
      ['/leaderboards/llm/overall/', 'Overall benchmarks', 'Overall benchmark cards', '81.5'],
    ] as const) {
      await page.setViewportSize({ width: 390, height: 1000 });
      await page.goto(path);
      const resultCards = page.getByRole('list', { name: cardsLabel });
      await expect(resultCards).toBeVisible();
      await expect(resultCards.getByRole('heading', { name: 'GPT-5.6 Sol' })).toBeVisible();
      await expect(resultCards.getByText(score, { exact: true })).toBeVisible();
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://tokenbench.monomind.one${path}`);
      await page.getByRole('button', { name: 'Share Leaderboard' }).click();
      await expect(page.getByRole('textbox', { name: 'Share URL' })).toHaveValue(`https://tokenbench.monomind.one${path}`);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'Share Leaderboard' })).toBeFocused();
      await assertNoHorizontalOverflow(page);
    }
  });

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

  test('keeps every available desktop sort control at a 44px minimum hit target', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 1000 });
    await openCodingLeaderboard(page);

    const targets = await page.locator('.leaderboard-desktop-table thead button').evaluateAll((elements) => elements.map((element) => {
      const bounds = element.getBoundingClientRect();
      return { label: element.getAttribute('aria-label'), width: bounds.width, height: bounds.height };
    }));

    expect(targets).toEqual([{ label: 'Sort by score', width: expect.any(Number), height: expect.any(Number) }]);
    for (const target of targets) {
      expect(target.width, `${target.label} width`).toBeGreaterThanOrEqual(44);
      expect(target.height, `${target.label} height`).toBeGreaterThanOrEqual(44);
    }
  });

  test('keeps the four filter rows ordered, scrollable, and URL-backed', async ({ page }) => {
    test.setTimeout(120_000);
    const origin = previewOrigin();
    await blockExternalRequests(page, origin);
    await stubBenchmarkDirectory(page, origin, decisionSummaryEnvelope());
    await stubLeaderboard(page, origin, 'llm-coding', readyFilterControlsLeaderboard());

    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.goto('/leaderboards/llm/coding/');
      await expect(page.getByRole('form', { name: 'Leaderboard filters' })).toBeVisible();
      const rangeRow = page.locator('.leaderboard-filter-range-row');
      await expect.soft(rangeRow.getByRole('checkbox', { name: 'Include estimated models' })).toBeVisible();

      const geometry = await page.locator('.leaderboard-filters').evaluate((form) => {
        const box = (selector: string) => {
          const bounds = form.querySelector(selector)!.getBoundingClientRect();
          return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
        };
        return {
          form: form.getBoundingClientRect().width,
          search: box('.leaderboard-filter-search-row'),
          selectors: box('.leaderboard-filter-selector-row'),
          providers: box('.leaderboard-filter-provider-row'),
          range: box('.leaderboard-filter-range-row'),
          estimated: box('.leaderboard-estimated-control'),
        };
      });

      expect(geometry.search.width).toBeGreaterThanOrEqual(geometry.form - 1);
      expect([geometry.search.y, geometry.selectors.y, geometry.providers.y, geometry.range.y])
        .toEqual([...new Set([geometry.search.y, geometry.selectors.y, geometry.providers.y, geometry.range.y])].sort((a, b) => a - b));
      expect.soft(geometry.estimated.y).toBeGreaterThanOrEqual(geometry.range.y);
      expect.soft(geometry.estimated.y + geometry.estimated.height)
        .toBeLessThanOrEqual(geometry.range.y + geometry.range.height);

      const providerStrip = page.locator('.leaderboard-provider-options');
      const providerGeometry = await providerStrip.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        overflowX: getComputedStyle(element).overflowX,
        flexWrap: getComputedStyle(element).flexWrap,
      }));
      if (width < 768) {
        expect(providerGeometry.overflowX).toBe('auto');
        expect(providerGeometry.flexWrap).toBe('nowrap');
        expect(providerGeometry.scrollWidth).toBeGreaterThan(providerGeometry.clientWidth);
      } else {
        expect(providerGeometry.flexWrap).toBe('wrap');
      }

      for (const button of await page.getByRole('group', { name: 'Providers' }).getByRole('button').all()) {
        const bounds = await button.boundingBox();
        expect(bounds?.height).toBeGreaterThanOrEqual(44);
      }
      await assertNoHorizontalOverflow(page);
    }

    await page.setViewportSize({ width: 320, height: 1100 });
    await page.goto('/leaderboards/llm/coding/');
    await page.getByRole('button', { name: 'xAI' }).focus();
    await expect(page.getByRole('button', { name: 'xAI' })).toBeFocused();
    const focusedClearance = await page.getByRole('button', { name: 'xAI' }).evaluate((button) => {
      const item = button.getBoundingClientRect();
      const strip = button.parentElement!.getBoundingClientRect();
      return { start: item.left - strip.left, end: strip.right - item.right };
    });
    expect(focusedClearance.start).toBeGreaterThanOrEqual(6);
    expect(focusedClearance.end).toBeGreaterThanOrEqual(6);

    await page.getByRole('button', { name: 'OpenAI' }).click();
    await expect(page.getByRole('button', { name: 'OpenAI' })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => new URL(page.url()).searchParams.getAll('provider')).toEqual(['OpenAI']);

    const minimum = page.getByRole('slider', { name: 'Minimum price per 1M tokens' });
    await minimum.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => new URL(page.url()).searchParams.get('minPrice')).toBe('0.5');
  });

  test('keeps filter selection legible across target themes', async ({ page }) => {
    test.setTimeout(120_000);
    const origin = previewOrigin();
    await blockExternalRequests(page, origin);
    await stubBenchmarkDirectory(page, origin, decisionSummaryEnvelope());
    await stubLeaderboard(page, origin, 'llm-coding', readyFilterControlsLeaderboard());

    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      for (const theme of ['dark', 'light'] as const) {
        await setStoredTheme(page, theme);
        await page.goto('/leaderboards/llm/coding/?provider=OpenAI');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

        const selected = page.getByRole('button', { name: 'OpenAI' });
        const unselected = page.getByRole('button', { name: 'Anthropic' });
        await expect(selected).toHaveAttribute('aria-pressed', 'true');
        await expect(selected.locator('svg')).toBeVisible();
        await expect(unselected.locator('svg')).toHaveCount(0);
        const providerStyles = await Promise.all([selected, unselected].map((button) => button.evaluate((element) => {
          const style = getComputedStyle(element);
          return { background: style.backgroundColor, border: style.borderColor };
        })));
        expect(providerStyles[0]?.background).not.toBe(providerStyles[1]?.background);
        expect(providerStyles[0]?.border).not.toBe(providerStyles[1]?.border);

        const rangeStack = page.locator('.leaderboard-price-range-stack');
        await expect(rangeStack).toBeVisible();
        const rangePresentation = await rangeStack.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const track = getComputedStyle(element, '::before');
          const colorProbe = document.createElement('span');
          element.append(colorProbe);
          const resolveColor = (value: string) => {
            colorProbe.style.color = value;
            return getComputedStyle(colorProbe).color;
          };
          const selectedColor = resolveColor('var(--range-selected, var(--primary))');
          const inactiveColor = resolveColor('var(--outline)');
          const surfaceColor = resolveColor('var(--surface)');
          colorProbe.remove();
          return {
            width: bounds.width,
            height: bounds.height,
            trackBackground: track.backgroundImage,
            trackHeight: track.height,
            rangeStart: getComputedStyle(element).getPropertyValue('--range-start').trim(),
            rangeEnd: getComputedStyle(element).getPropertyValue('--range-end').trim(),
            selectedToken: getComputedStyle(element).getPropertyValue('--range-selected').trim(),
            selectedColor,
            inactiveColor,
            surfaceColor,
            dots: Array.from(element.querySelectorAll<HTMLElement>('.leaderboard-price-range-dot')).map((dot) => {
              const style = getComputedStyle(dot);
              return {
                width: style.width,
                height: style.height,
                background: style.backgroundColor,
                border: style.borderColor,
                pointerEvents: style.pointerEvents,
              };
            }),
          };
        });
        expect(rangePresentation.width).toBeGreaterThan(0);
        expect(rangePresentation.height).toBeGreaterThanOrEqual(44);
        expect(rangePresentation.trackBackground).toContain('linear-gradient');
        expect(rangePresentation.trackHeight).toBe('4px');
        expect(rangePresentation.rangeStart).toBe('0%');
        expect(rangePresentation.rangeEnd).toBe('100%');
        expect(rangePresentation.dots).toEqual([
          {
            width: '22px',
            height: '22px',
            background: rangePresentation.selectedColor,
            border: rangePresentation.surfaceColor,
            pointerEvents: 'none',
          },
          {
            width: '22px',
            height: '22px',
            background: rangePresentation.selectedColor,
            border: rangePresentation.surfaceColor,
            pointerEvents: 'none',
          },
        ]);
        if (theme === 'dark') {
          expect.soft(rangePresentation.selectedToken).not.toBe('');
          expect(contrastRatio(rangePresentation.selectedColor, rangePresentation.inactiveColor))
            .toBeGreaterThanOrEqual(3);
          expect(contrastRatio(rangePresentation.selectedColor, rangePresentation.surfaceColor))
            .toBeGreaterThanOrEqual(3);
        }

        const sliders = [
          page.getByRole('slider', { name: 'Minimum price per 1M tokens' }),
          page.getByRole('slider', { name: 'Maximum price per 1M tokens' }),
        ];
        for (const slider of sliders) {
          await expect(slider).toBeVisible();
          const presentation = await slider.evaluate((input) => {
            const style = getComputedStyle(input);
            const bounds = input.getBoundingClientRect();
            return { appearance: style.appearance, height: bounds.height };
          });
          expect(presentation.appearance).toBe('none');
          expect(presentation.height).toBeGreaterThanOrEqual(44);
          await slider.focus();
          await expect(slider).toBeFocused();
        }
        const focusTreatment = await rangeStack.evaluate((element) => {
          const style = getComputedStyle(element, '::after');
          return {
            outlineStyle: style.outlineStyle,
            outlineWidth: style.outlineWidth,
            pointerEvents: style.pointerEvents,
          };
        });
        expect(focusTreatment).toEqual({
          outlineStyle: 'solid',
          outlineWidth: '3px',
          pointerEvents: 'none',
        });
        await assertNoHorizontalOverflow(page);
      }
    }
  });

  test('keeps both range thumbs pointer-focusable across their 44px hit squares', async ({ page }) => {
    const origin = previewOrigin();
    await blockExternalRequests(page, origin);
    await stubBenchmarkDirectory(page, origin, decisionSummaryEnvelope());
    await stubLeaderboard(page, origin, 'llm-coding', readyFilterControlsLeaderboard());
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto('/leaderboards/llm/coding/');

    const stack = page.locator('.leaderboard-price-range-stack');
    await stack.scrollIntoViewIfNeeded();
    const bounds = await stack.boundingBox();
    if (!bounds) throw new Error('Expected a visible shared price range.');
    const minimum = page.getByRole('slider', { name: 'Minimum price per 1M tokens' });
    const maximum = page.getByRole('slider', { name: 'Maximum price per 1M tokens' });

    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.mouse.click(bounds.x + 22, bounds.y + 40);
    await expect(minimum).toBeFocused();

    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.mouse.click(bounds.x + bounds.width - 22, bounds.y + 4);
    await expect(maximum).toBeFocused();
  });

  test('keeps equal and adjacent range thumbs independently pointer-focusable', async ({ page }) => {
    test.setTimeout(120_000);
    const origin = previewOrigin();
    await blockExternalRequests(page, origin);
    await stubBenchmarkDirectory(page, origin, decisionSummaryEnvelope());
    await stubLeaderboard(page, origin, 'llm-coding', readyFilterControlsLeaderboard());
    await page.setViewportSize({ width: 320, height: 1100 });

    for (const scenario of [
      {
        label: 'equal first endpoint',
        query: '?minPrice=0.125&maxPrice=0.125',
        probeOffset: { minimum: 18, maximum: 30 },
        shouldChange: { minimum: false, maximum: true },
      },
      {
        label: 'equal last endpoint',
        query: '?minPrice=1000&maxPrice=1000',
        probeOffset: { minimum: -58, maximum: -18 },
        shouldChange: { minimum: true, maximum: false },
      },
      {
        label: 'equal interior',
        query: '?minPrice=2&maxPrice=2',
        probeOffset: { minimum: -30, maximum: 30 },
        shouldChange: { minimum: true, maximum: true },
      },
      {
        label: 'adjacent interior',
        query: '?minPrice=2&maxPrice=5',
        probeOffset: { minimum: -30, maximum: 30 },
        shouldChange: { minimum: true, maximum: true },
      },
    ] as const) {
      for (const target of ['minimum', 'maximum'] as const) {
        await page.goto(`/leaderboards/llm/coding/${scenario.query}`);
        const stack = page.locator('.leaderboard-price-range-stack');
        await stack.waitFor({ state: 'visible' });
        const minimum = page.getByRole('slider', { name: 'Minimum price per 1M tokens' });
        const maximum = page.getByRole('slider', { name: 'Maximum price per 1M tokens' });
        const initial = {
          minimum: Number(await minimum.inputValue()),
          maximum: Number(await maximum.inputValue()),
        };
        const lastIndex = Number(await maximum.getAttribute('max'));
        await stack.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior }));
        const geometry = await stack.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const dotBounds = Array.from(element.querySelectorAll<HTMLElement>('.leaderboard-price-range-dot'))
            .map((dot) => dot.getBoundingClientRect());
          return {
            bounds: { x: bounds.x, y: bounds.y, width: bounds.width },
            dotBounds: dotBounds.map((dot) => ({ x: dot.x, y: dot.y })),
          };
        });
        const { bounds, dotBounds } = geometry;
        const semanticCenter = (value: number) => bounds.x + 22 + (bounds.width - 44) * (value / lastIndex);
        const minimumCenter = semanticCenter(initial.minimum);
        const maximumCenter = semanticCenter(initial.maximum);
        expect(dotBounds[0]?.x).toBeCloseTo(minimumCenter - 11, 0);
        expect(dotBounds[0]?.y).toBeCloseTo(bounds.y + 11, 0);
        expect(dotBounds[1]?.x).toBeCloseTo(maximumCenter - 11, 0);
        expect(dotBounds[1]?.y).toBeCloseTo(bounds.y + 11, 0);

        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        const center = target === 'minimum' ? minimumCenter : maximumCenter;
        await page.mouse.click(center + scenario.probeOffset[target], bounds.y + 22);
        const intended = target === 'minimum' ? minimum : maximum;
        await expect.soft(intended, `${scenario.label} ${target} directional lane`).toBeFocused();
        if (scenario.shouldChange[target]) {
          await expect.poll(async () => ({
            minimum: Number(await minimum.inputValue()),
            maximum: Number(await maximum.inputValue()),
          })).toEqual(target === 'minimum'
            ? { minimum: expect.any(Number), maximum: initial.maximum }
            : { minimum: initial.minimum, maximum: expect.any(Number) });
        }
        const changed = {
          minimum: Number(await minimum.inputValue()),
          maximum: Number(await maximum.inputValue()),
        };
        if (scenario.shouldChange[target]) {
          expect(changed[target]).not.toBe(initial[target]);
        } else {
          expect(changed).toEqual(initial);
        }
        expect(changed.minimum).toBeLessThanOrEqual(changed.maximum);
      }
    }
  });

  test('keeps table semantics, named filters, and equivalent model cards across leaderboard breakpoints', async ({ page }) => {
    const origin = previewOrigin();
    await page.setViewportSize({ width: 1024, height: 1000 });
    await openCodingLeaderboard(page);
    await stubLeaderboard(page, origin, 'media-text-to-image', readyMediaLeaderboard());

    const codingTable = page.getByRole('table', { name: 'Coding benchmark' });
    await expect(codingTable).toBeVisible();
    await expect(page.getByRole('form', { name: 'Leaderboard filters' })).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Search model or provider' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Providers' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Workload profile' })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Sort leaderboard' })).toHaveCount(0);
    expect(await page.locator('.leaderboard-desktop-table th[aria-sort]').evaluateAll((headers) => headers.map((header) => header.getAttribute('aria-sort')))).toEqual(['none', 'descending', 'none']);
    await expect(page.getByRole('button', { name: 'Sort by score' })).toBeVisible();
    const codingNames = await codingTable.locator('tbody th[scope="row"] .leaderboard-model > a:first-child').allTextContents();
    expect(codingNames).toEqual(['Alpha', 'Beta']);

    for (const width of [320, 375, 768]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/leaderboards/llm/coding/');
      await expect(page.locator('.leaderboard-desktop-table')).toBeHidden();
      const codingCards = page.getByRole('list', { name: 'Coding benchmark cards' });
      await expect(codingCards).toBeVisible();
      expect(await codingCards.getByRole('heading', { level: 3 }).allTextContents()).toEqual(codingNames);
      await assertNoHorizontalOverflow(page);
    }

    await page.setViewportSize({ width: 1024, height: 1000 });
    await page.goto('/leaderboards/media/text-to-image/');
    const mediaTable = page.getByRole('table', { name: 'Text to image' });
    await expect(mediaTable).toBeVisible();
    expect(await page.locator('.leaderboard-desktop-table th[aria-sort]').evaluateAll((headers) => headers.map((header) => header.getAttribute('aria-sort')))).toEqual(['ascending', 'none', 'none']);
    const mediaNames = await mediaTable.locator('tbody th[scope="row"] .leaderboard-model > a:first-child').allTextContents();
    expect(mediaNames).toEqual(['Canvas', 'Prism']);

    await page.setViewportSize({ width: 375, height: 1000 });
    await page.goto('/leaderboards/media/text-to-image/');
    const mediaCards = page.getByRole('list', { name: 'Text to image cards' });
    await expect(mediaCards).toBeVisible();
    expect(await mediaCards.getByRole('heading', { level: 3 }).allTextContents()).toEqual(mediaNames);
  });

  test('keeps current leaderboard actions, score chart, and provider identity readable across themes and breakpoints', async ({ page }) => {
    test.setTimeout(120_000);
    const origin = previewOrigin();
    await blockExternalRequests(page, origin);
    await stubBenchmarkDirectory(page, origin, decisionSummaryEnvelope());
    await stubLeaderboard(page, origin, 'llm-coding', readyCodingLeaderboard());

    for (const width of [320, 1440] as const) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ['dark', 'light'] as const) {
        await setStoredTheme(page, theme);
        await page.goto('/leaderboards/llm/coding/?q=Alpha&sort=score-desc');

        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.getByRole('heading', { name: 'Coding benchmark', level: 1 })).toBeVisible();

        const actions = page.getByRole('group', { name: 'Leaderboard actions' });
        await expect(actions.getByRole('button', { name: 'Share leaderboard' })).toBeVisible();
        await expect(actions.getByRole('link', { name: 'Download CSV' })).toHaveAttribute(
          'href',
          '/api/benchmarks/leaderboards/llm-coding/csv?profile=balanced&sort=score-desc&q=Alpha',
        );

        const scoreChart = page.getByRole('region', { name: 'Score comparison' });
        await expect(scoreChart).toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole('heading', { name: 'Evidence and methodology', level: 2 })).toHaveCount(1);
        await expect(page.locator('.leaderboard-results .leaderboard-evidence')).toHaveCount(0);
        await expect(page.locator('.leaderboard-evidence-panel .leaderboard-evidence')).toHaveCount(1);
        await expect(page.locator('.leaderboard-cover-image')).toHaveCount(0);

        const sectionPositions = await page.locator('.leaderboard-page').evaluate((leaderboardPage) => [
          '.leaderboard-hero',
          '.leaderboard-score-chart-panel',
          '.leaderboard-filter-panel',
          'section[aria-label="Coding benchmark results"]',
          '.leaderboard-evidence-panel',
        ].map((selector) => Array.from(leaderboardPage.children).findIndex((child) => child.matches(selector))));
        expect(sectionPositions.every((position) => position >= 0)).toBe(true);
        expect(sectionPositions).toEqual([...sectionPositions].sort((left, right) => left - right));

        // The chart replaces the panel that restated the table's top three rows.
        // It stays a labeled, non-empty SVG at every breakpoint.
        const chartSvg = scoreChart.locator('svg.score-bar-chart');
        await expect(chartSvg).toHaveAttribute('role', 'img');
        await expect(chartSvg).toHaveAttribute('aria-label', /score by model/i);
        expect(await chartSvg.locator('rect.visx-bar').count()).toBeGreaterThan(0);

        const provider = width < 1024
          ? page.locator('.leaderboard-card-list .leaderboard-provider').first()
          : page.locator('.leaderboard-desktop-table .leaderboard-provider').first();
        await expect(provider).toContainText('OpenAI');
        await expect(provider.locator('.provider-mark')).toHaveCount(1);
        await assertNoHorizontalOverflow(page);
      }
    }
  });

  test('keeps stale, empty, and unavailable leaderboard states explicit', async ({ page }) => {
    const origin = previewOrigin();
    await page.addInitScript(() => window.localStorage.clear());
    const openCodingState = async (value: unknown, status = 200) => {
      await page.unrouteAll();
      await blockExternalRequests(page, origin);
      await stubBenchmarkDirectory(page, origin, decisionSummaryEnvelope());
      await stubLeaderboard(page, origin, 'llm-coding', value, status);
      await page.goto('/leaderboards/llm/coding/');
    };

    await page.setViewportSize({ width: 375, height: 1000 });
    await openCodingState(staleCodingLeaderboard());
    await expect(page.getByRole('status')).toContainText('Stale benchmark data', { timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Retry benchmark refresh' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Coding benchmark cards' })).toBeVisible();
    await expect(page.locator('footer[aria-label="Published leaderboard evidence"]')).toContainText('Stale');

    await openCodingState(emptyCodingLeaderboard());
    await expect(page.getByText('No published entries match these filters')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('form', { name: 'Leaderboard filters' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Providers' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'OpenAI' })).toBeVisible();
    await expect(page.locator('footer[aria-label="Published leaderboard evidence"]')).toBeVisible();

    await openCodingState({ error: 'Published benchmark data is unavailable.' }, 503);
    const unavailable = page.getByRole('region', { name: 'Coding benchmark results' }).getByRole('status');
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
    await stubBenchmarkDirectory(page, origin, decisionSummaryEnvelope());
    await stubLeaderboard(page, origin, 'llm-coding', readyCodingLeaderboard());
    await page.setViewportSize({ width: 1024, height: 1000 });

    for (const theme of ['dark', 'light'] as const) {
      await setStoredTheme(page, theme);
      await page.goto('/');
      for (const [path, name] of [
        ['/', 'Compare models'],
        ['/leaderboards/llm/coding/', 'Talk to MonoMind'],
      ] as const) {
        await page.goto(path);
        const cta = path === '/'
          ? page.locator('.home-hero-actions').getByRole('link', { name, exact: true })
          : page.getByRole('link', { name, exact: true });
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
      const menu = page.getByRole('button', { name: 'Open navigation' });
      if (await menu.isVisible()) {
        await menu.focus();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('button', { name: 'Close navigation' })).toHaveAttribute('aria-expanded', 'true');
      }
      await expect(page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Guides', exact: true })).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('link', { name: 'Powered by MonoMind AI Lab' })).toHaveAttribute('href', 'https://monomind.one/');
      await expect(page.getByRole('link', { name: 'Sources', exact: true })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Data sources', exact: true })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Methodology' })).toHaveAttribute('href', '/methodology/benchalign/');
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
    ['/leaderboards/llm/overall/', 'Overall benchmarks'],
    ['/leaderboards/llm/coding/', 'Coding benchmark'],
    ['/leaderboards/llm/agentic/', 'Agentic performance'],
    ['/leaderboards/llm/human-preference/', 'Human preference'],
    ['/leaderboards/llm/value/', 'Value frontier'],
    ['/leaderboards/llm/pricing-context/', 'Pricing and context'],
    ['/leaderboards/multimodal/vision-documents/', 'Multimodal'],
    ['/leaderboards/media/text-to-image/', 'Text to image'],
    ['/leaderboards/media/image-editing/', 'Image editing'],
    ['/leaderboards/media/text-to-video/', 'Text to video'],
    ['/leaderboards/media/image-to-video/', 'Image to video'],
    ['/leaderboards/media/video-editing/', 'Video editing'],
  ] as const;

  test('ships a raw crawlable compare hub, then mounts its active-revision directory without external requests', async ({ page, request, baseURL }) => {
    await page.setViewportSize({ width: 1024, height: 1000 });
    if (!baseURL) throw new Error('Playwright baseURL is required for origin-scoped route stubs.');
    const rawResponse = await request.get('/compare/');
    const rawHtml = await rawResponse.text();
    expect(rawResponse.ok()).toBe(true);
    expect(rawHtml).toContain('class="app-shell static-page-shell"');
    expect(rawHtml).toContain('<h1>Compare models<br/> side by side</h1>');

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
    await expect(page.getByRole('heading', { name: 'Compare models side by side', level: 1 })).toBeVisible();
    await expect(page.getByText(/Published revision:/)).toHaveCount(0);
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
  test('navigation does not mark Subscribe vs API as the current page for the tools directory', async ({ browser, page }) => {
    const origin = previewOrigin();
    const staticContext = await browser.newContext({ baseURL: origin, javaScriptEnabled: false });
    const staticPage = await staticContext.newPage();
    try {
      await blockExternalRequests(staticPage, origin);
      await staticPage.goto('/tools/');
      await expect(staticPage.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Subscribe vs API', exact: true })).not.toHaveAttribute('aria-current', 'page');
    } finally {
      await staticContext.close();
    }

    await page.setViewportSize({ width: 1024, height: 1000 });
    await blockExternalRequests(page);
    await page.goto('/tools/');

    await expect(page.locator('.tools-page')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Subscribe vs API', exact: true })).not.toHaveAttribute('aria-current', 'page');
  });

  test('navigation exposes the seven approved destinations on compact Home', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 1000 });
    await blockExternalRequests(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Transparent AI Costs. Verified Benchmarks.', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Open navigation' }).click();
    const navigation = page.getByRole('navigation', { name: 'Primary navigation' });
    await expect(navigation).toBeVisible();
    expect(await navigation.getByRole('link').allTextContents()).toEqual([
      'Home',
      'Subscribe vs API',
      'Price vs Performance',
      'Models',
      'Compare',
      'Leaderboards',
      'Guides',
    ]);
    await expect(navigation.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('aria-current', 'page');
    await assertNoHorizontalOverflow(page);
  });

  test('keeps the ready Home decision snapshot responsive and overflow-safe', async ({ page }) => {
    const origin = previewOrigin();
    await blockExternalRequests(page, origin);
    await stubBenchmarkDirectory(page, origin, decisionSummaryEnvelope());

    for (const viewport of [
      { width: 1440, height: 1000, columns: { snapshot: 3, capabilities: 5 } },
      { width: 375, height: 1000, columns: { snapshot: 1, capabilities: 1 } },
      { width: 320, height: 1000, columns: { snapshot: 1, capabilities: 1 } },
    ] as const) {
      await page.setViewportSize(viewport);
      for (const theme of ['dark', 'light'] as const) {
        await setStoredTheme(page, theme);
        await page.goto('/', { waitUntil: 'domcontentloaded' });

        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.getByRole('heading', { name: 'Transparent AI Costs. Verified Benchmarks.', level: 1 })).toBeVisible();
        const heroActions = page.locator('.home-hero-actions');
        await expect(heroActions.getByRole('link', { name: 'Compare models', exact: true })).toHaveAttribute('href', '/compare/');
        await expect(heroActions.getByRole('link', { name: 'Review Your Subscriptions', exact: true })).toHaveAttribute('href', '/tools/subscriptions-vs-apis/');
        await expect(heroActions.getByRole('link', { name: 'Browse leaderboards', exact: true })).toHaveAttribute('href', '/leaderboards/');
        await expect(page.getByRole('heading', { name: 'MonoMind AI Lab', level: 2 })).toBeVisible();

        const snapshot = page.getByRole('region', { name: 'Market at a glance' });
        await expect(snapshot.getByText('Browser Model 1', { exact: true })).toHaveCount(5);
        await expect(snapshot.getByText('Source published')).toHaveCount(0);
        await expect(snapshot.getByText('Checked')).toHaveCount(0);
        await expect(snapshot.getByRole('link', { name: 'Data from BenchLM.ai' })).toHaveCount(0);
        await expect(snapshot.getByRole('link', { name: 'Catalog and pricing data from OpenRouter' })).toHaveCount(0);

        await expect(page.getByText('Benchmark signals', { exact: true })).toHaveCount(0);
        await expect(page.getByRole('group', { name: 'TokenBench decision workflow' })).toHaveCount(0);
        const columns = await page.evaluate(() => {
          const countColumns = (selector: string) => {
            const element = document.querySelector(selector);
            if (!element) throw new Error(`Missing ${selector}`);
            return getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length;
          };
          return {
            snapshot: countColumns('.home-snapshot-grid'),
            capabilities: countColumns('[aria-label="TokenBench product capabilities"]'),
          };
        });
        expect(columns).toEqual(viewport.columns);
        await assertNoHorizontalOverflow(page);
        await assertFirstViewportOmitsInternalRevisions(page);
      }
    }
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

test.describe('responsive compare hub coverage', () => {
  test('keeps the approved compare hub readable at 320 and 1440 in both themes', async ({ page }) => {
    const origin = previewOrigin();
    await blockExternalRequests(page, origin);
    await stubBenchmarkDirectory(page, origin, comparisonDirectoryEnvelope());

    for (const viewport of [
      { width: 320, layout: 'compact' },
      { width: 1440, layout: 'wide' },
    ] as const) {
      await page.setViewportSize({ width: viewport.width, height: 1000 });
      for (const theme of ['dark', 'light'] as const) {
        await setStoredTheme(page, theme);
        await page.goto('/compare/', { waitUntil: 'domcontentloaded' });

        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.locator('.app-shell')).toHaveAttribute('data-layout', viewport.layout);
        await expect(page.locator('.comparison-hub-page')).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Compare models side by side', level: 1 })).toBeVisible();
        await expect(page.getByText('Choose two models to compare benchmark performance, API pricing, context limits, and evidence coverage.')).toBeVisible();
        await expect(page.getByText(/Published revision:/)).toHaveCount(0);
        await assertNoHorizontalOverflow(page);
      }
    }
  });
});

test.describe('newsletter and alerts browser coverage', () => {
  test('keeps the footer signup consentful, keyboard-submittable, loading-aware, and overflow-safe at mobile and desktop widths', async ({ page }) => {
    test.setTimeout(120_000);
    const origin = previewOrigin();

    for (const width of [320, 1440]) {
      await page.unrouteAll();
      await page.setViewportSize({ width, height: 1000 });
      await blockExternalRequests(page, origin);
      await stubNewsletterSignup(page, origin, [{
        status: 202,
        body: { status: 'confirmation-required' },
        delayMs: 200,
      }]);
      await page.goto('/', { waitUntil: 'domcontentloaded' });

      const footer = page.getByRole('contentinfo');
      await footer.scrollIntoViewIfNeeded();
      const alerts = footer.getByRole('checkbox', { name: /new models are added/i });
      const form = footer.getByRole('form', { name: 'Newsletter signup' });
      const firstName = footer.getByLabel('First name');
      const company = footer.getByLabel('Company');
      const email = footer.getByLabel('Email address');
      const submit = footer.getByRole('button', { name: 'Download Free Cheatsheet' });

      await expect(alerts).not.toBeChecked();
      await firstName.fill('Ada');
      await company.fill('Analytical Engines');
      await email.fill('builder@example.com');
      await email.press('Enter');
      await expect(form).toHaveAttribute('aria-busy', 'true');
      await expect(submit).toBeDisabled();
      await expect(form.getByRole('status')).toHaveText('Check your email to confirm your subscription.');
      await expect(email).toHaveValue('');
      await assertNoHorizontalOverflow(page);
    }
  });

  test('keeps compact compare alerts opt-in, keyboard submission, confirmation, retry guidance, and layout safe at mobile and desktop widths', async ({ page }) => {
    test.setTimeout(120_000);
    const origin = previewOrigin();

    for (const width of [320, 1440]) {
      await page.unrouteAll();
      await page.setViewportSize({ width, height: 1000 });
      await blockExternalRequests(page, origin);
      await stubBenchmarkDirectory(page, origin, comparisonDirectoryEnvelope());
      await stubNewsletterSignup(page, origin, [
        { status: 202, body: { status: 'confirmation-required' } },
        { status: 503, body: { status: 'temporarily-unavailable' } },
      ]);
      await page.goto('/compare/', { waitUntil: 'domcontentloaded' });

      const alertsPanel = page.getByRole('complementary', { name: 'Model and price alerts' });
      await alertsPanel.scrollIntoViewIfNeeded();
      const alerts = alertsPanel.getByRole('checkbox', { name: /new models are added/i });
      await expect(alerts).not.toBeChecked();
      await expect(alertsPanel.getByRole('form', { name: 'Newsletter signup' })).toHaveCount(0);
      await alerts.focus();
      await page.keyboard.press('Space');

      const form = alertsPanel.getByRole('form', { name: 'Newsletter signup' });
      const firstName = alertsPanel.getByLabel('First name');
      const company = alertsPanel.getByLabel('Company');
      const email = alertsPanel.getByLabel('Email address');
      const submit = alertsPanel.getByRole('button', { name: 'Notify me' });
      await expect(form).toBeVisible();
      await firstName.fill('Ada');
      await company.fill('Analytical Engines');
      await email.fill('builder@example.com');
      await email.press('Enter');
      await expect(form.getByRole('status')).toHaveText('Check your email to confirm your subscription.');

      await firstName.fill('Ada');
      await company.fill('Analytical Engines');
      await email.fill('builder@example.com');
      await email.press('Enter');
      await expect(form.getByRole('alert')).toHaveText('We couldn’t complete that signup. Please try again.');
      await expect(email).toHaveValue('builder@example.com');
      await expect(submit).toBeEnabled();
      await assertNoHorizontalOverflow(page);
    }
  });
});

interface ComparisonFixtureMetric {
  readonly sourceArtifactId: string;
}

interface ComparisonFixtureMetricRow {
  readonly metricKey: string;
  readonly sourceId: string;
  readonly unit: string;
  readonly methodology: string;
  readonly modelA: ComparisonFixtureMetric | null;
  readonly modelB: ComparisonFixtureMetric | null;
}

interface ComparisonFixturePayload {
  readonly metricRows: readonly ComparisonFixtureMetricRow[];
  readonly relatedPairs: readonly {
    readonly pairSlug: string;
    readonly sharedMetricCount: number;
  }[];
  readonly attribution: readonly {
    readonly sourceId: string;
    readonly artifactId: string;
  }[];
}

async function comparisonFixturePayload(page: Page): Promise<ComparisonFixturePayload> {
  const payload = await comparisonInitialPayload(page);
  return payload as ComparisonFixturePayload;
}

async function comparisonInitialPayload(page: Page): Promise<unknown> {
  const payload = await page.locator('#comparison-initial-data').textContent();
  if (!payload) throw new Error('Comparison fixture did not expose its SSR hydration payload.');
  return JSON.parse(payload) as unknown;
}

test.describe('release 2 confirmation and test cheatsheet delivery', () => {
  const confirmationPath = '/newsletter/confirmed/';
  const confirmationCanonicalUrl = 'https://tokenbench.monomind.one/newsletter/confirmed/';

  test('renders the confirmation page with exactly one Start Exploring action and no shell chrome', async ({ page }) => {
    const origin = previewOrigin();
    await blockExternalRequests(page, origin);
    await stubStaticPageThirdPartyAssets(page);

    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(confirmationPath);

      await expect(page.getByRole('heading', { name: 'Your subscription is confirmed.', level: 1 })).toBeVisible();
      const links = page.getByRole('link');
      await expect(links).toHaveCount(1);
      await expect(links.first()).toHaveAccessibleName('Start Exploring');
      await expect(links.first()).toHaveAttribute('href', '/');
      await expect(page.getByRole('button')).toHaveCount(0);
      await expect(page.getByRole('navigation')).toHaveCount(0);
      await expect(page.locator('.top-header')).toHaveCount(0);
      await expect(page.locator('.app-footer')).toHaveCount(0);
      await expect(page.locator('main')).toHaveCount(1);
      await assertNoHorizontalOverflow(page);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex,follow/);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', confirmationCanonicalUrl);
    }
  });

  test('serves the versioned blank test cheatsheet as a deterministic application/pdf asset', async ({ page }) => {
    const origin = previewOrigin();
    const response = await page.request.get(`${origin}/downloads/tokenbench-cheatsheet-test-v1.pdf`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type'] ?? '').toContain('application/pdf');
    const bytes = await response.body();
    expect(Array.from(bytes)).toEqual(Array.from(buildBlankTestCheatsheetPdf()));
  });

  test('keeps the confirmation route from exposing a second main or navigation after hydration', async ({ page }) => {
    await blockExternalRequests(page);
    await page.goto(confirmationPath);

    await expect(page.getByRole('heading', { name: 'Your subscription is confirmed.', level: 1 })).toBeVisible();
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.getByRole('link')).toHaveCount(1);
    await expect(page.locator('.static-page-shell')).toHaveCount(0);
  });
});

test.describe('handler-backed compare browser coverage', () => {
  test('runs the shared migration bootstrap in a non-hydrated comparison error shell', async ({ page }) => {
    const origin = previewOrigin();
    const errorPath = '/_fixture/comparison-theme-error';
    await page.route(origin + errorPath, (route) => route.fulfill({
      status: 503,
      contentType: 'text/html',
      body: `<!doctype html><html lang="en" data-theme="dark"><head>${themeBootstrapMarkup()}</head><body><main>Comparison temporarily unavailable</main></body></html>`,
    }));

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.setItem('tokenbench:theme', 'dark'));
    await page.goto(errorPath, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('tokenbench:theme'))).toBeNull();

    await page.evaluate(() => {
      localStorage.setItem('tokenbench:theme', 'dark');
      localStorage.setItem('tokenbench:theme:explicit', 'true');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('tokenbench:theme'))).toBe('dark');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('tokenbench:theme:explicit'))).toBe('true');
  });

  test('hydrates a handler comparison from a blank document', async ({ page }) => {
    const origin = previewOrigin();
    const errors = captureBrowserErrors(page);
    await page.setViewportSize({ width: 320, height: 1000 });
    await blockExternalRequests(page, origin);
    const assetMode = handlerBackedAssetMode();
    await stubHandlerBackedComparison(page, origin, { assetMode });

    const sourceEntryResponse = assetMode === 'vite-source'
      ? page.waitForResponse((response) => response.url() === `${origin}/src/main.tsx`)
      : null;
    await page.goto(HANDLER_COMPARISON_PATH, { waitUntil: 'networkidle' });
    if (sourceEntryResponse) await sourceEntryResponse;

    await assertInteractiveHandlerComparison(page);
    expect(errors.failedRequests).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
  });

  test('passes handler fixture asset requests through for an unrelated document', async ({ page }) => {
    const origin = previewOrigin();
    const unrelatedDocumentPath = '/_fixture/unrelated-handler-assets';
    const errors = captureBrowserErrors(page);
    await page.setViewportSize({ width: 320, height: 1000 });
    await blockExternalRequests(page, origin);
    await page.route(origin + '/assets/main.js*', (route) => {
      if (new URL(route.request().frame().url()).pathname !== unrelatedDocumentPath) return route.fallback();
      return route.fulfill({
        contentType: 'application/javascript',
        body: 'document.documentElement.dataset.fixtureMainAsset = "passed";',
      });
    });
    await page.route(origin + '/assets/tokenbench.css*', (route) => {
      if (new URL(route.request().frame().url()).pathname !== unrelatedDocumentPath) return route.fallback();
      return route.fulfill({
        contentType: 'text/css',
        body: ':root { --fixture-handler-css: passed; }',
      });
    });
    await page.route(origin + '/src/index.css', (route) => {
      if (new URL(route.request().frame().url()).pathname !== unrelatedDocumentPath) return route.fallback();
      return route.fulfill({
        contentType: 'application/javascript',
        body: 'document.documentElement.dataset.fixtureSourceAsset = "passed";',
      });
    });
    await page.route(origin + unrelatedDocumentPath, (route) => route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><head><link rel="stylesheet" href="/assets/tokenbench.css"></head><body><main>Unrelated asset fixture</main><script type="module" src="/assets/main.js"></script><script type="module" src="/src/index.css"></script></body></html>`,
    }));
    await stubHandlerBackedComparison(page, origin, { assetMode: handlerBackedAssetMode() });

    await page.goto(HANDLER_COMPARISON_PATH, { waitUntil: 'networkidle' });
    await assertInteractiveHandlerComparison(page);
    await page.goto(unrelatedDocumentPath, { waitUntil: 'networkidle' });

    await expect(page.locator('html')).toHaveAttribute('data-fixture-main-asset', 'passed');
    await expect(page.locator('html')).toHaveAttribute('data-fixture-source-asset', 'passed');
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--fixture-handler-css').trim()))
      .toBe('passed');
    expect(errors.failedRequests).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
  });

  test('hydrates a handler comparison after a compare-hub document', async ({ page }) => {
    const origin = previewOrigin();
    const errors = captureBrowserErrors(page);
    await page.setViewportSize({ width: 320, height: 1000 });
    await blockExternalRequests(page, origin);
    await stubStaticPageThirdPartyAssets(page);
    await stubHandlerBackedComparison(page, origin, { assetMode: handlerBackedAssetMode() });

    const directoryResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/benchmarks' && response.status() === 200);
    await page.goto('/compare/', { waitUntil: 'domcontentloaded' });
    await directoryResponse;
    await expect(page.getByRole('heading', { name: 'Choose a model pair' })).toBeVisible();
    const expectedStrictModeAbort = `${origin}/api/benchmarks (net::ERR_ABORTED)`;
    expect(errors.failedRequests.every((failure) => failure === expectedStrictModeAbort)).toBe(true);
    expect(errors.failedRequests.length).toBeLessThanOrEqual(1);
    errors.failedRequests.length = 0;
    await page.goto(HANDLER_COMPARISON_PATH, { waitUntil: 'networkidle' });

    await assertInteractiveHandlerComparison(page);
    expect(errors.failedRequests).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
  });

  test('hydrates a sparse handler comparison after a dense handler document', async ({ page }) => {
    const origin = previewOrigin();
    const errors = captureBrowserErrors(page);
    await page.setViewportSize({ width: 320, height: 1000 });
    await blockExternalRequests(page, origin);
    await stubHandlerBackedComparison(page, origin, { assetMode: handlerBackedAssetMode() });

    await page.goto(HANDLER_COMPARISON_PATH, { waitUntil: 'networkidle' });
    await assertInteractiveHandlerComparison(page);
    await page.goto(HANDLER_SPARSE_COMPARISON_PATH, { waitUntil: 'networkidle' });

    await assertInteractiveHandlerComparison(page);
    await expect(page.getByRole('heading', { name: 'Canvas vs Alpha', level: 1 })).toBeVisible();
    expect(errors.failedRequests).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
  });

  test('renders a dense server comparison document with only eligible radar axes before hydration', async ({ browser }) => {
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
      await expect(page.getByRole('heading', { name: 'Evidence highlights', level: 2 })).toHaveCount(0);
      await expect(page.getByRole('img', { name: 'Alpha and Beta shared metric radar' })).toBeVisible();
      const radarTable = page.getByRole('table', { name: 'Radar chart data' });
      await expect(radarTable).toBeVisible();
      expect(await radarTable.getByRole('rowheader').allTextContents()).toEqual([
        'Agentic',
        'Coding',
        'Overall',
        'Reasoning',
      ]);
      await expect(page.getByRole('table', { name: 'Source metric comparison' }).getByRole('rowheader', { name: 'Coding' })).toBeVisible();
      await expect(page.getByRole('table', { name: 'Route pricing and context comparison' }).getByRole('row', { name: /Verification status/ })).toHaveCount(0);
      await expect(page.locator('.comparison-provenance')).toHaveCount(1);
      await expect(page.getByRole('button', { name: 'Share result', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Workload view' })).toHaveCount(0);
      await expect(page.getByText(/Published revision:/)).toHaveCount(0);
      await expect(page.locator('.comparison-model-heading img.provider-mark')).toHaveCount(0);
      await expect(page.locator('.comparison-model-heading .provider-mark-fallback')).toHaveCount(2);
      expect(await page.getByRole('table', { name: 'Source metric comparison' }).locator('thead th').allTextContents()).toEqual([
        'Metric',
        'Unit',
        'Alpha',
        'Beta',
      ]);
      const rootText = await page.locator('#root').innerText();
      expect(rootText).not.toContain('benchlm:category:coding');
      expect(rootText).not.toContain('browser-benchmark-r1');
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://tokenbench.monomind.one/compare/alpha-vs-beta');
    } finally {
      await context.close();
    }
  });

  test('keeps source-faithful sparse compare metadata aligned with its ruled detail fallback', async ({ browser }) => {
    const origin = previewOrigin();
    const context = await browser.newContext({ baseURL: origin, javaScriptEnabled: false });
    const page = await context.newPage();
    try {
      await blockExternalRequests(page, origin);
      await stubHandlerBackedComparison(page, origin, { assetMode: handlerBackedAssetMode() });

      await page.goto(HANDLER_COMPARISON_PATH);
      const densePayload = await comparisonFixturePayload(page);
      const sparseMetadata = densePayload.relatedPairs.find((pair) => pair.pairSlug === 'canvas-vs-alpha');
      expect(sparseMetadata).toBeDefined();

      await page.goto(HANDLER_SPARSE_COMPARISON_PATH);
      const sparsePayload = await comparisonFixturePayload(page);
      const sharedRows = sparsePayload.metricRows.filter((row) => row.modelA !== null && row.modelB !== null);
      expect(sharedRows).toHaveLength(sparseMetadata?.sharedMetricCount ?? -1);
      expect(sharedRows.map((row) => row.metricKey)).toEqual([
        'lmarena:text_style_control:overall',
        'lmarena:text_to_image:overall',
      ]);
      expect(sharedRows.every((row) => row.sourceId === 'lmarena'
        && row.unit === 'arena_score'
        && row.methodology === 'bradley_terry'
        && row.modelA?.sourceArtifactId === row.modelB?.sourceArtifactId)).toBe(true);
      expect(sparsePayload.attribution.some((source) => source.sourceId === 'lmarena'
        && source.artifactId === 'text-to-image')).toBe(true);
      expect(sharedRows.length).toBeLessThan(3);
      await expect(page.getByRole('heading', { name: 'Canvas vs Alpha', level: 1 })).toBeVisible();
      await expect(page.getByRole('img', { name: /shared metric radar/i })).toHaveCount(0);
      const fallback = page.locator('.comparison-radar-fallback');
      await expect(fallback).toBeVisible();
      await expect(fallback.getByRole('heading', { name: 'Comparable metric detail', level: 3 })).toBeVisible();
      expect(await fallback.evaluate((element) => getComputedStyle(element).borderTopStyle)).toBe('dashed');
      await expect(fallback).toContainText('Text To Image');
      await expect(page.getByRole('heading', { name: 'Workload view' })).toHaveCount(0);
      await expect(page.getByText(/Published revision:/)).toHaveCount(0);
      await assertNoHorizontalOverflow(page);
    } finally {
      await context.close();
    }
  });

  test('hydrates dense and sparse SSR comparisons across themes, routes, and target viewports without runtime errors', async ({ page }) => {
    test.setTimeout(120_000);
    const origin = previewOrigin();
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: (text: string) => {
            localStorage.setItem('tokenbench:browser-test-clipboard', text);
            return Promise.resolve();
          },
        },
      });
    });
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
    await expect(page.getByText(/Published revision:/)).toHaveCount(0);
    await expect(page.locator('.comparison-provenance')).toHaveCount(1);
    await expect(page.getByRole('img', { name: 'Alpha and Beta shared metric radar' })).toBeVisible();
    const pricingTable = page.getByRole('table', { name: 'Route pricing and context comparison' });
    const inputPrice = pricingTable.getByRole('row', { name: /Input API price/ });
    const alphaRouteVerification = page.locator('.comparison-route-picker').filter({ has: page.getByLabel('Alpha pricing route') }).locator('.comparison-route-verification');
    const highlights = page.getByRole('heading', { name: 'Key implications', level: 2 }).locator('xpath=ancestor::section[1]');
    const inputPriceHighlight = highlights.getByText(/^Input API price:/);
    await expect(inputPrice).toContainText('$0.5');
    await expect(alphaRouteVerification).toContainText('Primary source');
    await expect(inputPriceHighlight).toContainText('Alpha has the lower verified rate');

    await page.getByLabel('Alpha pricing route').selectOption('openrouter:provider:alpha');

    await expect(inputPrice).toContainText('$2');
    await expect(inputPriceHighlight).toContainText('Beta has the lower verified rate');
    await expect(inputPriceHighlight).not.toContainText('Alpha has the lower verified rate');
    await expect(page.getByRole('heading', { name: 'Evidence provenance' }).locator('xpath=ancestor::section[1]')).toContainText('Alpha — route openrouter:provider:alpha · source openrouter · provider openrouter');
    if (process.env.VITE_BRANDFETCH_CLIENT_ID) {
      await expect(page.locator('.comparison-model-heading img.provider-mark')).toHaveCount(2);
    }

    await page.getByRole('combobox', { name: 'Second model' }).fill('canvas');
    await page.getByRole('combobox', { name: 'Second model' }).press('ArrowDown');
    await page.getByRole('combobox', { name: 'Second model' }).press('Enter');
    const sparseLink = page.getByRole('link', { name: 'View selected comparison', exact: true });
    const sparseDevEntryResponse = handlerBackedAssetMode() === 'vite-source'
      ? page.waitForResponse((response) => response.url() === `${origin}/src/main.tsx`
        && response.request().resourceType() === 'script'
        && response.request().frame() === page.mainFrame())
      : null;
    await expect(sparseLink).toHaveAttribute('href', HANDLER_SPARSE_COMPARISON_PATH);
    await Promise.all([
      page.waitForURL(`**${HANDLER_SPARSE_COMPARISON_PATH}`),
      sparseLink.click(),
    ]);
    const sparseViewModel = parseComparisonViewModel(await comparisonInitialPayload(page));
    expect(sparseViewModel).not.toBeNull();
    expect(sparseViewModel?.canonicalPath).toBe(HANDLER_SPARSE_COMPARISON_PATH);
    if (sparseDevEntryResponse) await sparseDevEntryResponse;
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.comparison-detail-page')).toHaveAttribute('data-client-hydrated', 'true');
    await expect(page.getByRole('heading', { name: 'Canvas vs Alpha', level: 1 })).toBeVisible();
    await expect(page.getByRole('img', { name: /shared metric radar/i })).toHaveCount(0);
    await expect(page.locator('.comparison-radar-fallback')).toBeVisible();
    await assertNoHorizontalOverflow(page);

    for (const viewport of [{ width: 1440, height: 1000 }, { width: 320, height: 1000 }]) {
      await page.setViewportSize(viewport);
      for (const theme of ['dark', 'light'] as const) {
        await setStoredTheme(page, theme);
        await page.goto(HANDLER_COMPARISON_PATH, { waitUntil: 'networkidle' });
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.locator('.comparison-detail-page')).toHaveAttribute('data-client-hydrated', 'true');
        await expect(page.getByRole('img', { name: 'Alpha and Beta shared metric radar' })).toBeVisible();
        const shareAction = page.getByRole('button', { name: 'Share result', exact: true });
        await expect(shareAction).toBeVisible();
        const shareBounds = await shareAction.evaluate((element) => element.getBoundingClientRect().toJSON());
        expect(shareBounds.width).toBeGreaterThanOrEqual(44);
        expect(shareBounds.height).toBeGreaterThanOrEqual(44);
        await shareAction.click();
        await page.locator('.share-action').getByRole('button', { name: 'Copy link' }).click();
        await expect(page.locator('.share-action').getByRole('status')).toContainText('Link copied to clipboard.');
        await assertNoHorizontalOverflow(page);

        await page.goto(HANDLER_SPARSE_COMPARISON_PATH, { waitUntil: 'networkidle' });
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.locator('.comparison-detail-page')).toHaveAttribute('data-client-hydrated', 'true');
        await expect(page.getByRole('img', { name: /shared metric radar/i })).toHaveCount(0);
        await expect(page.locator('.comparison-radar-fallback')).toBeVisible();
        await assertNoHorizontalOverflow(page);
      }
    }

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});

test.describe('viewport and theme hydration matrix', () => {
  test('waits for the handler comparison hydration entry before completing document readiness', async ({ page }) => {
    const origin = previewOrigin();
    const hydrationEntryPath = handlerBackedAssetMode() === 'vite-source' ? '/src/main.tsx' : '/assets/main.js';
    await blockExternalRequests(page, origin);
    await stubHandlerBackedComparison(page, origin, { assetMode: handlerBackedAssetMode() });

    let markHydrationEntryRequested: (() => void) | undefined;
    const hydrationEntryRequested = new Promise<void>((resolve) => {
      markHydrationEntryRequested = resolve;
    });
    let releaseHydrationEntry: (() => void) | undefined;
    const hydrationEntryReleased = new Promise<void>((resolve) => {
      releaseHydrationEntry = resolve;
    });
    await page.route(origin + hydrationEntryPath + '*', async (route) => {
      markHydrationEntryRequested?.();
      await hydrationEntryReleased;
      await route.continue();
    });

    const navigation = page.goto(HANDLER_COMPARISON_PATH, { waitUntil: 'domcontentloaded' });
    await hydrationEntryRequested;
    try {
      const readiness = await Promise.race([
        navigation.then(() => 'ready' as const),
        new Promise<'waiting'>((resolve) => setTimeout(() => resolve('waiting'), 250)),
      ]);
      expect(readiness).toBe('waiting');
    } finally {
      releaseHydrationEntry?.();
    }

    await navigation;
    await expect(page.locator('.comparison-detail-page')).toHaveAttribute('data-client-hydrated', 'true');
  });

  for (const viewport of viewports) {
    test(`keeps every primary route semantic and overflow-safe at ${viewport.width}px across both themes`, async ({ page }) => {
      // Twenty route/theme cells run in each viewport test. The 75s budget is
      // 2s per observed steady-state cell plus 35s for the initial full app
      // load and Vite's first-transform work. A stuck cell is still bounded to
      // 15s (and its navigation to 10s), so this cannot hide a broken route.
      test.setTimeout(HYDRATION_MATRIX_VIEWPORT_TIMEOUT_MS);
      const startedAt = Date.now();
      const completedCells: Array<{ readonly theme: Theme; readonly path: string; readonly elapsedMs: number }> = [];
      let activeCell: { readonly theme: Theme; readonly path: string; readonly startedAt: number } | undefined;

      try {
        const catalogFixture = await installInteractiveRouteStubs(page);
        page.setDefaultNavigationTimeout(HYDRATION_MATRIX_NAVIGATION_TIMEOUT_MS);
        await page.setViewportSize({ width: viewport.width, height: 1000 });

        for (const theme of hydrationThemes) {
          for (const route of hydrationMatrix) {
            activeCell = { theme, path: route.path, startedAt: Date.now() };
            const cell = activeCell;
            await test.step(`viewport=${viewport.width}px theme=${theme} path=${route.path}`, async () => {
              await setStoredTheme(page, theme);
              const catalogDelivery = route.path === CALCULATOR_PATH ? catalogFixture.expectNextDelivery() : undefined;
              await page.goto(route.path, { waitUntil: 'domcontentloaded', timeout: HYDRATION_MATRIX_NAVIGATION_TIMEOUT_MS });
              if (catalogDelivery) await catalogDelivery;
              await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
              await assertHydratedRouteFrame(page, route);
              if (route.path === '/compare/') await assertCompareHubPickerInteractive(page);
              if (viewport.width < 768) await assertCompactMenuPresence(page);
            }, { timeout: HYDRATION_MATRIX_CELL_TIMEOUT_MS });
            completedCells.push({ theme, path: route.path, elapsedMs: Date.now() - cell.startedAt });
            activeCell = undefined;
          }
        }
      } catch (error) {
        const active = activeCell ? {
          viewport: viewport.width,
          theme: activeCell.theme,
          path: activeCell.path,
          elapsedMs: Date.now() - activeCell.startedAt,
        } : { viewport: viewport.width, phase: 'fixture setup', elapsedMs: Date.now() - startedAt };
        const diagnostic = {
          active,
          completedCells,
          elapsedMs: Date.now() - startedAt,
          viewportBudgetMs: HYDRATION_MATRIX_VIEWPORT_TIMEOUT_MS,
          cellBudgetMs: HYDRATION_MATRIX_CELL_TIMEOUT_MS,
          navigationBudgetMs: HYDRATION_MATRIX_NAVIGATION_TIMEOUT_MS,
        };
        try {
          await test.info().attach('hydration-matrix-failure.json', { body: JSON.stringify(diagnostic, null, 2), contentType: 'application/json' });
        } catch {
          // Preserve the original browser failure when Playwright has already
          // closed the page or exhausted the surrounding test deadline.
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Hydration matrix failed at ${JSON.stringify(active)}: ${message}`);
      }
    });
  }
});

test.describe('keyboard and chart accessibility regressions', () => {
  test('moves focus to the home main landmark when the skip link is activated', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1000 });
    await blockExternalRequests(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Transparent AI Costs. Verified Benchmarks.', level: 1 })).toBeVisible();

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

    // The default message-level workload derives 2M directional tokens and a
    // $7 direct-provider API-equivalent cost. Assert the rendered current bar
    // and matching result card before reading the accessible description.
    const currentColumn = page.locator('.chart-column-current');
    const apiEquivalentMetric = page.locator('.value-metric').filter({
      has: page.getByRole('heading', { name: 'API-equivalent monthly cost', exact: true }),
    });
    await expect(currentColumn.locator('.chart-bar')).toHaveAttribute('title', '2.0M: $7.00');
    await expect(currentColumn.locator(':scope > span').last()).toHaveText('2.0M');
    await expect(apiEquivalentMetric).toHaveCount(1);
    await expect(apiEquivalentMetric.locator('strong')).toHaveText('$7.00');
    await expect(chart).toHaveAttribute('aria-label', 'API-equivalent value trend by monthly tokens. Current workload: 2.0M tokens and $7.00 API-equivalent value.');
  });
});
