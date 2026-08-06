export interface NewsletterSignup {
  readonly email: string;
  readonly monthlyCheatsheet: true;
  readonly modelAndPriceAlerts: boolean;
  readonly context: 'footer' | 'compare';
  readonly honeypot: string;
}

const SIGNUP_FIELDS = new Set(['email', 'monthlyCheatsheet', 'modelAndPriceAlerts', 'context', 'honeypot']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactSignupFields(value: Record<string, unknown>): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === SIGNUP_FIELDS.size
    && keys.every((key) => typeof key === 'string' && SIGNUP_FIELDS.has(key));
}

/**
 * Parses only the fields accepted by the newsletter endpoint. The result is a
 * fresh object so callers never consume unknown or inherited request fields.
 */
export function parseNewsletterSignup(value: unknown): NewsletterSignup | null {
  if (!isObjectRecord(value)) return null;

  try {
    if (!hasExactSignupFields(value)) return null;
    const { email, monthlyCheatsheet, modelAndPriceAlerts, context, honeypot } = value;
    if (typeof email !== 'string' || monthlyCheatsheet !== true
      || typeof modelAndPriceAlerts !== 'boolean'
      || (context !== 'footer' && context !== 'compare')
      || typeof honeypot !== 'string') {
      return null;
    }

    const normalizedEmail = email.trim();
    if (!EMAIL_PATTERN.test(normalizedEmail)) return null;

    return {
      email: normalizedEmail,
      monthlyCheatsheet,
      modelAndPriceAlerts,
      context,
      honeypot,
    };
  } catch {
    return null;
  }
}
