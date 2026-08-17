import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_CONFIG } from '../src/brand/site-config';
import { articlePath, GUIDES, type GuideArticle } from '../src/guides/content';
import { PREVIEW_ROUTE_PATHS, ROUTE_PATHS } from '../src/routing/routes';
import { metadataForRoute } from '../src/seo/metadata';
import { documentHtml, escapeHtml, headMarkup, staticChrome } from '../src/seo/static-page';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
}

function guideCard(guide: GuideArticle): string {
  return `<article class="guide-card"><div class="guide-card-meta"><span>${escapeHtml(guide.category)}</span><span>${guide.readMinutes} min read</span></div><h2><a href="${articlePath(guide.slug)}">${escapeHtml(guide.title)}</a></h2><p>${escapeHtml(guide.dek)}</p><a class="guide-card-link" href="${articlePath(guide.slug)}">Read guide →</a></article>`;
}

function guideHubContent(): string {
  const metadata = metadataForRoute({ kind: 'guides' });
  return `<main id="page-content" class="guides-main" tabindex="-1"><section class="guides-hero"><span class="eyebrow">AI bill playbook</span><h1>${escapeHtml(metadata.h1)}</h1><p>Practical, source-backed guides for measuring usage, choosing the right access path, and cutting avoidable token costs without trading away quality.</p><div class="guides-hero-actions"><a class="button guide-primary-action" href="${PREVIEW_ROUTE_PATHS.calculator}">Open Subscribe vs API</a><span>5 field guides · Reviewed ${formatDate(GUIDES[0].updatedAt)}</span></div></section><section class="guide-index"><div class="guide-index-heading"><div><span class="eyebrow">Guides</span><h2>Start with the bill you can see</h2></div><p>Each guide links to official documentation and the next useful step.</p></div><div class="guide-grid">${GUIDES.map(guideCard).join('')}</div></section></main>`;
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
        url: `${SITE_CONFIG.origin}${articlePath(guide.slug)}`,
      })),
    },
  }];
}

export async function generateGuidePages(outputRoot: string): Promise<void> {
  const guideHubRoot = resolve(outputRoot, 'guides');
  await mkdir(guideHubRoot, { recursive: true });

  const hubMetadata = metadataForRoute({ kind: 'guides' });
  await writeFile(resolve(guideHubRoot, 'index.html'), documentHtml(
    headMarkup(hubMetadata, guideHubStructuredData()),
    staticChrome(guideHubContent(), 'guides'),
  ));

}

async function runGuideGenerator(): Promise<void> {
  await generateGuidePages(process.cwd());
  console.log('Generated the legacy guide hub.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runGuideGenerator();
}
