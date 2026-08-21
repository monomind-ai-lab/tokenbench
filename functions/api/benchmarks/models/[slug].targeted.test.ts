import { describe, expect, it } from 'vitest';
import { readActiveBenchmarkModelSnapshot } from '../../../_shared/benchmark-db';
import { onRequestGet } from './[slug]';

const REVISION = 'benchmark-r1';
const CHECKED_AT = '2026-08-06T00:00:00.000Z';
const hash = (value: string) => `sha256:${value.repeat(64)}`;

const revision = {
  revision: REVISION,
  generated_at: CHECKED_AT,
  published_at: CHECKED_AT,
  checked_at: CHECKED_AT,
  publication_state: 'published',
  content_hash: hash('0'),
  catalog_revision: 'catalog-r1',
  openrouter_content_hash: hash('1'),
};

const model = {
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

const metric = {
  revision: REVISION,
  model_key: model.model_key,
  metric_key: 'benchlm:overall:raw',
  category: 'overall',
  value: 90,
  rank: 1,
  lower_bound: null,
  upper_bound: null,
  vote_count: null,
  unit: 'score',
  source_id: 'benchlm',
  source_updated_at: CHECKED_AT,
  source_model_id: model.source_model_id,
  source_artifact_id: 'models',
  ranking_eligible: 1,
  methodology: 'benchlm_raw_composite',
  observation_count: null,
  session_count: null,
};

const price = {
  revision: REVISION,
  model_key: model.model_key,
  source_id: 'openrouter',
  provider_id: 'openrouter',
  route_id: 'openrouter:provider/alpha',
  source_model_id: model.source_model_id,
  canonical_slug: null,
  input_usd_per_million: 1,
  cached_input_usd_per_million: null,
  cache_write_usd_per_million: 0.2,
  output_usd_per_million: 4,
  context_window_tokens: 128_000,
  max_input_tokens: 128_000,
  max_output_tokens: null,
  input_modalities_json: '["text"]',
  output_modalities_json: '["text"]',
  supported_parameters_json: '["tools"]',
  created_at: '2026-08-01T00:00:00.000Z',
  expiration_date: '2027-08-01',
  knowledge_cutoff: '2025-06',
  tokenizer: 'o200k_base',
  instruction_format: 'chatml',
  is_moderated: 1,
  per_request_limits_json: '{"max_requests":10}',
  source_artifact_id: 'catalog:catalog-r1',
  verification_status: 'primary',
};

const pair = {
  revision: REVISION,
  pair_slug: 'alpha-vs-beta',
  model_a_key: model.model_key,
  model_b_key: 'provider:beta',
  indexable: 1,
  eligibility_reason: 'Reviewed comparison pair',
  featured_rank: 1,
  shared_metric_count: 2,
};

const sources = [
  {
    revision: REVISION,
    source_id: 'benchlm',
    artifact_id: 'models',
    source_url: 'https://benchlm.example/models',
    observed_at: CHECKED_AT,
    etag: null,
    last_modified: null,
    upstream_revision: null,
    schema_version: null,
    snapshot_key: 'benchlm/models.json',
    content_hash: hash('2'),
    original_content_hash: hash('3'),
    license_id: 'MIT',
    attribution_text: 'BenchLM',
  },
  {
    revision: REVISION,
    source_id: 'openrouter',
    artifact_id: 'catalog:catalog-r1',
    source_url: 'https://openrouter.ai/api/v1/models',
    observed_at: CHECKED_AT,
    etag: null,
    last_modified: null,
    upstream_revision: 'catalog-r1',
    schema_version: null,
    snapshot_key: 'openrouter/models.json',
    content_hash: hash('1'),
    original_content_hash: hash('4'),
    license_id: 'OpenRouter-ToS',
    attribution_text: 'OpenRouter',
  },
];

function targetedD1() {
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
              if (sql.includes('benchmark_models')) {
                if (!sql.includes('slug = ?')) throw new Error('model detail must not read every benchmark model');
                return { results: [model] };
              }
              if (sql.includes('benchmark_metrics')) {
                if (!sql.includes('model_key = ?')) throw new Error('model detail must not read every benchmark metric');
                return { results: [metric] };
              }
              if (sql.includes('benchmark_price_checks')) {
                if (!sql.includes('model_key = ?')) throw new Error('model detail must not read every benchmark price');
                return { results: [price] };
              }
              if (sql.includes('benchmark_comparison_pairs')) {
                if (!sql.includes('model_a_key = ?') || !sql.includes('model_b_key = ?')) {
                  throw new Error('model detail must not read every comparison pair');
                }
                return { results: [pair] };
              }
              if (sql.includes('benchmark_source_records')) return { results: sources };
              throw new Error(`Unexpected query: ${sql}`);
            },
          };
        },
      };
    },
  };
}

describe('targeted benchmark model API', () => {
  it('serves a model detail using only its slug-scoped facts', async () => {
    const db = targetedD1();

    const response = await onRequestGet({
      request: new Request('https://tokenbench.example/api/benchmarks/models/alpha'),
      env: { CATALOG_DB: db },
      params: { slug: 'alpha' },
    });

    expect(response.status).toBe(200);
    const body = await response.json() as { attribution: readonly unknown[] };
    expect(body.attribution).toEqual(expect.arrayContaining([expect.objectContaining({
      sourceId: 'openrouter',
      url: 'https://openrouter.ai/api/v1/models',
      updatedAt: CHECKED_AT,
    })]));
    expect(body).toMatchObject({
      revision: REVISION,
      data: {
        model: { slug: 'alpha' },
        metrics: [{ metricKey: 'benchlm:overall:raw' }],
        priceChecks: [{
          routeId: 'openrouter:provider/alpha',
          cacheWriteUsdPerMillion: 0.2,
          createdAt: '2026-08-01T00:00:00.000Z',
          expirationDate: '2027-08-01',
          knowledgeCutoff: '2025-06',
          tokenizer: 'o200k_base',
          instructionFormat: 'chatml',
          isModerated: true,
          perRequestLimitsJson: '{"max_requests":10}',
          sourceArtifactId: 'catalog:catalog-r1',
        }],
      },
    });
    expect(db.queries).not.toContain(expect.stringContaining('SELECT * FROM benchmark_models WHERE revision = ?\n'));
  });

  it('reads more than 50 distinct evidence artifacts with a bounded D1 bind set', async () => {
    const boundarySources = Array.from({ length: 60 }, (_, index) => {
      const artifactId = `artifact-${String(index).padStart(3, '0')}`;
      return {
        ...sources[0],
        artifact_id: artifactId,
        snapshot_key: `benchlm/${artifactId}.json`,
        attribution_text: `BenchLM evidence ${index}`,
      };
    });
    const boundaryModel = {
      ...model,
      source_artifact_id: boundarySources[0].artifact_id,
      benchmark_count: boundarySources.length,
    };
    const boundaryMetrics = boundarySources.map((source, index) => ({
      ...metric,
      metric_key: `benchlm:boundary:${index}`,
      source_artifact_id: source.artifact_id,
      value: index + 1,
    }));
    const sourceBindings: unknown[][] = [];
    const db = {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            return {
              all: async () => {
                if (sql.includes('benchmark_publication_state')) return { results: [revision] };
                if (sql.includes('benchmark_models')) return { results: [boundaryModel] };
                if (sql.includes('benchmark_metrics')) return { results: boundaryMetrics };
                if (sql.includes('benchmark_price_checks') || sql.includes('benchmark_comparison_pairs')) return { results: [] };
                if (sql.includes('benchmark_source_records')) {
                  sourceBindings.push(values);
                  const jsonPayload = values.find((value): value is string => typeof value === 'string' && value.startsWith('['));
                  const references = jsonPayload
                    ? JSON.parse(jsonPayload) as Array<{ sourceId: string; sourceArtifactId: string }>
                    : Array.from({ length: (values.length - 1) / 2 }, (_, index) => ({
                      sourceId: values[index * 2 + 1] as string,
                      sourceArtifactId: values[index * 2 + 2] as string,
                    }));
                  const wanted = new Set(references.map((reference) => `${reference.sourceId}\u0000${reference.sourceArtifactId}`));
                  return {
                    results: boundarySources.filter((source) => wanted.has(`${source.source_id}\u0000${source.artifact_id}`)),
                  };
                }
                throw new Error(`Unexpected query: ${sql}`);
              },
            };
          },
        };
      },
    };

    const snapshot = await readActiveBenchmarkModelSnapshot(db, 'alpha');

    expect(snapshot?.metrics).toHaveLength(60);
    expect(snapshot?.sources.map((source) => [source.sourceId, source.artifactId, source.attributionText])).toEqual(
      boundarySources.map((source) => [source.source_id, source.artifact_id, source.attribution_text]),
    );
    expect(sourceBindings).toHaveLength(1);
    expect(sourceBindings[0].length).toBeLessThanOrEqual(100);
  });
});
