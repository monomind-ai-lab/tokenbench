import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DecisionPickEntry } from '../benchmarks/decision-picks';
import type { BenchmarkApiEnvelope, BenchmarkSummaryData } from '../frontend/use-benchmarks';
import { LeaderboardDirectoryPage, LeaderboardPage } from './leaderboards-page';

const UPDATED_AT = '2026-08-05T12:00:00.000Z';

const decisionCategories = [
  { key: 'llm-overall', label: 'BenchAlign leaders', status: 'benchalign', title: 'BenchAlign', routePath: '/leaderboards/llm/overall/' },
  { key: 'llm-agentic', label: 'Agentic BenchAlign leaders', status: 'benchalign', title: 'Agent', routePath: '/leaderboards/llm/agentic/' },
  { key: 'llm-coding', label: 'Coding BenchAlign leaders', status: 'benchalign', title: 'Coding', routePath: '/leaderboards/llm/coding/' },
  { key: 'llm-reasoning', label: 'Reasoning evidence lens', status: 'evidence-lens', title: 'Reasoning', routePath: '/leaderboards/llm/reasoning/' },
  { key: 'multimodal-vision-documents', label: 'Vision and documents evidence lens', status: 'evidence-lens', title: 'Multimodal', routePath: '/leaderboards/multimodal/vision-documents/' },
  { key: 'llm-knowledge', label: 'Knowledge evidence lens', status: 'evidence-lens', title: 'Knowledge', routePath: '/leaderboards/llm/knowledge/' },
] as const;

function decisionPick(category: typeof decisionCategories[number], rank: number): DecisionPickEntry {
  return {
    rank,
    modelKey: `${category.key}-model-${rank}`,
    slug: `${category.key}-model-${rank}`,
    name: `${category.title} Model ${rank}`,
    provider: 'OpenAI',
    score: 91 - rank,
    unit: 'score',
    evidenceStatus: 'supported',
    updatedAt: UPDATED_AT,
    routePath: category.routePath,
    representativePriceUsdPerMillion: 3,
    contextWindowTokens: 128_000,
  };
}

function decisionSummaryEnvelope(): BenchmarkApiEnvelope<BenchmarkSummaryData> {
  const overall = decisionPick(decisionCategories[0], 1);
  return {
    revision: 'published-r1',
    publishedAt: UPDATED_AT,
    freshness: { status: 'fresh', checkedAt: UPDATED_AT },
    attribution: [
      { sourceId: 'benchlm', label: 'Data from BenchLM.ai', url: 'https://benchlm.ai/data', updatedAt: UPDATED_AT },
      { sourceId: 'openrouter', label: 'Catalog and pricing data from OpenRouter', url: 'https://openrouter.ai/models', updatedAt: UPDATED_AT },
    ],
    data: {
      decisionPicks: decisionCategories.map((category) => ({
        key: category.key,
        label: category.label,
        status: category.status,
        entries: [1, 2, 3].map((rank) => decisionPick(category, rank)),
      })),
      homeDecisionSnapshot: {
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
            representativePriceUsdPerMillion: 3,
            contextWindowTokens: 128_000,
            routePath: '/leaderboards/llm/pricing-context/',
          },
          updatedAt: UPDATED_AT,
        },
        pricePerformancePoints: [{
          ...overall,
          routePath: '/leaderboards/llm/overall/',
        }],
      },
    },
  };
}

function respondWithSummary(payload = decisionSummaryEnvelope()) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('LeaderboardDirectoryPage', () => {
  it('shows decision-ready top-three groups before the full directory', async () => {
    const fetchMock = respondWithSummary();

    render(<LeaderboardDirectoryPage />);

    expect(screen.getByRole('heading', { name: 'Model leaderboards', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Explore current model leaders by capability, workload, cost, and human preference.')).toBeInTheDocument();

    const picks = await screen.findByRole('region', { name: 'Decision-ready picks' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/benchmarks');
    expect(within(picks).getByRole('heading', { name: 'BenchAlign' })).toBeInTheDocument();
    expect(within(picks).getByRole('heading', { name: 'Knowledge' })).toBeInTheDocument();

    const benchAlignCard = within(picks).getByRole('region', { name: 'BenchAlign leaders' });
    expect(within(benchAlignCard).getByText('BenchAlign ranking')).toBeInTheDocument();

    const reasoningCard = within(picks).getByRole('region', { name: 'Reasoning leaders' });
    expect(within(reasoningCard).getByText('Evidence lens — not a BenchAlign ranking')).toBeInTheDocument();

    const codingCard = within(picks).getByRole('region', { name: 'Coding leaders' });
    expect(within(codingCard).getAllByText(/Rank [1-3]/)).toHaveLength(3);
    expect(within(codingCard).getAllByText('OpenAI')).toHaveLength(3);
    expect(within(codingCard).getAllByText(/score$/)).toHaveLength(3);
    expect(within(codingCard).getAllByText('Supported evidence')).toHaveLength(3);
    expect(within(codingCard).getAllByText(/Updated /)).toHaveLength(3);
    expect(codingCard.querySelectorAll('.provider-mark')).toHaveLength(3);
    expect(within(codingCard).getByRole('link', { name: 'View full Coding benchmark' })).toHaveAttribute('href', '/leaderboards/llm/coding/');
    expect(screen.getByRole('link', { name: 'How BenchAlign rankings work' })).toHaveAttribute('href', '/methodology/benchalign/');
    expect(document.querySelector('.leaderboard-cover-image')).toBeNull();
  });

  it('keeps stale supported picks visible beside a clear freshness warning', async () => {
    const payload = decisionSummaryEnvelope();
    respondWithSummary({
      ...payload,
      freshness: { status: 'stale', checkedAt: UPDATED_AT, message: 'Refresh overdue.' },
    });

    render(<LeaderboardDirectoryPage />);

    const codingCard = await screen.findByRole('region', { name: 'Coding leaders' });
    expect(await screen.findByRole('status')).toHaveTextContent('Stale benchmark data');
    expect(within(codingCard).getAllByText(/Rank [1-3]/)).toHaveLength(3);
    expect(within(codingCard).getAllByText(/Updated /)).toHaveLength(3);
    const updateTimes = Array.from(codingCard.querySelectorAll('time'));
    expect(updateTimes).toHaveLength(3);
    expect(updateTimes.every((time) => time.getAttribute('datetime') === UPDATED_AT)).toBe(true);
  });

  it('makes a category with no supported entries explicitly empty', async () => {
    const payload = decisionSummaryEnvelope();
    respondWithSummary({
      ...payload,
      data: {
        ...payload.data,
        decisionPicks: payload.data.decisionPicks.map((group) => group.key === 'llm-coding'
          ? { ...group, entries: [] }
          : group),
      },
    });

    render(<LeaderboardDirectoryPage />);

    const codingCard = await screen.findByRole('region', { name: 'Coding leaders' });
    expect(within(codingCard).getByText('No supported ranking is published.')).toBeInTheDocument();
    expect(within(codingCard).queryByText(/Rank [1-3]/)).not.toBeInTheDocument();
    expect(within(codingCard).getByRole('link', { name: 'View full Coding benchmark' })).toHaveAttribute('href', '/leaderboards/llm/coding/');
  });

  it('shows a loading placeholder before the summary resolves', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));

    render(<LeaderboardDirectoryPage />);

    expect(screen.getByLabelText('Loading decision-ready picks')).toHaveAttribute('aria-busy', 'true');
  });
});

describe('LeaderboardPage', () => {
  it('builds a normal Download CSV link from the current shared filter state', () => {
    window.history.replaceState(null, '', '/leaderboards/llm/coding/?q=Alpha&provider=Provider%20A&sort=score-desc');
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));

    render(<LeaderboardPage keyName="llm-coding" />);

    const actions = screen.getByRole('group', { name: 'Leaderboard actions' });
    expect(within(actions).getByRole('link', { name: 'Download CSV' })).toHaveAttribute(
      'href',
      '/api/benchmarks/leaderboards/llm-coding/csv?profile=balanced&sort=score-desc&q=Alpha&provider=Provider+A',
    );
  });
});
