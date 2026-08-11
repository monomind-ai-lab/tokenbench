import { buildBenchmarkSummaryData } from '../../src/benchmarks/api-projections';
import {
  benchmarkCorrelationId,
  serveBenchmarkWithFallback,
} from '../_shared/benchmark-response-fallback';
import {
  attributionForAllSources,
  benchmarkEnvelope,
  etagForBenchmarkResponse,
  freshnessFor,
  jsonBenchmarkResponse,
  matchesExactEtag,
  notModifiedBenchmarkResponse,
  readActiveBenchmarkSnapshot,
  unavailableBenchmarkResponse,
  type BenchmarkApiEnv,
} from '../_shared/benchmark-db';

/** Pages fallback and Worker cache materialization share this exact shape. */
export { buildBenchmarkSummaryData };

export async function onRequestGet({ request, env }: { request: Request; env: BenchmarkApiEnv }): Promise<Response> {
  const db = env.CATALOG_DB;
  if (!db) return unavailableBenchmarkResponse();

  return serveBenchmarkWithFallback({
    request,
    endpoint: 'summary',
    queryId: 'summary',
    cacheKey: 'summary',
    correlationId: benchmarkCorrelationId(request),
    db,
    reconstruct: async (now) => {
      const snapshot = await readActiveBenchmarkSnapshot(db);
      if (!snapshot) return null;

      const freshness = freshnessFor(snapshot.revision, now);
      const etag = etagForBenchmarkResponse(snapshot.revision, freshness, { endpoint: 'benchmarks' });
      if (matchesExactEtag(request, etag)) return notModifiedBenchmarkResponse(etag);

      return jsonBenchmarkResponse(
        benchmarkEnvelope(snapshot, freshness, attributionForAllSources(snapshot), buildBenchmarkSummaryData(snapshot)),
        200,
        etag,
      );
    },
    unavailable: unavailableBenchmarkResponse,
  });
}
