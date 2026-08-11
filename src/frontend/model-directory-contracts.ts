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
  readonly overallRank: number | null;
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
  };
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
    || !nullableFinite(value.outputUsdPerMillion)
    || !nullablePositiveInteger(value.contextWindowTokens)
    || !nullablePositiveInteger(value.maxInputTokens)
    || !nullablePositiveInteger(value.maxOutputTokens)
    || !(value.inputModalities === null || stringArray(value.inputModalities))
    || !(value.outputModalities === null || stringArray(value.outputModalities))
    || !(value.supportedParameters === null || stringArray(value.supportedParameters))
    || typeof value.verificationStatus !== 'string'
    || !VERIFICATION_STATUSES.has(value.verificationStatus as ModelProfilePriceRoute['verificationStatus'])
    || !text(value.sourceArtifactId)
    || !httpsUrl(value.sourceUrl)
    || !timestamp(value.observedAt)) return null;
  return value as unknown as ModelProfilePriceRoute;
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
  if (!directory
    || !(value.weeklyRank === null || (Number.isSafeInteger(value.weeklyRank) && (value.weeklyRank as number) >= 1 && (value.weeklyRank as number) <= 100))
    || !nullableFinite(value.overallScore)
    || !nullablePositiveInteger(value.overallRank)
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
    overallRank: value.overallRank as number | null,
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
    data: { week, models, nextCursor: value.data.nextCursor as string | null },
  };
}
