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
