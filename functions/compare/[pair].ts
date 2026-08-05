import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { ComparisonDetailApp } from '../../src/App';
import {
  compareUtf8Binary,
  BenchmarkComparisonPair,
  BenchmarkMetric,
  BenchmarkModel,
  BenchmarkPriceCheck,
} from '../../src/benchmarks/contracts';
import {
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
const CONTROLS_OR_SLASH = /[\u0000-\u001f\u007f/]/;
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
  if (!isSafePairSlug(decoded) || (parameter !== undefined && parameter !== decoded)) return null;
  return { pairSlug: decoded, hasTrailingSlash };
}

function isSafePairSlug(value: string): boolean {
  return value.length > 0 && !CONTROLS_OR_SLASH.test(value);
}

/**
 * A slug can itself contain -vs-, so every literal split is considered. A
 * path resolves only when exactly one split names two distinct active models.
 */
function resolvePair(snapshot: ActiveBenchmarkSnapshot, pairSlug: string): ResolvedPair | null {
  if (!isSafePairSlug(pairSlug)) return null;
  const modelsBySlug = new Map<string, BenchmarkModel>();
  for (const model of snapshot.models) {
    if (modelsBySlug.has(model.slug)) return null;
    modelsBySlug.set(model.slug, model);
  }

  const candidates: Array<{ left: BenchmarkModel; right: BenchmarkModel }> = [];
  let splitAt = pairSlug.indexOf('-vs-');
  while (splitAt >= 0) {
    const leftSlug = pairSlug.slice(0, splitAt);
    const rightSlug = pairSlug.slice(splitAt + 4);
    const left = modelsBySlug.get(leftSlug);
    const right = modelsBySlug.get(rightSlug);
    if (left && right && left.modelKey !== right.modelKey) candidates.push({ left, right });
    splitAt = pairSlug.indexOf('-vs-', splitAt + 4);
  }
  if (candidates.length !== 1) return null;

  const candidate = candidates[0];
  const [modelA, modelB] = compareUtf8Binary(candidate.left.modelKey, candidate.right.modelKey) < 0
    ? [candidate.left, candidate.right]
    : [candidate.right, candidate.left];
  const canonicalPairSlug = `${modelA.slug}-vs-${modelB.slug}`;
  return {
    modelA,
    modelB,
    canonicalPairSlug,
    canonicalPath: encodedPairPath(canonicalPairSlug),
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
    .sort((left, right) => compareUtf8Binary(left.metricKey, right.metricKey)
      || compareUtf8Binary(left.sourceId, right.sourceId)
      || compareUtf8Binary(left.category, right.category));
}

function priceChecks(snapshot: ActiveBenchmarkSnapshot, resolved: ResolvedPair): readonly [ComparisonPriceChecks, ComparisonPriceChecks] {
  const checksFor = (modelKey: string): ComparisonPriceChecks => ({
    modelKey,
    checks: snapshot.priceChecks
      .filter((check) => check.modelKey === modelKey)
      .slice()
      .sort((left, right) => compareUtf8Binary(left.sourceId, right.sourceId)
        || compareUtf8Binary(left.providerId, right.providerId)
        || compareUtf8Binary(left.routeId, right.routeId)),
  });
  return [checksFor(resolved.modelA.modelKey), checksFor(resolved.modelB.modelKey)];
}

function exactCanonicalPair(snapshot: ActiveBenchmarkSnapshot, pair: BenchmarkComparisonPair): ResolvedPair | null {
  const modelA = snapshot.models.find((model) => model.modelKey === pair.modelAKey);
  const modelB = snapshot.models.find((model) => model.modelKey === pair.modelBKey);
  if (!modelA || !modelB || modelA.modelKey === modelB.modelKey) return null;
  if (compareUtf8Binary(modelA.modelKey, modelB.modelKey) >= 0) return null;
  const canonicalPairSlug = `${modelA.slug}-vs-${modelB.slug}`;
  if (pair.pairSlug !== canonicalPairSlug || !isSafePairSlug(pair.pairSlug)) return null;
  return { modelA, modelB, canonicalPairSlug, canonicalPath: encodedPairPath(canonicalPairSlug) };
}

function relatedPairs(snapshot: ActiveBenchmarkSnapshot, current: ResolvedPair): readonly RelatedComparison[] {
  const currentModelKeys = new Set([current.modelA.modelKey, current.modelB.modelKey]);
  return snapshot.comparisonPairs
    .filter((pair) => pair.indexable)
    .flatMap((pair) => {
      const resolved = exactCanonicalPair(snapshot, pair);
      if (!resolved
        || resolved.canonicalPairSlug === current.canonicalPairSlug
        || (!currentModelKeys.has(resolved.modelA.modelKey) && !currentModelKeys.has(resolved.modelB.modelKey))) return [];
      return [{
        pairSlug: pair.pairSlug,
        modelA: resolved.modelA,
        modelB: resolved.modelB,
        featuredRank: pair.featuredRank,
        sharedMetricCount: pair.sharedMetricCount,
      } satisfies RelatedComparison];
    })
    .sort((left, right) => {
      if (left.featuredRank === null && right.featuredRank !== null) return 1;
      if (left.featuredRank !== null && right.featuredRank === null) return -1;
      if (left.featuredRank !== null && right.featuredRank !== null && left.featuredRank !== right.featuredRank) {
        return left.featuredRank - right.featuredRank;
      }
      return compareUtf8Binary(left.pairSlug, right.pairSlug);
    })
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
    .sort((left, right) => compareUtf8Binary(left.sourceId, right.sourceId) || compareUtf8Binary(left.methodology, right.methodology));
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
    .sort((left, right) => compareUtf8Binary(left.sourceId, right.sourceId) || compareUtf8Binary(left.artifactId, right.artifactId));
}

function persistedPair(snapshot: ActiveBenchmarkSnapshot, resolved: ResolvedPair): BenchmarkComparisonPair | null {
  return snapshot.comparisonPairs.find((pair) => pair.modelAKey === resolved.modelA.modelKey
    && pair.modelBKey === resolved.modelB.modelKey
    && pair.pairSlug === resolved.canonicalPairSlug) ?? null;
}

function buildViewModel(snapshot: ActiveBenchmarkSnapshot, resolved: ResolvedPair): ComparisonViewModel {
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
    relatedPairs: relatedPairs(snapshot, resolved),
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
    if (!snapshot) return notFoundResponse();
    const resolved = resolvePair(snapshot, requested.pairSlug);
    if (!resolved) return notFoundResponse();
    if (requested.hasTrailingSlash || requested.pairSlug !== resolved.canonicalPairSlug) {
      return new Response(null, {
        status: 301,
        headers: { Location: resolved.canonicalPath },
      });
    }
    const viewModel = buildViewModel(snapshot, resolved);
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
