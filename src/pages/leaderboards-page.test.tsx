import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DecisionPickEntry } from '../benchmarks/decision-picks';
import type { BenchmarkApiEnvelope, BenchmarkSummaryData, LeaderboardPageResult } from '../frontend/use-benchmarks';
import { benchmarkCacheKey, writeBenchmarkEnvelopeCache } from '../frontend/benchmark-cache';
import type { BenchmarkMetric, BenchmarkModel } from '../benchmarks/contracts';
import type { LeaderboardEntry } from '../benchmarks/leaderboards';
import { v21Leaderboard } from '../benchmarks/v21-leaderboards';
import {
  LeaderboardDirectoryPage,
  LeaderboardPage,
  costScoreChartData,
  positionNoteFor,
  scoreChartData,
} from './leaderboards-page';

const chartModel: BenchmarkModel = {
  modelKey: 'a', slug: 'alpha', name: 'Alpha', creator: 'Example', sourceType: 'Proprietary',
  reasoningType: null, releaseDate: null, contextWindowTokens: 128_000, evidenceStatus: 'supported',
  rankingEligible: true, confidenceLower: null, confidenceUpper: null, benchmarkCount: 1,
  sourceId: 'benchlm', sourceModelId: 'alpha', sourceArtifactId: 'models',
};

const chartMetric: BenchmarkMetric = {
  modelKey: 'a', metricKey: 'benchlm:overall:raw', category: 'overall', value: 80, rawValue: null,
  rank: 1, lower: null, upper: null, voteCount: null, unit: 'score', sourceId: 'benchlm',
  sourceUpdatedAt: '2026-08-05T00:00:00.000Z', sourceModelId: 'alpha', sourceArtifactId: 'models',
  rankingEligible: true, methodology: 'benchlm_raw_composite', observationCount: null, sessionCount: null,
};

function chartEntry(overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    model: chartModel, metric: chartMetric, metrics: [chartMetric], primaryPrice: null,
    blendedCostPerMillion: null, contextWindowTokens: 128_000, sourceRank: 1, onValueFrontier: false,
    ...overrides,
  };
}

describe('leaderboard score chart data', () => {
  it('builds chart data from scored entries and marks estimated rows muted', () => {
    const data = scoreChartData([
      chartEntry(),
      chartEntry({
        model: { ...chartModel, modelKey: 'b', name: 'Beta', evidenceStatus: 'estimated' },
        metric: { ...chartMetric, value: 60 },
      }),
      chartEntry({ model: { ...chartModel, modelKey: 'c', name: 'Gamma' }, metric: null }),
    ]);

    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({ label: 'Alpha', value: 80, muted: false });
    expect(data[1]).toMatchObject({ label: 'Beta', value: 60, muted: true });
  });

  it('caps the chart at the requested number of rows', () => {
    const many = Array.from({ length: 20 }, (_, index) => chartEntry({
      model: { ...chartModel, modelKey: `m${index}`, name: `Model ${index}` },
      metric: { ...chartMetric, value: 100 - index },
    }));

    expect(scoreChartData(many)).toHaveLength(12);
    expect(scoreChartData(many, 5)).toHaveLength(5);
  });
});

describe('cost versus score chart data', () => {
  it('keeps only entries that publish both a score and a cost', () => {
    const data = costScoreChartData([
      chartEntry({ blendedCostPerMillion: 20, onValueFrontier: true }),
      chartEntry({
        model: { ...chartModel, modelKey: 'b', slug: 'beta', name: 'Beta' },
        metric: { ...chartMetric, value: 60 },
        blendedCostPerMillion: 4,
      }),
      // No published cost: excluded rather than drawn at zero.
      chartEntry({ model: { ...chartModel, modelKey: 'c', name: 'Gamma' }, blendedCostPerMillion: null }),
      // No published score: excluded.
      chartEntry({ model: { ...chartModel, modelKey: 'd', name: 'Delta' }, metric: null, blendedCostPerMillion: 7 }),
    ]);

    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({ label: 'Alpha', score: 80, cost: 20, frontier: true });
    expect(data[1]).toMatchObject({ label: 'Beta', score: 60, cost: 4, frontier: false });
  });

  it('links each point to its model profile', () => {
    const [point] = costScoreChartData([chartEntry({ blendedCostPerMillion: 20 })]);
    expect(point?.href).toBe('/models/alpha/');
  });

  it('returns nothing when no entry publishes a cost', () => {
    expect(costScoreChartData([chartEntry({ blendedCostPerMillion: null })])).toEqual([]);
  });
});

describe('leaderboard position notes', () => {
  it('explains that positions are published source ranks', () => {
    expect(positionNoteFor('llm-coding')).toMatch(/source rank/i);
    expect(positionNoteFor('llm-coding')).toMatch(/gap/i);
  });

  it('marks reasoning and knowledge as unranked evidence lenses', () => {
    expect(positionNoteFor('llm-reasoning')).toMatch(/unranked/i);
    expect(positionNoteFor('llm-knowledge')).toMatch(/unranked/i);
  });
});

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
      representativeComparisons: [],
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

function codingLeaderboardEnvelope(): BenchmarkApiEnvelope<LeaderboardPageResult> {
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
    rawValue: null,
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
      pagination: { limit: 50, total: 1, nextCursor: null },
      capabilities: {
        dataReady: true,
        defaultProfile: 'balanced',
        defaultSort: 'score-desc',
        supportsProfile: false,
        supportsEstimated: true,
        supportsLifecycle: false,
        priceMode: 'representative',
        supportsPrice: false,
        priceValues: [],
        metricKeys: ['benchlm:category:coding'],
        sorts: ['score-desc'],
        providers: ['OpenAI'],
        sourceTypes: ['Proprietary'],
        evidenceStatuses: ['supported'],
      },
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('LeaderboardDirectoryPage', () => {
  it('renders the seven required V2.1 overview cards in category order', async () => {
    respondWithSummary();

    render(<LeaderboardDirectoryPage />);

    const overview = await screen.findByRole('region', { name: 'V2.1 leaderboard overview' });
    expect(within(overview).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      'Overall', 'Coding', 'Agentic', 'Math', 'Reasoning', 'Multimodal', 'SLA',
    ]);
    expect(within(overview).getByRole('link', { name: 'Open Coding leaderboard' })).toHaveAttribute('href', '/leaderboards/coding/');
    expect(within(overview).getAllByText('Unavailable until comparable published evidence is available.')).toHaveLength(2);
  });

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
    expect(within(codingCard).queryByText('Supported evidence')).not.toBeInTheDocument();
    expect(within(codingCard).getAllByText(/Updated /)).toHaveLength(3);
    expect(codingCard.querySelectorAll('.provider-mark')).toHaveLength(3);
    expect(within(codingCard).getByRole('link', { name: 'View full leaderboard' })).toHaveAttribute('href', '/leaderboards/llm/coding/');
    expect(screen.getByRole('link', { name: 'How BenchAlign rankings work' })).toHaveAttribute('href', '/methodology/benchalign/');
    expect(document.querySelector('.leaderboard-cover-image')).toBeNull();
  });

  it('labels decision-pick entries without a published source rank as Unranked', async () => {
    const payload = decisionSummaryEnvelope();
    respondWithSummary({
      ...payload,
      data: {
        ...payload.data,
        decisionPicks: payload.data.decisionPicks.map((group) => group.key === 'llm-coding'
          ? { ...group, entries: group.entries.map((entry) => ({ ...entry, rank: null })) }
          : group),
      },
    });

    render(<LeaderboardDirectoryPage />);

    const codingCard = await screen.findByRole('region', { name: 'Coding leaders' });
    expect(within(codingCard).getAllByText('Unranked')).toHaveLength(3);
    expect(within(codingCard).queryByText(/Rank [1-3]/)).not.toBeInTheDocument();
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

  it('keeps the last validated leaderboard and evidence visible through a 503 refresh failure', async () => {
    const endpoint = '/api/benchmarks/leaderboards/llm-coding?profile=balanced&sort=score-desc&limit=50';
    writeBenchmarkEnvelopeCache(benchmarkCacheKey(endpoint), codingLeaderboardEnvelope(), UPDATED_AT);
    vi.stubGlobal('fetch', vi.fn((input: string) => Promise.resolve(new Response(JSON.stringify(
      input === '/api/benchmarks' ? decisionSummaryEnvelope() : { error: 'Benchmark data unavailable' },
    ), {
      status: input === '/api/benchmarks' ? 200 : 503,
      headers: { 'content-type': 'application/json' },
    }))));

    render(<LeaderboardPage keyName="llm-coding" />);

    expect(await screen.findByRole('status'))
      .toHaveTextContent('Showing the last published revision while refresh is unavailable.');
    expect(screen.getByRole('table', { name: 'Coding benchmark' })).toBeInTheDocument();
    const evidence = screen.getByRole('region', { name: 'Evidence and methodology' });
    expect(within(evidence).getByRole('link', { name: 'Data from BenchLM.ai' })).toBeInTheDocument();
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
    expect(within(codingCard).getByRole('link', { name: 'View full leaderboard' })).toHaveAttribute('href', '/leaderboards/llm/coding/');
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

  it('labels each directory card with its evidence status so the index does not read as a universal composite', () => {
    respondWithSummary();

    render(<LeaderboardDirectoryPage />);

    const directory = screen.getByRole('region', { name: 'Full leaderboard directory' });

    const codingHeading = within(directory).getByRole('heading', { name: 'Coding benchmark', level: 4 });
    const codingArticle = codingHeading.closest('article')!;
    expect(within(codingArticle).getByText('BenchAlign ranking')).toBeInTheDocument();

    const reasoningHeading = within(directory).getByRole('heading', { name: 'Reasoning', level: 4 });
    const reasoningArticle = reasoningHeading.closest('article')!;
    expect(within(reasoningArticle).getByText('Evidence lens')).toBeInTheDocument();

    const preferenceHeading = within(directory).getByRole('heading', { name: 'Human preference', level: 4 });
    const preferenceArticle = preferenceHeading.closest('article')!;
    expect(within(preferenceArticle).getByText('Source lens')).toBeInTheDocument();

    const valueHeading = within(directory).getByRole('heading', { name: 'Value frontier', level: 4 });
    const valueArticle = valueHeading.closest('article')!;
    const valueStatuses = within(valueArticle).getAllByText('Value frontier');
    expect(valueStatuses.length).toBeGreaterThan(1);

    const pricingHeading = within(directory).getByRole('heading', { name: 'Pricing and context', level: 4 });
    const pricingArticle = pricingHeading.closest('article')!;
    expect(within(pricingArticle).getByText('Route evidence')).toBeInTheDocument();
  });

  it('labels each directory card with its source lane so users know which evidence source they enter', () => {
    respondWithSummary();

    render(<LeaderboardDirectoryPage />);

    const directory = screen.getByRole('region', { name: 'Full leaderboard directory' });
    const codingHeading = within(directory).getByRole('heading', { name: 'Coding benchmark', level: 4 });
    const codingArticle = codingHeading.closest('article')!;
    expect(within(codingArticle).getByText('BenchLM')).toBeInTheDocument();

    const preferenceHeading = within(directory).getByRole('heading', { name: 'Human preference', level: 4 });
    const preferenceArticle = preferenceHeading.closest('article')!;
    expect(within(preferenceArticle).getByText('LMArena')).toBeInTheDocument();

    const pricingHeading = within(directory).getByRole('heading', { name: 'Pricing and context', level: 4 });
    const pricingArticle = pricingHeading.closest('article')!;
    expect(within(pricingArticle).getByText('OpenRouter')).toBeInTheDocument();

    const multimodalHeading = within(directory).getByRole('heading', { name: 'Multimodal', level: 4 });
    const multimodalArticle = multimodalHeading.closest('article')!;
    expect(within(multimodalArticle).getByText(/BenchLM/)).toBeInTheDocument();
    expect(within(multimodalArticle).getByText(/LMArena/)).toBeInTheDocument();
  });
});

describe('V2.1 category hydration', () => {
  it('reuses the embedded category envelope without a second initial request', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<LeaderboardPage
      keyName="llm-coding"
      category={v21Leaderboard('coding')!}
      initialEnvelope={{
        ...codingLeaderboardEnvelope(),
        data: { ...codingLeaderboardEnvelope().data, pagination: { limit: 20, total: 1, nextCursor: null } },
      }}
    />);

    expect(screen.getByRole('heading', { name: 'Coding', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Coding benchmark' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('LeaderboardPage', () => {
  it('requests canonical filters from the complete projection so a model beyond the first page remains discoverable', async () => {
    window.history.replaceState(null, '', '/leaderboards/llm/coding/?q=Needle&sort=score-desc');
    const base = codingLeaderboardEnvelope();
    const baseEntry = base.data.entries[0]!;
    const needleMetric = {
      ...baseEntry.metric!,
      modelKey: 'openai:needle-after-fifty',
      sourceModelId: 'openai:needle-after-fifty',
    };
    const needle = {
      ...baseEntry,
      model: {
        ...baseEntry.model,
        modelKey: 'openai:needle-after-fifty',
        slug: 'needle-after-fifty',
        name: 'Needle after fifty',
        sourceModelId: 'openai:needle-after-fifty',
      },
      metric: needleMetric,
      metrics: [needleMetric],
    };
    const filteredPage = {
      ...base,
      data: {
        ...base.data,
        entries: [needle],
        pagination: { limit: 50, total: 1, nextCursor: null },
        capabilities: {
          dataReady: true,
          defaultProfile: 'balanced',
          defaultSort: 'score-desc',
          supportsProfile: false,
          supportsEstimated: true,
          supportsLifecycle: false,
          priceMode: 'representative',
          supportsPrice: false,
          priceValues: [],
          metricKeys: ['benchlm:category:coding'],
          sorts: ['score-desc'],
          providers: ['OpenAI'],
          sourceTypes: ['Proprietary'],
          evidenceStatuses: ['supported'],
        },
      },
    };
    const fetchMock = vi.fn((input: string) => {
      if (input === '/api/benchmarks') return Promise.resolve(new Response(JSON.stringify(decisionSummaryEnvelope()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
      if (input === '/api/benchmarks/leaderboards/llm-coding?profile=balanced&sort=score-desc&q=Needle&limit=50') {
        return Promise.resolve(new Response(JSON.stringify(filteredPage), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }));
      }
      return Promise.resolve(new Response(JSON.stringify({ error: 'Unexpected leaderboard request' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<LeaderboardPage keyName="llm-coding" />);

    const table = await screen.findByRole('table', { name: 'Coding benchmark' });
    expect(within(table).getByText('Needle after fifty')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/benchmarks/leaderboards/llm-coding?profile=balanced&sort=score-desc&q=Needle&limit=50',
      expect.objectContaining({ headers: { accept: 'application/json' } }),
    );
    await new Promise<void>((resolve) => { window.setTimeout(resolve, 25); });
    // The score chart reuses the leaderboard entries already fetched for the
    // table, so this route no longer issues a second `/api/benchmarks` request
    // for a panel that restated those same rows.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalledWith('/api/benchmarks', expect.anything());
    expect(screen.getByRole('link', { name: 'Download CSV' })).toHaveAttribute(
      'href',
      '/api/benchmarks/leaderboards/llm-coding/csv?profile=balanced&sort=score-desc&q=Needle',
    );
  });

  it('moves through bounded server pages while keeping pagination cursors out of the shared URL', async () => {
    window.history.replaceState(null, '', '/leaderboards/llm/coding/?sort=score-desc');
    const base = codingLeaderboardEnvelope();
    const baseEntry = base.data.entries[0]!;
    const pageEntry = (index: number) => {
      const modelKey = index === 50 ? 'openai:needle-after-fifty' : `openai:model-${String(index).padStart(2, '0')}`;
      const metric = {
        ...baseEntry.metric!,
        modelKey,
        value: 1_000 - index,
        rank: index + 1,
        sourceModelId: modelKey,
      };
      return {
        ...baseEntry,
        model: {
          ...baseEntry.model,
          modelKey,
          slug: modelKey.slice('openai:'.length),
          name: index === 50 ? 'Needle after fifty' : `Model ${index}`,
          sourceModelId: modelKey,
        },
        metric,
        metrics: [metric],
        sourceRank: index + 1,
      };
    };
    const capabilities = {
      dataReady: true,
      defaultProfile: 'balanced',
      defaultSort: 'score-desc',
      supportsProfile: false,
      supportsEstimated: true,
      supportsLifecycle: false,
      priceMode: 'representative',
      supportsPrice: false,
      priceValues: [],
      metricKeys: ['benchlm:category:coding'],
      sorts: ['score-desc'],
      providers: ['OpenAI'],
      sourceTypes: ['Proprietary'],
      evidenceStatuses: ['supported'],
    } as const;
    const firstPage = {
      ...base,
      data: {
        ...base.data,
        entries: Array.from({ length: 50 }, (_, index) => pageEntry(index)),
        capabilities,
        pagination: { limit: 50, total: 51, nextCursor: 'cursor-page-two' },
      },
    };
    const secondPage = {
      ...base,
      data: {
        ...base.data,
        entries: [pageEntry(50)],
        capabilities,
        pagination: { limit: 50, total: 51, nextCursor: null },
      },
    };
    const fetchMock = vi.fn((input: string) => {
      if (input === '/api/benchmarks') return Promise.resolve(new Response(JSON.stringify(decisionSummaryEnvelope()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
      if (input === '/api/benchmarks/leaderboards/llm-coding?profile=balanced&sort=score-desc&limit=50') {
        return Promise.resolve(new Response(JSON.stringify(firstPage), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }));
      }
      if (input === '/api/benchmarks/leaderboards/llm-coding?profile=balanced&sort=score-desc&limit=50&cursor=cursor-page-two') {
        return Promise.resolve(new Response(JSON.stringify(secondPage), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }));
      }
      return Promise.resolve(new Response(JSON.stringify({ error: 'Unexpected leaderboard request' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<LeaderboardPage keyName="llm-coding" />);

    await screen.findAllByText('Model 0');
    const pagination = await screen.findByRole('navigation', { name: 'Leaderboard result pages' });
    expect(within(pagination).getByText('Showing 1–50 of 51 published entries')).toBeInTheDocument();
    expect(within(pagination).getByRole('button', { name: 'Previous page' })).toBeDisabled();
    fireEvent.click(within(pagination).getByRole('button', { name: 'Next page' }));

    await screen.findAllByText('Needle after fifty');
    expect(screen.getByText('Showing 51–51 of 51 published entries')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'Coding benchmark' })).getByText('#51')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Coding benchmark cards' })).getByText('#51')).toBeInTheDocument();
    expect(screen.queryByText('Top Coding')).not.toBeInTheDocument();
    await waitFor(() => expect(window.location.search).toBe('?profile=balanced&sort=score-desc'));
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    await screen.findAllByText('Model 0');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/benchmarks/leaderboards/llm-coding?profile=balanced&sort=score-desc&limit=50&cursor=cursor-page-two',
      expect.objectContaining({ headers: { accept: 'application/json' } }),
    );
  });

  it('returns once to the latest first page when a revision invalidates a pagination cursor', async () => {
    window.history.replaceState(null, '', '/leaderboards/llm/coding/?sort=score-desc');
    const base = codingLeaderboardEnvelope();
    const initialPage = {
      ...base,
      data: {
        ...base.data,
        pagination: { limit: 50, total: 2, nextCursor: 'cursor-stale-revision' },
      },
    };
    const currentEntry = base.data.entries[0]!;
    const revisedModelKey = 'openai:latest';
    const revisedMetric = {
      ...currentEntry.metric!,
      modelKey: revisedModelKey,
      sourceModelId: revisedModelKey,
    };
    const revisedPage = {
      ...base,
      revision: 'published-r2',
      data: {
        ...base.data,
        entries: [{
          ...currentEntry,
          model: {
            ...currentEntry.model,
            modelKey: revisedModelKey,
            slug: 'latest',
            name: 'Latest revision leader',
            sourceModelId: revisedModelKey,
          },
          metric: revisedMetric,
          metrics: [revisedMetric],
        }],
        pagination: { limit: 50, total: 1, nextCursor: null },
      },
    };
    let firstPageRequests = 0;
    const fetchMock = vi.fn((input: string) => {
      if (input === '/api/benchmarks') return Promise.resolve(new Response(JSON.stringify(decisionSummaryEnvelope()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
      if (input === '/api/benchmarks/leaderboards/llm-coding?profile=balanced&sort=score-desc&limit=50') {
        firstPageRequests += 1;
        return Promise.resolve(new Response(JSON.stringify(firstPageRequests === 1 ? initialPage : revisedPage), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }));
      }
      if (input === '/api/benchmarks/leaderboards/llm-coding?profile=balanced&sort=score-desc&limit=50&cursor=cursor-stale-revision') {
        return Promise.resolve(new Response(JSON.stringify({ error: 'Invalid benchmark request' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }));
      }
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<LeaderboardPage keyName="llm-coding" />);

    await screen.findAllByText('Alpha');
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findAllByText('Latest revision leader');
    expect(screen.getByText('Leaderboard revision changed. Showing the first page of the latest results.')).toBeInTheDocument();
    expect(screen.getByText('Showing 1–1 of 1 published entries')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await new Promise<void>((resolve) => { window.setTimeout(resolve, 25); });
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/benchmarks/leaderboards/')).length).toBe(3);
  });

  it('drops an active provider removed by the revision before stale-cursor recovery rebuilds page one', async () => {
    window.history.replaceState(null, '', '/leaderboards/llm/coding/?provider=Removed%20Provider&sort=score-desc');
    const base = codingLeaderboardEnvelope();
    const currentEntry = base.data.entries[0]!;
    const removedEntry = {
      ...currentEntry,
      model: {
        ...currentEntry.model,
        creator: 'Removed Provider',
        name: 'Removed provider model',
      },
    };
    const previousCapabilities = {
      ...base.data.capabilities!,
      providers: ['OpenAI', 'Removed Provider'],
    };
    const bootstrapPage = {
      ...base,
      data: {
        ...base.data,
        entries: [removedEntry],
        capabilities: previousCapabilities,
        pagination: { limit: 50, total: 2, nextCursor: null },
      },
    };
    const filteredPage = {
      ...bootstrapPage,
      data: {
        ...bootstrapPage.data,
        pagination: { limit: 50, total: 2, nextCursor: 'cursor-removed-provider' },
      },
    };
    const revisedPage = {
      ...base,
      revision: 'published-r2',
      data: {
        ...base.data,
        entries: [{
          ...currentEntry,
          model: { ...currentEntry.model, name: 'Current revision leader' },
        }],
        capabilities: { ...base.data.capabilities!, providers: ['OpenAI'] },
        pagination: { limit: 50, total: 1, nextCursor: null },
      },
    };
    const bootstrapEndpoint = '/api/benchmarks/leaderboards/llm-coding?profile=balanced&sort=score-desc&limit=50';
    const filteredEndpoint = '/api/benchmarks/leaderboards/llm-coding?profile=balanced&sort=score-desc&provider=Removed+Provider&limit=50';
    let bootstrapRequests = 0;
    let filteredPageRequests = 0;
    const fetchMock = vi.fn((input: string) => {
      if (input === '/api/benchmarks') return Promise.resolve(new Response(JSON.stringify(decisionSummaryEnvelope()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
      if (input === bootstrapEndpoint) {
        bootstrapRequests += 1;
        return Promise.resolve(new Response(JSON.stringify(bootstrapRequests === 1 ? bootstrapPage : revisedPage), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }));
      }
      if (input === filteredEndpoint) {
        filteredPageRequests += 1;
        return Promise.resolve(new Response(JSON.stringify(
          filteredPageRequests === 1 ? filteredPage : { error: 'Invalid benchmark request' },
        ), {
          status: filteredPageRequests === 1 ? 200 : 400,
          headers: { 'content-type': 'application/json' },
        }));
      }
      if (input === `${filteredEndpoint}&cursor=cursor-removed-provider`) {
        return Promise.resolve(new Response(JSON.stringify({ error: 'Invalid benchmark request' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }));
      }
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<LeaderboardPage keyName="llm-coding" />);

    await screen.findAllByText('Removed provider model');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findAllByText('Current revision leader');
    expect(screen.getByText('Leaderboard revision changed. Showing the first page of the latest results.')).toBeInTheDocument();
    await waitFor(() => expect(window.location.search).toBe('?profile=balanced&sort=score-desc'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await new Promise<void>((resolve) => { window.setTimeout(resolve, 25); });
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/benchmarks/leaderboards/')).length).toBe(4);
  });

  it('keeps a first-page 400 visible as a generic benchmark API error', async () => {
    const fetchMock = vi.fn((input: string) => Promise.resolve(new Response(JSON.stringify(
      input === '/api/benchmarks' ? decisionSummaryEnvelope() : { error: 'Invalid benchmark request' },
    ), {
      status: input === '/api/benchmarks' ? 200 : 400,
      headers: { 'content-type': 'application/json' },
    })));
    vi.stubGlobal('fetch', fetchMock);

    render(<LeaderboardPage keyName="llm-coding" />);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Benchmark request failed (400).')).toBeInTheDocument();
    await new Promise<void>((resolve) => { window.setTimeout(resolve, 25); });
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/benchmarks/leaderboards/')).length).toBe(1);
  });

  it('omits a no-longer-published dynamic filter until complete capabilities can normalize the shared URL', async () => {
    window.history.replaceState(null, '', '/leaderboards/llm/coding/?provider=Missing&sort=score-desc');
    const base = codingLeaderboardEnvelope();
    const bootstrapPage = {
      ...base,
      data: {
        ...base.data,
        pagination: { limit: 50, total: 1, nextCursor: null },
        capabilities: {
          dataReady: true,
          defaultProfile: 'balanced',
          defaultSort: 'score-desc',
          supportsProfile: false,
          supportsEstimated: true,
          supportsLifecycle: false,
          priceMode: 'representative',
          supportsPrice: false,
          priceValues: [],
          metricKeys: ['benchlm:category:coding'],
          sorts: ['score-desc'],
          providers: ['OpenAI'],
          sourceTypes: ['Proprietary'],
          evidenceStatuses: ['supported'],
        },
      },
    };
    const fetchMock = vi.fn((input: string) => {
      if (input === '/api/benchmarks') return Promise.resolve(new Response(JSON.stringify(decisionSummaryEnvelope()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
      if (input === '/api/benchmarks/leaderboards/llm-coding?profile=balanced&sort=score-desc&limit=50') {
        return Promise.resolve(new Response(JSON.stringify(bootstrapPage), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }));
      }
      return Promise.resolve(new Response(JSON.stringify({ error: 'Unexpected leaderboard request' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<LeaderboardPage keyName="llm-coding" />);

    await screen.findByRole('table', { name: 'Coding benchmark' });
    await waitFor(() => expect(window.location.search).toBe('?profile=balanced&sort=score-desc'));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/benchmarks/leaderboards/llm-coding?profile=balanced&sort=score-desc&limit=50',
      expect.objectContaining({ headers: { accept: 'application/json' } }),
    );
  });

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
    expect(within(actions).getByRole('button', { name: 'Share Leaderboard' })).toHaveClass('button-secondary');
    expect(within(actions).getByRole('link', { name: 'Download CSV' })).toHaveAttribute(
      'href',
      '/api/benchmarks/leaderboards/llm-coding/csv?profile=balanced&sort=score-desc&q=Alpha',
    );

    const picks = await screen.findByRole('region', { name: 'Score comparison' });
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

  it('opens the metadata-canonical leaderboard URL and copies only after explicit activation', async () => {
    window.history.replaceState(null, '', '/leaderboards/llm/coding/?q=Alpha&sort=score-desc');
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
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

    fireEvent.click(screen.getByRole('button', { name: 'Share Leaderboard' }));
    expect(screen.getByRole('textbox', { name: 'Share URL' })).toHaveValue(
      'https://tokenbench.monomind.one/leaderboards/llm/coding/?q=Alpha',
    );
    expect(writeText).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Link copied.');
    expect(writeText).toHaveBeenCalledWith(
      'https://tokenbench.monomind.one/leaderboards/llm/coding/?q=Alpha',
    );
  });
});
