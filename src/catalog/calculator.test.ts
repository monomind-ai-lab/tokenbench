import { describe, expect, it } from 'vitest';
import {
  breakEvenTokens,
  maximumPlanValueMicroDollars,
  monthlyApiCostMicroDollars,
  redistributeModelMix,
  recommendCostFirst,
  weightedModelCost,
} from './calculator';

const alpha = {
  id: 'openai:gpt-alpha:direct',
  providerId: 'openai',
  displayName: 'GPT Alpha',
  modelId: 'gpt-alpha',
  pricingBasis: 'direct_provider_api' as const,
  route: 'direct_provider' as const,
  currency: 'USD' as const,
  unit: 'micro_dollars_per_million_tokens' as const,
  inputMicroDollarsPerMillion: 2_000_000,
  outputMicroDollarsPerMillion: 8_000_000,
  sourceId: 'openai-api',
};

const beta = {
  ...alpha,
  id: 'anthropic:claude-beta:direct',
  providerId: 'anthropic',
  displayName: 'Claude Beta',
  modelId: 'claude-beta',
  inputMicroDollarsPerMillion: 4_000_000,
  outputMicroDollarsPerMillion: 12_000_000,
};

describe('catalog calculator', () => {
  it('calculates a weighted input/output model cost using integer micro-dollars', () => {
    expect(weightedModelCost([
      { model: alpha, shareBasisPoints: 7_500 },
      { model: beta, shareBasisPoints: 2_500 },
    ], 2_500)).toBe(7_375_000);
  });

  it('rounds monthly API cost to the nearest micro-dollar', () => {
    expect(monthlyApiCostMicroDollars(7_375_000, 3_000_000)).toBe(22_125_000);
  });

  it('returns the break-even token count at a fixed plan cost boundary', () => {
    expect(breakEvenTokens(20_000_000, 4_000_000)).toBe(5_000_000);
    expect(breakEvenTokens(20_000_000, 0)).toBeNull();
    expect(breakEvenTokens(10_000_000, 3_000_000)).toBe(3_333_334);
  });

  it('suppresses maximum plan value for variable entitlements', () => {
    expect(maximumPlanValueMicroDollars(
      { kind: 'fixed_tokens', monthlyTokens: 10_000_000 },
      7_000_000,
    )).toBe(70_000_000);
    expect(maximumPlanValueMicroDollars(
      { kind: 'guardrail_limited', description: 'Fair-use safeguards' },
      7_000_000,
    )).toBeNull();
  });

  it('redistributes model shares proportionally and preserves 10,000 basis points', () => {
    expect(redistributeModelMix({ alpha: 6_000, beta: 3_000, gamma: 1_000 }, 'alpha', 5_000))
      .toEqual({ alpha: 5_000, beta: 3_750, gamma: 1_250 });
  });

  it('rejects incomplete mixes and invalid redistribution targets', () => {
    expect(() => weightedModelCost([{ model: alpha, shareBasisPoints: 9_999 }], 5_000))
      .toThrow('Model mix must total 10,000 basis points');
    expect(() => redistributeModelMix({ alpha: 10_000 }, 'alpha', 9_000))
      .toThrow('A single-model mix must remain at 10,000 basis points');
    expect(() => redistributeModelMix({ alpha: 10_000 }, 'missing', 5_000))
      .toThrow('Changed model must exist in the current mix');
  });

  it('recommends the lowest monthly cost and surfaces variable entitlement caveats', () => {
    expect(recommendCostFirst([
      { id: 'openai:plus', monthlyCostMicroDollars: 20_000_000, entitlement: { kind: 'rolling_limit', description: 'Rolling limit' } },
      { id: 'anthropic:pro', monthlyCostMicroDollars: 25_000_000, entitlement: { kind: 'fixed_tokens', monthlyTokens: 10_000_000 } },
    ])).toEqual({
      recommendedPlanId: 'openai:plus',
      caveats: ['openai:plus has a variable usage limit; no maximum plan value is calculated.'],
    });
  });
});
