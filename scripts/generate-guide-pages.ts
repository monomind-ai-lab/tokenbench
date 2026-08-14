import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_CONFIG } from '../src/brand/site-config';
import { GUIDES, guidePath, relatedGuides, type GuideArticle, type GuideSection, type GuideSource } from '../src/guides/content';
import { LEADERBOARD_ROUTES, ROUTE_PATHS } from '../src/routing/routes';
import { metadataForRoute } from '../src/seo/metadata';
import { documentHtml, escapeHtml, headMarkup, staticChrome } from '../src/seo/static-page';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
}

function sourceLink(source: GuideSource): string {
  const effective = source.effectiveAt ? `effective ${formatDate(source.effectiveAt)}` : `effective date ${source.evidenceStatus}`;
  return `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.label)} — ${escapeHtml(effective)} ↗</a>`;
}

function guideCard(guide: GuideArticle): string {
  const reading = guide.readMinutes ? `<span>${guide.readMinutes} min read</span>` : '';
  return `<article class="guide-card"><div class="guide-card-meta"><span>Guide · ${escapeHtml(guide.category)}</span><span>Updated ${formatDate(guide.updatedAt)}</span>${reading}</div><h2><a href="${guidePath(guide.slug)}">${escapeHtml(guide.title)}</a></h2><p>${escapeHtml(guide.dek)}</p><p class="article-status">Factual review: ${escapeHtml(guide.factualReview)} · Reviewer: ${escapeHtml(guide.reviewer.name ?? 'Unavailable')}</p><a class="guide-card-link" href="${guidePath(guide.slug)}">Read guide →</a></article>`;
}

function renderSection(section: GuideSection): string {
  const paragraphs = section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('');
  const steps = section.steps ? `<ol>${section.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>` : '';
  const bullets = section.bullets ? `<ul>${section.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('')}</ul>` : '';
  const table = section.table ? `<div class="guide-table-wrap" role="region" aria-label="${escapeHtml(section.title)} table" tabindex="0"><table class="guide-table"><thead><tr>${section.table.headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${section.table.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
  const callout = section.callout ? `<aside class="guide-callout"><strong>${escapeHtml(section.callout.title)}</strong><p>${escapeHtml(section.callout.text)}</p></aside>` : '';
  const sources = section.sources?.length ? `<details class="section-sources"><summary>Sources and effective dates</summary>${section.sources.map(sourceLink).join('')}</details>` : '';
  return `<section id="${section.id}" class="article-section"><h2>${escapeHtml(section.title)}</h2>${paragraphs}${steps}${bullets}${table}${callout}${sources}</section>`;
}

function guideHubContent(): string {
  const metadata = metadataForRoute({ kind: 'guides' });
  const filters = ['all', 'hybrid-routing', 'caching', 'self-hosting', 'hosting', 'tokenizers', 'lifecycle', 'selection'].map((topic) => `<a href="?topic=${topic}&amp;view=recent">${escapeHtml(topic === 'all' ? 'All topics' : topic.replaceAll('-', ' '))}</a>`).join('');
  return `<main id="page-content" class="guides-main" tabindex="-1"><section class="guides-hero"><span class="eyebrow">AI decision guides</span><h1>${escapeHtml(metadata.h1)}</h1><p>Practical, source-backed guides for routing, cost, lifecycle, and production model decisions. Evidence without a durable source date remains visibly undated.</p><div class="guides-hero-actions"><a class="button guide-primary-action" href="${ROUTE_PATHS.calculator}#calculator">Open the calculator</a><span>${GUIDES.length} field guides · editorial index reviewed ${formatDate(GUIDES[0].updatedAt)}</span></div></section><section class="guide-index"><div class="guide-index-heading"><div><span class="eyebrow">Guides</span><h2>Start with the decision you need to make</h2></div><p>Featured and recent are explicit editorial views. <a href="${ROUTE_PATHS.insights}">Browse LLM insights</a>.</p></div><nav class="article-filters" aria-label="Guide filters"><a href="?topic=all&amp;view=featured">Featured</a><a href="?topic=all&amp;view=recent">Recent</a>${filters}</nav><p role="status">${GUIDES.length} results for all · recent</p><div class="guide-grid">${GUIDES.map(guideCard).join('')}</div><p class="article-status">If live editorial metadata cannot load, this authored inventory remains available with dated or undated evidence status.</p></section></main>`;
}

function guideHubStructuredData(): unknown[] {
  const metadata = metadataForRoute({ kind: 'guides' });
  return [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: metadata.h1, description: metadata.description, url: metadata.canonical, mainEntity: { '@type': 'ItemList', itemListElement: GUIDES.map((guide, index) => ({ '@type': 'ListItem', position: index + 1, name: guide.title, url: `${SITE_CONFIG.origin}${guidePath(guide.slug)}` })) } }];
}

function evidenceBlocks(guide: GuideArticle): string {
  const render = (heading: string, body: string, kind: string) => `<section class="article-section" data-article-block="${escapeHtml(kind)}"><h2>${escapeHtml(heading)}</h2><p>${escapeHtml(body)}</p></section>`;
  const allSources = guide.factBlocks.flatMap((block) => block.sources).filter((source, index, sources) => sources.findIndex((candidate) => candidate.url === source.url) === index);
  return `${guide.factBlocks.map((block) => render(block.heading, block.body, block.kind)).join('')}${guide.interpretationBlocks.map((block) => render(block.heading, block.body, block.kind)).join('')}<section class="article-section"><h2>Sources and effective dates</h2><p>Every link is a primary evidence record. An undated state means the article does not infer an effective date.</p>${allSources.map(sourceLink).join('')}</section>`;
}

function contextualLinks(guide: GuideArticle): string {
  const leaderboardLinks = guide.contextualLinks.map((link) => `<li><a href="${LEADERBOARD_ROUTES[link.leaderboard].pathname}">${escapeHtml(link.label)}</a> — ${escapeHtml(link.description)}</li>`).join('');
  const decisionLinks = guide.relatedDecisionLinks.map((link) => `<li><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></li>`).join('');
  return `<section class="guide-callout decision-context" aria-labelledby="decision-context-heading"><span class="eyebrow">Decision context</span><h2 id="decision-context-heading">Related decision links</h2><ul>${leaderboardLinks}${decisionLinks}</ul></section>`;
}

function articleContent(guide: GuideArticle): string {
  const toc = `<details class="article-toc"><summary>On this page</summary><ol>${guide.sections.map((section) => `<li><a href="#${section.id}">${escapeHtml(section.title.replace(/^\d+\.\s*/, ''))}</a></li>`).join('')}</ol></details>`;
  const related = relatedGuides(guide);
  const cta = guide.ctaEligible ? `<aside class="editorial-cta panel" aria-label="MonoMind AI Lab editorial CTA"><p class="eyebrow">MonoMind AI Lab</p><h2>Turn this evidence into a deployment plan</h2><p>Get a focused review of model, cost, and evaluation trade-offs for your production constraints.</p><a class="button" href="https://monomind.ai/">Talk to MonoMind AI Lab</a></aside>` : '';
  return `<main id="page-content" class="guides-main article-main" tabindex="-1"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="${ROUTE_PATHS.articles}">Articles</a><span>›</span><a href="${ROUTE_PATHS.guides}">Guides</a><span>›</span><span aria-current="page">${escapeHtml(guide.title)}</span></nav><article class="guide-article"><header class="article-header"><span class="eyebrow">Guide · ${escapeHtml(guide.category)}</span><h1>${escapeHtml(guide.title)}</h1><p class="article-dek">${escapeHtml(guide.dek)}</p><div class="article-byline"><span>Published ${formatDate(guide.publishedAt)}</span><span>Updated ${formatDate(guide.updatedAt)}</span><span>Factual review: ${escapeHtml(guide.factualReview)}</span><span>Author: ${escapeHtml(guide.author.name ?? 'Unavailable')}</span><span>Reviewer: ${escapeHtml(guide.reviewer.name ?? 'Unavailable')}</span>${guide.readMinutes ? `<span>${guide.readMinutes} min read</span>` : ''}</div><p class="article-status">Evidence review state: ${escapeHtml(guide.factualReview)}. Undated or incomplete source claims are not treated as current facts.</p></header><div class="article-layout"><div class="article-body"><section class="takeaways"><span class="eyebrow">Decision</span><h2>Decision question</h2><p>${escapeHtml(guide.decisionQuestion)}</p><h2>Concise answer</h2><p>${escapeHtml(guide.answer)}</p></section><section class="article-section"><h2>Assumptions</h2><ul>${guide.assumptions.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section><section class="article-section"><h2>Reproducible framework</h2><ol>${guide.framework.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol></section>${evidenceBlocks(guide)}${guide.sections.map(renderSection).join('')}<section class="article-section"><h2>Limitations and comparability</h2><ul>${guide.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section></div>${toc}</div></article><section class="related-guides"><div class="guide-index-heading"><div><span class="eyebrow">Keep evaluating</span><h2>Related guides</h2></div><a href="${ROUTE_PATHS.guides}">View all guides</a></div><div class="related-grid">${related.map(guideCard).join('')}</div></section>${contextualLinks(guide)}${cta}</main>`;
}

function articleStructuredData(guide: GuideArticle): unknown[] {
  const metadata = metadataForRoute({ kind: 'guides', slug: guide.slug });
  return [
    { '@context': 'https://schema.org', '@type': 'Article', headline: guide.title, description: guide.description, datePublished: guide.publishedAt, dateModified: guide.updatedAt, image: metadata.openGraph.image, mainEntityOfPage: metadata.canonical, author: { '@type': 'Organization', name: guide.author.name ?? SITE_CONFIG.parentName, url: SITE_CONFIG.parentUrl }, publisher: { '@type': 'Organization', name: SITE_CONFIG.parentName, url: SITE_CONFIG.parentUrl }, keywords: guide.keywords.join(', ') },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: SITE_CONFIG.name, item: SITE_CONFIG.origin }, { '@type': 'ListItem', position: 2, name: 'Guides', item: `${SITE_CONFIG.origin}${ROUTE_PATHS.guides}` }, { '@type': 'ListItem', position: 3, name: guide.title, item: metadata.canonical }] },
  ];
}

export async function generateGuidePages(outputRoot: string): Promise<void> {
  await mkdir(outputRoot, { recursive: true });
  const hubMetadata = metadataForRoute({ kind: 'guides' });
  await writeFile(resolve(outputRoot, 'index.html'), documentHtml(headMarkup(hubMetadata, guideHubStructuredData()), staticChrome(guideHubContent(), 'guides')));
  await Promise.all(GUIDES.map(async (guide) => {
    const metadata = metadataForRoute({ kind: 'guides', slug: guide.slug });
    const articleDir = resolve(outputRoot, guide.slug);
    await mkdir(articleDir, { recursive: true });
    await writeFile(resolve(articleDir, 'index.html'), documentHtml(headMarkup(metadata, articleStructuredData(guide)), staticChrome(articleContent(guide), 'guides')));
  }));
}

async function runGuideGenerator(): Promise<void> {
  const outputRoot = resolve(process.cwd(), 'articles', 'guides');
  await generateGuidePages(outputRoot);
  console.log(`Generated ${GUIDES.length + 1} guide pages.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runGuideGenerator();
