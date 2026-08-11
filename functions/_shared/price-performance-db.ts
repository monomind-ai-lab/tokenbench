import {
  compareUtf8Binary,
  type BenchmarkModel,
  type BenchmarkPriceCheck,
} from '../../src/benchmarks/contracts';
import {
  parseModelDirectoryRecord,
  type ModelDirectoryRecord,
} from '../../src/benchmarks/model-directory';
import { isModelSlugRouteSafe } from '../../src/benchmarks/model-directory';
import {
  parseModelProfileSnapshotData,
  type ModelProfileSnapshotData,
} from '../../src/benchmarks/model-profile';
import {
  PRICE_PERFORMANCE_COST_BASES,
  PRICE_PERFORMANCE_SCORE_LANES,
  type PricePerformanceCapabilities,
  type PricePerformanceEnvelopeData,
  type PricePerformancePoint,
  type PricePerformanceProjection,
  type PricePerformanceRoute,
  type PricePerformanceScoreLane,
} from '../../src/benchmarks/price-performance-contracts';
import {
  buildPricePerformanceProjection,
  PRICE_PERFORMANCE_METRIC_KEYS,
} from '../../src/benchmarks/price-performance';
import { isNonNegativeFinite } from '../../src/benchmarks/value';
import {
  readActiveBenchmarkSnapshot,
  type ActiveBenchmarkSnapshot,
  type D1Database,
} from './benchmark-db';

/** Hard bound on archived durable profiles returned per response. */
export const PRICE_PERFORMANCE_ARCHIVED_LIMIT = 500;
const ARCHIVED_PROFILE_HISTORY_LIMIT = 5;

const SOURCE_PRIORITY: Record<BenchmarkPriceCheck['sourceId'], number> = {
  benchlm: 0,
  lmarena: 1,
  litellm: 2,
  openrouter: 3,
};

function compareText(left: string, right: string): number {
  return compareUtf8Binary(left, right);
}

async function all(db: D1Database, sql: string, ...values: unknown[]): Promise<unknown[]> {
  return (await db.prepare(sql).bind(...values).all()).results;
}

/** Bounded inline projection built from one active snapshot read. */
export function pricePerformanceProjectionFromSnapshot(snapshot: ActiveBenchmarkSnapshot): PricePerformanceProjection {
  return buildPricePerformanceProjection({
    models: snapshot.models,
    metrics: snapshot.metrics,
    priceChecks: snapshot.priceChecks,
  });
}

export const PRICE_PERFORMANCE_SCORE_METHODOLOGY: Readonly<Record<PricePerformanceScoreLane, string>> = {
  overall: 'BenchLM public overall composite score.',
  agentic: 'BenchLM public agentic capability score.',
  coding: 'BenchLM public coding capability score.',
  reasoning: 'BenchLM public reasoning capability score.',
  knowledge: 'BenchLM public knowledge capability score.',
  multimodal: 'BenchLM public multimodal capability score.',
  mathematics: 'BenchLM public mathematics capability score.',
  multilingual: 'BenchLM public multilingual capability score.',
  'instruction-following': 'BenchLM public instruction-following capability score.',
};

export const PRICE_PERFORMANCE_CACHE_PARAMETERS = {
  endpoint: 'price-performance',
  includeArchived: false,
} as const;

export function pricePerformanceCapabilities(
  points: readonly PricePerformancePoint[],
): PricePerformanceCapabilities {
  const creators = [...new Set(points.map((point) => point.creator))].sort(compareText);
  const sourceTypes = (['Proprietary', 'Open Weight', 'Unknown'] as const)
    .filter((sourceType) => points.some((point) => point.sourceType === sourceType));
  const evidenceStatuses = (['supported', 'estimated', 'source_only'] as const)
    .filter((evidenceStatus) => points.some((point) => point.evidenceStatus === evidenceStatus));
  return {
    scoreLanes: [...PRICE_PERFORMANCE_SCORE_LANES],
    costBases: [...PRICE_PERFORMANCE_COST_BASES],
    creators,
    sourceTypes,
    evidenceStatuses,
    // Status capability describes the supported endpoint modes, not only the
    // rows present: the archived control is always available even when the
    // current materialized view contains only current points.
    statuses: ['current', 'archived'] as const,
  };
}

export interface PricePerformanceArchivedMeta {
  readonly hasMore: boolean;
  readonly limit: number;
}

export interface PricePerformanceApiData extends PricePerformanceEnvelopeData {
  readonly archived?: PricePerformanceArchivedMeta;
}

export function pricePerformanceEnvelopeData(
  points: readonly PricePerformancePoint[],
  archived?: PricePerformanceArchivedMeta,
): PricePerformanceApiData {
  return {
    scoreMethodology: PRICE_PERFORMANCE_SCORE_METHODOLOGY,
    costDefinitions: {
      output: 'Published output USD per one million tokens',
      blended3To1: '(3 × input USD/M + output USD/M) / 4',
    },
    capabilities: pricePerformanceCapabilities(points),
    points,
    ...(archived ? { archived } : {}),
  };
}

function archivedRouteFromProfile(profile: ModelProfileSnapshotData): PricePerformanceRoute | null {
  const candidates = profile.priceRoutes
    .filter((route) => route.verificationStatus === 'primary'
      && isNonNegativeFinite(route.inputUsdPerMillion)
      && isNonNegativeFinite(route.outputUsdPerMillion)
      && route.providerId.length > 0
      && route.routeId.length > 0
      && route.sourceModelId.length > 0
      && route.sourceArtifactId.length > 0
      && (route.canonicalSlug === null || isModelSlugRouteSafe(route.canonicalSlug)))
    .slice()
    .sort((left, right) => SOURCE_PRIORITY[left.sourceId] - SOURCE_PRIORITY[right.sourceId]
      || compareText(left.providerId, right.providerId)
      || compareText(left.routeId, right.routeId));
  const candidate = candidates[0];
  if (!candidate) return null;
  return {
    sourceId: candidate.sourceId,
    providerId: candidate.providerId,
    routeId: candidate.routeId,
    sourceModelId: candidate.sourceModelId,
    canonicalSlug: candidate.canonicalSlug,
    sourceArtifactId: candidate.sourceArtifactId,
    inputUsdPerMillion: candidate.inputUsdPerMillion,
    cachedInputUsdPerMillion: candidate.cachedInputUsdPerMillion,
    outputUsdPerMillion: candidate.outputUsdPerMillion,
    contextWindowTokens: candidate.contextWindowTokens,
    verificationStatus: candidate.verificationStatus,
    maxInputTokens: candidate.maxInputTokens,
    maxOutputTokens: candidate.maxOutputTokens,
    inputModalities: candidate.inputModalities,
    outputModalities: candidate.outputModalities,
    supportedParameters: candidate.supportedParameters,
  };
}

function archivedPointFromProfile(
  directory: ModelDirectoryRecord,
  profile: ModelProfileSnapshotData,
): PricePerformancePoint | null {
  if (!isModelSlugRouteSafe(directory.canonicalSlug)) return null;
  const route = archivedRouteFromProfile(profile);
  if (!route) return null;
  const scores = {} as Record<PricePerformanceScoreLane, number | null>;
  const byMetricKey = new Map<string, number>();
  for (const category of profile.categories) {
    if (!byMetricKey.has(category.metricKey)
      && Number.isFinite(category.score)
      && category.score >= 0) {
      byMetricKey.set(category.metricKey, category.score);
    }
  }
  let scoreCount = 0;
  for (const lane of PRICE_PERFORMANCE_SCORE_LANES) {
    const value = byMetricKey.get(PRICE_PERFORMANCE_METRIC_KEYS[lane]) ?? null;
    scores[lane] = value;
    if (value !== null) scoreCount += 1;
  }
  if (scoreCount === 0) return null;
  return {
    modelKey: directory.modelKey,
    slug: directory.canonicalSlug,
    displayName: directory.displayName,
    creator: directory.creator,
    familyId: directory.familyId,
    status: 'archived',
    sourceType: directory.sourceType,
    evidenceStatus: profile.summary.evidenceStatus,
    scores,
    route,
  };
}

async function readArchivedProfiles(
  db: D1Database,
  directories: readonly ModelDirectoryRecord[],
): Promise<Map<string, ModelProfileSnapshotData>> {
  if (directories.length === 0) return new Map();
  const keys = directories.map((directory) => directory.modelKey);
  const rows = await all(db, `
    SELECT model_key, revision, profile_json, generated_at
    FROM (
      SELECT snapshots.*,
        ROW_NUMBER() OVER (
          PARTITION BY snapshots.model_key
          ORDER BY snapshots.generated_at DESC, snapshots.revision DESC
        ) AS profile_order
      FROM benchmark_model_profile_snapshots AS snapshots
      WHERE snapshots.model_key IN (SELECT value FROM json_each(?))
    )
    WHERE profile_order <= ${ARCHIVED_PROFILE_HISTORY_LIMIT}
    ORDER BY model_key ASC, profile_order ASC
  `, JSON.stringify(keys));
  const grouped = new Map<string, Array<{ revision: string; profileJson: string }>>();
  for (const row of rows) {
    const record = row as Record<string, unknown>;
    if (typeof record.model_key !== 'string'
      || typeof record.revision !== 'string'
      || typeof record.profile_json !== 'string') continue;
    const list = grouped.get(record.model_key) ?? [];
    list.push({ revision: record.revision, profileJson: record.profile_json });
    grouped.set(record.model_key, list);
  }
  const selected = new Map<string, ModelProfileSnapshotData>();
  for (const directory of directories) {
    const candidates = grouped.get(directory.modelKey) ?? [];
    let fallback: ModelProfileSnapshotData | null = null;
    for (const candidate of candidates) {
      const profile = parseModelProfileSnapshotData(candidate.profileJson);
      if (!profile
        || profile.identity.modelKey !== directory.modelKey
        || profile.identity.slug !== directory.canonicalSlug) continue;
      if (candidate.revision !== directory.latestProfileRevision) {
        if (!fallback) fallback = profile;
        continue;
      }
      selected.set(directory.modelKey, profile);
      break;
    }
    if (!selected.has(directory.modelKey) && fallback) selected.set(directory.modelKey, fallback);
  }
  return selected;
}

/** Reads a bounded page of parsed latest-valid archived durable profiles. */
export async function readArchivedPricePerformancePoints(
  db: D1Database,
  limit: number,
  offset: number,
): Promise<{ readonly points: readonly PricePerformancePoint[]; readonly hasMore: boolean }> {
  const boundedLimit = Math.min(Math.max(1, Math.trunc(limit)), PRICE_PERFORMANCE_ARCHIVED_LIMIT);
  const rows = await all(db, `
    SELECT * FROM benchmark_model_directory
    WHERE status = 'archived'
    ORDER BY canonical_slug ASC, model_key ASC
    LIMIT ? OFFSET ?
  `, boundedLimit + 1, Math.max(0, Math.trunc(offset)));
  const directories = rows
    .map((row) => {
      const record = row as Record<string, unknown>;
      return parseModelDirectoryRecord({
        modelKey: record.model_key,
        canonicalSlug: record.canonical_slug,
        displayName: record.display_name,
        creator: record.creator,
        sourceType: record.source_type,
        reasoningType: record.reasoning_type,
        familyId: record.family_id,
        variantId: record.variant_id,
        firstSeenRevision: record.first_seen_revision,
        firstSeenAt: record.first_seen_at,
        lastSeenRevision: record.last_seen_revision,
        lastSeenAt: record.last_seen_at,
        latestProfileRevision: record.latest_profile_revision,
        status: record.status,
        sourceId: record.source_id,
        sourceModelId: record.source_model_id,
        updatedAt: record.updated_at,
      });
    })
    .filter((directory): directory is ModelDirectoryRecord => directory !== null);
  const hasMore = directories.length > boundedLimit;
  const pageDirectories = directories.slice(0, boundedLimit);
  const selected = await readArchivedProfiles(db, pageDirectories);
  const points: PricePerformancePoint[] = [];
  for (const directory of pageDirectories) {
    const profile = selected.get(directory.modelKey);
    if (!profile) continue;
    const point = archivedPointFromProfile(directory, profile);
    if (point) points.push(point);
  }
  return { points, hasMore };
}

export interface PricePerformanceProjectionRead extends PricePerformanceProjection {
  readonly archivedHasMore: boolean;
}

export type InvalidProjectionReason = 'unsafe-identity' | 'invalid-price';

/** Hard bound on invalid-row log entries emitted per read. */
export const MAX_INVALID_PROJECTION_LOGS = 25;

/** Safe, content-free record for a projection row that was isolated and excluded. */
export interface InvalidPricePerformancePointLog {
  readonly modelKey: string;
  readonly sourceId: string;
  readonly reason: InvalidProjectionReason;
}

function routeIsComplete(route: BenchmarkPriceCheck): boolean {
  return route.verificationStatus === 'primary'
    && isNonNegativeFinite(route.inputUsdPerMillion)
    && isNonNegativeFinite(route.outputUsdPerMillion)
    && route.providerId.length > 0
    && route.routeId.length > 0
    && route.sourceModelId.length > 0
    && route.sourceArtifactId.length > 0
    && (route.canonicalSlug === null || isModelSlugRouteSafe(route.canonicalSlug));
}

/**
 * Returns an invalid reason only for a model that carries candidate facts but
 * was excluded for a concrete defect (unsafe identity or a malformed price
 * row). Legitimate ineligibility (missing price or missing eligible score) is
 * normal and returns null, so reads never log hundreds of absent rows.
 */
export function invalidProjectionReason(
  model: BenchmarkModel,
  prices: readonly BenchmarkPriceCheck[],
): InvalidProjectionReason | null {
  if (!isModelSlugRouteSafe(model.slug) || model.name.length === 0 || model.creator.length === 0) {
    return 'unsafe-identity';
  }
  if (prices.length > 0 && !prices.some(routeIsComplete)) return 'invalid-price';
  return null;
}

/**
 * Emits a safe, content-free log entry only for candidate models excluded by a
 * concrete defect, hard-bounded to avoid per-request log floods. Does not
 * weaken the shared revision validation and never touches unrelated points.
 */
export function logInvalidProjectionRows(
  snapshot: ActiveBenchmarkSnapshot,
  projection: PricePerformanceProjection,
  log: (entry: InvalidPricePerformancePointLog) => void,
): void {
  const present = new Set(projection.points.map((point) => point.modelKey));
  const pricesByModel = new Map<string, BenchmarkPriceCheck[]>();
  for (const price of snapshot.priceChecks) {
    const list = pricesByModel.get(price.modelKey);
    if (list) list.push(price);
    else pricesByModel.set(price.modelKey, [price]);
  }
  let emitted = 0;
  for (const model of snapshot.models) {
    if (present.has(model.modelKey)) continue;
    const reason = invalidProjectionReason(model, pricesByModel.get(model.modelKey) ?? []);
    if (!reason) continue;
    log({ modelKey: model.modelKey, sourceId: model.sourceId, reason });
    emitted += 1;
    if (emitted >= MAX_INVALID_PROJECTION_LOGS) return;
  }
}

/**
 * Reads the active validated benchmark snapshot plus, when requested, a bounded
 * page of archived durable profiles. Invalid rows are isolated: a single bad
 * price/source row never excludes unrelated valid points, and every excluded
 * point is reported through a safe, content-free log entry.
 */
export async function readPricePerformanceProjection(
  db: D1Database,
  options: { readonly includeArchived: boolean; readonly log?: (entry: InvalidPricePerformancePointLog) => void },
): Promise<PricePerformanceProjectionRead> {
  const snapshot = await readActiveBenchmarkSnapshot(db);
  if (!snapshot) throw new Error('active benchmark snapshot unavailable');
  const current = pricePerformanceProjectionFromSnapshot(snapshot);
  if (options.log) logInvalidProjectionRows(snapshot, current, options.log);
  const points = [...current.points];
  let archivedHasMore = false;
  if (options.includeArchived) {
    const archived = await readArchivedPricePerformancePoints(db, PRICE_PERFORMANCE_ARCHIVED_LIMIT, 0);
    points.push(...archived.points);
    archivedHasMore = archived.hasMore;
  }
  points.sort((left, right) => compareText(left.modelKey, right.modelKey));
  return { points, archivedHasMore };
}
