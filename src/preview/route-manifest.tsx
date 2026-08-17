import type { ComponentType } from 'react';
import { CompareHubPage } from '../pages/compare-hub-page';
import { HomePage } from '../pages/home-page';
import { PopularModelsPage } from '../pages/popular-models-page';
import { PricePerformanceApp } from '../pages/price-performance-page';
import { GuideArticlePage, GuidesHub } from '../frontend/guides-page';
import { GUIDE_BY_SLUG, GUIDES } from '../guides/content';
import { metadataForRoute } from '../seo/metadata';
import type { PreviewPageProps, PreviewRoute, PreviewRouteId, PreviewRouteMatch, PreviewStaticEntry } from './route-types';

export type { PreviewPageProps, PreviewPayloadDefinition, PreviewRoute, PreviewRouteId, PreviewRouteMatch, PreviewStaticEntry } from './route-types';

const defaultSkipLink = {
  skipLinkTarget: 'page-content',
  skipLinkLabel: 'Skip to page content',
} as const;

function normalizePathname(pathname: string): string {
  if (pathname === '/') return '/';
  return pathname.replace(/\/+$/, '') || '/';
}

function routeMatch(routeId: PreviewRouteId, url: URL, params: Readonly<Record<string, string>> = {}): PreviewRouteMatch {
  return {
    routeId,
    pathname: url.pathname,
    search: new URLSearchParams(url.search),
    hash: url.hash,
    params,
  };
}

function exactPathMatcher(routeId: PreviewRouteId, pathname: string): (url: URL) => PreviewRouteMatch | null {
  const normalizedPathname = normalizePathname(pathname);
  return (url) => normalizePathname(url.pathname) === normalizedPathname
    ? routeMatch(routeId, url)
    : null;
}

function articleDetailMatch(url: URL): PreviewRouteMatch | null {
  const pathname = normalizePathname(url.pathname);
  const articleMatch = pathname.match(/^\/articles\/([^/]+)$/u);
  if (!articleMatch) return null;

  const slug = articleMatch[1];
  if (slug === 'hybrid-router' || GUIDE_BY_SLUG.has(slug)) {
    return routeMatch('article-detail', url, { slug });
  }
  return null;
}

function structuredData(match: PreviewRouteMatch): readonly unknown[] {
  const route = previewRoutes.find((candidate) => candidate.id === match.routeId);
  if (!route) throw new Error(`Unknown preview route: ${match.routeId}`);
  const metadata = route.metadata(match);
  return [{
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: metadata.h1,
    url: metadata.canonical,
  }];
}

function PrototypeArticlePage({ match }: PreviewPageProps) {
  const guide = match.params.slug ? GUIDE_BY_SLUG.get(match.params.slug) : undefined;
  return guide ? <GuideArticlePage guide={guide} /> : <GuidesHub />;
}

const prototypeFallbackPage = HomePage as ComponentType<PreviewPageProps>;
const pricePerformancePage = PricePerformanceApp as ComponentType<PreviewPageProps>;
const popularModelsPage = PopularModelsPage as ComponentType<PreviewPageProps>;
const compareHubPage = CompareHubPage as ComponentType<PreviewPageProps>;
const guidesHubPage = GuidesHub as ComponentType<PreviewPageProps>;

const manifestRoutes = [
  {
    id: 'home',
    match: exactPathMatcher('home', '/'),
    outputPathname: '/',
    delivery: 'prototype',
    shell: { activePage: 'home', ...defaultSkipLink },
    metadata: () => metadataForRoute({ kind: 'home' }),
    structuredData,
    staticData: async () => undefined,
    payload: null,
    Page: prototypeFallbackPage,
  },
  {
    id: 'models',
    match: exactPathMatcher('models', '/models'),
    outputPathname: '/models',
    delivery: 'prototype',
    shell: { activePage: 'models', ...defaultSkipLink },
    metadata: () => metadataForRoute({ kind: 'models' }),
    structuredData,
    staticData: async () => undefined,
    payload: null,
    Page: popularModelsPage,
  },
  {
    id: 'model-profile',
    match: exactPathMatcher('model-profile', '/model-profile'),
    outputPathname: '/model-profile',
    delivery: 'prototype',
    shell: { activePage: 'models', ...defaultSkipLink },
    metadata: (match) => metadataForRoute({ kind: 'modelProfile', slug: match.search.get('model') ?? 'model' }),
    structuredData,
    staticData: async () => undefined,
    payload: null,
    Page: prototypeFallbackPage,
  },
  {
    id: 'model-lifecycle',
    match: exactPathMatcher('model-lifecycle', '/model-lifecycle'),
    outputPathname: '/model-lifecycle',
    delivery: 'prototype',
    shell: { activePage: 'models', ...defaultSkipLink },
    metadata: () => metadataForRoute({ kind: 'models' }),
    structuredData,
    staticData: async () => undefined,
    payload: null,
    Page: prototypeFallbackPage,
  },
  {
    id: 'popular-models',
    match: exactPathMatcher('popular-models', '/popular-models/'),
    outputPathname: '/popular-models/',
    delivery: 'prototype',
    shell: { activePage: 'popularModels', ...defaultSkipLink },
    metadata: () => metadataForRoute({ kind: 'popularModels' }),
    structuredData,
    staticData: async () => undefined,
    payload: null,
    Page: popularModelsPage,
  },
  {
    id: 'make-it-yours',
    match: exactPathMatcher('make-it-yours', '/make-it-yours/'),
    outputPathname: '/make-it-yours/',
    delivery: 'prototype',
    shell: { activePage: 'leaderboards', ...defaultSkipLink },
    metadata: () => metadataForRoute({ kind: 'leaderboards' }),
    structuredData,
    staticData: async () => undefined,
    payload: null,
    Page: popularModelsPage,
  },
  {
    id: 'compare',
    match: exactPathMatcher('compare', '/compare'),
    outputPathname: '/compare',
    delivery: 'prototype',
    shell: { activePage: 'compare', ...defaultSkipLink },
    metadata: () => metadataForRoute({ kind: 'compareHub' }),
    structuredData,
    staticData: async () => undefined,
    payload: null,
    Page: compareHubPage,
  },
  {
    id: 'subscribe-vs-api',
    match: exactPathMatcher('subscribe-vs-api', '/subscribe-vs-api'),
    outputPathname: '/subscribe-vs-api',
    delivery: 'prototype',
    shell: { activePage: 'calculator', ...defaultSkipLink },
    metadata: () => metadataForRoute({ kind: 'calculator' }),
    structuredData,
    staticData: async () => undefined,
    payload: null,
    Page: pricePerformancePage,
  },
  {
    id: 'articles',
    match: exactPathMatcher('articles', '/articles'),
    outputPathname: '/articles',
    delivery: 'prototype',
    shell: { activePage: 'guides', skipLinkTarget: 'guide-content', skipLinkLabel: 'Skip to articles' },
    metadata: () => metadataForRoute({ kind: 'guides' }),
    structuredData,
    staticData: async () => undefined,
    payload: null,
    Page: guidesHubPage,
  },
  {
    id: 'article-detail',
    match: articleDetailMatch,
    outputPathname: '/articles/hybrid-router',
    delivery: 'prototype',
    shell: { activePage: 'guides', skipLinkTarget: 'guide-content', skipLinkLabel: 'Skip to article content' },
    metadata: (match) => {
      const slug = match.params.slug;
      return slug && GUIDE_BY_SLUG.has(slug)
        ? metadataForRoute({ kind: 'guides', slug })
        : metadataForRoute({ kind: 'guides' });
    },
    structuredData,
    staticData: async (match) => match.params.slug ? GUIDE_BY_SLUG.get(match.params.slug) : undefined,
    payload: null,
    Page: PrototypeArticlePage,
  },
  {
    id: 'llm-price-performance',
    match: exactPathMatcher('llm-price-performance', '/llm-price-performance/'),
    outputPathname: '/llm-price-performance/',
    delivery: 'prototype',
    shell: { activePage: 'pricePerformance', ...defaultSkipLink },
    metadata: () => metadataForRoute({ kind: 'pricePerformance' }),
    structuredData,
    staticData: async () => undefined,
    payload: null,
    Page: pricePerformancePage,
  },
] as const satisfies readonly PreviewRoute[];

export const previewRoutes: readonly PreviewRoute[] = manifestRoutes;

export function matchPreviewRoute(url: URL): PreviewRouteMatch | null {
  for (const route of previewRoutes) {
    const match = route.match(url);
    if (match) return match;
  }
  return null;
}

function routePath(routeId: PreviewRouteId): string {
  const route = previewRoutes.find((candidate) => candidate.id === routeId);
  if (!route) throw new Error(`Unknown preview route: ${routeId}`);
  return route.outputPathname;
}

export const previewPaths = {
  home: routePath('home'),
  models: routePath('models'),
  modelCatalog: `${routePath('models')}#catalog`,
  modelProfile: (slug: string) => `${routePath('model-profile')}?model=${encodeURIComponent(slug)}`,
  modelLifecycle: routePath('model-lifecycle'),
  popularModels: routePath('popular-models'),
  makeItYours: routePath('make-it-yours'),
  compare: routePath('compare'),
  subscribeVsApi: routePath('subscribe-vs-api'),
  calculator: routePath('subscribe-vs-api'),
  articles: routePath('articles'),
  articleDetail: routePath('article-detail'),
  llmPricePerformance: routePath('llm-price-performance'),
  pricePerformance: routePath('llm-price-performance'),
} as const;

export function previewStaticEntries(): readonly PreviewStaticEntry[] {
  return previewRoutes.flatMap((route) => {
    if (route.id === 'article-detail') {
      return GUIDES.map((guide) => ({
        routeId: route.id,
        outputPathname: `/articles/${guide.slug}/`,
        match: routeMatch(route.id, new URL(`/articles/${guide.slug}/`, 'https://tokenbench.test'), { slug: guide.slug }),
      }));
    }
    return [{
      routeId: route.id,
      outputPathname: route.outputPathname,
      match: routeMatch(route.id, new URL(route.outputPathname, 'https://tokenbench.test')),
    }];
  });
}
