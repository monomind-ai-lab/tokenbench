# TokenBench V2.1 Interactive Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved TokenBench V2.1 routed decision engine with interactive Chart.js charts, page-specific cards/tables/controls, shared comparison state, complete SSR/no-JavaScript answers, and a Cloudflare Pages preview on `ui-revamp-2`.

**Architecture:** Keep the existing React 19, Vite, Pages Functions, D1/R2 read path, published-revision validation, and pure benchmark/calculator selectors. Add a small shared interaction layer for Chart.js, comparison state, inspection, analytics, and delayed editorial CTAs; then implement each route family as a testable vertical slice whose server-rendered HTML and client enhancement consume the same view models.

**Tech Stack:** TypeScript 5.8, React 19, Vite 6, Chart.js, Vitest, Testing Library, Playwright, Cloudflare Pages Functions, D1/R2 read-only preview bindings, Wrangler 4.

## Global Constraints

- Work only in `/Users/daren/orca/workspaces/tokenbench/ui-revamp` on `ui-revamp-2`; preserve `ui-revamp` at `096bc7f` and never touch the dirty main checkout.
- The approved design is `docs/superpowers/specs/2026-08-14-tokenbench-v2-1-interactive-revamp-design.md`; a task is incomplete if it weakens a page-level contract.
- Light mode defaults to white `#ffffff`; plum `#741a66` owns primary actions/selections; dark mode is a synchronized semantic translation.
- Bundle Chart.js as an application dependency. Do not use Tailwind, Chart.js, icon, or font CDNs for required functionality.
- Every chart has an accessible name, concise written finding, keyboard-accessible inspection path, and semantic table generated from the same selector.
- Missing source facts render `Not reported` or the established `Unavailable`; they never become zero, a winner, a rank, a migration recommendation, or a capacity claim.
- The Custom Leaderboard domains are Agentic, Coding, Reasoning, Math, Multimodal, and **Throughput**. Zero-sum weights cannot produce a ranking.
- Canonical comparisons are pairwise at `/models/compare/[a]-vs-[b]/`; transient comparison accepts two or three unique stable model IDs.
- Canonical route HTML must contain the default answer, methodology, freshness, primary links, and equivalent tables without JavaScript.
- Interactive targets are at least 44×44 CSS pixels; keyboard focus, reduced motion, 320px layout, print, loading, stale, empty, partial, conflict, chart-failure, and API-failure states are release gates.
- Preview may read existing Pages bindings but may not mutate production D1, R2, Workers, ingestion state, domains, migrations, or custom-domain configuration.
- Baseline timing sensitivity remains documented: three four-worker timeout-only cases must be rerun independently before being treated as regressions.
- Use scoped TDD commits. Do not stage unrelated files or the retained stash.

## Execution Coordination

- Sol remains the Orca coordinator and sole integration owner.
- Use `gpt-5.6-luna` at max for component composition, responsive CSS, and accessibility slices when Orca reports that launch preference as supported.
- Use `gpt-5.6-terra` at xhigh for SSR, route, view-model, and evidence-contract slices; Orca rejected `max` for this model in the approved-spec review.
- Use `ollama-cloud/deepseek-v4-flash:0731` for bounded selector/test tasks and `ollama-cloud/deepseek-v4-pro:0813` for independent route/spec review.
- At most three workers may run concurrently. Workers in the shared worktree receive non-overlapping file ownership; the coordinator integrates, runs cross-slice verification, commits, pushes, and deploys.
- Each task receives one implementation worker and one fresh read-only reviewer. A task advances only after its focused tests pass and review findings are resolved.

## File Responsibility Map

| Area | Files and responsibility |
| --- | --- |
| Route contract | `src/routing/routes.ts`, `src/seo/metadata.ts`, `src/App.tsx`, `src/main.tsx` own canonical routing, redirects, metadata, hydration, and 404 rendering. |
| Shared interaction | New `src/frontend/compare-state.tsx`, `comparison-tray.tsx`, `inspection-card.tsx`, `analytics.ts`, `editorial-cta.tsx` own selection, inspection, privacy-safe events, and delayed conversion UI. |
| Charts | New `src/frontend/charts/chart-js.ts`, `chart-canvas.tsx`, plus focused Pareto/radar/bar/breakeven components own Chart.js registration, lifecycle, theme, inspection, and fallback. |
| Home | `src/pages/home-page.tsx`, `src/pages/home-page.test.tsx`, static generator tests own validated metrics, five previews, and newsletter states. |
| Models | `src/pages/models-page.tsx`, `src/frontend/model-directory-*`, `functions/models/index.ts` own catalog query, Pareto, views, pagination, and SSR. |
| Lifecycle/profile | `src/pages/model-lifecycle-page.tsx`, `model-profile-page.tsx`, `src/benchmarks/lifecycle-view.ts`, model Pages Functions own grouped lifecycle and model dossiers. |
| Leaderboards | `src/pages/leaderboards-page.tsx`, new `src/frontend/charts/leaderboard-vertical-chart.tsx`, new `src/frontend/sla-leaderboard.tsx`, `custom-leaderboard.tsx`, and `functions/leaderboards/[[path]].ts` own overview, categories, SLA/custom tools, and SSR. |
| Compare | `src/pages/compare-hub-page.tsx`, `src/frontend/comparison-page.tsx`, `comparison-summary.ts`, and `functions/models/compare/[pair].ts` own selector, canonical pair result, controls, synthesis, and SSR. |
| Cost | New `src/pages/cost-page.tsx`, existing calculator files, new `breakeven-state.ts`, `breakeven-chart.tsx`, and `functions/cost/*.ts` own hub, simulator, breakeven, export, and SSR form results. |
| Articles | New `src/pages/articles-page.tsx`, `insights-page.tsx`, `src/articles/content.ts`, existing guides content/generator own channel separation, required topics, details, dates, and structured data. |
| Cross-route QA | `scripts/generate-static-pages.ts`, `browser-tests/responsive-browser.ts`, `src/index.css`, route/SEO/static tests own no-JS, responsive, theme, print, accessibility, performance, and preview smoke coverage. |

---

### Task 1: Canonical Routes and Shared Interaction State

**Files:**
- Create: `src/frontend/compare-state.tsx`
- Create: `src/frontend/comparison-tray.tsx`
- Create: `src/frontend/inspection-card.tsx`
- Create: `src/frontend/analytics.ts`
- Create: `src/frontend/editorial-cta.tsx`
- Create: `src/pages/not-found-page.tsx`
- Modify: `src/routing/routes.ts:4-340`
- Modify: `src/routing/routes.test.ts`
- Modify: `src/App.tsx:36-379`
- Modify: `src/frontend/app-shell.tsx:1-140`
- Test: `src/frontend/compare-state.test.tsx`
- Test: `src/frontend/inspection-card.test.tsx`
- Test: `src/pages/not-found-page.test.tsx`

**Interfaces:**
- Produces: `CompareProvider`, `useCompareState()`, `addCompareModel()`, `removeCompareModel()`, `InspectionRecord`, `InspectionCard`, `trackTokenBenchEvent()`, `EditorialCta`, and canonical V2.1 route constants.
- Consumes: stable model IDs/slugs from `src/benchmarks/model-directory.ts` and existing `AppShell` focus/theme behavior.

- [ ] **Step 1: Write failing route and selection tests**

```ts
expect(pathnameForRoute({ kind: 'comparison', pair: 'alpha-vs-beta' }))
  .toBe('/models/compare/alpha-vs-beta/');
expect(matchRoute('/leaderboards/sla/')).toEqual({ kind: 'leaderboardSla' });
expect(addCompareModel({ ids: ['a', 'b', 'c'] }, 'd')).toEqual({
  kind: 'replacement_required',
  state: { ids: ['a', 'b', 'c'] },
  incomingId: 'd',
});
expect(addCompareModel({ ids: ['a', 'b'] }, 'b').kind).toBe('duplicate');
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `npx vitest run src/routing/routes.test.ts src/frontend/compare-state.test.tsx`

Expected: FAIL because V2.1 specialized routes and `addCompareModel` do not exist.

- [ ] **Step 3: Define the shared state and route types**

```ts
export interface CompareSelection { readonly ids: readonly string[] }
export type CompareAddResult =
  | { readonly kind: 'added'; readonly state: CompareSelection }
  | { readonly kind: 'duplicate'; readonly state: CompareSelection }
  | { readonly kind: 'replacement_required'; readonly state: CompareSelection; readonly incomingId: string };

export function addCompareModel(state: CompareSelection, id: string): CompareAddResult {
  if (state.ids.includes(id)) return { kind: 'duplicate', state };
  if (state.ids.length >= 3) return { kind: 'replacement_required', state, incomingId: id };
  return { kind: 'added', state: { ids: [...state.ids, id] } };
}
```

Add route kinds `leaderboardCategory`, `leaderboardSla`, `leaderboardCustom`, `insightDetail`, and canonical comparison matching under `/models/compare/`; retain permanent redirects from existing nested leaderboard and `/compare/[pair]/` URLs.

- [ ] **Step 4: Add inspection, analytics, delayed CTA, tray, and 404 tests**

```tsx
const onClose = vi.fn();
render(<InspectionCard record={{
  modelId: 'm1', modelSlug: 'model-one', modelName: 'Model One', provider: 'Provider', host: null,
  inputPrice: null, outputPrice: null, cachePrice: null, ttft: null,
  throughput: null, context: null, capability: null, evidenceStatus: 'source_only',
  sourceLabel: 'BenchLM', sourceUrl: 'https://benchlm.ai/', effectiveAt: null,
}} onClose={onClose} />);
expect(screen.getAllByText('Not reported').length).toBeGreaterThan(0);
expect(screen.getByRole('link', { name: /Model One profile/i })).toHaveAttribute('href', '/models/model-one/');
```

Assert `EditorialCta` renders only when `eligible=true`, analytics excludes arbitrary values, the tray announces additions/removals, Escape returns focus, and unknown routes render six primary links instead of `null`.

- [ ] **Step 5: Implement shared components and wrap the application**

```tsx
export function CompareProvider({ children }: { readonly children: ReactNode }) {
  const [selection, setSelection] = useState<CompareSelection>(() =>
    typeof window === 'undefined' ? { ids: [] } : decodeCompareSearch(window.location.search));
  const value = useMemo(() => ({ selection, setSelection }), [selection]);
  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}

export function trackTokenBenchEvent<K extends TokenBenchEventName>(
  name: K,
  detail: TokenBenchEventDetail[K],
): void {
  if (typeof window === 'undefined' || navigator.doNotTrack === '1') return;
  window.dispatchEvent(new CustomEvent('tokenbench:analytics', { detail: { name, ...detail } }));
}
```

Define `TokenBenchEventDetail` in the same file as a closed mapping whose payloads contain only stable IDs and enumerated reasons, for example `{ compare_model_added: { modelId: string; route: string }; chart_failed: { chartKind: string; route: string } }`, then derive `type TokenBenchEventName = keyof TokenBenchEventDetail`.

Define `InspectionRecord` with `modelId`, `modelSlug`, `modelName`, `provider`, nullable `host`, price/TTFT/throughput/context/capability fields, `evidenceStatus`, source label/URL, and nullable effective time. `InspectionCard` derives `/models/${modelSlug}/` from the provided slug; it never guesses a slug from display text.

Mount `CompareProvider` above `App`, render `ComparisonTray` inside `PageFrame`, and render `NotFoundPage` for `route.kind === 'notFound'`.

- [ ] **Step 6: Verify GREEN and commit**

Run: `npx vitest run src/routing/routes.test.ts src/frontend/compare-state.test.tsx src/frontend/inspection-card.test.tsx src/pages/not-found-page.test.tsx src/frontend/app-shell.test.tsx`

Expected: PASS.

Commit:

```bash
git add src/routing src/App.tsx src/frontend/compare-state.tsx src/frontend/comparison-tray.tsx src/frontend/inspection-card.tsx src/frontend/analytics.ts src/frontend/editorial-cta.tsx src/frontend/app-shell.tsx src/pages/not-found-page.tsx
git commit -m "feat: add V2.1 route and interaction foundation"
```

### Task 2: Bundled Chart.js Foundation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/frontend/charts/chart-theme.ts:1-7`
- Create: `src/frontend/charts/chart-js.ts`
- Create: `src/frontend/charts/chart-canvas.tsx`
- Test: `src/frontend/charts/chart-theme.test.ts`
- Test: `src/frontend/charts/chart-canvas.test.tsx`

**Interfaces:**
- Produces: `createTokenBenchChart()`, `TokenBenchChartCanvas`, `chartThemeFor()`, and `ChartFailure` fallback contract used by all later chart tasks.
- Consumes: `InspectionRecord` from Task 1 and `data-theme` from the shared preference layer.

- [ ] **Step 1: Add Chart.js and failing lifecycle/theme tests**

Run: `npm install chart.js`

```ts
expect(chartThemeFor('light').grid).toBe('#e2e8f0');
expect(chartThemeFor('dark').text).toBe('#a8a8a8');
const destroy = vi.fn();
vi.mocked(createTokenBenchChart).mockReturnValue({ destroy } as never);
expect(destroy).toHaveBeenCalledTimes(1);
expect(screen.getByRole('status')).toHaveTextContent('Chart unavailable. Exact values remain in the table.');
```

- [ ] **Step 2: Confirm RED**

Run: `npx vitest run src/frontend/charts/chart-theme.test.ts src/frontend/charts/chart-canvas.test.tsx`

Expected: FAIL because the shared Chart.js adapter and failure boundary are absent.

- [ ] **Step 3: Implement one-time registration and semantic theme options**

```ts
import { Chart, registerables, type ChartConfiguration, type ChartType } from 'chart.js';
Chart.register(...registerables);

export function createTokenBenchChart<TType extends ChartType>(
  canvas: HTMLCanvasElement,
  configuration: ChartConfiguration<TType>,
): Chart<TType> {
  return new Chart(canvas, configuration);
}

export function chartThemeFor(theme: 'light' | 'dark') {
  return theme === 'light'
    ? { text: '#475569', grid: '#e2e8f0', surface: '#ffffff', primary: '#741a66' }
    : { text: '#a8a8a8', grid: '#383838', surface: '#1d1d1d', primary: '#d88ac8' };
}
```

- [ ] **Step 4: Implement the reusable lifecycle wrapper**

`TokenBenchChartCanvas` must instantiate in `useEffect`, destroy before replacement/unmount, rebuild on theme or data identity change, catch constructor/update errors, set `data-chart-failed`, preserve its written finding and adjacent table, and use zero-duration animation under `prefers-reduced-motion`.

```tsx
return <figure aria-labelledby={titleId} aria-describedby={`${findingId} ${tableId}`}>
  <figcaption id={titleId}>{title}</figcaption>
  <p id={findingId}>{finding}</p>
  {failed ? <p role="status">Chart unavailable. Exact values remain in the table.</p> : <canvas ref={canvasRef} />}
</figure>;
```

- [ ] **Step 5: Verify GREEN, type-check, and commit**

Run: `npx vitest run src/frontend/charts/chart-theme.test.ts src/frontend/charts/chart-canvas.test.tsx && npm run lint`

Expected: PASS; Chart.js is present in the lockfile and no CDN reference is added.

Commit:

```bash
git add package.json package-lock.json src/frontend/charts
git commit -m "feat: add accessible Chart.js foundation"
```

### Task 3: Home Metrics, Five Previews, and Newsletter States

**Files:**
- Modify: `src/pages/home-page.tsx:1-253`
- Modify: `src/pages/home-page.test.tsx`
- Modify: `src/frontend/newsletter-signup.tsx`
- Modify: `src/frontend/newsletter-signup.test.tsx`
- Modify: `scripts/generate-static-pages.ts:30-160`
- Modify: `scripts/generate-static-pages.test.ts`
- Modify: `src/index.css`

**Interfaces:**
- Produces: `buildHomeMetrics()`, five `HomePreview` records, evidence-qualified metric rendering, and complete newsletter state machine.
- Consumes: published decision picks, model/catalog freshness, current article records, Task 1 analytics/inspection/CTA, and existing newsletter endpoint.

- [ ] **Step 1: Write failing metric and SSR tests**

```ts
expect(buildHomeMetrics({ models: [], prices: [], performance: [] })).toEqual({
  trackedModels: null,
  maxSavingsPercent: null,
  topThroughput: null,
  effectiveAt: null,
});
expect(generatedHtml).toContain('Models preview');
expect(generatedHtml).toContain('Leaderboards preview');
expect(generatedHtml).toContain('Compare preview');
expect(generatedHtml).toContain('Subscribe vs API preview');
expect(generatedHtml).toContain('Articles preview');
expect(generatedHtml).not.toContain('384');
```

- [ ] **Step 2: Confirm RED**

Run: `npx vitest run src/pages/home-page.test.tsx src/frontend/newsletter-signup.test.tsx scripts/generate-static-pages.test.ts`

Expected: FAIL because the institutional strip, five explicit previews, and full static form contract are incomplete.

- [ ] **Step 3: Implement pure home selectors and page composition**

```ts
export interface HomeMetrics {
  readonly trackedModels: number | null;
  readonly maxSavingsPercent: number | null;
  readonly topThroughput: number | null;
  readonly effectiveAt: string | null;
}

export function formatHomeMetric(value: number | null, unit = ''): string {
  return value === null ? 'Not reported' : `${value}${unit}`;
}
```

Only compute savings from compatible current source prices under the disclosed workload mix. Render exactly five preview sections with dedicated destination links and sibling inspection controls; no clickable `<div>` or nested interactive link structure.

- [ ] **Step 4: Implement newsletter validation/pending/success/error states**

Use a discriminated state `{ phase: 'idle' | 'submitting' | 'success' | 'error'; message: string }`, associate the label and consent text, preserve the entered address after recoverable failure, disable only while submitting, announce state in `role="status"`, and send no email value to analytics.

- [ ] **Step 5: Make initial HTML and 320px layout complete**

Update `fixedPageContent('home')` so the six primary routes, four metric labels with values or `Not reported`, five preview headings, article links, consent copy, and server-addressed newsletter form exist before hydration. Stack metrics/previews/form at 320px with no hard minimum width.

- [ ] **Step 6: Verify GREEN and commit**

Run: `npx vitest run src/pages/home-page.test.tsx src/frontend/newsletter-signup.test.tsx scripts/generate-static-pages.test.ts && npm run lint`

Expected: PASS.

Commit:

```bash
git add src/pages/home-page.tsx src/pages/home-page.test.tsx src/frontend/newsletter-signup.tsx src/frontend/newsletter-signup.test.tsx scripts/generate-static-pages.ts scripts/generate-static-pages.test.ts src/index.css
git commit -m "feat: build V2.1 home decision previews"
```

### Task 4: Models Pareto, Catalog Views, and Sticky Comparator

**Files:**
- Create: `src/frontend/model-directory-pareto.tsx`
- Create: `src/frontend/model-directory-pareto.test.tsx`
- Modify: `src/pages/models-page.tsx:1-181`
- Modify: `src/pages/models-page.test.tsx`
- Modify: `src/frontend/model-directory-state.ts`
- Modify: `src/frontend/model-directory-state.test.ts`
- Modify: `functions/models/index.ts:1-210`
- Modify: `functions/models/index.test.ts`
- Modify: `src/index.css`

**Interfaces:**
- Produces: `buildModelParetoRows()`, `ModelDirectoryPareto`, Cards/Table parity, full query URL state, pagination, and shared compare actions.
- Consumes: `CompareProvider`, `InspectionCard`, Chart.js wrapper, `ModelDirectoryEnvelope`, existing price-performance selectors, and model profile paths.

- [ ] **Step 1: Write failing Pareto/query/comparison tests**

```ts
const rows = buildModelParetoRows(models, { inputWeight: 3, outputWeight: 1 });
expect(rows.excluded.map((row) => row.modelId)).toContain('missing-price');
expect(rows.plotted.every((row) => Number.isFinite(row.cost) && Number.isFinite(row.score))).toBe(true);
expect(applyParetoVisibility(rows.plotted, true).every((row) => row.frontier)).toBe(true);
expect(modelDirectoryUrl({ ...DEFAULT_MODEL_DIRECTORY_QUERY, view: 'table', page: 2 })).toContain('view=table');
```

- [ ] **Step 2: Confirm RED**

Run: `npx vitest run src/frontend/model-directory-pareto.test.tsx src/frontend/model-directory-state.test.ts src/pages/models-page.test.tsx functions/models/index.test.ts`

Expected: FAIL because Pareto, view state, richer filters, and integrated compare are not part of `/models`.

- [ ] **Step 3: Implement the Pareto selector and Chart.js scatter**

Reuse current blended-cost and frontier calculation rules. Return `{ plotted, excluded }`; never put null data at zero. Provide linear/log and Frontier Only controls, shape/text frontier state, a written result, shared inspection, and an exact table using `plotted`.

```ts
export interface ModelParetoRow {
  readonly modelId: string; readonly slug: string; readonly name: string;
  readonly provider: string; readonly cost: number; readonly score: number;
  readonly frontier: boolean; readonly evidenceStatus: EvidenceStatus;
}
```

- [ ] **Step 4: Implement catalog Cards/Table/query parity**

Extend the query state with provider, modality, sort, view, and page. Render count/reset visibly; cards default below the table breakpoint; table lives in a named focusable overflow region with sticky model identity. Use the same ordered model IDs for cards and table and preserve crawlable server pagination.

- [ ] **Step 5: Integrate the compare tray without silent replacement**

Each model card/row/point gets profile and compare actions. At two selections show the tray radar/spec/score deltas; at three preserve transient exploration; a fourth opens a replacement choice naming all three current models. Clear/remove operations announce changes.

- [ ] **Step 6: Verify SSR and GREEN**

Run: `npx vitest run src/frontend/model-directory-pareto.test.tsx src/frontend/model-directory-state.test.ts src/pages/models-page.test.tsx functions/models/index.test.ts && npm run lint`

Expected: PASS; server HTML includes the default catalog page, Pareto finding/table, timestamp, methodology, profile links, and pagination.

- [ ] **Step 7: Commit**

```bash
git add src/frontend/model-directory-pareto.tsx src/frontend/model-directory-pareto.test.tsx src/frontend/model-directory-state.ts src/frontend/model-directory-state.test.ts src/pages/models-page.tsx src/pages/models-page.test.tsx functions/models/index.ts functions/models/index.test.ts src/index.css
git commit -m "feat: add interactive model directory and Pareto compare"
```

### Task 5: Lifecycle Risk Management and Model Profiles

**Files:**
- Create: `src/benchmarks/lifecycle-view.ts`
- Create: `src/benchmarks/lifecycle-view.test.ts`
- Modify: `src/pages/model-lifecycle-page.tsx:1-104`
- Modify: `src/pages/model-lifecycle-page.test.tsx`
- Modify: `src/pages/model-profile-page.tsx:1-153`
- Modify: `src/pages/model-profile-page.test.tsx`
- Modify: `src/frontend/model-profile-contracts.ts`
- Modify: `src/frontend/model-profile-contracts.test.ts`
- Modify: `functions/models/[slug].ts`
- Modify: `functions/models/[slug].test.ts`
- Modify: `scripts/generate-static-pages.ts`
- Modify: `src/index.css`

**Interfaces:**
- Produces: `groupLifecycleRecords()`, separate lifecycle dates, sourced migration/delta eligibility, endpoint matrix, history/change log presentation, alias/404 handling, and compare actions.
- Consumes: model directory/profile envelopes, shared inspection/compare/CTA, existing model radar and source links.

- [ ] **Step 1: Write failing lifecycle grouping and evidence tests**

```ts
expect(groupLifecycleRecords(records, now).map((group) => group.id)).toEqual([
  'action_required', 'upcoming', 'monitoring', 'archived',
]);
expect(migrationDelta({ sourceHost: 'a', targetHost: 'b' })).toEqual({
  cost: null, speed: null, reason: 'Measurement conditions are not comparable',
});
expect(screen.getByText('Announcement date')).toBeInTheDocument();
expect(screen.getByText('Retirement date')).toBeInTheDocument();
```

- [ ] **Step 2: Confirm RED**

Run: `npx vitest run src/benchmarks/lifecycle-view.test.ts src/pages/model-lifecycle-page.test.tsx src/pages/model-profile-page.test.tsx 'functions/models/[slug].test.ts'`

Expected: FAIL because current lifecycle is flat and profile sections do not expose the full V2.1 dossier.

- [ ] **Step 3: Implement lifecycle selectors and scalable page structure**

Keep announcement, deprecation, and retirement dates distinct. Require a sourced replacement ID before rendering migration language. Group records, add search/provider/status/horizon URL controls, keep urgent group open, collapse later groups with counts, paginate/Show all, and render a vertical release timeline. Error and empty are separate states.

- [ ] **Step 4: Expand the model profile view model and page**

```ts
export interface EndpointEvidenceRow {
  readonly endpointId: string; readonly hostId: string; readonly native: boolean;
  readonly availability: string | null; readonly inputPrice: number | null;
  readonly outputPrice: number | null; readonly cacheReadPrice: number | null;
  readonly cacheWritePrice: number | null; readonly longContextRule: string | null;
  readonly ttft: number | null; readonly throughput: number | null;
  readonly conditions: string | null; readonly effectiveAt: string | null;
}
```

Render identity/lifecycle/modalities/limits, benchmark methodology/provenance, endpoint matrix, all price dimensions, measurement conditions, history/change log, workload examples, limitations, conflicts, related links, compare action, and delayed CTA. Native and host facts remain separate.

- [ ] **Step 5: Complete SSR/alias/404 behavior**

Alias requests permanently redirect to the canonical profile slug. Unknown slugs return an SSR 404 with close safe matches and primary links. Valid partial profiles retain explicit missing/conflict states and exact tables.

- [ ] **Step 6: Verify GREEN and commit**

Run: `npx vitest run src/benchmarks/lifecycle-view.test.ts src/pages/model-lifecycle-page.test.tsx src/pages/model-profile-page.test.tsx src/frontend/model-profile-contracts.test.ts 'functions/models/[slug].test.ts' scripts/generate-static-pages.test.ts && npm run lint`

Expected: PASS.

Commit:

```bash
git add src/benchmarks/lifecycle-view.ts src/benchmarks/lifecycle-view.test.ts src/pages/model-lifecycle-page.tsx src/pages/model-lifecycle-page.test.tsx src/pages/model-profile-page.tsx src/pages/model-profile-page.test.tsx src/frontend/model-profile-contracts.ts src/frontend/model-profile-contracts.test.ts 'functions/models/[slug].ts' 'functions/models/[slug].test.ts' scripts/generate-static-pages.ts src/index.css
git commit -m "feat: build lifecycle and model evidence dossiers"
```

### Task 6: Leaderboard Overview, Category Routes, and Vertical Index

**Files:**
- Create: `src/benchmarks/v21-leaderboards.ts`
- Create: `src/benchmarks/v21-leaderboards.test.ts`
- Create: `src/frontend/charts/leaderboard-vertical-chart.tsx`
- Create: `src/frontend/charts/leaderboard-vertical-chart.test.tsx`
- Modify: `src/pages/leaderboards-page.tsx:1-656`
- Modify: `src/pages/leaderboards-page.test.tsx`
- Modify: `src/frontend/leaderboard-table.tsx`
- Modify: `src/routing/routes.ts`
- Create: `functions/leaderboards/[[path]].ts`
- Create: `functions/leaderboards/[[path]].test.ts`
- Modify: `src/index.css`

**Interfaces:**
- Produces: canonical V2.1 category definitions, Top 10 overview projections, Top 20 category view model, Chart.js vertical index, Cards/Table parity, and category SSR.
- Consumes: existing leaderboard API/database projection, Task 1 compare/inspection, Task 2 charts, source ranks, provider marks, and methodology metadata.

- [ ] **Step 1: Write failing category mapping and chart tests**

```ts
const entries = Array.from({ length: 25 }, (_, index) => chartEntry({
  metric: { key: 'coding', label: 'Coding', value: 100 - index, unit: 'score', source: 'BenchLM' },
}));
expect(V21_LEADERBOARDS.map((item) => item.slug)).toEqual([
  'overall', 'coding', 'agentic', 'math', 'reasoning', 'multimodal', 'sla', 'custom',
]);
expect(buildTopEntries(entries, 20)).toHaveLength(20);
expect(screen.getByRole('img', { name: /Coding Top 20 vertical index/i })).toBeInTheDocument();
expect(screen.getByText('Reasoning model')).toBeInTheDocument();
```

- [ ] **Step 2: Confirm RED**

Run: `npx vitest run src/benchmarks/v21-leaderboards.test.ts src/frontend/charts/leaderboard-vertical-chart.test.tsx src/pages/leaderboards-page.test.tsx 'functions/leaderboards/[[path]].test.ts'`

Expected: FAIL because the required category facade, Top 10 overview, vertical index, and HTML function are absent.

- [ ] **Step 3: Define the V2.1 category facade and redirects**

Map current supported source lenses to `overall`, `coding`, `agentic`, `math`, `reasoning`, and `multimodal`. A category with no comparable published metric returns an unavailable view rather than borrowing another score. Redirect existing nested paths to the V2.1 canonical slug when their meaning is identical; retain non-equivalent legacy evidence lenses as noindex support routes.

- [ ] **Step 4: Implement the overview and category presentations**

Render seven required overview cards in order (Overall, Coding, Agentic, Math, Reasoning, Multimodal, SLA), each with definition, version, timestamp, compact chart/list, model profile links, evidence state, and category link. Category pages render Top 20 vertical bars on 0–100, integer in-bar labels, 55-degree model labels at wide viewports, provider text/color, reasoning text marker, Cards/Table, compare actions, exclusions, and methodology.

- [ ] **Step 5: Implement category SSR from the published snapshot**

`functions/leaderboards/[[path]].ts` parses the canonical category, reads the complete active revision through existing shared DB projections, renders the default Top 20 with `renderToString`, embeds serialized initial data, and returns a noindex 503 document when no valid revision exists. Client hydration must reuse the embedded view model without a second initial request.

- [ ] **Step 6: Verify GREEN and commit**

Run: `npx vitest run src/benchmarks/v21-leaderboards.test.ts src/frontend/charts/leaderboard-vertical-chart.test.tsx src/pages/leaderboards-page.test.tsx src/frontend/leaderboard-table.test.tsx 'functions/leaderboards/[[path]].test.ts' src/routing/routes.test.ts && npm run lint`

Expected: PASS; chart/list/table IDs and order match.

Commit:

```bash
git add src/benchmarks/v21-leaderboards.ts src/benchmarks/v21-leaderboards.test.ts src/frontend/charts/leaderboard-vertical-chart.tsx src/frontend/charts/leaderboard-vertical-chart.test.tsx src/pages/leaderboards-page.tsx src/pages/leaderboards-page.test.tsx src/frontend/leaderboard-table.tsx src/routing/routes.ts functions/leaderboards src/index.css
git commit -m "feat: add V2.1 leaderboard routes and vertical index"
```

### Task 7: SLA and Custom Leaderboards

**Files:**
- Create: `src/frontend/sla-leaderboard.tsx`
- Create: `src/frontend/sla-leaderboard.test.tsx`
- Create: `src/frontend/custom-leaderboard.tsx`
- Create: `src/frontend/custom-leaderboard.test.tsx`
- Create: `src/benchmarks/custom-leaderboard.ts`
- Create: `src/benchmarks/custom-leaderboard.test.ts`
- Modify: `src/pages/leaderboards-page.tsx`
- Modify: `src/pages/leaderboards-page.test.tsx`
- Modify: `functions/leaderboards/[[path]].ts`
- Modify: `src/index.css`

**Interfaces:**
- Produces: `classifySlaEvidence()`, `normalizeCustomWeights()`, `buildCustomLeaderboard()`, SLA dual bars/tables, and shareable custom ranking state.
- Consumes: Task 6 category route/SSR facade, Task 2 Chart.js wrapper, published TTFT/throughput/domain scores, Task 1 compare/inspection/analytics.

- [ ] **Step 1: Write failing SLA boundary and incomplete-evidence tests**

```ts
expect(classifySlaEvidence({ ttft: 0.8, throughput: 60 }, { maxTtft: 0.8, minThroughput: 60 })).toBe('pass');
expect(classifySlaEvidence({ ttft: null, throughput: 80 }, { maxTtft: 0.8, minThroughput: 60 })).toBe('incomplete');
expect(classifySlaEvidence({ ttft: 0.9, throughput: 80 }, { maxTtft: 0.8, minThroughput: 60 })).toBe('fail');
```

- [ ] **Step 2: Write failing custom-weight tests**

```ts
const models = [{
  id: 'balanced',
  scores: { agentic: 80, coding: 90, reasoning: 70, math: 75, multimodal: 60 },
  throughput: 100,
}, {
  id: 'fast',
  scores: { agentic: 70, coding: 70, reasoning: 70, math: 70, multimodal: 70 },
  throughput: 200,
}];
expect(normalizeCustomWeights({ agentic: 0, coding: 0, reasoning: 0, math: 0, multimodal: 0, throughput: 0 }))
  .toEqual({ ok: false, reason: 'At least one weight must be greater than zero' });
const ranking = buildCustomLeaderboard(models, {
  agentic: 25, coding: 25, reasoning: 20, math: 10, multimodal: 10, throughput: 10,
});
expect(ranking.every((row) => Number.isFinite(row.composite))).toBe(true);
expect(ranking[0]!.contributions.reduce((sum, value) => sum + value.points, 0))
  .toBeCloseTo(ranking[0]!.composite, 8);
```

- [ ] **Step 3: Confirm RED**

Run: `npx vitest run src/frontend/sla-leaderboard.test.tsx src/frontend/custom-leaderboard.test.tsx src/benchmarks/custom-leaderboard.test.ts`

Expected: FAIL because SLA/custom selectors and pages do not exist.

- [ ] **Step 4: Implement SLA controls and dual charts**

Use defaults TTFT ≤0.80s and throughput ≥60 tok/s. Pair each slider with an exact numeric input and Apply/Reset; preview locally, commit URL/analytics only on Apply. Filter eligibility without modifying source values. Render pass count, incomplete count, Cards/Table, TTFT horizontal bars/table, throughput horizontal bars/table, conditions, timestamp, compare, and inspection.

- [ ] **Step 5: Implement exact custom-score normalization**

```ts
export const CUSTOM_DOMAINS = ['agentic', 'coding', 'reasoning', 'math', 'multimodal', 'throughput'] as const;
export type CustomDomain = typeof CUSTOM_DOMAINS[number];
export type CustomWeights = Readonly<Record<CustomDomain, number>>;

function normalizeThroughput(value: number, minimum: number, maximum: number): number {
  if (maximum === minimum) return 100;
  return Math.max(0, Math.min(100, ((value - minimum) / (maximum - minimum)) * 100));
}

function weightedComposite(values: Record<CustomDomain, number>, weights: CustomWeights): number {
  const denominator = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (denominator <= 0) throw new RangeError('At least one weight must be greater than zero');
  return CUSTOM_DOMAINS.reduce((sum, domain) => sum + values[domain] * weights[domain], 0) / denominator;
}
```

Normalize Throughput over the eligible published set, document the set/min/max, exclude missing required domains under one explicit policy, expose contribution rows, provide equalize/reset/sum indicator, and serialize only validated integer weights.

- [ ] **Step 6: Add SSR/no-JS form results and verify GREEN**

The SLA/custom Pages Function branch accepts bounded GET fields, server-renders default or submitted results, and keeps the base canonical. Run:

`npx vitest run src/frontend/sla-leaderboard.test.tsx src/frontend/custom-leaderboard.test.tsx src/benchmarks/custom-leaderboard.test.ts src/pages/leaderboards-page.test.tsx 'functions/leaderboards/[[path]].test.ts' && npm run lint`

Expected: PASS; zero sum never produces NaN; chart/cards/table/SSR agree.

- [ ] **Step 7: Commit**

```bash
git add src/frontend/sla-leaderboard.tsx src/frontend/sla-leaderboard.test.tsx src/frontend/custom-leaderboard.tsx src/frontend/custom-leaderboard.test.tsx src/benchmarks/custom-leaderboard.ts src/benchmarks/custom-leaderboard.test.ts src/pages/leaderboards-page.tsx src/pages/leaderboards-page.test.tsx 'functions/leaderboards/[[path]].ts' src/index.css
git commit -m "feat: add SLA and custom leaderboards"
```

### Task 8: Compare Selector and Canonical Pair Results

**Files:**
- Modify: `src/pages/compare-hub-page.tsx:1-228`
- Modify: `src/pages/compare-hub-page.test.tsx`
- Modify: `src/frontend/comparison-page.tsx:1-462`
- Modify: `src/frontend/comparison-page.test.tsx`
- Modify: `src/frontend/comparison-summary.ts`
- Modify: `src/frontend/comparison-summary.test.ts`
- Modify: `src/frontend/comparison-radar.tsx`
- Modify: `src/frontend/comparison-radar.test.tsx`
- Create: `functions/models/compare/[pair].ts`
- Create: `functions/models/compare/[pair].test.ts`
- Modify: `functions/compare/[pair].ts`
- Modify: `functions/compare/[pair].test.ts`
- Modify: `src/routing/routes.ts`
- Modify: `src/seo/metadata.ts`
- Modify: `src/index.css`

**Interfaces:**
- Produces: exactly-two compare form, `canonicalComparisonPair()`, evidence-qualified synthesis, workload/host scenario controls, six-axis Chart.js radar/table, canonical pair SSR, and legacy redirect.
- Consumes: shared compare URL state/tray, existing `ComparisonViewModel`, published host routes, Task 1 inspection/analytics/CTA, Task 2 charts.

- [ ] **Step 1: Write failing selector/canonical tests**

```ts
expect(compareFormState(['a'])).toMatchObject({ valid: false, reason: 'Choose two models' });
expect(compareFormState(['a', 'a'])).toMatchObject({ valid: false, reason: 'Choose two different models' });
expect(canonicalComparisonPair('zeta', 'alpha')).toEqual({
  canonical: 'alpha-vs-zeta', left: 'alpha', right: 'zeta', redirected: true,
});
```

- [ ] **Step 2: Write failing synthesis tests**

```ts
expect(buildComparisonSynthesis(pairWithIncompatibleBenchmarks).conclusion)
  .toBe('The available evidence does not support one overall winner.');
expect(buildComparisonSynthesis(pairWhereBIsPricier).facts.join(' ')).not.toMatch(/-\d+% savings/);
expect(buildComparisonSynthesis(pairWithMissingPrice).winner).toBeNull();
```

- [ ] **Step 3: Confirm RED**

Run: `npx vitest run src/pages/compare-hub-page.test.tsx src/frontend/comparison-summary.test.ts src/frontend/comparison-page.test.tsx 'functions/models/compare/[pair].test.ts' src/routing/routes.test.ts`

Expected: FAIL because canonical V2.1 path, exact-two action, and evidence-qualified synthesis are incomplete.

- [ ] **Step 4: Implement the compare landing state machine**

Provide two searchable labeled selectors, Swap, Clear, popular-pair buttons that fill without navigating, shared-state prefill notice, duplicate/unknown/retired/partial-evidence messages, and a semantically disabled Compare button with `aria-describedby`. The GET form navigates without JavaScript; reviewed featured copy renders only from the allowlist.

- [ ] **Step 5: Implement pair result controls and synthesis**

Render pair/profile identities, freshness, missing-evidence status, six-axis radar and exact table, specification/score deltas, host/workload controls, alternatives, sources, methodology, edit/replace actions, and delayed CTA. Separate source facts, TokenBench calculations, and editorial conclusion; lower-is-better dimensions use direction-aware copy.

- [ ] **Step 6: Move SSR to the canonical route and retain redirect compatibility**

`functions/models/compare/[pair].ts` validates/canonicalizes the pair, returns 301 for reverse order or aliases, renders pair-specific metadata/HTML/JSON-LD/table/default scenario, and returns a useful 404/partial result. `functions/compare/[pair].ts` becomes a permanent redirect wrapper to `/models/compare/[pair]/`.

- [ ] **Step 7: Verify GREEN and commit**

Run: `npx vitest run src/pages/compare-hub-page.test.tsx src/frontend/comparison-summary.test.ts src/frontend/comparison-page.test.tsx src/frontend/comparison-radar.test.tsx 'functions/models/compare/[pair].test.ts' 'functions/compare/[pair].test.ts' src/routing/routes.test.ts src/seo/metadata.test.ts && npm run lint`

Expected: PASS; A-vs-B and B-vs-A have one canonical URL and incomplete evidence cannot yield a winner.

Commit:

```bash
git add src/pages/compare-hub-page.tsx src/pages/compare-hub-page.test.tsx src/frontend/comparison-page.tsx src/frontend/comparison-page.test.tsx src/frontend/comparison-summary.ts src/frontend/comparison-summary.test.ts src/frontend/comparison-radar.tsx src/frontend/comparison-radar.test.tsx functions/models/compare 'functions/compare/[pair].ts' 'functions/compare/[pair].test.ts' src/routing/routes.ts src/seo/metadata.ts src/index.css
git commit -m "feat: build canonical evidence-qualified comparisons"
```

### Task 9: Cost Hub, Auditable Simulator, and Interactive Breakeven

**Files:**
- Create: `src/pages/cost-page.tsx`
- Create: `src/pages/cost-page.test.tsx`
- Create: `src/frontend/breakeven-state.ts`
- Create: `src/frontend/breakeven-state.test.ts`
- Create: `src/frontend/breakeven-chart.tsx`
- Create: `src/frontend/breakeven-chart.test.tsx`
- Modify: `src/frontend/breakeven-dashboard.tsx:1-20`
- Modify: `src/frontend/breakeven-dashboard.test.tsx`
- Modify: `src/frontend/calculator-state.ts:1-380`
- Modify: `src/frontend/calculator-state.test.ts`
- Modify: `src/frontend/calculator-controls.tsx`
- Modify: `src/frontend/results-dashboard.tsx`
- Modify: `src/App.tsx:92-292`
- Create: `functions/cost/calculator.ts`
- Create: `functions/cost/calculator.test.ts`
- Create: `functions/cost/breakeven.ts`
- Create: `functions/cost/breakeven.test.ts`
- Modify: `scripts/generate-static-pages.ts`
- Modify: `src/index.css`

**Interfaces:**
- Produces: distinct Cost hub, preserved calculator flow with complete price dimensions/export, `BreakevenScenario`, `buildBreakevenResult()`, Chart.js line/table, and GET SSR results.
- Consumes: verified catalog/plan/model offers, existing calculator snapshot/share state, Task 1 analytics/CTA, Task 2 charts.

- [ ] **Step 1: Write failing hub and breakeven math tests**

```ts
const scenario = {
  seats: 10, feePerSeat: 20, maxTokensMillions: 300,
  inputShare: 0.75, inputPricePerMillion: 0.27, outputPricePerMillion: 1.10,
  capacityTokens: null,
} as const;
const result = buildBreakevenResult(scenario);
expect(result.subscriptionFee).toBe(200);
expect(result.crossoverMillions).toBeCloseTo(418.8481675, 6);
expect(result.crossoverInDomain).toBe(false);
expect(result.message).toMatch(/outside the displayed 0–300M range/i);
expect(buildBreakevenResult({ ...scenario, capacityTokens: null }).capacity).toEqual({ kind: 'unavailable' });
```

- [ ] **Step 2: Write failing calculator evidence/export tests**

```ts
expect(lineItems.find((row) => row.kind === 'source_price')!.label).toBe('Published input price');
expect(lineItems.find((row) => row.kind === 'derived_cost')!.label).toBe('Scenario input cost');
expect(csv).toContain('price_effective_at');
expect(csv).toContain('assumption');
expect(csv).not.toContain('undefined');
```

- [ ] **Step 3: Confirm RED**

Run: `npx vitest run src/pages/cost-page.test.tsx src/frontend/breakeven-state.test.ts src/frontend/breakeven-chart.test.tsx src/frontend/calculator-state.test.ts functions/cost/calculator.test.ts functions/cost/breakeven.test.ts`

Expected: FAIL because the hub, scenario controls, 0–300M chart, separate capacity evidence, and SSR functions are absent.

- [ ] **Step 4: Implement the hub and preserve the calculator flow**

Render separate Simulator/Breakeven semantic cards, input/output explanation, source coverage/freshness, and continue/start-clean behavior. Keep provider/plan/model/host/workload mix; add explicit input/output split, cache read/write, long-context tier, character/token estimate with override, source-price versus derived-line-item styling, assumptions/timestamp, versioned share, print, CSV, and delayed CTA.

- [ ] **Step 5: Implement breakeven controls, math, chart, and table**

```ts
export interface BreakevenScenario {
  readonly seats: number; readonly feePerSeat: number; readonly maxTokensMillions: 300;
  readonly inputShare: number; readonly inputPricePerMillion: number;
  readonly outputPricePerMillion: number; readonly capacityTokens: number | null;
}
```

Enforce seats 1–50, editable $20 default, volume 0–300M, model/host/workload/cache/long-context inputs, exact volume field, full-precision crossover math, display-only rounding, in-domain annotation, out-of-domain/no-crossover copy, labeled lower-cost regions, sampled semantic table, and separate capacity panel. Update only cost outputs on input events; do not rebuild unrelated charts.

- [ ] **Step 6: Implement GET SSR and no-JS results**

Both Pages Functions parse bounded fields, read verified catalog data without writes, render default/submitted forms and result tables with `renderToString`, embed initial state, use the base canonical for arbitrary query states, and return explicit invalid/partial/unavailable states.

- [ ] **Step 7: Verify GREEN and commit**

Run: `npx vitest run src/pages/cost-page.test.tsx src/frontend/breakeven-state.test.ts src/frontend/breakeven-chart.test.tsx src/frontend/breakeven-dashboard.test.tsx src/frontend/calculator-state.test.ts src/frontend/calculator-controls.test.tsx src/frontend/results-dashboard.test.tsx functions/cost/calculator.test.ts functions/cost/breakeven.test.ts scripts/generate-static-pages.test.ts && npm run lint`

Expected: PASS; chart/table/form share one result and missing capacity never suppresses a valid fee crossover.

Commit:

```bash
git add src/pages/cost-page.tsx src/pages/cost-page.test.tsx src/frontend/breakeven-state.ts src/frontend/breakeven-state.test.ts src/frontend/breakeven-chart.tsx src/frontend/breakeven-chart.test.tsx src/frontend/breakeven-dashboard.tsx src/frontend/breakeven-dashboard.test.tsx src/frontend/calculator-state.ts src/frontend/calculator-state.test.ts src/frontend/calculator-controls.tsx src/frontend/results-dashboard.tsx src/App.tsx functions/cost scripts/generate-static-pages.ts src/index.css
git commit -m "feat: add auditable cost and breakeven tools"
```

### Task 10: Articles, Required Guides, and Insights

**Files:**
- Create: `src/articles/content.ts`
- Create: `src/articles/content.test.ts`
- Create: `src/pages/articles-page.tsx`
- Create: `src/pages/articles-page.test.tsx`
- Create: `src/pages/insights-page.tsx`
- Create: `src/pages/insights-page.test.tsx`
- Modify: `src/guides/content.ts`
- Modify: `src/frontend/guides-page.tsx`
- Modify: `src/frontend/guides-page.test.tsx`
- Modify: `src/GuidesApp.tsx`
- Modify: `scripts/generate-guide-pages.ts`
- Modify: `scripts/generate-guide-pages.test.ts`
- Modify: `scripts/generate-static-pages.ts`
- Modify: `src/routing/routes.ts`
- Modify: `src/seo/metadata.ts`
- Modify: `src/index.css`

**Interfaces:**
- Produces: `ArticleRecord`, Guides/Insights channel index, eight required guide topics, insight categories/details, fact/editorial labels, related decision links, dates/corrections, and static Article/Breadcrumb output.
- Consumes: existing guide article renderer/content, route metadata/static chrome, profile/compare/lifecycle/cost route builders, Task 1 analytics/CTA.

- [ ] **Step 1: Write failing inventory and content-contract tests**

```ts
expect(REQUIRED_GUIDE_TOPICS.every((topic) => GUIDES.some((guide) => guide.topic === topic))).toBe(true);
for (const guide of GUIDES) {
  expect(guide.decisionQuestion).not.toBe('');
  expect(guide.assumptions.length).toBeGreaterThan(0);
  expect(guide.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(guide.relatedDecisionLinks.length).toBeGreaterThan(0);
}
expect(INSIGHTS.every((insight) => insight.factBlocks.length > 0 && insight.interpretationBlocks.length > 0)).toBe(true);
```

- [ ] **Step 2: Confirm RED**

Run: `npx vitest run src/articles/content.test.ts src/pages/articles-page.test.tsx src/pages/insights-page.test.tsx src/frontend/guides-page.test.tsx scripts/generate-guide-pages.test.ts`

Expected: FAIL because the channel/detail contracts and complete topic inventory are absent.

- [ ] **Step 3: Define durable article records and required content**

```ts
export interface ArticleRecord {
  readonly id: string; readonly slug: string; readonly channel: 'guide' | 'insight';
  readonly title: string; readonly topic: string; readonly publishedAt: string;
  readonly updatedAt: string; readonly featured: boolean;
  readonly factBlocks: readonly ArticleBlock[];
  readonly interpretationBlocks: readonly ArticleBlock[];
  readonly relatedDecisionLinks: readonly { label: string; href: string }[];
}

export interface ArticleBlock {
  readonly heading: string;
  readonly body: string;
  readonly sources: readonly { label: string; url: string; effectiveAt: string | null }[];
}
```

Add the eight approved guide topics exactly. Insight categories are Releases, Benchmark Analyses, Pricing Changes, Lifecycle Announcements, and Ecosystem/Technical Insights. Do not publish a price/date/model claim without source/effective date; corrections remain addressable.

- [ ] **Step 4: Implement indexes, detail pages, filters, and delayed actions**

`/articles/` separates Guides and Insights; channel indexes provide Featured/Recent/topic URL filters, counts, dates, type labels, and crawlable detail links. Guide details render decision question, answer/framework, assumptions, source blocks, limitations, related decisions, then CTA. Insight details render factual brief, changes, evidence timeline, labeled interpretation, affected models, implications, dates/corrections, and conditional CTA.

- [ ] **Step 5: Generate complete no-JS pages and structured data**

Generate `/articles/guides/[slug]/` and `/articles/insights/[slug]/` with Article and BreadcrumbList JSON-LD, all body content, sources, dates, related links, corrections, and CTA. Unknown slugs return the shared 404.

- [ ] **Step 6: Verify GREEN and commit**

Run: `npx vitest run src/articles/content.test.ts src/pages/articles-page.test.tsx src/pages/insights-page.test.tsx src/frontend/guides-page.test.tsx scripts/generate-guide-pages.test.ts scripts/generate-static-pages.test.ts src/routing/routes.test.ts src/seo/metadata.test.ts && npm run lint`

Expected: PASS; all eight topics and both channels are complete and crawlable.

Commit:

```bash
git add src/articles src/pages/articles-page.tsx src/pages/articles-page.test.tsx src/pages/insights-page.tsx src/pages/insights-page.test.tsx src/guides/content.ts src/frontend/guides-page.tsx src/frontend/guides-page.test.tsx src/GuidesApp.tsx scripts/generate-guide-pages.ts scripts/generate-guide-pages.test.ts scripts/generate-static-pages.ts src/routing/routes.ts src/seo/metadata.ts src/index.css
git commit -m "feat: build V2.1 guides and insights channels"
```

### Task 11: Cross-Route Accessibility, Theme, Responsive, Print, and SSR Hardening

**Files:**
- Modify: `src/index.css`
- Modify: `src/frontend/app-shell.tsx`
- Modify: `src/frontend/site-preferences.ts`
- Modify: `src/main.tsx`
- Modify: `src/seo/static-page.ts`
- Modify: `scripts/generate-static-pages.ts`
- Modify: `browser-tests/responsive-browser.ts:1-2469`
- Modify: `browser-tests/tokenbench-fixtures.ts`
- Modify: `src/frontend/responsive-harness.test.ts`
- Modify: `src/routing/routes.test.ts`
- Modify: `src/seo/static-page.test.ts`
- Modify: `scripts/generate-static-pages.test.ts`
- Update: `DESIGN.md`
- Update: `.impeccable/design.json`

**Interfaces:**
- Produces: synchronized chart/theme behavior, complete mobile navigation, focus/live-region policy, 320px/tablet/desktop layouts, reduced motion, print, chart-failure/no-JS fallback, useful 404s, and recorded design system.
- Consumes: every prior route/component, the approved spec, Impeccable context and finish-review workflow.

- [ ] **Step 1: Add failing browser/static regression cases**

Add Playwright cases for all six primary links, open mobile menu, 320px no overflow, 44px targets, keyboard chart/inspection/tray, light/dark chart update, reduced motion, no-JS canonical content, chart-constructor failure, print media, newsletter errors, zero-sum weights, out-of-domain crossover, same-model compare, reverse canonical redirect, and useful 404.

```ts
await expect(page.locator('body')).toHaveCSS('overflow-x', 'visible');
expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
await expect(page.getByRole('table', { name: /exact values/i })).toBeVisible();
```

- [ ] **Step 2: Confirm RED in one focused browser group**

Run: `npm run build && npm run test:browser -- --grep "V2.1 release contract"`

Expected: FAIL with missing responsive/no-JS/chart-failure assertions, not infrastructure startup errors.

- [ ] **Step 3: Apply one cross-route CSS/accessibility batch**

Use semantic foreground/background variables in both themes; 44px hit areas; 3px focus-visible outline; mobile menu with Escape/focus return; named focusable overflow regions; no color-only state; `aria-live` for compare/SLA/crossover/newsletter changes; reduced-motion chart/control transitions; printable white surfaces and visible source URLs; 320px-safe metric/filter/table/tray layouts.

- [ ] **Step 4: Complete SSR/no-JS and runtime boundaries**

Every fixed/dynamic route must render its page-specific default answer, timestamp, methodology, exact table, primary links, and next action. `main.tsx` hydrates rather than replacing valid server content. Chart errors stay inside their figure; route/data errors preserve navigation and prior valid evidence.

- [ ] **Step 5: Run Impeccable bounded review**

Run the detector once on changed UI files, build, capture desktop 1440px and mobile 320px in light and dark in one batch, send the screenshots plus approved spec and direction contract to `impeccable_finish_reviewer`, apply one material-fix batch, recapture once, obtain the verdict, then send the shipped world to `impeccable_documenter` to update `DESIGN.md` and `.impeccable/design.json`.

- [ ] **Step 6: Verify GREEN and commit**

Run:

```bash
npm run lint
npm test -- --maxWorkers=1
npm run build
npm run test:browser:production -- --grep "V2.1 release contract"
git diff --check
```

Expected: type-check, full serial suite, production build, targeted production-browser contract, and whitespace check all pass. If one of the documented baseline timing cases fails only under contention, rerun that exact test independently and record both results.

Commit:

```bash
git add src/index.css src/frontend/app-shell.tsx src/frontend/site-preferences.ts src/main.tsx src/seo/static-page.ts scripts/generate-static-pages.ts browser-tests/responsive-browser.ts browser-tests/tokenbench-fixtures.ts src/frontend/responsive-harness.test.ts src/routing/routes.test.ts src/seo/static-page.test.ts scripts/generate-static-pages.test.ts DESIGN.md .impeccable/design.json
git commit -m "feat: harden TokenBench V2.1 experience"
```

### Task 12: Integration Verification, Push, and Cloudflare Pages Preview

**Files:**
- Modify: `docs/tokenbench-deployment.md`
- Verify only: all implementation files and generated artifacts

**Interfaces:**
- Produces: clean pushed `ui-revamp-2`, immutable Cloudflare preview deployment, smoke evidence, rollback reference, and review URL.
- Consumes: all prior task commits; existing Cloudflare Pages project `tokenbench`; no production mutation.

- [ ] **Step 1: Verify commit scope and complete test matrix**

Run:

```bash
git status --short --branch
git log --oneline 096bc7f..HEAD
npm run lint
npm test -- --maxWorkers=1
npm run build
npm run test:browser:production
git diff --check 096bc7f..HEAD
```

Expected: clean branch, intentional task commits, passing type-check/tests/build/full production-browser suite, and no diff-check errors.

- [ ] **Step 2: Inspect the production artifact and route inventory**

Run:

```bash
rg -n "Home|Models|Leaderboards|Compare|Subscribe vs API|Articles" dist/index.html
test -f dist/models/index.html
test -f dist/leaderboards/sla/index.html
test -f dist/leaderboards/custom/index.html
test -f dist/cost/calculator/index.html
test -f dist/cost/breakeven/index.html
test -f dist/articles/guides/index.html
test -f dist/articles/insights/index.html
```

Expected: every command exits 0; generated HTML contains the six-section navigation and required route artifacts.

- [ ] **Step 3: Push the reviewed branch**

Run: `git push origin ui-revamp-2`

Expected: `ui-revamp-2` advances without force and `git status --branch` reports parity with `origin/ui-revamp-2`.

- [ ] **Step 4: Deploy an isolated branch preview**

Run:

```bash
npx wrangler pages deploy dist --project-name tokenbench --branch ui-revamp-2
```

Expected: Wrangler returns a successful immutable `*.tokenbench-27t.pages.dev` deployment URL. Do not promote the deployment, change the production branch, attach a custom domain, or mutate D1/R2/Worker resources.

- [ ] **Step 5: Smoke the immutable preview**

Against the returned immutable URL, verify `/`, `/models/`, `/models/lifecycle/`, one model profile, `/leaderboards/`, `/leaderboards/overall/`, `/leaderboards/sla/`, `/leaderboards/custom/`, `/compare/`, one `/models/compare/[a]-vs-[b]/`, `/cost/`, `/cost/calculator/`, `/cost/breakeven/`, `/articles/`, `/articles/guides/`, and `/articles/insights/`. Confirm status 200, canonical metadata, useful no-JS HTML, hydrated controls, chart/table parity, light/dark themes, and read-only backend calls.

- [ ] **Step 6: Record deployment evidence and commit**

Append the branch, source commit, immutable URL, UTC deployment time, smoke results, known limitations, previous known-good preview, and rollback command to `docs/tokenbench-deployment.md`.

```bash
git add docs/tokenbench-deployment.md
git commit -m "docs: record V2.1 preview deployment"
git push origin ui-revamp-2
```

Expected: deployment evidence is durable on the branch and production remains unchanged.

## Final Completion Gate

The implementation is complete only when all 12 tasks are committed; the 16 approved page contracts have task/test coverage; Chart.js charts and tables use identical selectors; custom/SLA/crossover/canonical-pair edge cases pass; complete SSR/no-JS content exists; the Impeccable verdict has no unresolved material issue or is reported exactly as returned; the branch is clean and pushed; and the immutable Cloudflare Pages preview passes smoke testing without production mutation.
