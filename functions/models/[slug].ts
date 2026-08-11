import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { ModelProfileApp } from '../../src/App';
import { SITE_CONFIG } from '../../src/brand/site-config';
import { FRONTEND_ASSETS } from '../../src/routing/frontend-assets';
import { themeBootstrapMarkup } from '../../src/brand/theme-bootstrap';
import { isModelSlugRouteSafe, modelPath } from '../../src/benchmarks/model-directory';
import type { ModelProfileViewModel } from '../../src/frontend/model-profile-contracts';
import { escapeHtmlAttribute, escapeHtmlText, serializeJsonForScript } from '../_shared/html';
import type { BenchmarkApiEnv } from '../_shared/benchmark-db';
import { readDurableModelProfile, type ModelProfileReadResult } from '../_shared/model-directory-db';

const PROFILE_FRESHNESS_WINDOW_MS = 36 * 60 * 60 * 1000;

function requestedSlug(request: Request, parameter: string | undefined): string | null {
  if (typeof parameter === 'string' && isModelSlugRouteSafe(parameter)) return parameter;
  const match = new URL(request.url).pathname.match(/^\/models\/([^/]+)\/?$/);
  if (!match) return null;
  try {
    const slug = decodeURIComponent(match[1]);
    return isModelSlugRouteSafe(slug) ? slug : null;
  } catch {
    return null;
  }
}

function viewModelFor(result: ModelProfileReadResult, now: number): ModelProfileViewModel {
  const checkedAt = result.profile.revision.checkedAt;
  const stale = result.fallback === 'prior-profile'
    || result.directory.status === 'archived'
    || now - Date.parse(checkedAt) > PROFILE_FRESHNESS_WINDOW_MS;
  return {
    revision: result.selectedRevision,
    publishedAt: result.profile.revision.publishedAt ?? result.profile.revision.generatedAt,
    freshness: stale ? {
      status: 'stale',
      checkedAt,
      message: result.fallback === 'prior-profile'
        ? 'Showing the prior valid durable profile because the latest snapshot did not validate.'
        : result.directory.status === 'archived'
          ? 'Showing the latest valid retained profile for an archived model.'
          : 'Published model evidence has not refreshed within 36 hours.',
    } : { status: 'fresh', checkedAt },
    attribution: result.profile.sources.map((source) => ({
      sourceId: source.sourceId,
      label: source.attributionText,
      url: source.sourceUrl,
      updatedAt: source.observedAt,
    })),
    directory: result.directory,
    profile: result.profile,
    selectedRevision: result.selectedRevision,
    fallback: result.fallback,
    aliasFrom: result.aliasFrom,
  };
}

function scoreLabel(value: number | null): string {
  return value === null ? '' : ` (${value.toFixed(2)})`;
}

function metadata(viewModel: ModelProfileViewModel) {
  const historical = viewModel.directory.status === 'archived' || viewModel.fallback === 'prior-profile';
  const name = viewModel.profile.identity.displayName;
  const title = historical
    ? `${name} Historical Benchmark Profile | ${SITE_CONFIG.name}`
    : `${name}${scoreLabel(viewModel.profile.summary.overallScore)} Benchmarks, Pricing & Evidence | ${SITE_CONFIG.name}`;
  const description = historical
    ? `Review the latest valid retained ${name} benchmark profile, category evidence, route pricing, specifications, sources, and historical revision context on ${SITE_CONFIG.name}.`
    : `Review ${name} benchmark scores, source rank, percentile capability evidence, route pricing, specifications, and the source-linked benchmark ledger on ${SITE_CONFIG.name}.`;
  const canonical = `${SITE_CONFIG.origin}${modelPath(viewModel.directory.canonicalSlug)}`;
  return { title, description, canonical, historical };
}

function structuredData(viewModel: ModelProfileViewModel, title: string, description: string, canonical: string) {
  const profile = viewModel.profile;
  const datasetId = `${canonical}#benchmark-dataset`;
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: title,
      description,
      url: canonical,
      datePublished: profile.revision.publishedAt ?? profile.revision.generatedAt,
      dateModified: profile.revision.checkedAt,
      isPartOf: { '@type': 'WebSite', name: SITE_CONFIG.name, url: SITE_CONFIG.origin },
      mainEntity: { '@id': datasetId },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      '@id': datasetId,
      name: `${profile.identity.displayName} benchmark evidence`,
      description: profile.summary.strongestEvidence,
      creator: { '@type': 'Organization', name: profile.identity.creator },
      datePublished: profile.revision.publishedAt ?? profile.revision.generatedAt,
      dateModified: profile.revision.checkedAt,
      measurementTechnique: 'Source-published benchmark scores and ranking percentiles',
      variableMeasured: profile.categories.map((category) => ({
        '@type': 'PropertyValue',
        name: category.label,
        value: category.score,
        unitText: category.unit,
      })),
      citation: profile.sources.map((source) => source.sourceUrl),
      url: canonical,
    },
  ];
}

function headMarkup(title: string, description: string, canonical: string, robots: 'index,follow' | 'noindex,follow', imageAlt: string, extra = ''): string {
  const image = `${SITE_CONFIG.origin}/og-guides.png`;
  return `<meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtmlText(title)}</title>
    <meta name="description" content="${escapeHtmlAttribute(description)}">
    <meta name="robots" content="${robots},max-image-preview:large">
    <link rel="canonical" href="${escapeHtmlAttribute(canonical)}">
    <link rel="icon" href="/favicon.png" type="image/png">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="${SITE_CONFIG.name}">
    <meta property="og:title" content="${escapeHtmlAttribute(title)}">
    <meta property="og:description" content="${escapeHtmlAttribute(description)}">
    <meta property="og:url" content="${escapeHtmlAttribute(canonical)}">
    <meta property="og:image" content="${image}">
    <meta property="og:image:alt" content="${escapeHtmlAttribute(imageAlt)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtmlAttribute(title)}">
    <meta name="twitter:description" content="${escapeHtmlAttribute(description)}">
    <meta name="twitter:image" content="${image}">
    ${themeBootstrapMarkup()}
    <link rel="stylesheet" href="${FRONTEND_ASSETS.stylesheet}">
    ${extra}`;
}

/** Shared with the local preview harness so browser tests exercise production SSR markup. */
export function renderModelProfileDocument(viewModel: ModelProfileViewModel): string {
  const page = metadata(viewModel);
  const root = renderToString(createElement(ModelProfileApp, { viewModel }));
  const scripts = structuredData(viewModel, page.title, page.description, page.canonical)
    .map((value) => `<script type="application/ld+json">${serializeJsonForScript(value)}</script>`)
    .join('\n    ');
  const dates = `<meta property="article:published_time" content="${escapeHtmlAttribute(viewModel.publishedAt)}">
    <meta property="article:modified_time" content="${escapeHtmlAttribute(viewModel.profile.revision.checkedAt)}">`;
  return `<!doctype html>
<html lang="en" data-theme="${SITE_CONFIG.defaultTheme}">
  <head>${headMarkup(page.title, page.description, page.canonical, 'index,follow', `${viewModel.profile.identity.displayName} benchmark evidence profile`, `${dates}\n    ${scripts}`)}</head>
  <body>
    <div id="google_translate_element"></div>
    <div id="root">${root}</div>
    <script id="model-profile-initial-data" type="application/json">${serializeJsonForScript(viewModel)}</script>
    <script type="module" src="${FRONTEND_ASSETS.script}"></script>
  </body>
</html>\n`;
}

export function renderModelProfileStatusDocument(status: 404 | 503, slug: string | null): string {
  const unavailable = status === 503;
  const title = `${unavailable ? 'Model profile temporarily unavailable' : 'Model profile not found'} | ${SITE_CONFIG.name}`;
  const description = unavailable
    ? `The requested ${SITE_CONFIG.name} model evidence profile cannot be loaded right now. The service will retry without replacing valid retained benchmark data.`
    : `The requested ${SITE_CONFIG.name} model profile is not available. Browse the durable model directory for current and retained benchmark evidence.`;
  const canonical = unavailable && slug ? `${SITE_CONFIG.origin}${modelPath(slug)}` : `${SITE_CONFIG.origin}/models/`;
  const heading = unavailable ? 'Model profile temporarily unavailable' : 'Model profile not found';
  return `<!doctype html><html lang="en" data-theme="${SITE_CONFIG.defaultTheme}"><head>${headMarkup(title, description, canonical, 'noindex,follow', heading)}</head><body><main class="model-profile-status"><h1>${heading}</h1><p>${escapeHtmlText(description)}</p><p><a href="/models/">Browse popular models</a></p></main><script type="module" src="${FRONTEND_ASSETS.script}"></script></body></html>\n`;
}

function statusResponse(status: 404 | 503, slug: string | null): Response {
  return new Response(renderModelProfileStatusDocument(status, slug), {
    status,
    headers: {
      'Cache-Control': status === 503 ? 'no-store' : 'public, max-age=300',
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': 'noindex, follow',
    },
  });
}

export async function onRequestGet({ request, env, params }: {
  request: Request;
  env: BenchmarkApiEnv;
  params?: { slug?: string };
}): Promise<Response> {
  const slug = requestedSlug(request, params?.slug);
  if (!slug) return statusResponse(404, null);
  if (!env.CATALOG_DB) return statusResponse(503, slug);
  try {
    const result = await readDurableModelProfile(env.CATALOG_DB, slug);
    if (!result) return statusResponse(404, slug);
    if (result.aliasFrom !== null || slug !== result.directory.canonicalSlug || !new URL(request.url).pathname.endsWith('/')) {
      return new Response(null, { status: 308, headers: { Location: modelPath(result.directory.canonicalSlug) } });
    }
    const viewModel = viewModelFor(result, Date.now());
    return new Response(renderModelProfileDocument(viewModel), {
      headers: {
        'Cache-Control': 'public, max-age=0, must-revalidate',
        'Content-Type': 'text/html; charset=utf-8',
        'X-Robots-Tag': 'index, follow',
      },
    });
  } catch {
    return statusResponse(503, slug);
  }
}
