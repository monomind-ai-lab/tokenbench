import { useEffect, useState, type ReactNode } from 'react';
import { Languages, Menu, Moon, Sun, X } from 'lucide-react';
import { SITE_CONFIG } from '../brand/site-config';
import { ROUTE_PATHS, type SiteNavigationPage } from '../routing/routes';
import { LANGUAGES } from '../types';
import { getResponsiveLayout } from './responsive';
import { formatDateTime, StatusBanner } from './ui';
import type { CatalogPhase } from './use-catalog';

interface AppShellProps {
  readonly children: ReactNode;
  readonly theme: 'light' | 'dark';
  readonly language: string;
  readonly activePage: SiteNavigationPage;
  readonly skipLinkTarget?: string;
  readonly skipLinkLabel?: string;
  readonly onThemeToggle: () => void;
  readonly onLanguageChange: (language: string) => void;
  readonly catalogPhase?: CatalogPhase;
  readonly notice?: string;
  readonly error?: string;
  readonly lastSuccessfulRefreshAt: string | null;
  readonly onRetry?: () => void;
}

interface SiteHeaderProps {
  readonly theme: 'light' | 'dark';
  readonly language: string;
  readonly activePage: SiteNavigationPage;
  readonly onThemeToggle: () => void;
  readonly onLanguageChange: (language: string) => void;
}

interface SiteFooterProps {
  readonly status: ReactNode;
  readonly notice: ReactNode;
}

export function SiteHeader({ theme, language, activePage, onThemeToggle, onLanguageChange }: SiteHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return <header className="top-header" onKeyDown={(event) => { if (event.key === 'Escape') setMobileMenuOpen(false); }}>
    <div className="header-inner">
      <div className="brand-lockup"><a className="brand-home" href="/" aria-label="TokenBench home"><img src="/brand/monomind-tokenbench.png" alt="MonoMind monogram" /><span className="brand-copy"><span className="brand-name">{SITE_CONFIG.name}</span><span className="brand-tagline">{SITE_CONFIG.tagline}</span></span></a></div>
      <button type="button" className="menu-button" aria-label={mobileMenuOpen ? 'Close navigation' : 'Open navigation'} aria-controls="primary-navigation" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)}>{mobileMenuOpen ? <X aria-hidden="true" size={20} /> : <Menu aria-hidden="true" size={20} />}</button>
      <nav id="primary-navigation" className="primary-nav" data-open={mobileMenuOpen} aria-label="Primary navigation">
        <a href={ROUTE_PATHS.home} aria-current={activePage === 'home' ? 'page' : undefined} onClick={() => setMobileMenuOpen(false)}>Home</a>
        <a href={ROUTE_PATHS.calculator} aria-current={activePage === 'calculator' ? 'page' : undefined} onClick={() => setMobileMenuOpen(false)}>Subscribe vs API</a>
        <a href={ROUTE_PATHS.compareHub} aria-current={activePage === 'compare' ? 'page' : undefined} onClick={() => setMobileMenuOpen(false)}>Compare</a>
        <a href={ROUTE_PATHS.leaderboards} aria-current={activePage === 'leaderboards' ? 'page' : undefined} onClick={() => setMobileMenuOpen(false)}>Leaderboards</a>
        <a href={ROUTE_PATHS.guides} aria-current={activePage === 'guides' ? 'page' : undefined} onClick={() => setMobileMenuOpen(false)}>Guides</a>
      </nav>
      <div className="header-actions">
        <label className="language-control"><Languages aria-hidden="true" size={19} /><span className="sr-only">Language</span><select aria-label="Language" value={language} onChange={(event) => onLanguageChange(event.target.value)}>{LANGUAGES.map((item) => <option value={item.code} key={item.code}>{item.native}</option>)}</select></label>
        <button type="button" className="icon-button" aria-label={theme === 'dark' ? 'Toggle light theme' : 'Toggle dark theme'} aria-pressed={theme === 'dark'} onClick={onThemeToggle}>{theme === 'dark' ? <Sun aria-hidden="true" size={20} /> : <Moon aria-hidden="true" size={20} />}</button>
      </div>
    </div>
  </header>;
}

export function SiteFooter({ status, notice }: SiteFooterProps) {
  return <footer className="app-footer"><div className="footer-brand"><a href={SITE_CONFIG.parentUrl}>Powered by {SITE_CONFIG.parentName}</a><span>{status}</span></div><div className="footer-links"><a href="/sources/">Sources</a><a href="/methodology/">Methodology</a><span>{notice}</span></div></footer>;
}

export function AppShell({ children, theme, language, activePage, skipLinkTarget = 'page-content', skipLinkLabel = 'Skip to page content', onThemeToggle, onLanguageChange, catalogPhase, notice, error, lastSuccessfulRefreshAt, onRetry }: AppShellProps) {
  // Match server markup on the first client render; the viewport sync happens
  // after hydration so narrow comparison pages are never abandoned in a
  // mismatched wide-shell DOM.
  const [layout, setLayout] = useState(() => getResponsiveLayout(1440));

  useEffect(() => {
    const updateLayout = () => setLayout(getResponsiveLayout(window.innerWidth));
    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, []);

  return (
    <div className="app-shell" data-layout={layout}>
      <a className="skip-link" href={`#${skipLinkTarget}`}>{skipLinkLabel}</a>
      <SiteHeader theme={theme} language={language} activePage={activePage} onThemeToggle={onThemeToggle} onLanguageChange={onLanguageChange} />
      {error ? <StatusBanner tone="error" actionLabel="Retry loading catalog" onAction={onRetry}>{`Catalog error: ${error}`}</StatusBanner> : null}
      {notice && notice !== error ? <StatusBanner tone="warning" actionLabel={catalogPhase === 'ready' ? 'Retry catalog refresh' : undefined} onAction={catalogPhase === 'ready' ? onRetry : undefined}>{notice}</StatusBanner> : null}
      <main id="page-content" className="page-main" tabIndex={-1}>{children}</main>
      <SiteFooter status={catalogPhase ? `Catalog refresh: ${formatDateTime(lastSuccessfulRefreshAt)}${catalogPhase === 'loading' ? ' · Loading' : ''}` : 'Source-aware decision support.'} notice="Verify provider evidence before purchasing." />
    </div>
  );
}
