import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { onRequestGet } from './price-performance';
import { PRICE_PERFORMANCE_CACHE_PARAMETERS } from '../../_shared/price-performance-db';
import { benchmarkPricePerformanceProjectionCacheKey } from '../../../src/benchmarks/api-response-cache-keys';
import { encodeOpaqueValue } from '../../_shared/benchmark-db';

const REVISION = 'benchmark-revision-1';
const PUBLISHED_AT = '2026-08-05T00:00:00.000Z';
const CHECKED_AT = '2026-08-05T12:00:00.000Z';
const CATALOG_REVISION = 'catalog-revision-1';

const hash = (character: string) => `sha256:${character.repeat(64)}`;
const OPENROUTER_CONTENT_HASH = hash('1');
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

function modelRow(key: string, slug: string, name: string) {
  return {
    revision: REVISION,
    model_key: key,
    slug,
    name,
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
    source_model_id: `provider/${slug}`,
    source_artifact_id: 'models',
  };
}

function metricRow(modelKey: string, value: number) {
  return {
    revision: REVISION,
    model_key: modelKey,
    metric_key: 'benchlm:overall:raw',
    category: 'overall',
    value,
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
  };
}

function priceRow(modelKey: string, slug: string, input: number, output: number) {
  return {
    revision: REVISION,
    model_key: modelKey,
    source_id: 'openrouter',
    provider_id: 'openrouter',
    route_id: `openrouter:provider/${slug}`,
    source_model_id: `provider/${slug}`,
    canonical_slug: slug,
    input_usd_per_million: input,
    cached_input_usd_per_million: null,
    output_usd_per_million: output,
    context_window_tokens: null,
    max_input_tokens: null,
    max_output_tokens: 16_000,
    input_modalities_json: JSON.stringify(['text']),
    output_modalities_json: JSON.stringify(['text']),
    supported_parameters_json: null,
    source_artifact_id: OPENROUTER_ARTIFACT_ID,
    verification_status: 'primary',
  };
}

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

function dataRows() {
  return {
    sources,
    models: [
      modelRow('provider:alpha', 'alpha', 'Alpha'),
      modelRow('provider:beta', 'beta', 'Beta'),
    ],
    metrics: [
      metricRow('provider:alpha', 90),
      metricRow('provider:beta', 80),
    ],
    prices: [
      priceRow('provider:alpha', 'alpha', 0, 4),
      priceRow('provider:beta', 'beta', 1, 3),
    ],
    pairs,
  };
}

const staleBody = JSON.stringify({
  revision: REVISION,
  publishedAt: PUBLISHED_AT,
  freshness: { status: 'stale', checkedAt: '2026-08-01T00:00:00.000Z' },
  attribution: [{ sourceId: 'benchlm', label: 'BenchLM', url: 'https://benchlm.ai', updatedAt: '2026-08-05T11:00:00.000Z' }],
  data: {
    scoreMethodology: { overall: 'Overall', agentic: 'Agentic', coding: 'Coding', reasoning: 'Reasoning', knowledge: 'Knowledge', multimodal: 'Multimodal', mathematics: 'Math', multilingual: 'Multilingual', 'instruction-following': 'Instruction' },
    costDefinitions: { output: 'Published output USD per one million tokens', blended3To1: '(3 × input USD/M + output USD/M) / 4' },
    capabilities: {
      scoreLanes: ['overall', 'agentic', 'coding', 'reasoning', 'knowledge', 'multimodal', 'mathematics', 'multilingual', 'instruction-following'],
      costBases: ['output', 'blended-3-1'],
      creators: ['Provider'],
      sourceTypes: ['Proprietary', 'Open Weight', 'Unknown'],
      evidenceStatuses: ['supported', 'estimated', 'source_only'],
      statuses: ['current', 'archived'],
    },
    points: [],
  },
});

interface ContextOptions {
  includeArchived?: boolean;
  activeReadFails?: boolean;
  staleCache?: boolean;
  headers?: HeadersInit;
}

function context(options: ContextOptions = {}) {
  const rows = dataRows();
  let failFactReads = options.activeReadFails === true;
  return {
    request: new Request(
      `https://tokenbench.monomind.one/api/benchmarks/price-performance${options.includeArchived ? '?includeArchived=1' : ''}`,
      options.headers ? { headers: options.headers } : undefined,
    ),
    env: {
      CATALOG_DB: {
        prepare(sql: string) {
          return {
            bind(...values: unknown[]) {
              return {
                all: async () => {
                  if (sql.includes('api_response_entries')) {
                    const historical = sql.includes('complete_revisions');
                    if (historical && options.staleCache) {
                      const [scope, cacheKey] = values;
                      if (scope === 'benchmarks' && cacheKey === benchmarkPricePerformanceProjectionCacheKey()) {
                        return { results: [{ revision: REVISION, variant: 'stale', chunk_index: 0, etag: staleEtag(), body: staleBody }] };
                      }
                    }
                    return { results: [] };
                  }
                  if (failFactReads) throw new Error('active revision read failed');
                  if (sql.includes('benchmark_publication_state')) return { results: [revision] };
                  if (sql.includes('benchmark_source_records')) return { results: rows.sources };
                  if (sql.includes('benchmark_models')) return { results: rows.models };
                  if (sql.includes('benchmark_metrics')) return { results: rows.metrics };
                  if (sql.includes('benchmark_price_checks')) return { results: rows.prices };
                  if (sql.includes('benchmark_comparison_pairs')) return { results: rows.pairs };
                  return { results: [] };
                },
              };
            },
          };
        },
      },
    },
  };
}

function staleEtag(): string {
  return `"benchmark-${encodeOpaqueValue([
    REVISION,
    { checkedAt: '2026-08-01T00:00:00.000Z', freshnessStatus: 'stale' },
    PRICE_PERFORMANCE_CACHE_PARAMETERS,
  ])}"`;
}

describe('GET /api/benchmarks/price-performance', () => {
  it('serves the stale materialized complete projection after active reconstruction fails', async () => {
    const response = await onRequestGet(context({ activeReadFails: true, staleCache: true }));
    expect(response.status).toBe(200);
    expect((await response.json()).freshness.status).toBe('stale');
  });

  it('reconstructs the current projection from the active revision when no cache exists', async () => {
    const response = await onRequestGet(context());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.points.map((point: { slug: string }) => point.slug).sort()).toEqual(['alpha', 'beta']);
    expect(body.data.capabilities.scoreLanes).toHaveLength(9);
    expect(body.data.capabilities.statuses).toEqual(['current', 'archived']);
    expect(body.data.costDefinitions.output).toBe('Published output USD per one million tokens');
  });

  it('falls back to the current stale materialized projection when an archived request cannot reconstruct', async () => {
    const response = await onRequestGet(context({
      includeArchived: true,
      activeReadFails: true,
      staleCache: true,
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.freshness.status).toBe('stale');
    expect(body.revision).toBe(REVISION);
  });

  it('returns an exact 304 for a matching stale current projection ETag on an archived request', async () => {
    const response = await onRequestGet(context({
      includeArchived: true,
      activeReadFails: true,
      staleCache: true,
      headers: { 'If-None-Match': staleEtag() },
    }));
    expect(response.status).toBe(304);
    expect(response.headers.get('etag')).toBe(staleEtag());
  });

  it('rejects an unknown query key', async () => {
    const response = await onRequestGet({
      request: new Request('https://tokenbench.monomind.one/api/benchmarks/price-performance?lane=coding'),
      env: context().env,
    });
    expect(response.status).toBe(400);
  });

  it('returns 503 when no cache and no active revision are available', async () => {
    const response = await onRequestGet(context({ activeReadFails: true, staleCache: false }));
    expect(response.status).toBe(503);
  });
});
