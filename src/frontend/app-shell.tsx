import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Languages, Menu, Moon, Sun, X } from 'lucide-react';
import { SITE_CONFIG } from '../brand/site-config';
import { PREVIEW_ROUTE_PATHS, previewModelProfilePath, type SiteNavigationPage } from '../routing/routes';
import { LANGUAGES } from '../types';
import { POPULAR_MODELS_FIXTURE } from './popular-models/fixtures';
import { getResponsiveLayout } from './responsive';
import { NewsletterSignup } from './newsletter-signup';
import { SiteThemeProvider } from './site-preferences';
import { StatusBanner } from './ui';
import type { CatalogPhase } from './use-catalog';

interface AppShellProps {
  readonly children: ReactNode;
  readonly theme: 'light' | 'dark';
  readonly language: string;
  readonly activePage?: SiteNavigationPage;
  readonly skipLinkTarget?: string;
  readonly skipLinkLabel?: string;
  readonly onThemeToggle: () => void;
  readonly onLanguageChange: (language: string) => void;
  readonly catalogPhase?: CatalogPhase;
  readonly notice?: string;
  readonly error?: string;
  readonly onRetry?: () => void;
  readonly surface?: 'default' | 'leaderboard-workbench';
}

interface SiteHeaderProps {
  readonly theme: 'light' | 'dark';
  readonly language: string;
  readonly activePage?: SiteNavigationPage;
  readonly onThemeToggle: () => void;
  readonly onLanguageChange: (language: string) => void;
}

interface SiteFooterProps {
  readonly disclaimer: string;
}

type HeaderMenu = 'models' | 'leaderboards' | 'articles';

const HEADER_TOP_MODELS = [...POPULAR_MODELS_FIXTURE]
  .sort((left, right) => right.overallScore - left.overallScore)
  .slice(0, 10);

export function SiteHeader({ theme, language, activePage, onThemeToggle, onLanguageChange }: SiteHeaderProps) {
  const headerRef = useRef<HTMLElement>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<HeaderMenu | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (headerRef.current?.contains(event.target as Node)) return;
      setOpenMenu(null);
      setMobileMenuOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const closeNavigation = () => {
    setMobileMenuOpen(false);
    setOpenMenu(null);
  };

  const toggleMenu = (menu: HeaderMenu) => {
    setOpenMenu((current) => current === menu ? null : menu);
  };

  return <header ref={headerRef} className="top-header" onKeyDown={(event) => { if (event.key === 'Escape') closeNavigation(); }}>
    <div className="header-inner">
      <div className="brand-lockup"><a className="brand-home" href={PREVIEW_ROUTE_PATHS.home} aria-label="TokenBench home"><img src="/brand/monomind-tokenbench.png" alt="MonoMind monogram" /><span className="brand-copy"><span className="brand-name">{SITE_CONFIG.name}</span></span></a></div>
      <button type="button" className="menu-button" aria-label={mobileMenuOpen ? 'Close navigation' : 'Open navigation'} aria-controls="primary-navigation" aria-expanded={mobileMenuOpen} onClick={() => { setMobileMenuOpen((current) => !current); setOpenMenu(null); }}>{mobileMenuOpen ? <X aria-hidden="true" size={20} /> : <Menu aria-hidden="true" size={20} />}</button>
      <nav id="primary-navigation" className="primary-nav" data-open={mobileMenuOpen} aria-label="Primary navigation">
        <a href={PREVIEW_ROUTE_PATHS.home} aria-current={activePage === 'home' ? 'page' : undefined} onClick={closeNavigation}>Home</a>
        <button id="primary-models-menu" className="primary-nav-menu-trigger" type="button" aria-haspopup="true" aria-expanded={openMenu === 'models'} aria-controls="primary-models-panel" aria-current={activePage === 'models' || activePage === 'pricePerformance' ? 'page' : undefined} onClick={() => toggleMenu('models')}>Models <ChevronDown aria-hidden="true" size={13} /></button>
        <button id="primary-leaderboards-menu" className="primary-nav-menu-trigger" type="button" aria-haspopup="true" aria-expanded={openMenu === 'leaderboards'} aria-controls="primary-leaderboards-panel" aria-current={activePage === 'leaderboards' ? 'page' : undefined} onClick={() => toggleMenu('leaderboards')}>Leaderboards <ChevronDown aria-hidden="true" size={13} /></button>
        <a href={PREVIEW_ROUTE_PATHS.compare} aria-current={activePage === 'compare' ? 'page' : undefined} onClick={closeNavigation}>Compare</a>
        <a href={PREVIEW_ROUTE_PATHS.calculator} aria-current={activePage === 'calculator' ? 'page' : undefined} onClick={closeNavigation}>Subscribe vs API</a>
        <button id="primary-articles-menu" className="primary-nav-menu-trigger" type="button" aria-haspopup="true" aria-expanded={openMenu === 'articles'} aria-controls="primary-articles-panel" aria-current={activePage === 'guides' ? 'page' : undefined} onClick={() => toggleMenu('articles')}>Articles <ChevronDown aria-hidden="true" size={13} /></button>
      </nav>
      <div className="header-actions">
        <label className="language-control"><Languages aria-hidden="true" size={19} /><span className="sr-only">Language</span><select aria-label="Language" value={language} onChange={(event) => onLanguageChange(event.target.value)}>{LANGUAGES.map((item) => <option value={item.code} key={item.code}>{item.native}</option>)}</select></label>
        <button type="button" className="icon-button" aria-label={theme === 'dark' ? 'Toggle light theme' : 'Toggle dark theme'} aria-pressed={theme === 'dark'} onClick={onThemeToggle}>{theme === 'dark' ? <Sun aria-hidden="true" size={20} /> : <Moon aria-hidden="true" size={20} />}</button>
      </div>
      <div className="primary-nav-mega-panels">
        <section id="primary-models-panel" className="primary-nav-mega-panel primary-nav-models-panel" aria-labelledby="primary-models-menu" hidden={openMenu !== 'models'}>
          <div className="primary-nav-mega-layout">
            <div className="primary-nav-mega-section">
              <div className="primary-nav-mega-heading"><h2>Explore models</h2><span>Decision surfaces</span></div>
              <div className="primary-nav-mega-destinations">
                <a href={PREVIEW_ROUTE_PATHS.models} onClick={closeNavigation}><strong>Models workbench</strong><span>Search and compare current model evidence</span></a>
                <a href={PREVIEW_ROUTE_PATHS.pricePerformance} onClick={closeNavigation}><strong>Price vs performance</strong><span>Inspect the supported value frontier</span></a>
                <a href={PREVIEW_ROUTE_PATHS.compare} onClick={closeNavigation}><strong>Compare models</strong><span>Build a focused side-by-side decision</span></a>
              </div>
            </div>
            <div className="primary-nav-mega-section primary-nav-top-models">
              <div className="primary-nav-mega-heading"><h2>Top Models</h2><span>Illustrative preview order</span></div>
              <div className="primary-nav-model-grid">{HEADER_TOP_MODELS.map((model, index) => <a className="primary-nav-model-link" href={previewModelProfilePath(model.slug)} onClick={closeNavigation} key={model.id}><span>#{index + 1}</span><span><strong>{model.name}</strong><small>{model.organization}</small></span><span>{model.overallScore.toFixed(1)}</span></a>)}</div>
            </div>
          </div>
        </section>
        <section id="primary-leaderboards-panel" className="primary-nav-mega-panel primary-nav-mega-panel-compact" aria-labelledby="primary-leaderboards-menu" hidden={openMenu !== 'leaderboards'}>
          <div className="primary-nav-mega-heading"><h2>Leaderboards</h2><span>Rank and re-rank models</span></div>
          <div className="primary-nav-mega-destinations">
            <a href={PREVIEW_ROUTE_PATHS.popularModels} onClick={closeNavigation}><strong>Popular Models</strong><span>Browse top models by quality, performance, and cost.</span></a>
            <a href={PREVIEW_ROUTE_PATHS.makeItYours} onClick={closeNavigation}><strong>Make it yours</strong><span>Adjust six capability weights and SLA thresholds</span></a>
          </div>
        </section>
        <section id="primary-articles-panel" className="primary-nav-mega-panel primary-nav-mega-panel-compact" aria-labelledby="primary-articles-menu" hidden={openMenu !== 'articles'}>
          <div className="primary-nav-mega-heading"><h2>Articles &amp; guides</h2><span>Everything about AI models</span></div>
          <div className="primary-nav-mega-destinations">
            <a href={PREVIEW_ROUTE_PATHS.articles} onClick={closeNavigation}><strong>All</strong></a>
            <a href={`${PREVIEW_ROUTE_PATHS.articles}?channel=guides`} onClick={closeNavigation}><strong>Guides</strong></a>
            <a href={`${PREVIEW_ROUTE_PATHS.articles}?channel=insights`} onClick={closeNavigation}><strong>Insights</strong></a>
            <a href={`${PREVIEW_ROUTE_PATHS.articles}?channel=news`} onClick={closeNavigation}><strong>News</strong></a>
          </div>
        </section>
      </div>
    </div>
  </header>;
}

/**
 * The footer is a decision surface, not a data log. It never repeats catalog
 * refresh state or source-update history; those belong to the pages that
 * publish the evidence.
 */
export function SiteFooter({ disclaimer }: SiteFooterProps) {
  return <footer className="app-footer">
    <div className="footer-grid">
      <section className="footer-brand" aria-label="About TokenBench">
        <strong>{SITE_CONFIG.name}</strong>
        <p>Source-aware model, pricing, and workload evidence for practical AI decisions.</p>
        <p className="footer-disclaimer">{disclaimer}</p>
      </section>
      <nav className="footer-links" aria-label="Explore">
        <strong>Explore</strong>
        <a href={PREVIEW_ROUTE_PATHS.models}>Models workbench</a>
        <a href={PREVIEW_ROUTE_PATHS.calculator}>Subscribe vs API</a>
        <a href={PREVIEW_ROUTE_PATHS.pricePerformance}>Price vs performance</a>
        <a href={PREVIEW_ROUTE_PATHS.popularModels}>Popular models</a>
        <a href={PREVIEW_ROUTE_PATHS.makeItYours}>Make it yours</a>
        <a href={PREVIEW_ROUTE_PATHS.compare}>Compare models</a>
        <a href={PREVIEW_ROUTE_PATHS.articles}>Articles</a>
      </nav>
      <nav className="footer-links" aria-label="Trust">
        <strong>Trust</strong>
        <a href={PREVIEW_ROUTE_PATHS.methodologyBenchAlign}>Methodology</a>
        <a href={PREVIEW_ROUTE_PATHS.privacy}>Privacy</a>
      </nav>
      <NewsletterSignup context="footer" />
    </div>
    <div className="footer-meta">
      <a href={SITE_CONFIG.parentUrl}>Powered by {SITE_CONFIG.parentName}</a>
    </div>
  </footer>;
}

export function AppShell({ children, theme, language, activePage, skipLinkTarget = 'page-content', skipLinkLabel = 'Skip to page content', onThemeToggle, onLanguageChange, catalogPhase, notice, error, onRetry, surface = 'default' }: AppShellProps) {
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
    <SiteThemeProvider theme={theme}>
      <div className="app-shell" data-layout={layout} data-surface={surface}>
        <a className="skip-link" href={`#${skipLinkTarget}`}>{skipLinkLabel}</a>
        <SiteHeader theme={theme} language={language} activePage={activePage} onThemeToggle={onThemeToggle} onLanguageChange={onLanguageChange} />
        {error ? <StatusBanner tone="error" actionLabel="Retry loading catalog" onAction={onRetry}>{`Catalog error: ${error}`}</StatusBanner> : null}
        {notice && notice !== error ? <StatusBanner tone="warning" actionLabel={catalogPhase === 'ready' ? 'Retry catalog refresh' : undefined} onAction={catalogPhase === 'ready' ? onRetry : undefined}>{notice}</StatusBanner> : null}
        <main id="page-content" className="page-main" tabIndex={-1}>{children}</main>
        <SiteFooter disclaimer="Verify provider evidence before purchasing." />
      </div>
    </SiteThemeProvider>
  );
}
