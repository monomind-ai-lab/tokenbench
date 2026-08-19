import { describe, expect, it } from 'vitest';
import { parseUiDataContractV1Runtime } from '../../../src/pipeline/ui-data-contract-v1';
import {
  readActiveLiveBenchBundle,
  type LiveBenchD1Database,
} from '../../_shared/livebench-db';
import { onRequestGet, onRequestPost, parseLiveBenchRankingsRequest } from './rankings';

const checkedAt = '2026-08-19T09:00:00.000Z';
const releaseRow = {
  revision: 'livebench-2026-06-25',
  source_release_id: '2026-06-25',
  release_kind: 'current',
  publication_state: 'published',
  source_commit: 'a'.repeat(40),
  source_manifest_key: 'evidence/benchmark/livebench/attempt/manifest.json',
  source_manifest_hash: `sha256:${'b'.repeat(64)}`,
  source_fingerprint: `sha256:${'c'.repeat(64)}`,
  observed_at: checkedAt,
  checked_at: checkedAt,
  released_at: '2026-06-25T00:00:00.000Z',
  published_at: '2026-08-19T09:05:00.000Z',
  license_id: 'CDLA-Permissive-2.0',
  license_verification_url: 'https://example.com/license-review',
  license_verified_at: checkedAt,
  attribution_text: 'LiveBench source attribution',
};

function database(): LiveBenchD1Database {
  const categories = [{ category_id: 'reasoning', label: 'Reasoning' }];
  const tasks = [{ task_id: 'logic', label: 'Logic', category_id: 'reasoning' }];
  const models = [
    {
      configuration_id: 'alpha', source_model_id: 'alpha', display_name: 'Alpha', organization: 'Example',
      open_weights: null, reasoner: 1, is_derivative_finetune: 0,
      base_configuration_id: null, lineage_source_url: null,
    },
    {
      configuration_id: 'beta', source_model_id: 'beta', display_name: 'Beta', organization: 'Open Org',
      open_weights: 1, reasoner: 0, is_derivative_finetune: 0,
      base_configuration_id: null, lineage_source_url: null,
    },
  ];
  const scores = [
    { configuration_id: 'alpha', task_id: 'logic', score: 80 },
    { configuration_id: 'beta', task_id: 'logic', score: 90 },
  ];
  const economics = [
    {
      configuration_id: 'alpha', task_id: 'logic', question_count: 10, evaluation_cost_usd: 1,
      input_price_usd_per_million: null, output_price_usd_per_million: null,
      mean_input_tokens: null, mean_output_tokens: null,
    },
    {
      configuration_id: 'beta', task_id: 'logic', question_count: 10, evaluation_cost_usd: 0.5,
      input_price_usd_per_million: 1, output_price_usd_per_million: 2,
      mean_input_tokens: 100, mean_output_tokens: 50,
    },
  ];
  return {
    prepare(sql) {
      return {
        bind() { return this; },
        async first<T>() {
          return sql.includes('livebench_publication_state AS pointer') ? releaseRow as T : null;
        },
        async all<T>() {
          const results = sql.includes('livebench_categories') ? categories
            : sql.includes('livebench_tasks') ? tasks
              : sql.includes('livebench_model_configurations') ? models
                : sql.includes('livebench_task_scores') ? scores
                  : sql.includes('livebench_task_economics') ? economics
                    : [];
          return { results: results as T[] };
        },
        async run() { return { meta: { changes: 1 } }; },
      };
    },
    async batch() { return []; },
  };
}

describe('LiveBench rankings endpoint', () => {
  it('normalizes the public query grammar without accepting duplicate parameters', () => {
    const normalized = parseLiveBenchRankingsRequest(new Request(
      'https://tokenbench.example/api/benchmarks/rankings?operation=leaderboard&openWeights=only&limit=10',
    ));
    expect(normalized).toMatchObject({
      operation: 'leaderboard',
      filters: { openWeights: 'only' },
      limit: 10,
    });
    expect(() => parseLiveBenchRankingsRequest(new Request(
      'https://tokenbench.example/api/benchmarks/rankings?limit=10&limit=20',
    ))).toThrow(/duplicate/i);
  });

  it('returns a schema-valid unavailable envelope without a database binding', async () => {
    const response = await onRequestGet({
      request: new Request('https://tokenbench.example/api/benchmarks/rankings?operation=leaderboard'),
      env: {},
    });
    const payload = await response.json();
    expect(response.status).toBe(404);
    expect(parseUiDataContractV1Runtime(payload, 'rankings')).toMatchObject({ status: 'unavailable' });
  });

  it('propagates active-release read faults as service failures', async () => {
    const response = await onRequestGet({
      request: new Request('https://tokenbench.example/api/benchmarks/rankings?operation=leaderboard'),
      env: { CATALOG_DB: {
        prepare() { throw new Error('D1 unavailable'); },
        async batch() { return []; },
      } },
    });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'service_unavailable' } });
  });

  it('serves a validated partial v1 envelope from the verified active pointer', async () => {
    const db = database();
    expect(await readActiveLiveBenchBundle(db)).not.toBeNull();
    const request = new Request(
      'https://tokenbench.example/api/benchmarks/rankings?operation=leaderboard&openWeights=only&limit=50',
    );
    const response = await onRequestGet({ request, env: { CATALOG_DB: db } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toMatch(/^"ui-data-/);
    const envelope = parseUiDataContractV1Runtime(payload, 'rankings');
    expect(envelope.status).toBe('partial');
    expect(envelope.data?.rows.map((row) => row.model.identity.slug)).toEqual(['beta']);
  });

  it('rejects unknown query parameters before reading D1', async () => {
    const response = await onRequestGet({
      request: new Request('https://tokenbench.example/api/benchmarks/rankings?metric=invented'),
      env: { CATALOG_DB: database() },
    });
    expect(response.status).toBe(400);
  });

  it('rejects a cursor that is not bound to the exact release and filter matrix', async () => {
    const response = await onRequestGet({
      request: new Request(
        'https://tokenbench.example/api/benchmarks/rankings?operation=leaderboard&cursor=eyJ2IjoxfQ',
      ),
      env: { CATALOG_DB: database() },
    });
    expect(response.status).toBe(400);
  });

  it('returns unavailable for a requested release that is not active', async () => {
    const response = await onRequestGet({
      request: new Request(
        'https://tokenbench.example/api/benchmarks/rankings?operation=leaderboard&releaseId=2026-01-08',
      ),
      env: { CATALOG_DB: database() },
    });
    expect(response.status).toBe(404);
    expect(parseUiDataContractV1Runtime(await response.json(), 'rankings').status).toBe('unavailable');
  });

  it('validates and echoes the exact custom matrix without fixture fallback', async () => {
    const matrix = {
      operation: 'custom',
      dimensionSetRevision: 'requested-v1',
      weights: { reasoning: 70, coding: 30 },
      filters: {
        access: 'all', providerIds: [], excludeDerivativeFinetunes: false,
        requiredInputModalities: [], maxInputMicroDollarsPerMillion: null,
        maxOutputMicroDollarsPerMillion: null, minTpsP50: null, maxTtftP50Ms: null,
        minContextWindowTokens: null, minMaxOutputTokens: null,
      },
      includeIneligible: true,
      limit: 50,
    };
    const response = await onRequestPost({ request: new Request(
      'https://tokenbench.example/api/benchmarks/rankings',
      { method: 'POST', body: JSON.stringify(matrix) },
    ) });
    const envelope = parseUiDataContractV1Runtime(await response.json(), 'rankings');
    expect(response.status).toBe(404);
    expect(envelope.request).toEqual(matrix);
    expect(envelope.status).toBe('unavailable');
  });

  it('calculates a custom ranking from the active LiveBench dimension set', async () => {
    const matrix = {
      operation: 'custom',
      dimensionSetRevision: 'livebench-2026-06-25-benchmark-dimensions-v1',
      weights: { reasoning: 100 },
      filters: {
        access: 'all', providerIds: [], excludeDerivativeFinetunes: false,
        requiredInputModalities: [], maxInputMicroDollarsPerMillion: null,
        maxOutputMicroDollarsPerMillion: null, minTpsP50: null, maxTtftP50Ms: null,
        minContextWindowTokens: null, minMaxOutputTokens: null,
      },
      includeIneligible: true,
      limit: 50,
    };
    const response = await onRequestPost({
      request: new Request('https://tokenbench.example/api/benchmarks/rankings', {
        method: 'POST', body: JSON.stringify(matrix),
      }),
      env: { CATALOG_DB: database() },
    });
    const envelope = parseUiDataContractV1Runtime(await response.json(), 'rankings');

    expect(response.status).toBe(200);
    expect(envelope.request).toEqual(matrix);
    expect(envelope.data?.operation).toBe('custom');
    if (envelope.data?.operation !== 'custom') throw new Error('expected custom rankings');
    expect(envelope.data.submittedWeights).toEqual({ reasoning: 100 });
    expect(envelope.data.rows.map((row) => row.model.identity.slug)).toEqual(['beta', 'alpha']);
  });
});
