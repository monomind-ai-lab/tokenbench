import { describe, expect, it, vi } from 'vitest';
import type { NewsletterSignup } from '../../src/newsletter/contracts';
import {
  BrevoUpstreamError,
  createDoubleOptInContact,
  parseBrevoConfig,
} from './brevo';

function config() {
  return {
    apiKey: 'test-api-key',
    cheatsheetListId: 11,
    alertsListId: 12,
    doiTemplateId: 21,
    doiRedirectUrl: 'https://tokenbench.monomind.one/newsletter/confirmed/',
  };
}

function bindings(overrides: Record<string, unknown> = {}) {
  return {
    BREVO_API_KEY: 'test-api-key',
    BREVO_CHEATSHEET_LIST_ID: '11',
    BREVO_ALERTS_LIST_ID: '12',
    BREVO_DOI_TEMPLATE_ID: '21',
    BREVO_DOI_REDIRECT_URL: 'https://tokenbench.monomind.one/newsletter/confirmed/',
    ...overrides,
  };
}

function signup(overrides: Partial<NewsletterSignup> = {}): NewsletterSignup {
  return {
    email: 'builder@example.com',
    monthlyCheatsheet: true,
    modelAndPriceAlerts: false,
    context: 'footer',
    honeypot: '',
    ...overrides,
  };
}

describe('parseBrevoConfig', () => {
  it('parses required configuration from Pages Function bindings', () => {
    expect(parseBrevoConfig(bindings())).toEqual(config());
  });

  it('rejects incomplete or malformed Pages Function bindings', () => {
    expect(parseBrevoConfig(bindings({ BREVO_API_KEY: '  ' }))).toBeNull();
    expect(parseBrevoConfig(bindings({ BREVO_CHEATSHEET_LIST_ID: '0' }))).toBeNull();
    expect(parseBrevoConfig(bindings({ BREVO_ALERTS_LIST_ID: '12.5' }))).toBeNull();
    expect(parseBrevoConfig(bindings({ BREVO_DOI_TEMPLATE_ID: 'not-an-id' }))).toBeNull();
    expect(parseBrevoConfig(bindings({ BREVO_DOI_REDIRECT_URL: 'not a URL' }))).toBeNull();
  });
});

describe('createDoubleOptInContact', () => {
  it.each([
    [false, [11]],
    [true, [11, 12]],
  ])('maps alert consent %s to the documented Brevo list IDs', async (modelAndPriceAlerts, includeListIds) => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }));

    await createDoubleOptInContact(config(), signup({ modelAndPriceAlerts }), fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://api.brevo.com/v3/contacts/doubleOptinConfirmation');
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'api-key': 'test-api-key',
      },
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      email: 'builder@example.com',
      includeListIds,
      templateId: 21,
      redirectionUrl: 'https://tokenbench.monomind.one/newsletter/confirmed/',
    });
  });

  it('returns a typed secret-free error for a non-201 Brevo response', async () => {
    const responseBody = 'builder@example.com cannot subscribe with test-api-key';
    const failure = await createDoubleOptInContact(
      config(),
      signup(),
      vi.fn().mockResolvedValue(new Response(responseBody, { status: 503 })),
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(BrevoUpstreamError);
    expect(failure).toMatchObject({ status: 503 });
    expect(String(failure)).not.toContain('builder@example.com');
    expect(String(failure)).not.toContain('test-api-key');
    expect(String(failure)).not.toContain(responseBody);
  });

  it.each([200, 202])('rejects successful-looking HTTP %i because DOI requires 201', async (status) => {
    const failure = await createDoubleOptInContact(
      config(),
      signup(),
      vi.fn().mockResolvedValue(new Response('{}', { status })),
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(BrevoUpstreamError);
    expect(failure).toMatchObject({ status });
  });

  it('times out at exactly 10,000ms when fetch ignores abort', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    });
    const pending = Symbol('pending');
    let outcome: unknown = pending;
    try {
      const observed = createDoubleOptInContact(config(), signup(), fetchImpl).then(
        () => { outcome = new Error('DOI request unexpectedly resolved'); },
        (error: unknown) => { outcome = error; },
      );

      expect(requestSignal).toBeDefined();
      expect(requestSignal?.aborted).toBe(false);
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(9_999);
      expect(requestSignal?.aborted).toBe(false);
      expect(outcome).toBe(pending);

      await vi.advanceTimersByTimeAsync(1);
      expect(requestSignal?.aborted).toBe(true);
      expect(outcome).not.toBe(pending);
      expect(outcome).toBeInstanceOf(BrevoUpstreamError);
      expect(outcome).toMatchObject({ status: null });
      expect(String(outcome)).not.toContain('builder@example.com');
      expect(String(outcome)).not.toContain('test-api-key');
      expect(vi.getTimerCount()).toBe(0);

      await observed;
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
});
