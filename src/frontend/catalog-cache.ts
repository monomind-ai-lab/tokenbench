import { BOOTSTRAP_CATALOG } from '../catalog/bootstrap';
import type { CatalogFreshness, CatalogResponse } from '../catalog/contracts';
import { validateCatalogResponse } from '../catalog/validation';

export const CATALOG_CACHE_KEY = 'tokenbench:catalog:v2';

export interface CatalogStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface CachedCatalog {
  catalog: CatalogResponse;
  etag?: string;
  fetchedAt: string;
}

export interface CatalogLoadResult {
  catalog: CatalogResponse;
  fromCache: boolean;
  status: CatalogFreshness['status'];
  etag?: string;
  lastSuccessfulRefreshAt: string | null;
  notice?: string;
}

interface CatalogLoadOptions {
  fetchImpl?: typeof fetch;
  storage?: CatalogStorage;
  cacheKey?: string;
  url?: string;
  now?: () => string;
}

function getDefaultStorage(): CatalogStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function readCache(storage: CatalogStorage | undefined, cacheKey: string): CachedCatalog | undefined {
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(cacheKey);
    if (!raw) return undefined;
    const value = JSON.parse(raw) as CachedCatalog;
    if (!value || !value.catalog || typeof value.fetchedAt !== 'string') return undefined;
    return { ...value, catalog: validateCatalogResponse(value.catalog) };
  } catch {
    try { storage.removeItem(cacheKey); } catch { /* Storage can be unavailable in privacy mode. */ }
    return undefined;
  }
}

function writeCache(storage: CatalogStorage | undefined, cacheKey: string, entry: CachedCatalog): void {
  if (!storage) return;
  try { storage.setItem(cacheKey, JSON.stringify(entry)); } catch { /* Cache failure must not hide a valid response. */ }
}

function withFreshness(catalog: CatalogResponse, status: CatalogFreshness['status'], checkedAt: string, message?: string): CatalogResponse {
  return { ...catalog, freshness: { ...catalog.freshness, status, checkedAt, ...(message ? { message } : {}) } };
}

export async function loadCatalog(options: CatalogLoadOptions = {}): Promise<CatalogLoadResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const storage = options.storage ?? getDefaultStorage();
  const cacheKey = options.cacheKey ?? CATALOG_CACHE_KEY;
  const url = options.url ?? '/api/catalog';
  const now = options.now ?? (() => new Date().toISOString());
  const cached = readCache(storage, cacheKey);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (cached?.etag) headers['If-None-Match'] = cached.etag;

  try {
    const response = await fetchImpl(url, { headers, cache: 'no-cache' });
    const refreshedAt = now();
    if (response.status === 304 && cached) {
      const etag = response.headers.get('etag') ?? cached.etag;
      const catalog = cached.catalog;
      writeCache(storage, cacheKey, { catalog, etag, fetchedAt: refreshedAt });
      return {
        catalog,
        fromCache: true,
        status: catalog.freshness.status,
        etag,
        lastSuccessfulRefreshAt: refreshedAt,
        notice: catalog.freshness.status === 'stale' ? 'The catalog is stale; the last verified revision is shown.' : undefined,
      };
    }
    if (!response.ok) throw new Error(`Catalog request returned ${response.status}`);
    const catalog = validateCatalogResponse(await response.json());
    const etag = response.headers.get('etag') ?? undefined;
    writeCache(storage, cacheKey, { catalog, etag, fetchedAt: refreshedAt });
    const notice = catalog.freshness.status === 'bootstrap'
      ? 'The API returned the checked-in verified bootstrap catalog; live ingestion has not published a revision yet.'
      : catalog.freshness.status === 'stale'
        ? 'The published catalog is stale; verify pricing before making a decision.'
        : undefined;
    return { catalog, fromCache: false, status: catalog.freshness.status, etag, lastSuccessfulRefreshAt: refreshedAt, notice };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Catalog request failed';
    if (cached) {
      const staleCatalog = withFreshness(cached.catalog, 'stale', cached.catalog.freshness.checkedAt, `Refresh failed: ${message}`);
      return {
        catalog: staleCatalog,
        fromCache: true,
        status: 'stale',
        etag: cached.etag,
        lastSuccessfulRefreshAt: cached.fetchedAt,
        notice: `Live catalog refresh failed (${message}). Showing the cached verified revision; retry when online.`,
      };
    }
    const bootstrap = withFreshness(BOOTSTRAP_CATALOG, 'bootstrap', BOOTSTRAP_CATALOG.freshness.checkedAt, `Network unavailable: ${message}`);
    return {
      catalog: bootstrap,
      fromCache: false,
      status: 'bootstrap',
      lastSuccessfulRefreshAt: null,
      notice: `Catalog unavailable (${message}). Showing only the checked-in verified bootstrap; retry to load the latest revision.`,
    };
  }
}
