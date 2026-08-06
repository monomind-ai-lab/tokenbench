import { createDoubleOptInContact, parseBrevoConfig } from '../../_shared/brevo';
import { parseNewsletterSignup } from '../../../src/newsletter/contracts';

const MAX_REQUEST_BODY_BYTES = 8 * 1024;

interface NewsletterRequestContext {
  readonly request: Request;
  readonly env: unknown;
}

function hasSameOrigin(request: Request): boolean {
  try {
    return request.headers.get('origin') === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function isJsonContentType(contentType: string | null): boolean {
  return contentType?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';
}

function declaredBodyIsTooLarge(contentLength: string | null): boolean {
  if (!contentLength || !/^\d+$/u.test(contentLength)) return false;
  return Number(contentLength) >= MAX_REQUEST_BODY_BYTES;
}

function confirmationResponse(): Response {
  return Response.json({ status: 'confirmation-required' }, { status: 202 });
}

function temporarilyUnavailableResponse(): Response {
  return Response.json({ status: 'temporarily-unavailable' }, { status: 503 });
}

export async function onRequest({ request, env }: NewsletterRequestContext): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  if (!hasSameOrigin(request)) return new Response(null, { status: 403 });
  if (!isJsonContentType(request.headers.get('content-type'))) return new Response(null, { status: 415 });
  if (declaredBodyIsTooLarge(request.headers.get('content-length'))) return new Response(null, { status: 413 });

  let body: unknown;
  try {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength >= MAX_REQUEST_BODY_BYTES) return new Response(null, { status: 413 });
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return new Response(null, { status: 400 });
  }
  const signup = parseNewsletterSignup(body);
  if (!signup) return new Response(null, { status: 400 });
  if (signup.honeypot !== '') return confirmationResponse();

  let config: ReturnType<typeof parseBrevoConfig>;
  try {
    config = parseBrevoConfig(env);
  } catch {
    return temporarilyUnavailableResponse();
  }
  if (!config) return temporarilyUnavailableResponse();

  try {
    await createDoubleOptInContact(config, signup);
  } catch {
    return temporarilyUnavailableResponse();
  }
  return confirmationResponse();
}
