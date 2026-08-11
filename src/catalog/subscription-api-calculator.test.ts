import { describe, expect, it } from 'vitest';
import {
  calculateApiEquivalentCost,
  calculateSubscriptionApiResult,
  compareSubscriptionWithApi,
  deriveConversationWorkload,
  normalizeConversationWorkload,
} from './subscription-api-calculator';

const baseWorkload = {
  conversationsPerDay: 10,
  messagesPerConversation: 8,
  inputTokensPerMessage: 750,
  outputTokensPerMessage: 250,
  activeDaysPerMonth: 25,
};

function fixture(overrides: Partial<typeof baseWorkload> & Partial<{
  planCostMicroDollars: number;
  inputMicroDollarsPerMillion: number;
  outputMicroDollarsPerMillion: number;
}> = {}) {
  return {
    ...baseWorkload,
    planCostMicroDollars: 20_000_000,
    inputMicroDollarsPerMillion: 2_000_000,
    outputMicroDollarsPerMillion: 8_000_000,
    ...overrides,
  };
}

describe('message-level subscription versus API calculator', () => {
  it('derives message and directional-token workload exactly', () => {
    expect(deriveConversationWorkload(baseWorkload)).toEqual({
      monthlyMessages: 2_000,
      monthlyInputTokens: 1_500_000,
      monthlyOutputTokens: 500_000,
    });
  });

  it('calculates directional cost and signed comparison independently of coverage', () => {
    const derived = deriveConversationWorkload(baseWorkload);
    const apiCost = calculateApiEquivalentCost(derived, {
      inputMicroDollarsPerMillion: 2_000_000,
      outputMicroDollarsPerMillion: 8_000_000,
    });
    expect(apiCost).toEqual({
      inputCostMicroDollars: 3_000_000,
      outputCostMicroDollars: 4_000_000,
      apiCostMicroDollars: 7_000_000,
    });

    const result = calculateSubscriptionApiResult(fixture());
    expect(result.apiCostMicroDollars).toBe(7_000_000);
    expect(result.differenceMicroDollars).toBe(-13_000_000);
    expect(result.efficiencyBasisPoints).toBe(-18_571);
    expect(result.breakEvenMessagesPerDay).toBeGreaterThan(0);
    expect(result.cheaper).toBe('api');
  });

  it('keeps zero workload valid without inventing finite ratios', () => {
    const result = calculateSubscriptionApiResult(fixture({
      conversationsPerDay: 0,
      messagesPerConversation: 0,
      inputTokensPerMessage: 0,
      outputTokensPerMessage: 0,
      activeDaysPerMonth: 0,
    }));
    expect(result.apiCostMicroDollars).toBe(0);
    expect(result.differenceMicroDollars).toBe(-20_000_000);
    expect(result.efficiencyBasisPoints).toBeNull();
    expect(result.apiCostPerMessageMicroDollars).toBeNull();
    expect(result.breakEvenMessagesPerDay).toBeNull();
  });

  it('keeps zero active days valid while suppressing daily breakeven', () => {
    const result = calculateSubscriptionApiResult(fixture({ activeDaysPerMonth: 0 }));
    expect(result.apiCostMicroDollars).toBe(0);
    expect(result.apiCostPerMessageMicroDollars).toBeNull();
    expect(result.breakEvenMessagesPerDay).toBeNull();
  });

  it('handles equal costs and positive subscription efficiency', () => {
    const result = calculateSubscriptionApiResult(fixture({
      planCostMicroDollars: 7_000_000,
    }));
    expect(result.differenceMicroDollars).toBe(0);
    expect(result.efficiencyBasisPoints).toBe(0);
    expect(result.cheaper).toBe('equal');
  });

  it('rounds each directional cost before summing', () => {
    const derived = deriveConversationWorkload({
      conversationsPerDay: 1,
      messagesPerConversation: 1,
      inputTokensPerMessage: 1,
      outputTokensPerMessage: 1,
      activeDaysPerMonth: 1,
    });
    expect(calculateApiEquivalentCost(derived, {
      inputMicroDollarsPerMillion: 500_000,
      outputMicroDollarsPerMillion: 500_000,
    })).toEqual({
      inputCostMicroDollars: 1,
      outputCostMicroDollars: 1,
      apiCostMicroDollars: 2,
    });
  });

  it('accepts the documented upper workload bounds when arithmetic stays safe', () => {
    const workload = normalizeConversationWorkload({
      conversationsPerDay: 10_000,
      messagesPerConversation: 1_000,
      inputTokensPerMessage: 1,
      outputTokensPerMessage: 1,
      activeDaysPerMonth: 31,
    });
    expect(deriveConversationWorkload(workload)).toEqual({
      monthlyMessages: 310_000_000,
      monthlyInputTokens: 310_000_000,
      monthlyOutputTokens: 310_000_000,
    });
  });

  it.each([
    ['negative', { ...baseWorkload, conversationsPerDay: -1 }],
    ['non-integer', { ...baseWorkload, messagesPerConversation: 1.5 }],
    ['non-finite', { ...baseWorkload, inputTokensPerMessage: Number.POSITIVE_INFINITY }],
    ['out of bounds', { ...baseWorkload, activeDaysPerMonth: 32 }],
  ])('rejects %s workload values before multiplication', (_label, workload) => {
    expect(() => normalizeConversationWorkload(workload)).toThrow();
  });

  it('rejects unsafe API cost overflow instead of returning an imprecise number', () => {
    const derived = deriveConversationWorkload({
      conversationsPerDay: 10_000,
      messagesPerConversation: 1_000,
      inputTokensPerMessage: 1_000_000,
      outputTokensPerMessage: 1_000_000,
      activeDaysPerMonth: 31,
    });
    expect(() => calculateApiEquivalentCost(derived, {
      inputMicroDollarsPerMillion: Number.MAX_SAFE_INTEGER,
      outputMicroDollarsPerMillion: Number.MAX_SAFE_INTEGER,
    })).toThrow(/safe|overflow/i);
  });

  it('compares an already-derived workload without any capacity input', () => {
    const derived = deriveConversationWorkload(baseWorkload);
    const comparison = compareSubscriptionWithApi(7_000_000, derived, {
      inputCostMicroDollars: 3_000_000,
      outputCostMicroDollars: 4_000_000,
      apiCostMicroDollars: 7_000_000,
    });
    expect(comparison).toMatchObject({
      apiCostMicroDollars: 7_000_000,
      differenceMicroDollars: 0,
      efficiencyBasisPoints: 0,
      cheaper: 'equal',
    });
  });
});
