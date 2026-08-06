import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from 'react';
import { SITE_CONFIG } from '../brand/site-config';

export type ThemeMode = 'light' | 'dark';

const SiteThemeContext = createContext<ThemeMode>('dark');

export function SiteThemeProvider({ theme, children }: { readonly theme: ThemeMode; readonly children: ReactNode }) {
  return createElement(SiteThemeContext.Provider, { value: theme }, children);
}

export function useSiteTheme(): ThemeMode {
  return useContext(SiteThemeContext);
}

export function readStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  try {
    return window.localStorage.getItem(SITE_CONFIG.themeStorageKey) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function readLanguage(): string {
  if (typeof document === 'undefined') return 'en';
  const match = document.cookie.split('; ').find((cookie) => cookie.startsWith('googtrans='));
  return match?.split('=')[1]?.split('/').at(-1) || 'en';
}

const GOOGLE_TRANSLATE_CHROME = [
  '.goog-te-banner-frame',
  '.skiptranslate iframe',
  '.VIpgJd-ZVi9od-ORHb-OEVmcd',
  '.VIpgJd-ZVi9od-aZ2wEe-wOHMyf',
  'body > .skiptranslate',
].join(',');

export function suppressGoogleTranslateChrome(): void {
  document.querySelectorAll<HTMLElement>(GOOGLE_TRANSLATE_CHROME).forEach((element) => {
    if (element.id === 'google_translate_element') return;
    element.setAttribute('aria-hidden', 'true');
    element.style.setProperty('display', 'none', 'important');
    element.style.setProperty('height', '0', 'important');
    element.style.setProperty('visibility', 'hidden', 'important');
  });

  if (document.body.style.getPropertyValue('top') !== '0px' || document.body.style.getPropertyPriority('top') !== 'important') {
    document.body.style.setProperty('top', '0px', 'important');
  }
  if (document.documentElement.style.getPropertyValue('margin-top') !== '0px' || document.documentElement.style.getPropertyPriority('margin-top') !== 'important') {
    document.documentElement.style.setProperty('margin-top', '0px', 'important');
  }
}

function watchGoogleTranslateChrome(): () => void {
  suppressGoogleTranslateChrome();
  const observer = new MutationObserver(suppressGoogleTranslateChrome);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  observer.observe(document.body, { attributes: true, attributeFilter: ['style'] });
  return () => observer.disconnect();
}

export function setTranslatedLanguage(nextLanguage: string): void {
  document.documentElement.lang = nextLanguage;
  document.cookie = `googtrans=/en/${nextLanguage}; path=/;`;
  const translateSelect = document.querySelector('.goog-te-combo') as HTMLSelectElement | null;
  if (translateSelect) {
    translateSelect.value = nextLanguage;
    translateSelect.dispatchEvent(new Event('change'));
  }
  suppressGoogleTranslateChrome();
}

export function useSitePreferences() {
  // Keep the first client render identical to SSR. Stored browser preferences
  // reconcile after hydration, so a light theme or translated cookie cannot
  // make React replace comparison-page HTML before it becomes interactive.
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [language, setLanguage] = useState('en');
  const [preferencesReady, setPreferencesReady] = useState(false);

  useEffect(() => {
    setTheme(readStoredTheme());
    setLanguage(readLanguage());
    setPreferencesReady(true);
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    document.documentElement.dataset.theme = theme;
    try { window.localStorage.setItem(SITE_CONFIG.themeStorageKey, theme); } catch { /* Theme persistence is best effort. */ }
  }, [preferencesReady, theme]);

  useEffect(watchGoogleTranslateChrome, []);

  const changeLanguage = (nextLanguage: string) => {
    setLanguage(nextLanguage);
    setTranslatedLanguage(nextLanguage);
  };

  return {
    theme,
    language,
    toggleTheme: () => setTheme((current) => current === 'dark' ? 'light' : 'dark'),
    changeLanguage,
  };
}
