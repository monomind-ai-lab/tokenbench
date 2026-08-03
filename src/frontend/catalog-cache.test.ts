import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCatalog, type CatalogStorage } from './catalog-cache';
import { FRONTEND_TEST_CATALOG } from './test-fixtures';

function storage(initial?: string): CatalogStorage {
  let value = initial;
  return {
    getItem: vi.fn(() => value ?? null),
    setItem: vi.fn((_key: string, next: string) => { value = next; }),
    removeItem: vi.fn(() => { value = undefined; }),
  };
}

describe('catalog cache and conditional revalidation', () => {
  beforeEach(() => localStorage.clear());

  it('stores a verified catalog response and its ETag', async () => {
    const cache = storage();
    const response = new Response(JSON.stringify(FRONTEND_TEST_CATALOG), {
      status: 200,
      headers: { 'content-type': 'application/json', etag: '"test-revision"' },
    });
    const result = await loadCatalog({ fetchImpl: vi.fn().mockResolvedValue(response), storage: cache, now: () => '2026-08-03T02:00:00.000Z' });

    expect(result.catalog).toEqual(FRONTEND_TEST_CATALOG);
    expect(result.fromCache).toBe(false);
    expect(result.lastSuccessfulRefreshAt).toBe('2026-08-03T02:00:00.000Z');
    expect(cache.setItem).toHaveBeenCalledWith('ai-cost-engine:catalog:v2', expect.stringContaining('test-revision'));
  });

  it('revalidates cached data with If-None-Match and keeps state on 304', async () => {
    const cache = storage(JSON.stringify({ catalog: FRONTEND_TEST_CATALOG, etag: '"test-revision"', fetchedAt: '2026-08-03T01:00:00.000Z' }));
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 304, headers: { etag: '"test-revision"' } }));

    const result = await loadCatalog({ fetchImpl, storage: cache, now: () => '2026-08-03T02:00:00.000Z' });

    expect(fetchImpl).toHaveBeenCalledWith('/api/catalog', expect.objectContaining({
      headers: expect.objectContaining({ 'If-None-Match': '"test-revision"' }),
    }));
    expect(result.catalog.revision).toBe(FRONTEND_TEST_CATALOG.revision);
    expect(result.catalog.freshness.checkedAt).toBe(FRONTEND_TEST_CATALOG.freshness.checkedAt);
    expect(result.fromCache).toBe(true);
    expect(result.lastSuccessfulRefreshAt).toBe('2026-08-03T02:00:00.000Z');
  });

  it('persists refresh timing without pretending the upstream catalog was checked again on a 304', async () => {
    const cache = storage(JSON.stringify({ catalog: FRONTEND_TEST_CATALOG, etag: '"old-revision"', fetchedAt: '2026-08-03T01:00:00.000Z' }));
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 304, headers: { etag: '"refreshed-revision"' } }));

    const result = await loadCatalog({ fetchImpl, storage: cache, now: () => '2026-08-03T02:00:00.000Z' });
    const writes = vi.mocked(cache.setItem).mock.calls;
    const persisted = JSON.parse(writes.at(-1)?.[1] ?? '{}') as { catalog?: { freshness?: { checkedAt?: string } }; etag?: string; fetchedAt?: string };

    expect(result.catalog.freshness.checkedAt).toBe(FRONTEND_TEST_CATALOG.freshness.checkedAt);
    expect(persisted.fetchedAt).toBe('2026-08-03T02:00:00.000Z');
    expect(persisted.etag).toBe('"refreshed-revision"');
    expect(persisted.catalog?.freshness?.checkedAt).toBe(FRONTEND_TEST_CATALOG.freshness.checkedAt);
  });

  it('uses only the checked-in verified bootstrap with an explicit notice when no network/cache exists', async () => {
    const result = await loadCatalog({ fetchImpl: vi.fn().mockRejectedValue(new Error('offline')), storage: storage() });

    expect(result.catalog.freshness.status).toBe('bootstrap');
    expect(result.notice).toMatch(/bootstrap|offline|unavailable/i);
    expect(result.fromCache).toBe(false);
  });
});
