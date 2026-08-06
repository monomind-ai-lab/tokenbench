import { SITE_CONFIG } from '../brand/site-config';
import type { PageMetadata } from './metadata';

export type StaticNavigationPage = 'tools' | 'compare' | 'leaderboards' | 'guides' | undefined;

export function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

export function jsonLd(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

export function headMarkup(metadata: PageMetadata, structuredData: unknown[]): string {
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
    <script>try{document.documentElement.dataset.theme=localStorage.getItem('${SITE_CONFIG.themeStorageKey}')==='light'?'light':'dark'}catch(e){document.documentElement.dataset.theme='dark'}</script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700&display=swap" rel="stylesheet">
    <script>function googleTranslateElementInit(){new google.translate.TranslateElement({pageLanguage:'en',includedLanguages:'en,ko,zh-TW,zh-CN,ja,es,fr,de,fi,pl,ru',autoDisplay:false},'google_translate_element')}</script>
    <script async defer src="https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit"></script>
    ${structuredData.map((data) => `<script type="application/ld+json">${jsonLd(data)}</script>`).join('\n    ')}`;
}

function navLink(pathname: string, label: string, activePage: StaticNavigationPage, page: Exclude<StaticNavigationPage, undefined>): string {
  return `<a href="${pathname}"${activePage === page ? ' aria-current="page"' : ''}>${label}</a>`;
}

export function staticChrome(content: string, activePage: StaticNavigationPage): string {
  return `<div class="app-shell static-page-shell">
      <a class="skip-link" href="#page-content">Skip to page content</a>
      <header class="top-header"><div class="header-inner">
        <div class="brand-lockup"><a class="brand-home" href="/" aria-label="${SITE_CONFIG.name} home"><img src="/brand/monomind-tokenbench.png" alt="MonoMind monogram"><span class="brand-copy"><span class="brand-name">${SITE_CONFIG.name}</span><span class="brand-tagline">${SITE_CONFIG.tagline}</span></span></a></div>
        <nav class="primary-nav" aria-label="Primary navigation">${navLink('/tools/', 'Tools', activePage, 'tools')}${navLink('/compare/', 'Compare', activePage, 'compare')}${navLink('/leaderboards/', 'Leaderboards', activePage, 'leaderboards')}${navLink('/guides/', 'Guides', activePage, 'guides')}</nav>
      </div></header>
      ${content}
      <footer class="app-footer"><div class="footer-brand"><a href="${SITE_CONFIG.parentUrl}">Powered by ${SITE_CONFIG.parentName}</a><span>Source-aware decision support.</span></div><div class="footer-links"><a href="/sources/">Sources</a><a href="/methodology/">Methodology</a><span>Verify provider evidence before purchasing.</span></div></footer>
    </div>`;
}

export function documentHtml(head: string, content: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    ${head}
  </head>
  <body>
    <div id="google_translate_element"></div>
    <div id="root">${content}</div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>\n`;
}
