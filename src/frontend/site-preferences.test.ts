// jsdom's cookie jar (tough-cookie) honours `domain=` attributes, but only for a
// domain that matches the document's own origin. Running this file on a real
// monomind.one host is what lets the multi-scope tests exercise the actual bug
// instead of a stand-in for it.
// @vitest-environment-options { "url": "https://tokenbench.monomind.one/" }
import { act, createElement, StrictMode } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { googtransCookieDomains, googtransCookieWrites, pickGoogtransLanguage } from '../site/googtrans-cookie';
import { readLanguage, readStoredTheme, setTranslatedLanguage, suppressGoogleTranslateChrome, useSitePreferences } from './site-preferences';

function PreferenceProbe() {
  const { language, theme } = useSitePreferences();
  return createElement('output', { 'data-language': language, 'data-theme': theme }, `${theme}:${language}`);
}

describe('Google Translate chrome suppression', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.cookie = 'googtrans=; Max-Age=0; path=/;';
  });

  it('uses the dark default while server-rendering without browser globals', () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('document', undefined);

    expect(readStoredTheme()).toBe('dark');
    expect(readLanguage()).toBe('en');
  });

  it('migrates the legacy unmarked dark value to the dark default without a recoverable server-markup mismatch', async () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('document', undefined);
    const serverMarkup = renderToString(createElement(StrictMode, null, createElement(PreferenceProbe)));
    vi.unstubAllGlobals();

    localStorage.setItem('tokenbench:theme', 'dark');
    document.cookie = 'googtrans=/en/zh-TW; path=/;';
    const container = document.createElement('div');
    container.innerHTML = serverMarkup;
    document.body.append(container);
    const recoverable = vi.fn();
    let root: Root | undefined;

    await act(async () => {
      root = hydrateRoot(container, createElement(StrictMode, null, createElement(PreferenceProbe)), { onRecoverableError: recoverable });
    });

    expect(serverMarkup).toContain('data-theme="dark"');
    expect(serverMarkup).toContain('data-language="en"');
    expect(recoverable).not.toHaveBeenCalled();
    expect(container.querySelector('output')).toHaveTextContent('dark:zh-TW');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('tokenbench:theme')).toBeNull();
    expect(localStorage.getItem('tokenbench:theme:explicit')).toBeNull();

    await act(async () => root?.unmount());
    container.remove();
  });

  it('hydrates an explicitly stored light/non-English preference without a recoverable server-markup mismatch', async () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('document', undefined);
    const serverMarkup = renderToString(createElement(StrictMode, null, createElement(PreferenceProbe)));
    vi.unstubAllGlobals();

    localStorage.setItem('tokenbench:theme', 'light');
    localStorage.setItem('tokenbench:theme:explicit', 'true');
    document.cookie = 'googtrans=/en/zh-TW; path=/;';
    const container = document.createElement('div');
    container.innerHTML = serverMarkup;
    document.body.append(container);
    const recoverable = vi.fn();
    let root: Root | undefined;

    await act(async () => {
      root = hydrateRoot(container, createElement(StrictMode, null, createElement(PreferenceProbe)), { onRecoverableError: recoverable });
    });

    expect(serverMarkup).toContain('data-theme="dark"');
    expect(serverMarkup).toContain('data-language="en"');
    expect(recoverable).not.toHaveBeenCalled();
    expect(container.querySelector('output')).toHaveTextContent('light:zh-TW');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('tokenbench:theme')).toBe('light');
    expect(localStorage.getItem('tokenbench:theme:explicit')).toBe('true');

    await act(async () => root?.unmount());
    container.remove();
  });

  it('hides injected configuration UI and resets its page offset', () => {
    const banner = document.createElement('div');
    banner.className = 'VIpgJd-ZVi9od-ORHb-OEVmcd';
    document.body.prepend(banner);
    document.body.style.top = '40px';
    document.documentElement.style.marginTop = '40px';

    suppressGoogleTranslateChrome();

    expect(banner).toHaveAttribute('aria-hidden', 'true');
    expect(banner.style.getPropertyValue('display')).toBe('none');
    expect(banner.style.getPropertyPriority('display')).toBe('important');
    expect(document.body.style.getPropertyValue('top')).toBe('0px');
    expect(document.body.style.getPropertyPriority('top')).toBe('important');
    expect(document.documentElement.style.getPropertyValue('margin-top')).toBe('0px');
  });

  it('keeps language changes from restoring a translated page offset', () => {
    document.body.style.top = '40px';

    setTranslatedLanguage('zh-TW');

    expect(document.documentElement.lang).toBe('zh-TW');
    expect(document.body.style.getPropertyValue('top')).toBe('0px');
    expect(document.body.style.getPropertyPriority('top')).toBe('important');
  });
});

describe('googtrans cookie scopes', () => {
  const EXPIRED = 'Thu, 01 Jan 1970 00:00:00 UTC';
  const scopes = ['', '; domain=tokenbench.monomind.one', '; domain=.tokenbench.monomind.one', '; domain=monomind.one', '; domain=.monomind.one'];
  const clearEveryScope = () => scopes.forEach((scope) => {
    document.cookie = `googtrans=; expires=${EXPIRED}; path=/${scope}`;
  });
  const cookieCount = () => document.cookie.split(';').filter((entry) => entry.trim().startsWith('googtrans=')).length;

  /**
   * What the code actually hands the browser. The cookie jar cannot be trusted
   * to answer this: happy-dom (which `main` still runs on) keys a cookie by name
   * alone, so it collapses the very multi-scope coexistence this fix is about,
   * and jsdom collapses only the `domain=<this exact host>` case. Recording the
   * writes is faithful in every environment, because it observes the code rather
   * than the shim's model of a jar.
   */
  const recordCookieWrites = (run: () => void): string[] => {
    const writes: string[] = [];
    // jsdom puts the accessor on the document or its immediate prototype;
    // happy-dom puts it three links up. Walk until one that can be called.
    let owner: object | null = document;
    let original: PropertyDescriptor | undefined;
    while (owner && !original?.set) {
      original = Object.getOwnPropertyDescriptor(owner, 'cookie');
      if (original?.set) break;
      owner = Object.getPrototypeOf(owner);
    }
    if (!owner || !original?.set || !original.get) throw new Error('document.cookie has no setter to observe');
    const { get, set } = original;
    const ownedByDocument = owner === document;
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => get.call(document),
      set: (value: string) => {
        writes.push(value);
        set.call(document, value);
      },
    });
    try {
      run();
    } finally {
      if (ownedByDocument) Object.defineProperty(document, 'cookie', original);
      else delete (document as unknown as { cookie?: unknown }).cookie;
    }
    return writes;
  };

  // Two same-named cookies at different scopes is the whole bug, so the tests
  // that need to see it are skipped rather than faked where the shim cannot
  // hold them. The write-level tests above carry the guarantee everywhere.
  const jarHoldsOneCookiePerScope = (() => {
    clearEveryScope();
    document.cookie = 'googtrans=/en/ko; domain=.monomind.one; path=/';
    document.cookie = 'googtrans=/en/ja; path=/';
    const held = cookieCount() > 1;
    clearEveryScope();
    return held;
  })();

  afterEach(clearEveryScope);

  it('names both spellings of every parent domain, and nothing for a host that has none', () => {
    expect(googtransCookieDomains('tokenbench.monomind.one')).toEqual([
      'tokenbench.monomind.one',
      '.tokenbench.monomind.one',
      'monomind.one',
      '.monomind.one',
    ]);
    expect(googtransCookieDomains('monomind.one')).toEqual(['monomind.one', '.monomind.one']);
    expect(googtransCookieDomains('localhost')).toEqual([]);
    expect(googtransCookieDomains('127.0.0.1')).toEqual([]);
    expect(googtransCookieDomains('')).toEqual([]);
  });

  it('clears every scope before setting the value at exactly one', () => {
    const writes = googtransCookieWrites('tokenbench.monomind.one', 'ko');
    const setWrites = writes.filter((write) => !write.includes('expires='));

    expect(writes.slice(0, -1).every((write) => write.includes(`expires=${EXPIRED}`))).toBe(true);
    expect(setWrites).toEqual(['googtrans=/en/ko; path=/']);
    expect(setWrites[0]).not.toContain('domain=');
    expect(writes.filter((write) => write.includes('expires='))).toHaveLength(5);
  });

  it('clears without setting anything when the visitor returns to English', () => {
    const writes = googtransCookieWrites('tokenbench.monomind.one', 'en');

    expect(writes.every((write) => write.includes(`expires=${EXPIRED}`))).toBe(true);
    expect(writes.some((write) => write.includes('googtrans=/en/'))).toBe(false);
  });

  it('writes an expiry for every scope, then one host-scoped value, on a real language change', () => {
    const writes = recordCookieWrites(() => setTranslatedLanguage('ja'));
    const cleared = writes.filter((write) => write.includes(`expires=${EXPIRED}`));
    const set = writes.filter((write) => !write.includes(`expires=${EXPIRED}`));

    expect(writes.indexOf(set[0])).toBe(writes.length - 1);
    expect(set).toEqual(['googtrans=/en/ja; path=/']);
    expect(set[0]).not.toContain('domain=');
    // The host-only copy, plus both spellings of every parent domain.
    expect(cleared).toContain(`googtrans=; expires=${EXPIRED}; path=/`);
    for (const domain of googtransCookieDomains(document.location.hostname)) {
      expect(cleared).toContain(`googtrans=; expires=${EXPIRED}; path=/; domain=${domain}`);
    }
  });

  it('writes only expiries when the visitor returns to English', () => {
    const writes = recordCookieWrites(() => setTranslatedLanguage('en'));

    expect(writes.every((write) => write.includes(`expires=${EXPIRED}`))).toBe(true);
    expect(writes.some((write) => write.includes('googtrans=/en/'))).toBe(false);
    expect(cookieCount()).toBe(0);
    expect(readLanguage()).toBe('en');
  });

  it.skipIf(!jarHoldsOneCookiePerScope)('leaves a single host-scoped cookie behind when parent scopes were already poisoned', () => {
    document.cookie = 'googtrans=/en/ko; domain=.monomind.one; path=/';
    document.cookie = 'googtrans=/en/th; domain=.tokenbench.monomind.one; path=/';
    document.cookie = 'googtrans=/en/ru; path=/';
    // jsdom keys a cookie on domain+path+name, so a `domain=<this exact host>`
    // write collapses into the host-only one where a real browser would keep
    // both. Two copies is all this jar can show; the point stands either way.
    expect(cookieCount()).toBeGreaterThan(1);

    setTranslatedLanguage('ja');

    expect(cookieCount()).toBe(1);
    expect(document.cookie).toContain('googtrans=/en/ja');
    // Removable by a host-scoped expiry alone, which is only true of a cookie
    // that carries no domain attribute.
    document.cookie = `googtrans=; expires=${EXPIRED}; path=/`;
    expect(cookieCount()).toBe(0);
  });

  it.skipIf(!jarHoldsOneCookiePerScope)('stops a stale registrable-domain cookie from winning the read', () => {
    // What a sibling monomind.one site left behind, at the scope Google rewrites.
    document.cookie = 'googtrans=/en/ko; domain=.monomind.one; path=/';
    const poisoned = document.cookie;
    const firstMatch = poisoned.split('; ').find((cookie) => cookie.startsWith('googtrans='));
    expect(firstMatch?.split('=')[1]?.split('/').at(-1)).toBe('ko');

    setTranslatedLanguage('ja');

    expect(readLanguage()).toBe('ja');
    expect(document.cookie).not.toContain('/en/ko');
  });

  it('walks past a malformed entry instead of stopping at the first one', () => {
    expect(pickGoogtransLanguage('googtrans=; googtrans=/en/ko', (code) => code === 'ko')).toBe('ko');
    expect(pickGoogtransLanguage('googtrans=/en/ko/extra; googtrans=/en/ru', (code) => code === 'ru')).toBe('ru');
    expect(pickGoogtransLanguage('googtrans=/auto/ko; googtrans=/en/fr', (code) => code === 'ko' || code === 'fr')).toBe('fr');
    expect(pickGoogtransLanguage('googtrans=null; googtrans=/en/zh-TW', (code) => code === 'zh-TW')).toBe('zh-TW');
    // A Google language this site does not offer is not one the switcher can honour.
    expect(pickGoogtransLanguage('googtrans=/en/af', (code) => code !== 'af')).toBe('en');
    expect(pickGoogtransLanguage('', () => true)).toBe('en');
  });

  it('reads a well-formed value out of the live cookie jar', () => {
    document.cookie = 'googtrans=/en/zh-TW; path=/';
    expect(readLanguage()).toBe('zh-TW');

    clearEveryScope();
    document.cookie = 'googtrans=/auto/ko; path=/';
    expect(readLanguage()).toBe('en');
  });
});
