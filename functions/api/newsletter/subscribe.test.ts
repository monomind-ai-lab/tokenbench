import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from './subscribe';

const ORIGIN = 'https://tokenbench.monomind.one';

function signup(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    email: 'builder@example.com',
    monthlyCheatsheet: true,
    modelAndPriceAlerts: false,
    context: 'footer',
    honeypot: '',
    ...overrides,
  };
}

function validRequest(overrides: Record<string, unknown> = {}): Request {
  const body = JSON.stringify(signup(overrides));
  const request = new Request(`${ORIGIN}/api/newsletter/subscribe`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': String(new TextEncoder().encode(body).byteLength),
    },
    body,
  });
  // happy-dom removes forbidden request headers from its constructor, whereas
  // a browser's outgoing same-origin request includes Origin. Add it after
  // construction to model the Pages Function boundary accurately.
  request.headers.set('origin', ORIGIN);
  return request;
}

function configuredEnv(overrides: Record<string, unknown> = {}) {
  return {
    BREVO_API_KEY: 'test-api-key',
    BREVO_CHEATSHEET_LIST_ID: '11',
    BREVO_ALERTS_LIST_ID: '12',
    BREVO_DOI_TEMPLATE_ID: '21',
    BREVO_DOI_REDIRECT_URL: `${ORIGIN}/newsletter/confirmed/`,
    ...overrides,
  };
}

function context(request: Request, env: unknown = configuredEnv()) {
  return { request, env };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('POST /api/newsletter/subscribe', () => {
  it('returns only a generic confirmation response for a valid same-origin signup', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchImpl);

    const response = await onRequest(context(validRequest()));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ status: 'confirmation-required' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each(['GET', 'OPTIONS'])('rejects %s with an explicit Allow header', async (method) => {
    const response = await onRequest(context(new Request(`${ORIGIN}/api/newsletter/subscribe`, {
      method,
    })));

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
  });

  it.each([
    ['a missing Origin header', undefined],
    ['a mismatched Origin header', 'https://attacker.example'],
  ])('rejects %s before calling Brevo', async (_caseName, origin) => {
    const readBody = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchImpl);
    const headers = new Headers({
      'content-type': 'application/json',
      'content-length': '1',
    });
    if (origin) headers.set('origin', origin);
    const request = {
      method: 'POST',
      url: `${ORIGIN}/api/newsletter/subscribe`,
      headers,
      arrayBuffer: readBody,
    } as unknown as Request;

    const response = await onRequest(context(request));

    expect(response.status).toBe(403);
    expect(readBody).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a non-JSON body before calling Brevo', async () => {
    const body = JSON.stringify(signup());
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchImpl);
    const request = new Request(`${ORIGIN}/api/newsletter/subscribe`, {
      method: 'POST',
      headers: {
        'content-type': 'text/plain',
        'content-length': String(new TextEncoder().encode(body).byteLength),
      },
      body,
    });
    request.headers.set('origin', ORIGIN);

    const response = await onRequest(context(request));

    expect(response.status).toBe(415);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ['malformed JSON', '{'],
    ['a payload outside the signup contract', JSON.stringify({ email: 'builder@example.com' })],
    ['an invalid email address', JSON.stringify(signup({ email: 'not-an-email' }))],
  ])('returns 400 for %s without calling Brevo', async (_caseName, body) => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchImpl);
    const request = new Request(`${ORIGIN}/api/newsletter/subscribe`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-length': String(new TextEncoder().encode(body).byteLength),
      },
      body,
    });
    request.headers.set('origin', ORIGIN);

    const response = await onRequest(context(request));

    expect(response.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns 400 when the JSON request body cannot be read', async () => {
    const readBody = vi.fn().mockRejectedValue(new Error('request body unavailable'));
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchImpl);
    const request = {
      method: 'POST',
      url: `${ORIGIN}/api/newsletter/subscribe`,
      headers: new Headers({ 'content-type': 'application/json', origin: ORIGIN }),
      arrayBuffer: readBody,
    } as unknown as Request;

    const response = await onRequest(context(request));

    expect(response.status).toBe(400);
    expect(readBody).toHaveBeenCalledTimes(1);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a declared 8 KiB body before reading it or calling Brevo', async () => {
    const readBody = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchImpl);
    const request = {
      method: 'POST',
      url: `${ORIGIN}/api/newsletter/subscribe`,
      headers: new Headers({
        'content-type': 'application/json',
        'content-length': '8192',
        origin: ORIGIN,
      }),
      arrayBuffer: readBody,
    } as unknown as Request;

    const response = await onRequest(context(request));

    expect(response.status).toBe(413);
    expect(readBody).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects an oversized body when its Content-Length lies', async () => {
    const body = JSON.stringify(signup({ honeypot: 'x'.repeat(8_192) }));
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchImpl);
    expect(new TextEncoder().encode(body).byteLength).toBeGreaterThanOrEqual(8_192);
    const request = new Request(`${ORIGIN}/api/newsletter/subscribe`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': '1',
      },
      body,
    });
    request.headers.set('origin', ORIGIN);

    const response = await onRequest(context(request));

    expect(response.status).toBe(413);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects an actual 8,192-byte body despite a small Content-Length', async () => {
    const baseBody = JSON.stringify(signup());
    const body = JSON.stringify(signup({ honeypot: 'x'.repeat(8_192 - new TextEncoder().encode(baseBody).byteLength) }));
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchImpl);
    expect(new TextEncoder().encode(body).byteLength).toBe(8_192);
    const request = new Request(`${ORIGIN}/api/newsletter/subscribe`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': '1',
      },
      body,
    });
    request.headers.set('origin', ORIGIN);

    const response = await onRequest(context(request));

    expect(response.status).toBe(413);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns the generic confirmation response for a filled honeypot without calling Brevo', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchImpl);

    const response = await onRequest(context(validRequest({ honeypot: 'bot-filled-this' }), {}));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ status: 'confirmation-required' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('accepts a 8,191-byte valid honeypot request without calling Brevo', async () => {
    const baseBody = JSON.stringify(signup());
    const body = JSON.stringify(signup({ honeypot: 'x'.repeat(8_191 - new TextEncoder().encode(baseBody).byteLength) }));
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchImpl);
    expect(new TextEncoder().encode(body).byteLength).toBe(8_191);
    const request = new Request(`${ORIGIN}/api/newsletter/subscribe`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': '8191',
      },
      body,
    });
    request.headers.set('origin', ORIGIN);

    const response = await onRequest(context(request, {}));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ status: 'confirmation-required' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns a generic retryable response when Brevo is not configured', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchImpl);

    const response = await onRequest(context(validRequest(), {}));

    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toBe('{"status":"temporarily-unavailable"}');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns a generic retryable response when Brevo binding inspection fails', async () => {
    const binding = Proxy.revocable({}, {});
    binding.revoke();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchImpl);

    const response = await onRequest(context(validRequest(), binding.proxy));

    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toBe('{"status":"temporarily-unavailable"}');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns a generic retryable response without exposing a Brevo error body', async () => {
    const upstreamBody = 'builder@example.com rejected by Brevo with test-api-key';
    const fetchImpl = vi.fn().mockResolvedValue(new Response(upstreamBody, { status: 503 }));
    vi.stubGlobal('fetch', fetchImpl);

    const response = await onRequest(context(validRequest()));
    const responseBody = await response.text();

    expect(response.status).toBe(503);
    expect(responseBody).toBe('{"status":"temporarily-unavailable"}');
    expect(responseBody).not.toContain('builder@example.com');
    expect(responseBody).not.toContain('test-api-key');
    expect(responseBody).not.toContain(upstreamBody);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not reveal whether a Brevo contact already exists', async () => {
    const upstreamBody = 'builder@example.com is already a contact';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(upstreamBody, { status: 409 })));

    const response = await onRequest(context(validRequest()));
    const responseBody = await response.text();

    expect(response.status).toBe(503);
    expect(responseBody).toBe('{"status":"temporarily-unavailable"}');
    expect(responseBody).not.toContain('builder@example.com');
    expect(responseBody).not.toContain('already');
  });

  it('returns a generic retryable response when Brevo fetch rejects', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network unavailable'));
    vi.stubGlobal('fetch', fetchImpl);

    const response = await onRequest(context(validRequest()));

    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toBe('{"status":"temporarily-unavailable"}');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('returns a generic retryable response when Brevo fetch times out', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal('fetch', fetchImpl);
    try {
      const pendingResponse = onRequest(context(validRequest()));
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchImpl).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(10_000);
      const response = await pendingResponse;

      expect(response.status).toBe(503);
      await expect(response.text()).resolves.toBe('{"status":"temporarily-unavailable"}');
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('does not log a signup address, API key, or Brevo response body', async () => {
    const upstreamBody = 'builder@example.com rejected by Brevo with test-api-key';
    const consoleSpies = [
      vi.spyOn(console, 'debug'),
      vi.spyOn(console, 'error'),
      vi.spyOn(console, 'info'),
      vi.spyOn(console, 'log'),
      vi.spyOn(console, 'warn'),
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(upstreamBody, { status: 503 })));

    await onRequest(context(validRequest()));

    for (const consoleSpy of consoleSpies) expect(consoleSpy).not.toHaveBeenCalled();
  });
});
