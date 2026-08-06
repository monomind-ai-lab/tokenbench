import {
  compareUtf8Binary,
  isCanonicalIsoTimestamp,
  isComparisonPairRouteSafe,
  type BenchmarkMetric,
  type BenchmarkMethodology,
  type BenchmarkModel,
  type BenchmarkPriceCheck,
  type BenchmarkSourceId,
  type BenchmarkSourceRecord,
  type MetricUnit,
} from '../benchmarks/contracts';
import { comparisonPriceRoutes, comparisonPriceSourceArtifactIdentity, defaultComparisonPriceRoute } from '../benchmarks/comparison-pricing';
export interface ComparisonMetricRow {
  readonly metricKey: string;
  readonly category: string;
  readonly unit: MetricUnit;
  readonly sourceId: BenchmarkSourceId;
  readonly methodology: BenchmarkMethodology;
  /** A full source metric or an explicit null when that model has none. */
  readonly modelA: BenchmarkMetric | null;
  /** A full source metric or an explicit null when that model has none. */
  readonly modelB: BenchmarkMetric | null;
}

export interface ComparisonPriceChecks {
  readonly modelKey: string;
  /** Always present; null means no verified route can be selected unambiguously. */
  readonly selectedRouteId: string | null;
  /** Route records retain all pricing and context fields from the active revision. */
  readonly checks: readonly BenchmarkPriceCheck[];
}

/** Resolves a published selection only when its route ID identifies one fact. */
export function selectedComparisonPriceCheck(group: ComparisonPriceChecks): BenchmarkPriceCheck | null {
  if (group.selectedRouteId === null) return null;
  const matches = group.checks.filter((check) => check.routeId === group.selectedRouteId);
  return matches.length === 1 ? matches[0] : null;
}

export interface ComparisonMethodology {
  readonly sourceId: BenchmarkSourceId;
  readonly methodology: BenchmarkMethodology;
}

export interface ComparisonSummary {
  readonly heading: string;
  readonly sentences: readonly string[];
  readonly coverage: 'strong' | 'limited' | 'none';
}

export interface RelatedComparison {
  readonly pairSlug: string;
  readonly modelA: BenchmarkModel;
  readonly modelB: BenchmarkModel;
  readonly featuredRank: number | null;
  readonly sharedMetricCount: number;
}

function metricRowSourceArtifactId(row: ComparisonMetricRow): string {
  return row.modelA?.sourceArtifactId ?? row.modelB?.sourceArtifactId ?? '';
}

export function comparisonMetricRowIdentity(row: ComparisonMetricRow): string {
  return [
    row.metricKey,
    row.category,
    row.unit,
    row.sourceId,
    metricRowSourceArtifactId(row),
    row.methodology,
  ].join('\u0000');
}

export function compareComparisonMetricRows(left: ComparisonMetricRow, right: ComparisonMetricRow): number {
  return compareUtf8Binary(left.metricKey, right.metricKey)
    || compareUtf8Binary(left.sourceId, right.sourceId)
    || compareUtf8Binary(left.category, right.category)
    || compareUtf8Binary(left.unit, right.unit)
    || compareUtf8Binary(left.methodology, right.methodology)
    || compareUtf8Binary(metricRowSourceArtifactId(left), metricRowSourceArtifactId(right));
}

export function comparisonPriceCheckIdentity(check: BenchmarkPriceCheck): string {
  return [check.sourceId, check.providerId, check.routeId].join('\u0000');
}

export function compareComparisonPriceChecks(left: BenchmarkPriceCheck, right: BenchmarkPriceCheck): number {
  return compareUtf8Binary(left.sourceId, right.sourceId)
    || compareUtf8Binary(left.providerId, right.providerId)
    || compareUtf8Binary(left.routeId, right.routeId);
}

export function compareComparisonSources(left: BenchmarkSourceRecord, right: BenchmarkSourceRecord): number {
  return compareUtf8Binary(left.sourceId, right.sourceId)
    || compareUtf8Binary(left.artifactId, right.artifactId);
}

export function compareComparisonMethodologies(left: ComparisonMethodology, right: ComparisonMethodology): number {
  return compareUtf8Binary(left.sourceId, right.sourceId)
    || compareUtf8Binary(left.methodology, right.methodology);
}

export function compareRelatedComparisons(left: RelatedComparison, right: RelatedComparison): number {
  if (left.featuredRank === null && right.featuredRank !== null) return 1;
  if (left.featuredRank !== null && right.featuredRank === null) return -1;
  if (left.featuredRank !== null && right.featuredRank !== null && left.featuredRank !== right.featuredRank) {
    return left.featuredRank - right.featuredRank;
  }
  return compareUtf8Binary(left.pairSlug, right.pairSlug);
}

function isBenchLmScoreMetricKey(metricKey: string): boolean {
  return metricKey === 'benchlm:overall:raw' || /^benchlm:category:[^:]+$/.test(metricKey);
}

function isSupportedBenchLmMetricForComparison(
  model: BenchmarkModel,
  metric: BenchmarkMetric,
  row: ComparisonMetricRow,
): boolean {
  return model.sourceId === 'benchlm'
    && model.evidenceStatus === 'supported'
    && (row.metricKey !== 'benchlm:overall:raw' || model.rankingEligible)
    && metric.modelKey === model.modelKey
    && metric.metricKey === row.metricKey
    && metric.category === row.category
    && metric.sourceId === 'benchlm'
    && metric.unit === 'score'
    && metric.methodology === 'benchlm_raw_composite'
    && metric.rankingEligible
    && Number.isFinite(metric.value);
}

/**
 * Returns true only for the exact, supported BenchLM evidence that can make a
 * metric-specific score comparison. Raw rows from other sources stay visible,
 * but must not become a capability claim.
 */
export function isSupportedBenchLmComparisonMetric(
  row: ComparisonMetricRow,
  models: readonly [BenchmarkModel, BenchmarkModel],
): boolean {
  const [modelA, modelB] = models;
  const { modelA: metricA, modelB: metricB } = row;
  return row.sourceId === 'benchlm'
    && isBenchLmScoreMetricKey(row.metricKey)
    && row.unit === 'score'
    && row.methodology === 'benchlm_raw_composite'
    && metricA !== null
    && metricB !== null
    && metricA.sourceArtifactId === metricB.sourceArtifactId
    && isSupportedBenchLmMetricForComparison(modelA, metricA, row)
    && isSupportedBenchLmMetricForComparison(modelB, metricB, row);
}

/**
 * The serializable boundary shared by the Pages Function SSR response and its
 * browser hydration. It deliberately contains source records rather than a
 * derived score, winner, or catalog revision chosen outside publication state.
 */
export interface ComparisonViewModel {
  readonly revision: string;
  readonly publishedAt: string;
  readonly freshness: {
    readonly status: 'fresh' | 'stale';
    readonly checkedAt: string;
    readonly message?: string;
  };
  readonly canonicalPath: string;
  readonly models: readonly [BenchmarkModel, BenchmarkModel];
  readonly metricRows: readonly ComparisonMetricRow[];
  readonly priceChecks: readonly [ComparisonPriceChecks, ComparisonPriceChecks];
  readonly attribution: readonly BenchmarkSourceRecord[];
  readonly indexable: boolean;
  readonly methodology: readonly ComparisonMethodology[];
  readonly relatedPairs: readonly RelatedComparison[];
  /** The reviewed subscription map is intentionally empty in this release. */
  readonly subscriptionMatch: null;
}

const SOURCE_IDS = new Set<BenchmarkSourceId>(['benchlm', 'lmarena', 'litellm', 'openrouter']);
const UNITS = new Set<MetricUnit>(['score', 'arena_score', 'rank', 'usd_per_million_tokens', 'tokens']);
const METHODOLOGIES = new Set<BenchmarkMethodology>(['benchlm_raw_composite', 'bradley_terry', 'ips']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNullableText(value: unknown): boolean {
  return value === null || isText(value);
}

function isNullableFinite(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isNullableNonNegativeFinite(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

function isNullableNonNegativeInteger(value: unknown): boolean {
  return value === null || (Number.isSafeInteger(value) && (value as number) >= 0);
}

function isNullablePositiveInteger(value: unknown): boolean {
  return value === null || (Number.isSafeInteger(value) && (value as number) > 0);
}

function isSourceId(value: unknown): value is BenchmarkSourceId {
  return typeof value === 'string' && SOURCE_IDS.has(value as BenchmarkSourceId);
}

function isModel(value: unknown): value is BenchmarkModel {
  if (!isRecord(value)) return false;
  return ['modelKey', 'slug', 'name', 'creator', 'sourceModelId', 'sourceArtifactId'].every((key) => isText(value[key]))
    && (value.sourceType === 'Proprietary' || value.sourceType === 'Open Weight' || value.sourceType === 'Unknown')
    && isNullableText(value.reasoningType)
    && isNullableText(value.releaseDate)
    && isNullablePositiveInteger(value.contextWindowTokens)
    && (value.evidenceStatus === 'supported' || value.evidenceStatus === 'estimated' || value.evidenceStatus === 'source_only')
    && typeof value.rankingEligible === 'boolean'
    && isNullableFinite(value.confidenceLower)
    && isNullableFinite(value.confidenceUpper)
    && Number.isSafeInteger(value.benchmarkCount)
    && (value.benchmarkCount as number) >= 0
    && isSourceId(value.sourceId);
}

function isMetric(value: unknown): value is BenchmarkMetric {
  if (!isRecord(value)) return false;
  return ['modelKey', 'metricKey', 'category', 'sourceModelId', 'sourceArtifactId'].every((key) => isText(value[key]))
    && typeof value.value === 'number'
    && Number.isFinite(value.value)
    && isNullablePositiveInteger(value.rank)
    && isNullableFinite(value.lower)
    && isNullableFinite(value.upper)
    && isNullableNonNegativeInteger(value.voteCount)
    && typeof value.unit === 'string'
    && UNITS.has(value.unit as MetricUnit)
    && isSourceId(value.sourceId)
    && isCanonicalIsoTimestamp(value.sourceUpdatedAt)
    && typeof value.rankingEligible === 'boolean'
    && typeof value.methodology === 'string'
    && METHODOLOGIES.has(value.methodology as BenchmarkMethodology)
    && isNullableNonNegativeInteger(value.observationCount)
    && isNullableNonNegativeInteger(value.sessionCount);
}

function isStringArrayOrNull(value: unknown): boolean {
  return value === null || (Array.isArray(value) && value.every(isText));
}

function isPriceCheck(value: unknown): value is BenchmarkPriceCheck {
  if (!isRecord(value)) return false;
  return ['modelKey', 'providerId', 'routeId', 'sourceModelId', 'sourceArtifactId'].every((key) => isText(value[key]))
    && isSourceId(value.sourceId)
    && isNullableNonNegativeFinite(value.inputUsdPerMillion)
    && isNullableNonNegativeFinite(value.cachedInputUsdPerMillion)
    && isNullableNonNegativeFinite(value.outputUsdPerMillion)
    && isNullablePositiveInteger(value.contextWindowTokens)
    && (value.verificationStatus === 'primary' || value.verificationStatus === 'corroborating' || value.verificationStatus === 'conflict')
    && isNullableText(value.canonicalSlug)
    && isNullablePositiveInteger(value.maxInputTokens)
    && isNullablePositiveInteger(value.maxOutputTokens)
    && isStringArrayOrNull(value.inputModalities)
    && isStringArrayOrNull(value.outputModalities)
    && isStringArrayOrNull(value.supportedParameters);
}

function isHttps(value: unknown): boolean {
  if (!isText(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.length > 0;
  } catch {
    return false;
  }
}

function isSourceRecord(value: unknown): value is BenchmarkSourceRecord {
  if (!isRecord(value)) return false;
  return isSourceId(value.sourceId)
    && ['artifactId', 'snapshotKey', 'contentHash', 'originalContentHash', 'attributionText'].every((key) => isText(value[key]))
    && isHttps(value.sourceUrl)
    && isCanonicalIsoTimestamp(value.observedAt)
    && isNullableText(value.etag)
    && isNullableText(value.lastModified)
    && isNullableText(value.upstreamRevision)
    && isNullableText(value.schemaVersion)
    && (value.licenseId === 'MIT' || value.licenseId === 'CC-BY-4.0' || value.licenseId === 'OpenRouter-ToS');
}

function isMetricRow(value: unknown, models: readonly [BenchmarkModel, BenchmarkModel]): value is ComparisonMetricRow {
  if (!isRecord(value)) return false;
  const left = value.modelA;
  const right = value.modelB;
  if (!(['metricKey', 'category'].every((key) => isText(value[key]))
    && typeof value.unit === 'string'
    && UNITS.has(value.unit as MetricUnit)
    && isSourceId(value.sourceId)
    && typeof value.methodology === 'string'
    && METHODOLOGIES.has(value.methodology as BenchmarkMethodology)
    && (left === null || isMetric(left))
    && (right === null || isMetric(right)))) return false;
  const matchesLens = (metric: BenchmarkMetric | null, model: BenchmarkModel): boolean => metric === null || (
    metric.modelKey === model.modelKey
    && metric.metricKey === value.metricKey
    && metric.category === value.category
    && metric.unit === value.unit
    && metric.sourceId === value.sourceId
    && metric.methodology === value.methodology
  );
  return (left !== null || right !== null)
    && matchesLens(left as BenchmarkMetric | null, models[0])
    && matchesLens(right as BenchmarkMetric | null, models[1])
    && (left === null || right === null
      || (left as BenchmarkMetric).sourceArtifactId === (right as BenchmarkMetric).sourceArtifactId);
}

function evidenceIdentity(sourceId: BenchmarkSourceId, artifactId: string): string {
  return `${sourceId}\u0000${artifactId}`;
}

function isStrictlyOrdered<T>(values: readonly T[], compare: (left: T, right: T) => number): boolean {
  return values.every((value, index) => index === 0 || compare(values[index - 1], value) < 0);
}

function hasUniqueIdentities<T>(values: readonly T[], identity: (value: T) => string): boolean {
  return new Set(values.map(identity)).size === values.length;
}

function sameModelRecord(left: BenchmarkModel, right: BenchmarkModel): boolean {
  return left.modelKey === right.modelKey
    && left.slug === right.slug
    && left.name === right.name
    && left.creator === right.creator
    && left.sourceType === right.sourceType
    && left.reasoningType === right.reasoningType
    && left.releaseDate === right.releaseDate
    && left.contextWindowTokens === right.contextWindowTokens
    && left.evidenceStatus === right.evidenceStatus
    && left.rankingEligible === right.rankingEligible
    && left.confidenceLower === right.confidenceLower
    && left.confidenceUpper === right.confidenceUpper
    && left.benchmarkCount === right.benchmarkCount
    && left.sourceId === right.sourceId
    && left.sourceModelId === right.sourceModelId
    && left.sourceArtifactId === right.sourceArtifactId;
}

function exactAttribution(
  attribution: readonly BenchmarkSourceRecord[],
  models: readonly [BenchmarkModel, BenchmarkModel],
  rows: readonly ComparisonMetricRow[],
  prices: readonly ComparisonPriceChecks[],
): boolean {
  const referenced = new Set<string>([
    ...models.map((model) => evidenceIdentity(model.sourceId, model.sourceArtifactId)),
    ...rows.flatMap((row) => [row.modelA, row.modelB].flatMap((metric) => metric === null
      ? []
      : [evidenceIdentity(metric.sourceId, metric.sourceArtifactId)])),
    ...prices.flatMap((group) => group.checks.map((check) => evidenceIdentity(check.sourceId, check.sourceArtifactId))),
  ]);
  if (attribution.length !== referenced.size) return false;
  const found = new Set<string>();
  return attribution.every((source) => {
    const identity = evidenceIdentity(source.sourceId, source.artifactId);
    if (!referenced.has(identity) || found.has(identity)) return false;
    found.add(identity);
    return true;
  });
}

function methodologyIdentity(sourceId: BenchmarkSourceId, methodology: BenchmarkMethodology): string {
  return `${sourceId}\u0000${methodology}`;
}

function exactMethodology(
  methodology: readonly ComparisonMethodology[],
  rows: readonly ComparisonMetricRow[],
): boolean {
  const referenced = new Set(rows.map((row) => methodologyIdentity(row.sourceId, row.methodology)));
  if (methodology.length !== referenced.size) return false;
  const found = new Set<string>();
  return methodology.every((item) => {
    const identity = methodologyIdentity(item.sourceId, item.methodology);
    if (!referenced.has(identity) || found.has(identity)) return false;
    found.add(identity);
    return true;
  });
}

function isRelatedComparison(
  value: unknown,
  currentModels: readonly [BenchmarkModel, BenchmarkModel],
  currentPairSlug: string,
): value is RelatedComparison {
  if (!isRecord(value) || !isModel(value.modelA) || !isModel(value.modelB)) return false;
  const currentModelsByKey = new Map(currentModels.map((model) => [model.modelKey, model]));
  const relatedModels = [value.modelA, value.modelB];
  const intersectingCurrentModels = relatedModels.filter((model) => currentModelsByKey.has(model.modelKey));
  const sharedRelatedModel = intersectingCurrentModels.length === 1 ? intersectingCurrentModels[0] : null;
  const correspondingCurrentModel = sharedRelatedModel === null
    ? null
    : currentModelsByKey.get(sharedRelatedModel.modelKey) ?? null;
  return isText(value.pairSlug)
    && isComparisonPairRouteSafe(value.pairSlug as string)
    && value.modelA.modelKey !== value.modelB.modelKey
    && compareUtf8Binary(value.modelA.modelKey, value.modelB.modelKey) < 0
    && value.pairSlug === `${value.modelA.slug}-vs-${value.modelB.slug}`
    && value.pairSlug !== currentPairSlug
    && intersectingCurrentModels.length === 1
    && sharedRelatedModel !== null
    && correspondingCurrentModel !== null
    && sameModelRecord(sharedRelatedModel, correspondingCurrentModel)
    && (value.featuredRank === null || (Number.isSafeInteger(value.featuredRank) && (value.featuredRank as number) > 0))
    && Number.isSafeInteger(value.sharedMetricCount)
    && (value.sharedMetricCount as number) >= 2;
}

/** Returns null rather than mounting over server HTML when embedded JSON is malformed. */
export function parseComparisonViewModel(value: unknown): ComparisonViewModel | null {
  if (!isRecord(value)
    || !isText(value.revision)
    || !isCanonicalIsoTimestamp(value.publishedAt)
    || !isRecord(value.freshness)
    || (value.freshness.status !== 'fresh' && value.freshness.status !== 'stale')
    || !isCanonicalIsoTimestamp(value.freshness.checkedAt)
    || (value.freshness.message !== undefined && !isText(value.freshness.message))
    || !isText(value.canonicalPath)
    || !/^\/compare\/[^/]+$/.test(value.canonicalPath)
    || !Array.isArray(value.models)
    || value.models.length !== 2
    || !isModel(value.models[0])
    || !isModel(value.models[1])
    || value.models[0].modelKey === value.models[1].modelKey
    || !Array.isArray(value.metricRows)
    || !Array.isArray(value.priceChecks)
    || value.priceChecks.length !== 2
    || !Array.isArray(value.attribution)
    || typeof value.indexable !== 'boolean'
    || !Array.isArray(value.methodology)
    || !Array.isArray(value.relatedPairs)
    || value.subscriptionMatch !== null) return null;

  const models = value.models as unknown as readonly [BenchmarkModel, BenchmarkModel];
  const currentPairSlug = `${models[0].slug}-vs-${models[1].slug}`;
  if (compareUtf8Binary(models[0].modelKey, models[1].modelKey) >= 0
    || !isComparisonPairRouteSafe(currentPairSlug)) return null;
  const expectedCanonicalPath = `/compare/${encodeURIComponent(currentPairSlug)}`;
  if (value.canonicalPath !== expectedCanonicalPath) return null;
  if (!value.metricRows.every((row) => isMetricRow(row, models))) return null;
  if (!value.priceChecks.every((group, index) => isRecord(group)
    && group.modelKey === models[index].modelKey
    && Object.prototype.hasOwnProperty.call(group, 'selectedRouteId')
    && isNullableText(group.selectedRouteId)
    && Array.isArray(group.checks)
    && group.checks.every((check) => isPriceCheck(check) && check.modelKey === models[index].modelKey))) return null;
  if (!value.attribution.every(isSourceRecord)) return null;
  const metricRows = value.metricRows as unknown as readonly ComparisonMetricRow[];
  const priceChecks = value.priceChecks as unknown as readonly ComparisonPriceChecks[];
  const attribution = value.attribution as unknown as readonly BenchmarkSourceRecord[];
  if (!hasUniqueIdentities(metricRows, comparisonMetricRowIdentity)
    || !isStrictlyOrdered(metricRows, compareComparisonMetricRows)
    || !exactAttribution(attribution, models, metricRows, priceChecks)
    || !isStrictlyOrdered(attribution, compareComparisonSources)) return null;
  const sourcesByArtifactId = new Map(attribution.map((source) => [
    comparisonPriceSourceArtifactIdentity(source.sourceId, source.artifactId),
    source,
  ]));
  if (!priceChecks.every((group) => {
    const expectedRoutes = comparisonPriceRoutes(group.modelKey, group.checks, sourcesByArtifactId);
    const expectedSelectedRouteId = defaultComparisonPriceRoute(
      group.modelKey,
      group.checks,
      sourcesByArtifactId,
    )?.routeId ?? null;
    return hasUniqueIdentities(group.checks, comparisonPriceCheckIdentity)
      && expectedRoutes.length === group.checks.length
      && expectedRoutes.every((check, index) => check === group.checks[index])
      && group.selectedRouteId === expectedSelectedRouteId;
  })) return null;
  if (!value.methodology.every((item) => isRecord(item)
    && isSourceId(item.sourceId)
    && typeof item.methodology === 'string'
    && METHODOLOGIES.has(item.methodology as BenchmarkMethodology))) return null;
  const methodology = value.methodology as unknown as readonly ComparisonMethodology[];
  if (!exactMethodology(methodology, metricRows)
    || !isStrictlyOrdered(methodology, compareComparisonMethodologies)) return null;
  if (value.relatedPairs.length > 6
    || !value.relatedPairs.every((pair) => isRelatedComparison(pair, models, currentPairSlug))) return null;
  const relatedPairSlugs = value.relatedPairs.map((pair) => (pair as RelatedComparison).pairSlug);
  const relatedPairs = value.relatedPairs as unknown as readonly RelatedComparison[];
  if (new Set(relatedPairSlugs).size !== relatedPairSlugs.length
    || !isStrictlyOrdered(relatedPairs, compareRelatedComparisons)) return null;

  return value as unknown as ComparisonViewModel;
}
