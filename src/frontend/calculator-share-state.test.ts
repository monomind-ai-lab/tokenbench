import { describe, expect, it } from 'vitest';
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
  selectedModelIds: modelIds,
  modelMixBasisPoints: {
    'provider-a:alpha:direct_provider': 3_334,
    'provider-a:alpha:openrouter': 3_333,
    'provider-a:alpha:opencode_zen': 3_333,
  },
  inputShareBasisPoints: 5_000,
  monthlyTokens: 10_000_000,
};

describe('calculator share state', () => {
  it('round trips the calculator state through canonical, non-personal URL parameters', () => {
    const params = encodeCalculatorShareState(validState);

    expect([...params.keys()]).toEqual(['provider', 'plan', 'models', 'weights', 'input', 'tokens']);
    expect(params.get('models')).toBe(modelIds.join(','));
    expect(params.get('weights')).toBe('3334,3333,3333');
    expect(decodeCalculatorShareState(params, FRONTEND_TEST_CATALOG)).toEqual({ state: validState, wasNormalized: false });
  });

  it('ignores unknown query parameters without changing a valid state', () => {
    const params = encodeCalculatorShareState(validState);
    params.set('utm_source', 'newsletter');
    params.set('email', 'person@example.com');

    expect(decodeCalculatorShareState(params, FRONTEND_TEST_CATALOG)).toEqual({ state: validState, wasNormalized: false });
  });

  it('recovers a valid provider and model mix when a shared plan or model was removed', () => {
    const params = new URLSearchParams([
      ['provider', 'provider-a'],
      ['plan', 'removed'],
      ['models', 'provider-a:alpha:direct_provider,removed'],
      ['weights', '7000,3000'],
      ['input', '5000'],
      ['tokens', '1000000'],
      ['utm_source', 'test'],
    ]);

    expect(decodeCalculatorShareState(params, FRONTEND_TEST_CATALOG)).toEqual({
      wasNormalized: true,
      state: {
        providerId: 'provider-a',
        planId: '',
        selectedModelIds: ['provider-a:alpha:direct_provider'],
        modelMixBasisPoints: { 'provider-a:alpha:direct_provider': 10_000 },
        inputShareBasisPoints: 5_000,
        monthlyTokens: 1_000_000,
      },
    });
  });

  it('uses stable largest-remainder normalization for surviving model weights', () => {
    const params = new URLSearchParams([
      ['provider', 'provider-a'],
      ['plan', ''],
      ['models', `${modelIds.join(',')},removed`],
      ['weights', '1667,1667,1667,4999'],
      ['input', '5000'],
      ['tokens', '1000000'],
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
    ['duplicate state keys', 'provider=provider-a&provider=provider-a&plan=&models=provider-a%3Aalpha%3Adirect_provider&weights=10000&input=5000&tokens=1000000'],
    ['duplicate model IDs', 'provider=provider-a&plan=&models=provider-a%3Aalpha%3Adirect_provider%2Cprovider-a%3Aalpha%3Adirect_provider&weights=5000%2C5000&input=5000&tokens=1000000'],
    ['non-integer basis points', 'provider=provider-a&plan=&models=provider-a%3Aalpha%3Adirect_provider&weights=10000.0&input=5000&tokens=1000000'],
    ['weights that do not total 10000', 'provider=provider-a&plan=&models=provider-a%3Aalpha%3Adirect_provider&weights=9999&input=5000&tokens=1000000'],
    ['an unsafe token count', 'provider=provider-a&plan=&models=provider-a%3Aalpha%3Adirect_provider&weights=10000&input=5000&tokens=9007199254740992'],
    ['an unknown provider', 'provider=removed&plan=&models=provider-a%3Aalpha%3Adirect_provider&weights=10000&input=5000&tokens=1000000'],
    ['no surviving models', 'provider=provider-a&plan=&models=removed&weights=10000&input=5000&tokens=1000000'],
  ])('rejects %s', (_reason, encodedState) => {
    expect(decodeCalculatorShareState(new URLSearchParams(encodedState), FRONTEND_TEST_CATALOG)).toBeNull();
  });
});
