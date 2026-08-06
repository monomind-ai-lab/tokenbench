export type ApiResponseCacheScope = 'catalog' | 'benchmarks';

export interface ApiResponseCacheStatement {
  bind(...values: unknown[]): { all(): Promise<{ results: unknown[] }> };
}

export interface ApiResponseCacheDatabase {
  prepare(query: string): ApiResponseCacheStatement;
}

export interface MaterializedApiResponse {
  readonly revision: string;
  readonly freshness: 'fresh' | 'stale';
  readonly etag: string;
  /** Exact JSON bytes produced by the publisher. Pages must not parse these. */
  readonly body: string;
}

interface ApiResponseCacheRow {
  readonly revision: unknown;
  readonly variant: unknown;
  readonly chunk_index: unknown;
  readonly etag: unknown;
  readonly body: unknown;
}

const ACTIVE_CACHE_QUERY = `
  SELECT entries.revision, entries.variant, entries.chunk_index,
    entries.etag, entries.body
  FROM api_response_publication_state AS publication
  INNER JOIN api_response_revisions AS revisions
    ON revisions.scope = publication.scope
    AND revisions.revision = publication.active_revision
  INNER JOIN api_response_entries AS entries
    ON entries.scope = publication.scope
    AND entries.revision = publication.active_revision
  WHERE publication.scope = ?
    AND entries.cache_key = ?
    AND entries.variant = CASE
      WHEN revisions.checked_at >= ? THEN 'fresh'
      ELSE 'stale'
    END
  ORDER BY entries.chunk_index ASC
`;

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} is invalid`);
  return value;
}

export async function readApiResponseCache(
  db: ApiResponseCacheDatabase,
  scope: ApiResponseCacheScope,
  cacheKey: string,
  freshnessWindowMs: number,
  now: number = Date.now(),
): Promise<MaterializedApiResponse | null> {
  const cutoff = new Date(now - freshnessWindowMs).toISOString();
  const result = await db.prepare(ACTIVE_CACHE_QUERY).bind(scope, cacheKey, cutoff).all();
  if (result.results.length === 0) return null;
  const rows = result.results as ApiResponseCacheRow[];
  const first = rows[0];
  const revision = requiredString(first.revision, 'cached API revision');
  const variant = requiredString(first.variant, 'cached API variant');
  if (variant !== 'fresh' && variant !== 'stale') throw new Error('cached API variant is invalid');
  const etag = requiredString(first.etag, 'cached API ETag');
  const chunks = rows.map((row, index) => {
    if (row.revision !== revision || row.variant !== variant || row.etag !== etag) {
      throw new Error('cached API response chunks are inconsistent');
    }
    if (row.chunk_index !== index) throw new Error('cached API response chunks are not contiguous');
    return requiredString(row.body, 'cached API body chunk');
  });
  return {
    revision,
    freshness: variant,
    etag,
    body: chunks.join(''),
  };
}

function responseHeaders(cached: MaterializedApiResponse): Headers {
  return new Headers({
    'Cache-Control': 'public, max-age=0, must-revalidate',
    ETag: cached.etag,
    Vary: 'Accept-Encoding',
  });
}

export function cachedApiResponse(request: Request, cached: MaterializedApiResponse): Response {
  const headers = responseHeaders(cached);
  if (request.headers.get('If-None-Match') === cached.etag) {
    return new Response(null, { status: 304, headers });
  }
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(cached.body, { status: 200, headers });
}
