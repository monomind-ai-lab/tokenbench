import type {
  BenchmarkMetric,
  BenchmarkMethodology,
  BenchmarkModel,
  BenchmarkPriceCheck,
  BenchmarkSourceId,
  BenchmarkSourceRecord,
  MetricUnit,
} from '../benchmarks/contracts';

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
  /** Route records retain all pricing and context fields from the active revision. */
  readonly checks: readonly BenchmarkPriceCheck[];
}

export interface ComparisonMethodology {
  readonly sourceId: BenchmarkSourceId;
  readonly methodology: BenchmarkMethodology;
}

export interface RelatedComparison {
  readonly pairSlug: string;
  readonly modelA: BenchmarkModel;
  readonly modelB: BenchmarkModel;
  readonly featuredRank: number | null;
  readonly sharedMetricCount: number;
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

function isTimestamp(value: unknown): value is string {
  return isText(value)
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
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
    && isTimestamp(value.sourceUpdatedAt)
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
    && isTimestamp(value.observedAt)
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
    && matchesLens(right as BenchmarkMetric | null, models[1]);
}

function isRelatedComparison(value: unknown): value is RelatedComparison {
  if (!isRecord(value)) return false;
  return isText(value.pairSlug)
    && !/[\u0000-\u001f\u007f/]/.test(value.pairSlug as string)
    && isModel(value.modelA)
    && isModel(value.modelB)
    && value.modelA.modelKey !== value.modelB.modelKey
    && value.pairSlug === `${value.modelA.slug}-vs-${value.modelB.slug}`
    && (value.featuredRank === null || (Number.isSafeInteger(value.featuredRank) && (value.featuredRank as number) > 0))
    && Number.isSafeInteger(value.sharedMetricCount)
    && (value.sharedMetricCount as number) >= 0;
}

/** Returns null rather than mounting over server HTML when embedded JSON is malformed. */
export function parseComparisonViewModel(value: unknown): ComparisonViewModel | null {
  if (!isRecord(value)
    || !isText(value.revision)
    || !isTimestamp(value.publishedAt)
    || !isRecord(value.freshness)
    || (value.freshness.status !== 'fresh' && value.freshness.status !== 'stale')
    || !isTimestamp(value.freshness.checkedAt)
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
  const expectedCanonicalPath = `/compare/${encodeURIComponent(`${models[0].slug}-vs-${models[1].slug}`)}`;
  if (value.canonicalPath !== expectedCanonicalPath) return null;
  if (!value.metricRows.every((row) => isMetricRow(row, models))) return null;
  if (!value.priceChecks.every((group, index) => isRecord(group)
    && group.modelKey === models[index].modelKey
    && Array.isArray(group.checks)
    && group.checks.every((check) => isPriceCheck(check) && check.modelKey === models[index].modelKey))) return null;
  if (!value.attribution.every(isSourceRecord)) return null;
  if (!value.methodology.every((item) => isRecord(item)
    && isSourceId(item.sourceId)
    && typeof item.methodology === 'string'
    && METHODOLOGIES.has(item.methodology as BenchmarkMethodology))) return null;
  if (!value.relatedPairs.every(isRelatedComparison)) return null;

  return value as unknown as ComparisonViewModel;
}
