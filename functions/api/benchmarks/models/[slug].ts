import {
  attributionForEvidence,
  benchmarkEnvelope,
  encodeOpaqueValue,
  etagForBenchmarkResponse,
  freshnessFor,
  jsonBenchmarkResponse,
  matchesExactEtag,
  modelNotFoundBenchmarkResponse,
  notModifiedBenchmarkResponse,
  readActiveBenchmarkModelSnapshot,
  unavailableBenchmarkResponse,
  type BenchmarkApiEnv,
  type EvidenceReference,
} from '../../../_shared/benchmark-db';
import {
  readDurableModelProfile,
  readModelSlugAlias,
  type ModelProfileReadResult,
} from '../../../_shared/model-directory-db';

const PROFILE_FRESHNESS_WINDOW_MS = 36 * 60 * 60 * 1000;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalRedirect(slug: string): Response {
  return new Response(null, {
    status: 308,
    headers: {
      'Cache-Control': 'public, max-age=3600',
      Location: `/api/benchmarks/models/${encodeURIComponent(slug)}`,
    },
  });
}

function durableProfileEnvelope(result: ModelProfileReadResult, now: number) {
  const checkedAt = result.profile.revision.checkedAt;
  const stale = result.fallback === 'prior-profile'
    || result.directory.status === 'archived'
    || now - Date.parse(checkedAt) > PROFILE_FRESHNESS_WINDOW_MS;
  return {
    revision: result.selectedRevision,
    publishedAt: result.profile.revision.publishedAt ?? result.profile.revision.generatedAt,
    freshness: stale
      ? {
          status: 'stale' as const,
          checkedAt,
          message: result.fallback === 'prior-profile'
            ? 'Showing the prior valid durable profile because the latest snapshot did not validate.'
            : result.directory.status === 'archived'
              ? 'Showing the latest valid retained profile for an archived model.'
              : 'Published model evidence has not refreshed within 36 hours.',
        }
      : { status: 'fresh' as const, checkedAt },
    attribution: result.profile.sources.map((source) => ({
      sourceId: source.sourceId,
      label: source.attributionText,
      url: source.sourceUrl,
      updatedAt: source.observedAt,
    })),
    data: result,
  };
}

function durableProfileEtag(result: ModelProfileReadResult, freshnessStatus: 'fresh' | 'stale'): string {
  return `"model-profile-${encodeOpaqueValue([
    result.directory.modelKey,
    result.directory.updatedAt,
    result.selectedRevision,
    result.profile.revision.checkedAt,
    result.fallback,
    freshnessStatus,
  ])}"`;
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

  const slug = params?.slug;
  if (typeof slug !== 'string' || slug.length === 0) return modelNotFoundBenchmarkResponse();

  let durableReadSucceeded = false;
  try {
    const durable = await readDurableModelProfile(env.CATALOG_DB, slug);
    durableReadSucceeded = true;
    if (durable?.aliasFrom) return canonicalRedirect(durable.directory.canonicalSlug);
    if (durable) {
      const envelope = durableProfileEnvelope(durable, Date.now());
      const etag = durableProfileEtag(durable, envelope.freshness.status);
      if (matchesExactEtag(request, etag)) return notModifiedBenchmarkResponse(etag);
      return jsonBenchmarkResponse(envelope, 200, etag);
    }
    const canonicalAlias = await readModelSlugAlias(env.CATALOG_DB, slug);
    if (canonicalAlias !== null) return canonicalRedirect(canonicalAlias);
  } catch {
    // The durable migration may not yet be present during a progressive rollout.
    // Preserve the targeted active-revision endpoint as the bounded compatibility path.
  }

  try {
    const snapshot = await readActiveBenchmarkModelSnapshot(env.CATALOG_DB, slug);
    if (!snapshot) return durableReadSucceeded ? modelNotFoundBenchmarkResponse() : unavailableBenchmarkResponse();
    const freshness = freshnessFor(snapshot.revision, Date.now());
    const model = snapshot.models.find((candidate) => candidate.slug === slug);
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
