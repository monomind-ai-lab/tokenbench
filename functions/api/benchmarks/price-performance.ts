import {
  benchmarkCorrelationId,
  serveBenchmarkWithFallback,
} from '../../_shared/benchmark-response-fallback';
import {
  attributionForAllSources,
  benchmarkEnvelope,
  etagForBenchmarkResponse,
  freshnessFor,
  invalidBenchmarkRequestResponse,
  jsonBenchmarkResponse,
  matchesExactEtag,
  notModifiedBenchmarkResponse,
  readActiveBenchmarkSnapshot,
  unavailableBenchmarkResponse,
  type BenchmarkApiEnv,
} from '../../_shared/benchmark-db';
import {
  PRICE_PERFORMANCE_ARCHIVED_LIMIT,
  PRICE_PERFORMANCE_CACHE_PARAMETERS,
  logInvalidProjectionRows,
  pricePerformanceEnvelopeData,
  pricePerformanceProjectionFromSnapshot,
  readArchivedPricePerformancePoints,
  type InvalidPricePerformancePointLog,
} from '../../_shared/price-performance-db';
import { benchmarkPricePerformanceProjectionCacheKey } from '../../../src/benchmarks/api-response-cache-keys';
import { compareUtf8Binary } from '../../../src/benchmarks/contracts';

const ARCHIVED_REQUEST_CACHE_KEY = 'price-performance-request:archived';
const ARCHIVED_REQUEST_PARAMETERS = {
  endpoint: 'price-performance',
  includeArchived: true,
} as const;

/**
 * GET /api/benchmarks/price-performance
 *
 * The default current view is served from the materialized complete projection.
 * `includeArchived=1` extends the current projection with a bounded page of
 * archived durable profiles; an archived read failure falls back to the current
 * projection rather than 503, while active cache / revision / stale recovery is
 * handled by the shared benchmark fallback controller.
 */
export async function onRequestGet({
  request,
  env,
}: {
  request: Request;
  env: BenchmarkApiEnv;
}): Promise<Response> {
  let includeArchived = false;
  try {
    const url = new URL(request.url);
    if ([...url.searchParams.keys()].some((name) => name !== 'includeArchived')) {
      throw new Error('unknown query key');
    }
    const value = url.searchParams.get('includeArchived');
    if (value !== null && value !== '1') throw new Error('invalid includeArchived flag');
    includeArchived = value === '1';
  } catch {
    return invalidBenchmarkRequestResponse();
  }

  const db = env.CATALOG_DB;
  if (!db) return unavailableBenchmarkResponse();

  const cacheKey = includeArchived
    ? ARCHIVED_REQUEST_CACHE_KEY
    : benchmarkPricePerformanceProjectionCacheKey();

  return serveBenchmarkWithFallback({
    request,
    endpoint: 'price-performance',
    queryId: includeArchived ? 'price-performance:archived' : 'price-performance:current',
    cacheKey,
    correlationId: benchmarkCorrelationId(request),
    db,
    // An archived read extends the current projection; if the active revision
    // cannot be reconstructed it must fall back to the materialized current
    // complete stale projection, never 503.
    historicalCacheKeys: includeArchived
      ? [benchmarkPricePerformanceProjectionCacheKey()]
      : undefined,
    reconstruct: async (now) => {
      const snapshot = await readActiveBenchmarkSnapshot(db);
      if (!snapshot) return null;
      const current = pricePerformanceProjectionFromSnapshot(snapshot);
      logInvalidProjectionRows(snapshot, current, (entry) => {
        console.error(JSON.stringify({ event: 'benchmark_invalid_projection_row', ...entry }));
      });
      let points = current.points;
      let archivedMeta: { hasMore: boolean; limit: number } | undefined;
      if (includeArchived) {
        try {
          const archived = await readArchivedPricePerformancePoints(
            db,
            PRICE_PERFORMANCE_ARCHIVED_LIMIT,
            0,
          );
          points = [...current.points, ...archived.points]
            .slice()
            .sort((left, right) => compareUtf8Binary(left.modelKey, right.modelKey));
          archivedMeta = { hasMore: archived.hasMore, limit: PRICE_PERFORMANCE_ARCHIVED_LIMIT };
        } catch {
          // An archived profile read must never take down the current projection.
          points = current.points;
        }
      }
      const data = pricePerformanceEnvelopeData(points, archivedMeta);
      const freshness = freshnessFor(snapshot.revision, now);
      const attribution = attributionForAllSources(snapshot);
      const parameters = includeArchived
        ? ARCHIVED_REQUEST_PARAMETERS
        : PRICE_PERFORMANCE_CACHE_PARAMETERS;
      const etag = etagForBenchmarkResponse(snapshot.revision, freshness, parameters);
      if (matchesExactEtag(request, etag)) return notModifiedBenchmarkResponse(etag);
      return jsonBenchmarkResponse(
        benchmarkEnvelope(snapshot, freshness, attribution, data),
        200,
        etag,
      );
    },
    unavailable: unavailableBenchmarkResponse,
  });
}
