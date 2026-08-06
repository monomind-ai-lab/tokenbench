# TokenBench Leaderboards, Data Cadence, and CSV Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn leaderboards into a data-backed discovery product with Reasoning and Knowledge lenses, decision-ready picks, useful filtering, daily BenchLM checks, CSV export, and shareable state.

**Architecture:** Extend the existing explicit route-to-metric registry and materialized response pipeline rather than deriving metrics from labels. Add pure pick/filter/CSV modules around complete cached projections; keep request-time work bounded and reuse stored BenchLM projections on same-day non-BenchLM refresh runs.

**Tech Stack:** TypeScript 5.8, React 19, Cloudflare Workers/Pages Functions, D1 response cache, R2 evidence snapshots, Vitest, Testing Library, Playwright.

## Global Constraints

- BenchAlign scores are upstream BenchLM outputs and are never recalculated.
- Overall, Agentic, and Coding may use BenchAlign language; Reasoning, Multimodal, and Knowledge are category evidence lenses until upstream validation changes.
- Reasoning maps only to `benchlm:category:reasoning`; Knowledge maps only to `benchlm:category:knowledge`.
- Estimated models are opt-in and cannot receive leader, top-three, value, or winner badges.
- BenchLM network checks occur at most once per UTC day; other benchmark sources retain the combined Worker schedule.
- CSV represents the complete active filter/sort result and escapes spreadsheet formulas.
- Leaderboard headers remain typographic; generated cover images are absent.
- Preserve materialized-response integrity, atomic publication, stale variants, and bounded request-time reads.

---

## File ownership

This plan owns:

- `src/benchmarks/leaderboards.ts`, `src/benchmarks/leaderboards.test.ts`
- `src/benchmarks/decision-picks.ts`, `src/benchmarks/decision-picks.test.ts`
- `src/benchmarks/leaderboard-csv.ts`, `src/benchmarks/leaderboard-csv.test.ts`
- `src/benchmarks/leaderboard-query.ts`, `src/benchmarks/leaderboard-query.test.ts`
- `src/benchmarks/api-projections.ts`, `src/benchmarks/api-projections.test.ts`
- `src/frontend/leaderboard-filter-state.ts`, `src/frontend/leaderboard-filter-state.test.ts`
- `src/frontend/leaderboard-filters.tsx`
- `src/frontend/leaderboard-table.tsx`, `src/frontend/leaderboard-table.test.tsx`
- `src/frontend/use-benchmarks.ts`, `src/frontend/use-benchmarks.test.ts`
- `src/pages/leaderboards-page.tsx`, `src/pages/leaderboards-page.test.tsx`
- `functions/api/benchmarks.ts`, `functions/api/benchmarks.test.ts`
- `functions/api/benchmarks/leaderboards/[key].ts`
- `functions/api/benchmarks/leaderboards/[key]/csv.ts`
- `functions/api/benchmarks/leaderboards/[key]/csv.test.ts`
- `functions/_shared/benchmark-leaderboard-projection.ts`, `functions/_shared/benchmark-leaderboard-projection.test.ts`
- `workers/benchmark-ingest/src/index.ts`, `workers/benchmark-ingest/src/index.test.ts`
- `workers/benchmark-ingest/src/benchlm.ts`, `workers/benchmark-ingest/src/benchlm.test.ts`
- Sequenced additions to `src/routing/routes.ts`, route/SEO/static-generation tests, `.env.example`, deployment docs, `package.json`, `src/index.css`, and browser fixtures are Sol-owned integration surfaces.
- Leaderboard portions of `src/index.css` and `browser-tests/responsive-browser.ts`

This plan consumes semantic route patterns, `ProviderMark`, and `ShareAction`
from the foundation plan. Task 1 adds its two route keys atomically with their
definitions. Task 3 produces the stable Home summary contract; Foundation Task
5 consumes it after that commit rather than issuing interim per-leaderboard
requests.

### Task 1: Reasoning and Knowledge evidence-lens definitions

**Files:**
- Modify: `src/benchmarks/leaderboards.ts`
- Modify: `src/benchmarks/leaderboards.test.ts`
- Modify: `src/routing/routes.ts`
- Modify: `src/routing/routes.test.ts`
- Modify: `src/seo/metadata.ts`
- Modify: `src/seo/metadata.test.ts`
- Modify: `scripts/generate-static-pages.ts`
- Modify: `scripts/generate-static-pages.test.ts`
- Modify: `workers/benchmark-ingest/src/benchlm.test.ts`
- Modify: `src/frontend/use-benchmarks.test.ts`

**Interfaces:**
- Extends: `LEADERBOARD_DEFINITIONS` with `llm-reasoning` and `llm-knowledge`
- Extends atomically: `LeaderboardKey`, `LEADERBOARD_ROUTES`, metadata, sitemap/static inputs, and singular redirect coverage
- Preserves: `buildLeaderboard(key, models, metrics, prices, profile, includeEstimated?)`

- [ ] **Step 1: Write failing explicit-mapping tests**

```ts
it.each([
  ['llm-reasoning', 'benchlm:category:reasoning'],
  ['llm-knowledge', 'benchlm:category:knowledge'],
] as const)('maps %s to only its reviewed category metric', (key, metricKey) => {
  expect(LEADERBOARD_DEFINITIONS[key].metricKeys).toEqual([metricKey]);
  const result = buildLeaderboard(key, models, metrics, prices, 'balanced');
  expect(result.entries.every((entry) => entry.metric?.metricKey === metricKey)).toBe(true);
});

it('keeps a published-but-absent knowledge lens explicitly empty', () => {
  const result = buildLeaderboard('llm-knowledge', models, metricsWithoutKnowledge(), prices, 'balanced');
  expect(result.entries).toEqual([]);
});

it('publishes canonical reasoning and knowledge routes in the same change', () => {
  expect(matchRoute('/leaderboards/llm/reasoning/')).toEqual({ kind: 'leaderboard', key: 'llm-reasoning' });
  expect(matchRoute('/leaderboard/llm/knowledge')).toEqual({ kind: 'redirect', to: '/leaderboards/llm/knowledge/' });
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/benchmarks/leaderboards.test.ts src/routing/routes.test.ts src/seo/metadata.test.ts scripts/generate-static-pages.test.ts workers/benchmark-ingest/src/benchlm.test.ts src/frontend/use-benchmarks.test.ts`

Expected: FAIL because the two route definitions are absent.

- [ ] **Step 3: Add explicit definitions**

```ts
const BENCHLM_REASONING = 'benchlm:category:reasoning';
const BENCHLM_KNOWLEDGE = 'benchlm:category:knowledge';

'llm-reasoning': {
  kind: 'benchlm', sourceId: 'benchlm', metricKeys: [BENCHLM_REASONING], defaultSort: 'score-desc',
},
'llm-knowledge': {
  kind: 'benchlm', sourceId: 'benchlm', metricKeys: [BENCHLM_KNOWLEDGE], defaultSort: 'score-desc',
},
```

Reuse `isSupportedBenchLmMetric`; do not broaden methodology, unit, evidence,
or ranking-eligibility gates. Add both route records, singular redirects,
metadata, and generated sitemap/static inputs in this same task so the
`satisfies Record<LeaderboardKey, LeaderboardDefinition>` invariant always
compiles. Keep Knowledge empty/unavailable when upstream artifacts do not
contain the reviewed key; never infer it from labels or claim a validated
BenchAlign ranking.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/benchmarks/leaderboards.test.ts src/routing/routes.test.ts src/seo/metadata.test.ts scripts/generate-static-pages.test.ts workers/benchmark-ingest/src/benchlm.test.ts src/frontend/use-benchmarks.test.ts`

Expected: PASS for supported rows, excluded estimated rows by default, wrong-lens rejection, and deterministic sorting.

- [ ] **Step 5: Commit category definitions**

```bash
git add src/benchmarks/leaderboards.ts src/benchmarks/leaderboards.test.ts src/routing/routes.ts src/routing/routes.test.ts src/seo/metadata.ts src/seo/metadata.test.ts scripts/generate-static-pages.ts scripts/generate-static-pages.test.ts workers/benchmark-ingest/src/benchlm.test.ts src/frontend/use-benchmarks.test.ts
git commit -m "feat: add reasoning and knowledge leaderboards"
```

### Task 2: Once-daily BenchLM network checks with stored projection reuse

**Files:**
- Modify: `workers/benchmark-ingest/src/index.ts`
- Modify: `workers/benchmark-ingest/src/index.test.ts`
- Modify: `workers/benchmark-ingest/src/benchlm.ts` only if the existing `rehydrateBenchLmProjections` types need exporting
- Modify: `workers/benchmark-ingest/src/benchlm.test.ts`
- Modify: `docs/catalog-deployment.md`
- Modify: `docs/tokenbench-deployment.md`

**Interfaces:**
- Produces: `benchLmFetchDue(previous, checkedAt): boolean`
- Produces: `claimBenchLmDailyCheck(db, checkedAt, leaseId): Promise<boolean>` using the existing refresh-state table
- Produces: `prepareStoredBenchLmSource(bucket, allFivePreviousArtifacts): Promise<PreparedSource>`
- Preserves: twice-daily scheduled handler for LMArena/LiteLLM and atomic publication

- [ ] **Step 1: Write failing cadence tests**

```ts
it('reuses immutable BenchLM projections on a second UTC-day run while refreshing other sources', async () => {
  const first = await refreshBenchmarkRevision(env, dependencies({ now: '2026-08-06T00:15:00.000Z' }));
  expect(first.error).toBeNull();
  fetchImpl.mockClear();

  const second = await refreshBenchmarkRevision(env, dependencies({ now: '2026-08-06T12:15:00.000Z' }));
  expect(second.error).toBeNull();
  expect(fetchImpl.mock.calls.some(([url]) => String(url).startsWith('https://benchlm.ai/data/'))).toBe(false);
  expect(fetchImpl.mock.calls.some(([url]) => String(url).includes('lmarena'))).toBe(true);
  expect(fetchImpl.mock.calls.some(([url]) => String(url).includes('litellm'))).toBe(true);
});

it('checks BenchLM again on the next UTC day', async () => {
  expect(benchLmFetchDue(previousBenchLmSources('2026-08-06T00:15:00.000Z'), '2026-08-07T00:15:00.000Z')).toBe(true);
});

it('allows only one concurrent daily network-check lease', async () => {
  const [first, second] = await Promise.all([
    claimBenchLmDailyCheck(db, '2026-08-06T00:15:00.000Z', 'lease-a'),
    claimBenchLmDailyCheck(db, '2026-08-06T00:15:00.000Z', 'lease-b'),
  ]);
  expect([first, second].filter(Boolean)).toHaveLength(1);
});

it('updates freshness after a 304 without publishing a new content revision', async () => {
  const before = activeRevision(db);
  await refreshBenchmarkRevision(env, dependencies({ now: '2026-08-07T00:15:00.000Z', benchLmStatus: 304 }));
  expect(activeRevision(db).revision).toBe(before.revision);
  expect(activeRevision(db).checkedAt).toBe('2026-08-07T00:15:00.000Z');
  expect(publishedRevisionCount(db)).toBe(1);
});
```

- [ ] **Step 2: Run the worker tests and verify RED**

Run: `npm test -- workers/benchmark-ingest/src/index.test.ts -t "UTC-day|BenchLM"`

Expected: FAIL because every scheduled run currently makes conditional BenchLM requests.

- [ ] **Step 3: Implement due checking and immutable reuse**

`benchLmFetchDue` returns true when any required artifact is missing, its
`observedAt` is invalid, or the most recent BenchLM observation has a different
UTC calendar date from `checkedAt`.

Before a due network check, atomically claim a synthetic
`benchmark_refresh_state` row for `benchlm/daily-network-check` with a unique
lease ID. Use a bounded 15-minute lease so an abandoned invocation can be
retried; complete it with that day's successful check timestamp, and release it
on a handled failure. The conditional D1 statement's change count decides the
winner, so overlapping cron/manual invocations cannot both fetch upstream. This
uses the existing table and requires no schema migration.

`prepareStoredBenchLmSource` must:

1. Require all five active BenchLM artifacts.
2. Read and hash-check each immutable R2 projection with the existing local `readStoredBytes`.
3. Pass stored projections through the existing `rehydrateBenchLmProjections` and `parseBenchLm` exports.
4. Preserve each stored record's observed time, ETag, last-modified value,
   original hash, and snapshot key.
5. Return no new evidence writes.

Select the source path inside `refreshBenchmarkRevision`:

```ts
const benchLm = benchLmFetchDue(previous, checkedAt)
  ? await prepareBenchLmSource(env.SOURCE_SNAPSHOTS, previous, checkedAt, dependencies)
  : await prepareStoredBenchLmSource(env.SOURCE_SNAPSHOTS, previous);
```

- [ ] **Step 4: Run worker tests and verify GREEN**

Run: `npm test -- workers/benchmark-ingest/src/index.test.ts workers/benchmark-ingest/src/benchlm.test.ts`

Expected: PASS for first run, same-day reuse, next-day fetch, exactly-one concurrent lease winner, expired-lease recovery, failure release, all-five-artifact selection, missing/corrupt stored projection failure, 304 freshness with unchanged revision count, and atomic rollback.

- [ ] **Step 5: Commit cadence behavior**

```bash
git add workers/benchmark-ingest/src/index.ts workers/benchmark-ingest/src/index.test.ts workers/benchmark-ingest/src/benchlm.ts workers/benchmark-ingest/src/benchlm.test.ts docs/catalog-deployment.md docs/tokenbench-deployment.md
git commit -m "feat: align BenchLM refresh cadence"
```

### Task 3: Materialized decision-ready picks

**Files:**
- Create: `src/benchmarks/decision-picks.ts`
- Create: `src/benchmarks/decision-picks.test.ts`
- Modify: `src/benchmarks/api-projections.ts`
- Create: `src/benchmarks/api-projections.test.ts`
- Modify: `functions/api/benchmarks.ts`
- Modify: `functions/api/benchmarks.test.ts`
- Modify: `workers/benchmark-ingest/src/index.test.ts`
- Modify: `src/frontend/use-benchmarks.ts`
- Modify: `src/frontend/use-benchmarks.test.ts`

**Interfaces:**
- Produces: `decisionPicks(snapshot): readonly DecisionPickGroup[]`
- `DecisionPickGroup = { key: LeaderboardKey; label: string; status: 'benchalign' | 'evidence-lens'; entries: readonly DecisionPickEntry[] }`
- `DecisionPickEntry = { rank: number; modelKey: string; slug: string; name: string; provider: string; score: number; unit: string; evidenceStatus: 'supported'; updatedAt: string; routePath: string; representativePriceUsdPerMillion: number | null; contextWindowTokens: number | null }`
- Produces: `HomeDecisionSnapshot` with discriminated `benchAlignLeader`, `valueFrontierLeader`, `lowestVerifiedRepresentativeRate`, and `pricePerformancePoints` fields
- Produces: `useDecisionPicks(): DecisionPicksState` and `useHomeDecisionSnapshot(): HomeDecisionSnapshotState` from one summary request

- [ ] **Step 1: Write failing supported-only pick tests**

```ts
it('publishes at most three supported picks in approved category order', () => {
  const groups = decisionPicks(snapshotWithSupportedAndEstimatedModels());
  expect(groups.map((group) => group.key)).toEqual([
    'llm-overall', 'llm-agentic', 'llm-coding', 'llm-reasoning', 'multimodal-vision-documents', 'llm-knowledge',
  ]);
  expect(groups.every((group) => group.entries.length <= 3)).toBe(true);
  expect(groups.flatMap((group) => group.entries).some((entry) => entry.evidenceStatus === 'estimated')).toBe(false);
  expect(groups.find((group) => group.key === 'llm-reasoning')?.status).toBe('evidence-lens');
  expect(groups[0].label).toBe('BenchAlign leaders');
  expect(groups.flatMap((group) => group.entries).every((entry) => entry.rank > 0 && entry.updatedAt.length > 0)).toBe(true);
});

it('materializes the four Home decision fields without sample fallbacks', () => {
  const home = homeDecisionSnapshot(snapshotWithSupportedAndEstimatedModels());
  expect(home.benchAlignLeader.status).toBe('ready');
  expect(home.valueFrontierLeader.status).toBe('ready');
  expect(home.lowestVerifiedRepresentativeRate.status).toBe('ready');
  expect(home.pricePerformancePoints.every((point) => point.evidenceStatus === 'supported')).toBe(true);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/benchmarks/decision-picks.test.ts src/benchmarks/api-projections.test.ts functions/api/benchmarks.test.ts src/frontend/use-benchmarks.test.ts`

Expected: FAIL because summary envelopes contain availability and compare data but no decision picks.

- [ ] **Step 3: Implement the pure projection and summary contract**

Call `buildLeaderboard` once per approved key with `includeEstimated = false`,
take the first three entries, and project only model identity, provider, metric
value/unit, evidence state, one-based rank, price/context facts, route path, and
the metric's source-artifact observation time used as `updatedAt`. Label the
overall group exactly “BenchAlign leaders.” A category with no qualifying row
is an empty group, never a guessed result.

Derive Home's BenchAlign and value leaders from supported Overall/Value results.
Define the representative API rate as the balanced 50/50 input/output cost of a
primary verified route, requiring both published rates; choose the lowest with
existing deterministic tie breakers. Plot only supported models that have both
an eligible Overall score and that representative rate. Every scalar slot is
`{ status: 'ready', value, updatedAt } | { status: 'unavailable' }`.

Add both projections to the canonical
`src/benchmarks/api-projections.ts::buildBenchmarkSummaryData`. Make the Pages
fallback delegate to that implementation instead of maintaining a second data
shape. The worker's existing summary materialization then caches identical
fresh/stale envelopes.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/benchmarks/decision-picks.test.ts src/benchmarks/api-projections.test.ts functions/api/benchmarks.test.ts src/frontend/use-benchmarks.test.ts workers/benchmark-ingest/src/index.test.ts`

Expected: PASS for empty categories, supported-only groups, explicit ranks/update dates, exact BenchAlign label, all four Home fields, representative-rate rules, accessible plot facts, stable order, cache/fallback envelope equality, summary materialization, validation, and stale state.

- [ ] **Step 5: Commit decision picks**

```bash
git add src/benchmarks/decision-picks.ts src/benchmarks/decision-picks.test.ts src/benchmarks/api-projections.ts src/benchmarks/api-projections.test.ts functions/api/benchmarks.ts functions/api/benchmarks.test.ts workers/benchmark-ingest/src/index.test.ts src/frontend/use-benchmarks.ts src/frontend/use-benchmarks.test.ts
git commit -m "feat: publish decision-ready leaderboard picks"
```

### Task 4: Visual leaderboard index and semantic method context

**Files:**
- Create: `src/pages/leaderboards-page.test.tsx`
- Modify: `src/pages/leaderboards-page.tsx`
- Modify: `src/frontend/leaderboard-table.tsx`
- Modify: `src/frontend/leaderboard-table.test.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `useDecisionPicks`, semantic route labels, `ProviderMark`
- Preserves: `LeaderboardPage({ keyName })` route component
- Hands off: `useHomeDecisionSnapshot` to Foundation Task 5 without modifying Home here

- [ ] **Step 1: Write failing directory and Home consolidation tests**

```ts
it('shows decision-ready top-three groups before the full directory', async () => {
  render(<LeaderboardDirectoryPage />);
  expect(screen.getByRole('heading', { name: 'Model leaderboards', level: 1 })).toBeInTheDocument();
  expect(screen.getByText('Explore current model leaders by capability, workload, cost, and human preference.')).toBeInTheDocument();
  const picks = await screen.findByRole('region', { name: 'Decision-ready picks' });
  expect(within(picks).getByRole('heading', { name: 'BenchAlign' })).toBeInTheDocument();
  expect(within(picks).getByRole('heading', { name: 'Knowledge' })).toBeInTheDocument();
  const codingCard = within(picks).getByRole('region', { name: 'Coding leaders' });
  expect(within(codingCard).getAllByText(/Rank [1-3]/)).toHaveLength(3);
  expect(within(codingCard).getAllByText(/Updated /)).toHaveLength(3);
  expect(within(codingCard).getByRole('link', { name: 'View full Coding benchmark' })).toHaveAttribute('href', '/leaderboards/llm/coding/');
  expect(screen.getByRole('link', { name: 'How BenchAlign rankings work' })).toHaveAttribute('href', '/methodology/benchalign/');
  expect(document.querySelector('.leaderboard-cover-image')).toBeNull();
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/pages/leaderboards-page.test.tsx src/frontend/leaderboard-table.test.tsx`

Expected: FAIL because the directory is static and category cards do not show complete top-three data.

- [ ] **Step 3: Implement index cards and switch Home to the summary hook**

Render six pick groups first, then the full grouped directory. Every directory
card shows its current supported leader and top-three preview with rank,
provider mark/name, score/unit, supported evidence label, update date, and a
full-view link. A category without entries renders “No supported ranking is
published.” Use no artwork slot. Keep BenchAlign leaders visually and textually
distinct from the five category evidence lenses. Use the exact H1 and
description asserted above, and the semantic route titles from the approved
directory without repeating “AI model.”

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/pages/leaderboards-page.test.tsx src/frontend/leaderboard-table.test.tsx src/frontend/use-benchmarks.test.ts`

Expected: PASS for ready/stale/empty envelopes, one summary request, supported-only picks, complete card facts, semantic titles, evidence-lens labels, and no cover imagery.

- [ ] **Step 5: Commit index discovery**

```bash
git add src/pages/leaderboards-page.tsx src/pages/leaderboards-page.test.tsx src/frontend/leaderboard-table.tsx src/frontend/leaderboard-table.test.tsx src/index.css
git commit -m "feat: make leaderboards decision ready"
```

### Task 5: Data-supported filters, sorting, and shareable query state

**Files:**
- Create: `src/benchmarks/leaderboard-query.ts`
- Create: `src/benchmarks/leaderboard-query.test.ts`
- Create: `src/frontend/leaderboard-filter-state.ts`
- Create: `src/frontend/leaderboard-filter-state.test.ts`
- Modify: `src/frontend/leaderboard-filters.tsx`
- Modify: `src/frontend/leaderboard-table.tsx`
- Modify: `src/frontend/leaderboard-table.test.tsx`
- Modify: `src/pages/leaderboards-page.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Produces: shared `LeaderboardQueryState` and `LeaderboardQueryCapabilities`
- Produces: `parseLeaderboardQuery(params, definition, capabilities, mode: 'ui' | 'api'): LeaderboardQueryParseResult`
- Produces: `filterLeaderboardEntries(entries, state): readonly LeaderboardEntry[]`
- Produces: `leaderboardQueryToSearchParams(state): URLSearchParams`

- [ ] **Step 1: Write failing predicate and URL-round-trip tests**

```ts
it('applies only filters supported by the route data', () => {
  const filtered = filterLeaderboardEntries(entries, {
    query: 'alpha', providers: ['Provider A'], sourceTypes: ['Open Weight'],
    evidence: 'supported', priceMinimum: 0, priceMaximum: 5,
    metricKey: 'benchlm:category:coding', sort: 'score-desc', profile: 'balanced',
  });
  expect(filtered.map((entry) => entry.model.slug)).toEqual(['alpha']);
});

it('round trips stable leaderboard query state', () => {
  const params = leaderboardQueryToSearchParams(state);
  expect(parseLeaderboardQuery(params, LEADERBOARD_DEFINITIONS['llm-coding'], capabilities, 'ui'))
    .toEqual({ ok: true, state });
});

it.each([
  'unknown=1', 'profile=not-real', 'provider=Missing',
  'metric=benchlm%3Acategory%3Aagentic', 'lifecycle=current',
  'minPrice=9&maxPrice=2', 'evidence=estimated&estimated=0',
  `q=${'x'.repeat(121)}`, 'sort=score-desc&sort=price-asc',
])('strict API mode rejects unsupported query: %s', (query) => {
  expect(parseLeaderboardQuery(new URLSearchParams(query), definition, capabilities, 'api'))
    .toMatchObject({ ok: false, status: 400 });
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/benchmarks/leaderboard-query.test.ts src/frontend/leaderboard-filter-state.test.ts src/frontend/leaderboard-table.test.tsx`

Expected: FAIL because current filters cover only search, workload, sort, and estimated inclusion.

- [ ] **Step 3: Implement pure filtering and route-derived controls**

Move the current type/parser/serializer out of
`src/frontend/leaderboard-filters.tsx` atomically; do not create a second
`LeaderboardFilterState`. The shared parser allowlists `q`, `profile`, `metric`,
`sort`, `provider`, `evidence`, `sourceType`, `lifecycle`, `minPrice`, `maxPrice`,
and `estimated`. API mode rejects unknown/duplicate/malformed/oversized values
and values absent from route capabilities with a structured 400. UI mode ignores
unknown keys as required for shared URLs, normalizes invalid known values to
route defaults, and serializes only canonical state.

Filter order is query, provider display name (`entry.model.creator`), source
type, evidence, price range, then selected metric availability. Sort last with
the existing deterministic tie-breakers. Omit price controls when no entry has
a price; because the current contract has no lifecycle fact, omit that control
and reject `lifecycle` in API mode. Show workload profile only for Value and
Pricing & context. On those routes, price filter/sort uses the visible profile's
`blendedCostPerMillion`. On every other route, use the explicit fixed
representative rate (50/50 input/output on the primary verified route, requiring
both rates) and reject a non-default `profile` query so no hidden profile can
change results. Estimated inclusion remains unchecked by default and estimated
rows remain ineligible for badges.

Initialize from `window.location.search`; use `history.replaceState` on control
changes so Share receives a restorable URL without creating a history entry per
keystroke.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/benchmarks/leaderboard-query.test.ts src/frontend/leaderboard-filter-state.test.ts src/frontend/leaderboard-table.test.tsx`

Expected: PASS for each supported filter, strict API errors, unknown UI-key ignoring, unsupported-control omission, visible-profile value/pricing semantics, fixed representative prices elsewhere, estimated exclusion, sort labels, canonical URL round trip, mobile cards, and empty results.

- [ ] **Step 5: Commit filters**

```bash
git add src/benchmarks/leaderboard-query.ts src/benchmarks/leaderboard-query.test.ts src/frontend/leaderboard-filter-state.ts src/frontend/leaderboard-filter-state.test.ts src/frontend/leaderboard-filters.tsx src/frontend/leaderboard-table.tsx src/frontend/leaderboard-table.test.tsx src/pages/leaderboards-page.tsx src/index.css
git commit -m "feat: expand leaderboard exploration controls"
```

### Task 6: Complete filtered CSV export

**Files:**
- Create: `src/benchmarks/leaderboard-csv.ts`
- Create: `src/benchmarks/leaderboard-csv.test.ts`
- Create: `functions/_shared/benchmark-leaderboard-projection.ts`
- Create: `functions/_shared/benchmark-leaderboard-projection.test.ts`
- Create: `functions/api/benchmarks/leaderboards/[key]/csv.ts`
- Create: `functions/api/benchmarks/leaderboards/[key]/csv.test.ts`
- Modify: `functions/api/benchmarks/leaderboards/[key].ts` to consume the shared projection reader/parser
- Modify: `src/pages/leaderboards-page.tsx`

**Interfaces:**
- Produces: `readCompleteLeaderboardProjection(db, key, profile, includeEstimated): Promise<BenchmarkEnvelope<LeaderboardResult> | null>` over the existing materialized projection cache key
- Produces: `csvCell(value: unknown): string`
- Produces: `leaderboardCsv(result, filters): string` from the shared pure benchmark module
- Route: `GET /api/benchmarks/leaderboards/:key/csv`

- [ ] **Step 1: Write failing CSV correctness and security tests**

```ts
it('exports the complete filtered ordering with revision headers', async () => {
  const response = await onRequestGet(csvContext('/api/benchmarks/leaderboards/llm-coding/csv?provider=Provider%20A&sort=score-desc'));
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('text/csv');
  expect(response.headers.get('x-tokenbench-revision')).toBe(REVISION);
  expect(await response.text()).toContain('rank,model,provider,evidence_status,score,unit');
});

it('escapes formula-leading cells', () => {
  expect(csvCell('=HYPERLINK("https://bad")')).toBe("'=HYPERLINK(\"https://bad\")");
});

it('rejects filters the leaderboard does not support', async () => {
  const response = await onRequestGet(csvContext('/api/benchmarks/leaderboards/llm-coding/csv?sort=context-desc&profile=not-real'));
  expect(response.status).toBe(400);
});

it('exports exactly the same complete order as the UI predicate', async () => {
  const query = '?provider=Provider%20A&profile=balanced&sort=score-desc&q=alpha';
  const response = await onRequestGet(csvContext(`/api/benchmarks/leaderboards/llm-coding/csv${query}`));
  expect(csvModelOrder(await response.text())).toEqual(
    filterLeaderboardEntries(fullProjection.entries, parsedState(query)).map((entry) => entry.model.name),
  );
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/benchmarks/leaderboard-query.test.ts src/benchmarks/leaderboard-csv.test.ts functions/_shared/benchmark-leaderboard-projection.test.ts functions/api/benchmarks/leaderboards/'[key]'/csv.test.ts`

Expected: FAIL because the CSV route and complete-projection reader are absent.

- [ ] **Step 3: Implement bounded projection reads and CSV serialization**

Read the already materialized complete projection through
`readApiResponseCache` and the existing
`benchmarkLeaderboardProjectionCacheKey`; preserve envelope revision,
freshness, publication time, and stale semantics and do not scan benchmark fact
tables. Use the same shared strict query parser and pure filter/sort module as
the UI. Keep serialization in `src/benchmarks/leaderboard-csv.ts` so the Pages
Function and monthly cheatsheet generator consume one escaping contract.
Serialize route-kind-specific stable columns with CRLF rows, RFC 4180
quoting, empty nulls, and a leading apostrophe for cells beginning with `=`, `+`,
`-`, or `@`. Set attachment `Content-Disposition` with category and snapshot
date plus revision, publication, and methodology headers. Return a structured
400 for every strict-parser error rather than silently normalizing it.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/benchmarks/leaderboard-query.test.ts src/benchmarks/leaderboard-csv.test.ts functions/_shared/benchmark-leaderboard-projection.test.ts functions/api/benchmarks/leaderboards/'[key]'/csv.test.ts src/frontend/leaderboard-filter-state.test.ts`

Expected: PASS for all route kinds, every allowlisted filter, UI/CSV order equality, pagination-independent totals, fresh/stale cache metadata, unknown/duplicate/invalid/unsupported query 400s, snapshot-date filenames, quotes/newlines, formula escaping, and unavailable values.

- [ ] **Step 5: Add the Download CSV action and commit**

Build the URL from current filter state, render it as a normal download link,
and keep Share adjacent in the detail header.

```bash
git add src/benchmarks/leaderboard-csv.ts src/benchmarks/leaderboard-csv.test.ts functions/_shared/benchmark-leaderboard-projection.ts functions/_shared/benchmark-leaderboard-projection.test.ts functions/api/benchmarks/leaderboards/'[key]'.ts functions/api/benchmarks/leaderboards/'[key]'/csv.ts functions/api/benchmarks/leaderboards/'[key]'/csv.test.ts src/pages/leaderboards-page.tsx
git commit -m "feat: export filtered leaderboard CSV"
```

### Task 7: Detail-page hierarchy, Share, and responsive verification

**Files:**
- Modify: `src/pages/leaderboards-page.tsx`
- Modify: `src/pages/leaderboards-page.test.tsx`
- Modify: `src/frontend/leaderboard-table.tsx`
- Modify: `src/frontend/leaderboard-table.test.tsx`
- Modify: `browser-tests/responsive-browser.ts`
- Modify: `browser-tests/tokenbench-fixtures.ts`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `ShareAction`, filter-state codec, CSV route, `ProviderMark`
- Preserves: desktop table/mobile ordered-card equivalence

- [ ] **Step 1: Write failing detail hierarchy tests**

```ts
it('places actions and picks before filters and consolidates provenance', async () => {
  render(<LeaderboardPage keyName="llm-coding" />);
  const heading = await screen.findByRole('heading', { name: 'Coding', level: 1 });
  expect(heading).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Share leaderboard' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Download CSV' })).toHaveAttribute('href', expect.stringContaining('/csv'));
  expect(screen.getAllByText('Evidence and methodology')).toHaveLength(1);
  expect(document.querySelector('.leaderboard-cover-image')).toBeNull();
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/pages/leaderboards-page.test.tsx src/frontend/leaderboard-table.test.tsx`

Expected: FAIL until detail actions, semantic H1, picks, and consolidated provenance are implemented.

- [ ] **Step 3: Recompose detail pages and browser fixtures**

Use typographic header, available decision picks, filters, results, one evidence
section, and related links. Share the current canonical path plus query state.
Use provider marks in desktop and mobile results while keeping textual provider
labels. Add no cover-image DOM.

- [ ] **Step 4: Run plan verification**

Run:

```bash
npm test -- src/routing/routes.test.ts src/seo/metadata.test.ts scripts/generate-static-pages.test.ts src/benchmarks/leaderboards.test.ts src/benchmarks/decision-picks.test.ts src/benchmarks/api-projections.test.ts src/benchmarks/leaderboard-query.test.ts src/benchmarks/leaderboard-csv.test.ts src/frontend/leaderboard-filter-state.test.ts src/frontend/leaderboard-table.test.tsx src/pages/leaderboards-page.test.tsx src/frontend/use-benchmarks.test.ts functions/api/benchmarks.test.ts functions/_shared/benchmark-leaderboard-projection.test.ts functions/api/benchmarks/leaderboards/'[key]'/csv.test.ts workers/benchmark-ingest/src/benchlm.test.ts workers/benchmark-ingest/src/index.test.ts
npm run lint
npm run build
npm run test:browser -- --grep "leaderboard"
git diff --check
```

Expected: all commands exit 0 across supported, estimated, stale, unavailable, desktop, and mobile states.

- [ ] **Step 5: Commit leaderboard presentation and coverage**

```bash
git add src/pages/leaderboards-page.tsx src/pages/leaderboards-page.test.tsx src/frontend/leaderboard-table.tsx src/frontend/leaderboard-table.test.tsx browser-tests/responsive-browser.ts browser-tests/tokenbench-fixtures.ts src/index.css
git commit -m "feat: complete leaderboard decision surfaces"
```
