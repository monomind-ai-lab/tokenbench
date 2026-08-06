import { beforeEach, describe, expect, it, vi } from 'vitest';

const rootRenderer = vi.hoisted(() => vi.fn());
const createRootMock = vi.hoisted(() => vi.fn(() => ({ render: rootRenderer })));
const hydrateRootMock = vi.hoisted(() => vi.fn());
const parseComparisonViewModelMock = vi.hoisted(() => vi.fn());

vi.mock('react-dom/client', () => ({ createRoot: createRootMock, hydrateRoot: hydrateRootMock }));
vi.mock('./App.tsx', () => ({ default: () => null, ComparisonDetailApp: () => null }));
vi.mock('./GuidesApp.tsx', () => ({ default: () => null }));
vi.mock('./frontend/comparison-contracts', () => ({ parseComparisonViewModel: parseComparisonViewModelMock }));

describe('browser entrypoint', () => {
  beforeEach(() => {
    vi.resetModules();
    createRootMock.mockClear();
    rootRenderer.mockClear();
    hydrateRootMock.mockClear();
    parseComparisonViewModelMock.mockReset();
    parseComparisonViewModelMock.mockReturnValue(null);
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

  it('mounts the interactive BenchAlign methodology page from its fixed route', async () => {
    window.history.replaceState({}, '', '/methodology/benchalign/');

    await import('./main.tsx');

    expect(createRootMock).toHaveBeenCalledWith(document.getElementById('root'));
    expect(rootRenderer).toHaveBeenCalledTimes(1);
  });
});
