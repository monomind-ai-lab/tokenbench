import {
  isCanonicalIsoTimestamp,
  type BenchmarkModel,
  type BenchmarkSourceId,
  type EvidenceStatus,
  type MetricUnit,
} from '../benchmarks/contracts';
import {
  isModelSlugRouteSafe,
  modelPath,
  parseModelDirectoryRecord,
  weekStartUtc,
  type ModelDirectoryRecord,
  type ModelDirectoryStatus,
  type PopularModelWeek,
} from '../benchmarks/model-directory';
import type {
  ModelProfileCategory,
  ModelProfilePriceRoute,
} from '../benchmarks/model-profile';

export type { ModelDirectoryRecord, ModelDirectoryStatus, PopularModelWeek };
export { modelPath };

export interface ModelDirectoryAttribution {
  readonly sourceId: BenchmarkSourceId;
  readonly label: string;
  readonly url: string;
  readonly updatedAt: string;
}

export interface ModelDirectoryEntry extends ModelDirectoryRecord {
  readonly weeklyRank: number | null;
  readonly overallScore: number | null;
  /**
   * Preference rating on its own scale. Required on the parsed entry but
   * tolerated as absent on the wire, so a response cached before the split
   * still parses; a missing value reads as null rather than as a score.
   */
  readonly preferenceRating: number | null;
  readonly overallRank: number | null;
  /** Exact ordered category facts retained from the selected published profile. */
  readonly categories: readonly ModelProfileCategory[];
  readonly strongestCategory: ModelProfileCategory | null;
  readonly representativePrice: ModelProfilePriceRoute | null;
  readonly evidenceStatus: EvidenceStatus;
  readonly profileRevision: string;
  readonly profileFallback: 'none' | 'prior-profile';
  readonly profilePublishedAt: string | null;
  readonly profileCheckedAt: string;
}

export interface ModelDirectoryEnvelope {
  readonly revision: string;
  readonly publishedAt: string;
  readonly freshness: {
    readonly status: 'fresh' | 'stale';
    readonly checkedAt: string;
    readonly message?: string;
  };
  readonly attribution: readonly ModelDirectoryAttribution[];
  readonly data: {
    readonly week: PopularModelWeek | null;
    readonly models: readonly ModelDirectoryEntry[];
    readonly nextCursor: string | null;
    /**
     * Which population the response drew from. Optional because a response
     * cached before the field existed is still valid evidence; absent means the
     * cohort is simply unknown, which a reader must not mistake for "catalogue".
     */
    readonly cohort?: {
      readonly kind: 'weekly-popular' | 'catalogue';
      readonly size: number | null;
      readonly catalogueQuery: string | null;
    };
  };
}

function parseCohort(value: unknown): ModelDirectoryEnvelope['data']['cohort'] | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind !== 'weekly-popular' && candidate.kind !== 'catalogue') return null;
  const size = candidate.size;
  if (!(size === null || (typeof size === 'number' && Number.isSafeInteger(size) && size >= 0))) return null;
  const catalogueQuery = candidate.catalogueQuery;
  if (!(catalogueQuery === null || (typeof catalogueQuery === 'string' && catalogueQuery.length > 0))) return null;
  return { kind: candidate.kind, size: size as number | null, catalogueQuery: catalogueQuery as string | null };
}

const SOURCE_IDS = new Set<BenchmarkSourceId>(['benchlm', 'lmarena', 'litellm', 'openrouter']);
const EVIDENCE_STATUSES = new Set<EvidenceStatus>(['supported', 'estimated', 'source_only']);
const MODEL_SOURCE_TYPES = new Set<BenchmarkModel['sourceType']>(['Proprietary', 'Open Weight', 'Unknown']);
const METRIC_UNITS = new Set<MetricUnit>(['score', 'arena_score', 'rank', 'usd_per_million_tokens', 'tokens']);
const VERIFICATION_STATUSES = new Set<ModelProfilePriceRoute['verificationStatus']>(['primary', 'corroborating', 'conflict']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function nullableText(value: unknown): value is string | null {
  return value === null || text(value);
}

function timestamp(value: unknown): value is string {
  return typeof value === 'string' && isCanonicalIsoTimestamp(value);
}

function httpsUrl(value: unknown): value is string {
  return text(value) && value.startsWith('https://');
}

function nullableFinite(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function nullablePositiveInteger(value: unknown): value is number | null {
  return value === null || (Number.isSafeInteger(value) && (value as number) > 0);
}

function nullableNonNegativeInteger(value: unknown): value is number | null {
  return value === null || (Number.isSafeInteger(value) && (value as number) >= 0);
}

function nullableBoolean(value: unknown): value is boolean | null {
  return value === null || typeof value === "boolean";
}

function nullableJsonObject(value: unknown): value is string | null {
  if (value === null) return true;
  if (!text(value)) return false;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function stringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => text(item));
}

function sourceId(value: unknown): value is BenchmarkSourceId {
  return typeof value === 'string' && SOURCE_IDS.has(value as BenchmarkSourceId);
}

function evidenceStatus(value: unknown): value is EvidenceStatus {
  return typeof value === 'string' && EVIDENCE_STATUSES.has(value as EvidenceStatus);
}

function modelSourceType(value: unknown): value is BenchmarkModel['sourceType'] {
  return typeof value === 'string' && MODEL_SOURCE_TYPES.has(value as BenchmarkModel['sourceType']);
}

function metricUnit(value: unknown): value is MetricUnit {
  return typeof value === 'string' && METRIC_UNITS.has(value as MetricUnit);
}

function parseCategory(value: unknown): ModelProfileCategory | null {
  if (!isRecord(value)
    || !text(value.key)
    || !text(value.metricKey)
    || !text(value.label)
    || typeof value.score !== 'number'
    || !Number.isFinite(value.score)
    || !nullableFinite(value.rawScore)
    || !nullablePositiveInteger(value.rank)
    || !nullablePositiveInteger(value.fieldSize)
    || !nullableFinite(value.percentile)
    || (value.percentile !== null && ((value.percentile as number) < 0 || (value.percentile as number) > 100))
    || !evidenceStatus(value.evidenceStatus)
    || !nonNegativeInteger(value.benchmarkCount)
    || typeof value.rankingEligible !== 'boolean'
    || !metricUnit(value.unit)
    || !sourceId(value.sourceId)) return null;
  return value as unknown as ModelProfileCategory;
}

/**
 * Preserve the published profile order while rejecting ambiguous duplicate
 * category identities at the SSR-to-browser boundary.
 */
function parseCategories(value: unknown): readonly ModelProfileCategory[] | null {
  if (!Array.isArray(value)) return null;
  const categories: ModelProfileCategory[] = [];
  const keys = new Set<string>();
  for (const candidate of value) {
    const category = parseCategory(candidate);
    if (category === null || keys.has(category.key)) return null;
    keys.add(category.key);
    categories.push(category);
  }
  return categories;
}

function parsePriceRoute(value: unknown): ModelProfilePriceRoute | null {
  if (!isRecord(value)
    || !sourceId(value.sourceId)
    || !text(value.providerId)
    || !text(value.routeId)
    || !text(value.sourceModelId)
    || !nullableText(value.canonicalSlug)
    || (value.canonicalSlug !== null && !isModelSlugRouteSafe(value.canonicalSlug))
    || !nullableFinite(value.inputUsdPerMillion)
    || !nullableFinite(value.cachedInputUsdPerMillion)
    || (value.cacheWriteUsdPerMillion !== undefined && !nullableFinite(value.cacheWriteUsdPerMillion))
    || !nullableFinite(value.outputUsdPerMillion)
    || !nullablePositiveInteger(value.contextWindowTokens)
    || !nullablePositiveInteger(value.maxInputTokens)
    || !nullablePositiveInteger(value.maxOutputTokens)
    || !(value.inputModalities === null || stringArray(value.inputModalities))
    || !(value.outputModalities === null || stringArray(value.outputModalities))
    || !(value.supportedParameters === null || stringArray(value.supportedParameters))
    || (value.createdAt !== undefined && !nullableText(value.createdAt))
    || (value.expirationDate !== undefined && !nullableText(value.expirationDate))
    || (value.knowledgeCutoff !== undefined && !nullableText(value.knowledgeCutoff))
    || (value.tokenizer !== undefined && !nullableText(value.tokenizer))
    || (value.instructionFormat !== undefined && !nullableText(value.instructionFormat))
    || (value.isModerated !== undefined && !nullableBoolean(value.isModerated))
    || (value.perRequestLimitsJson !== undefined && !nullableJsonObject(value.perRequestLimitsJson))
    || typeof value.verificationStatus !== 'string'
    || !VERIFICATION_STATUSES.has(value.verificationStatus as ModelProfilePriceRoute['verificationStatus'])
    || !text(value.sourceArtifactId)
    || !httpsUrl(value.sourceUrl)
    || !timestamp(value.observedAt)) return null;
  return {
    ...(value as unknown as ModelProfilePriceRoute),
    cacheWriteUsdPerMillion: value.cacheWriteUsdPerMillion === undefined
      ? null
      : value.cacheWriteUsdPerMillion as number | null,
    createdAt: value.createdAt === undefined ? null : value.createdAt as string | null,
    expirationDate: value.expirationDate === undefined ? null : value.expirationDate as string | null,
    knowledgeCutoff: value.knowledgeCutoff === undefined ? null : value.knowledgeCutoff as string | null,
    tokenizer: value.tokenizer === undefined ? null : value.tokenizer as string | null,
    instructionFormat: value.instructionFormat === undefined ? null : value.instructionFormat as string | null,
    isModerated: value.isModerated === undefined ? null : value.isModerated as boolean | null,
    perRequestLimitsJson: value.perRequestLimitsJson === undefined
      ? null
      : value.perRequestLimitsJson as string | null,
  };
}

function parseWeek(value: unknown): PopularModelWeek | null {
  if (!isRecord(value)
    || !timestamp(value.weekStart)
    || weekStartUtc(value.weekStart) !== value.weekStart
    || !text(value.benchmarkRevision)
    || !text(value.sourceSnapshotId)
    || !text(value.methodologyVersion)
    || !timestamp(value.generatedAt)) return null;
  return {
    weekStart: value.weekStart as string,
    benchmarkRevision: value.benchmarkRevision as string,
    sourceSnapshotId: value.sourceSnapshotId as string,
    methodologyVersion: value.methodologyVersion as string,
    generatedAt: value.generatedAt as string,
  };
}

function parseEntry(value: unknown): ModelDirectoryEntry | null {
  if (!isRecord(value)) return null;
  const directory = parseModelDirectoryRecord(value);
  // `categories` is an additive producer field. Accept the currently published
  // directory shape while still validating every category once the producer
  // starts emitting the full vector.
  const categories = value.categories === undefined ? [] : parseCategories(value.categories);
  if (!directory
    || !(value.weeklyRank === null || (Number.isSafeInteger(value.weeklyRank) && (value.weeklyRank as number) >= 1 && (value.weeklyRank as number) <= 100))
    || !nullableFinite(value.overallScore)
    || !nullablePositiveInteger(value.overallRank)
    || categories === null
    || !(value.strongestCategory === null || parseCategory(value.strongestCategory) !== null)
    || !(value.representativePrice === null || parsePriceRoute(value.representativePrice) !== null)
    || !evidenceStatus(value.evidenceStatus)
    || !text(value.profileRevision)
    || (value.profileFallback !== 'none' && value.profileFallback !== 'prior-profile')
    || !(value.profilePublishedAt === null || timestamp(value.profilePublishedAt))
    || !timestamp(value.profileCheckedAt)) return null;
  return {
    ...directory,
    weeklyRank: value.weeklyRank as number | null,
    overallScore: value.overallScore as number | null,
    preferenceRating: nullableFinite(value.preferenceRating) ? value.preferenceRating as number | null : null,
    overallRank: value.overallRank as number | null,
    categories,
    strongestCategory: value.strongestCategory === null ? null : parseCategory(value.strongestCategory)!,
    representativePrice: value.representativePrice === null ? null : parsePriceRoute(value.representativePrice)!,
    evidenceStatus: value.evidenceStatus,
    profileRevision: value.profileRevision,
    profileFallback: value.profileFallback,
    profilePublishedAt: value.profilePublishedAt as string | null,
    profileCheckedAt: value.profileCheckedAt,
  };
}

/** Validates the complete SSR-to-browser directory boundary. */
export function parseModelDirectoryEnvelope(value: unknown): ModelDirectoryEnvelope | null {
  if (!isRecord(value)
    || !text(value.revision)
    || !timestamp(value.publishedAt)
    || !isRecord(value.freshness)
    || (value.freshness.status !== 'fresh' && value.freshness.status !== 'stale')
    || !timestamp(value.freshness.checkedAt)
    || (value.freshness.message !== undefined && !text(value.freshness.message))
    || !Array.isArray(value.attribution)
    || !value.attribution.every((item) => isRecord(item)
      && sourceId(item.sourceId)
      && text(item.label)
      && httpsUrl(item.url)
      && timestamp(item.updatedAt))
    || !isRecord(value.data)
    || !(value.data.week === null || parseWeek(value.data.week) !== null)
    || !Array.isArray(value.data.models)
    || value.data.models.length > 100
    || !value.data.models.every((item) => parseEntry(item) !== null)
    || !(value.data.nextCursor === null || (text(value.data.nextCursor) && /^[A-Za-z0-9_-]+$/.test(value.data.nextCursor)))) return null;

  const week = value.data.week === null ? null : parseWeek(value.data.week)!;
  const models = value.data.models.map((item) => parseEntry(item)!);
  return {
    revision: value.revision as string,
    publishedAt: value.publishedAt as string,
    freshness: {
      status: value.freshness.status as 'fresh' | 'stale',
      checkedAt: value.freshness.checkedAt as string,
      ...(value.freshness.message === undefined ? {} : { message: value.freshness.message as string }),
    },
    attribution: value.attribution.map((item) => ({
      sourceId: item.sourceId as BenchmarkSourceId,
      label: item.label as string,
      url: item.url as string,
      updatedAt: item.updatedAt as string,
    })),
    data: {
      week,
      models,
      nextCursor: value.data.nextCursor as string | null,
      ...(parseCohort(value.data.cohort) ? { cohort: parseCohort(value.data.cohort)! } : {}),
    },
  };
}
