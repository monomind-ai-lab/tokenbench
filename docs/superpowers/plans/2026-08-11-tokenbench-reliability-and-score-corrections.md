# TokenBench Reliability and Score Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make BenchLM public scores canonical, keep the last valid benchmark evidence visible through recoverable server/browser failures, replace leaderboard sharing with an accessible copy dialog, and remove the unsupported footer link.

**Architecture:** Extend the existing BenchLM projection with one separately validated public-leaderboard artifact and join it to canonical models before metric derivation. Centralize the existing fresh-cache/active-revision/stale-cache sequence in a Pages helper, then add a schema-versioned browser cache that stores only runtime-validated envelopes. Keep the existing route, envelope, ETag, provenance, and materialized-response contracts.

**Tech Stack:** TypeScript 5.8, Cloudflare Workers and Pages Functions, D1, R2, React 19, Vitest, Testing Library, Playwright.

## Global Constraints

- BenchLM public overall and category values come from `https://benchlm.ai/api/data/leaderboard?mode=bench-align-v5`.
- GPT-5.6 Sol must normalize to overall `81.48`, coding `77.95`, formatted coding `78.0`, and coding rank `#3`.
- Secondary BenchLM artifacts may enrich identity or diagnostics but may not override the public aggregates.
- Public-leaderboard joins must resolve one-to-one; ambiguous identity rejects the candidate revision.
- Recovery order is fresh materialized response, active published revision, newest complete stale materialized response, browser last-valid envelope, then unavailable only when no valid data exists.
- Stale fallback preserves the original revision, source attribution, checked time, and canonical URL.
- Logs contain safe stage/revision/query identifiers and never response bodies, credentials, subscriber data, or browser storage values.
- Existing Home and Leaderboard SEO metadata remains server-rendered and indexable.
- Every task follows RED-GREEN-REFACTOR and ends in a focused commit.

---

## File structure and ownership

- `workers/benchmark-ingest/src/benchlm-public-leaderboard.ts` owns strict parsing, projection, and canonical-model joins for the public API artifact.
- `workers/benchmark-ingest/test-fixtures/benchlm/public-leaderboard.json` is the regression fixture containing GPT-5.6 Sol's canonical public values.
- `workers/benchmark-ingest/src/benchlm.ts` fetches/snapshots the sixth artifact and consumes the joined public rows when producing metrics.
- `functions/_shared/api-response-cache.ts` reads validated active or newest-complete response bodies; it does not decide endpoint behavior.
- `functions/_shared/benchmark-response-fallback.ts` owns the endpoint fallback sequence and safe structured logging.
- `src/frontend/benchmark-cache.ts` owns schema-versioned, validated browser persistence.
- `src/frontend/use-benchmarks.ts` retains valid summary/leaderboard state and exposes stale-browser fallback state.
- `src/frontend/share-action.tsx` owns the reusable accessible URL-copy dialog.
- `src/pages/leaderboards-page.tsx` configures the canonical leaderboard URL and secondary share trigger.
- `src/frontend/app-shell.tsx` removes the unsupported Data Sources footer entry.

### Task 1: Canonical BenchLM public score artifact

**Files:**
- Create: `workers/benchmark-ingest/src/benchlm-public-leaderboard.ts`
- Create: `workers/benchmark-ingest/src/benchlm-public-leaderboard.test.ts`
- Create: `workers/benchmark-ingest/test-fixtures/benchlm/public-leaderboard.json`
- Modify: `workers/benchmark-ingest/src/benchlm.ts`
- Modify: `workers/benchmark-ingest/src/benchlm.test.ts`
- Modify: `workers/benchmark-ingest/src/index.ts`
- Modify: `workers/benchmark-ingest/src/index.test.ts`
- Modify: `src/benchmarks/contracts.ts`

**Interfaces:**
- Produces: `parseBenchLmPublicLeaderboard(value: unknown): BenchLmPublicLeaderboard`
- Produces: `joinPublicLeaderboardScores(models, publicRows): ReadonlyMap<string, PublicBenchLmScore>`
- `PublicBenchLmScore = { modelKey: string; overallScore: number; overallRank: number; categoryScores: Readonly<Record<string, number | null>>; categoryRanks: Readonly<Record<string, number | null>>; methodologyVersion: string; sourceSnapshotId: string }`
- Consumes: exact `creator`/`model` identity from the same prepared BenchLM bundle; normalized fallback is accepted only when unique on both sides.
- Preserves: `NormalizedSourceBatch`, public metric keys, source artifact records, and atomic candidate publication.

- [ ] **Step 1: Add failing parser, join, ambiguity, and GPT-5.6 Sol regression tests**

```ts
it('uses the public BenchAlign row for GPT-5.6 Sol', () => {
  const rows = parseBenchLmPublicLeaderboard(publicLeaderboardFixture);
  const joined = joinPublicLeaderboardScores(modelCatalogFixture, rows.models);
  expect(joined.get('benchlm:openai:gpt-5-6-sol')).toMatchObject({
    overallScore: 81.48,
    categoryScores: { coding: 77.95 },
    categoryRanks: { coding: 3 },
  });
});

it('rejects an ambiguous normalized creator/model fallback', () => {
  expect(() => joinPublicLeaderboardScores(ambiguousCatalog(), ambiguousRows()))
    .toThrow('public leaderboard identity is ambiguous');
});

it('does not fill a missing public category from models.json', async () => {
  const batch = await normalizedBenchLmBatch({ publicCoding: null, modelAggregateCoding: 54.6 });
  expect(batch.metrics.find((metric) => metric.metricKey === 'benchlm:category:coding')).toBeUndefined();
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- workers/benchmark-ingest/src/benchlm-public-leaderboard.test.ts workers/benchmark-ingest/src/benchlm.test.ts workers/benchmark-ingest/src/index.test.ts`

Expected: FAIL because the strict public parser, fixture, join, and sixth source artifact are absent.

- [ ] **Step 3: Implement the strict public projection and make it authoritative**

```ts
export interface BenchLmPublicLeaderboard {
  readonly lastUpdated: string;
  readonly methodologyVersion: string;
  readonly sourceSnapshotId: string;
  readonly approvedSnapshotId: string;
  readonly models: readonly BenchLmPublicLeaderboardRow[];
}

export function joinPublicLeaderboardScores(
  models: readonly SafeBenchLmModelIdentity[],
  rows: readonly BenchLmPublicLeaderboardRow[],
): ReadonlyMap<string, PublicBenchLmScore> {
  const result = new Map<string, PublicBenchLmScore>();
  for (const row of rows) {
    const exact = models.filter((model) => model.creator === row.creator && model.name === row.model);
    const candidates = exact.length === 1 ? exact : uniqueNormalizedMatches(models, row);
    if (candidates.length !== 1) throw new Error(`BenchLM public leaderboard identity is ambiguous: ${row.creator}/${row.model}`);
    const model = candidates[0];
    if (result.has(model.modelKey)) throw new Error(`BenchLM public leaderboard repeats model: ${model.modelKey}`);
    result.set(model.modelKey, publicScoreFor(model.modelKey, row));
  }
  return result;
}
```

Add `publicLeaderboard` to the fetched/stored prepared bundle with source URL `https://benchlm.ai/api/data/leaderboard?mode=bench-align-v5`. Project only allowlisted fields; record the original and projected hashes; set source artifact identity to `public-leaderboard`; preserve `methodologyVersion`, `sourceSnapshotId`, `approvedSnapshotId`, `lastUpdated`, and the worker observation timestamp. Bump `BENCHMARK_DERIVATION_SCHEMA_VERSION` from `1` to `2`. Build public overall/category metrics only from the joined map; retain `rawOverallScore` solely as diagnostic `rawValue` on the overall metric.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- workers/benchmark-ingest/src/benchlm-public-leaderboard.test.ts workers/benchmark-ingest/src/benchlm.test.ts workers/benchmark-ingest/src/index.test.ts src/benchmarks/contracts.test.ts src/benchmarks/api-projections.test.ts src/benchmarks/leaderboard-csv.test.ts`

Expected: PASS with GPT-5.6 Sol coding `77.95`, rank `3`, no `54.6` override, deterministic hashes, six immutable artifacts, and rejection of ambiguous joins.

- [ ] **Step 5: Commit canonical score ingestion**

```bash
git add workers/benchmark-ingest/src/benchlm-public-leaderboard.ts workers/benchmark-ingest/src/benchlm-public-leaderboard.test.ts workers/benchmark-ingest/test-fixtures/benchlm/public-leaderboard.json workers/benchmark-ingest/src/benchlm.ts workers/benchmark-ingest/src/benchlm.test.ts workers/benchmark-ingest/src/index.ts workers/benchmark-ingest/src/index.test.ts src/benchmarks/contracts.ts src/benchmarks/contracts.test.ts src/benchmarks/api-projections.test.ts src/benchmarks/leaderboard-csv.test.ts
git commit -m "fix: use canonical BenchLM public scores"
```

### Task 2: Server last-good benchmark recovery

**Files:**
- Modify: `functions/_shared/api-response-cache.ts`
- Modify: `functions/_shared/api-response-cache.test.ts`
- Create: `functions/_shared/benchmark-response-fallback.ts`
- Create: `functions/_shared/benchmark-response-fallback.test.ts`
- Modify: `functions/api/benchmarks.ts`
- Modify: `functions/api/benchmarks.test.ts`
- Modify: `functions/api/benchmarks/leaderboards/[key].ts`
- Create: `functions/api/benchmarks/leaderboards/[key].test.ts`
- Modify: `functions/_shared/benchmark-leaderboard-projection.ts`
- Modify: `functions/_shared/benchmark-leaderboard-projection.test.ts`

**Interfaces:**
- Produces: `readNewestCompleteApiResponseCache(db, scope, cacheKey): Promise<MaterializedApiResponse | null>`; it always selects the stored `stale` variant.
- Produces: `serveBenchmarkWithFallback(options): Promise<Response>`.
- Consumes: endpoint-specific `reconstruct(now): Promise<Response | null>` that reads and validates the active revision.
- Logging contract: `{ event, endpoint, queryId, cacheScope, cacheKey, stage, errorClass, activeRevision?, fallbackRevision?, fallbackSelected, correlationId }`.

- [ ] **Step 1: Add failing cache-corruption and recovery-sequence tests**

```ts
it('continues to the active revision when the active cache is corrupt', async () => {
  const response = await serveBenchmarkWithFallback(options({
    readFresh: vi.fn().mockRejectedValue(new Error('chunks are inconsistent')),
    reconstruct: vi.fn().mockResolvedValue(jsonResponse(activeEnvelope)),
  }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(activeEnvelope);
});

it('serves the newest complete stale body when reconstruction fails', async () => {
  const response = await serveBenchmarkWithFallback(options({
    readFresh: vi.fn().mockResolvedValue(null),
    reconstruct: vi.fn().mockRejectedValue(new Error('D1 read failed')),
    readStale: vi.fn().mockResolvedValue(staleCached('benchmark-rev-41')),
  }));
  expect(response.status).toBe(200);
  expect((await response.json()).freshness.status).toBe('stale');
});

it('returns unavailable only after all three server stages fail', async () => {
  expect((await serveBenchmarkWithFallback(allStagesUnavailable())).status).toBe(503);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- functions/_shared/api-response-cache.test.ts functions/_shared/benchmark-response-fallback.test.ts functions/api/benchmarks.test.ts 'functions/api/benchmarks/leaderboards/[key].test.ts' functions/_shared/benchmark-leaderboard-projection.test.ts`

Expected: FAIL because cache exceptions still escape to the endpoint-wide 503 catch and no historical complete-reader exists.

- [ ] **Step 3: Implement a validated historical reader and shared fallback controller**

```ts
export interface BenchmarkFallbackOptions {
  readonly request: Request;
  readonly endpoint: string;
  readonly queryId: string;
  readonly cacheKey: string;
  readonly correlationId: string;
  readonly db: ApiResponseCacheDatabase;
  readonly reconstruct: (now: number) => Promise<Response | null>;
  readonly unavailable: () => Response;
  readonly log?: (entry: BenchmarkFallbackLog) => void;
  readonly now?: number;
}

export async function serveBenchmarkWithFallback(options: BenchmarkFallbackOptions): Promise<Response> {
  const now = options.now ?? Date.now();
  try {
    const cached = await readApiResponseCache(options.db, 'benchmarks', options.cacheKey, BENCHMARK_FRESHNESS_MS, now);
    if (cached) return cachedApiResponse(options.request, cached);
  } catch (error) {
    logFailure(options, 'fresh-cache', error, false);
  }
  try {
    const response = await options.reconstruct(now);
    if (response) return response;
  } catch (error) {
    logFailure(options, 'active-revision', error, false);
  }
  try {
    const cached = await readNewestCompleteApiResponseCache(options.db, 'benchmarks', options.cacheKey);
    if (cached) {
      logFallback(options, cached.revision);
      return cachedApiResponse(options.request, cached);
    }
  } catch (error) {
    logFailure(options, 'stale-cache', error, false);
  }
  return options.unavailable();
}
```

Implement the historical SQL as a newest-revision subquery ordered by `checked_at DESC, revision DESC`, constrained to rows that contain the requested `stale` cache key. Reuse one chunk materializer for both readers so limits, contiguous indexes, ETag consistency, and UTF-8 size checks cannot drift. Generate a correlation ID from an accepted inbound `cf-ray`/`x-request-id` or a bounded random UUID; never echo raw errors or bodies to clients.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- functions/_shared/api-response-cache.test.ts functions/_shared/benchmark-response-fallback.test.ts functions/api/benchmarks.test.ts 'functions/api/benchmarks/leaderboards/[key].test.ts' functions/_shared/benchmark-leaderboard-projection.test.ts`

Expected: PASS for active cache, corrupt cache, active reconstruction, stale historical recovery, exact 304 handling, chunk validation, safe logs, and terminal 503.

- [ ] **Step 5: Commit server recovery**

```bash
git add functions/_shared/api-response-cache.ts functions/_shared/api-response-cache.test.ts functions/_shared/benchmark-response-fallback.ts functions/_shared/benchmark-response-fallback.test.ts functions/api/benchmarks.ts functions/api/benchmarks.test.ts 'functions/api/benchmarks/leaderboards/[key].ts' 'functions/api/benchmarks/leaderboards/[key].test.ts' functions/_shared/benchmark-leaderboard-projection.ts functions/_shared/benchmark-leaderboard-projection.test.ts
git commit -m "fix: recover last good benchmark responses"
```

### Task 3: Browser last-valid benchmark envelope

**Files:**
- Create: `src/frontend/benchmark-cache.ts`
- Create: `src/frontend/benchmark-cache.test.ts`
- Modify: `src/frontend/use-benchmarks.ts`
- Modify: `src/frontend/use-benchmarks.test.ts`
- Modify: `src/pages/home-page.tsx`
- Modify: `src/pages/home-page.test.tsx`
- Modify: `src/pages/leaderboards-page.tsx`
- Modify: `src/pages/leaderboards-page.test.tsx`

**Interfaces:**
- Produces: `readBenchmarkEnvelopeCache<T>(key, parse): CachedBenchmarkEnvelope<T> | null`.
- Produces: `writeBenchmarkEnvelopeCache<T>(key, envelope): void` after the endpoint parser succeeds.
- Produces: `benchmarkCacheKey(endpoint, normalizedQuery): string` prefixed by `tokenbench:benchmarks:v2:`.
- Hook result adds `fallback: 'none' | 'browser-cache'` without changing the server envelope.

- [ ] **Step 1: Add failing validated-cache and stale-UI tests**

```ts
it('returns a prior validated envelope after a 503 without overwriting it', async () => {
  seedBenchmarkCache('/api/benchmarks', validSummaryEnvelope());
  fetchMock.mockResolvedValue(new Response('{"status":"unavailable"}', { status: 503 }));
  const { result } = renderHook(() => useBenchmarkSummary());
  await waitFor(() => expect(result.current.fallback).toBe('browser-cache'));
  expect(result.current.data?.revision.revision).toBe('benchmark-rev-41');
  expect(readRawCache('/api/benchmarks')).toContain('benchmark-rev-41');
});

it('does not persist malformed successful JSON', async () => {
  fetchMock.mockResolvedValue(new Response('{"revision":{}}', { status: 200 }));
  await loadSummary();
  expect(localStorage.length).toBe(0);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/frontend/benchmark-cache.test.ts src/frontend/use-benchmarks.test.ts src/pages/home-page.test.tsx src/pages/leaderboards-page.test.tsx`

Expected: FAIL because failed requests currently replace valid state and no validated browser cache exists.

- [ ] **Step 3: Implement bounded schema-versioned persistence and visible fallback state**

```ts
interface StoredBenchmarkEnvelope {
  readonly schema: 'tokenbench-benchmark-cache/v2';
  readonly storedAt: string;
  readonly value: unknown;
}

export function readBenchmarkEnvelopeCache<T>(
  key: string,
  parse: (value: unknown) => T | null,
): { value: T; storedAt: string } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw || new TextEncoder().encode(raw).byteLength > 2_000_000) return null;
    const stored = JSON.parse(raw) as StoredBenchmarkEnvelope;
    if (stored.schema !== 'tokenbench-benchmark-cache/v2') return null;
    const value = parse(stored.value);
    return value ? { value, storedAt: stored.storedAt } : null;
  } catch {
    return null;
  }
}
```

Write only after the existing full endpoint parser returns a valid envelope. Normalize leaderboard query keys with the same profile/filter/estimated/limit serializer used for fetches. On network, status, JSON, or validation failure, keep the last in-memory valid envelope first, then local storage; expose a stale banner reading `Showing the last published revision while refresh is unavailable.` Preserve retry controls and source/publication/checked/revision facts. Storage quota/security errors remain non-fatal.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/frontend/benchmark-cache.test.ts src/frontend/use-benchmarks.test.ts src/pages/home-page.test.tsx src/pages/leaderboards-page.test.tsx`

Expected: PASS for valid writes, malformed rejection, bounded size, storage errors, query isolation, last-in-memory state, browser fallback, cold unavailable state, and stale copy.

- [ ] **Step 5: Commit browser recovery**

```bash
git add src/frontend/benchmark-cache.ts src/frontend/benchmark-cache.test.ts src/frontend/use-benchmarks.ts src/frontend/use-benchmarks.test.ts src/pages/home-page.tsx src/pages/home-page.test.tsx src/pages/leaderboards-page.tsx src/pages/leaderboards-page.test.tsx
git commit -m "fix: retain last published benchmark data"
```

### Task 4: Leaderboard share dialog and footer correction

**Files:**
- Modify: `src/frontend/share-action.tsx`
- Modify: `src/frontend/share-action.test.tsx`
- Modify: `src/pages/leaderboards-page.tsx`
- Modify: `src/pages/leaderboards-page.test.tsx`
- Modify: `src/frontend/app-shell.tsx`
- Modify: `src/frontend/app-shell.test.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Produces: `ShareAction({ label, canonicalUrl, variant: 'secondary' | 'primary' })` with dialog semantics.
- Uses: `navigator.clipboard.writeText(canonicalUrl)` only after explicit Copy activation.
- Preserves: existing share controls outside Leaderboards unless their caller opts into the dialog behavior.

- [ ] **Step 1: Add failing keyboard, copy, failure, and footer tests**

```tsx
it('opens a canonical URL dialog and restores trigger focus', async () => {
  render(<ShareAction label="Share Leaderboard" canonicalUrl="https://tokenbench.monomind.one/leaderboards/llm/coding/" variant="secondary" />);
  const trigger = screen.getByRole('button', { name: 'Share Leaderboard' });
  await user.click(trigger);
  expect(screen.getByRole('dialog', { name: 'Share Leaderboard' })).toBeInTheDocument();
  expect(screen.getByRole('textbox')).toHaveValue('https://tokenbench.monomind.one/leaderboards/llm/coding/');
  await user.keyboard('{Escape}');
  expect(trigger).toHaveFocus();
});

it('keeps the dialog open and announces a clipboard failure', async () => {
  clipboard.writeText.mockRejectedValue(new Error('denied'));
  await openAndCopy();
  expect(screen.getByRole('status')).toHaveTextContent('Copy failed');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

it('does not render Data Sources in the footer', () => {
  render(<AppShell><div /></AppShell>);
  expect(screen.queryByRole('link', { name: 'Data Sources' })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/frontend/share-action.test.tsx src/pages/leaderboards-page.test.tsx src/frontend/app-shell.test.tsx`

Expected: FAIL because sharing is immediate and the unsupported footer link still renders.

- [ ] **Step 3: Implement the modal interaction and secondary trigger**

```tsx
<button ref={triggerRef} type="button" className="button button-secondary button-small" onClick={open}>
  <Share2 size={16} aria-hidden="true" /> Share Leaderboard
</button>
{isOpen ? (
  <div className="dialog-backdrop" onMouseDown={onBackdropMouseDown}>
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="share-dialog">
      <button type="button" aria-label="Close share dialog" onClick={close}><X aria-hidden="true" /></button>
      <h2 id={titleId}>Share Leaderboard</h2>
      <input readOnly value={canonicalUrl} onFocus={(event) => event.currentTarget.select()} />
      <button type="button" onClick={copy}>Copy</button>
      <p role="status" aria-live="polite">{copyStatus}</p>
    </section>
  </div>
) : null}
```

Trap Tab/Shift+Tab within the dialog, close only on Escape, explicit close, or an actual backdrop click, and restore trigger focus. Use the route metadata canonical rather than `window.location.href`. Remove only the Data Sources footer record; retain Methodology and Privacy.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/frontend/share-action.test.tsx src/pages/leaderboards-page.test.tsx src/frontend/app-shell.test.tsx`

Expected: PASS for focus trap, Escape, backdrop behavior, success/failure announcements, canonical URL, icon/secondary styling, focus restoration, and footer navigation.

- [ ] **Step 5: Commit interaction corrections**

```bash
git add src/frontend/share-action.tsx src/frontend/share-action.test.tsx src/pages/leaderboards-page.tsx src/pages/leaderboards-page.test.tsx src/frontend/app-shell.tsx src/frontend/app-shell.test.tsx src/index.css
git commit -m "feat: add leaderboard share dialog"
```

### Task 5: Release 1 integration, browser coverage, and deployment runbook

**Files:**
- Modify: `browser-tests/tokenbench-fixtures.ts`
- Modify: `browser-tests/tokenbench-fixtures.test.ts`
- Modify: `scripts/local-preview-benchmark-api.ts`
- Modify: `browser-tests/responsive-browser.ts`
- Modify: `docs/catalog-deployment.md`
- Modify: `docs/tokenbench-deployment.md`

**Interfaces:**
- Local preview fixture exposes corrected public score rows and selectable fresh/503/corrupt-cache states.
- Browser suite verifies Home, coding and overall Leaderboards, share dialog, stale banner, footer, metadata, and no horizontal overflow.
- Deployment order remains benchmark Worker first, authorized refresh second, Pages third.

- [ ] **Step 1: Add failing end-to-end regression scenarios**

```ts
test('correct score and last-good evidence survive a refresh outage', async ({ page }) => {
  await page.goto('/leaderboards/llm/coding/');
  await expect(page.getByRole('row', { name: /GPT-5.6 Sol.*78\.0.*#3/ })).toBeVisible();
  await simulateBenchmarkFailure(page);
  await page.reload();
  await expect(page.getByText('Showing the last published revision')).toBeVisible();
  await expect(page.getByRole('row', { name: /GPT-5.6 Sol.*78\.0/ })).toBeVisible();
});

test('leaderboard metadata and share URL stay canonical', async ({ page }) => {
  await page.goto('/leaderboards/llm/coding/');
  await page.getByRole('button', { name: 'Share Leaderboard' }).click();
  await expect(page.getByRole('textbox')).toHaveValue('https://tokenbench.monomind.one/leaderboards/llm/coding/');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://tokenbench.monomind.one/leaderboards/llm/coding/');
});
```

- [ ] **Step 2: Run browser scenarios and verify RED**

Run: `npm run test:browser:local-preview -- --grep "correct score|metadata and share"`

Expected: FAIL until fixtures, local API failure modes, and corrected UI behavior are wired together.

- [ ] **Step 3: Implement fixtures, safe logging documentation, and exact deployment checks**

```text
Release 1 live checks:
1. Deploy the benchmark-ingest Worker from the verified commit.
2. Trigger the existing authorized refresh endpoint once and record the active revision.
3. Assert /api/benchmarks and /api/benchmarks/leaderboards/llm-coding contain the same revision.
4. Assert GPT-5.6 Sol coding value is 77.95 and rank is 3 in JSON.
5. Deploy Pages from the same commit.
6. Verify Home, coding/overall Leaderboards, stale headers, canonical metadata, share dialog, and footer at desktop/mobile widths.
7. Inspect structured fallback logs by correlation ID and confirm no response body or personal data fields exist.
```

Add deterministic local API switches for a 503 after one valid response and for a malformed cache row. Document the safe structured event names `benchmark_fresh_cache_failed`, `benchmark_active_revision_failed`, `benchmark_stale_fallback_selected`, and `benchmark_unavailable` with the exact allowed fields.

- [ ] **Step 4: Run the full Release 1 verification gate**

Run: `npm test`

Expected: PASS for all Vitest suites.

Run: `npm run lint && npm run build`

Expected: TypeScript exits 0 and Vite production build exits 0.

Run: `npm run test:browser:local-preview`

Expected: PASS with no console errors, correct metadata, correct GPT-5.6 Sol values, server/browser stale fallback, share dialog behavior, and no horizontal overflow.

- [ ] **Step 5: Commit Release 1 integration evidence**

```bash
git add browser-tests/tokenbench-fixtures.ts browser-tests/tokenbench-fixtures.test.ts scripts/local-preview-benchmark-api.ts browser-tests/responsive-browser.ts docs/catalog-deployment.md docs/tokenbench-deployment.md
git commit -m "test: verify benchmark reliability release"
```
