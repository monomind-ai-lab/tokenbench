import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DecisionPickEntry } from '../benchmarks/decision-picks';
import type { LeaderboardResult } from '../benchmarks/leaderboards';
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

function codingLeaderboardEnvelope(): BenchmarkApiEnvelope<LeaderboardResult> {
  const model = {
    modelKey: 'openai:alpha',
    slug: 'alpha',
    name: 'Alpha',
    creator: 'OpenAI',
    sourceType: 'Proprietary' as const,
    reasoningType: null,
    releaseDate: null,
    contextWindowTokens: 128_000,
    evidenceStatus: 'supported' as const,
    rankingEligible: true,
    confidenceLower: null,
    confidenceUpper: null,
    benchmarkCount: 1,
    sourceId: 'benchlm' as const,
    sourceModelId: 'openai:alpha',
    sourceArtifactId: 'models',
  };
  const metric = {
    modelKey: model.modelKey,
    metricKey: 'benchlm:category:coding',
    category: 'coding',
    value: 91,
    rank: null,
    lower: null,
    upper: null,
    voteCount: null,
    unit: 'score' as const,
    sourceId: 'benchlm' as const,
    sourceUpdatedAt: UPDATED_AT,
    sourceModelId: model.modelKey,
    sourceArtifactId: 'models',
    rankingEligible: true,
    methodology: 'benchlm_raw_composite' as const,
    observationCount: null,
    sessionCount: null,
  };
  return {
    revision: 'published-r1',
    publishedAt: UPDATED_AT,
    freshness: { status: 'fresh', checkedAt: UPDATED_AT },
    attribution: [{ sourceId: 'benchlm', label: 'Data from BenchLM.ai', url: 'https://benchlm.ai/data', updatedAt: UPDATED_AT }],
    data: {
      key: 'llm-coding',
      profile: 'balanced',
      definition: {
        kind: 'benchlm',
        sourceId: 'benchlm',
        metricKeys: ['benchlm:category:coding'],
        defaultSort: 'score-desc',
      },
      entries: [{
        model,
        metric,
        metrics: [metric],
        primaryPrice: null,
        blendedCostPerMillion: null,
        contextWindowTokens: null,
        sourceRank: null,
        onValueFrontier: false,
      }],
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('LeaderboardDirectoryPage', () => {
  it('uses canonical route H1s for directory cards instead of navigation labels', () => {
    respondWithSummary();

    render(<LeaderboardDirectoryPage />);

    const directory = screen.getByRole('region', { name: 'Full leaderboard directory' });
    expect(within(directory).getByRole('link', { name: /^Coding benchmark$/ })).toHaveAttribute('href', '/leaderboards/llm/coding/');
    expect(within(directory).getByRole('link', { name: /^Multimodal$/ })).toHaveAttribute('href', '/leaderboards/multimodal/vision-documents/');
    expect(within(directory).queryByRole('link', { name: /^Coding performance$/ })).not.toBeInTheDocument();
    expect(within(directory).queryByRole('link', { name: /^Vision and documents$/ })).not.toBeInTheDocument();
  });

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

  it('shows a loading placeholder before the summary resolves', async () => {
    let resolveResponse: ((response: Response) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { resolveResponse = resolve; })));

    render(<LeaderboardDirectoryPage />);

    expect(screen.getByLabelText('Loading decision-ready picks')).toHaveAttribute('aria-busy', 'true');
    resolveResponse?.(new Response(JSON.stringify(decisionSummaryEnvelope()), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    await screen.findByRole('region', { name: 'Decision-ready picks' });
  });
});

describe('LeaderboardPage', () => {
  it('places current actions and available picks before filters and consolidates provenance', async () => {
    window.history.replaceState(null, '', '/leaderboards/llm/coding/?q=Alpha&sort=score-desc');
    const fetchMock = vi.fn((input: string) => {
      if (input === '/api/benchmarks') return Promise.resolve(new Response(JSON.stringify(decisionSummaryEnvelope()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
      if (input.startsWith('/api/benchmarks/leaderboards/llm-coding?')) return Promise.resolve(new Response(JSON.stringify(codingLeaderboardEnvelope()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<LeaderboardPage keyName="llm-coding" />);

    const heading = await screen.findByRole('heading', { name: 'Coding benchmark', level: 1 });
    const actions = screen.getByRole('group', { name: 'Leaderboard actions' });
    expect(within(actions).getByRole('button', { name: 'Share leaderboard' })).toBeInTheDocument();
    expect(within(actions).getByRole('link', { name: 'Download CSV' })).toHaveAttribute(
      'href',
      '/api/benchmarks/leaderboards/llm-coding/csv?profile=balanced&sort=score-desc&q=Alpha',
    );

    const picks = await screen.findByRole('region', { name: 'Decision-ready picks' });
    const filters = screen.getByRole('region', { name: 'Filter and sort' });
    const results = screen.getByRole('region', { name: 'Coding benchmark results' });
    const evidence = screen.getByRole('region', { name: 'Evidence and methodology' });
    expect(heading.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(actions.compareDocumentPosition(picks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(picks.compareDocumentPosition(filters) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(filters.compareDocumentPosition(results) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(results.compareDocumentPosition(evidence) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole('heading', { name: 'Evidence and methodology', level: 2 })).toHaveLength(1);
    expect(within(evidence).getByRole('link', { name: 'Data from BenchLM.ai' })).toHaveAttribute('href', 'https://benchlm.ai/data');
    expect(document.querySelector('.leaderboard-cover-image')).toBeNull();
  });

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

  it('shares the canonical leaderboard path with the current serialized filters', async () => {
    window.history.replaceState(null, '', '/leaderboards/llm/coding/?q=Alpha&sort=score-desc');
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share });
    vi.stubGlobal('fetch', vi.fn((input: string) => {
      if (input === '/api/benchmarks') return Promise.resolve(new Response(JSON.stringify(decisionSummaryEnvelope()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
      return Promise.resolve(new Response(JSON.stringify(codingLeaderboardEnvelope()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    }));

    render(<LeaderboardPage keyName="llm-coding" />);

    fireEvent.click(screen.getByRole('button', { name: 'Share leaderboard' }));
    await screen.findByRole('status');
    expect(share).toHaveBeenCalledWith({
      url: `${window.location.origin}/leaderboards/llm/coding/?profile=balanced&sort=score-desc&q=Alpha`,
      title: 'Coding benchmark | TokenBench',
      text: 'Review Coding benchmark on TokenBench.',
    });
  });
});
