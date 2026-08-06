import { describe, expect, it } from 'vitest';
import { BOOTSTRAP_CATALOG } from '../../src/catalog/bootstrap';
import { onRequestGet } from './catalog';

const source = {
  id: 'openai-api', provider_id: 'openai', source_url: 'https://platform.openai.com/docs/pricing',
  observed_at: '2026-08-03T00:00:00.000Z', source_kind: 'official_json', confidence: 'official', snapshot_key: null, content_hash: 'sha256:abc', parser_version: 'v1', evidence_locator: 'pricing/table', review_status: 'verified',
};
const plan = {
  id: 'openai:plus', provider_id: 'openai', display_name: 'Plus', monthly_cost_micro_dollars: 20_000_000,
  currency: 'USD', entitlement_json: JSON.stringify({ kind: 'rolling_limit', description: 'Usage limits apply.' }), billing_cycle: 'monthly', supported_model_ids_json: JSON.stringify(['gpt-4o']), source_id: 'openai-api',
};
const model = {
  id: 'openai:gpt-4o:direct', provider_id: 'openai', display_name: 'GPT-4o', model_id: 'gpt-4o',
  pricing_basis: 'direct_provider_api', route: 'direct_provider', currency: 'USD', unit: 'micro_dollars_per_million_tokens',
  input_micro_dollars_per_million: 2_500_000, cached_input_micro_dollars_per_million: null,
  output_micro_dollars_per_million: 10_000_000, context_window_tokens: 128_000, max_output_tokens: 16_000, availability: 'available', source_id: 'openai-api',
};
const freshRevision = {
  revision: 'rev-1',
  published_at: '2099-01-01T00:00:00.000Z',
  checked_at: '2099-01-01T00:00:00.000Z',
};

function d1(rows: Record<string, unknown[]>) {
  const bindings: { sql: string; values: unknown[] }[] = [];
  return {
    bindings,
    prepare(sql: string) {
      const key = sql.includes('api_response_publication_state') ? 'cache'
        : sql.includes('catalog_revisions') ? 'revision'
        : sql.includes('source_records') ? 'sources'
          : sql.includes('plan_offers') ? 'plans' : 'models';
      return { bind: (...values: unknown[]) => {
        bindings.push({ sql, values });
        return { all: async () => ({ results: rows[key] ?? [] }) };
      } };
    },
  };
}

function cacheLookupD1({
  cachedByKey,
  facts = {},
}: {
  cachedByKey: Record<string, unknown[]>;
  facts?: Record<string, unknown[]>;
}) {
  const bindings: { sql: string; values: unknown[] }[] = [];
  return {
    bindings,
    prepare(sql: string) {
      const key = sql.includes('api_response_publication_state') ? 'cache'
        : sql.includes('catalog_revisions') ? 'revision'
          : sql.includes('source_records') ? 'sources'
            : sql.includes('plan_offers') ? 'plans' : 'models';
      return { bind: (...values: unknown[]) => {
        bindings.push({ sql, values });
        return {
          all: async () => ({
            results: key === 'cache'
              ? cachedByKey[String(values[1])] ?? []
              : facts[key] ?? [],
          }),
        };
      } };
    },
  };
}

const catalogCacheKey = `catalog:bootstrap:${BOOTSTRAP_CATALOG.revision}`;
const emptyCatalogProviderCacheKey = `catalog:bootstrap:${BOOTSTRAP_CATALOG.revision}:provider-empty`;

describe('GET /api/catalog', () => {
  it('serves the active materialized response without reading or validating catalog fact rows', async () => {
    const body = JSON.stringify({
      revision: 'rev-cached',
      publishedAt: '2026-08-06T00:00:00.000Z',
      freshness: { status: 'fresh', checkedAt: '2026-08-06T00:00:00.000Z' },
      provenance: [],
      plans: [],
      modelOffers: [],
    });
    const database = d1({ cache: [{
      revision: 'rev-cached',
      variant: 'fresh',
      chunk_index: 0,
      etag: '"rev-cached"',
      body,
    }] });

    const response = await onRequestGet({
      request: new Request('https://example.com/api/catalog'),
      env: { CATALOG_DB: database },
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(body);
    expect(database.bindings).toHaveLength(1);
    expect(database.bindings[0]?.values.slice(0, 2)).toEqual(['catalog', catalogCacheKey]);
    expect(response.headers.get('etag')).toBe('"rev-cached"');
  });

  it('misses a previous bootstrap-version cache and falls back to the current safe overlay', async () => {
    const previousDeployCacheKey = 'catalog:bootstrap:bootstrap-previous';
    const database = cacheLookupD1({
      cachedByKey: {
        [previousDeployCacheKey]: [{
          revision: 'rev-1+manual-bootstrap-previous',
          variant: 'fresh',
          chunk_index: 0,
          etag: '"rev-1+manual-bootstrap-previous"',
          body: '{"old":"bootstrap-overlay"}',
        }],
      },
      facts: {
        revision: [freshRevision],
        sources: [source],
        plans: [plan],
        models: [model],
      },
    });

    const response = await onRequestGet({
      request: new Request('https://example.com/api/catalog'),
      env: { CATALOG_DB: database },
    });

    expect(database.bindings[0]?.values.slice(0, 2)).toEqual(['catalog', catalogCacheKey]);
    expect(database.bindings.some(({ sql }) => sql.includes('source_records'))).toBe(true);
    expect(response.headers.get('etag')).toBe(`"rev-1+manual-${BOOTSTRAP_CATALOG.revision}"`);
    await expect(response.json()).resolves.toMatchObject({
      revision: `rev-1+manual-${BOOTSTRAP_CATALOG.revision}`,
      plans: expect.arrayContaining([expect.objectContaining({ id: 'openai:go' })]),
    });
  });

  it('serves the bootstrap-versioned empty provider response without catalog fact reads', async () => {
    const body = JSON.stringify({
      revision: `rev-cached+manual-${BOOTSTRAP_CATALOG.revision}`,
      publishedAt: '2026-08-06T00:00:00.000Z',
      freshness: { status: 'fresh', checkedAt: '2026-08-06T00:00:00.000Z' },
      provenance: [],
      plans: [],
      modelOffers: [],
    });
    const database = cacheLookupD1({
      cachedByKey: {
        [emptyCatalogProviderCacheKey]: [{
          revision: `rev-cached+manual-${BOOTSTRAP_CATALOG.revision}`,
          variant: 'fresh',
          chunk_index: 0,
          etag: `"rev-cached+manual-${BOOTSTRAP_CATALOG.revision}"`,
          body,
        }],
      },
    });

    const response = await onRequestGet({
      request: new Request('https://example.com/api/catalog?provider=unknown-provider'),
      env: { CATALOG_DB: database },
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(body);
    expect(response.headers.get('etag')).toBe(`"rev-cached+manual-${BOOTSTRAP_CATALOG.revision}"`);
    expect(database.bindings.map(({ values }) => values.slice(0, 2))).toEqual([
      ['catalog', `catalog:bootstrap:${BOOTSTRAP_CATALOG.revision}:provider:unknown-provider`],
      ['catalog', emptyCatalogProviderCacheKey],
    ]);
  });

  it('returns the current D1 revision filtered by provider with an ETag', async () => {
    const response = await onRequestGet({
      request: new Request('https://example.com/api/catalog?provider=openai'),
      env: { CATALOG_DB: d1({ revision: [freshRevision], sources: [source], plans: [plan], models: [model] }) },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBe('"rev-1+manual-bootstrap-2026-08-04"');
    expect(response.headers.get('cache-control')).toContain('public');
    const body = await response.json() as { revision: string; provenance: Array<Record<string, unknown>>; plans: Array<Record<string, unknown>>; modelOffers: Array<Record<string, unknown>> };
    expect(body.revision).toBe('rev-1+manual-bootstrap-2026-08-04');
    expect(body.provenance).toEqual(expect.arrayContaining([expect.objectContaining({ contentHash: 'sha256:abc', reviewStatus: 'verified' })]));
    expect(body.plans).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'openai:go', monthlyCostMicroDollars: 8_000_000 }),
      expect.objectContaining({ id: 'openai:plus', monthlyCostMicroDollars: 20_000_000 }),
    ]));
    expect(body.modelOffers).toEqual([expect.objectContaining({ id: 'openai:gpt-4o:direct', contextWindowTokens: 128_000, availability: 'available' })]);
  });

  it('returns 304 when the client has the current revision', async () => {
    const response = await onRequestGet({
      request: new Request('https://example.com/api/catalog', { headers: { 'If-None-Match': '"rev-1+manual-bootstrap-2026-08-04"' } }),
      env: { CATALOG_DB: d1({ revision: [freshRevision], sources: [source], plans: [plan], models: [model] }) },
    });
    expect(response.status).toBe(304);
  });

  it('does not bind values to the published-revision query without placeholders', async () => {
    const database = d1({ revision: [freshRevision], sources: [source], plans: [plan], models: [model] });
    await onRequestGet({ request: new Request('https://example.com/api/catalog'), env: { CATALOG_DB: database } });
    expect(database.bindings.find(({ sql }) => sql.includes('catalog_revisions'))?.values).toEqual([]);
  });

  it('falls back to the marked bootstrap catalog when D1 is unavailable or unseeded', async () => {
    const response = await onRequestGet({ request: new Request('https://example.com/api/catalog'), env: {} });
    const body = await response.json() as { freshness: { status: string }; provenance: unknown[]; plans: { providerId: string }[] };
    expect(response.status).toBe(200);
    expect(body.freshness.status).toBe('bootstrap');
    expect(body.provenance).toHaveLength(11);
    expect(new Set(body.plans.map((plan) => plan.providerId))).toEqual(new Set(['alibaba', 'anthropic', 'google', 'xai', 'kimi', 'openai', 'zai']));
  });

  it('matches the materialized stale ETag and message when fallback facts exceed one day', async () => {
    const response = await onRequestGet({
      request: new Request('https://example.com/api/catalog'),
      env: { CATALOG_DB: d1({ revision: [{ revision: 'old-rev', published_at: '2020-01-01T00:00:00.000Z', checked_at: '2020-01-01T00:00:00.000Z' }], sources: [source], plans: [plan], models: [model] }) },
    });
    expect(response.headers.get('etag')).toBe('"old-rev+manual-bootstrap-2026-08-04:stale"');
    await expect(response.json()).resolves.toMatchObject({
      revision: 'old-rev+manual-bootstrap-2026-08-04',
      freshness: {
        status: 'stale',
        message: 'Published catalog has not refreshed within 24 hours; showing the last verified revision.',
      },
    });
  });

  it.each([
    ['malformed entitlement JSON', { ...plan, entitlement_json: '<html>upstream error</html>' }],
    ['malformed supported-model metadata', { ...plan, supported_model_ids_json: '{not-json' }],
  ])('contains %s in the safe bootstrap fallback', async (_caseName, malformedPlan) => {
    const response = await onRequestGet({
      request: new Request('https://example.com/api/catalog'),
      env: { CATALOG_DB: d1({ revision: [{ revision: 'rev-1', published_at: '2026-08-03T00:00:00.000Z', checked_at: '2026-08-03T01:00:00.000Z' }], sources: [source], plans: [malformedPlan], models: [model] }) },
    });
    await expect(response.json()).resolves.toMatchObject({
      freshness: { status: 'bootstrap', message: 'Published catalog unavailable; serving checked-in bootstrap source records.' },
    });
  });
});
