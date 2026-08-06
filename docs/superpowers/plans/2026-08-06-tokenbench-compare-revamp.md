# TokenBench Compare Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make model selection fast and comparison results immediately understandable while preserving source-faithful evidence, route-aware pricing, and canonical SSR pages.

**Architecture:** Keep the existing comparison directory API and Pages Function SSR contract. Add pure presentation derivations for friendly metric labels, summaries, radar eligibility, and price-route selection so server render and hydration use identical facts; reuse the foundation plan's provider and share primitives.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Cloudflare Pages Functions/D1, Vitest, Testing Library, SVG for the accessible radar.

## Global Constraints

- Remove the metric-category selector and internal revision metadata from the compare hub.
- Begin both pickers with useful popular models and preserve accessible combobox behavior.
- Never declare a universal winner or normalize heterogeneous raw units.
- Render a radar only with at least four compatible shared metrics.
- Prefer a verified direct-provider price route, then a verified routed provider.
- Missing pricing/context fields display “Not published.”
- Remove the comparison Workload view and repeated Source columns.
- Use one evidence-provenance disclosure and preserve canonical/noindex behavior.
- Reuse `ProviderMark` and `ShareAction` without modifying their public interfaces.

---

## File ownership

This plan owns:

- `src/pages/compare-hub-page.tsx`
- `src/pages/compare-hub-page.test.tsx`
- `src/frontend/model-pair-picker.tsx`, `src/frontend/model-pair-picker.test.tsx`
- `src/frontend/comparison-page.tsx`
- `src/frontend/comparison-page.test.tsx`
- `src/frontend/comparison-contracts.ts`, `src/frontend/comparison-contracts.test.ts`
- `src/frontend/comparison-summary.ts`, `src/frontend/comparison-summary.test.ts`
- `src/frontend/comparison-radar.tsx`, `src/frontend/comparison-radar.test.tsx`
- `src/benchmarks/comparison-pricing.ts`, `src/benchmarks/comparison-pricing.test.ts`
- `functions/compare/[pair].ts`, `functions/compare/[pair].test.ts`, `functions/compare/[pair].targeted.test.ts`
- Compare-specific portions of `src/index.css`
- Compare assertions in `browser-tests/responsive-browser.ts`

The Newsletter plan may later insert a separately owned
`ComparisonAlertSignup` component through a prop/import but must not rewrite the
picker or comparison result components.

### Task 1: Popular-model pair selection without category filtering

**Files:**
- Modify: `src/pages/compare-hub-page.tsx`
- Create: `src/pages/compare-hub-page.test.tsx`
- Create: `src/frontend/model-pair-picker.tsx`
- Create: `src/frontend/model-pair-picker.test.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `CompareDirectoryEnvelope`, `ProviderMark`
- Produces: `popularModels(models, pairs, limit): readonly DirectoryModel[]`
- Produces: reusable `ModelPairPicker` for the hub and result-page quick switching
- Preserves: canonical `comparisonPath(first, second, pairs)` behavior

- [ ] **Step 1: Write failing hub tests**

```ts
it('offers popular models immediately and omits internal metadata and category filters', async () => {
  render(<CompareHubPage />);
  expect(await screen.findByRole('heading', { name: 'Compare models side by side', level: 1 })).toBeInTheDocument();
  expect(screen.getByText('Choose two models to compare benchmark performance, API pricing, context limits, and evidence coverage.')).toBeInTheDocument();
  expect(screen.getByText('Step 1')).toBeInTheDocument();
  expect(screen.getByText('Step 2')).toBeInTheDocument();
  fireEvent.focus(screen.getAllByRole('combobox')[0]);
  expect((await screen.findAllByRole('option')).length).toBeGreaterThan(1);
  expect(screen.queryByLabelText('Metric category')).not.toBeInTheDocument();
  expect(screen.queryByText(/Published revision:/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/pages/compare-hub-page.test.tsx src/frontend/model-pair-picker.test.tsx`

Expected: FAIL on the old H1, empty-slug input experience, category selector, and revision text.

- [ ] **Step 3: Implement deterministic popular-model ordering**

```ts
export function popularModels(
  models: readonly DirectoryModel[],
  pairs: readonly DirectoryPair[],
  limit = 12,
): readonly DirectoryModel[] {
  const featured = new Map<string, number>();
  for (const pair of pairs) {
    const rank = pair.featuredRank ?? Number.MAX_SAFE_INTEGER;
    featured.set(pair.modelASlug, Math.min(featured.get(pair.modelASlug) ?? rank, rank));
    featured.set(pair.modelBSlug, Math.min(featured.get(pair.modelBSlug) ?? rank, rank));
  }
  return models.filter((model) => model.utilitySelectable).slice().sort((a, b) =>
    (featured.get(a.slug) ?? Number.MAX_SAFE_INTEGER) - (featured.get(b.slug) ?? Number.MAX_SAFE_INTEGER)
      || a.name.localeCompare(b.name)
      || a.slug.localeCompare(b.slug)).slice(0, limit);
}
```

Use popular rows as the unfiltered list and search all utility-selectable models
after the user types. Render provider mark, model/provider, evidence label, and
available context/representative price fields only when the envelope supplies
them. Do not fabricate absent directory fields; extend the API contract first if
the design needs a field. Use the exact approved header description from the
test and keep popular reviewed pairs as one-click shortcuts.
Keep the picker itself reusable and controlled so the result page can change
either model while preserving canonical `comparisonPath` rules.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/pages/compare-hub-page.test.tsx src/frontend/model-pair-picker.test.tsx`

Expected: PASS for keyboard selection, duplicate names, canonical pair URLs, popular pairs, and unavailable directory state.

- [ ] **Step 5: Commit the compare picker**

```bash
git add src/pages/compare-hub-page.tsx src/pages/compare-hub-page.test.tsx src/frontend/model-pair-picker.tsx src/frontend/model-pair-picker.test.tsx src/index.css
git commit -m "feat: simplify model pair selection"
```

### Task 2: Friendly metric labels and deterministic comparison summaries

**Files:**
- Create: `src/frontend/comparison-summary.ts`
- Create: `src/frontend/comparison-summary.test.ts`
- Modify: `src/frontend/comparison-contracts.ts`
- Modify: `src/frontend/comparison-contracts.test.ts`

**Interfaces:**
- Produces: `friendlyMetricLabel(metricKey: string, category: string): string`
- Produces: `comparisonSummary(viewModel: ComparisonViewModel): ComparisonSummary`
- `ComparisonSummary = { heading: string; sentences: readonly string[]; coverage: 'strong' | 'limited' | 'none' }`

- [ ] **Step 1: Write failing label and no-winner tests**

```ts
it('removes source prefixes from metric titles', () => {
  expect(friendlyMetricLabel('benchlm:category:coding', 'coding')).toBe('Coding');
  expect(friendlyMetricLabel('lmarena:text_style_control:overall', 'overall')).toBe('Overall');
});

it('does not name a winner when no compatible shared metric exists', () => {
  const summary = comparisonSummary(sparseComparisonViewModel());
  expect(summary.coverage).toBe('none');
  expect(summary.sentences.join(' ')).toMatch(/not enough shared evidence/i);
  expect(summary.sentences.join(' ')).not.toMatch(/wins|best model/i);
});

it.each([lmarenaSharedRows(), mismatchedSourceRows(), estimatedSharedRows()])(
  'does not turn non-BenchLM or incompatible evidence into a score winner', (rows) => {
    const summary = comparisonSummary(comparisonWithRows(rows));
    expect(summary.sentences.join(' ')).not.toMatch(/wins|higher capability|best model/i);
  },
);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/frontend/comparison-summary.test.ts src/frontend/comparison-contracts.test.ts`

Expected: FAIL because the pure derivation module does not exist.

- [ ] **Step 3: Implement summary precedence**

Build sentences in this order:

1. Higher supported BenchLM Overall/category score only when both sides share the exact metric key, source, unit, and methodology and both are ranking-eligible supported rows.
2. Lower verified input/output rate only when both selected routes publish the rate.
3. Larger published context window only when both facts exist.
4. Evidence-coverage caveat when fewer than four compatible shared metrics exist.

Cap output at four sentences. Prefix every advantage with “On [metric]” or the
specific pricing/context dimension; never imply a universal winner. Use
formatted model names and values from the view model; never introduce a model,
category, unit, price, or claim not present in the input. LMArena, runtime,
estimated, one-sided, source-mismatched, unit-mismatched, or methodology-mismatched
rows may be described as available evidence but cannot produce a BenchAlign
score-winner sentence.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/frontend/comparison-summary.test.ts src/frontend/comparison-contracts.test.ts`

Expected: PASS for strong, limited, none, price-only, context-only, and tied cases.

- [ ] **Step 5: Commit summary derivations**

```bash
git add src/frontend/comparison-summary.ts src/frontend/comparison-summary.test.ts src/frontend/comparison-contracts.ts src/frontend/comparison-contracts.test.ts
git commit -m "feat: summarize model comparisons"
```

### Task 3: Compatible-metric radar with accessible fallback

**Files:**
- Create: `src/frontend/comparison-radar.tsx`
- Create: `src/frontend/comparison-radar.test.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Produces: `radarAxes(rows: readonly ComparisonMetricRow[]): readonly RadarAxis[]`
- Produces: `ComparisonRadar({ modelAName, modelBName, rows })`
- `RadarAxis = { label: string; modelA: number; modelB: number; minimum: number; maximum: number }`

- [ ] **Step 1: Write failing eligibility and accessibility tests**

```ts
it('requires four shared same-unit same-methodology metrics', () => {
  expect(radarAxes(sharedMetricRows(3))).toEqual([]);
  expect(radarAxes(sharedMetricRows(4))).toHaveLength(4);
  expect(radarAxes([...sharedMetricRows(4), heterogeneousPriceRow()])).toHaveLength(4);
  expect(radarAxes(sharedMetricRows(4, { values: [145, 230] }))).toHaveLength(4);
});

it('renders a labelled SVG and equivalent table', () => {
  render(<ComparisonRadar modelAName="Alpha" modelBName="Beta" rows={sharedMetricRows(4)} />);
  expect(screen.getByRole('img', { name: 'Alpha and Beta shared metric radar' })).toBeInTheDocument();
  expect(screen.getByRole('table', { name: 'Radar chart data' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/frontend/comparison-radar.test.tsx`

Expected: FAIL because radar eligibility and SVG components are absent.

- [ ] **Step 3: Implement strict axes and deterministic SVG geometry**

Accept rows only when both measurements exist with the same metric key, source,
unit, and methodology, values are finite and non-negative, evidence is
supported/ranking-eligible, and the unit is `score`. Do not assume a 0-100 raw
scale: normalize the two values independently on each axis against that axis's
pair maximum while the adjacent table preserves exact raw values and units.
Caption the chart as a per-axis relative view, not a cross-metric normalized
score. Sort axes by friendly label then metric key. Return no axes when fewer
than four qualify. Use SVG polygons plus point markers and distinct dash
patterns; put the equivalent HTML table directly after the SVG.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/frontend/comparison-radar.test.tsx`

Expected: PASS for three/four axes, heterogeneous units, missing sides, deterministic order, keyboard-readable text, and reduced motion.

- [ ] **Step 5: Commit the radar**

```bash
git add src/frontend/comparison-radar.tsx src/frontend/comparison-radar.test.tsx src/index.css
git commit -m "feat: visualize compatible comparison evidence"
```

### Task 4: Verified comparison price-route selection

**Files:**
- Create: `src/benchmarks/comparison-pricing.ts`
- Create: `src/benchmarks/comparison-pricing.test.ts`
- Modify: `functions/compare/[pair].ts`
- Modify: `functions/compare/[pair].test.ts`
- Modify: `functions/compare/[pair].targeted.test.ts`
- Modify: `src/frontend/comparison-contracts.ts`
- Modify: `src/frontend/comparison-contracts.test.ts`

**Interfaces:**
- Produces: `comparisonPriceRoutes(modelKey, prices, sourcesByArtifactId): readonly BenchmarkPriceCheck[]`
- Produces: `defaultComparisonPriceRoute(modelKey, prices, sourcesByArtifactId): BenchmarkPriceCheck | null`
- View model exposes every verified route and its selected route ID per model.

- [ ] **Step 1: Write failing route-precedence and incomplete-price tests**

```ts
it('prefers a verified direct route without requiring both list rates', () => {
  const selected = defaultComparisonPriceRoute('provider:alpha', [
    price({ providerId: 'openrouter', routeId: 'openrouter:alpha', inputUsdPerMillion: 1, outputUsdPerMillion: 3 }),
    price({ providerId: 'provider', routeId: 'direct:alpha', inputUsdPerMillion: 2, outputUsdPerMillion: null }),
  ], sourcesByArtifactId());
  expect(selected?.routeId).toBe('direct:alpha');
  expect(selected?.outputUsdPerMillion).toBeNull();
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/benchmarks/comparison-pricing.test.ts functions/compare/'[pair]'.test.ts functions/compare/'[pair]'.targeted.test.ts`

Expected: FAIL because comparison pages currently rely on OpenRouter-only blended pricing.

- [ ] **Step 3: Implement route ordering and view-model projection**

Order eligible rows by:

1. `verificationStatus === 'primary'`
2. route/provider is not a known router (`openrouter`, `opencode_zen`; use the existing catalog enum rather than display labels)
3. most recent `BenchmarkSourceRecord.observedAt` resolved through `sourceArtifactId`
4. binary `routeId`

Reject a price row whose referenced source artifact is absent; do not invent a
timestamp on `BenchmarkPriceCheck`. Do not require cached, input, or output
prices to all exist. Include context,
max input/output, modalities, supported parameters, route, and verification
status in the comparison view model.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/benchmarks/comparison-pricing.test.ts src/frontend/comparison-contracts.test.ts functions/compare/'[pair]'.test.ts functions/compare/'[pair]'.targeted.test.ts`

Expected: PASS for direct-first, OpenRouter/OpenCode fallback, partial rates, source-observation tie breaking, missing-source rejection, deterministic route-ID ties, canonical redirects, and noindex pairs.

- [ ] **Step 5: Commit route-aware pricing**

```bash
git add src/benchmarks/comparison-pricing.ts src/benchmarks/comparison-pricing.test.ts src/frontend/comparison-contracts.ts src/frontend/comparison-contracts.test.ts functions/compare/'[pair]'.ts functions/compare/'[pair]'.test.ts functions/compare/'[pair]'.targeted.test.ts
git commit -m "fix: complete comparison pricing context"
```

### Task 5: Recompose the comparison result page

**Files:**
- Modify: `src/frontend/comparison-page.tsx`
- Modify: `src/frontend/comparison-page.test.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `comparisonSummary`, `ComparisonRadar`, route-aware view model, `ModelPairPicker`, `ProviderMark`, `ShareAction`
- Produces: one consolidated `.comparison-provenance` disclosure

- [ ] **Step 1: Write failing result-page assertions**

```ts
it('renders the approved result hierarchy without repeated source columns or workload controls', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  render(<ComparisonPage viewModel={denseComparisonViewModel()} />);
  expect(screen.getByRole('heading', { name: /comparison summary/i })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /shared metric radar/i })).toBeInTheDocument();
  expect(screen.getByRole('rowheader', { name: 'Coding' })).toBeInTheDocument();
  expect(screen.queryByRole('columnheader', { name: 'Source' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/source:/i)).not.toBeInTheDocument();
  expect(screen.queryByRole('group', { name: 'Workload view' })).not.toBeInTheDocument();
  expect(screen.getByText('Not published')).toBeInTheDocument();
  expect(screen.getAllByText('Evidence provenance')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Share result' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Share result' }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/compare\/.+-vs-.+$/)));
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/frontend/comparison-page.test.tsx`

Expected: FAIL on raw metric keys, Source columns, Workload view, missing summary/radar, and incomplete pricing rows.

- [ ] **Step 3: Implement the approved hierarchy**

Render pair header with provider marks, names, evidence states, quick model
switching, and Share; then summary, highlights, conditional radar/list, metrics,
route-switchable pricing/context, and one provenance disclosure in that order.
Populate result-page quick switching from the current models plus existing
reviewed `relatedPairs`; adapt those server-provided records to the controlled
picker without a new browser fetch or an SSR/client-only option set.
Use a controlled selected-route ID per model initialized from the view model.
Changing a route updates only operational rows; it never changes benchmark
claims or the canonical URL. Build the Share URL from the SSR-safe site origin
and `viewModel.canonicalPath`, never `window.location` during render. Remove
Source fields from both desktop tables and mobile metric cards; retain source
identity and links only inside the single Evidence provenance disclosure.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/frontend/comparison-page.test.tsx src/frontend/comparison-summary.test.ts src/frontend/comparison-radar.test.tsx`

Expected: PASS for dense/sparse evidence, mobile cards, route switching, unavailable facts, consolidated provenance, and sharing.

- [ ] **Step 5: Commit the comparison result**

```bash
git add src/frontend/comparison-page.tsx src/frontend/comparison-page.test.tsx src/index.css
git commit -m "feat: clarify model comparison results"
```

### Task 6: SSR, responsive, and hydration verification

**Files:**
- Modify: `browser-tests/responsive-browser.ts`
- Modify: `browser-tests/tokenbench-fixtures.ts`

**Interfaces:**
- Consumes: Tasks 1-5
- Preserves: byte-safe SSR document generation and client hydration contract

- [ ] **Step 1: Add failing browser coverage**

Cover the hub at 320 and 1440 px, a dense four-axis comparison, a sparse
comparison with ruled fallback, route switching, light/dark themes, Share, no
horizontal overflow, and absence of revision/workload/source-column UI. Capture
`pageerror` and console error events around the existing SSR comparison fixture
and fail the test on hydration/recoverable errors.

- [ ] **Step 2: Run focused browser tests and verify RED**

Run: `npm run test:browser -- --grep "compare"`

Expected: FAIL until fixtures and selectors represent the redesigned surfaces.

- [ ] **Step 3: Update deterministic browser fixtures**

Add four compatible BenchLM category rows, one heterogeneous row, two verified
price routes, and explicit null fields. Do not use production network data.

- [ ] **Step 4: Run plan verification**

Run:

```bash
npm test -- src/pages/compare-hub-page.test.tsx src/frontend/comparison-page.test.tsx src/frontend/comparison-contracts.test.ts src/frontend/comparison-summary.test.ts src/frontend/comparison-radar.test.tsx src/benchmarks/comparison-pricing.test.ts functions/compare/'[pair]'.test.ts functions/compare/'[pair]'.targeted.test.ts
npm run lint
npm run build
npm run test:browser -- --grep "compare"
git diff --check
```

Expected: all commands exit 0 and server markup hydrates without recoverable errors.

- [ ] **Step 5: Commit compare browser coverage**

```bash
git add browser-tests/responsive-browser.ts browser-tests/tokenbench-fixtures.ts
git commit -m "test: cover source-faithful comparisons"
```
