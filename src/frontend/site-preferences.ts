import { useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark';

export function readStoredTheme(): ThemeMode {
  try {
    return window.localStorage.getItem('ai-cost-engine:theme') === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function readLanguage(): string {
  const match = document.cookie.split('; ').find((cookie) => cookie.startsWith('googtrans='));
  return match?.split('=')[1]?.split('/').at(-1) || 'en';
}

export function setTranslatedLanguage(nextLanguage: string): void {
  document.documentElement.lang = nextLanguage;
  document.cookie = `googtrans=/en/${nextLanguage}; path=/;`;
  const translateSelect = document.querySelector('.goog-te-combo') as HTMLSelectElement | null;
  if (translateSelect) {
    translateSelect.value = nextLanguage;
    translateSelect.dispatchEvent(new Event('change'));
  }
}

export function useSitePreferences() {
  const [theme, setTheme] = useState<ThemeMode>(readStoredTheme);
  const [language, setLanguage] = useState(readLanguage);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { window.localStorage.setItem('ai-cost-engine:theme', theme); } catch { /* Theme persistence is best effort. */ }
  }, [theme]);

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
