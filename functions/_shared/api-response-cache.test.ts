import { describe, expect, it } from 'vitest';
import { cachedApiResponse, readApiResponseCache } from './api-response-cache';

function database(rows: Record<string, unknown>[] | Record<string, unknown> | undefined) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  return {
    calls,
    db: {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            calls.push({ sql, values });
            return { all: async () => ({ results: rows ? (Array.isArray(rows) ? rows : [rows]) : [] }) };
          },
        };
      },
    },
  };
}

const cachedRow = {
  revision: 'rev-1',
  variant: 'fresh',
  chunk_index: 0,
  etag: '"fresh"',
  body: '{"freshness":{"status":"fresh"}}',
};

describe('materialized API response cache', () => {
  it('selects and returns the active fresh JSON bytes without parsing them', async () => {
    const fake = database(cachedRow);
    const cached = await readApiResponseCache(
      fake.db,
      'catalog',
      'catalog',
      24 * 60 * 60 * 1_000,
      Date.parse('2026-08-05T12:00:00.000Z'),
    );

    expect(fake.calls[0]?.values).toEqual([
      'catalog',
      'catalog',
      '2026-08-04T12:00:00.000Z',
    ]);
    expect(cached).toEqual({
      revision: 'rev-1',
      freshness: 'fresh',
      etag: '"fresh"',
      body: cachedRow.body,
    });
    const response = cachedApiResponse(new Request('https://example.com/api/catalog'), cached!);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(cachedRow.body);
    expect(response.headers.get('etag')).toBe('"fresh"');
    expect(response.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
  });

  it('selects the prebuilt stale envelope after the freshness window', async () => {
    const cached = await readApiResponseCache(
      database({
        ...cachedRow,
        variant: 'stale',
        etag: '"stale"',
        body: '{"freshness":{"status":"stale"}}',
      }).db,
      'benchmarks',
      'summary',
      36 * 60 * 60 * 1_000,
      Date.parse('2026-08-07T00:00:00.001Z'),
    );

    expect(cached?.freshness).toBe('stale');
    expect(cached?.etag).toBe('"stale"');
    expect(cached?.body).toBe('{"freshness":{"status":"stale"}}');
  });

  it('joins contiguous response chunks without parsing the JSON', async () => {
    const cached = await readApiResponseCache(
      database([
        { ...cachedRow, body: '{"value":"hel' },
        { ...cachedRow, chunk_index: 1, body: 'lo"}' },
      ]).db,
      'benchmarks',
      'summary',
      36 * 60 * 60 * 1_000,
      Date.parse('2026-08-05T12:00:00.000Z'),
    );

    expect(cached?.body).toBe('{"value":"hello"}');
  });

  it('rejects missing or inconsistent response chunks', async () => {
    await expect(readApiResponseCache(
      database([
        cachedRow,
        { ...cachedRow, chunk_index: 2, body: '{}' },
      ]).db,
      'benchmarks',
      'summary',
      1,
    )).rejects.toThrow('not contiguous');
  });

  it('returns a 304 only for the exact selected freshness ETag', async () => {
    const cached = await readApiResponseCache(
      database({
        ...cachedRow,
        variant: 'stale',
        etag: '"stale"',
        body: '{"freshness":{"status":"stale"}}',
      }).db,
      'catalog',
      'catalog',
      24 * 60 * 60 * 1_000,
      Date.parse('2026-08-07T00:00:00.001Z'),
    );
    const response = cachedApiResponse(new Request('https://example.com/api/catalog', {
      headers: { 'If-None-Match': '"stale"' },
    }), cached!);

    expect(response.status).toBe(304);
    expect(await response.text()).toBe('');
  });

  it('returns null when no response set has been published', async () => {
    await expect(readApiResponseCache(
      database(undefined).db,
      'catalog',
      'catalog',
      1,
      Date.now(),
    )).resolves.toBeNull();
  });
});
