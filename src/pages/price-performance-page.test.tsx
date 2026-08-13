import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRICE_PERFORMANCE_SCORE_LANES, type PricePerformanceEnvelope, type PricePerformancePoint } from '../benchmarks/price-performance-contracts';
import { writePricePerformanceEnvelopeCache } from '../frontend/benchmark-cache';
import { DEFAULT_PRICE_PERFORMANCE_STATE } from '../frontend/price-performance-state';
import { PricePerformanceApp, PricePerformancePage } from './price-performance-page';

function point(overrides: Partial<PricePerformancePoint> = {}): PricePerformancePoint {
  return {
    modelKey: 'gpt-5-6-sol',
    slug: 'gpt-5-6-sol',
    displayName: 'GPT-5.6 Sol',
    creator: 'OpenAI',
    familyId: 'gpt-5',
    status: 'current',
    sourceType: 'Proprietary',
    evidenceStatus: 'supported',
    scores: Object.fromEntries(PRICE_PERFORMANCE_SCORE_LANES.map((lane) => [lane, lane === 'overall' ? 81.48 : 77.95])) as PricePerformancePoint['scores'],
    route: {
      sourceId: 'openrouter',
      providerId: 'openai',
      routeId: 'openai:gpt-5-6-sol',
      sourceModelId: 'openai/gpt-5.6-sol',
      canonicalSlug: 'gpt-5-6-sol',
      sourceArtifactId: 'artifact-1',
      inputUsdPerMillion: 2,
      cachedInputUsdPerMillion: null,
      outputUsdPerMillion: 8,
      contextWindowTokens: 200_000,
      verificationStatus: 'primary',
      maxInputTokens: null,
      maxOutputTokens: null,
      inputModalities: ['text'],
      outputModalities: ['text'],
      supportedParameters: null,
    },
    ...overrides,
  };
}

function envelope(points: readonly PricePerformancePoint[] = [point()], stale = false): PricePerformanceEnvelope {
  return {
    revision: 'price-performance-rev-1',
    publishedAt: '2026-08-11T00:00:00.000Z',
    freshness: {
      status: stale ? 'stale' : 'fresh',
      checkedAt: '2026-08-11T01:00:00.000Z',
      ...(stale ? { message: 'Showing the last published revision.' } : {}),
    },
    attribution: [{ sourceId: 'openrouter', label: 'OpenRouter', url: 'https://openrouter.ai/models', updatedAt: '2026-08-11T00:00:00.000Z' }],
    data: {
      scoreMethodology: Object.fromEntries(PRICE_PERFORMANCE_SCORE_LANES.map((lane) => [lane, `${lane} score`])) as PricePerformanceEnvelope['data']['scoreMethodology'],
      costDefinitions: {
        output: 'Published output USD per one million tokens',
        blended3To1: '(3 × input USD/M + output USD/M) / 4',
      },
      capabilities: {
        scoreLanes: [...PRICE_PERFORMANCE_SCORE_LANES],
        costBases: ['output', 'blended-3-1'],
        creators: ['OpenAI'],
        sourceTypes: ['Proprietary', 'Open Weight', 'Unknown'],
        evidenceStatuses: ['supported', 'estimated', 'source_only'],
        statuses: ['current', 'archived'],
      },
      points,
    },
  };
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

describe('PricePerformancePage', () => {
  it('exposes keyboard point details and preserves the same row facts in the table', () => {
    window.history.replaceState({}, '', '/llm-price-performance/');
    render(<PricePerformancePage envelope={envelope()} />);

    expect(screen.getByRole('heading', { level: 1, name: 'LLM Price vs. Performance Benchmark' })).toBeInTheDocument();
    const pointButton = screen.getByRole('button', { name: /GPT-5\.6 Sol.*81\.5.*output price/i });
    pointButton.focus();
    fireEvent.keyDown(pointButton, { key: 'Enter' });

    expect(screen.getByRole('dialog', { name: 'GPT-5.6 Sol details' })).toHaveTextContent('$8');
    expect(screen.getByRole('row', { name: /GPT-5\.6 Sol/ })).toHaveTextContent('81.5');
    expect(screen.getByRole('dialog').querySelector('a[href="/models/gpt-5-6-sol/"]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close model details' }));
    expect(screen.queryByText('Selected GPT-5.6 Sol')).not.toBeInTheDocument();
  });

  it('keeps the accessible table visible when chart rendering is unavailable', () => {
    render(<PricePerformancePage envelope={envelope()} chartAvailable={false} />);

    expect(screen.getByRole('table', { name: 'Price versus performance values' })).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('Chart unavailable');
  });

  it('shows a category-empty state for a valid filter with no matching points', () => {
    window.history.replaceState({}, '', '/llm-price-performance/?sourceType=Unknown');
    render(<PricePerformancePage envelope={envelope()} />);

    const status = screen.getByRole('status', { name: 'No eligible models match these filters' });
    expect(status).toBeVisible();
    expect(within(screen.getByRole('table', { name: 'Price versus performance values' })).queryAllByRole('row')).toHaveLength(1);
  });

  it('lists only the latest attribution per source in the evidence source list', () => {
    const attribution: PricePerformanceEnvelope['attribution'] = [
      { sourceId: 'openrouter', label: 'OpenRouter', url: 'https://openrouter.ai/models', updatedAt: '2026-08-10T00:00:00.000Z' },
      { sourceId: 'openrouter', label: 'OpenRouter', url: 'https://openrouter.ai/models/archived', updatedAt: '2026-08-09T00:00:00.000Z' },
      { sourceId: 'openrouter', label: 'OpenRouter', url: 'https://openrouter.ai/models/prices', updatedAt: '2026-08-11T00:00:00.000Z' },
      { sourceId: 'lmarena', label: 'LMArena', url: 'https://lmarena.ai/leaderboard', updatedAt: '2026-08-11T00:00:00.000Z' },
    ];
    render(<PricePerformancePage envelope={{ ...envelope(), attribution }} />);

    const sourceList = within(screen.getByRole('list', { name: 'Price-performance sources' }));
    const links = sourceList.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', 'https://openrouter.ai/models/prices');
    expect(links[0].closest('li')).toHaveTextContent('Updated 2026-08-11T00:00:00.000Z');
    expect(links[1]).toHaveAttribute('href', 'https://lmarena.ai/leaderboard');
  });

  it('keeps the default summary deterministic under binary model-key ordering', () => {
    const modelKeys = ['model-A', 'model-a', 'model-B', 'model-b', 'model-C', 'model-c', 'model-D', 'model-d', 'model-E', 'model-e', 'model-F'];
    window.history.replaceState({}, '', '/llm-price-performance/?variants=all-variants');
    render(<PricePerformancePage envelope={envelope(modelKeys.map((modelKey, index) => point({
      modelKey,
      slug: `model-${index}`,
      displayName: modelKey,
      familyId: `family-${index}`,
    })))} />);

    const rows = within(screen.getByRole('table', { name: 'Price versus performance values' })).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(6);
    expect(rows[0]).toHaveTextContent('model-A');
    expect(rows[5]).toHaveTextContent('model-F');
  });

  it('filters by score lane and creator tags and by a min-max price range slider', () => {
    const otherPoint = point({
      modelKey: 'other',
      slug: 'other',
      displayName: 'Other',
      familyId: 'other',
      route: { ...point().route, routeId: 'openai:other', canonicalSlug: 'other', outputUsdPerMillion: 40 },
    });
    window.history.replaceState({}, '', '/llm-price-performance/');
    render(<PricePerformancePage envelope={envelope([point(), otherPoint])} />);

    const laneGroup = screen.getByRole('group', { name: 'Score lane' });
    expect(within(laneGroup).getByRole('button', { name: 'Overall' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(laneGroup).getByRole('button', { name: 'Coding' }));
    expect(within(laneGroup).getByRole('button', { name: 'Coding' })).toHaveAttribute('aria-pressed', 'true');
    expect(window.location.search).toContain('lane=coding');

    const creatorGroup = screen.getByRole('group', { name: 'Creator' });
    fireEvent.click(within(creatorGroup).getByRole('button', { name: 'OpenAI' }));
    expect(window.location.search).toContain('creator=OpenAI');

    const minRange = screen.getByRole('slider', { name: 'Minimum price per 1M tokens' });
    const maxRange = screen.getByRole('slider', { name: 'Maximum price per 1M tokens' });
    expect(minRange).toBeInTheDocument();
    expect(maxRange).toBeInTheDocument();
  });

  it('renders archived rows when the archived status is active in the state', () => {
    const archivedPoint = point({
      modelKey: 'gpt-5-6-sol-archived',
      slug: 'gpt-5-6-sol-archived',
      displayName: 'GPT-5.6 Sol archived',
      familyId: 'gpt-5-archive',
      status: 'archived',
      route: { ...point().route, routeId: 'openai:gpt-5-6-sol-archived', canonicalSlug: 'gpt-5-6-sol-archived' },
    });
    const archivedEnvelope = envelope([point(), archivedPoint]);

    render(<PricePerformancePage envelope={archivedEnvelope} initialState={{ ...DEFAULT_PRICE_PERFORMANCE_STATE, status: 'archived' }} />);
    expect(screen.getByRole('table', { name: 'Price versus performance values' })).toHaveTextContent('GPT-5.6 Sol archived');
  });

  it('keeps stale evidence visibly labelled without removing values', () => {
    render(<PricePerformancePage envelope={envelope([point()], true)} />);

    expect(screen.getAllByRole('status').some((status) => status.textContent?.includes('Stale benchmark data'))).toBe(true);
    expect(screen.getByRole('table', { name: 'Price versus performance values' })).toHaveTextContent('GPT-5.6 Sol');
  });

  it('uses the last valid browser envelope when the refresh request fails', async () => {
    writePricePerformanceEnvelopeCache(envelope([point()], false));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    render(<PricePerformanceApp />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'LLM Price vs. Performance Benchmark' })).toBeVisible());
    const staleStatuses = screen.getAllByRole('status');
    const staleStatus = staleStatuses.find((status) => status.textContent?.includes('Stale benchmark data'));
    expect(staleStatus).toBeTruthy();
    expect(staleStatus).toHaveTextContent(/last valid browser/i);
    expect(screen.getByRole('table', { name: 'Price versus performance values' })).toHaveTextContent('GPT-5.6 Sol');
  });

  it('never replaces newer server-rendered evidence with an older browser cache', async () => {
    const current = envelope();
    const older = {
      ...envelope(),
      revision: 'price-performance-rev-older',
      publishedAt: '2026-08-10T00:00:00.000Z',
      freshness: { status: 'fresh' as const, checkedAt: '2026-08-10T01:00:00.000Z' },
    };
    writePricePerformanceEnvelopeCache(older, '2026-08-10T02:00:00.000Z');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    render(<PricePerformanceApp initialEnvelope={current} />);

    const staleStatus = await screen.findByText(/server-rendered revision/i);
    expect(staleStatus).toBeInTheDocument();
    expect(screen.getByText('price-performance-rev-1')).toBeInTheDocument();
    expect(screen.queryByText('price-performance-rev-older')).not.toBeInTheDocument();
  });
});
