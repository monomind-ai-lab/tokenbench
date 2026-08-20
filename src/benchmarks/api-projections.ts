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
import { materializeDecisionPicks } from './decision-picks';
import { LEADERBOARD_ROUTES, type LeaderboardKey } from '../routing/leaderboard-routes';
import { primaryHostedPriceForModel, type WorkloadProfile } from './value';
import { COMPARISON_ALLOWLIST } from './comparison-allowlist';

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
    readonly upstreamRevision: string | null;
    readonly schemaVersion: string | null;
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
  /** Stable copies let additional materializations avoid rereading request inputs. */
  readonly metrics: readonly BenchmarkMetric[];
  readonly priceChecks: readonly BenchmarkPriceCheck[];
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
  const metricValues: BenchmarkMetric[] = [];
  const priceValues: BenchmarkPriceCheck[] = [];
  const metricsByModel = new Map<string, BenchmarkMetric[]>();
  const pricesByModel = new Map<string, BenchmarkPriceCheck[]>();
  const categorySetsByModel = new Map<string, Set<string>>();

  for (const metric of metrics) {
    metricValues.push(metric);
    const modelMetrics = metricsByModel.get(metric.modelKey);
    if (modelMetrics) modelMetrics.push(metric);
    else metricsByModel.set(metric.modelKey, [metric]);

    const categories = categorySetsByModel.get(metric.modelKey);
    if (categories) categories.add(metric.category);
    else categorySetsByModel.set(metric.modelKey, new Set([metric.category]));
  }
  for (const price of priceChecks) {
    priceValues.push(price);
    const modelPrices = pricesByModel.get(price.modelKey);
    if (modelPrices) modelPrices.push(price);
    else pricesByModel.set(price.modelKey, [price]);
  }

  const metricCategoriesByModel = new Map<string, readonly string[]>();
  for (const [modelKey, categories] of categorySetsByModel) {
    metricCategoriesByModel.set(modelKey, [...categories].sort(compareText));
  }
  return {
    metrics: metricValues,
    priceChecks: priceValues,
    metricsByModel,
    pricesByModel,
    metricCategoriesByModel,
  };
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
        upstreamRevision: record.upstreamRevision,
        schemaVersion: record.schemaVersion,
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

/** One home "representative comparison" card, regenerated from the active revision. */
export interface RepresentativeComparisonMetric {
  readonly metricKey: string;
  readonly category: string;
  readonly unit: BenchmarkMetric['unit'];
  readonly modelAValue: number;
  readonly modelBValue: number;
  /** Absolute published-value gap; ties are reported as 0 and never broken. */
  readonly gap: number;
  readonly leaderSlug: string | null;
}

export interface RepresentativeComparison {
  readonly pairSlug: string;
  readonly modelASlug: string;
  readonly modelBSlug: string;
  readonly modelAName: string;
  readonly modelBName: string;
  readonly sharedMetricCount: number;
  /** Ordered strongest-first; the first entry is the capability lead finding. */
  readonly sharedMetrics: readonly RepresentativeComparisonMetric[];
  readonly modelAPriceUsdPerMillion: number | null;
  readonly modelBPriceUsdPerMillion: number | null;
  readonly modelAContextWindowTokens: number | null;
  readonly modelBContextWindowTokens: number | null;
}

/** The specification's editorial gate for a representative home comparison. */
const MINIMUM_SHARED_COMPARISON_METRICS = 4;

function comparableSharedMetrics(
  modelA: BenchmarkModel,
  modelB: BenchmarkModel,
  factIndexes: BenchmarkFactIndexes,
): readonly RepresentativeComparisonMetric[] {
  const byKeyForB = new Map((factIndexes.metricsByModel.get(modelB.modelKey) ?? []).map((metric) => [metric.metricKey, metric]));
  return (factIndexes.metricsByModel.get(modelA.modelKey) ?? [])
    .flatMap((left) => {
      const right = byKeyForB.get(left.metricKey);
      // Only identical lenses compare: same key, unit, and methodology.
      if (!right || right.unit !== left.unit || right.methodology !== left.methodology) return [];
      if (!Number.isFinite(left.value) || !Number.isFinite(right.value)) return [];
      if (!left.rankingEligible || !right.rankingEligible) return [];
      const gap = Math.abs(left.value - right.value);
      return [{
        metricKey: left.metricKey,
        category: left.category,
        unit: left.unit,
        modelAValue: left.value,
        modelBValue: right.value,
        gap,
        leaderSlug: gap === 0 ? null : (left.value > right.value ? modelA.slug : modelB.slug),
      }];
    })
    .sort((left, right) => right.gap - left.gap || compareText(left.metricKey, right.metricKey));
}

function exactPrimaryContextWindow(
  model: BenchmarkModel,
  prices: readonly BenchmarkPriceCheck[],
): number | null {
  const values = new Set<number>();
  const modelContext = validContextWindow(model.contextWindowTokens);
  if (modelContext !== null) values.add(modelContext);
  for (const price of prices) {
    if (price.modelKey !== model.modelKey || price.verificationStatus !== 'primary') continue;
    const context = validContextWindow(price.contextWindowTokens);
    if (context !== null) values.add(context);
  }
  // Conflicting primary facts are not collapsed into one presentation value.
  return values.size === 1 ? [...values][0] : null;
}

/**
 * Builds the reviewed home comparison cards. A pair ships only when it clears
 * every published gate: it is on the editorial allowlist, both models resolve
 * in the active revision, it has at least four compatible shared metrics, at
 * least one decision-relevant difference, and price or context evidence for a
 * factual implication. Nothing is described as a universal winner.
 */
export function representativeComparisons(
  snapshot: BenchmarkProjectionSnapshot,
  factIndexes: BenchmarkFactIndexes,
): readonly RepresentativeComparison[] {
  const resolvePairSlug = createComparisonPairSlugResolver(snapshot.models);
  return COMPARISON_ALLOWLIST.flatMap((pairSlug) => {
    if (!isComparisonPairRouteSafe(pairSlug)) return [];
    const resolved = resolvePairSlug(pairSlug);
    if (!resolved) return [];
    const { modelA, modelB } = resolved;
    if (modelA.evidenceStatus !== 'supported' || modelB.evidenceStatus !== 'supported') return [];

    const sharedMetrics = comparableSharedMetrics(modelA, modelB, factIndexes);
    if (sharedMetrics.length < MINIMUM_SHARED_COMPARISON_METRICS) return [];
    // At least one decision-relevant difference; an all-tie pair says nothing.
    if (!sharedMetrics.some((metric) => metric.gap > 0)) return [];

    const priceA = primaryHostedPriceForModel(modelA.modelKey, factIndexes.pricesByModel.get(modelA.modelKey) ?? [], 'outputHeavy');
    const priceB = primaryHostedPriceForModel(modelB.modelKey, factIndexes.pricesByModel.get(modelB.modelKey) ?? [], 'outputHeavy');
    const contextA = exactPrimaryContextWindow(modelA, factIndexes.pricesByModel.get(modelA.modelKey) ?? []);
    const contextB = exactPrimaryContextWindow(modelB, factIndexes.pricesByModel.get(modelB.modelKey) ?? []);
    const hasPriceEvidence = priceA !== null && priceB !== null;
    const hasContextEvidence = contextA !== null && contextB !== null;
    if (!hasPriceEvidence && !hasContextEvidence) return [];

    return [{
      pairSlug: resolved.canonicalPairSlug,
      modelASlug: modelA.slug,
      modelBSlug: modelB.slug,
      modelAName: modelA.name,
      modelBName: modelB.name,
      sharedMetricCount: sharedMetrics.length,
      sharedMetrics,
      modelAPriceUsdPerMillion: hasPriceEvidence ? priceA.blendedCostPerMillion : null,
      modelBPriceUsdPerMillion: hasPriceEvidence ? priceB.blendedCostPerMillion : null,
      modelAContextWindowTokens: contextA,
      modelBContextWindowTokens: contextB,
    }];
  });
}

export function buildBenchmarkSummaryData(snapshot: BenchmarkProjectionSnapshot) {
  const factIndexes = indexBenchmarkFacts(snapshot.metrics, snapshot.priceChecks);
  const decisions = materializeDecisionPicks({
    ...snapshot,
    metrics: factIndexes.metrics,
    priceChecks: factIndexes.priceChecks,
  });
  return {
    sources: sourceAvailability(snapshot),
    routes: routeAvailability(snapshot, factIndexes),
    compareDirectory: compareDirectory(snapshot, factIndexes),
    representativeComparisons: representativeComparisons(snapshot, factIndexes),
    decisionPicks: decisions.decisionPicks,
    homeDecisionSnapshot: decisions.homeDecisionSnapshot,
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
    // A source-ranked row belongs to the ranked flow, never the estimate
    // extension appended after supported rows.
    && metric.rank === null
    && definition.metricKeys.includes(metric.metricKey)
    && metric.methodology === 'benchlm_raw_composite'
    && metric.unit === 'score'
    && Number.isFinite(metric.value);
}

function validContextWindow(value: number | null): number | null {
  return value !== null && Number.isSafeInteger(value) && value > 0 ? value : null;
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
        // Guarded above: estimate-extension metrics never carry a source rank.
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
  const displayed = displayedEvidence(entries);
  // A populated page attributes only the model, metric, and selected price
  // artifacts that actually contribute rendered facts. The route fallback is
  // retained solely for an empty state, where no displayed fact can identify
  // the source whose checked availability explains the empty result.
  return displayed.length > 0 ? displayed : routeEvidence(snapshot, definition);
}
