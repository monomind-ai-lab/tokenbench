import { describe, expect, it } from 'vitest';
import type { CachedLeaderboardPaginationProjection } from '../../src/benchmarks/api-projections';
import { LEADERBOARD_DEFINITIONS, type LeaderboardEntry } from '../../src/benchmarks/leaderboards';
import { readCompleteLeaderboardProjection } from './benchmark-leaderboard-projection';

const REVISION = 'benchmark-revision-1';
const CHECKED_AT = '2026-08-06T00:00:00.000Z';
const PUBLISHED_AT = '2026-08-06T00:05:00.000Z';

function entry(): LeaderboardEntry {
  const metric = {
    modelKey: 'alpha',
    metricKey: 'benchlm:category:coding',
    category: 'coding',
    value: 90,
    rank: null,
    lower: null,
    upper: null,
    voteCount: null,
    unit: 'score' as const,
    sourceId: 'benchlm' as const,
    sourceUpdatedAt: CHECKED_AT,
    sourceModelId: 'alpha',
    sourceArtifactId: 'benchlm-coding',
    rankingEligible: true,
    methodology: 'benchlm_raw_composite' as const,
    observationCount: null,
    sessionCount: null,
  };
  return {
    model: {
      modelKey: 'alpha',
      slug: 'alpha',
      name: 'Alpha',
      creator: 'Provider A',
      sourceType: 'Proprietary',
      reasoningType: null,
      releaseDate: null,
      contextWindowTokens: 128_000,
      evidenceStatus: 'supported',
      rankingEligible: true,
      confidenceLower: null,
      confidenceUpper: null,
      benchmarkCount: 1,
      sourceId: 'benchlm',
      sourceModelId: 'alpha',
      sourceArtifactId: 'benchlm-models',
    },
    metric,
    metrics: [metric],
    primaryPrice: {
      modelKey: 'alpha',
      sourceId: 'openrouter',
      providerId: 'openrouter',
      inputUsdPerMillion: 1,
      cachedInputUsdPerMillion: null,
      outputUsdPerMillion: 5,
      contextWindowTokens: 128_000,
      verificationStatus: 'primary',
      routeId: 'openrouter:alpha',
      sourceModelId: 'alpha',
      canonicalSlug: 'alpha',
      maxInputTokens: null,
      maxOutputTokens: null,
      inputModalities: ['text'],
      outputModalities: ['text'],
      supportedParameters: null,
      sourceArtifactId: 'openrouter-models',
    },
    blendedCostPerMillion: 3,
    contextWindowTokens: 128_000,
    sourceRank: null,
    onValueFrontier: false,
  };
}

function source(sourceId: 'benchlm' | 'openrouter', artifactId: string) {
  return {
    sourceId,
    artifactId,
    sourceUrl: sourceId === 'benchlm' ? 'https://benchlm.ai/data' : 'https://openrouter.ai/models',
    observedAt: CHECKED_AT,
    etag: null,
    lastModified: null,
    upstreamRevision: null,
    schemaVersion: 'v1',
    snapshotKey: `snapshots/${artifactId}.json`,
    contentHash: `sha256:${'a'.repeat(64)}`,
    originalContentHash: `sha256:${'b'.repeat(64)}`,
    licenseId: sourceId === 'benchlm' ? 'MIT' as const : 'OpenRouter-ToS' as const,
    attributionText: sourceId === 'benchlm' ? 'Data from BenchLM.ai' : 'Catalog and pricing data from OpenRouter',
  };
}

function projection(): CachedLeaderboardPaginationProjection {
  const rows = [entry()];
  return {
    revision: {
      revision: REVISION,
      generatedAt: CHECKED_AT,
      publishedAt: PUBLISHED_AT,
      checkedAt: CHECKED_AT,
      publicationState: 'published',
      contentHash: `sha256:${'c'.repeat(64)}`,
      catalogRevision: 'catalog-revision-1',
      openrouterContentHash: `sha256:${'d'.repeat(64)}`,
    },
    sources: [
      source('benchlm', 'benchlm-models'),
      source('benchlm', 'benchlm-coding'),
      source('openrouter', 'openrouter-models'),
    ],
    leaderboard: {
      key: 'llm-coding',
      profile: 'balanced',
      definition: LEADERBOARD_DEFINITIONS['llm-coding'],
      entries: rows,
    },
    entries: rows,
  };
}

interface CacheFixture {
  readonly fresh?: string;
  readonly stale?: string;
}

function cacheDatabase(bodies: CacheFixture) {
  const calls: Array<{ readonly sql: string; readonly values: readonly unknown[] }> = [];
  return {
    calls,
    db: {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            calls.push({ sql, values });
            return {
              all: async () => {
                const cutoff = values[2];
                const useFresh = typeof cutoff === 'string' && cutoff <= CHECKED_AT;
                const variant = useFresh ? 'fresh' : 'stale';
                const body = bodies[variant];
                return {
                  results: body === undefined ? [] : [{
                    revision: REVISION,
                    variant,
                    chunk_index: 0,
                    etag: `"${variant}-projection"`,
                    body,
                  }],
                };
              },
            };
          },
        };
      },
    },
  };
}

describe('complete leaderboard projection cache reader', () => {
  it('reads the complete active projection once without scanning benchmark fact tables', async () => {
    const fixture = cacheDatabase({ fresh: JSON.stringify(projection()) });

    const result = await readCompleteLeaderboardProjection(
      fixture.db,
      'llm-coding',
      'balanced',
      false,
      Date.parse('2026-08-06T01:00:00.000Z'),
    );

    expect(fixture.calls).toHaveLength(1);
    expect(fixture.calls[0]?.sql).toContain('api_response_entries');
    expect(fixture.calls[0]?.sql).not.toContain('benchmark_models');
    expect(fixture.calls[0]?.values.slice(0, 2)).toEqual([
      'benchmarks',
      'leaderboard-projection:llm-coding:balanced:0',
    ]);
    expect(result).toMatchObject({
      revision: REVISION,
      publishedAt: PUBLISHED_AT,
      freshness: { status: 'fresh', checkedAt: CHECKED_AT },
      data: {
        key: 'llm-coding',
        profile: 'balanced',
        entries: [{ model: { name: 'Alpha' }, metric: { value: 90 } }],
      },
    });
  });

  it('preserves the selected stale envelope metadata', async () => {
    const fixture = cacheDatabase({ stale: JSON.stringify(projection()) });

    const result = await readCompleteLeaderboardProjection(
      fixture.db,
      'llm-coding',
      'balanced',
      false,
      Date.parse('2026-08-08T00:00:01.000Z'),
    );

    expect(result?.freshness).toEqual({
      status: 'stale',
      checkedAt: CHECKED_AT,
      message: 'Published benchmark revision has not refreshed within 36 hours.',
    });
    expect(result?.publishedAt).toBe(PUBLISHED_AT);
  });

  it('fails closed for corrupted cache bytes or a mismatched cache revision', async () => {
    const malformed = cacheDatabase({ fresh: '{not-json' });
    const validProjection = projection();
    const wrongRevision = {
      ...validProjection,
      revision: { ...validProjection.revision, revision: 'other-revision' },
    };
    const mismatched = cacheDatabase({ fresh: JSON.stringify(wrongRevision) });

    await expect(readCompleteLeaderboardProjection(
      malformed.db,
      'llm-coding',
      'balanced',
      false,
      Date.parse('2026-08-06T01:00:00.000Z'),
    )).rejects.toThrow(/cached leaderboard/i);
    await expect(readCompleteLeaderboardProjection(
      mismatched.db,
      'llm-coding',
      'balanced',
      false,
      Date.parse('2026-08-06T01:00:00.000Z'),
    )).rejects.toThrow(/revision/i);
  });

  it('returns null when the complete projection is not published', async () => {
    const fixture = cacheDatabase({});

    await expect(readCompleteLeaderboardProjection(
      fixture.db,
      'llm-coding',
      'balanced',
      false,
      Date.parse('2026-08-06T01:00:00.000Z'),
    )).resolves.toBeNull();
  });
});
