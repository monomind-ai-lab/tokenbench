import { describe, expect, it } from 'vitest';
import { parseUiDataContractV1Runtime } from '../../../src/pipeline/ui-data-contract-v1';
import { onRequestGet } from './lifecycle';

describe('lifecycle v1 endpoint boundary', () => {
  it('echoes the normalized request and stays explicitly unavailable', async () => {
    const response = await onRequestGet({ request: new Request(
      'https://tokenbench.example/api/benchmarks/lifecycle?asOf=2026-08-19T00%3A00%3A00.000Z&horizonDays=30',
    ) });
    const envelope = parseUiDataContractV1Runtime(await response.json(), 'lifecycle');
    expect(response.status).toBe(404);
    expect(envelope.request).toEqual({ asOf: '2026-08-19T00:00:00.000Z', horizonDays: 30 });
    expect(envelope.status).toBe('unavailable');
  });

  it('projects official endpoint expirations from the active catalog without inferring replacements', async () => {
    const db = {
      prepare(query: string) {
        return {
          bind: (..._values: unknown[]) => ({
            async all<T>() {
              const results = query.includes('FROM catalog_publication_state')
                ? [{
                    revision: 'catalog-r1',
                    checked_at: '2026-08-20T12:00:00.000Z',
                    source_url: 'https://openrouter.ai/api/v1/models',
                    observed_at: '2026-08-20T12:00:00.000Z',
                  }]
                : [
                    { id: 'openai:openai/retired:openrouter', provider_id: 'openai', display_name: 'Retired', model_id: 'openai/retired', expiration_date: '2026-08-15' },
                    { id: 'openai:openai/future:openrouter', provider_id: 'openai', display_name: 'Future', model_id: 'openai/future', expiration_date: '2026-09-01' },
                    { id: 'openai:openai/outside:openrouter', provider_id: 'openai', display_name: 'Outside', model_id: 'openai/outside', expiration_date: '2026-12-01' },
                  ];
              return { results: results as T[] };
            },
          }),
        };
      },
    };
    const response = await onRequestGet({
      request: new Request('https://tokenbench.example/api/benchmarks/lifecycle?asOf=2026-08-21T00%3A00%3A00.000Z&horizonDays=30'),
      env: { CATALOG_DB: db },
    });
    const envelope = parseUiDataContractV1Runtime(await response.json(), 'lifecycle');

    expect(response.status).toBe(200);
    expect(envelope.status).toBe('partial');
    expect(envelope.revisions.catalog).toBe('catalog-r1');
    expect(envelope.sources).toEqual([
      expect.objectContaining({ label: 'Endpoint catalog lifecycle metadata', licenseId: 'OpenRouter-ToS' }),
    ]);
    expect(envelope.data?.models).toEqual([
      expect.objectContaining({
        identity: expect.objectContaining({ slug: 'openai-retired', organization: 'openai' }),
        status: expect.objectContaining({ value: 'retired' }),
        replacement: expect.objectContaining({ availability: 'unavailable', value: null }),
      }),
      expect.objectContaining({
        identity: expect.objectContaining({ slug: 'openai-future', organization: 'openai' }),
        status: expect.objectContaining({ value: 'sunset_scheduled' }),
      }),
    ]);
    expect(envelope.warnings.filter((warning) => warning.code === 'lifecycle_replacement_unavailable')).toHaveLength(2);
  });

  it('returns a service error when a published catalog cannot be projected', async () => {
    const db = {
      prepare() {
        return { bind: () => ({ all: async () => { throw new Error('missing expiration migration'); } }) };
      },
    };
    const response = await onRequestGet({
      request: new Request('https://tokenbench.example/api/benchmarks/lifecycle?asOf=2026-08-21T00%3A00%3A00.000Z&horizonDays=30'),
      env: { CATALOG_DB: db },
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: 'lifecycle_projection_failed',
        message: 'Published lifecycle metadata could not be projected.',
      },
    });
  });

  it('rejects invalid timestamps and duplicate inputs', async () => {
    for (const query of [
      'asOf=2026-08-19T00%3A00%3A00%2B08%3A00&horizonDays=30',
      'asOf=2026-08-19T00%3A00%3A00.000Z&horizonDays=30&horizonDays=60',
    ]) {
      expect((await onRequestGet({ request: new Request(`https://tokenbench.example/api/benchmarks/lifecycle?${query}`) })).status).toBe(400);
    }
  });

  it('honors exact ETag revalidation for a normalized lifecycle query', async () => {
    const db = {
      prepare(query: string) {
        return {
          bind: (..._values: unknown[]) => ({
            async all<T>() {
              const results = query.includes('FROM catalog_publication_state')
                ? [{
                    revision: 'catalog-r1',
                    checked_at: '2099-01-01T00:00:00.000Z',
                    source_url: 'https://openrouter.ai/api/v1/models',
                    observed_at: '2099-01-01T00:00:00.000Z',
                  }]
                : [];
              return { results: results as T[] };
            },
          }),
        };
      },
    };
    const url = 'https://tokenbench.example/api/benchmarks/lifecycle?asOf=2026-08-21T00%3A00%3A00.000Z&horizonDays=30';
    const initial = await onRequestGet({ request: new Request(url), env: { CATALOG_DB: db } });
    const etag = initial.headers.get('etag');
    expect(etag).toBeTruthy();
    const revalidated = await onRequestGet({
      request: new Request(url, { headers: { 'if-none-match': etag ?? '' } }),
      env: { CATALOG_DB: db },
    });
    expect(revalidated.status).toBe(304);
  });
});
