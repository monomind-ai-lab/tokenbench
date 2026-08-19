import { leaderboardCsv } from '../../../../../src/benchmarks/leaderboard-csv';
import {
  createLeaderboardQueryCapabilities,
  hasValidLeaderboardQueryGrammar,
  hasValidLeaderboardQueryEncoding,
  LEADERBOARD_QUERY_KEYS,
  LEADERBOARD_SINGLE_VALUE_QUERY_KEYS,
  parseLeaderboardQuery,
  type LeaderboardQueryState,
} from '../../../../../src/benchmarks/leaderboard-query';
import { LEADERBOARD_DEFINITIONS } from '../../../../../src/benchmarks/leaderboards';
import { LEADERBOARD_ROUTES, type LeaderboardKey } from '../../../../../src/routing/leaderboard-routes';
import { isWorkloadProfile, type WorkloadProfile } from '../../../../../src/benchmarks/value';
import { readCompleteLeaderboardProjection } from '../../../../_shared/benchmark-leaderboard-projection';
import {
  invalidBenchmarkRequestResponse,
  unavailableBenchmarkResponse,
  type BenchmarkApiEnv,
} from '../../../../_shared/benchmark-db';

interface CsvRequestParameters {
  readonly key: LeaderboardKey;
  readonly profile: WorkloadProfile;
  readonly includeEstimated: boolean;
}

const QUERY_KEYS = new Set<string>(LEADERBOARD_QUERY_KEYS);
const SINGLE_VALUE_QUERY_KEYS = new Set<string>(LEADERBOARD_SINGLE_VALUE_QUERY_KEYS);
const SAFE_FILENAME_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const SAFE_CATEGORY_TOKEN = /^[a-z0-9-]{1,80}$/u;

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

function supportsProfile(key: LeaderboardKey): boolean {
  const kind = LEADERBOARD_DEFINITIONS[key].kind;
  return kind === 'value' || kind === 'pricing-context';
}

function supportsEstimated(key: LeaderboardKey): boolean {
  const definition = LEADERBOARD_DEFINITIONS[key];
  return ('sourceId' in definition && definition.sourceId === 'benchlm') || definition.kind === 'multimodal';
}

/** Validates the static request shape before selecting a projection variant. */
function parseCsvRequest(keyValue: unknown, url: URL): CsvRequestParameters {
  if (!isLeaderboardKey(keyValue)) throw new Error('invalid leaderboard key');
  if ([...url.searchParams.keys()].some((name) => !QUERY_KEYS.has(name))) throw new Error('unknown query key');
  for (const name of SINGLE_VALUE_QUERY_KEYS) oneQueryValue(url.searchParams, name);

  const profile = oneQueryValue(url.searchParams, 'profile') ?? 'balanced';
  if (!isWorkloadProfile(profile) || (!supportsProfile(keyValue) && profile !== 'balanced')) {
    throw new Error('invalid workload profile');
  }
  const estimated = oneQueryValue(url.searchParams, 'estimated');
  if (estimated !== null && estimated !== '1') throw new Error('invalid estimated flag');
  if (estimated === '1' && !supportsEstimated(keyValue)) throw new Error('estimated evidence is unavailable');
  return { key: keyValue, profile, includeEstimated: estimated === '1' };
}

function filterState(key: LeaderboardKey, state: LeaderboardQueryState): LeaderboardQueryState {
  return {
    ...state,
    preserveSourceLensOrder: key === 'multimodal-vision-documents'
      && state.sort === LEADERBOARD_DEFINITIONS[key].defaultSort,
  };
}

function methodologyHeader(key: LeaderboardKey): string {
  switch (LEADERBOARD_DEFINITIONS[key].kind) {
    case 'benchlm':
    case 'value':
      return 'benchlm_raw_composite';
    case 'lmarena':
      return 'bradley_terry';
    case 'pricing-context':
      return 'openrouter_price_route';
    case 'multimodal':
      return 'benchlm_raw_composite,bradley_terry';
  }
}

function attachmentFilename(key: LeaderboardKey, publishedAt: string, revision: string): string {
  const snapshotDate = publishedAt.slice(0, 10);
  if (!SAFE_CATEGORY_TOKEN.test(key)
    || !/^\d{4}-\d{2}-\d{2}$/u.test(snapshotDate)
    || !SAFE_FILENAME_TOKEN.test(revision)) {
    throw new Error('CSV filename metadata is invalid');
  }
  return `tokenbench-${key}-${snapshotDate}-${revision}.csv`;
}

function csvResponse(
  body: string,
  key: LeaderboardKey,
  metadata: {
    readonly revision: string;
    readonly publishedAt: string;
    readonly freshness: 'fresh' | 'stale';
  },
): Response {
  const filename = attachmentFilename(key, metadata.publishedAt, metadata.revision);
  return new Response(body, {
    status: 200,
    headers: {
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      Vary: 'Accept-Encoding',
      'X-TokenBench-Revision': metadata.revision,
      'X-TokenBench-Published-At': metadata.publishedAt,
      'X-TokenBench-Freshness': metadata.freshness,
      'X-TokenBench-Methodology': methodologyHeader(key),
    },
  });
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
  let normalized: CsvRequestParameters;
  let requestUrl: URL;
  try {
    requestUrl = new URL(request.url);
    if (!hasValidLeaderboardQueryEncoding(requestUrl.search)) throw new Error('malformed query encoding');
    normalized = parseCsvRequest(params?.key, requestUrl);
    if (!hasValidLeaderboardQueryGrammar(requestUrl.search, LEADERBOARD_DEFINITIONS[normalized.key])) {
      throw new Error('invalid query grammar');
    }
  } catch {
    return invalidBenchmarkRequestResponse();
  }
  if (!env.CATALOG_DB) return unavailableBenchmarkResponse();

  try {
    const complete = await readCompleteLeaderboardProjection(
      env.CATALOG_DB,
      normalized.key,
      normalized.profile,
      normalized.includeEstimated,
    );
    if (!complete) return unavailableBenchmarkResponse();
    const capabilities = createLeaderboardQueryCapabilities(complete.data.definition, complete.data.entries);
    const parsed = parseLeaderboardQuery(requestUrl.search, complete.data.definition, capabilities, 'api');
    if (!parsed.ok) return invalidBenchmarkRequestResponse();
    const filters = filterState(normalized.key, parsed.state);
    return csvResponse(
      leaderboardCsv(complete.data, filters),
      normalized.key,
      {
        revision: complete.revision,
        publishedAt: complete.publishedAt,
        freshness: complete.freshness.status,
      },
    );
  } catch {
    return unavailableBenchmarkResponse();
  }
}
