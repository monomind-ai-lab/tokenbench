import { SITE_CONFIG } from '../brand/site-config';
import { themeBootstrapMarkup } from '../brand/theme-bootstrap';
import { ROUTE_PATHS, type SiteNavigationPage } from '../routing/routes';
import type { PageMetadata } from './metadata';

export type StaticNavigationPage = SiteNavigationPage | undefined;

interface StaticDocumentOptions {
  readonly includeTranslation?: boolean;
  readonly bodyPrefix?: string;
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

function navLink(pathname: string, label: string, activePage: StaticNavigationPage, page: Exclude<StaticNavigationPage, undefined>): string {
  return `<a href="${pathname}"${activePage === page ? ' aria-current="page"' : ''}>${label}</a>`;
}

export function staticChrome(content: string, activePage: StaticNavigationPage): string {
  return `<div class="app-shell static-page-shell">
      <a class="skip-link" href="#page-content">Skip to page content</a>
      <header class="top-header"><div class="header-inner">
        <div class="brand-lockup"><a class="brand-home" href="/" aria-label="${SITE_CONFIG.name} home"><img src="/brand/monomind-tokenbench.png" alt="MonoMind monogram"><span class="brand-copy"><span class="brand-name">${SITE_CONFIG.name}</span></span></a></div>
        <nav class="primary-nav" aria-label="Primary navigation">${navLink('/', 'Home', activePage, 'home')}${navLink(ROUTE_PATHS.calculator, 'Subscribe vs API', activePage, 'calculator')}${navLink(ROUTE_PATHS.pricePerformance, 'Price vs Performance', activePage, 'pricePerformance')}${navLink(ROUTE_PATHS.models, 'Models', activePage, 'models')}${navLink(ROUTE_PATHS.compareHub, 'Compare', activePage, 'compare')}${navLink(ROUTE_PATHS.leaderboards, 'Leaderboards', activePage, 'leaderboards')}${navLink(ROUTE_PATHS.guides, 'Guides', activePage, 'guides')}</nav>
      </div></header>
      ${content}
      <footer class="app-footer"><div class="footer-grid"><section class="footer-brand" aria-label="About ${SITE_CONFIG.name}"><strong>${SITE_CONFIG.name}</strong><p>Source-aware model, pricing, and workload evidence for practical AI decisions.</p><p class="footer-disclaimer">Verify provider evidence before purchasing.</p></section><nav class="footer-links" aria-label="Explore"><strong>Explore</strong><a href="${ROUTE_PATHS.calculator}">Subscribe vs API</a><a href="${ROUTE_PATHS.pricePerformance}">Price vs performance</a><a href="${ROUTE_PATHS.models}">Popular models</a><a href="${ROUTE_PATHS.compareHub}">Compare models</a><a href="${ROUTE_PATHS.leaderboards}">Leaderboards</a><a href="${ROUTE_PATHS.guides}">Guides</a></nav><nav class="footer-links" aria-label="Trust"><strong>Trust</strong><a href="${ROUTE_PATHS.methodologyBenchAlign}">Methodology</a><a href="/privacy/">Privacy</a></nav></div><div class="footer-meta"><a href="${SITE_CONFIG.parentUrl}">Powered by ${SITE_CONFIG.parentName}</a></div></footer>
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
  return `<!doctype html>
<html lang="en" data-theme="${SITE_CONFIG.defaultTheme}">
  <head>
    ${head}
  </head>
  <body>
${options.bodyPrefix ?? ''}${translationMount}    <div id="root">${content}</div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>\n`;
}
