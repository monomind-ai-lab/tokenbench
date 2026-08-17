import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rootRenderer = vi.hoisted(() => vi.fn());
const createRootMock = vi.hoisted(() => vi.fn(() => ({ render: rootRenderer })));
const hydrateRootMock = vi.hoisted(() => vi.fn());
const parseComparisonViewModelMock = vi.hoisted(() => vi.fn());
const parseModelProfileViewModelMock = vi.hoisted(() => vi.fn());
const parsePricePerformanceEnvelopeMock = vi.hoisted(() => vi.fn());

vi.mock('react-dom/client', () => ({ createRoot: createRootMock, hydrateRoot: hydrateRootMock }));
vi.mock('../App.tsx', () => ({
  ComparisonDetailApp: ({ viewModel }: { readonly viewModel: { readonly revision: string } }) => <div data-comparison-detail-app>{viewModel.revision}</div>,
  ModelProfileApp: ({ viewModel }: { readonly viewModel: { readonly revision: string } }) => <div data-model-profile-app>{viewModel.revision}</div>,
}));
vi.mock('../pages/price-performance-page', () => ({ PricePerformanceApp: () => <div data-price-performance-app /> }));
vi.mock('../benchmarks/price-performance-contracts', () => ({ parsePricePerformanceEnvelope: parsePricePerformanceEnvelopeMock }));
vi.mock('../frontend/comparison-contracts', () => ({ parseComparisonViewModel: parseComparisonViewModelMock }));
vi.mock('../frontend/model-profile-contracts', () => ({ parseModelProfileViewModel: parseModelProfileViewModelMock }));

import { startPreviewRoute } from './client-resolver';
import { previewRoutes } from './route-manifest';

describe('startPreviewRoute', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    parseComparisonViewModelMock.mockReset();
    parseModelProfileViewModelMock.mockReset();
    parsePricePerformanceEnvelopeMock.mockReset();
    document.body.innerHTML = '<header class="topbar">Prototype header</header><main class="shell page"><div id="root" data-popular-models-workbench><section>Server fallback</section></div></main><footer class="articles-footer">Prototype footer</footer><script id="preview-initial-data" type="application/json">{"revision":"prototype-r1"}</script>';
    window.history.replaceState({}, '', '/popular-models/');
  });

  it('ignores generic outer JSON and mounts Popular Models inside its prototype workbench without adding a second shell', () => {
    const workbench = document.querySelector<HTMLElement>('[data-popular-models-workbench]')!;

    expect(previewRoutes.find((route) => route.id === 'popular-models')?.payload).toBeNull();
    expect(startPreviewRoute(document, window.location)).toEqual({ kind: 'mounted', routeId: 'popular-models' });
    expect(document.querySelectorAll('.topbar')).toHaveLength(1);
    expect(document.querySelectorAll('.articles-footer')).toHaveLength(1);
    expect(workbench).toBeEmptyDOMElement();
    expect(createRootMock).toHaveBeenCalledWith(workbench);
    expect(hydrateRootMock).not.toHaveBeenCalled();
    const mounted = renderToStaticMarkup(rootRenderer.mock.calls[0]?.[0] as ReactNode);
    expect(mounted).toContain('popular-models-page');
    expect(mounted).not.toContain('top-header');
  });

  it('does not interpret malformed generic outer JSON as a Popular Models hydration payload', () => {
    const payload = document.getElementById('preview-initial-data')!;
    payload.textContent = '{bad json';
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    expect(startPreviewRoute(document, window.location)).toEqual({ kind: 'mounted', routeId: 'popular-models' });
    expect(document.querySelector('[data-popular-models-workbench]')).toBeEmptyDOMElement();
    expect(hydrateRootMock).not.toHaveBeenCalled();
    expect(createRootMock).toHaveBeenCalledWith(document.querySelector('[data-popular-models-workbench]'));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('mounts a declared client-load route when no embedded payload exists', () => {
    document.getElementById('preview-initial-data')?.remove();
    const workbench = document.querySelector<HTMLElement>('[data-popular-models-workbench]')!;

    expect(startPreviewRoute(document, window.location)).toEqual({ kind: 'mounted', routeId: 'popular-models' });
    expect(workbench).toBeEmptyDOMElement();
    expect(createRootMock).toHaveBeenCalledWith(workbench);
    expect(rootRenderer).toHaveBeenCalledTimes(1);
  });

  it('mounts Popular Models from its workbench target without requiring a root ID', () => {
    document.body.innerHTML = '<header class="topbar">Prototype header</header><main class="shell page"><div data-popular-models-workbench><section>Server fallback</section></div></main><footer class="articles-footer">Prototype footer</footer>';
    const workbench = document.querySelector<HTMLElement>('[data-popular-models-workbench]')!;

    expect(startPreviewRoute(document, window.location)).toEqual({ kind: 'mounted', routeId: 'popular-models' });
    expect(workbench).toBeEmptyDOMElement();
    expect(createRootMock).toHaveBeenCalledWith(workbench);
  });

  it('preserves other prototype routes when their hydration payload is missing', () => {
    document.body.innerHTML = '<div id="root"><main data-server-models>Server models</main></div>';
    window.history.replaceState({}, '', '/models/');

    expect(startPreviewRoute(document, window.location)).toEqual({ kind: 'unmatched' });
    expect(document.querySelector('[data-server-models]')).toBeInTheDocument();
    expect(hydrateRootMock).not.toHaveBeenCalled();
    expect(createRootMock).not.toHaveBeenCalled();
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

  it('hydrates price-performance SSR evidence with its validated manifest payload', () => {
    document.body.innerHTML = '<div id="root"><main data-server-price-performance>Server price-performance</main></div><script id="price-performance-initial-data" type="application/json">{"revision":"price-r1"}</script>';
    window.history.replaceState({}, '', '/llm-price-performance/?lane=coding');
    parsePricePerformanceEnvelopeMock.mockReturnValue({ revision: 'price-r1' });

    expect(startPreviewRoute(document, window.location)).toEqual({ kind: 'hydrated', routeId: 'llm-price-performance' });
    expect(parsePricePerformanceEnvelopeMock).toHaveBeenCalledWith({ revision: 'price-r1' });
    expect(document.querySelector('[data-server-price-performance]')).toBeInTheDocument();
    expect(createRootMock).not.toHaveBeenCalled();
  });

  it('preserves price-performance SSR evidence when its embedded payload is malformed', () => {
    document.body.innerHTML = '<div id="root"><main data-server-price-performance>Server price-performance</main></div><script id="price-performance-initial-data" type="application/json">not-json</script>';
    window.history.replaceState({}, '', '/llm-price-performance/');

    expect(startPreviewRoute(document, window.location)).toEqual({ kind: 'preserved-invalid-payload', routeId: 'llm-price-performance' });
    expect(document.querySelector('[data-server-price-performance]')).toBeInTheDocument();
    expect(hydrateRootMock).not.toHaveBeenCalled();
    expect(createRootMock).not.toHaveBeenCalled();
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
