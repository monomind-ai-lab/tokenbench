import { describe, expect, it } from 'vitest';
import { SITE_CONFIG } from '../brand/site-config';
import { ARTICLES } from '../articles/content';
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

  it('assigns every preview URL to exactly one route and delivers the article index and details through React', () => {
    for (const route of previewRoutes) {
      const url = new URL(route.outputPathname, 'https://tokenbench.test');
      const owners = previewRoutes.filter((candidate) => candidate.match(url)?.routeId === route.id);

      expect(owners).toHaveLength(1);
    }

    expect(previewRoutes.filter((route) => route.delivery === 'react').map((route) => route.id)).toEqual([
      'home',
      'models',
      'model-profile',
      'model-lifecycle',
      'popular-models',
      'make-it-yours',
      'compare',
      'subscribe-vs-api',
      'articles',
      'article-detail',
    ]);
  });

  it('does not expose a transitional prototype mount policy', () => {
    expect(previewRoutes.every((route) => !Object.hasOwn(route, 'prototypeMount'))).toBe(true);
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

  it('matches every canonical article detail and derives static entries from the unified article model', () => {
    const staticEntries = previewStaticEntries();
    const articleEntries = staticEntries.filter((entry) => entry.source === 'generated-guide');

    for (const article of ARTICLES) {
      expect(matchPreviewRoute(new URL(`https://tokenbench.test/articles/${article.slug}/`))).toMatchObject({ routeId: 'article-detail', params: { slug: article.slug } });
    }
    expect(articleEntries).toHaveLength(ARTICLES.length - 1);
    expect(new Set(articleEntries.map((entry) => entry.outputPathname))).toHaveLength(ARTICLES.length - 1);
    expect(articleEntries.map((entry) => entry.outputPathname)).toEqual(
      ARTICLES.filter((article) => article.slug !== 'hybrid-router').map((article) => `/articles/${article.slug}/`),
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

  it('keeps query-profile metadata on the encoded preview URL rather than the runtime detail route', () => {
    const match = matchPreviewRoute(new URL('https://tokenbench.test/model-profile?model=GPT%205.6%2FSol'));
    const route = previewRoutes.find((candidate) => candidate.id === match?.routeId);
    const metadata = route?.metadata(match!);
    const canonical = `${SITE_CONFIG.origin}/model-profile?model=GPT%205.6%2FSol`;

    expect(metadata).toMatchObject({
      canonical,
      title: 'GPT 5.6/Sol model evidence | TokenBench',
      description: 'Review a retained AI model profile on TokenBench with source-backed benchmark scores, relative field ranks, route pricing, specifications, and an auditable evidence ledger.',
    });
    expect(metadata?.openGraph).toMatchObject({
      url: canonical,
      title: metadata?.title,
      description: metadata?.description,
    });
    expect(metadata?.canonical).not.toContain('/models/');
  });

  it('publishes lifecycle-specific metadata on the slashless preview lifecycle route', () => {
    const match = matchPreviewRoute(new URL('https://tokenbench.test/model-lifecycle'));
    const route = previewRoutes.find((candidate) => candidate.id === match?.routeId);
    const metadata = route?.metadata(match!);
    const canonical = `${SITE_CONFIG.origin}/model-lifecycle`;

    expect(metadata).toMatchObject({
      canonical,
      title: 'Model Lifecycle & Retirement Radar | TokenBench',
      description: 'Track model retirement notices, sunset dates, source-backed replacement paths, and explicit unavailable migration evidence with TokenBench.',
    });
    expect(metadata?.openGraph).toMatchObject({
      url: canonical,
      title: metadata?.title,
      description: metadata?.description,
    });
    expect(metadata?.canonical).not.toBe(`${SITE_CONFIG.origin}/models/`);
  });

  it('uses the retained accepted-evidence timestamp for static Home delivery', async () => {
    const route = previewRoutes.find((candidate) => candidate.id === 'home');
    const match = route?.match(new URL('https://tokenbench.test/'));
    if (!route || !match) throw new Error('Home preview route is unavailable');

    await expect(route.staticData(match)).resolves.toMatchObject({
      contractVersion: 'ui-data-contract/v1',
      fetchedAt: '2026-08-18T00:00:00.000Z',
      data: { models: expect.any(Array) },
    });
  });

  it('selects the accepted evidence gateway for static data-heavy preview routes without exposing pipeline envelopes to pages', async () => {
    const models = previewRoutes.find((candidate) => candidate.id === 'models');
    const profile = previewRoutes.find((candidate) => candidate.id === 'model-profile');
    const rankings = previewRoutes.find((candidate) => candidate.id === 'make-it-yours');
    const subscription = previewRoutes.find((candidate) => candidate.id === 'subscribe-vs-api');
    if (!models || !profile || !rankings || !subscription) throw new Error('Data-heavy preview routes are unavailable');

    const modelsData = await models.staticData(models.match(new URL('https://tokenbench.test/models'))!);
    const profileData = await profile.staticData(profile.match(new URL('https://tokenbench.test/model-profile?model=alpha'))!);
    const rankingsData = await rankings.staticData(rankings.match(new URL('https://tokenbench.test/make-it-yours/'))!);
    const subscriptionData = await subscription.staticData(subscription.match(new URL('https://tokenbench.test/subscribe-vs-api'))!);

    expect(modelsData).toMatchObject({ contractVersion: 'ui-data-contract/v1', data: { models: expect.arrayContaining([expect.objectContaining({ id: 'alpha' })]) } });
    expect(profileData).toMatchObject({ contractVersion: 'ui-data-contract/v1', data: { model: expect.objectContaining({ id: 'alpha' }) } });
    expect(rankingsData).toMatchObject({ contractVersion: 'ui-data-contract/v1', data: { models: expect.arrayContaining([expect.any(Object)]) } });
    expect(subscriptionData).toMatchObject({ contractVersion: 'ui-data-contract/v1', data: { models: expect.arrayContaining([expect.objectContaining({ id: 'alpha' })]) } });
    for (const data of [modelsData, profileData, rankingsData, subscriptionData]) {
      expect(data).not.toHaveProperty('method');
      expect(data).not.toHaveProperty('sources');
    }
  });

  it('uses typed accepted-evidence gateway payloads for the migrated model-family routes', async () => {
    const models = previewRoutes.find((candidate) => candidate.id === 'models');
    const profile = previewRoutes.find((candidate) => candidate.id === 'model-profile');
    const lifecycle = previewRoutes.find((candidate) => candidate.id === 'model-lifecycle');
    const compare = previewRoutes.find((candidate) => candidate.id === 'compare');
    if (!models || !profile || !lifecycle || !compare) throw new Error('Model preview routes are unavailable');

    await expect(models.staticData(models.match(new URL('https://tokenbench.test/models'))!)).resolves.toMatchObject({
      contractVersion: 'ui-data-contract/v1',
      data: { models: expect.any(Array) },
    });
    await expect(profile.staticData(profile.match(new URL('https://tokenbench.test/model-profile?model=alpha'))!)).resolves.toMatchObject({
      contractVersion: 'ui-data-contract/v1',
      data: { model: expect.any(Object) },
    });
    await expect(lifecycle.staticData(lifecycle.match(new URL('https://tokenbench.test/model-lifecycle'))!)).resolves.toMatchObject({
      contractVersion: 'ui-data-contract/v1',
      data: { models: expect.any(Array) },
    });
    await expect(compare.staticData(compare.match(new URL('https://tokenbench.test/compare'))!)).resolves.toMatchObject({
      contractVersion: 'ui-data-contract/v1',
      data: {
        models: expect.arrayContaining([
          expect.objectContaining({ id: 'alpha' }),
          expect.objectContaining({ id: 'beta' }),
          expect.objectContaining({ id: 'gamma' }),
        ]),
        unavailableModelIds: [],
      },
    });
    expect(models.payload).not.toBeNull();
    expect(profile.payload).not.toBeNull();
    expect(lifecycle.payload).not.toBeNull();
    expect(compare.payload).not.toBeNull();
  });

  it('rejects incomplete Home model rows before hydration', () => {
    const route = previewRoutes.find((candidate) => candidate.id === 'home');

    expect(route?.payload?.parse({
      contractVersion: 'ui-data-contract/v1',
      data: { models: [{ id: 'partial' }] },
    })).toBeNull();
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
    expect(route?.structuredData(match!)).toEqual(expect.arrayContaining([expect.objectContaining({
      '@type': schemaType,
      url: canonical,
    })]));
    if (schemaType === 'Article') expect(route?.structuredData(match!)).toEqual(expect.arrayContaining([
      expect.objectContaining({ '@type': 'BreadcrumbList' }),
    ]));
  });

  it('owns only the remaining prototype bundle output set', () => {
    const prototypeEntries = previewStaticEntries()
      .filter((entry) => entry.source === 'prototype-bundle')
      .map((entry) => `${entry.output.join('/')} <= ${entry.document}`);

    expect(prototypeEntries.sort()).toEqual([
      'index.html <= home.html',
      'popular-models/index.html <= popular-models.html',
    ].sort());
  });
});
