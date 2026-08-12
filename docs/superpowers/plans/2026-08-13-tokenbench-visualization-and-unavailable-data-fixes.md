# TokenBench Visualization and Unavailable-Data Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the empty Value Frontier and missing price/modality data caused by a cross-source model-key mismatch, then add SSR-safe charts and remove duplicated UI.

**Architecture:** Leaderboards currently join scores to prices on an exact `modelKey` and additionally require `sourceId === 'openrouter'`. BenchLM score keys (`source:benchlm:claude-opus-5`) and OpenRouter price keys (`source:openrouter:anthropic%2Fclaude-opus-5`) have zero overlap on the live revision, so every cost-derived view is empty. We widen the rule to accept a **same-source** primary route (the join `/llm-price-performance/` and `/models/` already use), keeping the ban on cross-source guessing. Charts are added as a small shared visx module that renders through `renderToString` in workerd.

**Tech Stack:** React 19, TypeScript, Vite, Cloudflare Pages Functions (workerd SSR), Vitest, Playwright, visx (`@visx/scale`, `@visx/shape`, `@visx/axis`, `@visx/group`).

## Global Constraints

- **No cross-source identity inference.** A price may only join a model when `price.modelKey === model.modelKey`. `MODEL_ALIASES` stays empty; nothing may guess that a BenchLM model equals an OpenRouter model.
- **Never fabricate data.** Missing evidence stays explicitly unavailable. Do not substitute, estimate, or carry values across routes.
- **All charts must server-render.** Every chart must emit real `<svg>` with plot marks through `renderToString` in a DOM-free runtime. Recharts is banned here: measured at 127 bytes of empty shell under SSR and 113KB gzipped. visx measured at 24KB gzipped with complete SVG output.
- **Charts need a text equivalent.** Every chart carries `role="img"` plus `aria-label`, and the exact numbers remain available in an adjacent table or list.
- **`llm-pricing-context` keeps OpenRouter route evidence.** That route is specifically about per-route pricing identity and must not switch to same-source pricing.
- Run `npm test` for unit coverage and `npm run lint` for types. Both must pass before each commit.
- Commit after each task with a conventional-commit subject.

---

### Task 1: Accept same-source primary price routes

**Files:**
- Modify: `src/benchmarks/value.ts` (`isPrimaryHostedRoute`, `primaryHostedRoutesForModel`, `primaryHostedPriceForModel`)
- Test: `src/benchmarks/value.test.ts`

**Interfaces:**
- Consumes: `BenchmarkPriceCheck`, `BenchmarkSourceId` from `src/benchmarks/contracts.ts`.
- Produces: `isPrimaryHostedRoute(price: BenchmarkPriceCheck, modelSourceId?: BenchmarkSourceId): boolean`. When `modelSourceId` is supplied, a route from that same source qualifies; when omitted, behavior is unchanged (OpenRouter only). `primaryHostedRoutesForModel(modelKey, prices, profile, modelSourceId?)` and `primaryHostedPriceForModel(modelKey, prices, profile, modelSourceId?)` gain the same trailing optional parameter.

- [ ] **Step 1: Write the failing test**

Add to `src/benchmarks/value.test.ts`, reusing the existing `price()` builder in that file:

```ts
it('accepts a same-source primary route so BenchLM scores can carry BenchLM pricing', () => {
  const benchlmRoute = price({
    modelKey: 'source:benchlm:model-a',
    sourceId: 'benchlm',
    providerId: 'anthropic',
    routeId: 'benchlm:model-a',
    sourceModelId: 'model-a',
    inputUsdPerMillion: 10,
    outputUsdPerMillion: 50,
    sourceArtifactId: 'pricing',
  });
  expect(primaryHostedPriceForModel('source:benchlm:model-a', [benchlmRoute], 'balanced', 'benchlm'))
    .toMatchObject({ routeId: 'benchlm:model-a', blendedCostPerMillion: 20 });
});

it('still refuses a route published by a source unrelated to the model', () => {
  const openrouterRoute = price({ modelKey: 'source:benchlm:model-a', routeId: 'openrouter:model-a' });
  const litellmRoute = price({
    modelKey: 'source:benchlm:model-a',
    sourceId: 'litellm',
    routeId: 'litellm:model-a',
  });
  expect(primaryHostedPriceForModel('source:benchlm:model-a', [openrouterRoute], 'balanced', 'benchlm'))
    .toMatchObject({ routeId: 'openrouter:model-a' });
  expect(primaryHostedPriceForModel('source:benchlm:model-a', [litellmRoute], 'balanced', 'benchlm'))
    .toBeNull();
});

it('keeps corroborating same-source routes out of cost math', () => {
  const corroborating = price({
    modelKey: 'source:benchlm:model-a',
    sourceId: 'benchlm',
    routeId: 'benchlm:model-a',
    verificationStatus: 'corroborating',
  });
  expect(primaryHostedPriceForModel('source:benchlm:model-a', [corroborating], 'balanced', 'benchlm'))
    .toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/benchmarks/value.test.ts`
Expected: FAIL — the same-source case returns `null` because `isPrimaryHostedRoute` requires `sourceId === 'openrouter'`.

- [ ] **Step 3: Write minimal implementation**

In `src/benchmarks/value.ts`, add `BenchmarkSourceId` to the existing type-only import from `./contracts`, then replace `isPrimaryHostedRoute`:

```ts
/**
 * A cost-derived calculation needs an explicit primary hosted route. OpenRouter
 * is always such a route. A source may also publish pricing for its own models
 * (BenchLM `pricing`), which is same-source evidence rather than a cross-source
 * guess, so it qualifies when the model comes from that same source. litellm
 * stays corroborating-only and never qualifies.
 */
export function isPrimaryHostedRoute(
  price: BenchmarkPriceCheck,
  modelSourceId?: BenchmarkSourceId,
): boolean {
  const hostedSource = price.sourceId === 'openrouter'
    || (modelSourceId !== undefined && price.sourceId === modelSourceId && price.sourceId !== 'litellm');
  return hostedSource
    && price.verificationStatus === 'primary'
    && typeof price.routeId === 'string'
    && price.routeId.trim().length > 0
    && typeof price.providerId === 'string'
    && price.providerId.trim().length > 0;
}
```

Then thread the optional source through both consumers in the same file. In `primaryHostedRoutesForModel`, add the parameter and pass it to the filter:

```ts
export function primaryHostedRoutesForModel(
  modelKey: string,
  prices: readonly BenchmarkPriceCheck[],
  profile: WorkloadProfile,
  modelSourceId?: BenchmarkSourceId,
): readonly BenchmarkPriceCheck[] {
  if (!isWorkloadProfile(profile)) throw new RangeError('profile must be a supported workload profile');
  return prices
    .filter((price) => price.modelKey === modelKey && isPrimaryHostedRoute(price, modelSourceId))
    .slice()
    .sort((left, right) => {
      const leftCost = nullableBlendedCost(left, profile);
      const rightCost = nullableBlendedCost(right, profile);
      const leftSortCost = leftCost ?? Number.POSITIVE_INFINITY;
      const rightSortCost = rightCost ?? Number.POSITIVE_INFINITY;
      if (leftSortCost !== rightSortCost) return leftSortCost - rightSortCost;
      const providerOrder = compareText(left.providerId, right.providerId);
      if (providerOrder !== 0) return providerOrder;
      return compareText(left.routeId, right.routeId);
    });
}
```

And in `primaryHostedPriceForModel`:

```ts
export function primaryHostedPriceForModel(
  modelKey: string,
  prices: readonly BenchmarkPriceCheck[],
  profile: WorkloadProfile,
  modelSourceId?: BenchmarkSourceId,
): PrimaryHostedPrice | null {
  for (const price of primaryHostedRoutesForModel(modelKey, prices, profile, modelSourceId)) {
    const cost = nullableBlendedCost(price, profile);
    if (cost !== null) {
      return { price, routeId: price.routeId, blendedCostPerMillion: cost };
    }
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/benchmarks/value.test.ts` then `npm run lint`
Expected: PASS, including the pre-existing `uses only an explicit primary hosted route` case, which calls without a source and must keep rejecting `benchlm` and `litellm`.

- [ ] **Step 5: Commit**

```bash
git add src/benchmarks/value.ts src/benchmarks/value.test.ts
git commit -m "fix: accept same-source primary price routes for cost views"
```

---

### Task 2: Populate value, leaderboard, and home price evidence

**Files:**
- Modify: `src/benchmarks/leaderboards.ts` (`buildValueLeaderboard`, `buildBenchLmLeaderboard`, `buildMultimodalLeaderboard`)
- Modify: `src/benchmarks/decision-picks.ts` (`representativeRates`)
- Test: `src/benchmarks/leaderboards.test.ts`

**Interfaces:**
- Consumes: `primaryHostedPriceForModel(modelKey, prices, profile, modelSourceId?)` from Task 1.
- Produces: no signature changes. `buildLeaderboard` now returns non-empty `llm-value` entries with `onValueFrontier` set, and score routes carry `primaryPrice`/`blendedCostPerMillion` when same-source pricing exists.

- [ ] **Step 1: Write the failing test**

Add to `src/benchmarks/leaderboards.test.ts`, reusing that file's existing model/metric/price builders and matching their current names and required fields:

```ts
it('builds a value frontier from same-source BenchLM pricing', () => {
  const cheap = model({ modelKey: 'source:benchlm:cheap', slug: 'cheap', sourceId: 'benchlm' });
  const pricey = model({ modelKey: 'source:benchlm:pricey', slug: 'pricey', sourceId: 'benchlm' });
  const metrics = [
    metric({ modelKey: cheap.modelKey, metricKey: 'benchlm:overall:raw', value: 70, rank: 2 }),
    metric({ modelKey: pricey.modelKey, metricKey: 'benchlm:overall:raw', value: 90, rank: 1 }),
  ];
  const prices = [
    price({ modelKey: cheap.modelKey, sourceId: 'benchlm', routeId: 'benchlm:cheap', inputUsdPerMillion: 1, outputUsdPerMillion: 1 }),
    price({ modelKey: pricey.modelKey, sourceId: 'benchlm', routeId: 'benchlm:pricey', inputUsdPerMillion: 10, outputUsdPerMillion: 50 }),
  ];
  const result = buildLeaderboard('llm-value', [cheap, pricey], metrics, prices, 'balanced');
  expect(result.entries).toHaveLength(2);
  expect(result.entries.every((entry) => entry.primaryPrice !== null)).toBe(true);
  expect(result.entries.filter((entry) => entry.onValueFrontier)).toHaveLength(2);
});

it('carries same-source price evidence onto a score leaderboard row', () => {
  const alpha = model({ modelKey: 'source:benchlm:alpha', slug: 'alpha', sourceId: 'benchlm' });
  const metrics = [metric({ modelKey: alpha.modelKey, metricKey: 'benchlm:category:coding', value: 80, rank: 1 })];
  const prices = [price({ modelKey: alpha.modelKey, sourceId: 'benchlm', routeId: 'benchlm:alpha', inputUsdPerMillion: 2, outputUsdPerMillion: 6 })];
  const result = buildLeaderboard('llm-coding', [alpha], metrics, prices, 'balanced');
  expect(result.entries[0].primaryPrice?.routeId).toBe('benchlm:alpha');
  expect(result.entries[0].blendedCostPerMillion).toBe(3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/benchmarks/leaderboards.test.ts`
Expected: FAIL — value entries length 0 and `primaryPrice` null, because the builders call `primaryHostedPriceForModel` without the model source.

- [ ] **Step 3: Write minimal implementation**

In `src/benchmarks/leaderboards.ts`, pass `model.sourceId` at each `primaryHostedPriceForModel` call site inside `buildValueLeaderboard`, `buildBenchLmLeaderboard`, and `buildMultimodalLeaderboard`:

```ts
const hostedPrice = primaryHostedPriceForModel(
  model.modelKey,
  pricesByModel.get(model.modelKey) ?? [],
  profile,
  model.sourceId,
);
```

`buildMultimodalLeaderboard` uses the fixed `'outputHeavy'` profile; keep that literal and append `model.sourceId` after it. **Leave `buildPricingContextLeaderboard` unchanged** — that route keeps OpenRouter route identity per the global constraints.

In `src/benchmarks/decision-picks.ts`, `representativeRates` iterates `snapshot.models`, so pass each model's own source:

```ts
rates.set(model.modelKey, primaryHostedPriceForModel(
  model.modelKey,
  pricesByModel.get(model.modelKey) ?? [],
  'outputHeavy',
  model.sourceId,
));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/benchmarks/ && npm run lint`
Expected: PASS. Home's `lowestVerifiedRepresentativeRate` and `pricePerformancePoints` now resolve instead of returning `unavailable`/empty.

- [ ] **Step 5: Commit**

```bash
git add src/benchmarks/leaderboards.ts src/benchmarks/decision-picks.ts src/benchmarks/leaderboards.test.ts
git commit -m "fix: populate value frontier and leaderboard price evidence"
```

---

### Task 3: Stop rendering all-empty columns

**Files:**
- Modify: `src/frontend/leaderboard-table.tsx` (`ModalitiesValue`, table header/body, card markup)
- Test: `src/frontend/leaderboard-table.test.tsx`

**Interfaces:**
- Consumes: `LeaderboardEntry` from `src/benchmarks/leaderboards.ts`.
- Produces: `hasModalityEvidence(entries: readonly LeaderboardEntry[]): boolean`, exported from `src/frontend/leaderboard-table.tsx`. Returns true when at least one entry has a non-empty `primaryPrice.inputModalities` or `primaryPrice.outputModalities`. The Supported Modalities column and card row render only when it is true.

Context: the live coding route renders 28 of 28 modality cells as "Unavailable" because BenchLM pricing does not publish modalities.

- [ ] **Step 1: Write the failing test**

Add to `src/frontend/leaderboard-table.test.tsx`, reusing that file's existing entry builder:

```tsx
it('hides the modalities column when no row publishes modality evidence', () => {
  render(<LeaderboardTable keyName="llm-coding" entries={[entry({ primaryPrice: null }), entry({ primaryPrice: null })]} />);
  expect(screen.queryByRole('columnheader', { name: /supported modalities/i })).toBeNull();
  expect(screen.queryByText('Unavailable')).toBeNull();
});

it('keeps the modalities column when at least one row publishes it', () => {
  const withModalities = entry({
    primaryPrice: { ...openRouterPrice, inputModalities: ['text', 'image'], outputModalities: ['text'] },
  });
  render(<LeaderboardTable keyName="llm-coding" entries={[withModalities, entry({ primaryPrice: null })]} />);
  expect(screen.getByRole('columnheader', { name: /supported modalities/i })).toBeTruthy();
  expect(screen.getByText('text, image · text')).toBeTruthy();
  expect(screen.getByText('Unavailable')).toBeTruthy();
});
```

If the test file has no `openRouterPrice` fixture, define one locally with the full `BenchmarkPriceCheck` shape from `src/benchmarks/contracts.ts:137`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/frontend/leaderboard-table.test.tsx`
Expected: FAIL — the column always renders, so the header query finds it and `Unavailable` appears.

- [ ] **Step 3: Write minimal implementation**

In `src/frontend/leaderboard-table.tsx`:

```ts
/** True when at least one row has modality evidence worth a column. */
export function hasModalityEvidence(entries: readonly LeaderboardEntry[]): boolean {
  return entries.some((entry) => {
    const price = entry.primaryPrice;
    return (price?.inputModalities?.length ?? 0) > 0 || (price?.outputModalities?.length ?? 0) > 0;
  });
}
```

Compute `const showModalities = hasModalityEvidence(entries);` once in the table component and once in the card-list component. Wrap the Supported Modalities `<th>`, each row's matching `<td>`, and the card's `<div><dt>Supported Modalities</dt>…</div>` in `{showModalities ? … : null}`. Keep `ModalitiesValue` unchanged for the mixed case.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/frontend/ && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/leaderboard-table.tsx src/frontend/leaderboard-table.test.tsx
git commit -m "fix: hide leaderboard columns with no published evidence"
```

---

### Task 4: Explain source-rank positions and unranked evidence lenses

**Files:**
- Modify: `src/pages/leaderboards-page.tsx` (evidence/methodology section)
- Test: `src/pages/leaderboards-page.test.tsx`

**Interfaces:**
- Consumes: `LeaderboardKey` from `src/routing/routes.ts`.
- Produces: `positionNoteFor(keyName: LeaderboardKey): string`, exported from `src/pages/leaderboards-page.tsx`. Returns the unranked-lens sentence for `llm-reasoning` and `llm-knowledge`, and the source-rank sentence for every other key.

Context: coding starts at `#2` and agentic shows `1, 3, 4` because those are **published source ranks**; the missing positions belong to models with no measurement in that category. Correct data that currently reads like a bug.

- [ ] **Step 1: Write the failing test**

```ts
import { positionNoteFor } from './leaderboards-page';

it('explains that positions are published source ranks', () => {
  expect(positionNoteFor('llm-coding')).toMatch(/source rank/i);
  expect(positionNoteFor('llm-coding')).toMatch(/gap/i);
});

it('marks reasoning and knowledge as unranked evidence lenses', () => {
  expect(positionNoteFor('llm-reasoning')).toMatch(/unranked/i);
  expect(positionNoteFor('llm-knowledge')).toMatch(/unranked/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/pages/leaderboards-page.test.tsx`
Expected: FAIL with "positionNoteFor is not a function".

- [ ] **Step 3: Write minimal implementation**

```ts
const UNRANKED_LENS_KEYS = new Set<LeaderboardKey>(['llm-reasoning', 'llm-knowledge']);

/** Explains why positions are non-contiguous instead of letting them read as a bug. */
export function positionNoteFor(keyName: LeaderboardKey): string {
  return UNRANKED_LENS_KEYS.has(keyName)
    ? 'This is an unranked evidence lens. Positions come from the source where published, and rows without a published rank stay unranked rather than being renumbered.'
    : 'Positions are the published source rank, not the row number. A gap means the model at that rank has no published measurement for this category.';
}
```

Render it in the existing evidence/methodology section of the leaderboard page as a `<p className="muted">`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/pages/ && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/leaderboards-page.tsx src/pages/leaderboards-page.test.tsx
git commit -m "feat: explain source-rank positions on leaderboards"
```

---

### Task 5: Add the SSR-safe visx chart module

**Files:**
- Create: `src/frontend/charts/chart-theme.ts`
- Create: `src/frontend/charts/score-bar-chart.tsx`
- Create: `src/frontend/charts/score-bar-chart.test.tsx`
- Modify: `package.json`, `src/index.css`

**Interfaces:**
- Consumes: `@visx/scale`, `@visx/shape`, `@visx/axis`, `@visx/group`.
- Produces:
  - `CHART_THEME` from `chart-theme.ts`: `{ readonly bar: string; readonly barMuted: string; readonly axis: string; readonly grid: string }`, all CSS `var(--…)` references so light and dark themes follow existing tokens.
  - `ScoreBarChartDatum = { readonly label: string; readonly value: number; readonly muted?: boolean }`.
  - `ScoreBarChart(props: { readonly data: readonly ScoreBarChartDatum[]; readonly ariaLabel: string; readonly unit?: string; readonly width?: number })` — horizontal bar chart, returns `null` for empty data.

- [ ] **Step 1: Install visx**

```bash
npm install @visx/scale@4 @visx/shape@4 @visx/axis@4 @visx/group@4
```

- [ ] **Step 2: Write the failing test**

Create `src/frontend/charts/score-bar-chart.test.tsx`:

```tsx
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ScoreBarChart } from './score-bar-chart';

const data = [
  { label: 'Alpha', value: 82.5 },
  { label: 'Beta', value: 70 },
  { label: 'Gamma', value: 55.25, muted: true },
];

describe('ScoreBarChart', () => {
  it('server-renders real bars and axis text without a DOM', () => {
    const html = renderToString(<ScoreBarChart data={data} ariaLabel="Coding score by model" />);
    expect(html).toContain('<svg');
    expect(html).toContain('aria-label="Coding score by model"');
    expect(html).toContain('role="img"');
    expect((html.match(/<rect/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(html).toContain('Alpha');
    expect(html).toContain('82.5');
  });

  it('scales bar width to the value', () => {
    const html = renderToString(<ScoreBarChart data={data} ariaLabel="Scores" />);
    const widths = [...html.matchAll(/class="visx-bar"[^>]*width="([\d.]+)"/g)].map((match) => Number(match[1]));
    expect(widths).toHaveLength(3);
    expect(widths[0]).toBeGreaterThan(widths[1]);
    expect(widths[1]).toBeGreaterThan(widths[2]);
  });

  it('renders nothing when there is no data', () => {
    expect(renderToString(<ScoreBarChart data={[]} ariaLabel="Scores" />)).toBe('');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- src/frontend/charts/score-bar-chart.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the implementation**

Create `src/frontend/charts/chart-theme.ts`:

```ts
/** Chart colors reference existing CSS custom properties so themes stay in sync. */
export const CHART_THEME = {
  bar: 'var(--accent)',
  barMuted: 'var(--muted)',
  axis: 'var(--muted)',
  grid: 'var(--outline)',
} as const;
```

Create `src/frontend/charts/score-bar-chart.tsx`:

```tsx
import { AxisBottom } from '@visx/axis';
import { Group } from '@visx/group';
import { scaleBand, scaleLinear } from '@visx/scale';
import { Bar } from '@visx/shape';
import { CHART_THEME } from './chart-theme';

export interface ScoreBarChartDatum {
  readonly label: string;
  readonly value: number;
  readonly muted?: boolean;
}

export interface ScoreBarChartProps {
  readonly data: readonly ScoreBarChartDatum[];
  readonly ariaLabel: string;
  readonly unit?: string;
  readonly width?: number;
}

const ROW_HEIGHT = 26;
const LABEL_WIDTH = 168;
const VALUE_WIDTH = 64;
const AXIS_HEIGHT = 28;

export function ScoreBarChart({ data, ariaLabel, unit = 'score', width = 720 }: ScoreBarChartProps) {
  if (data.length === 0) return null;
  const plotWidth = Math.max(120, width - LABEL_WIDTH - VALUE_WIDTH);
  const plotHeight = data.length * ROW_HEIGHT;
  const height = plotHeight + AXIS_HEIGHT;
  const maxValue = Math.max(...data.map((datum) => datum.value), 0);
  const x = scaleLinear({ domain: [0, maxValue === 0 ? 1 : maxValue], range: [0, plotWidth] });
  const y = scaleBand({ domain: data.map((datum) => datum.label), range: [0, plotHeight], padding: 0.28 });
  return <svg
    className="score-bar-chart"
    viewBox={`0 0 ${width} ${height}`}
    width="100%"
    height={height}
    role="img"
    aria-label={ariaLabel}
  >
    <Group left={LABEL_WIDTH}>
      {data.map((datum) => {
        const barY = y(datum.label) ?? 0;
        const barWidth = Math.max(1, x(datum.value));
        return <Group key={datum.label}>
          <text x={-10} y={barY + y.bandwidth() / 2} textAnchor="end" dominantBaseline="middle" className="score-bar-chart-label">{datum.label}</text>
          <Bar x={0} y={barY} width={barWidth} height={y.bandwidth()} rx={3} fill={datum.muted ? CHART_THEME.barMuted : CHART_THEME.bar} />
          <text x={barWidth + 8} y={barY + y.bandwidth() / 2} dominantBaseline="middle" className="score-bar-chart-value">{datum.value}</text>
        </Group>;
      })}
      <AxisBottom
        top={plotHeight}
        scale={x}
        numTicks={4}
        stroke={CHART_THEME.axis}
        tickStroke={CHART_THEME.axis}
        label={unit}
        tickLabelProps={() => ({ className: 'score-bar-chart-tick', textAnchor: 'middle', dy: '0.25em' })}
      />
    </Group>
  </svg>;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/frontend/charts/ && npm run lint`
Expected: PASS.

- [ ] **Step 6: Add chart styles**

Append to `src/index.css`:

```css
.score-bar-chart { display: block; width: 100%; max-width: 100%; overflow: visible; }
.score-bar-chart-label { fill: var(--text); font-family: var(--font-label); font-size: 0.72rem; }
.score-bar-chart-value { fill: var(--muted); font-size: 0.7rem; }
.score-bar-chart-tick { fill: var(--muted); font-size: 0.66rem; }
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/frontend/charts src/index.css
git commit -m "feat: add SSR-safe visx score bar chart"
```

---

### Task 6: Replace the duplicated picks panel with the score chart

**Files:**
- Modify: `src/pages/leaderboards-page.tsx` (`CurrentDecisionPicks`)
- Test: `src/pages/leaderboards-page.test.tsx`

**Interfaces:**
- Consumes: `ScoreBarChart`, `ScoreBarChartDatum` from Task 5; `LeaderboardEntry` from `src/benchmarks/leaderboards.ts`.
- Produces: `scoreChartData(entries: readonly LeaderboardEntry[], limit?: number): readonly ScoreBarChartDatum[]`, exported from `src/pages/leaderboards-page.tsx`. Default `limit` is 12. Skips entries whose `metric` is null or non-finite; sets `muted: true` when `model.evidenceStatus === 'estimated'`.

Context: the "Decision-ready picks" panel repeats the exact top 3 rows of the table directly beneath it.

- [ ] **Step 1: Write the failing test**

```ts
import { scoreChartData } from './leaderboards-page';

it('builds chart data from scored entries and marks estimated rows muted', () => {
  const entries = [
    entry({ metric: { ...baseMetric, value: 80 } }),
    entry({ model: { ...baseModel, modelKey: 'b', name: 'Beta', evidenceStatus: 'estimated' }, metric: { ...baseMetric, value: 60 } }),
    entry({ model: { ...baseModel, modelKey: 'c', name: 'Gamma' }, metric: null }),
  ];
  const data = scoreChartData(entries);
  expect(data).toHaveLength(2);
  expect(data[0]).toMatchObject({ value: 80, muted: false });
  expect(data[1]).toMatchObject({ value: 60, muted: true });
});

it('caps the chart at the requested number of rows', () => {
  const many = Array.from({ length: 20 }, (_, index) => entry({
    model: { ...baseModel, modelKey: `m${index}`, name: `Model ${index}` },
    metric: { ...baseMetric, value: 100 - index },
  }));
  expect(scoreChartData(many)).toHaveLength(12);
  expect(scoreChartData(many, 5)).toHaveLength(5);
});
```

Reuse the file's existing entry/model/metric fixtures; if `baseModel` and `baseMetric` do not exist under those names, use the equivalents already defined there.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/pages/leaderboards-page.test.tsx`
Expected: FAIL with "scoreChartData is not a function".

- [ ] **Step 3: Write the implementation**

```ts
/** Projects leaderboard rows into chart rows without inventing a score. */
export function scoreChartData(
  entries: readonly LeaderboardEntry[],
  limit = 12,
): readonly ScoreBarChartDatum[] {
  return entries
    .filter((entry) => entry.metric !== null && Number.isFinite(entry.metric.value))
    .slice(0, limit)
    .map((entry) => ({
      label: entry.model.name,
      value: entry.metric!.value,
      muted: entry.model.evidenceStatus === 'estimated',
    }));
}
```

Change `CurrentDecisionPicks` to render the chart from the leaderboard entries already loaded on the page instead of the duplicated top-3 list. Keep the `panel` element and its `aria-labelledby` wiring; set the heading to `Score comparison` and the description to `The published score for each model in this view. Exact values stay in the table below.` Render `<ScoreBarChart data={chartData} ariaLabel={`${route.seo.h1} score by model`} />`, and return `null` when `chartData.length === 0`.

Before deleting any helper, run `rg -n "DecisionEntry" src/` — the home page has its own usage that must keep working.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/pages/ && npm run lint`
Expected: PASS. Update any existing assertion that expects the "Decision-ready picks" heading on a leaderboard route.

- [ ] **Step 5: Commit**

```bash
git add src/pages/leaderboards-page.tsx src/pages/leaderboards-page.test.tsx
git commit -m "feat: replace duplicated picks panel with a score chart"
```

---

### Task 7: Group repeated source attribution

**Files:**
- Modify: `src/frontend/leaderboard-table.tsx` (`LeaderboardEvidence`)
- Test: `src/frontend/leaderboard-table.test.tsx`

**Interfaces:**
- Consumes: the `attribution` prop already passed to `LeaderboardEvidence`, shaped `{ sourceId: string; label: string; url: string; updatedAt: string }`.
- Produces: `groupAttribution(attribution)` exported from `src/frontend/leaderboard-table.tsx`, returning `readonly { readonly sourceId: string; readonly label: string; readonly urls: readonly string[]; readonly updatedAt: string }[]`. One entry per `sourceId`, `urls` de-duplicated in first-seen order, `updatedAt` the most recent for that source.

Context: the live coding route lists `Data from BenchLM.ai` twice; the value route lists it six times.

- [ ] **Step 1: Write the failing test**

```ts
it('groups repeated sources into one attribution entry', () => {
  const grouped = groupAttribution([
    { sourceId: 'benchlm', label: 'Data from BenchLM.ai', url: 'https://benchlm.ai/data/models.json', updatedAt: '2026-08-12T18:12:30.182Z' },
    { sourceId: 'benchlm', label: 'Data from BenchLM.ai', url: 'https://benchlm.ai/data/pricing.json', updatedAt: '2026-08-12T19:00:00.000Z' },
    { sourceId: 'openrouter', label: 'Catalog and pricing data from OpenRouter', url: 'https://openrouter.ai/api/v1/models', updatedAt: '2026-08-12T13:34:28.701Z' },
  ]);
  expect(grouped).toHaveLength(2);
  expect(grouped[0]).toMatchObject({ sourceId: 'benchlm', updatedAt: '2026-08-12T19:00:00.000Z' });
  expect(grouped[0].urls).toHaveLength(2);
  expect(grouped[1].sourceId).toBe('openrouter');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/frontend/leaderboard-table.test.tsx`
Expected: FAIL with "groupAttribution is not a function".

- [ ] **Step 3: Write the implementation**

```ts
export interface GroupedAttribution {
  readonly sourceId: string;
  readonly label: string;
  readonly urls: readonly string[];
  readonly updatedAt: string;
}

/** Collapses per-artifact attribution into one row per source. */
export function groupAttribution(
  attribution: readonly { sourceId: string; label: string; url: string; updatedAt: string }[],
): readonly GroupedAttribution[] {
  const bySource = new Map<string, { sourceId: string; label: string; urls: string[]; updatedAt: string }>();
  for (const item of attribution) {
    const existing = bySource.get(item.sourceId);
    if (!existing) {
      bySource.set(item.sourceId, { sourceId: item.sourceId, label: item.label, urls: [item.url], updatedAt: item.updatedAt });
      continue;
    }
    if (!existing.urls.includes(item.url)) existing.urls.push(item.url);
    if (item.updatedAt > existing.updatedAt) existing.updatedAt = item.updatedAt;
  }
  return [...bySource.values()];
}
```

Update `LeaderboardEvidence` to map over `groupAttribution(attribution)`. Render each label once with `Observed {formatDateTime(source.updatedAt)}`. When `urls.length > 1`, render numbered `Source 1`, `Source 2` links; otherwise link the label itself. Key list items by `sourceId`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/frontend/ && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/leaderboard-table.tsx src/frontend/leaderboard-table.test.tsx
git commit -m "refactor: group repeated leaderboard source attribution"
```

---

### Task 8: Full verification

**Files:**
- Modify: `browser-tests/responsive-browser.ts` (only if an assertion references removed copy)

**Interfaces:** Consumes everything above; produces no new interfaces.

- [ ] **Step 1: Run the full unit suite**

Run: `npm test`
Expected: PASS. Baseline before this work was 132 files / 1517 tests; the count should only grow.

- [ ] **Step 2: Typecheck and build**

Run: `npm run lint && npm run build`
Expected: Both succeed. Baseline `dist/assets/main.js` was 556,881 bytes; visx should add roughly 70KB raw.

- [ ] **Step 3: Verify charts survive SSR in the real page pipeline**

```bash
npx wrangler pages dev dist --port 8788 &
sleep 8
curl -sS http://127.0.0.1:8788/leaderboards/llm/value/ | grep -c "score-bar-chart"
curl -sS http://127.0.0.1:8788/leaderboards/llm/value/ | grep -c "No published entries"
```

Expected: the chart class appears at least once and "No published entries" appears zero times. Stop the dev server afterward.

- [ ] **Step 4: Run browser coverage**

Run: `npm run test:browser`
Expected: PASS. If an assertion fails because it expects the old "Decision-ready picks" heading, or a Supported Modalities column on a route that no longer publishes one, update the assertion to the new intended behavior — do not revert the source change.

- [ ] **Step 5: Commit any test updates**

```bash
git add browser-tests
git commit -m "test: align browser assertions with chart and column changes"
```

---

## Deferred (separate plans)

- **Cost-vs-score scatter on the Value Frontier** and **price distribution on pricing-context** — build after `ScoreBarChart` proves the SSR chart pattern in production.
- **Curated `MODEL_ALIASES`** bridging BenchLM and OpenRouter identities for broader route coverage. Needs per-model human review by design.
- **Long-tail model browsing** — the compare directory publishes 4,444 models against roughly 100 browsable today.
- **"What changed" strip** — `src/newsletter/revision-diff.ts` already computes price drops and new models for the newsletter but is never surfaced on-site.
