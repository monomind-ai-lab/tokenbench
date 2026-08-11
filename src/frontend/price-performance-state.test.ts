import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRICE_PERFORMANCE_STATE,
  decodePricePerformanceState,
  encodePricePerformanceState,
  normalizePricePerformanceState,
  pricePerformanceUrl,
  type PricePerformanceState,
} from './price-performance-state';
import { PRICE_PERFORMANCE_SCORE_LANES, type PricePerformanceCapabilities } from '../benchmarks/price-performance-contracts';

const capabilities: PricePerformanceCapabilities = {
  scoreLanes: [...PRICE_PERFORMANCE_SCORE_LANES],
  costBases: ['output', 'blended-3-1'],
  creators: ['OpenAI', 'Anthropic'],
  sourceTypes: ['Proprietary', 'Open Weight', 'Unknown'],
  evidenceStatuses: ['supported', 'estimated', 'source_only'],
  statuses: ['current', 'archived'],
};

function state(overrides: Partial<PricePerformanceState> = {}): PricePerformanceState {
  return { ...DEFAULT_PRICE_PERFORMANCE_STATE, ...overrides };
}

describe('price-performance URL/filter state', () => {
  it('normalizes invalid filter values to the base defaults', () => {
    const decoded = decodePricePerformanceState(
      new URLSearchParams('lane=wrong&basis=cached&variants=maybe&creator=missing&scale=log'),
      capabilities,
    );

    expect(decoded.state).toEqual(DEFAULT_PRICE_PERFORMANCE_STATE);
    expect(decoded.wasNormalized).toBe(true);
  });
  it('marks explicit defaults and compatibility aliases for canonical URL replacement', () => {
    const decoded = decodePricePerformanceState(
      new URLSearchParams('lane=overall&basis=output&costBasis=output&evidence=supported&variants=one-per-family&status=current&scale=linear'),
      capabilities,
    );

    expect(decoded.state).toEqual({ ...DEFAULT_PRICE_PERFORMANCE_STATE, evidenceStatus: 'supported' });
    expect(decoded.wasNormalized).toBe(true);
  });

  it('round-trips supported filters in stable canonical URL order', () => {
    const selected = state({
      lane: 'coding',
      costBasis: 'blended-3-1',
      creator: 'OpenAI',
      sourceType: 'Proprietary',
      priceBand: [1, 8],
      evidenceStatus: 'supported',
      variants: 'all-variants',
      status: 'archived',
      scale: 'linear',
    });
    const encoded = encodePricePerformanceState(selected);
    expect(encoded.toString()).toBe('basis=blended-3-1&creator=OpenAI&evidenceStatus=supported&lane=coding&maxPrice=8&minPrice=1&sourceType=Proprietary&status=archived&variants=all-variants');
    expect(decodePricePerformanceState(encoded, capabilities)).toEqual({ state: selected, wasNormalized: false });
    expect(pricePerformanceUrl(selected)).toBe('/llm-price-performance/?basis=blended-3-1&creator=OpenAI&evidenceStatus=supported&lane=coding&maxPrice=8&minPrice=1&sourceType=Proprietary&status=archived&variants=all-variants');
  });

  it('drops contradictory, negative, and capability-incompatible values', () => {
    const decoded = decodePricePerformanceState(
      new URLSearchParams('basis=output&minPrice=9&maxPrice=2&creator=Anthropic&sourceType=Unknown&evidenceStatus=estimated&status=archived'),
      capabilities,
    );
    expect(decoded.state).toEqual({
      ...DEFAULT_PRICE_PERFORMANCE_STATE,
      creator: 'Anthropic',
      sourceType: 'Unknown',
      evidenceStatus: 'estimated',
      status: 'archived',
    });
    expect(decoded.wasNormalized).toBe(true);

    expect(normalizePricePerformanceState(state({ creator: 'Missing' }), capabilities)).toEqual(DEFAULT_PRICE_PERFORMANCE_STATE);
  });

  it('normalizes log scale when a displayed set contains a zero or unavailable cost', () => {
    expect(normalizePricePerformanceState(state({ scale: 'log' }), capabilities, [0, 2])).toEqual(DEFAULT_PRICE_PERFORMANCE_STATE);
    expect(normalizePricePerformanceState(state({ scale: 'log' }), capabilities, [1, 2]).scale).toBe('log');
  });
});
