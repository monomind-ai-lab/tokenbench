import type { BenchmarkSourceId } from '../../../../src/benchmarks/contracts';
import {
  LEADERBOARD_DEFINITIONS,
  type LeaderboardDefinition,
  type LeaderboardEntry,
  type LeaderboardResult,
} from '../../../../src/benchmarks/leaderboards';
import {
  benchmarkLeaderboardCacheKey,
  benchmarkLeaderboardProjectionCacheKey,
} from '../../../../src/benchmarks/api-response-cache-keys';
import {
  effectiveLeaderboardProfile,
  type CachedLeaderboardPaginationProjection,
} from '../../../../src/benchmarks/api-projections';
import { LEADERBOARD_ROUTES, type LeaderboardKey } from '../../../../src/routing/routes';
import { isWorkloadProfile, type WorkloadProfile } from '../../../../src/benchmarks/value';
import { cachedApiResponse, readApiResponseCache } from '../../../_shared/api-response-cache';
import {
  attributionForEvidence,
  benchmarkEnvelope,
  decodeOpaqueValue,
  encodeOpaqueValue,
  etagForBenchmarkResponse,
  freshnessFor,
  invalidBenchmarkRequestResponse,
  jsonBenchmarkResponse,
  matchesExactEtag,
  notModifiedBenchmarkResponse,
  unavailableBenchmarkResponse,
  type ActiveBenchmarkSnapshot,
  type BenchmarkApiEnv,
  type EvidenceReference,
} from '../../../_shared/benchmark-db';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface LeaderboardRequestParameters {
  readonly key: LeaderboardKey;
  readonly profile: WorkloadProfile;
  readonly limit: number;
  readonly cursor: string | null;
  readonly includeEstimated: boolean;
}

interface CursorPayload {
  readonly v: 1;
  readonly r: string;
  readonly k: LeaderboardKey;
  readonly p: WorkloadProfile;
  readonly l: number;
  readonly e: boolean;
  readonly o: number;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isLeaderboardKey(value: unknown): value is LeaderboardKey {
  return typeof value === 'string'
    && Object.prototype.hasOwnProperty.call(LEADERBOARD_ROUTES, value)
    && Object.prototype.hasOwnProperty.call(LEADERBOARD_DEFINITIONS, value);
}

function oneQueryValue(parameters: URLSearchParams, name: string): string | null {
  const values = parameters.getAll(name);
  if (values.length > 1) throw new Error(`duplicate ${name}`);
  return values[0] ?? null;
}

function parseLimit(value: string | null): number {
  if (value === null) return DEFAULT_LIMIT;
  if (!/^[1-9]\d*$/.test(value)) throw new Error('invalid limit');
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit > MAX_LIMIT) throw new Error('invalid limit');
  return limit;
}

function supportsEstimated(definition: LeaderboardDefinition): boolean {
  return definition.sourceId === 'benchlm' || definition.kind === 'multimodal';
}

function parseRequest(key: unknown, url: URL): LeaderboardRequestParameters {
  if (!isLeaderboardKey(key)) throw new Error('invalid leaderboard key');
  const profileValue = oneQueryValue(url.searchParams, 'profile');
  const profile = profileValue ?? 'balanced';
  if (!isWorkloadProfile(profile)) throw new Error('invalid workload profile');
  const includeEstimatedValue = oneQueryValue(url.searchParams, 'includeEstimated');
  if (includeEstimatedValue !== null && includeEstimatedValue !== '1') throw new Error('invalid estimated flag');
  const includeEstimated = includeEstimatedValue === '1';
  if (includeEstimated && !supportsEstimated(LEADERBOARD_DEFINITIONS[key])) {
    throw new Error('estimated evidence is not available for this route');
  }
  const cursor = oneQueryValue(url.searchParams, 'cursor');
  return {
    key,
    profile,
    limit: parseLimit(oneQueryValue(url.searchParams, 'limit')),
    cursor: cursor || null,
    includeEstimated,
  };
}

function cursorFor(revision: string, request: Omit<LeaderboardRequestParameters, 'cursor'>, offset: number): string {
  const payload: CursorPayload = {
    v: 1,
    r: revision,
    k: request.key,
    p: request.profile,
    l: request.limit,
    e: request.includeEstimated,
    o: offset,
  };
  return encodeOpaqueValue(payload);
}

function offsetFromCursor(
  cursor: string,
  revision: string,
  request: Omit<LeaderboardRequestParameters, 'cursor'>,
): number {
  const payload = decodeOpaqueValue(cursor);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('invalid cursor');
  const value = payload as Partial<CursorPayload>;
  if (value.v !== 1
    || value.r !== revision
    || value.k !== request.key
    || value.p !== request.profile
    || value.l !== request.limit
    || value.e !== request.includeEstimated
    || !Number.isSafeInteger(value.o)
    || value.o === undefined
    || value.o < 1) {
    throw new Error('invalid cursor');
  }
  if (cursorFor(revision, request, value.o) !== cursor) throw new Error('non-canonical cursor');
  return value.o;
}

function displayedEvidence(entries: readonly LeaderboardEntry[]): readonly EvidenceReference[] {
  return entries.flatMap((entry) => [
    { sourceId: entry.model.sourceId, sourceArtifactId: entry.model.sourceArtifactId },
    ...(entry.metric ? [{ sourceId: entry.metric.sourceId, sourceArtifactId: entry.metric.sourceArtifactId }] : []),
    ...entry.metrics.map((metric) => ({ sourceId: metric.sourceId, sourceArtifactId: metric.sourceArtifactId })),
    ...(entry.primaryPrice ? [{ sourceId: entry.primaryPrice.sourceId, sourceArtifactId: entry.primaryPrice.sourceArtifactId }] : []),
  ]);
}

function routeEvidence(
  snapshot: ActiveBenchmarkSnapshot,
  definition: LeaderboardDefinition,
): readonly EvidenceReference[] {
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

function parsePaginationProjection(
  body: string,
  key: LeaderboardKey,
  profile: WorkloadProfile,
): CachedLeaderboardPaginationProjection {
  const value = JSON.parse(body) as Partial<CachedLeaderboardPaginationProjection>;
  if (!value || typeof value !== 'object'
    || !value.revision || typeof value.revision !== 'object'
    || typeof value.revision.revision !== 'string'
    || value.revision.publishedAt === null
    || !Array.isArray(value.sources)
    || !value.leaderboard || typeof value.leaderboard !== 'object'
    || value.leaderboard.definition?.kind !== LEADERBOARD_DEFINITIONS[key].kind
    || value.leaderboard.profile !== profile
    || !Array.isArray(value.entries)) {
    throw new Error('cached leaderboard pagination projection is invalid');
  }
  return value as CachedLeaderboardPaginationProjection;
}

export async function onRequestGet({
  request,
  env,
  params,
}: {
  request: Request;
  env: BenchmarkApiEnv;
  params?: { key?: string };
}): Promise<Response> {
  let normalized: LeaderboardRequestParameters;
  try {
    normalized = parseRequest(params?.key, new URL(request.url));
  } catch {
    return invalidBenchmarkRequestResponse();
  }
  if (!env.CATALOG_DB) return unavailableBenchmarkResponse();

  try {
    const now = Date.now();
    // The interactive UI always asks for the first, normalized page. Serve its
    // published raw response before reading or deriving the full fact graph.
    if (normalized.cursor === null) {
      const cached = await readApiResponseCache(
        env.CATALOG_DB,
        'benchmarks',
        benchmarkLeaderboardCacheKey(normalized),
        36 * 60 * 60 * 1000,
        now,
      );
      if (cached) return cachedApiResponse(request, cached);
    }

    const derivationProfile = effectiveLeaderboardProfile(normalized.key, normalized.profile);
    const cachedProjection = await readApiResponseCache(
      env.CATALOG_DB,
      'benchmarks',
      benchmarkLeaderboardProjectionCacheKey({
        key: normalized.key,
        profile: derivationProfile,
        includeEstimated: normalized.includeEstimated,
      }),
      36 * 60 * 60 * 1000,
      now,
    );
    if (!cachedProjection) return unavailableBenchmarkResponse();
    const projection = parsePaginationProjection(cachedProjection.body, normalized.key, derivationProfile);
    const snapshot: ActiveBenchmarkSnapshot = {
      revision: projection.revision,
      sources: projection.sources,
      models: [],
      metrics: [],
      priceChecks: [],
      comparisonPairs: [],
    };
    const freshness = freshnessFor(snapshot.revision, now);
    if (freshness.status !== cachedProjection.freshness) {
      throw new Error('cached leaderboard freshness does not match its projection');
    }

    const cursorParameters = {
      key: normalized.key,
      profile: normalized.profile,
      limit: normalized.limit,
      includeEstimated: normalized.includeEstimated,
    } as const;
    let offset = 0;
    if (normalized.cursor) {
      try {
        offset = offsetFromCursor(normalized.cursor, snapshot.revision.revision, cursorParameters);
      } catch {
        return invalidBenchmarkRequestResponse();
      }
    }

    const leaderboard: LeaderboardResult = {
      ...projection.leaderboard,
      profile: normalized.profile,
      entries: projection.entries,
    };
    const entries = projection.entries;
    if (offset >= entries.length && normalized.cursor !== null) return invalidBenchmarkRequestResponse();
    const pagedEntries = entries.slice(offset, offset + normalized.limit);
    const nextOffset = offset + pagedEntries.length;
    const nextCursor = nextOffset < entries.length
      ? cursorFor(snapshot.revision.revision, cursorParameters, nextOffset)
      : null;
    const etag = etagForBenchmarkResponse(snapshot.revision, freshness, {
      endpoint: 'leaderboard',
      key: normalized.key,
      profile: normalized.profile,
      limit: normalized.limit,
      cursor: normalized.cursor ?? '',
      includeEstimated: normalized.includeEstimated,
    });
    if (matchesExactEtag(request, etag)) return notModifiedBenchmarkResponse(etag);

    return jsonBenchmarkResponse(
      benchmarkEnvelope(
        snapshot,
        freshness,
        attributionForEvidence(snapshot, [
          ...routeEvidence(snapshot, leaderboard.definition),
          ...displayedEvidence(pagedEntries),
        ]),
        {
          ...leaderboard,
          entries: pagedEntries,
          pagination: {
            limit: normalized.limit,
            total: entries.length,
            nextCursor,
          },
        },
      ),
      200,
      etag,
    );
  } catch {
    return unavailableBenchmarkResponse();
  }
}
