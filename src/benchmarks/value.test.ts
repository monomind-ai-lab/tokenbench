import { describe, expect, it } from 'vitest';
import type { BenchmarkPriceCheck } from './contracts';
import {
  BUDGET_BANDS,
  LONG_CONTEXT_SCENARIOS,
  blendedCostPerMillion,
  isWithinBudget,
  longContextExamples,
  paretoFrontier,
  primaryHostedPriceForModel,
  type ValueCandidate,
} from './value';

function price(overrides: Partial<BenchmarkPriceCheck> = {}): BenchmarkPriceCheck {
  return {
    modelKey: 'model-a',
    sourceId: 'openrouter',
    providerId: 'openrouter',
    inputUsdPerMillion: 1,
    cachedInputUsdPerMillion: null,
    outputUsdPerMillion: 5,
    contextWindowTokens: 2_000_000,
    verificationStatus: 'primary',
    routeId: 'openrouter:model-a',
    sourceModelId: 'model-a',
    canonicalSlug: 'model-a',
    maxInputTokens: null,
    maxOutputTokens: null,
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportedParameters: null,
    sourceArtifactId: 'catalog-models',
    ...overrides,
  };
}

describe('workload costs', () => {
  it('uses the disclosed workload shares for a blended million-token cost', () => {
    expect(blendedCostPerMillion(1, 5, 'balanced')).toBe(2);
    expect(blendedCostPerMillion(1, 5, 'inputHeavy')).toBe(1.4);
    expect(blendedCostPerMillion(1, 5, 'outputHeavy')).toBe(3);
  });

  it('rejects non-finite or negative money instead of treating it as a price', () => {
    expect(() => blendedCostPerMillion(Number.NaN, 1, 'balanced')).toThrow(/finite/i);
    expect(() => blendedCostPerMillion(-1, 1, 'balanced')).toThrow(/non-negative/i);
    expect(() => blendedCostPerMillion(1, Number.POSITIVE_INFINITY, 'balanced')).toThrow(/finite/i);
  });

  it('uses only an explicit primary hosted route for a cost-derived value', () => {
    const selfHostedZero = price({
      sourceId: 'benchlm',
      routeId: 'benchlm:model-a',
      inputUsdPerMillion: 0,
      outputUsdPerMillion: 0,
    });
    const corroboratingRoute = price({
      sourceId: 'litellm',
      verificationStatus: 'corroborating',
      routeId: 'litellm:model-a',
      inputUsdPerMillion: 0,
      outputUsdPerMillion: 0,
    });
    const explicitHostedZero = price({ inputUsdPerMillion: 0, outputUsdPerMillion: 0 });

    expect(primaryHostedPriceForModel('model-a', [selfHostedZero, corroboratingRoute], 'balanced')).toBeNull();
    expect(primaryHostedPriceForModel('model-a', [selfHostedZero, explicitHostedZero], 'balanced'))
      .toMatchObject({ routeId: 'openrouter:model-a', blendedCostPerMillion: 0 });
  });

  it('selects the least expensive explicit route deterministically without sorting caller input', () => {
    const expensive = price({ routeId: 'openrouter:z-route', inputUsdPerMillion: 2, outputUsdPerMillion: 6 });
    const inexpensive = price({ routeId: 'openrouter:a-route', inputUsdPerMillion: 1, outputUsdPerMillion: 5 });
    const input = [expensive, inexpensive];

    expect(primaryHostedPriceForModel('model-a', input, 'balanced')).toMatchObject({ routeId: 'openrouter:a-route' });
    expect(input.map((entry) => entry.routeId)).toEqual(['openrouter:z-route', 'openrouter:a-route']);
  });
});

describe('transparent value helpers', () => {
  it('keeps only non-dominated candidates and ends equal trade-offs by canonical slug', () => {
    const candidates: readonly ValueCandidate[] = [
      { modelKey: 'zeta', slug: 'zeta', score: 80, blendedCostPerMillion: 2 },
      { modelKey: 'beta', slug: 'beta', score: 80, blendedCostPerMillion: 2 },
      { modelKey: 'dominated', slug: 'dominated', score: 79, blendedCostPerMillion: 3 },
      { modelKey: 'economical', slug: 'economical', score: 70, blendedCostPerMillion: 1 },
    ];

    expect(paretoFrontier(candidates).map((candidate) => candidate.slug)).toEqual(['beta', 'zeta', 'economical']);
    expect(candidates.map((candidate) => candidate.slug)).toEqual(['zeta', 'beta', 'dominated', 'economical']);
  });

  it('exposes only the disclosed budget bands and never treats unavailable cost as affordable', () => {
    expect(BUDGET_BANDS).toEqual([0.5, 1, 5, 10]);
    expect(isWithinBudget(1, 1)).toBe(true);
    expect(isWithinBudget(1.000001, 1)).toBe(false);
    expect(isWithinBudget(null, 10)).toBe(false);
    expect(isWithinBudget(Number.POSITIVE_INFINITY, 10)).toBe(false);
  });

  it('marks long-context examples unavailable when the declared window cannot fit input plus output', () => {
    const hosted = primaryHostedPriceForModel('model-a', [price()], 'balanced');

    expect(LONG_CONTEXT_SCENARIOS.map((scenario) => [scenario.inputTokens, scenario.outputTokens]))
      .toEqual([[32_000, 2_000], [128_000, 2_000], [1_000_000, 2_000]]);
    expect(longContextExamples(hosted, 130_000)).toEqual([
      expect.objectContaining({ inputTokens: 32_000, outputTokens: 2_000, available: true, costUsd: 0.042 }),
      expect.objectContaining({ inputTokens: 128_000, outputTokens: 2_000, available: true, costUsd: 0.138 }),
      expect.objectContaining({ inputTokens: 1_000_000, outputTokens: 2_000, available: false, costUsd: null }),
    ]);
    expect(longContextExamples(hosted, null).every((example) => example.costUsd === null)).toBe(true);
  });
});
