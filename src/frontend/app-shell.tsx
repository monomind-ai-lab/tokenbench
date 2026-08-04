import { useEffect, useState, type ReactNode } from 'react';
import { Languages, Moon, Sun } from 'lucide-react';
import { LANGUAGES } from '../types';
import { getResponsiveLayout } from './responsive';
import { formatDateTime, StatusBanner } from './ui';
import type { CatalogPhase } from './use-catalog';

interface AppShellProps {
  readonly children: ReactNode;
  readonly theme: 'light' | 'dark';
  readonly language: string;
  readonly onThemeToggle: () => void;
  readonly onLanguageChange: (language: string) => void;
  readonly catalogPhase: CatalogPhase;
  readonly notice?: string;
  readonly error?: string;
  readonly lastSuccessfulRefreshAt: string | null;
  readonly onRetry: () => void;
}

export function AppShell({ children, theme, language, onThemeToggle, onLanguageChange, catalogPhase, notice, error, lastSuccessfulRefreshAt, onRetry }: AppShellProps) {
  const [layout, setLayout] = useState(() => getResponsiveLayout(typeof window === 'undefined' ? 1440 : window.innerWidth));

  useEffect(() => {
    const updateLayout = () => setLayout(getResponsiveLayout(window.innerWidth));
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, []);

  return (
    <div className="app-shell" data-layout={layout}>
      <header className="top-header">
        <div className="header-inner">
          <div className="brand-lockup"><h1>AI Cost Engine</h1></div>
          <nav className="primary-nav" aria-label="Primary navigation"><a href="#calculator" aria-current="page">Calculator</a><a href="#comparison">Pricing</a></nav>
          <div className="header-actions">
            <label className="language-control"><Languages aria-hidden="true" size={19} /><span className="sr-only">Language</span><select aria-label="Language" value={language} onChange={(event) => onLanguageChange(event.target.value)}>{LANGUAGES.map((item) => <option value={item.code} key={item.code}>{item.native}</option>)}</select></label>
            <button type="button" className="icon-button" aria-label={theme === 'dark' ? 'Toggle light theme' : 'Toggle dark theme'} aria-pressed={theme === 'dark'} onClick={onThemeToggle}>{theme === 'dark' ? <Sun aria-hidden="true" size={20} /> : <Moon aria-hidden="true" size={20} />}</button>
          </div>
        </div>
      </header>
      {error ? <StatusBanner tone="error" actionLabel="Retry loading catalog" onAction={onRetry}>{`Catalog error: ${error}`}</StatusBanner> : null}
      {notice ? <StatusBanner tone="warning" actionLabel={catalogPhase === 'ready' ? 'Retry catalog refresh' : undefined} onAction={catalogPhase === 'ready' ? onRetry : undefined}>{notice}</StatusBanner> : null}
      <main id="calculator" className="page-main">{children}</main>
      <footer className="app-footer"><span>MonoMind AI Lab · 2026</span><span>Catalog refresh: {formatDateTime(lastSuccessfulRefreshAt)}{catalogPhase === 'loading' ? ' · Loading' : ''}</span><span>Verify provider evidence before purchasing.</span></footer>
    </div>
  );
}
