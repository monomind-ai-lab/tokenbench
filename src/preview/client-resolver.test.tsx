import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rootRenderer = vi.hoisted(() => vi.fn());
const createRootMock = vi.hoisted(() => vi.fn(() => ({ render: rootRenderer })));
const hydrateRootMock = vi.hoisted(() => vi.fn());
const parseComparisonViewModelMock = vi.hoisted(() => vi.fn());
const parseModelProfileViewModelMock = vi.hoisted(() => vi.fn());

vi.mock('react-dom/client', () => ({ createRoot: createRootMock, hydrateRoot: hydrateRootMock }));
vi.mock('../App.tsx', () => ({
  ComparisonDetailApp: ({ viewModel }: { readonly viewModel: { readonly revision: string } }) => <div data-comparison-detail-app>{viewModel.revision}</div>,
  ModelProfileApp: ({ viewModel }: { readonly viewModel: { readonly revision: string } }) => <div data-model-profile-app>{viewModel.revision}</div>,
}));
vi.mock('../pages/price-performance-page', () => ({ StaticPricePerformanceUnavailablePage: () => <div data-price-performance-unavailable /> }));
vi.mock('../frontend/comparison-contracts', () => ({ parseComparisonViewModel: parseComparisonViewModelMock }));
vi.mock('../frontend/model-profile-contracts', () => ({ parseModelProfileViewModel: parseModelProfileViewModelMock }));

import { startPreviewRoute } from './client-resolver';
import { previewRoutes } from './route-manifest';
import { fixtureAdapter } from '../frontend/preview-data/adapter';

describe('startPreviewRoute', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    parseComparisonViewModelMock.mockReset();
    parseModelProfileViewModelMock.mockReset();
    document.body.innerHTML = '<div id="root"><section>Server fallback</section></div><script id="popular-models-initial-data" type="application/json">{"models":[],"disclaimer":"Illustrative prototype data"}</script>';
    window.history.replaceState({}, '', '/popular-models/');
  });

  it('hydrates Popular Models from its validated route payload beneath the shared shell', () => {
    const route = previewRoutes.find((candidate) => candidate.id === 'popular-models');

    expect(route?.delivery).toBe('react');
    expect(route).not.toHaveProperty('prototypeMount');
    expect(startPreviewRoute(document, window.location)).toEqual({ kind: 'hydrated', routeId: 'popular-models' });
    expect(document.querySelector('[data-popular-models-workbench]')).toBeNull();
    expect(createRootMock).not.toHaveBeenCalled();
    const hydrated = renderToStaticMarkup(hydrateRootMock.mock.calls[0]?.[1] as ReactNode);
    expect(hydrated).toContain('popular-models-page');
    expect(hydrated).toContain('top-header');
  });

  it('hydrates an article detail from its validated manifest payload without replacing the static body', () => {
    document.body.innerHTML = '<div id="root"><article data-server-article>Server article</article></div><script id="article-initial-data" type="application/json">{"slug":"hybrid-router"}</script>';
    window.history.replaceState({}, '', '/articles/hybrid-router/');

    expect(startPreviewRoute(document, window.location)).toEqual({ kind: 'hydrated', routeId: 'article-detail' });
    expect(document.querySelector('[data-server-article]')).toBeInTheDocument();
    expect(createRootMock).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(hydrateRootMock.mock.calls[0]?.[1] as ReactNode)).toContain('A hybrid router for high-stakes agentic work');
  });

  it('hydrates a direct article-channel URL from the static all-channel payload without a mismatch', () => {
    document.body.innerHTML = '<div id="root"><section data-server-articles>Server articles</section></div><script id="articles-initial-data" type="application/json">{"channel":"all"}</script>';
    window.history.replaceState({}, '', '/articles?channel=guides');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(startPreviewRoute(document, window.location)).toEqual({ kind: 'hydrated', routeId: 'articles' });
    expect(document.querySelector('[data-server-articles]')).toBeInTheDocument();
    expect(createRootMock).not.toHaveBeenCalled();
    const hydrated = renderToStaticMarkup(hydrateRootMock.mock.calls[0]?.[1] as ReactNode);
    expect(hydrated).toContain('id="article-tab-all" aria-controls="article-index" aria-selected="true"');
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('preserves Popular Models SSR HTML when its dedicated payload is malformed', () => {
    const payload = document.getElementById('popular-models-initial-data')!;
    payload.textContent = '{bad json';
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    expect(startPreviewRoute(document, window.location)).toEqual({ kind: 'preserved-invalid-payload', routeId: 'popular-models' });
    expect(document.getElementById('root')).toHaveTextContent('Server fallback');
    expect(hydrateRootMock).not.toHaveBeenCalled();
    expect(createRootMock).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('mounts a declared client-load route when no embedded payload exists', () => {
    document.getElementById('popular-models-initial-data')?.remove();

    expect(startPreviewRoute(document, window.location)).toEqual({ kind: 'mounted', routeId: 'popular-models' });
    expect(document.getElementById('root')).toBeEmptyDOMElement();
    expect(createRootMock).toHaveBeenCalledWith(document.getElementById('root'));
    expect(rootRenderer).toHaveBeenCalledTimes(1);
  });

  it('mounts the migrated Models workbench when its static payload is absent', () => {
    document.body.innerHTML = '<div id="root"><main data-server-models>Server models</main></div>';
    window.history.replaceState({}, '', '/models/');

    expect(startPreviewRoute(document, window.location)).toEqual({ kind: 'mounted', routeId: 'models' });
    expect(document.getElementById('root')).toBeEmptyDOMElement();
    expect(hydrateRootMock).not.toHaveBeenCalled();
    expect(createRootMock).toHaveBeenCalledWith(document.getElementById('root'));
  });

  it('hydrates a direct Models filter URL from the unfiltered static document before applying its query state', async () => {
    const models = await fixtureAdapter.models({});
    document.body.innerHTML = `<div id="root"><main data-server-models>Server models</main></div><script id="models-initial-data" type="application/json">${JSON.stringify(models)}</script>`;
    window.history.replaceState({}, '', '/models?provider=DeepSeek');

    expect(startPreviewRoute(document, window.location)).toEqual({ kind: 'hydrated', routeId: 'models' });
    const hydrated = renderToStaticMarkup(hydrateRootMock.mock.calls[0]?.[1] as ReactNode);
    expect(hydrated).toContain('GPT-4o');
    expect(hydrated).toContain('DeepSeek V3');
    expect(window.location.search).toBe('?provider=DeepSeek');
  });

  it('hydrates a direct Compare query from the substantive default static payload without replacing the first tree', async () => {
    const comparison = await fixtureAdapter.comparison({ modelIds: ['gpt-4o', 'deepseek-v3'] });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    document.body.innerHTML = `<div id="root"><main data-server-compare>Server compare</main></div><script id="compare-initial-data" type="application/json">${JSON.stringify(comparison)}</script>`;
    window.history.replaceState({}, '', '/compare?models=deepseek-v3,gpt-4o');

    expect(startPreviewRoute(document, window.location)).toEqual({ kind: 'hydrated', routeId: 'compare' });
    expect(document.querySelector('[data-server-compare]')).toBeInTheDocument();
    expect(createRootMock).not.toHaveBeenCalled();
    const hydrated = renderToStaticMarkup(hydrateRootMock.mock.calls[0]?.[1] as ReactNode);
    expect(hydrated).toContain('GPT-4o vs DeepSeek V3');
    expect(hydrated).toContain('Exact capability comparison');
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('does not mount an unmatched route', () => {
    window.history.replaceState({}, '', '/leaderboards/llm/coding/');

    expect(startPreviewRoute(document, window.location)).toEqual({ kind: 'unmatched' });
    expect(document.getElementById('root')).toHaveTextContent('Server fallback');
    expect(hydrateRootMock).not.toHaveBeenCalled();
    expect(createRootMock).not.toHaveBeenCalled();
  });

  it('hydrates a comparison detail with its existing SSR component and validated manifest payload', () => {
    document.body.innerHTML = '<div id="root"><article data-server-comparison>Server comparison</article></div><script id="comparison-initial-data" type="application/json">{"revision":"comparison-r1"}</script>';
    window.history.replaceState({}, '', '/compare/model-a-vs-model-b/');
    parseComparisonViewModelMock.mockReturnValue({ revision: 'comparison-r1' });

    expect(startPreviewRoute(document, window.location)).toEqual({ kind: 'hydrated', routeId: 'comparison-detail' });
    expect(parseComparisonViewModelMock).toHaveBeenCalledWith({ revision: 'comparison-r1' });
    expect(document.querySelector('[data-server-comparison]')).toBeInTheDocument();
    expect(createRootMock).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(hydrateRootMock.mock.calls[0]?.[1] as ReactNode)).toContain('data-comparison-detail-app');
  });

  it('preserves comparison SSR HTML when its embedded payload is malformed', () => {
    document.body.innerHTML = '<div id="root"><article data-server-comparison>Server comparison</article></div><script id="comparison-initial-data" type="application/json">not-json</script>';
    window.history.replaceState({}, '', '/compare/model-a-vs-model-b/');

    expect(startPreviewRoute(document, window.location)).toEqual({ kind: 'preserved-invalid-payload', routeId: 'comparison-detail' });
    expect(document.querySelector('[data-server-comparison]')).toBeInTheDocument();
    expect(hydrateRootMock).not.toHaveBeenCalled();
    expect(createRootMock).not.toHaveBeenCalled();
  });

  it('hydrates a model profile with its existing SSR component and validated manifest payload', () => {
    document.body.innerHTML = '<div id="root"><article data-server-profile>Server profile</article></div><script id="model-profile-initial-data" type="application/json">{"revision":"profile-r1"}</script>';
    window.history.replaceState({}, '', '/models/gpt-5-6-sol/');
    parseModelProfileViewModelMock.mockReturnValue({ revision: 'profile-r1' });

    expect(startPreviewRoute(document, window.location)).toEqual({ kind: 'hydrated', routeId: 'model-profile-detail' });
    expect(parseModelProfileViewModelMock).toHaveBeenCalledWith({ revision: 'profile-r1' });
    expect(document.querySelector('[data-server-profile]')).toBeInTheDocument();
    expect(createRootMock).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(hydrateRootMock.mock.calls[0]?.[1] as ReactNode)).toContain('data-model-profile-app');
  });

  it('preserves model profile SSR HTML when its embedded payload is malformed', () => {
    document.body.innerHTML = '<div id="root"><article data-server-profile>Server profile</article></div><script id="model-profile-initial-data" type="application/json">not-json</script>';
    window.history.replaceState({}, '', '/models/gpt-5-6-sol/');

    expect(startPreviewRoute(document, window.location)).toEqual({ kind: 'preserved-invalid-payload', routeId: 'model-profile-detail' });
    expect(document.querySelector('[data-server-profile]')).toBeInTheDocument();
    expect(hydrateRootMock).not.toHaveBeenCalled();
    expect(createRootMock).not.toHaveBeenCalled();
  });

  it('mounts the static unavailable price-performance document without fetching a live projection', () => {
    document.body.innerHTML = '<div id="root"><main data-server-price-performance>Server price-performance</main></div><script id="price-performance-initial-data" type="application/json">{"revision":"price-r1"}</script>';
    window.history.replaceState({}, '', '/llm-price-performance/?lane=coding');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    expect(startPreviewRoute(document, window.location)).toEqual({ kind: 'mounted', routeId: 'llm-price-performance' });
    expect(document.getElementById('root')).toBeEmptyDOMElement();
    expect(createRootMock).toHaveBeenCalledWith(document.getElementById('root'));
    expect(renderToStaticMarkup(rootRenderer.mock.calls[0]?.[0] as ReactNode)).toContain('data-price-performance-unavailable');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('retains the standalone transactional confirmation route', () => {
    document.body.innerHTML = '<div id="root"><main>Confirmation fallback</main></div>';
    window.history.replaceState({}, '', '/newsletter/confirmed/');

    expect(startPreviewRoute(document, window.location)).toEqual({ kind: 'unmatched' });
    expect(createRootMock).toHaveBeenCalledWith(document.getElementById('root'));
    expect(renderToStaticMarkup(rootRenderer.mock.calls[0]?.[0] as ReactNode)).toContain('Your subscription is confirmed.');
  });

  it('retains legacy redirects without adding a fallback SPA router', () => {
    const replace = vi.fn();
    const legacyLocation = {
      href: 'https://tokenbench.test/leaderboard/',
      pathname: '/leaderboard/',
      replace,
    } as unknown as Location;

    expect(startPreviewRoute(document, legacyLocation)).toEqual({ kind: 'unmatched' });
    expect(replace).toHaveBeenCalledWith('/leaderboards/');
    expect(createRootMock).not.toHaveBeenCalled();
  });
});
