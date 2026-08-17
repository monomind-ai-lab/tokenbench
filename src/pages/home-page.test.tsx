import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  DecisionPickEntry,
  DecisionPickGroup,
  HomeDecisionSnapshot,
} from '../benchmarks/decision-picks';
import type { RepresentativeComparison } from '../benchmarks/api-projections';
import type { BenchmarkApiEnvelope, BenchmarkSummaryData } from '../frontend/use-benchmarks';
import { benchmarkCacheKey, writeBenchmarkEnvelopeCache } from '../frontend/benchmark-cache';
import { HomePage } from './home-page';

const UPDATED_AT = '2026-08-06T12:00:00.000Z';

const REPRESENTATIVE_COMPARISONS: readonly RepresentativeComparison[] = [
  {
    pairSlug: 'claude-opus-5-vs-gpt-5-6-sol',
    modelASlug: 'claude-opus-5', modelBSlug: 'gpt-5-6-sol',
    modelAName: 'Claude Opus 5', modelBName: 'GPT-5.6 Sol', sharedMetricCount: 4,
    sharedMetrics: [
      { metricKey: 'benchlm:category:coding', category: 'coding', unit: 'score', modelAValue: 88, modelBValue: 92, gap: 4, leaderSlug: 'gpt-5-6-sol' },
      { metricKey: 'benchlm:category:agentic', category: 'agentic', unit: 'score', modelAValue: 89, modelBValue: 91, gap: 2, leaderSlug: 'gpt-5-6-sol' },
      { metricKey: 'benchlm:category:reasoning', category: 'reasoning', unit: 'score', modelAValue: 90, modelBValue: 89, gap: 1, leaderSlug: 'claude-opus-5' },
      { metricKey: 'benchlm:category:knowledge', category: 'knowledge', unit: 'score', modelAValue: 88, modelBValue: 88, gap: 0, leaderSlug: null },
    ],
    modelAPriceUsdPerMillion: 15, modelBPriceUsdPerMillion: 10,
    modelAContextWindowTokens: 200_000, modelBContextWindowTokens: 400_000,
  },
  {
    pairSlug: 'gpt-5-6-sol-vs-kimi-3',
    modelASlug: 'gpt-5-6-sol', modelBSlug: 'kimi-3',
    modelAName: 'GPT-5.6 Sol', modelBName: 'Kimi 3', sharedMetricCount: 4,
    sharedMetrics: [
      { metricKey: 'benchlm:category:agentic', category: 'agentic', unit: 'score', modelAValue: 90, modelBValue: 90, gap: 0, leaderSlug: null },
      { metricKey: 'benchlm:category:coding', category: 'coding', unit: 'score', modelAValue: 91, modelBValue: 89, gap: 2, leaderSlug: 'gpt-5-6-sol' },
      { metricKey: 'benchlm:category:reasoning', category: 'reasoning', unit: 'score', modelAValue: 88, modelBValue: 87, gap: 1, leaderSlug: 'gpt-5-6-sol' },
      { metricKey: 'benchlm:category:knowledge', category: 'knowledge', unit: 'score', modelAValue: 86, modelBValue: 86, gap: 0, leaderSlug: null },
    ],
    modelAPriceUsdPerMillion: null, modelBPriceUsdPerMillion: null,
    modelAContextWindowTokens: 400_000, modelBContextWindowTokens: 256_000,
  },
];

const EMPTY_DECISION_PICK_GROUPS: readonly DecisionPickGroup[] = [
  { key: 'llm-overall', label: 'BenchAlign leaders', status: 'benchalign', entries: [] },
  { key: 'llm-agentic', label: 'Agentic BenchAlign leaders', status: 'benchalign', entries: [] },
  { key: 'llm-coding', label: 'Coding BenchAlign leaders', status: 'benchalign', entries: [] },
  { key: 'llm-reasoning', label: 'Reasoning evidence lens', status: 'evidence-lens', entries: [] },
  { key: 'multimodal-vision-documents', label: 'Vision and documents evidence lens', status: 'evidence-lens', entries: [] },
  { key: 'llm-knowledge', label: 'Knowledge evidence lens', status: 'evidence-lens', entries: [] },
];

function leaderFor(routePath: string, name: string, score: number): DecisionPickEntry {
  return supportedOverallLeader({ modelKey: `openai:${name}`, slug: name, name, score, routePath });
}

const DECISION_PICK_GROUPS: readonly DecisionPickGroup[] = [
  { key: 'llm-overall', label: 'BenchAlign leaders', status: 'benchalign', entries: [leaderFor('/leaderboards/llm/overall/', 'Model Alpha', 92), leaderFor('/leaderboards/llm/overall/', 'Model Beta', 90), leaderFor('/leaderboards/llm/overall/', 'Model Gamma', 88)] },
  { key: 'llm-agentic', label: 'Agentic BenchAlign leaders', status: 'benchalign', entries: [leaderFor('/leaderboards/llm/agentic/', 'Model Agentic', 88), leaderFor('/leaderboards/llm/agentic/', 'Model Agentic B', 86), leaderFor('/leaderboards/llm/agentic/', 'Model Agentic C', 84)] },
  { key: 'llm-coding', label: 'Coding BenchAlign leaders', status: 'benchalign', entries: [leaderFor('/leaderboards/llm/coding/', 'Model Coding', 84), leaderFor('/leaderboards/llm/coding/', 'Model Coding B', 82), leaderFor('/leaderboards/llm/coding/', 'Model Coding C', 80)] },
  { key: 'llm-reasoning', label: 'Reasoning evidence lens', status: 'evidence-lens', entries: [leaderFor('/leaderboards/llm/reasoning/', 'Model Reasoning', 80)] },
  { key: 'multimodal-vision-documents', label: 'Vision and documents evidence lens', status: 'evidence-lens', entries: [leaderFor('/leaderboards/multimodal/vision-documents/', 'Model Multimodal', 77)] },
  { key: 'llm-knowledge', label: 'Knowledge evidence lens', status: 'evidence-lens', entries: [leaderFor('/leaderboards/llm/knowledge/', 'Model Knowledge', 75)] },
];

function supportedOverallLeader(overrides: Partial<DecisionPickEntry> = {}): DecisionPickEntry {
  return {
    rank: 1,
    modelKey: 'openai:model-alpha',
    slug: 'model-alpha',
    name: 'Model Alpha',
    provider: 'openai',
    score: 92,
    unit: 'score',
    evidenceStatus: 'supported',
    updatedAt: UPDATED_AT,
    routePath: '/leaderboards/llm/overall/',
    representativePriceUsdPerMillion: 2.5,
    contextWindowTokens: 128_000,
    ...overrides,
  };
}

function readyHomeSnapshot(): HomeDecisionSnapshot {
  const overall = supportedOverallLeader();
  return {
    benchAlignLeader: { status: 'ready', value: overall, updatedAt: UPDATED_AT },
    valueFrontierLeader: {
      status: 'ready',
      value: { ...overall, routePath: '/leaderboards/llm/value/' },
      updatedAt: UPDATED_AT,
    },
    lowestVerifiedRepresentativeRate: {
      status: 'ready',
      value: {
        modelKey: overall.modelKey,
        slug: overall.slug,
        name: overall.name,
        provider: overall.provider,
        evidenceStatus: 'supported',
        representativePriceUsdPerMillion: 2.5,
        contextWindowTokens: 128_000,
        routePath: '/leaderboards/llm/pricing-context/',
      },
      updatedAt: UPDATED_AT,
    },
    pricePerformancePoints: [{ ...overall, routePath: '/leaderboards/llm/overall/' }],
  };
}

function unavailableHomeSnapshot(): HomeDecisionSnapshot {
  return {
    benchAlignLeader: { status: 'unavailable' },
    valueFrontierLeader: { status: 'unavailable' },
    lowestVerifiedRepresentativeRate: { status: 'unavailable' },
    pricePerformancePoints: [],
  };
}

function homeSummaryFixture(
  snapshot: HomeDecisionSnapshot = readyHomeSnapshot(),
  freshness: BenchmarkApiEnvelope<BenchmarkSummaryData>['freshness'] = { status: 'fresh', checkedAt: UPDATED_AT },
  decisionPicks: readonly DecisionPickGroup[] = DECISION_PICK_GROUPS,
): BenchmarkApiEnvelope<BenchmarkSummaryData> {
  return {
    revision: 'published-home-r1',
    publishedAt: UPDATED_AT,
    freshness,
    attribution: [
      { sourceId: 'benchlm', label: 'Data from BenchLM.ai', url: 'https://benchlm.ai/data', updatedAt: UPDATED_AT },
      { sourceId: 'openrouter', label: 'Catalog and pricing data from OpenRouter', url: 'https://openrouter.ai/models', updatedAt: UPDATED_AT },
    ],
    data: {
      representativeComparisons: REPRESENTATIVE_COMPARISONS,
      decisionPicks,
      homeDecisionSnapshot: snapshot,
    },
  };
}

function renderWithHomeSummary(payload = homeSummaryFixture()) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }));
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, ...render(<HomePage />) };
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('HomePage', () => {
  it('explains the product and exposes the three primary decisions', () => {
    renderWithHomeSummary();

    expect(screen.getByRole('heading', { name: 'Transparent AI Costs. Verified Benchmarks.', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('The free decision engine for your AI stack. Evaluate exact model pricing and source-backed performance data so you can choose the best LLM for your workload.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Compare models' })).toHaveAttribute('href', '/compare/');
    expect(screen.getByRole('link', { name: 'Review Your Subscriptions' })).toHaveAttribute('href', '/subscribe-vs-api/');
    expect(screen.getByRole('link', { name: 'Browse leaderboards' })).toHaveAttribute('href', '/leaderboards/');
    expect(screen.getByRole('heading', { name: 'See the market at a glance', level: 2 })).toBeInTheDocument();
    expect(screen.queryByText(/Updated /)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Should you subscribe or pay as you go?', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What TokenBench gives you', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Make the next decision with less guessing', level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Built for AI builders', level: 2 })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'MonoMind AI Lab', level: 2 })).toBeInTheDocument();
    expect(screen.queryByText('Benchmark signals')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'TokenBench decision workflow' })).not.toBeInTheDocument();
    expect(screen.getByText(/cut API bills by up to 90%\./i)).toBeInTheDocument();
  });

  it('keeps the product capabilities specific to the decision artifacts it provides', () => {
    renderWithHomeSummary();

    const capabilities = screen.getByRole('list', { name: 'TokenBench product capabilities' });

    expect(within(capabilities).getByRole('heading', { name: 'Exact route pricing' })).toBeInTheDocument();
    expect(within(capabilities).getByRole('heading', { name: 'Comparable performance evidence' })).toBeInTheDocument();
    expect(within(capabilities).getByRole('heading', { name: 'Workload calculations' })).toBeInTheDocument();
    expect(within(capabilities).getByRole('heading', { name: 'Downloads' })).toBeInTheDocument();
    expect(within(capabilities).getByRole('heading', { name: 'Shareable results' })).toBeInTheDocument();
  });

  it('renders the five decision-route leader cards from one defensible envelope', async () => {
    const { fetchMock } = renderWithHomeSummary();

    const snapshot = await screen.findByRole('region', { name: 'Market at a glance' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/benchmarks');
    expect(within(snapshot).getByRole('heading', { name: 'Overall', level: 3 })).toBeInTheDocument();
    expect(within(snapshot).getByRole('heading', { name: 'Coding', level: 3 })).toBeInTheDocument();
    expect(within(snapshot).getByRole('heading', { name: 'Agentic', level: 3 })).toBeInTheDocument();
    expect(within(snapshot).getByRole('heading', { name: 'Multimodal', level: 3 })).toBeInTheDocument();
    expect(within(snapshot).getByRole('heading', { name: 'Knowledge', level: 3 })).toBeInTheDocument();
    expect(within(snapshot).queryByRole('heading', { name: 'Reasoning', level: 3 })).not.toBeInTheDocument();
    expect(snapshot.querySelectorAll('.home-snapshot-grid:not(.home-comparison-grid) .home-snapshot-card')).toHaveLength(5);
    expect(within(snapshot).getByRole('link', { name: /Model Alpha/ })).toHaveAttribute('href', '/models/Model%20Alpha/');
    // The column context already says these are scores; the bare number is
    // enough. Units that are not self-evident (tokens) are still rendered.
    expect(within(snapshot).getByText('92')).toBeInTheDocument();
    expect(within(snapshot).queryByText('92 score')).not.toBeInTheDocument();
    expect(within(snapshot).queryByText('Source rank #1')).not.toBeInTheDocument();
    expect(within(snapshot).queryByText('Not ranked by source')).not.toBeInTheDocument();
    expect(within(snapshot).getByRole('link', { name: 'Overall' })).toHaveAttribute('href', '/leaderboards/llm/overall/');
    expect(within(snapshot).getByRole('link', { name: 'Coding' })).toHaveAttribute('href', '/leaderboards/llm/coding/');
    expect(within(snapshot).getByRole('link', { name: 'Agentic' })).toHaveAttribute('href', '/leaderboards/llm/agentic/');
    expect(within(snapshot).getByRole('link', { name: 'Multimodal' })).toHaveAttribute('href', '/leaderboards/multimodal/vision-documents/');
    expect(within(snapshot).getByRole('link', { name: 'Knowledge' })).toHaveAttribute('href', '/leaderboards/llm/knowledge/');
    expect(snapshot.querySelectorAll('.home-snapshot-leaders li')).toHaveLength(11);
    expect(within(snapshot).getByRole('link', { name: 'Explore more leaderboards' })).toHaveAttribute('href', '/leaderboards/');
    expect(screen.queryByRole('link', { name: 'How rankings work' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Compare more models' })).toHaveAttribute('href', '/compare/');
    expect(snapshot.querySelectorAll('.provider-mark')).toHaveLength(11);
  });

  it('renders exactly two representative comparison cards from the published summary', async () => {
    renderWithHomeSummary();

    expect(await screen.findByRole('heading', { name: 'Compare best models', level: 3 })).toBeInTheDocument();
    const comparisons = await screen.findByRole('list', { name: 'Representative comparisons' });
    expect(within(comparisons).getAllByRole('listitem')).toHaveLength(2);
    expect(within(comparisons).getByRole('heading', { name: 'Claude Opus 5 vs GPT-5.6 Sol' })).toBeInTheDocument();
    expect(within(comparisons).getByText('GPT-5.6 Sol leads on coding')).toBeInTheDocument();
    expect(within(comparisons).getByRole('heading', { name: 'GPT-5.6 Sol vs Kimi 3' })).toBeInTheDocument();
    expect(within(comparisons).getByText('Tied on agentic')).toBeInTheDocument();
    expect(within(comparisons).getByRole('link', { name: 'Compare Claude Opus 5 and GPT-5.6 Sol' })).toHaveAttribute('href', '/compare/claude-opus-5-vs-gpt-5-6-sol');
    expect(within(comparisons).getByRole('link', { name: 'Claude Opus 5' })).toHaveAttribute('href', '/models/claude-opus-5/');
    expect(within(comparisons).getAllByRole('link', { name: 'GPT-5.6 Sol' }).every((link) => link.getAttribute('href') === '/models/gpt-5-6-sol/')).toBe(true);
  });

  it('omits the recent data retrievals ledger after the representative comparisons', async () => {
    renderWithHomeSummary();

    const snapshot = await screen.findByRole('region', { name: 'Market at a glance' });
    const provenance = snapshot.querySelector('.home-snapshot-provenance');

    expect(provenance).toBeNull();
    expect(snapshot).not.toHaveTextContent('Checked');
    expect(snapshot).not.toHaveTextContent('Data from BenchLM.ai');
    expect(snapshot).not.toHaveTextContent('Catalog and pricing data from OpenRouter');
    expect(within(snapshot).queryByLabelText('Decision snapshot evidence')).not.toBeInTheDocument();
  });

  it('keeps loading distinct from published unavailable facts', async () => {
    let resolveResponse: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn().mockReturnValue(new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    }));
    vi.stubGlobal('fetch', fetchMock);
    render(<HomePage />);

    const snapshot = screen.getByRole('region', { name: 'Market at a glance' });

    expect(
      within(snapshot).getByText('Loading the published decision snapshot.'),
    ).toHaveAttribute('role', 'status');
    const unavailableCountWhileLoading = within(snapshot).queryAllByText('Unavailable').length;

    if (!resolveResponse) throw new Error('Expected the Home summary request to start');
    resolveResponse(new Response(JSON.stringify(homeSummaryFixture()), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    expect((await within(snapshot).findAllByText('Model Alpha')).length).toBeGreaterThan(0);
    expect(unavailableCountWhileLoading).toBe(0);
  });

  it('offers a dedicated retry state when the published snapshot cannot be transported', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<HomePage />);

    const snapshot = screen.getByRole('region', { name: 'Market at a glance' });
    const error = await within(snapshot).findByRole('alert');

    expect(error).toHaveTextContent('Published decision snapshot could not be loaded.');
    expect(error).toHaveTextContent('Benchmark request failed (500).');
    expect(within(snapshot).queryByText('Unavailable')).not.toBeInTheDocument();
    expect(snapshot.querySelectorAll('.home-snapshot-grid:not(.home-comparison-grid) .home-snapshot-card')).toHaveLength(0);

    fireEvent.click(within(error).getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(1));
  });

  it('omits structurally unsupported cards instead of labelling them unavailable', async () => {
    renderWithHomeSummary(homeSummaryFixture(unavailableHomeSnapshot(), undefined, EMPTY_DECISION_PICK_GROUPS));

    const snapshot = await screen.findByRole('region', { name: 'Market at a glance' });

    expect(within(snapshot).queryByText('Unavailable')).not.toBeInTheDocument();
    expect(snapshot.querySelectorAll('.home-snapshot-grid:not(.home-comparison-grid) .home-snapshot-card')).toHaveLength(0);
    expect(within(snapshot).getByText('No decision route has a supported leader in the active revision.')).toBeInTheDocument();
    expect(within(snapshot).queryByText(/sample|example model/i)).not.toBeInTheDocument();
    expect(snapshot.querySelectorAll('.provider-mark')).toHaveLength(0);
  });

  it('keeps the last published facts visible when the decision snapshot is stale', async () => {
    renderWithHomeSummary(homeSummaryFixture(
      readyHomeSnapshot(),
      { status: 'stale', checkedAt: UPDATED_AT, message: 'Refresh overdue.' },
    ));

    const staleNotice = await screen.findByText(/Stale published decision snapshot\./);

    expect(staleNotice).toHaveAttribute('role', 'status');
    expect(staleNotice).toHaveTextContent('Refresh overdue.');
    const snapshot = screen.getByRole('region', { name: 'Market at a glance' });
    expect(snapshot).toHaveTextContent('Model Alpha');
    expect(snapshot.querySelectorAll('.home-snapshot-grid:not(.home-comparison-grid) .home-snapshot-card')).toHaveLength(5);
  });

  it('keeps the last validated decision snapshot visible through a 503 refresh failure', async () => {
    writeBenchmarkEnvelopeCache(
      benchmarkCacheKey('/api/benchmarks'),
      homeSummaryFixture(),
      UPDATED_AT,
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: 'Benchmark data unavailable' }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    )));

    render(<HomePage />);

    const notice = await screen.findByText('Showing the last published revision while refresh is unavailable.');
    expect(notice).toHaveAttribute('role', 'status');
    const snapshot = screen.getByRole('region', { name: 'Market at a glance' });
    expect(within(snapshot).getAllByText('Model Alpha').length).toBeGreaterThan(0);
    expect(within(snapshot).queryByText(/Checked Aug 6, 2026/)).not.toBeInTheDocument();
    expect(within(snapshot).queryByText(/Source published/)).not.toBeInTheDocument();
  });
});
