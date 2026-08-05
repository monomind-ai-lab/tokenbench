import { BENCHMARK_SOURCE_IDS, type BenchmarkSourceId } from '../../src/benchmarks/contracts';
import { buildLeaderboard, LEADERBOARD_DEFINITIONS } from '../../src/benchmarks/leaderboards';
import { LEADERBOARD_ROUTES, type LeaderboardKey } from '../../src/routing/routes';
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
  type ActiveBenchmarkSnapshot,
  type BenchmarkApiEnv,
} from '../_shared/benchmark-db';

interface SourceAvailability {
  readonly sourceId: BenchmarkSourceId;
  readonly available: boolean;
  readonly updatedAt: string | null;
  readonly artifacts: readonly {
    readonly artifactId: string;
    readonly url: string;
    readonly updatedAt: string;
  }[];
}

interface RouteAvailability {
  readonly key: LeaderboardKey;
  readonly kind: typeof LEADERBOARD_DEFINITIONS[LeaderboardKey]['kind'];
  readonly metricKeys: readonly string[];
  readonly available: boolean;
  readonly supportsEstimated: boolean;
}

interface CompareDirectoryModel {
  readonly slug: string;
  readonly name: string;
  readonly creator: string;
  readonly sourceType: ActiveBenchmarkSnapshot['models'][number]['sourceType'];
  readonly evidenceStatus: ActiveBenchmarkSnapshot['models'][number]['evidenceStatus'];
  readonly metricCategories: readonly string[];
}

interface CompareDirectoryPair {
  readonly pairSlug: string;
  readonly modelASlug: string;
  readonly modelBSlug: string;
  readonly featuredRank: number | null;
  readonly sharedMetricCount: number;
}

interface CompareDirectory {
  readonly models: readonly CompareDirectoryModel[];
  readonly indexablePairs: readonly CompareDirectoryPair[];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function hasBenchLmEvidenceLens(definition: typeof LEADERBOARD_DEFINITIONS[LeaderboardKey]): boolean {
  return ('sourceId' in definition && definition.sourceId === 'benchlm') || definition.kind === 'multimodal';
}

function sourceAvailability(snapshot: ActiveBenchmarkSnapshot): readonly SourceAvailability[] {
  return BENCHMARK_SOURCE_IDS.map((sourceId) => {
    const records = snapshot.sources.filter((source) => source.sourceId === sourceId);
    return {
      sourceId,
      available: records.length > 0,
      updatedAt: records.length === 0 ? null : records.map((record) => record.observedAt).sort(compareText).at(-1)!,
      artifacts: records.map((record) => ({
        artifactId: record.artifactId,
        url: record.sourceUrl,
        updatedAt: record.observedAt,
      })),
    };
  });
}

function routeAvailability(snapshot: ActiveBenchmarkSnapshot): readonly RouteAvailability[] {
  return (Object.keys(LEADERBOARD_ROUTES) as LeaderboardKey[])
    .slice()
    .sort(compareText)
    .map((key) => {
      const definition = LEADERBOARD_DEFINITIONS[key];
      const result = buildLeaderboard(key, snapshot.models, snapshot.metrics, snapshot.priceChecks, 'balanced');
      return {
        key,
        kind: definition.kind,
        metricKeys: definition.metricKeys,
        available: result.entries.length > 0,
        supportsEstimated: hasBenchLmEvidenceLens(definition),
      };
    });
}

function compareDirectory(snapshot: ActiveBenchmarkSnapshot): CompareDirectory {
  const modelsByKey = new Map(snapshot.models.map((model) => [model.modelKey, model]));
  const metricCategories = new Map(snapshot.models.map((model) => [
    model.modelKey,
    [...new Set(snapshot.metrics
      .filter((metric) => metric.modelKey === model.modelKey)
      .map((metric) => metric.category))].sort(compareText),
  ]));
  const models = snapshot.models
    .slice()
    .sort((left, right) => compareText(left.slug, right.slug) || compareText(left.modelKey, right.modelKey))
    .map((model) => ({
      slug: model.slug,
      name: model.name,
      creator: model.creator,
      sourceType: model.sourceType,
      evidenceStatus: model.evidenceStatus,
      metricCategories: metricCategories.get(model.modelKey) ?? [],
    }));
  const indexablePairs = snapshot.comparisonPairs
    .filter((pair) => pair.indexable === true)
    .slice()
    .sort((left, right) => {
      if (left.featuredRank === null && right.featuredRank !== null) return 1;
      if (left.featuredRank !== null && right.featuredRank === null) return -1;
      if (left.featuredRank !== null && right.featuredRank !== null && left.featuredRank !== right.featuredRank) {
        return left.featuredRank - right.featuredRank;
      }
      return compareText(left.pairSlug, right.pairSlug);
    })
    .map((pair) => {
      const modelA = modelsByKey.get(pair.modelAKey);
      const modelB = modelsByKey.get(pair.modelBKey);
      if (!modelA || !modelB) throw new Error('Indexable comparison pair refers to an unavailable model');
      return {
        pairSlug: pair.pairSlug,
        modelASlug: modelA.slug,
        modelBSlug: modelB.slug,
        featuredRank: pair.featuredRank,
        sharedMetricCount: pair.sharedMetricCount,
      };
    });
  return { models, indexablePairs };
}

export async function onRequestGet({ request, env }: { request: Request; env: BenchmarkApiEnv }): Promise<Response> {
  if (!env.CATALOG_DB) return unavailableBenchmarkResponse();

  try {
    const snapshot = await readActiveBenchmarkSnapshot(env.CATALOG_DB);
    if (!snapshot) return unavailableBenchmarkResponse();

    const freshness = freshnessFor(snapshot.revision, Date.now());
    const etag = etagForBenchmarkResponse(snapshot.revision, freshness, { endpoint: 'benchmarks' });
    if (matchesExactEtag(request, etag)) return notModifiedBenchmarkResponse(etag);

    return jsonBenchmarkResponse(
      benchmarkEnvelope(snapshot, freshness, attributionForAllSources(snapshot), {
        sources: sourceAvailability(snapshot),
        routes: routeAvailability(snapshot),
        compareDirectory: compareDirectory(snapshot),
      }),
      200,
      etag,
    );
  } catch {
    return unavailableBenchmarkResponse();
  }
}
