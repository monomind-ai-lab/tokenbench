import {
  decodeBoundedJson,
  buildUiDataContractV1Envelope,
} from '../../../src/pipeline/ui-data-contract-v1-core';
import {
  normalizeRankingsRequest,
  type CustomRankingsRequest,
  type RankingDimensionSet,
  type RankingsRequest,
  type LeaderboardRankingsRequest,
} from '../../../src/pipeline/ui-data-contract-v1-rankings';
import { encodeOpaqueValue } from '../../_shared/benchmark-db';
import {
  type LiveBenchD1Database,
} from '../../_shared/livebench-db';
import {
  buildLiveBenchCustomRankingsData,
  buildLiveBenchRankingDimensionSet,
  buildLiveBenchLeaderboardData,
  LiveBenchRequestBindingError,
  LiveBenchRequestedReleaseUnavailableError,
} from '../../_shared/livebench-ui-data';
import {
  jsonUiDataServiceUnavailable,
  readLiveBenchApiContext,
  UI_DATA_CONTRACT_V1_MEDIA_TYPE,
} from '../../_shared/livebench-v1-api';
import {
  buildStrictModelJoinEnvelope,
  readStrictModelJoin,
} from '../../_shared/strict-model-join';

const ALLOWED_PARAMETERS = new Set([
  'operation', 'releaseId', 'organizationIds', 'openWeights',
  'excludeDerivativeFinetunes', 'limit', 'cursor',
]);

function one(parameters: URLSearchParams, name: string): string | null {
  const values = parameters.getAll(name);
  if (values.length > 1) throw new Error(`duplicate ${name}`);
  return values[0] ?? null;
}

export function parseLiveBenchRankingsRequest(request: Request): LeaderboardRankingsRequest {
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].some((name) => !ALLOWED_PARAMETERS.has(name))) {
    throw new Error('unknown rankings parameter');
  }
  const organizationIdsValue = one(url.searchParams, 'organizationIds');
  const organizationIds = organizationIdsValue === null || organizationIdsValue === ''
    ? []
    : organizationIdsValue.split(',').map((value) => value.trim());
  if (organizationIds.some((value) => value.length === 0)) throw new Error('invalid organizationIds');
  const excludeValue = one(url.searchParams, 'excludeDerivativeFinetunes');
  if (excludeValue !== null && excludeValue !== 'true' && excludeValue !== 'false') {
    throw new Error('invalid excludeDerivativeFinetunes');
  }
  const limitValue = one(url.searchParams, 'limit');
  const limit = limitValue === null ? 50 : Number(limitValue);
  if (!Number.isSafeInteger(limit)) throw new Error('invalid rankings limit');
  return normalizeRankingsRequest({
    operation: one(url.searchParams, 'operation') ?? 'leaderboard',
    releaseId: one(url.searchParams, 'releaseId'),
    filters: {
      organizationIds,
      openWeights: one(url.searchParams, 'openWeights') ?? 'all',
      excludeDerivativeFinetunes: excludeValue === 'true',
    },
    limit,
    cursor: one(url.searchParams, 'cursor'),
  }) as LeaderboardRankingsRequest;
}

function json(value: unknown, status: number, etag?: string): Response {
  const headers = new Headers({
    'Cache-Control': status === 200 ? 'public, max-age=0, must-revalidate' : 'no-store',
    'Content-Type': `${UI_DATA_CONTRACT_V1_MEDIA_TYPE}; charset=utf-8`,
    Vary: 'Accept',
  });
  if (etag) headers.set('ETag', etag);
  return new Response(JSON.stringify(value), { status, headers });
}

function invalidRequest(): Response {
  return json({ error: { code: 'invalid_request', message: 'The rankings request is invalid.' } }, 400);
}

function unavailable(request: RankingsRequest, fetchedAt: string): Response {
  return json(buildUiDataContractV1Envelope({
    method: 'rankings',
    request,
    status: 'unavailable',
    reason: 'No verified current LiveBench release is available.',
    fetchedAt,
    data: null,
    revisions: {
      projection: 'livebench-ui-data-v1-unavailable',
      catalog: null,
      benchmark: null,
      runtimeObservationSet: null,
      projectionMethodology: 'livebench-upstream-global-average-2026-06-25-v1',
    },
    freshness: {
      catalogObservedAt: null,
      runtimeObservedAt: null,
      benchmarkReleasedAt: null,
      benchmarkCheckedAt: null,
    },
    sources: [],
    warnings: [],
  }), 404);
}

function intrinsicDimensionSet(value: unknown): RankingDimensionSet {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid custom rankings request');
  const request = value as Record<string, unknown>;
  if (typeof request.dimensionSetRevision !== 'string'
    || !request.weights
    || typeof request.weights !== 'object'
    || Array.isArray(request.weights)) throw new Error('invalid custom rankings request');
  return {
    revision: request.dimensionSetRevision,
    transformationVersion: 'intrinsic-request-v1',
    dimensions: Object.keys(request.weights as Record<string, unknown>).map((dimensionId) => ({
      dimensionId,
      label: dimensionId,
      kind: 'benchmark' as const,
      unit: 'score' as const,
      utilityAnchor: { best: 100, worst: 0, transform: 'identity' as const },
    })),
  };
}

export async function onRequestGet({
  request,
  env,
}: {
  request: Request;
  env: { CATALOG_DB?: LiveBenchD1Database };
}): Promise<Response> {
  const fetchedAt = new Date().toISOString();
  let normalized: LeaderboardRankingsRequest;
  try {
    normalized = parseLiveBenchRankingsRequest(request);
  } catch {
    return invalidRequest();
  }
  if (!env.CATALOG_DB) return unavailable(normalized, fetchedAt);
  try {
    const context = await readLiveBenchApiContext(env.CATALOG_DB);
    if (!context) return unavailable(normalized, fetchedAt);
    const join = await readStrictModelJoin({
      db: env.CATALOG_DB,
      liveBenchRevision: context.release.revision,
      asOf: fetchedAt,
    });
    const data = buildLiveBenchLeaderboardData({
      bundle: context.bundle,
      request: normalized,
      source: context.source,
      join,
    });
    const envelope = buildStrictModelJoinEnvelope({
      method: 'rankings',
      request: normalized,
      data,
      context: {
        revision: context.release.revision,
        releasedAt: context.release.releasedAt,
        checkedAt: context.release.checkedAt,
        source: context.source,
      },
      join,
      fetchedAt,
    });
    const etag = `"ui-data-${encodeOpaqueValue([
      context.release.revision,
      context.release.checkedAt,
      join.catalogRevision,
      join.modalityBenchmarkRevision,
      normalized,
    ])}"`;
    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          'Cache-Control': 'public, max-age=0, must-revalidate',
          ETag: etag,
          Vary: 'Accept',
        },
      });
    }
    return json(envelope, 200, etag);
  } catch (error) {
    if (error instanceof LiveBenchRequestBindingError) return invalidRequest();
    if (error instanceof LiveBenchRequestedReleaseUnavailableError) return unavailable(normalized, fetchedAt);
    return jsonUiDataServiceUnavailable();
  }
}

export async function onRequestPost({
  request,
  env,
}: {
  request: Request;
  env?: { CATALOG_DB?: LiveBenchD1Database };
}): Promise<Response> {
  const fetchedAt = new Date().toISOString();
  let raw: unknown;
  try {
    raw = decodeBoundedJson(new Uint8Array(await request.arrayBuffer()));
  } catch {
    return invalidRequest();
  }

  if (!env?.CATALOG_DB) {
    try {
      const normalized = normalizeRankingsRequest(raw, intrinsicDimensionSet(raw));
      if (normalized.operation !== 'custom') throw new Error('rankings POST requires custom operation');
      return unavailable(normalized, fetchedAt);
    } catch {
      return invalidRequest();
    }
  }

  let context: Awaited<ReturnType<typeof readLiveBenchApiContext>>;
  try {
    context = await readLiveBenchApiContext(env.CATALOG_DB);
  } catch {
    return jsonUiDataServiceUnavailable();
  }
  if (!context) {
    try {
      const normalized = normalizeRankingsRequest(raw, intrinsicDimensionSet(raw));
      if (normalized.operation !== 'custom') throw new Error('rankings POST requires custom operation');
      return unavailable(normalized, fetchedAt);
    } catch {
      return invalidRequest();
    }
  }

  let normalized: CustomRankingsRequest;
  try {
    const candidate = normalizeRankingsRequest(raw, buildLiveBenchRankingDimensionSet(context.bundle));
    if (candidate.operation !== 'custom') throw new Error('rankings POST requires custom operation');
    normalized = candidate;
  } catch {
    return invalidRequest();
  }
  try {
    const join = await readStrictModelJoin({
      db: env.CATALOG_DB,
      liveBenchRevision: context.release.revision,
      asOf: fetchedAt,
    });
    const data = buildLiveBenchCustomRankingsData({
      bundle: context.bundle,
      request: normalized,
      source: context.source,
      join,
    });
    return json(buildStrictModelJoinEnvelope({
      method: 'rankings',
      request: normalized,
      data,
      context: {
        revision: context.release.revision,
        releasedAt: context.release.releasedAt,
        checkedAt: context.release.checkedAt,
        source: context.source,
      },
      join,
      fetchedAt,
    }), 200);
  } catch {
    return jsonUiDataServiceUnavailable();
  }
}
