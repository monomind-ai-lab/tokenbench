import { API_RESPONSE_CHUNK_MAX_BYTES } from '../../src/cache/api-response-chunks';

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

export const API_RESPONSE_CACHE_MAX_CHUNKS = 16;
export const API_RESPONSE_CACHE_MAX_CHUNK_BYTES = API_RESPONSE_CHUNK_MAX_BYTES;
export const API_RESPONSE_CACHE_MAX_BODY_BYTES = 16 * 1024 * 1024;
const UTF8_ENCODER = new TextEncoder();

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
  LIMIT ?
`;

const NEWEST_COMPLETE_STALE_CACHE_QUERY = `
  WITH complete_revisions AS (
    SELECT entries.revision, revisions.checked_at
    FROM api_response_entries AS entries
    INNER JOIN api_response_revisions AS revisions
      ON revisions.scope = entries.scope
      AND revisions.revision = entries.revision
    WHERE entries.scope = ?
      AND entries.cache_key = ?
      AND entries.variant = 'stale'
    GROUP BY entries.revision, revisions.checked_at
    HAVING COUNT(*) <= ?
      AND MIN(entries.chunk_index) = 0
      AND MAX(entries.chunk_index) = COUNT(*) - 1
      AND COUNT(DISTINCT entries.etag) = 1
      AND MAX(length(CAST(entries.body AS BLOB))) <= ?
      AND SUM(length(CAST(entries.body AS BLOB))) <= ?
  ), newest_complete AS (
    SELECT revisions.revision
    FROM complete_revisions AS revisions
    ORDER BY revisions.checked_at DESC, revisions.revision DESC
    LIMIT 1
  )
  SELECT entries.revision, entries.variant, entries.chunk_index,
    entries.etag, entries.body
  FROM api_response_entries AS entries
  INNER JOIN newest_complete
    ON newest_complete.revision = entries.revision
  WHERE entries.scope = ?1
    AND entries.cache_key = ?2
    AND entries.variant = 'stale'
  ORDER BY entries.chunk_index ASC
  LIMIT ?
`;

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} is invalid`);
  return value;
}

function materializeApiResponseRows(rows: readonly unknown[]): MaterializedApiResponse | null {
  if (rows.length === 0) return null;
  if (rows.length > API_RESPONSE_CACHE_MAX_CHUNKS) {
    throw new Error('cached API response chunk count exceeds the limit');
  }
  const typedRows = rows as ApiResponseCacheRow[];
  const first = typedRows[0];
  const revision = requiredString(first.revision, 'cached API revision');
  const variant = requiredString(first.variant, 'cached API variant');
  if (variant !== 'fresh' && variant !== 'stale') throw new Error('cached API variant is invalid');
  const etag = requiredString(first.etag, 'cached API ETag');
  let bodyBytes = 0;
  const chunks: string[] = [];
  for (const [index, row] of typedRows.entries()) {
    if (row.revision !== revision || row.variant !== variant || row.etag !== etag) {
      throw new Error('cached API response chunks are inconsistent');
    }
    if (row.chunk_index !== index) throw new Error('cached API response chunks are not contiguous');
    const body = requiredString(row.body, 'cached API body chunk');
    const chunkBytes = UTF8_ENCODER.encode(body).byteLength;
    if (chunkBytes > API_RESPONSE_CACHE_MAX_CHUNK_BYTES) {
      throw new Error('cached API response chunk exceeds the byte limit');
    }
    bodyBytes += chunkBytes;
    if (bodyBytes > API_RESPONSE_CACHE_MAX_BODY_BYTES) {
      throw new Error('cached API response body exceeds the byte limit');
    }
    chunks.push(body);
  }
  return {
    revision,
    freshness: variant,
    etag,
    body: chunks.join(''),
  };
}

export async function readApiResponseCache(
  db: ApiResponseCacheDatabase,
  scope: ApiResponseCacheScope,
  cacheKey: string,
  freshnessWindowMs: number,
  now: number = Date.now(),
): Promise<MaterializedApiResponse | null> {
  const cutoff = new Date(now - freshnessWindowMs).toISOString();
  const result = await db.prepare(ACTIVE_CACHE_QUERY)
    .bind(scope, cacheKey, cutoff, API_RESPONSE_CACHE_MAX_CHUNKS + 1)
    .all();
  return materializeApiResponseRows(result.results);
}

/** Reads the newest retained, structurally complete stale response for one exact cache key. */
export async function readNewestCompleteApiResponseCache(
  db: ApiResponseCacheDatabase,
  scope: ApiResponseCacheScope,
  cacheKey: string,
): Promise<MaterializedApiResponse | null> {
  const result = await db.prepare(NEWEST_COMPLETE_STALE_CACHE_QUERY)
    .bind(
      scope,
      cacheKey,
      API_RESPONSE_CACHE_MAX_CHUNKS,
      API_RESPONSE_CACHE_MAX_CHUNK_BYTES,
      API_RESPONSE_CACHE_MAX_BODY_BYTES,
      API_RESPONSE_CACHE_MAX_CHUNKS + 1,
    )
    .all();
  const materialized = materializeApiResponseRows(result.results);
  if (materialized && materialized.freshness !== 'stale') {
    throw new Error('historical cached API response variant is invalid');
  }
  return materialized;
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
