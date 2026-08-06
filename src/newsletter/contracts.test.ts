import { describe, expect, it } from 'vitest';
import { parseNewsletterSignup } from './contracts';

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

describe('parseNewsletterSignup', () => {
  it('normalizes surrounding whitespace in a valid email address', () => {
    expect(parseNewsletterSignup(signup({ email: '  builder@example.com  ' }))).toEqual({
      email: 'builder@example.com',
      monthlyCheatsheet: true,
      modelAndPriceAlerts: false,
      context: 'footer',
      honeypot: '',
    });
  });

  it('rejects an invalid email address', () => {
    expect(parseNewsletterSignup(signup({ email: 'not-an-email' }))).toBeNull();
  });

  it.each([
    ['an empty domain label', 'a@b..com'],
    ['a leading domain-label hyphen', 'a@-builder.example'],
    ['a trailing domain-label hyphen', 'a@builder-.example'],
    ['a domain label longer than 63 characters', `a@${'b'.repeat(64)}.com`],
  ])('rejects %s', (_case, email) => {
    expect(parseNewsletterSignup(signup({ email }))).toBeNull();
  });

  it.each([
    ['NUL', 'a\u0000@b.com'],
    ['DEL', 'a@b\u007f.com'],
    ['C1 NEL', 'a\u0085@b.com'],
  ])('rejects the %s control character in an email address', (_case, email) => {
    expect(parseNewsletterSignup(signup({ email }))).toBeNull();
  });

  it('enforces local-part, domain, and total address length limits', () => {
    const localTooLong = `${'a'.repeat(65)}@example.com`;
    const domainTooLong = ['b'.repeat(63), 'c'.repeat(63), 'd'.repeat(63), 'e'.repeat(62)].join('.');
    const addressTooLong = `${'a'.repeat(64)}@${['b'.repeat(63), 'c'.repeat(63), 'd'.repeat(62)].join('.')}`;

    expect(domainTooLong).toHaveLength(254);
    expect(addressTooLong).toHaveLength(255);
    expect(parseNewsletterSignup(signup({ email: localTooLong }))).toBeNull();
    expect(parseNewsletterSignup(signup({ email: `a@${domainTooLong}` }))).toBeNull();
    expect(parseNewsletterSignup(signup({ email: addressTooLong }))).toBeNull();
  });

  it('accepts a normal tagged address with a hyphenated subdomain', () => {
    const normalEmail = 'First.Last+alerts@sub-domain.example.co.uk';

    expect(parseNewsletterSignup(signup({ email: normalEmail }))).toMatchObject({ email: normalEmail });
  });

  it('accepts the 64-character local and 254-character total address boundary', () => {
    const boundaryEmail = `${'a'.repeat(64)}@${['b'.repeat(63), 'c'.repeat(63), 'd'.repeat(61)].join('.')}`;

    expect(boundaryEmail).toHaveLength(254);
    expect(parseNewsletterSignup(signup({ email: boundaryEmail }))).toMatchObject({ email: boundaryEmail });
  });

  it('rejects fields outside the explicit signup contract', () => {
    expect(parseNewsletterSignup(signup({ campaign: 'summer' }))).toBeNull();
  });

  it('requires each consent, context, and honeypot field with its documented type', () => {
    expect(parseNewsletterSignup(signup({ monthlyCheatsheet: false }))).toBeNull();
    expect(parseNewsletterSignup(signup({ modelAndPriceAlerts: 'false' }))).toBeNull();
    expect(parseNewsletterSignup(signup({ context: 'header' }))).toBeNull();
    expect(parseNewsletterSignup(signup({ honeypot: false }))).toBeNull();
  });
});
