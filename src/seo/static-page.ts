import { SITE_CONFIG } from '../brand/site-config';
import { themeBootstrapMarkup } from '../brand/theme-bootstrap';
import { PREVIEW_ROUTE_PATHS, previewModelProfilePath, type SiteNavigationPage } from '../routing/routes';
import { POPULAR_MODELS_FIXTURE } from '../frontend/popular-models/fixtures';
import { LANGUAGES } from '../types';
import type { PageMetadata } from './metadata';

export type StaticNavigationPage = SiteNavigationPage | undefined;

interface StaticDocumentOptions {
  readonly includeTranslation?: boolean;
  readonly assets?: {
    readonly script: string;
    readonly stylesheet: string;
  };
  readonly payload?: {
    readonly id: string;
    readonly value: unknown;
  };
}

export function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

export function jsonLd(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

export function headMarkup(metadata: PageMetadata, structuredData: unknown[], options: StaticDocumentOptions = {}): string {
  const translationScripts = options.includeTranslation === false
    ? ''
    : `<script>function googleTranslateElementInit(){new google.translate.TranslateElement({pageLanguage:'en',includedLanguages:'en,ko,zh-TW,zh-CN,ja,es,fr,de,fi,pl,ru',autoDisplay:false},'google_translate_element')}</script>
    <script async defer src="https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit"></script>`;
  return `<meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script>(function(){try{var currentFetch=window.fetch;Object.defineProperty(window,'fetch',{get:function(){return currentFetch},set:function(nextFetch){currentFetch=nextFetch},configurable:true,enumerable:true})}catch(e){}})()</script>
    <title>${escapeHtml(metadata.title)}</title>
    <meta name="description" content="${escapeHtml(metadata.description)}">
    <meta name="robots" content="${metadata.robots},max-image-preview:large">
    <link rel="canonical" href="${escapeHtml(metadata.canonical)}">
    <link rel="icon" href="/favicon.png" type="image/png">
    <meta property="og:type" content="${metadata.openGraph.type}">
    <meta property="og:site_name" content="${SITE_CONFIG.name}">
    <meta property="og:title" content="${escapeHtml(metadata.openGraph.title)}">
    <meta property="og:description" content="${escapeHtml(metadata.openGraph.description)}">
    <meta property="og:url" content="${escapeHtml(metadata.openGraph.url)}">
    <meta property="og:image" content="${escapeHtml(metadata.openGraph.image)}">
    <meta property="og:image:alt" content="${escapeHtml(metadata.openGraph.imageAlt)}">
    <meta name="twitter:card" content="${metadata.twitter.card}">
    <meta name="twitter:title" content="${escapeHtml(metadata.twitter.title)}">
    <meta name="twitter:description" content="${escapeHtml(metadata.twitter.description)}">
    <meta name="twitter:image" content="${escapeHtml(metadata.twitter.image)}">
    ${themeBootstrapMarkup()}
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700&display=swap" rel="stylesheet">
    ${translationScripts}
    ${structuredData.map((data) => `<script type="application/ld+json">${jsonLd(data)}</script>`).join('\n    ')}`;
}

const HEADER_TOP_MODELS = [...POPULAR_MODELS_FIXTURE]
  .sort((left, right) => right.overallScore - left.overallScore)
  .slice(0, 10);

function activeAttribute(active: boolean): string {
  return active ? ' aria-current="page"' : '';
}

function staticHeader(activePage: StaticNavigationPage): string {
  const topModels = HEADER_TOP_MODELS.map((model, index) => `<a class="primary-nav-model-link" href="${previewModelProfilePath(model.slug)}"><span>#${index + 1}</span><span><strong>${escapeHtml(model.name)}</strong><small>${escapeHtml(model.organization)}</small></span><span>${model.overallScore.toFixed(1)}</span></a>`).join('');
  const chevron = '<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
  const menu = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';

  return `<header class="top-header"><div class="header-inner">
    <div class="brand-lockup"><a class="brand-home" href="${PREVIEW_ROUTE_PATHS.home}" aria-label="${SITE_CONFIG.name} home"><img src="/brand/monomind-tokenbench.png" alt="MonoMind monogram"><span class="brand-copy"><span class="brand-name">${SITE_CONFIG.name}</span></span></a></div>
    <button type="button" class="menu-button" aria-label="Open navigation" aria-controls="primary-navigation" aria-expanded="false">${menu}</button>
    <nav id="primary-navigation" class="primary-nav" data-open="false" aria-label="Primary navigation">
      <a href="${PREVIEW_ROUTE_PATHS.home}"${activeAttribute(activePage === 'home')}>Home</a>
      <button id="primary-models-menu" class="primary-nav-menu-trigger" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="primary-models-panel"${activeAttribute(activePage === 'models' || activePage === 'pricePerformance')}>Models ${chevron}</button>
      <button id="primary-leaderboards-menu" class="primary-nav-menu-trigger" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="primary-leaderboards-panel"${activeAttribute(activePage === 'leaderboards' || activePage === 'popularModels')}>Leaderboards ${chevron}</button>
      <a href="${PREVIEW_ROUTE_PATHS.compare}"${activeAttribute(activePage === 'compare')}>Compare</a>
      <a href="${PREVIEW_ROUTE_PATHS.calculator}"${activeAttribute(activePage === 'calculator')}>Subscribe vs API</a>
      <button id="primary-articles-menu" class="primary-nav-menu-trigger" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="primary-articles-panel"${activeAttribute(activePage === 'guides')}>Articles ${chevron}</button>
    </nav>
    <div class="header-actions"><label class="language-control"><span class="sr-only">Language</span><select aria-label="Language">${LANGUAGES.map((language) => `<option value="${escapeHtml(language.code)}"${language.code === 'en' ? ' selected' : ''}>${escapeHtml(language.native)}</option>`).join('')}</select></label><button type="button" class="icon-button" aria-label="Toggle dark theme" aria-pressed="false">◐</button></div>
    <div class="primary-nav-mega-panels">
      <section id="primary-models-panel" class="primary-nav-mega-panel primary-nav-models-panel" aria-labelledby="primary-models-menu" hidden><div class="primary-nav-mega-layout"><div class="primary-nav-mega-section"><div class="primary-nav-mega-heading"><h2>Explore models</h2><span>Decision surfaces</span></div><div class="primary-nav-mega-destinations"><a href="${PREVIEW_ROUTE_PATHS.models}"><strong>Models workbench</strong><span>Price, performance and catalog filters</span></a><a href="${PREVIEW_ROUTE_PATHS.modelCatalog}"><strong>Model catalog</strong><span>Search, filter and compare model evidence</span></a><a href="${PREVIEW_ROUTE_PATHS.modelLifecycle}"><strong>Lifecycle radar</strong><span>Retirements, sunset dates and migration paths</span></a></div></div><div class="primary-nav-mega-section primary-nav-top-models"><div class="primary-nav-mega-heading"><h2>Top Models</h2><span>Live weekly rank · 12 Aug 2026</span></div><div class="primary-nav-model-grid">${topModels}</div></div></div></section>
      <section id="primary-leaderboards-panel" class="primary-nav-mega-panel primary-nav-mega-panel-compact" aria-labelledby="primary-leaderboards-menu" hidden><div class="primary-nav-mega-heading"><h2>Leaderboards</h2><span>Rank and re-rank models</span></div><div class="primary-nav-mega-destinations"><a href="${PREVIEW_ROUTE_PATHS.popularModels}"><strong>Popular Models</strong><span>Browse top models by quality, performance, and cost.</span></a><a href="${PREVIEW_ROUTE_PATHS.makeItYours}"><strong>Make it yours</strong><span>Adjust six capability weights and SLA thresholds</span></a></div></section>
      <section id="primary-articles-panel" class="primary-nav-mega-panel primary-nav-mega-panel-compact" aria-labelledby="primary-articles-menu" hidden><div class="primary-nav-mega-heading"><h2>Articles</h2><span>Everything about AI models</span></div><div class="primary-nav-mega-destinations"><a href="${PREVIEW_ROUTE_PATHS.articles}"><strong>All</strong></a><a href="${PREVIEW_ROUTE_PATHS.articles}?channel=guides"><strong>Guides</strong></a><a href="${PREVIEW_ROUTE_PATHS.articles}?channel=insights"><strong>Insights</strong></a><a href="${PREVIEW_ROUTE_PATHS.articles}?channel=news"><strong>News</strong></a></div></section>
    </div>
  </div></header>`;
}

function staticFooter(): string {
  return `<footer class="app-footer"><div class="footer-grid"><section class="footer-brand" aria-label="About ${SITE_CONFIG.name}"><strong>${SITE_CONFIG.name}</strong><p>Source-aware model, pricing, and workload evidence for practical AI decisions.</p><p class="footer-disclaimer">Verify provider evidence before purchasing.</p></section><nav class="footer-links" aria-label="Explore"><strong>Explore</strong><a href="${PREVIEW_ROUTE_PATHS.models}">Models workbench</a><a href="${PREVIEW_ROUTE_PATHS.calculator}">Subscribe vs API</a><a href="${PREVIEW_ROUTE_PATHS.pricePerformance}">Price vs performance</a><a href="${PREVIEW_ROUTE_PATHS.popularModels}">Popular models</a><a href="${PREVIEW_ROUTE_PATHS.makeItYours}">Make it yours</a><a href="${PREVIEW_ROUTE_PATHS.compare}">Compare models</a></nav><nav class="footer-links" aria-label="Articles"><strong>Articles</strong><a href="${PREVIEW_ROUTE_PATHS.articles}?channel=guides">Guides</a><a href="${PREVIEW_ROUTE_PATHS.articles}?channel=insights">Insights</a><a href="${PREVIEW_ROUTE_PATHS.articles}?channel=news">News</a></nav><section class="newsletter-signup" data-compact="false" data-context="footer"><div class="newsletter-signup-offer"><h2>LLM API Cost &amp; Benchmark Cheatsheet</h2><p>Stop overpaying for tokens. Get monthly per-1M token rates, context windows, and category rankings for top models in one downloadable PDF or CSV.</p></div><form aria-label="Newsletter signup" method="post"><label for="newsletter-first-name-footer">First name</label><input id="newsletter-first-name-footer" name="firstName" autocomplete="given-name" required type="text"><label for="newsletter-company-footer">Company</label><input id="newsletter-company-footer" name="company" autocomplete="organization" required type="text"><label for="newsletter-email-footer">Email address</label><input id="newsletter-email-footer" name="email" autocomplete="email" required type="email"><label class="newsletter-signup-alert-control"><input name="modelAndPriceAlerts" type="checkbox">${'Notify me when new models are added to TokenBench.'}</label><p class="newsletter-signup-helper">Check your inbox to confirm your email and access your instant download.</p><button type="submit">Download Free Cheatsheet</button></form></section></div><div class="footer-meta"><a href="${SITE_CONFIG.parentUrl}">Powered by ${SITE_CONFIG.parentName}</a></div></footer>`;
}

export function staticChrome(content: string, activePage: StaticNavigationPage): string {
  return `<div class="app-shell static-page-shell">
      <a class="skip-link" href="#page-content">Skip to page content</a>
      ${staticHeader(activePage)}
      ${content}
      ${staticFooter()}
    </div>`;
}

/**
 * Wraps a standalone transactional route (for example the newsletter
 * confirmation page) without the site header, primary navigation, or footer.
 * The served markup contains the same substantive copy before JavaScript so
 * crawlers and no-JS visitors see the actionable confirmation.
 */
export function transactionalChrome(content: string): string {
  return `<div class="transactional-page-shell">${content}</div>`;
}

export function documentHtml(head: string, content: string, options: StaticDocumentOptions = {}): string {
  const translationMount = options.includeTranslation === false ? '' : '    <div id="google_translate_element"></div>\n';
  const assets = options.assets
    ? `    <link rel="stylesheet" href="${escapeHtml(options.assets.stylesheet)}">\n    <script type="module" src="${escapeHtml(options.assets.script)}"></script>`
    : '    <script type="module" src="/src/main.tsx"></script>';
  const payload = options.payload
    ? `    <script id="${escapeHtml(options.payload.id)}" type="application/json">${jsonLd(options.payload.value)}</script>\n`
    : '';
  return `<!doctype html>
<html lang="en" data-theme="${SITE_CONFIG.defaultTheme}">
  <head>
    ${head}
  </head>
  <body>
${translationMount}    <div id="root">${content}</div>
${payload}${assets}
  </body>
</html>\n`;
}
