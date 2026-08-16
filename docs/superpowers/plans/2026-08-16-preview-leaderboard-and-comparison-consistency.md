# Preview Leaderboard and Comparison Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved terminology, theme-contrast, insight, quick-comparison, and dedicated comparison-page refinements on the `ui-revamp-3` preview without changing production.

**Architecture:** Preserve the current React implementation for Popular Models and the prototype implementation for Models, Make it yours, and `/compare`. Share the quick-comparison behavior contract through the existing selection/picker utilities and matching token-based layout rules, while keeping `/compare` as a separate result composition. Add behavior-first unit, source-contract, and Playwright coverage before each production edit.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, vanilla JavaScript prototype pages, Chart.js 4, Playwright, Cloudflare Pages.

## Global Constraints

- Work only in the active `ui-revamp-3` worktree on branch `ui-revamp-3`.
- Do not deploy or modify production.
- Use only existing TokenBench design tokens, `color-mix()`, and the established 32px spacing value; add no hardcoded hexadecimal colors.
- Change model-vendor wording to Provider/Providers only in visible UI, accessible copy, and exports; keep internal `organization` fields and ordinary editorial uses unchanged.
- Keep `/compare` visually distinct from reusable quick-comparison panels.
- Preserve 44px interactive targets, native disclosure semantics, keyboard focus, 320px support, and light/dark themes.
- Follow red-green-refactor for every behavior change and commit each task independently.
- Do not copy temporary browser-comment marker attributes into source.

---

## File map

### Popular Models React surface

- `src/frontend/popular-models/controls.tsx` — visible provider filter and toggle copy; internal organization state remains intact.
- `src/frontend/popular-models/leaderboard.tsx` — visible Provider heading and existing filtering/sorting output.
- `src/frontend/popular-models/insights.tsx` — accessible provider language, exact-data disclosure summaries, and chart legend spacing configuration.
- `src/frontend/popular-models/model-picker.tsx` — visible provider-aware model-search copy.
- `src/frontend/popular-models/comparison-workspace.tsx` — reusable quick-comparison arrangement and link construction.
- `src/pages/popular-models-page.tsx` — Provider CSV heading and comparison clear callback.
- `src/pages/popular-models-page.test.tsx` — React behavior tests for terminology, disclosure, and quick comparison.
- `src/index.css` — top-five contrast, table-header alignment, disclosure markers, insight spacing, and React quick-comparison layout.

### Prototype surfaces

- `prototypes/ui-revamp-3/common.js` — shared preview URL builder and existing picker/chip helpers.
- `prototypes/ui-revamp-3/index.html` — Models workbench quick-comparison structure and actions.
- `prototypes/ui-revamp-3/make-it-yours.html` — weighted insight markup and quick-comparison action slots.
- `prototypes/ui-revamp-3/make-it-yours.js` — default list state, synchronized weighted insights, exports, and quick-comparison behavior.
- `prototypes/ui-revamp-3/compare.html` — dedicated comparison result composition and copy.
- `prototypes/ui-revamp-3/styles.css` — prototype quick-comparison, chart, disclosure, and dedicated comparison layout rules.

### Regression coverage

- `scripts/make-it-yours-preview.test.ts` — built-bundle/source contract checks for the prototype files.
- `scripts/preview-navigation-links.test.ts` — slashless preview comparison-destination contract.
- `browser-tests/responsive-browser.ts` — real interaction, dark-theme contrast, route reliability, desktop/mobile layout, and console checks.

---

### Task 1: Popular Models terminology, contrast, table alignment, and insight disclosure

**Files:**
- Modify: `src/pages/popular-models-page.test.tsx:1-100`
- Modify: `browser-tests/responsive-browser.ts` in the existing `ui-revamp-3` preview coverage
- Modify: `src/frontend/popular-models/controls.tsx:28-161`
- Modify: `src/frontend/popular-models/leaderboard.tsx:143-264`
- Modify: `src/frontend/popular-models/insights.tsx:381-418`
- Modify: `src/frontend/popular-models/model-picker.tsx:70-125`
- Modify: `src/pages/popular-models-page.tsx:13-41`
- Modify: `src/index.css:1320-1435` and `src/index.css:1725-1770`

**Interfaces:**
- Consumes: existing `PopularModelFixture.organization`, `selectedOrganizations`, `showOrganization`, Chart.js configuration objects, and `.popular-models-score-top-five`.
- Produces: Provider/Providers visible copy, unchanged organization-backed filtering, `summary::after` disclosure markers, token-based top-five border/fill, and vertically centered header controls.

- [ ] **Step 1: Add failing React and browser assertions**

Add this behavior to `src/pages/popular-models-page.test.tsx`:

```tsx
it('uses provider terminology while filtering the existing organization field', () => {
  render(<PopularModelsPage />);
  expect(screen.getByRole('button', { name: 'Providers' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Show provider' })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Provider' })).toBeInTheDocument();
  expect(screen.queryByText('Organization')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Providers' }));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search providers' }), { target: { value: 'Anthropic' } });
  fireEvent.click(screen.getByRole('button', { name: 'Anthropic' }));
  expect(screen.getByText(/models shown/)).toBeInTheDocument();
});

it('keeps exact insight tables as native disclosures', () => {
  render(<PopularModelsPage />);
  const disclosure = screen.getByText('Exact quality and cost values').closest('details');
  expect(disclosure).not.toHaveAttribute('open');
  fireEvent.click(screen.getByText('Exact quality and cost values'));
  expect(disclosure).toHaveAttribute('open');
  expect(within(disclosure!).getByRole('columnheader', { name: 'Provider' })).toBeInTheDocument();
});
```

Add a Playwright test that sets dark theme, opens `/popular-models/`, and asserts `.popular-models-score-top-five` has a different background from its panel, a 1px nontransparent border, readable text, and that all `.popular-models-desktop-table thead th` cells compute to `vertical-align: middle`.

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
npm test -- src/pages/popular-models-page.test.tsx
npm run build
npx playwright test --config=playwright.production.config.ts browser-tests/responsive-browser.ts -g "Popular Models terminology and contrast"
```

Expected: the React test fails on Providers/Search providers/Show provider, and the browser test fails on the missing border or header middle alignment.

- [ ] **Step 3: Implement the minimal visible-copy and token changes**

Keep internal prop/state names intact and change only rendered strings. In the leaderboard and exact tables, render `Provider`. In the export rows, use `Provider`. Change the chart label to `Quality versus cost scatter plot with model providers and a value frontier`.

Add token-based styling:

```css
.popular-models-desktop-table thead th,
.popular-models-desktop-table thead .popular-models-sort-button { vertical-align: middle; }
.popular-models-chart-data > summary::after { content: '▼'; margin-left: auto; color: var(--muted); }
.popular-models-chart-data[open] > summary::after { content: '▲'; }
.app-shell[data-surface='leaderboard-workbench'] .popular-models-score-top-five {
  border: 1px solid color-mix(in srgb, var(--primary) 58%, var(--outline));
  background: color-mix(in srgb, var(--primary) 24%, var(--surface-high));
  color: var(--primary-strong);
}
```

Increase the chart/legend separation through the Chart.js configuration using the approved 32px spacing value; do not move the disclosure instead of the legend.

- [ ] **Step 4: Re-run focused tests and verify GREEN**

```bash
npm test -- src/pages/popular-models-page.test.tsx
npm run build
npx playwright test --config=playwright.production.config.ts browser-tests/responsive-browser.ts -g "Popular Models terminology and contrast"
```

Expected: PASS with provider-backed filtering still returning fixture models and visible dark-theme top-five separation.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/frontend/popular-models/controls.tsx src/frontend/popular-models/leaderboard.tsx src/frontend/popular-models/insights.tsx src/frontend/popular-models/model-picker.tsx src/pages/popular-models-page.tsx src/pages/popular-models-page.test.tsx src/index.css browser-tests/responsive-browser.ts
git commit -m "Refine popular models terminology and contrast"
```

---

### Task 2: Reusable quick-comparison contract outside `/compare`

**Files:**
- Modify: `src/pages/popular-models-page.test.tsx:1-110`
- Modify: `browser-tests/responsive-browser.ts` in Models, Make it yours, and Popular Models coverage
- Modify: `src/frontend/popular-models/comparison-workspace.tsx:1-120`
- Modify: `src/frontend/popular-models/insights.tsx:215-435`
- Modify: `prototypes/ui-revamp-3/common.js:1-493`
- Modify: `prototypes/ui-revamp-3/index.html:2-103`
- Modify: `prototypes/ui-revamp-3/make-it-yours.html:105-128`
- Modify: `prototypes/ui-revamp-3/make-it-yours.js:167-219`
- Modify: `src/index.css:1395-1527`
- Modify: `prototypes/ui-revamp-3/styles.css` in `.compare-tray`, `.models-compare-tray`, and radar rules

**Interfaces:**
- Consumes: `selectedModelChips(models)`, `bindComparisonRemovals(root, onRemove)`, `mountModelPicker(root, options)`, `normalizeModelIds(ids)`, and existing React `PopularModelPicker`.
- Produces: `previewComparisonHref(modelIds: readonly string[]): string` in React and `previewComparisonHref(modelIds)` in `common.js`; quick-comparison heading, top-right clear, inline Add a model, bottom-left More details, and centered radar with 32px legend gap.

- [ ] **Step 1: Add failing quick-comparison tests**

Extend the React test:

```tsx
it('uses the reusable quick comparison action order', () => {
  render(<PopularModelsPage />);
  const workspace = screen.getByRole('region', { name: 'Quick comparison' });
  expect(within(workspace).getByRole('heading', { name: 'Quick comparison' })).toBeInTheDocument();
  expect(within(workspace).getByRole('button', { name: 'clear' })).toBeInTheDocument();
  expect(within(workspace).getByRole('button', { name: 'Add a model' })).toBeInTheDocument();
  expect(within(workspace).getByRole('link', { name: 'More details' })).toHaveAttribute('href', '/compare?models=claude-opus-4-1%2Cgpt-5');
});
```

Add Playwright assertions on `/models`, `/make-it-yours/`, and `/popular-models/` for the Quick comparison region, top-right clear, inline Add a model, bottom-left More details query link, selected-pill order, radar centering, and 320px overflow safety.

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
npm test -- src/pages/popular-models-page.test.tsx
npm run build
npx playwright test --config=playwright.production.config.ts browser-tests/responsive-browser.ts -g "reuses quick comparison"
```

Expected: failures show old headings, action positions, and missing More details destinations.

- [ ] **Step 3: Implement the shared contract with thin adapters**

Add identical URL builders without changing internal model identifiers:

```ts
function previewComparisonHref(modelIds: readonly string[]): string {
  return `/compare?${new URLSearchParams({ models: modelIds.join(',') })}`;
}
```

```js
function previewComparisonHref(modelIds){
  return `${PREVIEW_PATHS.compare}?${new URLSearchParams({models:normalizeModelIds(modelIds).join(',')})}`;
}
```

In every non-`/compare` workspace, render **Quick comparison**, place clear in the section header, place the picker immediately after selected chips, place **More details** in a bottom-left footer row, keep models-as-columns, and center the radar with the approved 32px legend gap.

For React, add `onClear: () => void` to `PopularModelComparisonWorkspace` and pass `() => setSelectedModelIds([])` from `PopularInsightsSection`. Keep the two default models and four-model maximum.

- [ ] **Step 4: Re-run focused tests and verify GREEN**

```bash
npm test -- src/pages/popular-models-page.test.tsx
npm run build
npx playwright test --config=playwright.production.config.ts browser-tests/responsive-browser.ts -g "reuses quick comparison"
```

Expected: PASS at desktop and 320px, with selected model order preserved in the query URL.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/frontend/popular-models/comparison-workspace.tsx src/frontend/popular-models/insights.tsx src/pages/popular-models-page.test.tsx src/index.css prototypes/ui-revamp-3/common.js prototypes/ui-revamp-3/index.html prototypes/ui-revamp-3/make-it-yours.html prototypes/ui-revamp-3/make-it-yours.js prototypes/ui-revamp-3/styles.css browser-tests/responsive-browser.ts
git commit -m "Unify preview quick comparison panels"
```

---

### Task 3: Make it yours list default and weighted score insights

**Files:**
- Modify: `scripts/make-it-yours-preview.test.ts:1-70`
- Modify: `browser-tests/responsive-browser.ts` in `ui-revamp-3 Make it yours controls`
- Modify: `prototypes/ui-revamp-3/make-it-yours.html:70-139`
- Modify: `prototypes/ui-revamp-3/make-it-yours.js:1-562`
- Modify: `prototypes/ui-revamp-3/styles.css` in leaderboard analysis, chart, and responsive rules

**Interfaces:**
- Consumes: `score(model)`, `visibleModels`, `meetsSla(model)`, `shareUrl()`, `downloadBlob(blob, filename)`, `colors()`, and Chart.js.
- Produces: initial `view = 'rows'`, `weightedFrontier(models)`, synchronized `renderWeightedInsights(models)`, exact weighted-score/cost tables, and section-specific link/PNG/CSV actions.

- [ ] **Step 1: Add failing build and browser tests**

Add source-contract assertions:

```ts
const script = await readFile('prototypes/ui-revamp-3/make-it-yours.js', 'utf8');
expect(script).toContain("let view = 'rows';");
expect(script).toContain('function weightedFrontier(models)');
expect(script).toContain('function renderWeightedInsights(models)');
```

Add browser assertions that list view is pressed on first load, the ranked table is visible, the **Weighted score vs. cost** heading and both charts exist, opening **Exact weighted score and cost values** reveals a table, and changing a weight updates its displayed score:

```ts
await page.goto('/make-it-yours/');
await expect(page.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true');
await expect(page.getByRole('region', { name: 'Ranked model evidence' })).toBeVisible();
await expect(page.getByRole('heading', { name: 'Weighted score vs. cost' })).toBeVisible();
await expect(page.getByRole('img', { name: /Weighted score versus blended cost/ })).toBeVisible();
const disclosure = page.getByText('Exact weighted score and cost values').locator('..');
await disclosure.click();
await expect(disclosure.getByRole('table')).toBeVisible();
```

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
npm test -- scripts/make-it-yours-preview.test.ts
npm run build
npx playwright test --config=playwright.production.config.ts browser-tests/responsive-browser.ts -g "weighted score insights"
```

Expected: failures show card view remains selected and insight markup/functions are absent.

- [ ] **Step 3: Implement weighted insights from current visible state**

Set `let view = 'rows';` before `parseSharedState()` while retaining explicit `?view=cards`. Add a two-panel section immediately after `.leaderboard-analysis-grid` with the heading **Weighted score vs. cost**, a scatter panel, cost-ranking panel, exact-data disclosures, and copy/PNG/CSV actions.

Implement `weightedFrontier(models)` by sorting ascending on `model.cost` and retaining each model whose `score(model)` exceeds the best score already seen. `renderWeightedInsights(visibleModels)` must:

- use logarithmic blended `$ / 1M` cost on X and current `score(model)` on Y;
- draw the frontier and sort the cost list cheapest-first;
- render exact tables from the same `visibleModels` array;
- destroy stale Chart instances when results are empty;
- update on weights, access/provider filters, SLA state, thresholds, and added models;
- navigate chart selections to `/model-profile?model=<encoded id>`;
- keep exact tables usable when Chart.js is unavailable;
- export only the current weighted insight result set.

Use this deterministic frontier core:

```js
function weightedFrontier(models) {
  let bestScore = Number.NEGATIVE_INFINITY;
  return [...models]
    .sort((left, right) => left.cost - right.cost)
    .filter(model => {
      const currentScore = score(model);
      if (currentScore <= bestScore) return false;
      bestScore = currentScore;
      return true;
    });
}
```

- [ ] **Step 4: Re-run focused tests and verify GREEN**

```bash
npm test -- scripts/make-it-yours-preview.test.ts
npm run build
npx playwright test --config=playwright.production.config.ts browser-tests/responsive-browser.ts -g "weighted score insights"
```

Expected: PASS with list view selected initially and exact values changing after state updates.

- [ ] **Step 5: Commit Task 3**

```bash
git add prototypes/ui-revamp-3/make-it-yours.html prototypes/ui-revamp-3/make-it-yours.js prototypes/ui-revamp-3/styles.css scripts/make-it-yours-preview.test.ts browser-tests/responsive-browser.ts
git commit -m "Add weighted score cost insights"
```

---

### Task 4: Dedicated `/compare` layout and route reliability

**Files:**
- Modify: `scripts/preview-navigation-links.test.ts:1-55`
- Modify: `browser-tests/responsive-browser.ts` in preview navigation and prototype comparison coverage
- Modify: `prototypes/ui-revamp-3/compare.html:56-97` and inline `renderComparison()`
- Modify: `prototypes/ui-revamp-3/styles.css` in `.compare-result`, `.compare-radar`, and responsive rules
- Modify only if a failing navigation assertion identifies drift: `src/frontend/app-shell.tsx`, `src/seo/static-page.ts`, or `prototypes/ui-revamp-3/common.js`

**Interfaces:**
- Consumes: `PREVIEW_ROUTE_PATHS.compare === '/compare'`, `PREVIEW_PATHS.compare === '/compare'`, `persistSelection()`, `comparisonMatrix()`, and existing comparison charts.
- Produces: no catalog-back link, left centered radar, right visible exact capability table, lower Decision deltas section, preserved query parameters, and zero-loop route coverage.

- [ ] **Step 1: Add failing layout and route assertions**

Extend the navigation source test with `expect(shell).not.toContain("compare:'/compare/'");`. Add Playwright coverage:

```ts
for (const pathname of ['/compare', '/compare/', '/compare/?models=deepseek-v3%2Cllama-3-3-70b']) {
  const response = await page.goto(pathname, { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Compare models' })).toBeVisible();
}
await page.goto('/compare/?models=deepseek-v3%2Cllama-3-3-70b');
await expect(page.getByRole('link', { name: 'Back to model catalog →' })).toHaveCount(0);
await expect(page.locator('.compare-summary-grid > :nth-child(2)').getByRole('table', { name: 'Exact capability comparison' })).toBeVisible();
await expect(page.getByRole('heading', { name: 'Decision deltas' })).toBeVisible();
await expect(page.getByText('Tabulated specs for quick comparison.')).toBeVisible();
expect(new URL(page.url()).searchParams.get('models')).toBe('deepseek-v3,llama-3-3-70b');
```

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
npm test -- scripts/preview-navigation-links.test.ts
npm run build
npx playwright test --config=playwright.production.config.ts browser-tests/responsive-browser.ts -g "dedicated compare layout and route"
```

Expected: route status may pass as characterization; layout assertions fail. If every route assertion passes, do not add a redirect.

- [ ] **Step 3: Implement the dedicated layout without changing shared quick comparison**

Render the left panel with title, fixture copy, and centered radar only. Render the right panel with **Exact capability values** and the visible `#compare-capability-table`. Remove `#compare-deltas` output and the catalog-back link. Rename the later full-width section to **Decision deltas** and add `Tabulated specs for quick comparison.` immediately below the heading.

Use this result-grid structure:

```html
<div class="grid-2 compare-summary-grid">
  <div class="panel soft compare-radar-panel">
    <h3 class="subhead">Six-domain capability overlay</h3>
    <p class="fixture">Normalized fixture scores · identical axes</p>
    <div class="chart-wrap compare-radar-wrap"><canvas id="compare-radar" role="img" aria-label="Capability comparison radar"></canvas></div>
  </div>
  <div class="panel compare-capability-panel">
    <h3 class="subhead">Exact capability values</h3>
    <div id="compare-capability-table"></div>
  </div>
</div>
```

Apply the approved 32px legend/spiderweb spacing. Keep `persistSelection()` path- and query-preserving. Standardize only preview shell destinations that a failing test proves are not `/compare`; leave production `ROUTE_PATHS.compareHub` unchanged.

- [ ] **Step 4: Re-run focused tests and verify GREEN**

```bash
npm test -- scripts/preview-navigation-links.test.ts
npm run build
npx playwright test --config=playwright.production.config.ts browser-tests/responsive-browser.ts -g "dedicated compare layout and route"
```

Expected: PASS with no loop, no lost query, and the exact capability table visible in the right panel.

- [ ] **Step 5: Commit Task 4**

```bash
git add prototypes/ui-revamp-3/compare.html prototypes/ui-revamp-3/styles.css scripts/preview-navigation-links.test.ts browser-tests/responsive-browser.ts
git commit -m "Refine dedicated preview comparison layout"
```

Add a shell file to this commit only if it has a task-specific diff. Do not use `git add .`.

---

### Task 5: Full verification, bounded visual QA, and preview deployment

**Files:**
- Modify only if verification reveals a task-scoped defect: files already listed in Tasks 1-4.
- Inspect: `dist/`, stable preview, and immutable preview.

**Interfaces:**
- Consumes: all Task 1-4 behavior, tests, build output, and approved deployment command.
- Produces: verified commits on `ui-revamp-3`, one immutable preview deployment, and stable preview parity.

- [ ] **Step 1: Run focused and full automated verification**

```bash
npm test -- src/pages/popular-models-page.test.tsx scripts/make-it-yours-preview.test.ts scripts/preview-navigation-links.test.ts
npm run lint
npm run build
npm test
npm run test:browser:production
```

Expected: every command exits 0 with no new TypeScript, Vitest, build, Playwright, console, or overflow failure.

- [ ] **Step 2: Run the Impeccable detector exactly once**

```bash
node "$CODEX_HOME/skills/impeccable/scripts/detect.mjs" --json src/frontend/popular-models/controls.tsx src/frontend/popular-models/leaderboard.tsx src/frontend/popular-models/insights.tsx src/frontend/popular-models/comparison-workspace.tsx src/index.css prototypes/ui-revamp-3/index.html prototypes/ui-revamp-3/make-it-yours.html prototypes/ui-revamp-3/make-it-yours.js prototypes/ui-revamp-3/compare.html prototypes/ui-revamp-3/styles.css
```

Expected: no unresolved task-scoped accessibility, token, responsive, or interaction finding. Fix real findings once in one batch and re-run only affected automated tests; do not run the detector twice.

- [ ] **Step 3: Perform one bounded visual inspection pass**

Inspect built pages at 320×844, 768×1024, 1302×1324, and 1440×1000 in light and dark themes. Cover Popular Models provider copy/contrast/alignment/disclosures, all reusable quick-comparison panels, Make it yours list default/weighted insights, `/compare` table placement/copy/query stability, focus, console errors, and overflow. Collect defects before editing, fix once, and confirm once.

- [ ] **Step 4: Commit bounded QA corrections when needed**

Run `git diff --name-only`, confirm every changed file appears in the Task 1-4 file map, then stage only the task-scoped paths and commit:

```bash
git add src/frontend/popular-models/controls.tsx src/frontend/popular-models/leaderboard.tsx src/frontend/popular-models/insights.tsx src/frontend/popular-models/model-picker.tsx src/frontend/popular-models/comparison-workspace.tsx src/pages/popular-models-page.tsx src/pages/popular-models-page.test.tsx src/index.css prototypes/ui-revamp-3/common.js prototypes/ui-revamp-3/index.html prototypes/ui-revamp-3/make-it-yours.html prototypes/ui-revamp-3/make-it-yours.js prototypes/ui-revamp-3/compare.html prototypes/ui-revamp-3/styles.css scripts/make-it-yours-preview.test.ts scripts/preview-navigation-links.test.ts browser-tests/responsive-browser.ts
git commit -m "Polish preview leaderboard comparison flows"
```

If no files changed, record that no QA correction commit was needed.

- [ ] **Step 5: Deploy only the preview branch and verify both URLs**

```bash
npx wrangler pages deploy dist --project-name=tokenbench --branch=ui-revamp-3
```

Record the immutable URL. Verify it and `https://ui-revamp-3.tokenbench-27t.pages.dev` at `/models`, `/popular-models/`, `/make-it-yours/`, `/compare`, and `/compare/?models=deepseek-v3%2Cllama-3-3-70b`. Both must expose the same build; production remains untouched.

- [ ] **Step 6: Final repository audit and handoff**

```bash
git status --short --branch
git log --oneline --decorate -8
```

Expected: no uncommitted changes. Report tests, commits, stable/immutable URLs, and any residual risk.
