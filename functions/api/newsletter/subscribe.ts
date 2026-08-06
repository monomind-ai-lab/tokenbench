import {
  BrevoUpstreamError,
  createDoubleOptInContact,
  parseBrevoConfig,
} from '../../_shared/brevo';
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

type RequestBodyReadResult =
  | { readonly kind: 'complete'; readonly bytes: Uint8Array }
  | { readonly kind: 'too-large' };

function cancelReader(reader: ReadableStreamDefaultReader<Uint8Array>): void {
  try {
    void reader.cancel().catch(() => undefined);
  } catch {
    // The size boundary is already known; cancellation cannot change it.
  }
}

async function readRequestBody(stream: ReadableStream<Uint8Array>): Promise<RequestBodyReadResult> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength >= MAX_REQUEST_BODY_BYTES - totalBytes) {
        cancelReader(reader);
        return { kind: 'too-large' };
      }
      chunks.push(value);
      totalBytes += value.byteLength;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // A malformed stream must not escape the endpoint boundary.
    }
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { kind: 'complete', bytes };
}

export async function onRequest({ request, env }: NewsletterRequestContext): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  if (!hasSameOrigin(request)) return new Response(null, { status: 403 });
  if (!isJsonContentType(request.headers.get('content-type'))) return new Response(null, { status: 415 });
  if (declaredBodyIsTooLarge(request.headers.get('content-length'))) return new Response(null, { status: 413 });
  let requestBody: ReadableStream<Uint8Array> | null;
  try {
    requestBody = request.body;
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!requestBody) return new Response(null, { status: 400 });

  let body: unknown;
  try {
    const bodyRead = await readRequestBody(requestBody);
    if (bodyRead.kind === 'too-large') return new Response(null, { status: 413 });
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bodyRead.bytes));
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
  } catch (error) {
    if (error instanceof BrevoUpstreamError && error.status === 409) return confirmationResponse();
    return temporarilyUnavailableResponse();
  }
  return confirmationResponse();
}
