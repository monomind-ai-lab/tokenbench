/**
 * `googtrans` is the cookie Google Translate reads to decide which language to
 * render. Writing it is not a one-line job, for two reasons that are easy to
 * discover the hard way:
 *
 * 1. Google's injected `element.js` rewrites `googtrans` at the *registrable*
 *    domain (`.monomind.one`) rather than at the host that wrote it. A
 *    host-scoped write therefore does not replace the copy Google left behind:
 *    the two coexist under the same name, `document.cookie` serves the
 *    domain-scoped one first, and the language freezes on a stale choice for
 *    every `monomind.one` subdomain — TokenBench re-poisons its siblings.
 *    Clearing every scope the pair can occupy *before* writing is what keeps a
 *    single copy in the jar. Do not simplify this back into one write.
 *
 * 2. Because same-named cookies can coexist at different scopes, a first-match
 *    read is the other half of the trap. Read every `googtrans` entry and take
 *    the first one that is actually well-formed and supported.
 */

export const GOOGTRANS_COOKIE_NAME = 'googtrans';

const EXPIRED = 'Thu, 01 Jan 1970 00:00:00 UTC';
const IPV4_HOSTNAME = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/**
 * Every parent-domain scope a `googtrans` copy can be hiding at, each in both
 * the bare and leading-dot spelling, because a cookie written as
 * `domain=.monomind.one` is only removable by an expiry that names the same
 * domain. A bare IPv4 host has no parent domains, and neither does a
 * single-label host such as `localhost`.
 */
export function googtransCookieDomains(hostname: string): readonly string[] {
  if (!hostname || IPV4_HOSTNAME.test(hostname)) return [];
  const labels = hostname.split('.');
  const domains: string[] = [];
  for (let start = 0; start <= labels.length - 2; start += 1) {
    const suffix = labels.slice(start).join('.');
    domains.push(suffix, `.${suffix}`);
  }
  return domains;
}

/**
 * The exact `document.cookie` writes a language change performs, in order:
 * every scope cleared first, then the new value set at exactly one scope — the
 * host, with no `domain` attribute — so nothing we write can outlive this host.
 */
export function googtransCookieWrites(hostname: string, language: string): readonly string[] {
  const clear = `${GOOGTRANS_COOKIE_NAME}=; expires=${EXPIRED}; path=/`;
  const writes = [clear, ...googtransCookieDomains(hostname).map((domain) => `${clear}; domain=${domain}`)];
  // English is the untranslated source language: Google reads the *absence* of
  // the cookie as "leave the page alone", so the cleared jar is the whole write.
  if (language !== 'en') writes.push(`${GOOGTRANS_COOKIE_NAME}=/en/${language}; path=/`);
  return writes;
}

/**
 * The language a cookie header actually asks for. Deliberately not a first-match
 * read: a stale domain-scoped copy sorts ahead of the host-scoped one, so every
 * `googtrans` entry is considered and the first well-formed `/en/<code>` whose
 * code is supported wins. Anything else — a legacy value, `/auto/<code>`, a
 * language this site does not offer — falls back to untranslated English.
 */
export function pickGoogtransLanguage(cookieHeader: string, isSupported: (code: string) => boolean): string {
  for (const entry of cookieHeader.split(';')) {
    const cookie = entry.trim();
    if (!cookie.startsWith(`${GOOGTRANS_COOKIE_NAME}=`)) continue;
    const segments = cookie.slice(GOOGTRANS_COOKIE_NAME.length + 1).split('/');
    const [leading, source, code] = segments;
    if (segments.length !== 3 || leading !== '' || source !== 'en') continue;
    if (isSupported(code)) return code;
  }
  return 'en';
}

/** Clear `googtrans` at every scope it can occupy, then set it at the host only. */
export function applyGoogtransCookie(language: string): void {
  for (const write of googtransCookieWrites(document.location.hostname, language)) {
    document.cookie = write;
  }
}
