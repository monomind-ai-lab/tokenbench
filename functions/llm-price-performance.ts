import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { PricePerformanceRoute } from '../src/App';
import { parsePricePerformanceEnvelope, type PricePerformanceEnvelope } from '../src/benchmarks/price-performance-contracts';
import { SITE_CONFIG } from '../src/brand/site-config';
import { metadataForRoute, type PageMetadata } from '../src/seo/metadata';
import { headMarkup, staticChrome } from '../src/seo/static-page';
import { escapeHtmlText, serializeJsonForScript } from './_shared/html';
import type { BenchmarkApiEnv } from './_shared/benchmark-db';
import { onRequestGet as readPricePerformanceApi } from './api/benchmarks/price-performance';

const PRICE_PERFORMANCE_PATH = '/llm-price-performance/';

function structuredData(envelope: PricePerformanceEnvelope, metadata: PageMetadata): readonly unknown[] {
  const datasetId = `${metadata.canonical}#price-performance-dataset`;
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: metadata.title,
      description: metadata.description,
      url: metadata.canonical,
      datePublished: envelope.publishedAt,
      dateModified: envelope.freshness.checkedAt,
      isPartOf: { '@type': 'WebSite', name: SITE_CONFIG.name, url: SITE_CONFIG.origin },
      mainEntity: { '@id': datasetId },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      '@id': datasetId,
      name: 'TokenBench LLM price versus performance evidence',
      description: metadata.description,
      url: metadata.canonical,
      version: envelope.revision,
      datePublished: envelope.publishedAt,
      dateModified: envelope.freshness.checkedAt,
      measurementTechnique: [
        'TokenBench price-performance projection v1',
        ...Object.values(envelope.data.scoreMethodology),
        envelope.data.costDefinitions.output,
        envelope.data.costDefinitions.blended3To1,
      ],
      variableMeasured: [
        ...Object.entries(envelope.data.scoreMethodology).map(([name, description]) => ({
          '@type': 'PropertyValue',
          name,
          description,
          unitText: 'score',
        })),
        { '@type': 'PropertyValue', name: 'output price', unitText: 'USD per one million tokens' },
        { '@type': 'PropertyValue', name: '3:1 blended price', unitText: 'USD per one million tokens' },
      ],
      citation: envelope.attribution.map((source) => source.url),
      includedInDataCatalog: { '@type': 'DataCatalog', name: SITE_CONFIG.name, url: SITE_CONFIG.origin },
    },
  ];
}

/** Shared with the local preview harness so browser checks exercise production SSR. */
export function renderPricePerformanceDocument(envelope: PricePerformanceEnvelope): string {
  const metadata = metadataForRoute({ kind: 'pricePerformance' });
  const root = renderToString(createElement(PricePerformanceRoute, { initialEnvelope: envelope }));
  const scripts = structuredData(envelope, metadata)
    .map((value) => `<script type="application/ld+json">${serializeJsonForScript(value)}</script>`)
    .join('\n    ');
  return `<!doctype html>
<html lang="en" data-theme="${SITE_CONFIG.defaultTheme}">
  <head>
    ${headMarkup(metadata, [])}
    <link rel="stylesheet" href="/assets/tokenbench.css">
    ${scripts}
  </head>
  <body>
    <div id="google_translate_element"></div>
    <div id="root">${root}</div>
    <script id="price-performance-initial-data" type="application/json">${serializeJsonForScript(envelope)}</script>
    <script type="module" src="/assets/main.js"></script>
  </body>
</html>\n`;
}

function unavailableMetadata(): PageMetadata {
  const base = metadataForRoute({ kind: 'pricePerformance' });
  const title = `LLM price vs performance temporarily unavailable | ${SITE_CONFIG.name}`;
  const description = 'The last valid TokenBench price-performance projection cannot be loaded right now. Existing published evidence is never replaced with invented or partial values.';
  return {
    ...base,
    title,
    description,
    robots: 'noindex,follow',
    openGraph: { ...base.openGraph, title, description },
    twitter: { ...base.twitter, title, description },
  };
}

function unavailableDocument(): string {
  const metadata = unavailableMetadata();
  const content = staticChrome(`<main id="page-content" class="content-stack price-performance-page"><section class="panel price-performance-hero"><span class="eyebrow">TokenBench decision surface</span><h1>${escapeHtmlText('LLM price vs performance is temporarily unavailable')}</h1><p>${escapeHtmlText(metadata.description)}</p><p><a class="button button-secondary" href="/models/">Browse model evidence</a></p></section></main>`, 'pricePerformance');
  return `<!doctype html>
<html lang="en" data-theme="${SITE_CONFIG.defaultTheme}">
  <head>
    ${headMarkup(metadata, [])}
    <link rel="stylesheet" href="/assets/tokenbench.css">
  </head>
  <body>
    <div id="google_translate_element"></div>
    <div id="root">${content}</div>
  </body>
</html>\n`;
}

function unavailableResponse(): Response {
  return new Response(unavailableDocument(), {
    status: 503,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': 'noindex, follow',
    },
  });
}

export async function onRequestGet({ request, env }: { request: Request; env: BenchmarkApiEnv }): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  if (pathname === '/llm-price-performance') {
    return new Response(null, { status: 301, headers: { Location: PRICE_PERFORMANCE_PATH } });
  }
  if (pathname !== PRICE_PERFORMANCE_PATH || !env.CATALOG_DB) return unavailableResponse();

  try {
    const apiRequest = new Request(new URL('/api/benchmarks/price-performance', request.url), {
      headers: { accept: 'application/json', 'x-request-id': request.headers.get('x-request-id') ?? crypto.randomUUID() },
    });
    const response = await readPricePerformanceApi({ request: apiRequest, env });
    if (!response.ok) return unavailableResponse();
    const envelope = parsePricePerformanceEnvelope(await response.json() as unknown);
    if (!envelope) return unavailableResponse();
    return new Response(renderPricePerformanceDocument(envelope), {
      headers: {
        'Cache-Control': 'public, max-age=0, must-revalidate',
        'Content-Type': 'text/html; charset=utf-8',
        'X-Robots-Tag': 'index, follow',
      },
    });
  } catch {
    return unavailableResponse();
  }
}
