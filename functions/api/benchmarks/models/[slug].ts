import {
  attributionForEvidence,
  benchmarkEnvelope,
  etagForBenchmarkResponse,
  freshnessFor,
  jsonBenchmarkResponse,
  matchesExactEtag,
  modelNotFoundBenchmarkResponse,
  notModifiedBenchmarkResponse,
  readActiveBenchmarkSnapshot,
  unavailableBenchmarkResponse,
  type BenchmarkApiEnv,
  type EvidenceReference,
} from '../../../_shared/benchmark-db';

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export async function onRequestGet({
  request,
  env,
  params,
}: {
  request: Request;
  env: BenchmarkApiEnv;
  params?: { slug?: string };
}): Promise<Response> {
  if (!env.CATALOG_DB) return unavailableBenchmarkResponse();

  try {
    const snapshot = await readActiveBenchmarkSnapshot(env.CATALOG_DB);
    if (!snapshot) return unavailableBenchmarkResponse();
    const freshness = freshnessFor(snapshot.revision, Date.now());
    const slug = params?.slug;
    const model = typeof slug === 'string'
      ? snapshot.models.find((candidate) => candidate.slug === slug)
      : undefined;
    if (!model) return modelNotFoundBenchmarkResponse();

    const metrics = snapshot.metrics
      .filter((metric) => metric.modelKey === model.modelKey)
      .slice()
      .sort((left, right) => compareText(left.metricKey, right.metricKey) || compareText(left.sourceId, right.sourceId));
    const priceChecks = snapshot.priceChecks
      .filter((price) => price.modelKey === model.modelKey)
      .slice()
      .sort((left, right) => compareText(left.sourceId, right.sourceId)
        || compareText(left.providerId, right.providerId)
        || compareText(left.routeId, right.routeId));
    const comparisonPairs = snapshot.comparisonPairs
      .filter((pair) => pair.modelAKey === model.modelKey || pair.modelBKey === model.modelKey)
      .slice()
      .sort((left, right) => compareText(left.pairSlug, right.pairSlug));
    const references: readonly EvidenceReference[] = [
      { sourceId: model.sourceId, sourceArtifactId: model.sourceArtifactId },
      ...metrics.map((metric) => ({ sourceId: metric.sourceId, sourceArtifactId: metric.sourceArtifactId })),
      ...priceChecks.map((price) => ({ sourceId: price.sourceId, sourceArtifactId: price.sourceArtifactId })),
    ];
    const etag = etagForBenchmarkResponse(snapshot.revision, freshness, {
      endpoint: 'model',
      slug: model.slug,
    });
    if (matchesExactEtag(request, etag)) return notModifiedBenchmarkResponse(etag);

    return jsonBenchmarkResponse(
      benchmarkEnvelope(snapshot, freshness, attributionForEvidence(snapshot, references), {
        model,
        metrics,
        priceChecks,
        comparisonPairs,
      }),
      200,
      etag,
    );
  } catch {
    return unavailableBenchmarkResponse();
  }
}
