import { describe, expect, it } from 'vitest';
import { GUIDES } from '../guides/content';
import { matchPreviewRoute, previewPaths, previewRoutes, previewStaticEntries } from './route-manifest';

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

  it('derives one static article entry per guide from the manifest', () => {
    const staticEntries = previewStaticEntries();
    const articleEntries = staticEntries.filter((entry) => entry.routeId === 'article-detail');

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
});
