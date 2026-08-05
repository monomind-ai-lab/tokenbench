import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet as getBenchmarks } from './benchmarks';
import { onRequestGet as getLeaderboard } from './benchmarks/leaderboards/[key]';
import { onRequestGet as getModel } from './benchmarks/models/[slug]';

const REVISION = 'benchmark-revision-1';
const PUBLISHED_AT = '2026-08-05T00:00:00.000Z';
const CHECKED_AT = '2026-08-05T12:00:00.000Z';

const hash = (character: string) => `sha256:${character.repeat(64)}`;

const revision = {
  revision: REVISION,
  generated_at: '2026-08-05T11:30:00.000Z',
  published_at: PUBLISHED_AT,
  checked_at: CHECKED_AT,
  publication_state: 'published',
  content_hash: hash('a'),
  catalog_revision: 'catalog-revision-1',
  openrouter_content_hash: hash('b'),
};

const sources = [
  {
    revision: REVISION,
    source_id: 'benchlm',
    artifact_id: 'models',
    source_url: 'https://benchlm.ai/data/models.json',
    observed_at: '2026-08-05T11:00:00.000Z',
    etag: '"benchlm-models"',
    last_modified: null,
    upstream_revision: 'benchlm-r1',
    schema_version: '1.0',
    snapshot_key: 'benchmarks/benchlm/models-r1.json',
    content_hash: hash('c'),
    original_content_hash: hash('d'),
    license_id: 'MIT',
    attribution_text: 'BenchLM',
  },
  {
    revision: REVISION,
    source_id: 'lmarena',
    artifact_id: 'text-style-control',
    source_url: 'https://huggingface.co/datasets/lmarena-ai/leaderboard',
    observed_at: '2026-08-05T11:05:00.000Z',
    etag: null,
    last_modified: null,
    upstream_revision: 'arena-r1',
    schema_version: null,
    snapshot_key: 'benchmarks/lmarena/text-style-control-r1.json',
    content_hash: hash('e'),
    original_content_hash: hash('f'),
    license_id: 'CC-BY-4.0',
    attribution_text: 'LMArena',
  },
  {
    revision: REVISION,
    source_id: 'openrouter',
    artifact_id: 'catalog-models',
    source_url: 'https://openrouter.ai/api/v1/models',
    observed_at: '2026-08-05T11:10:00.000Z',
    etag: '"openrouter-r1"',
    last_modified: null,
    upstream_revision: 'catalog-r1',
    schema_version: null,
    snapshot_key: 'catalog/openrouter/models-r1.json',
    content_hash: hash('0'),
    original_content_hash: hash('1'),
    license_id: 'OpenRouter-ToS',
    attribution_text: 'OpenRouter',
  },
];

const models = [
  {
    revision: REVISION,
    model_key: 'provider:alpha',
    slug: 'alpha',
    name: 'Alpha',
    creator: 'Provider',
    source_type: 'Proprietary',
    reasoning_type: null,
    release_date: null,
    context_window_tokens: null,
    evidence_status: 'supported',
    ranking_eligible: 1,
    confidence_lower: null,
    confidence_upper: null,
    benchmark_count: 2,
    source_id: 'benchlm',
    source_model_id: 'provider/alpha',
    source_artifact_id: 'models',
  },
  {
    revision: REVISION,
    model_key: 'provider:beta',
    slug: 'beta',
    name: 'Beta',
    creator: 'Provider',
    source_type: 'Proprietary',
    reasoning_type: 'Reasoning',
    release_date: '2026-07-01',
    context_window_tokens: 128_000,
    evidence_status: 'supported',
    ranking_eligible: 1,
    confidence_lower: 0,
    confidence_upper: 0,
    benchmark_count: 2,
    source_id: 'benchlm',
    source_model_id: 'provider/beta',
    source_artifact_id: 'models',
  },
  {
    revision: REVISION,
    model_key: 'provider:estimated',
    slug: 'estimated',
    name: 'Estimated',
    creator: 'Provider',
    source_type: 'Unknown',
    reasoning_type: null,
    release_date: null,
    context_window_tokens: null,
    evidence_status: 'estimated',
    ranking_eligible: 0,
    confidence_lower: null,
    confidence_upper: null,
    benchmark_count: 1,
    source_id: 'benchlm',
    source_model_id: 'provider/estimated',
    source_artifact_id: 'models',
  },
  {
    revision: REVISION,
    model_key: 'provider:wrong-lens',
    slug: 'wrong-lens',
    name: 'Wrong lens',
    creator: 'Provider',
    source_type: 'Unknown',
    reasoning_type: null,
    release_date: null,
    context_window_tokens: null,
    evidence_status: 'estimated',
    ranking_eligible: 0,
    confidence_lower: null,
    confidence_upper: null,
    benchmark_count: 1,
    source_id: 'benchlm',
    source_model_id: 'provider/wrong-lens',
    source_artifact_id: 'models',
  },
  {
    revision: REVISION,
    model_key: 'lmarena:arena',
    slug: 'arena',
    name: 'Arena',
    creator: 'LMArena',
    source_type: 'Unknown',
    reasoning_type: null,
    release_date: null,
    context_window_tokens: null,
    evidence_status: 'source_only',
    ranking_eligible: 1,
    confidence_lower: null,
    confidence_upper: null,
    benchmark_count: 1,
    source_id: 'lmarena',
    source_model_id: 'arena',
    source_artifact_id: 'text-style-control',
  },
];

const metrics = [
  {
    revision: REVISION,
    model_key: 'provider:alpha',
    metric_key: 'benchlm:overall:raw',
    category: 'overall',
    value: 90,
    rank: null,
    lower_bound: null,
    upper_bound: null,
    vote_count: null,
    unit: 'score',
    source_id: 'benchlm',
    source_updated_at: '2026-08-05T10:00:00.000Z',
    source_model_id: 'provider/alpha',
    source_artifact_id: 'models',
    ranking_eligible: 1,
    methodology: 'benchlm_raw_composite',
    observation_count: null,
    session_count: null,
  },
  {
    revision: REVISION,
    model_key: 'provider:beta',
    metric_key: 'benchlm:overall:raw',
    category: 'overall',
    value: 80,
    rank: null,
    lower_bound: null,
    upper_bound: null,
    vote_count: null,
    unit: 'score',
    source_id: 'benchlm',
    source_updated_at: '2026-08-05T10:00:00.000Z',
    source_model_id: 'provider/beta',
    source_artifact_id: 'models',
    ranking_eligible: 1,
    methodology: 'benchlm_raw_composite',
    observation_count: null,
    session_count: null,
  },
  {
    revision: REVISION,
    model_key: 'provider:estimated',
    metric_key: 'benchlm:overall:raw',
    category: 'overall',
    value: 99,
    rank: null,
    lower_bound: null,
    upper_bound: null,
    vote_count: null,
    unit: 'score',
    source_id: 'benchlm',
    source_updated_at: '2026-08-05T10:00:00.000Z',
    source_model_id: 'provider/estimated',
    source_artifact_id: 'models',
    ranking_eligible: 0,
    methodology: 'benchlm_raw_composite',
    observation_count: null,
    session_count: null,
  },
  {
    revision: REVISION,
    model_key: 'provider:wrong-lens',
    metric_key: 'benchlm:category:reasoning',
    category: 'reasoning',
    value: 100,
    rank: null,
    lower_bound: null,
    upper_bound: null,
    vote_count: null,
    unit: 'score',
    source_id: 'benchlm',
    source_updated_at: '2026-08-05T10:00:00.000Z',
    source_model_id: 'provider/wrong-lens',
    source_artifact_id: 'models',
    ranking_eligible: 0,
    methodology: 'benchlm_raw_composite',
    observation_count: null,
    session_count: null,
  },
  {
    revision: REVISION,
    model_key: 'lmarena:arena',
    metric_key: 'lmarena:text_style_control:overall',
    category: 'overall',
    value: 1_200,
    rank: 1,
    lower_bound: null,
    upper_bound: null,
    vote_count: 100,
    unit: 'arena_score',
    source_id: 'lmarena',
    source_updated_at: '2026-08-05T10:00:00.000Z',
    source_model_id: 'arena',
    source_artifact_id: 'text-style-control',
    ranking_eligible: 1,
    methodology: 'bradley_terry',
    observation_count: null,
    session_count: null,
  },
];

const prices = [
  {
    revision: REVISION,
    model_key: 'provider:alpha',
    source_id: 'openrouter',
    provider_id: 'openrouter',
    route_id: 'openrouter:provider/alpha',
    source_model_id: 'provider/alpha',
    canonical_slug: 'alpha',
    input_usd_per_million: 0,
    cached_input_usd_per_million: null,
    output_usd_per_million: 4,
    context_window_tokens: null,
    max_input_tokens: null,
    max_output_tokens: 16_000,
    input_modalities_json: JSON.stringify(['text']),
    output_modalities_json: JSON.stringify(['text']),
    supported_parameters_json: null,
    source_artifact_id: 'catalog-models',
    verification_status: 'primary',
  },
  {
    revision: REVISION,
    model_key: 'provider:beta',
    source_id: 'openrouter',
    provider_id: 'openrouter',
    route_id: 'openrouter:provider/beta',
    source_model_id: 'provider/beta',
    canonical_slug: 'beta',
    input_usd_per_million: 1,
    cached_input_usd_per_million: null,
    output_usd_per_million: 3,
    context_window_tokens: 128_000,
    max_input_tokens: null,
    max_output_tokens: null,
    input_modalities_json: JSON.stringify(['text']),
    output_modalities_json: JSON.stringify(['text']),
    supported_parameters_json: JSON.stringify(['tools']),
    source_artifact_id: 'catalog-models',
    verification_status: 'primary',
  },
];

const pairs = [
  {
    revision: REVISION,
    pair_slug: 'alpha-vs-beta',
    model_a_key: 'provider:alpha',
    model_b_key: 'provider:beta',
    indexable: 1,
    eligibility_reason: 'Reviewed comparison pair',
    featured_rank: 1,
    shared_metric_count: 2,
  },
];

type D1Rows = {
  revision: unknown[];
  sources: unknown[];
  models: unknown[];
  metrics: unknown[];
  prices: unknown[];
  pairs: unknown[];
};

function publishedRows(overrides: Partial<D1Rows> = {}): D1Rows {
  return {
    revision: [revision],
    sources,
    models,
    metrics,
    prices,
    pairs,
    ...overrides,
  };
}

function d1(rows: D1Rows) {
  const bindings: Array<{ sql: string; values: unknown[] }> = [];
  return {
    bindings,
    prepare(sql: string) {
      const key = sql.includes('benchmark_publication_state') ? 'revision'
        : sql.includes('benchmark_source_records') ? 'sources'
          : sql.includes('benchmark_models') ? 'models'
            : sql.includes('benchmark_metrics') ? 'metrics'
              : sql.includes('benchmark_price_checks') ? 'prices'
                : 'pairs';
      return {
        bind(...values: unknown[]) {
          bindings.push({ sql, values });
          return { all: async () => ({ results: rows[key] }) };
        },
      };
    },
  };
}

async function summary(rows = publishedRows(), headers?: HeadersInit): Promise<Response> {
  return getBenchmarks({
    request: new Request('https://example.com/api/benchmarks', { headers }),
    env: { CATALOG_DB: d1(rows) },
  });
}

async function leaderboard(
  key: string,
  query = '',
  rows = publishedRows(),
  headers?: HeadersInit,
): Promise<Response> {
  return getLeaderboard({
    request: new Request(`https://example.com/api/benchmarks/leaderboards/${key}${query}`, { headers }),
    env: { CATALOG_DB: d1(rows) },
    params: { key },
  });
}

async function model(slug: string, rows = publishedRows(), headers?: HeadersInit): Promise<Response> {
  return getModel({
    request: new Request(`https://example.com/api/benchmarks/models/${slug}`, { headers }),
    env: { CATALOG_DB: d1(rows) },
    params: { slug },
  });
}

afterEach(() => vi.useRealTimers());

describe('cached benchmark APIs', () => {
  it('returns the exact JSON envelope and deterministic active-revision availability metadata', async () => {
    const response = await summary();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
    const body = await response.json() as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['attribution', 'data', 'freshness', 'publishedAt', 'revision']);
    expect(body).toMatchObject({
      revision: REVISION,
      publishedAt: PUBLISHED_AT,
      freshness: { status: 'fresh', checkedAt: CHECKED_AT },
      data: {
        sources: expect.arrayContaining([
          expect.objectContaining({ sourceId: 'benchlm', available: true }),
          expect.objectContaining({ sourceId: 'litellm', available: false }),
        ]),
        routes: expect.arrayContaining([
          expect.objectContaining({ key: 'llm-overall', available: true }),
          expect.objectContaining({ key: 'media-text-to-image', available: false }),
        ]),
      },
    });
  });

  it('uses an exact ETag and returns 304 for a matching benchmark response', async () => {
    const first = await summary();
    const etag = first.headers.get('etag');
    const response = await summary(publishedRows(), { 'If-None-Match': etag! });

    expect(etag).toMatch(/^".+"$/);
    expect(response.status).toBe(304);
    await expect(response.text()).resolves.toBe('');
  });

  it('normalizes query defaults and ordering before calculating leaderboard ETags', async () => {
    const defaultResponse = await leaderboard('llm-overall');
    const explicitResponse = await leaderboard('llm-overall', '?cursor=&limit=50&profile=balanced');
    const reorderedResponse = await leaderboard('llm-overall', '?profile=balanced&limit=50');

    expect(defaultResponse.headers.get('etag')).toBe(explicitResponse.headers.get('etag'));
    expect(defaultResponse.headers.get('etag')).toBe(reorderedResponse.headers.get('etag'));
  });

  it('stays fresh at exactly 36 hours and becomes stale strictly beyond it', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse(CHECKED_AT) + 36 * 60 * 60 * 1000);
    const boundary = await summary();
    vi.setSystemTime(Date.parse(CHECKED_AT) + 36 * 60 * 60 * 1000 + 1);
    const stale = await summary();

    await expect(boundary.json()).resolves.toMatchObject({ freshness: { status: 'fresh' } });
    await expect(stale.json()).resolves.toMatchObject({ freshness: {
      status: 'stale',
      message: 'Published benchmark revision has not refreshed within 36 hours.',
    } });
  });

  it('returns a generic unavailable response when no active published revision exists', async () => {
    const response = await summary(publishedRows({ revision: [] }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'Benchmark data unavailable' });
  });

  it.each([
    ['unknown leaderboard route', 'not-a-route', ''],
    ['unsupported workload profile', 'llm-overall', '?profile=fast'],
    ['non-enabled estimated flag', 'llm-overall', '?includeEstimated=0'],
    ['estimated flag on pricing-only route', 'llm-pricing-context', '?includeEstimated=1'],
    ['estimated flag on pure LMArena route', 'llm-human-preference', '?includeEstimated=1'],
  ])('rejects %s without exposing implementation details', async (_caseName, key, query) => {
    const response = await leaderboard(key, query);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid benchmark request' });
  });

  it('defaults page size to 50 and enforces the safe limit ceiling of 200', async () => {
    const defaultResponse = await leaderboard('llm-overall');
    const maxResponse = await leaderboard('llm-overall', '?limit=200');
    const tooLarge = await leaderboard('llm-overall', '?limit=201');

    await expect(defaultResponse.json()).resolves.toMatchObject({ data: { pagination: { limit: 50 } } });
    await expect(maxResponse.json()).resolves.toMatchObject({ data: { pagination: { limit: 200 } } });
    expect(tooLarge.status).toBe(400);
  });

  it('paginates in stable order with a deterministic opaque cursor and rejects invalid cursors', async () => {
    const first = await leaderboard('llm-overall', '?limit=1');
    const firstBody = await first.json() as { data: { entries: Array<{ model: { slug: string } }>; pagination: { nextCursor: string | null } } };
    const repeated = await leaderboard('llm-overall', '?limit=1');
    const repeatedBody = await repeated.json() as { data: { pagination: { nextCursor: string | null } } };
    const second = await leaderboard('llm-overall', `?limit=1&cursor=${encodeURIComponent(firstBody.data.pagination.nextCursor!)}`);
    const secondBody = await second.json() as { data: { entries: Array<{ model: { slug: string } }>; pagination: { nextCursor: string | null } } };
    const invalid = await leaderboard('llm-overall', '?limit=1&cursor=not-a-cursor');

    expect(firstBody.data.entries.map((entry) => entry.model.slug)).toEqual(['alpha']);
    expect(firstBody.data.pagination.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(repeatedBody.data.pagination.nextCursor).toBe(firstBody.data.pagination.nextCursor);
    expect(secondBody.data.entries.map((entry) => entry.model.slug)).toEqual(['beta']);
    expect(secondBody.data.pagination.nextCursor).toBeNull();
    expect(invalid.status).toBe(400);
  });

  it('returns 404 for an unknown active-revision model slug', async () => {
    const response = await model('does-not-exist');

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Benchmark model not found' });
  });

  it('returns exact model evidence without dropping deliberate nulls or literal zeroes', async () => {
    const response = await model('alpha');
    const body = await response.json() as { data: {
      model: Record<string, unknown>;
      metrics: Array<Record<string, unknown>>;
      priceChecks: Array<Record<string, unknown>>;
      comparisonPairs: Array<Record<string, unknown>>;
    } };

    expect(response.status).toBe(200);
    expect(body.data.model).toMatchObject({ reasoningType: null, contextWindowTokens: null });
    expect(body.data.metrics[0]).toMatchObject({ lower: null, upper: null });
    expect(body.data.priceChecks[0]).toMatchObject({ inputUsdPerMillion: 0, cachedInputUsdPerMillion: null });
    expect(body.data.comparisonPairs).toEqual([expect.objectContaining({ pairSlug: 'alpha-vs-beta' })]);
  });

  it.each([
    ['a row from another revision', publishedRows({ models: [{ ...models[0], revision: 'other-revision' }] })],
    ['a model referring to an unrecorded source artifact', publishedRows({ models: [{ ...models[0], source_artifact_id: 'missing-artifact' }] })],
  ])('rejects %s before deriving output', async (_caseName, rows) => {
    const response = await leaderboard('llm-overall', '', rows);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'Benchmark data unavailable' });
  });

  it('uses only registered route lenses and appends safe BenchLM estimates after supported rows', async () => {
    const normal = await leaderboard('llm-overall');
    const extended = await leaderboard('llm-overall', '?includeEstimated=1');
    const extendedBody = await extended.json() as { data: { entries: Array<{
      model: { slug: string; evidenceStatus: string };
      primaryPrice: unknown;
      blendedCostPerMillion: unknown;
      sourceRank: unknown;
      onValueFrontier: boolean;
    }> } };

    await expect(normal.json()).resolves.toMatchObject({ data: { entries: [
      expect.objectContaining({ model: expect.objectContaining({ slug: 'alpha' }) }),
      expect.objectContaining({ model: expect.objectContaining({ slug: 'beta' }) }),
    ] } });
    expect(extendedBody.data.entries.map((entry) => entry.model.slug)).toEqual(['alpha', 'beta', 'estimated']);
    expect(extendedBody.data.entries[2]).toMatchObject({
      model: { evidenceStatus: 'estimated' },
      primaryPrice: null,
      blendedCostPerMillion: null,
      sourceRank: null,
      onValueFrontier: false,
    });
  });

  it('attributes every displayed metric and hosted price source, including OpenRouter value evidence', async () => {
    const response = await leaderboard('llm-value');
    const body = await response.json() as { attribution: Array<{ sourceId: string }>; data: { entries: unknown[] } };

    expect(body.data.entries).toHaveLength(2);
    expect(body.attribution.map((item) => item.sourceId).sort()).toEqual(['benchlm', 'openrouter']);
  });

  it('never fetches an upstream source while serving a benchmark request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      const response = await leaderboard('llm-overall');
      expect(response.status).toBe(200);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
