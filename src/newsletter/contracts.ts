export interface NewsletterSignup {
  readonly email: string;
  readonly monthlyCheatsheet: true;
  readonly modelAndPriceAlerts: boolean;
  readonly context: 'footer' | 'compare';
  readonly honeypot: string;
}

const SIGNUP_FIELDS = new Set(['email', 'monthlyCheatsheet', 'modelAndPriceAlerts', 'context', 'honeypot']);
const MAX_EMAIL_LENGTH = 254;
const MAX_LOCAL_PART_LENGTH = 64;
const MAX_DOMAIN_LENGTH = 253;
const EMAIL_CONTROL_OR_WHITESPACE_PATTERN = /[\u0000-\u001f\u007f-\u009f\s]/u;
const DOMAIN_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/iu;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactSignupFields(value: Record<string, unknown>): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === SIGNUP_FIELDS.size
    && keys.every((key) => typeof key === 'string' && SIGNUP_FIELDS.has(key));
}

function isValidEmailAddress(email: string): boolean {
  if (email.length > MAX_EMAIL_LENGTH || EMAIL_CONTROL_OR_WHITESPACE_PATTERN.test(email)) return false;

  const separator = email.indexOf('@');
  if (separator <= 0 || separator !== email.lastIndexOf('@') || separator === email.length - 1) return false;

  const localPart = email.slice(0, separator);
  const domain = email.slice(separator + 1);
  if (localPart.length > MAX_LOCAL_PART_LENGTH || domain.length > MAX_DOMAIN_LENGTH) return false;

  const labels = domain.split('.');
  return labels.length >= 2 && labels.every((label) => DOMAIN_LABEL_PATTERN.test(label));
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
    if (!isValidEmailAddress(normalizedEmail)) return null;

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
