import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { V21LeaderboardApp } from '../../src/App';
import { buildLeaderboard, LEADERBOARD_DEFINITIONS, type LeaderboardEntry } from '../../src/benchmarks/leaderboards';
import { DEFAULT_CUSTOM_WEIGHTS, normalizeCustomWeights, type CustomWeights } from '../../src/benchmarks/custom-leaderboard';
import type { BenchmarkMetric } from '../../src/benchmarks/contracts';
import { buildTopEntries, v21Leaderboard, v21LeaderboardForLegacyKey, type V21LeaderboardDefinition } from '../../src/benchmarks/v21-leaderboards';
import { SITE_CONFIG } from '../../src/brand/site-config';
import { leaderboardFilterCapabilities } from '../../src/frontend/leaderboard-filter-state';
import type { BenchmarkApiEnvelope, LeaderboardPageResult } from '../../src/frontend/use-benchmarks';
import { FRONTEND_ASSETS } from '../../src/routing/frontend-assets';
import { LEADERBOARD_ROUTES, type LeaderboardKey } from '../../src/routing/routes';
import type { PageMetadata } from '../../src/seo/metadata';
import { headMarkup, staticChrome } from '../../src/seo/static-page';
import { benchmarkEnvelope, freshnessFor, readActiveBenchmarkSnapshot, type BenchmarkApiEnv } from '../_shared/benchmark-db';
import { escapeHtmlText, serializeJsonForScript } from '../_shared/html';

interface SlaSearchState {
  readonly maxTtft: number;
  readonly minThroughput: number;
}

interface SpecialLeaderboardState {
  readonly sla: SlaSearchState;
  readonly custom: CustomWeights;
}

const DEFAULT_SLA_SEARCH: SlaSearchState = { maxTtft: 0.8, minThroughput: 60 };
const SPECIAL_SSR_MODEL_LIMIT = 200;
const SPECIAL_METRIC_CATEGORIES = new Set(['agentic', 'coding', 'reasoning', 'math', 'multimodalGrounded', 'ttft', 'throughput']);

function boundedFiniteSearchValue(value: string | null, minimum: number, maximum: number): number | null {
  if (value === null || value.length === 0 || value.length > 16) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

/** Accepts only bounded GET values; invalid or partial vectors fall back to a safe default. */
function specialLeaderboardState(search: URLSearchParams): SpecialLeaderboardState {
  const maxTtft = boundedFiniteSearchValue(search.get('maxTtft'), 0.01, 60);
  const minThroughput = boundedFiniteSearchValue(search.get('minThroughput'), 0, 100_000);
  const suppliedWeights = Object.fromEntries(Object.entries(DEFAULT_CUSTOM_WEIGHTS).map(([domain, fallback]) => {
    const raw = search.get(domain);
    const parsed = boundedFiniteSearchValue(raw, 0, 100);
    return [domain, raw === null || parsed === null || !Number.isSafeInteger(parsed) ? fallback : parsed];
  }));
  const custom = normalizeCustomWeights(suppliedWeights);
  return {
    sla: maxTtft === null || minThroughput === null ? DEFAULT_SLA_SEARCH : { maxTtft, minThroughput },
    custom: custom.ok ? custom.weights : DEFAULT_CUSTOM_WEIGHTS,
  };
}

function specialMetric(metric: BenchmarkMetric): boolean {
  return SPECIAL_METRIC_CATEGORIES.has(metric.category) && Number.isFinite(metric.value);
}

/**
 * Special leaderboards use a bounded read-only source projection. Metrics stay
 * verbatim and no source value is manufactured for missing evidence.
 */
function specialEntries(snapshot: NonNullable<Awaited<ReturnType<typeof readActiveBenchmarkSnapshot>>>): readonly LeaderboardEntry[] {
  const metricsByModel = new Map<string, BenchmarkMetric[]>();
  for (const metric of snapshot.metrics) {
    if (!specialMetric(metric)) continue;
    const entries = metricsByModel.get(metric.modelKey);
    if (entries) entries.push(metric);
    else metricsByModel.set(metric.modelKey, [metric]);
  }
  return snapshot.models
    .filter((model) => (metricsByModel.get(model.modelKey)?.length ?? 0) > 0)
    .slice()
    .sort((left, right) => left.modelKey.localeCompare(right.modelKey))
    .slice(0, SPECIAL_SSR_MODEL_LIMIT)
    .map((model) => ({
      model,
      metric: null,
      metrics: (metricsByModel.get(model.modelKey) ?? []).slice().sort((left, right) => right.sourceUpdatedAt.localeCompare(left.sourceUpdatedAt)),
      primaryPrice: null,
      blendedCostPerMillion: null,
      contextWindowTokens: model.contextWindowTokens,
      sourceRank: null,
      onValueFrontier: false,
    }));
}

function categoryPath(category: V21LeaderboardDefinition): string {
  return `/leaderboards/${category.slug}/`;
}

function categoryMetadata(category: V21LeaderboardDefinition, robots: PageMetadata['robots'] = 'index,follow'): PageMetadata {
  const canonical = `${SITE_CONFIG.origin}${categoryPath(category)}`;
  const title = `${category.label} AI model leaderboard | ${SITE_CONFIG.name}`;
  const description = `${category.definition} Review the exact published source evidence, timestamp, and methodology on ${SITE_CONFIG.name}.`;
  return {
    title,
    description,
    canonical,
    h1: category.label,
    robots,
    openGraph: {
      type: 'website', title, description, url: canonical,
      image: `${SITE_CONFIG.origin}/og-guides.png`, imageAlt: `${SITE_CONFIG.name} — ${category.label}`,
    },
    twitter: { card: 'summary_large_image', title, description, image: `${SITE_CONFIG.origin}/og-guides.png` },
  };
}

function categoryEnvelope(
  category: V21LeaderboardDefinition,
  snapshot: Awaited<ReturnType<typeof readActiveBenchmarkSnapshot>> & {},
  state: SpecialLeaderboardState,
): BenchmarkApiEnvelope<LeaderboardPageResult> | undefined {
  if (snapshot === null) return undefined;
  if (category.legacyKey === null) {
    if (category.slug !== 'sla' && category.slug !== 'custom') return undefined;
    const entries = specialEntries(snapshot);
    const result: LeaderboardPageResult & { readonly v21State: SpecialLeaderboardState } = {
      key: 'llm-overall',
      profile: 'balanced',
      definition: LEADERBOARD_DEFINITIONS['llm-overall'],
      entries,
      pagination: { limit: SPECIAL_SSR_MODEL_LIMIT, total: entries.length, nextCursor: null },
      capabilities: leaderboardFilterCapabilities('llm-overall', entries),
      v21State: state,
    };
    return benchmarkEnvelope(snapshot, freshnessFor(snapshot.revision, Date.now()), snapshot.sources.map((source) => ({
      sourceId: source.sourceId,
      label: source.attributionText,
      url: source.sourceUrl,
      updatedAt: source.observedAt,
    })), result);
  }
  const result = buildLeaderboard(
    category.legacyKey,
    snapshot.models,
    snapshot.metrics,
    snapshot.priceChecks,
    'balanced',
  );
  const entries = buildTopEntries(result.entries, 20);
  return benchmarkEnvelope(snapshot, freshnessFor(snapshot.revision, Date.now()), snapshot.sources.map((source) => ({
    sourceId: source.sourceId,
    label: source.attributionText,
    url: source.sourceUrl,
    updatedAt: source.observedAt,
  })), {
    ...result,
    entries,
    pagination: { limit: 20, total: entries.length, nextCursor: null },
    capabilities: leaderboardFilterCapabilities(category.legacyKey, result.entries),
  });
}

/** Shared with SSR tests so the exact server document remains independently inspectable. */
export function renderLeaderboardDocument(
  category: V21LeaderboardDefinition,
  initialEnvelope: BenchmarkApiEnvelope<LeaderboardPageResult> | undefined,
): string {
  const metadata = categoryMetadata(category);
  const root = renderToString(createElement(V21LeaderboardApp, { category, initialEnvelope }));
  const payload = initialEnvelope ? `<script id="leaderboards-initial-data" type="application/json">${serializeJsonForScript(initialEnvelope)}</script>` : '';
  return `<!doctype html>
<html lang="en" data-theme="${SITE_CONFIG.defaultTheme}">
  <head>
    ${headMarkup(metadata, [])}
    <link rel="stylesheet" href="${FRONTEND_ASSETS.stylesheet}">
  </head>
  <body>
    <div id="google_translate_element"></div>
    <div id="root">${root}</div>
    ${payload}
    <script type="module" src="${FRONTEND_ASSETS.script}"></script>
  </body>
</html>\n`;
}

function unavailableDocument(category: V21LeaderboardDefinition | null): string {
  const fallback = category ?? {
    slug: 'overall', label: 'Leaderboard', definition: 'Published model leaderboard evidence.', version: 'TokenBench', legacyKey: null,
    unavailableMessage: 'No comparable published evidence is available.',
  } as const;
  const base = categoryMetadata(fallback, 'noindex,follow');
  const title = `Leaderboard data temporarily unavailable | ${SITE_CONFIG.name}`;
  const description = 'The active published leaderboard revision cannot be loaded right now. TokenBench will not replace it with partial, inferred, or borrowed scores.';
  const metadata: PageMetadata = {
    ...base,
    title,
    description,
    openGraph: { ...base.openGraph, title, description },
    twitter: { ...base.twitter, title, description },
  };
  const content = staticChrome(`<main id="page-content" class="content-stack leaderboard-page"><section class="panel leaderboard-hero"><span class="eyebrow">TokenBench evidence</span><h1>${escapeHtmlText('Leaderboard data is temporarily unavailable')}</h1><p>${escapeHtmlText(description)}</p><p><a class="button button-secondary" href="/leaderboards/">Browse leaderboard categories</a></p></section></main>`, 'leaderboards');
  return `<!doctype html>
<html lang="en" data-theme="${SITE_CONFIG.defaultTheme}">
  <head>
    ${headMarkup(metadata, [])}
    <link rel="stylesheet" href="${FRONTEND_ASSETS.stylesheet}">
  </head>
  <body>
    <div id="google_translate_element"></div>
    <div id="root">${content}</div>
  </body>
</html>\n`;
}

function unavailableResponse(category: V21LeaderboardDefinition | null): Response {
  return new Response(unavailableDocument(category), {
    status: 503,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': 'noindex, follow',
    },
  });
}

function pathParameter(params: { path?: string | readonly string[] } | undefined): string | null {
  const raw = params?.path;
  const path = typeof raw === 'string' ? raw : raw?.join('/');
  if (!path || !/^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/u.test(path)) return null;
  return path;
}

function legacyKeyForPath(path: string): LeaderboardKey | null {
  const pathname = `/leaderboards/${path.replace(/^\/+|\/+$/gu, '')}/`;
  return (Object.keys(LEADERBOARD_ROUTES) as LeaderboardKey[])
    .find((key) => LEADERBOARD_ROUTES[key].pathname === pathname) ?? null;
}

function supportRouteResponse(key: LeaderboardKey): Response {
  const route = LEADERBOARD_ROUTES[key];
  const title = `${route.seo.h1} evidence support route | ${SITE_CONFIG.name}`;
  const description = `This retained source-specific evidence route is not a V2.1 comparable category and is not indexed. ${route.seo.summary}`;
  const metadata: PageMetadata = {
    title,
    description,
    canonical: `${SITE_CONFIG.origin}${route.pathname}`,
    h1: `${route.seo.h1} evidence support route`,
    robots: 'noindex,follow',
    openGraph: {
      type: 'website', title, description, url: `${SITE_CONFIG.origin}${route.pathname}`,
      image: `${SITE_CONFIG.origin}/og-guides.png`, imageAlt: `${SITE_CONFIG.name} — ${route.seo.h1}`,
    },
    twitter: { card: 'summary_large_image', title, description, image: `${SITE_CONFIG.origin}/og-guides.png` },
  };
  const content = staticChrome(`<main id="page-content" class="content-stack leaderboard-page"><section class="panel leaderboard-hero"><span class="eyebrow">Source evidence support route</span><h1>${escapeHtmlText(metadata.h1)}</h1><p>${escapeHtmlText(description)}</p><p><a class="button button-secondary" href="/leaderboards/">Browse canonical leaderboard categories</a></p></section></main>`, 'leaderboards');
  return new Response(`<!doctype html>
<html lang="en" data-theme="${SITE_CONFIG.defaultTheme}">
  <head>
    ${headMarkup(metadata, [])}
    <link rel="stylesheet" href="${FRONTEND_ASSETS.stylesheet}">
  </head>
  <body>
    <div id="google_translate_element"></div>
    <div id="root">${content}</div>
  </body>
</html>\n`, {
    headers: {
      'Cache-Control': 'public, max-age=0, must-revalidate',
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
  params?: { path?: string | readonly string[] };
}): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  const url = new URL(request.url);
  const rawCategory = pathParameter(params) ?? pathname.replace(/^\/leaderboards\/?/u, '').replace(/\/$/u, '');
  const category = v21Leaderboard(rawCategory);
  if (!category) {
    const legacyKey = legacyKeyForPath(rawCategory);
    if (!legacyKey) return unavailableResponse(null);
    const equivalentCategory = v21LeaderboardForLegacyKey(legacyKey);
    if (equivalentCategory) return new Response(null, { status: 308, headers: { Location: categoryPath(equivalentCategory) } });
    return supportRouteResponse(legacyKey);
  }
  if (pathname !== categoryPath(category) || !env.CATALOG_DB) return unavailableResponse(category);

  try {
    const snapshot = await readActiveBenchmarkSnapshot(env.CATALOG_DB);
    if (!snapshot) return unavailableResponse(category);
    const initialEnvelope = categoryEnvelope(category, snapshot, specialLeaderboardState(url.searchParams));
    return new Response(renderLeaderboardDocument(category, initialEnvelope), {
      headers: {
        'Cache-Control': 'public, max-age=0, must-revalidate',
        'Content-Type': 'text/html; charset=utf-8',
        'X-Robots-Tag': 'index, follow',
      },
    });
  } catch {
    return unavailableResponse(category);
  }
}
