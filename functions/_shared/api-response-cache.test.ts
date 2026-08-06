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
      17,
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

  it('accepts the exact chunk-count cap and rejects one additional row', async () => {
    const rows = (count: number) => Array.from({ length: count }, (_, index) => ({
      ...cachedRow,
      chunk_index: index,
      body: 'x',
    }));

    await expect(readApiResponseCache(
      database(rows(16)).db,
      'benchmarks',
      'summary',
      1,
    )).resolves.toMatchObject({ body: 'x'.repeat(16) });
    await expect(readApiResponseCache(
      database(rows(17)).db,
      'benchmarks',
      'summary',
      1,
    )).rejects.toThrow(/chunk count exceeds/i);
  });

  it('accepts a cache chunk at its UTF-8 byte cap and rejects the next byte', async () => {
    await expect(readApiResponseCache(
      database({ ...cachedRow, body: 'x'.repeat(1_400_000) }).db,
      'benchmarks',
      'summary',
      1,
    )).resolves.toMatchObject({ body: 'x'.repeat(1_400_000) });
    await expect(readApiResponseCache(
      database({ ...cachedRow, body: 'x'.repeat(1_400_001) }).db,
      'benchmarks',
      'summary',
      1,
    )).rejects.toThrow(/chunk exceeds/i);
  });

  it('accepts cumulative cache bytes at the cap and rejects the next byte', async () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      ...cachedRow,
      chunk_index: index,
      body: 'x'.repeat(index === 11 ? 1_377_216 : 1_400_000),
    }));
    const exact = await readApiResponseCache(database(rows).db, 'benchmarks', 'summary', 1);
    let rejectedOverflow = false;
    try {
      await readApiResponseCache(database(rows.map((row, index) => index === 11
        ? { ...row, body: `${row.body}x` }
        : row)).db, 'benchmarks', 'summary', 1);
    } catch {
      rejectedOverflow = true;
    }

    expect(new TextEncoder().encode(exact?.body ?? '').byteLength).toBe(16_777_216);
    expect(rejectedOverflow).toBe(true);
  });

  it('rejects missing, duplicate, or revision-inconsistent response chunks', async () => {
    await expect(readApiResponseCache(
      database([
        cachedRow,
        { ...cachedRow, chunk_index: 2, body: '{}' },
      ]).db,
      'benchmarks',
      'summary',
      1,
    )).rejects.toThrow('not contiguous');
    await expect(readApiResponseCache(
      database([
        cachedRow,
        { ...cachedRow, chunk_index: 0, body: '{}' },
      ]).db,
      'benchmarks',
      'summary',
      1,
    )).rejects.toThrow('not contiguous');
    await expect(readApiResponseCache(
      database([
        cachedRow,
        { ...cachedRow, revision: 'other-revision', chunk_index: 1, body: '{}' },
      ]).db,
      'benchmarks',
      'summary',
      1,
    )).rejects.toThrow('inconsistent');
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
