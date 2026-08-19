import {
  normalizeSubscriptionRequest,
  parseSubscriptionBody,
  type SubscriptionRequest,
} from '../../../src/pipeline/ui-data-contract-v1-subscription';
import {
  buildUnavailableUiDataEnvelope,
  jsonUiDataResponse,
} from '../../_shared/livebench-v1-api';

function unavailable(request: SubscriptionRequest, fetchedAt: string): Response {
  return jsonUiDataResponse(buildUnavailableUiDataEnvelope({
    method: 'subscription',
    request,
    fetchedAt,
    reason: 'No verified subscription/catalog projection is available.',
  }), 404);
}

function invalidRequest(): Response {
  return jsonUiDataResponse({ error: { code: 'invalid_request', message: 'The subscription request is invalid.' } }, 400);
}

export async function onRequestGet({ request }: { request: Request }): Promise<Response> {
  const fetchedAt = new Date().toISOString();
  try {
    const url = new URL(request.url);
    if ([...url.searchParams.keys()].some((key) => key !== 'operation')
      || url.searchParams.getAll('operation').length > 1) throw new Error('invalid subscription query');
    const normalized = normalizeSubscriptionRequest({ operation: url.searchParams.get('operation') ?? 'catalog' });
    return unavailable(normalized, fetchedAt);
  } catch {
    return invalidRequest();
  }
}

export async function onRequestPost({ request }: { request: Request }): Promise<Response> {
  const fetchedAt = new Date().toISOString();
  try {
    const normalized = parseSubscriptionBody(new Uint8Array(await request.arrayBuffer()));
    return unavailable(normalized, fetchedAt);
  } catch {
    return invalidRequest();
  }
}
