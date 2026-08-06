import {
  effectiveLeaderboardProfile,
  leaderboardEvidenceReferences,
  type CachedLeaderboardPaginationProjection,
} from '../../src/benchmarks/api-projections';
import { benchmarkLeaderboardProjectionCacheKey } from '../../src/benchmarks/api-response-cache-keys';
import { isCanonicalIsoTimestamp, type BenchmarkSourceId } from '../../src/benchmarks/contracts';
import { LEADERBOARD_DEFINITIONS, type LeaderboardEntry, type LeaderboardResult } from '../../src/benchmarks/leaderboards';
import { type LeaderboardKey } from '../../src/routing/routes';
import { type WorkloadProfile } from '../../src/benchmarks/value';
import { readApiResponseCache, type ApiResponseCacheDatabase } from './api-response-cache';
import {
  attributionForEvidence,
  benchmarkEnvelope,
  freshnessFor,
  type ActiveBenchmarkSnapshot,
  type BenchmarkApiEnvelope,
} from './benchmark-db';

export const BENCHMARK_LEADERBOARD_PROJECTION_FRESHNESS_WINDOW_MS = 36 * 60 * 60 * 1_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSourceId(value: unknown): value is BenchmarkSourceId {
  return value === 'benchlm' || value === 'lmarena' || value === 'litellm' || value === 'openrouter';
}

function isMetricLike(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return hasNonBlankString(value.modelKey)
    && hasNonBlankString(value.metricKey)
    && typeof value.value === 'number'
    && Number.isFinite(value.value)
    && hasNonBlankString(value.unit)
    && hasNonBlankString(value.methodology)
    && isSourceId(value.sourceId)
    && hasNonBlankString(value.sourceArtifactId);
}

function isEntryLike(value: unknown): value is LeaderboardEntry {
  if (!isRecord(value) || !isRecord(value.model)) return false;
  const model = value.model;
  if (!hasNonBlankString(model.modelKey)
    || !hasNonBlankString(model.slug)
    || !hasNonBlankString(model.name)
    || !hasNonBlankString(model.creator)
    || !isSourceId(model.sourceId)
    || !hasNonBlankString(model.sourceArtifactId)
    || !['supported', 'estimated', 'source_only'].includes(model.evidenceStatus as string)
    || !Array.isArray(value.metrics)
    || !value.metrics.every(isMetricLike)) return false;
  return (value.metric === null || isMetricLike(value.metric))
    && (value.primaryPrice === null || isRecord(value.primaryPrice));
}

function isSourceLike(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isSourceId(value.sourceId)
    && hasNonBlankString(value.artifactId)
    && hasNonBlankString(value.sourceUrl)
    && isCanonicalIsoTimestamp(value.observedAt)
    && hasNonBlankString(value.attributionText);
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

/** Parses a complete immutable leaderboard projection and rejects cache corruption. */
export function parseCompleteLeaderboardProjection(
  body: string,
  key: LeaderboardKey,
  profile: WorkloadProfile,
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
  const revision = value.revision;
  if (!hasNonBlankString(revision.revision)
    || !isCanonicalIsoTimestamp(revision.generatedAt)
    || !isCanonicalIsoTimestamp(revision.publishedAt)
    || !isCanonicalIsoTimestamp(revision.checkedAt)
    || revision.publicationState !== 'published'
    || !hasNonBlankString(revision.contentHash)
    || !hasNonBlankString(revision.catalogRevision)
    || !hasNonBlankString(revision.openrouterContentHash)) {
    throw new Error('cached leaderboard projection revision is invalid');
  }
  const leaderboard = value.leaderboard;
  if (leaderboard.key !== key || leaderboard.profile !== profile || !sameDefinition(key, leaderboard.definition)
    || !Array.isArray(leaderboard.entries)
    || !leaderboard.entries.every(isEntryLike)
    || !value.entries.every(isEntryLike)
    || !value.sources.every(isSourceLike)) {
    throw new Error('cached leaderboard projection is invalid');
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
): Promise<BenchmarkApiEnvelope<LeaderboardResult> | null> {
  const effectiveProfile = effectiveLeaderboardProfile(key, profile);
  const cached = await readApiResponseCache(
    db,
    'benchmarks',
    benchmarkLeaderboardProjectionCacheKey({
      key,
      profile: effectiveProfile,
      includeEstimated,
    }),
    BENCHMARK_LEADERBOARD_PROJECTION_FRESHNESS_WINDOW_MS,
    now,
  );
  if (!cached) return null;

  const projection = parseCompleteLeaderboardProjection(cached.body, key, effectiveProfile);
  if (projection.revision.revision !== cached.revision) {
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
  const freshness = freshnessFor(snapshot.revision, now);
  if (freshness.status !== cached.freshness) {
    throw new Error('cached leaderboard projection freshness does not match cache');
  }
  const leaderboard: LeaderboardResult = {
    key,
    profile: effectiveProfile,
    definition: LEADERBOARD_DEFINITIONS[key],
    entries: projection.entries,
  };
  return benchmarkEnvelope(
    snapshot,
    freshness,
    attributionForEvidence(
      snapshot,
      leaderboardEvidenceReferences(snapshot, leaderboard.definition, leaderboard.entries),
    ),
    leaderboard,
  );
}
