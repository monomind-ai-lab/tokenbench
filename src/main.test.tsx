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
vi.mock('./App.tsx', () => ({ default: () => 'Cost experience', ComparisonDetailApp: () => null, ModelProfileApp: () => null, PricePerformanceRoute: () => null }));
vi.mock('./GuidesApp.tsx', () => ({ default: () => window.location.pathname === '/articles/insights/' ? 'Insights experience' : 'Articles experience' }));
vi.mock('./pages/models-page', () => ({ ModelsApp: () => null }));
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
    window.history.replaceState({}, '', '/leaderboards/coding/');
  });

  it('replaces the crawlable leaderboard shell before mounting the interactive app', async () => {
    await import('./main.tsx');

    const root = document.getElementById('root')!;
    expect(root).toBeEmptyDOMElement();
    expect(createRootMock).toHaveBeenCalledWith(root);
    expect(rootRenderer).toHaveBeenCalledTimes(1);
  });

  it('mounts the recovery app for an unmatched startup route', async () => {
    window.history.replaceState({}, '', '/not-a-published-route/');

    await import('./main.tsx');

    expect(createRootMock).toHaveBeenCalledWith(document.getElementById('root'));
    expect(rootRenderer).toHaveBeenCalledTimes(1);
    expect(renderToStaticMarkup((rootRenderer.mock.calls[0] ?? [null])[0] as ReactNode)).toContain('Cost experience');
  });

  it.each(['/privacy/', '/welcome/'])('leaves the published static page intact at %s', async (pathname) => {
    window.history.replaceState({}, '', pathname);
    document.body.innerHTML = '<div id="root"><main data-static-page>Published static content</main></div>';

    await import('./main.tsx');

    expect(document.querySelector('[data-static-page]')).toBeInTheDocument();
    expect(createRootMock).not.toHaveBeenCalled();
    expect(hydrateRootMock).not.toHaveBeenCalled();
  });

  it('hydrates a comparison detail from its validated server payload without refetching or clearing HTML', async () => {
    document.body.innerHTML = '<div id="root"><article data-server-detail>Server comparison</article></div><script id="comparison-initial-data" type="application/json">{"revision":"published-r1"}</script>';
    window.history.replaceState({}, '', '/models/compare/model-a-vs-model-b/');
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

  it('mounts the canonical comparison interim route when no server payload exists', async () => {
    window.history.replaceState({}, '', '/models/compare/model-a-vs-model-b/');

    await import('./main.tsx');

    const root = document.getElementById('root')!;
    expect(root).toBeEmptyDOMElement();
    expect(createRootMock).toHaveBeenCalledWith(root);
    expect(rootRenderer).toHaveBeenCalledTimes(1);
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
    window.history.replaceState({}, '', '/models/compare/model-a-vs-model-b/');

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

  it('mounts the standalone confirmation page without an application shell', async () => {
    window.history.replaceState({}, '', '/newsletter/confirmed/');
    document.body.innerHTML = '<div id="root"><div class="transactional-page-shell">Crawlable confirmation</div></div>';

    await import('./main.tsx');

    const root = document.getElementById('root')!;
    expect(root).not.toBeEmptyDOMElement();
    expect(createRootMock).toHaveBeenCalledWith(root);
    expect(createRootMock).toHaveBeenCalledTimes(1);

    const rendered = (rootRenderer.mock.calls[0] ?? [null])[0] as ReactNode;
    const markup = renderToStaticMarkup(rendered);
    expect(markup).toContain('Your subscription is confirmed.');
    expect(markup).toContain('Start Exploring');
    expect(markup).not.toMatch(/app-shell|top-header|app-footer/);
  });

  it('mounts the interactive BenchAlign methodology page from its fixed route', async () => {
    window.history.replaceState({}, '', '/methodology/benchalign/');

    await import('./main.tsx');

    expect(createRootMock).toHaveBeenCalledWith(document.getElementById('root'));
    expect(rootRenderer).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['/cost/', 'Cost experience'],
    ['/cost/calculator/', 'Cost experience'],
    ['/cost/breakeven/', 'Cost experience'],
    ['/articles/', 'Articles experience'],
    ['/articles/insights/', 'Insights experience'],
    ['/models/lifecycle/', 'Loading validated lifecycle records.'],
  ])('mounts the intended experience at %s', async (pathname, expectedExperience) => {
      window.history.replaceState({}, '', pathname);

      await import('./main.tsx');

      expect(createRootMock).toHaveBeenCalledWith(document.getElementById('root'));
      expect(rootRenderer).toHaveBeenCalledTimes(1);
      const rendered = (rootRenderer.mock.calls[0] ?? [null])[0] as ReactNode;
      expect(renderToStaticMarkup(rendered)).toContain(expectedExperience);
    });

  it.each([
    ['/cost/calculator/', 'cost-calculator-initial-data', '{"query":{"workload":{"conversationsPerDay":12,"messagesPerConversation":6,"inputTokensPerMessage":900,"outputTokensPerMessage":300,"activeDaysPerMonth":22},"providerId":"provider-a","planId":"provider-a:starter","modelIds":["provider-a:alpha:direct_provider"],"submitted":true},"revision":"published-r1","effectiveAt":"2026-08-14T00:00:00.000Z"}', 'calculator'],
    ['/cost/breakeven/', 'cost-breakeven-initial-data', '{"seats":10,"feePerSeat":20,"maxTokensMillions":300,"inputShare":0.75,"inputPricePerMillion":0.27,"outputPricePerMillion":1.1,"capacityTokens":null}', 'breakeven'],
  ] as const)('transfers validated %s SSR state before replacing its static cost tree', async (pathname, payloadId, payload, expectedMode) => {
    document.body.innerHTML = `<div id="root"><main data-server-cost>Server cost result</main></div><script id="${payloadId}" type="application/json">${payload}</script>`;
    window.history.replaceState({}, '', pathname);

    await import('./main.tsx');

    const root = document.getElementById('root')!;
    expect(root).toBeEmptyDOMElement();
    expect(createRootMock).toHaveBeenCalledWith(root);
    const strictMode = (rootRenderer.mock.calls[0] ?? [null])[0] as { readonly props: { readonly children: { readonly props: { readonly initialCostState?: { readonly mode?: string } } } } };
    expect(strictMode.props.children.props.initialCostState?.mode).toBe(expectedMode);
  });

  it('preserves the server cost result when its serialized scenario is malformed', async () => {
    document.body.innerHTML = '<div id="root"><main data-server-cost>Server cost result</main></div><script id="cost-breakeven-initial-data" type="application/json">{"seats":"bad"}</script>';
    window.history.replaceState({}, '', '/cost/breakeven/');

    await import('./main.tsx');

    expect(document.querySelector('[data-server-cost]')).toBeInTheDocument();
    expect(createRootMock).not.toHaveBeenCalled();
    expect(hydrateRootMock).not.toHaveBeenCalled();
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
