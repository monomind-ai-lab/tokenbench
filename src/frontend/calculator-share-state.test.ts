import { describe, expect, it } from 'vitest';
import type { PlanOffer } from '../catalog/contracts';
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

    expect([...params.keys()]).toEqual(['c', 'm', 'i', 'o', 'd', 'models', 'weights', 'provider', 'plan']);
    expect(params.get('c')).toBe('12');
    expect(params.get('models')).toBe(modelIds.join(','));
    expect(params.get('weights')).toBe('3334,3333,3333');
    expect(decodeCalculatorShareState(params, FRONTEND_TEST_CATALOG)).toEqual({ state: validState, wasNormalized: false });
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
