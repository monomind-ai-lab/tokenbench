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

  it('returns a typed secret-free error when the DOI request times out', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('request timeout')), { once: true });
    }));
    try {
      const request = createDoubleOptInContact(config(), signup(), fetchImpl);
      const failure = request.catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(60_000);
      const resolvedFailure = await failure;

      expect(resolvedFailure).toBeInstanceOf(BrevoUpstreamError);
      expect(resolvedFailure).toMatchObject({ status: null });
      expect(String(resolvedFailure)).not.toContain('builder@example.com');
      expect(String(resolvedFailure)).not.toContain('test-api-key');
    } finally {
      vi.useRealTimers();
    }
  });
});
