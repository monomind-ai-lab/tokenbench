import { parseComparisonQuery, type ComparisonRequest } from '../../../src/pipeline/ui-data-contract-v1-models';
import type { LiveBenchD1Database } from '../../_shared/livebench-db';
import {
  buildLiveBenchMethodEnvelope,
  buildUnavailableUiDataEnvelope,
  jsonUiDataResponse,
  jsonUiDataServiceUnavailable,
  readLiveBenchApiContext,
} from '../../_shared/livebench-v1-api';
import { buildLiveBenchComparisonData } from '../../_shared/livebench-ui-data';
import { encodeOpaqueValue } from '../../_shared/benchmark-db';

function invalidRequest(): Response {
  return jsonUiDataResponse({ error: { code: 'invalid_request', message: 'The comparison request is invalid.' } }, 400);
}

export async function onRequestGet({
  request,
  env,
}: {
  request: Request;
  env: { CATALOG_DB?: LiveBenchD1Database };
}): Promise<Response> {
  const fetchedAt = new Date().toISOString();
  let normalized: ComparisonRequest;
  try {
    const url = new URL(request.url);
    if ([...url.searchParams.keys()].some((key) => key !== 'models')) throw new Error('unknown comparison parameter');
    normalized = parseComparisonQuery(url);
  } catch {
    return invalidRequest();
  }
  if (!env.CATALOG_DB) return jsonUiDataResponse(buildUnavailableUiDataEnvelope({
    method: 'comparison', request: normalized, fetchedAt,
    reason: 'No verified current LiveBench release is available.',
  }), 404);
  try {
    const context = await readLiveBenchApiContext(env.CATALOG_DB);
    if (!context) return jsonUiDataResponse(buildUnavailableUiDataEnvelope({
      method: 'comparison', request: normalized, fetchedAt,
      reason: 'No verified current LiveBench release is available.',
    }), 404);
    const data = buildLiveBenchComparisonData({ bundle: context.bundle, request: normalized, source: context.source });
    if (!data) return jsonUiDataResponse(buildUnavailableUiDataEnvelope({
      method: 'comparison', request: normalized, fetchedAt,
      reason: 'One or more requested models are not present in the active LiveBench release.',
    }), 404);
    const envelope = buildLiveBenchMethodEnvelope({ method: 'comparison', request: normalized, data, context, fetchedAt });
    const etag = `"ui-data-${encodeOpaqueValue([context.release.revision, 'comparison', normalized])}"`;
    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': 'public, max-age=0, must-revalidate' } });
    }
    return jsonUiDataResponse(envelope, 200, etag);
  } catch {
    return jsonUiDataServiceUnavailable();
  }
}
