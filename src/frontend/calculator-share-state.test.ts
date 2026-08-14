import { describe, expect, it } from 'vitest';
import type { PlanOffer } from '../catalog/contracts';
import * as shareCodec from './calculator-share-state';
import { decodeCalculatorShareState, encodeCalculatorShareState, type CalculatorShareState } from './calculator-share-state';
import { FRONTEND_TEST_CATALOG } from './test-fixtures';

const modelIds = [
  'provider-a:alpha:direct_provider',
  'provider-a:alpha:openrouter',
  'provider-a:alpha:opencode_zen',
];

const validState: CalculatorShareState = {
  providerId: 'provider-a',
  planId: 'provider-a:starter',
  workload: {
    conversationsPerDay: 12,
    messagesPerConversation: 6,
    inputTokensPerMessage: 900,
    outputTokensPerMessage: 300,
    activeDaysPerMonth: 22,
  },
  selectedModelIds: modelIds,
  modelMixBasisPoints: {
    'provider-a:alpha:direct_provider': 3_334,
    'provider-a:alpha:openrouter': 3_333,
    'provider-a:alpha:opencode_zen': 3_333,
  },
  mappingMode: 'override',
};

function nonIndividualPlan(kind: 'free' | 'team'): PlanOffer {
  return {
    ...FRONTEND_TEST_CATALOG.plans[1],
    id: `provider-a:${kind}`,
    displayName: kind === 'free' ? 'Free' : 'Team',
    monthlyCostMicroDollars: kind === 'free' ? 0 : 80_000_000,
    billingCycle: 'monthly',
  };
}

describe('calculator share state', () => {
  it('round trips every primary input and explicit weighted override', () => {
    const params = encodeCalculatorShareState(validState);

    expect([...params.keys()]).toEqual(['v', 'c', 'm', 'i', 'o', 'd', 'models', 'weights', 'provider', 'plan']);
    expect(params.get('v')).toBe('2');
    expect(params.get('c')).toBe('12');
    expect(params.get('models')).toBe(modelIds.join(','));
    expect(params.get('weights')).toBe('3334,3333,3333');
    expect(decodeCalculatorShareState(params, FRONTEND_TEST_CATALOG)).toEqual({ state: validState, wasNormalized: false });
  });

  it('round trips a versioned bounded breakeven scenario without exposing arbitrary query data', () => {
    const codec = shareCodec as unknown as {
      encodeBreakevenShareState: (state: {
        calculator: CalculatorShareState;
        seats: number;
        feePerSeat: number;
        maxTokensMillions: number;
        inputShareBasisPoints: number;
        inputPricePerMillion: number | null;
        outputPricePerMillion: number | null;
        cacheReadBasisPoints: number;
        cacheWriteTokens: number;
        longContextTokens: number;
      }) => URLSearchParams;
      decodeBreakevenShareState: (params: URLSearchParams, catalog: typeof FRONTEND_TEST_CATALOG) => unknown;
    };
    const scenario = {
      calculator: validState,
      seats: 10,
      feePerSeat: 20,
      maxTokensMillions: 300,
      inputShareBasisPoints: 7500,
      inputPricePerMillion: 0.27,
      outputPricePerMillion: 1.1,
      cacheReadBasisPoints: 1000,
      cacheWriteTokens: 250000,
      longContextTokens: 0,
    } as const;

    const params = codec.encodeBreakevenShareState(scenario);

    expect(params.get('v')).toBe('2');
    expect(params.get('mode')).toBe('breakeven');
    expect(params.get('seats')).toBe('10');
    expect(params.has('email')).toBe(false);
    expect(codec.decodeBreakevenShareState(params, FRONTEND_TEST_CATALOG)).toEqual({ state: scenario, wasNormalized: false });
  });

  it('keeps supported cache, long-context, character estimate, and manual override inputs in a calculator v2 link', () => {
    const calculator = {
      ...validState,
      costUsage: { characterCount: 40_000, charactersPerToken: 4, manualMonthlyTokens: 8_500, cacheReadBasisPoints: 1_000, cacheWriteTokens: 250_000, longContextTokens: 0 },
    } as unknown as CalculatorShareState;

    const params = encodeCalculatorShareState(calculator);

    expect(params.get('chars')).toBe('40000');
    expect(params.get('factor')).toBe('4');
    expect(params.get('manual')).toBe('8500');
    expect(params.get('cache_read')).toBe('1000');
    expect(params.get('cache_write')).toBe('250000');
    expect(params.get('long_context')).toBe('0');
    expect(decodeCalculatorShareState(params, FRONTEND_TEST_CATALOG)).toMatchObject({
      state: { costUsage: { characterCount: 40_000, charactersPerToken: 4, manualMonthlyTokens: 8_500, cacheReadBasisPoints: 1_000, cacheWriteTokens: 250_000, longContextTokens: 0 } },
    });
  });

  it('ignores unrelated campaign parameters without changing a valid state', () => {
    const params = encodeCalculatorShareState(validState);
    params.set('utm_source', 'newsletter');
    params.set('email', 'not-used@example.test');

    expect(decodeCalculatorShareState(params, FRONTEND_TEST_CATALOG)).toEqual({ state: validState, wasNormalized: false });
  });

  it('recovers a valid provider and model mix when a shared plan or model was removed', () => {
    const params = new URLSearchParams([
      ['provider', 'provider-a'],
      ['plan', 'removed'],
      ['c', '1'],
      ['m', '1'],
      ['i', '1000'],
      ['o', '1000'],
      ['d', '30'],
      ['models', 'provider-a:alpha:direct_provider,removed'],
      ['weights', '7000,3000'],
    ]);

    expect(decodeCalculatorShareState(params, FRONTEND_TEST_CATALOG)).toEqual({
      wasNormalized: true,
      state: {
        providerId: 'provider-a',
        planId: '',
        workload: { conversationsPerDay: 1, messagesPerConversation: 1, inputTokensPerMessage: 1000, outputTokensPerMessage: 1000, activeDaysPerMonth: 30 },
        selectedModelIds: ['provider-a:alpha:direct_provider'],
        modelMixBasisPoints: { 'provider-a:alpha:direct_provider': 10_000 },
        mappingMode: 'default',
      },
    });
  });

  it('normalizes an obsolete legacy token URL without throwing', () => {
    const decoded = decodeCalculatorShareState(new URLSearchParams('provider=provider-a&plan=provider-a%3Astarter&models=provider-a%3Aalpha%3Adirect_provider&weights=10000&input=5000&tokens=10000000'), FRONTEND_TEST_CATALOG);
    expect(decoded?.wasNormalized).toBe(true);
    expect(decoded?.state.workload.activeDaysPerMonth).toBe(30);
    expect(decoded?.state.workload.conversationsPerDay).toBeGreaterThanOrEqual(0);
  });

  it.each(['free', 'team'] as const)('normalizes a shared %s plan to no selected plan', (kind) => {
    const excludedPlan = nonIndividualPlan(kind);
    const catalog = { ...FRONTEND_TEST_CATALOG, plans: [...FRONTEND_TEST_CATALOG.plans, excludedPlan] };
    const params = encodeCalculatorShareState({ ...validState, planId: excludedPlan.id });

    expect(decodeCalculatorShareState(params, catalog)).toMatchObject({
      wasNormalized: true,
      state: { planId: '' },
    });
  });

  it('uses stable largest-remainder normalization for surviving model weights', () => {
    const params = new URLSearchParams([
      ['provider', 'provider-a'],
      ['plan', ''],
      ['c', '1'],
      ['m', '1'],
      ['i', '1000'],
      ['o', '1000'],
      ['d', '30'],
      ['models', `${modelIds.join(',')},removed`],
      ['weights', '1667,1667,1667,4999'],
    ]);

    expect(decodeCalculatorShareState(params, FRONTEND_TEST_CATALOG)).toMatchObject({
      wasNormalized: true,
      state: {
        selectedModelIds: modelIds,
        modelMixBasisPoints: {
          'provider-a:alpha:direct_provider': 3_334,
          'provider-a:alpha:openrouter': 3_333,
          'provider-a:alpha:opencode_zen': 3_333,
        },
      },
    });
  });

  it.each([
    ['duplicate state keys', 'provider=provider-a&provider=provider-a&plan=&c=1&m=1&i=1&o=1&d=1&models=provider-a%3Aalpha%3Adirect_provider&weights=10000'],
    ['duplicate model IDs', 'provider=provider-a&plan=&c=1&m=1&i=1&o=1&d=1&models=provider-a%3Aalpha%3Adirect_provider%2Cprovider-a%3Aalpha%3Adirect_provider&weights=5000%2C5000'],
    ['non-integer workload input', 'provider=provider-a&plan=&c=1.0&m=1&i=1&o=1&d=1&models=provider-a%3Aalpha%3Adirect_provider&weights=10000'],
    ['weights that do not total 10000', 'provider=provider-a&plan=&c=1&m=1&i=1&o=1&d=1&models=provider-a%3Aalpha%3Adirect_provider&weights=9999'],
    ['an unsafe workload input', 'provider=provider-a&plan=&c=1&m=1&i=9007199254740992&o=1&d=1&models=provider-a%3Aalpha%3Adirect_provider&weights=10000'],
    ['an unknown provider', 'provider=removed&plan=&c=1&m=1&i=1&o=1&d=1&models=provider-a%3Aalpha%3Adirect_provider&weights=10000'],
    ['no surviving models', 'provider=provider-a&plan=&c=1&m=1&i=1&o=1&d=1&models=removed&weights=10000'],
  ])('rejects %s', (_reason, encodedState) => {
    expect(decodeCalculatorShareState(new URLSearchParams(encodedState), FRONTEND_TEST_CATALOG)).toBeNull();
  });
});
