import { createContext, createElement, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { SITE_CONFIG } from '../brand/site-config';

export type ThemeMode = 'light' | 'dark';

const SiteThemeContext = createContext<ThemeMode>(SITE_CONFIG.defaultTheme);
const EXPLICIT_THEME_VALUE = 'true';

export function SiteThemeProvider({ theme, children }: { readonly theme: ThemeMode; readonly children: ReactNode }) {
  return createElement(SiteThemeContext.Provider, { value: theme }, children);
}

export function useSiteTheme(): ThemeMode {
  return useContext(SiteThemeContext);
}

export function readStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return SITE_CONFIG.defaultTheme;
  try {
    return window.localStorage.getItem(SITE_CONFIG.themeStorageKey) === 'dark'
      && window.localStorage.getItem(SITE_CONFIG.themeExplicitStorageKey) === EXPLICIT_THEME_VALUE
      ? 'dark'
      : SITE_CONFIG.defaultTheme;
  } catch {
    return SITE_CONFIG.defaultTheme;
  }
}

/**
 * Earlier releases wrote a bare dark value for every first visit, without any
 * signal that the visitor actively chose it. An unmarked legacy dark value is
 * therefore migrated to the new light default. This cannot distinguish an
 * old explicit dark toggle from that automatic write; new user choices carry
 * an explicit marker so they always persist.
 */
function migrateLegacyThemePreference(): void {
  try {
    if (window.localStorage.getItem(SITE_CONFIG.themeStorageKey) === 'dark'
      && window.localStorage.getItem(SITE_CONFIG.themeExplicitStorageKey) !== EXPLICIT_THEME_VALUE) {
      window.localStorage.removeItem(SITE_CONFIG.themeStorageKey);
    }
  } catch {
    // Storage access is optional; the in-memory light default remains usable.
  }
}

function persistExplicitTheme(theme: ThemeMode): void {
  try {
    window.localStorage.setItem(SITE_CONFIG.themeStorageKey, theme);
    window.localStorage.setItem(SITE_CONFIG.themeExplicitStorageKey, EXPLICIT_THEME_VALUE);
  } catch {
    // Theme persistence is best effort.
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
  // reconcile after hydration, so a stored dark theme or translated cookie cannot
  // make React replace comparison-page HTML before it becomes interactive.
  const [theme, setTheme] = useState<ThemeMode>(SITE_CONFIG.defaultTheme);
  const [language, setLanguage] = useState('en');
  const [preferencesReady, setPreferencesReady] = useState(false);
  const themeWasExplicitlyChosen = useRef(false);

  useEffect(() => {
    migrateLegacyThemePreference();
    setTheme(readStoredTheme());
    setLanguage(readLanguage());
    setPreferencesReady(true);
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    document.documentElement.dataset.theme = theme;
    if (themeWasExplicitlyChosen.current) persistExplicitTheme(theme);
  }, [preferencesReady, theme]);

  useEffect(watchGoogleTranslateChrome, []);

  const changeLanguage = (nextLanguage: string) => {
    setLanguage(nextLanguage);
    setTranslatedLanguage(nextLanguage);
  };

  return {
    theme,
    language,
    toggleTheme: () => {
      themeWasExplicitlyChosen.current = true;
      setTheme((current) => current === 'dark' ? 'light' : 'dark');
    },
    changeLanguage,
  };
}
