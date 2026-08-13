# TokenBench Broken Links, Visualization, and Paid-Tier Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair 3,011 unreachable model profile URLs, remove unit redundancy, link every model and leaderboard name to its page, add four source-backed visualizations, and retune ingestion for the Workers Paid plan.

**Architecture:** Four independent workstreams against one React + SSR frontend and one checkpointed Cloudflare Worker. Workstream A is a routing bug fix (highest priority — it is live SEO damage). Workstream B removes redundant units and adds missing internal links. Workstream C adds visx charts following the `ScoreBarChart` pattern already proven in production. Workstream D retunes the ingestion coordinator now that the account is on Workers Paid.

**Tech Stack:** TypeScript, React (SSR via `renderToString`), visx, Vitest, Playwright, Cloudflare Workers + Pages + D1 + R2, Wrangler.

## Global Constraints

- **Never fabricate data.** Missing evidence renders as an explicit `Unavailable` / `Not verified` state. Never substitute zero, an estimate, or a value from a different build.
- **No cross-source identity inference.** `MODEL_ALIASES` stays empty. Joins run on exact `modelKey`.
- **visx only — never Recharts.** Under `renderToString` in a DOM-free runtime Recharts emits an empty 127-byte shell (0 bars, 0 axis text) at 113KB gzipped; visx emits complete SVG at 24KB. These pages are server-rendered for SEO.
- **Charts reference `CHART_THEME`** (`src/frontend/charts/chart-theme.ts`), which maps to existing CSS custom properties. Never hardcode a hex color.
- **Published source ranks are authoritative.** Rank gaps (coding starts at #2; agentic shows 1, 3, 4) are correct published values. Explain them in the UI; never renumber.
- **The benchmark Worker is scheduled-only.** `fetch` returns HTTP 405. Never add a public refresh route.
- **Verification baseline before this plan:** 1,532 unit tests passing across 133 files; `npm run lint` and `npm run lint:workers` clean. One browser test (`renders the confirmation page with exactly one Start Exploring action`) fails on `main` already — it is pre-existing and unrelated. Do not chase it.
- **Session logging is mandatory** per `AGENTS.md`: append to `MindSpace_Vault/01 Logs/Agent/YYYY-MM-DD.md`.

## File Structure

| File | Responsibility | Workstream |
|---|---|---|
| `src/benchmarks/model-directory.ts` | `modelPath()` — the single canonical model link builder. Fix double-encoding here. | A |
| `src/frontend/price-performance-view.ts` | Formats price-performance facts. Remove the `score` unit suffix. | B |
| `src/frontend/price-performance-table.tsx` | Price-performance table header. Receives the unit label. | B |
| `src/pages/model-profile-page.tsx` | `CategoryCard` — link category names to leaderboards. | B |
| `src/frontend/charts/cost-score-scatter.tsx` | **New.** Cost-vs-score scatter with Pareto frontier. | C |
| `src/frontend/charts/price-histogram.tsx` | **New.** Price distribution histogram. | C |
| `src/frontend/charts/percentile-bar.tsx` | **New.** Inline percentile bar for profile category cards. | C |
| `src/pages/whats-changed.tsx` | **New.** Surfaces the already-computed revision diff. | C |
| `src/newsletter/revision-diff.ts` | Already computes `newModels` + `priceDrops`. Read-only here. | C |
| `workers/benchmark-ingest/src/coordinator.ts` | `BENCHMARK_STEP_DELAY_MS` and batch sizing. | D |
| `workers/benchmark-ingest/src/index.ts` | Remove `MAINTENANCE_FORCE_CRON` after the forced cycle publishes. | D |
| `workers/benchmark-ingest/wrangler.toml` | Cron triggers; `limits.cpu_ms`. | D |

---

## Workstream A — Broken model profile URLs (ship first)

### Task 1: Fix double-encoded model links

**Root cause (verified against production, 2026-08-13):** `sourceSpecificModelKey()` in `src/benchmarks/model-aliases.ts:33` builds keys as `` source:${sourceId}:${encodeURIComponent(sourceModelId)} ``. That already-encoded string becomes the directory `canonical_slug` — for example `source-litellm-libertai%2Fgemma-4-31b-it`. `modelPath()` then calls `encodeURIComponent` a **second** time, producing `%252F`. The Pages route decodes exactly once, yielding `%252F` → `%2F`… but the emitted link is what 404s.

Measured evidence:

```
GET /api/benchmarks/models/source-litellm-libertai%2Fgemma-4-31b-it    → 200
GET /api/benchmarks/models/source-litellm-libertai%252Fgemma-4-31b-it  → 404   ← what modelPath() emits
```

Blast radius: **3,075 of 4,444 current directory rows** contain `%2F`, `%3A`, or `%20`. The live sitemap `/sitemaps/models.xml` publishes 4,444 URLs of which **3,011 contain `%252F`/`%253A` and return 404**. On `/leaderboards/llm/pricing-context/`, 50 of 51 model links are dead.

**Files:**
- Modify: `src/benchmarks/model-directory.ts:100-103`
- Test: `src/benchmarks/model-directory.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `modelPath(slug: string): string` — unchanged signature, corrected output. All 11 call sites keep working unchanged.

- [ ] **Step 1: Write the failing test**

In `src/benchmarks/model-directory.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { modelPath } from './model-directory';

describe('modelPath percent-encoded slugs', () => {
  it('does not re-encode a slug that already contains percent escapes', () => {
    // Directory slugs are built by sourceSpecificModelKey(), which already
    // encodeURIComponent()s the upstream model id. Encoding again produced
    // %252F and a live 404 for 3,011 sitemap URLs.
    expect(modelPath('source-litellm-libertai%2Fgemma-4-31b-it'))
      .toBe('/models/source-litellm-libertai%2Fgemma-4-31b-it/');
  });

  it('round-trips through one decodeURIComponent back to the stored slug', () => {
    const stored = 'source-litellm-1024-x-1024%2Fdall-e-2';
    const segment = modelPath(stored).replace('/models/', '').replace(/\/$/, '');
    expect(decodeURIComponent(segment)).toBe(stored);
  });

  it('still encodes a raw slug that has never been encoded', () => {
    expect(modelPath('claude fable')).toBe('/models/claude%20fable/');
  });

  it('still rejects a slug containing a literal path separator', () => {
    expect(() => modelPath('a/b')).toThrow('model slug must be one route segment');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/benchmarks/model-directory.test.ts -t "percent-encoded"`
Expected: FAIL — received `/models/source-litellm-libertai%252Fgemma-4-31b-it/`, expected `%2F`.

- [ ] **Step 3: Write minimal implementation**

Replace `modelPath` in `src/benchmarks/model-directory.ts`:

```typescript
/** True when every percent sequence in the slug is already a valid escape. */
function isAlreadyPercentEncoded(slug: string): boolean {
  if (!slug.includes('%')) return false;
  try {
    return decodeURIComponent(slug) !== slug;
  } catch {
    return false;
  }
}

/**
 * Builds the sole canonical internal model link.
 *
 * Directory slugs produced by `sourceSpecificModelKey()` are already
 * percent-encoded. Encoding them again yields %252F, which the single-decode
 * route cannot resolve — this produced 3,011 live 404s. Encode only slugs that
 * are not already encoded.
 */
export function modelPath(slug: string): string {
  if (!isModelSlugRouteSafe(slug)) throw new Error(MODEL_SLUG_ERROR);
  const segment = isAlreadyPercentEncoded(slug) ? slug : encodeURIComponent(slug);
  return `/models/${segment}/`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/benchmarks/model-directory.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full unit suite for regressions**

Run: `npm test`
Expected: at least the 1,532-test baseline passing, plus the 4 new tests. `modelPath` has 11 non-test call sites (home, leaderboard table, comparison page, price-performance view, sitemap); any failure here is a real regression, not a flake.

- [ ] **Step 6: Verify the sitemap contract explicitly**

Run: `npx vitest run functions/sitemaps/models.xml.test.ts`
Expected: PASS. The sitemap builds every URL through `modelPath`, so this proves the SEO fix.

- [ ] **Step 7: Commit**

```bash
git add src/benchmarks/model-directory.ts src/benchmarks/model-directory.test.ts
git commit -m "fix: stop double-encoding already-encoded model slugs

Directory slugs from sourceSpecificModelKey() are already percent-encoded.
modelPath() encoded them a second time, emitting %252F, which the
single-decode /models/[slug] route resolves to a slug that does not exist.
3,011 of 4,444 sitemap URLs returned 404, and 50 of 51 model links on the
pricing-context leaderboard were dead."
```

### Task 2: Prove the fix against production data

**Files:**
- Test: `src/benchmarks/model-directory.test.ts` (extend)

**Interfaces:**
- Consumes: `modelPath()` from Task 1.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Write a table-driven test over real production slug shapes**

```typescript
describe('modelPath against real production slug shapes', () => {
  // Sampled from benchmark_model_directory on 2026-08-13.
  const productionSlugs = [
    'gemma-4-31b',
    'claude-fable',
    'source-litellm-bedrock_mantle%2Fgoogle.gemma-4-31b',
    'source-litellm-libertai%2Fgemma-4-31b-it',
    'source-litellm-1024-x-1024%2F50-steps%2Fbedrock%2Famazon.nova-canvas-v1%3A0',
    'source-openrouter-cohere%2Fnorth-mini-code%3Afree',
    'source-openrouter-google%2Flyria-3-pro-preview',
  ];

  it('emits a path that decodes back to the stored slug for every shape', () => {
    for (const slug of productionSlugs) {
      const segment = modelPath(slug).replace('/models/', '').replace(/\/$/, '');
      expect(decodeURIComponent(segment)).toBe(slug);
    }
  });

  it('never emits a double-encoded escape', () => {
    for (const slug of productionSlugs) {
      expect(modelPath(slug)).not.toMatch(/%25[0-9A-Fa-f]{2}/);
    }
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/benchmarks/model-directory.test.ts -t "production slug shapes"`
Expected: PASS (Task 1 already implements the behavior; this is the regression net).

- [ ] **Step 3: Commit**

```bash
git add src/benchmarks/model-directory.test.ts
git commit -m "test: pin model path encoding against production slug shapes"
```

- [ ] **Step 4: Post-deploy live verification (run after deployment, not before)**

```bash
curl -sS https://tokenbench.monomind.one/sitemaps/models.xml -o /tmp/sm.xml
grep -c "<loc>" /tmp/sm.xml          # expect 4444
grep -c "%252F\|%253A" /tmp/sm.xml   # expect 0 (was 3011)
```

Then spot-check three formerly-dead URLs for HTTP 200:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  "https://tokenbench.monomind.one/models/source-litellm-libertai%2Fgemma-4-31b-it/"
```

---

## Workstream B — Redundancy and missing internal links

### Task 3: Remove the "score" unit suffix from price-performance

The live `/llm-price-performance/` page renders values as `53 score` and `56.95 score / $`. The number alone is sufficient; the unit belongs in the column header.

**Files:**
- Modify: `src/frontend/price-performance-view.ts:44-58`
- Test: `src/frontend/price-performance-view.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `formatPricePerformancePointView()` returns `scorePerDollar` as a bare number string (e.g. `'56.95'`) or `'Unavailable'`. The `accessibleName` keeps the word "score" — screen-reader users need the unit spoken since they cannot see the column header.

- [ ] **Step 1: Write the failing test**

```typescript
it('renders score per dollar as a bare number without a unit suffix', () => {
  const facts = formatPricePerformancePointView(pointFixture({ scorePerDollar: 56.95 }));
  expect(facts.scorePerDollar).toBe('56.95');
});

it('keeps the explicit unavailable state when score per dollar is missing', () => {
  const facts = formatPricePerformancePointView(pointFixture({ scorePerDollar: null }));
  expect(facts.scorePerDollar).toBe('Unavailable');
});

it('still speaks the unit in the accessible name', () => {
  const facts = formatPricePerformancePointView(pointFixture({ scorePerDollar: 56.95 }));
  expect(facts.accessibleName).toContain('56.95 score per dollar');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/frontend/price-performance-view.test.ts -t "bare number"`
Expected: FAIL — received `'56.95 score / $'`.

- [ ] **Step 3: Write minimal implementation**

In `src/frontend/price-performance-view.ts`:

```typescript
  const scorePerDollar = point.scorePerDollar === null
    ? 'Unavailable'
    : formatNumber(point.scorePerDollar, 2);
```

And in the same function update the accessible name so the unit is still spoken:

```typescript
  const spokenScorePerDollar = point.scorePerDollar === null
    ? 'score per dollar unavailable'
    : `${formatNumber(point.scorePerDollar, 2)} score per dollar`;
  const accessibleName = `${point.displayName}, score ${score}, ${selectedCost}, ${spokenScorePerDollar}, ${evidence}, ${frontier}`;
```

- [ ] **Step 4: Update the table header to carry the unit**

In `src/frontend/price-performance-table.tsx`, change the score-per-dollar column header text to `Score / $` so the unit is stated exactly once per column rather than once per cell.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/frontend/price-performance-view.test.ts src/frontend/price-performance-table.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/price-performance-view.ts src/frontend/price-performance-view.test.ts src/frontend/price-performance-table.tsx
git commit -m "refactor: state the score unit once per column, not once per cell"
```

### Task 4: Link category names on model profiles to their leaderboards

`CategoryCard` in `src/pages/model-profile-page.tsx:37` renders "Coding", "Agentic", "Reasoning" as plain `<span>` text. A reader looking at a model's coding score has no path to the coding leaderboard.

**Files:**
- Modify: `src/pages/model-profile-page.tsx:37-46`
- Test: `src/pages/model-profile-page.test.tsx`

**Interfaces:**
- Consumes: `LEADERBOARD_ROUTES` from `src/routing/routes.ts`; `ModelProfileCategory` (has `key`, `label`).
- Produces: `categoryLeaderboardPath(categoryKey: string): string | null` — exported from `src/pages/model-profile-page.tsx`; returns `null` when a category has no matching leaderboard route, in which case the label stays plain text.

**Verified key mapping (checked against the live API and `src/routing/routes.ts` on 2026-08-13).** Live profile category keys are `agentic`, `coding`, `knowledge`, `multimodalGrounded`, `overall`. Route keys are `llm-overall`, `llm-coding`, `llm-agentic`, `llm-reasoning`, `llm-knowledge`, `llm-human-preference`, `llm-value`, `llm-pricing-context`, `multimodal-vision-documents`, plus the `media-*` set.

A `` `llm-${key}` `` template is **wrong**: it resolves for `coding`, `agentic`, `knowledge`, and `overall`, but `multimodalGrounded` would yield `llm-multimodalGrounded`, which does not exist. Its real route is `multimodal-vision-documents`. Use the explicit lookup table below.

- [ ] **Step 1: Write the failing test**

```typescript
import { categoryLeaderboardPath } from './model-profile-page';

describe('categoryLeaderboardPath', () => {
  it('maps a known category key to its leaderboard route', () => {
    expect(categoryLeaderboardPath('coding')).toBe('/leaderboards/llm/coding/');
    expect(categoryLeaderboardPath('agentic')).toBe('/leaderboards/llm/agentic/');
    expect(categoryLeaderboardPath('knowledge')).toBe('/leaderboards/llm/knowledge/');
    expect(categoryLeaderboardPath('overall')).toBe('/leaderboards/llm/overall/');
  });

  it('maps the multimodal category to its non-llm route', () => {
    // Guards the interpolation bug: `llm-multimodalGrounded` does not exist.
    expect(categoryLeaderboardPath('multimodalGrounded'))
      .toBe('/leaderboards/multimodal/vision-documents/');
  });

  it('returns null for a category with no leaderboard so the label stays plain text', () => {
    expect(categoryLeaderboardPath('not-a-real-category')).toBeNull();
  });
});

it('renders the category name as a link to its leaderboard', () => {
  const html = renderToString(<CategoryCard category={categoryFixture({ key: 'coding', label: 'Coding' })} />);
  expect(html).toContain('href="/leaderboards/llm/coding/"');
  expect(html).toContain('Coding');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/model-profile-page.test.tsx -t "categoryLeaderboardPath"`
Expected: FAIL with "categoryLeaderboardPath is not a function".

- [ ] **Step 3: Write minimal implementation**

In `src/pages/model-profile-page.tsx`:

```typescript
import { LEADERBOARD_ROUTES, type LeaderboardKey } from '../routing/routes';

/**
 * Explicit category-key to leaderboard-key mapping. Deliberately not derived by
 * string interpolation: `multimodalGrounded` maps to a non-`llm-` route, so a
 * template would silently emit a dead link.
 */
const CATEGORY_LEADERBOARDS: Readonly<Record<string, LeaderboardKey>> = {
  overall: 'llm-overall',
  coding: 'llm-coding',
  agentic: 'llm-agentic',
  knowledge: 'llm-knowledge',
  reasoning: 'llm-reasoning',
  multimodalGrounded: 'multimodal-vision-documents',
};

/**
 * Maps a profile category key to its leaderboard route. Returns null when no
 * leaderboard publishes that category, so the label renders as plain text
 * rather than a link that would 404.
 */
export function categoryLeaderboardPath(categoryKey: string): string | null {
  const routeKey = CATEGORY_LEADERBOARDS[categoryKey];
  return routeKey ? LEADERBOARD_ROUTES[routeKey].pathname : null;
}
```

Then in `CategoryCard`, replace the header span:

```typescript
function CategoryCard({ category }: { readonly category: ModelProfileCategory }) {
  const leaderboardPath = categoryLeaderboardPath(category.key);
  return <article className="model-category-card" aria-label={category.label}>
    <header>
      {leaderboardPath
        ? <a href={leaderboardPath}>{category.label}</a>
        : <span>{category.label}</span>}
      <small>{category.evidenceStatus.replace('_', ' ')}</small>
    </header>
    {/* …rest unchanged… */}
```

- [ ] **Step 4: Verify the key mapping against real data before trusting it**

Run: `npx vitest run src/pages/model-profile-page.test.tsx`
Expected: PASS. If `llm-${key}` does not match the route keys, fix the mapping — do **not** loosen the test. Confirm actual category keys with:

```bash
curl -sS https://tokenbench.monomind.one/api/benchmarks/models/claude-fable | \
  python3 -c "import sys,json;print([c['key'] for c in json.load(sys.stdin)['data']['profile']['categories']])"
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/model-profile-page.tsx src/pages/model-profile-page.test.tsx
git commit -m "feat: link profile category names to their leaderboards"
```

---

## Workstream C — Visualization

### Task 5: Cost-vs-score scatter with Pareto frontier

The highest-value chart on the site: score and cost on the same axes makes overpaying visible in a way a sorted table cannot.

**Files:**
- Create: `src/frontend/charts/cost-score-scatter.tsx`
- Create: `src/frontend/charts/cost-score-scatter.test.tsx`
- Modify: `src/pages/leaderboards-page.tsx` (render on the `llm-value` route only)

**Interfaces:**
- Consumes: `CHART_THEME` from `./chart-theme`.
- Produces:
  ```typescript
  export interface CostScorePoint {
    readonly label: string;
    readonly cost: number;      // USD per 1M tokens
    readonly score: number;
    readonly frontier: boolean; // on the Pareto frontier
    readonly href: string | null;
  }
  export function CostScoreScatter(props: {
    readonly data: readonly CostScorePoint[];
    readonly ariaLabel: string;
    readonly width?: number;
  }): JSX.Element | null;
  ```

- [ ] **Step 1: Write the failing test**

```typescript
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CostScoreScatter, type CostScorePoint } from './cost-score-scatter';

const data: readonly CostScorePoint[] = [
  { label: 'Hy3', cost: 0, score: 41.2, frontier: true, href: '/models/hy3/' },
  { label: 'Claude Opus 5', cost: 10, score: 80.4, frontier: true, href: '/models/claude-opus-5/' },
  { label: 'Overpriced', cost: 18, score: 60.1, frontier: false, href: null },
];

describe('CostScoreScatter', () => {
  it('renders one marker per point in server-rendered SVG', () => {
    const html = renderToString(<CostScoreScatter data={data} ariaLabel="Cost versus score" />);
    expect(html.match(/<circle/g)).toHaveLength(3);
  });

  it('connects only frontier points with the frontier path', () => {
    const html = renderToString(<CostScoreScatter data={data} ariaLabel="Cost versus score" />);
    expect(html).toContain('class="cost-score-frontier"');
  });

  it('exposes the accessible label', () => {
    const html = renderToString(<CostScoreScatter data={data} ariaLabel="Cost versus score" />);
    expect(html).toContain('aria-label="Cost versus score"');
  });

  it('renders nothing when there is no data rather than an empty axis', () => {
    expect(renderToString(<CostScoreScatter data={[]} ariaLabel="Cost versus score" />)).toBe('');
  });

  it('does not emit a marker for a point with a non-finite value', () => {
    const bad = [{ label: 'X', cost: Number.NaN, score: 50, frontier: false, href: null }];
    expect(renderToString(<CostScoreScatter data={bad} ariaLabel="Cost versus score" />)).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/frontend/charts/cost-score-scatter.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
import { AxisBottom, AxisLeft } from '@visx/axis';
import { Group } from '@visx/group';
import { scaleLinear } from '@visx/scale';
import { LinePath } from '@visx/shape';
import { CHART_THEME } from './chart-theme';

export interface CostScorePoint {
  readonly label: string;
  readonly cost: number;
  readonly score: number;
  readonly frontier: boolean;
  readonly href: string | null;
}

export interface CostScoreScatterProps {
  readonly data: readonly CostScorePoint[];
  readonly ariaLabel: string;
  readonly width?: number;
}

const MARGIN = { top: 16, right: 24, bottom: 44, left: 52 };
const HEIGHT = 360;

export function CostScoreScatter({ data, ariaLabel, width = 720 }: CostScoreScatterProps) {
  const points = data.filter((p) => Number.isFinite(p.cost) && Number.isFinite(p.score));
  if (points.length === 0 || points.length !== data.length) return null;

  const plotWidth = Math.max(120, width - MARGIN.left - MARGIN.right);
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const maxCost = Math.max(...points.map((p) => p.cost), 0);
  const maxScore = Math.max(...points.map((p) => p.score), 0);
  const x = scaleLinear({ domain: [0, maxCost === 0 ? 1 : maxCost], range: [0, plotWidth], nice: true });
  const y = scaleLinear({ domain: [0, maxScore === 0 ? 1 : maxScore], range: [plotHeight, 0], nice: true });
  const frontier = points.filter((p) => p.frontier).slice().sort((a, b) => a.cost - b.cost);

  return <svg
    className="cost-score-scatter"
    viewBox={`0 0 ${width} ${HEIGHT}`}
    width="100%"
    height={HEIGHT}
    role="img"
    aria-label={ariaLabel}
  >
    <Group left={MARGIN.left} top={MARGIN.top}>
      {frontier.length > 1 && <LinePath
        className="cost-score-frontier"
        data={frontier}
        x={(p) => x(p.cost)}
        y={(p) => y(p.score)}
        stroke={CHART_THEME.bar}
        strokeWidth={2}
        fill="none"
      />}
      {points.map((p) => <circle
        key={p.label}
        cx={x(p.cost)}
        cy={y(p.score)}
        r={p.frontier ? 6 : 4}
        fill={p.frontier ? CHART_THEME.bar : CHART_THEME.barMuted}
      >
        <title>{`${p.label}: ${p.score} at $${p.cost} per 1M tokens`}</title>
      </circle>)}
      <AxisLeft scale={y} numTicks={5} stroke={CHART_THEME.axis} tickStroke={CHART_THEME.axis} label="Score" />
      <AxisBottom top={plotHeight} scale={x} numTicks={5} stroke={CHART_THEME.axis} tickStroke={CHART_THEME.axis} label="USD per 1M tokens" />
    </Group>
  </svg>;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/frontend/charts/cost-score-scatter.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Render it on the value leaderboard**

In `src/pages/leaderboards-page.tsx`, add a `ValueFrontierChart` section rendered only when `keyName === 'llm-value'`, following the existing `LeaderboardScoreChart` pattern (panel + `panel-heading` + eyebrow + `<h2>` + explanatory `<p>`). Drop entries with no published price or score rather than plotting them at zero.

- [ ] **Step 6: Run the page tests**

Run: `npx vitest run src/pages/leaderboards-page.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/frontend/charts/cost-score-scatter.tsx src/frontend/charts/cost-score-scatter.test.tsx src/pages/leaderboards-page.tsx
git commit -m "feat: add cost-versus-score scatter with Pareto frontier"
```

**Note:** this chart is only visible once the value route serves non-zero entries. Confirm with `curl -sS https://tokenbench.monomind.one/api/benchmarks/leaderboards/llm-value` before judging it broken.

### Task 6: "What changed this week" strip

`src/newsletter/revision-diff.ts` already computes `newModels` and `priceDrops` between revisions, is already tested, and already feeds the newsletter — but has never been shown on the site. This is surfacing existing computation, not new derivation.

**Files:**
- Create: `src/pages/whats-changed.tsx`
- Create: `src/pages/whats-changed.test.tsx`
- Modify: `src/pages/home-page.tsx`

**Interfaces:**
- Consumes: `RevisionChanges` from `src/newsletter/revision-diff.ts` — `{ fromRevision, toRevision, dedupeKey, newModels, priceDrops }`.
- Produces:
  ```typescript
  export function WhatsChangedStrip(props: {
    readonly changes: RevisionChanges | null;
  }): JSX.Element | null;
  ```

- [ ] **Step 1: Write the failing test**

```typescript
it('summarizes new models and price drops', () => {
  const html = renderToString(<WhatsChangedStrip changes={changesFixture({ newModels: [m1, m2], priceDrops: [d1] })} />);
  expect(html).toContain('2 new models');
  expect(html).toContain('1 price drop');
});

it('uses singular wording for exactly one change', () => {
  const html = renderToString(<WhatsChangedStrip changes={changesFixture({ newModels: [m1], priceDrops: [] })} />);
  expect(html).toContain('1 new model');
  expect(html).not.toContain('new models');
});

it('renders nothing when there is no diff rather than an empty strip', () => {
  expect(renderToString(<WhatsChangedStrip changes={null} />)).toBe('');
});

it('renders nothing when the diff is empty', () => {
  expect(renderToString(<WhatsChangedStrip changes={changesFixture({ newModels: [], priceDrops: [] })} />)).toBe('');
});

it('links each new model to its profile', () => {
  const html = renderToString(<WhatsChangedStrip changes={changesFixture({ newModels: [m1], priceDrops: [] })} />);
  expect(html).toContain(`href="${modelPath(m1.slug)}"`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/whats-changed.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `WhatsChangedStrip`**

Return `null` when `changes` is `null` or both arrays are empty. Otherwise render a `panel` with counts and up to five linked entries, using `modelPath()` for every model link. Never invent a change that the diff did not report.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/pages/whats-changed.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Mount it on the homepage**

Render `<WhatsChangedStrip>` above the snapshot cards in `src/pages/home-page.tsx`. If no diff is available from the current payload, pass `null` — the component self-hides.

- [ ] **Step 6: Run the homepage tests**

Run: `npx vitest run src/pages/home-page.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/whats-changed.tsx src/pages/whats-changed.test.tsx src/pages/home-page.tsx
git commit -m "feat: surface the weekly revision diff on the homepage"
```

### Task 7: Percentile bars on profile category cards

`CategoryCard` renders percentile as a `dt`/`dd` text pair. A short bar reads faster and reuses the radar's existing percentile data.

**Files:**
- Create: `src/frontend/charts/percentile-bar.tsx`
- Create: `src/frontend/charts/percentile-bar.test.tsx`
- Modify: `src/pages/model-profile-page.tsx`

**Interfaces:**
- Consumes: `CHART_THEME`.
- Produces: `export function PercentileBar(props: { readonly percentile: number | null; readonly label: string }): JSX.Element;`

- [ ] **Step 1: Write the failing test**

```typescript
it('renders a bar whose width matches the percentile', () => {
  const html = renderToString(<PercentileBar percentile={72.5} label="Coding percentile" />);
  expect(html).toContain('72.5%');
  expect(html).toContain('role="img"');
});

it('renders an explicit unavailable state instead of a zero-width bar', () => {
  const html = renderToString(<PercentileBar percentile={null} label="Coding percentile" />);
  expect(html).toContain('Unavailable');
  expect(html).not.toContain('width: 0%');
});

it('clamps an out-of-range percentile', () => {
  expect(renderToString(<PercentileBar percentile={140} label="x" />)).toContain('100%');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/frontend/charts/percentile-bar.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement, clamping to 0-100 and returning the explicit unavailable state for `null`.**

- [ ] **Step 4: Run tests** — Expected: PASS.

- [ ] **Step 5: Use it in `CategoryCard`**, replacing the percentile `dt`/`dd` pair.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/charts/percentile-bar.tsx src/frontend/charts/percentile-bar.test.tsx src/pages/model-profile-page.tsx
git commit -m "feat: show category percentiles as bars"
```

### Task 8: Price distribution histogram on pricing-context

**Files:**
- Create: `src/frontend/charts/price-histogram.tsx`
- Create: `src/frontend/charts/price-histogram.test.tsx`
- Modify: `src/pages/leaderboards-page.tsx` (render only for `llm-pricing-context`)

**Interfaces:**
- Produces:
  ```typescript
  export interface PriceBucket { readonly from: number; readonly to: number; readonly count: number; }
  export function priceBuckets(prices: readonly number[], bucketCount?: number): readonly PriceBucket[];
  export function PriceHistogram(props: {
    readonly buckets: readonly PriceBucket[];
    readonly ariaLabel: string;
    readonly width?: number;
  }): JSX.Element | null;
  ```

- [ ] **Step 1: Write the failing test**

```typescript
describe('priceBuckets', () => {
  it('groups prices into contiguous buckets covering the range', () => {
    const buckets = priceBuckets([0, 1, 2, 3, 10], 5);
    expect(buckets).toHaveLength(5);
    expect(buckets[0].from).toBe(0);
    expect(buckets[buckets.length - 1].to).toBe(10);
    expect(buckets.reduce((sum, b) => sum + b.count, 0)).toBe(5);
  });

  it('returns no buckets for an empty input', () => {
    expect(priceBuckets([], 5)).toEqual([]);
  });

  it('ignores non-finite prices rather than bucketing them at zero', () => {
    const buckets = priceBuckets([1, Number.NaN, 3], 2);
    expect(buckets.reduce((sum, b) => sum + b.count, 0)).toBe(2);
  });
});

it('renders one bar per non-empty bucket', () => {
  const html = renderToString(<PriceHistogram buckets={priceBuckets([0, 1, 2, 3, 10], 5)} ariaLabel="Price distribution" />);
  expect(html).toContain('aria-label="Price distribution"');
});
```

- [ ] **Step 2: Run to verify failure** — Expected: FAIL, module not found.

- [ ] **Step 3: Implement `priceBuckets` and `PriceHistogram`** using `scaleBand`/`scaleLinear` and `CHART_THEME`.

- [ ] **Step 4: Run tests** — Expected: PASS.

- [ ] **Step 5: Render on the pricing-context route only.**

- [ ] **Step 6: Commit**

```bash
git add src/frontend/charts/price-histogram.tsx src/frontend/charts/price-histogram.test.tsx src/pages/leaderboards-page.tsx
git commit -m "feat: add a price distribution histogram to pricing context"
```

---

## Workstream D — Workers Paid retuning

### Task 9: Remove the temporary maintenance cron

**Prerequisite:** the forced cycle `bf0998b8-338f-4ad4-9ca9-c5a4a4baa295` must reach `published`. Confirm with:

```bash
CLOUDFLARE_ACCOUNT_ID=e9ac0943443affe2bd7b18971265deee npm run inspect:ingestion -- --scope benchmarks
```

**Files:**
- Modify: `workers/benchmark-ingest/src/index.ts` (remove `MAINTENANCE_FORCE_CRON` and its branch)
- Modify: `workers/benchmark-ingest/wrangler.toml` (restore `crons = ["15 2 * * SUN"]`)
- Modify: `workers/benchmark-ingest/src/index.test.ts` (remove the two force tests)

- [ ] **Step 1: Confirm the forced cycle published and the value route is non-empty**

```bash
curl -sS https://tokenbench.monomind.one/api/benchmarks/leaderboards/llm-value | \
  python3 -c "import sys,json;print('entries', len(json.load(sys.stdin)['data']['entries']))"
```
Expected: non-zero (was 0).

- [ ] **Step 2: Remove the force path, its config entry, and its two tests.**

- [ ] **Step 3: Verify the weekly cron is the only trigger**

Run: `npx vitest run workers/benchmark-ingest/src/index.test.ts && npm run lint:workers`
Expected: PASS and clean.

- [ ] **Step 4: Deploy and confirm exactly one schedule**

```bash
CLOUDFLARE_ACCOUNT_ID=e9ac0943443affe2bd7b18971265deee \
  npx wrangler deploy --config workers/benchmark-ingest/wrangler.toml
```
Expected output lists `schedule: 15 2 * * SUN` and nothing else.

- [ ] **Step 5: Commit**

```bash
git add workers/benchmark-ingest/
git commit -m "chore: remove the temporary maintenance cron after the forced cycle published"
```

### Task 10: Retune step pacing for Workers Paid

**Measured baseline (cycle `60b8a16f`, 2026-08-12):** 207 steps — `stage-cache` 93, `stage-profiles` 46, `retrieve-lmarena-pages` 22, `normalize-sources` 19, `stage-facts` 14, plus 13 others. At `BENCHMARK_STEP_DELAY_MS = 15_000` that is **51.8 minutes of pure alarm delay out of a 54.2-minute run — 95% idle**.

Workers Paid raises Cron CPU from 10 ms to 15 min and Durable Object alarm CPU from 10 ms to 30 s (configurable to 5 min via `limits.cpu_ms`).

**Do not remove checkpointing.** It provides idempotency and restart-resumption, which are correctness properties independent of the CPU limit. **D1 limits are unchanged by the plan** — the 32 MiB aggregate RPC ceiling and the 16 MiB batch bounds in `partitioned-publication.ts` must stay exactly as they are.

**Files:**
- Modify: `workers/benchmark-ingest/src/coordinator.ts:224`
- Modify: `workers/benchmark-ingest/wrangler.toml`
- Test: `workers/benchmark-ingest/src/coordinator.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
it('schedules the next alarm using the paid-tier step delay', () => {
  expect(BENCHMARK_STEP_DELAY_MS).toBe(500);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run workers/benchmark-ingest/src/coordinator.test.ts -t "paid-tier step delay"`
Expected: FAIL — received `15000`.

- [ ] **Step 3: Change the constant**

```typescript
/**
 * Alarm spacing between bounded steps. 15s was a Workers Free pacing guard when
 * each alarm had a 10 ms CPU ceiling; on Workers Paid the ceiling is 30 s, so
 * the delay only needs to keep alarm delivery orderly.
 */
export const BENCHMARK_STEP_DELAY_MS = 500;
```

- [ ] **Step 4: Raise the DO CPU ceiling explicitly**

In `workers/benchmark-ingest/wrangler.toml`:

```toml
[limits]
cpu_ms = 300000
```

- [ ] **Step 5: Run the full worker suite**

Run: `npx vitest run workers/benchmark-ingest/ && npm run lint:workers`
Expected: PASS and clean. Several coordinator tests assert `alarmAt === nowMs + BENCHMARK_STEP_DELAY_MS`; they should follow the constant automatically. Any test with a hardcoded `15000` must be updated to reference the constant.

- [ ] **Step 6: Commit**

```bash
git add workers/benchmark-ingest/
git commit -m "perf: retune ingestion step pacing for Workers Paid

207 steps at a 15s alarm delay meant 51.8 of 54.2 minutes were pure idle.
The 15s spacing was a Free-tier guard for a 10 ms CPU ceiling; Paid raises
alarm CPU to 30s. Checkpointing is unchanged, and D1 batch bounds stay as
they are because the plan does not affect D1 limits."
```

- [ ] **Step 7: Verify against a real cycle before claiming the speedup**

After the next cycle, re-run the step ledger query and record observed wall time. Do not state a speedup figure that has not been observed:

```sql
SELECT phase, COUNT(*) steps, MIN(started_at), MAX(completed_at)
FROM ingestion_cycle_steps WHERE cycle_id = '<new-cycle-id>' GROUP BY phase;
```

### Task 11: Cache-only republish path

Tonight's incident: a **derivation** fix required a full 207-step re-ingest of upstream data that had not changed, and the ISO-week dedupe blocked it entirely. A path that rebuilds only `api_response_cache` from the already-active revision makes future derivation fixes a seconds-long operation with zero upstream fetches.

`buildUnchangedPublicationStatementPlan` (`workers/benchmark-ingest/src/index.ts:2384`) already does exactly this work — it calls `appendMaterializedBenchmarkApiResponseStatements` and swaps the cache pointer. This task exposes it as its own cadence-independent operation.

**Files:**
- Modify: `workers/benchmark-ingest/src/coordinator.ts`
- Test: `workers/benchmark-ingest/src/coordinator.test.ts`

**Interfaces:**
- Produces: `republishCache(): Promise<{ status: 'republished' | 'no-active-revision'; revision: string | null }>` on `BenchmarkIngestCoordinator` — reachable only from the scheduled handler, never from `fetch`.

- [ ] **Step 1: Write the failing test**

```typescript
it('rebuilds cache rows from the active revision without fetching upstream', async () => {
  const fetchSpy = vi.fn();
  const coordinator = new BenchmarkIngestCoordinator({ storage: storage() } as never, env, baseDeps(steps, { fetchImpl: fetchSpy }));
  const result = await coordinator.republishCache();
  expect(result.status).toBe('republished');
  expect(fetchSpy).not.toHaveBeenCalled();
});

it('is not blocked by an already-published cadence key', async () => {
  const { env } = environment({ publishedReceipt: true });
  const coordinator = new BenchmarkIngestCoordinator({ storage: storage() } as never, env, baseDeps(steps));
  expect((await coordinator.republishCache()).status).toBe('republished');
});

it('reports no-active-revision instead of publishing an empty cache', async () => {
  const { env } = environment({ activeRevision: null });
  const coordinator = new BenchmarkIngestCoordinator({ storage: storage() } as never, env, baseDeps(steps));
  expect((await coordinator.republishCache()).status).toBe('no-active-revision');
});
```

- [ ] **Step 2: Run to verify failure** — Expected: FAIL, `republishCache is not a function`.

- [ ] **Step 3: Implement `republishCache()`**, reusing `buildUnchangedPublicationStatementPlan` against the active snapshot. It must not consult `benchmarkCadenceKey` or `hasPublishedReceipt`, and must not perform any upstream fetch.

- [ ] **Step 4: Run tests** — `npx vitest run workers/benchmark-ingest/` — Expected: PASS.

- [ ] **Step 5: Confirm `fetch` still returns 405.**

Run: `npx vitest run workers/benchmark-ingest/src/index.test.ts -t "does not expose a public refresh route"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add workers/benchmark-ingest/
git commit -m "feat: add a cache-only republish path for derivation fixes"
```

---

## Final verification

- [ ] `npm test` — at least baseline 1,532 plus new tests
- [ ] `npm run lint` and `npm run lint:workers` — clean
- [ ] `npm run build`
- [ ] `npm run test:browser` — 71/72; the newsletter-confirmation failure is pre-existing on `main`
- [ ] Deploy Worker first, then Pages, per `docs/tokenbench-deployment.md`
- [ ] Bump `FRONTEND_ASSET_REVISION` before the Pages deploy or returning visitors get stale cached JS
- [ ] Live: `grep -c "%252F\|%253A"` on `/sitemaps/models.xml` returns **0** (was 3,011)
- [ ] Live: three formerly-dead model URLs return 200
- [ ] Live: `/llm-price-performance/` shows no `score` unit suffix in table cells
- [ ] Live: model profile category names link to leaderboards
- [ ] Append a session entry to `MindSpace_Vault/01 Logs/Agent/2026-08-13.md`

## Deferred

- Curated `MODEL_ALIASES` bridging BenchLM and OpenRouter identities — needs per-model human review by design.
- Long-tail model browsing: 4,444 models published, roughly 100 browsable.
- Score-over-revision sparklines in leaderboard rows — needs a revision-history projection that does not exist yet.
