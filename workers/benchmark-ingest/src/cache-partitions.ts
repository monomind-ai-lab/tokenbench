import { compareUtf8Binary } from '../../../src/benchmarks/contracts';
import {
  buildBenchmarkSummaryData,
  cachedLeaderboardPaginationProjection,
  effectiveLeaderboardProfile,
  leaderboardEvidenceReferences,
  materializeLeaderboard,
  supportsEstimatedLeaderboard,
} from '../../../src/benchmarks/api-projections';
import {
  BENCHMARK_SUMMARY_CACHE_KEY,
  benchmarkLeaderboardCacheKey,
  benchmarkLeaderboardProjectionCacheKey,
  benchmarkPricePerformanceProjectionCacheKey,
} from '../../../src/benchmarks/api-response-cache-keys';
import { API_RESPONSE_CHUNK_MAX_BYTES, splitApiResponseBody } from '../../../src/cache/api-response-chunks';
import { createLeaderboardQueryCapabilities } from '../../../src/benchmarks/leaderboard-query';
import { LEADERBOARD_DEFINITIONS } from '../../../src/benchmarks/leaderboards';
import { buildPricePerformanceProjection } from '../../../src/benchmarks/price-performance';
import { LEADERBOARD_ROUTES, type LeaderboardKey } from '../../../src/routing/routes';
import { WORKLOAD_PROFILES, type WorkloadProfile } from '../../../src/benchmarks/value';
import {
  PRICE_PERFORMANCE_CACHE_PARAMETERS,
  pricePerformanceEnvelopeData,
} from '../../../functions/_shared/price-performance-db';
import {
  attributionForAllSources,
  attributionForEvidence,
  benchmarkEnvelope,
  encodeOpaqueValue,
  etagForBenchmarkResponse,
  freshnessFor,
  type ActiveBenchmarkSnapshot,
  type BenchmarkFreshness,
} from '../../../functions/_shared/benchmark-db';
import { BENCHMARK_FRESHNESS_WINDOW_MS } from '../../../src/ingestion/cadence';

const BENCHMARK_API_RESPONSE_SCOPE = 'benchmarks' as const;
/** The fixed first-page size every cached leaderboard responds with. */
const BENCHMARK_LEADERBOARD_CACHE_LIMIT = 50;
/** How many api_response_entries rows fit in one bounded D1 statement. */
const MAX_API_RESPONSE_CHUNKS_PER_STATEMENT = 8;

const MAX_D1_SQL_BYTES = 100 * 1024;
const MAX_D1_BOUND_PARAMETERS = 100;
const MAX_D1_JSON_PARAMETER_BYTES = 1_500_000;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/** A single D1 write surface used only for staging inactive cache entries. */
export interface BoundStatement {
  bind(...values: unknown[]): BoundStatement;
  run(): Promise<{ meta?: { changes?: number } }>;
}

/** The minimal D1 binding consumed when staging one cache partition. */
export interface D1Database {
  prepare(sql: string): BoundStatement;
}

/** One variant (fresh or stale) of a cache partition, split into chunks. */
export interface MaterializedApiResponseBody {
  readonly etag: string;
  readonly chunks: readonly string[];
}

/** One required benchmark API cache key with both freshness variants. */
export interface BenchmarkCachePartition {
  readonly cacheKey: string;
  readonly fresh: MaterializedApiResponseBody;
  readonly stale: MaterializedApiResponseBody;
}

export interface StageCachePartitionInput {
  readonly db: D1Database;
  readonly snapshot: ActiveBenchmarkSnapshot;
  readonly cacheKey: string;
  /** The attempt-owned candidate cache revision being staged. */
  readonly cacheRevision: string;
  readonly publicationAttemptId: string;
  readonly updatedAt: string;
}

function fail(message: string): never {
  throw new Error(message);
}

function statementBytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function boundedStatement(db: D1Database, sql: string, values: readonly unknown[]): BoundStatement {
  if (statementBytes(sql) > MAX_D1_SQL_BYTES) fail('D1 SQL statement exceeds the 100KB limit');
  if (values.length > MAX_D1_BOUND_PARAMETERS) fail('D1 statement exceeds the 100 bound-parameter limit');
  for (const value of values) {
    if (typeof value === 'string' && statementBytes(value) > MAX_D1_JSON_PARAMETER_BYTES) {
      fail('D1 bound string exceeds the 1.5MB ingestion safety limit');
    }
  }
  return db.prepare(sql).bind(...values);
}

function requireIsoTimestamp(value: string, label: string): void {
  if (!ISO_TIMESTAMP.test(value) || !Number.isFinite(Date.parse(value))) {
    fail(`${label} must be an ISO timestamp`);
  }
}

type CacheKeySpec =
  | { readonly cacheKey: string; readonly kind: 'summary' }
  | { readonly cacheKey: string; readonly kind: 'price-performance' }
  | {
      readonly cacheKey: string;
      readonly kind: 'projection';
      readonly key: LeaderboardKey;
      readonly derivationProfile: WorkloadProfile;
      readonly includeEstimated: boolean;
    }
  | {
      readonly cacheKey: string;
      readonly kind: 'leaderboard';
      readonly key: LeaderboardKey;
      readonly profile: WorkloadProfile;
      readonly derivationProfile: WorkloadProfile;
      readonly includeEstimated: boolean;
    };

/** Enumerates the exact required cache keys, deduplicating projection variants. */
function listCacheKeySpecs(snapshot: ActiveBenchmarkSnapshot): CacheKeySpec[] {
  void snapshot;
  const specs: CacheKeySpec[] = [
    { cacheKey: BENCHMARK_SUMMARY_CACHE_KEY, kind: 'summary' },
    { cacheKey: benchmarkPricePerformanceProjectionCacheKey(), kind: 'price-performance' },
  ];
  const projected = new Set<string>();
  const profiles = (Object.keys(WORKLOAD_PROFILES) as WorkloadProfile[]).slice().sort(compareUtf8Binary);
  for (const key of Object.keys(LEADERBOARD_ROUTES) as LeaderboardKey[]) {
    const definition = LEADERBOARD_DEFINITIONS[key];
    const estimatedVariants = supportsEstimatedLeaderboard(definition) ? [false, true] : [false];
    for (const profile of profiles) {
      for (const includeEstimated of estimatedVariants) {
        const derivationProfile = effectiveLeaderboardProfile(key, profile);
        const projectionKey = benchmarkLeaderboardProjectionCacheKey({
          key,
          profile: derivationProfile,
          includeEstimated,
        });
        if (!projected.has(projectionKey)) {
          specs.push({ cacheKey: projectionKey, kind: 'projection', key, derivationProfile, includeEstimated });
          projected.add(projectionKey);
        }
        specs.push({
          cacheKey: benchmarkLeaderboardCacheKey({
            key,
            profile,
            limit: BENCHMARK_LEADERBOARD_CACHE_LIMIT,
            cursor: null,
            includeEstimated,
          }),
          kind: 'leaderboard',
          key,
          profile,
          derivationProfile,
          includeEstimated,
        });
      }
    }
  }
  return specs;
}

/** All cache keys that must be present for a candidate to be publishable. */
export function listRequiredBenchmarkCachePartitions(snapshot: ActiveBenchmarkSnapshot): readonly string[] {
  return listCacheKeySpecs(snapshot).map((spec) => spec.cacheKey);
}

function leaderboardCursorForCache(
  revision: string,
  key: LeaderboardKey,
  profile: WorkloadProfile,
  includeEstimated: boolean,
  offset: number,
): string {
  return encodeOpaqueValue({
    v: 1,
    r: revision,
    k: key,
    p: profile,
    l: BENCHMARK_LEADERBOARD_CACHE_LIMIT,
    e: includeEstimated,
    o: offset,
  });
}

function materializeBody(
  snapshot: ActiveBenchmarkSnapshot,
  freshness: ReturnType<typeof freshnessFor>,
  parameters: unknown,
  cacheKey: string,
  body: unknown,
): MaterializedApiResponseBody {
  const serialized = JSON.stringify(body);
  if (serialized === undefined) fail(`benchmark response cache ${cacheKey} is not JSON serializable`);
  return {
    etag: etagForBenchmarkResponse(snapshot.revision, freshness, parameters),
    chunks: splitApiResponseBody(serialized),
  };
}

/**
 * Materializes the fresh and stale variants for exactly one required cache
 * key without mutating any active publication pointer.
 */
export function materializeBenchmarkCachePartition(
  snapshot: ActiveBenchmarkSnapshot,
  cacheKey: string,
): BenchmarkCachePartition {
  const spec = listCacheKeySpecs(snapshot).find((candidate) => candidate.cacheKey === cacheKey);
  if (!spec) fail(`benchmark response cache partition ${cacheKey} is not required`);
  const checkedAtMs = Date.parse(snapshot.revision.checkedAt);
  if (!Number.isFinite(checkedAtMs)) fail('benchmark response cache requires an ISO checked_at timestamp');
  const fresh = freshnessFor(snapshot.revision, checkedAtMs);
  const stale = freshnessFor(snapshot.revision, checkedAtMs + BENCHMARK_FRESHNESS_WINDOW_MS + 1);

  switch (spec.kind) {
    case 'summary': {
      const parameters = { endpoint: 'benchmarks' };
      const data = buildBenchmarkSummaryData(snapshot);
      return {
        cacheKey,
        fresh: materializeBody(snapshot, fresh, parameters, cacheKey, benchmarkEnvelope(snapshot, fresh, attributionForAllSources(snapshot), data)),
        stale: materializeBody(snapshot, stale, parameters, cacheKey, benchmarkEnvelope(snapshot, stale, attributionForAllSources(snapshot), data)),
      };
    }
    case 'price-performance': {
      const parameters = PRICE_PERFORMANCE_CACHE_PARAMETERS;
      const projection = buildPricePerformanceProjection({
        models: snapshot.models,
        metrics: snapshot.metrics,
        priceChecks: snapshot.priceChecks,
      });
      const data = pricePerformanceEnvelopeData(projection.points);
      const attribution = attributionForAllSources(snapshot);
      return {
        cacheKey,
        fresh: materializeBody(snapshot, fresh, parameters, cacheKey, benchmarkEnvelope(snapshot, fresh, attribution, data)),
        stale: materializeBody(snapshot, stale, parameters, cacheKey, benchmarkEnvelope(snapshot, stale, attribution, data)),
      };
    }
    case 'projection': {
      const parameters = {
        endpoint: 'leaderboard-projection',
        key: spec.key,
        profile: spec.derivationProfile,
        includeEstimated: spec.includeEstimated,
      };
      const leaderboard = materializeLeaderboard(snapshot, spec.key, spec.derivationProfile, spec.includeEstimated);
      const projection = cachedLeaderboardPaginationProjection(snapshot, leaderboard);
      return {
        cacheKey,
        fresh: materializeBody(snapshot, fresh, parameters, cacheKey, projection),
        stale: materializeBody(snapshot, stale, parameters, cacheKey, projection),
      };
    }
    case 'leaderboard': {
      const leaderboard = materializeLeaderboard(snapshot, spec.key, spec.derivationProfile, spec.includeEstimated);
      const entries = leaderboard.entries;
      const capabilities = createLeaderboardQueryCapabilities(leaderboard.leaderboard.definition, entries);
      const pagedEntries = entries.slice(0, BENCHMARK_LEADERBOARD_CACHE_LIMIT);
      const nextCursor = pagedEntries.length < entries.length
        ? leaderboardCursorForCache(snapshot.revision.revision, spec.key, spec.profile, spec.includeEstimated, pagedEntries.length)
        : null;
      const payload = {
        ...leaderboard.leaderboard,
        profile: spec.profile,
        entries: pagedEntries,
        capabilities,
        pagination: {
          limit: BENCHMARK_LEADERBOARD_CACHE_LIMIT,
          total: entries.length,
          nextCursor,
        },
      };
      const parameters = {
        endpoint: 'leaderboard',
        key: spec.key,
        profile: spec.profile,
        limit: BENCHMARK_LEADERBOARD_CACHE_LIMIT,
        cursor: '',
        includeEstimated: spec.includeEstimated,
      };
      const attribution = attributionForEvidence(
        snapshot,
        leaderboardEvidenceReferences(snapshot, leaderboard.leaderboard.definition, pagedEntries),
      );
      return {
        cacheKey,
        fresh: materializeBody(snapshot, fresh, parameters, cacheKey, benchmarkEnvelope(snapshot, fresh, attribution, payload)),
        stale: materializeBody(snapshot, stale, parameters, cacheKey, benchmarkEnvelope(snapshot, stale, attribution, payload)),
      };
    }
  }
}

function candidateCacheRevision(snapshot: ActiveBenchmarkSnapshot, publicationAttemptId: string): string {
  const checkedAtSuffix = snapshot.revision.checkedAt.replace(/[^0-9]/g, '');
  if (checkedAtSuffix.length === 0) fail('benchmark response cache requires a stable checked_at suffix');
  if (!/^[0-9a-z-]+$/i.test(publicationAttemptId)) fail('benchmark publication attempt ID is invalid');
  return `${snapshot.revision.revision}+cache-${checkedAtSuffix}-${publicationAttemptId}`;
}

function validateBody(body: MaterializedApiResponseBody, cacheKey: string): void {
  if (body.chunks.length === 0) fail(`cache partition ${cacheKey} produced no response chunks`);
  for (const chunk of body.chunks) {
    if (chunk.length === 0) fail(`cache partition ${cacheKey} produced an empty response chunk`);
    if (statementBytes(chunk) > API_RESPONSE_CHUNK_MAX_BYTES) {
      fail(`cache partition ${cacheKey} exceeds the API response chunk limit`);
    }
  }
}

function apiResponseStatements(
  db: D1Database,
  scope: string,
  cacheRevision: string,
  snapshot: ActiveBenchmarkSnapshot,
  updatedAt: string,
  partition: BenchmarkCachePartition,
): BoundStatement[] {
  const upsertRevision = `INSERT INTO api_response_revisions
  (scope, revision, checked_at, published_at, created_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(scope, revision) DO UPDATE SET
    checked_at = excluded.checked_at,
    published_at = excluded.published_at,
    created_at = excluded.created_at`;

  const statements: BoundStatement[] = [
    boundedStatement(db, upsertRevision, [
      scope,
      cacheRevision,
      snapshot.revision.checkedAt,
      snapshot.revision.publishedAt,
      updatedAt,
    ]),
    boundedStatement(db, 'DELETE FROM api_response_entries WHERE scope = ? AND revision = ? AND cache_key = ?', [
      scope,
      cacheRevision,
      partition.cacheKey,
    ]),
  ];

  const variants: Array<{
    cacheKey: string;
    variant: 'fresh' | 'stale';
    chunkIndex: number;
    etag: string;
    body: string;
  }> = [
    { cacheKey: partition.cacheKey, variant: 'fresh' as const, etag: partition.fresh.etag, chunks: partition.fresh.chunks },
    { cacheKey: partition.cacheKey, variant: 'stale' as const, etag: partition.stale.etag, chunks: partition.stale.chunks },
  ].flatMap((variant) => variant.chunks.map((body, chunkIndex) => ({
    cacheKey: variant.cacheKey,
    variant: variant.variant,
    chunkIndex,
    etag: variant.etag,
    body,
  })));

  for (let offset = 0; offset < variants.length; offset += MAX_API_RESPONSE_CHUNKS_PER_STATEMENT) {
    const chunk = variants.slice(offset, offset + MAX_API_RESPONSE_CHUNKS_PER_STATEMENT);
    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
    statements.push(boundedStatement(db, `INSERT INTO api_response_entries
      (scope, revision, cache_key, variant, chunk_index, etag, body)
      VALUES ${placeholders}`, chunk.flatMap((entry) => [
      scope,
      cacheRevision,
      entry.cacheKey,
      entry.variant,
      entry.chunkIndex,
      entry.etag,
      entry.body,
    ])));
  }

  return statements;
}

/**
 * Stages exactly one required cache partition (fresh + stale variants) into
 * the inactive attempt-owned cache revision. It never moves the active
 * api_response_publication_state pointer.
 */
export async function stageBenchmarkCachePartition(input: StageCachePartitionInput): Promise<void> {
  const { db, snapshot, cacheKey, cacheRevision, publicationAttemptId, updatedAt } = input;
  requireIsoTimestamp(snapshot.revision.checkedAt, 'checked_at');
  requireIsoTimestamp(updatedAt, 'updated_at');

  const expectedRevision = candidateCacheRevision(snapshot, publicationAttemptId);
  if (cacheRevision !== expectedRevision) {
    if (!cacheRevision.startsWith(`${snapshot.revision.revision}+cache-`)) {
      fail('cache revision does not prefix the pending benchmark revision');
    }
    if (!cacheRevision.endsWith(`-${publicationAttemptId}`)) {
      fail('cache partition belongs to a foreign publication attempt');
    }
    fail('cache revision does not match the pending benchmark candidate');
  }

  const partition = materializeBenchmarkCachePartition(snapshot, cacheKey);
  validateBody(partition.fresh, cacheKey);
  validateBody(partition.stale, cacheKey);

  const statements = apiResponseStatements(
    db,
    BENCHMARK_API_RESPONSE_SCOPE,
    cacheRevision,
    snapshot,
    updatedAt,
    partition,
  );
  for (const statement of statements) {
    await statement.run();
  }
}