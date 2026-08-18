import comparisonEvidence from '../../contracts/ui-data-contract/v1/evidence/responses/comparison.json' with { type: 'json' };
import modelsEvidence from '../../contracts/ui-data-contract/v1/evidence/responses/models.json' with { type: 'json' };
import profileEvidence from '../../contracts/ui-data-contract/v1/evidence/responses/profile.json' with { type: 'json' };
import rankingsEvidence from '../../contracts/ui-data-contract/v1/evidence/responses/rankings.mixed-source.json' with { type: 'json' };
import subscriptionEvidence from '../../contracts/ui-data-contract/v1/evidence/responses/subscription.json' with { type: 'json' };
import { createElement, type ComponentType } from 'react';
import { ARTICLE_BY_SLUG, ARTICLES, type ArticleChannel } from '../../src/articles/content';
import { mapRetainedComparisonEvidence, mapRetainedModelsEvidence, mapRetainedProfileEvidence, mapRetainedRankingsEvidence, mapRetainedSubscriptionEvidence } from '../../src/frontend/preview-data/api-adapter';
import { ACCEPTED_CUSTOM_RANKING_QUERY, ACCEPTED_SUBSCRIPTION_QUERY } from '../../src/frontend/preview-data/contracts';
import type { AcceptedUiDataContractV1 } from '../../src/frontend/preview-data/contract-v1';
import { compareStateFromQuery } from '../../src/frontend/preview-workbench/compare-state';
import { modelDirectoryQueryForWorkbenchState, decodeModelWorkbenchState } from '../../src/frontend/preview-workbench/model-state';
import { articleChannelFromSearch, ArticlesPage } from '../../src/pages/articles-page';
import { MakeItYoursPage, parseMakeItYoursPageData } from '../../src/pages/make-it-yours-page';
import { PreviewComparePage, parsePreviewComparePageData } from '../../src/pages/preview-compare-page';
import { PreviewModelProfilePage, parsePreviewModelProfilePageData } from '../../src/pages/preview-model-profile-page';
import { PreviewModelsPage, parsePreviewModelsPageData } from '../../src/pages/preview-models-page';
import { SubscribeVsApiPage, parseSubscribeVsApiPageData } from '../../src/pages/subscribe-vs-api-page';
import { renderPreviewDocument } from '../../src/preview/route-document';
import type { PreviewPageProps, PreviewRoute, PreviewRouteMatch } from '../../src/preview/route-types';
import { SITE_CONFIG } from '../../src/brand/site-config';
import { metadataForRoute, type PageMetadata } from '../../src/seo/metadata';
import { FRONTEND_ASSETS } from '../../src/routing/frontend-assets';

type PreviewQueryRouteId = 'models' | 'model-profile' | 'make-it-yours' | 'compare' | 'subscribe-vs-api' | 'articles';

const defaultSkipLink = {
  skipLinkTarget: 'page-content',
  skipLinkLabel: 'Skip to page content',
} as const;

const acceptedStaticCompareState = { modelIds: ['alpha', 'beta', 'gamma'] } as const;
const retainedProfileEvidence = profileEvidence as AcceptedUiDataContractV1<'profile'>;
const retainedComparisonEvidence = comparisonEvidence as AcceptedUiDataContractV1<'comparison'>;
const retainedModelsEvidence = modelsEvidence as AcceptedUiDataContractV1<'models'>;
const retainedRankingsEvidence = rankingsEvidence as AcceptedUiDataContractV1<'rankings'>;
const retainedSubscriptionEvidence = subscriptionEvidence as AcceptedUiDataContractV1<'subscription'>;

const previewMakeItYoursMetadata: PageMetadata = {
  title: `Make it yours — ${SITE_CONFIG.name}`,
  description: 'Build and export a weighted model leaderboard with capability, provider, access, and service-level filters.',
  h1: 'Make it yours',
  canonical: `${SITE_CONFIG.origin}/make-it-yours/`,
  robots: 'index,follow',
  openGraph: { type: 'website', title: `Make it yours — ${SITE_CONFIG.name}`, description: 'Build and export a weighted model leaderboard with capability, provider, access, and service-level filters.', url: `${SITE_CONFIG.origin}/make-it-yours/`, image: `${SITE_CONFIG.origin}/og-guides.png`, imageAlt: `${SITE_CONFIG.name} — Make it yours` },
  twitter: { card: 'summary_large_image', title: `Make it yours — ${SITE_CONFIG.name}`, description: 'Build and export a weighted model leaderboard with capability, provider, access, and service-level filters.', image: `${SITE_CONFIG.origin}/og-guides.png` },
};

const previewArticlesMetadata: PageMetadata = {
  title: `Articles & guides — ${SITE_CONFIG.name}`,
  description: `${SITE_CONFIG.name} guides and prototype LLM insights for source-aware AI decisions.`,
  h1: 'Articles for the AI bill you can explain.',
  canonical: `${SITE_CONFIG.origin}/articles/`,
  robots: 'index,follow',
  openGraph: { type: 'website', title: `Articles & guides — ${SITE_CONFIG.name}`, description: `${SITE_CONFIG.name} guides and prototype LLM insights for source-aware AI decisions.`, url: `${SITE_CONFIG.origin}/articles/`, image: `${SITE_CONFIG.origin}/og-guides.png`, imageAlt: `${SITE_CONFIG.name} — Articles for the AI bill you can explain.` },
  twitter: { card: 'summary_large_image', title: `Articles & guides — ${SITE_CONFIG.name}`, description: `${SITE_CONFIG.name} guides and prototype LLM insights for source-aware AI decisions.`, image: `${SITE_CONFIG.origin}/og-guides.png` },
};

function normalizePathname(pathname: string): string {
  return pathname === '/' ? '/' : pathname.replace(/\/+$/u, '') || '/';
}

function exactPathMatcher(routeId: PreviewQueryRouteId, pathname: string): (url: URL) => PreviewRouteMatch | null {
  const normalizedPathname = normalizePathname(pathname);
  return (url) => normalizePathname(url.pathname) === normalizedPathname
    ? {
      routeId,
      pathname: url.pathname,
      search: new URLSearchParams(url.search),
      hash: url.hash,
      params: {},
    }
    : null;
}

function profileMetadata(match: PreviewRouteMatch): PageMetadata {
  const slug = match.search.get('model') ?? 'model';
  const metadata = metadataForRoute({ kind: 'modelProfile', slug });
  const canonical = `${SITE_CONFIG.origin}/model-profile?model=${encodeURIComponent(slug)}`;
  return {
    ...metadata,
    canonical,
    openGraph: { ...metadata.openGraph, url: canonical },
  };
}

function routeStructuredData(metadata: PageMetadata): readonly unknown[] {
  return [{
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: metadata.h1,
    description: metadata.description,
    url: metadata.canonical,
  }];
}

function ArticlesRoutePage({ data }: PreviewPageProps) {
  const channel = typeof data === 'object' && data !== null && 'channel' in data
    ? (data as { readonly channel?: unknown }).channel
    : 'all';
  return createElement(ArticlesPage, {
    articles: ARTICLES,
    initialChannel: (channel === 'guides' || channel === 'insights' || channel === 'news' || channel === 'all' ? channel : 'all') as ArticleChannel | 'all',
  });
}

const queryRoutes = {
  models: {
    id: 'models',
    match: exactPathMatcher('models', '/models'),
    outputPathname: '/models',
    delivery: 'react',
    documentReadiness: { status: 'ready' },
    shell: { activePage: 'models', ...defaultSkipLink },
    metadata: () => metadataForRoute({ kind: 'models' }),
    structuredData: () => routeStructuredData(metadataForRoute({ kind: 'models' })),
    staticData: async (match) => mapRetainedModelsEvidence(retainedModelsEvidence, modelDirectoryQueryForWorkbenchState(decodeModelWorkbenchState(match.search))),
    payload: { key: 'models-initial-data', parse: parsePreviewModelsPageData },
    Page: ((props) => createElement(PreviewModelsPage, props)) as ComponentType<PreviewPageProps>,
  },
  'model-profile': {
    id: 'model-profile',
    match: exactPathMatcher('model-profile', '/model-profile'),
    outputPathname: '/model-profile',
    delivery: 'react',
    documentReadiness: { status: 'ready' },
    shell: { activePage: 'models', ...defaultSkipLink },
    metadata: profileMetadata,
    structuredData: (match) => routeStructuredData(profileMetadata(match)),
    staticData: async (match) => mapRetainedProfileEvidence(retainedProfileEvidence, match.search.get('model') ?? 'alpha'),
    payload: { key: 'preview-model-profile-initial-data', parse: parsePreviewModelProfilePageData },
    Page: ((props) => createElement(PreviewModelProfilePage, props)) as ComponentType<PreviewPageProps>,
  },
  compare: {
    id: 'compare',
    match: exactPathMatcher('compare', '/compare'),
    outputPathname: '/compare',
    delivery: 'react',
    documentReadiness: { status: 'ready' },
    shell: { activePage: 'compare', ...defaultSkipLink },
    metadata: () => metadataForRoute({ kind: 'compareHub' }),
    structuredData: () => routeStructuredData(metadataForRoute({ kind: 'compareHub' })),
    staticData: async (match) => mapRetainedComparisonEvidence(
      retainedComparisonEvidence,
      compareStateFromQuery(match.search, acceptedStaticCompareState),
    ),
    payload: { key: 'compare-initial-data', parse: parsePreviewComparePageData },
    Page: ((props) => createElement(PreviewComparePage, props)) as ComponentType<PreviewPageProps>,
  },
  'make-it-yours': {
    id: 'make-it-yours',
    match: exactPathMatcher('make-it-yours', '/make-it-yours/'),
    outputPathname: '/make-it-yours/',
    delivery: 'react',
    documentReadiness: { status: 'ready' },
    shell: { activePage: 'leaderboards', ...defaultSkipLink },
    metadata: () => previewMakeItYoursMetadata,
    structuredData: () => routeStructuredData(previewMakeItYoursMetadata),
    staticData: async (match) => mapRetainedRankingsEvidence(retainedRankingsEvidence, match.search.toString().length === 0 ? ACCEPTED_CUSTOM_RANKING_QUERY : { operation: 'custom' }),
    payload: { key: 'make-it-yours-initial-data', parse: parseMakeItYoursPageData },
    Page: ((props) => createElement(MakeItYoursPage, props)) as ComponentType<PreviewPageProps>,
  },
  'subscribe-vs-api': {
    id: 'subscribe-vs-api',
    match: exactPathMatcher('subscribe-vs-api', '/subscribe-vs-api'),
    outputPathname: '/subscribe-vs-api',
    delivery: 'react',
    documentReadiness: { status: 'ready' },
    shell: { activePage: 'calculator', ...defaultSkipLink },
    metadata: () => metadataForRoute({ kind: 'calculator' }),
    structuredData: () => routeStructuredData(metadataForRoute({ kind: 'calculator' })),
    staticData: async (match) => mapRetainedSubscriptionEvidence(retainedSubscriptionEvidence, match.search.toString().length === 0 ? ACCEPTED_SUBSCRIPTION_QUERY : { operation: 'catalog' }),
    payload: { key: 'subscribe-vs-api-initial-data', parse: parseSubscribeVsApiPageData },
    Page: ((props) => createElement(SubscribeVsApiPage, props)) as ComponentType<PreviewPageProps>,
  },
  articles: {
    id: 'articles',
    match: exactPathMatcher('articles', '/articles'),
    outputPathname: '/articles',
    delivery: 'react',
    documentReadiness: { status: 'ready' },
    shell: { activePage: 'guides', skipLinkTarget: 'article-content', skipLinkLabel: 'Skip to articles' },
    metadata: () => previewArticlesMetadata,
    structuredData: () => routeStructuredData(previewArticlesMetadata),
    staticData: async (match) => ({ channel: articleChannelFromSearch(match.search.get('channel')) }),
    payload: { key: 'articles-initial-data', parse: (value) => typeof value === 'object' && value !== null && 'channel' in value ? value : null },
    Page: ArticlesRoutePage as ComponentType<PreviewPageProps>,
  },
} as const satisfies Record<PreviewQueryRouteId, PreviewRoute>;

/**
 * Renders only the query-aware Pages routes from their prevalidated retained
 * evidence. This avoids importing Ajv's dynamic compiler into Workers while
 * preserving the adapter's request-correlation gate.
 */
export async function renderPreviewQueryDocument(request: Request, routeId: PreviewQueryRouteId): Promise<Response> {
  const route = queryRoutes[routeId];
  const match = route.match(new URL(request.url));
  if (!match) return new Response('Not found', { status: 404 });

  const data = await route.staticData(match);
  return new Response(renderPreviewDocument(route, match, data, { assets: FRONTEND_ASSETS }), {
    headers: {
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
