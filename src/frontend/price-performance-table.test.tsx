import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PricePerformanceTable } from './price-performance-table';
import { PRICE_PERFORMANCE_SCORE_LANES, type PricePerformanceAttribution, type PricePerformancePointView } from '../benchmarks/price-performance-contracts';

function point(modelKey: string, displayName: string, score: number, selectedCost: number): PricePerformancePointView {
  return {
    modelKey,
    slug: modelKey,
    displayName,
    creator: 'OpenAI',
    familyId: null,
    status: 'current',
    sourceType: 'Proprietary',
    evidenceStatus: 'supported',
    scores: Object.fromEntries(PRICE_PERFORMANCE_SCORE_LANES.map((lane) => [lane, score])) as PricePerformancePointView['scores'],
    route: {
      sourceId: 'openrouter',
      providerId: 'openai',
      routeId: `openai:${modelKey}`,
      sourceModelId: `openai/${modelKey}`,
      canonicalSlug: modelKey,
      sourceArtifactId: `artifact-${modelKey}`,
      inputUsdPerMillion: selectedCost / 4,
      cachedInputUsdPerMillion: null,
      outputUsdPerMillion: selectedCost,
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
    score,
    selectedCost,
    scorePerDollar: selectedCost === 0 ? null : score / selectedCost,
    frontier: modelKey === 'alpha',
  };
}

describe('PricePerformanceTable', () => {
  it('keeps desktop rows and mobile cards fact-equivalent from one formatter', () => {
    render(<PricePerformanceTable points={[point('alpha', 'Alpha', 81.48, 8), point('beta', 'Beta', 77.95, 0)]} attribution={[{ sourceId: 'openrouter', label: 'OpenRouter', url: 'https://openrouter.ai/models', updatedAt: '2026-08-11T00:00:00.000Z' } satisfies PricePerformanceAttribution]} />);

    const table = screen.getByRole('table', { name: 'Price versus performance values' });
    expect(within(table).getByRole('row', { name: /Alpha/ })).toHaveTextContent('81.5');
    expect(within(table).getByRole('row', { name: /Beta/ })).toHaveTextContent('78.0');
    expect(within(table).getByRole('row', { name: /Beta/ })).toHaveTextContent('Score per dollar unavailable');
    expect(screen.getAllByRole('link', { name: 'View Alpha model profile' })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: 'Alpha' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Alpha' })).toHaveAttribute('href', '/models/alpha/');
    expect(screen.getAllByText('OpenAI · openai · openai:alpha')).toHaveLength(2);
    expect(screen.queryAllByRole('link', { name: 'OpenAI · openai · openai:alpha' })).toHaveLength(0);
    expect(screen.getAllByText('Pareto frontier')).toHaveLength(2);
    expect(screen.getAllByText('Score per dollar unavailable')).toHaveLength(2);
  });

  it('renders a category-empty table without zero-value placeholders', () => {
    render(<PricePerformanceTable points={[]} />);
    expect(screen.getByRole('table', { name: 'Price versus performance values' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('No eligible models match these filters');
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});
