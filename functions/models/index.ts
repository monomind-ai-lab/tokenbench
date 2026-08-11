import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { ModelsApp } from '../../src/pages/models-page';
import { SITE_CONFIG } from '../../src/brand/site-config';
import type { ModelDirectoryQueryState } from '../../src/frontend/model-directory-state';
import { themeBootstrapMarkup } from '../../src/brand/theme-bootstrap';
import {
  escapeHtmlAttribute,
  escapeHtmlText,
  serializeJsonForScript,
} from '../_shared/html';
import {
  ModelDirectoryRequestError,
  readModelDirectory,
  type ModelDirectoryEnvelope,
  type ModelDirectoryQuery,
} from '../_shared/model-directory-db';
import type { BenchmarkModel, EvidenceStatus } from '../../src/benchmarks/contracts';
import type { ModelDirectoryStatus } from '../../src/benchmarks/model-directory';
import { metadataForRoute } from '../../src/seo/metadata';
import type { BenchmarkApiEnv } from '../_shared/benchmark-db';

const ALLOWED_PARAMETERS = new Set(['q', 'creator', 'sourceType', 'evidenceStatus', 'status', 'limit', 'cursor']);
const MODELS_PATH = '/models/';

function optionalBounded(value: string | null, maximum: number): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximum) throw new ModelDirectoryRequestError('invalid model directory parameter');
  return normalized;
}

function parseQuery(request: Request): ModelDirectoryQuery {
  const url = new URL(request.url);
  for (const [key] of url.searchParams) {
    if (!ALLOWED_PARAMETERS.has(key) || url.searchParams.getAll(key).length !== 1) throw new ModelDirectoryRequestError('invalid model directory parameter');
  }
  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length > 80) throw new ModelDirectoryRequestError('invalid model directory search');
  const creator = optionalBounded(url.searchParams.get('creator'), 80);
  const sourceTypeValue = url.searchParams.get('sourceType');
  const sourceType: BenchmarkModel['sourceType'] | null = sourceTypeValue === null
    ? null
    : sourceTypeValue === 'Proprietary' || sourceTypeValue === 'Open Weight' || sourceTypeValue === 'Unknown'
      ? sourceTypeValue
      : (() => { throw new ModelDirectoryRequestError('invalid model directory source type'); })();
  const evidenceValue = url.searchParams.get('evidenceStatus');
  const evidenceStatus: EvidenceStatus | null = evidenceValue === null
    ? null
    : evidenceValue === 'supported' || evidenceValue === 'estimated' || evidenceValue === 'source_only'
      ? evidenceValue
      : (() => { throw new ModelDirectoryRequestError('invalid model directory evidence status'); })();
  const statusValue = url.searchParams.get('status') ?? (q.length > 0 ? 'all' : 'current');
  const status: ModelDirectoryStatus | 'all' = statusValue === 'current' || statusValue === 'archived' || statusValue === 'all'
    ? statusValue
    : (() => { throw new ModelDirectoryRequestError('invalid model directory status'); })();
  const limitValue = url.searchParams.get('limit');
  const limit = limitValue === null ? 100 : Number(limitValue);
  if (!/^\d{1,3}$/.test(limitValue ?? '100') || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new ModelDirectoryRequestError('invalid model directory limit');
  const cursor = url.searchParams.get('cursor');
  if (cursor !== null && (cursor.length > 1_024 || !/^[A-Za-z0-9_-]+$/.test(cursor))) throw new ModelDirectoryRequestError('invalid model directory cursor');
  return { q, creator, sourceType, evidenceStatus, status, limit, cursor };
}

function structuredData(envelope: ModelDirectoryEnvelope, canonical: string, title: string, description: string): readonly unknown[] {
  const currentModels = envelope.data.models
    .filter((model) => model.weeklyRank !== null)
    .slice()
    .sort((left, right) => (left.weeklyRank ?? Number.MAX_SAFE_INTEGER) - (right.weeklyRank ?? Number.MAX_SAFE_INTEGER));
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Popular AI models',
    numberOfItems: currentModels.length,
    itemListOrder: 'https://schema.org/ItemListOrderAscending',
    itemListElement: currentModels.map((model) => ({
      '@type': 'ListItem',
      position: model.weeklyRank,
      name: model.displayName,
      url: `${SITE_CONFIG.origin}/models/${encodeURIComponent(model.canonicalSlug)}/`,
    })),
  };
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: title,
      description,
      url: canonical,
      isPartOf: { '@type': 'WebSite', name: SITE_CONFIG.name, url: SITE_CONFIG.origin },
      mainEntity: { '@id': `${canonical}#popular-models` },
    },
    { ...itemList, '@id': `${canonical}#popular-models` },
  ];
}

function browserQuery(query: ModelDirectoryQuery): ModelDirectoryQueryState {
  return { q: query.q, creator: query.creator, sourceType: query.sourceType, evidenceStatus: query.evidenceStatus, status: query.status };
}

function shellDocument(envelope: ModelDirectoryEnvelope, query: ModelDirectoryQuery): string {
  const metadata = metadataForRoute({ kind: 'models' });
  const root = renderToString(createElement(ModelsApp, { initialEnvelope: envelope, initialQuery: browserQuery(query) }));
  const scripts = structuredData(envelope, metadata.canonical, metadata.title, metadata.description)
    .map((value) => `<script type="application/ld+json">${serializeJsonForScript(value)}</script>`)
    .join('\n    ');
  return `<!doctype html>
<html lang="en" data-theme="${SITE_CONFIG.defaultTheme}">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtmlText(metadata.title)}</title>
    <meta name="description" content="${escapeHtmlAttribute(metadata.description)}">
    <meta name="robots" content="${metadata.robots}">
    <link rel="canonical" href="${escapeHtmlAttribute(metadata.canonical)}">
    <link rel="icon" href="/favicon.png" type="image/png">
    <meta property="og:type" content="${metadata.openGraph.type}">
    <meta property="og:site_name" content="${SITE_CONFIG.name}">
    <meta property="og:title" content="${escapeHtmlAttribute(metadata.openGraph.title)}">
    <meta property="og:description" content="${escapeHtmlAttribute(metadata.openGraph.description)}">
    <meta property="og:url" content="${escapeHtmlAttribute(metadata.openGraph.url)}">
    <meta property="og:image" content="${escapeHtmlAttribute(metadata.openGraph.image)}">
    <meta property="og:image:alt" content="${escapeHtmlAttribute(metadata.openGraph.imageAlt)}">
    <meta name="twitter:card" content="${metadata.twitter.card}">
    <meta name="twitter:title" content="${escapeHtmlAttribute(metadata.twitter.title)}">
    <meta name="twitter:description" content="${escapeHtmlAttribute(metadata.twitter.description)}">
    <meta name="twitter:image" content="${escapeHtmlAttribute(metadata.twitter.image)}">
    ${themeBootstrapMarkup()}
    <link rel="stylesheet" href="/assets/tokenbench.css">
    ${scripts}
  </head>
  <body>
    <div id="google_translate_element"></div>
    <div id="root">${root}</div>
    <script id="models-initial-data" type="application/json">${serializeJsonForScript(envelope)}</script>
    <script type="module" src="/assets/main.js"></script>
  </body>
</html>\n`;
}

function unavailableDocument(): string {
  const metadata = metadataForRoute({ kind: 'models' });
  return `<!doctype html>
<html lang="en" data-theme="${SITE_CONFIG.defaultTheme}">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtmlText(`Models temporarily unavailable | ${SITE_CONFIG.name}`)}</title>
    <meta name="description" content="${escapeHtmlAttribute(metadata.description)}">
    <meta name="robots" content="noindex,follow">
    <link rel="canonical" href="${escapeHtmlAttribute(metadata.canonical)}">
    ${themeBootstrapMarkup()}
    <link rel="stylesheet" href="/assets/tokenbench.css">
  </head>
  <body><main class="models-unavailable"><h1>Popular AI models</h1><p>The durable model directory is temporarily unavailable. Please try again shortly.</p></main></body>
</html>\n`;
}

function unavailableResponse(): Response {
  return new Response(unavailableDocument(), {
    status: 503,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, follow' },
  });
}

export async function onRequestGet({ request, env }: { request: Request; env: BenchmarkApiEnv }): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/models') return new Response(null, { status: 301, headers: { Location: MODELS_PATH } });
  if (url.pathname !== MODELS_PATH || !env.CATALOG_DB) return unavailableResponse();
  let query: ModelDirectoryQuery;
  try {
    query = parseQuery(request);
  } catch {
    return new Response('Invalid model directory request', { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  try {
    const envelope = await readModelDirectory(env.CATALOG_DB, query);
    return new Response(shellDocument(envelope, query), {
      headers: { 'Cache-Control': 'public, max-age=0, must-revalidate', 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'index, follow' },
    });
  } catch {
    return unavailableResponse();
  }
}
