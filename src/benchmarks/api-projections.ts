import {
  BENCHMARK_SOURCE_IDS,
  compareUtf8Binary,
  createComparisonPairSlugResolver,
  isComparisonPairRouteSafe,
  type BenchmarkComparisonPair,
  type BenchmarkMetric,
  type BenchmarkModel,
  type BenchmarkPriceCheck,
  type BenchmarkRevision,
  type BenchmarkSourceId,
  type BenchmarkSourceRecord,
} from './contracts';
import {
  buildLeaderboard,
  LEADERBOARD_DEFINITIONS,
  type LeaderboardDefinition,
  type LeaderboardEntry,
  type LeaderboardResult,
} from './leaderboards';
import { LEADERBOARD_ROUTES, type LeaderboardKey } from '../routing/routes';
import type { WorkloadProfile } from './value';

/** The immutable facts needed to materialize cache-safe Pages responses. */
export interface BenchmarkProjectionSnapshot {
  readonly sources: readonly BenchmarkSourceRecord[];
  readonly models: readonly BenchmarkModel[];
  readonly metrics: readonly BenchmarkMetric[];
  readonly priceChecks: readonly BenchmarkPriceCheck[];
  readonly comparisonPairs: readonly BenchmarkComparisonPair[];
}

export interface BenchmarkEvidenceReference {
  readonly sourceId: BenchmarkSourceId;
  readonly sourceArtifactId: string;
}

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
  readonly sourceType: BenchmarkModel['sourceType'];
  readonly evidenceStatus: BenchmarkModel['evidenceStatus'];
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

// `buildLeaderboard` uses JavaScript text ordering for rendered entry ties;
// keep cached estimated rows byte-for-byte compatible with that API result.
function leaderboardEntryText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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

export function supportsEstimatedLeaderboard(definition: typeof LEADERBOARD_DEFINITIONS[LeaderboardKey]): boolean {
  return ('sourceId' in definition && definition.sourceId === 'benchlm') || definition.kind === 'multimodal';
}

function sourceAvailability(snapshot: BenchmarkProjectionSnapshot): readonly SourceAvailability[] {
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
  snapshot: BenchmarkProjectionSnapshot,
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
        available: snapshot.models.some((model) => buildLeaderboard(
          key,
          [model],
          factIndexes.metricsByModel.get(model.modelKey) ?? [],
          factIndexes.pricesByModel.get(model.modelKey) ?? [],
          'balanced',
        ).entries.length > 0),
        supportsEstimated: supportsEstimatedLeaderboard(definition),
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

function utilityRouteModels(snapshot: BenchmarkProjectionSnapshot): readonly BenchmarkModel[] {
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

function compareDirectory(snapshot: BenchmarkProjectionSnapshot, factIndexes: BenchmarkFactIndexes): CompareDirectory {
  const utilityModels = utilityRouteModels(snapshot);
  const utilityModelKeys = new Set(utilityModels.map((model) => model.modelKey));
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

export function buildBenchmarkSummaryData(snapshot: BenchmarkProjectionSnapshot) {
  const factIndexes = indexBenchmarkFacts(snapshot.metrics, snapshot.priceChecks);
  return {
    sources: sourceAvailability(snapshot),
    routes: routeAvailability(snapshot, factIndexes),
    compareDirectory: compareDirectory(snapshot, factIndexes),
  };
}

function hasExactEstimatedBenchLmMetric(
  model: BenchmarkModel,
  metric: BenchmarkMetric,
  definition: LeaderboardDefinition,
): boolean {
  return model.sourceId === 'benchlm'
    && model.evidenceStatus === 'estimated'
    && model.rankingEligible === false
    && metric.modelKey === model.modelKey
    && metric.sourceId === 'benchlm'
    && metric.rankingEligible === false
    && metric.rank === null
    && definition.metricKeys.includes(metric.metricKey)
    && metric.methodology === 'benchlm_raw_composite'
    && metric.unit === 'score'
    && Number.isFinite(metric.value);
}

function validContextWindow(value: number | null): number | null {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function estimatedLeaderboardEntries(
  snapshot: BenchmarkProjectionSnapshot,
  definition: LeaderboardDefinition,
): readonly LeaderboardEntry[] {
  return snapshot.models
    .filter((model) => model.sourceId === 'benchlm' && model.evidenceStatus === 'estimated')
    .slice()
    .sort((left, right) => leaderboardEntryText(left.slug, right.slug) || leaderboardEntryText(left.modelKey, right.modelKey))
    .flatMap((model) => {
      const metric = snapshot.metrics.find((candidate) => hasExactEstimatedBenchLmMetric(model, candidate, definition));
      if (!metric) return [];
      return [{
        model,
        metric,
        metrics: [metric],
        primaryPrice: null,
        blendedCostPerMillion: null,
        contextWindowTokens: validContextWindow(model.contextWindowTokens),
        sourceRank: null,
        onValueFrontier: false,
      } satisfies LeaderboardEntry];
    });
}

export interface MaterializedLeaderboard {
  readonly leaderboard: LeaderboardResult;
  readonly entries: readonly LeaderboardEntry[];
}

export interface CachedLeaderboardPaginationProjection {
  readonly revision: BenchmarkRevision;
  readonly sources: readonly BenchmarkSourceRecord[];
  readonly leaderboard: LeaderboardResult;
  readonly entries: readonly LeaderboardEntry[];
}

export function effectiveLeaderboardProfile(key: LeaderboardKey, profile: WorkloadProfile): WorkloadProfile {
  const kind = LEADERBOARD_DEFINITIONS[key].kind;
  return kind === 'value' || kind === 'pricing-context' ? profile : 'balanced';
}

export function cachedLeaderboardPaginationProjection(
  snapshot: BenchmarkProjectionSnapshot & { readonly revision: BenchmarkRevision },
  materialized: MaterializedLeaderboard,
): CachedLeaderboardPaginationProjection {
  return {
    revision: snapshot.revision,
    sources: snapshot.sources,
    leaderboard: materialized.leaderboard,
    entries: materialized.entries,
  };
}

export function materializeLeaderboard(
  snapshot: BenchmarkProjectionSnapshot,
  key: LeaderboardKey,
  profile: WorkloadProfile,
  includeEstimated: boolean,
): MaterializedLeaderboard {
  const leaderboard = buildLeaderboard(key, snapshot.models, snapshot.metrics, snapshot.priceChecks, profile);
  const entries = includeEstimated
    ? [...leaderboard.entries, ...estimatedLeaderboardEntries(snapshot, leaderboard.definition)]
    : leaderboard.entries;
  return { leaderboard, entries };
}

function displayedEvidence(entries: readonly LeaderboardEntry[]): readonly BenchmarkEvidenceReference[] {
  return entries.flatMap((entry) => [
    { sourceId: entry.model.sourceId, sourceArtifactId: entry.model.sourceArtifactId },
    ...(entry.metric ? [{ sourceId: entry.metric.sourceId, sourceArtifactId: entry.metric.sourceArtifactId }] : []),
    ...entry.metrics.map((metric) => ({ sourceId: metric.sourceId, sourceArtifactId: metric.sourceArtifactId })),
    ...(entry.primaryPrice ? [{ sourceId: entry.primaryPrice.sourceId, sourceArtifactId: entry.primaryPrice.sourceArtifactId }] : []),
  ]);
}

function routeEvidence(
  snapshot: BenchmarkProjectionSnapshot,
  definition: LeaderboardDefinition,
): readonly BenchmarkEvidenceReference[] {
  const sourceIds: readonly BenchmarkSourceId[] = definition.kind === 'value'
    ? ['benchlm', 'openrouter']
    : definition.kind === 'multimodal'
      ? ['benchlm', 'lmarena']
      : definition.kind === 'pricing-context'
        ? ['openrouter']
        : definition.kind === 'lmarena'
          ? ['lmarena']
          : ['benchlm'];
  const wanted = new Set<BenchmarkSourceId>(sourceIds);
  return snapshot.sources
    .filter((source) => wanted.has(source.sourceId))
    .map((source) => ({ sourceId: source.sourceId, sourceArtifactId: source.artifactId }));
}

export function leaderboardEvidenceReferences(
  snapshot: BenchmarkProjectionSnapshot,
  definition: LeaderboardDefinition,
  entries: readonly LeaderboardEntry[],
): readonly BenchmarkEvidenceReference[] {
  return [...routeEvidence(snapshot, definition), ...displayedEvidence(entries)];
}
