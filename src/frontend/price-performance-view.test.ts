import { describe, expect, it } from 'vitest';
import { formatPricePerformancePointView } from './price-performance-view';
import {
  PRICE_PERFORMANCE_SCORE_LANES,
  type PricePerformancePointView,
} from '../benchmarks/price-performance-contracts';

function pointFixture(overrides: Partial<PricePerformancePointView> = {}): PricePerformancePointView {
  return {
    modelKey: 'alpha',
    slug: 'alpha',
    displayName: 'Alpha',
    creator: 'OpenAI',
    familyId: null,
    status: 'current',
    sourceType: 'Proprietary',
    evidenceStatus: 'supported',
    scores: Object.fromEntries(
      PRICE_PERFORMANCE_SCORE_LANES.map((lane) => [lane, 81.48]),
    ) as PricePerformancePointView['scores'],
    route: {
      sourceId: 'openrouter',
      providerId: 'openai',
      routeId: 'openai:alpha',
      sourceModelId: 'openai/alpha',
      canonicalSlug: 'alpha',
      sourceArtifactId: 'artifact-alpha',
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
    scorePerDollar: 56.95,
    frontier: true,
    ...overrides,
  };
}

describe('price-performance point facts', () => {
  it('renders score per dollar as a bare number without a unit suffix', () => {
    const facts = formatPricePerformancePointView(pointFixture({ scorePerDollar: 56.95 }));
    expect(facts.scorePerDollar).toBe('56.95');
  });

  it('keeps the explicit unavailable state when score per dollar is missing', () => {
    const facts = formatPricePerformancePointView(pointFixture({ scorePerDollar: null }));
    expect(facts.scorePerDollar).toBe('Unavailable');
  });

  it('still speaks the unit in the accessible name', () => {
    const facts = formatPricePerformancePointView(pointFixture({ scorePerDollar: 56.95 }));
    expect(facts.accessibleName).toContain('56.95 score per dollar');
  });

  it('speaks an explicit unavailable state in the accessible name', () => {
    const facts = formatPricePerformancePointView(pointFixture({ scorePerDollar: null }));
    expect(facts.accessibleName).toContain('score per dollar unavailable');
  });
});
