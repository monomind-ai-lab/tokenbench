import { useCallback, useEffect, useRef, useState } from 'react';
import { LEADERBOARD_DEFINITIONS, type LeaderboardDefinition, type LeaderboardEntry, type LeaderboardResult, type LeaderboardSort } from '../benchmarks/leaderboards';
import { BENCHMARK_SOURCE_IDS } from '../benchmarks/contracts';
import type { WorkloadProfile } from '../benchmarks/value';
import type { LeaderboardKey } from '../routing/routes';

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
  readonly envelope: BenchmarkApiEnvelope<LeaderboardResult> | null;
  readonly error: string | null;
  readonly retry: () => void;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
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

function isBenchmarkSourceId(value: unknown): boolean {
  return typeof value === 'string' && (BENCHMARK_SOURCE_IDS as readonly string[]).includes(value);
}

function isEvidenceStatus(value: unknown): boolean {
  return value === 'supported' || value === 'estimated' || value === 'source_only';
}

function isLeaderboardSort(value: unknown): value is LeaderboardSort {
  return value === 'score-desc'
    || value === 'rank-asc'
    || value === 'pareto-score-desc'
    || value === 'price-asc'
    || value === 'context-desc';
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
    && isBenchmarkSourceId(value.sourceId);
}

function isMetric(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return ['modelKey', 'metricKey', 'category', 'sourceUpdatedAt', 'sourceModelId', 'sourceArtifactId']
    .every((key) => isNonEmptyString(value[key]))
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

function isFreshness(value: unknown): value is BenchmarkFreshness {
  return isRecord(value)
    && (value.status === 'fresh' || value.status === 'stale')
    && isNonEmptyString(value.checkedAt)
    && (value.message === undefined || isNonEmptyString(value.message));
}

function isAttribution(value: unknown): value is BenchmarkAttribution {
  if (!isRecord(value) || !isBenchmarkSourceId(value.sourceId)) return false;
  if (!['label', 'url', 'updatedAt'].every((key) => isNonEmptyString(value[key]))) return false;
  try {
    return new URL(value.url as string).protocol === 'https:';
  } catch {
    return false;
  }
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
    && entry.sourceRank === null
    && entry.primaryPrice === null
    && entry.blendedCostPerMillion === null
    && !entry.onValueFrontier
    && entry.metric?.sourceId !== 'lmarena'
    && entry.metrics.every((metric) => metric.sourceId === 'benchlm');
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
): value is BenchmarkApiEnvelope<LeaderboardResult> {
  if (!isRecord(value) || !isNonEmptyString(value.revision) || !isNonEmptyString(value.publishedAt)) return false;
  if (!isFreshness(value.freshness) || !Array.isArray(value.attribution) || !value.attribution.every(isAttribution)) return false;
  if (!isRecord(value.data)) return false;
  return value.data.key === key
    && value.data.profile === profile
    && isExpectedLeaderboardDefinition(value.data.definition, key)
    && Array.isArray(value.data.entries)
    && value.data.entries.every(isLeaderboardEntry)
    && hasSafeEstimatedSection(value.data.entries as readonly LeaderboardEntry[], includeEstimated);
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
): string {
  const query = new URLSearchParams({ profile, limit: String(normalizeLimit(limit)) });
  if (cursor && cursor.trim().length > 0) query.set('cursor', cursor);
  if (includeEstimated && supportsEstimatedModels(key)) query.set('includeEstimated', '1');
  return `/api/benchmarks/leaderboards/${encodeURIComponent(key)}?${query.toString()}`;
}

function unavailableState(message: string): Omit<BenchmarkLeaderboardState, 'retry'> {
  return { phase: 'unavailable', envelope: null, error: message };
}

/**
 * Reads one active published revision from Task 9. A stale revision remains
 * visible to status UI but deliberately never becomes a ready leaderboard.
 */
export function useBenchmarkLeaderboard(
  key: LeaderboardKey,
  profile: WorkloadProfile = 'balanced',
  limit = DEFAULT_LIMIT,
  cursor?: string,
  includeEstimated = false,
): BenchmarkLeaderboardState {
  const [state, setState] = useState<Omit<BenchmarkLeaderboardState, 'retry'>>({
    phase: 'loading',
    envelope: null,
    error: null,
  });
  const [retryVersion, setRetryVersion] = useState(0);
  const requestVersion = useRef(0);
  const retry = useCallback(() => setRetryVersion((version) => version + 1), []);
  const normalizedLimit = normalizeLimit(limit);
  const requestIncludesEstimated = includeEstimated && supportsEstimatedModels(key);

  useEffect(() => {
    const controller = new AbortController();
    const version = ++requestVersion.current;
    let active = true;
    setState({ phase: 'loading', envelope: null, error: null });

    const load = async () => {
      try {
        const response = await fetch(leaderboardEndpoint(key, profile, normalizedLimit, cursor, requestIncludesEstimated), {
          headers: { accept: 'application/json' },
          signal: controller.signal,
        });
        if (!active || controller.signal.aborted || requestVersion.current !== version) return;

        if (response.status === 404 || response.status === 503) {
          setState(unavailableState('Published benchmark data is unavailable.'));
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
        if (!isLeaderboardEnvelope(payload, key, profile, requestIncludesEstimated)) {
          setState(unavailableState('Published benchmark data is unavailable.'));
          return;
        }

        setState({
          phase: payload.freshness.status === 'fresh' ? 'ready' : 'stale',
          envelope: payload,
          error: payload.freshness.status === 'stale'
            ? payload.freshness.message ?? 'Published benchmark data is stale.'
            : null,
        });
      } catch (error: unknown) {
        if (!active || controller.signal.aborted || requestVersion.current !== version) return;
        setState({
          phase: 'error',
          envelope: null,
          error: error instanceof Error ? error.message : 'Benchmark request failed.',
        });
      }
    };

    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [cursor, key, normalizedLimit, profile, requestIncludesEstimated, retryVersion]);

  return { ...state, retry };
}
