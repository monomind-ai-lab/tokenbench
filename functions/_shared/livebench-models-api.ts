import {
  normalizeModelsRequest,
  normalizeProfileRequest,
  type ModelsRequest,
  type ProfileRequest,
} from '../../src/pipeline/ui-data-contract-v1-models';
import { encodeOpaqueValue } from './benchmark-db';
import type { LiveBenchD1Database } from './livebench-db';
import {
  buildUnavailableUiDataEnvelope,
  jsonUiDataResponse,
  jsonUiDataServiceUnavailable,
  readLiveBenchApiContext,
} from './livebench-v1-api';
import {
  buildLiveBenchModelsData,
  buildLiveBenchProfileData,
  LiveBenchRequestBindingError,
} from './livebench-ui-data';
import {
  buildStrictModelJoinEnvelope,
  readStrictModelJoin,
} from './strict-model-join';

const MODELS_PARAMETERS = new Set(['search', 'access', 'providerIds', 'limit', 'cursor']);

function one(parameters: URLSearchParams, name: string): string | null {
  const values = parameters.getAll(name);
  if (values.length > 1) throw new Error(`duplicate ${name}`);
  return values[0] ?? null;
}

export function parseLiveBenchModelsRequest(request: Request): ModelsRequest {
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].some((key) => !MODELS_PARAMETERS.has(key))) {
    throw new Error('unknown models parameter');
  }
  const providerIdsValue = one(url.searchParams, 'providerIds');
  const providerIds = providerIdsValue === null || providerIdsValue === ''
    ? []
    : providerIdsValue.split(',').map((value) => value.trim());
  if (providerIds.some((value) => value.length === 0)) throw new Error('invalid providerIds');
  const limitValue = one(url.searchParams, 'limit');
  const limit = limitValue === null ? 50 : Number(limitValue);
  if (!Number.isSafeInteger(limit)) throw new Error('invalid models limit');
  return normalizeModelsRequest({
    search: one(url.searchParams, 'search'),
    access: one(url.searchParams, 'access') ?? 'all',
    providerIds,
    limit,
    cursor: one(url.searchParams, 'cursor'),
  });
}

function invalidRequest(): Response {
  return jsonUiDataResponse({ error: { code: 'invalid_request', message: 'The model request is invalid.' } }, 400);
}

function etag(input: {
  readonly liveBenchRevision: string;
  readonly catalogRevision: string | null;
  readonly modalityBenchmarkRevision: string | null;
  readonly method: 'models' | 'profile';
  readonly request: unknown;
}): string {
  return `"ui-data-${encodeOpaqueValue([
    input.liveBenchRevision,
    input.catalogRevision,
    input.modalityBenchmarkRevision,
    input.method,
    input.request,
  ])}"`;
}

export async function onLiveBenchModelsGet(input: {
  readonly request: Request;
  readonly db?: LiveBenchD1Database;
}): Promise<Response> {
  const fetchedAt = new Date().toISOString();
  let normalized: ModelsRequest;
  try {
    normalized = parseLiveBenchModelsRequest(input.request);
  } catch {
    return invalidRequest();
  }
  if (!input.db) return jsonUiDataResponse(buildUnavailableUiDataEnvelope({
    method: 'models', request: normalized, fetchedAt,
    reason: 'No verified current LiveBench release is available.',
  }), 404);
  try {
    const context = await readLiveBenchApiContext(input.db);
    if (!context) return jsonUiDataResponse(buildUnavailableUiDataEnvelope({
      method: 'models', request: normalized, fetchedAt,
      reason: 'No verified current LiveBench release is available.',
    }), 404);
    const join = await readStrictModelJoin({
      db: input.db,
      liveBenchRevision: context.release.revision,
      asOf: fetchedAt,
    });
    const data = buildLiveBenchModelsData({
      bundle: context.bundle,
      request: normalized,
      source: context.source,
      join,
    });
    const envelope = buildStrictModelJoinEnvelope({
      method: 'models',
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
    const responseEtag = etag({
      liveBenchRevision: context.release.revision,
      catalogRevision: join.catalogRevision,
      modalityBenchmarkRevision: join.modalityBenchmarkRevision,
      method: 'models',
      request: normalized,
    });
    if (input.request.headers.get('if-none-match') === responseEtag) {
      return new Response(null, { status: 304, headers: { ETag: responseEtag, 'Cache-Control': 'public, max-age=0, must-revalidate', Vary: 'Accept' } });
    }
    return jsonUiDataResponse(envelope, 200, responseEtag);
  } catch (error) {
    if (error instanceof LiveBenchRequestBindingError) return invalidRequest();
    return jsonUiDataServiceUnavailable();
  }
}

export async function onLiveBenchProfileGet(input: {
  readonly request: Request;
  readonly slug: string | undefined;
  readonly db?: LiveBenchD1Database;
}): Promise<Response> {
  const fetchedAt = new Date().toISOString();
  let normalized: ProfileRequest;
  try {
    normalized = normalizeProfileRequest({ slug: input.slug });
  } catch {
    return invalidRequest();
  }
  if (!input.db) return jsonUiDataResponse(buildUnavailableUiDataEnvelope({
    method: 'profile', request: normalized, fetchedAt,
    reason: 'No verified current LiveBench release is available.',
  }), 404);
  try {
    const context = await readLiveBenchApiContext(input.db);
    if (!context) return jsonUiDataResponse(buildUnavailableUiDataEnvelope({
      method: 'profile', request: normalized, fetchedAt,
      reason: 'No verified current LiveBench release is available.',
    }), 404);
    const join = await readStrictModelJoin({
      db: input.db,
      liveBenchRevision: context.release.revision,
      asOf: fetchedAt,
    });
    const data = buildLiveBenchProfileData({
      bundle: context.bundle,
      request: normalized,
      source: context.source,
      join,
    });
    if (!data) return jsonUiDataResponse(buildUnavailableUiDataEnvelope({
      method: 'profile', request: normalized, fetchedAt,
      reason: `Model ${normalized.slug} is not present in the active LiveBench release.`,
    }), 404);
    const envelope = buildStrictModelJoinEnvelope({
      method: 'profile',
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
    const responseEtag = etag({
      liveBenchRevision: context.release.revision,
      catalogRevision: join.catalogRevision,
      modalityBenchmarkRevision: join.modalityBenchmarkRevision,
      method: 'profile',
      request: normalized,
    });
    if (input.request.headers.get('if-none-match') === responseEtag) {
      return new Response(null, { status: 304, headers: { ETag: responseEtag, 'Cache-Control': 'public, max-age=0, must-revalidate', Vary: 'Accept' } });
    }
    return jsonUiDataResponse(envelope, 200, responseEtag);
  } catch {
    return jsonUiDataServiceUnavailable();
  }
}
