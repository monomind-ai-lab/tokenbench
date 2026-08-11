import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PricePerformanceChart } from './price-performance-chart';
import { PRICE_PERFORMANCE_SCORE_LANES, type PricePerformanceAttribution, type PricePerformancePointView } from '../benchmarks/price-performance-contracts';

function point(overrides: Partial<PricePerformancePointView> = {}): PricePerformancePointView {
  return {
    modelKey: 'gpt-5-6-sol',
    slug: 'gpt-5-6-sol',
    displayName: 'GPT-5.6 Sol',
    creator: 'OpenAI',
    familyId: 'gpt-5',
    status: 'current',
    sourceType: 'Proprietary',
    evidenceStatus: 'supported',
    scores: Object.fromEntries(PRICE_PERFORMANCE_SCORE_LANES.map((lane) => [lane, lane === 'overall' ? 81.48 : 77.95])) as PricePerformancePointView['scores'],
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
    scoreLane: 'overall',
    costBasis: 'output',
    score: 81.48,
    selectedCost: 8,
    scorePerDollar: 10.185,
    frontier: true,
    ...overrides,
  };
}

describe('PricePerformanceChart', () => {
  it('exposes every point by keyboard and touch with linked source evidence and focus return', () => {
    const attribution: PricePerformanceAttribution[] = [{
      sourceId: 'openrouter',
      label: 'OpenRouter',
      url: 'https://openrouter.ai/models',
      updatedAt: '2026-08-11T00:00:00.000Z',
    }];
    render(<PricePerformanceChart points={[point({ score: 77.95 })]} attribution={attribution} />);

    const chart = screen.getByRole('group', { name: 'Overall score by output price' });
    expect(chart).toBeInTheDocument();
    expect(screen.getByText(/scatter plot with 1 model/i)).toBeInTheDocument();
    expect(screen.getByText('Pareto frontier')).toBeInTheDocument();
    expect(screen.getByText('Supported evidence')).toBeInTheDocument();
    expect(screen.getAllByText(/^\d+\.\d$/u).length).toBeGreaterThan(0);

    const pointButton = screen.getByRole('button', { name: /GPT-5\.6 Sol.*78\.0.*output price/i });
    pointButton.focus();
    fireEvent.keyDown(pointButton, { key: 'Enter' });

    const dialog = screen.getByRole('dialog', { name: 'GPT-5.6 Sol details' });
    expect(dialog).toHaveTextContent('78.0');
    expect(within(dialog).getByRole('link', { name: /openai.*openai:gpt-5-6-sol/i })).toHaveAttribute('href', 'https://openrouter.ai/models');
    expect(dialog.querySelector('a[href="/models/gpt-5-6-sol/"]')).toBeInTheDocument();

    fireEvent.touchEnd(pointButton);
    expect(screen.getByRole('dialog', { name: 'GPT-5.6 Sol details' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(pointButton);
  });

  it('renders an explicit empty category state without inventing chart points', () => {
    render(<PricePerformanceChart points={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent('No eligible models match these filters');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
