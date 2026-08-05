import { useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark';

export function readStoredTheme(): ThemeMode {
  try {
    return window.localStorage.getItem('tokenbench:theme') === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function readLanguage(): string {
  const match = document.cookie.split('; ').find((cookie) => cookie.startsWith('googtrans='));
  return match?.split('=')[1]?.split('/').at(-1) || 'en';
}

const GOOGLE_TRANSLATE_CHROME = [
  '.goog-te-banner-frame',
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
  const [theme, setTheme] = useState<ThemeMode>(readStoredTheme);
  const [language, setLanguage] = useState(readLanguage);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { window.localStorage.setItem('tokenbench:theme', theme); } catch { /* Theme persistence is best effort. */ }
  }, [theme]);

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
