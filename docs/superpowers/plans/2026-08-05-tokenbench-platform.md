# TokenBench Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the existing AI plan calculator into TokenBench, a dark-first AI cost and model decision platform with cached public benchmark data, workload-aware leaderboards, crawlable dynamic comparison pages, guides, and MonoMind lead generation.

**Architecture:** Keep React 19, Vite, Cloudflare Pages, D1, R2, and the existing catalog pipeline. Add a separate scheduled benchmark Worker that publishes immutable, atomic revisions from BenchLM and LMArena, with LiteLLM used as pricing corroboration and OpenRouter retained as the route-level catalog. Fixed routes are generated as crawlable HTML during the Vite build; `/compare/:pair` is rendered by a Pages Function from the active D1 revision and enhanced by React in the browser.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Vitest, Testing Library, Playwright, Cloudflare Pages Functions, Workers, D1, R2, Wrangler.

## Global Constraints

- Product name: **TokenBench**.
- Tagline: **The Decision Engine for AI Costs & Model Benchmarks**.
- Canonical production origin: `https://tokenbench.monomind.one`.
- Redirect every request on `https://ai-plans.monomind.one` to the equivalent TokenBench URL with HTTP 301.
- Parent endorsement: **Powered by MonoMind AI Lab**, linked to `https://monomind.one/`.
- Use the supplied MonoMind monogram as the product icon and favicon, paired with a text wordmark reading `TokenBench`.
- Copy the user-provided `DESIGN-composio.md` to repository-root `DESIGN.md` and treat it as the visual source of truth.
- Copy the supplied logo into `public/brand/`; retain the original source PNG in the repository.
- Default to dark mode and provide a complete persisted light-mode toggle.
- Preserve the existing language selector and prevent the Google Translate configuration banner from becoming visible.
- Keep the five existing guide articles, rebrand them, and update their internal links.
- Do not call Artificial Analysis, do not ingest AA-derived fields from another feed, and do not use the previously disclosed AA key. The key must be revoked outside the repository.
- Show source-level attribution wherever source data is displayed: BenchLM, LMArena, OpenRouter, and TokenBench-derived calculations.
- Treat missing measurements as `null`/Unavailable, never as zero.
- Never call benchmark or pricing sources from frontend code.
- Preserve the current uncommitted changes in `browser-tests/responsive-browser.ts`, `src/frontend/app-shell.test.tsx`, and `src/frontend/calculator-controls.tsx`.
- Run execution with Sol as lead and Terra subagents. Give each task to a fresh Terra worker and review its diff and tests before starting the next task.
- Require the **Impeccable** skill for final UX/UI validation. At execution time, confirm the skill is installed, read its `SKILL.md` completely, and add its required actions to the active implementation checklist before running the audit.

## Locked Product Decisions

### Public route map

```text
/
/guides/
/guides/:slug/
/tools/
/tools/subscriptions-vs-apis/
/compare/
/compare/:model-a-vs-:model-b
/leaderboards/
/leaderboards/llm/overall/
/leaderboards/llm/coding/
/leaderboards/llm/agentic/
/leaderboards/llm/human-preference/
/leaderboards/llm/value/
/leaderboards/llm/pricing-context/
/leaderboards/multimodal/vision-documents/
/leaderboards/media/text-to-image/
/leaderboards/media/image-editing/
/leaderboards/media/text-to-video/
/leaderboards/media/image-to-video/
/leaderboards/media/video-editing/
```

Do not publish speech-to-speech, text-to-speech, music, audio-enabled video, or numeric speed/TTFT routes in v1. Speech-to-text remains excluded until the Open ASR result dataset has explicit public redistribution terms.

### Data hierarchy

1. **BenchLM:** primary LLM capability, coding, agentic, reasoning, knowledge, instruction-following, context, and model metadata.
2. **LMArena:** human-preference Arena Scores and supported text, vision, document, search, web development, agent, image, and video categories.
3. **OpenRouter:** public API routes, input/output/cache pricing, context, modality, and supported-parameter metadata.
4. **LiteLLM:** secondary price and context corroboration; it does not define public rankings.
5. **TokenBench:** transparent workload cost calculations, Pareto frontiers, budget filters, and verified subscription breakeven calculations.

Exclude `https://benchlm.ai/data/speed.json` because its records are sourced from Artificial Analysis. Strip OpenRouter `benchmarks` data that identifies Artificial Analysis. Do not use the stale/unlicensed Open LLM Leaderboard, LiveCodeBench artifact, or Open ASR results in v1.

### Refresh cadence

- Existing OpenRouter catalog refresh: every 6 hours.
- BenchLM, LMArena, and LiteLLM benchmark batch: every 12 hours using conditional `If-None-Match`/`If-Modified-Since` requests where supported.
- Publish a new benchmark revision only when all required payloads validate. Preserve the last complete revision on HTTP, schema, license-allowlist, or normalization failure.
- Store raw response evidence in R2 before writing normalized D1 rows.

### Workload calculations

```ts
export const WORKLOAD_PROFILES = {
  inputHeavy: {inputShare: 0.90, outputShare: 0.10},
  balanced: {inputShare: 0.75, outputShare: 0.25},
  outputHeavy: {inputShare: 0.50, outputShare: 0.50},
} as const;

export function blendedCostPerMillion(
  inputUsdPerMillion: number,
  outputUsdPerMillion: number,
  profile: keyof typeof WORKLOAD_PROFILES,
): number;
```

The default is `balanced`. A model belongs to the value frontier when no other eligible model has both a higher supported benchmark score and a lower blended price. Do not publish an opaque universal value score. Free self-hosted weights are not zero-cost APIs; exclude them from cost-derived ranks unless a hosted route has explicit pricing.

### Dynamic comparison SEO

- Every valid pair can render dynamically as a utility page.
- Only high-quality pairs are indexable and included in the dynamic comparison sitemap.
- Seed indexable pairs from BenchLM's curated `comparisons.json`, then require both models to be `rankingEligible`, both to have `evidenceStatus: supported`, and at least two comparable non-null category scores.
- Additional editorial pairs live in a checked-in allowlist.
- Non-indexable valid pairs render with `noindex,follow` and are omitted from sitemaps.
- Canonical order is lexical by canonical model slug. Reverse-order URLs redirect 301; same-model and unknown-model pairs return 404.

---

## Target File Structure

```text
DESIGN.md
public/brand/monomind-tokenbench.png
public/favicon.png
src/brand/site-config.ts
src/routing/routes.ts
src/pages/home-page.tsx
src/pages/tools-page.tsx
src/pages/leaderboards-page.tsx
src/pages/compare-hub-page.tsx
src/benchmarks/contracts.ts
src/benchmarks/leaderboards.ts
src/benchmarks/value.ts
src/benchmarks/model-aliases.ts
src/benchmarks/comparison-allowlist.ts
src/benchmarks/subscription-model-map.ts
src/seo/metadata.ts
scripts/generate-static-pages.ts
functions/_shared/benchmark-db.ts
functions/_shared/html.ts
functions/api/benchmarks.ts
functions/api/benchmarks/leaderboards/[key].ts
functions/api/benchmarks/models/[slug].ts
functions/compare/[pair].ts
functions/sitemaps/comparisons.xml.ts
public/sitemaps/static.xml
workers/benchmark-ingest/wrangler.toml
workers/benchmark-ingest/src/index.ts
workers/benchmark-ingest/src/benchlm.ts
workers/benchmark-ingest/src/lmarena.ts
workers/benchmark-ingest/src/litellm.ts
migrations/0004_benchmarks.sql
docs/data-sources.md
```

Existing calculator catalog contracts remain separate. Do not add benchmark-only fields to `src/catalog/contracts.ts`.

---

### Task 1: Preserve the Current Calculator Refinements

**Files:**
- Modify: `browser-tests/responsive-browser.ts`
- Modify: `src/frontend/app-shell.test.tsx`
- Modify: `src/frontend/calculator-controls.tsx`

**Interfaces:**
- Consumes: current calculator state and existing browser harness.
- Produces: a clean baseline commit containing the already-requested monthly-usage layout and thousands separators.

- [ ] **Step 1: Review only the existing diff**

Run:

```bash
git diff -- browser-tests/responsive-browser.ts src/frontend/app-shell.test.tsx src/frontend/calculator-controls.tsx
```

Confirm the diff only moves Expected monthly usage to the top and formats the numeric display with thousands separators.

- [ ] **Step 2: Run the focused tests**

Run:

```bash
npm test -- src/frontend/app-shell.test.tsx
npm run lint
```

Expected: both commands exit 0.

- [ ] **Step 3: Run the browser regression**

Run:

```bash
npm run build
npm run test:browser
```

Expected: build and responsive browser suite pass.

- [ ] **Step 4: Commit the preserved work separately**

```bash
git add browser-tests/responsive-browser.ts src/frontend/app-shell.test.tsx src/frontend/calculator-controls.tsx
git commit -m "feat: refine monthly usage controls"
```

### Task 2: Establish TokenBench Brand, Design Tokens, and Shared Chrome

**Files:**
- Create: `DESIGN.md`
- Create: `public/brand/monomind-tokenbench.png`
- Create: `public/favicon.png`
- Create: `src/brand/site-config.ts`
- Modify: `src/index.css`
- Modify: `src/frontend/app-shell.tsx`
- Modify: `index.html`
- Test: `src/frontend/app-shell.test.tsx`
- Test: `src/frontend/site-preferences.test.ts`

**Interfaces:**
- Produces: `SITE_CONFIG`, shared TokenBench header/footer, dark-default persisted theme, and accessible navigation for every later page.

- [ ] **Step 1: Add failing brand and theme tests**

Add assertions equivalent to:

```tsx
expect(screen.getByRole('link', {name: 'TokenBench home'})).toHaveAttribute('href', '/');
expect(screen.getByText('Powered by MonoMind AI Lab')).toBeInTheDocument();
expect(document.documentElement.dataset.theme).toBe('dark');
expect(screen.getByRole('navigation', {name: 'Primary navigation'})).toHaveTextContent('ToolsCompareLeaderboardsGuides');
```

Also assert the theme preference key is `tokenbench:theme` and persists both `dark` and `light`.

- [ ] **Step 2: Run the tests and confirm the legacy brand fails**

Run:

```bash
npm test -- src/frontend/app-shell.test.tsx src/frontend/site-preferences.test.ts
```

Expected: failures reference `AI Cost Engine`, the old navigation, or light-default behavior.

- [ ] **Step 3: Add the canonical brand configuration**

Create:

```ts
export const SITE_CONFIG = {
  name: 'TokenBench',
  tagline: 'The Decision Engine for AI Costs & Model Benchmarks',
  origin: 'https://tokenbench.monomind.one',
  parentName: 'MonoMind AI Lab',
  parentUrl: 'https://monomind.one/',
  themeStorageKey: 'tokenbench:theme',
} as const;
```

- [ ] **Step 4: Copy the supplied source assets without re-encoding the repository copy**

```bash
test -f "$TOKENBENCH_DESIGN_SOURCE"
test -f "$TOKENBENCH_LOGO_SOURCE"
cp "$TOKENBENCH_DESIGN_SOURCE" DESIGN.md
mkdir -p public/brand
cp "$TOKENBENCH_LOGO_SOURCE" public/brand/monomind-tokenbench.png
cp public/brand/monomind-tokenbench.png public/favicon.png
```

- [ ] **Step 5: Implement the shared responsive chrome**

Use the supplied mark plus `TokenBench` wordmark, route-aware `aria-current`, a keyboard-operable mobile menu below 768px, a skip link, language control, and theme toggle. Footer copy must include the MonoMind endorsement and source/methodology links without presenting the parent brand as the product name.

- [ ] **Step 6: Apply the two-theme design system**

Dark tokens follow `DESIGN.md`: `#0f0f0f` canvas, `#181818` cards, `#222222` elevated surfaces, `#0007cd` primary. Light tokens use `#f7f8fc` canvas, white cards, `#e0e4ef` hairlines, `#111318` ink, and the same primary blue. Use Inter for UI/display and JetBrains Mono for metrics. Retain visible focus, reduced motion, and 44px interactive targets.

- [ ] **Step 7: Hide Google Translate's injected banner**

Keep `autoDisplay:false` and add resilient CSS for `.goog-te-banner-frame`, `.skiptranslate iframe`, and the translated `body` top offset. Test that toggling language does not change `document.body.style.top` away from `0px`.

- [ ] **Step 8: Run and commit**

```bash
npm test -- src/frontend/app-shell.test.tsx src/frontend/site-preferences.test.ts
npm run lint
git add DESIGN.md public/brand/monomind-tokenbench.png public/favicon.png src/brand/site-config.ts src/index.css src/frontend/app-shell.tsx src/frontend/app-shell.test.tsx src/frontend/site-preferences.test.ts index.html
git commit -m "feat: establish TokenBench brand system"
```

### Task 3: Add the Route Registry and Crawlable Static Page Generator

**Files:**
- Create: `src/routing/routes.ts`
- Create: `src/seo/metadata.ts`
- Create: `scripts/generate-static-pages.ts`
- Modify: `scripts/generate-guide-pages.ts`
- Modify: `vite.config.ts`
- Modify: `package.json`
- Modify: `src/main.tsx`
- Test: `src/routing/routes.test.ts`
- Test: `src/seo/metadata.test.ts`

**Interfaces:**
- Produces: `matchRoute(pathname): AppRoute`, `metadataForRoute(route): PageMetadata`, and generated HTML for every fixed route.
- Consumes: `SITE_CONFIG` from Task 2.

- [ ] **Step 1: Write route tests for every locked route**

Use a discriminated union:

```ts
export type AppRoute =
  | {kind: 'home'}
  | {kind: 'tools'}
  | {kind: 'calculator'}
  | {kind: 'guides'; slug?: string}
  | {kind: 'compareHub'}
  | {kind: 'comparison'; pair: string}
  | {kind: 'leaderboards'}
  | {kind: 'leaderboard'; key: LeaderboardKey}
  | {kind: 'notFound'};
```

Assert both trailing and non-trailing slash forms resolve to the same route.

- [ ] **Step 2: Write metadata tests**

Assert every fixed route returns a unique title, description, canonical URL, topical H1, and Open Graph fields rooted at `https://tokenbench.monomind.one`.

- [ ] **Step 3: Confirm the tests fail**

```bash
npm test -- src/routing/routes.test.ts src/seo/metadata.test.ts
```

- [ ] **Step 4: Implement the route and metadata registries**

Use one `LEADERBOARD_ROUTES` record for route parsing, navigation labels, static generation, sitemap entries, and page metadata. Export `LeaderboardKey = keyof typeof LEADERBOARD_ROUTES` and `staticHtmlEntries(rootDir): Record<string, string>` from the route module. Do not duplicate route arrays across Vite and scripts.

- [ ] **Step 5: Replace ad hoc guide-only generation with one static-page build command**

Add:

```json
"generate:pages": "tsx scripts/generate-static-pages.ts",
"predev": "npm run generate:pages",
"prebuild": "npm run generate:pages"
```

The generator must emit crawlable body content, canonical tags, Open Graph/Twitter tags, and JSON-LD for fixed routes. It may call the guide renderer for article content, but all brand/site metadata must come from `SITE_CONFIG`.

- [ ] **Step 6: Make Vite inputs derive from generated pages**

Enable stable entry assets for the Pages Function:

```ts
build: {
  cssCodeSplit: false,
  rollupOptions: {
    input: generatedHtmlInputs,
    output: {
      entryFileNames: 'assets/[name].js',
      chunkFileNames: 'assets/[name]-[hash].js',
      assetFileNames: (asset) => asset.names?.some((name) => name.endsWith('.css'))
        ? 'assets/tokenbench.css'
        : 'assets/[name]-[hash][extname]',
    },
  },
}
```

The dynamic comparison renderer will reference `/assets/main.js` and `/assets/tokenbench.css`.

- [ ] **Step 7: Run static-output checks and commit**

```bash
npm test -- src/routing/routes.test.ts src/seo/metadata.test.ts
npm run build
test -f dist/tools/subscriptions-vs-apis/index.html
test -f dist/leaderboards/llm/overall/index.html
rg "canonical|application/ld\+json|TokenBench" dist/leaderboards/llm/overall/index.html
git add src/routing src/seo scripts vite.config.ts package.json package-lock.json src/main.tsx
git commit -m "feat: generate crawlable TokenBench routes"
```

### Task 4: Rehouse the Calculator and Build the Home/Tools Shells

**Files:**
- Create: `src/pages/home-page.tsx`
- Create: `src/pages/tools-page.tsx`
- Modify: `src/App.tsx`
- Modify: `src/frontend/app-shell.tsx`
- Modify: `src/frontend/calculator-controls.tsx`
- Modify: `src/frontend/results-dashboard.tsx`
- Test: `src/frontend/app-shell.test.tsx`
- Test: `src/frontend/calculator-state.test.ts`

**Interfaces:**
- Produces: home showcase at `/`, directory at `/tools/`, and unchanged calculator behavior at `/tools/subscriptions-vs-apis/`.
- Consumes: route registry and shared chrome.

- [ ] **Step 1: Add failing route-level component tests**

Assert `/` renders the exact hero headline `Stop Guessing Your AI Costs. Start Optimizing.`, `/tools/` links to the calculator, and the calculator route contains provider selection, plan selection, model mix, Expected monthly usage, and results.

- [ ] **Step 2: Add the agency threshold test**

Set monthly usage to `20_000_001` and assert the alert reads:

```text
At this volume, custom model routing, prompt caching, and agent pipelines may materially reduce spend.
```

The alert CTA links to `https://monomind.one/`.

- [ ] **Step 3: Run and confirm failures**

```bash
npm test -- src/frontend/app-shell.test.tsx src/frontend/calculator-state.test.ts
```

- [ ] **Step 4: Route the existing calculator without rewriting its state model**

Move only page ownership and links. Preserve provider plans, selected/unselected presets, chart behavior, usage slider scrolling, thousands separators, catalog caching, and plan/model calculations.

- [ ] **Step 5: Implement the home showcase**

Include the locked hero copy and CTAs, four feature cards, three data teaser slots with honest loading/empty states, and the MonoMind banner:

```text
Spending >$1,000/mo on LLM tokens? MonoMind designs custom routing, prompt caching, and agent pipelines to cut API bills by up to 60%.
```

Replace the original Speed teaser with Human Preference. The three teasers are Coding Value, Human Preference, and Image Generation.

- [ ] **Step 6: Update every legacy calculator link**

Change `/#calculator` and `/#comparison` links to `/tools/subscriptions-vs-apis/#calculator` or the relevant leaderboard/pricing route. Do not attempt server redirects for fragments.

- [ ] **Step 7: Run and commit**

```bash
npm test -- src/frontend/app-shell.test.tsx src/frontend/calculator-state.test.ts src/catalog/calculator.test.ts
npm run lint
git add src/App.tsx src/pages src/frontend
git commit -m "feat: launch TokenBench home and tools routes"
```

### Task 5: Define Benchmark Contracts, Aliases, and D1 Schema

**Files:**
- Create: `src/benchmarks/contracts.ts`
- Create: `src/benchmarks/model-aliases.ts`
- Create: `src/benchmarks/comparison-allowlist.ts`
- Create: `src/benchmarks/subscription-model-map.ts`
- Create: `migrations/0004_benchmarks.sql`
- Create: `docs/data-sources.md`
- Test: `src/benchmarks/contracts.test.ts`

**Interfaces:**
- Produces: normalized benchmark types and append-only D1 schema used by the Worker, APIs, comparison renderer, and UI.

- [ ] **Step 1: Write contract validation tests**

The normalized interfaces are:

```ts
export type EvidenceStatus = 'supported' | 'estimated' | 'source_only';
export type MetricUnit = 'score' | 'arena_score' | 'rank' | 'usd_per_million_tokens' | 'tokens';

export interface BenchmarkModel {
  modelKey: string;
  slug: string;
  name: string;
  creator: string;
  sourceType: 'Proprietary' | 'Open Weight' | 'Unknown';
  reasoningType: string | null;
  releaseDate: string | null;
  contextWindowTokens: number | null;
  evidenceStatus: EvidenceStatus;
  rankingEligible: boolean;
  confidenceLower: number | null;
  confidenceUpper: number | null;
  benchmarkCount: number;
}

export interface BenchmarkMetric {
  modelKey: string;
  metricKey: string;
  category: string;
  value: number;
  rank: number | null;
  lower: number | null;
  upper: number | null;
  voteCount: number | null;
  unit: MetricUnit;
  sourceId: string;
  sourceUpdatedAt: string;
}

export interface BenchmarkSourceRecord {
  sourceId: string;
  sourceUrl: string;
  observedAt: string;
  etag: string | null;
  licenseId: string;
  attributionText: string;
}

export interface BenchmarkPriceCheck {
  modelKey: string;
  sourceId: string;
  providerId: string;
  inputUsdPerMillion: number | null;
  cachedInputUsdPerMillion: number | null;
  outputUsdPerMillion: number | null;
  contextWindowTokens: number | null;
  verificationStatus: 'primary' | 'corroborating' | 'conflict';
}

export interface ComparisonSeed {
  pairSlug: string;
  modelAKey: string;
  modelBKey: string;
  sourceId: string;
  featuredRank: number | null;
}

export interface NormalizedSourceBatch {
  sources: BenchmarkSourceRecord[];
  models: BenchmarkModel[];
  metrics: BenchmarkMetric[];
  priceChecks: BenchmarkPriceCheck[];
  comparisonSeeds: ComparisonSeed[];
}
```

Validation rejects empty IDs, non-finite values, negative prices, invalid confidence intervals, null-as-zero coercion, and any source ID matching `artificial-analysis` or `aa-*`.

- [ ] **Step 2: Add the append-only migration**

Create these tables and indexes:

```sql
benchmark_revisions(revision PRIMARY KEY, generated_at, checked_at, publication_state, content_hash)
benchmark_source_records(revision, source_id, source_url, observed_at, etag, snapshot_key, content_hash, license_id, attribution_text)
benchmark_models(revision, model_key, slug, name, creator, source_type, reasoning_type, release_date, context_window_tokens, evidence_status, ranking_eligible, confidence_lower, confidence_upper, benchmark_count)
benchmark_metrics(revision, model_key, metric_key, category, value, rank, lower_bound, upper_bound, vote_count, unit, source_id, source_updated_at)
benchmark_price_checks(revision, model_key, source_id, provider_id, input_usd_per_million, cached_input_usd_per_million, output_usd_per_million, context_window_tokens, verification_status)
benchmark_comparison_pairs(revision, pair_slug, model_a_key, model_b_key, indexable, eligibility_reason, featured_rank)
benchmark_refresh_state(source_id PRIMARY KEY, last_success_at, last_revision, last_error)
```

Enforce foreign keys to `benchmark_revisions` and add revision/category/rank, revision/slug, revision/model-key, and indexable/featured-rank indexes.

- [ ] **Step 3: Create an exact-only alias policy**

`model-aliases.ts` maps source IDs to canonical model keys. Accept exact source identifiers and reviewed aliases only. Do not fuzzy-match in production. Unmatched records stay source-specific and do not receive cross-source derived calculations.

`comparison-allowlist.ts` exports canonical pair slugs as `readonly string[]`. `subscription-model-map.ts` exports `Record<string, readonly string[]>`, keyed by canonical benchmark model key with reviewed `PlanOffer.id` values. Absence means no verified subscription match.

- [ ] **Step 4: Document source rights and attribution**

`docs/data-sources.md` must record:

```text
BenchLM — MIT/data reuse permitted; visible "Data from BenchLM.ai" link.
LMArena leaderboard-dataset — CC-BY-4.0; visible LMArena attribution.
OpenRouter models API — catalog/pricing only; exclude AA-derived benchmark fields.
LiteLLM model_prices_and_context_window.json — MIT; corroboration only.
Artificial Analysis — prohibited in this implementation.
Open LLM Leaderboard, LiveCodeBench, Open ASR — not published in v1.
```

- [ ] **Step 5: Test migration and commit**

```bash
npm test -- src/benchmarks/contracts.test.ts
npx wrangler d1 migrations apply ai-plan-catalog --local
git add src/benchmarks migrations/0004_benchmarks.sql docs/data-sources.md
git commit -m "feat: define benchmark data domain"
```

### Task 6: Implement BenchLM Normalization

**Files:**
- Create: `workers/benchmark-ingest/src/benchlm.ts`
- Test: `workers/benchmark-ingest/src/benchlm.test.ts`
- Test fixtures: `workers/benchmark-ingest/test-fixtures/benchlm/*.json`

**Interfaces:**
- Produces: `parseBenchLm(payloads: {leaderboard: unknown; models: unknown; pricing: unknown; comparisons: unknown; benchmarks: unknown}, observedAt: string): NormalizedSourceBatch`.
- Consumes: `BenchmarkModel`, `BenchmarkMetric`, and alias policy.

- [ ] **Step 1: Add minimal licensed fixtures**

Store reduced fixtures preserving the real schema for:

```text
https://benchlm.ai/data/leaderboard.json
https://benchlm.ai/data/models.json
https://benchlm.ai/data/pricing.json
https://benchlm.ai/data/comparisons.json
https://benchlm.ai/data/benchmarks.json
```

Each fixture includes one supported model, one estimated model, null category scores, pricing, confidence interval, and one curated pair.

- [ ] **Step 2: Write parser tests**

Assert:

```ts
expect(batch.models[0].evidenceStatus).toBe('supported');
expect(batch.metrics.find((m) => m.metricKey === 'benchlm:overall')?.unit).toBe('score');
expect(batch.comparisonSeeds[0].pairSlug).toBe('model-a-vs-model-b');
expect(batch.sources[0].attributionText).toBe('Data from BenchLM.ai');
```

Also assert unsupported/estimated rows remain available but are not eligible for default ranking, missing scores are omitted, schema-version changes fail validation, and a `speed.json` payload is rejected.

- [ ] **Step 3: Run and confirm failures**

```bash
npm test -- workers/benchmark-ingest/src/benchlm.test.ts
```

- [ ] **Step 4: Implement the parser**

Map `displayScore` to `benchlm:overall`; map category scores to explicit keys such as `benchlm:coding`, `benchlm:agentic`, `benchlm:reasoning`, and `benchlm:multimodal`. Preserve `evidenceStatus`, `scoreInterval90`, `rankingEligible`, benchmark counts, model key, slug, release date, and source timestamps. Label the composite `BenchLM Score`, never Intelligence Index or Elo.

- [ ] **Step 5: Run and commit**

```bash
npm test -- workers/benchmark-ingest/src/benchlm.test.ts
git add workers/benchmark-ingest/src/benchlm.ts workers/benchmark-ingest/src/benchlm.test.ts workers/benchmark-ingest/test-fixtures/benchlm
git commit -m "feat: normalize BenchLM benchmark data"
```

### Task 7: Implement LMArena and LiteLLM Normalization

**Files:**
- Create: `workers/benchmark-ingest/src/lmarena.ts`
- Create: `workers/benchmark-ingest/src/litellm.ts`
- Test: `workers/benchmark-ingest/src/lmarena.test.ts`
- Test: `workers/benchmark-ingest/src/litellm.test.ts`
- Test fixtures: `workers/benchmark-ingest/test-fixtures/lmarena/*.json`
- Test fixtures: `workers/benchmark-ingest/test-fixtures/litellm.json`

**Interfaces:**
- Produces: `parseLmArenaSubset(subset, rows, observedAt)` and `parseLiteLlmPrices(payload, observedAt)`.

- [ ] **Step 1: Lock the accepted LMArena subsets**

```ts
export const LMARENA_SUBSETS = [
  'text_style_control',
  'vision_style_control',
  'search_style_control',
  'document_style_control',
  'webdev',
  'agent',
  'text_to_image',
  'image_edit',
  'text_to_video',
  'image_to_video',
  'video_edit',
] as const;
```

Fetch only the `latest` split and `overall` category for public overall pages. Preserve category rows for future filtered views, but do not add extra indexable routes in this release.

- [ ] **Step 2: Write LMArena parser tests**

For standard arenas, assert `rating`, `rating_lower`, `rating_upper`, `vote_count`, `rank`, and `leaderboard_publish_date` map to an `arena_score` metric. For agent subsets, assert `score`, its confidence interval, observations, sessions, and rank map without being mislabeled as Arena Score. Missing confidence bounds remain null.

- [ ] **Step 3: Write LiteLLM parser tests**

Assert `sample_spec` is ignored; model rows map per-token costs to per-million USD; provider, context, input, and output limits are preserved; missing price remains null rather than zero; and invalid/negative numeric values fail validation.

- [ ] **Step 4: Run and confirm failures**

```bash
npm test -- workers/benchmark-ingest/src/lmarena.test.ts workers/benchmark-ingest/src/litellm.test.ts
```

- [ ] **Step 5: Implement both parsers**

Use exact aliases only. LMArena attribution is `Arena ratings from LMArena`; LiteLLM records are `verification_status: corroborating` until compared against an active OpenRouter or direct-provider route.

- [ ] **Step 6: Run and commit**

```bash
npm test -- workers/benchmark-ingest/src/lmarena.test.ts workers/benchmark-ingest/src/litellm.test.ts
git add workers/benchmark-ingest/src/lmarena.ts workers/benchmark-ingest/src/lmarena.test.ts workers/benchmark-ingest/src/litellm.ts workers/benchmark-ingest/src/litellm.test.ts workers/benchmark-ingest/test-fixtures
git commit -m "feat: normalize arena and pricing evidence"
```

### Task 8: Build the Atomic Benchmark Ingestion Worker

**Files:**
- Create: `workers/benchmark-ingest/wrangler.toml`
- Create: `workers/benchmark-ingest/src/index.ts`
- Test: `workers/benchmark-ingest/src/index.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: scheduled 12-hour refresh and `refreshBenchmarkRevision(env, dependencies): Promise<RefreshResult>`.
- Consumes: all source parsers and D1 schema.

- [ ] **Step 1: Write the atomicity tests**

Define the result before writing tests:

```ts
export interface RefreshResult {
  status: 'published' | 'unchanged' | 'failed';
  revision: string | null;
  checkedAt: string;
  error: string | null;
}
```

Cover:

```text
R2 raw payloads are written before normalized D1 statements.
Every required source validates before publication_state becomes published.
One failed LMArena page leaves the previous revision published.
304 responses reuse the previous immutable snapshot.
Unchanged combined content updates checked_at without duplicating a revision.
HTTP 401, 403, 429, timeout, and schema errors record last_error.
No frontend or Worker secret contains an Artificial Analysis key.
```

- [ ] **Step 2: Run and confirm failures**

```bash
npm test -- workers/benchmark-ingest/src/index.test.ts
```

- [ ] **Step 3: Configure the Worker**

Use the existing `CATALOG_DB` and `SOURCE_SNAPSHOTS` bindings with Worker name `tokenbench-benchmark-ingest` and cron:

```toml
[triggers]
crons = ["15 */12 * * *"]
```

No API secret is required for the selected public feeds.

- [ ] **Step 4: Implement bounded source fetching**

Fetch BenchLM static exports, the accepted LMArena latest subsets through the Hugging Face dataset API with pagination, and LiteLLM raw JSON. Set a 20-second timeout per request, cap payload sizes, record ETag/Last-Modified, and use an identifying TokenBench User-Agent.

- [ ] **Step 5: Implement revision publication**

Write raw payload/hash metadata to R2, normalize in memory, validate source/license allowlists, insert the new revision and facts inside one D1 transaction/batch, then switch the publication state. Generate comparison seeds from BenchLM curated pairs plus the checked-in allowlist and persist eligibility reasons.

- [ ] **Step 6: Run local integration and commit**

```bash
npm test -- workers/benchmark-ingest/src
npx wrangler d1 migrations apply ai-plan-catalog --local
npx wrangler dev --config workers/benchmark-ingest/wrangler.toml --test-scheduled
git add workers/benchmark-ingest .env.example
git commit -m "feat: publish atomic benchmark revisions"
```

### Task 9: Expose Cached Benchmark APIs

**Files:**
- Create: `functions/_shared/benchmark-db.ts`
- Create: `functions/api/benchmarks.ts`
- Create: `functions/api/benchmarks/leaderboards/[key].ts`
- Create: `functions/api/benchmarks/models/[slug].ts`
- Test: `functions/api/benchmarks.test.ts`

**Interfaces:**
- Produces:
  - `GET /api/benchmarks`
  - `GET /api/benchmarks/leaderboards/:key?profile=balanced&limit=50&cursor=`
  - `GET /api/benchmarks/models/:slug`

- [ ] **Step 1: Write API tests**

Assert JSON content type, ETag/304 behavior, revision and freshness fields, cursor pagination, route-key validation, 404 for unknown models, safe maximum limit of 200, and preservation of null fields.

- [ ] **Step 2: Define the public response envelope**

```ts
export interface BenchmarkApiEnvelope<T> {
  revision: string;
  publishedAt: string;
  freshness: {status: 'fresh' | 'stale'; checkedAt: string; message?: string};
  attribution: Array<{sourceId: string; label: string; url: string; updatedAt: string}>;
  data: T;
}
```

Freshness becomes stale after 36 hours because the Worker cadence is 12 hours.

- [ ] **Step 3: Run and confirm failures**

```bash
npm test -- functions/api/benchmarks.test.ts
```

- [ ] **Step 4: Implement D1 queries and caching**

Always select the newest `published` benchmark revision. Use revision plus normalized query parameters as the ETag. Return `Cache-Control: public, max-age=0, must-revalidate` and never proxy upstream sources during a request.

- [ ] **Step 5: Run and commit**

```bash
npm test -- functions/api/benchmarks.test.ts functions/api/catalog.test.ts
git add functions/_shared functions/api/benchmarks.ts functions/api/benchmarks
git commit -m "feat: expose cached benchmark APIs"
```

### Task 10: Implement Transparent Leaderboard Derivations

**Files:**
- Create: `src/benchmarks/value.ts`
- Create: `src/benchmarks/leaderboards.ts`
- Test: `src/benchmarks/value.test.ts`
- Test: `src/benchmarks/leaderboards.test.ts`

**Interfaces:**
- Produces: `buildLeaderboard(key, models, metrics, prices, profile)` and Pareto/budget helpers used by APIs and UI.

- [ ] **Step 1: Write cost-profile tests**

```ts
expect(blendedCostPerMillion(1, 5, 'balanced')).toBe(2);
expect(blendedCostPerMillion(1, 5, 'inputHeavy')).toBe(1.4);
expect(blendedCostPerMillion(1, 5, 'outputHeavy')).toBe(3);
```

- [ ] **Step 2: Write eligibility and frontier tests**

Assert estimated models are excluded by default, missing prices exclude only cost-derived ranks, self-hosted zero prices are not treated as free APIs, dominated models are not on the Pareto frontier, and ties receive stable deterministic ordering by canonical slug.

- [ ] **Step 3: Write route-definition tests**

Lock the metric source and default sort for every v1 route:

```text
llm-overall -> BenchLM overall, descending
llm-coding -> BenchLM coding, descending
llm-agentic -> BenchLM agentic, descending
llm-human-preference -> LMArena text_style_control, rank ascending
llm-value -> BenchLM overall + balanced price, Pareto then score
llm-pricing-context -> OpenRouter price/context, user-sortable
multimodal-vision-documents -> BenchLM multimodal + LMArena vision/document lenses
media routes -> matching LMArena subset, rank ascending
```

- [ ] **Step 4: Implement derivations**

Budget bands are `$0.50`, `$1`, `$5`, and `$10` per blended million tokens. Long-context examples calculate 32K, 128K, and 1M input tokens plus 2K output tokens and exclude models whose declared context is smaller than the combined input and output size.

- [ ] **Step 5: Run and commit**

```bash
npm test -- src/benchmarks/value.test.ts src/benchmarks/leaderboards.test.ts
git add src/benchmarks/value.ts src/benchmarks/value.test.ts src/benchmarks/leaderboards.ts src/benchmarks/leaderboards.test.ts
git commit -m "feat: calculate TokenBench value frontiers"
```

### Task 11: Build Leaderboard and Directory Experiences

**Files:**
- Create: `src/pages/leaderboards-page.tsx`
- Create: `src/frontend/leaderboard-table.tsx`
- Create: `src/frontend/leaderboard-filters.tsx`
- Create: `src/frontend/use-benchmarks.ts`
- Test: `src/frontend/leaderboard-table.test.tsx`
- Test: `src/frontend/use-benchmarks.test.ts`
- Modify: `src/pages/home-page.tsx`

**Interfaces:**
- Produces: responsive leaderboards, search/filter/sort, source timestamps, and home teasers.

- [ ] **Step 1: Write table behavior tests**

Assert semantic table headers/scopes, `aria-sort`, keyboard-operable sorting, model/provider search, evidence filters, workload profile switch, preserved URL query state, visible source links, and `Unavailable` for null values.

- [ ] **Step 2: Write responsive-card tests**

At mobile layout, render ranked cards with the same data and accessible ordering rather than horizontally clipping the desktop table. Top badges are metric-specific: `Top Capability`, `Top Coding`, `Arena Leader`, and `Value Frontier`; do not use one generic Best badge.

- [ ] **Step 3: Run and confirm failures**

```bash
npm test -- src/frontend/leaderboard-table.test.tsx src/frontend/use-benchmarks.test.ts
```

- [ ] **Step 4: Implement directory and category pages**

Every page has one topical H1, short methodology summary, last-updated time, filters, table/cards, visible attribution, related leaderboard links, and the MonoMind CTA. Estimated BenchLM records are available behind an explicit `Include estimated` control and visually differentiated.

- [ ] **Step 5: Connect honest home teasers**

Home shows top three supported Coding Value entries, top three LMArena human-preference entries, and top three LMArena text-to-image entries. When a source is unavailable or stale, show the timestamp/state rather than synthetic models.

- [ ] **Step 6: Run and commit**

```bash
npm test -- src/frontend/leaderboard-table.test.tsx src/frontend/use-benchmarks.test.ts src/frontend/app-shell.test.tsx
npm run lint
git add src/pages/leaderboards-page.tsx src/pages/home-page.tsx src/frontend/leaderboard-table.tsx src/frontend/leaderboard-table.test.tsx src/frontend/leaderboard-filters.tsx src/frontend/use-benchmarks.ts src/frontend/use-benchmarks.test.ts
git commit -m "feat: add TokenBench leaderboards"
```

### Task 12: Build the Dynamic Comparison Hub and SEO Pages

**Files:**
- Create: `src/pages/compare-hub-page.tsx`
- Create: `src/frontend/comparison-page.tsx`
- Create: `src/frontend/comparison-page.test.tsx`
- Create: `functions/_shared/html.ts`
- Create: `functions/compare/[pair].ts`
- Create: `functions/compare/[pair].test.ts`
- Create: `functions/sitemaps/comparisons.xml.ts`
- Create: `functions/sitemaps/comparisons.xml.test.ts`
- Modify: `src/main.tsx`
- Modify: `public/robots.txt`
- Modify: `public/sitemap.xml`

**Interfaces:**
- Produces: searchable compare hub, server-rendered pair pages, dynamic comparison sitemap, and browser enhancement from embedded initial JSON.

- [ ] **Step 1: Write canonicalization tests**

Cover:

```text
/compare/a-vs-b returns 200 when a < b.
/compare/b-vs-a returns 301 to /compare/a-vs-b.
/compare/a-vs-a returns 404.
Unknown slugs return 404.
Valid but non-indexable pairs return 200 with noindex,follow.
Indexable pairs return index,follow and appear in the comparison sitemap.
```

- [ ] **Step 2: Write server-HTML SEO tests**

Without running JavaScript, assert the response includes:

```html
<h1>Model A vs Model B</h1>
<title>Model A vs Model B: Cost, Coding & Benchmarks | TokenBench</title>
<link rel="canonical" href="https://tokenbench.monomind.one/compare/model-a-vs-model-b">
<meta name="description" content="...">
<script type="application/ld+json">...</script>
```

Also assert the body contains an evidence-aware summary, overall/category comparison table, pricing section or explicit unavailable state, source timestamps, methodology link, and related comparisons.

- [ ] **Step 3: Write comparison UI tests**

Assert workload profiles recalculate costs, source metrics retain their original names, subscription breakeven appears only for a reviewed model-to-plan mapping, and missing mappings show `No verified subscription match` plus a calculator link.

- [ ] **Step 4: Run and confirm failures**

```bash
npm test -- functions/compare/[pair].test.ts functions/sitemaps/comparisons.xml.test.ts src/frontend/comparison-page.test.tsx
```

- [ ] **Step 5: Implement server rendering**

The Pages Function queries only the active D1 revision, orders slugs canonically, calculates the comparison view model, escapes all source text, and emits stable `/assets/main.js` and `/assets/tokenbench.css` references. Embed the serialized view model as escaped JSON so React enhances the same content without an initial API request.

Use `WebPage` and `BreadcrumbList` JSON-LD. Do not use `Product`, `Review`, or `FAQPage` markup unless corresponding visible content exists.

- [ ] **Step 6: Implement the compare hub**

Provide two model comboboxes, provider/category filters, popular indexable matchups, and related guide links. Any two known distinct model slugs can open a utility page; index eligibility remains server-controlled.

- [ ] **Step 7: Implement the sitemap index**

`/sitemap.xml` becomes a sitemap index pointing to generated `/sitemaps/static.xml` and dynamic `/sitemaps/comparisons.xml`. The dynamic sitemap lists only canonical, indexable pairs from the active revision with revision publication date as `lastmod`.

- [ ] **Step 8: Run and commit**

```bash
npm test -- functions/compare/[pair].test.ts functions/sitemaps/comparisons.xml.test.ts src/frontend/comparison-page.test.tsx
npm run build
git add src/pages/compare-hub-page.tsx src/frontend/comparison-page.tsx src/frontend/comparison-page.test.tsx functions/_shared/html.ts functions/compare functions/sitemaps src/main.tsx public/robots.txt public/sitemap.xml
git commit -m "feat: add dynamic SEO model comparisons"
```

### Task 13: Rebrand Guides and Complete Cross-Linking

**Files:**
- Modify: `src/GuidesApp.tsx`
- Modify: `src/frontend/guides-page.tsx`
- Modify: `src/guides/content.ts`
- Modify: `scripts/generate-guide-pages.ts`
- Test: `src/frontend/guides-page.test.tsx`
- Test: `src/guides/content.test.ts`

**Interfaces:**
- Produces: five crawlable TokenBench guides linked to tools, leaderboards, comparisons, and related articles.

- [ ] **Step 1: Add failing legacy-brand/link tests**

Assert generated guide HTML contains TokenBench branding and canonical origin, contains no `AI Cost Engine`, links calculator CTAs to `/tools/subscriptions-vs-apis/`, and links at least one relevant leaderboard or comparison from every article.

- [ ] **Step 2: Run and confirm failures**

```bash
npm test -- src/frontend/guides-page.test.tsx src/guides/content.test.ts
```

- [ ] **Step 3: Centralize guide metadata and chrome**

Remove hardcoded site name/origin/theme key/header/footer from the guide generator. Reuse `SITE_CONFIG`, shared route metadata, and the same navigation/endorsement/attribution language as the application.

- [ ] **Step 4: Add contextual cross-links**

Keep the existing related-guide graph. Add calculator links to all five articles; add OpenRouter/pricing links from the OpenRouter and free-API guides; add coding/value leaderboard links from cost-reduction guides; add model comparison links only to indexable seed pairs.

- [ ] **Step 5: Validate static article SEO and commit**

```bash
npm test -- src/frontend/guides-page.test.tsx src/guides/content.test.ts
npm run build
rg "TokenBench|canonical|Article|BreadcrumbList" dist/guides/track-claude-code-usage/index.html
git add src/GuidesApp.tsx src/frontend/guides-page.tsx src/frontend/guides-page.test.tsx src/guides scripts/generate-guide-pages.ts
git commit -m "feat: integrate guides into TokenBench"
```

### Task 14: Impeccable UX/UI Validation, Domain Migration, and Cloudflare Deployment

**Files:**
- Modify: `browser-tests/responsive-browser.ts`
- Modify: `wrangler.toml`
- Modify: `README.md`
- Modify: `docs/catalog-deployment.md`
- Create: `docs/tokenbench-deployment.md`

**Interfaces:**
- Produces: validated production deployment, scheduled ingestion, canonical domain, redirects, and operational runbook.

- [ ] **Step 1: Expand browser coverage**

Test light/dark at 320, 375, 768, 1024, and 1440 widths for home, tools, calculator, leaderboard directory, one LLM leaderboard, one media leaderboard, compare hub, one server-rendered comparison, guide hub, and one article. Assert no horizontal overflow, mobile menu behavior, keyboard focus, one H1, Google Translate banner suppression, and theme persistence across routes.

- [ ] **Step 2: Run the first Impeccable UX/UI audit**

Load and follow the installed Impeccable skill against the production build at 320, 375, 768, 1024, and 1440 widths in both light and dark modes. Audit home, calculator, leaderboard directory, one data-dense LLM leaderboard, one media leaderboard, compare hub, one dynamic comparison, guide hub, and one article.

Record every finding in `docs/tokenbench-deployment.md` with route, viewport, theme, severity, evidence screenshot, expected behavior, and disposition. The audit must explicitly cover visual hierarchy, spacing rhythm, typography, color contrast, surface elevation, responsive composition, table/card transformation, focus states, empty/stale/error states, and consistency with `DESIGN.md`.

- [ ] **Step 3: Resolve Impeccable findings and add regressions**

Fix all critical, high, and medium findings. Add a component or Playwright regression assertion for every behavior-level defect. Low-severity aesthetic findings may remain only when the deployment runbook records a concrete rationale showing the design intentionally follows `DESIGN.md`.

- [ ] **Step 4: Run the second Impeccable verification pass**

Repeat the same route/viewport/theme matrix with the Impeccable skill. The release gate is zero unresolved critical, high, or medium findings and no regression in previously passing screenshots or responsive assertions.

- [ ] **Step 5: Add an accessibility smoke pass**

Check skip links, landmark names, heading hierarchy, table/card equivalence, `aria-sort`, form labels, focus visibility, reduced motion, and text equivalents for charts. Comparison and leaderboard pages must remain understandable without color.

- [ ] **Step 6: Run the complete local gate**

```bash
npm test
npm run lint
npm run build
npm run test:browser
git diff --check
```

Expected: all commands exit 0 and `git status --short` contains only intentional files.

- [ ] **Step 7: Commit and push the validated application**

```bash
git add browser-tests/responsive-browser.ts wrangler.toml README.md docs/catalog-deployment.md docs/tokenbench-deployment.md
git commit -m "docs: add TokenBench deployment runbook"
git push origin main
git status --short
```

Expected: the push succeeds and `git status --short` is empty.

- [ ] **Step 8: Apply the production D1 migration**

```bash
npx wrangler d1 migrations apply ai-plan-catalog --remote
```

Verify the migration list shows `0004_benchmarks.sql` applied once.

- [ ] **Step 9: Deploy and test the benchmark Worker**

```bash
npx wrangler deploy --config workers/benchmark-ingest/wrangler.toml
```

Trigger one controlled refresh, then verify a published revision, source records, R2 snapshots, and empty `last_error` fields before deploying the site.

- [ ] **Step 10: Deploy Cloudflare Pages**

Build from the committed tree and deploy `dist` plus Pages Functions to the existing Pages project:

```bash
npm run build
npx wrangler pages deploy dist --project-name tokenbench
```

Attach `tokenbench.monomind.one` as the canonical custom domain while retaining `ai-plans.monomind.one` long enough to redirect.

- [ ] **Step 11: Configure the host redirect**

Create a Cloudflare Redirect Rule for hostname `ai-plans.monomind.one` that preserves path and query and redirects to `https://tokenbench.monomind.one${path}` with status 301. Do not redirect preview or localhost hosts.

- [ ] **Step 12: Run production smoke tests**

Verify:

```text
200: /, /tools/, calculator, guides, leaderboards, compare hub.
200: one canonical indexable comparison with server-rendered H1/meta/body.
301: reversed comparison pair.
404: unknown comparison model.
200 XML: fixed and comparison sitemaps.
304: benchmark API with matching If-None-Match.
301: old production hostname to equivalent TokenBench path.
No upstream benchmark request appears in browser network traffic.
```

- [ ] **Step 13: Record and push deployment evidence**

```bash
git add docs/tokenbench-deployment.md
git commit -m "docs: record TokenBench production deployment"
git push origin main
```

Record the deployed Pages URL, canonical domain, Worker version, active benchmark revision, migration version, and smoke-test results in the deployment runbook.

---

## Acceptance Criteria

- `/` is a TokenBench showcase and the existing calculator works at `/tools/subscriptions-vs-apis/` without functional regressions.
- Brand, favicon, dark/light themes, mobile navigation, translations, guides, metadata, and MonoMind endorsement are consistent across every route.
- BenchLM and LMArena data are fetched only by the scheduled Worker, cached in R2/D1, and served from the last complete revision.
- No Artificial Analysis API, credential, benchmark field, speed value, or indirect AA-derived metric is published.
- Every leaderboard identifies its source metric, method, source timestamp, and missing-data behavior.
- Value views use disclosed workload profiles and Pareto/budget logic rather than an opaque universal score.
- Dynamic comparison pages are server-rendered, canonicalized, data-driven, crawlable, and refreshed from D1 without a Pages redeploy.
- Indexable comparison pairs have substantive shared evidence and appear in the dynamic sitemap; other valid pairs remain useful `noindex` pages.
- Existing five guides remain crawlable with unique SEO metadata and updated cross-links.
- All unit, type, build, browser, accessibility, API, Worker, and production smoke gates pass before push/deploy.
- The installed Impeccable skill completes two UX/UI passes across the required route, viewport, theme, and UI-state matrix with zero unresolved critical, high, or medium findings.

## Resume Notes

- Repository: the Git worktree containing this plan; expected GitHub destination is `monomind-ai-lab/tokenbench`.
- Branch at planning time: `main`, tracking `origin/main`.
- Existing uncommitted files at planning time are listed in Task 1 and must be preserved.
- Supplied design and logo paths are recorded under Global Constraints and Task 2.
- The agreed data hierarchy and dynamic comparison SEO rules are locked in this document; do not reopen them unless source licensing or API behavior materially changes.
- The current harness does not expose the Impeccable skill. After the harness revamp, the resumed session must verify that the skill is available and read its instructions before Task 14; do not silently substitute a different design-review skill.
- Start the resumed session by reading this plan, `DESIGN.md` after Task 2 creates it, `docs/data-sources.md` after Task 5 creates it, and the current `git status`.
