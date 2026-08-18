import type { ComponentType } from 'react';
import { ComparisonDetailApp, ModelProfileApp } from '../App.tsx';
import { ARTICLE_BY_SLUG, ARTICLES, articlePath, type Article, type ArticleChannel } from '../articles/content';
import { SITE_CONFIG } from '../brand/site-config';
import { HomePage, type HomePageData } from '../pages/home-page';
import { PopularModelsRoutePage, parsePopularModelsPageData } from '../pages/popular-models-page';
import { StaticPricePerformanceUnavailablePage } from '../pages/price-performance-page';
import { parseComparisonViewModel, type ComparisonViewModel } from '../frontend/comparison-contracts';
import { createEvidenceTransport } from '../frontend/preview-data/evidence-transport';
import { createPreviewDataGateway } from '../frontend/preview-data/gateway';
import { ACCEPTED_CUSTOM_RANKING_QUERY, ACCEPTED_LIFECYCLE_AS_OF, ACCEPTED_SUBSCRIPTION_QUERY } from '../frontend/preview-data/contracts';
import { compareStateFromQuery } from '../frontend/preview-workbench/compare-state';
import { decodeModelWorkbenchState, modelDirectoryQueryForWorkbenchState } from '../frontend/preview-workbench/model-state';
import { parseModelProfileViewModel, type ModelProfileViewModel } from '../frontend/model-profile-contracts';
import { ArticleDetailPage, articleJsonLd } from '../pages/article-detail-page';
import { articleChannelFromSearch, ArticlesPage } from '../pages/articles-page';
import { LifecycleRadarPage, parseLifecycleRadarPageData } from '../pages/lifecycle-radar-page';
import { PreviewModelProfilePage, parsePreviewModelProfilePageData } from '../pages/preview-model-profile-page';
import { PreviewModelsPage, parsePreviewModelsPageData } from '../pages/preview-models-page';
import { PreviewComparePage, parsePreviewComparePageData } from '../pages/preview-compare-page';
import { MakeItYoursPage, parseMakeItYoursPageData } from '../pages/make-it-yours-page';
import { SubscribeVsApiPage, parseSubscribeVsApiPageData } from '../pages/subscribe-vs-api-page';
import { metadataForRoute } from '../seo/metadata';
import type { PageMetadata } from '../seo/metadata';
import type { PreviewDocumentReadiness, PreviewPageProps, PreviewRoute, PreviewRouteId, PreviewRouteMatch, PreviewRuntimeRoute, PreviewRuntimeRouteId, PreviewRuntimeRouteMatch, PreviewStaticEntry } from './route-types';

export type { PreviewClientRouteId, PreviewDocumentReadiness, PreviewPageProps, PreviewPayloadDefinition, PreviewRoute, PreviewRouteId, PreviewRouteMatch, PreviewRuntimeRoute, PreviewRuntimeRouteId, PreviewRuntimeRouteMatch, PreviewStaticEntry } from './route-types';

const defaultSkipLink = {
  skipLinkTarget: 'page-content',
  skipLinkLabel: 'Skip to page content',
} as const;

const readyReactDocument: PreviewDocumentReadiness = { status: 'ready' };
/** Static preview selects retained evidence deliberately; HTTP remains an unselected Task 14 transport. */
const staticPreviewAdapter = createPreviewDataGateway(createEvidenceTransport());
const staticCustomRankingAdapter = createPreviewDataGateway(createEvidenceTransport({ rankings: 'mixed-source' }));
const acceptedStaticCompareState = { modelIds: ['alpha', 'beta', 'gamma'] } as const;

interface PreviewMetadataDefinition {
  readonly title: string;
  readonly description: string;
  readonly h1: string;
  readonly type?: 'website' | 'article';
}

const socialImage = `${SITE_CONFIG.origin}/og-guides.png`;

function previewMetadataForCanonical(canonical: string, definition: PreviewMetadataDefinition): PageMetadata {
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

function previewMetadata(pathname: string, definition: PreviewMetadataDefinition): PageMetadata {
  const normalizedPathname = pathname === '/'
    ? ''
    : `${pathname.replace(/\/+$/, '')}/`;
  return previewMetadataForCanonical(`${SITE_CONFIG.origin}${normalizedPathname}`, definition);
}

function previewQueryProfileMetadata(slug: string): PageMetadata {
  const runtimeMetadata = metadataForRoute({ kind: 'modelProfile', slug });
  const canonical = `${SITE_CONFIG.origin}/model-profile?model=${encodeURIComponent(slug)}`;
  return previewMetadataForCanonical(canonical, {
    title: runtimeMetadata.title,
    description: runtimeMetadata.description,
    h1: runtimeMetadata.h1,
  });
}

const previewLifecycleMetadata = previewMetadataForCanonical(`${SITE_CONFIG.origin}/model-lifecycle`, {
  title: `Model Lifecycle & Retirement Radar | ${SITE_CONFIG.name}`,
  description: `Track model retirement notices, sunset dates, source-backed replacement paths, and explicit unavailable migration evidence with ${SITE_CONFIG.name}.`,
  h1: 'Production model lifecycle & retirement radar',
});

const previewMakeItYoursMetadata = previewMetadata('/make-it-yours/', {
  title: `Make it yours — ${SITE_CONFIG.name}`,
  description: 'Build and export a weighted model leaderboard with capability, provider, access, and service-level filters.',
  h1: 'Make it yours',
});

const previewArticleMetadata = {
  articles: previewMetadata('/articles/', {
    title: `Articles & guides — ${SITE_CONFIG.name}`,
    description: `${SITE_CONFIG.name} guides and prototype LLM insights for source-aware AI decisions.`,
    h1: 'Articles for the AI bill you can explain.',
  }),
} as const;

function metadataForArticle(article: Article): PageMetadata {
  return previewMetadata(articlePath(article.slug), {
    title: article.slug === 'hybrid-router'
      ? `${article.seoTitle} — ${SITE_CONFIG.name}`
      : `${article.seoTitle} | ${SITE_CONFIG.name}`,
    description: article.description,
    h1: article.title,
    type: 'article',
  });
}

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
  if (ARTICLE_BY_SLUG.has(slug)) {
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
    const article = match.params.slug ? ARTICLE_BY_SLUG.get(match.params.slug) : undefined;
    if (!article) return [];
    return [
      articleJsonLd(article),
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: SITE_CONFIG.name, item: SITE_CONFIG.origin },
          { '@type': 'ListItem', position: 2, name: 'Articles', item: `${SITE_CONFIG.origin}/articles/` },
          { '@type': 'ListItem', position: 3, name: article.channelLabel, item: `${SITE_CONFIG.origin}/articles?channel=${article.channel}` },
          { '@type': 'ListItem', position: 4, name: article.title, item: metadata.canonical },
        ],
      },
    ];
  }
  return [{
    '@context': 'https://schema.org',
    '@type': route.id === 'articles' ? 'CollectionPage' : 'WebPage',
    name: metadata.h1,
    description: metadata.description,
    url: metadata.canonical,
  }];
}

function ArticlesRoutePage({ data }: PreviewPageProps) {
  return <ArticlesPage articles={ARTICLES} initialChannel={parseArticlesPayload(data)?.channel ?? 'all'} />;
}

function ArticleDetailRoutePage({ match }: PreviewPageProps) {
  const article = match.params.slug ? ARTICLE_BY_SLUG.get(match.params.slug) : undefined;
  return article ? <ArticleDetailPage article={article} /> : <ArticlesPage articles={ARTICLES} initialChannel="all" />;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function parseArticlePayload(value: unknown): { readonly slug: string } | null {
  return isRecord(value) && typeof value.slug === 'string' && ARTICLE_BY_SLUG.has(value.slug)
    ? { slug: value.slug }
    : null;
}

function parseArticlesPayload(value: unknown): { readonly channel: 'all' | ArticleChannel } | null {
  if (!isRecord(value)) return null;
  const channel = value.channel;
  return channel === 'all' || channel === 'guides' || channel === 'insights' || channel === 'news'
    ? { channel }
    : null;
}

function isEvidenceValue(value: unknown, isAvailableValue: (candidate: unknown) => boolean): boolean {
  if (!isRecord(value)) return false;
  if (value.availability === 'unavailable') return typeof value.reason === 'string';
  return value.availability === 'available' && isAvailableValue(value.value);
}

function isHomePreviewModel(value: unknown): boolean {
  if (!isRecord(value) || typeof value.id !== 'string') return false;
  return isEvidenceValue(value.identity, (identity) => isRecord(identity)
      && typeof identity.slug === 'string'
      && typeof identity.name === 'string'
      && typeof identity.provider === 'string')
    && isEvidenceValue(value.access, (access) => access === 'Proprietary' || access === 'Open weights')
    && isEvidenceValue(value.routePricing, (routePricing) => isRecord(routePricing)
      && typeof routePricing.inputUsdPerMillion === 'number'
      && typeof routePricing.outputUsdPerMillion === 'number')
    && isEvidenceValue(value.runtime, (runtime) => isRecord(runtime)
      && typeof runtime.ttftP50Seconds === 'number'
      && typeof runtime.outputTokensPerSecond === 'number');
}

function parseHomePageData(value: unknown): HomePageData | null {
  if (!isRecord(value)) return null;
  const candidate = value as { readonly contractVersion?: unknown; readonly data?: { readonly models?: unknown } | null };
  return candidate.contractVersion === 'ui-data-contract/v1'
    && typeof candidate.data === 'object'
    && candidate.data !== null
    && Array.isArray(candidate.data.models)
    && candidate.data.models.every(isHomePreviewModel)
    ? value as unknown as HomePageData
    : null;
}

function HomeRoutePage({ data }: PreviewPageProps) {
  return <HomePage data={parseHomePageData(data) ?? undefined} />;
}

const prototypeFallbackPage = HomePage as ComponentType<PreviewPageProps>;
const homePage = HomeRoutePage as ComponentType<PreviewPageProps>;
const pricePerformancePage = StaticPricePerformanceUnavailablePage as ComponentType<PreviewPageProps>;
const popularModelsPage = PopularModelsRoutePage as ComponentType<PreviewPageProps>;
const articlesPage = ArticlesRoutePage as ComponentType<PreviewPageProps>;
const articleDetailPage = ArticleDetailRoutePage as ComponentType<PreviewPageProps>;
const modelsPage = ((props: PreviewPageProps) => <PreviewModelsPage {...props} adapter={staticPreviewAdapter} />) as ComponentType<PreviewPageProps>;
const modelProfilePage = ((props: PreviewPageProps) => <PreviewModelProfilePage {...props} adapter={staticPreviewAdapter} />) as ComponentType<PreviewPageProps>;
const lifecyclePage = ((props: PreviewPageProps) => <LifecycleRadarPage {...props} adapter={staticPreviewAdapter} initialHorizon="30" />) as ComponentType<PreviewPageProps>;
const comparePage = ((props: PreviewPageProps) => <PreviewComparePage {...props} adapter={staticPreviewAdapter} />) as ComponentType<PreviewPageProps>;
const makeItYoursPage = ((props: PreviewPageProps) => <MakeItYoursPage {...props} adapter={staticCustomRankingAdapter} />) as ComponentType<PreviewPageProps>;
const subscribeVsApiPage = ((props: PreviewPageProps) => <SubscribeVsApiPage {...props} adapter={staticPreviewAdapter} />) as ComponentType<PreviewPageProps>;

const comparisonDetailPayload = { key: 'comparison-initial-data', parse: parseComparisonViewModel } as const;
const modelProfileDetailPayload = { key: 'model-profile-initial-data', parse: parseModelProfileViewModel } as const;
const homePayload = { key: 'home-initial-data', parse: parseHomePageData } as const;
const popularModelsPayload = { key: 'popular-models-initial-data', parse: parsePopularModelsPageData } as const;
const articlesPayload = { key: 'articles-initial-data', parse: parseArticlesPayload } as const;
const articlePayload = { key: 'article-initial-data', parse: parseArticlePayload } as const;
const modelsPayload = { key: 'models-initial-data', parse: parsePreviewModelsPageData } as const;
const modelProfilePayload = { key: 'preview-model-profile-initial-data', parse: parsePreviewModelProfilePageData } as const;
const lifecyclePayload = { key: 'model-lifecycle-initial-data', parse: parseLifecycleRadarPageData } as const;
const comparePayload = { key: 'compare-initial-data', parse: parsePreviewComparePageData } as const;
const makeItYoursPayload = { key: 'make-it-yours-initial-data', parse: parseMakeItYoursPageData } as const;
const subscribeVsApiPayload = { key: 'subscribe-vs-api-initial-data', parse: parseSubscribeVsApiPageData } as const;

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
    delivery: 'react',
    documentReadiness: readyReactDocument,
    shell: { activePage: 'home', ...defaultSkipLink },
    metadata: () => metadataForRoute({ kind: 'home' }),
    structuredData,
    staticData: async (match) => staticPreviewAdapter.models(modelDirectoryQueryForWorkbenchState(decodeModelWorkbenchState(match.search))),
    payload: homePayload,
    Page: homePage,
  },
  {
    id: 'models',
    match: exactPathMatcher('models', '/models'),
    outputPathname: '/models',
    delivery: 'react',
    documentReadiness: readyReactDocument,
    shell: { activePage: 'models', ...defaultSkipLink },
    metadata: () => metadataForRoute({ kind: 'models' }),
    structuredData,
    staticData: async () => staticPreviewAdapter.models({}),
    payload: modelsPayload,
    Page: modelsPage,
  },
  {
    id: 'model-profile',
    match: exactPathMatcher('model-profile', '/model-profile'),
    outputPathname: '/model-profile',
    delivery: 'react',
    documentReadiness: readyReactDocument,
    shell: { activePage: 'models', ...defaultSkipLink },
    metadata: (match) => previewQueryProfileMetadata(match.search.get('model') ?? 'model'),
    structuredData,
    staticData: async (match) => staticPreviewAdapter.profile(match.search.get('model') ?? 'alpha'),
    payload: modelProfilePayload,
    Page: modelProfilePage,
  },
  {
    id: 'model-lifecycle',
    match: exactPathMatcher('model-lifecycle', '/model-lifecycle'),
    outputPathname: '/model-lifecycle',
    delivery: 'react',
    documentReadiness: readyReactDocument,
    shell: { activePage: 'models', ...defaultSkipLink },
    metadata: () => previewLifecycleMetadata,
    structuredData,
    staticData: async () => staticPreviewAdapter.lifecycle({ asOf: ACCEPTED_LIFECYCLE_AS_OF, horizonDays: 30 }),
    payload: lifecyclePayload,
    Page: lifecyclePage,
  },
  {
    id: 'popular-models',
    match: exactPathMatcher('popular-models', '/popular-models/'),
    outputPathname: '/popular-models/',
    delivery: 'react',
    documentReadiness: readyReactDocument,
    shell: { activePage: 'popularModels', ...defaultSkipLink },
    metadata: () => metadataForRoute({ kind: 'popularModels' }),
    structuredData,
    staticData: async () => staticPreviewAdapter.rankings({ operation: 'leaderboard', limit: 50 }),
    payload: popularModelsPayload,
    Page: popularModelsPage,
  },
  {
    id: 'make-it-yours',
    match: exactPathMatcher('make-it-yours', '/make-it-yours/'),
    outputPathname: '/make-it-yours/',
    delivery: 'react',
    documentReadiness: readyReactDocument,
    shell: { activePage: 'leaderboards', ...defaultSkipLink },
    metadata: () => previewMakeItYoursMetadata,
    structuredData,
    staticData: async (match) => staticCustomRankingAdapter.rankings(match.search.toString().length === 0 ? ACCEPTED_CUSTOM_RANKING_QUERY : { operation: 'custom' }),
    payload: makeItYoursPayload,
    Page: makeItYoursPage,
  },
  {
    id: 'compare',
    match: exactPathMatcher('compare', '/compare'),
    outputPathname: '/compare',
    delivery: 'react',
    documentReadiness: readyReactDocument,
    shell: { activePage: 'compare', ...defaultSkipLink },
    metadata: () => metadataForRoute({ kind: 'compareHub' }),
    structuredData,
    staticData: async (match) => staticPreviewAdapter.comparison(compareStateFromQuery(match.search, acceptedStaticCompareState)),
    payload: comparePayload,
    Page: comparePage,
  },
  {
    id: 'subscribe-vs-api',
    match: exactPathMatcher('subscribe-vs-api', '/subscribe-vs-api'),
    outputPathname: '/subscribe-vs-api',
    delivery: 'react',
    documentReadiness: readyReactDocument,
    shell: { activePage: 'calculator', ...defaultSkipLink },
    metadata: () => metadataForRoute({ kind: 'calculator' }),
    structuredData,
    staticData: async (match) => staticPreviewAdapter.subscription(match.search.toString().length === 0 ? ACCEPTED_SUBSCRIPTION_QUERY : { operation: 'catalog' }),
    payload: subscribeVsApiPayload,
    Page: subscribeVsApiPage,
  },
  {
    id: 'articles',
    match: exactPathMatcher('articles', '/articles'),
    outputPathname: '/articles',
    delivery: 'react',
    documentReadiness: readyReactDocument,
    shell: { activePage: 'guides', skipLinkTarget: 'article-content', skipLinkLabel: 'Skip to articles' },
    metadata: () => previewArticleMetadata.articles,
    structuredData,
    staticData: async (match) => ({ channel: articleChannelFromSearch(match.search.get('channel')) }),
    payload: articlesPayload,
    Page: articlesPage,
  },
  {
    id: 'article-detail',
    match: articleDetailMatch,
    outputPathname: '/articles/hybrid-router',
    delivery: 'react',
    documentReadiness: readyReactDocument,
    shell: { activePage: 'guides', skipLinkTarget: 'article-content', skipLinkLabel: 'Skip to article content' },
    metadata: (match) => {
      const article = match.params.slug ? ARTICLE_BY_SLUG.get(match.params.slug) : undefined;
      return article ? metadataForArticle(article) : previewArticleMetadata.articles;
    },
    structuredData,
    staticData: async (match) => ({ slug: match.params.slug }),
    payload: articlePayload,
    Page: articleDetailPage,
  },
  {
    id: 'llm-price-performance',
    match: exactPathMatcher('llm-price-performance', '/llm-price-performance/'),
    outputPathname: '/llm-price-performance/',
    delivery: 'react',
    documentReadiness: readyReactDocument,
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
  const route = previewRoutes.find((candidate) => candidate.id === 'article-detail');
  if (!route) return [];
  return ARTICLES.filter((article) => article.slug !== 'hybrid-router').map((article) => ({
    routeId: route.id,
    source: 'generated-guide' as const,
    outputPathname: articlePath(article.slug),
    output: ['articles', article.slug, 'index.html'],
    match: routeMatch(route.id, new URL(articlePath(article.slug), 'https://tokenbench.test'), { slug: article.slug }),
  }));
}
