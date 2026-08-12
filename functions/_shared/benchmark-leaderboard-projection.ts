import {
  effectiveLeaderboardProfile,
  leaderboardEvidenceReferences,
  type CachedLeaderboardPaginationProjection,
} from '../../src/benchmarks/api-projections';
import { benchmarkLeaderboardProjectionCacheKey } from '../../src/benchmarks/api-response-cache-keys';
import {
  isCanonicalIsoTimestamp,
  isSha256Digest,
  validateBenchmarkSourceRecords,
  type BenchmarkMetric,
  type BenchmarkSourceId,
} from '../../src/benchmarks/contracts';
import {
  LEADERBOARD_DEFINITIONS,
  type LeaderboardDefinition,
  type LeaderboardEntry,
  type LeaderboardResult,
} from '../../src/benchmarks/leaderboards';
import { type LeaderboardKey } from '../../src/routing/routes';
import {
  blendedCostPerMillion,
  isPrimaryHostedRoute,
  type WorkloadProfile,
} from '../../src/benchmarks/value';
import {
  readApiResponseCache,
  readNewestCompleteApiResponseCache,
  type ApiResponseCacheDatabase,
  type MaterializedApiResponse,
} from './api-response-cache';
import {
  attributionForEvidence,
  benchmarkEnvelope,
  freshnessFor,
  type ActiveBenchmarkSnapshot,
  type BenchmarkApiEnvelope,
} from './benchmark-db';
import {
  BENCHMARK_FRESHNESS_WINDOW_MS,
  BENCHMARK_STALE_MESSAGE,
} from '../../src/ingestion/cadence';

export const BENCHMARK_LEADERBOARD_PROJECTION_FRESHNESS_WINDOW_MS = BENCHMARK_FRESHNESS_WINDOW_MS;
export const BENCHMARK_LEADERBOARD_PROJECTION_MAX_ENTRIES = 4_096;
const COMPLETE_PROJECTION_SNAPSHOT = Symbol('complete leaderboard projection snapshot');

export type CompleteLeaderboardProjectionEnvelope = BenchmarkApiEnvelope<LeaderboardResult> & {
  readonly [COMPLETE_PROJECTION_SNAPSHOT]: ActiveBenchmarkSnapshot;
};

const STALE_FRESHNESS_MESSAGE = BENCHMARK_STALE_MESSAGE;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSourceId(value: unknown): value is BenchmarkSourceId {
  return value === 'benchlm' || value === 'lmarena' || value === 'litellm' || value === 'openrouter';
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

function isNullableFinite(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isNullableNonNegative(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

function isNullablePositiveInteger(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value > 0);
}

function isNullableStringArray(value: unknown): boolean {
  return value === null || (Array.isArray(value) && value.every((item) => typeof item === 'string'));
}

function isMetricLike(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return hasNonBlankString(value.modelKey)
    && hasNonBlankString(value.metricKey)
    && hasNonBlankString(value.category)
    && typeof value.value === 'number'
    && Number.isFinite(value.value)
    && isNullablePositiveInteger(value.rank)
    && isNullableFinite(value.lower)
    && isNullableFinite(value.upper)
    && isNullableNonNegative(value.voteCount)
    && ['score', 'arena_score', 'rank', 'usd_per_million_tokens', 'tokens'].includes(value.unit as string)
    && ['benchlm_raw_composite', 'bradley_terry', 'ips'].includes(value.methodology as string)
    && isSourceId(value.sourceId)
    && isCanonicalIsoTimestamp(value.sourceUpdatedAt)
    && hasNonBlankString(value.sourceModelId)
    && typeof value.rankingEligible === 'boolean'
    && isNullableNonNegative(value.observationCount)
    && isNullableNonNegative(value.sessionCount)
    && hasNonBlankString(value.sourceArtifactId);
}

function isPriceLike(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return hasNonBlankString(value.modelKey)
    && isSourceId(value.sourceId)
    && hasNonBlankString(value.providerId)
    && isNullableNonNegative(value.inputUsdPerMillion)
    && isNullableNonNegative(value.cachedInputUsdPerMillion)
    && isNullableNonNegative(value.outputUsdPerMillion)
    && isNullablePositiveInteger(value.contextWindowTokens)
    && ['primary', 'corroborating', 'conflict'].includes(value.verificationStatus as string)
    && hasNonBlankString(value.routeId)
    && hasNonBlankString(value.sourceModelId)
    && isNullableString(value.canonicalSlug)
    && isNullablePositiveInteger(value.maxInputTokens)
    && isNullablePositiveInteger(value.maxOutputTokens)
    && isNullableStringArray(value.inputModalities)
    && isNullableStringArray(value.outputModalities)
    && isNullableStringArray(value.supportedParameters)
    && hasNonBlankString(value.sourceArtifactId);
}

function isEntryLike(value: unknown): value is LeaderboardEntry {
  if (!isRecord(value) || !isRecord(value.model)) return false;
  const model = value.model;
  if (!hasNonBlankString(model.modelKey)
    || !hasNonBlankString(model.slug)
    || !hasNonBlankString(model.name)
    || !hasNonBlankString(model.creator)
    || !['Proprietary', 'Open Weight', 'Unknown'].includes(model.sourceType as string)
    || !isNullableString(model.reasoningType)
    || !isNullableString(model.releaseDate)
    || !isNullablePositiveInteger(model.contextWindowTokens)
    || !isSourceId(model.sourceId)
    || !hasNonBlankString(model.sourceModelId)
    || !hasNonBlankString(model.sourceArtifactId)
    || !['supported', 'estimated', 'source_only'].includes(model.evidenceStatus as string)
    || typeof model.rankingEligible !== 'boolean'
    || !isNullableFinite(model.confidenceLower)
    || !isNullableFinite(model.confidenceUpper)
    || typeof model.benchmarkCount !== 'number'
    || !Number.isSafeInteger(model.benchmarkCount)
    || model.benchmarkCount < 0
    || !Array.isArray(value.metrics)
    || !value.metrics.every(isMetricLike)) return false;
  return (value.metric === null || isMetricLike(value.metric))
    && (value.primaryPrice === null || isPriceLike(value.primaryPrice))
    && isNullableNonNegative(value.blendedCostPerMillion)
    && isNullablePositiveInteger(value.contextWindowTokens)
    && isNullablePositiveInteger(value.sourceRank)
    && typeof value.onValueFrontier === 'boolean';
}

function sameDefinition(key: LeaderboardKey, value: unknown): boolean {
  if (!isRecord(value)) return false;
  const expected = LEADERBOARD_DEFINITIONS[key];
  if (value.kind !== expected.kind || value.defaultSort !== expected.defaultSort || !Array.isArray(value.metricKeys)) return false;
  if (value.metricKeys.length !== expected.metricKeys.length
    || value.metricKeys.some((metricKey, index) => metricKey !== expected.metricKeys[index])) return false;
  const expectedSourceId = 'sourceId' in expected ? expected.sourceId : undefined;
  if (value.sourceId !== expectedSourceId) return false;
  const expectedUserSortable = 'userSortable' in expected ? expected.userSortable : undefined;
  return value.userSortable === expectedUserSortable;
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isPositiveRank(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function metricMatchesRoute(
  entry: LeaderboardEntry,
  metric: BenchmarkMetric,
  definition: LeaderboardDefinition,
  estimated: boolean,
): boolean {
  if (metric.modelKey !== entry.model.modelKey || !definition.metricKeys.includes(metric.metricKey)) return false;
  if (metric.metricKey.startsWith('benchlm:')) {
    const isEvidenceLens = metric.metricKey === 'benchlm:category:reasoning'
      || metric.metricKey === 'benchlm:category:knowledge';
    return metric.sourceId === 'benchlm'
      && metric.methodology === 'benchlm_raw_composite'
      && metric.unit === 'score'
      && (estimated
        ? metric.rankingEligible === false && metric.rank === null
        : metric.rankingEligible === true || (isEvidenceLens && metric.rank === null))
      && (estimated ? metric.rank === null : true)
      && entry.model.sourceId === 'benchlm'
      && entry.model.evidenceStatus === (estimated ? 'estimated' : 'supported');
  }
  if (estimated || !metric.metricKey.startsWith('lmarena:')) return false;
  return metric.sourceId === 'lmarena'
    && metric.methodology === 'bradley_terry'
    && metric.unit === 'arena_score'
    && metric.rankingEligible === true
    && isPositiveRank(metric.rank)
    && entry.model.evidenceStatus !== 'estimated'
    && (entry.model.evidenceStatus !== 'source_only' || entry.model.sourceId === 'lmarena');
}

function normalizedContextWindow(value: number | null): number | null {
  return Number.isSafeInteger(value) && value !== null && value > 0 ? value : null;
}

function hasPriceInvariants(
  entry: LeaderboardEntry,
  definition: LeaderboardDefinition,
  profile: WorkloadProfile,
): boolean {
  const price = entry.primaryPrice;
  if (price === null) {
    return definition.kind !== 'value'
      && definition.kind !== 'pricing-context'
      && entry.blendedCostPerMillion === null
      && entry.contextWindowTokens === normalizedContextWindow(entry.model.contextWindowTokens);
  }
  if (price.modelKey !== entry.model.modelKey
    || !isPrimaryHostedRoute(price)
    || price.inputUsdPerMillion === null
    || price.outputUsdPerMillion === null) return false;
  const priceProfile = definition.kind === 'value' || definition.kind === 'pricing-context' ? profile : 'outputHeavy';
  return entry.blendedCostPerMillion === blendedCostPerMillion(
    price.inputUsdPerMillion,
    price.outputUsdPerMillion,
    priceProfile,
  ) && entry.contextWindowTokens === normalizedContextWindow(price.contextWindowTokens);
}

function hasRouteEntryInvariants(
  entry: LeaderboardEntry,
  key: LeaderboardKey,
  profile: WorkloadProfile,
): boolean {
  const definition = LEADERBOARD_DEFINITIONS[key];
  const estimated = entry.model.evidenceStatus === 'estimated';
  const metricKeys = new Set(entry.metrics.map((metric) => metric.metricKey));
  if (metricKeys.size !== entry.metrics.length
    || entry.metrics.some((metric) => !metricMatchesRoute(entry, metric, definition, estimated))) return false;
  if (estimated) {
    const supportsEstimated = ('sourceId' in definition && definition.sourceId === 'benchlm')
      || definition.kind === 'multimodal';
    return supportsEstimated
      && entry.model.rankingEligible === false
      && entry.metric !== null
      && entry.metrics.length === 1
      && sameJsonValue(entry.metric, entry.metrics[0])
      && entry.primaryPrice === null
      && entry.blendedCostPerMillion === null
      && entry.sourceRank === null
      && entry.onValueFrontier === false;
  }
  if (!hasPriceInvariants(entry, definition, profile)) return false;
  if (definition.kind === 'pricing-context') {
    return !(entry.model.evidenceStatus === 'source_only' && entry.model.sourceId === 'lmarena')
      && entry.metric === null
      && entry.metrics.length === 0
      && entry.sourceRank === null
      && entry.onValueFrontier === false;
  }
  if (entry.metric === null || entry.metrics.length === 0 || !sameJsonValue(entry.metric, entry.metrics[0])) return false;
  if (definition.kind === 'benchlm') {
    return entry.metrics.length === 1
      && metricMatchesRoute(entry, entry.metric, definition, false)
      && entry.sourceRank === entry.metric.rank
      && entry.onValueFrontier === false;
  }
  if (definition.kind === 'value') {
    return entry.metrics.length === 1
      && metricMatchesRoute(entry, entry.metric, definition, false)
      && entry.sourceRank === null;
  }
  if (definition.kind === 'lmarena') {
    return entry.metrics.length === 1
      && metricMatchesRoute(entry, entry.metric, definition, false)
      && entry.sourceRank === entry.metric.rank
      && entry.onValueFrontier === false;
  }
  return entry.sourceRank === entry.metric.rank
    && entry.onValueFrontier === false;
}

function hasSelectedEntryVariant(
  baseEntries: readonly LeaderboardEntry[],
  entries: readonly LeaderboardEntry[],
  includeEstimated: boolean,
): boolean {
  if (baseEntries.some((entry) => entry.model.evidenceStatus === 'estimated')) return false;
  if (entries.length < baseEntries.length || (!includeEstimated && entries.length !== baseEntries.length)) return false;
  if (!baseEntries.every((entry, index) => sameJsonValue(entry, entries[index]))) return false;
  const estimatedEntries = entries.slice(baseEntries.length);
  if (!estimatedEntries.every((entry) => entry.model.evidenceStatus === 'estimated')) return false;
  return estimatedEntries.every((entry, index) => {
    if (index === 0) return true;
    const previous = estimatedEntries[index - 1];
    if (previous.model.slug !== entry.model.slug) return previous.model.slug < entry.model.slug;
    return previous.model.modelKey < entry.model.modelKey;
  });
}

function hasUniqueEntryIdentities(entries: readonly LeaderboardEntry[]): boolean {
  const modelKeys = new Set<string>();
  const slugs = new Set<string>();
  for (const entry of entries) {
    if (modelKeys.has(entry.model.modelKey) || slugs.has(entry.model.slug)) return false;
    modelKeys.add(entry.model.modelKey);
    slugs.add(entry.model.slug);
  }
  return true;
}

function cacheRevisionMatchesProjection(
  cacheRevision: string,
  projectionRevision: string,
  checkedAt: string,
): boolean {
  if (cacheRevision === projectionRevision) return true;
  const checkedAtSuffix = checkedAt.replace(/[^0-9]/gu, '');
  const prefix = `${projectionRevision}+cache-${checkedAtSuffix}-`;
  return cacheRevision.startsWith(prefix)
    && /^[0-9a-z-]+$/iu.test(cacheRevision.slice(prefix.length));
}

/** Parses a complete immutable leaderboard projection and rejects cache corruption. */
export function parseCompleteLeaderboardProjection(
  body: string,
  key: LeaderboardKey,
  profile: WorkloadProfile,
  includeEstimated = false,
): CachedLeaderboardPaginationProjection {
  let value: unknown;
  try {
    value = JSON.parse(body) as unknown;
  } catch {
    throw new Error('cached leaderboard projection is invalid JSON');
  }
  if (!isRecord(value) || !isRecord(value.revision) || !isRecord(value.leaderboard)
    || !Array.isArray(value.sources) || !Array.isArray(value.entries)) {
    throw new Error('cached leaderboard projection is invalid');
  }
  if (value.entries.length > BENCHMARK_LEADERBOARD_PROJECTION_MAX_ENTRIES) {
    throw new Error('cached leaderboard projection entry count exceeds the limit');
  }
  const revision = value.revision;
  if (!hasNonBlankString(revision.revision)
    || !isCanonicalIsoTimestamp(revision.generatedAt)
    || !isCanonicalIsoTimestamp(revision.publishedAt)
    || !isCanonicalIsoTimestamp(revision.checkedAt)
    || revision.publicationState !== 'published'
    || !isSha256Digest(revision.contentHash)
    || !hasNonBlankString(revision.catalogRevision)
    || !isSha256Digest(revision.openrouterContentHash)) {
    throw new Error('cached leaderboard projection revision is invalid');
  }
  const leaderboard = value.leaderboard;
  if (Array.isArray(leaderboard.entries)
    && leaderboard.entries.length > BENCHMARK_LEADERBOARD_PROJECTION_MAX_ENTRIES) {
    throw new Error('cached leaderboard projection entry count exceeds the limit');
  }
  if (leaderboard.key !== key || leaderboard.profile !== profile || !sameDefinition(key, leaderboard.definition)
    || !Array.isArray(leaderboard.entries)
    || !leaderboard.entries.every((entry) => isEntryLike(entry) && hasRouteEntryInvariants(entry, key, profile))
    || !value.entries.every((entry) => isEntryLike(entry) && hasRouteEntryInvariants(entry, key, profile))) {
    throw new Error('cached leaderboard projection route invariants are invalid');
  }
  try {
    validateBenchmarkSourceRecords(value.sources);
  } catch {
    throw new Error('cached leaderboard projection source evidence is invalid');
  }
  if (!hasSelectedEntryVariant(
    leaderboard.entries as readonly LeaderboardEntry[],
    value.entries as readonly LeaderboardEntry[],
    includeEstimated,
  )) {
    throw new Error('cached leaderboard projection entry variant is invalid');
  }
  if (!hasUniqueEntryIdentities(value.entries as readonly LeaderboardEntry[])) {
    throw new Error('cached leaderboard projection has a duplicate leaderboard entry');
  }
  return value as unknown as CachedLeaderboardPaginationProjection;
}

/**
 * Reads the single materialized complete projection used by pagination and CSV
 * exports. It intentionally performs no active-revision or fact-table reads.
 */
export async function readCompleteLeaderboardProjection(
  db: ApiResponseCacheDatabase,
  key: LeaderboardKey,
  profile: WorkloadProfile,
  includeEstimated: boolean,
  now: number = Date.now(),
): Promise<CompleteLeaderboardProjectionEnvelope | null> {
  const effectiveProfile = effectiveLeaderboardProfile(key, profile);
  const cacheKey = benchmarkLeaderboardProjectionCacheKey({
    key,
    profile: effectiveProfile,
    includeEstimated,
  });
  let activeError: unknown;
  try {
    const active = await readApiResponseCache(
      db,
      'benchmarks',
      cacheKey,
      BENCHMARK_LEADERBOARD_PROJECTION_FRESHNESS_WINDOW_MS,
      now,
    );
    if (active) return materializeCompleteLeaderboardProjection(active, key, effectiveProfile, includeEstimated, now);
  } catch (error) {
    activeError = error;
  }

  try {
    const historical = await readNewestCompleteApiResponseCache(db, 'benchmarks', cacheKey);
    if (historical) {
      return materializeCompleteLeaderboardProjection(historical, key, effectiveProfile, includeEstimated, now);
    }
  } catch (error) {
    throw error;
  }
  if (activeError) throw activeError;
  return null;
}

function materializeCompleteLeaderboardProjection(
  cached: MaterializedApiResponse,
  key: LeaderboardKey,
  effectiveProfile: WorkloadProfile,
  includeEstimated: boolean,
  now: number,
): CompleteLeaderboardProjectionEnvelope {
  const projection = parseCompleteLeaderboardProjection(cached.body, key, effectiveProfile, includeEstimated);
  if (!cacheRevisionMatchesProjection(
    cached.revision,
    projection.revision.revision,
    projection.revision.checkedAt,
  )) {
    throw new Error('cached leaderboard projection revision does not match cache');
  }
  const snapshot: ActiveBenchmarkSnapshot = {
    revision: projection.revision,
    sources: projection.sources,
    models: [],
    metrics: [],
    priceChecks: [],
    comparisonPairs: [],
  };
  const evaluatedFreshness = freshnessFor(snapshot.revision, now);
  if (cached.freshness === 'fresh' && evaluatedFreshness.status !== 'fresh') {
    throw new Error('cached leaderboard projection freshness does not match cache');
  }
  const freshness = cached.freshness === 'stale' && evaluatedFreshness.status === 'fresh'
    ? { status: 'stale' as const, checkedAt: evaluatedFreshness.checkedAt, message: STALE_FRESHNESS_MESSAGE }
    : evaluatedFreshness;
  const leaderboard: LeaderboardResult = {
    key,
    profile: effectiveProfile,
    definition: LEADERBOARD_DEFINITIONS[key],
    entries: projection.entries,
  };
  const envelope = benchmarkEnvelope(
    snapshot,
    freshness,
    attributionForEvidence(
      snapshot,
      leaderboardEvidenceReferences(snapshot, leaderboard.definition, leaderboard.entries),
    ),
    leaderboard,
  );
  return { ...envelope, [COMPLETE_PROJECTION_SNAPSHOT]: snapshot };
}

/** Rebuilds the original page-scoped public attribution from cached source records. */
export function completeLeaderboardAttributionForEntries(
  envelope: CompleteLeaderboardProjectionEnvelope,
  entries: readonly LeaderboardEntry[],
) {
  const snapshot = envelope[COMPLETE_PROJECTION_SNAPSHOT];
  return attributionForEvidence(
    snapshot,
    leaderboardEvidenceReferences(snapshot, envelope.data.definition, entries),
  );
}
