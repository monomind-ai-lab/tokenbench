import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  DecisionPickEntry,
  DecisionPickGroup,
  HomeDecisionSnapshot,
} from '../benchmarks/decision-picks';
import type { BenchmarkApiEnvelope, BenchmarkSummaryData } from '../frontend/use-benchmarks';
import { HomePage } from './home-page';

const UPDATED_AT = '2026-08-06T12:00:00.000Z';

const DECISION_PICK_GROUPS: readonly DecisionPickGroup[] = [
  { key: 'llm-overall', label: 'BenchAlign leaders', status: 'benchalign', entries: [] },
  { key: 'llm-agentic', label: 'Agentic BenchAlign leaders', status: 'benchalign', entries: [] },
  { key: 'llm-coding', label: 'Coding BenchAlign leaders', status: 'benchalign', entries: [] },
  { key: 'llm-reasoning', label: 'Reasoning evidence lens', status: 'evidence-lens', entries: [] },
  { key: 'multimodal-vision-documents', label: 'Vision and documents evidence lens', status: 'evidence-lens', entries: [] },
  { key: 'llm-knowledge', label: 'Knowledge evidence lens', status: 'evidence-lens', entries: [] },
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
      decisionPicks: DECISION_PICK_GROUPS,
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

afterEach(() => vi.unstubAllGlobals());

describe('HomePage', () => {
  it('explains the product and exposes the three primary decisions', () => {
    renderWithHomeSummary();

    expect(screen.getByRole('heading', { name: 'Transparent AI Costs. Verified Benchmarks.', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('The free decision engine for your AI stack. Evaluate exact model pricing and source-backed performance data so you can choose the best LLM for your workload.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Compare models' })).toHaveAttribute('href', '/compare/');
    expect(screen.getByRole('link', { name: 'Calculate subscription vs API' })).toHaveAttribute('href', '/tools/subscriptions-vs-apis/');
    expect(screen.getByRole('link', { name: 'Browse leaderboards' })).toHaveAttribute('href', '/leaderboards/');
    expect(screen.getByRole('heading', { name: 'Make three decisions faster', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'See the market at a glance', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What TokenBench gives you', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Built for AI builders', level: 2 })).toBeInTheDocument();
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

  it('renders all four live snapshot slots from one defensible envelope', async () => {
    const { fetchMock } = renderWithHomeSummary();

    const snapshot = await screen.findByRole('region', { name: 'Live decision snapshot' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/benchmarks');
    expect(within(snapshot).getByText('BenchAlign leader')).toBeInTheDocument();
    expect(within(snapshot).getByText('Value-frontier leader')).toBeInTheDocument();
    expect(within(snapshot).getByText('Lowest verified API rate')).toBeInTheDocument();
    expect(within(snapshot).getAllByText('Model Alpha')).toHaveLength(4);
    expect(within(snapshot).getAllByText('$2.50 / 1M')).toHaveLength(2);
    expect(within(snapshot).getByText('92 score')).toBeInTheDocument();
    expect(within(snapshot).getByRole('img', { name: 'Price versus performance' })).toHaveAccessibleDescription(
      'Model Alpha: $2.50 per 1M tokens and 92 score. Higher performance and lower representative price are better.',
    );
    expect(within(snapshot).getByText(/Higher performance and lower representative price are better\./)).toBeInTheDocument();
    expect(within(snapshot).getByRole('link', { name: 'How rankings work' })).toHaveAttribute('href', '/methodology/benchalign/');
    expect(within(snapshot).queryByRole('link', { name: /Data from|Catalog and pricing/i })).not.toBeInTheDocument();
    expect(snapshot.querySelectorAll('.provider-mark')).toHaveLength(3);
  });

  it('states unavailable facts without substituting sample data', async () => {
    renderWithHomeSummary(homeSummaryFixture(unavailableHomeSnapshot()));

    const snapshot = await screen.findByRole('region', { name: 'Live decision snapshot' });

    expect(within(snapshot).getAllByText('Unavailable')).toHaveLength(4);
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
    expect(screen.getByRole('region', { name: 'Live decision snapshot' })).toHaveTextContent('Model Alpha');
  });
});
