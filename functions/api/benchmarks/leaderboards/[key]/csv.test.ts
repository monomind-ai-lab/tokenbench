import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CachedLeaderboardPaginationProjection } from '../../../../../src/benchmarks/api-projections';
import { LEADERBOARD_DEFINITIONS, type LeaderboardEntry } from '../../../../../src/benchmarks/leaderboards';
import { onRequestGet as leaderboardJsonResponse } from '../[key]';
import { onRequestGet } from './csv';

const REVISION = 'benchmark-revision-1';
const CHECKED_AT = '2026-08-06T00:00:00.000Z';
const PUBLISHED_AT = '2026-08-06T00:05:00.000Z';

function entry({
  modelKey,
  name,
  provider,
  score,
  evidenceStatus = 'supported',
}: {
  readonly modelKey: string;
  readonly name: string;
  readonly provider: string;
  readonly score: number;
  readonly evidenceStatus?: 'supported' | 'estimated';
}): LeaderboardEntry {
  const metric = {
    modelKey,
    metricKey: 'benchlm:category:coding',
    category: 'coding',
    value: score,
    rank: null,
    lower: null,
    upper: null,
    voteCount: null,
    unit: 'score' as const,
    sourceId: 'benchlm' as const,
    sourceUpdatedAt: CHECKED_AT,
    sourceModelId: modelKey,
    sourceArtifactId: 'benchlm-coding',
    rankingEligible: evidenceStatus === 'supported',
    methodology: 'benchlm_raw_composite' as const,
    observationCount: null,
    sessionCount: null,
  };
  return {
    model: {
      modelKey,
      slug: modelKey,
      name,
      creator: provider,
      sourceType: 'Proprietary',
      reasoningType: null,
      releaseDate: null,
      contextWindowTokens: 128_000,
      evidenceStatus,
      rankingEligible: evidenceStatus === 'supported',
      confidenceLower: null,
      confidenceUpper: null,
      benchmarkCount: 1,
      sourceId: 'benchlm',
      sourceModelId: modelKey,
      sourceArtifactId: 'benchlm-models',
    },
    metric,
    metrics: [metric],
    primaryPrice: evidenceStatus === 'estimated' ? null : {
      modelKey,
      sourceId: 'openrouter',
      providerId: 'openrouter',
      inputUsdPerMillion: 1,
      cachedInputUsdPerMillion: null,
      outputUsdPerMillion: 5,
      contextWindowTokens: 128_000,
      verificationStatus: 'primary',
      routeId: `openrouter:${modelKey}`,
      sourceModelId: modelKey,
      canonicalSlug: modelKey,
      maxInputTokens: null,
      maxOutputTokens: null,
      inputModalities: ['text'],
      outputModalities: ['text'],
      supportedParameters: null,
      sourceArtifactId: 'openrouter-models',
    },
    blendedCostPerMillion: evidenceStatus === 'estimated' ? null : 3,
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

function projection(entries: readonly LeaderboardEntry[]): CachedLeaderboardPaginationProjection {
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
      entries,
    },
    entries,
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
                const variant = typeof cutoff === 'string' && cutoff <= CHECKED_AT ? 'fresh' : 'stale';
                const cacheKey = values[1];
                const body = typeof cacheKey === 'string' && cacheKey.startsWith('leaderboard-projection:')
                  ? bodies[variant]
                  : undefined;
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

async function csvResponse(path: string, fixture: ReturnType<typeof cacheDatabase>): Promise<Response> {
  return onRequestGet({
    request: new Request(`https://example.com${path}`),
    env: { CATALOG_DB: fixture.db },
    params: { key: 'llm-coding' },
  });
}

async function jsonResponse(path: string, fixture: ReturnType<typeof cacheDatabase>): Promise<Response> {
  return leaderboardJsonResponse({
    request: new Request(`https://example.com${path}`),
    env: { CATALOG_DB: fixture.db },
    params: { key: 'llm-coding' },
  });
}

afterEach(() => vi.useRealTimers());

describe('leaderboard CSV endpoint', () => {
  it('exports the complete filtered ordering with revision and publication headers', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-08-06T01:00:00.000Z');
    const fixture = cacheDatabase({ fresh: JSON.stringify(projection([
      entry({ modelKey: 'beta', name: 'Beta', provider: 'Provider B', score: 95 }),
      entry({ modelKey: 'alpha', name: 'Alpha', provider: 'Provider A', score: 90 }),
    ])) });

    const response = await csvResponse('/api/benchmarks/leaderboards/llm-coding/csv?provider=Provider%20A&sort=score-desc', fixture);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv; charset=utf-8');
    expect(response.headers.get('x-tokenbench-revision')).toBe(REVISION);
    expect(response.headers.get('x-tokenbench-published-at')).toBe(PUBLISHED_AT);
    expect(response.headers.get('x-tokenbench-methodology')).toBe('benchlm_raw_composite');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="tokenbench-llm-coding-2026-08-06-benchmark-revision-1.csv"',
    );
    expect(response.headers.get('x-tokenbench-freshness')).toBe('fresh');
    expect(await response.text()).toBe([
      'rank,model,provider,evidence_status,score,unit,metric_key,methodology,price_usd_per_million,context_window_tokens,model_key,slug,source_type',
      '1,Alpha,Provider A,supported,90,score,benchlm:category:coding,benchlm_raw_composite,3,128000,alpha,alpha,Proprietary',
      '',
    ].join('\r\n'));
    expect(fixture.calls).toHaveLength(1);
    expect(fixture.calls[0]?.sql).toContain('api_response_entries');
  });

  it('uses the same complete active filter and sort order as the UI, independent of page size', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-08-06T01:00:00.000Z');
    const fixture = cacheDatabase({ fresh: JSON.stringify(projection([
      entry({ modelKey: 'zeta', name: 'Alpha Zeta', provider: 'Provider A', score: 90 }),
      entry({ modelKey: 'alpha', name: 'Alpha', provider: 'Provider A', score: 90 }),
      entry({ modelKey: 'beta', name: 'Beta', provider: 'Provider B', score: 99 }),
    ])) });

    const response = await csvResponse('/api/benchmarks/leaderboards/llm-coding/csv?provider=Provider%20A&sort=score-desc&q=alpha', fixture);
    const lines = (await response.text()).trimEnd().split('\r\n');

    expect(response.status).toBe(200);
    expect(lines.slice(1).map((line) => line.split(',')[1])).toEqual(['Alpha', 'Alpha Zeta']);
    expect(lines).toHaveLength(3);
  });

  it.each([
    ['/api/benchmarks/leaderboards/llm-coding/csv?unknown=1'],
    ['/api/benchmarks/leaderboards/llm-coding/csv?sort=score-desc&sort=context-desc'],
    ['/api/benchmarks/leaderboards/llm-coding/csv?profile=not-real'],
    ['/api/benchmarks/leaderboards/llm-coding/csv?sort=context-desc&profile=not-real'],
    ['/api/benchmarks/leaderboards/llm-coding/csv?provider=Provider%20A&provider=Provider%20A'],
    ['/api/benchmarks/leaderboards/llm-coding/csv?q=%ZZ'],
  ])('returns a structured 400 for invalid, duplicate, or unsupported raw query %s', async (path) => {
    const fixture = cacheDatabase({ fresh: JSON.stringify(projection([entry({ modelKey: 'alpha', name: 'Alpha', provider: 'Provider A', score: 90 })])) });

    const response = await csvResponse(path, fixture);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid benchmark request' });
  });

  it('keeps stale publication metadata visible while serving the published snapshot', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-08-08T00:00:01.000Z');
    const fixture = cacheDatabase({ stale: JSON.stringify(projection([entry({ modelKey: 'alpha', name: 'Alpha', provider: 'Provider A', score: 90 })])) });

    const response = await csvResponse('/api/benchmarks/leaderboards/llm-coding/csv', fixture);

    expect(response.status).toBe(200);
    expect(response.headers.get('x-tokenbench-freshness')).toBe('stale');
    expect(response.headers.get('x-tokenbench-published-at')).toBe(PUBLISHED_AT);
    expect(await response.text()).toContain('Alpha');
  });

  it('returns unavailable when no complete projection has been atomically published', async () => {
    const fixture = cacheDatabase({});

    const response = await csvResponse('/api/benchmarks/leaderboards/llm-coding/csv', fixture);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'Benchmark data unavailable' });
  });

  it('makes the JSON leaderboard route reject a complete cache projection for another route', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-08-06T01:00:00.000Z');
    const validProjection = projection([entry({ modelKey: 'alpha', name: 'Alpha', provider: 'Provider A', score: 90 })]);
    const wrongRouteProjection = {
      ...validProjection,
      leaderboard: { ...validProjection.leaderboard, key: 'llm-overall' },
    };
    const fixture = cacheDatabase({ fresh: JSON.stringify(wrongRouteProjection) });

    const response = await jsonResponse('/api/benchmarks/leaderboards/llm-coding', fixture);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'Benchmark data unavailable' });
  });
});
