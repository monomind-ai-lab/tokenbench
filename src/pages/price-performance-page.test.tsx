import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRICE_PERFORMANCE_SCORE_LANES, type PricePerformanceEnvelope, type PricePerformancePoint } from '../benchmarks/price-performance-contracts';
import { writePricePerformanceEnvelopeCache } from '../frontend/benchmark-cache';
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

    const pointButton = screen.getByRole('button', { name: /GPT-5\.6 Sol.*81\.48.*output price/i });
    pointButton.focus();
    fireEvent.keyDown(pointButton, { key: 'Enter' });

    expect(screen.getByRole('dialog', { name: 'GPT-5.6 Sol details' })).toHaveTextContent('$8');
    expect(screen.getByRole('row', { name: /GPT-5\.6 Sol/ })).toHaveTextContent('81.48');
    expect(screen.getByRole('dialog').querySelector('a[href="/models/gpt-5-6-sol/"]')).toBeInTheDocument();
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

  it('keeps stale evidence visibly labelled without removing values', () => {
    render(<PricePerformancePage envelope={envelope([point()], true)} />);

    expect(screen.getByRole('status')).toHaveTextContent('Stale benchmark data');
    expect(screen.getByRole('table', { name: 'Price versus performance values' })).toHaveTextContent('GPT-5.6 Sol');
  });

  it('uses the last valid browser envelope when the refresh request fails', async () => {
    writePricePerformanceEnvelopeCache(envelope([point()], true));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    render(<PricePerformanceApp />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Price versus performance' })).toBeVisible());
    expect(screen.getByRole('status')).toHaveTextContent('Stale benchmark data');
    expect(screen.getByRole('table', { name: 'Price versus performance values' })).toHaveTextContent('GPT-5.6 Sol');
  });
});
