import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readActiveBenchmarkSnapshot,
  encodeOpaqueValue,
  type ActiveBenchmarkSnapshot,
} from '../_shared/benchmark-db';
import {
  buildBenchmarkSummaryData,
  onRequestGet as getBenchmarks,
} from './benchmarks';
import {
  buildBenchmarkSummaryData as buildCanonicalBenchmarkSummaryData,
  cachedLeaderboardPaginationProjection,
  effectiveLeaderboardProfile,
  materializeLeaderboard,
} from '../../src/benchmarks/api-projections';
import { benchmarkLeaderboardProjectionCacheKey } from '../../src/benchmarks/api-response-cache-keys';
import { LEADERBOARD_ROUTES, type LeaderboardKey } from '../../src/routing/routes';
import { isWorkloadProfile } from '../../src/benchmarks/value';
import { onRequestGet as getLeaderboard } from './benchmarks/leaderboards/[key]';
import { onRequestGet as getModel } from './benchmarks/models/[slug]';

const REVISION = 'benchmark-revision-1';
const PUBLISHED_AT = '2026-08-05T00:00:00.000Z';
const CHECKED_AT = '2026-08-05T12:00:00.000Z';
const CATALOG_REVISION = 'catalog-revision-1';

const hash = (character: string) => `sha256:${character.repeat(64)}`;
const OPENROUTER_CONTENT_HASH = hash('0');
const OPENROUTER_ARTIFACT_ID = `catalog:${CATALOG_REVISION}`;
const REVISION_CONTENT_HASH = `sha256:${createHash('sha256').update(JSON.stringify({
  catalogRevision: CATALOG_REVISION,
  openrouterContentHash: OPENROUTER_CONTENT_HASH,
  artifacts: [
    { sourceId: 'benchlm', artifactId: 'models', contentHash: hash('c') },
    { sourceId: 'lmarena', artifactId: 'text-style-control', contentHash: hash('e') },
    { sourceId: 'openrouter', artifactId: OPENROUTER_ARTIFACT_ID, contentHash: OPENROUTER_CONTENT_HASH },
  ],
})).digest('hex')}`;

function countedArrayReads<T>(values: readonly T[]): { readonly array: readonly T[]; readonly reads: () => number } {
  let reads = 0;
  const array = new Proxy([...values], {
    get(target, property, receiver) {
      if (typeof property === 'string' && /^\d+$/.test(property)) reads += 1;
      return Reflect.get(target, property, receiver) as unknown;
    },
  });
  return { array, reads: () => reads };
}

const revision = {
  revision: REVISION,
  generated_at: '2026-08-05T11:30:00.000Z',
  published_at: PUBLISHED_AT,
  checked_at: CHECKED_AT,
  publication_state: 'published',
  content_hash: REVISION_CONTENT_HASH,
  catalog_revision: CATALOG_REVISION,
  openrouter_content_hash: OPENROUTER_CONTENT_HASH,
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
    artifact_id: OPENROUTER_ARTIFACT_ID,
    source_url: 'https://openrouter.ai/api/v1/models',
    observed_at: '2026-08-05T11:10:00.000Z',
    etag: '"openrouter-r1"',
    last_modified: null,
    upstream_revision: CATALOG_REVISION,
    schema_version: null,
    snapshot_key: 'catalog/openrouter/models-r1.json',
    content_hash: OPENROUTER_CONTENT_HASH,
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
    source_artifact_id: OPENROUTER_ARTIFACT_ID,
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
    source_artifact_id: OPENROUTER_ARTIFACT_ID,
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
  activeRevision: string | null;
  revisions: unknown[];
  sources: unknown[];
  models: unknown[];
  metrics: unknown[];
  prices: unknown[];
  pairs: unknown[];
  apiCacheEntries?: readonly ApiCacheEntry[];
};

interface ApiCacheEntry {
  readonly scope: 'benchmarks';
  readonly revision: string;
  readonly cacheKey: string;
  readonly variant: 'fresh' | 'stale';
  readonly chunkIndex: number;
  readonly etag: string;
  readonly body: string;
}

function publishedRows(overrides: Partial<D1Rows> = {}): D1Rows {
  return {
    activeRevision: REVISION,
    revisions: [revision],
    sources,
    models,
    metrics,
    prices,
    pairs,
    ...overrides,
  };
}

interface FakeD1Options {
  readonly bypassFactRevisionFilter?: boolean;
  /** Proves a materialized response path never falls back to the full fact snapshot. */
  readonly failOnBenchmarkFactRead?: boolean;
}

function d1(rows: D1Rows, options: FakeD1Options = {}) {
  const bindings: Array<{ sql: string; values: unknown[] }> = [];
  return {
    bindings,
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          bindings.push({ sql, values });
          return { all: async () => {
            if (sql.includes('api_response_entries')) {
              const [scope, cacheKey, cutoff] = values;
              const historical = sql.includes('complete_revisions');
              const checkedAt = rows.revisions.find((candidate) => {
                if (!candidate || typeof candidate !== 'object') return false;
                const record = candidate as Record<string, unknown>;
                return record.revision === rows.activeRevision && record.publication_state === 'published';
              }) as Record<string, unknown> | undefined;
              const variant = checkedAt && typeof checkedAt.checked_at === 'string' && typeof cutoff === 'string'
                && checkedAt.checked_at >= cutoff
                ? 'fresh'
                : 'stale';
              let entries: readonly ApiCacheEntry[] | undefined;
              if (scope === 'benchmarks' && historical) {
                const revisionsByNewest = rows.revisions
                  .filter((candidate): candidate is Record<string, unknown> => (
                    candidate !== null && typeof candidate === 'object'
                  ))
                  .slice()
                  .sort((left, right) => String(right.checked_at).localeCompare(String(left.checked_at))
                    || String(right.revision).localeCompare(String(left.revision)));
                const newestRevision = revisionsByNewest.find((candidate) => rows.apiCacheEntries?.some((entry) => (
                  entry.revision === candidate.revision
                    && entry.cacheKey === cacheKey
                    && entry.variant === 'stale'
                )))?.revision;
                entries = rows.apiCacheEntries?.filter((candidate) => candidate.revision === newestRevision
                  && candidate.cacheKey === cacheKey
                  && candidate.variant === 'stale');
              } else if (scope === 'benchmarks' && checkedAt) {
                entries = rows.apiCacheEntries?.filter((candidate) => candidate.revision === rows.activeRevision
                  && candidate.cacheKey === cacheKey
                  && candidate.variant === variant);
              }
              entries = entries?.slice().sort((left, right) => left.chunkIndex - right.chunkIndex);
              return {
                results: entries?.map((entry) => ({
                  revision: entry.revision,
                  variant: entry.variant,
                  chunk_index: entry.chunkIndex,
                  etag: entry.etag,
                  body: entry.body,
                })) ?? [],
              };
            }
            if (sql.includes('benchmark_publication_state')) {
              const joined = rows.revisions.find((candidate) => {
                if (!candidate || typeof candidate !== 'object') return false;
                const record = candidate as Record<string, unknown>;
                return record.revision === rows.activeRevision && record.publication_state === 'published';
              });
              return { results: joined ? [joined] : [] };
            }
            if (options.failOnBenchmarkFactRead) {
              throw new Error('full benchmark fact snapshot must not be read');
            }
            const key = sql.includes('benchmark_source_records') ? 'sources'
              : sql.includes('benchmark_models') ? 'models'
                : sql.includes('benchmark_metrics') ? 'metrics'
                  : sql.includes('benchmark_price_checks') ? 'prices'
                    : 'pairs';
            const results = options.bypassFactRevisionFilter
              ? rows[key]
              : rows[key].filter((candidate) => {
                if (!candidate || typeof candidate !== 'object') return false;
                return (candidate as Record<string, unknown>).revision === values[0];
              });
            return { results };
          } };
        },
      };
    },
  };
}

async function summary(rows = publishedRows(), headers?: HeadersInit, options?: FakeD1Options): Promise<Response> {
  return getBenchmarks({
    request: new Request('https://example.com/api/benchmarks', { headers }),
    env: { CATALOG_DB: d1(rows, options) },
  });
}

async function leaderboard(
  key: string,
  query = '',
  rows = publishedRows(),
  headers?: HeadersInit,
  options?: FakeD1Options,
): Promise<Response> {
  let projectedRows = rows;
  if (Object.prototype.hasOwnProperty.call(LEADERBOARD_ROUTES, key)) {
    const url = new URL(`https://example.com/api/benchmarks/leaderboards/${key}${query}`);
    const profileValue = url.searchParams.get('profile') ?? 'balanced';
    if (isWorkloadProfile(profileValue)) {
      try {
        const snapshot = await readActiveBenchmarkSnapshot(d1(rows));
        if (snapshot) {
          const routeKey = key as LeaderboardKey;
          const includeEstimated = url.searchParams.get('includeEstimated') === '1'
            || url.searchParams.get('estimated') === '1';
          const derivationProfile = effectiveLeaderboardProfile(routeKey, profileValue);
          const projection = cachedLeaderboardPaginationProjection(
            snapshot,
            materializeLeaderboard(snapshot, routeKey, derivationProfile, includeEstimated),
          );
          const cacheKey = benchmarkLeaderboardProjectionCacheKey({
            key: routeKey,
            profile: derivationProfile,
            includeEstimated,
          });
          const projectionEntries: readonly ApiCacheEntry[] = (['fresh', 'stale'] as const).map((variant) => ({
            scope: 'benchmarks',
            revision: snapshot.revision.revision,
            cacheKey,
            variant,
            chunkIndex: 0,
            etag: `"projection-${routeKey}-${derivationProfile}-${includeEstimated ? '1' : '0'}-${variant}"`,
            body: JSON.stringify(projection),
          }));
          projectedRows = {
            ...rows,
            apiCacheEntries: [...(rows.apiCacheEntries ?? []), ...projectionEntries],
          };
        }
      } catch {
        // Invalid fact fixtures intentionally exercise the unavailable path.
      }
    }
  }
  return getLeaderboard({
    request: new Request(`https://example.com/api/benchmarks/leaderboards/${key}${query}`, { headers }),
    env: { CATALOG_DB: d1(projectedRows, options) },
    params: { key },
  });
}

async function model(slug: string, rows = publishedRows(), headers?: HeadersInit, options?: FakeD1Options): Promise<Response> {
  return getModel({
    request: new Request(`https://example.com/api/benchmarks/models/${slug}`, { headers }),
    env: { CATALOG_DB: d1(rows, options) },
    params: { slug },
  });
}

afterEach(() => vi.useRealTimers());

describe('cached benchmark APIs', () => {
  it('serves materialized summary bytes before touching a full benchmark fact snapshot', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-08-05T12:00:01.000Z');
    const cachedBody = '{"revision":"benchmark-revision-1","publishedAt":"2026-08-05T00:00:00.000Z","freshness":{"status":"fresh","checkedAt":"2026-08-05T12:00:00.000Z"},"attribution":[],"data":{"cache":"summary"}}';

    const response = await summary(publishedRows({
      apiCacheEntries: [{
        scope: 'benchmarks',
        revision: REVISION,
        cacheKey: 'summary',
        variant: 'fresh',
        chunkIndex: 0,
        etag: '"materialized-summary-fresh"',
        body: cachedBody,
      }, {
        scope: 'benchmarks',
        revision: REVISION,
        cacheKey: 'summary',
        variant: 'stale',
        chunkIndex: 0,
        etag: '"materialized-summary-stale"',
        body: '{"revision":"benchmark-revision-1","publishedAt":"2026-08-05T00:00:00.000Z","freshness":{"status":"stale","checkedAt":"2026-08-05T12:00:00.000Z"},"attribution":[],"data":{"cache":"summary"}}',
      }],
    }), undefined, { failOnBenchmarkFactRead: true });

    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBe('"materialized-summary-fresh"');
    await expect(response.text()).resolves.toBe(cachedBody);
  });

  it('reconstructs the active summary when the active materialized response is corrupt', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-08-05T12:00:01.000Z');
    const response = await summary(publishedRows({
      apiCacheEntries: [{
        scope: 'benchmarks',
        revision: REVISION,
        cacheKey: 'summary',
        variant: 'fresh',
        chunkIndex: 1,
        etag: '"corrupt-summary"',
        body: '{"private":"must not escape"}',
      }],
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      revision: REVISION,
      data: { homeDecisionSnapshot: { benchAlignLeader: { status: 'ready' } } },
    });
  });

  it('serves the last complete stale summary when the active revision is unpublished', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-08-06T01:00:00.000Z');
    const pendingRevision = {
      ...revision,
      revision: 'benchmark-revision-pending',
      published_at: null,
      checked_at: '2026-08-06T00:30:00.000Z',
      publication_state: 'pending',
    };
    const staleBody = '{"revision":"benchmark-revision-1","publishedAt":"2026-08-05T00:00:00.000Z","freshness":{"status":"stale","checkedAt":"2026-08-05T12:00:00.000Z"},"attribution":[],"data":{"cache":"last-good"}}';
    const response = await summary(publishedRows({
      activeRevision: pendingRevision.revision,
      revisions: [revision, pendingRevision],
      apiCacheEntries: [{
        scope: 'benchmarks',
        revision: REVISION,
        cacheKey: 'summary',
        variant: 'stale',
        chunkIndex: 0,
        etag: '"last-good-summary"',
        body: staleBody,
      }],
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBe('"last-good-summary"');
    await expect(response.text()).resolves.toBe(staleBody);
  });

  it('rebuilds a filtered leaderboard from the last complete stale projection without serving base-page bytes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-08-07T01:00:00.000Z');
    const baseRows = publishedRows();
    const snapshot = await readActiveBenchmarkSnapshot(d1(baseRows));
    if (!snapshot) throw new Error('expected published fixture snapshot');
    const routeKey = 'llm-overall' as const;
    const projection = cachedLeaderboardPaginationProjection(
      snapshot,
      materializeLeaderboard(snapshot, routeKey, 'balanced', false),
    );
    const projectionCacheKey = benchmarkLeaderboardProjectionCacheKey({
      key: routeKey,
      profile: 'balanced',
      includeEstimated: false,
    });
    const pendingRevision = {
      ...revision,
      revision: 'benchmark-revision-pending',
      published_at: null,
      checked_at: '2026-08-07T00:30:00.000Z',
      publication_state: 'pending',
    };

    const response = await leaderboard(routeKey, '?q=Beta&sort=context-desc', publishedRows({
      activeRevision: pendingRevision.revision,
      revisions: [revision, pendingRevision],
      apiCacheEntries: [{
        scope: 'benchmarks',
        revision: REVISION,
        cacheKey: projectionCacheKey,
        variant: 'stale',
        chunkIndex: 0,
        etag: '"last-good-overall-projection"',
        body: JSON.stringify(projection),
      }],
    }), undefined, { failOnBenchmarkFactRead: true });
    const body = await response.json() as {
      freshness: { status: string };
      data: { entries: Array<{ model: { slug: string } }> };
    };

    expect(response.status).toBe(200);
    expect(body.freshness.status).toBe('stale');
    expect(body.data.entries.map((entry) => entry.model.slug)).toEqual(['beta']);
  });

  it('serves a materialized normalized leaderboard without rebuilding the full fact snapshot', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-08-05T12:00:01.000Z');
    const cachedData = {
      key: 'llm-overall',
      profile: 'balanced',
      entries: [],
      pagination: { limit: 50, total: 0, nextCursor: null },
      capabilities: {
        dataReady: true,
        defaultProfile: 'balanced',
        defaultSort: 'score-desc',
        supportsProfile: false,
        supportsEstimated: true,
        supportsLifecycle: false,
        priceMode: 'representative',
        supportsPrice: false,
        priceValues: [],
        metricKeys: ['benchlm:overall:raw'],
        sorts: ['score-desc'],
        providers: [],
        sourceTypes: [],
        evidenceStatuses: [],
      },
    };
    const cachedBody = JSON.stringify({
      revision: REVISION,
      publishedAt: PUBLISHED_AT,
      freshness: { status: 'fresh', checkedAt: CHECKED_AT },
      attribution: [],
      data: cachedData,
    });
    const staleCachedBody = JSON.stringify({
      revision: REVISION,
      publishedAt: PUBLISHED_AT,
      freshness: { status: 'stale', checkedAt: CHECKED_AT },
      attribution: [],
      data: cachedData,
    });

    const response = await leaderboard('llm-overall', '', publishedRows({
      apiCacheEntries: [{
        scope: 'benchmarks',
        revision: REVISION,
        cacheKey: 'leaderboard:v2:llm-overall:balanced:50::0',
        variant: 'fresh',
        chunkIndex: 0,
        etag: '"materialized-leaderboard-fresh"',
        body: cachedBody,
      }, {
        scope: 'benchmarks',
        revision: REVISION,
        cacheKey: 'leaderboard:v2:llm-overall:balanced:50::0',
        variant: 'stale',
        chunkIndex: 0,
        etag: '"materialized-leaderboard-stale"',
        body: staleCachedBody,
      }],
    }), undefined, { failOnBenchmarkFactRead: true });

    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBe('"materialized-leaderboard-fresh"');
    await expect(response.text()).resolves.toBe(cachedBody);
  });

  it('rejects an impossible unaligned cursor embedded in a materialized first-page fixture', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-08-05T12:00:01.000Z');
    const cursor = encodeOpaqueValue({
      v: 1,
      r: REVISION,
      k: 'llm-overall',
      p: 'balanced',
      l: 50,
      e: false,
      o: 1,
    });
    const cacheEntry = (variant: 'fresh' | 'stale'): ApiCacheEntry => ({
      scope: 'benchmarks',
      revision: REVISION,
      cacheKey: 'leaderboard:v2:llm-overall:balanced:50::0',
      variant,
      chunkIndex: 0,
      etag: `"materialized-leaderboard-${variant}"`,
      body: JSON.stringify({
        revision: REVISION,
        publishedAt: PUBLISHED_AT,
        freshness: { status: variant, checkedAt: CHECKED_AT },
        attribution: [],
        data: {
          key: 'llm-overall',
          profile: 'balanced',
          entries: [],
          pagination: { limit: 50, total: 2, nextCursor: cursor },
          capabilities: {
            dataReady: true,
            defaultProfile: 'balanced',
            defaultSort: 'score-desc',
            supportsProfile: false,
            supportsEstimated: true,
            supportsLifecycle: false,
            priceMode: 'representative',
            supportsPrice: false,
            priceValues: [],
            metricKeys: ['benchlm:overall:raw'],
            sorts: ['score-desc'],
            providers: [],
            sourceTypes: [],
            evidenceStatuses: [],
          },
        },
      }),
    });
    const rows = publishedRows({ apiCacheEntries: [cacheEntry('fresh'), cacheEntry('stale')] });

    const first = await leaderboard('llm-overall', '', rows, undefined, { failOnBenchmarkFactRead: true });
    const firstBody = await first.json() as { data: { pagination: { nextCursor: string } } };
    const second = await leaderboard(
      'llm-overall',
      `?cursor=${encodeURIComponent(firstBody.data.pagination.nextCursor)}`,
      rows,
      undefined,
      { failOnBenchmarkFactRead: true },
    );
    const secondBody = await second.json() as { data?: { entries: Array<{ model: { slug: string } }> }; error?: string };

    expect(first.status).toBe(200);
    expect(second.status).toBe(400);
    expect(secondBody.error).toBe('Invalid benchmark request');
  });

  it.each([
    {
      alias: 'includeEstimated',
      firstQuery: '?includeEstimated=1&limit=1',
      secondQuery: '?estimated=1&limit=1',
      expectedSlugs: ['beta'],
    },
    {
      alias: 'estimated',
      firstQuery: '?estimated=1&limit=1',
      secondQuery: '?includeEstimated=1&limit=1',
      expectedSlugs: ['beta'],
    },
  ] as const)(
    'continues an estimated page started with the $alias alias',
    async ({ firstQuery, secondQuery, expectedSlugs }) => {
      const rows = publishedRows();
      const expectedCursor = encodeOpaqueValue({
        v: 1,
        r: REVISION,
        k: 'llm-overall',
        p: 'balanced',
        l: 1,
        e: true,
        o: 1,
      });

      const first = await leaderboard('llm-overall', firstQuery, rows, undefined, { failOnBenchmarkFactRead: true });
      const firstBody = await first.json() as { data: { pagination: { nextCursor: string } } };
      const second = await leaderboard(
        'llm-overall',
        `${secondQuery}&cursor=${encodeURIComponent(firstBody.data.pagination.nextCursor)}`,
        rows,
        undefined,
        { failOnBenchmarkFactRead: true },
      );
      const secondBody = await second.json() as { data?: { entries: Array<{ model: { slug: string } }> } };

      expect(first.status).toBe(200);
      expect(firstBody.data.pagination.nextCursor).toBe(expectedCursor);
      expect(second.status).toBe(200);
      expect(secondBody.data?.entries.map((entry) => entry.model.slug)).toEqual(expectedSlugs);
    },
  );

  it('binds encoded pagination state to estimated inclusion and the canonical query identity', async () => {
    const estimated = await leaderboard('llm-overall', '?estimated=1&limit=1');
    const estimatedBody = await estimated.json() as { data: { pagination: { nextCursor: string } } };
    const defaultPage = await leaderboard('llm-overall', '?limit=1');
    const defaultBody = await defaultPage.json() as { data: { pagination: { nextCursor: string } } };
    const withoutEstimated = await leaderboard(
      'llm-overall',
      `?limit=1&cursor=${encodeURIComponent(estimatedBody.data.pagination.nextCursor)}`,
    );
    const changedFilter = await leaderboard(
      'llm-overall',
      `?estimated=1&q=Alpha&limit=1&cursor=${encodeURIComponent(estimatedBody.data.pagination.nextCursor)}`,
    );
    const falseCursorOnEstimated = await leaderboard(
      'llm-overall',
      `?estimated=1&limit=1&cursor=${encodeURIComponent(defaultBody.data.pagination.nextCursor)}`,
    );
    const cursorSuffix = estimatedBody.data.pagination.nextCursor.at(-1);
    const malformedCursor = `${estimatedBody.data.pagination.nextCursor.slice(0, -1)}${cursorSuffix === 'A' ? 'B' : 'A'}`;
    const malformed = await leaderboard(
      'llm-overall',
      `?estimated=1&limit=1&cursor=${encodeURIComponent(malformedCursor)}`,
    );

    expect(estimated.status).toBe(200);
    expect(defaultPage.status).toBe(200);
    expect(withoutEstimated.status).toBe(400);
    expect(changedFilter.status).toBe(400);
    expect(falseCursorOnEstimated.status).toBe(400);
    expect(malformed.status).toBe(400);
  });

  it('builds exact route availability while reading each complete fact collection only once', async () => {
    const summaryMetrics = [
      ...metrics.filter((candidate) => candidate.model_key !== 'provider:wrong-lens'),
      { ...metrics[0], metric_key: 'benchlm:category:coding', category: 'coding', value: 88 },
      { ...metrics[0], metric_key: 'benchlm:category:coding:secondary', category: 'coding', value: 86 },
      { ...metrics[0], metric_key: 'benchlm:category:multimodalGrounded', category: 'multimodalGrounded', value: 87 },
      { ...metrics[3], metric_key: 'benchlm:category:agentic', category: 'agentic' },
      { ...metrics[4], metric_key: 'lmarena:text_to_image:overall', value: 1_100, rank: 2 },
    ];
    const summaryModels = models.map((candidate) => candidate.model_key === 'provider:alpha'
      ? { ...candidate, ranking_eligible: 0 }
      : candidate);
    const snapshot = await readActiveBenchmarkSnapshot(d1(publishedRows({
      models: summaryModels,
      metrics: summaryMetrics,
    })));
    expect(snapshot).not.toBeNull();
    if (!snapshot) return;
    const metricInput = countedArrayReads(snapshot.metrics);
    const priceInput = countedArrayReads(snapshot.priceChecks);
    const guardedSnapshot: ActiveBenchmarkSnapshot = {
      ...snapshot,
      metrics: metricInput.array,
      priceChecks: priceInput.array,
    };
    const result = buildBenchmarkSummaryData(guardedSnapshot);

    expect(metricInput.reads()).toBe(snapshot.metrics.length);
    expect(priceInput.reads()).toBe(snapshot.priceChecks.length);
    expect(result.routes.map((route) => route.key)).toEqual([
      'llm-agentic',
      'llm-coding',
      'llm-human-preference',
      'llm-knowledge',
      'llm-overall',
      'llm-pricing-context',
      'llm-reasoning',
      'llm-value',
      'media-image-editing',
      'media-image-to-video',
      'media-text-to-image',
      'media-text-to-video',
      'media-video-editing',
      'multimodal-vision-documents',
    ]);
    expect(Object.fromEntries(result.routes.map((route) => [route.key, route.available]))).toEqual({
      'llm-agentic': false,
      'llm-coding': true,
      'llm-human-preference': true,
      'llm-knowledge': false,
      'llm-overall': true,
      'llm-pricing-context': true,
      'llm-reasoning': false,
      'llm-value': true,
      'media-image-editing': false,
      'media-image-to-video': false,
      'media-text-to-image': true,
      'media-text-to-video': false,
      'media-video-editing': false,
      'multimodal-vision-documents': true,
    });
    expect(result.compareDirectory.models.find((model) => model.slug === 'alpha')?.metricCategories)
      .toEqual(['coding', 'multimodalGrounded', 'overall']);
    expect(result.compareDirectory.models.find((model) => model.slug === 'wrong-lens')?.metricCategories)
      .toEqual(['agentic']);
  });

  it('returns the exact JSON envelope and deterministic active-revision availability metadata', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-08-05T12:00:01.000Z');
    const response = await summary(publishedRows({ sources: [...sources].reverse() }));

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
          expect.objectContaining({
            sourceId: 'benchlm',
            available: true,
            artifacts: expect.arrayContaining([
              expect.objectContaining({ artifactId: 'models', upstreamRevision: 'benchlm-r1', schemaVersion: '1.0' }),
            ]),
          }),
          expect.objectContaining({ sourceId: 'litellm', available: false }),
        ]),
        routes: expect.arrayContaining([
          expect.objectContaining({ key: 'llm-overall', available: true }),
          expect.objectContaining({ key: 'media-text-to-image', available: false }),
        ]),
      },
    });
  });

  it('delegates fallback decision projections to the canonical summary materializer', async () => {
    const rows = publishedRows();
    const snapshot = await readActiveBenchmarkSnapshot(d1(rows));
    expect(snapshot).not.toBeNull();
    if (!snapshot) return;
    const expected = buildCanonicalBenchmarkSummaryData(snapshot);

    const response = await summary(rows);
    const body = await response.json() as { readonly data: Record<string, unknown> };

    expect(body.data.decisionPicks).toEqual(expected.decisionPicks);
    expect(body.data.homeDecisionSnapshot).toEqual(expected.homeDecisionSnapshot);
  });

  it('returns a deterministic minimal compare directory without synthetic scores or winners', async () => {
    const directoryPairs = [
      ...pairs,
      {
        ...pairs[0],
        pair_slug: 'arena-vs-alpha',
        model_a_key: 'lmarena:arena',
        model_b_key: 'provider:alpha',
        featured_rank: null,
      },
      {
        ...pairs[0],
        pair_slug: 'alpha-vs-estimated',
        model_b_key: 'provider:estimated',
        indexable: 0,
        featured_rank: 2,
      },
    ];
    const response = await summary(publishedRows({
      models: [...models].reverse(),
      metrics: [...metrics].reverse(),
      pairs: directoryPairs.reverse(),
    }));
    const body = await response.json() as { data: { compareDirectory: {
      models: Array<Record<string, unknown>>;
      indexablePairs: Array<Record<string, unknown>>;
    } } };

    expect(response.status).toBe(200);
    expect(body.data.compareDirectory).toEqual({
      models: [
        { slug: 'alpha', name: 'Alpha', creator: 'Provider', sourceType: 'Proprietary', evidenceStatus: 'supported', utilitySelectable: true, metricCategories: ['overall'] },
        { slug: 'arena', name: 'Arena', creator: 'LMArena', sourceType: 'Unknown', evidenceStatus: 'source_only', utilitySelectable: true, metricCategories: ['overall'] },
        { slug: 'beta', name: 'Beta', creator: 'Provider', sourceType: 'Proprietary', evidenceStatus: 'supported', utilitySelectable: true, metricCategories: ['overall'] },
        { slug: 'estimated', name: 'Estimated', creator: 'Provider', sourceType: 'Unknown', evidenceStatus: 'estimated', utilitySelectable: true, metricCategories: ['overall'] },
        { slug: 'wrong-lens', name: 'Wrong lens', creator: 'Provider', sourceType: 'Unknown', evidenceStatus: 'estimated', utilitySelectable: true, metricCategories: ['reasoning'] },
      ],
      indexablePairs: [
        {
          pairSlug: 'alpha-vs-beta',
          modelASlug: 'alpha',
          modelBSlug: 'beta',
          featuredRank: 1,
          sharedMetricCount: 2,
        },
        {
          pairSlug: 'arena-vs-alpha',
          modelASlug: 'arena',
          modelBSlug: 'alpha',
          featuredRank: null,
          sharedMetricCount: 2,
        },
      ],
    });
    body.data.compareDirectory.models.forEach((entry) => {
      expect(Object.keys(entry).sort()).toEqual(['creator', 'evidenceStatus', 'metricCategories', 'name', 'slug', 'sourceType', 'utilitySelectable']);
    });
    body.data.compareDirectory.indexablePairs.forEach((entry) => {
      expect(Object.keys(entry).sort()).toEqual(['featuredRank', 'modelASlug', 'modelBSlug', 'pairSlug', 'sharedMetricCount']);
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

  it('returns 304 for Cloudflare\'s weak form of the current benchmark ETag', async () => {
    const first = await summary();
    const etag = first.headers.get('etag')!;
    const response = await summary(publishedRows(), { 'If-None-Match': `W/${etag}` });

    expect(response.status).toBe(304);
  });

  it.each([
    ['summary', (headers?: HeadersInit) => summary(publishedRows(), headers)],
    ['leaderboard', (headers?: HeadersInit) => leaderboard('llm-overall', '', publishedRows(), headers)],
    ['model', (headers?: HeadersInit) => model('alpha', publishedRows(), headers)],
  ])('evaluates freshness once per %s request and returns 304 for an unchanged evaluation', async (_label, requestEndpoint) => {
    const now = Date.parse(CHECKED_AT) + 1_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      const first = await requestEndpoint();
      expect(nowSpy).toHaveBeenCalledTimes(1);
      const conditional = await requestEndpoint({ 'If-None-Match': first.headers.get('etag')! });

      expect(nowSpy).toHaveBeenCalledTimes(2);
      expect(conditional.status).toBe(304);
      await expect(conditional.text()).resolves.toBe('');
    } finally {
      nowSpy.mockRestore();
    }
  });

  it.each([
    ['summary', (rows: D1Rows, headers?: HeadersInit) => summary(rows, headers)],
    ['leaderboard', (rows: D1Rows, headers?: HeadersInit) => leaderboard('llm-overall', '', rows, headers)],
    ['model', (rows: D1Rows, headers?: HeadersInit) => model('alpha', rows, headers)],
  ])('invalidates the %s ETag when checked_at changes within the same revision', async (_label, requestEndpoint) => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-08-06T12:00:00.000Z');
    const first = await requestEndpoint(publishedRows());
    const etag = first.headers.get('etag')!;
    const refreshedCheckedAt = '2026-08-06T06:00:00.000Z';
    const refreshed = await requestEndpoint(publishedRows({
      revisions: [{ ...revision, checked_at: refreshedCheckedAt }],
    }), { 'If-None-Match': etag });

    expect(first.status).toBe(200);
    expect(refreshed.status).toBe(200);
    expect(refreshed.headers.get('etag')).not.toBe(etag);
    await expect(refreshed.json()).resolves.toMatchObject({
      revision: REVISION,
      freshness: { status: 'fresh', checkedAt: refreshedCheckedAt },
    });
  });

  it.each([
    ['summary', (rows: D1Rows, headers?: HeadersInit) => summary(rows, headers)],
    ['leaderboard', (rows: D1Rows, headers?: HeadersInit) => leaderboard('llm-overall', '', rows, headers)],
    ['model', (rows: D1Rows, headers?: HeadersInit) => model('alpha', rows, headers)],
  ])('invalidates the %s ETag when evaluated freshness crosses from fresh to stale', async (_label, requestEndpoint) => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse(CHECKED_AT) + 8 * 24 * 60 * 60 * 1000);
    const fresh = await requestEndpoint(publishedRows());
    const etag = fresh.headers.get('etag')!;
    vi.setSystemTime(Date.parse(CHECKED_AT) + 8 * 24 * 60 * 60 * 1000 + 1);
    const stale = await requestEndpoint(publishedRows(), { 'If-None-Match': etag });

    expect(fresh.status).toBe(200);
    expect(stale.status).toBe(200);
    expect(stale.headers.get('etag')).not.toBe(etag);
    await expect(stale.json()).resolves.toMatchObject({ freshness: { status: 'stale' } });
  });

  it('normalizes query defaults and ordering before calculating leaderboard ETags', async () => {
    const defaultResponse = await leaderboard('llm-overall');
    const explicitResponse = await leaderboard('llm-overall', '?cursor=&limit=50&profile=balanced');
    const reorderedResponse = await leaderboard('llm-overall', '?profile=balanced&limit=50');

    expect(defaultResponse.headers.get('etag')).toBe(explicitResponse.headers.get('etag'));
    expect(defaultResponse.headers.get('etag')).toBe(reorderedResponse.headers.get('etag'));
  });

  it('stays fresh at exactly 8 days and becomes stale strictly beyond it', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse(CHECKED_AT) + 8 * 24 * 60 * 60 * 1000);
    const boundary = await summary();
    vi.setSystemTime(Date.parse(CHECKED_AT) + 8 * 24 * 60 * 60 * 1000 + 1);
    const stale = await summary();

    await expect(boundary.json()).resolves.toMatchObject({ freshness: { status: 'fresh' } });
    await expect(stale.json()).resolves.toMatchObject({ freshness: {
      status: 'stale',
      message: 'Published weekly benchmark evidence has not refreshed within 8 days.',
    } });
  });

  it('returns a generic unavailable response when no active published revision exists', async () => {
    const response = await summary(publishedRows({ activeRevision: null }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'Benchmark data unavailable' });
  });

  it('returns unavailable for an unpublished active pointer when no last-good response exists', async () => {
    const pendingRevision = {
      ...revision,
      revision: 'benchmark-revision-pending',
      published_at: null,
      checked_at: '2026-08-06T00:00:00.000Z',
      publication_state: 'pending',
    };
    const response = await summary(publishedRows({
      activeRevision: pendingRevision.revision,
      revisions: [revision, pendingRevision],
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'Benchmark data unavailable' });
  });

  it.each([
    ['a malformed revision aggregate hash', publishedRows({
      revisions: [{ ...revision, content_hash: 'sha256:not-a-digest' }],
    })],
    ['a malformed pinned OpenRouter hash', publishedRows({
      revisions: [{ ...revision, openrouter_content_hash: 'not-a-digest' }],
    })],
    ['a valid digest that does not match the canonical aggregate', publishedRows({
      revisions: [{ ...revision, content_hash: hash('a') }],
    })],
    ['an OpenRouter source hash that differs from the revision pin', publishedRows({
      sources: sources.map((source) => source.source_id === 'openrouter'
        ? { ...source, content_hash: hash('2') }
        : source),
    })],
    ['an OpenRouter source with the wrong catalog upstream revision', publishedRows({
      sources: sources.map((source) => source.source_id === 'openrouter'
        ? { ...source, upstream_revision: 'catalog-revision-other' }
        : source),
    })],
    ['an OpenRouter source with the wrong catalog artifact identity', publishedRows({
      sources: sources.map((source) => source.source_id === 'openrouter'
        ? { ...source, artifact_id: 'catalog:catalog-revision-other' }
        : source),
      prices: prices.map((price) => ({ ...price, source_artifact_id: 'catalog:catalog-revision-other' })),
    })],
  ])('rejects %s with only the generic unavailable response', async (_caseName, rows) => {
    const response = await summary(rows);

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

  it('applies supported shared filters and sorts from the complete bounded projection', async () => {
    const response = await leaderboard(
      'llm-overall',
      '?q=Beta&sort=context-desc',
      publishedRows(),
      undefined,
      { failOnBenchmarkFactRead: true },
    );
    const body = await response.json() as { data: {
      entries: Array<{ model: { slug: string } }>;
      pagination: { total: number; nextCursor: string | null };
    } };

    expect(response.status).toBe(200);
    expect(body.data.entries.map((entry) => entry.model.slug)).toEqual(['beta']);
    expect(body.data.pagination).toEqual({ limit: 50, total: 1, nextCursor: null });
  });

  it('round trips and filters an exact provider display name containing a comma', async () => {
    const rows = publishedRows({
      models: models.map((candidate) => candidate.model_key === 'provider:alpha'
        ? { ...candidate, creator: 'Provider, Inc.' }
        : candidate.model_key === 'provider:beta'
          ? { ...candidate, creator: 'Provider B' }
          : candidate),
    });
    const response = await leaderboard('llm-overall', '?provider=Provider%2C+Inc.&sort=score-desc', rows);
    const body = await response.json() as { data: { entries: Array<{ model: { slug: string; creator: string } }> } };

    expect(response.status).toBe(200);
    expect(body.data.entries.map((entry) => [entry.model.slug, entry.model.creator]))
      .toEqual([['alpha', 'Provider, Inc.']]);
  });

  it.each([
    ['an unknown query key', '?unknown=1'],
    ['a route-unsupported sort', '?sort=rank-asc'],
    ['a duplicate scalar', '?sort=score-desc&sort=context-desc'],
    ['a duplicate list value', '?provider=Provider&provider=Provider'],
    ['a malformed percent escape', '?q=%ZZ'],
    ['an invalid UTF-8 escape', '?q=%C0%AF'],
  ])('strictly rejects %s before serving leaderboard bytes', async (_label, query) => {
    const response = await leaderboard('llm-overall', query);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid benchmark request' });
  });

  it('binds pagination cursors to the canonical shared query and order', async () => {
    const first = await leaderboard('llm-overall', '?q=Provider&sort=score-desc&limit=1');
    const firstBody = await first.json() as { data: { pagination: { nextCursor: string } } };
    const reused = await leaderboard(
      'llm-overall',
      `?q=Alpha&sort=score-desc&limit=1&cursor=${encodeURIComponent(firstBody.data.pagination.nextCursor)}`,
    );
    const reordered = await leaderboard(
      'llm-overall',
      `?q=Provider&sort=context-desc&limit=1&cursor=${encodeURIComponent(firstBody.data.pagination.nextCursor)}`,
    );

    expect(first.status).toBe(200);
    expect(firstBody.data.pagination.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(reused.status).toBe(400);
    expect(reordered.status).toBe(400);
  });

  it('allows public encoded cursor state to select only an aligned bounded page', async () => {
    const alignedCursor = encodeOpaqueValue({
      v: 1,
      r: REVISION,
      k: 'llm-overall',
      p: 'balanced',
      l: 1,
      e: true,
      o: 2,
    });
    const unalignedCursor = encodeOpaqueValue({
      v: 1,
      r: REVISION,
      k: 'llm-overall',
      p: 'balanced',
      l: 2,
      e: true,
      o: 1,
    });
    const aligned = await leaderboard(
      'llm-overall',
      `?estimated=1&limit=1&cursor=${encodeURIComponent(alignedCursor)}`,
    );
    const alignedBody = await aligned.json() as {
      data?: { entries: Array<{ model: { slug: string } }>; pagination: { limit: number; total: number; nextCursor: string | null } };
    };
    const unaligned = await leaderboard(
      'llm-overall',
      `?estimated=1&limit=2&cursor=${encodeURIComponent(unalignedCursor)}`,
    );

    expect(aligned.status).toBe(200);
    expect(alignedBody.data?.entries.map((entry) => entry.model.slug)).toEqual(['estimated']);
    expect(alignedBody.data?.pagination).toEqual({ limit: 1, total: 3, nextCursor: null });
    expect(unaligned.status).toBe(400);
  });

  it.each([
    ['stale revision', encodeOpaqueValue({ v: 1, r: 'benchmark-revision-stale', k: 'llm-overall', p: 'balanced', l: 1, e: true, o: 1 })],
    ['out-of-range offset', encodeOpaqueValue({ v: 1, r: REVISION, k: 'llm-overall', p: 'balanced', l: 1, e: true, o: 3 })],
    ['malformed state', 'not-a-cursor'],
  ])('rejects %s in public encoded cursor state', async (_label, cursor) => {
    const response = await leaderboard(
      'llm-overall',
      `?estimated=1&limit=1&cursor=${encodeURIComponent(cursor)}`,
    );

    expect(response.status).toBe(400);
  });

  it('defaults page size to 50 and enforces the safe limit ceiling of 200', async () => {
    const defaultResponse = await leaderboard('llm-overall');
    const maxResponse = await leaderboard('llm-overall', '?limit=200');
    const tooLarge = await leaderboard('llm-overall', '?limit=201');

    await expect(defaultResponse.json()).resolves.toMatchObject({ data: { pagination: { limit: 50 } } });
    await expect(maxResponse.json()).resolves.toMatchObject({ data: { pagination: { limit: 200 } } });
    expect(tooLarge.status).toBe(400);
  });

  it('paginates in stable order with deterministic encoded state and rejects invalid cursors', async () => {
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

  it('serves every valid page size and cursor from the bounded projection cache', async () => {
    const first = await leaderboard(
      'llm-overall',
      '?limit=1',
      publishedRows(),
      undefined,
      { failOnBenchmarkFactRead: true },
    );
    const firstBody = await first.json() as { data: { pagination: { nextCursor: string } } };
    const second = await leaderboard(
      'llm-overall',
      `?limit=1&cursor=${encodeURIComponent(firstBody.data.pagination.nextCursor)}`,
      publishedRows(),
      undefined,
      { failOnBenchmarkFactRead: true },
    );
    const maximum = await leaderboard(
      'llm-overall',
      '?limit=200',
      publishedRows(),
      undefined,
      { failOnBenchmarkFactRead: true },
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(maximum.status).toBe(200);
    await expect(maximum.json()).resolves.toMatchObject({ data: { pagination: { limit: 200 } } });
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
    const response = await leaderboard('llm-overall', '', rows, undefined, { bypassFactRevisionFilter: true });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'Benchmark data unavailable' });
  });

  it('rejects a persisted comparison pair whose slug is not canonical for its ordered active models', async () => {
    const response = await summary(publishedRows({
      pairs: [{ ...pairs[0], pair_slug: 'beta-vs-alpha' }],
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'Benchmark data unavailable' });
  });

  it.each([
    ['slash', [
      { ...models[0], model_key: 'provider:unsafe-left', slug: 'unsafe/left', source_model_id: 'provider/unsafe-left' },
      { ...models[1], model_key: 'provider:unsafe-right', slug: 'right', source_model_id: 'provider/unsafe-right' },
    ], {
      ...pairs[0], pair_slug: 'unsafe/left-vs-right', model_a_key: 'provider:unsafe-left', model_b_key: 'provider:unsafe-right',
    }],
    ['control character', [
      { ...models[0], model_key: 'provider:unsafe-control', slug: 'unsafe\u0000left', source_model_id: 'provider/unsafe-control' },
      { ...models[1], model_key: 'provider:unsafe-right', slug: 'right', source_model_id: 'provider/unsafe-right' },
    ], {
      ...pairs[0], pair_slug: 'unsafe\u0000left-vs-right', model_a_key: 'provider:unsafe-control', model_b_key: 'provider:unsafe-right',
    }],
    ['ambiguous -vs- split', [
      { ...models[0], model_key: 'provider:ambiguous-a', slug: 'a', source_model_id: 'provider/ambiguous-a' },
      { ...models[0], model_key: 'provider:ambiguous-b', slug: 'a-vs-b', source_model_id: 'provider/ambiguous-b' },
      { ...models[0], model_key: 'provider:ambiguous-c', slug: 'b-vs-c', source_model_id: 'provider/ambiguous-c' },
      { ...models[0], model_key: 'provider:ambiguous-d', slug: 'c', source_model_id: 'provider/ambiguous-d' },
    ], {
      ...pairs[0], pair_slug: 'a-vs-b-vs-c', model_a_key: 'provider:ambiguous-a', model_b_key: 'provider:ambiguous-c',
    }],
  ])('rejects an active indexable comparison that cannot resolve through the %s route', async (_caseName, extraModels, unsafePair) => {
    const response = await summary(publishedRows({
      models: [...models, ...extraModels],
      pairs: [unsafePair],
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'Benchmark data unavailable' });
  });

  it('retains known nonindexable pairs even when their arbitrary slug cannot form a public route', async () => {
    const unsafeModels = [
      { ...models[0], model_key: 'provider:unsafe-left', slug: 'unsafe/left', source_model_id: 'provider/unsafe-left' },
      { ...models[1], model_key: 'provider:unsafe-right', slug: 'right', source_model_id: 'provider/unsafe-right' },
    ];
    const response = await summary(publishedRows({
      models: [...models, ...unsafeModels],
      pairs: [{
        ...pairs[0], pair_slug: 'unsafe/left-vs-right', model_a_key: 'provider:unsafe-left', model_b_key: 'provider:unsafe-right', indexable: 0,
      }],
    }));

    expect(response.status).toBe(200);
    const body = await response.json() as { data: { compareDirectory: {
      models: Array<{ slug: string }>;
      indexablePairs: unknown[];
    } } };
    expect(body.data.compareDirectory.indexablePairs).toEqual([]);
    expect(body.data.compareDirectory.models.map((model) => model.slug)).not.toContain('unsafe/left');
    expect(body.data.compareDirectory.models.map((model) => model.slug)).toContain('right');
  });

  it('keeps ambiguous utility-only model slugs out of hub selections while retaining simple routable neighbors', async () => {
    const ambiguousModels = [
      { ...models[0], model_key: 'provider:ambiguous-a', slug: 'a', source_model_id: 'provider/ambiguous-a' },
      { ...models[0], model_key: 'provider:ambiguous-b', slug: 'a-vs-b', source_model_id: 'provider/ambiguous-b' },
      { ...models[0], model_key: 'provider:ambiguous-c', slug: 'b-vs-c', source_model_id: 'provider/ambiguous-c' },
      { ...models[0], model_key: 'provider:ambiguous-d', slug: 'c', source_model_id: 'provider/ambiguous-d' },
    ];
    const response = await summary(publishedRows({ models: [...models, ...ambiguousModels], pairs: [] }));
    const body = await response.json() as { data: { compareDirectory: { models: Array<{ slug: string }> } } };
    const slugs = body.data.compareDirectory.models.map((model) => model.slug);

    expect(response.status).toBe(200);
    expect(slugs).toEqual(expect.arrayContaining(['a', 'c']));
    expect(slugs).not.toEqual(expect.arrayContaining(['a-vs-b', 'b-vs-c']));
  });

  it('retains an exact indexable complex-slug pair as non-selectable directory metadata', async () => {
    const complexModels = [
      { ...models[0], model_key: 'provider:a', slug: 'a', source_model_id: 'provider/a' },
      { ...models[0], model_key: 'provider:complex', slug: 'a-vs-b', name: 'Complex', source_model_id: 'provider/complex' },
      { ...models[0], model_key: 'provider:other-complex', slug: 'b-vs-c', name: 'Other complex', source_model_id: 'provider/other-complex' },
      { ...models[0], model_key: 'provider:c', slug: 'c', source_model_id: 'provider/c' },
      { ...models[0], model_key: 'provider:d', slug: 'd', name: 'D', source_model_id: 'provider/d' },
    ];
    const response = await summary(publishedRows({
      models: [...models, ...complexModels],
      pairs: [{
        ...pairs[0],
        pair_slug: 'a-vs-b-vs-d',
        model_a_key: 'provider:complex',
        model_b_key: 'provider:d',
      }],
    }));
    const body = await response.json() as { data: { compareDirectory: {
      models: Array<{ slug: string; utilitySelectable: boolean }>;
      indexablePairs: Array<{ pairSlug: string; modelASlug: string; modelBSlug: string }>;
    } } };

    expect(response.status).toBe(200);
    expect(body.data.compareDirectory.models).toEqual(expect.arrayContaining([
      expect.objectContaining({ slug: 'a-vs-b', utilitySelectable: false }),
      expect.objectContaining({ slug: 'd', utilitySelectable: true }),
    ]));
    expect(body.data.compareDirectory.models.map((model) => model.slug)).not.toContain('b-vs-c');
    expect(body.data.compareDirectory.indexablePairs).toContainEqual(expect.objectContaining({
      pairSlug: 'a-vs-b-vs-d',
      modelASlug: 'a-vs-b',
      modelBSlug: 'd',
    }));
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

  it.each([
    ['the model is ranking eligible', publishedRows({
      models: models.map((candidate) => candidate.model_key === 'provider:estimated'
        ? { ...candidate, ranking_eligible: 1 }
        : candidate),
    })],
    ['the metric is ranking eligible', publishedRows({
      metrics: metrics.map((candidate) => candidate.model_key === 'provider:estimated'
        ? { ...candidate, ranking_eligible: 1 }
        : candidate),
    })],
    ['the metric carries a source rank', publishedRows({
      metrics: metrics.map((candidate) => candidate.model_key === 'provider:estimated'
        ? { ...candidate, rank: 1 }
        : candidate),
    })],
  ])('does not append an estimated extension when %s', async (_caseName, rows) => {
    const response = await leaderboard('llm-overall', '?includeEstimated=1', rows);
    const body = await response.json() as { data: { entries: Array<{ model: { slug: string } }> } };

    expect(response.status).toBe(200);
    expect(body.data.entries.map((entry) => entry.model.slug)).toEqual(['alpha', 'beta']);
  });

  it('attributes every displayed metric and hosted price source, including OpenRouter value evidence', async () => {
    const response = await leaderboard('llm-value');
    const body = await response.json() as { attribution: Array<{ sourceId: string }>; data: { entries: unknown[] } };

    expect(body.data.entries).toHaveLength(2);
    expect(body.attribution.map((item) => item.sourceId).sort()).toEqual(['benchlm', 'openrouter']);
  });

  it.each([
    ['llm-coding', publishedRows(), ['benchlm']],
    ['llm-knowledge', publishedRows(), ['benchlm']],
    ['llm-reasoning', publishedRows(), ['benchlm']],
    ['media-text-to-image', publishedRows(), ['lmarena']],
    ['llm-pricing-context', publishedRows({ prices: [] }), ['openrouter']],
    ['llm-value', publishedRows({ prices: [] }), ['benchlm', 'openrouter']],
    ['multimodal-vision-documents', publishedRows(), ['benchlm', 'lmarena']],
  ])('attributes the registered route sources when %s has zero eligible entries', async (key, rows, expectedSources) => {
    const response = await leaderboard(key, '', rows);
    const body = await response.json() as {
      attribution: Array<{ sourceId: string }>;
      data: { entries: unknown[]; pagination: { total: number; nextCursor: string | null } };
    };

    expect(response.status).toBe(200);
    expect(body.data.entries).toEqual([]);
    expect(body.data.pagination).toMatchObject({ total: 0, nextCursor: null });
    expect(body.attribution.map((item) => item.sourceId).sort()).toEqual(expectedSources);
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
