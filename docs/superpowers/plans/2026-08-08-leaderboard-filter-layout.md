# Leaderboard Filter and Sort Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved four-row leaderboard filter panel with provider tags, a complete-projection price range, plain-language labels, and responsive behavior that remains accessible at 320 px.

**Architecture:** Extend `LeaderboardQueryCapabilities` with a validated, sorted `priceValues` domain derived from the complete leaderboard projection so the UI never infers bounds from a paginated result. Keep URL state numeric and unchanged, while a small pure frontend adapter maps exact numeric bounds to discrete slider indices. Refactor the form into semantic row wrappers, then style and verify those rows independently across breakpoints and themes.

**Tech Stack:** TypeScript 5.8, React 19, Vitest, Testing Library, Playwright, CSS custom properties, Cloudflare Pages Functions contracts

## Global Constraints

- Search model or provider is the first, full-width common row.
- The second common row contains Metric lens, Sort leaderboard, and Evidence in that DOM order; unsupported controls are omitted and the remaining controls expand.
- Providers are `type="button"` toggles with `aria-pressed`, a leading checkmark when selected, and a minimum 44 px touch target.
- Provider tags wrap on desktop/tablet and remain in one locally horizontally scrollable line on mobile; the document must not overflow at 320 px.
- Price values come from the complete leaderboard projection and use workload-profile prices only on profile-aware routes and representative prices everywhere else.
- The default price state spans the complete published range and keeps `minPrice` and `maxPrice` absent from the URL.
- Existing numeric shared-URL bounds remain exact; missing-price records remain visible only while both price bounds are open.
- A single distinct published price renders a noninteractive summary; no published prices render no price control.
- The estimated control is named `Include estimated models`, with helper copy `Estimated entries stay unranked and do not receive leader badges.` No `BenchLM` text appears in this filter control.
- Workload profile and Source type remain conditional supplementary controls after all four common rows; their capability and URL meanings do not change.
- DOM order and visual order agree at every breakpoint. Every interactive control has a visible focus state and an explicit accessible name.
- Preserve light and dark theme tokens, existing query keys, CSV/share URL behavior, score/ranking behavior, and all loading/error/result semantics.
- Add no new runtime dependency and do not modify or restart the live preview on port 4174 during automated tests.
- Follow strict RED → verify failure → GREEN → verify pass for every behavior change.

---

### Task 1: Publish, cache, and validate the complete price domain

**Files:**
- Modify: `src/benchmarks/leaderboard-query.ts:31-205`
- Test: `src/benchmarks/leaderboard-query.test.ts`
- Modify: `src/frontend/use-benchmarks.ts:160-184`
- Test: `src/frontend/use-benchmarks.test.ts`
- Modify: `src/pages/leaderboards-page.tsx:58-81`
- Test: `src/pages/leaderboards-page.test.tsx`
- Modify: `src/benchmarks/api-response-cache-keys.ts:7-33`
- Modify: `workers/benchmark-ingest/src/index.ts:2013-2085`
- Test: `workers/benchmark-ingest/src/index.test.ts:1285-1355`
- Test: `functions/api/benchmarks.test.ts:579-607`
- Modify: `browser-tests/tokenbench-fixtures.ts:186-294`
- Test: `functions/api/benchmarks/leaderboards/[key]/csv.test.ts`

**Interfaces:**
- Consumes: `priceForEntry(entry, mode)` in `src/benchmarks/leaderboard-query.ts`, which already owns representative-versus-profile price truth.
- Produces: required `LeaderboardQueryCapabilities.priceValues: readonly number[] | null`; `null` means the complete projection is not loaded, `[]` means loaded with no supported price, and a nonempty array is finite, nonnegative, strictly increasing, and duplicate-free.
- Preserves: `supportsPrice: boolean | null` for existing API-query validation; when data is ready it must equal `priceValues.length > 0`.
- Produces: materialized first-page payloads with the same complete-projection capabilities as the dynamic Function path.
- Produces: versioned first-page cache keys prefixed `leaderboard:v2:` so pre-change payloads without `priceValues` are bypassed until the next ingest publication; complete-projection cache keys remain unchanged.

- [ ] **Step 1: Write failing capability-domain tests**

Add literal, behavior-level tests to `src/benchmarks/leaderboard-query.test.ts`. The production mutation these tests catch is deriving the wrong price mode, preserving duplicates, or publishing an unsorted/incomplete domain.

```ts
it('publishes sorted unique representative prices from the complete projection', () => {
  const definition = LEADERBOARD_DEFINITIONS['llm-coding'];
  const prices = [
    entry({ primaryPrice: { ...entry().primaryPrice!, inputUsdPerMillion: 0.125, outputUsdPerMillion: 0.125 } }),
    entry({ primaryPrice: { ...entry().primaryPrice!, inputUsdPerMillion: 1, outputUsdPerMillion: 9 } }),
    entry({ primaryPrice: { ...entry().primaryPrice!, inputUsdPerMillion: 5, outputUsdPerMillion: 5 } }),
    entry({ primaryPrice: { ...entry().primaryPrice!, inputUsdPerMillion: 1, outputUsdPerMillion: null } }),
  ];

  const capabilities = createLeaderboardQueryCapabilities(definition, prices);

  expect(capabilities.priceValues).toEqual([0.125, 5]);
  expect(capabilities.supportsPrice).toBe(true);
});

it('publishes profile prices without falling back to representative prices', () => {
  const definition = LEADERBOARD_DEFINITIONS['llm-value'];
  const prices = [
    entry({ blendedCostPerMillion: 2 }),
    entry({ blendedCostPerMillion: 0.25 }),
    entry({ blendedCostPerMillion: 2 }),
    entry({ blendedCostPerMillion: null }),
  ];

  expect(createLeaderboardQueryCapabilities(definition, prices).priceValues)
    .toEqual([0.25, 2]);
});

it('distinguishes an unknown projection from a loaded projection with no price', () => {
  const definition = LEADERBOARD_DEFINITIONS['llm-coding'];

  expect(createLeaderboardQueryCapabilities(definition).priceValues).toBeNull();
  expect(createLeaderboardQueryCapabilities(definition, []).priceValues).toEqual([]);
});
```

- [ ] **Step 2: Run the query tests and verify RED**

Run:

```bash
npm test -- src/benchmarks/leaderboard-query.test.ts
```

Expected: FAIL because `LeaderboardQueryCapabilities` has no `priceValues` and the returned capabilities do not expose the complete numeric domain.

- [ ] **Step 3: Implement the minimal capability projection**

Add the required property and derive it once from the same pricing function used for filtering.

```ts
export interface LeaderboardQueryCapabilities {
  // existing fields
  readonly supportsPrice: boolean | null;
  readonly priceValues: readonly number[] | null;
  // existing fields
}

function priceValuesFor(
  entries: readonly LeaderboardEntry[],
  mode: LeaderboardPriceMode,
): readonly number[] {
  return [...new Set(entries
    .map((entry) => priceForEntry(entry, mode))
    .filter((value): value is number => value !== null))]
    .sort((left, right) => left - right);
}

const priceValues = routeEntriesKnown ? priceValuesFor(routeEntries, priceMode) : null;

return {
  // existing fields
  supportsPrice: priceValues === null ? null : priceValues.length > 0,
  priceValues,
  // existing fields
};
```

Do not derive this array from filtered or paginated UI entries. `functions/api/benchmarks/leaderboards/[key].ts` already calls `createLeaderboardQueryCapabilities` with the complete projection before slicing the response page.

- [ ] **Step 4: Run the query tests and verify GREEN**

Run:

```bash
npm test -- src/benchmarks/leaderboard-query.test.ts
```

Expected: PASS with the new representative, profile, unknown, and empty-domain cases.

- [ ] **Step 5: Write failing client-contract tests**

In `src/frontend/use-benchmarks.test.ts`, extend the complete value projection fixture with `priceValues: [2]`, then add a rejection test whose mutation is an unsorted or contradictory capability domain.

```ts
it('rejects a complete projection with a malformed price domain', async () => {
  const filters: LeaderboardQueryState = {
    query: '',
    profile: 'balanced',
    priceMode: 'profile',
    metricKey: null,
    sort: 'pareto-score-desc',
    providers: [],
    sourceTypes: [],
    evidence: null,
    priceMinimum: null,
    priceMaximum: null,
    includeEstimated: false,
  };
  const payload = leaderboardEnvelope();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
    ...payload,
    data: {
      ...payload.data,
      pagination: { limit: 50, total: 1, nextCursor: null },
      capabilities: {
        ...payload.data.capabilities,
        supportsPrice: true,
        priceValues: [5, 2, 2],
      },
    },
  })));

  const { result } = renderHook(() => useBenchmarkLeaderboard(
    'llm-value', 'balanced', 50, undefined, false, filters,
  ));

  await waitFor(() => expect(result.current.phase).toBe('unavailable'));
  expect(result.current.envelope).toBeNull();
});
```

Keep the expected malformed domain literal; do not construct it with production helpers.

In `workers/benchmark-ingest/src/index.test.ts`, update the materialized-response test to look up the new `leaderboard:v2:llm-overall:balanced:50::0` key and assert that both fresh and estimated first-page payloads contain `capabilities: { dataReady: true, supportsPrice: false, priceValues: [] }`. The seeded overall projection has no exact OpenRouter route for its ranked BenchLM model, so an empty literal domain is the truthful expectation. In `functions/api/benchmarks.test.ts`, add complete ready `capabilities` with `supportsPrice: false` and `priceValues: []` to the cached-body fixture and change all first-page cache keys to `leaderboard:v2:...`. The mutation caught is a cached 200 response that bypasses dynamic derivation but lacks the range contract.

- [ ] **Step 6: Run the client contract tests and verify RED**

Run:

```bash
npm test -- src/frontend/use-benchmarks.test.ts src/pages/leaderboards-page.test.tsx workers/benchmark-ingest/src/index.test.ts functions/api/benchmarks.test.ts
```

Expected: FAIL because the runtime decoder and capability equality do not validate or compare `priceValues`, cached payloads omit capabilities, the key is still unversioned, and capability fixture literals are missing the required property.

- [ ] **Step 7: Validate, compare, and update every capability fixture**

Add a strict validator next to `isLeaderboardCapabilities`:

```ts
function isStrictlyIncreasingNonNegativeNumbers(value: unknown): value is readonly number[] {
  return Array.isArray(value) && value.every((item, index) => (
    typeof item === 'number'
      && Number.isFinite(item)
      && item >= 0
      && (index === 0 || item > value[index - 1]!)
  ));
}
```

Require `priceValues` to pass that validator and require
`value.supportsPrice === (priceValues.length > 0)` for ready responses. Add
`sameValues(left.priceValues, right.priceValues)` to
`sameLeaderboardCapabilities` so a changed complete domain refreshes the UI.

Update all literal capability fixtures in the listed files:

- use `priceValues: []` beside `supportsPrice: false`;
- use the hand-derived sorted values beside `supportsPrice: true`;
- update the browser coding/media envelopes with `priceValues: []`;
- extend the CSV/API parity assertion to prove the complete projection publishes the expected tail price even when that entry is outside the current page.

Import `createLeaderboardQueryCapabilities` into the ingest worker and derive capabilities from the full `entries` array before `pagedEntries` is sliced:

```ts
const entries = leaderboard.entries;
const capabilities = createLeaderboardQueryCapabilities(
  leaderboard.leaderboard.definition,
  entries,
);
const pagedEntries = entries.slice(0, BENCHMARK_LEADERBOARD_CACHE_LIMIT);
const payload = {
  ...leaderboard.leaderboard,
  profile,
  entries: pagedEntries,
  capabilities,
  pagination: {
    limit: BENCHMARK_LEADERBOARD_CACHE_LIMIT,
    total: entries.length,
    nextCursor,
  },
};
```

Version only the materialized first-page cache identity:

```ts
export function benchmarkLeaderboardCacheKey(parameters: BenchmarkLeaderboardCacheParameters): string {
  return `leaderboard:v2:${parameters.key}:${parameters.profile}:${parameters.limit}:${parameters.cursor ?? ''}:${parameters.includeEstimated ? '1' : '0'}`;
}
```

Update every exact cache-key fixture in the listed worker/Function tests. Do not version `benchmarkLeaderboardProjectionCacheKey`; it stores the complete fact projection, not the old response shape.

- [ ] **Step 8: Run the complete contract slice**

Run:

```bash
npm test -- src/benchmarks/leaderboard-query.test.ts src/frontend/use-benchmarks.test.ts src/pages/leaderboards-page.test.tsx 'functions/api/benchmarks/leaderboards/[key]/csv.test.ts' functions/api/benchmarks.test.ts workers/benchmark-ingest/src/index.test.ts browser-tests/tokenbench-fixtures.test.ts
npm run lint
git diff --check
```

Expected: all tests pass, TypeScript accepts every capability literal, and diff check is clean.

- [ ] **Step 9: Commit Task 1**

```bash
git add src/benchmarks/leaderboard-query.ts src/benchmarks/leaderboard-query.test.ts src/benchmarks/api-response-cache-keys.ts src/frontend/use-benchmarks.ts src/frontend/use-benchmarks.test.ts src/pages/leaderboards-page.tsx src/pages/leaderboards-page.test.tsx workers/benchmark-ingest/src/index.ts workers/benchmark-ingest/src/index.test.ts functions/api/benchmarks.test.ts browser-tests/tokenbench-fixtures.ts functions/api/benchmarks/leaderboards/'[key]'/csv.test.ts
git commit -m "feat(leaderboards): publish price domains"
```

---

### Task 2: Build the semantic filter controls

**Files:**
- Create: `src/frontend/leaderboard-price-domain.ts`
- Test: `src/frontend/leaderboard-price-domain.test.ts`
- Modify: `src/frontend/leaderboard-filter-state.ts:71-79`
- Test: `src/frontend/leaderboard-filter-state.test.ts`
- Modify: `src/frontend/leaderboard-filters.tsx`
- Test: `src/frontend/leaderboard-table.test.tsx`

**Interfaces:**
- Consumes: `LeaderboardQueryCapabilities.priceValues` from Task 1 and existing `LeaderboardFilterState.priceMinimum` / `priceMaximum` numeric URL state.
- Produces: `createLeaderboardPriceDomain(publishedValues, minimum, maximum): LeaderboardPriceDomain | null` and `priceBoundsAt(domain, minimumIndex, maximumIndex): { priceMinimum: number | null; priceMaximum: number | null }`.
- Produces DOM wrappers: `.leaderboard-filter-search-row`, `.leaderboard-filter-selector-row`, `.leaderboard-filter-provider-row`, `.leaderboard-filter-range-row`, and `.leaderboard-filter-supplementary-row`.
- Preserves: `normalizeLeaderboardQueryState` remains the only form-update normalizer; query keys and multi-provider OR behavior do not change.

- [ ] **Step 1: Write failing pure price-domain tests**

Create `src/frontend/leaderboard-price-domain.test.ts`. The production mutations these tests catch are rounding exact URL bounds, using filtered rows, crossing handles, or serializing full endpoints.

```ts
import { describe, expect, it } from 'vitest';
import { createLeaderboardPriceDomain, priceBoundsAt } from './leaderboard-price-domain';

describe('leaderboard price domain', () => {
  it('inserts exact shared-link bounds into the published discrete domain', () => {
    expect(createLeaderboardPriceDomain([0.125, 5, 1_000], 3, 900)).toEqual({
      values: [0.125, 3, 5, 900, 1_000],
      publishedMinimum: 0.125,
      publishedMaximum: 1_000,
      minimumIndex: 1,
      maximumIndex: 3,
    });
  });

  it('maps the complete endpoints back to open URL bounds', () => {
    const domain = createLeaderboardPriceDomain([0.125, 5, 1_000], 3, 900)!;

    expect(priceBoundsAt(domain, 0, domain.values.length - 1)).toEqual({
      priceMinimum: null,
      priceMaximum: null,
    });
    expect(priceBoundsAt(domain, 2, 3)).toEqual({
      priceMinimum: 5,
      priceMaximum: 900,
    });
  });

  it('keeps an exact no-match range visible between published prices', () => {
    expect(createLeaderboardPriceDomain([2, 5], 3, 4)).toMatchObject({
      values: [2, 3, 4, 5],
      minimumIndex: 1,
      maximumIndex: 2,
    });
  });

  it('returns null without published prices and preserves a one-price domain', () => {
    expect(createLeaderboardPriceDomain([], null, null)).toBeNull();
    expect(createLeaderboardPriceDomain([2], null, null)).toMatchObject({
      values: [2],
      minimumIndex: 0,
      maximumIndex: 0,
    });
  });
});
```

- [ ] **Step 2: Run the pure helper tests and verify RED**

Run:

```bash
npm test -- src/frontend/leaderboard-price-domain.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the minimal pure price-domain adapter**

Create the module with these exact public types and defensive finite-value handling:

```ts
export interface LeaderboardPriceDomain {
  readonly values: readonly number[];
  readonly publishedMinimum: number;
  readonly publishedMaximum: number;
  readonly minimumIndex: number;
  readonly maximumIndex: number;
}

function validBound(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0;
}

export function createLeaderboardPriceDomain(
  publishedValues: readonly number[] | null,
  priceMinimum: number | null,
  priceMaximum: number | null,
): LeaderboardPriceDomain | null {
  const published = [...new Set((publishedValues ?? []).filter(validBound))]
    .sort((left, right) => left - right);
  if (published.length === 0) return null;
  const publishedMinimum = published[0]!;
  const publishedMaximum = published[published.length - 1]!;
  const activeMinimum = validBound(priceMinimum) ? priceMinimum : null;
  const activeMaximum = validBound(priceMaximum) ? priceMaximum : null;
  const values = [...new Set([
    ...published,
    ...(activeMinimum === null ? [] : [activeMinimum]),
    ...(activeMaximum === null ? [] : [activeMaximum]),
  ])].sort((left, right) => left - right);
  const minimumIndex = activeMinimum === null ? 0 : values.indexOf(activeMinimum);
  const maximumIndex = activeMaximum === null ? values.length - 1 : values.indexOf(activeMaximum);
  return {
    values,
    publishedMinimum,
    publishedMaximum,
    minimumIndex: minimumIndex <= maximumIndex ? minimumIndex : 0,
    maximumIndex: minimumIndex <= maximumIndex ? maximumIndex : values.length - 1,
  };
}

export function priceBoundsAt(
  domain: LeaderboardPriceDomain,
  minimumIndex: number,
  maximumIndex: number,
): { readonly priceMinimum: number | null; readonly priceMaximum: number | null } {
  const minimum = domain.values[minimumIndex]!;
  const maximum = domain.values[maximumIndex]!;
  return {
    priceMinimum: minimum <= domain.publishedMinimum ? null : minimum,
    priceMaximum: maximum >= domain.publishedMaximum ? null : maximum,
  };
}
```

- [ ] **Step 4: Run the pure helper tests and verify GREEN**

Run:

```bash
npm test -- src/frontend/leaderboard-price-domain.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing semantic component tests**

Update `src/frontend/leaderboard-table.test.tsx` before editing the component. Use one literal rich capability object with two metric keys, two sorts, two providers, multiple evidence states, three exact prices, and multiple source types. Use a separate profile-aware literal for the Workload profile assertion. Add focused tests whose named breaks are wrong DOM order, source-key leakage, inaccessible provider state, crossed range handles, and source-specific estimated copy.

```ts
const RICH_FILTER_CAPABILITIES: LeaderboardQueryCapabilities = {
  dataReady: true,
  defaultProfile: 'balanced',
  defaultSort: 'score-desc',
  supportsProfile: false,
  supportsEstimated: true,
  supportsLifecycle: false,
  priceMode: 'representative',
  supportsPrice: true,
  priceValues: [0.125, 5, 1_000],
  metricKeys: ['benchlm:category:coding', 'benchlm:category:reasoning'],
  sorts: ['score-desc', 'price-asc'],
  providers: ['Provider A', 'Provider B'],
  sourceTypes: ['Open Weight', 'Proprietary'],
  evidenceStatuses: ['supported', 'source_only'],
};
```

```tsx
it('renders the approved common rows before supplementary controls', () => {
  const { container } = render(<LeaderboardFilters
    keyName="llm-coding"
    filters={DEFAULT_FILTERS}
    onChange={vi.fn()}
    capabilities={RICH_FILTER_CAPABILITIES}
  />);

  const rows = [...container.querySelectorAll('.leaderboard-filters > [class*="leaderboard-filter-"]')]
    .map((element) => element.className);
  expect(rows).toEqual([
    'leaderboard-filter-search-row',
    'leaderboard-filter-selector-row',
    'leaderboard-filter-provider-row',
    'leaderboard-filter-range-row',
    'leaderboard-filter-supplementary-row',
  ]);
});

it('uses human metric labels while preserving canonical option values', () => {
  render(<LeaderboardFilters
    keyName="llm-coding"
    filters={DEFAULT_FILTERS}
    onChange={vi.fn()}
    capabilities={RICH_FILTER_CAPABILITIES}
  />);

  expect(screen.getByRole('option', { name: 'Coding' })).toHaveValue('benchlm:category:coding');
  expect(screen.queryByText('benchlm:category:coding')).not.toBeInTheDocument();
});

it('exposes providers as pressed toggle buttons and preserves sorted OR state', () => {
  const onChange = vi.fn();
  render(<LeaderboardFilters
    keyName="llm-coding"
    filters={{ ...DEFAULT_FILTERS, providers: ['Provider B'] }}
    onChange={onChange}
    capabilities={RICH_FILTER_CAPABILITIES}
  />);

  const providerA = screen.getByRole('button', { name: 'Provider A' });
  const providerB = screen.getByRole('button', { name: 'Provider B' });
  expect(providerA).toHaveAttribute('aria-pressed', 'false');
  expect(providerB).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(providerA);
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
    providers: ['Provider A', 'Provider B'],
  }));
});

it('clamps range handles and clears both bounds at the full endpoints', () => {
  const onChange = vi.fn();
  const { rerender } = render(<LeaderboardFilters
    keyName="llm-coding"
    filters={{ ...DEFAULT_FILTERS, priceMinimum: 3, priceMaximum: 900 }}
    onChange={onChange}
    capabilities={RICH_FILTER_CAPABILITIES}
  />);

  const minimum = screen.getByRole('slider', { name: 'Minimum price per 1M tokens' });
  fireEvent.change(minimum, { target: { value: '0' } });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
    priceMinimum: null,
    priceMaximum: 900,
  }));

  rerender(<LeaderboardFilters
    keyName="llm-coding"
    filters={{ ...DEFAULT_FILTERS, priceMinimum: null, priceMaximum: 900 }}
    onChange={onChange}
    capabilities={RICH_FILTER_CAPABILITIES}
  />);
  fireEvent.change(screen.getByRole('slider', { name: 'Maximum price per 1M tokens' }), {
    target: { value: '3' },
  });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
    priceMinimum: null,
    priceMaximum: null,
  }));
});

it('uses source-neutral estimated copy', () => {
  render(<LeaderboardFilters
    keyName="llm-coding"
    filters={DEFAULT_FILTERS}
    onChange={vi.fn()}
    capabilities={RICH_FILTER_CAPABILITIES}
  />);

  expect(screen.getByRole('checkbox', { name: 'Include estimated models' })).toBeInTheDocument();
  expect(screen.getByText('Estimated entries stay unranked and do not receive leader badges.')).toBeInTheDocument();
  expect(screen.queryByText(/BenchLM/i)).not.toBeInTheDocument();
});
```

Also add literal cases for: one price produces no sliders; no prices omit the fieldset; a missing Metric lens leaves selector order Sort then Evidence; and Source type/Workload profile appear only in the final supplementary row.

Add a loading-capability case with `dataReady: false`, `priceValues: null`, `providers: null`, `sourceTypes: null`, and `evidenceStatuses: null`. Assert Search remains available, no price/provider/evidence control appears, and the selector row does not expose potential sort or metric choices before the complete capability projection arrives.

In `src/frontend/leaderboard-filter-state.test.ts`, add a RED case proving complete capabilities canonicalize only equivalent open endpoints while retaining exact out-of-range no-match bounds:

```ts
it('canonicalizes published endpoints without widening outside shared bounds', () => {
  const capabilities = { ...RICH_FILTER_CAPABILITIES, priceValues: [2, 5] };

  expect(normalizeLeaderboardFilters('llm-coding', {
    ...DEFAULT_FILTERS,
    priceMinimum: 2,
    priceMaximum: 5,
  }, undefined, capabilities)).toMatchObject({
    priceMinimum: null,
    priceMaximum: null,
  });
  expect(normalizeLeaderboardFilters('llm-coding', {
    ...DEFAULT_FILTERS,
    priceMinimum: 10,
    priceMaximum: null,
  }, undefined, capabilities)).toMatchObject({
    priceMinimum: 10,
    priceMaximum: null,
  });
});
```

Define the test's capability literal locally with the same exact ready fields shown above; do not import a test constant from another file.

- [ ] **Step 6: Run the component tests and verify RED**

Run:

```bash
npm test -- src/frontend/leaderboard-table.test.tsx
```

Expected: FAIL on row order/classes, raw metric label, checkbox-based provider controls, number-based price inputs, and old estimated copy.

- [ ] **Step 7: Refactor the component into semantic rows**

In `leaderboard-filters.tsx`:

1. Replace the generic provider `FilterChecks` use with a dedicated `ProviderTags` fieldset whose `type="button"` tags expose `aria-pressed` and a selected `✓` span marked `aria-hidden="true"`.
2. Keep `FilterChecks` only for conditional Source type.
3. Add a source-neutral `metricLensLabel(metricKey)` mapping for all known route keys. Its fallback removes the first source segment and structural tokens (`category`, `overall`, `raw`, `style`, `control`), converts `_`/`-` to spaces, and title-cases the remainder; it must never return a colon-delimited raw key.
4. Create real row wrappers in the approved DOM order; do not use CSS `order`.
5. Compute the pure price domain from `routeCapabilities.priceValues` and current numeric bounds. Render no price fieldset for `null`, a formatted `<output>` only for one published value, and two `type="range"` inputs for multiple values.
6. Give both sliders `min="0"`, `max={domain.values.length - 1}`, and `step="1"`. Clamp each proposed index against the other current index before calling `priceBoundsAt`, so handles cannot cross while keeping the same visual scale.
7. Use `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 })` for visible values and `aria-valuetext`.
8. Render Workload profile and Source type only inside the final supplementary row.
9. Change the estimated label and helper exactly as specified.
10. In `normalizeLeaderboardFilters`, after the existing shared query normalization, resolve the complete price domain and pass its current indices to `priceBoundsAt`. Merge those canonical bounds into the returned state. This clears only a lower bound at/below the published minimum and an upper bound at/above the published maximum; it retains an exact lower bound above the maximum or upper bound below the minimum so a no-match shared URL remains a no-match URL.
11. Gate selector, provider, evidence, price, and Source type controls on `routeCapabilities.dataReady`. Keep Search available; keep route-defined Workload profile and Include estimated models available because they determine the request rather than claiming loaded row capabilities.

- [ ] **Step 8: Run the component and query-state regression slice**

Run:

```bash
npm test -- src/frontend/leaderboard-price-domain.test.ts src/frontend/leaderboard-table.test.tsx src/frontend/leaderboard-filter-state.test.ts src/benchmarks/leaderboard-query.test.ts
npm run lint
git diff --check
```

Expected: all tests pass; existing URL serialization/filtering regressions remain green.

- [ ] **Step 9: Commit Task 2**

```bash
git add src/frontend/leaderboard-price-domain.ts src/frontend/leaderboard-price-domain.test.ts src/frontend/leaderboard-filter-state.ts src/frontend/leaderboard-filter-state.test.ts src/frontend/leaderboard-filters.tsx src/frontend/leaderboard-table.test.tsx
git commit -m "feat(leaderboards): rebuild filter controls"
```

---

### Task 3: Apply responsive layout and browser-proof the interaction

**Files:**
- Modify: `src/index.css:462-479,605-654`
- Modify: `browser-tests/tokenbench-fixtures.ts`
- Test: `browser-tests/tokenbench-fixtures.test.ts`
- Test: `browser-tests/responsive-browser.ts:820-980`

**Interfaces:**
- Consumes: the semantic row classes and provider/range markup from Task 2.
- Produces: desktop/tablet/mobile row layout, local mobile provider scrolling, range track/fill/thumb styling, and a valid rich browser fixture with at least six providers and at least three distinct representative prices.
- Preserves: global focus tokens, current panel identity, results-table/card breakpoints, light/dark tokens, and the existing configured browser server. Port 4174 remains untouched.

- [ ] **Step 1: Add a failing valid rich browser fixture test**

Add `readyFilterControlsLeaderboard()` to `browser-tests/tokenbench-fixtures.ts` using the file's existing `benchmarkModel`, `benchlmMetric`, and `primaryPrice` builders. Use six literal providers, unique model/metric keys, representative prices `[0.125, 0.5, 2, 5, 25, 1000]`, both BenchLM and OpenRouter attribution, and these exact capabilities:

```ts
{
  dataReady: true,
  defaultProfile: 'balanced',
  defaultSort: 'score-desc',
  supportsProfile: false,
  supportsEstimated: true,
  supportsLifecycle: false,
  priceMode: 'representative',
  supportsPrice: true,
  priceValues: [0.125, 0.5, 2, 5, 25, 1000],
  metricKeys: ['benchlm:category:coding'],
  sorts: ['score-desc', 'price-asc'],
  providers: ['Anthropic', 'Google', 'Meta', 'Mistral AI', 'OpenAI', 'xAI'],
  sourceTypes: ['Proprietary'],
  evidenceStatuses: ['supported'],
}
```

In `browser-tests/tokenbench-fixtures.test.ts`, pass the fixture through the same public response validation path used by the existing fixture tests and assert the literal provider and price arrays. This catches duplicate model identity, mismatched primary-price identity, missing attribution, or a capability domain that disagrees with the complete entries.

- [ ] **Step 2: Run the fixture test and verify RED**

Run:

```bash
npm test -- browser-tests/tokenbench-fixtures.test.ts
```

Expected: FAIL because `readyFilterControlsLeaderboard` does not exist.

- [ ] **Step 3: Implement the rich fixture and verify GREEN**

Implement only the explicit fixture needed by this browser test. Do not change the existing coding/media fixtures, because their intentionally sparse capability states are used by other regressions.

Run:

```bash
npm test -- browser-tests/tokenbench-fixtures.test.ts
```

Expected: PASS.

- [ ] **Step 4: Write failing browser layout and interaction tests**

In the leaderboard browser describe block, add a test that stubs `readyFilterControlsLeaderboard()` and checks the real form at 320, 768, 1024, and 1440 px. The production mutations it catches are loss of full-width search, arbitrary grid flow, document overflow, wrapped mobile providers, clipped focus, sub-44 px controls, and sliders that do not update canonical URL state.

```ts
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
      };
    });

    expect(geometry.search.width).toBeGreaterThanOrEqual(geometry.form - 1);
    expect([geometry.search.y, geometry.selectors.y, geometry.providers.y, geometry.range.y])
      .toEqual([...new Set([geometry.search.y, geometry.selectors.y, geometry.providers.y, geometry.range.y])].sort((a, b) => a - b));

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
  const focusedIsVisible = await page.getByRole('button', { name: 'xAI' }).evaluate((button) => {
    const item = button.getBoundingClientRect();
    const strip = button.parentElement!.getBoundingClientRect();
    return item.left >= strip.left && item.right <= strip.right;
  });
  expect(focusedIsVisible).toBe(true);

  await page.getByRole('button', { name: 'OpenAI' }).click();
  await expect(page.getByRole('button', { name: 'OpenAI' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => new URL(page.url()).searchParams.getAll('provider')).toEqual(['OpenAI']);

  const minimum = page.getByRole('slider', { name: 'Minimum price per 1M tokens' });
  await minimum.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => new URL(page.url()).searchParams.get('minPrice')).toBe('0.5');
});
```

Add a second bounded loop at 320 and 1440 for both themes. Assert the selected provider has a visible checkmark, selected/unselected backgrounds and borders differ, both slider thumbs are visible/focusable, and `assertNoHorizontalOverflow(page)` remains green. Reuse the existing theme helper; do not create screenshots as test assertions.

Extend the existing empty-state browser check to assert the `Leaderboard filters` form and its published Provider controls remain visible after an empty result response. This catches a regression that removes the user's recovery controls with the results.

- [ ] **Step 5: Run the focused browser test and verify RED**

Run through the repository script so the handler fixture does not misread inherited color warnings:

```bash
npm run test:browser -- --grep 'keeps the four filter rows ordered|keeps filter selection legible'
```

Expected: FAIL because row wrappers have no structural CSS, providers wrap at mobile, and the range track/thumb presentation is absent.

- [ ] **Step 6: Implement the responsive layout and visual states**

Replace the one auto-fit form grid with row-aware rules. Keep values on the existing spacing scale and use semantic tokens only.

```css
.leaderboard-filters { display: grid; gap: 24px; }
.leaderboard-filter-search-row,
.leaderboard-filter-selector-row,
.leaderboard-filter-provider-row,
.leaderboard-filter-range-row,
.leaderboard-filter-supplementary-row { min-width: 0; }
.leaderboard-filter-selector-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr)); align-items: end; gap: 16px; }
.leaderboard-provider-options { min-width: 0; display: flex; flex-wrap: wrap; gap: 8px; padding: 4px; margin: -4px; }
.leaderboard-provider-tag { min-height: 44px; display: inline-flex; flex: 0 0 auto; align-items: center; gap: 7px; padding: 8px 12px; border: 1px solid var(--outline); border-radius: 999px; background: var(--surface-low); color: var(--muted); }
.leaderboard-provider-tag[aria-pressed='true'] { border-color: var(--primary); background: color-mix(in srgb, var(--primary-soft) 58%, var(--surface)); color: var(--primary-strong); }
.leaderboard-filter-range-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(240px, 0.36fr); align-items: end; gap: 20px; }
.leaderboard-price-range-stack { position: relative; min-height: 44px; }
.leaderboard-price-range-stack::before { content: ''; position: absolute; inset: 20px 0 auto; height: 4px; border-radius: 999px; background: linear-gradient(to right, var(--outline) 0 var(--range-start), var(--primary) var(--range-start) var(--range-end), var(--outline) var(--range-end) 100%); }
.leaderboard-price-range-stack input[type='range'] { position: absolute; inset: 0; width: 100%; height: 44px; margin: 0; appearance: none; pointer-events: none; background: transparent; }
.leaderboard-price-range-stack input[type='range']::-webkit-slider-thumb { width: 22px; height: 22px; appearance: none; pointer-events: auto; border: 3px solid var(--surface); border-radius: 50%; background: var(--primary); box-shadow: 0 0 0 1px var(--primary-strong); }
.leaderboard-price-range-stack input[type='range']::-moz-range-thumb { width: 18px; height: 18px; pointer-events: auto; border: 3px solid var(--surface); border-radius: 50%; background: var(--primary); box-shadow: 0 0 0 1px var(--primary-strong); }
.leaderboard-filter-supplementary-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr)); gap: 16px; padding-top: 18px; border-top: 1px solid var(--outline); }
```

At `max-width: 767px`, stack selector/range/supplementary grids, make `.leaderboard-provider-options` a single `nowrap` row with `overflow-x: auto`, `overscroll-behavior-inline: contain`, `scroll-padding-inline: 4px`, and a thin scrollbar. Add enough block padding for the 3 px focus outline. At tablet, allow selector auto-fit and range stacking only when the estimated control would fall below its readable minimum. Do not use CSS `order`.

Use percentage custom properties computed by the component from the current indices for `--range-start` and `--range-end`. When the domain contains one value, omit the stack and show only the formatted summary.

- [ ] **Step 7: Run browser, component, and mechanical layout verification**

Run:

```bash
npm run test:browser -- --grep 'keeps the four filter rows ordered|keeps filter selection legible|keeps table semantics, named filters'
npm test -- src/frontend/leaderboard-price-domain.test.ts src/frontend/leaderboard-table.test.tsx browser-tests/tokenbench-fixtures.test.ts
node /Users/daren/.codex/skills/impeccable/scripts/detect.mjs --json --scope layout src/frontend/leaderboard-filters.tsx src/index.css
npm run lint
npm run build
git diff --check
```

Expected: browser tests pass at all asserted widths/themes, unit tests pass, the layout detector returns no unexplained findings, TypeScript/build succeed, and diff check is clean.

- [ ] **Step 8: Perform one bounded rendered inspection and one confirmation pass**

Use the isolated browser-test server or another spare port, never 4174. Inspect one 1440 px light view and one 320 px light view together for squint hierarchy, row grouping, local provider scrolling, focus clipping, slider overlap, and long labels. Fix all observed defects in one batch, rerun the focused browser test once, and stop polishing after that confirmation pass.

- [ ] **Step 9: Commit Task 3**

```bash
git add src/index.css browser-tests/tokenbench-fixtures.ts browser-tests/tokenbench-fixtures.test.ts browser-tests/responsive-browser.ts
git commit -m "style(leaderboards): refine filter layout"
```

---

## Final verification

After all three task reviews are clean, run:

```bash
npm test
npm run test:browser -- --grep 'leaderboard browser harness'
npm run lint
npm run build
git diff --check
git status --short
```

Then request a whole-branch review against the approved spec. Any Critical or Important finding receives one delegated fix wave and one scoped re-review. When the final review is clean, push the implementation commits to `origin/feat/tokenbench-preview-revamp` so the same branch remains available across devices.
