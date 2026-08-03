import { useEffect, useState, type ReactNode } from 'react';
import { LANGUAGES } from '../types';
import { getResponsiveLayout } from './responsive';
import { formatDateTime, StatusBanner } from './ui';
import type { CatalogPhase } from './use-catalog';

export function AppShell({ children, theme, language, onThemeToggle, onLanguageChange, catalogPhase, notice, error, lastSuccessfulRefreshAt, onRetry }: {
  children: ReactNode;
  theme: 'light' | 'dark';
  language: string;
  onThemeToggle(): void;
  onLanguageChange(language: string): void;
  catalogPhase: CatalogPhase;
  notice?: string;
  error?: string;
  lastSuccessfulRefreshAt: string | null;
  onRetry(): void;
}) {
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
          <div className="brand-lockup"><h1>AI Cost Engine</h1><span>Verified plan intelligence</span></div>
          <nav className="primary-nav" aria-label="Primary navigation"><a href="#calculator" aria-current="page">Calculator</a><a href="#comparison">Comparison</a></nav>
          <div className="header-actions">
            <label className="language-control"><span className="sr-only">Language</span><select aria-label="Language" value={language} onChange={(event) => onLanguageChange(event.target.value)}>{LANGUAGES.map((item) => <option value={item.code} key={item.code}>{item.native}</option>)}</select></label>
            <button type="button" className="icon-button" aria-label="Toggle dark theme" aria-pressed={theme === 'dark'} onClick={onThemeToggle}>{theme === 'dark' ? '☀' : '☾'}</button>
          </div>
        </div>
      </header>
      <div className="refresh-strip" aria-label="Catalog status"><span>Catalog refresh: {formatDateTime(lastSuccessfulRefreshAt)}</span>{catalogPhase === 'loading' ? <span className="status-dot">Loading</span> : null}</div>
      {error ? <StatusBanner tone="error" actionLabel="Retry loading catalog" onAction={onRetry}>{`Catalog error: ${error}`}</StatusBanner> : null}
      {notice ? <StatusBanner tone="warning" actionLabel={catalogPhase === 'ready' ? 'Retry catalog refresh' : undefined} onAction={catalogPhase === 'ready' ? onRetry : undefined}>{notice}</StatusBanner> : null}
      <main id="calculator" className="page-main">{children}</main>
      <footer className="app-footer"><span>MonoMind AI Lab · 2026</span><span>Verify provider evidence before purchasing.</span></footer>
    </div>
  );
}
