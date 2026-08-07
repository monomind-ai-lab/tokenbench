import { act, createElement, StrictMode } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('uses the light default while server-rendering without browser globals', () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('document', undefined);

    expect(readStoredTheme()).toBe('light');
    expect(readLanguage()).toBe('en');
  });

  it('migrates the legacy auto-persisted dark value to light without a recoverable server-markup mismatch', async () => {
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

    expect(serverMarkup).toContain('data-theme="light"');
    expect(serverMarkup).toContain('data-language="en"');
    expect(recoverable).not.toHaveBeenCalled();
    expect(container.querySelector('output')).toHaveTextContent('light:zh-TW');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('tokenbench:theme')).toBeNull();
    expect(localStorage.getItem('tokenbench:theme:explicit')).toBeNull();

    await act(async () => root?.unmount());
    container.remove();
  });

  it('hydrates an explicitly stored dark/non-English preference without a recoverable server-markup mismatch', async () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('document', undefined);
    const serverMarkup = renderToString(createElement(StrictMode, null, createElement(PreferenceProbe)));
    vi.unstubAllGlobals();

    localStorage.setItem('tokenbench:theme', 'dark');
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

    expect(serverMarkup).toContain('data-theme="light"');
    expect(serverMarkup).toContain('data-language="en"');
    expect(recoverable).not.toHaveBeenCalled();
    expect(container.querySelector('output')).toHaveTextContent('dark:zh-TW');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('tokenbench:theme')).toBe('dark');
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
