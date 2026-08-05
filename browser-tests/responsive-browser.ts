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
  await page.goto('/tools/subscriptions-vs-apis/');
  if (expectCalculator) await expect(page.getByRole('heading', { name: /API[- ]equivalent value/i })).toBeVisible({ timeout: 15_000 });
}

function codingLeaderboardEnvelope() {
  const checkedAt = '2026-08-05T12:00:00.000Z';
  const metric = {
    modelKey: 'model-a',
    metricKey: 'benchlm:category:coding',
    category: 'coding',
    value: 83.2,
    rank: null,
    lower: null,
    upper: null,
    voteCount: null,
    unit: 'score',
    sourceId: 'benchlm',
    sourceUpdatedAt: checkedAt,
    sourceModelId: 'model-a',
    sourceArtifactId: 'benchlm-models',
    rankingEligible: true,
    methodology: 'benchlm_raw_composite',
    observationCount: null,
    sessionCount: null,
  };
  return {
    revision: 'published-revision-1',
    publishedAt: checkedAt,
    freshness: { status: 'fresh', checkedAt },
    attribution: [{
      sourceId: 'benchlm',
      label: 'Data from BenchLM.ai',
      url: 'https://benchlm.ai/data',
      updatedAt: checkedAt,
    }],
    data: {
      key: 'llm-coding',
      profile: 'balanced',
      definition: {
        kind: 'benchlm',
        sourceId: 'benchlm',
        metricKeys: ['benchlm:category:coding'],
        defaultSort: 'score-desc',
      },
      entries: [{
        model: {
          modelKey: 'model-a',
          slug: 'model-a',
          name: 'Model A',
          creator: 'Provider A',
          sourceType: 'Proprietary',
          reasoningType: null,
          releaseDate: null,
          contextWindowTokens: null,
          evidenceStatus: 'supported',
          rankingEligible: true,
          confidenceLower: null,
          confidenceUpper: null,
          benchmarkCount: 1,
          sourceId: 'benchlm',
          sourceModelId: 'model-a',
          sourceArtifactId: 'benchlm-models',
        },
        metric,
        metrics: [{ ...metric }],
        primaryPrice: null,
        blendedCostPerMillion: null,
        contextWindowTokens: null,
        sourceRank: null,
        onValueFrontier: false,
      }],
    },
  };
}

function comparisonDirectoryEnvelope() {
  const checkedAt = '2026-08-05T12:00:00.000Z';
  return {
    revision: 'published-revision-1',
    publishedAt: checkedAt,
    freshness: { status: 'fresh', checkedAt },
    attribution: [],
    data: {
      compareDirectory: {
        models: [
          { slug: 'model-a', name: 'Model A', creator: 'Provider A', sourceType: 'Proprietary', evidenceStatus: 'supported', metricCategories: ['coding'] },
          { slug: 'model-b', name: 'Model B', creator: 'Provider B', sourceType: 'Proprietary', evidenceStatus: 'supported', metricCategories: ['coding'] },
        ],
        indexablePairs: [{ pairSlug: 'model-a-vs-model-b', modelASlug: 'model-a', modelBSlug: 'model-b', featuredRank: 1, sharedMetricCount: 2 }],
      },
    },
  };
}

async function openCodingLeaderboard(page: Page) {
  await page.route('https://*/*', (route) => route.abort());
  await page.route(/http:\/\/127\.0\.0\.1:4173\/api\/benchmarks\/leaderboards\/llm-coding\?.*/, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(codingLeaderboardEnvelope()),
  }));
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
      const banner = document.createElement('div');
      banner.className = 'VIpgJd-ZVi9od-ORHb-OEVmcd';
      document.body.style.top = '40px';
      document.body.prepend(banner);
    });
    await expect.poll(() => page.locator('.VIpgJd-ZVi9od-ORHb-OEVmcd').evaluateAll((elements) => (
      elements.length > 0 && elements.every((element) => getComputedStyle(element).display === 'none')
    ))).toBe(true);
    await expect.poll(() => page.evaluate(() => ({
      top: document.body.style.getPropertyValue('top'),
      priority: document.body.style.getPropertyPriority('top'),
    }))).toEqual({ top: '0px', priority: 'important' });
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
    await page.route('https://*/*', (route) => route.abort());
    await page.route('http://127.0.0.1:4173/api/catalog', async (route) => {
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
});

test.describe('guides browser harness', () => {
  for (const width of [320, 768, 1440]) {
    test(`${width}px guide hub stays readable without horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.route('https://*/*', (route) => route.abort());
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
    await page.route('https://*/*', (route) => route.abort());
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
    await page.route('https://*/*', (route) => route.abort());
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
    ['/leaderboards/', 'AI model leaderboards'],
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
    await expect(page.getByText('Published revision: published-revision-1')).toBeVisible();
    await page.getByRole('combobox', { name: 'First model' }).fill('model-a');
    await page.getByRole('combobox', { name: 'Second model' }).fill('model-b');
    await expect(page.getByRole('link', { name: 'Compare selected models' })).toHaveAttribute('href', '/compare/model-a-vs-model-b');
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
    await page.route('https://*/*', (route) => route.abort());
    const shellResponse = await request.get('/compare/');
    const shellHtml = await shellResponse.text();

    for (const pathname of ['/compare/model-a-vs-model-b', '/not-a-tokenbench-route']) {
      const url = `http://127.0.0.1:4173${pathname}`;
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
    await page.route('https://*/*', (route) => route.abort());

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
    await page.route('https://*/*', (route) => route.abort());
    await page.goto('/tools/');

    await expect(page.locator('.static-page-shell')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'AI cost decision tools', level: 1 })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Available TokenBench tools' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open subscription vs. API calculator' })).toHaveAttribute('href', '/tools/subscriptions-vs-apis/');
  });
});
