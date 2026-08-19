import {
  normalizeLifecycleRequest,
  type LifecycleRequest,
} from '../../../src/pipeline/ui-data-contract-v1-models';
import {
  buildUnavailableUiDataEnvelope,
  jsonUiDataResponse,
} from '../../_shared/livebench-v1-api';

export async function onRequestGet({ request }: { request: Request }): Promise<Response> {
  const fetchedAt = new Date().toISOString();
  let normalized: LifecycleRequest;
  try {
    const url = new URL(request.url);
    if ([...url.searchParams.keys()].some((key) => key !== 'asOf' && key !== 'horizonDays')) {
      throw new Error('unknown lifecycle parameter');
    }
    if (url.searchParams.getAll('asOf').length !== 1 || url.searchParams.getAll('horizonDays').length !== 1) {
      throw new Error('duplicate or missing lifecycle parameter');
    }
    normalized = normalizeLifecycleRequest({
      asOf: url.searchParams.get('asOf'),
      horizonDays: Number(url.searchParams.get('horizonDays')),
    });
  } catch {
    return jsonUiDataResponse({ error: { code: 'invalid_request', message: 'The lifecycle request is invalid.' } }, 400);
  }
  return jsonUiDataResponse(buildUnavailableUiDataEnvelope({
    method: 'lifecycle',
    request: normalized,
    fetchedAt,
    reason: 'No verified lifecycle projection is available; LiveBench is not a lifecycle source.',
  }), 404);
}
