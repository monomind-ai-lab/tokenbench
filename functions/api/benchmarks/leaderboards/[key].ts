import type { BenchmarkSourceId } from '../../../../src/benchmarks/contracts';
import {
  LEADERBOARD_DEFINITIONS,
  type LeaderboardDefinition,
  type LeaderboardEntry,
  type LeaderboardResult,
} from '../../../../src/benchmarks/leaderboards';
import {
  createLeaderboardQueryCapabilities,
  filterLeaderboardEntries,
  hasValidLeaderboardQueryEncoding,
  leaderboardQueryToSearchParams,
  parseLeaderboardQuery,
  type LeaderboardQueryState,
} from '../../../../src/benchmarks/leaderboard-query';
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
  readonly filterParameters: URLSearchParams;
  readonly hasSharedFilters: boolean;
}

interface CursorPayload {
  readonly v: 1;
  readonly r: string;
  readonly k: LeaderboardKey;
  readonly p: WorkloadProfile;
  readonly l: number;
  readonly e: boolean;
  readonly f?: string;
  readonly o: number;
}

interface CursorRequestParameters {
  readonly key: LeaderboardKey;
  readonly profile: WorkloadProfile;
  readonly limit: number;
  readonly includeEstimated: boolean;
  readonly filter: string;
}

const SHARED_FILTER_KEYS = new Set([
  'q',
  'profile',
  'metric',
  'sort',
  'provider',
  'evidence',
  'sourceType',
  'lifecycle',
  'minPrice',
  'maxPrice',
  'estimated',
]);
const PAGINATION_KEYS = new Set(['limit', 'cursor', 'includeEstimated']);
const DATA_DEPENDENT_FILTER_KEYS = new Set([
  'q',
  'metric',
  'sort',
  'provider',
  'evidence',
  'sourceType',
  'lifecycle',
  'minPrice',
  'maxPrice',
  'estimated',
]);

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
  if ([...url.searchParams.keys()].some((name) => !SHARED_FILTER_KEYS.has(name) && !PAGINATION_KEYS.has(name))) {
    throw new Error('unknown query key');
  }
  const profileValue = oneQueryValue(url.searchParams, 'profile');
  const profile = profileValue ?? 'balanced';
  if (!isWorkloadProfile(profile)) throw new Error('invalid workload profile');
  const definition = LEADERBOARD_DEFINITIONS[key];
  if (definition.kind !== 'value' && definition.kind !== 'pricing-context' && profile !== 'balanced') {
    throw new Error('unsupported workload profile');
  }
  const includeEstimatedValue = oneQueryValue(url.searchParams, 'includeEstimated');
  if (includeEstimatedValue !== null && includeEstimatedValue !== '1') throw new Error('invalid estimated flag');
  const estimatedValue = oneQueryValue(url.searchParams, 'estimated');
  if (estimatedValue !== null && estimatedValue !== '1') throw new Error('invalid estimated filter');
  if (includeEstimatedValue !== null && estimatedValue !== null) throw new Error('duplicate estimated flag');
  const includeEstimated = includeEstimatedValue === '1' || estimatedValue === '1';
  if (includeEstimated && !supportsEstimated(definition)) {
    throw new Error('estimated evidence is not available for this route');
  }
  const cursor = oneQueryValue(url.searchParams, 'cursor');
  const filterParameters = new URLSearchParams();
  filterParameters.set('profile', profile);
  for (const [name, value] of url.searchParams) {
    if (name !== 'profile' && name !== 'estimated' && SHARED_FILTER_KEYS.has(name)) {
      filterParameters.append(name, value);
    }
  }
  if (includeEstimated) filterParameters.set('estimated', '1');
  return {
    key,
    profile,
    limit: parseLimit(oneQueryValue(url.searchParams, 'limit')),
    cursor: cursor || null,
    includeEstimated,
    filterParameters,
    hasSharedFilters: [...url.searchParams.keys()].some((name) => DATA_DEPENDENT_FILTER_KEYS.has(name)),
  };
}

function cursorFor(revision: string, request: CursorRequestParameters, offset: number): string {
  const payload: CursorPayload = {
    v: 1,
    r: revision,
    k: request.key,
    p: request.profile,
    l: request.limit,
    e: request.includeEstimated,
    ...(request.filter ? { f: request.filter } : {}),
    o: offset,
  };
  return encodeOpaqueValue(payload);
}

function offsetFromCursor(
  cursor: string,
  revision: string,
  request: CursorRequestParameters,
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
    || !((value.f === undefined && request.filter === '') || value.f === request.filter)
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
    const requestUrl = new URL(request.url);
    if (!hasValidLeaderboardQueryEncoding(requestUrl.search)) throw new Error('malformed query encoding');
    normalized = parseRequest(params?.key, requestUrl);
  } catch {
    return invalidBenchmarkRequestResponse();
  }
  if (!env.CATALOG_DB) return unavailableBenchmarkResponse();

  try {
    const now = Date.now();
    // The interactive UI always asks for the first, normalized page. Serve its
    // published raw response before reading or deriving the full fact graph.
    if (normalized.cursor === null && !normalized.hasSharedFilters) {
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
    const capabilities = createLeaderboardQueryCapabilities(projection.leaderboard.definition, projection.entries);
    const parsedFilters = parseLeaderboardQuery(
      normalized.filterParameters.toString(),
      projection.leaderboard.definition,
      capabilities,
      'api',
    );
    if (!parsedFilters.ok) return invalidBenchmarkRequestResponse();
    const filterState: LeaderboardQueryState = {
      ...parsedFilters.state,
      preserveSourceLensOrder: normalized.key === 'multimodal-vision-documents'
        && parsedFilters.state.sort === projection.leaderboard.definition.defaultSort,
    };
    const canonicalFilterParameters = leaderboardQueryToSearchParams(filterState);
    // Profile is already a dedicated cursor field, and the route definition
    // fixes the default sort. Omitting both retains compatibility with cursors
    // emitted by materialized first pages before shared filters existed.
    canonicalFilterParameters.delete('profile');
    if (filterState.sort === projection.leaderboard.definition.defaultSort) {
      canonicalFilterParameters.delete('sort');
    }
    const canonicalFilter = canonicalFilterParameters.toString();
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
      filter: canonicalFilter,
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
    const entries = normalized.hasSharedFilters
      ? filterLeaderboardEntries(projection.entries, filterState)
      : projection.entries;
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
      filter: canonicalFilter,
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
