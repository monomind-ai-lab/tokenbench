# TokenBench Price vs Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish `/llm-price-performance/` with a corrected score/price scatter plot, Pareto frontier, accessible equivalent table, decision-useful filters, durable model links, stale fallback, and complete server-rendered SEO.

**Architecture:** Build one pure price-performance projection from corrected public metrics, validated price routes, and durable model identity. Return the complete bounded projection in one validated benchmark envelope, materialize the default current view, and apply normalized filters/frontier selection in shared pure functions. Server-render the default table and explanatory evidence; hydrate the SVG chart and controls without making crawlable content depend on JavaScript.

**Tech Stack:** TypeScript 5.8, Cloudflare Workers and Pages Functions, D1, React 19, SVG, Vitest, Testing Library, Playwright.

## Global Constraints

- Canonical route is `/llm-price-performance/`; filter URLs canonicalize to that base and never enter sitemaps.
- Score lanes are overall, agentic, coding, reasoning, knowledge, multimodal, mathematics, multilingual, and instruction following from the corrected public score contract.
- Default cost is output USD per one million tokens.
- `3:1 blended = (3 × input price + output price) / 4` exactly.
- Missing score/price is unavailable and excluded, never zero; a source-published zero remains visible but has no finite score-per-dollar.
- Default includes current models and one deterministic representative per supplied family; models without a supplied family each form their own family.
- `All model variants` and archived inclusion are explicit controls.
- Pareto efficiency maximizes score and minimizes selected cost; equal score/cost points share frontier state.
- Chart interactions are fully available by keyboard and touch and have an equivalent accessible table.
- Chart rendering failure must not remove the table.
- Fresh server, active revision, stale server, and last-valid browser fallback preserve already valid evidence.
- Initial HTML includes H1, explanation, source/methodology/freshness facts, default table, canonical metadata, and `WebPage` plus `Dataset` JSON-LD.
- Every task follows RED-GREEN-REFACTOR and ends in a focused commit.

---

## File structure and ownership

- `src/benchmarks/price-performance.ts` owns score-lane mapping, route selection, cost formulas, family representatives, filters, score-per-dollar, and Pareto state.
- `src/benchmarks/price-performance-contracts.ts` owns API envelope/runtime validation and public point/capability types.
- `functions/_shared/price-performance-db.ts` reads current projection inputs plus requested durable archived profiles.
- `functions/api/benchmarks/price-performance.ts` serves the complete projection through shared benchmark fallback.
- `workers/benchmark-ingest/src/index.ts` materializes the default current complete projection cache.
- `src/frontend/price-performance-state.ts` owns normalized URL/filter state.
- `src/frontend/price-performance-chart.tsx` owns accessible SVG points/frontier/details.
- `src/pages/price-performance-page.tsx` owns the filters, explanatory copy, chart, table/cards, and stale state.
- `functions/llm-price-performance.ts` owns default SSR and embedded hydration data.

### Task 1: Pure score/price projection, family representatives, and Pareto contract

**Files:**
- Create: `src/benchmarks/price-performance.ts`
- Create: `src/benchmarks/price-performance.test.ts`
- Create: `src/benchmarks/price-performance-contracts.ts`
- Create: `src/benchmarks/price-performance-contracts.test.ts`
- Modify: `src/benchmarks/value.ts`
- Modify: `src/benchmarks/value.test.ts`

**Interfaces:**
- Produces: `priceForBasis(route, basis): number | null` for `output` and `blended-3-1`.
- Produces: `buildPricePerformanceProjection(input): PricePerformanceProjection`.
- Produces: `filterPricePerformancePoints(points, filters): readonly PricePerformancePoint[]`.
- Produces: `markParetoFrontier(points): readonly PricePerformancePointView[]`.
- Produces: `oneRepresentativePerFamily(points): readonly PricePerformancePoint[]`.

- [ ] **Step 1: Add failing formula, eligibility, family, and Pareto tests**

```ts
it.each([
  [{ input: 2, output: 8 }, 'output', 8],
  [{ input: 2, output: 8 }, 'blended-3-1', 3.5],
  [{ input: 0, output: 0 }, 'blended-3-1', 0],
])('calculates %j with %s as %s', (price, basis, expected) => {
  expect(priceForBasis(route(price), basis as CostBasis)).toBe(expected);
});

it('uses the corrected GPT-5.6 Sol coding lane', () => {
  const projection = buildPricePerformanceProjection(gptSolInput());
  expect(projection.points.find((point) => point.slug === 'gpt-5-6-sol')?.scores.coding).toBe(77.95);
});

it('keeps exact ties on the frontier and deterministically removes dominated points', () => {
  const views = markParetoFrontier(points([
    ['a', 80, 4], ['b', 80, 4], ['c', 79, 5], ['d', 81, 6],
  ]));
  expect(views.filter((point) => point.frontier).map((point) => point.modelKey)).toEqual(['a', 'b', 'd']);
});

it('selects one representative per supplied family and treats null family as unique', () => {
  expect(oneRepresentativePerFamily(familyFixture()).map((point) => point.modelKey)).toEqual(['family-a:best', 'no-family:one', 'no-family:two']);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/benchmarks/price-performance.test.ts src/benchmarks/price-performance-contracts.test.ts src/benchmarks/value.test.ts`

Expected: FAIL because the projection, cost-basis union, family selection, and tie-aware frontier contract are absent.

- [ ] **Step 3: Implement exact point derivation and deterministic analytical helpers**

```ts
export type PricePerformanceScoreLane = 'overall' | 'agentic' | 'coding' | 'reasoning' | 'knowledge' | 'multimodal' | 'mathematics' | 'multilingual' | 'instruction-following';
export type PricePerformanceCostBasis = 'output' | 'blended-3-1';

export interface PricePerformancePoint {
  readonly modelKey: string;
  readonly slug: string;
  readonly displayName: string;
  readonly creator: string;
  readonly familyId: string | null;
  readonly status: 'current' | 'archived';
  readonly sourceType: BenchmarkModel['sourceType'];
  readonly evidenceStatus: EvidenceStatus;
  readonly scores: Readonly<Record<PricePerformanceScoreLane, number | null>>;
  readonly route: PricePerformanceRoute;
}

export function priceForBasis(route: PricePerformanceRoute, basis: PricePerformanceCostBasis): number | null {
  if (!finiteNonNegative(route.outputUsdPerMillion)) return null;
  if (basis === 'output') return route.outputUsdPerMillion;
  if (!finiteNonNegative(route.inputUsdPerMillion)) return null;
  return (3 * route.inputUsdPerMillion + route.outputUsdPerMillion) / 4;
}
```

Map every lane to one explicit public metric key; do not search by labels. Select complete primary route records in deterministic order: exact direct-provider route evidence first, then a primary OpenRouter route, then provider ID/route ID binary. A candidate needs score attribution, price attribution, compatible units/methodology, and a safe durable slug. Family representative ordering is score descending for the active lane, selected cost ascending, then model key; null family uses `modelKey`. Implement frontier by sorting cost ascending, score descending, model key and grouping exact `(score,cost)` ties before walking the running maximum. Reuse or adapt `paretoFrontier` without changing existing leaderboard semantics.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/benchmarks/price-performance.test.ts src/benchmarks/price-performance-contracts.test.ts src/benchmarks/value.test.ts`

Expected: PASS for both formulas, decimal/large/zero prices, all score lanes, missing facts, source attribution, route priority, family representatives, dominance, equal score/cost, exact ties, stable order, zero score-per-dollar, and strict runtime parsing.

- [ ] **Step 5: Commit analytical projection**

```bash
git add src/benchmarks/price-performance.ts src/benchmarks/price-performance.test.ts src/benchmarks/price-performance-contracts.ts src/benchmarks/price-performance-contracts.test.ts src/benchmarks/value.ts src/benchmarks/value.test.ts
git commit -m "feat: derive price performance evidence"
```

### Task 2: Complete projection API, materialized default, and stale fallback

**Files:**
- Create: `functions/_shared/price-performance-db.ts`
- Create: `functions/_shared/price-performance-db.test.ts`
- Create: `functions/api/benchmarks/price-performance.ts`
- Create: `functions/api/benchmarks/price-performance.test.ts`
- Modify: `src/benchmarks/api-response-cache-keys.ts`
- Modify: `src/benchmarks/api-response-cache-keys.test.ts`
- Modify: `workers/benchmark-ingest/src/index.ts`
- Modify: `workers/benchmark-ingest/src/index.test.ts`
- Modify: `functions/_shared/benchmark-response-fallback.ts`
- Modify: `functions/_shared/benchmark-response-fallback.test.ts`

**Interfaces:**
- Cache key: `benchmarkPricePerformanceProjectionCacheKey()` returns `price-performance:complete:v1`.
- Produces: `readPricePerformanceProjection(db, { includeArchived }): Promise<PricePerformanceProjection>`.
- API route: `GET /api/benchmarks/price-performance`; returns one benchmark envelope with revision/freshness/methodology/cost definitions/capabilities/points/attribution.
- Default materialized response contains every eligible current variant and all score lanes; browser filters do not generate server cache-key combinations.

- [ ] **Step 1: Add failing join, invalid-row isolation, archived, and fallback tests**

```ts
it('joins corrected metrics, complete prices, and durable slugs without losing unrelated rows', async () => {
  const projection = await readPricePerformanceProjection(dbWithOneInvalidPrice(), { includeArchived: false });
  expect(projection.points.some((point) => point.slug === 'valid-model')).toBe(true);
  expect(projection.points.some((point) => point.slug === 'invalid-price-model')).toBe(false);
});

it('includes retained profiles only when explicitly requested', async () => {
  expect((await readPricePerformanceProjection(db, { includeArchived: false })).points.some((point) => point.status === 'archived')).toBe(false);
  expect((await readPricePerformanceProjection(db, { includeArchived: true })).points.some((point) => point.status === 'archived')).toBe(true);
});

it('serves the stale materialized complete projection after active reconstruction fails', async () => {
  const response = await onRequestGet(context({ activeReadFails: true, staleCache: completeProjectionEnvelope() }));
  expect(response.status).toBe(200);
  expect((await response.json()).freshness.status).toBe('stale');
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- functions/_shared/price-performance-db.test.ts functions/api/benchmarks/price-performance.test.ts src/benchmarks/api-response-cache-keys.test.ts workers/benchmark-ingest/src/index.test.ts functions/_shared/benchmark-response-fallback.test.ts`

Expected: FAIL because no complete price-performance API or materialized cache entry exists.

- [ ] **Step 3: Implement bounded complete-projection reads and cache publication**

```ts
export interface PricePerformanceEnvelopeData {
  readonly scoreMethodology: Readonly<Record<PricePerformanceScoreLane, string>>;
  readonly costDefinitions: {
    readonly output: 'Published output USD per one million tokens';
    readonly blended3To1: '(3 × input USD/M + output USD/M) / 4';
  };
  readonly capabilities: PricePerformanceCapabilities;
  readonly points: readonly PricePerformancePoint[];
}
```

For current points, read the active validated benchmark snapshot and current directory metadata. For `includeArchived=true`, add only parsed latest-valid durable profiles, bounded by 500 archived records per response; expose pagination when more exist. Exclude/log one invalid point with safe model key, source ID, and reason class, never body content. Add the current complete projection to `materializedBenchmarkApiResponses` with fresh and stale envelopes. Route the endpoint through `serveBenchmarkWithFallback`; `includeArchived` reconstruction may extend the current cached projection but must fall back to the current stale projection rather than a 503 when archived reads fail.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- functions/_shared/price-performance-db.test.ts functions/api/benchmarks/price-performance.test.ts src/benchmarks/api-response-cache-keys.test.ts workers/benchmark-ingest/src/index.test.ts functions/_shared/benchmark-response-fallback.test.ts`

Expected: PASS for current/archived joins, invalid-row isolation/logging, complete capability sets, materialized variants, ETags/304, fresh/active/stale sequence, bounded archived pagination, and source attribution.

- [ ] **Step 5: Commit the complete projection API**

```bash
git add functions/_shared/price-performance-db.ts functions/_shared/price-performance-db.test.ts functions/api/benchmarks/price-performance.ts functions/api/benchmarks/price-performance.test.ts src/benchmarks/api-response-cache-keys.ts src/benchmarks/api-response-cache-keys.test.ts workers/benchmark-ingest/src/index.ts workers/benchmark-ingest/src/index.test.ts functions/_shared/benchmark-response-fallback.ts functions/_shared/benchmark-response-fallback.test.ts
git commit -m "feat: serve price performance projection"
```

### Task 3: Normalized filters, accessible scatter chart, and equivalent table

**Files:**
- Create: `src/frontend/price-performance-state.ts`
- Create: `src/frontend/price-performance-state.test.ts`
- Create: `src/frontend/price-performance-chart.tsx`
- Create: `src/frontend/price-performance-chart.test.tsx`
- Create: `src/frontend/price-performance-table.tsx`
- Create: `src/frontend/price-performance-table.test.tsx`
- Create: `src/pages/price-performance-page.tsx`
- Create: `src/pages/price-performance-page.test.tsx`
- Modify: `src/frontend/benchmark-cache.ts`
- Modify: `src/frontend/benchmark-cache.test.ts`
- Modify: `src/index.css`

**Interfaces:**
- Filter state: `{ lane, costBasis, creator, sourceType, priceBand, evidenceStatus, variants, status, scale }`.
- Defaults: `overall`, `output`, all creators/types/prices/evidence, `one-per-family`, `current`, `linear`.
- `PricePerformanceChart` consumes already filtered/marked views and emits no data mutation.
- Table columns: model, score, selected cost, finite score/dollar or unavailable, provider/route, evidence, frontier, profile link.

- [ ] **Step 1: Add failing URL normalization, keyboard/touch, chart-failure, and parity tests**

```tsx
it('normalizes invalid filter values to the base defaults', () => {
  const decoded = decodePricePerformanceState(new URLSearchParams('lane=wrong&basis=cached&variants=maybe'), capabilities());
  expect(decoded.state).toEqual(DEFAULT_PRICE_PERFORMANCE_STATE);
  expect(decoded.wasNormalized).toBe(true);
});

it('exposes every point by keyboard with the same facts as the table', async () => {
  render(<PricePerformancePage envelope={projectionEnvelope()} />);
  const point = screen.getByRole('button', { name: /GPT-5.6 Sol.*81\.48.*output price/ });
  point.focus();
  await user.keyboard('{Enter}');
  expect(screen.getByRole('dialog', { name: 'GPT-5.6 Sol details' })).toHaveTextContent('$');
  expect(screen.getByRole('row', { name: /GPT-5.6 Sol/ })).toHaveTextContent('81.48');
});

it('keeps the table visible when chart rendering is disabled', () => {
  render(<PricePerformancePage envelope={projectionEnvelope()} chartAvailable={false} />);
  expect(screen.getByRole('table', { name: 'Price versus performance values' })).toBeVisible();
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/frontend/price-performance-state.test.ts src/frontend/price-performance-chart.test.tsx src/frontend/price-performance-table.test.tsx src/pages/price-performance-page.test.tsx src/frontend/benchmark-cache.test.ts`

Expected: FAIL because the filters, chart, table, and price-performance browser cache key are absent.

- [ ] **Step 3: Implement accessible analytical interactions and shared fact rendering**

```tsx
<svg role="group" aria-label={`${laneLabel} score by ${basisLabel}`} viewBox={`0 0 ${width} ${height}`}>
  <g aria-hidden="true"><ChartAxes x={xScale} y={yScale} /></g>
  <ParetoPath points={frontierPoints} x={xScale} y={yScale} />
  {points.map((point) => (
    <foreignObject key={point.modelKey} x={xScale(point.cost) - 12} y={yScale(point.score) - 12} width="24" height="24">
      <button type="button" className={`scatter-point evidence-${point.evidenceStatus}`} aria-label={pointAccessibleName(point)} onClick={() => onSelect(point)} />
    </foreignObject>
  ))}
</svg>
```

Use linear axes by default and allow log only when every displayed cost is positive; normalize an invalid log request back to linear. Hover may mirror focus but never be the only details mechanism. Point shape plus text differentiates evidence/frontier state without relying on color. The same `PricePerformancePointView` formatter feeds point accessible names, detail dialog, table, and mobile cards. Sort the default ten-row summary by score descending within the lowest-cost eligible half, then cost/model key; the full table remains available. Cache only runtime-validated complete envelopes under `tokenbench:benchmarks:v2:price-performance:complete`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/frontend/price-performance-state.test.ts src/frontend/price-performance-chart.test.tsx src/frontend/price-performance-table.test.tsx src/pages/price-performance-page.test.tsx src/frontend/benchmark-cache.test.ts`

Expected: PASS for every filter, normalized URLs, one/all variants, archived state, both cost bases, linear/log eligibility, keyboard/touch details, point/table parity, frontier text, score-per-dollar zero handling, category-empty states, stale browser fallback, and chart-failure table preservation.

- [ ] **Step 5: Commit the interactive decision surface**

```bash
git add src/frontend/price-performance-state.ts src/frontend/price-performance-state.test.ts src/frontend/price-performance-chart.tsx src/frontend/price-performance-chart.test.tsx src/frontend/price-performance-table.tsx src/frontend/price-performance-table.test.tsx src/pages/price-performance-page.tsx src/pages/price-performance-page.test.tsx src/frontend/benchmark-cache.ts src/frontend/benchmark-cache.test.ts src/index.css
git commit -m "feat: add price performance explorer"
```

### Task 4: Server rendering, route integration, and page-level SEO

**Files:**
- Create: `functions/llm-price-performance.ts`
- Create: `functions/llm-price-performance.test.ts`
- Modify: `src/routing/routes.ts`
- Modify: `src/routing/routes.test.ts`
- Modify: `src/seo/metadata.ts`
- Modify: `src/seo/metadata.test.ts`
- Modify: `src/seo/static-page.ts`
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`
- Modify: `src/main.test.tsx`
- Modify: `src/frontend/app-shell.tsx`
- Modify: `src/frontend/app-shell.test.tsx`

**Interfaces:**
- Adds `{ kind: 'pricePerformance' }` at `/llm-price-performance/` and a primary navigation/footer decision-tool link.
- `PricePerformanceApp({ initialEnvelope })` hydrates `script#price-performance-initial-data` only after strict parsing.
- SSR uses the same default state/table formatter as the client.
- JSON-LD: one `WebPage` and one `Dataset` containing methodology version, source attribution, and modification time.

- [ ] **Step 1: Add failing initial-HTML, metadata, JSON-LD, hydration, and query-canonical tests**

```ts
it('renders substantive default evidence before JavaScript', async () => {
  const response = await onRequestGet(pageContext());
  const html = await response.text();
  expect(html).toContain('<h1>LLM price vs performance</h1>');
  expect(html).toContain('GPT-5.6 Sol');
  expect(html).toContain('Pareto');
  expect(html).toContain('"@type":"Dataset"');
});

it('canonicalizes filtered requests to the base page', async () => {
  const response = await onRequestGet(pageContext('?lane=coding&basis=blended-3-1'));
  expect(await response.text()).toContain('<link rel="canonical" href="https://tokenbench.monomind.one/llm-price-performance/">');
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- functions/llm-price-performance.test.ts src/routing/routes.test.ts src/seo/metadata.test.ts src/main.test.tsx src/frontend/app-shell.test.tsx`

Expected: FAIL because the route, SSR response, hydration path, navigation, and metadata are absent.

- [ ] **Step 3: Implement SSR using the validated complete projection**

```ts
const initialState = DEFAULT_PRICE_PERFORMANCE_STATE;
const filtered = pricePerformanceView(envelope.data.points, initialState);
const html = pricePerformanceDocument({
  metadata: metadataForRoute({ kind: 'pricePerformance' }),
  envelope,
  initialContent: renderPricePerformanceStaticContent(filtered, envelope),
  structuredData: pricePerformanceStructuredData(envelope),
});
return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
```

Read through the same complete-projection server helper as the API. If stale fallback exists, SSR the stale table with its checked/revision facts. If no data exists on a cold request, return an honest 503 page with metadata and explanatory controls, not Home. Embed JSON with `<`, U+2028, and U+2029 escaping. Add unique title/description/canonical/OG/Twitter and `index,follow` for the base route. Query parameters never alter canonical or sitemap output.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- functions/llm-price-performance.test.ts src/routing/routes.test.ts src/seo/metadata.test.ts src/main.test.tsx src/frontend/app-shell.test.tsx`

Expected: PASS for fresh/stale/cold SSR, substantive table, escaped hydration payload, canonical filters, complete metadata, WebPage/Dataset JSON-LD, navigation, and safe hydration failure.

- [ ] **Step 5: Commit route and SEO integration**

```bash
git add functions/llm-price-performance.ts functions/llm-price-performance.test.ts src/routing/routes.ts src/routing/routes.test.ts src/seo/metadata.ts src/seo/metadata.test.ts src/seo/static-page.ts src/App.tsx src/main.tsx src/main.test.tsx src/frontend/app-shell.tsx src/frontend/app-shell.test.tsx
git commit -m "feat: server render price performance page"
```

### Task 5: Browser fixtures, progressive release verification, and deployment

**Files:**
- Modify: `browser-tests/tokenbench-fixtures.ts`
- Modify: `browser-tests/tokenbench-fixtures.test.ts`
- Modify: `scripts/local-preview-benchmark-api.ts`
- Modify: `browser-tests/responsive-browser.ts`
- Modify: `public/sitemaps/static.xml`
- Modify: `docs/catalog-deployment.md`
- Modify: `docs/tokenbench-deployment.md`

**Interfaces:**
- Local fixture covers overall/coding/category-empty, both cost bases, family variants, zero/missing price, archived records, stale server/browser, and chart-unavailable states.
- Static sitemap includes only `/llm-price-performance/`, never filter queries.
- Pages deployment follows the already published Release 1 score and Release 3 directory contracts.

- [ ] **Step 1: Add failing desktop/mobile and fallback browser scenarios**

```ts
test('price performance chart and table stay fact-equivalent', async ({ page }) => {
  await page.goto('/llm-price-performance/');
  await expect(page.getByRole('heading', { name: 'LLM price vs performance' })).toBeVisible();
  await page.getByLabel('Score axis').selectOption('coding');
  await expect(page.getByRole('button', { name: /GPT-5.6 Sol.*77\.95/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /GPT-5.6 Sol.*78\.0/ })).toBeVisible();
});

test('last good price performance evidence survives an outage', async ({ page }) => {
  await page.goto('/llm-price-performance/');
  await seedFailureAfterFirstProjection(page);
  await page.reload();
  await expect(page.getByText('Showing the last published revision')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Price versus performance values' })).toBeVisible();
});
```

- [ ] **Step 2: Run targeted browser scenarios and verify RED**

Run: `npm run test:browser:local-preview -- --grep "price performance|last good price"`

Expected: FAIL until local projection/failure fixtures and the new route are integrated.

- [ ] **Step 3: Complete fixtures, sitemap, and live verification runbook**

```text
Release 4 live checks:
1. Verify Release 1 active corrected revision and Release 3 directory/profile counts.
2. Deploy the benchmark Worker only if the complete projection cache materializer changed.
3. Trigger one authorized refresh and verify the price-performance cache has fresh+stale variants.
4. Deploy Pages from the same verified commit.
5. Check overall and coding lanes, output and 3:1 bases, one/all variants, archived filter, Pareto frontier, table parity, profile links, source links, and normalized URL state.
6. Verify title, description, canonical, robots, Open Graph, Twitter, WebPage/Dataset JSON-LD, and static sitemap.
7. Simulate/read a stale response, inspect safe logs, and confirm the chart/table remain visible with revision and checked time.
8. Repeat at desktop and narrow mobile widths with keyboard navigation and no console errors or horizontal overflow.
```

Use shared fixture builders so score values, accessible names, and tables cannot drift. Add category-empty and chart-disabled browser assertions. Update deployment docs with endpoint/cache key, expected default point count, safe fallback event names, and rollback to the previous Pages deployment.

- [ ] **Step 4: Run the complete progressive-suite verification gate**

Run: `npm test`

Expected: PASS for all Vitest suites across Releases 1-4.

Run: `npm run lint && npm run build`

Expected: TypeScript exits 0 and the production build exits 0.

Run: `npm run test:browser:local-preview`

Expected: PASS for existing and new desktop/mobile routes, metadata, accessibility, fresh/stale/cold behavior, model links, chart/table parity, and no horizontal overflow.

- [ ] **Step 5: Commit Release 4 integration evidence**

```bash
git add browser-tests/tokenbench-fixtures.ts browser-tests/tokenbench-fixtures.test.ts scripts/local-preview-benchmark-api.ts browser-tests/responsive-browser.ts public/sitemaps/static.xml docs/catalog-deployment.md docs/tokenbench-deployment.md
git commit -m "test: verify price performance release"
```
