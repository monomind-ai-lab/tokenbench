import type { ComponentType } from 'react';
import { ComparisonDetailApp, ModelProfileApp } from '../App.tsx';
import { SITE_CONFIG } from '../brand/site-config';
import { parsePricePerformanceEnvelope } from '../benchmarks/price-performance-contracts';
import { CompareHubPage } from '../pages/compare-hub-page';
import { HomePage } from '../pages/home-page';
import { PopularModelsPage } from '../pages/popular-models-page';
import { PricePerformanceApp } from '../pages/price-performance-page';
import { parseComparisonViewModel, type ComparisonViewModel } from '../frontend/comparison-contracts';
import { GuideArticlePage, GuidesHub } from '../frontend/guides-page';
import { parseModelProfileViewModel, type ModelProfileViewModel } from '../frontend/model-profile-contracts';
import { GUIDE_BY_SLUG, GUIDES } from '../guides/content';
import { metadataForRoute } from '../seo/metadata';
import type { PageMetadata } from '../seo/metadata';
import type { PreviewDocumentReadiness, PreviewPageProps, PreviewRoute, PreviewRouteId, PreviewRouteMatch, PreviewRuntimeRoute, PreviewRuntimeRouteId, PreviewRuntimeRouteMatch, PreviewStaticEntry } from './route-types';

export type { PreviewClientRouteId, PreviewDocumentReadiness, PreviewPageProps, PreviewPayloadDefinition, PreviewPrototypeMountPolicy, PreviewRoute, PreviewRouteId, PreviewRouteMatch, PreviewRuntimeRoute, PreviewRuntimeRouteId, PreviewRuntimeRouteMatch, PreviewStaticEntry } from './route-types';

const defaultSkipLink = {
  skipLinkTarget: 'page-content',
  skipLinkLabel: 'Skip to page content',
} as const;

const pendingReactDocument: PreviewDocumentReadiness = {
  status: 'blocked',
  reason: 'The substantive React page and static data have not been migrated.',
};

interface PrototypeBundleDefinition {
  readonly outputPathname: string;
  readonly output: readonly string[];
  readonly document: string;
  readonly clearOutputDirectory: boolean;
}

interface PreviewManifestRoute extends PreviewRoute {
  readonly prototypeBundle: readonly PrototypeBundleDefinition[];
}

interface PreviewMetadataDefinition {
  readonly title: string;
  readonly description: string;
  readonly h1: string;
  readonly type?: 'website' | 'article';
}

const socialImage = `${SITE_CONFIG.origin}/og-guides.png`;

function previewMetadata(pathname: string, definition: PreviewMetadataDefinition): PageMetadata {
  const normalizedPathname = pathname === '/'
    ? ''
    : `${pathname.replace(/\/+$/, '')}/`;
  const canonical = `${SITE_CONFIG.origin}${normalizedPathname}`;
  return {
    ...definition,
    canonical,
    robots: 'index,follow',
    openGraph: {
      type: definition.type ?? 'website',
      title: definition.title,
      description: definition.description,
      url: canonical,
      image: socialImage,
      imageAlt: `${SITE_CONFIG.name} — ${definition.h1}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: definition.title,
      description: definition.description,
      image: socialImage,
    },
  };
}

const previewArticleMetadata = {
  articles: previewMetadata('/articles/', {
    title: `Articles & guides — ${SITE_CONFIG.name}`,
    description: `${SITE_CONFIG.name} guides and prototype LLM insights for source-aware AI decisions.`,
    h1: 'Articles for the AI bill you can explain.',
  }),
  hybridRouter: previewMetadata('/articles/hybrid-router/', {
    title: `Hybrid router guide — ${SITE_CONFIG.name}`,
    description: 'A decision framework for using a hybrid model router while keeping cost, evidence, escalation, and rollback explicit.',
    h1: 'A hybrid router for high-stakes agentic work',
    type: 'article',
  }),
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

function runtimeRouteMatch(routeId: PreviewRuntimeRouteId, url: URL, params: Readonly<Record<string, string>> = {}): PreviewRuntimeRouteMatch {
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

function comparisonDetailMatch(url: URL): PreviewRuntimeRouteMatch | null {
  const pathname = normalizePathname(url.pathname);
  const detail = pathname.match(/^\/compare\/([^/]+)$/u);
  return detail ? runtimeRouteMatch('comparison-detail', url, { pair: detail[1] }) : null;
}

function modelProfileDetailMatch(url: URL): PreviewRuntimeRouteMatch | null {
  const pathname = normalizePathname(url.pathname);
  const detail = pathname.match(/^\/models\/([^/]+)$/u);
  if (!detail) return null;
  try {
    return runtimeRouteMatch('model-profile-detail', url, { slug: decodeURIComponent(detail[1]) });
  } catch {
    return null;
  }
}

function structuredData(match: PreviewRouteMatch): readonly unknown[] {
  const route = previewRoutes.find((candidate) => candidate.id === match.routeId);
  if (!route) throw new Error(`Unknown preview route: ${match.routeId}`);
  const metadata = route.metadata(match);
  if (route.id === 'article-detail') {
    return [{
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: metadata.h1,
      description: metadata.description,
      url: metadata.canonical,
      mainEntityOfPage: metadata.canonical,
    }];
  }
  return [{
    '@context': 'https://schema.org',
    '@type': route.id === 'articles' ? 'CollectionPage' : 'WebPage',
    name: metadata.h1,
    description: metadata.description,
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

const comparisonDetailPayload = { key: 'comparison-initial-data', parse: parseComparisonViewModel } as const;
const modelProfileDetailPayload = { key: 'model-profile-initial-data', parse: parseModelProfileViewModel } as const;
const pricePerformancePayload = { key: 'price-performance-initial-data', parse: parsePricePerformanceEnvelope } as const;

export const previewRuntimeRoutes = [
  {
    id: 'comparison-detail',
    match: comparisonDetailMatch,
    payload: comparisonDetailPayload,
    render: (data) => <ComparisonDetailApp viewModel={data as ComparisonViewModel} />,
  },
  {
    id: 'model-profile-detail',
    match: modelProfileDetailMatch,
    payload: modelProfileDetailPayload,
    render: (data) => <ModelProfileApp viewModel={data as ModelProfileViewModel} />,
  },
] as const satisfies readonly PreviewRuntimeRoute[];

const manifestRoutes = [
  {
    id: 'home',
    match: exactPathMatcher('home', '/'),
    outputPathname: '/',
    delivery: 'prototype',
    prototypeMount: 'preserve',
    documentReadiness: pendingReactDocument,
    shell: { activePage: 'home', ...defaultSkipLink },
    metadata: () => metadataForRoute({ kind: 'home' }),
    structuredData,
    staticData: async () => undefined,
    payload: null,
    Page: prototypeFallbackPage,
    prototypeBundle: [{ outputPathname: '/', output: ['index.html'], document: 'home.html', clearOutputDirectory: false }],
  },
  {
    id: 'models',
    match: exactPathMatcher('models', '/models'),
    outputPathname: '/models',
    delivery: 'prototype',
    prototypeMount: 'preserve',
    documentReadiness: pendingReactDocument,
    shell: { activePage: 'models', ...defaultSkipLink },
    metadata: () => metadataForRoute({ kind: 'models' }),
    structuredData,
    staticData: async () => undefined,
    payload: null,
    Page: popularModelsPage,
    prototypeBundle: [
      { outputPathname: '/models.html', output: ['models.html'], document: 'index.html', clearOutputDirectory: true },
      { outputPathname: '/models/', output: ['models', 'index.html'], document: 'index.html', clearOutputDirectory: true },
    ],
  },
  {
    id: 'model-profile',
    match: exactPathMatcher('model-profile', '/model-profile'),
    outputPathname: '/model-profile',
    delivery: 'prototype',
    prototypeMount: 'preserve',
    documentReadiness: pendingReactDocument,
    shell: { activePage: 'models', ...defaultSkipLink },
    metadata: (match) => metadataForRoute({ kind: 'modelProfile', slug: match.search.get('model') ?? 'model' }),
    structuredData,
    staticData: async () => undefined,
    payload: null,
    Page: prototypeFallbackPage,
    prototypeBundle: [{ outputPathname: '/model-profile/', output: ['model-profile', 'index.html'], document: 'model-profile.html', clearOutputDirectory: false }],
  },
  {
    id: 'model-lifecycle',
    match: exactPathMatcher('model-lifecycle', '/model-lifecycle'),
    outputPathname: '/model-lifecycle',
    delivery: 'prototype',
    prototypeMount: 'preserve',
    documentReadiness: pendingReactDocument,
    shell: { activePage: 'models', ...defaultSkipLink },
    metadata: () => metadataForRoute({ kind: 'models' }),
    structuredData,
    staticData: async () => undefined,
    payload: null,
    Page: prototypeFallbackPage,
    prototypeBundle: [{ outputPathname: '/model-lifecycle/', output: ['model-lifecycle', 'index.html'], document: 'model-lifecycle.html', clearOutputDirectory: false }],
  },
  {
    id: 'popular-models',
    match: exactPathMatcher('popular-models', '/popular-models/'),
    outputPathname: '/popular-models/',
    delivery: 'prototype',
    prototypeMount: 'popular-models-workbench',
    documentReadiness: pendingReactDocument,
    shell: { activePage: 'popularModels', ...defaultSkipLink },
    metadata: () => metadataForRoute({ kind: 'popularModels' }),
    structuredData,
    staticData: async () => undefined,
    payload: null,
    Page: popularModelsPage,
    prototypeBundle: [{ outputPathname: '/popular-models/', output: ['popular-models', 'index.html'], document: 'popular-models.html', clearOutputDirectory: false }],
  },
  {
    id: 'make-it-yours',
    match: exactPathMatcher('make-it-yours', '/make-it-yours/'),
    outputPathname: '/make-it-yours/',
    delivery: 'prototype',
    prototypeMount: 'preserve',
    documentReadiness: pendingReactDocument,
    shell: { activePage: 'leaderboards', ...defaultSkipLink },
    metadata: () => metadataForRoute({ kind: 'leaderboards' }),
    structuredData,
    staticData: async () => undefined,
    payload: null,
    Page: popularModelsPage,
    prototypeBundle: [{ outputPathname: '/make-it-yours/', output: ['make-it-yours', 'index.html'], document: 'make-it-yours.html', clearOutputDirectory: false }],
  },
  {
    id: 'compare',
    match: exactPathMatcher('compare', '/compare'),
    outputPathname: '/compare',
    delivery: 'prototype',
    prototypeMount: 'preserve',
    documentReadiness: pendingReactDocument,
    shell: { activePage: 'compare', ...defaultSkipLink },
    metadata: () => metadataForRoute({ kind: 'compareHub' }),
    structuredData,
    staticData: async () => undefined,
    payload: null,
    Page: compareHubPage,
    prototypeBundle: [
      { outputPathname: '/compare.html', output: ['compare.html'], document: 'compare.html', clearOutputDirectory: true },
      { outputPathname: '/compare/', output: ['compare', 'index.html'], document: 'compare.html', clearOutputDirectory: true },
    ],
  },
  {
    id: 'subscribe-vs-api',
    match: exactPathMatcher('subscribe-vs-api', '/subscribe-vs-api'),
    outputPathname: '/subscribe-vs-api',
    delivery: 'prototype',
    prototypeMount: 'preserve',
    documentReadiness: pendingReactDocument,
    shell: { activePage: 'calculator', ...defaultSkipLink },
    metadata: () => metadataForRoute({ kind: 'calculator' }),
    structuredData,
    staticData: async () => undefined,
    payload: null,
    Page: pricePerformancePage,
    prototypeBundle: [{ outputPathname: '/subscribe-vs-api/', output: ['subscribe-vs-api', 'index.html'], document: 'cost-calculator.html', clearOutputDirectory: true }],
  },
  {
    id: 'articles',
    match: exactPathMatcher('articles', '/articles'),
    outputPathname: '/articles',
    delivery: 'prototype',
    prototypeMount: 'preserve',
    documentReadiness: pendingReactDocument,
    shell: { activePage: 'guides', skipLinkTarget: 'guide-content', skipLinkLabel: 'Skip to articles' },
    metadata: () => previewArticleMetadata.articles,
    structuredData,
    staticData: async () => undefined,
    payload: null,
    Page: guidesHubPage,
    prototypeBundle: [
      { outputPathname: '/articles.html', output: ['articles.html'], document: 'articles.html', clearOutputDirectory: false },
      { outputPathname: '/articles/', output: ['articles', 'index.html'], document: 'articles.html', clearOutputDirectory: false },
    ],
  },
  {
    id: 'article-detail',
    match: articleDetailMatch,
    outputPathname: '/articles/hybrid-router',
    delivery: 'prototype',
    prototypeMount: 'preserve',
    documentReadiness: {
      status: 'blocked',
      reason: 'Hybrid Router substantive React page and static data are pending Task 7.',
    },
    shell: { activePage: 'guides', skipLinkTarget: 'guide-content', skipLinkLabel: 'Skip to article content' },
    metadata: (match) => {
      const slug = match.params.slug;
      if (slug === 'hybrid-router') return previewArticleMetadata.hybridRouter;
      return slug && GUIDE_BY_SLUG.has(slug)
        ? metadataForRoute({ kind: 'guides', slug })
        : previewArticleMetadata.articles;
    },
    structuredData,
    staticData: async (match) => match.params.slug ? GUIDE_BY_SLUG.get(match.params.slug) : undefined,
    payload: null,
    Page: PrototypeArticlePage,
    prototypeBundle: [
      { outputPathname: '/articles/hybrid-router.html', output: ['articles', 'hybrid-router.html'], document: 'article-hybrid-router.html', clearOutputDirectory: false },
      { outputPathname: '/articles/hybrid-router/', output: ['articles', 'hybrid-router', 'index.html'], document: 'article-hybrid-router.html', clearOutputDirectory: false },
    ],
  },
  {
    id: 'llm-price-performance',
    match: exactPathMatcher('llm-price-performance', '/llm-price-performance/'),
    outputPathname: '/llm-price-performance/',
    delivery: 'prototype',
    prototypeMount: 'preserve',
    documentReadiness: pendingReactDocument,
    shell: { activePage: 'pricePerformance', ...defaultSkipLink },
    metadata: () => metadataForRoute({ kind: 'pricePerformance' }),
    structuredData,
    staticData: async () => undefined,
    payload: pricePerformancePayload,
    Page: pricePerformancePage,
    prototypeBundle: [],
  },
] as const satisfies readonly PreviewManifestRoute[];

export const previewRoutes: readonly PreviewRoute[] = manifestRoutes;

export function matchPreviewRoute(url: URL): PreviewRouteMatch | null {
  for (const route of previewRoutes) {
    const match = route.match(url);
    if (match) return match;
  }
  return null;
}

export function matchPreviewRuntimeRoute(url: URL): PreviewRuntimeRouteMatch | null {
  for (const route of previewRuntimeRoutes) {
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
    const manifestRoute = manifestRoutes.find((candidate) => candidate.id === route.id);
    const prototypeBundle = manifestRoute?.prototypeBundle.map((entry) => ({
      routeId: route.id,
      delivery: route.delivery,
      source: 'prototype-bundle' as const,
      ...entry,
      match: routeMatch(route.id, new URL(entry.outputPathname, 'https://tokenbench.test')),
    })) ?? [];
    if (route.id === 'article-detail') {
      return [...prototypeBundle, ...GUIDES.map((guide) => ({
        routeId: route.id,
        delivery: route.delivery,
        source: 'generated-guide' as const,
        outputPathname: `/articles/${guide.slug}/`,
        output: ['articles', guide.slug, 'index.html'],
        document: undefined,
        clearOutputDirectory: false,
        match: routeMatch(route.id, new URL(`/articles/${guide.slug}/`, 'https://tokenbench.test'), { slug: guide.slug }),
      }))];
    }
    return prototypeBundle;
  });
}
