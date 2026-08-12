import { describe, expect, it } from 'vitest';
import { onRequestGet } from './[pair]';

const REVISION = 'benchmark-r1';
const PUBLISHED_AT = '2026-08-06T00:00:00.000Z';
const hash = (value: string) => `sha256:${value.repeat(64)}`;

const revision = {
  revision: REVISION,
  generated_at: PUBLISHED_AT,
  published_at: PUBLISHED_AT,
  checked_at: PUBLISHED_AT,
  publication_state: 'published',
  content_hash: hash('0'),
  catalog_revision: 'catalog-r1',
  openrouter_content_hash: hash('1'),
};

const alpha = {
  revision: REVISION,
  model_key: 'provider:alpha',
  slug: 'alpha',
  name: 'Alpha',
  creator: 'Provider',
  source_type: 'Proprietary',
  reasoning_type: null,
  release_date: null,
  context_window_tokens: 128_000,
  evidence_status: 'supported',
  ranking_eligible: 1,
  confidence_lower: null,
  confidence_upper: null,
  benchmark_count: 1,
  source_id: 'benchlm',
  source_model_id: 'provider/alpha',
  source_artifact_id: 'models',
};

const beta = { ...alpha, model_key: 'provider:beta', slug: 'beta', name: 'Beta', source_model_id: 'provider/beta' };

const metric = (modelKey: string, sourceModelId: string, value: number) => ({
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
  source_updated_at: PUBLISHED_AT,
  source_model_id: sourceModelId,
  source_artifact_id: 'models',
  ranking_eligible: 1,
  methodology: 'benchlm_raw_composite',
  observation_count: null,
  session_count: null,
});

const price = (modelKey: string, sourceModelId: string) => ({
  revision: REVISION,
  model_key: modelKey,
  source_id: 'openrouter',
  provider_id: 'openrouter',
  route_id: `openrouter:${sourceModelId}`,
  source_model_id: sourceModelId,
  canonical_slug: null,
  input_usd_per_million: 1,
  cached_input_usd_per_million: null,
  output_usd_per_million: 4,
  context_window_tokens: 128_000,
  max_input_tokens: 128_000,
  max_output_tokens: null,
  input_modalities_json: '["text"]',
  output_modalities_json: '["text"]',
  supported_parameters_json: '["tools"]',
  source_artifact_id: 'catalog:catalog-r1',
  verification_status: 'primary',
});

const sources = [
  {
    revision: REVISION,
    source_id: 'benchlm', artifact_id: 'models', source_url: 'https://benchlm.example/models', observed_at: PUBLISHED_AT,
    etag: null, last_modified: null, upstream_revision: null, schema_version: null, snapshot_key: 'benchlm/models.json',
    content_hash: hash('2'), original_content_hash: hash('3'), license_id: 'MIT', attribution_text: 'BenchLM',
  },
  {
    revision: REVISION,
    source_id: 'openrouter', artifact_id: 'catalog:catalog-r1', source_url: 'https://openrouter.ai/api/v1/models', observed_at: PUBLISHED_AT,
    etag: null, last_modified: null, upstream_revision: 'catalog-r1', schema_version: null, snapshot_key: 'openrouter/models.json',
    content_hash: hash('1'), original_content_hash: hash('4'), license_id: 'OpenRouter-ToS', attribution_text: 'OpenRouter',
  },
];

function targetedD1({
  priceRows = [price(alpha.model_key, alpha.source_model_id), price(beta.model_key, beta.source_model_id)],
  sourceRows = sources,
}: {
  readonly priceRows?: readonly Record<string, unknown>[];
  readonly sourceRows?: readonly Record<string, unknown>[];
} = {}) {
  const queries: string[] = [];
  return {
    queries,
    prepare(sql: string) {
      return {
        bind(..._values: unknown[]) {
          queries.push(sql);
          return {
            all: async () => {
              if (sql.includes('benchmark_publication_state')) return { results: [revision] };
              if (sql.includes('benchmark_models') && sql.includes('slug IN')) return { results: [alpha, beta] };
              if (sql.includes('benchmark_models') && sql.includes('model_key IN')) return { results: [] };
              if (sql.includes('benchmark_metrics') && sql.includes('model_key IN')) {
                return { results: [metric(alpha.model_key, alpha.source_model_id, 90), metric(beta.model_key, beta.source_model_id, 80)] };
              }
              if (sql.includes('benchmark_price_checks') && sql.includes('model_key IN')) {
                return { results: [...priceRows] };
              }
              if (sql.includes('benchmark_comparison_pairs') && sql.includes('pair_slug = ?')) {
                return { results: [{
                  revision: REVISION,
                  pair_slug: 'alpha-vs-beta',
                  model_a_key: alpha.model_key,
                  model_b_key: beta.model_key,
                  indexable: 1,
                  eligibility_reason: 'Reviewed comparison pair',
                  featured_rank: 1,
                  shared_metric_count: 2,
                }] };
              }
              if (sql.includes('benchmark_comparison_pairs') && sql.includes('indexable = 1')) return { results: [] };
              if (sql.includes('benchmark_source_records')) return { results: [...sourceRows] };
              throw new Error(`Comparison page read an unscoped fact set: ${sql}`);
            },
          };
        },
      };
    },
  };
}

describe('targeted comparison Pages Function', () => {
  it('renders a canonical comparison from route-scoped model evidence', async () => {
    const db = targetedD1();
    const response = await onRequestGet({
      request: new Request('https://tokenbench.monomind.one/compare/alpha-vs-beta'),
      env: { CATALOG_DB: db },
      params: { pair: 'alpha-vs-beta' },
    });

    expect(response.status).toBe(200);
    expect((await response.text()).replaceAll('<!-- -->', '')).toContain('<h1 id="comparison-detail-heading">Alpha vs<br/> Beta</h1>');
    expect(db.queries.some((sql) => sql === 'SELECT * FROM benchmark_models WHERE revision = ?')).toBe(false);
  });

  it('keeps direct and router records with the same artifact ID source-distinct', async () => {
    const sharedArtifactId = 'shared-pricing';
    const direct = {
      ...price(alpha.model_key, alpha.source_model_id),
      source_id: 'benchlm',
      provider_id: 'provider',
      route_id: 'direct:provider/alpha',
      output_usd_per_million: null,
      source_artifact_id: sharedArtifactId,
    };
    const routed = {
      ...price(alpha.model_key, alpha.source_model_id),
      source_artifact_id: sharedArtifactId,
    };
    const db = targetedD1({
      priceRows: [direct, routed, price(beta.model_key, beta.source_model_id)],
      sourceRows: [
        ...sources,
        {
          ...sources[0],
          artifact_id: sharedArtifactId,
          source_url: 'https://provider.example/pricing',
          observed_at: '2026-08-07T00:00:00.000Z',
          snapshot_key: 'benchlm/direct-pricing.json',
        },
        {
          ...sources[1],
          artifact_id: sharedArtifactId,
          observed_at: '2026-08-06T00:00:00.000Z',
          snapshot_key: 'openrouter/shared-pricing.json',
        },
      ],
    });

    const response = await onRequestGet({
      request: new Request('https://tokenbench.monomind.one/compare/alpha-vs-beta'),
      env: { CATALOG_DB: db },
      params: { pair: 'alpha-vs-beta' },
    });
    const html = await response.text();
    const payload = html.match(/<script id="comparison-initial-data" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
    if (!payload) throw new Error('Expected comparison hydration payload');
    const viewModel = JSON.parse(payload) as {
      priceChecks: Array<{ modelKey: string; selectedRouteId: string | null; checks: Array<{ routeId: string; outputUsdPerMillion: number | null }> }>;
    };

    expect(response.status).toBe(200);
    expect(viewModel.priceChecks[0]).toEqual({
      modelKey: alpha.model_key,
      selectedRouteId: 'direct:provider/alpha',
      checks: [
        expect.objectContaining({ routeId: 'direct:provider/alpha', outputUsdPerMillion: null }),
        expect.objectContaining({ routeId: `openrouter:${alpha.source_model_id}` }),
      ],
    });
  });
});
