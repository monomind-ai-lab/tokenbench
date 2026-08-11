import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_CONFIG } from '../src/brand/site-config';
import {
  FIXED_ROUTES,
  LEADERBOARD_ROUTES,
  staticHtmlEntries,
  type AppRoute,
} from '../src/routing/routes';
import { metadataForRoute, type PageMetadata } from '../src/seo/metadata';
import { documentHtml, escapeHtml, headMarkup, staticChrome, transactionalChrome, type StaticNavigationPage } from '../src/seo/static-page';
import { generateGuidePages } from './generate-guide-pages';

function activeNavigation(route: AppRoute): StaticNavigationPage {
  switch (route.kind) {
    case 'tools': return undefined;
    case 'calculator': return 'calculator';
    case 'home': return 'home';
    case 'compareHub': return 'compare';
    case 'models': return 'models';
    case 'newsletterConfirmed': return undefined;
    case 'leaderboards':
    case 'leaderboard':
    case 'methodologyBenchAlign': return 'leaderboards';
    case 'guides': return 'guides';
    default: return undefined;
  }
}

function pageIntro(metadata: PageMetadata, body: string): string {
  return `<main id="page-content" class="page-main" tabindex="-1"><section class="content-stack static-page-content"><span class="eyebrow">${SITE_CONFIG.name}</span><h1>${escapeHtml(metadata.h1)}</h1>${body}</section></main>`;
}

function fixedPageContent(
  route: Exclude<AppRoute, { kind: 'guides' } | { kind: 'comparison' } | { kind: 'redirect' } | { kind: 'notFound' }>,
  metadata: PageMetadata,
): string {
  switch (route.kind) {
    case 'home':
      return pageIntro(metadata, `<p>${escapeHtml(metadata.description)}</p><div class="static-page-links"><a class="button" href="/compare/">Compare models</a><a class="button" href="/tools/subscriptions-vs-apis/">Calculate subscription vs API</a><a class="button" href="/leaderboards/">Browse leaderboards</a></div><section><h2>Make an evidence-aware decision</h2><p>Compare direct API pricing, paid subscriptions, workload context, and benchmark categories without treating missing measurements as zero or presenting estimates as facts.</p></section>`);
    case 'tools':
      return pageIntro(metadata, `<p>Use ${SITE_CONFIG.name} tools to frame AI cost decisions from your observed usage and the provider evidence that is available for the exact route you are considering.</p><section><h2>Available tool</h2><article><h3><a href="/tools/subscriptions-vs-apis/">Subscription vs API cost calculator</a></h3><p>Estimate an API-equivalent cost from monthly tokens and model mix, then compare it with a paid individual subscription while keeping variable limits explicit.</p></article></section>`);
    case 'calculator':
      return pageIntro(metadata, `<p>Estimate how a paid individual AI subscription compares with direct API pricing. The interactive calculator mounts here in the browser; this crawlable summary explains its inputs and evidence boundaries.</p><section><h2>Use observed workload inputs</h2><p>Choose a provider, plan, model mix, input/output share, and expected monthly token volume. Treat unpublished or guardrail-limited capacity as variable rather than inventing a token cap.</p></section><section><h2>Review the source before purchasing</h2><p>${SITE_CONFIG.name} calculations are decision aids. Follow the provider evidence for current terms, included models, billing conditions, and availability before acting on an estimate.</p></section>`);
    case 'methodologyBenchAlign':
      // No canonical active-summary artifact is present in this build, so no
      // source version can be proven here. The hydrated page reads the active
      // same-origin summary and replaces this truthful fallback when available.
      return pageIntro(metadata, `<p>${SITE_CONFIG.name} republishes BenchLM&#039;s BenchAlign results without recalculating them. <a href="https://benchlm.ai/methodology">Read BenchLM&#039;s methodology</a> for the source method.</p><section><h2>What each view represents</h2><p>Overall, Agentic, and Coding are validated BenchAlign views. Reasoning, Multimodal, and Knowledge are BenchLM-published category evidence lenses, not additional TokenBench rankings.</p><p>Supported rows are source-published results eligible for their exact view. Reviewed estimated rows stay visibly estimated and appear after supported evidence where a route allows them; they are never silently promoted into a validated ranking. Missing measurements remain Unavailable, never zero.</p></section><section><h2>Metrics and runtime</h2><p>Weighted metrics affect the relevant BenchAlign method only. Display-only metrics add context without changing the published order. Runtime is a separate signal, not a substitute for capability evidence or a hidden ranking weight.</p></section><section><h2>Method and refresh status</h2><p>Published method version: <strong>Unavailable</strong>.</p><p>BenchLM refreshes its source output on its own schedule. TokenBench checks that source once daily within its broader Worker, which runs twice daily; a successful TokenBench check does not claim that BenchLM published a new method or result.</p></section>`);
    case 'newsletterConfirmed':
      // Standalone transactional shell: no site navigation or footer actions.
      return `<main id="page-content" class="page-main newsletter-confirmed" tabindex="-1" aria-labelledby="newsletter-confirmed-heading"><div class="newsletter-confirmed-mark" aria-hidden="true">${SITE_CONFIG.name}</div><p class="eyebrow">Email confirmed</p><h1 id="newsletter-confirmed-heading">Your subscription is confirmed.</h1><p>The current TokenBench test cheatsheet will arrive by email.</p><a class="button" href="/">Start Exploring</a></main>`;
    case 'models':
      return pageIntro(metadata, `<p>Browse the current BenchLM-derived weekly top 100 and search retained model profiles with source-linked benchmark, pricing, and evidence facts.</p><section><h2>Decision facts stay visible</h2><p>Each model keeps its weekly rank, overall score, strongest category, representative direct API price, and evidence status in one responsive directory. Search results include models that have left the current weekly list.</p></section>`);
    case 'compareHub':
      return pageIntro(metadata, `<p>${SITE_CONFIG.name} comparison pages help teams examine model capability context and cost information side by side. A searchable comparison experience will load in the browser when current benchmark evidence is available.</p><section><h2>Compare evidence, not a fabricated universal score</h2><p>Use source timestamps, category measurements, route-level pricing, and explicit unavailable states to decide which models deserve a deeper workload-specific evaluation.</p></section>`);
    case 'leaderboards':
      return pageIntro(metadata, `<p>Explore current model leaders by capability, workload, cost, and human preference.</p><section><h2>Leaderboard categories</h2><p>Each leaderboard shows its source, methodology, timestamp, and unavailable-data treatment with the published revision.</p><ul>${Object.values(LEADERBOARD_ROUTES).map((route) => `<li><a href="${route.pathname}">${escapeHtml(route.seo.h1)}</a></li>`).join('')}</ul></section>`);
    case 'leaderboard': {
      const definition = LEADERBOARD_ROUTES[route.key];
      return pageIntro(metadata, `<p>${escapeHtml(definition.seo.summary)}</p><section class="empty-state"><strong>Awaiting a published benchmark revision</strong><p>Live ranking data is not embedded in this static shell. When a supported revision is available, ${SITE_CONFIG.name} will show the source metric, publication timestamp, methodology, and any unavailable measurements instead of inventing a ranking.</p></section><section><h2>Evidence and methodology</h2><p>This page will attribute its displayed data to the applicable source, including BenchLM, LMArena, OpenRouter, or ${SITE_CONFIG.name}-derived calculations. Source availability and methodology remain visible with the results.</p></section>`);
    }
  }
}

function structuredDataFor(route: AppRoute, metadata: PageMetadata): unknown[] {
  const type = route.kind === 'home' || route.kind === 'calculator'
    ? 'WebApplication'
    : route.kind === 'tools' || route.kind === 'compareHub' || route.kind === 'leaderboards' || route.kind === 'models'
      ? 'CollectionPage'
      : 'WebPage';
  return [{
    '@context': 'https://schema.org',
    '@type': type,
    name: metadata.h1,
    description: metadata.description,
    url: metadata.canonical,
    publisher: {
      '@type': 'Organization',
      name: SITE_CONFIG.parentName,
      url: SITE_CONFIG.parentUrl,
    },
  }];
}

function staticSitemap(): string {
  // Indexable canonical pages only; noindex,follow transactional routes such
  // as the confirmation page are generated but never advertised in the sitemap.
  const urls = FIXED_ROUTES
    .map(({ route }) => metadataForRoute(route))
    .filter((metadata) => metadata.robots !== 'noindex,follow')
    .map((metadata) => metadata.canonical);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${escapeHtml(url)}</loc></url>`).join('\n')}
</urlset>
`;
}

export async function generateStaticPages(rootDir: string): Promise<void> {
  const inputs = staticHtmlEntries(rootDir);

  await Promise.all(FIXED_ROUTES.map(async ({ id, route }) => {
      if (route.kind === 'guides') return;
      const metadata = metadataForRoute(route);
      const content = fixedPageContent(route, metadata);
      const outputPath = inputs[id];
      const isTransactional = route.kind === 'newsletterConfirmed';
      const chrome = isTransactional
        ? transactionalChrome(content)
        : staticChrome(content, activeNavigation(route));
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, documentHtml(
        headMarkup(metadata, structuredDataFor(route, metadata), { includeTranslation: !isTransactional }),
        chrome,
        { includeTranslation: !isTransactional },
      ));
    }));

  await generateGuidePages(resolve(rootDir, 'guides'));

  const sitemapPath = resolve(rootDir, 'public', 'sitemaps', 'static.xml');
  await mkdir(dirname(sitemapPath), { recursive: true });
  await writeFile(sitemapPath, staticSitemap());
}

async function runStaticGenerator(): Promise<void> {
  await generateStaticPages(process.cwd());
  console.log(`Generated ${FIXED_ROUTES.length} crawlable fixed pages and public/sitemaps/static.xml.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runStaticGenerator();
}
