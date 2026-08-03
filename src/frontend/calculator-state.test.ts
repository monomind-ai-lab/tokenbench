import { describe, expect, it } from 'vitest';
import { FRONTEND_TEST_CATALOG } from './test-fixtures';
import {
  applyWorkloadPreset,
  buildCalculatorSnapshot,
  createInitialSelection,
  groupOffersByBasis,
} from './calculator-state';

describe('frontend calculator state', () => {
  it('initializes a proportional multi-model selection from verified offers', () => {
    const offers = FRONTEND_TEST_CATALOG.modelOffers;
    const selection = createInitialSelection(offers);
    expect(selection.selectedModelIds).toEqual(offers.map((offer) => offer.id));
    expect(selection.modelMixBasisPoints).toEqual({
      [offers[0].id]: 3333,
      [offers[1].id]: 3333,
      [offers[2].id]: 3334,
    });
  });

  it('applies editable balanced, input-heavy, and output-heavy presets', () => {
    expect(applyWorkloadPreset('balanced')).toMatchObject({ inputShareBasisPoints: 5000 });
    expect(applyWorkloadPreset('input-heavy')).toMatchObject({ inputShareBasisPoints: 8000 });
    expect(applyWorkloadPreset('output-heavy')).toMatchObject({ inputShareBasisPoints: 3000 });
  });

  it('derives the current API value, break-even, and fixed-plan maximum from state', () => {
    const selection = createInitialSelection(FRONTEND_TEST_CATALOG.modelOffers);
    const snapshot = buildCalculatorSnapshot({
      modelOffers: FRONTEND_TEST_CATALOG.modelOffers,
      selectedModelIds: selection.selectedModelIds,
      modelMixBasisPoints: selection.modelMixBasisPoints,
      inputShareBasisPoints: 5000,
      monthlyTokens: 2_000_000,
      selectedPlan: FRONTEND_TEST_CATALOG.plans[1],
    });

    expect(snapshot.costPerMillionMicroDollars).toBe(4_416_475);
    expect(snapshot.apiEquivalentValueMicroDollars).toBe(8_832_950);
    expect(snapshot.breakEvenTokens).toBe(9_056_997);
    expect(snapshot.maximumPlanValueMicroDollars).toBe(44_164_750);
    expect(snapshot.chartPoints).toHaveLength(5);
  });

  it('keeps direct, OpenRouter, and OpenCode Zen pricing identities separate', () => {
    const grouped = groupOffersByBasis(FRONTEND_TEST_CATALOG.modelOffers);
    expect(grouped.direct_provider_api.map((offer) => offer.id)).toEqual(['provider-a:alpha:direct_provider']);
    expect(grouped.openrouter.map((offer) => offer.id)).toEqual(['provider-a:alpha:openrouter']);
    expect(grouped.opencode_zen.map((offer) => offer.id)).toEqual(['provider-a:alpha:opencode_zen']);
  });
});
