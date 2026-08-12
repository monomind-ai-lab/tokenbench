import { compareUtf8Binary } from '../../../src/benchmarks/contracts';
import { API_RESPONSE_CHUNK_MAX_BYTES } from '../../../src/cache/api-response-chunks';
import {
  effectiveLeaderboardProfile,
  supportsEstimatedLeaderboard,
} from '../../../src/benchmarks/api-projections';
import {
  BENCHMARK_SUMMARY_CACHE_KEY,
  benchmarkLeaderboardCacheKey,
  benchmarkLeaderboardProjectionCacheKey,
  benchmarkPricePerformanceProjectionCacheKey,
} from '../../../src/benchmarks/api-response-cache-keys';
import { LEADERBOARD_DEFINITIONS } from '../../../src/benchmarks/leaderboards';
import { LEADERBOARD_ROUTES, type LeaderboardKey } from '../../../src/routing/routes';
import { WORKLOAD_PROFILES, type WorkloadProfile } from '../../../src/benchmarks/value';
import type {
  ActiveBenchmarkSnapshot,
} from '../../../functions/_shared/benchmark-db';
import type {
  BenchmarkMetric,
  BenchmarkModel,
  BenchmarkPriceCheck,
  BenchmarkRevision,
  BenchmarkSourceRecord,
} from '../../../src/benchmarks/contracts';
import { describe, expect, it } from 'vitest';
import {
  listRequiredBenchmarkCachePartitions,
  materializeBenchmarkCachePartition,
  stageBenchmarkCachePartition,
  type D1Database,
} from './cache-partitions';

const REVISION = 'rev-2026-08-16';
const CHECKED_AT = '2026-08-16T02:15:00.000Z';
const PUBLISHED_AT = '2026-08-16T02:20:00.000Z';
const PUBLICATION_ATTEMPT_ID = '7a1c4890-2f6b-4c3d-8e90-aabbccddeeff';
const CATALOG_REVISION = 'catalog-2026-08-16';

function sha256Hash(seed: string): string {
  let hash = '';
  for (let index = 0; index < 64; index += 1) {
    const code = (seed.charCodeAt(index % seed.length) + index) % 16;
    hash += code.toString(16);
  }
  return `sha256:${hash}`;
}

function source(sourceId: BenchmarkSourceRecord['sourceId'], artifactId: string): BenchmarkSourceRecord {
  return {
    sourceId,
    artifactId,
    sourceUrl: `https://example.invalid/${sourceId}/${artifactId}`,
    observedAt: CHECKED_AT,
    etag: `"${sourceId}-${artifactId}"`,
    lastModified: null,
    upstreamRevision: null,
    schemaVersion: null,
    snapshotKey: `${sourceId}/${artifactId}/${CHECKED_AT}.json`,
    contentHash: sha256Hash(sourceId),
    originalContentHash: sha256Hash(`original-${sourceId}`),
    licenseId: 'CC-BY-4.0',
    attributionText: `${sourceId} attribution`,
  };
}

function benchLmModel(modelKey: string, index: number): BenchmarkModel {
  return {
    modelKey,
    slug: `model-${index}`,
    name: `Model ${index}`,
    creator: 'BenchLm',
    sourceType: 'Unknown',
    reasoningType: null,
    releaseDate: null,
    contextWindowTokens: 128_000,
    evidenceStatus: 'supported',
    rankingEligible: true,
    confidenceLower: null,
    confidenceUpper: null,
    benchmarkCount: 1,
    sourceId: 'benchlm',
    sourceModelId: `benchlm-${index}`,
    sourceArtifactId: 'benchlm-models',
  };
}

function benchLmMetric(modelKey: string, metricKey: string, value: number): BenchmarkMetric {
  return {
    modelKey,
    metricKey,
    category: 'overall',
    value,
    rawValue: value,
    rank: null,
    lower: null,
    upper: null,
    voteCount: null,
    unit: 'score',
    sourceId: 'benchlm',
    sourceUpdatedAt: CHECKED_AT,
    sourceModelId: modelKey,
    sourceArtifactId: 'benchlm-metrics',
    rankingEligible: true,
    methodology: 'benchlm_raw_composite',
    observationCount: null,
    sessionCount: null,
  };
}

function openRouterPrice(modelKey: string, index: number): BenchmarkPriceCheck {
  return {
    modelKey,
    sourceId: 'openrouter',
    providerId: 'provider-a',
    inputUsdPerMillion: 0.5 + index / 1000,
    cachedInputUsdPerMillion: null,
    outputUsdPerMillion: 1.5 + index / 1000,
    contextWindowTokens: 128_000,
    verificationStatus: 'primary',
    routeId: `route-${index}`,
    sourceModelId: modelKey,
    canonicalSlug: null,
    maxInputTokens: null,
    maxOutputTokens: null,
    inputModalities: null,
    outputModalities: null,
    supportedParameters: null,
    sourceArtifactId: 'openrouter-pricing',
  };
}

function revision(): BenchmarkRevision {
  return {
    revision: REVISION,
    generatedAt: CHECKED_AT,
    publishedAt: PUBLISHED_AT,
    checkedAt: CHECKED_AT,
    publicationState: 'published',
    contentHash: sha256Hash('content'),
    catalogRevision: CATALOG_REVISION,
    openrouterContentHash: sha256Hash('openrouter'),
  };
}

function compactSnapshot(): ActiveBenchmarkSnapshot {
  const models = [benchLmModel('model-a', 0), benchLmModel('model-b', 1)];
  const metrics = [
    benchLmMetric('model-a', 'benchlm:overall:raw', 82),
    benchLmMetric('model-b', 'benchlm:overall:raw', 71),
  ];
  const priceChecks = [openRouterPrice('model-a', 0), openRouterPrice('model-b', 1)];
  return {
    revision: revision(),
    sources: [
      source('benchlm', 'benchlm-models'),
      source('benchlm', 'benchlm-metrics'),
      source('openrouter', 'openrouter-pricing'),
      source('openrouter', 'openrouter-models-metrics'),
      source('litellm', 'litellm-pricing'),
      source('lmarena', 'lmarena-arena'),
    ],
    models,
    metrics,
    priceChecks,
    comparisonPairs: [],
  };
}

const PROFILES = (Object.keys(WORKLOAD_PROFILES) as WorkloadProfile[]).slice().sort(compareUtf8Binary);

function expectedPartitionCount(): number {
  let count = 2; // summary + price-performance
  const projected = new Set<string>();
  for (const key of Object.keys(LEADERBOARD_ROUTES) as LeaderboardKey[]) {
    const definition = LEADERBOARD_DEFINITIONS[key];
    const estimatedVariants = supportsEstimatedLeaderboard(definition) ? [false, true] : [false];
    for (const profile of PROFILES) {
      for (const includeEstimated of estimatedVariants) {
        const derivationProfile = effectiveLeaderboardProfile(key, profile);
        const projectionKey = benchmarkLeaderboardProjectionCacheKey({ key, profile: derivationProfile, includeEstimated });
        if (!projected.has(projectionKey)) {
          count += 1;
          projected.add(projectionKey);
        }
        count += 1; // leaderboard cache key
      }
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Recording D1 double
// ---------------------------------------------------------------------------

interface RecordedStatement {
  sql: string;
  values: unknown[];
}

class RecordingStatement {
  constructor(
    private readonly sink: RecordedStatement[],
    private readonly statementSql: string,
    private readonly statementValues: unknown[] = [],
  ) {}

  bind(...values: unknown[]): RecordingStatement {
    return new RecordingStatement(this.sink, this.statementSql, [...this.statementValues, ...values]);
  }

  async run(): Promise<{ meta?: { changes?: number } }> {
    this.sink.push({ sql: this.statementSql, values: this.statementValues });
    return { meta: { changes: 1 } };
  }

  async first<T = unknown>(): Promise<T | null> {
    this.sink.push({ sql: this.statementSql, values: this.statementValues });
    if (this.statementSql.includes('FROM benchmark_revisions')) {
      return { state: 'pending', attempt: PUBLICATION_ATTEMPT_ID } as T;
    }
    return null;
  }

  async all<T = unknown>(): Promise<{ results: T[] }> {
    this.sink.push({ sql: this.statementSql, values: this.statementValues });
    return { results: [] };
  }
}

function recordingDb(): D1Database & { readonly statements: RecordedStatement[] } {
  const statements: RecordedStatement[] = [];
  const instance = {
    prepare(sql: string): RecordingStatement {
      return new RecordingStatement(statements, sql);
    },
  } as D1Database;
  return Object.assign(instance, { statements });
}

function cacheRevisionFor(attemptId: string, checkedAt: string = CHECKED_AT): string {
  const checkedAtSuffix = checkedAt.replace(/[^0-9]/g, '');
  return `${REVISION}+cache-${checkedAtSuffix}-${attemptId}`;
}

function expectNoPointerWrite(db: D1Database & { readonly statements: RecordedStatement[] }): void {
  const touchedPointer = db.statements.some((statement) => statement.sql.includes('api_response_publication_state'));
  expect(touchedPointer).toBe(false);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('listRequiredBenchmarkCachePartitions', () => {
  it('enumerates every required cache key exactly once', () => {
    const keys = listRequiredBenchmarkCachePartitions(compactSnapshot());
    expect(keys.length).toBe(expectedPartitionCount());
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.slice(0, 2)).toEqual([
      BENCHMARK_SUMMARY_CACHE_KEY,
      benchmarkPricePerformanceProjectionCacheKey(),
    ]);

    for (const key of Object.keys(LEADERBOARD_ROUTES) as LeaderboardKey[]) {
      const definition = LEADERBOARD_DEFINITIONS[key];
      const estimatedVariants = supportsEstimatedLeaderboard(definition) ? [false, true] : [false];
      for (const profile of PROFILES) {
        for (const includeEstimated of estimatedVariants) {
          expect(keys).toContain(benchmarkLeaderboardCacheKey({
            key,
            profile,
            limit: 50,
            cursor: null,
            includeEstimated,
          }));
        }
      }
      expect(keys.some((cacheKey) => cacheKey.startsWith(`leaderboard-projection:${key}:`))).toBe(true);
    }
  });
});

describe('materializeBenchmarkCachePartition', () => {
  it('produces one cache key with both fresh and stale variants', () => {
    const snapshot = compactSnapshot();
    const keys = listRequiredBenchmarkCachePartitions(snapshot);
    for (const cacheKey of keys) {
      const partition = materializeBenchmarkCachePartition(snapshot, cacheKey);
      expect(partition.cacheKey).toBe(cacheKey);
      expect(partition.fresh).toBeDefined();
      expect(partition.stale).toBeDefined();
    }

    const leaderboardKey = benchmarkLeaderboardCacheKey({
      key: 'llm-overall',
      profile: 'balanced',
      limit: 50,
      cursor: null,
      includeEstimated: false,
    });
    const partition = materializeBenchmarkCachePartition(snapshot, leaderboardKey);
    expect(partition.cacheKey).toBe(leaderboardKey);
    expect(partition.fresh.etag).not.toBe(partition.stale.etag);
  });

  it('keeps each chunk within the bounded limit and reassembles the exact body', () => {
    const snapshot = compactSnapshot();
    const keys = listRequiredBenchmarkCachePartitions(snapshot);
    for (const cacheKey of keys) {
      const partition = materializeBenchmarkCachePartition(snapshot, cacheKey);
      for (const variant of [partition.fresh, partition.stale]) {
        expect(variant.chunks.length).toBeGreaterThan(0);
        for (const chunk of variant.chunks) {
          expect(chunk.length).toBeGreaterThan(0);
          expect(new TextEncoder().encode(chunk).byteLength).toBeLessThanOrEqual(API_RESPONSE_CHUNK_MAX_BYTES);
        }
        const reassembled = JSON.parse(variant.chunks.join(''));
        expect(reassembled).toBeTypeOf('object');
        expect(reassembled).not.toBeNull();
        expect('revision' in reassembled).toBe(true);
      }
    }
  });

  it('splits a large body into contiguous bounded chunks', () => {
    const count = 6_000;
    const models: BenchmarkModel[] = [];
    const metrics: BenchmarkMetric[] = [];
    for (let index = 0; index < count; index += 1) {
      const modelKey = `large-model-${String(index).padStart(4, '0')}`;
      models.push(benchLmModel(modelKey, index));
      metrics.push(benchLmMetric(modelKey, 'benchlm:overall:raw', (index % 100) + 1));
    }
    const snapshot: ActiveBenchmarkSnapshot = {
      ...compactSnapshot(),
      models,
      metrics,
    };

    const projectionKey = benchmarkLeaderboardProjectionCacheKey({
      key: 'llm-overall',
      profile: 'balanced',
      includeEstimated: false,
    });
    const partition = materializeBenchmarkCachePartition(snapshot, projectionKey);
    for (const variant of [partition.fresh, partition.stale]) {
      expect(variant.chunks.length).toBeGreaterThan(1);
      for (const chunk of variant.chunks) {
        expect(new TextEncoder().encode(chunk).byteLength).toBeLessThanOrEqual(API_RESPONSE_CHUNK_MAX_BYTES);
      }
      const reassembled = JSON.parse(variant.chunks.join('')) as { entries: unknown[] };
      expect(reassembled.entries.length).toBe(count);
    }
  });

  it('rejects a malformed or unknown projection cache key', () => {
    const snapshot = compactSnapshot();
    expect(() => materializeBenchmarkCachePartition(snapshot, 'leaderboard:polluted:garbage')).toThrow();
    expect(() => materializeBenchmarkCachePartition(snapshot, 'no-such-cache-key')).toThrow();
  });
});

describe('stageBenchmarkCachePartition', () => {
  it('stages one cache key with both variants and never moves the active pointer', async () => {
    const db = recordingDb();
    const snapshot = compactSnapshot();
    const cacheKey = benchmarkLeaderboardCacheKey({
      key: 'llm-overall',
      profile: 'balanced',
      limit: 50,
      cursor: null,
      includeEstimated: false,
    });

    await stageBenchmarkCachePartition({
      db,
      snapshot,
      cacheKey,
      cacheRevision: cacheRevisionFor(PUBLICATION_ATTEMPT_ID),
      publicationAttemptId: PUBLICATION_ATTEMPT_ID,
      updatedAt: CHECKED_AT,
    });

    const insertEntries = db.statements.filter((statement) => statement.sql.startsWith('INSERT INTO api_response_entries'));
    expect(insertEntries.length).toBeGreaterThan(0);
    const rows = insertEntries.flatMap((statement) => {
      const values = statement.values as unknown[];
      const rowCount = Math.floor(values.length / 7);
      const rowsOut: Array<{ cacheKey: unknown; variant: unknown; chunkIndex: unknown }> = [];
      for (let index = 0; index < rowCount; index += 1) {
        rowsOut.push({
          cacheKey: values[index * 7 + 2],
          variant: values[index * 7 + 3],
          chunkIndex: values[index * 7 + 4],
        });
      }
      return rowsOut;
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.cacheKey).toBe(cacheKey);
      expect(['fresh', 'stale']).toContain(row.variant);
    }
    expect(new Set(rows.map((row) => row.variant))).toEqual(new Set(['fresh', 'stale']));

    for (const variant of ['fresh', 'stale'] as const) {
      const indexes = rows.filter((row) => row.variant === variant).map((row) => Number(row.chunkIndex)).sort((a, b) => a - b);
      expect(indexes).toEqual(indexes.map((_: number, index: number) => index));
    }

    const revisions = db.statements.filter((statement) => statement.sql.startsWith('INSERT INTO api_response_revisions'));
    expect(revisions.length).toBeGreaterThan(0);
    for (const statement of revisions) {
      expect(statement.values[1]).toBe(cacheRevisionFor(PUBLICATION_ATTEMPT_ID));
    }

    expectNoPointerWrite(db);
  });

  it('performs strict runtime validation before any D1 write', async () => {
    const snapshot = compactSnapshot();

    await expect(stageBenchmarkCachePartition({
      db: recordingDb(),
      snapshot,
      cacheKey: BENCHMARK_SUMMARY_CACHE_KEY,
      cacheRevision: cacheRevisionFor(PUBLICATION_ATTEMPT_ID),
      publicationAttemptId: PUBLICATION_ATTEMPT_ID,
      updatedAt: 'not-a-timestamp',
    })).rejects.toThrow();

    const emptyDb = recordingDb();
    await expect(stageBenchmarkCachePartition({
      db: emptyDb,
      snapshot,
      cacheKey: 'leaderboard:polluted:garbage',
      cacheRevision: cacheRevisionFor(PUBLICATION_ATTEMPT_ID),
      publicationAttemptId: PUBLICATION_ATTEMPT_ID,
      updatedAt: CHECKED_AT,
    })).rejects.toThrow();
    expect(emptyDb.statements.length).toBe(0);
  });

  it('rejects a cache revision that does not prefix the pending benchmark revision', async () => {
    const db = recordingDb();
    await expect(stageBenchmarkCachePartition({
      db,
      snapshot: compactSnapshot(),
      cacheKey: BENCHMARK_SUMMARY_CACHE_KEY,
      cacheRevision: `unrelated-revision+cache-${CHECKED_AT.replace(/[^0-9]/g, '')}-${PUBLICATION_ATTEMPT_ID}`,
      publicationAttemptId: PUBLICATION_ATTEMPT_ID,
      updatedAt: CHECKED_AT,
    })).rejects.toThrow('pending benchmark revision');
    expect(db.statements.length).toBe(0);
  });

  it('rejects a foreign publication attempt', async () => {
    const db = recordingDb();
    const otherAttempt = '99999999-1111-2222-3333-444455556666';
    await expect(stageBenchmarkCachePartition({
      db,
      snapshot: compactSnapshot(),
      cacheKey: BENCHMARK_SUMMARY_CACHE_KEY,
      cacheRevision: cacheRevisionFor(otherAttempt),
      publicationAttemptId: PUBLICATION_ATTEMPT_ID,
      updatedAt: CHECKED_AT,
    })).rejects.toThrow('foreign publication attempt');
    expect(db.statements.length).toBe(0);
  });

  it('rejects a cache partition when D1 ownership is not pending for the attempt', async () => {
    const statements: RecordedStatement[] = [];
    const db = {
      prepare(sql: string) {
        const statement = new RecordingStatement(statements, sql);
        if (!sql.includes('FROM benchmark_revisions')) return statement;
        return Object.assign(statement, {
          bind(...values: unknown[]) {
            return {
              async first() { return { state: 'pending', attempt: 'foreign-attempt' }; },
              async run() { statements.push({ sql, values }); return { meta: { changes: 1 } }; },
            };
          },
        });
      },
    } as D1Database;
    await expect(stageBenchmarkCachePartition({
      db,
      snapshot: compactSnapshot(),
      cacheKey: BENCHMARK_SUMMARY_CACHE_KEY,
      cacheRevision: cacheRevisionFor(PUBLICATION_ATTEMPT_ID),
      publicationAttemptId: PUBLICATION_ATTEMPT_ID,
      updatedAt: CHECKED_AT,
    })).rejects.toThrow('attempt-owned pending');
  });

  it('is idempotent while leaving the active pointer on the prior revision', async () => {
    const db = recordingDb();
    const snapshot = compactSnapshot();
    const cacheKey = BENCHMARK_SUMMARY_CACHE_KEY;
    const input = {
      db,
      snapshot,
      cacheKey,
      cacheRevision: cacheRevisionFor(PUBLICATION_ATTEMPT_ID),
      publicationAttemptId: PUBLICATION_ATTEMPT_ID,
      updatedAt: CHECKED_AT,
    };

    await stageBenchmarkCachePartition(input);
    const firstEntryCount = db.statements.filter((statement) => statement.sql.startsWith('INSERT INTO api_response_entries'))
      .reduce((sum, statement) => sum + Math.floor(statement.values.length / 7), 0);

    await stageBenchmarkCachePartition(input);
    const insertEntries = db.statements.filter((statement) => statement.sql.startsWith('INSERT INTO api_response_entries'));
    const entryCount = insertEntries.reduce((sum, statement) => sum + Math.floor(statement.values.length / 7), 0);

    expect(entryCount).toBeGreaterThan(0);
    for (const statement of insertEntries) {
      expect(statement.values[1]).toBe(cacheRevisionFor(PUBLICATION_ATTEMPT_ID));
    }
    expect(firstEntryCount).toBeLessThanOrEqual(entryCount);
    expectNoPointerWrite(db);
  });

  it('staging a second key leaves the first staged key intact', async () => {
    // Model api_response_entries as applied state so we can prove a later
    // partition's delete is scoped to its own cache key.
    interface Entry {
      revision: string;
      cacheKey: string;
      variant: string;
      chunkIndex: number;
    }
    const replay = (statements: RecordedStatement[]): Entry[] => {
      const entries: Entry[] = [];
      for (const statement of statements) {
        if (statement.sql.startsWith('INSERT INTO api_response_entries')) {
          const values = statement.values as unknown[];
          const rowCount = Math.floor(values.length / 7);
          for (let index = 0; index < rowCount; index += 1) {
            entries.push({
              revision: values[index * 7 + 1] as string,
              cacheKey: values[index * 7 + 2] as string,
              variant: values[index * 7 + 3] as string,
              chunkIndex: values[index * 7 + 4] as number,
            });
          }
        } else if (statement.sql.startsWith('DELETE FROM api_response_entries')) {
          const revision = statement.values[1] as string;
          const cacheKey = statement.values[2] as string;
          for (let index = entries.length - 1; index >= 0; index -= 1) {
            if (entries[index].revision === revision && entries[index].cacheKey === cacheKey) {
              entries.splice(index, 1);
            }
          }
        }
      }
      return entries;
    };

    const db = recordingDb();
    const snapshot = compactSnapshot();
    const cacheRevision = cacheRevisionFor(PUBLICATION_ATTEMPT_ID);
    const leaderboardKey = benchmarkLeaderboardCacheKey({
      key: 'llm-overall',
      profile: 'balanced',
      limit: 50,
      cursor: null,
      includeEstimated: false,
    });

    await stageBenchmarkCachePartition({
      db,
      snapshot,
      cacheKey: BENCHMARK_SUMMARY_CACHE_KEY,
      cacheRevision,
      publicationAttemptId: PUBLICATION_ATTEMPT_ID,
      updatedAt: CHECKED_AT,
    });
    await stageBenchmarkCachePartition({
      db,
      snapshot,
      cacheKey: leaderboardKey,
      cacheRevision,
      publicationAttemptId: PUBLICATION_ATTEMPT_ID,
      updatedAt: CHECKED_AT,
    });

    const entries = replay(db.statements);
    const retained = (cacheKey: string) =>
      entries.some((entry) =>
        entry.revision === cacheRevision
        && entry.cacheKey === cacheKey
        && ['fresh', 'stale'].includes(entry.variant));

    expect(retained(BENCHMARK_SUMMARY_CACHE_KEY)).toBe(true);
    expect(retained(leaderboardKey)).toBe(true);
    expectNoPointerWrite(db);
  });
});
