# TokenBench Model Directory and Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a weekly BenchLM-derived Popular Models top 100 plus a durable server-rendered profile for every successfully ingested model, retaining historical models and linking canonical model mentions across TokenBench.

**Architecture:** Add append-only profile snapshots and a durable directory beside revision-scoped benchmark tables. Successful publication atomically records candidate membership, upserts current models, archives proven absences, and creates at most one immutable weekly rank snapshot after Monday 00:00 UTC. Pages Functions read validated materialized profile/directory contracts for SSR, APIs, hydration, and model sitemaps.

**Tech Stack:** TypeScript 5.8, Cloudflare Workers and Pages Functions, D1, React 19, SVG, Vitest, Testing Library, Playwright.

## Global Constraints

- `/models/` defaults to the current immutable weekly top 100 and searches every retained directory record.
- `/models/:slug/` exists for every successfully ingested model and remains available after the model leaves the top 100 or active revision.
- `/sitemaps/models.xml` contains every current or retained substantive profile and no filter/search URL.
- Popularity order comes only from the corrected BenchLM public `bench-align-v5` overall order.
- The first successful eligible publication after Monday 00:00 UTC owns that UTC week's snapshot; later publications do not reorder it.
- Failed or partial publication never archives a model, moves a slug, or replaces a weekly snapshot.
- Canonical slugs are immutable after first publication; reviewed aliases redirect to the canonical route.
- Radar values are ranking percentiles; raw scores never masquerade as percentiles and missing values never become zero.
- Initial HTML contains substantive directory/profile content, metadata, canonical, and JSON-LD before JavaScript.
- Unknown model slugs return a true 404 with `noindex,follow`, not Home or a generic 503 shell.
- Archived profiles remain indexable while their latest valid snapshot contains substantive evidence.
- Every task follows RED-GREEN-REFACTOR and ends in a focused commit.

---

## File structure and ownership

- `migrations/0009_model_directory.sql` owns durable directory, immutable profile snapshot, revision-membership, slug-alias, and weekly snapshot tables.
- `src/benchmarks/model-profile.ts` owns profile materialization and runtime validation.
- `src/benchmarks/model-directory.ts` owns weekly rank calculation, directory contracts, filters, and URL-safe model paths.
- `workers/benchmark-ingest/src/model-directory-publication.ts` builds bounded D1 statements only after candidate integrity succeeds.
- `functions/_shared/model-directory-db.ts` owns targeted D1 reads and fallback to each model's latest valid profile snapshot.
- `functions/api/benchmarks/models.ts` serves weekly/default/all-model directory queries.
- `functions/api/benchmarks/models/[slug].ts` serves the durable profile contract and true 404s.
- `functions/models/index.ts` and `functions/models/[slug].ts` own server-rendered HTML and embedded hydration data.
- `src/pages/models-page.tsx` owns directory search/filter/table/cards.
- `src/pages/model-profile-page.tsx` owns profile identity, radar, category cards, prices/specifications, and ledger.
- `functions/sitemaps/models.xml.ts` emits retained model URLs.

### Task 1: Durable schema and validated model contracts

**Files:**
- Create: `migrations/0009_model_directory.sql`
- Create: `src/benchmarks/model-directory.ts`
- Create: `src/benchmarks/model-directory.test.ts`
- Create: `src/benchmarks/model-profile.ts`
- Create: `src/benchmarks/model-profile.test.ts`
- Modify: `src/benchmarks/contracts.ts`
- Modify: `src/benchmarks/contracts.test.ts`

**Interfaces:**
- Produces: `weekStartUtc(timestamp: string): string` returning Monday `00:00:00.000Z`.
- Produces: `buildModelProfileSnapshot(snapshot, modelKey): ModelProfileSnapshotData`.
- Produces: `parseModelProfileSnapshotData(value): ModelProfileSnapshotData | null`.
- Produces: `modelPath(slug): string` after one-segment route validation.
- Profile snapshot JSON is bounded to `524_288` UTF-8 bytes per model.

- [ ] **Step 1: Add failing migration-shape, weekly-boundary, profile, and slug tests**

```ts
it.each([
  ['2026-08-10T00:00:00.000Z', '2026-08-10T00:00:00.000Z'],
  ['2026-08-16T23:59:59.999Z', '2026-08-10T00:00:00.000Z'],
  ['2026-08-17T00:00:00.000Z', '2026-08-17T00:00:00.000Z'],
])('maps %s to UTC week %s', (value, expected) => {
  expect(weekStartUtc(value)).toBe(expected);
});

it('builds a profile with public metrics, route prices, ledger evidence, and null radar axes', () => {
  const profile = buildModelProfileSnapshot(activeSnapshot(), 'benchlm:openai:gpt-5-6-sol');
  expect(profile.identity.slug).toBe('gpt-5-6-sol');
  expect(profile.summary.overallScore).toBe(81.48);
  expect(profile.categories.find((row) => row.key === 'coding')).toMatchObject({ score: 77.95, rank: 3 });
  expect(profile.radar.find((axis) => axis.key === 'missing')?.percentile).toBeNull();
  expect(profile.ledger.every((row) => row.sourceUrl.startsWith('https://'))).toBe(true);
});

it('rejects unsafe model route slugs', () => {
  expect(() => modelPath('unsafe/slug')).toThrow('model slug must be one route segment');
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/benchmarks/model-directory.test.ts src/benchmarks/model-profile.test.ts src/benchmarks/contracts.test.ts`

Expected: FAIL because the durable schema and contracts are absent.

- [ ] **Step 3: Add the normalized directory tables and pure profile materializer**

```sql
CREATE TABLE benchmark_model_directory (
  model_key TEXT PRIMARY KEY,
  canonical_slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  creator TEXT NOT NULL,
  source_type TEXT NOT NULL,
  reasoning_type TEXT,
  family_id TEXT,
  variant_id TEXT,
  first_seen_revision TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_revision TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  latest_profile_revision TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('current', 'archived')),
  source_id TEXT NOT NULL,
  source_model_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE benchmark_model_profile_snapshots (
  model_key TEXT NOT NULL,
  revision TEXT NOT NULL,
  profile_json TEXT NOT NULL CHECK (length(profile_json) > 0),
  content_hash TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  PRIMARY KEY (model_key, revision)
);

CREATE TABLE benchmark_model_revision_membership (
  revision TEXT NOT NULL,
  model_key TEXT NOT NULL,
  PRIMARY KEY (revision, model_key)
);
```

Also create `benchmark_model_slug_aliases(alias_slug PRIMARY KEY, model_key, created_at)`, `benchmark_popular_model_weeks(week_start PRIMARY KEY, benchmark_revision, source_snapshot_id, methodology_version, generated_at)`, and `benchmark_popular_model_ranks(week_start, rank CHECK 1..100, model_key, PRIMARY KEY(week_start, rank), UNIQUE(week_start, model_key))` with indexes for status/creator/source type, canonical slug, latest profile, and sitemap order. `ModelProfileSnapshotData` contains identity, revision/freshness facts, summary, percentile radar, categories, price routes/specifications, ledger rows, comparison links, and source attribution. Hash the exact UTF-8 profile JSON and reject over-bound profiles.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/benchmarks/model-directory.test.ts src/benchmarks/model-profile.test.ts src/benchmarks/contracts.test.ts`

Expected: PASS for UTC boundaries, deterministic sorting/hashing, GPT-5.6 Sol values, percentile/missing distinction, price conflicts, ledger provenance, invalid JSON, over-bound profiles, and route-safe slugs.

- [ ] **Step 5: Commit durable model contracts**

```bash
git add migrations/0009_model_directory.sql src/benchmarks/model-directory.ts src/benchmarks/model-directory.test.ts src/benchmarks/model-profile.ts src/benchmarks/model-profile.test.ts src/benchmarks/contracts.ts src/benchmarks/contracts.test.ts
git commit -m "feat: add durable model directory schema"
```

### Task 2: Atomic model and weekly snapshot publication

**Files:**
- Create: `workers/benchmark-ingest/src/model-directory-publication.ts`
- Create: `workers/benchmark-ingest/src/model-directory-publication.test.ts`
- Modify: `workers/benchmark-ingest/src/index.ts`
- Modify: `workers/benchmark-ingest/src/index.test.ts`
- Modify: `workers/benchmark-ingest/src/benchlm-public-leaderboard.ts`
- Modify: `workers/benchmark-ingest/src/benchlm-public-leaderboard.test.ts`

**Interfaces:**
- Produces: `appendModelDirectoryPublicationStatements(statements, db, snapshot, publicLeaderboard, updatedAt): void`.
- Consumes: corrected public leaderboard order from Release 1 and complete validated `ActiveBenchmarkSnapshot` candidate.
- Inserts profile JSON and membership before status/archive updates in the same publication batch.
- Publishes no more than one weekly header and ranks per `weekStartUtc(updatedAt)`.

- [ ] **Step 1: Add failing atomicity, retention, and weekly ownership tests**

```ts
it('upserts every candidate model and archives only proven absences', async () => {
  await publishRevision(env, candidateWith(['alpha', 'bravo']));
  await publishRevision(env, candidateWith(['alpha']));
  expect(directoryRow('alpha').status).toBe('current');
  expect(directoryRow('bravo')).toMatchObject({ status: 'archived', latest_profile_revision: 'rev-1' });
});

it('does not archive or change the week when candidate publication fails', async () => {
  await publishRevision(env, candidateWith(['alpha', 'bravo']));
  await expect(publishRevision(env, invalidCandidate())).rejects.toThrow();
  expect(directoryRow('bravo').status).toBe('current');
  expect(popularWeek('2026-08-10')).toEqual(firstWeekSnapshot());
});

it('keeps the first successful top 100 for the UTC week', async () => {
  await publishAt('2026-08-10T01:00:00.000Z', publicOrder('alpha', 'bravo'));
  await publishAt('2026-08-12T01:00:00.000Z', publicOrder('bravo', 'alpha'));
  expect(popularRanks('2026-08-10')).toEqual(['alpha', 'bravo']);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- workers/benchmark-ingest/src/model-directory-publication.test.ts workers/benchmark-ingest/src/index.test.ts workers/benchmark-ingest/src/benchlm-public-leaderboard.test.ts`

Expected: FAIL because successful benchmark publication does not persist directory/profile/week state.

- [ ] **Step 3: Append bounded publication statements after candidate integrity succeeds**

```ts
export function appendModelDirectoryPublicationStatements(
  statements: BoundStatement[],
  db: D1Database,
  snapshot: ActiveBenchmarkSnapshot,
  publicLeaderboard: BenchLmPublicLeaderboard,
  updatedAt: string,
): void {
  appendMembershipStatements(statements, db, snapshot.revision.revision, snapshot.models);
  appendProfileSnapshotStatements(statements, db, snapshot, updatedAt);
  appendDirectoryUpserts(statements, db, snapshot, updatedAt);
  statements.push(archiveAbsentModelsStatement(db, snapshot.revision.revision, updatedAt));
  appendWeeklySnapshotStatements(statements, db, weekStartUtc(updatedAt), snapshot, publicLeaderboard);
}
```

For an existing `model_key`, preserve `canonical_slug` and reject a conflicting new slug unless an explicit alias migration already maps it. Update mutable identity facts, last-seen fields, latest profile revision, source identity, and `status='current'`. Archive with `WHERE NOT EXISTS (SELECT 1 FROM benchmark_model_revision_membership WHERE revision=? AND model_key=directory.model_key)`. Insert the weekly header with `INSERT OR IGNORE`; insert ranks only where the header's `benchmark_revision` equals this candidate revision, preventing a later same-week writer from changing order. Limit ranks to the first 100 uniquely joined public models.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- workers/benchmark-ingest/src/model-directory-publication.test.ts workers/benchmark-ingest/src/index.test.ts workers/benchmark-ingest/src/benchlm-public-leaderboard.test.ts`

Expected: PASS for first/current/archived transitions, latest-valid profile retention, slug conflicts, duplicate public rows, 100-row cap, same-week immutability, next-Monday publication, failed/partial candidates, and bounded statements.

- [ ] **Step 5: Commit model publication**

```bash
git add workers/benchmark-ingest/src/model-directory-publication.ts workers/benchmark-ingest/src/model-directory-publication.test.ts workers/benchmark-ingest/src/index.ts workers/benchmark-ingest/src/index.test.ts workers/benchmark-ingest/src/benchlm-public-leaderboard.ts workers/benchmark-ingest/src/benchlm-public-leaderboard.test.ts
git commit -m "feat: publish durable model profiles"
```

### Task 3: Directory/profile APIs and latest-valid fallback

**Files:**
- Create: `functions/_shared/model-directory-db.ts`
- Create: `functions/_shared/model-directory-db.test.ts`
- Create: `functions/api/benchmarks/models.ts`
- Create: `functions/api/benchmarks/models.test.ts`
- Modify: `functions/api/benchmarks/models/[slug].ts`
- Create: `functions/api/benchmarks/models/[slug].test.ts`
- Modify: `functions/api/benchmarks/models/[slug].targeted.test.ts`

**Interfaces:**
- Produces: `readModelDirectory(db, query): Promise<ModelDirectoryEnvelope>` with bounded search/filter/pagination.
- Produces: `readDurableModelProfile(db, slug): Promise<ModelProfileReadResult | null>`.
- Directory default includes weekly ranks plus current score/category/representative direct price facts from each latest profile.
- Profile read follows canonical slug, then alias redirect, then `latest_profile_revision`; malformed latest JSON is skipped only if an earlier valid snapshot exists.

- [ ] **Step 1: Add failing top-100, archived-search, fallback, redirect, and 404 tests**

```ts
it('returns the weekly top 100 while searching retained archived records', async () => {
  expect((await requestModels('')).data.models).toHaveLength(100);
  const archived = await requestModels('?q=retained-fixture&status=archived');
  expect(archived.data.models[0]).toMatchObject({ slug: 'retained-fixture', status: 'archived', weeklyRank: null });
});

it('falls back from malformed latest JSON to the prior valid profile', async () => {
  corruptProfile('alpha', 'rev-3');
  const result = await readDurableModelProfile(db, 'alpha');
  expect(result).toMatchObject({ selectedRevision: 'rev-2', fallback: 'prior-profile' });
});

it('returns a canonical redirect for an alias and 404 for an unknown slug', async () => {
  expect((await requestProfile('old-alpha')).status).toBe(308);
  expect((await requestProfile('not-present')).status).toBe(404);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- functions/_shared/model-directory-db.test.ts functions/api/benchmarks/models.test.ts 'functions/api/benchmarks/models/[slug].test.ts' 'functions/api/benchmarks/models/[slug].targeted.test.ts'`

Expected: FAIL because only active-revision targeted model reads exist.

- [ ] **Step 3: Implement targeted durable reads and validated API envelopes**

```ts
export interface ModelDirectoryQuery {
  readonly q: string;
  readonly creator: string | null;
  readonly sourceType: BenchmarkModel['sourceType'] | null;
  readonly evidenceStatus: EvidenceStatus | null;
  readonly status: 'current' | 'archived' | 'all';
  readonly limit: number;
  readonly cursor: string | null;
}

export interface ModelProfileReadResult {
  readonly directory: ModelDirectoryRecord;
  readonly profile: ModelProfileSnapshotData;
  readonly selectedRevision: string;
  readonly fallback: 'none' | 'prior-profile';
}
```

Default directory reads start from the newest `benchmark_popular_model_weeks` and its ranks. Search queries use escaped `LIKE` against normalized display name, creator, canonical slug, and model key, with a maximum 100 results and opaque deterministic cursor. Parse every selected `profile_json` with `parseModelProfileSnapshotData`; mark fallback profiles stale without changing their original provenance. Return 308 for aliases, 404 JSON for unknown slugs, and 503 only for D1 failure without a readable durable profile.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- functions/_shared/model-directory-db.test.ts functions/api/benchmarks/models.test.ts 'functions/api/benchmarks/models/[slug].test.ts' 'functions/api/benchmarks/models/[slug].targeted.test.ts'`

Expected: PASS for default weekly order, prior-week stale state, archived search, filters, escaped search, cursors, validated profile fallback, aliases, ETags, true 404, and bounded D1 reads.

- [ ] **Step 5: Commit durable APIs**

```bash
git add functions/_shared/model-directory-db.ts functions/_shared/model-directory-db.test.ts functions/api/benchmarks/models.ts functions/api/benchmarks/models.test.ts 'functions/api/benchmarks/models/[slug].ts' 'functions/api/benchmarks/models/[slug].test.ts' 'functions/api/benchmarks/models/[slug].targeted.test.ts'
git commit -m "feat: serve durable model APIs"
```

### Task 4: Server-rendered Popular Models directory

**Files:**
- Create: `src/frontend/model-directory-contracts.ts`
- Create: `src/frontend/model-directory-contracts.test.ts`
- Create: `src/frontend/model-directory-state.ts`
- Create: `src/frontend/model-directory-state.test.ts`
- Create: `src/pages/models-page.tsx`
- Create: `src/pages/models-page.test.tsx`
- Create: `functions/models/index.ts`
- Create: `functions/models/index.test.ts`
- Modify: `src/routing/routes.ts`
- Modify: `src/routing/routes.test.ts`
- Modify: `src/seo/metadata.ts`
- Modify: `src/seo/metadata.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`
- Modify: `src/main.test.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Adds route `{ kind: 'models' }` at `/models/` and navigation label `Models`.
- `ModelsApp({ initialEnvelope })` hydrates `script#models-initial-data` after runtime validation.
- SSR embeds `CollectionPage` and `ItemList` JSON-LD for the current weekly entries.
- Query state canonicalizes every filter URL to `/models/` and never emits query URLs in sitemaps.

- [ ] **Step 1: Add failing SSR, hydration, filter, and responsive-equivalence tests**

```ts
it('renders weekly model facts and JSON-LD in the initial HTML', async () => {
  const response = await onRequestGet(modelsContext());
  const html = await response.text();
  expect(html).toContain('<h1>Popular AI models</h1>');
  expect(html).toContain('GPT-5.6 Sol');
  expect(html).toContain('"@type":"ItemList"');
  expect(html).toContain('<link rel="canonical" href="https://tokenbench.monomind.one/models/">');
});

it('keeps table and mobile cards fact-equivalent', () => {
  render(<ModelsPage envelope={directoryEnvelope()} />);
  expect(screen.getAllByRole('link', { name: 'GPT-5.6 Sol' })).toHaveLength(2);
  expect(screen.getAllByText('81.48')).toHaveLength(2);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/frontend/model-directory-contracts.test.ts src/frontend/model-directory-state.test.ts src/pages/models-page.test.tsx functions/models/index.test.ts src/routing/routes.test.ts src/seo/metadata.test.ts src/main.test.tsx`

Expected: FAIL because the route, SSR handler, hydration contract, and directory page are absent.

- [ ] **Step 3: Implement decision-fact directory SSR and interactions**

```tsx
<a className="model-name-link" href={modelPath(model.slug)}>{model.displayName}</a>
<dl className="model-decision-facts">
  <div><dt>Weekly rank</dt><dd>{model.weeklyRank ? `#${model.weeklyRank}` : 'Not in current top 100'}</dd></div>
  <div><dt>Overall</dt><dd>{formatScore(model.overallScore)}</dd></div>
  <div><dt>Strongest category</dt><dd>{categorySummary(model.strongestCategory)}</dd></div>
  <div><dt>Direct API</dt><dd>{priceSummary(model.representativePrice)}</dd></div>
  <div><dt>Evidence</dt><dd>{model.evidenceStatus}</dd></div>
</dl>
```

SSR the default weekly table and mobile cards with the same records. Hydrate only after parsing the embedded envelope. Search every retained model through the bounded API; preserve the visible top 100 if search fails. Filters are creator/provider, source type, evidence status, and current/archived. Normalize query state with `history.replaceState`; metadata canonical remains `/models/`. Add unique title, description, Open Graph/Twitter, source/revision/freshness copy, and weekly-snapshot date.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/frontend/model-directory-contracts.test.ts src/frontend/model-directory-state.test.ts src/pages/models-page.test.tsx functions/models/index.test.ts src/routing/routes.test.ts src/seo/metadata.test.ts src/main.test.tsx`

Expected: PASS for initial HTML, hydration safety, weekly order, all-model search, archived filters, failed search preservation, table/cards parity, canonical query handling, metadata, and JSON-LD.

- [ ] **Step 5: Commit Popular Models**

```bash
git add src/frontend/model-directory-contracts.ts src/frontend/model-directory-contracts.test.ts src/frontend/model-directory-state.ts src/frontend/model-directory-state.test.ts src/pages/models-page.tsx src/pages/models-page.test.tsx functions/models/index.ts functions/models/index.test.ts src/routing/routes.ts src/routing/routes.test.ts src/seo/metadata.ts src/seo/metadata.test.ts src/App.tsx src/main.tsx src/main.test.tsx src/index.css
git commit -m "feat: add popular models directory"
```

### Task 5: Server-rendered model profile decision surface

**Files:**
- Create: `src/frontend/model-profile-contracts.ts`
- Create: `src/frontend/model-profile-contracts.test.ts`
- Create: `src/frontend/model-radar.tsx`
- Create: `src/frontend/model-radar.test.tsx`
- Create: `src/pages/model-profile-page.tsx`
- Create: `src/pages/model-profile-page.test.tsx`
- Create: `functions/models/[slug].ts`
- Create: `functions/models/[slug].test.ts`
- Modify: `src/routing/routes.ts`
- Modify: `src/seo/metadata.ts`
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`
- Modify: `src/main.test.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Adds dynamic route `{ kind: 'modelProfile'; slug: string }`.
- `ModelProfileApp({ viewModel })` hydrates `script#model-profile-initial-data` after strict parsing.
- `ModelRadar` consumes `readonly { key; label; percentile: number | null; rank: number | null; fieldSize: number | null }[]` and renders SVG plus a text/table equivalent.
- Dynamic metadata includes model name/current public score where available, canonical, OG/Twitter, `WebPage`, and benchmark `Dataset` JSON-LD.

- [ ] **Step 1: Add failing profile, radar, archived, SEO, and 404 tests**

```tsx
it('shows GPT-5.6 Sol corrected category evidence and ledger sources', () => {
  render(<ModelProfilePage viewModel={gptSolProfile()} />);
  expect(screen.getByRole('heading', { level: 1, name: 'GPT-5.6 Sol' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Capability radar' })).toHaveTextContent('Coding percentile');
  expect(screen.getByRole('article', { name: 'Coding' })).toHaveTextContent('78.0');
  expect(screen.getByRole('article', { name: 'Coding' })).toHaveTextContent('#3');
  expect(screen.getAllByRole('link', { name: /source/i }).length).toBeGreaterThan(0);
});

it('keeps missing radar axes blank and available to assistive text', () => {
  render(<ModelRadar axes={axesWithMissing()} />);
  expect(screen.getByText('Multimodal: Unavailable')).toBeInTheDocument();
  expect(screen.queryByText('Multimodal: 0th percentile')).not.toBeInTheDocument();
});

it('returns a true noindex 404 for an unknown slug', async () => {
  const response = await onRequestGet(profileContext('not-present'));
  expect(response.status).toBe(404);
  expect(await response.text()).toContain('<meta name="robots" content="noindex,follow">');
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/frontend/model-profile-contracts.test.ts src/frontend/model-radar.test.tsx src/pages/model-profile-page.test.tsx 'functions/models/[slug].test.ts' src/main.test.tsx`

Expected: FAIL because no public model profile page or hydration contract exists.

- [ ] **Step 3: Implement the complete evidence-rich profile**

```tsx
<main className="model-profile-page">
  <ModelDecisionHeader identity={viewModel.identity} summary={viewModel.summary} status={viewModel.directory.status} />
  <ModelRadar axes={viewModel.radar} />
  <CategoryScoreGrid categories={viewModel.categories} />
  <ModelPriceAndSpecs routes={viewModel.priceRoutes} specifications={viewModel.specifications} />
  <BenchmarkLedger rows={viewModel.ledger} />
</main>
```

Calculate percentile as `fieldSize > 1 && rank ? 100 * (fieldSize - rank) / (fieldSize - 1) : null`; clamp only validated rank/field pairs. Category cards show canonical display score, eligible rank/field size, percentile, evidence status, and benchmark count; measured non-ranked rows say `Not ranked`; missing categories are omitted or explicitly unavailable. Price rows retain provider/route/source and conflicts. Ledger groups by category and shows benchmark, display/raw value, compatible comparison/gap, published weight when present, evidence status, observed time, and source URL. Archived pages show a historical banner and latest-valid revision. Dynamic metadata derives only from visible facts and emits publication/modified dates.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/frontend/model-profile-contracts.test.ts src/frontend/model-radar.test.tsx src/pages/model-profile-page.test.tsx 'functions/models/[slug].test.ts' src/main.test.tsx`

Expected: PASS for corrected scores, percentile/rank/missing states, price conflicts, specifications, ledger provenance, archived fallback, alias redirect, server HTML, hydration, metadata, Dataset JSON-LD, and true 404.

- [ ] **Step 5: Commit model profiles**

```bash
git add src/frontend/model-profile-contracts.ts src/frontend/model-profile-contracts.test.ts src/frontend/model-radar.tsx src/frontend/model-radar.test.tsx src/pages/model-profile-page.tsx src/pages/model-profile-page.test.tsx 'functions/models/[slug].ts' 'functions/models/[slug].test.ts' src/routing/routes.ts src/seo/metadata.ts src/App.tsx src/main.tsx src/main.test.tsx src/index.css
git commit -m "feat: add model evidence profiles"
```

### Task 6: Model sitemap, canonical links, browser coverage, and migration release

**Files:**
- Create: `functions/sitemaps/models.xml.ts`
- Create: `functions/sitemaps/models.xml.test.ts`
- Modify: `public/sitemap.xml`
- Modify: `src/frontend/leaderboard-table.tsx`
- Modify: `src/frontend/leaderboard-table.test.tsx`
- Modify: `src/pages/home-page.tsx`
- Modify: `src/pages/home-page.test.tsx`
- Modify: `src/frontend/comparison-page.tsx`
- Modify: `src/frontend/comparison-page.test.tsx`
- Modify: `src/frontend/calculator-controls.tsx`
- Modify: `browser-tests/tokenbench-fixtures.ts`
- Modify: `scripts/local-preview-benchmark-api.ts`
- Modify: `browser-tests/responsive-browser.ts`
- Modify: `docs/catalog-deployment.md`
- Modify: `docs/tokenbench-deployment.md`

**Interfaces:**
- Sitemap entries: canonical profile URL plus `lastmod` from latest valid profile; binary slug order; no query URLs.
- Every internal model mention uses `modelPath(slug)` when a validated durable slug exists.
- Migration is additive and applied before the publishing Worker.

- [ ] **Step 1: Add failing retained-sitemap and cross-surface link tests**

```ts
it('includes current and archived valid profiles but no query URLs', async () => {
  const xml = await (await onRequestGet(sitemapContext())).text();
  expect(xml).toContain('<loc>https://tokenbench.monomind.one/models/gpt-5-6-sol/</loc>');
  expect(xml).toContain('<loc>https://tokenbench.monomind.one/models/retained-fixture/</loc>');
  expect(xml).not.toContain('?');
});

it('links model mentions to one canonical profile contract', () => {
  renderAllModelSurfaces();
  expect(screen.getAllByRole('link', { name: 'GPT-5.6 Sol' }).every((link) => link.getAttribute('href') === '/models/gpt-5-6-sol/')).toBe(true);
});
```

- [ ] **Step 2: Run focused and browser tests and verify RED**

Run: `npm test -- functions/sitemaps/models.xml.test.ts src/frontend/leaderboard-table.test.tsx src/pages/home-page.test.tsx src/frontend/comparison-page.test.tsx`

Run: `npm run test:browser:local-preview -- --grep "Popular Models|model profile|retained model"`

Expected: FAIL because sitemap and canonical cross-surface links are absent.

- [ ] **Step 3: Implement sitemap/links and document exact migration controls**

```text
Release 3 migration and publication order:
1. Export D1 backup and record pre-migration table counts.
2. Apply migrations/0009_model_directory.sql to preview, run controlled ingestion, and verify current+archived/profile/week counts.
3. Apply the additive migration to production before deploying the Worker.
4. Deploy the Worker, trigger one authorized ingestion, and verify every active model has directory membership and a profile snapshot.
5. Verify exactly one current UTC-week header and ranks 1..min(100, eligible public rows).
6. Deploy Pages and verify /models/, current/archived profiles, alias/404 behavior, model sitemap, metadata, JSON-LD, console, and responsive layout.
```

Use XML escaping and exact `application/xml; charset=utf-8`. Add the model sitemap to the sitemap index. Update links only where the record/view model contains a validated slug; otherwise retain plain text. Local fixtures must include 101 weekly models, a retained archived model, an alias, missing radar/category facts, price conflict, stale profile fallback, and an unknown slug.

- [ ] **Step 4: Run the full Release 3 verification gate**

Run: `npm test`

Expected: PASS for all Vitest suites including migration statement plans, directory/profile APIs, SSR, SEO, links, and sitemap.

Run: `npm run lint && npm run build && npm run test:browser:local-preview`

Expected: TypeScript/build/browser suites pass for desktop/mobile, keyboard semantics, initial HTML, no console errors, no horizontal overflow, top 100, all-model search, retained profile, model links, and true 404.

- [ ] **Step 5: Commit Release 3 integration evidence**

```bash
git add functions/sitemaps/models.xml.ts functions/sitemaps/models.xml.test.ts public/sitemap.xml src/frontend/leaderboard-table.tsx src/frontend/leaderboard-table.test.tsx src/pages/home-page.tsx src/pages/home-page.test.tsx src/frontend/comparison-page.tsx src/frontend/comparison-page.test.tsx src/frontend/calculator-controls.tsx browser-tests/tokenbench-fixtures.ts scripts/local-preview-benchmark-api.ts browser-tests/responsive-browser.ts docs/catalog-deployment.md docs/tokenbench-deployment.md
git commit -m "test: verify durable model release"
```
