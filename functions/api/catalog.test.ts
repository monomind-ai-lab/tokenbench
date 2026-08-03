import { describe, expect, it } from 'vitest';
import { onRequestGet } from './catalog';

const source = {
  id: 'openai-api', provider_id: 'openai', source_url: 'https://platform.openai.com/docs/pricing',
  observed_at: '2026-08-03T00:00:00.000Z', source_kind: 'official_json', confidence: 'official', snapshot_key: null,
};
const plan = {
  id: 'openai:plus', provider_id: 'openai', display_name: 'Plus', monthly_cost_micro_dollars: 20_000_000,
  currency: 'USD', entitlement_json: JSON.stringify({ kind: 'rolling_limit', description: 'Usage limits apply.' }), source_id: 'openai-api',
};
const model = {
  id: 'openai:gpt-4o:direct', provider_id: 'openai', display_name: 'GPT-4o', model_id: 'gpt-4o',
  pricing_basis: 'direct_provider_api', route: 'direct_provider', currency: 'USD', unit: 'micro_dollars_per_million_tokens',
  input_micro_dollars_per_million: 2_500_000, cached_input_micro_dollars_per_million: null,
  output_micro_dollars_per_million: 10_000_000, source_id: 'openai-api',
};

function d1(rows: Record<string, unknown[]>) {
  return {
    prepare(sql: string) {
      const key = sql.includes('catalog_revisions') ? 'revision'
        : sql.includes('source_records') ? 'sources'
          : sql.includes('plan_offers') ? 'plans' : 'models';
      return { bind: () => ({ all: async () => ({ results: rows[key] ?? [] }) }) };
    },
  };
}

describe('GET /api/catalog', () => {
  it('returns the current D1 revision filtered by provider with an ETag', async () => {
    const response = await onRequestGet({
      request: new Request('https://example.com/api/catalog?provider=openai'),
      env: { CATALOG_DB: d1({ revision: [{ revision: 'rev-1', published_at: '2026-08-03T00:00:00.000Z', checked_at: '2026-08-03T01:00:00.000Z' }], sources: [source], plans: [plan], models: [model] }) },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBe('"rev-1"');
    expect(response.headers.get('cache-control')).toContain('public');
    await expect(response.json()).resolves.toMatchObject({ revision: 'rev-1', plans: [{ id: 'openai:plus' }], modelOffers: [{ id: 'openai:gpt-4o:direct' }] });
  });

  it('returns 304 when the client has the current revision', async () => {
    const response = await onRequestGet({
      request: new Request('https://example.com/api/catalog', { headers: { 'If-None-Match': '"rev-1"' } }),
      env: { CATALOG_DB: d1({ revision: [{ revision: 'rev-1', published_at: '2026-08-03T00:00:00.000Z', checked_at: '2026-08-03T01:00:00.000Z' }], sources: [source], plans: [plan], models: [model] }) },
    });
    expect(response.status).toBe(304);
  });

  it('falls back to the marked bootstrap catalog when D1 is unavailable or unseeded', async () => {
    const response = await onRequestGet({ request: new Request('https://example.com/api/catalog'), env: {} });
    const body = await response.json() as { freshness: { status: string }; provenance: unknown[] };
    expect(response.status).toBe(200);
    expect(body.freshness.status).toBe('bootstrap');
    expect(body.provenance).toHaveLength(9);
  });

  it('marks a published revision stale when its refresh timestamp exceeds one day', async () => {
    const response = await onRequestGet({
      request: new Request('https://example.com/api/catalog'),
      env: { CATALOG_DB: d1({ revision: [{ revision: 'old-rev', published_at: '2020-01-01T00:00:00.000Z', checked_at: '2020-01-01T00:00:00.000Z' }], sources: [source], plans: [plan], models: [model] }) },
    });
    await expect(response.json()).resolves.toMatchObject({ revision: 'old-rev', freshness: { status: 'stale' } });
  });
});
