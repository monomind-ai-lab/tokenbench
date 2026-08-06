import { buildBenchmarkSummaryData } from '../../src/benchmarks/api-projections';
import { cachedApiResponse, readApiResponseCache } from '../_shared/api-response-cache';
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
  if (!env.CATALOG_DB) return unavailableBenchmarkResponse();

  try {
    const now = Date.now();
    const cached = await readApiResponseCache(
      env.CATALOG_DB,
      'benchmarks',
      'summary',
      36 * 60 * 60 * 1000,
      now,
    );
    if (cached) return cachedApiResponse(request, cached);

    const snapshot = await readActiveBenchmarkSnapshot(env.CATALOG_DB);
    if (!snapshot) return unavailableBenchmarkResponse();

    const freshness = freshnessFor(snapshot.revision, now);
    const etag = etagForBenchmarkResponse(snapshot.revision, freshness, { endpoint: 'benchmarks' });
    if (matchesExactEtag(request, etag)) return notModifiedBenchmarkResponse(etag);

    return jsonBenchmarkResponse(
      benchmarkEnvelope(snapshot, freshness, attributionForAllSources(snapshot), buildBenchmarkSummaryData(snapshot)),
      200,
      etag,
    );
  } catch {
    return unavailableBenchmarkResponse();
  }
}
