import {
  BENCHMARK_SOURCE_IDS,
  compareUtf8Binary,
  createComparisonPairSlugResolver,
  isComparisonPairRouteSafe,
  type BenchmarkMetric,
  type BenchmarkModel,
  type BenchmarkPriceCheck,
  type BenchmarkSourceId,
} from '../../src/benchmarks/contracts';
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
  /** True only when this model can safely form a utility route with every selectable peer. */
  readonly utilitySelectable: boolean;
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

interface BenchmarkFactIndexes {
  readonly metricsByModel: ReadonlyMap<string, readonly BenchmarkMetric[]>;
  readonly pricesByModel: ReadonlyMap<string, readonly BenchmarkPriceCheck[]>;
  readonly metricCategoriesByModel: ReadonlyMap<string, readonly string[]>;
}

function compareText(left: string, right: string): number {
  return compareUtf8Binary(left, right);
}

function indexBenchmarkFacts(
  metrics: readonly BenchmarkMetric[],
  priceChecks: readonly BenchmarkPriceCheck[],
): BenchmarkFactIndexes {
  const metricsByModel = new Map<string, BenchmarkMetric[]>();
  const pricesByModel = new Map<string, BenchmarkPriceCheck[]>();
  const categorySetsByModel = new Map<string, Set<string>>();

  for (const metric of metrics) {
    const modelMetrics = metricsByModel.get(metric.modelKey);
    if (modelMetrics) modelMetrics.push(metric);
    else metricsByModel.set(metric.modelKey, [metric]);

    const categories = categorySetsByModel.get(metric.modelKey);
    if (categories) categories.add(metric.category);
    else categorySetsByModel.set(metric.modelKey, new Set([metric.category]));
  }
  for (const price of priceChecks) {
    const modelPrices = pricesByModel.get(price.modelKey);
    if (modelPrices) modelPrices.push(price);
    else pricesByModel.set(price.modelKey, [price]);
  }

  const metricCategoriesByModel = new Map<string, readonly string[]>();
  for (const [modelKey, categories] of categorySetsByModel) {
    metricCategoriesByModel.set(modelKey, [...categories].sort(compareText));
  }
  return { metricsByModel, pricesByModel, metricCategoriesByModel };
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

function routeAvailability(
  snapshot: ActiveBenchmarkSnapshot,
  factIndexes: BenchmarkFactIndexes,
): readonly RouteAvailability[] {
  return (Object.keys(LEADERBOARD_ROUTES) as LeaderboardKey[])
    .slice()
    .sort(compareText)
    .map((key) => {
      const definition = LEADERBOARD_DEFINITIONS[key];
      return {
        key,
        kind: definition.kind,
        metricKeys: definition.metricKeys,
        // Availability is existential. Task 10 derives each row from one
        // model's facts and frontier marking never removes a value row, so a
        // one-model build is equivalent while keeping every scan model-local.
        available: snapshot.models.some((model) => buildLeaderboard(
          key,
          [model],
          factIndexes.metricsByModel.get(model.modelKey) ?? [],
          factIndexes.pricesByModel.get(model.modelKey) ?? [],
          'balanced',
        ).entries.length > 0),
        supportsEstimated: hasBenchLmEvidenceLens(definition),
      };
    });
}

function resolvedUtilityPairIsExact(
  resolvePairSlug: ReturnType<typeof createComparisonPairSlugResolver>,
  left: BenchmarkModel,
  right: BenchmarkModel,
): boolean {
  const resolved = resolvePairSlug(`${left.slug}-vs-${right.slug}`);
  return resolved !== null
    && ((resolved.modelA.modelKey === left.modelKey && resolved.modelB.modelKey === right.modelKey)
      || (resolved.modelA.modelKey === right.modelKey && resolved.modelB.modelKey === left.modelKey));
}

/**
 * The hub promises that two selectable models produce a useful utility route.
 * Remove a model if either ordering with any other active model is unsafe or
 * ambiguous in the same resolver used by the Pages function.
 */
function utilityRouteModels(snapshot: ActiveBenchmarkSnapshot): readonly BenchmarkModel[] {
  const resolvePairSlug = createComparisonPairSlugResolver(snapshot.models);
  const simpleModels = snapshot.models.filter((model) => isComparisonPairRouteSafe(model.slug)
    && !model.slug.includes('-vs-'));
  const complexModels = snapshot.models.filter((candidate) => isComparisonPairRouteSafe(candidate.slug)
    && candidate.slug.includes('-vs-')
    && snapshot.models.every((other) => other.modelKey === candidate.modelKey
      || (isComparisonPairRouteSafe(other.slug)
        && resolvedUtilityPairIsExact(resolvePairSlug, candidate, other)
        && resolvedUtilityPairIsExact(resolvePairSlug, other, candidate))));
  return [...simpleModels, ...complexModels];
}

function compareDirectory(snapshot: ActiveBenchmarkSnapshot, factIndexes: BenchmarkFactIndexes): CompareDirectory {
  const utilityModels = utilityRouteModels(snapshot);
  const utilityModelKeys = new Set(utilityModels.map((model) => model.modelKey));
  // A complex slug can be ambiguous as a free-form utility choice while still
  // being the endpoint of one exact, server-validated published pair. Keep the
  // latter as metadata so its reviewed link has labels, but do not expose it in
  // the all-to-all selector.
  const indexablePairModelKeys = new Set(snapshot.comparisonPairs
    .filter((pair) => pair.indexable === true)
    .flatMap((pair) => [pair.modelAKey, pair.modelBKey]));
  const directoryModels = snapshot.models.filter((model) => utilityModelKeys.has(model.modelKey)
    || indexablePairModelKeys.has(model.modelKey));
  const modelsByKey = new Map(directoryModels.map((model) => [model.modelKey, model]));
  const models = directoryModels
    .slice()
    .sort((left, right) => compareText(left.slug, right.slug) || compareText(left.modelKey, right.modelKey))
    .map((model) => ({
      slug: model.slug,
      name: model.name,
      creator: model.creator,
      sourceType: model.sourceType,
      evidenceStatus: model.evidenceStatus,
      utilitySelectable: utilityModelKeys.has(model.modelKey),
      metricCategories: factIndexes.metricCategoriesByModel.get(model.modelKey) ?? [],
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
      if (!modelA || !modelB) return null;
      return {
        pairSlug: pair.pairSlug,
        modelASlug: modelA.slug,
        modelBSlug: modelB.slug,
        featuredRank: pair.featuredRank,
        sharedMetricCount: pair.sharedMetricCount,
      };
    })
    .filter((pair): pair is CompareDirectoryPair => pair !== null);
  return { models, indexablePairs };
}

export function buildBenchmarkSummaryData(snapshot: ActiveBenchmarkSnapshot) {
  const factIndexes = indexBenchmarkFacts(snapshot.metrics, snapshot.priceChecks);
  return {
    sources: sourceAvailability(snapshot),
    routes: routeAvailability(snapshot, factIndexes),
    compareDirectory: compareDirectory(snapshot, factIndexes),
  };
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
      benchmarkEnvelope(snapshot, freshness, attributionForAllSources(snapshot), buildBenchmarkSummaryData(snapshot)),
      200,
      etag,
    );
  } catch {
    return unavailableBenchmarkResponse();
  }
}
