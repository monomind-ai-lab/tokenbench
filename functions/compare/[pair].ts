import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { ComparisonDetailApp } from '../../src/App';
import {
  compareUtf8Binary,
  createComparisonPairSlugResolver,
  isComparisonPairRouteSafe,
  type BenchmarkComparisonPair,
  type BenchmarkMetric,
  type BenchmarkModel,
  type BenchmarkPriceCheck,
  type ComparisonPairSlugResolver,
} from '../../src/benchmarks/contracts';
import {
  compareComparisonMethodologies,
  compareComparisonMetricRows,
  compareComparisonPriceChecks,
  compareComparisonSources,
  compareRelatedComparisons,
  type ComparisonMethodology,
  type ComparisonMetricRow,
  type ComparisonPriceChecks,
  type ComparisonViewModel,
  type RelatedComparison,
} from '../../src/frontend/comparison-contracts';
import { SITE_CONFIG } from '../../src/brand/site-config';
import { escapeHtmlAttribute, escapeHtmlText, isHttpsUrl, serializeJsonForScript } from '../_shared/html';
import {
  freshnessFor,
  readActiveBenchmarkSnapshot,
  type ActiveBenchmarkSnapshot,
  type BenchmarkApiEnv,
} from '../_shared/benchmark-db';

const COMPARE_PREFIX = '/compare/';
const RELATED_PAIR_LIMIT = 6;

interface RequestedPair {
  readonly pairSlug: string;
  readonly hasTrailingSlash: boolean;
}

interface ResolvedPair {
  readonly modelA: BenchmarkModel;
  readonly modelB: BenchmarkModel;
  readonly canonicalPairSlug: string;
  readonly canonicalPath: string;
}

function encodedPairPath(pairSlug: string): string {
  return `${COMPARE_PREFIX}${encodeURIComponent(pairSlug)}`;
}

/** Decodes exactly one path segment instead of trusting an arbitrary route parameter. */
function requestedPair(request: Request, parameter: unknown): RequestedPair | null {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }
  if (!url.pathname.startsWith(COMPARE_PREFIX)) return null;
  const remainder = url.pathname.slice(COMPARE_PREFIX.length);
  const hasTrailingSlash = remainder.endsWith('/');
  const encodedSegment = hasTrailingSlash ? remainder.slice(0, -1) : remainder;
  if (encodedSegment.length === 0 || encodedSegment.includes('/')) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(encodedSegment);
  } catch {
    return null;
  }
  // Cloudflare Pages leaves the route parameter percent-encoded. Compare it
  // to the raw segment and decode only the URL segment once, never the param.
  if (!isComparisonPairRouteSafe(decoded)
    || (parameter !== undefined && (typeof parameter !== 'string' || parameter !== encodedSegment))) return null;
  return { pairSlug: decoded, hasTrailingSlash };
}

function resolvePair(resolvePairSlug: ComparisonPairSlugResolver, pairSlug: string): ResolvedPair | null {
  const resolved = resolvePairSlug(pairSlug);
  if (!resolved) return null;
  return {
    ...resolved,
    canonicalPath: encodedPairPath(resolved.canonicalPairSlug),
  };
}

function metricIdentity(metric: BenchmarkMetric): string {
  return [metric.metricKey, metric.category, metric.unit, metric.sourceId, metric.sourceArtifactId, metric.methodology].join('\u0000');
}

function metricRows(snapshot: ActiveBenchmarkSnapshot, resolved: ResolvedPair): readonly ComparisonMetricRow[] {
  const metricsFor = (modelKey: string) => new Map(snapshot.metrics
    .filter((metric) => metric.modelKey === modelKey)
    .map((metric) => [metricIdentity(metric), metric]));
  const a = metricsFor(resolved.modelA.modelKey);
  const b = metricsFor(resolved.modelB.modelKey);
  const identities = new Set([...a.keys(), ...b.keys()]);
  return [...identities]
    .map((identity) => {
      const modelA = a.get(identity) ?? null;
      const modelB = b.get(identity) ?? null;
      const source = modelA ?? modelB;
      if (!source) throw new Error('metric row must have source evidence');
      return {
        metricKey: source.metricKey,
        category: source.category,
        unit: source.unit,
        sourceId: source.sourceId,
        methodology: source.methodology,
        modelA,
        modelB,
      } satisfies ComparisonMetricRow;
    })
    .sort(compareComparisonMetricRows);
}

function priceChecks(snapshot: ActiveBenchmarkSnapshot, resolved: ResolvedPair): readonly [ComparisonPriceChecks, ComparisonPriceChecks] {
  const checksFor = (modelKey: string): ComparisonPriceChecks => ({
    modelKey,
    checks: snapshot.priceChecks
      .filter((check) => check.modelKey === modelKey)
      .slice()
      .sort(compareComparisonPriceChecks),
  });
  return [checksFor(resolved.modelA.modelKey), checksFor(resolved.modelB.modelKey)];
}

function exactCanonicalPair(resolvePairSlug: ComparisonPairSlugResolver, pair: BenchmarkComparisonPair): ResolvedPair | null {
  const resolved = resolvePairSlug(pair.pairSlug);
  if (!resolved
    || resolved.modelA.modelKey !== pair.modelAKey
    || resolved.modelB.modelKey !== pair.modelBKey
    || resolved.canonicalPairSlug !== pair.pairSlug) return null;
  return { ...resolved, canonicalPath: encodedPairPath(resolved.canonicalPairSlug) };
}

function relatedPairs(
  snapshot: ActiveBenchmarkSnapshot,
  current: ResolvedPair,
  resolvePairSlug: ComparisonPairSlugResolver,
): readonly RelatedComparison[] {
  const currentModelKeys = new Set([current.modelA.modelKey, current.modelB.modelKey]);
  return snapshot.comparisonPairs
    .filter((pair) => pair.indexable)
    .flatMap((pair) => {
      const resolved = exactCanonicalPair(resolvePairSlug, pair);
      const sharedModelCount = resolved
        ? [resolved.modelA, resolved.modelB].filter((model) => currentModelKeys.has(model.modelKey)).length
        : 0;
      if (!resolved
        || resolved.canonicalPairSlug === current.canonicalPairSlug
        || sharedModelCount !== 1) return [];
      return [{
        pairSlug: pair.pairSlug,
        modelA: resolved.modelA,
        modelB: resolved.modelB,
        featuredRank: pair.featuredRank,
        sharedMetricCount: pair.sharedMetricCount,
      } satisfies RelatedComparison];
    })
    .sort(compareRelatedComparisons)
    .slice(0, RELATED_PAIR_LIMIT);
}

function methodologies(rows: readonly ComparisonMetricRow[]): readonly ComparisonMethodology[] {
  const seen = new Set<string>();
  return rows
    .flatMap((row) => {
      const identity = `${row.sourceId}\u0000${row.methodology}`;
      if (seen.has(identity)) return [];
      seen.add(identity);
      return [{ sourceId: row.sourceId, methodology: row.methodology } satisfies ComparisonMethodology];
    })
    .sort(compareComparisonMethodologies);
}

function attribution(snapshot: ActiveBenchmarkSnapshot, resolved: ResolvedPair, rows: readonly ComparisonMetricRow[], prices: readonly ComparisonPriceChecks[]) {
  const references = new Set<string>([
    `${resolved.modelA.sourceId}\u0000${resolved.modelA.sourceArtifactId}`,
    `${resolved.modelB.sourceId}\u0000${resolved.modelB.sourceArtifactId}`,
    ...rows.flatMap((row) => [row.modelA, row.modelB].flatMap((metric) => metric ? [`${metric.sourceId}\u0000${metric.sourceArtifactId}`] : [])),
    ...prices.flatMap((group) => group.checks.map((check) => `${check.sourceId}\u0000${check.sourceArtifactId}`)),
  ]);
  return snapshot.sources
    .filter((source) => references.has(`${source.sourceId}\u0000${source.artifactId}`) && isHttpsUrl(source.sourceUrl))
    .slice()
    .sort(compareComparisonSources);
}

function persistedPair(snapshot: ActiveBenchmarkSnapshot, resolved: ResolvedPair): BenchmarkComparisonPair | null {
  return snapshot.comparisonPairs.find((pair) => pair.modelAKey === resolved.modelA.modelKey
    && pair.modelBKey === resolved.modelB.modelKey
    && pair.pairSlug === resolved.canonicalPairSlug) ?? null;
}

function buildViewModel(
  snapshot: ActiveBenchmarkSnapshot,
  resolved: ResolvedPair,
  resolvePairSlug: ComparisonPairSlugResolver,
): ComparisonViewModel {
  const rows = metricRows(snapshot, resolved);
  const prices = priceChecks(snapshot, resolved);
  const savedPair = persistedPair(snapshot, resolved);
  if (snapshot.revision.publishedAt === null) throw new Error('active published revision lacks publication time');
  return {
    revision: snapshot.revision.revision,
    publishedAt: snapshot.revision.publishedAt,
    freshness: freshnessFor(snapshot.revision, Date.now()),
    canonicalPath: resolved.canonicalPath,
    models: [resolved.modelA, resolved.modelB],
    metricRows: rows,
    priceChecks: prices,
    attribution: attribution(snapshot, resolved, rows, prices),
    indexable: savedPair?.indexable === true,
    methodology: methodologies(rows),
    relatedPairs: relatedPairs(snapshot, resolved, resolvePairSlug),
    subscriptionMatch: null,
  };
}

function pageDescription(modelA: BenchmarkModel, modelB: BenchmarkModel): string {
  return `Compare ${modelA.name} and ${modelB.name} with active-revision source metrics, route pricing, timestamps, and explicit unavailable fields.`;
}

function jsonLd(viewModel: ComparisonViewModel, title: string, description: string, canonicalUrl: string): unknown[] {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: title,
      description,
      url: canonicalUrl,
      isPartOf: { '@type': 'WebSite', name: SITE_CONFIG.name, url: SITE_CONFIG.origin },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Compare', item: `${SITE_CONFIG.origin}/compare/` },
        { '@type': 'ListItem', position: 2, name: `${viewModel.models[0].name} vs ${viewModel.models[1].name}`, item: canonicalUrl },
      ],
    },
  ];
}

function shellDocument(viewModel: ComparisonViewModel): string {
  const [modelA, modelB] = viewModel.models;
  const title = `${modelA.name} vs ${modelB.name}: Cost, Coding & Benchmarks | ${SITE_CONFIG.name}`;
  const description = pageDescription(modelA, modelB);
  const canonicalUrl = `${SITE_CONFIG.origin}${viewModel.canonicalPath}`;
  const robots = viewModel.indexable ? 'index,follow' : 'noindex,follow';
  const root = renderToString(createElement(ComparisonDetailApp, { viewModel }));
  const scripts = jsonLd(viewModel, title, description, canonicalUrl)
    .map((value) => `<script type="application/ld+json">${serializeJsonForScript(value)}</script>`)
    .join('\n    ');
  return `<!doctype html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtmlText(title)}</title>
    <meta name="description" content="${escapeHtmlAttribute(description)}">
    <meta name="robots" content="${robots}">
    <link rel="canonical" href="${escapeHtmlAttribute(canonicalUrl)}">
    <link rel="icon" href="/favicon.png" type="image/png">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="${SITE_CONFIG.name}">
    <meta property="og:title" content="${escapeHtmlAttribute(title)}">
    <meta property="og:description" content="${escapeHtmlAttribute(description)}">
    <meta property="og:url" content="${escapeHtmlAttribute(canonicalUrl)}">
    <meta property="og:image" content="${SITE_CONFIG.origin}/og-guides.png">
    <meta property="og:image:alt" content="${escapeHtmlAttribute(`${SITE_CONFIG.name} comparison: ${modelA.name} vs ${modelB.name}`)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtmlAttribute(title)}">
    <meta name="twitter:description" content="${escapeHtmlAttribute(description)}">
    <meta name="twitter:image" content="${SITE_CONFIG.origin}/og-guides.png">
    <script>try{document.documentElement.dataset.theme=localStorage.getItem('${SITE_CONFIG.themeStorageKey}')==='light'?'light':'dark'}catch(e){document.documentElement.dataset.theme='dark'}</script>
    <link rel="stylesheet" href="/assets/tokenbench.css">
    ${scripts}
  </head>
  <body>
    <div id="google_translate_element"></div>
    <div id="root">${root}</div>
    <script id="comparison-initial-data" type="application/json">${serializeJsonForScript(viewModel)}</script>
    <script type="module" src="/assets/main.js"></script>
  </body>
</html>\n`;
}

function notFoundDocument(): string {
  const title = `Comparison not found | ${SITE_CONFIG.name}`;
  return `<!doctype html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtmlText(title)}</title>
    <meta name="robots" content="noindex,follow">
    <link rel="stylesheet" href="/assets/tokenbench.css">
  </head>
  <body>
    <main class="comparison-not-found"><h1>Comparison not found</h1><p>This pair is unavailable in the active published benchmark revision.</p><p><a href="/compare/">Browse model comparisons</a></p></main>
    <script type="module" src="/assets/main.js"></script>
  </body>
</html>\n`;
}

function notFoundResponse(): Response {
  return new Response(notFoundDocument(), {
    status: 404,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': 'noindex, follow',
    },
  });
}

function unavailableDocument(): string {
  const title = `Comparison temporarily unavailable | ${SITE_CONFIG.name}`;
  return `<!doctype html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtmlText(title)}</title>
    <meta name="robots" content="noindex,follow">
    <link rel="stylesheet" href="/assets/tokenbench.css">
  </head>
  <body>
    <main class="comparison-not-found"><h1>Comparison temporarily unavailable</h1><p>This active benchmark comparison cannot be loaded right now. Please try again shortly.</p><p><a href="/compare/">Browse model comparisons</a></p></main>
    <script type="module" src="/assets/main.js"></script>
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

export async function onRequestGet({
  request,
  env,
  params,
}: {
  request: Request;
  env: BenchmarkApiEnv;
  params?: { pair?: string };
}): Promise<Response> {
  const requested = requestedPair(request, params?.pair);
  if (!requested) return notFoundResponse();
  if (!env.CATALOG_DB) return unavailableResponse();

  try {
    const snapshot = await readActiveBenchmarkSnapshot(env.CATALOG_DB);
    if (!snapshot) return unavailableResponse();
    const resolvePairSlug = createComparisonPairSlugResolver(snapshot.models);
    const resolved = resolvePair(resolvePairSlug, requested.pairSlug);
    if (!resolved) return notFoundResponse();
    if (requested.hasTrailingSlash || requested.pairSlug !== resolved.canonicalPairSlug) {
      return new Response(null, {
        status: 301,
        headers: { Location: resolved.canonicalPath },
      });
    }
    const viewModel = buildViewModel(snapshot, resolved, resolvePairSlug);
    return new Response(shellDocument(viewModel), {
      headers: {
        'Cache-Control': 'public, max-age=0, must-revalidate',
        'Content-Type': 'text/html; charset=utf-8',
        'X-Robots-Tag': viewModel.indexable ? 'index, follow' : 'noindex, follow',
      },
    });
  } catch {
    return unavailableResponse();
  }
}
