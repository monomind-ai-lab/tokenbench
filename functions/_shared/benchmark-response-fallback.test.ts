import { describe, expect, it, vi } from 'vitest';
import {
  benchmarkCorrelationId,
  serveBenchmarkWithFallback,
  type BenchmarkFallbackLog,
} from './benchmark-response-fallback';

const staleRow = {
  revision: 'benchmark-rev-41',
  variant: 'stale',
  chunk_index: 0,
  etag: '"benchmark-rev-41-stale"',
  body: '{"revision":"benchmark-rev-41","freshness":{"status":"stale"}}',
};

function database(options: {
  readonly activeRows?: readonly Record<string, unknown>[];
  readonly historicalRows?: readonly Record<string, unknown>[];
  readonly activeError?: Error;
  readonly historicalError?: Error;
} = {}) {
  return {
    prepare(sql: string) {
      const historical = sql.includes('complete_revisions');
      return {
        bind() {
          return {
            all: async () => {
              if (historical && options.historicalError) throw options.historicalError;
              if (!historical && options.activeError) throw options.activeError;
              return { results: [...(historical ? options.historicalRows ?? [] : options.activeRows ?? [])] };
            },
          };
        },
      };
    },
  };
}

function unavailable(): Response {
  return new Response('{"error":"Benchmark data unavailable"}', {
    status: 503,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function request(headers?: HeadersInit): Request {
  return new Request('https://tokenbench.monomind.one/api/benchmarks', { headers });
}

describe('benchmark response fallback controller', () => {
  it('continues to active reconstruction when the materialized active cache is corrupt', async () => {
    const logs: BenchmarkFallbackLog[] = [];
    const reconstruct = vi.fn(async () => new Response('{"revision":"active"}', {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }));

    const response = await serveBenchmarkWithFallback({
      request: request(),
      endpoint: 'summary',
      queryId: 'summary',
      cacheKey: 'summary',
      correlationId: 'request-1',
      db: database({ activeError: new Error('secret cache bytes') }),
      reconstruct,
      unavailable,
      log: (entry) => logs.push(entry),
      now: Date.parse('2026-08-06T00:00:00.000Z'),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ revision: 'active' });
    expect(reconstruct).toHaveBeenCalledOnce();
    expect(logs).toContainEqual(expect.objectContaining({
      event: 'benchmark_fresh_cache_failed',
      stage: 'active-cache',
      errorClass: 'Error',
      fallbackSelected: false,
      correlationId: 'request-1',
    }));
    expect(JSON.stringify(logs)).not.toContain('secret cache bytes');
  });

  it('serves the newest complete stale body when active reconstruction fails', async () => {
    const logs: BenchmarkFallbackLog[] = [];
    const response = await serveBenchmarkWithFallback({
      request: request(),
      endpoint: 'summary',
      queryId: 'summary',
      cacheKey: 'summary',
      correlationId: 'request-2',
      db: database({ historicalRows: [staleRow] }),
      reconstruct: async () => { throw new TypeError('private D1 details'); },
      unavailable,
      log: (entry) => logs.push(entry),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      revision: 'benchmark-rev-41',
      freshness: { status: 'stale' },
    });
    expect(logs).toContainEqual(expect.objectContaining({
      event: 'benchmark_active_revision_failed',
      stage: 'active-revision',
    }));
    expect(logs).toContainEqual(expect.objectContaining({
      event: 'benchmark_stale_fallback_selected',
      stage: 'historical-cache',
      fallbackRevision: 'benchmark-rev-41',
      fallbackSelected: true,
    }));
    expect(JSON.stringify(logs)).not.toContain('private D1 details');
  });

  it('returns unavailable only after active cache, reconstruction, and historical cache are exhausted', async () => {
    const logs: BenchmarkFallbackLog[] = [];
    const response = await serveBenchmarkWithFallback({
      request: request(),
      endpoint: 'summary',
      queryId: 'summary',
      cacheKey: 'summary',
      correlationId: 'request-3',
      db: database(),
      reconstruct: async () => null,
      unavailable,
      log: (entry) => logs.push(entry),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'Benchmark data unavailable' });
    expect(logs).toContainEqual(expect.objectContaining({
      event: 'benchmark_unavailable',
      stage: 'historical-cache',
      fallbackSelected: false,
      correlationId: 'request-3',
    }));
  });

  it('preserves exact stale ETag 304 behavior', async () => {
    const response = await serveBenchmarkWithFallback({
      request: request({ 'If-None-Match': staleRow.etag }),
      endpoint: 'summary',
      queryId: 'summary',
      cacheKey: 'summary',
      correlationId: 'request-4',
      db: database({ historicalRows: [staleRow] }),
      reconstruct: async () => null,
      unavailable,
    });

    expect(response.status).toBe(304);
    expect(response.headers.get('etag')).toBe(staleRow.etag);
  });

  it('accepts only bounded request identifiers and otherwise generates a UUID', () => {
    expect(benchmarkCorrelationId(request({ 'cf-ray': 'abc-123-TPE' }), () => 'generated'))
      .toBe('abc-123-TPE');
    expect(benchmarkCorrelationId(request({ 'x-request-id': 'request_42' }), () => 'generated'))
      .toBe('request_42');
    expect(benchmarkCorrelationId(request({
      'cf-ray': 'contains spaces and secrets',
      'x-request-id': 'request_43',
    }), () => 'generated')).toBe('request_43');
    expect(benchmarkCorrelationId(request({ 'cf-ray': 'contains spaces and secrets' }), () => 'generated'))
      .toBe('generated');
  });
});
