import { describe, expect, it } from 'vitest';
import { SITE_CONFIG } from '../brand/site-config';
import { GUIDES } from '../guides/content';
import { matchPreviewRoute, matchPreviewRuntimeRoute, previewPaths, previewRoutes, previewRuntimeRoutes, previewStaticEntries } from './route-manifest';

describe('preview route manifest', () => {
  it.each([
    ['https://tokenbench.test/', 'home'],
    ['https://tokenbench.test/model-profile?model=gpt-4o', 'model-profile'],
    ['https://tokenbench.test/articles?channel=guides', 'articles'],
    ['https://tokenbench.test/subscribe-vs-api?seats=12', 'subscribe-vs-api'],
  ] as const)('matches %s as %s without dropping search state', (href, routeId) => {
    const match = matchPreviewRoute(new URL(href));

    expect(match?.routeId).toBe(routeId);
    expect(match?.search.toString()).toBe(new URL(href).searchParams.toString());
  });

  it('preserves hash state when matching a preview route', () => {
    const match = matchPreviewRoute(new URL('https://tokenbench.test/models#catalog'));

    expect(match).toMatchObject({ routeId: 'models', hash: '#catalog' });
  });

  it.each(['/cost', '/cost/calculator', '/guides/track-claude-code-usage/'] as const)(
    'does not register legacy URL %s as a preview page',
    (pathname) => expect(matchPreviewRoute(new URL(pathname, 'https://tokenbench.test'))).toBeNull(),
  );

  it('assigns every preview URL to exactly one prototype route', () => {
    for (const route of previewRoutes) {
      const url = new URL(route.outputPathname, 'https://tokenbench.test');
      const owners = previewRoutes.filter((candidate) => candidate.match(url)?.routeId === route.id);

      expect(owners).toHaveLength(1);
      expect(owners[0]?.delivery).toBe('prototype');
    }
  });

  it('keeps runtime-only SSR routes out of static preview generation', () => {
    expect(previewRuntimeRoutes.map((route) => route.id)).toEqual([
      'comparison-detail',
      'model-profile-detail',
    ]);
    expect(matchPreviewRuntimeRoute(new URL('https://tokenbench.test/compare/model-a-vs-model-b/'))?.routeId).toBe('comparison-detail');
    expect(matchPreviewRuntimeRoute(new URL('https://tokenbench.test/models/gpt-5-6-sol/'))?.routeId).toBe('model-profile-detail');
    expect(matchPreviewRuntimeRoute(new URL('https://tokenbench.test/models/'))).toBeNull();
    const staticRouteIds = new Set<string>(previewStaticEntries().map((entry) => entry.routeId));
    expect(previewRuntimeRoutes.every((route) => !staticRouteIds.has(route.id))).toBe(true);
  });

  it('derives one static article entry per guide from the manifest', () => {
    const staticEntries = previewStaticEntries();
    const articleEntries = staticEntries.filter((entry) => entry.source === 'generated-guide');

    expect(articleEntries).toHaveLength(GUIDES.length);
    expect(new Set(articleEntries.map((entry) => entry.outputPathname))).toHaveLength(GUIDES.length);
    expect(articleEntries.map((entry) => entry.outputPathname)).toEqual(
      GUIDES.map((guide) => `/articles/${guide.slug}/`),
    );
  });

  it('derives shell link destinations from the manifest', () => {
    expect(previewPaths).toMatchObject({
      home: '/',
      models: '/models',
      modelCatalog: '/models#catalog',
      compare: '/compare',
      modelLifecycle: '/model-lifecycle',
      popularModels: '/popular-models/',
      makeItYours: '/make-it-yours/',
      articles: '/articles',
      articleDetail: '/articles/hybrid-router',
      subscribeVsApi: '/subscribe-vs-api',
      llmPricePerformance: '/llm-price-performance/',
    });
    expect(previewPaths.modelProfile('GPT 5.6/Sol')).toBe('/model-profile?model=GPT%205.6%2FSol');
    expect(previewPaths.calculator).toBe('/subscribe-vs-api');
    expect(previewPaths.pricePerformance).toBe('/llm-price-performance/');
  });

  it('derives structured data from the matched route metadata', () => {
    const route = previewRoutes.find((candidate) => candidate.id === 'home');
    const match = route?.match(new URL('https://tokenbench.test/'));

    expect(route?.structuredData(match!)).toEqual([expect.objectContaining({
      '@type': 'WebPage',
      name: route?.metadata(match!).h1,
      url: route?.metadata(match!).canonical,
    })]);
  });

  it.each([
    {
      href: 'https://tokenbench.test/articles',
      canonical: `${SITE_CONFIG.origin}/articles/`,
      title: 'Articles & guides — TokenBench',
      description: 'TokenBench guides and prototype LLM insights for source-aware AI decisions.',
      h1: 'Articles for the AI bill you can explain.',
      schemaType: 'CollectionPage',
    },
    {
      href: 'https://tokenbench.test/articles/hybrid-router',
      canonical: `${SITE_CONFIG.origin}/articles/hybrid-router/`,
      title: 'Hybrid router guide — TokenBench',
      description: 'A decision framework for using a hybrid model router while keeping cost, evidence, escalation, and rollback explicit.',
      h1: 'A hybrid router for high-stakes agentic work',
      schemaType: 'Article',
    },
  ] as const)('publishes preview-specific metadata for $href', ({ href, canonical, title, description, h1, schemaType }) => {
    const match = matchPreviewRoute(new URL(href));
    const route = previewRoutes.find((candidate) => candidate.id === match?.routeId);
    const metadata = route?.metadata(match!);

    expect(metadata).toMatchObject({ canonical, title, description, h1 });
    expect(metadata?.openGraph).toMatchObject({ url: canonical, title, description });
    expect(route?.structuredData(match!)).toEqual([expect.objectContaining({
      '@type': schemaType,
      url: canonical,
    })]);
  });

  it('owns the complete prototype bundle output set', () => {
    const prototypeEntries = previewStaticEntries()
      .filter((entry) => entry.source === 'prototype-bundle')
      .map((entry) => `${entry.output.join('/')} <= ${entry.document}`);

    expect(prototypeEntries.sort()).toEqual([
      'index.html <= home.html',
      'models.html <= index.html',
      'models/index.html <= index.html',
      'compare.html <= compare.html',
      'compare/index.html <= compare.html',
      'model-profile/index.html <= model-profile.html',
      'model-lifecycle/index.html <= model-lifecycle.html',
      'popular-models/index.html <= popular-models.html',
      'make-it-yours/index.html <= make-it-yours.html',
      'subscribe-vs-api/index.html <= cost-calculator.html',
      'articles.html <= articles.html',
      'articles/index.html <= articles.html',
      'articles/hybrid-router.html <= article-hybrid-router.html',
      'articles/hybrid-router/index.html <= article-hybrid-router.html',
    ].sort());
  });
});
