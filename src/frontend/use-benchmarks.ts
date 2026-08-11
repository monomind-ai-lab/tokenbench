import { useCallback, useEffect, useRef, useState } from 'react';
import { activeBenchAlignSourceMetadata, type BenchAlignSourceMetadata } from '../benchmarks/benchalign-metadata';
import { isValidLeaderboardCursor } from '../benchmarks/leaderboard-cursor';
import { LEADERBOARD_DEFINITIONS, type LeaderboardDefinition, type LeaderboardEntry, type LeaderboardResult, type LeaderboardSort } from '../benchmarks/leaderboards';
import {
  LEADERBOARD_EVIDENCE_STATUSES,
  LEADERBOARD_SORT_ORDER,
  LEADERBOARD_SOURCE_TYPES,
  leaderboardQueryToSearchParams,
  type LeaderboardQueryCapabilities,
  type LeaderboardQueryState,
} from '../benchmarks/leaderboard-query';
import { BENCHMARK_SOURCE_IDS, isComparisonPairRouteSafe, type BenchmarkSourceId } from '../benchmarks/contracts';
import type { RepresentativeComparison, RepresentativeComparisonMetric } from '../benchmarks/api-projections';
import {
  DECISION_PICK_CATEGORIES,
  type DecisionPickEntry,
  type DecisionPickGroup,
  type HomeDecisionSnapshot,
  type HomeDecisionSlot,
  type HomeRepresentativeRate,
  type PricePerformancePoint,
} from '../benchmarks/decision-picks';
import { blendedCostPerMillion, type WorkloadProfile } from '../benchmarks/value';
import { LEADERBOARD_ROUTES, type LeaderboardKey } from '../routing/routes';

export interface BenchmarkFreshness {
  readonly status: 'fresh' | 'stale';
  readonly checkedAt: string;
  readonly message?: string;
}

export interface BenchmarkAttribution {
  readonly sourceId: string;
  readonly label: string;
  readonly url: string;
  readonly updatedAt: string;
}

export interface BenchmarkSourceArtifactAvailability {
  readonly artifactId: string;
  readonly url: string;
  readonly updatedAt: string;
  readonly upstreamRevision?: string | null;
  readonly schemaVersion?: string | null;
}

export interface BenchmarkSourceAvailability {
  readonly sourceId: BenchmarkSourceId;
  readonly available: boolean;
  readonly updatedAt: string | null;
  readonly artifacts: readonly BenchmarkSourceArtifactAvailability[];
}

/** The frozen Task 9 public envelope. Frontend code never substitutes its own data. */
export interface BenchmarkApiEnvelope<T> {
  readonly revision: string;
  readonly publishedAt: string;
  readonly freshness: BenchmarkFreshness;
  readonly attribution: readonly BenchmarkAttribution[];
  readonly data: T;
}

export type BenchmarkPhase = 'loading' | 'ready' | 'stale' | 'unavailable' | 'error';

export interface BenchmarkLeaderboardState {
  readonly phase: BenchmarkPhase;
  readonly envelope: BenchmarkApiEnvelope<LeaderboardPageResult> | null;
  readonly error: string | null;
  readonly statusCode: number | null;
  readonly retry: () => void;
}

export interface LeaderboardPagination {
  readonly limit: number;
  readonly total: number;
  readonly nextCursor: string | null;
}

/** A bounded server page plus capabilities derived from its complete projection. */
export interface LeaderboardPageResult extends LeaderboardResult {
  readonly pagination?: LeaderboardPagination;
  readonly capabilities?: LeaderboardQueryCapabilities;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteIsoTimestamp(value: unknown): value is string {
  return isNonEmptyString(value)
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isNullableNonNegativeFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

function isNullablePositiveInteger(value: unknown): value is number | null {
  return value === null || (Number.isSafeInteger(value) && (value as number) > 0);
}

function isNullableNonEmptyString(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value);
}

function isBenchmarkSourceId(value: unknown): boolean {
  return typeof value === 'string' && (BENCHMARK_SOURCE_IDS as readonly string[]).includes(value);
}

function isEvidenceStatus(value: unknown): boolean {
  return value === 'supported' || value === 'estimated' || value === 'source_only';
}

function isLeaderboardSort(value: unknown): value is LeaderboardSort {
  return typeof value === 'string' && LEADERBOARD_SORT_ORDER.includes(value as LeaderboardSort);
}

function isSortedUniqueStrings(value: unknown, predicate: (item: string) => boolean): value is readonly string[] {
  return Array.isArray(value)
    && value.every((item) => typeof item === 'string' && predicate(item))
    && value.every((item, index) => index === 0 || value[index - 1]! < item);
}

/** Capability lists are ordered subsets of the server's published vocabulary, not alphabetized. */
function isCanonicalOrderedSubset<T extends string>(value: unknown, vocabulary: readonly T[]): value is readonly T[] {
  let previousIndex = -1;
  return Array.isArray(value) && value.every((item) => {
    if (typeof item !== 'string') return false;
    const currentIndex = vocabulary.indexOf(item as T);
    if (currentIndex < 0 || currentIndex <= previousIndex) return false;
    previousIndex = currentIndex;
    return true;
  });
}

function isLeaderboardPagination(value: unknown, expectedLimit?: number): value is LeaderboardPagination {
  if (!isRecord(value)) return false;
  return Number.isSafeInteger(value.limit)
    && (value.limit as number) >= 1
    && (value.limit as number) <= MAX_LIMIT
    && (expectedLimit === undefined || value.limit === expectedLimit)
    && Number.isSafeInteger(value.total)
    && (value.total as number) >= 0
    && (value.total as number) <= 4_096
    && (value.nextCursor === null || isValidLeaderboardCursor(value.nextCursor));
}

function isStrictlyIncreasingNonNegativeNumbers(value: unknown): value is readonly number[] {
  return Array.isArray(value) && value.every((item, index) => (
    typeof item === 'number'
      && Number.isFinite(item)
      && item >= 0
      && (index === 0 || item > value[index - 1]!)
  ));
}

function isLeaderboardCapabilities(value: unknown, key: LeaderboardKey): value is LeaderboardQueryCapabilities {
  if (!isRecord(value)) return false;
  const definition = LEADERBOARD_DEFINITIONS[key];
  const supportsProfile = definition.kind === 'value' || definition.kind === 'pricing-context';
  const supportsEstimated = ('sourceId' in definition && definition.sourceId === 'benchlm') || definition.kind === 'multimodal';
  const priceMode = supportsProfile ? 'profile' : 'representative';
  const sourceTypes = value.sourceTypes;
  const evidenceStatuses = value.evidenceStatuses;
  const priceValues = value.priceValues;
  return value.dataReady === true
    && value.defaultProfile === 'balanced'
    && value.defaultSort === definition.defaultSort
    && value.supportsProfile === supportsProfile
    && value.supportsEstimated === supportsEstimated
    && value.supportsLifecycle === false
    && value.priceMode === priceMode
    && typeof value.supportsPrice === 'boolean'
    && isStrictlyIncreasingNonNegativeNumbers(priceValues)
    && value.supportsPrice === (priceValues.length > 0)
    && Array.isArray(value.metricKeys)
    && value.metricKeys.length === definition.metricKeys.length
    && value.metricKeys.every((metric, index) => metric === definition.metricKeys[index])
    && isCanonicalOrderedSubset(value.sorts, LEADERBOARD_SORT_ORDER)
    && value.sorts.includes(definition.defaultSort)
    && (value.providers === null || isSortedUniqueStrings(value.providers, (provider) => provider.trim().length > 0 && provider.length <= 120))
    && (sourceTypes === null || isCanonicalOrderedSubset(sourceTypes, LEADERBOARD_SOURCE_TYPES))
    && (evidenceStatuses === null || isCanonicalOrderedSubset(evidenceStatuses, LEADERBOARD_EVIDENCE_STATUSES));
}

function isLeaderboardDefinition(value: unknown): value is LeaderboardDefinition {
  if (!isRecord(value)) return false;
  return (value.kind === 'benchlm' || value.kind === 'lmarena' || value.kind === 'value' || value.kind === 'pricing-context' || value.kind === 'multimodal')
    && Array.isArray(value.metricKeys)
    && value.metricKeys.every(isNonEmptyString)
    && isLeaderboardSort(value.defaultSort)
    && (value.sourceId === undefined || isBenchmarkSourceId(value.sourceId));
}

/** Reject a syntactically valid definition if it belongs to a different route. */
function isExpectedLeaderboardDefinition(value: unknown, key: LeaderboardKey): value is LeaderboardDefinition {
  if (!isLeaderboardDefinition(value)) return false;
  const expected: LeaderboardDefinition = LEADERBOARD_DEFINITIONS[key];
  return value.kind === expected.kind
    && value.sourceId === expected.sourceId
    && value.defaultSort === expected.defaultSort
    && value.metricKeys.length === expected.metricKeys.length
    && value.metricKeys.every((metricKey, index) => metricKey === expected.metricKeys[index]);
}

function isModel(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return ['modelKey', 'slug', 'name', 'creator', 'sourceModelId', 'sourceArtifactId']
    .every((key) => isNonEmptyString(value[key]))
    && isEvidenceStatus(value.evidenceStatus)
    && typeof value.rankingEligible === 'boolean'
    && isBenchmarkSourceId(value.sourceId);
}

function isMetric(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return ['modelKey', 'metricKey', 'category', 'sourceModelId', 'sourceArtifactId']
    .every((key) => isNonEmptyString(value[key]))
    && isFiniteIsoTimestamp(value.sourceUpdatedAt)
    && typeof value.value === 'number'
    && Number.isFinite(value.value)
    && isNullablePositiveInteger(value.rank)
    && (value.unit === 'score' || value.unit === 'arena_score' || value.unit === 'rank' || value.unit === 'usd_per_million_tokens' || value.unit === 'tokens')
    && isBenchmarkSourceId(value.sourceId)
    && (value.methodology === 'benchlm_raw_composite' || value.methodology === 'bradley_terry' || value.methodology === 'ips');
}

function isPrice(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return ['modelKey', 'providerId', 'routeId', 'sourceModelId', 'sourceArtifactId']
    .every((key) => isNonEmptyString(value[key]))
    && isBenchmarkSourceId(value.sourceId)
    && (value.verificationStatus === 'primary' || value.verificationStatus === 'corroborating' || value.verificationStatus === 'conflict')
    && isNullableNonNegativeFiniteNumber(value.inputUsdPerMillion)
    && isNullableNonNegativeFiniteNumber(value.cachedInputUsdPerMillion)
    && isNullableNonNegativeFiniteNumber(value.outputUsdPerMillion)
    && isNullablePositiveInteger(value.contextWindowTokens);
}

function isLeaderboardEntry(value: unknown): value is LeaderboardEntry {
  if (!isRecord(value)) return false;
  return isModel(value.model)
    && (value.metric === null || isMetric(value.metric))
    && Array.isArray(value.metrics)
    && value.metrics.every(isMetric)
    && (value.primaryPrice === null || isPrice(value.primaryPrice))
    && isNullableFiniteNumber(value.blendedCostPerMillion)
    && isNullablePositiveInteger(value.contextWindowTokens)
    && isNullablePositiveInteger(value.sourceRank)
    && typeof value.onValueFrontier === 'boolean';
}

function isBenchLmRouteMetric(metric: NonNullable<LeaderboardEntry['metric']>): boolean {
  return metric.metricKey.startsWith('benchlm:')
    && metric.sourceId === 'benchlm'
    && metric.methodology === 'benchlm_raw_composite'
    && metric.unit === 'score';
}

function isLmArenaRouteMetric(metric: NonNullable<LeaderboardEntry['metric']>): boolean {
  return metric.metricKey.startsWith('lmarena:')
    && metric.sourceId === 'lmarena'
    && metric.methodology === 'bradley_terry'
    && metric.unit === 'arena_score';
}

function isMetricForDefinition(
  metric: NonNullable<LeaderboardEntry['metric']>,
  definition: LeaderboardDefinition,
): boolean {
  if (!definition.metricKeys.includes(metric.metricKey)) return false;
  switch (definition.kind) {
    case 'benchlm':
    case 'value':
      return isBenchLmRouteMetric(metric);
    case 'lmarena':
      return isLmArenaRouteMetric(metric);
    case 'multimodal':
      return isBenchLmRouteMetric(metric) || isLmArenaRouteMetric(metric);
    case 'pricing-context':
      return false;
  }
}

function isMetricForEntryDefinition(
  entry: LeaderboardEntry,
  metric: NonNullable<LeaderboardEntry['metric']>,
  definition: LeaderboardDefinition,
): boolean {
  if (!isMetricForDefinition(metric, definition)) return false;
  if (metric.sourceId === 'benchlm') {
    if (entry.model.sourceId !== 'benchlm') return false;
    if (entry.model.evidenceStatus === 'estimated') return true;
    const isEvidenceLens = metric.metricKey === 'benchlm:category:reasoning'
      || metric.metricKey === 'benchlm:category:knowledge';
    return entry.model.evidenceStatus === 'supported'
      && (metric.rankingEligible === true || (isEvidenceLens && metric.rank === null))
      && (metric.metricKey !== 'benchlm:overall:raw' || entry.model.rankingEligible === true);
  }
  return metric.sourceId === 'lmarena'
    && entry.model.evidenceStatus !== 'estimated'
    && (entry.model.evidenceStatus !== 'source_only' || entry.model.sourceId === 'lmarena')
    && metric.rankingEligible === true
    && Number.isSafeInteger(metric.rank)
    && (metric.rank as number) > 0;
}

function isSameMetric(
  left: NonNullable<LeaderboardEntry['metric']>,
  right: NonNullable<LeaderboardEntry['metric']>,
): boolean {
  return left.modelKey === right.modelKey
    && left.metricKey === right.metricKey
    && left.category === right.category
    && left.value === right.value
    && left.rank === right.rank
    && left.lower === right.lower
    && left.upper === right.upper
    && left.voteCount === right.voteCount
    && left.unit === right.unit
    && left.sourceId === right.sourceId
    && left.sourceUpdatedAt === right.sourceUpdatedAt
    && left.sourceModelId === right.sourceModelId
    && left.sourceArtifactId === right.sourceArtifactId
    && left.rankingEligible === right.rankingEligible
    && left.methodology === right.methodology
    && left.observationCount === right.observationCount
    && left.sessionCount === right.sessionCount;
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isNearlyEqual(left: number, right: number): boolean {
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= Number.EPSILON * 8 * scale;
}

function validSelectedPriceContext(value: number | null): number | null {
  return Number.isSafeInteger(value) && (value as number) > 0 ? value : null;
}

function hasModelMatchedPrimaryOpenRouterPrice(
  entry: LeaderboardEntry,
  profile: WorkloadProfile,
): boolean {
  const price = entry.primaryPrice;
  if (price === null
    || price.modelKey !== entry.model.modelKey
    || price.sourceId !== 'openrouter'
    || price.verificationStatus !== 'primary'
    || !isNonNegativeFiniteNumber(price.inputUsdPerMillion)
    || !isNonNegativeFiniteNumber(price.outputUsdPerMillion)
    || !isNonNegativeFiniteNumber(entry.blendedCostPerMillion)) return false;
  const expectedCost = blendedCostPerMillion(price.inputUsdPerMillion, price.outputUsdPerMillion, profile);
  return isNearlyEqual(entry.blendedCostPerMillion, expectedCost)
    && entry.contextWindowTokens === validSelectedPriceContext(price.contextWindowTokens);
}

function hasNoDisplayedPrice(entry: LeaderboardEntry): boolean {
  return entry.primaryPrice === null && entry.blendedCostPerMillion === null;
}

function hasOptionalRepresentativePrice(entry: LeaderboardEntry): boolean {
  if (hasNoDisplayedPrice(entry)) return true;
  const price = entry.primaryPrice;
  if (price === null
    || price.modelKey !== entry.model.modelKey
    || price.sourceId !== 'openrouter'
    || price.verificationStatus !== 'primary'
    || !isNonNegativeFiniteNumber(price.inputUsdPerMillion)
    || !isNonNegativeFiniteNumber(price.outputUsdPerMillion)
    || !isNonNegativeFiniteNumber(entry.blendedCostPerMillion)) return false;
  const expectedCost = (price.inputUsdPerMillion + price.outputUsdPerMillion) / 2;
  return isNearlyEqual(entry.blendedCostPerMillion, expectedCost)
    && entry.contextWindowTokens === validSelectedPriceContext(price.contextWindowTokens);
}

function hasRouteKindEntryInvariants(
  entry: LeaderboardEntry,
  definition: LeaderboardDefinition,
  profile: WorkloadProfile,
): boolean {
  switch (definition.kind) {
    case 'pricing-context':
      return entry.model.evidenceStatus !== 'estimated'
        && !(entry.model.evidenceStatus === 'source_only' && entry.model.sourceId === 'lmarena')
        && entry.metric === null
        && entry.metrics.length === 0
        && hasModelMatchedPrimaryOpenRouterPrice(entry, profile)
        && entry.sourceRank === null
        && !entry.onValueFrontier;
    case 'value':
      if (entry.model.evidenceStatus === 'estimated') return true;
      return hasModelMatchedPrimaryOpenRouterPrice(entry, profile)
        && entry.sourceRank === null;
    case 'benchlm':
      return hasOptionalRepresentativePrice(entry)
        && !entry.onValueFrontier;
    case 'lmarena':
    case 'multimodal':
      return hasOptionalRepresentativePrice(entry) && !entry.onValueFrontier;
  }
}

function hasConsistentSourceRank(entry: LeaderboardEntry, definition: LeaderboardDefinition): boolean {
  if (definition.kind === 'value' || definition.kind === 'pricing-context' || entry.model.evidenceStatus === 'estimated') {
    return entry.sourceRank === null;
  }
  return entry.metric !== null && entry.sourceRank === entry.metric.rank;
}

function isEntryForDefinition(
  entry: LeaderboardEntry,
  definition: LeaderboardDefinition,
  profile: WorkloadProfile,
): boolean {
  if (!hasRouteKindEntryInvariants(entry, definition, profile)) return false;
  if (definition.kind === 'pricing-context') return true;
  if (entry.metric === null || entry.metric.modelKey !== entry.model.modelKey || !isMetricForEntryDefinition(entry, entry.metric, definition)) return false;
  if (!hasConsistentSourceRank(entry, definition)) return false;
  if (entry.metrics.length === 0 || !isSameMetric(entry.metric, entry.metrics[0])) return false;
  const metricKeys = new Set<string>();
  return entry.metrics.every((metric) => {
    if (metricKeys.has(metric.metricKey)) return false;
    metricKeys.add(metric.metricKey);
    return metric.modelKey === entry.model.modelKey && isMetricForEntryDefinition(entry, metric, definition);
  });
}

function isFreshness(value: unknown): value is BenchmarkFreshness {
  return isRecord(value)
    && (value.status === 'fresh' || value.status === 'stale')
    && isFiniteIsoTimestamp(value.checkedAt)
    && (value.message === undefined || isNonEmptyString(value.message));
}

function isAttribution(value: unknown): value is BenchmarkAttribution {
  if (!isRecord(value) || !isBenchmarkSourceId(value.sourceId)) return false;
  if (!isNonEmptyString(value.label) || !isNonEmptyString(value.url) || !isFiniteIsoTimestamp(value.updatedAt)) return false;
  try {
    return new URL(value.url as string).protocol === 'https:';
  } catch {
    return false;
  }
}

function isSourceArtifactAvailability(value: unknown): value is BenchmarkSourceArtifactAvailability {
  if (!isRecord(value)
    || !isNonEmptyString(value.artifactId)
    || !isNonEmptyString(value.url)
    || !isFiniteIsoTimestamp(value.updatedAt)
    || (value.upstreamRevision !== undefined && !isNullableNonEmptyString(value.upstreamRevision))
    || (value.schemaVersion !== undefined && !isNullableNonEmptyString(value.schemaVersion))) return false;
  try {
    return new URL(value.url).protocol === 'https:';
  } catch {
    return false;
  }
}

function isSourceAvailability(value: unknown, sourceId: BenchmarkSourceId): value is BenchmarkSourceAvailability {
  if (!isRecord(value)
    || value.sourceId !== sourceId
    || typeof value.available !== 'boolean'
    || !Array.isArray(value.artifacts)
    || !value.artifacts.every(isSourceArtifactAvailability)
    || (value.updatedAt !== null && !isFiniteIsoTimestamp(value.updatedAt))) return false;
  return value.available === (value.artifacts.length > 0);
}

function isSourceAvailabilityCollection(value: unknown): value is readonly BenchmarkSourceAvailability[] {
  return Array.isArray(value)
    && value.length === BENCHMARK_SOURCE_IDS.length
    && value.every((source, index) => isSourceAvailability(source, BENCHMARK_SOURCE_IDS[index]));
}

function hasApplicableAttribution(
  attribution: readonly BenchmarkAttribution[],
  definition: LeaderboardDefinition,
  entries: readonly LeaderboardEntry[],
): boolean {
  const displayedSources = new Set<string>();
  if (definition.sourceId !== undefined) displayedSources.add(definition.sourceId);
  for (const entry of entries) {
    if (entry.metric !== null) displayedSources.add(entry.metric.sourceId);
    for (const metric of entry.metrics) displayedSources.add(metric.sourceId);
    if (entry.primaryPrice !== null) displayedSources.add(entry.primaryPrice.sourceId);
  }
  if (displayedSources.size > 0) {
    return [...displayedSources].every((sourceId) => attribution.some((source) => source.sourceId === sourceId));
  }

  return definition.kind === 'multimodal'
    && attribution.some((source) => source.sourceId === 'benchlm' || source.sourceId === 'lmarena');
}

/** Estimated rows are a reviewed Task 9 extension only for BenchLM-backed routes. */
export function supportsEstimatedModels(key: LeaderboardKey): boolean {
  const definition = LEADERBOARD_DEFINITIONS[key];
  const sourceId = 'sourceId' in definition ? definition.sourceId : undefined;
  const metricKeys: readonly string[] = definition.metricKeys;
  return sourceId === 'benchlm' || metricKeys.some((metricKey) => metricKey.startsWith('benchlm:'));
}

function isSafeEstimatedEntry(entry: LeaderboardEntry): boolean {
  return entry.model.evidenceStatus === 'estimated'
    && entry.model.sourceId === 'benchlm'
    && entry.model.rankingEligible === false
    && entry.sourceRank === null
    && entry.primaryPrice === null
    && entry.blendedCostPerMillion === null
    && !entry.onValueFrontier
    && entry.metric?.sourceId === 'benchlm'
    && entry.metric.rankingEligible === false
    && entry.metric.rank === null
    && entry.metrics.every((metric) => metric.sourceId === 'benchlm'
      && metric.rankingEligible === false
      && metric.rank === null);
}

function hasSafeEstimatedSection(entries: readonly LeaderboardEntry[], includeEstimated: boolean): boolean {
  let estimatesStarted = false;
  let previousSlug = '';
  for (const entry of entries) {
    if (entry.model.evidenceStatus !== 'estimated') {
      if (estimatesStarted) return false;
      continue;
    }
    if (!includeEstimated || !isSafeEstimatedEntry(entry) || entry.model.slug <= previousSlug) return false;
    estimatesStarted = true;
    previousSlug = entry.model.slug;
  }
  return true;
}

function isLeaderboardEnvelope(
  value: unknown,
  key: LeaderboardKey,
  profile: WorkloadProfile,
  includeEstimated: boolean,
  expectedLimit: number,
  requireCompletePage: boolean,
): value is BenchmarkApiEnvelope<LeaderboardPageResult> {
  if (!isRecord(value) || !isNonEmptyString(value.revision) || !isFiniteIsoTimestamp(value.publishedAt)) return false;
  if (!isFreshness(value.freshness) || !Array.isArray(value.attribution) || value.attribution.length === 0 || !value.attribution.every(isAttribution)) return false;
  if (!isRecord(value.data)) return false;
  if (value.data.key !== key || value.data.profile !== profile || !isExpectedLeaderboardDefinition(value.data.definition, key)) return false;
  if (!Array.isArray(value.data.entries) || !value.data.entries.every(isLeaderboardEntry)) return false;
  if (value.data.pagination !== undefined && !isLeaderboardPagination(value.data.pagination, expectedLimit)) return false;
  if (value.data.capabilities !== undefined && !isLeaderboardCapabilities(value.data.capabilities, key)) return false;
  const entries = value.data.entries as readonly LeaderboardEntry[];
  const pagination = value.data.pagination as LeaderboardPagination | undefined;
  const attribution = value.attribution as readonly BenchmarkAttribution[];
  const definition = LEADERBOARD_DEFINITIONS[key];
  return (!requireCompletePage || (pagination !== undefined && value.data.capabilities !== undefined))
    && (!pagination || (entries.length <= pagination.limit && entries.length <= pagination.total))
    && entries.every((entry) => isEntryForDefinition(entry, definition, profile))
    && hasApplicableAttribution(attribution, definition, entries)
    && hasSafeEstimatedSection(entries, includeEstimated);
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)));
}

/** Builds only a same-origin Task 9 API request; no upstream source URL is ever accepted. */
export function leaderboardEndpoint(
  key: LeaderboardKey,
  profile: WorkloadProfile = 'balanced',
  limit = DEFAULT_LIMIT,
  cursor?: string,
  includeEstimated = false,
  filters?: LeaderboardQueryState,
): string {
  const query = filters
    ? leaderboardQueryToSearchParams({
      ...filters,
      profile,
      includeEstimated: includeEstimated && supportsEstimatedModels(key),
    })
    : new URLSearchParams({ profile });
  query.set('limit', String(normalizeLimit(limit)));
  if (cursor && cursor.trim().length > 0) query.set('cursor', cursor);
  if (!filters && includeEstimated && supportsEstimatedModels(key)) query.set('includeEstimated', '1');
  return `/api/benchmarks/leaderboards/${encodeURIComponent(key)}?${query.toString()}`;
}

function unavailableState(message: string, statusCode: number | null = null): Omit<BenchmarkLeaderboardState, 'retry'> {
  return { phase: 'unavailable', envelope: null, error: message, statusCode };
}

/**
 * Reads one active published revision from Task 9. A stale revision remains
 * available to the UI as an explicitly stale last-known-good snapshot.
 */
export function useBenchmarkLeaderboard(
  key: LeaderboardKey,
  profile: WorkloadProfile = 'balanced',
  limit = DEFAULT_LIMIT,
  cursor?: string,
  includeEstimated = false,
  filters?: LeaderboardQueryState,
): BenchmarkLeaderboardState {
  const [state, setState] = useState<Omit<BenchmarkLeaderboardState, 'retry'>>({
    phase: 'loading',
    envelope: null,
    error: null,
    statusCode: null,
  });
  const [retryVersion, setRetryVersion] = useState(0);
  const requestVersion = useRef(0);
  const retry = useCallback(() => setRetryVersion((version) => version + 1), []);
  const normalizedLimit = normalizeLimit(limit);
  const requestIncludesEstimated = includeEstimated && supportsEstimatedModels(key);
  const endpoint = leaderboardEndpoint(
    key,
    profile,
    normalizedLimit,
    cursor,
    requestIncludesEstimated,
    filters,
  );
  const requireCompletePage = filters !== undefined;

  useEffect(() => {
    const controller = new AbortController();
    const version = ++requestVersion.current;
    let active = true;
    setState({ phase: 'loading', envelope: null, error: null, statusCode: null });

    const load = async () => {
      let statusCode: number | null = null;
      try {
        const response = await fetch(endpoint, {
          headers: { accept: 'application/json' },
          signal: controller.signal,
        });
        if (!active || controller.signal.aborted || requestVersion.current !== version) return;
        statusCode = response.status;

        if (response.status === 404 || response.status === 503) {
          setState(unavailableState('Published benchmark data is unavailable.', response.status));
          return;
        }
        if (!response.ok) {
          throw new Error(`Benchmark request failed (${response.status}).`);
        }

        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          setState(unavailableState('Published benchmark data is unavailable.'));
          return;
        }
        if (!active || controller.signal.aborted || requestVersion.current !== version) return;
        if (!isLeaderboardEnvelope(
          payload,
          key,
          profile,
          requestIncludesEstimated,
          normalizedLimit,
          requireCompletePage,
        )) {
          setState(unavailableState('Published benchmark data is unavailable.'));
          return;
        }

        setState({
          phase: payload.freshness.status === 'fresh' ? 'ready' : 'stale',
          envelope: payload,
          error: payload.freshness.status === 'stale'
            ? payload.freshness.message ?? 'Published benchmark data is stale.'
            : null,
          statusCode: null,
        });
      } catch (error: unknown) {
        if (!active || controller.signal.aborted || requestVersion.current !== version) return;
        setState({
          phase: 'error',
          envelope: null,
          error: error instanceof Error ? error.message : 'Benchmark request failed.',
          statusCode,
        });
      }
    };

    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [endpoint, key, normalizedLimit, profile, requestIncludesEstimated, requireCompletePage, retryVersion]);

  return { ...state, retry };
}

export interface BenchmarkSummaryData {
  readonly sources?: readonly BenchmarkSourceAvailability[];
  readonly representativeComparisons: readonly RepresentativeComparison[];
  readonly decisionPicks: readonly DecisionPickGroup[];
  readonly homeDecisionSnapshot: HomeDecisionSnapshot;
}

interface BenchmarkSummaryState {
  readonly phase: BenchmarkPhase;
  readonly envelope: BenchmarkApiEnvelope<BenchmarkSummaryData> | null;
  readonly error: string | null;
  readonly retry: () => void;
}

export interface DecisionPicksState extends BenchmarkSummaryState {
  readonly decisionPicks: readonly DecisionPickGroup[] | null;
}

export interface HomeDecisionSnapshotState extends BenchmarkSummaryState {
  readonly homeDecisionSnapshot: HomeDecisionSnapshot | null;
}

function isDecisionPickEntry(value: unknown, key: LeaderboardKey): value is DecisionPickEntry {
  if (!isRecord(value)) return false;
  // rank is the published source rank (or null when the source does not rank
  // the row); it is never a synthesized filtered position.
  if (value.rank !== null && !(Number.isSafeInteger(value.rank) && (value.rank as number) > 0)) return false;
  return ['modelKey', 'slug', 'name', 'provider', 'unit', 'updatedAt', 'routePath'].every((field) => isNonEmptyString(value[field]))
    && typeof value.score === 'number'
    && Number.isFinite(value.score)
    && value.evidenceStatus === 'supported'
    && isFiniteIsoTimestamp(value.updatedAt)
    && value.routePath === LEADERBOARD_ROUTES[key].pathname
    && isNullableNonNegativeFiniteNumber(value.representativePriceUsdPerMillion)
    && isNullablePositiveInteger(value.contextWindowTokens);
}

function isDecisionPickGroup(value: unknown, expected: typeof DECISION_PICK_CATEGORIES[number]): value is DecisionPickGroup {
  if (!isRecord(value)
    || value.key !== expected.key
    || value.label !== expected.label
    || value.status !== expected.status
    || !Array.isArray(value.entries)
    || value.entries.length > 3) return false;
  const modelKeys = new Set<string>();
  return value.entries.every((entry) => {
    if (!isDecisionPickEntry(entry, expected.key) || modelKeys.has(entry.modelKey)) return false;
    modelKeys.add(entry.modelKey);
    return true;
  });
}

function isReadyOrUnavailable<T>(
  value: unknown,
  isReadyValue: (candidate: unknown) => candidate is T,
): value is HomeDecisionSlot<T> {
  if (!isRecord(value)) return false;
  if (value.status === 'unavailable') return true;
  return value.status === 'ready'
    && isReadyValue(value.value)
    && isFiniteIsoTimestamp(value.updatedAt);
}

function isHomeRepresentativeRate(value: unknown): value is HomeRepresentativeRate {
  if (!isRecord(value)) return false;
  return ['modelKey', 'slug', 'name', 'provider', 'routePath'].every((field) => isNonEmptyString(value[field]))
    && value.evidenceStatus === 'supported'
    && isNonNegativeFiniteNumber(value.representativePriceUsdPerMillion)
    && isNullablePositiveInteger(value.contextWindowTokens)
    && value.routePath === LEADERBOARD_ROUTES['llm-pricing-context'].pathname;
}

function isPricePerformancePoint(value: unknown): value is PricePerformancePoint {
  if (!isRecord(value)) return false;
  return ['modelKey', 'slug', 'name', 'provider', 'unit', 'updatedAt', 'routePath'].every((field) => isNonEmptyString(value[field]))
    && value.evidenceStatus === 'supported'
    && typeof value.score === 'number'
    && Number.isFinite(value.score)
    && isNonNegativeFiniteNumber(value.representativePriceUsdPerMillion)
    && isNullablePositiveInteger(value.contextWindowTokens)
    && isFiniteIsoTimestamp(value.updatedAt)
    && value.routePath === LEADERBOARD_ROUTES['llm-overall'].pathname;
}

function isHomeDecisionSnapshot(value: unknown): value is HomeDecisionSnapshot {
  if (!isRecord(value)
    || !isReadyOrUnavailable(value.benchAlignLeader, (candidate): candidate is DecisionPickEntry => isDecisionPickEntry(candidate, 'llm-overall'))
    || !isReadyOrUnavailable(value.valueFrontierLeader, (candidate): candidate is DecisionPickEntry => isDecisionPickEntry(candidate, 'llm-value'))
    || !isReadyOrUnavailable(value.lowestVerifiedRepresentativeRate, isHomeRepresentativeRate)
    || !Array.isArray(value.pricePerformancePoints)
    || !value.pricePerformancePoints.every(isPricePerformancePoint)) return false;
  const modelKeys = new Set<string>();
  return value.pricePerformancePoints.every((point) => {
    if (modelKeys.has(point.modelKey)) return false;
    modelKeys.add(point.modelKey);
    return true;
  });
}

function isRepresentativeComparisonMetric(
  value: unknown,
  modelASlug: string,
  modelBSlug: string,
): value is RepresentativeComparisonMetric {
  if (!isRecord(value)
    || !isNonEmptyString(value.metricKey)
    || !isNonEmptyString(value.category)
    || !['score', 'arena_score', 'rank', 'usd_per_million_tokens', 'tokens'].includes(String(value.unit))
    || !isNonNegativeFiniteNumber(value.gap)
    || typeof value.modelAValue !== 'number' || !Number.isFinite(value.modelAValue)
    || typeof value.modelBValue !== 'number' || !Number.isFinite(value.modelBValue)
    || (value.leaderSlug !== null && value.leaderSlug !== modelASlug && value.leaderSlug !== modelBSlug)) return false;
  const expectedGap = Math.abs(value.modelAValue - value.modelBValue);
  const expectedLeader = expectedGap === 0 ? null : value.modelAValue > value.modelBValue ? modelASlug : modelBSlug;
  return value.gap === expectedGap && value.leaderSlug === expectedLeader;
}

function isRepresentativeComparison(value: unknown): value is RepresentativeComparison {
  if (!isRecord(value)
    || !['pairSlug', 'modelASlug', 'modelBSlug', 'modelAName', 'modelBName'].every((field) => isNonEmptyString(value[field]))
    || !isComparisonPairRouteSafe(value.pairSlug as string)
    || value.pairSlug !== `${value.modelASlug}-vs-${value.modelBSlug}`
    || !Number.isSafeInteger(value.sharedMetricCount) || (value.sharedMetricCount as number) < 4
    || !Array.isArray(value.sharedMetrics)
    || value.sharedMetrics.length !== value.sharedMetricCount
    || !isNullableNonNegativeFiniteNumber(value.modelAPriceUsdPerMillion)
    || !isNullableNonNegativeFiniteNumber(value.modelBPriceUsdPerMillion)
    || !isNullablePositiveInteger(value.modelAContextWindowTokens)
    || !isNullablePositiveInteger(value.modelBContextWindowTokens)) return false;
  const modelASlug = value.modelASlug as string;
  const modelBSlug = value.modelBSlug as string;
  if (!value.sharedMetrics.every((metric) => isRepresentativeComparisonMetric(metric, modelASlug, modelBSlug))) return false;
  const metricKeys = value.sharedMetrics.map((metric) => (metric as RepresentativeComparisonMetric).metricKey);
  const hasPriceEvidence = value.modelAPriceUsdPerMillion !== null && value.modelBPriceUsdPerMillion !== null;
  const hasContextEvidence = value.modelAContextWindowTokens !== null && value.modelBContextWindowTokens !== null;
  return new Set(metricKeys).size === metricKeys.length && (hasPriceEvidence || hasContextEvidence);
}

function isRepresentativeComparisonCollection(value: unknown): value is readonly RepresentativeComparison[] {
  if (!Array.isArray(value) || value.length > 2 || !value.every(isRepresentativeComparison)) return false;
  return new Set(value.map((comparison) => comparison.pairSlug)).size === value.length;
}

function isBenchmarkSummaryEnvelope(value: unknown): value is BenchmarkApiEnvelope<BenchmarkSummaryData> {
  if (!isRecord(value)
    || !isNonEmptyString(value.revision)
    || !isFiniteIsoTimestamp(value.publishedAt)
    || !isFreshness(value.freshness)
    || !Array.isArray(value.attribution)
    || value.attribution.length === 0
    || !value.attribution.every(isAttribution)
    || !isRecord(value.data)) return false;

  const data = value.data;
  return (data.sources === undefined || isSourceAvailabilityCollection(data.sources))
    && isRepresentativeComparisonCollection(data.representativeComparisons)
    && Array.isArray(data.decisionPicks)
    && data.decisionPicks.length === DECISION_PICK_CATEGORIES.length
    && data.decisionPicks.every((group, index) => isDecisionPickGroup(group, DECISION_PICK_CATEGORIES[index]))
    && isHomeDecisionSnapshot(data.homeDecisionSnapshot);
}

function unavailableSummaryState(message: string): Omit<BenchmarkSummaryState, 'retry'> {
  return { phase: 'unavailable', envelope: null, error: message };
}

/** The only summary request used for Home and leaderboard discovery data. */
export function benchmarkSummaryEndpoint(): string {
  return '/api/benchmarks';
}

type SummaryRequestOutcome =
  | { readonly kind: 'ready'; readonly payload: BenchmarkApiEnvelope<BenchmarkSummaryData> }
  | { readonly kind: 'unavailable'; readonly message: string }
  | { readonly kind: 'error'; readonly message: string };

let inFlightSummaryRequest: Promise<SummaryRequestOutcome> | null = null;

async function requestBenchmarkSummary(): Promise<SummaryRequestOutcome> {
  try {
    const response = await fetch(benchmarkSummaryEndpoint(), {
      headers: { accept: 'application/json' },
    });
    if (response.status === 404 || response.status === 503) {
      return { kind: 'unavailable', message: 'Published benchmark data is unavailable.' };
    }
    if (!response.ok) return { kind: 'error', message: `Benchmark request failed (${response.status}).` };

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { kind: 'unavailable', message: 'Published benchmark data is unavailable.' };
    }
    if (!isBenchmarkSummaryEnvelope(payload)) {
      return { kind: 'unavailable', message: 'Published benchmark data is unavailable.' };
    }
    return { kind: 'ready', payload };
  } catch (error: unknown) {
    return {
      kind: 'error',
      message: error instanceof Error ? error.message : 'Benchmark request failed.',
    };
  }
}

function sharedBenchmarkSummaryRequest(): Promise<SummaryRequestOutcome> {
  if (inFlightSummaryRequest !== null) return inFlightSummaryRequest;
  const request = requestBenchmarkSummary();
  inFlightSummaryRequest = request;
  void request.finally(() => {
    if (inFlightSummaryRequest === request) inFlightSummaryRequest = null;
  });
  return request;
}

function useBenchmarkSummary(): BenchmarkSummaryState {
  const [state, setState] = useState<Omit<BenchmarkSummaryState, 'retry'>>({
    phase: 'loading',
    envelope: null,
    error: null,
  });
  const [retryVersion, setRetryVersion] = useState(0);
  const requestVersion = useRef(0);
  const retry = useCallback(() => setRetryVersion((version) => version + 1), []);

  useEffect(() => {
    const version = ++requestVersion.current;
    let active = true;
    setState({ phase: 'loading', envelope: null, error: null });

    const load = async () => {
      const outcome = await sharedBenchmarkSummaryRequest();
      if (!active || requestVersion.current !== version) return;
      if (outcome.kind === 'unavailable') {
        setState(unavailableSummaryState(outcome.message));
        return;
      }
      if (outcome.kind === 'error') {
        setState({ phase: 'error', envelope: null, error: outcome.message });
        return;
      }
      const payload = outcome.payload;
      setState({
        phase: payload.freshness.status === 'fresh' ? 'ready' : 'stale',
        envelope: payload,
        error: payload.freshness.status === 'stale'
          ? payload.freshness.message ?? 'Published benchmark data is stale.'
          : null,
      });
    };

    void load();
    return () => {
      active = false;
    };
  }, [retryVersion]);

  return { ...state, retry };
}

export function useDecisionPicks(): DecisionPicksState {
  const state = useBenchmarkSummary();
  return {
    ...state,
    decisionPicks: state.envelope?.data.decisionPicks ?? null,
  };
}

export function useHomeDecisionSnapshot(): HomeDecisionSnapshotState {
  const state = useBenchmarkSummary();
  return {
    ...state,
    homeDecisionSnapshot: state.envelope?.data.homeDecisionSnapshot ?? null,
  };
}

/** Reuses the bounded published-summary request; it never fetches BenchLM directly. */
export function useBenchAlignSourceMetadata(): BenchAlignSourceMetadata | null {
  const state = useBenchmarkSummary();
  return activeBenchAlignSourceMetadata(state.envelope?.data.sources);
}
