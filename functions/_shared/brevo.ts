import type { NewsletterSignup } from '../../src/newsletter/contracts';

const BREVO_DOUBLE_OPT_IN_URL = 'https://api.brevo.com/v3/contacts/doubleOptinConfirmation';
const BREVO_REQUEST_TIMEOUT_MS = 10_000;

export interface BrevoConfig {
  readonly apiKey: string;
  readonly cheatsheetListId: number;
  readonly alertsListId: number;
  readonly doiTemplateId: number;
  readonly doiRedirectUrl: string;
}

/** The server-only bindings supplied by a Cloudflare Pages Function. */
export interface BrevoBindings {
  readonly BREVO_API_KEY?: unknown;
  readonly BREVO_CHEATSHEET_LIST_ID?: unknown;
  readonly BREVO_ALERTS_LIST_ID?: unknown;
  readonly BREVO_DOI_TEMPLATE_ID?: unknown;
  readonly BREVO_DOI_REDIRECT_URL?: unknown;
}

export type BrevoFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class BrevoUpstreamError extends Error {
  readonly status: number | null;

  constructor(status: number | null) {
    super(status === null
      ? 'Brevo double opt-in request failed'
      : `Brevo double opt-in request failed with status ${status}`);
    this.name = 'BrevoUpstreamError';
    this.status = status;
  }
}

function isBindingRecord(value: unknown): value is BrevoBindings {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function positiveBindingId(value: unknown): number | null {
  const normalized = requiredString(value);
  if (!normalized || !/^\d+$/u.test(normalized)) return null;
  const id = Number(normalized);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function reviewedRedirectUrl(value: unknown): string | null {
  const normalized = requiredString(value);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    return url.protocol === 'https:' && !url.username && !url.password ? normalized : null;
  } catch {
    return null;
  }
}

/**
 * Reads Brevo settings exclusively from a Pages Function's `env` bindings.
 * It intentionally never reads process or browser environment variables.
 */
export function parseBrevoConfig(bindings: unknown): BrevoConfig | null {
  if (!isBindingRecord(bindings)) return null;

  try {
    const apiKey = requiredString(bindings.BREVO_API_KEY);
    const cheatsheetListId = positiveBindingId(bindings.BREVO_CHEATSHEET_LIST_ID);
    const alertsListId = positiveBindingId(bindings.BREVO_ALERTS_LIST_ID);
    const doiTemplateId = positiveBindingId(bindings.BREVO_DOI_TEMPLATE_ID);
    const doiRedirectUrl = reviewedRedirectUrl(bindings.BREVO_DOI_REDIRECT_URL);
    if (apiKey === null || cheatsheetListId === null || alertsListId === null
      || doiTemplateId === null || doiRedirectUrl === null) {
      return null;
    }
    return { apiKey, cheatsheetListId, alertsListId, doiTemplateId, doiRedirectUrl };
  } catch {
    return null;
  }
}

function awaitWithAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error('Brevo request aborted'));

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      callback();
    };
    const abort = () => settle(() => reject(new Error('Brevo request aborted')));
    signal.addEventListener('abort', abort, { once: true });
    operation.then(
      (value) => settle(() => resolve(value)),
      (error) => settle(() => reject(error)),
    );
  });
}

/** Sends one DOI request without exposing upstream response data to callers. */
export async function createDoubleOptInContact(
  config: BrevoConfig,
  signup: NewsletterSignup,
  fetchImpl: BrevoFetch = (input, init) => globalThis.fetch(input, init),
): Promise<void> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), BREVO_REQUEST_TIMEOUT_MS);
  const includeListIds = signup.modelAndPriceAlerts
    ? [config.cheatsheetListId, config.alertsListId]
    : [config.cheatsheetListId];

  try {
    const response = await awaitWithAbort(
      fetchImpl(BREVO_DOUBLE_OPT_IN_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'api-key': config.apiKey,
        },
        body: JSON.stringify({
          email: signup.email,
          includeListIds,
          templateId: config.doiTemplateId,
          redirectionUrl: config.doiRedirectUrl,
        }),
        signal: controller.signal,
      }),
      controller.signal,
    );
    if (response.status !== 201) throw new BrevoUpstreamError(response.status);
  } catch (error) {
    if (error instanceof BrevoUpstreamError) throw error;
    throw new BrevoUpstreamError(null);
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
