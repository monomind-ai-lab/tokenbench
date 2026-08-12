# TokenBench Free-Tier Checkpointed Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace monolithic catalog and benchmark refreshes with resumable SQLite Durable Object alarm pipelines that publish daily catalog and weekly benchmark data within Cloudflare Workers Free limits.

**Architecture:** Each scheduled handler only starts a singleton Durable Object coordinator. The coordinator persists compact cycle state, performs one idempotent bounded step per alarm, stores large attempt-owned artifacts in R2, stages inactive D1/cache/profile partitions, and moves public pointers only in the existing guarded final transaction. Catalog freshness remains 36 hours; all benchmark-derived surfaces use one shared 8-day freshness policy and keep serving the last complete revision on refresh failure.

**Tech Stack:** TypeScript 5.8, Cloudflare Workers/Wrangler 4.121+, SQLite Durable Objects and alarms, D1, R2, Vitest 4, Miniflare/Wrangler local runtime, React/Pages Functions, Orca multi-agent orchestration.

## Global Constraints

- Production remains on Cloudflare Workers Free; no billing change or new paid dependency is authorized.
- The catalog schedule is exactly `20 0 * * *`; the benchmark schedule is exactly `15 2 * * SUN`, both UTC.
- Standard scheduled handlers may only dispatch to a Durable Object and must stay below the observed 10 ms CPU ceiling.
- A Durable Object alarm executes at most one bounded logical step and normally makes at most one upstream request.
- HTTP 429 is never retried in the same invocation. Persist the complete valid `Retry-After` or provider reset time, add 0–15 seconds jitter, and retry through a later alarm.
- A source artifact receives at most three attempts per cycle. OpenCode models and pricing are retrieved serially.
- Catalog cycles expire after 12 hours; benchmark cycles expire after 24 hours.
- Candidate R2 keys and pending D1 rows are attempt-owned. Duplicate alarms must converge without duplicate public effects.
- Public catalog, benchmark, and API cache pointers move only after complete candidate validation. A failed/expired cycle leaves the active revision unchanged.
- Catalog evidence is fresh for 36 hours. Benchmark, leaderboard, comparison, model-profile, and price-performance evidence is fresh for exactly 8 days.
- “Unavailable” remains reserved for a cold system with no valid revision. Refresh failure serves labeled last-good evidence.
- No permanent public refresh/admin endpoint, source payload logging, secret in source/config, or Artificial Analysis data is allowed.
- Use `crypto.randomUUID()` for cycle IDs. Do not use mutable module globals for cycle/request state. Await every promise.
- New Durable Object classes use the SQLite backend and current declarative Wrangler `exports` configuration.
- Generate and commit Worker binding/runtime declarations with Wrangler; CI checks them with `wrangler types --check`.
- Use RED-GREEN-REFACTOR for every behavior change, commit each task independently, and keep the worktree clean between task integrations.

---

### Task 1: Shared cadence, retry, cycle, and receipt contracts

**Files:**
- Create: `src/ingestion/cadence.ts`
- Create: `src/ingestion/cadence.test.ts`
- Create: `workers/_shared/checkpointed-ingestion.ts`
- Create: `workers/_shared/checkpointed-ingestion.test.ts`
- Create: `migrations/0010_ingestion_cycles.sql`
- Modify: `docs/catalog-deployment.md`

**Interfaces:**
- Consumes: existing UTC ISO timestamps and D1 binding conventions.
- Produces:
  - `CATALOG_CRON`, `BENCHMARK_CRON`, `CATALOG_FRESHNESS_WINDOW_MS`, and `BENCHMARK_FRESHNESS_WINDOW_MS`.
  - `catalogCadenceKey(timestamp)`, `benchmarkCadenceKey(timestamp)`, and `cycleDue(lastCompletedKey, nextKey)`.
  - `IngestionScope`, `IngestionPhase`, `IngestionCycleState`, `IngestionCycle`, and `IngestionStepReceipt`.
  - `providerRetryAt(headers, nowMs)`, `nextRetryAlarmAt(input)`, and `assertCycleTransition(previous, next)`.
  - D1 tables `ingestion_cycles` and `ingestion_cycle_steps` used by both coordinators.

- [ ] **Step 1: Write failing cadence and retry tests**

Add exact boundary cases:

```ts
expect(catalogCadenceKey('2026-08-12T23:59:59.999Z')).toBe('2026-08-12');
expect(benchmarkCadenceKey('2026-08-16T01:00:00.000Z')).toBe('2026-W33');
expect(BENCHMARK_FRESHNESS_WINDOW_MS).toBe(8 * 24 * 60 * 60 * 1_000);

const retry = new Headers({ 'Retry-After': '3600' });
expect(providerRetryAt(retry, Date.parse('2026-08-12T00:00:00Z')))
  .toBe(Date.parse('2026-08-12T01:00:00Z'));
expect(nextRetryAlarmAt({ attempt: 1, nowMs: 0, providerRetryAtMs: 3_600_000, jitterMs: 5_000 }))
  .toBe(3_605_000);
expect(() => nextRetryAlarmAt({ attempt: 3, nowMs: 0, providerRetryAtMs: null, jitterMs: 0 }))
  .toThrow('attempt limit');
```

Test HTTP-date `Retry-After`, Hugging Face `RateLimit` reset `t=`, malformed/negative values, 1/5/30-minute fallback, 0–15 second jitter bounds, and legal/illegal cycle transitions.

- [ ] **Step 2: Run the new tests and verify RED**

Run:

```bash
npx vitest run src/ingestion/cadence.test.ts workers/_shared/checkpointed-ingestion.test.ts
```

Expected: FAIL because both modules and exports are missing.

- [ ] **Step 3: Implement shared pure contracts**

Use these exact public shapes:

```ts
export const CATALOG_CRON = '20 0 * * *';
export const BENCHMARK_CRON = '15 2 * * SUN';
export const CATALOG_FRESHNESS_WINDOW_MS = 36 * 60 * 60 * 1_000;
export const BENCHMARK_FRESHNESS_WINDOW_MS = 8 * 24 * 60 * 60 * 1_000;

export type IngestionScope = 'catalog' | 'benchmarks';
export type IngestionCycleState =
  | 'idle' | 'running' | 'retry_wait' | 'ready_to_publish'
  | 'published' | 'failed' | 'expired';

export interface IngestionCycle {
  readonly schemaVersion: 1;
  readonly scope: IngestionScope;
  readonly cycleId: string;
  readonly cadenceKey: string;
  readonly state: IngestionCycleState;
  readonly phase: string;
  readonly cursor: number;
  readonly attempt: number;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly expiresAt: string;
  readonly nextRetryAt: string | null;
  readonly frozenCatalogRevision: string | null;
  readonly frozenBenchmarkRevision: string | null;
  readonly manifestKey: string | null;
  readonly finalRevision: string | null;
  readonly errorCode: string | null;
  readonly errorSourceId: string | null;
  readonly errorArtifactId: string | null;
}
```

Parse provider reset headers without applying the former ten-second cap. Return `null` for untrusted values. `nextRetryAlarmAt` returns the later of fallback/provider reset, plus injected jitter, and rejects attempt 3 or greater.

- [ ] **Step 4: Add operational receipt tables**

`migrations/0010_ingestion_cycles.sql` must create:

```sql
CREATE TABLE ingestion_cycles (
  scope TEXT NOT NULL CHECK (scope IN ('catalog', 'benchmarks')),
  cycle_id TEXT NOT NULL,
  cadence_key TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('idle','running','retry_wait','ready_to_publish','published','failed','expired')),
  phase TEXT NOT NULL,
  cursor INTEGER NOT NULL CHECK (cursor >= 0),
  attempt INTEGER NOT NULL CHECK (attempt BETWEEN 0 AND 3),
  frozen_catalog_revision TEXT,
  frozen_benchmark_revision TEXT,
  manifest_key TEXT,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  expires_at TEXT NOT NULL,
  next_retry_at TEXT,
  final_revision TEXT,
  result_json TEXT CHECK (result_json IS NULL OR (json_valid(result_json) AND length(CAST(result_json AS BLOB)) <= 65536)),
  error_code TEXT,
  error_source_id TEXT,
  error_artifact_id TEXT,
  PRIMARY KEY (scope, cycle_id)
);

CREATE TABLE ingestion_cycle_steps (
  scope TEXT NOT NULL,
  cycle_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  cursor INTEGER NOT NULL CHECK (cursor >= 0),
  status TEXT NOT NULL CHECK (status IN ('running','completed','retry_wait','failed','skipped')),
  attempt INTEGER NOT NULL CHECK (attempt BETWEEN 1 AND 3),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  output_count INTEGER CHECK (output_count IS NULL OR output_count >= 0),
  error_code TEXT,
  PRIMARY KEY (scope, cycle_id, phase, cursor),
  FOREIGN KEY (scope, cycle_id) REFERENCES ingestion_cycles(scope, cycle_id) ON DELETE CASCADE
);
```

Add indexes for `(scope, cadence_key, state, updated_at DESC)` and `(scope, state, expires_at)`.

- [ ] **Step 5: Verify shared contracts and migration**

Run:

```bash
npx vitest run src/ingestion/cadence.test.ts workers/_shared/checkpointed-ingestion.test.ts
npm run lint
git diff --check
```

Expected: all pass. Update `docs/catalog-deployment.md` with table ownership and the valid-versus-fresh distinction.

- [ ] **Step 6: Commit**

```bash
git add src/ingestion workers/_shared migrations/0010_ingestion_cycles.sql docs/catalog-deployment.md
git commit -m "feat: define checkpointed ingestion contracts"
```

---

### Task 2: Daily checkpointed catalog coordinator

**Files:**
- Create: `workers/catalog-ingest/src/catalog-cycle.ts`
- Create: `workers/catalog-ingest/src/catalog-cycle.test.ts`
- Create: `workers/catalog-ingest/src/coordinator.ts`
- Create: `workers/catalog-ingest/src/coordinator.test.ts`
- Create: `workers/catalog-ingest/worker-configuration.d.ts` (generated)
- Modify: `workers/catalog-ingest/src/index.ts`
- Modify: `workers/catalog-ingest/src/index.test.ts`
- Modify: `workers/catalog-ingest/wrangler.toml`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: Task 1 cadence/cycle/retry types, existing OpenRouter/OpenCode parsers, manual manifests, `publishCatalogApiCache`, D1, and R2.
- Produces:
  - `CatalogCycleManifest`, `CatalogCycleStep`, and `runCatalogCycleStep(input)`.
  - exported `CatalogIngestCoordinator extends DurableObject<CatalogIngestEnv>` with RPC `start(input): Promise<StartCycleResult>` and `status(): Promise<IngestionCycle>`.
  - generated `CatalogIngestEnv` containing `CATALOG_DB`, `SOURCE_SNAPSHOTS`, `INGEST_COORDINATOR`, and `AUTOMATED_SOURCE_IDS`.

- [ ] **Step 1: Write failing source-step tests**

Model one complete daily cycle with fake D1/R2/fetch bindings. Assert the ordered phases:

```ts
expect(steps).toEqual([
  'acquire',
  'retrieve-openrouter',
  'retrieve-opencode-models',
  'retrieve-opencode-pricing',
  'prepare-manual',
  'stage',
  'validate',
  'publish',
  'receipt',
]);
```

Assert one retrieval request per step, OpenCode models before pricing, conditional validators, exact projected R2 bytes, no active pointer update before `publish`, unchanged-content checked freshness, and duplicate-step no-op behavior.

- [ ] **Step 2: Verify RED**

```bash
npx vitest run workers/catalog-ingest/src/catalog-cycle.test.ts
```

Expected: FAIL because `catalog-cycle.ts` is missing.

- [ ] **Step 3: Extract preparation from immediate publication**

Refactor `workers/catalog-ingest/src/index.ts` without changing parser behavior:

```ts
export interface PreparedCatalogSource {
  readonly parsed: ParsedSource;
  readonly projectedBytes: Uint8Array;
  readonly originalContentHash: string | null;
  readonly etag: string | null;
  readonly lastModified: string | null;
}

export async function prepareOpenRouterSource(...): Promise<PreparedCatalogSource>;
export async function prepareOpenCodeModels(...): Promise<PreparedOpenCodeModels>;
export async function prepareOpenCodePricing(...): Promise<PreparedOpenCodePricing>;
export function combineOpenCodeSource(models, pricing, observedAt): PreparedCatalogSource;
```

Keep legacy `refreshSource` tests passing during refactor, but route normal scheduling through the coordinator only after Task 2 is green.

- [ ] **Step 4: Implement the catalog state machine**

`runCatalogCycleStep` accepts one persisted cycle and returns exactly one result:

```ts
export type CatalogCycleStepResult =
  | { kind: 'advanced'; cycle: IngestionCycle; alarmAt: number; outputCount: number }
  | { kind: 'retry'; cycle: IngestionCycle; alarmAt: number; errorCode: string }
  | { kind: 'terminal'; cycle: IngestionCycle; status: 'published' | 'unchanged' | 'failed' | 'expired' };
```

Each retrieval step writes attempt-owned R2 artifacts below
`catalog-candidates/{cycleId}/...`. The stage step creates one complete inactive
catalog/cache candidate from all three automated inputs plus the rotating manual
manifest. The publish step performs one guarded D1 pointer transaction.

- [ ] **Step 5: Write failing coordinator alarm tests**

Test:

- same cadence key starts once;
- a second Cron while running returns `already-running`;
- alarm resumes the persisted cursor after coordinator reconstruction;
- 429 stores full reset and does not call fetch twice;
- three attempts fail the cycle;
- 12-hour expiration wins over retry;
- an uncaught alarm delivery replay sees the completion marker;
- a terminal cycle leaves no alarm;
- structured logs omit payloads and response bodies.

- [ ] **Step 6: Implement and configure the Durable Object**

Use the current Cloudflare class model:

```ts
import { DurableObject } from 'cloudflare:workers';

export class CatalogIngestCoordinator extends DurableObject<CatalogIngestEnv> {
  async start(input: { scheduledTime: number; force?: boolean }): Promise<StartCycleResult> { /* ... */ }
  async status(): Promise<IngestionCycle | null> { /* ... */ }
  async alarm(): Promise<void> { /* catch, persist, and explicitly reschedule */ }
}
```

Update `wrangler.toml`:

```toml
compatibility_date = "2026-08-12"

[[durable_objects.bindings]]
name = "INGEST_COORDINATOR"
class_name = "CatalogIngestCoordinator"

[exports.CatalogIngestCoordinator]
type = "durable-object"
storage = "sqlite"

[triggers]
crons = ["20 0 * * *"]
```

The scheduled handler must only execute:

```ts
const coordinator = env.INGEST_COORDINATOR.getByName('daily-catalog');
await coordinator.start({ scheduledTime: controller.scheduledTime ?? Date.now() });
```

The public fetch handler continues to return 405.

- [ ] **Step 7: Generate binding types and add CI scripts**

Pin Wrangler as a development dependency so type generation, dry runs, and
production deploys do not depend on whichever CLI version `npx` happens to
download:

```bash
npm install --save-dev wrangler@4.121.0
```

Then run:

```bash
npx wrangler types workers/catalog-ingest/worker-configuration.d.ts \
  --config workers/catalog-ingest/wrangler.toml \
  --env-interface CatalogIngestEnv
```

Add scripts:

```json
"types:workers": "wrangler types workers/catalog-ingest/worker-configuration.d.ts --config workers/catalog-ingest/wrangler.toml --env-interface CatalogIngestEnv && wrangler types workers/benchmark-ingest/worker-configuration.d.ts --config workers/benchmark-ingest/wrangler.toml --env-interface BenchmarkIngestEnv",
"types:workers:check": "wrangler types workers/catalog-ingest/worker-configuration.d.ts --config workers/catalog-ingest/wrangler.toml --env-interface CatalogIngestEnv --check && wrangler types workers/benchmark-ingest/worker-configuration.d.ts --config workers/benchmark-ingest/wrangler.toml --env-interface BenchmarkIngestEnv --check"
```

Task 2 may add the second command before its target exists only if the check script is introduced in Task 3; do not leave a knowingly broken package script between commits.

- [ ] **Step 8: Verify and commit**

```bash
npx vitest run workers/catalog-ingest/src/index.test.ts workers/catalog-ingest/src/catalog-cycle.test.ts workers/catalog-ingest/src/coordinator.test.ts
npx wrangler deploy --dry-run --config workers/catalog-ingest/wrangler.toml
npm run lint
git diff --check
git add workers/catalog-ingest package.json package-lock.json
git commit -m "feat: checkpoint daily catalog ingestion"
```

---

### Task 3: Weekly benchmark retrieval coordinator

**Files:**
- Create: `workers/benchmark-ingest/src/candidate-storage.ts`
- Create: `workers/benchmark-ingest/src/candidate-storage.test.ts`
- Create: `workers/benchmark-ingest/src/source-steps.ts`
- Create: `workers/benchmark-ingest/src/source-steps.test.ts`
- Create: `workers/benchmark-ingest/src/coordinator.ts`
- Create: `workers/benchmark-ingest/src/coordinator.test.ts`
- Create: `workers/benchmark-ingest/worker-configuration.d.ts` (generated)
- Modify: `workers/benchmark-ingest/src/index.ts`
- Modify: `workers/benchmark-ingest/src/index.test.ts`
- Modify: `workers/benchmark-ingest/wrangler.toml`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1 shared contracts, exact BenchLM/LiteLLM/LMArena parsing and provenance functions, current active catalog/source readers, D1/R2.
- Produces:
  - `BenchmarkCandidateManifestV1` and strict parser `parseBenchmarkCandidateManifest`.
  - `retrieveBenchLmArtifactStep`, `assembleBenchLmStep`, `retrieveLiteLlmStep`, `retrieveLmArenaRevisionStep`, `retrieveLmArenaPageStep`, and `normalizeSourceStep`.
  - exported `BenchmarkIngestCoordinator extends DurableObject<BenchmarkIngestEnv>` with `start` and `status` RPC methods.

- [ ] **Step 1: Write failing candidate manifest tests**

Require this minimum shape and reject unknown schema/version, missing six-artifact BenchLM set, mixed LMArena revisions, duplicate artifact IDs, unsafe R2 keys, and unbounded counts:

```ts
export interface BenchmarkCandidateManifestV1 {
  readonly schemaVersion: 1;
  readonly cycleId: string;
  readonly frozenCatalogRevision: string;
  readonly previousBenchmarkRevision: string | null;
  readonly checkedAt: string;
  readonly benchLm: readonly CandidateArtifact[];
  readonly liteLlm: CandidateArtifact | null;
  readonly lmArenaRevision: string | null;
  readonly lmArena: readonly CandidateArtifact[];
  readonly normalizedPartitions: readonly CandidatePartition[];
  readonly derivedPartitions: readonly CandidatePartition[];
}
```

- [ ] **Step 2: Verify RED**

```bash
npx vitest run workers/benchmark-ingest/src/candidate-storage.test.ts
```

- [ ] **Step 3: Implement attempt-owned R2 manifest storage**

Use keys below `benchmark-candidates/{cycleId}/`. Writes are content-addressed,
bounded, exact-byte hashed, and idempotent. A manifest update uses one canonical
JSON payload and records its SHA-256 in Durable Object state. Reading rehashes
and runtime-validates every manifest before use.

- [ ] **Step 4: Write failing retrieval-step tests**

Cover:

- six ordered BenchLM artifacts, one request per alarm, conditional 304 reuse;
- mixed BenchLM bundle rejected before normalize;
- LiteLLM one request and exact projection;
- one LMArena revision lookup followed by one dataset-viewer page per alarm;
- pagination cursor/declared-total checks and 200-page hard bound;
- one pinned parquet subset resolver/download fallback per alarm;
- one LMArena upstream revision for all subsets;
- 429/resets persisted with no nested retry;
- R2 candidate outputs never alter active source records.

- [ ] **Step 5: Extract single-artifact functions from the monolith**

Move or export bounded logic from `index.ts` behind these signatures:

```ts
export async function retrieveBenchLmArtifactStep(input: SourceStepInput & { artifact: BenchLmArtifact }): Promise<CandidateArtifact>;
export async function assembleBenchLmStep(input: AssembleBenchLmInput): Promise<CandidatePartition>;
export async function retrieveLiteLlmStep(input: SourceStepInput): Promise<CandidateArtifact>;
export async function retrieveLmArenaRevisionStep(input: SourceStepInput): Promise<string>;
export async function retrieveLmArenaPageStep(input: LmArenaPageStepInput): Promise<LmArenaPageStepOutput>;
export async function normalizeSourceStep(input: NormalizeSourceStepInput): Promise<CandidatePartition>;
```

The old `refreshBenchmarkRevision` may remain as a test/recovery compatibility
wrapper until Task 5, but the production scheduled handler must stop calling it.

- [ ] **Step 6: Implement weekly coordinator retrieval phases**

The coordinator phase order through retrieval is:

```ts
type BenchmarkRetrievalPhase =
  | 'acquire'
  | 'retrieve-benchlm'
  | 'assemble-benchlm'
  | 'retrieve-litellm'
  | 'retrieve-lmarena-revision'
  | 'retrieve-lmarena-pages'
  | 'normalize-sources';
```

Freeze the active catalog and benchmark revisions in `acquire`. A cycle starts
only if its ISO-week cadence key has no published receipt. The coordinator
catches expected errors, persists retry/failure state, and explicitly sets the
next alarm so Cloudflare's six automatic alarm retries are not the business
retry policy.

- [ ] **Step 7: Configure and generate Worker types**

Update benchmark `wrangler.toml` with `compatibility_date = "2026-08-12"`,
`INGEST_COORDINATOR`, `[exports.BenchmarkIngestCoordinator]` SQLite storage,
and:

```toml
[triggers]
crons = ["15 2 * * SUN"]
```

Generate:

```bash
npx wrangler types workers/benchmark-ingest/worker-configuration.d.ts \
  --config workers/benchmark-ingest/wrangler.toml \
  --env-interface BenchmarkIngestEnv
```

Complete the `types:workers` and `types:workers:check` scripts from Task 2.

- [ ] **Step 8: Verify and commit**

```bash
npx vitest run workers/benchmark-ingest/src/candidate-storage.test.ts workers/benchmark-ingest/src/source-steps.test.ts workers/benchmark-ingest/src/coordinator.test.ts workers/benchmark-ingest/src/benchlm.test.ts workers/benchmark-ingest/src/litellm.test.ts workers/benchmark-ingest/src/lmarena.test.ts
npx wrangler deploy --dry-run --config workers/benchmark-ingest/wrangler.toml
npm run types:workers:check
npm run lint
git diff --check
git add workers/benchmark-ingest package.json
git commit -m "feat: checkpoint weekly benchmark retrieval"
```

---

### Task 4: Partitioned benchmark derivation and inactive fact staging

**Files:**
- Create: `workers/benchmark-ingest/src/candidate-derivation.ts`
- Create: `workers/benchmark-ingest/src/candidate-derivation.test.ts`
- Create: `workers/benchmark-ingest/src/partitioned-publication.ts`
- Create: `workers/benchmark-ingest/src/partitioned-publication.test.ts`
- Modify: `workers/benchmark-ingest/src/index.ts`
- Modify: `workers/benchmark-ingest/src/coordinator.ts`
- Modify: `workers/benchmark-ingest/src/coordinator.test.ts`

**Interfaces:**
- Consumes: complete normalized source partitions from Task 3 and current revision/content-hash/statement helpers.
- Produces:
  - `deriveCandidatePartitions(manifest, env)`.
  - `stageBenchmarkFactPartition(input)` and `validateStagedBenchmarkFacts(input)`.
  - coordinator phases `derive`, `stage-facts`, and `validate-facts`.

- [ ] **Step 1: Write failing derivation parity tests**

Using existing production-sized fixtures, compare the checkpointed candidate to
the current monolithic result:

```ts
expect(checkpointed.revision).toBe(monolithic.revision);
expect(checkpointed.contentHash).toBe(monolithic.contentHash);
expect(checkpointed.snapshot.models).toEqual(monolithic.snapshot.models);
expect(checkpointed.snapshot.metrics).toEqual(monolithic.snapshot.metrics);
expect(checkpointed.snapshot.priceChecks).toEqual(monolithic.snapshot.priceChecks);
expect(checkpointed.comparisonPairs).toEqual(monolithic.comparisonPairs);
```

Also assert deterministic UTF-8 ordering and identical GPT-5.6 Sol coding
`77.95` plus price-performance inputs.

- [ ] **Step 2: Verify RED**

```bash
npx vitest run workers/benchmark-ingest/src/candidate-derivation.test.ts
```

- [ ] **Step 3: Implement bounded derived partitions**

Write canonical R2 partitions for `sources`, `models`, `metrics`, `prices`, and
`comparisons`. Use fixed maximum rows per partition and include:

```ts
interface DerivedPartitionReceipt {
  readonly kind: 'sources' | 'models' | 'metrics' | 'prices' | 'comparisons';
  readonly index: number;
  readonly rowCount: number;
  readonly key: string;
  readonly contentHash: `sha256:${string}`;
}
```

The final candidate metadata contains the combined content hash and revision ID.
Do not keep all 4,420 profiles or materialized cache bodies in this phase.

- [ ] **Step 4: Write failing partition staging tests**

Assert one partition per alarm, duplicate completion-marker no-op, ownership
rejection for another cycle, no published rows/pointer before validation,
bounded statement/serialized RPC size, cleanup restricted to the current
attempt, and exact fact counts after all partitions.

- [ ] **Step 5: Implement inactive fact staging**

Split the existing `buildPublicationStatementPlan` responsibilities:

```ts
export async function stageBenchmarkFactPartition(input: {
  db: D1Database;
  cycleId: string;
  revision: string;
  partition: DerivedPartitionReceipt;
}): Promise<{ statements: number; rows: number }>;

export async function validateStagedBenchmarkFacts(input: {
  db: D1Database;
  cycleId: string;
  revision: string;
  manifest: BenchmarkCandidateManifestV1;
}): Promise<ValidatedFactCounts>;
```

Create the pending benchmark revision once. Every staged statement includes or
is guarded by `publication_attempt_id = cycleId`. Do not supersede the active
revision in Task 4.

- [ ] **Step 6: Wire coordinator phases and recovery tests**

Add `derive`, `stage-facts`, and `validate-facts`. Reconstruct the coordinator
between every synthetic alarm in tests. Force failure at every partition and
prove the active revision/cache pointers remain unchanged.

- [ ] **Step 7: Verify and commit**

```bash
npx vitest run workers/benchmark-ingest/src/candidate-derivation.test.ts workers/benchmark-ingest/src/partitioned-publication.test.ts workers/benchmark-ingest/src/coordinator.test.ts workers/benchmark-ingest/src/index.test.ts
npm run lint
git diff --check
git add workers/benchmark-ingest/src
git commit -m "feat: stage benchmark candidates in partitions"
```

---

### Task 5: Bounded model profiles, API caches, validation, and atomic publication

**Files:**
- Create: `workers/benchmark-ingest/src/profile-partitions.ts`
- Create: `workers/benchmark-ingest/src/profile-partitions.test.ts`
- Create: `workers/benchmark-ingest/src/cache-partitions.ts`
- Create: `workers/benchmark-ingest/src/cache-partitions.test.ts`
- Modify: `workers/benchmark-ingest/src/model-directory-publication.ts`
- Modify: `workers/benchmark-ingest/src/model-directory-publication.test.ts`
- Modify: `workers/benchmark-ingest/src/index.ts`
- Modify: `workers/benchmark-ingest/src/index.test.ts`
- Modify: `workers/benchmark-ingest/src/coordinator.ts`
- Modify: `workers/benchmark-ingest/src/coordinator.test.ts`

**Interfaces:**
- Consumes: validated staged facts and derived R2 partitions from Task 4.
- Produces:
  - `prepareModelProfilePartition(input)` and `stageModelProfilePartition(input)`, max 100 models.
  - `listRequiredBenchmarkCachePartitions(snapshot)` and `stageBenchmarkCachePartition(input)`.
  - `validateCompleteBenchmarkCandidate(input)`.
  - `publishBenchmarkCandidate(input)` that performs the sole public pointer transaction.

- [ ] **Step 1: Write failing profile-partition tests**

Test 4,420 profiles in deterministic 100-model windows. Assert no window has
more than 100 models, hashes match exact UTF-8 profile JSON, ranks are inserted
once for the frozen week/revision, absent models are archived only at final
commit, duplicate windows are idempotent, and all 4,420 current models retain a
profile after publication.

- [ ] **Step 2: Implement profile preparation/staging slices**

Refactor the current all-at-once candidate API into:

```ts
export async function prepareModelProfilePartition(
  snapshot: ActiveBenchmarkSnapshot,
  publicLeaderboard: BenchLmPublicLeaderboard,
  updatedAt: string,
  offset: number,
  limit = 100,
): Promise<ModelProfilePartition>;
```

The returned partition includes membership, profiles, directory rows, total
model count, and only the rank rows whose model keys fall in the slice. The
coordinator writes the exact partition to R2 before staging it to D1.

- [ ] **Step 3: Write failing API-cache partition tests**

Enumerate every required cache key/variant, including summary, all leaderboard
profiles/pagination projections, model directory/profile-dependent projections,
and `price-performance:complete:v1`. Assert:

- one cache key plus both variants per step;
- strict runtime validation before write;
- contiguous bounded chunks and one ETag per variant;
- active pointer remains unchanged while any key is incomplete;
- failed archived materialization cannot replace the complete current stale set;
- candidate cache revision prefix matches the pending benchmark revision.

- [ ] **Step 4: Implement cache partition materialization**

Extract the current all-response loop behind:

```ts
export interface BenchmarkCachePartition {
  readonly cacheKey: string;
  readonly fresh: MaterializedApiResponseBody;
  readonly stale: MaterializedApiResponseBody;
}

export function listRequiredBenchmarkCachePartitions(snapshot: ActiveBenchmarkSnapshot): readonly string[];
export function materializeBenchmarkCachePartition(snapshot: ActiveBenchmarkSnapshot, cacheKey: string): BenchmarkCachePartition;
export async function stageBenchmarkCachePartition(input: StageCachePartitionInput): Promise<void>;
```

Reuse `splitApiResponseBody`; do not change public response contracts or ETags.

- [ ] **Step 5: Write failing final-validation/publication tests**

Reject candidates with any missing source, fact partition, profile, weekly rank,
cache key/variant/chunk, mismatched manifest hash, foreign attempt row, or stale
frozen catalog revision. Assert the final success batch performs this order:

1. validate attempt ownership and frozen catalog input;
2. mark prior benchmark revision superseded and candidate published;
3. apply directory mutable status/last-seen changes and weekly header/ranks;
4. move `benchmark_publication_state`;
5. move matching `api_response_publication_state`;
6. record source refresh success and completed cycle receipt.

Force each statement to fail and assert the transaction leaves both pointers on
the prior revision.

- [ ] **Step 6: Implement final validation and atomic publish**

Use:

```ts
export async function validateCompleteBenchmarkCandidate(input: CandidateValidationInput): Promise<CandidateValidationReceipt>;
export async function publishBenchmarkCandidate(input: PublishCandidateInput): Promise<'published' | 'unchanged'>;
```

For unchanged content, keep the content revision but create and atomically point
to a new checked-at cache revision. The completion receipt records counts,
checked/published timestamps, final revision, cache revision, and manifest hash.

- [ ] **Step 7: Complete coordinator phases and retire monolithic scheduling**

Add `stage-profiles`, `stage-cache`, `validate-candidate`, `publish`, `receipt`,
and `cleanup`. Normal production scheduling must not call
`refreshBenchmarkRevision`. Keep that function only as a local recovery/parity
tool, clearly marked and excluded from the default export.

- [ ] **Step 8: Verify and commit**

```bash
npx vitest run workers/benchmark-ingest/src/profile-partitions.test.ts workers/benchmark-ingest/src/cache-partitions.test.ts workers/benchmark-ingest/src/model-directory-publication.test.ts workers/benchmark-ingest/src/coordinator.test.ts workers/benchmark-ingest/src/index.test.ts
npm run lint
git diff --check
git add workers/benchmark-ingest/src
git commit -m "feat: atomically publish checkpointed benchmarks"
```

---

### Task 6: Cadence-aware benchmark freshness and last-good product semantics

**Files:**
- Modify: `functions/_shared/benchmark-db.ts`
- Modify: `functions/_shared/benchmark-db.test.ts` or nearest existing benchmark API tests
- Modify: `functions/_shared/benchmark-response-fallback.ts`
- Modify: `functions/_shared/benchmark-response-fallback.test.ts`
- Modify: `functions/_shared/benchmark-leaderboard-projection.ts`
- Modify: `functions/_shared/benchmark-leaderboard-projection.test.ts`
- Modify: `functions/models/[slug].ts`
- Modify: `functions/models/[slug].test.ts`
- Modify: `functions/api/benchmarks/models/[slug].ts`
- Modify: `functions/api/benchmarks/models/[slug].test.ts`
- Modify: `workers/benchmark-ingest/src/index.ts`
- Modify: `workers/benchmark-ingest/src/index.test.ts`
- Modify: `src/pages/price-performance-page.test.tsx`
- Modify: `docs/tokenbench-deployment.md`

**Interfaces:**
- Consumes: Task 1 `BENCHMARK_FRESHNESS_WINDOW_MS` and the unchanged benchmark envelopes.
- Produces: one shared 8-day benchmark freshness boundary and consistent stale message across every benchmark-derived surface.

- [ ] **Step 1: Replace boundary tests before constants**

For summary, leaderboard, model API, SSR model profile, materialized cache,
fallback, and price-performance, assert:

```ts
vi.setSystemTime(Date.parse(CHECKED_AT) + 8 * 24 * 60 * 60 * 1_000);
expect(result.freshness.status).toBe('fresh');
vi.setSystemTime(Date.parse(CHECKED_AT) + 8 * 24 * 60 * 60 * 1_000 + 1);
expect(result.freshness.status).toBe('stale');
```

Assert stale copy says weekly published evidence exceeded its 8-day freshness
window, while an in-progress/failed cycle still serves facts and attribution.

- [ ] **Step 2: Verify RED**

```bash
npx vitest run functions/_shared/benchmark-response-fallback.test.ts functions/_shared/benchmark-leaderboard-projection.test.ts functions/api/benchmarks.test.ts functions/api/benchmarks/models/'[slug]'.test.ts functions/models/'[slug]'.test.ts workers/benchmark-ingest/src/index.test.ts src/pages/price-performance-page.test.tsx
```

Expected: existing 36-hour assertions fail.

- [ ] **Step 3: Use the shared policy everywhere**

Delete all local benchmark `36 * 60 * 60 * 1000` constants and import
`BENCHMARK_FRESHNESS_WINDOW_MS`. Do not alter catalog cache freshness. Centralize
the user-facing message:

```ts
export const BENCHMARK_STALE_MESSAGE =
  'Published weekly benchmark evidence has not refreshed within 8 days.';
```

Do not expose coordinator internals in public API envelopes.

- [ ] **Step 4: Verify all benchmark product surfaces**

```bash
npx vitest run functions workers/benchmark-ingest/src src/pages/price-performance-page.test.tsx
npm run lint
npm run build
git diff --check
```

- [ ] **Step 5: Commit**

```bash
git add src/ingestion functions workers/benchmark-ingest/src docs/tokenbench-deployment.md
git commit -m "feat: align benchmark freshness with weekly cadence"
```

---

### Task 7: Full-cycle harness, operational runbook, and independent review

**Files:**
- Create: `workers/catalog-ingest/src/full-cycle.test.ts`
- Create: `workers/benchmark-ingest/src/full-cycle.test.ts`
- Create: `scripts/inspect-ingestion-cycle.ts`
- Create: `scripts/inspect-ingestion-cycle.test.ts`
- Modify: `package.json`
- Modify: `docs/catalog-deployment.md`
- Modify: `docs/tokenbench-deployment.md`
- Modify: `browser-tests/local-preview-benchmark-api-browser.ts`

**Interfaces:**
- Consumes: both complete coordinators and D1 receipt tables.
- Produces: reproducible production-sized cycle simulations and a read-only operator status command.

- [ ] **Step 1: Write full-cycle restart/failure harness tests**

Drive one coordinator alarm at a time against fake persistent Durable Object
storage, D1, R2, and deterministic upstream responses. Recreate the coordinator
between every alarm. The final assertions must include:

```ts
expect(publication.pointerGapCount).toBe(0);
expect(publication.foreignAttemptRows).toBe(0);
expect(publication.invalidCacheGroups).toBe(0);
expect(publication.modelCount).toBe(4420);
expect(publication.profileCount).toBe(4420);
expect(publication.pricePerformancePointCount).toBe(30);
```

Repeat with a failure/retry at every phase and assert the previous active
revision remains readable.

- [ ] **Step 2: Add read-only receipt inspection**

`scripts/inspect-ingestion-cycle.ts` accepts `--scope catalog|benchmarks` and
prints bounded JSON:

```json
{
  "scope": "benchmarks",
  "cycleId": "...",
  "cadenceKey": "2026-W33",
  "state": "running",
  "phase": "stage-profiles",
  "cursor": 12,
  "startedAt": "...",
  "updatedAt": "...",
  "activeRevision": "benchmark_...",
  "lastCompletedRevision": "benchmark_..."
}
```

The script reads D1 only, never Durable Object storage, and returns nonzero for
missing/corrupt receipts.

- [ ] **Step 3: Add package commands and runbooks**

Add:

```json
"test:ingestion:cycles": "vitest run workers/catalog-ingest/src/full-cycle.test.ts workers/benchmark-ingest/src/full-cycle.test.ts",
"inspect:ingestion": "tsx scripts/inspect-ingestion-cycle.ts"
```

Document migration order, local simulation, generated-type check, temporary
one-minute cutover trigger, receipt polling, schedule restoration, failure
recovery, no-delete rollback, and expected valid-data behavior.

- [ ] **Step 4: Run the complete verification gate**

```bash
npm test
npm run test:ingestion:cycles
npm run types:workers:check
npm run lint
npm run build
npm run test:browser:local-preview
npm run test:browser
npx wrangler deploy --dry-run --config workers/catalog-ingest/wrangler.toml
npx wrangler deploy --dry-run --config workers/benchmark-ingest/wrangler.toml
git diff --check
git status --short
```

Expected: zero failures, both Worker bundles compile, and only intentional files
are modified.

- [ ] **Step 5: Obtain independent Orca review and fix findings**

Dispatch a Luna Max reviewer against the exact integrated commit. Require review
of Free-tier dispatch cost, DO alarm semantics, at-least-once idempotency,
provider reset handling, source revision freezing, D1/R2 ownership, atomic
pointers, profile/cache completeness, freshness copy, privacy/logging, config,
generated bindings, and rollout/rollback. Address every blocking/high/medium
finding with tests before proceeding.

- [ ] **Step 6: Commit the release candidate**

```bash
git add workers scripts src functions browser-tests package.json docs migrations
git commit -m "test: verify free tier ingestion release"
git push origin main
```

---

### Task 8: Production migration, immediate cycles, canonical verification, and receipt

**Files:**
- Modify: `docs/tokenbench-deployment.md`
- Modify: `docs/catalog-deployment.md`
- Append outside repository through Obsidian CLI: `01 Logs/Agent/2026-08-12.md`

**Interfaces:**
- Consumes: verified release candidate and existing production D1/R2/Worker resources.
- Produces: deployed daily/weekly coordinators, observed first-cycle timestamps, restored schedules, canonical production evidence, and pushed release receipt.

- [ ] **Step 1: Capture pre-deploy last-good evidence**

Record:

- current catalog, benchmark, and cache pointers;
- 4,420 directory/profile counts and weekly ranks;
- price-performance point count and GPT-5.6 Sol coding `77.95`;
- current Worker versions/schedules;
- current API ETags and canonical statuses.

Back up migration-target tables before writes. Do not delete active rows.

- [ ] **Step 2: Apply D1 migration 0010 and verify schema**

Use the authorized production account and:

```bash
npx wrangler d1 migrations apply ai-plan-catalog --remote --config workers/benchmark-ingest/wrangler.toml
```

Verify migration history contains `0010_ingestion_cycles.sql` exactly once and
both receipt tables/indexes exist.

- [ ] **Step 3: Deploy catalog Worker and start the immediate daily cycle**

Deploy the exact release commit. Record the Worker version. Temporarily apply
`* * * * *`; poll `ingestion_cycles` until the catalog receipt is `running`,
then restore `20 0 * * *` immediately. Verify the deployed Worker reports only
the restored trigger.

```bash
npx wrangler deploy --config workers/catalog-ingest/wrangler.toml
npx wrangler triggers deploy --config workers/catalog-ingest/wrangler.toml --name tokenbench-catalog-ingest --triggers '* * * * *'
# Poll the D1 receipt until the catalog cycle is running.
npx wrangler triggers deploy --config workers/catalog-ingest/wrangler.toml --name tokenbench-catalog-ingest --triggers '20 0 * * *'
```

- [ ] **Step 4: Monitor and verify the catalog cycle**

Poll no faster than once per minute. Require terminal `published` or
`unchanged`, zero 1102 outcomes, exact source/cache validation, and canonical
calculator/catalog API HTTP 200 plus ETag 304. If it fails, retain last-good,
record failure, and do not start benchmark publication against an unverified
catalog input.

- [ ] **Step 5: Deploy benchmark Worker and start the immediate weekly cycle**

Deploy the exact same release commit. Record the Worker version. Temporarily
apply `* * * * *`; poll until benchmark state is `running`, then restore
`15 2 * * SUN` immediately. The cadence/active guard makes duplicate minute
ticks no-ops.

```bash
npx wrangler deploy --config workers/benchmark-ingest/wrangler.toml
npx wrangler triggers deploy --config workers/benchmark-ingest/wrangler.toml --name tokenbench-benchmark-ingest --triggers '* * * * *'
# Poll the D1 receipt until the benchmark cycle is running.
npx wrangler triggers deploy --config workers/benchmark-ingest/wrangler.toml --name tokenbench-benchmark-ingest --triggers '15 2 * * SUN'
```

- [ ] **Step 6: Monitor until valid new benchmark publication**

Poll the D1 receipt once per minute and Worker invocation outcomes. Record each
phase transition, start/completion timestamps, retry waits, and final revision.
Require:

- terminal `published` or `unchanged` before the 24-hour expiry;
- zero `exceededCpu`/1102 outcomes;
- six BenchLM artifacts, one LiteLLM artifact, and one frozen LMArena revision;
- complete fact/profile/rank/cache counts;
- benchmark and cache pointers describe the same revision;
- previous revision remained public for the entire cycle.

If failed, report that the retained last-good revision remains valid; do not
claim production is unavailable.

- [ ] **Step 7: Verify canonical production surfaces**

Check API HTTP 200/ETag 304 and responsive SSR/browser behavior for Home,
Subscribe vs API, Models, one model profile, Compare, Coding leaderboard, and
Price vs Performance. Require one H1, canonical/robots/OG/Twitter/JSON-LD,
source links, GPT-5.6 Sol `77.95`/public `78.0`, no overflow at 390/1280, and no
console/request errors.

- [ ] **Step 8: Record, commit, and push the production receipt**

Document exact release SHA, migration result, Worker versions, restored Cron
expressions, cycle IDs, observed start/completion/duration, final revisions,
counts, invocation outcomes, canonical checks, and rollback targets.

```bash
git add docs/tokenbench-deployment.md docs/catalog-deployment.md
git commit -m "docs: record free tier ingestion production receipt"
git push origin main
```

Append the required harness log with Obsidian CLI and verify the repository is
clean and `HEAD == origin/main`.

---

## Dependency and Orca dispatch order

1. Task 1 is the shared handshake and lands first.
2. After Task 1, Task 2 (catalog) and Task 3 (benchmark retrieval) may run in parallel in isolated Orca worktrees.
3. Task 4 depends on Task 3.
4. Task 5 depends on Tasks 3 and 4.
5. Task 6 depends on Task 1 and may run in parallel with Tasks 4–5 if it does not edit overlapping Worker lines; otherwise land it after Task 5.
6. Task 7 integrates every stream and owns independent review.
7. Task 8 runs only from a clean, pushed, reviewed `main` and owns all production state changes.

## Production-data expectation

The canonical site already has valid last-good benchmark data from revision
`benchmark_178962c49298646d1c7ff155a87f2074`. That revision remains public while
this plan is implemented and during the first checkpointed cycle. The first new
cycle is started immediately after deployment; its design target is completion
within approximately two hours, but the production report communicates only
the observed completion timestamp. Failure preserves and labels the retained
revision rather than showing an empty or unavailable decision surface.
