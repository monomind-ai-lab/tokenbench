import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { GUIDES, guidePath, relatedGuides, type GuideArticle, type GuideSection } from '../src/guides/content';

const SITE_URL = 'https://ai-plans.monomind.one';
const SOCIAL_IMAGE = `${SITE_URL}/og-guides.png`;
const outputRoot = resolve(process.cwd(), 'guides');

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function jsonLd(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
}

function headMarkup({ title, description, canonical, type, structuredData }: { title: string; description: string; canonical: string; type: 'website' | 'article'; structuredData: unknown[] }): string {
  return `<meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <meta name="robots" content="index,follow,max-image-preview:large">
    <link rel="canonical" href="${canonical}">
    <meta property="og:type" content="${type}">
    <meta property="og:site_name" content="AI Cost Engine">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${canonical}">
    <meta property="og:image" content="${SOCIAL_IMAGE}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="AI Cost Engine guides for spending smarter on AI">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="${SOCIAL_IMAGE}">
    <script>try{document.documentElement.dataset.theme=localStorage.getItem('ai-cost-engine:theme')==='dark'?'dark':'light'}catch(e){document.documentElement.dataset.theme='light'}</script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/src/index.css">
    ${structuredData.map((data) => `<script type="application/ld+json">${jsonLd(data)}</script>`).join('\n    ')}`;
}

function chrome(content: string): string {
  return `<div class="app-shell guides-shell">
      <a class="skip-link" href="#guide-content">Skip to guide content</a>
      <header class="top-header"><div class="header-inner">
        <div class="brand-lockup"><a class="brand-name" href="/">AI Cost Engine</a></div>
        <nav class="primary-nav" aria-label="Primary navigation"><a href="/">Calculator</a><a href="/#comparison">Pricing</a><a href="/guides/" aria-current="page">Guides</a></nav>
      </div></header>
      ${content}
      <footer class="app-footer"><span>MonoMind AI Lab · 2026</span><span>Independent, source-backed guidance.</span><span>Verify provider terms before purchasing.</span></footer>
    </div>`;
}

function documentHtml(head: string, content: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    ${head}
  </head>
  <body>
    <div id="google_translate_element"></div>
    <div id="root">${chrome(content)}</div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>\n`;
}

function guideCard(guide: GuideArticle): string {
  return `<article class="guide-card"><div class="guide-card-meta"><span>${escapeHtml(guide.category)}</span><span>${guide.readMinutes} min read</span></div><h2><a href="${guidePath(guide.slug)}">${escapeHtml(guide.title)}</a></h2><p>${escapeHtml(guide.dek)}</p><a class="guide-card-link" href="${guidePath(guide.slug)}">Read guide →</a></article>`;
}

function renderSection(section: GuideSection): string {
  const paragraphs = section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('');
  const steps = section.steps ? `<ol>${section.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>` : '';
  const bullets = section.bullets ? `<ul>${section.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('')}</ul>` : '';
  const table = section.table ? `<div class="guide-table-wrap"><table class="guide-table"><thead><tr>${section.table.headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${section.table.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
  const callout = section.callout ? `<aside class="guide-callout"><strong>${escapeHtml(section.callout.title)}</strong><p>${escapeHtml(section.callout.text)}</p></aside>` : '';
  const sources = section.sources?.length ? `<div class="section-sources"><span>Official references</span>${section.sources.map((source) => `<a href="${source.url}" target="_blank" rel="noreferrer">${escapeHtml(source.label)} ↗</a>`).join('')}</div>` : '';
  return `<section id="${section.id}" class="article-section"><h2>${escapeHtml(section.title)}</h2>${paragraphs}${steps}${bullets}${table}${callout}${sources}</section>`;
}

async function createHub(): Promise<void> {
  const canonical = `${SITE_URL}/guides/`;
  const description = 'Practical, source-backed guides to track AI usage, compare access paths, find legitimate free APIs, and reduce token costs.';
  const content = `<main id="guide-content" class="guides-main"><section class="guides-hero"><span class="eyebrow">AI bill playbook</span><h1>Spend smarter on AI</h1><p>Practical, source-backed guides for measuring usage, choosing the right access path, and cutting avoidable token costs without trading away quality.</p><div class="guides-hero-actions"><a class="button guide-primary-action" href="/#calculator">Open the calculator</a><span>5 field guides · Reviewed ${formatDate(GUIDES[0].updatedAt)}</span></div></section><section class="guide-index"><div class="guide-index-heading"><div><span class="eyebrow">Guides</span><h2>Start with the bill you can see</h2></div><p>Each guide links to official documentation and the next useful step.</p></div><div class="guide-grid">${GUIDES.map(guideCard).join('')}</div></section></main>`;
  const structuredData = [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'AI Cost Optimization Guides', description, url: canonical, mainEntity: { '@type': 'ItemList', itemListElement: GUIDES.map((guide, index) => ({ '@type': 'ListItem', position: index + 1, name: guide.title, url: `${SITE_URL}${guidePath(guide.slug)}` })) } }];
  await mkdir(outputRoot, { recursive: true });
  await writeFile(resolve(outputRoot, 'index.html'), documentHtml(headMarkup({ title: 'AI Cost Optimization Guides | AI Cost Engine', description, canonical, type: 'website', structuredData }), content));
}

async function createArticle(guide: GuideArticle): Promise<void> {
  const canonical = `${SITE_URL}${guidePath(guide.slug)}`;
  const toc = `<aside class="article-toc" aria-label="On this page"><strong>On this page</strong><ol>${guide.sections.map((section) => `<li><a href="#${section.id}">${escapeHtml(section.title.replace(/^\d+\.\s*/, ''))}</a></li>`).join('')}</ol></aside>`;
  const related = relatedGuides(guide);
  const content = `<main id="guide-content" class="guides-main article-main"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/guides/">Guides</a><span>›</span><span aria-current="page">${escapeHtml(guide.category)}</span></nav><article class="guide-article"><header class="article-header"><span class="eyebrow">${escapeHtml(guide.category)}</span><h1>${escapeHtml(guide.title)}</h1><p class="article-dek">${escapeHtml(guide.dek)}</p><div class="article-byline"><span>By MonoMind AI Lab</span><span>Updated ${formatDate(guide.updatedAt)}</span><span>${guide.readMinutes} min read</span></div></header><div class="article-layout"><div class="article-body"><aside class="takeaways"><span class="eyebrow">At a glance</span><h2>What you’ll learn</h2><ul>${guide.takeaways.map((takeaway) => `<li>${escapeHtml(takeaway)}</li>`).join('')}</ul></aside>${guide.sections.map(renderSection).join('')}<aside class="calculator-cta"><div><span class="eyebrow">Put the numbers to work</span><h2>Compare your usage with current plan and API prices</h2><p>Use your observed monthly tokens and model mix to estimate API-equivalent value and potential savings.</p></div><a class="button" href="/#calculator">Open calculator →</a></aside></div>${toc}</div></article><section class="related-guides"><div class="guide-index-heading"><div><span class="eyebrow">Keep optimizing</span><h2>Related guides</h2></div><a href="/guides/">View all guides</a></div><div class="related-grid">${related.map(guideCard).join('')}</div></section></main>`;
  const structuredData = [
    { '@context': 'https://schema.org', '@type': 'Article', headline: guide.title, description: guide.description, datePublished: guide.publishedAt, dateModified: guide.updatedAt, image: SOCIAL_IMAGE, mainEntityOfPage: canonical, author: { '@type': 'Organization', name: 'MonoMind AI Lab' }, publisher: { '@type': 'Organization', name: 'MonoMind AI Lab', url: SITE_URL }, keywords: guide.keywords.join(', ') },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Calculator', item: SITE_URL }, { '@type': 'ListItem', position: 2, name: 'Guides', item: `${SITE_URL}/guides/` }, { '@type': 'ListItem', position: 3, name: guide.title, item: canonical }] },
  ];
  const articleDir = resolve(outputRoot, guide.slug);
  await mkdir(articleDir, { recursive: true });
  await writeFile(resolve(articleDir, 'index.html'), documentHtml(headMarkup({ title: `${guide.seoTitle} | AI Cost Engine`, description: guide.description, canonical, type: 'article', structuredData }), content));
}

await rm(outputRoot, { recursive: true, force: true });
await createHub();
await Promise.all(GUIDES.map(createArticle));
console.log(`Generated ${GUIDES.length + 1} guide pages.`);
