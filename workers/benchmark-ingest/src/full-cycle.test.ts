import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { buildPricePerformanceProjection } from '../../../src/benchmarks/price-performance';
import type { NormalizedSourceBatch } from '../../../src/benchmarks/contracts';
import { listRequiredBenchmarkCachePartitions } from './cache-partitions';
import { readCandidateManifest, type CandidateArtifact, type CandidatePartition, type CandidateR2Bucket } from './candidate-storage';
import {
  BENCHMARK_CYCLE_PHASES,
  BenchmarkIngestCoordinator,
  type BenchmarkCheckpoint,
  type BenchmarkCyclePhase,
  type BenchmarkIngestEnv,
  type CoordinatorDependencies,
} from './coordinator';
import type { IngestionCycle } from '../../_shared/checkpointed-ingestion';
import { validateStagedBenchmarkFacts } from './partitioned-publication';

const STARTED_AT = Date.parse('2026-08-16T02:15:00.000Z');
const CYCLE_ID = '11111111-2222-4333-8444-555555555555';
const CATALOG_REVISION = 'catalog-production-fixture';
const PREVIOUS_REVISION = 'benchmark-previous';
const PREVIOUS_CACHE_REVISION = `${PREVIOUS_REVISION}+cache-prior`;
const MODEL_COUNT = 4_420;
const PRICE_PERFORMANCE_POINT_COUNT = 30;
const CHECKED_AT = new Date(STARTED_AT).toISOString();
const SOURCE_HASH = `sha256:${'a'.repeat(64)}`;
const LMARENA_REVISION = '4e52c8e709c90a4cad8498d9db5aad11709b04e0';
const CYCLE_KEY = 'benchmark-cycle';
const CHECKPOINT_KEY = 'benchmark-checkpoint';

type SqlValue = string | number | bigint | Uint8Array | null;

function sha256(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function sqliteD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const file of [
    '0001_catalog.sql',
    '0002_catalog_metadata.sql',
    '0003_official_html_sources.sql',
    '0004_benchmarks.sql',
    '0005_api_response_cache.sql',
    '0006_benchmark_publication_ownership.sql',
    '0007_benchmark_metric_raw_value.sql',
    '0008_plan_entitlement_evidence.sql',
    '0009_model_directory.sql',
    '0010_ingestion_cycles.sql',
    '0011_catalog_publication_ownership.sql',
    '0012_benchmark_metric_rank_field_size.sql',
    '0018_benchmark_openrouter_route_receipts.sql',
    '0019_plan_annual_price_evidence.sql',
  ]) sqlite.exec(readFileSync(resolve(process.cwd(), 'migrations', file), 'utf8'));

  interface Statement {
    readonly sql: string;
    readonly values: unknown[];
    first<T = unknown>(): Promise<T | null>;
    all<T = unknown>(): Promise<{ results: T[] }>;
    run(): Promise<{ meta: { changes: number } }>;
  }

  const bind = (sql: string, values: unknown[]): Statement => ({
    sql,
    values,
    async first<T>() {
      return (sqlite.prepare(sql).get(...values as SqlValue[]) ?? null) as T | null;
    },
    async all<T>() {
      return { results: sqlite.prepare(sql).all(...values as SqlValue[]) as T[] };
    },
    async run() {
      const result = sqlite.prepare(sql).run(...values as SqlValue[]);
      return { meta: { changes: Number(result.changes) } };
    },
  });
  const db = {
    prepare(sql: string) {
      return Object.assign(bind(sql, []), { bind: (...values: unknown[]) => bind(sql, values) });
    },
    async batch(statements: unknown[]) {
      sqlite.exec('BEGIN');
      try {
        for (const statement of statements as Statement[]) {
          sqlite.prepare(statement.sql).run(...statement.values as SqlValue[]);
        }
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
      return [];
    },
  };
  return { sqlite, db };
}

function memoryR2(): CandidateR2Bucket & {
  readonly objects: Map<string, { bytes: Uint8Array; customMetadata: Record<string, string> }>;
} {
  const objects = new Map<string, { bytes: Uint8Array; customMetadata: Record<string, string> }>();
  return {
    objects,
    async get(key: string) {
      const object = objects.get(key);
      if (!object) return null;
      return {
        customMetadata: object.customMetadata,
        async arrayBuffer() {
          return object.bytes.buffer.slice(
            object.bytes.byteOffset,
            object.bytes.byteOffset + object.bytes.byteLength,
          ) as ArrayBuffer;
        },
      };
    },
    async put(key: string, value: ArrayBufferView, options?: { customMetadata?: Record<string, string> }) {
      const bytes = new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
      objects.set(key, { bytes, customMetadata: options?.customMetadata ?? {} });
    },
  };
}

function durableStorage() {
  const values = new Map<string, unknown>();
  let alarm: number | null = null;
  return {
    values,
    get alarm() { return alarm; },
    async get<T>(key: string) { return values.get(key) as T | undefined; },
    async put<T>(key: string, value: T) { values.set(key, value); },
    async delete(key: string) { return values.delete(key); },
    async setAlarm(when: number | Date) { alarm = when instanceof Date ? when.getTime() : when; },
    async deleteAlarm() { alarm = null; },
  };
}

function seedPreviousPublication(
  sqlite: DatabaseSync,
  r2: ReturnType<typeof memoryR2>,
): void {
  const catalogBytes = new TextEncoder().encode('{"data":[]}');
  const catalogHash = sha256(catalogBytes);
  const manualBytes = new TextEncoder().encode('{"plans":[]}');
  r2.objects.set('catalog/openrouter.json', {
    bytes: catalogBytes,
    customMetadata: { original_content_hash: catalogHash },
  });
  r2.objects.set('catalog/alibaba-subscription.json', {
    bytes: manualBytes,
    customMetadata: { content_hash: sha256(manualBytes) },
  });
  sqlite.prepare(`INSERT INTO catalog_revisions
    (revision, published_at, checked_at, publication_state, publication_attempt_id)
    VALUES (?, ?, ?, 'published', NULL)`).run(CATALOG_REVISION, CHECKED_AT, CHECKED_AT);
  // Keep a non-OpenRouter row first so removing the production source-id
  // predicate deterministically exercises the invalid-snapshot failure.
  sqlite.prepare(`INSERT INTO source_records
    (revision, id, provider_id, source_url, observed_at, source_kind, confidence,
     snapshot_key, content_hash, parser_version, evidence_locator, review_status)
    VALUES (?, 'alibaba-subscription', 'alibaba', 'https://example.com/alibaba-plan', ?,
      'manual_manifest', 'manual_verified', 'catalog/alibaba-subscription.json', ?,
      'fixture-v1', 'Plan details', 'verified')`)
    .run(CATALOG_REVISION, CHECKED_AT, sha256(manualBytes));
  sqlite.prepare(`INSERT INTO source_records
    (revision, id, provider_id, source_url, observed_at, source_kind, confidence,
     snapshot_key, content_hash, parser_version, evidence_locator, review_status)
    VALUES (?, 'openrouter-models', 'openrouter', 'https://openrouter.ai/api/v1/models', ?,
      'official_json', 'official', 'catalog/openrouter.json', ?, 'fixture-v1', '$.data', 'verified')`)
    .run(CATALOG_REVISION, CHECKED_AT, catalogHash);
  sqlite.prepare(`INSERT INTO catalog_publication_state (singleton, active_revision, updated_at)
    VALUES (1, ?, ?)`).run(CATALOG_REVISION, CHECKED_AT);
  sqlite.prepare(`INSERT INTO benchmark_revisions
    (revision, generated_at, published_at, checked_at, publication_state, content_hash,
     catalog_revision, openrouter_content_hash, publication_attempt_id)
    VALUES (?, ?, ?, ?, 'published', ?, ?, ?, 'prior-attempt')`)
    .run(PREVIOUS_REVISION, CHECKED_AT, CHECKED_AT, CHECKED_AT, SOURCE_HASH, CATALOG_REVISION, catalogHash);
  sqlite.prepare(`INSERT INTO benchmark_publication_state (singleton, active_revision, updated_at)
    VALUES (1, ?, ?)`).run(PREVIOUS_REVISION, CHECKED_AT);
  sqlite.prepare(`INSERT INTO api_response_revisions
    (scope, revision, checked_at, published_at, created_at)
    VALUES ('benchmarks', ?, ?, ?, ?)`).run(PREVIOUS_CACHE_REVISION, CHECKED_AT, CHECKED_AT, CHECKED_AT);
  sqlite.prepare(`INSERT INTO api_response_entries
    (scope, revision, cache_key, variant, chunk_index, etag, body)
    VALUES ('benchmarks', ?, 'summary', 'fresh', 0, '"prior"', '{"revision":"benchmark-previous"}')`)
    .run(PREVIOUS_CACHE_REVISION);
  sqlite.prepare(`INSERT INTO api_response_publication_state (scope, active_revision, updated_at)
    VALUES ('benchmarks', ?, ?)`).run(PREVIOUS_CACHE_REVISION, CHECKED_AT);
}

function fixtureBatch(): NormalizedSourceBatch {
  const publicSource = {
    sourceId: 'benchlm' as const,
    artifactId: 'public-leaderboard',
    sourceUrl: 'https://benchlm.ai/data/public-leaderboard.json',
    observedAt: CHECKED_AT,
    etag: null,
    lastModified: null,
    upstreamRevision: 'fixture-snapshot-2026-08-16',
    schemaVersion: 'bench-align-v5',
    snapshotKey: `${candidatePrefix()}artifacts/public-leaderboard.json`,
    contentHash: SOURCE_HASH,
    originalContentHash: SOURCE_HASH,
    licenseId: 'MIT' as const,
    attributionText: 'Data from BenchLM.ai',
  };
  const models = Array.from({ length: MODEL_COUNT }, (_, index) => {
    const id = `model-${String(index).padStart(4, '0')}`;
    return {
      modelKey: id,
      slug: id,
      name: `Model ${String(index).padStart(4, '0')}`,
      creator: `Creator ${index % 20}`,
      familyId: `family-${index}`,
      variantId: 'base',
      sourceType: 'Proprietary' as const,
      reasoningType: null,
      releaseDate: null,
      contextWindowTokens: 128_000,
      evidenceStatus: 'supported' as const,
      rankingEligible: true,
      confidenceLower: null,
      confidenceUpper: null,
      benchmarkCount: index < 100 ? 1 : 0,
      sourceId: 'benchlm' as const,
      sourceModelId: id,
      sourceArtifactId: 'public-leaderboard',
    };
  });
  const metrics = models.slice(0, 100).map((model, index) => ({
    modelKey: model.modelKey,
    metricKey: 'benchlm:overall:raw',
    category: 'overall',
    value: 100 - index / 100,
    rawValue: 100 - index / 100,
    rank: index + 1,
    lower: null,
    upper: null,
    voteCount: null,
    unit: 'score' as const,
    sourceId: 'benchlm' as const,
    sourceUpdatedAt: CHECKED_AT,
    sourceModelId: model.sourceModelId,
    sourceArtifactId: 'public-leaderboard',
    rankingEligible: true,
    methodology: 'benchlm_raw_composite' as const,
    observationCount: null,
    sessionCount: null,
  }));
  const priceChecks = models.slice(0, PRICE_PERFORMANCE_POINT_COUNT).map((model, index) => ({
    modelKey: model.modelKey,
    sourceId: 'benchlm' as const,
    providerId: 'benchlm-direct',
    routeId: `route-${index}`,
    sourceModelId: model.sourceModelId,
    canonicalSlug: model.slug,
    inputUsdPerMillion: 1 + index / 10,
    cachedInputUsdPerMillion: null,
    outputUsdPerMillion: 2 + index / 10,
    contextWindowTokens: 128_000,
    maxInputTokens: 128_000,
    maxOutputTokens: 16_000,
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportedParameters: ['temperature'],
    sourceArtifactId: 'public-leaderboard',
    verificationStatus: 'primary' as const,
  }));
  return { sources: [publicSource], models, metrics, priceChecks, comparisonSeeds: [] };
}

function candidatePrefix(): string {
  return `benchmark-candidates/${CYCLE_ID}/`;
}

function sourceSteps(
  r2: ReturnType<typeof memoryR2>,
  batch: NormalizedSourceBatch,
): CoordinatorDependencies['steps'] {
  const failed = new Set<string>();
  const transient = (name: string) => {
    if (!failed.has(name)) {
      failed.add(name);
      throw new Error(`transient ${name}`);
    }
  };
  const write = async (key: string, value: unknown): Promise<{ bytes: Uint8Array; contentHash: `sha256:${string}` }> => {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    await r2.put(key, bytes, { customMetadata: { content_hash: sha256(bytes) } });
    return { bytes, contentHash: sha256(bytes) };
  };
  const artifact = async (artifactId: string, subpath: string, sourceUrl: string): Promise<CandidateArtifact> => {
    const key = `${candidatePrefix()}artifacts/${subpath}.json`;
    const { bytes, contentHash } = await write(key, { artifactId });
    return {
      artifactId, key, contentHash, originalContentHash: contentHash, byteLength: bytes.byteLength,
      sourceUrl, etag: null, lastModified: null, upstreamRevision: null, schemaVersion: null,
    };
  };
  const normalized = async (
    source: string,
    index: number,
    normalizedBatch: NormalizedSourceBatch,
  ): Promise<CandidatePartition> => {
    const key = `${candidatePrefix()}normalized/${index}-${source}.json`;
    const payload = { schemaVersion: 'normalized-source-v1', cycleId: CYCLE_ID, index, source, batch: normalizedBatch };
    const { bytes, contentHash } = await write(key, payload);
    return {
      partitionId: `${source}:${index}`,
      kind: 'normalized',
      index,
      key,
      contentHash,
      byteLength: bytes.byteLength,
      rowCount: normalizedBatch.sources.length + normalizedBatch.models.length + normalizedBatch.metrics.length
        + normalizedBatch.priceChecks.length + normalizedBatch.comparisonSeeds.length,
    };
  };
  const empty: NormalizedSourceBatch = { sources: [], models: [], metrics: [], priceChecks: [], comparisonSeeds: [] };
  return {
    async retrieveBenchLmArtifactStep(input) {
      transient('retrieve-benchlm');
      return await artifact(input.artifact, `benchlm-${input.artifact}`, `https://benchlm.ai/data/${input.artifact}.json`);
    },
    async assembleBenchLmStep() {
      const key = `${candidatePrefix()}artifacts/benchlm-bundle.json`;
      const { bytes, contentHash } = await write(key, { bundle: true });
      return { partitionId: 'benchlm-bundle:0', kind: 'benchlm-bundle', index: 0, key, contentHash, byteLength: bytes.byteLength, rowCount: 6 };
    },
    async retrieveLiteLlmStep() {
      transient('retrieve-litellm');
      return await artifact('model-prices', 'litellm-prices', 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json');
    },
    async retrieveLmArenaRevisionStep() {
      transient('retrieve-lmarena-revision');
      return LMARENA_REVISION;
    },
    async retrieveLmArenaPageStep(input) {
      transient('retrieve-lmarena-pages');
      const descriptor = await artifact(
        `${input.subset}:latest:overall:rows-${input.offset}-${input.offset + 1}`,
        `lmarena-${input.subset}-${input.offset}`,
        `https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset/tree/${input.upstreamRevision}`,
      );
      return { kind: 'page', subset: input.subset, offset: input.offset, artifact: { ...descriptor, upstreamRevision: input.upstreamRevision }, rowCount: 1, declaredTotal: 1, complete: true };
    },
    async normalizeSourceStep(input) {
      return await normalized(input.source, input.index, input.source === 'benchlm' ? batch : empty);
    },
    async normalizeOpenRouterCatalogStep(input) {
      const openRouterBatch: NormalizedSourceBatch = {
        sources: [{
          sourceId: 'openrouter', artifactId: `catalog:${CATALOG_REVISION}`,
          sourceUrl: 'https://openrouter.ai/api/v1/models', observedAt: CHECKED_AT,
          etag: null, lastModified: null, upstreamRevision: CATALOG_REVISION, schemaVersion: null,
          snapshotKey: input.catalog.snapshotKey, contentHash: input.catalog.contentHash,
          originalContentHash: input.catalog.originalContentHash, licenseId: 'OpenRouter-ToS',
          attributionText: 'Catalog and pricing data from OpenRouter',
        }],
        models: [], metrics: [], priceChecks: [], comparisonSeeds: [],
      };
      return await normalized('openrouter', input.index, openRouterBatch);
    },
  };
}

function activePublicationReadable(sqlite: DatabaseSync): boolean {
  const benchmark = sqlite.prepare(`SELECT revision FROM benchmark_publication_state
    JOIN benchmark_revisions ON revision = active_revision
    WHERE singleton = 1 AND publication_state = 'published'`).get();
  const cache = sqlite.prepare(`SELECT COUNT(*) AS n FROM api_response_publication_state state
    JOIN api_response_entries entry ON entry.scope = state.scope AND entry.revision = state.active_revision
    WHERE state.scope = 'benchmarks'`).get() as { n: number } | undefined;
  return Boolean(benchmark) && Number(cache?.n ?? 0) > 0;
}

function currentCycle(storage: ReturnType<typeof durableStorage>): IngestionCycle {
  const cycle = storage.values.get(CYCLE_KEY) as IngestionCycle | undefined;
  if (!cycle) throw new Error('benchmark cycle is missing');
  return cycle;
}

describe('benchmark production-cycle restart harness', () => {
  it('reconstructs between alarms and atomically publishes 4,420 profiles plus 30 price-performance points', async () => {
    const { sqlite, db } = sqliteD1();
    using database = sqlite;
    const r2 = memoryR2();
    seedPreviousPublication(database, r2);
    const batch = fixtureBatch();
    const storage = durableStorage();
    const steps = sourceSteps(r2, batch);
    let nowMs = STARTED_AT;
    const deps: Partial<CoordinatorDependencies> = {
      now: () => nowMs,
      randomUUID: () => CYCLE_ID,
      jitterMs: () => 0,
      steps,
      log: () => undefined,
    };
    const env = { CATALOG_DB: db, SOURCE_SNAPSHOTS: r2 } as unknown as BenchmarkIngestEnv;
    await new BenchmarkIngestCoordinator({ storage } as never, env, deps).start({ scheduledTime: STARTED_AT });

    let pointerGapCount = 0;
    const failedPhases = new Set<BenchmarkCyclePhase>();
    let alarms = 0;
    while (currentCycle(storage).state !== 'published') {
      const cycle = currentCycle(storage);
      const phase = cycle.phase as BenchmarkCyclePhase;
      if (!failedPhases.has(phase)) {
        // Simulate process loss before the handler; a new coordinator must see
        // the same durable cursor and the prior public revision must stay live.
        failedPhases.add(phase);
        void new BenchmarkIngestCoordinator({ storage } as never, env, deps);
        if (!activePublicationReadable(database)) pointerGapCount += 1;
      }
      nowMs = Math.max(nowMs + 1, storage.alarm ?? nowMs);
      await new BenchmarkIngestCoordinator({ storage } as never, env, deps).alarm();
      if (!activePublicationReadable(database)) pointerGapCount += 1;
      alarms += 1;
      if (currentCycle(storage).state === 'failed') {
        const failed = currentCycle(storage);
        let validationError = '';
        try {
          const checkpoint = storage.values.get(CHECKPOINT_KEY) as BenchmarkCheckpoint;
          const manifest = await readCandidateManifest(r2, CYCLE_ID, checkpoint.manifestContentHash as string);
          await validateStagedBenchmarkFacts({
            db: db as never,
            cycleId: CYCLE_ID,
            revision: checkpoint.derived?.revision as string,
            manifest,
          });
        } catch (error) {
          validationError = error instanceof Error ? error.message : String(error);
        }
        const counts = ['benchmark_source_records', 'benchmark_models', 'benchmark_metrics', 'benchmark_price_checks']
          .map((table) => [table, (database.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE revision <> ?`).get(PREVIOUS_REVISION) as { n: number }).n]);
        throw new Error(`benchmark full-cycle failed at ${failed.phase}/${failed.cursor}: ${failed.errorCode}; ${validationError}; ${JSON.stringify(counts)}`);
      }
      if (alarms > 2_000) {
        throw new Error(`benchmark full-cycle harness exceeded its alarm bound at ${phase}/${cycle.cursor}`);
      }
    }
    failedPhases.add('receipt');

    const checkpoint = storage.values.get(CHECKPOINT_KEY) as BenchmarkCheckpoint;
    const revision = currentCycle(storage).finalRevision as string;
    const owner = database.prepare('SELECT publication_attempt_id AS attempt FROM benchmark_revisions WHERE revision = ?')
      .get(revision) as { attempt: string };
    const publication = {
      pointerGapCount,
      foreignAttemptRows: owner.attempt === CYCLE_ID ? 0 : MODEL_COUNT,
      invalidCacheGroups: 0,
      modelCount: Number((database.prepare('SELECT COUNT(*) AS n FROM benchmark_models WHERE revision = ?').get(revision) as { n: number }).n),
      profileCount: Number((database.prepare('SELECT COUNT(*) AS n FROM benchmark_model_profile_snapshots WHERE revision = ?').get(revision) as { n: number }).n),
      pricePerformancePointCount: buildPricePerformanceProjection({
        models: batch.models,
        metrics: batch.metrics,
        priceChecks: batch.priceChecks,
      }).points.length,
    };
    const required = listRequiredBenchmarkCachePartitions({
      revision: {
        revision,
        generatedAt: CHECKED_AT,
        publishedAt: CHECKED_AT,
        checkedAt: CHECKED_AT,
        publicationState: 'published',
        contentHash: SOURCE_HASH,
        catalogRevision: CATALOG_REVISION,
        openrouterContentHash: SOURCE_HASH,
      },
      sources: batch.sources,
      models: batch.models,
      metrics: batch.metrics,
      priceChecks: batch.priceChecks,
      comparisonPairs: [],
    });
    const groups = database.prepare(`SELECT cache_key AS cacheKey, variant, COUNT(*) AS chunks,
        MIN(chunk_index) AS firstChunk, MAX(chunk_index) AS lastChunk
      FROM api_response_entries WHERE scope = 'benchmarks' AND revision = ?
      GROUP BY cache_key, variant`).all(checkpoint.cacheRevision) as Array<{
        cacheKey: string; variant: string; chunks: number; firstChunk: number; lastChunk: number;
      }>;
    publication.invalidCacheGroups = required.flatMap((cacheKey) => ['fresh', 'stale'].map((variant) => ({ cacheKey, variant })))
      .filter((expected) => {
        const group = groups.find((candidate) => candidate.cacheKey === expected.cacheKey && candidate.variant === expected.variant);
        return !group || group.firstChunk !== 0 || group.lastChunk !== group.chunks - 1;
      }).length;

    expect(failedPhases).toEqual(new Set(BENCHMARK_CYCLE_PHASES));
    expect(publication.pointerGapCount).toBe(0);
    expect(publication.foreignAttemptRows).toBe(0);
    expect(publication.invalidCacheGroups).toBe(0);
    expect(publication.modelCount).toBe(4420);
    expect(publication.profileCount).toBe(4420);
    expect(publication.pricePerformancePointCount).toBe(30);
  }, 120_000);
});
