import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rootRenderer = vi.hoisted(() => vi.fn());
const createRootMock = vi.hoisted(() => vi.fn(() => ({ render: rootRenderer })));
const hydrateRootMock = vi.hoisted(() => vi.fn());
const parseComparisonViewModelMock = vi.hoisted(() => vi.fn());
const parseModelProfileViewModelMock = vi.hoisted(() => vi.fn());
const parseModelDirectoryEnvelopeMock = vi.hoisted(() => vi.fn());
const parsePricePerformanceEnvelopeMock = vi.hoisted(() => vi.fn());

vi.mock('react-dom/client', () => ({ createRoot: createRootMock, hydrateRoot: hydrateRootMock }));
vi.mock('./App.tsx', () => ({ default: () => <div data-react-app-shell />, ComparisonDetailApp: () => null, ModelProfileApp: () => null, PricePerformanceRoute: () => null }));
vi.mock('./GuidesApp.tsx', () => ({ default: () => null }));
vi.mock('./pages/models-page', () => ({ ModelsApp: () => null }));
vi.mock('./pages/popular-models-page', () => ({ PopularModelsPage: () => <div data-popular-models-workbench-page /> }));
vi.mock('./frontend/comparison-contracts', () => ({ parseComparisonViewModel: parseComparisonViewModelMock }));
vi.mock('./frontend/model-profile-contracts', () => ({ parseModelProfileViewModel: parseModelProfileViewModelMock }));
vi.mock('./frontend/model-directory-contracts', () => ({ parseModelDirectoryEnvelope: parseModelDirectoryEnvelopeMock }));
vi.mock('./benchmarks/price-performance-contracts', () => ({ parsePricePerformanceEnvelope: parsePricePerformanceEnvelopeMock }));

describe('browser entrypoint', () => {
  beforeEach(() => {
    vi.resetModules();
    createRootMock.mockClear();
    rootRenderer.mockClear();
    hydrateRootMock.mockClear();
    parseComparisonViewModelMock.mockReset();
    parseComparisonViewModelMock.mockReturnValue(null);
    parseModelProfileViewModelMock.mockReset();
    parseModelProfileViewModelMock.mockReturnValue(null);
    parseModelDirectoryEnvelopeMock.mockReset();
    parseModelDirectoryEnvelopeMock.mockReturnValue(null);
    parsePricePerformanceEnvelopeMock.mockReset();
    parsePricePerformanceEnvelopeMock.mockReturnValue(null);
    document.body.innerHTML = '<div id="root"><div class="static-page-shell">Crawlable fallback</div></div>';
    window.history.replaceState({}, '', '/leaderboards/llm/coding/');
  });

  it('replaces the crawlable leaderboard shell before mounting the interactive app', async () => {
    await import('./main.tsx');

    const root = document.getElementById('root')!;
    expect(root).toBeEmptyDOMElement();
    expect(createRootMock).toHaveBeenCalledWith(root);
    expect(rootRenderer).toHaveBeenCalledTimes(1);
  });

  it('hydrates a comparison detail from its validated server payload without refetching or clearing HTML', async () => {
    document.body.innerHTML = '<div id="root"><article data-server-detail>Server comparison</article></div><script id="comparison-initial-data" type="application/json">{"revision":"published-r1"}</script>';
    window.history.replaceState({}, '', '/compare/model-a-vs-model-b');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    parseComparisonViewModelMock.mockReturnValue({ revision: 'published-r1' });

    await import('./main.tsx');

    const root = document.getElementById('root')!;
    expect(root.querySelector('[data-server-detail]')).toBeInTheDocument();
    expect(hydrateRootMock).toHaveBeenCalledWith(root, expect.anything());
    expect(createRootMock).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('hydrates a durable model profile from validated server data without clearing the SSR evidence', async () => {
    document.body.innerHTML = '<div id="root"><article data-server-profile>Server profile</article></div><script id="model-profile-initial-data" type="application/json">{"revision":"rev-2"}</script>';
    window.history.replaceState({}, '', '/models/gpt-5-6-sol/');
    parseModelProfileViewModelMock.mockReturnValue({ revision: 'rev-2' });

    await import('./main.tsx');

    expect(parseModelProfileViewModelMock).toHaveBeenCalledWith({ revision: 'rev-2' });
    expect(hydrateRootMock).toHaveBeenCalledWith(document.getElementById('root'), expect.anything());
    expect(document.querySelector('[data-server-profile]')).toBeInTheDocument();
    expect(createRootMock).not.toHaveBeenCalled();
  });

  it('leaves comparison server HTML intact when the embedded data is malformed or invalid', async () => {
    document.body.innerHTML = '<div id="root"><article data-server-detail>Server comparison</article></div><script id="comparison-initial-data" type="application/json">not-json</script>';
    window.history.replaceState({}, '', '/compare/model-a-vs-model-b');

    await import('./main.tsx');

    const root = document.getElementById('root')!;
    expect(root.querySelector('[data-server-detail]')).toBeInTheDocument();
    expect(hydrateRootMock).not.toHaveBeenCalled();
    expect(createRootMock).not.toHaveBeenCalled();
  });

  it('replaces the crawlable compare hub shell before mounting its interactive directory', async () => {
    window.history.replaceState({}, '', '/compare/');

    await import('./main.tsx');

    const root = document.getElementById('root')!;
    expect(root).toBeEmptyDOMElement();
    expect(createRootMock).toHaveBeenCalledWith(root);
  });

  it('replaces the crawlable Popular Models shell before mounting the interactive workbench', async () => {
    window.history.replaceState({}, '', '/popular-models/');

    await import('./main.tsx');

    const root = document.getElementById('root')!;
    expect(root).toBeEmptyDOMElement();
    expect(createRootMock).toHaveBeenCalledWith(root);
    expect(rootRenderer).toHaveBeenCalledTimes(1);
  });

  it('mounts Popular Models into the prototype chrome instead of replacing it with the React app shell', async () => {
    document.body.innerHTML = '<header class="topbar"></header><main class="shell page"><div id="root" data-popular-models-workbench><section><h1>Popular models leaderboard</h1></section></div></main><footer class="articles-footer"></footer>';
    window.history.replaceState({}, '', '/popular-models/');

    await import('./main.tsx');

    const root = document.getElementById('root')!;
    expect(root).toBeEmptyDOMElement();
    expect(createRootMock).toHaveBeenCalledWith(root);
    expect(document.querySelector('.topbar')).toBeInTheDocument();
    expect(document.querySelector('.articles-footer')).toBeInTheDocument();
    const mounted = renderToStaticMarkup(rootRenderer.mock.calls[0]?.[0] as ReactNode);
    expect(mounted).toContain('data-popular-models-workbench-page');
    expect(mounted).not.toContain('data-react-app-shell');
  });

  it('mounts the standalone confirmation page without an application shell', async () => {
    window.history.replaceState({}, '', '/newsletter/confirmed/');
    document.body.innerHTML = '<div id="root"><div class="transactional-page-shell">Crawlable confirmation</div></div>';

    await import('./main.tsx');

    const root = document.getElementById('root')!;
    expect(root).not.toBeEmptyDOMElement();
    expect(createRootMock).toHaveBeenCalledWith(root);
    expect(createRootMock).toHaveBeenCalledTimes(1);

    const rendered = (rootRenderer.mock.calls[0] ?? [null])[0] as ReactNode; // mock captures the element main.tsx renders
    const markup = renderToStaticMarkup(rendered);
    expect(markup).toContain('Your subscription is confirmed.');
    expect(markup).toContain('Start Exploring');
    expect(markup).not.toMatch(/app-shell|top-header|app-footer/);
  });

  it('hydrates the models directory from its validated server payload without refetching', async () => {
    document.body.innerHTML = '<div id="root"><main data-server-models>Popular models</main></div><script id="models-initial-data" type="application/json">{"revision":"benchlm-r1"}</script>';
    window.history.replaceState({}, '', '/models/');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    parseModelDirectoryEnvelopeMock.mockReturnValue({ revision: 'benchlm-r1' });

    await import('./main.tsx');

    const root = document.getElementById('root')!;
    expect(root.querySelector('[data-server-models]')).toBeInTheDocument();
    expect(hydrateRootMock).toHaveBeenCalledWith(root, expect.anything());
    expect(createRootMock).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('leaves models server HTML intact when hydration data is malformed', async () => {
    document.body.innerHTML = '<div id="root"><main data-server-models>Popular models</main></div><script id="models-initial-data" type="application/json">not-json</script>';
    window.history.replaceState({}, '', '/models/');

    await import('./main.tsx');

    const root = document.getElementById('root')!;
    expect(root.querySelector('[data-server-models]')).toBeInTheDocument();
    expect(hydrateRootMock).not.toHaveBeenCalled();
    expect(createRootMock).not.toHaveBeenCalled();
  });

  it('hydrates price-performance evidence only after strict payload validation', async () => {
    document.body.innerHTML = '<div id="root"><main data-server-price-performance>LLM price vs performance</main></div><script id="price-performance-initial-data" type="application/json">{"revision":"price-r1"}</script>';
    window.history.replaceState({}, '', '/llm-price-performance/?lane=coding');
    parsePricePerformanceEnvelopeMock.mockReturnValue({ revision: 'price-r1' });

    await import('./main.tsx');

    const root = document.getElementById('root')!;
    expect(parsePricePerformanceEnvelopeMock).toHaveBeenCalledWith({ revision: 'price-r1' });
    expect(root.querySelector('[data-server-price-performance]')).toBeInTheDocument();
    expect(hydrateRootMock).toHaveBeenCalledWith(root, expect.anything());
    expect(createRootMock).not.toHaveBeenCalled();
  });

  it('preserves price-performance server HTML when the embedded payload is malformed', async () => {
    document.body.innerHTML = '<div id="root"><main data-server-price-performance>Last valid projection</main></div><script id="price-performance-initial-data" type="application/json">not-json</script>';
    window.history.replaceState({}, '', '/llm-price-performance/');

    await import('./main.tsx');

    expect(document.querySelector('[data-server-price-performance]')).toBeInTheDocument();
    expect(hydrateRootMock).not.toHaveBeenCalled();
    expect(createRootMock).not.toHaveBeenCalled();
  });

  it('client-mounts the explorer when a static shell has no hydration payload', async () => {
    document.body.innerHTML = '<div id="root"><main>Static fallback</main></div>';
    window.history.replaceState({}, '', '/llm-price-performance/');

    await import('./main.tsx');

    const root = document.getElementById('root')!;
    expect(root).toBeEmptyDOMElement();
    expect(createRootMock).toHaveBeenCalledWith(root);
    expect(rootRenderer).toHaveBeenCalledTimes(1);
  });

});
