import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_CONFIG } from '../src/brand/site-config';
import { GUIDES, guidePath, relatedGuides, type GuideArticle, type GuideSection } from '../src/guides/content';
import { metadataForRoute } from '../src/seo/metadata';
import { documentHtml, escapeHtml, headMarkup, staticChrome } from '../src/seo/static-page';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
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

function guideHubContent(): string {
  const metadata = metadataForRoute({ kind: 'guides' });
  return `<main id="page-content" class="guides-main"><section class="guides-hero"><span class="eyebrow">AI bill playbook</span><h1>${escapeHtml(metadata.h1)}</h1><p>Practical, source-backed guides for measuring usage, choosing the right access path, and cutting avoidable token costs without trading away quality.</p><div class="guides-hero-actions"><a class="button guide-primary-action" href="/tools/subscriptions-vs-apis/#calculator">Open the calculator</a><span>5 field guides · Reviewed ${formatDate(GUIDES[0].updatedAt)}</span></div></section><section class="guide-index"><div class="guide-index-heading"><div><span class="eyebrow">Guides</span><h2>Start with the bill you can see</h2></div><p>Each guide links to official documentation and the next useful step.</p></div><div class="guide-grid">${GUIDES.map(guideCard).join('')}</div></section></main>`;
}

function guideHubStructuredData(): unknown[] {
  const metadata = metadataForRoute({ kind: 'guides' });
  return [{
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: metadata.h1,
    description: metadata.description,
    url: metadata.canonical,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: GUIDES.map((guide, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: guide.title,
        url: `${SITE_CONFIG.origin}${guidePath(guide.slug)}`,
      })),
    },
  }];
}

function articleContent(guide: GuideArticle): string {
  const toc = `<aside class="article-toc" aria-label="On this page"><strong>On this page</strong><ol>${guide.sections.map((section) => `<li><a href="#${section.id}">${escapeHtml(section.title.replace(/^\d+\.\s*/, ''))}</a></li>`).join('')}</ol></aside>`;
  const related = relatedGuides(guide);
  return `<main id="page-content" class="guides-main article-main"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/guides/">Guides</a><span>›</span><span aria-current="page">${escapeHtml(guide.category)}</span></nav><article class="guide-article"><header class="article-header"><span class="eyebrow">${escapeHtml(guide.category)}</span><h1>${escapeHtml(guide.title)}</h1><p class="article-dek">${escapeHtml(guide.dek)}</p><div class="article-byline"><span>By ${SITE_CONFIG.parentName}</span><span>Updated ${formatDate(guide.updatedAt)}</span><span>${guide.readMinutes} min read</span></div></header><div class="article-layout"><div class="article-body"><aside class="takeaways"><span class="eyebrow">At a glance</span><h2>What you’ll learn</h2><ul>${guide.takeaways.map((takeaway) => `<li>${escapeHtml(takeaway)}</li>`).join('')}</ul></aside>${guide.sections.map(renderSection).join('')}<aside class="calculator-cta"><div><span class="eyebrow">Put the numbers to work</span><h2>Compare your usage with current plan and API prices</h2><p>Use your observed monthly tokens and model mix to estimate API-equivalent value and potential savings.</p></div><a class="button" href="/tools/subscriptions-vs-apis/#calculator">Open calculator →</a></aside></div>${toc}</div></article><section class="related-guides"><div class="guide-index-heading"><div><span class="eyebrow">Keep optimizing</span><h2>Related guides</h2></div><a href="/guides/">View all guides</a></div><div class="related-grid">${related.map(guideCard).join('')}</div></section></main>`;
}

function articleStructuredData(guide: GuideArticle): unknown[] {
  const metadata = metadataForRoute({ kind: 'guides', slug: guide.slug });
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: guide.title,
      description: guide.description,
      datePublished: guide.publishedAt,
      dateModified: guide.updatedAt,
      image: metadata.openGraph.image,
      mainEntityOfPage: metadata.canonical,
      author: { '@type': 'Organization', name: SITE_CONFIG.parentName, url: SITE_CONFIG.parentUrl },
      publisher: { '@type': 'Organization', name: SITE_CONFIG.parentName, url: SITE_CONFIG.parentUrl },
      keywords: guide.keywords.join(', '),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: SITE_CONFIG.name, item: SITE_CONFIG.origin },
        { '@type': 'ListItem', position: 2, name: 'Guides', item: `${SITE_CONFIG.origin}/guides/` },
        { '@type': 'ListItem', position: 3, name: guide.title, item: metadata.canonical },
      ],
    },
  ];
}

export async function generateGuidePages(outputRoot: string): Promise<void> {
  await mkdir(outputRoot, { recursive: true });

  const hubMetadata = metadataForRoute({ kind: 'guides' });
  await writeFile(resolve(outputRoot, 'index.html'), documentHtml(
    headMarkup(hubMetadata, guideHubStructuredData()),
    staticChrome(guideHubContent(), 'guides'),
  ));

  await Promise.all(GUIDES.map(async (guide) => {
    const metadata = metadataForRoute({ kind: 'guides', slug: guide.slug });
    const articleDir = resolve(outputRoot, guide.slug);
    await mkdir(articleDir, { recursive: true });
    await writeFile(resolve(articleDir, 'index.html'), documentHtml(
      headMarkup(metadata, articleStructuredData(guide)),
      staticChrome(articleContent(guide), 'guides'),
    ));
  }));
}

async function runGuideGenerator(): Promise<void> {
  const outputRoot = resolve(process.cwd(), 'guides');
  await generateGuidePages(outputRoot);
  console.log(`Generated ${GUIDES.length + 1} guide pages.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runGuideGenerator();
}
