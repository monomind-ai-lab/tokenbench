# Articles Mega-Menu Channels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the `ui-revamp-3` preview Articles mega menu, article tabs, query parameters, and empty News state on one plural channel contract.

**Architecture:** Keep the existing vanilla preview shell and article index. Update the shared mega-menu markup in `common.js`, make the article document's tab and card channel values plural, and derive valid query values from the rendered tabs in `articles.js` so navigation and filtering cannot drift.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, Vite, Vitest, Playwright, Cloudflare Pages.

## Global Constraints

- Modify and deploy only the `ui-revamp-3` branch preview screens.
- Do not change production pages or production routing.
- Use exactly `All`, `Guides`, `Insights`, and `News` as channel labels.
- Use `/articles`, `/articles?channel=guides`, `/articles?channel=insights`, and `/articles?channel=news` as destinations.
- News must use the existing empty-result treatment until News content exists.
- Do not redesign the mega-menu layout or create News articles.

---

### Task 1: Synchronize preview article navigation and filtering

**Files:**

- Modify: `browser-tests/responsive-browser.ts`
- Modify: `prototypes/ui-revamp-3/common.js`
- Modify: `prototypes/ui-revamp-3/articles.html`
- Modify: `prototypes/ui-revamp-3/articles.js`

**Interfaces:**

- Consumes: existing `setupShell()`, article tab markup, `data-channel` card values, and the `channel` URL parameter.
- Produces: plural channel values `guides | insights | news`, a four-link Articles mega menu, and a directly addressable zero-result News tab.

- [ ] **Step 1: Write the failing browser regression**

Add a Playwright test that opens the Articles mega menu and asserts the exact labels, subtitle, and literal destinations. Then navigate directly to every channel URL and assert the selected tab, result count, News empty state, plural URL updates after a tab click, and no captured browser errors.

```ts
test('keeps the Articles mega menu and index tabs on one channel contract', async ({ page }) => {
  const errors = captureBrowserErrors(page);
  await page.route('https://cdn.jsdelivr.net/**', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.Chart=class Chart{static getChart(){return null}destroy(){}update(){}};',
  }));
  await page.goto('/models');
  await page.getByRole('button', { name: 'Articles' }).click();
  const menu = page.getByRole('region', { name: 'Articles' });
  await expect(menu.getByText('Everything about AI models')).toBeVisible();
  for (const [label, href] of [
    ['All', '/articles'],
    ['Guides', '/articles?channel=guides'],
    ['Insights', '/articles?channel=insights'],
    ['News', '/articles?channel=news'],
  ] as const) {
    await expect(menu.getByRole('link', { name: label, exact: true })).toHaveAttribute('href', href);
  }

  for (const scenario of [
    { url: '/articles', tab: 'All', count: '8 articles shown', empty: false },
    { url: '/articles?channel=guides', tab: 'Guides', count: '6 articles shown', empty: false },
    { url: '/articles?channel=insights', tab: 'Insights', count: '2 articles shown', empty: false },
    { url: '/articles?channel=news', tab: 'News', count: '0 articles shown', empty: true },
  ] as const) {
    await page.goto(scenario.url);
    await expect(page.getByRole('tab', { name: new RegExp(`^${scenario.tab}`) })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText(scenario.count, { exact: true })).toBeVisible();
    if (scenario.empty) await expect(page.locator('#article-empty')).toBeVisible();
    else await expect(page.locator('#article-empty')).toBeHidden();
  }

  await page.goto('/articles');
  await page.getByRole('tab', { name: /^Insights/ }).click();
  await expect(page).toHaveURL(/\/articles\?channel=insights$/u);
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
});
```

- [ ] **Step 2: Run the regression and verify it fails for missing menu channels**

Run:

```bash
TOKENBENCH_BROWSER_ASSET_MODE=production npx playwright test --config=playwright.production.config.ts browser-tests/responsive-browser.ts --grep "Articles mega menu and index tabs"
```

Expected: FAIL because the mega menu still contains `All articles` and `Hybrid model routing`, its subtitle is `Decision-oriented research`, and the article index has no News tab or plural channel values.

- [ ] **Step 3: Implement the shared mega-menu contract**

Replace the Articles mega-menu subtitle and destination markup in `common.js` with the four approved links:

```js
<div class="mega-section-head"><h2>Articles</h2><span>Everything about AI models</span></div>
<div class="mega-destinations">
  <a href="${PREVIEW_PATHS.articles}"><strong>All</strong></a>
  <a href="${PREVIEW_PATHS.articles}?channel=guides"><strong>Guides</strong></a>
  <a href="${PREVIEW_PATHS.articles}?channel=insights"><strong>Insights</strong></a>
  <a href="${PREVIEW_PATHS.articles}?channel=news"><strong>News</strong></a>
</div>
```

- [ ] **Step 4: Implement plural article tabs and card channels**

Update `articles.html` so the tab labels and values are `All`, `Guides`, `Insights`, and `News`; add a News tab with count `0`; change guide cards to `data-channel="guides"`; and change insight cards to `data-channel="insights"`.

```html
<button role="tab" data-channel="all">All <span>8</span></button>
<button role="tab" data-channel="guides">Guides <span>6</span></button>
<button role="tab" data-channel="insights">Insights <span>2</span></button>
<button role="tab" data-channel="news">News <span>0</span></button>
```

- [ ] **Step 5: Derive valid URL channels from the tabs**

In `articles.js`, remove the singular allowlist and use the rendered tab values as the source of truth:

```js
const channelFromUrl = new URLSearchParams(location.search).get('channel');
const validChannels = new Set(tabs.map(tab => tab.dataset.channel));
if (channelFromUrl && validChannels.has(channelFromUrl)) state.channel = channelFromUrl;
```

Retain the existing click, keyboard, URL-update, filter, and empty-state behavior.

- [ ] **Step 6: Run focused tests and verify the behavior passes**

Run:

```bash
TOKENBENCH_BROWSER_ASSET_MODE=production npx playwright test --config=playwright.production.config.ts browser-tests/responsive-browser.ts --grep "Articles mega menu and index tabs"
npm run lint
npm run build
```

Expected: the focused browser regression, TypeScript check, and production build all pass.

- [ ] **Step 7: Run the full regression suite**

Run:

```bash
npm test
```

Expected: all Vitest files and tests pass without failures.

- [ ] **Step 8: Commit the implementation**

```bash
git add browser-tests/responsive-browser.ts prototypes/ui-revamp-3/common.js prototypes/ui-revamp-3/articles.html prototypes/ui-revamp-3/articles.js
git commit -m "Align preview article channel navigation"
```

### Task 2: Deploy and verify the `ui-revamp-3` preview

**Files:**

- No source files changed.

**Interfaces:**

- Consumes: the verified `dist` bundle and `ui-revamp-3` branch.
- Produces: updated stable and immutable Cloudflare Pages previews.

- [ ] **Step 1: Push the preview branch**

```bash
git push origin ui-revamp-3
```

- [ ] **Step 2: Deploy only the preview branch bundle**

```bash
npx wrangler pages deploy dist --project-name=tokenbench --branch=ui-revamp-3
```

Record the immutable deployment URL and stable `ui-revamp-3` alias returned by Wrangler.

- [ ] **Step 3: Verify the deployed preview**

On both deployment origins, verify the Articles mega menu subtitle and destinations, direct-load each channel URL, confirm the expected selected tab/count/News empty state, and inspect browser logs for console or page errors.

- [ ] **Step 4: Confirm repository and deployment state**

```bash
git status --short --branch
git log -3 --oneline --decorate
```

Expected: `ui-revamp-3` is clean and synchronized with `origin/ui-revamp-3`; no production branch or production deployment is modified.
