import { describe, expect, it } from 'vitest';
import { FRONTEND_TEST_CATALOG } from './test-fixtures';
import {
  buildCalculatorSnapshot,
  createEvenMix,
  createInitialSelection,
  groupOffersByBasis,
} from './calculator-state';

const workload = {
  conversationsPerDay: 10,
  messagesPerConversation: 8,
  inputTokensPerMessage: 750,
  outputTokensPerMessage: 250,
  activeDaysPerMonth: 25,
};

describe('frontend calculator state', () => {
  it('initializes an explicit model selection with a complete mix', () => {
    const offers = [FRONTEND_TEST_CATALOG.modelOffers[0]];
    const selection = createInitialSelection(offers);
    expect(selection.selectedModelIds).toEqual([offers[0].id]);
    expect(selection.modelMixBasisPoints).toEqual({ [offers[0].id]: 10_000 });
  });

  it('keeps model mix normalization deterministic', () => {
    expect(createEvenMix(['a', 'b', 'c'])).toEqual({ a: 3_333, b: 3_333, c: 3_334 });
  });

  it('builds arithmetic and capacity evidence as independent snapshot results', () => {
    const directOffer = FRONTEND_TEST_CATALOG.modelOffers[0];
    const snapshot = buildCalculatorSnapshot({
      modelOffers: [directOffer],
      selectedModelIds: [directOffer.id],
      modelMixBasisPoints: { [directOffer.id]: 10_000 },
      workload,
      selectedPlan: FRONTEND_TEST_CATALOG.plans[0],
    });

    expect(snapshot.derivedWorkload).toEqual({
      monthlyMessages: 2_000,
      monthlyInputTokens: 1_500_000,
      monthlyOutputTokens: 500_000,
    });
    expect(snapshot.apiEquivalentCost?.apiCostMicroDollars).toBe(7_000_000);
    expect(snapshot.comparison?.differenceMicroDollars).toBe(-13_000_000);
    expect(snapshot.apiMapping.defaultOffer?.id).toBe(directOffer.id);
    expect(snapshot.apiMapping.mode).toBe('default');
    expect(snapshot.capacityEvidence.status).toBe('not-verified');
    expect(snapshot.capacityEvidence.explanation).toBe('The plan does not publish access to one or more selected models.');
  });

  it('does not suppress arithmetic when verified capacity is unavailable', () => {
    const directOffer = FRONTEND_TEST_CATALOG.modelOffers[0];
    const snapshot = buildCalculatorSnapshot({
      modelOffers: [directOffer],
      selectedModelIds: [directOffer.id],
      modelMixBasisPoints: { [directOffer.id]: 10_000 },
      workload,
      selectedPlan: { ...FRONTEND_TEST_CATALOG.plans[1], monthlyCostMicroDollars: 20_000_000, supportedModelIds: [directOffer.modelId] },
    });

    expect(snapshot.apiEquivalentCost?.apiCostMicroDollars).toBe(7_000_000);
    expect(snapshot.comparison?.efficiencyBasisPoints).toBe(-18_571);
    expect(snapshot.capacityEvidence.status).toBe('verified-covered');
  });

  it('keeps direct, OpenRouter, and OpenCode Zen pricing identities separate', () => {
    const grouped = groupOffersByBasis(FRONTEND_TEST_CATALOG.modelOffers);
    expect(grouped.direct_provider_api.map((offer) => offer.id)).toEqual(['provider-a:alpha:direct_provider']);
    expect(grouped.openrouter.map((offer) => offer.id)).toEqual(['provider-a:alpha:openrouter']);
    expect(grouped.opencode_zen.map((offer) => offer.id)).toEqual(['provider-a:alpha:opencode_zen']);
  });
});
