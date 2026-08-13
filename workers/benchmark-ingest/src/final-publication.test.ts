import { describe, expect, it } from 'vitest';
import type { ActiveBenchmarkSnapshot } from '../../../functions/_shared/benchmark-db';
import type { BenchmarkCandidateManifestV1 } from './candidate-storage';
import { listRequiredBenchmarkCachePartitions } from './cache-partitions';
import {
  benchmarkCandidateCacheRevision,
  publishBenchmarkCandidate,
  validateCompleteBenchmarkCandidate,
  type PublicationD1Database,
} from './final-publication';

const CYCLE_ID = '11111111-2222-4333-8444-555555555555';
const REVISION = 'benchmark_11111111111111111111111111111111';
const CATALOG_REVISION = 'catalog-revision';
const CHECKED_AT = '2026-08-16T02:15:00.000Z';
const HASH = `sha256:${'a'.repeat(64)}`;

function snapshot(): ActiveBenchmarkSnapshot {
  const source = {
    sourceId: 'benchlm' as const,
    artifactId: 'public-leaderboard',
    sourceUrl: 'https://benchlm.ai/api/data/leaderboard?mode=bench-align-v5&limit=200',
    observedAt: CHECKED_AT,
    etag: null,
    lastModified: null,
    upstreamRevision: 'snapshot-1',
    schemaVersion: 'bench-align-v5',
    snapshotKey: 'benchlm/public.json',
    contentHash: HASH,
    originalContentHash: HASH,
    licenseId: 'MIT' as const,
    attributionText: 'Data from BenchLM.ai',
  };
  const models = [
    { modelKey: 'model-a', slug: 'model-a', name: 'Model A', creator: 'Creator A' },
    { modelKey: 'model-b', slug: 'model-b', name: 'Model B', creator: 'Creator B' },
  ].map((model, index) => ({
    ...model,
    sourceType: 'Proprietary' as const,
    reasoningType: null,
    releaseDate: null,
    contextWindowTokens: 128_000,
    evidenceStatus: 'supported' as const,
    rankingEligible: true,
    confidenceLower: null,
    confidenceUpper: null,
    benchmarkCount: 1,
    sourceId: 'benchlm' as const,
    sourceModelId: `source-${index}`,
    sourceArtifactId: 'public-leaderboard',
  }));
  const metrics = models.flatMap((model, index) => [
    {
      modelKey: model.modelKey,
      metricKey: 'benchlm:overall:raw',
      category: 'overall',
      value: 90 - index,
      rawValue: 90 - index,
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
    },
  ]);
  return {
    revision: {
      revision: REVISION,
      generatedAt: CHECKED_AT,
      publishedAt: CHECKED_AT,
      checkedAt: CHECKED_AT,
      publicationState: 'published',
      contentHash: HASH,
      catalogRevision: CATALOG_REVISION,
      openrouterContentHash: HASH,
    },
    sources: [source],
    models,
    metrics,
    priceChecks: [],
    comparisonPairs: [],
  };
}

function manifest(): BenchmarkCandidateManifestV1 {
  return {
    schemaVersion: 1,
    cycleId: CYCLE_ID,
    frozenCatalogRevision: CATALOG_REVISION,
    previousBenchmarkRevision: 'benchmark-old',
    checkedAt: CHECKED_AT,
    benchLm: [],
    liteLlm: null,
    lmArenaRevision: null,
    lmArena: [],
    normalizedPartitions: [],
    derivedPartitions: [],
  };
}

function statement(sql: string, values: unknown[] = []) {
  return {
    sql,
    values,
    bind(...next: unknown[]) { return statement(sql, next); },
    async first<T>() { return null as T | null; },
    async all<T>() { return { results: [] as T[] }; },
    async run() { return { meta: { changes: 1 } }; },
  };
}

describe('final benchmark publication', () => {
  it('validates complete profiles and both cache variants for every required key', async () => {
    const candidate = snapshot();
    const cacheRevision = benchmarkCandidateCacheRevision(candidate, CYCLE_ID);
    const required = listRequiredBenchmarkCachePartitions(candidate);
    const cacheRows = required.flatMap((cacheKey) => ['fresh', 'stale'].map((variant) => ({
      cacheKey,
      variant,
      chunkIndex: 0,
      etag: `"${cacheKey}-${variant}"`,
      body: JSON.stringify({ revision: REVISION }),
    })));
    const db = {
      prepare(sql: string) {
        return {
          bind(..._values: unknown[]) {
            return {
              async first<T>() {
                if (sql.includes('FROM benchmark_revisions')) return {
                  state: 'pending', attempt: CYCLE_ID, catalogRevision: CATALOG_REVISION, contentHash: HASH,
                } as T;
                if (sql.includes('catalog_publication_state')) return { revision: CATALOG_REVISION } as T;
                if (sql.includes('COUNT(*)')) return { n: 2 } as T;
                return null;
              },
              async all<T>() {
                return { results: (sql.includes('api_response_entries') ? cacheRows : []) as T[] };
              },
              async run() { return { meta: { changes: 1 } }; },
            };
          },
        };
      },
      async batch() { return undefined; },
    } as unknown as PublicationD1Database;

    await expect(validateCompleteBenchmarkCandidate({
      db,
      cycleId: CYCLE_ID,
      revision: REVISION,
      cacheRevision,
      snapshot: candidate,
      manifest: manifest(),
      manifestHash: HASH,
    })).resolves.toEqual(expect.objectContaining({ modelCount: 2, profileCount: 2, cacheKeyCount: required.length }));
  });

  it('orders mutable directory work before benchmark and cache pointer movement in one batch', async () => {
    const candidate = snapshot();
    const batches: ReturnType<typeof statement>[][] = [];
    const db = {
      prepare(sql: string) {
        if (sql.includes('FROM benchmark_publication_state')) {
          return {
            ...statement(sql),
            bind() {
              return { ...statement(sql), async first<T>() { return { revision: 'benchmark-old', contentHash: HASH } as T; } };
            },
          };
        }
        if (sql.includes('FROM benchmark_popular_model_weeks')) {
          return {
            ...statement(sql),
            bind() {
              return { ...statement(sql), async first<T>() { return null as T | null; } };
            },
          };
        }
        return statement(sql);
      },
      async batch(statements: ReturnType<typeof statement>[]) { batches.push(statements); },
    } as PublicationD1Database;

    await expect(publishBenchmarkCandidate({
      db,
      cycleId: CYCLE_ID,
      cadenceKey: '2026-W33',
      revision: REVISION,
      cacheRevision: benchmarkCandidateCacheRevision(candidate, CYCLE_ID),
      manifestHash: HASH,
      snapshot: candidate,
      checkedAt: CHECKED_AT,
    })).resolves.toBe('published');

    expect(batches).toHaveLength(1);
    const sql = batches[0].map((entry) => entry.sql);
    const directory = sql.findIndex((value) => value.includes('INSERT INTO benchmark_model_directory'));
    const benchmarkPointer = sql.findIndex((value) => value.includes('INSERT INTO benchmark_publication_state'));
    const cachePointer = sql.findIndex((value) => value.includes('INSERT INTO api_response_publication_state'));
    expect(directory).toBeGreaterThanOrEqual(0);
    expect(benchmarkPointer).toBeGreaterThan(directory);
    expect(cachePointer).toBeGreaterThan(benchmarkPointer);
    expect(sql.some((value) => value.includes("state = 'published'"))).toBe(true);
  });

  it('atomically replaces an incomplete weekly snapshot and leaves complete weeks immutable', async () => {
    const candidate = snapshot();
    const publishWithRankCount = async (rankCount: number) => {
      const batches: ReturnType<typeof statement>[][] = [];
      const db = {
        prepare(sql: string) {
          if (sql.includes('FROM benchmark_publication_state')) {
            return {
              ...statement(sql),
              bind() {
                return { ...statement(sql), async first<T>() {
                  return { revision: 'benchmark-old', contentHash: HASH } as T;
                } };
              },
            };
          }
          if (sql.includes('FROM benchmark_popular_model_weeks')) {
            return {
              ...statement(sql),
              bind() {
                return { ...statement(sql), async first<T>() {
                  return { rankCount } as T;
                } };
              },
            };
          }
          return statement(sql);
        },
        async batch(statements: ReturnType<typeof statement>[]) { batches.push(statements); },
      } as PublicationD1Database;
      await publishBenchmarkCandidate({
        db,
        cycleId: CYCLE_ID,
        cadenceKey: '2026-W33',
        revision: REVISION,
        cacheRevision: benchmarkCandidateCacheRevision(candidate, CYCLE_ID),
        manifestHash: HASH,
        snapshot: candidate,
        checkedAt: CHECKED_AT,
      });
      return batches[0]!.map((entry) => entry.sql);
    };

    const partial = await publishWithRankCount(1);
    const deleteRanks = partial.findIndex((sql) => sql.includes('DELETE FROM benchmark_popular_model_ranks'));
    const replaceWeek = partial.findIndex((sql) => sql.includes('UPDATE benchmark_popular_model_weeks'));
    const insertRanks = partial.findIndex((sql) => sql.includes('INSERT INTO benchmark_popular_model_ranks'));
    expect(deleteRanks).toBeGreaterThanOrEqual(0);
    expect(replaceWeek).toBeGreaterThan(deleteRanks);
    expect(insertRanks).toBeGreaterThan(replaceWeek);
    expect(partial.filter((sql) => sql.includes('INSERT INTO benchmark_popular_model_ranks'))).toHaveLength(1);

    const complete = await publishWithRankCount(2);
    expect(complete.some((sql) => sql.includes('DELETE FROM benchmark_popular_model_ranks'))).toBe(false);
    expect(complete.some((sql) => sql.includes('UPDATE benchmark_popular_model_weeks'))).toBe(false);
    expect(complete.some((sql) => sql.includes('INSERT INTO benchmark_popular_model_ranks'))).toBe(false);
  });

  it('leaves pointers unchanged when the sole D1 batch fails', async () => {
    const candidate = snapshot();
    let activeBenchmark = 'benchmark-old';
    let activeCache = 'benchmark-old+cache-old';
    const db = {
      prepare(sql: string) {
        if (sql.includes('FROM benchmark_publication_state')) {
          return { ...statement(sql), bind() { return { ...statement(sql), async first<T>() {
            return { revision: activeBenchmark, contentHash: `sha256:${'b'.repeat(64)}` } as T;
          } }; } };
        }
        return statement(sql);
      },
      async batch() { throw new Error('D1 batch rolled back'); },
    } as PublicationD1Database;

    await expect(publishBenchmarkCandidate({
      db, cycleId: CYCLE_ID, cadenceKey: '2026-W33', revision: REVISION,
      cacheRevision: benchmarkCandidateCacheRevision(candidate, CYCLE_ID), manifestHash: HASH,
      snapshot: candidate, checkedAt: CHECKED_AT,
    })).rejects.toThrow('rolled back');
    expect(activeBenchmark).toBe('benchmark-old');
    expect(activeCache).toBe('benchmark-old+cache-old');
  });
});
