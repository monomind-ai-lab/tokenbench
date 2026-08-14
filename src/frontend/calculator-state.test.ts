import { describe, expect, it } from 'vitest';
import { FRONTEND_TEST_CATALOG } from './test-fixtures';
import * as calculatorState from './calculator-state';
import {
  buildCalculatorEvidenceLineItems,
  breakEvenTokensForMonthlyCost,
  buildCalculatorSnapshot,
  calculatorCsv,
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
  it('keeps source-price and derived-cost rows distinct in CSV-safe audit output', () => {
    const offer = FRONTEND_TEST_CATALOG.modelOffers[0];
    const snapshot = buildCalculatorSnapshot({
      modelOffers: [offer], selectedModelIds: [offer.id], modelMixBasisPoints: { [offer.id]: 10_000 },
      workload, selectedPlan: FRONTEND_TEST_CATALOG.plans[1], calculationTimestamp: '2026-08-14T00:00:00.000Z',
    });

    const lineItems = buildCalculatorEvidenceLineItems(snapshot, offer, '2026-08-14T00:00:00.000Z');
    const csv = calculatorCsv(lineItems);

    expect(lineItems.find((row) => row.kind === 'source_price')?.label).toBe('Published input price');
    expect(lineItems.find((row) => row.kind === 'derived_cost')?.label).toBe('Scenario input cost');
    expect(csv).toContain('price_effective_at');
    expect(csv).toContain('assumption');
    expect(csv).not.toContain('undefined');
  });
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

  it('derives an integer-safe breakeven token count from a fixed plan cost boundary', () => {
    expect(breakEvenTokensForMonthlyCost(20_000_000, 7_000_000, 2_000_000)).toBe(5_714_286);
    expect(breakEvenTokensForMonthlyCost(40_000_000, 7_000_000, 2_000_000)).toBe(11_428_572);
    expect(breakEvenTokensForMonthlyCost(10_000_000, 3_000_000, 1_000_000)).toBe(3_333_334);
  });

  it('preserves unavailable breakeven when the workload or API cost has no positive denominator', () => {
    expect(breakEvenTokensForMonthlyCost(20_000_000, 0, 2_000_000)).toBeNull();
    expect(breakEvenTokensForMonthlyCost(20_000_000, 7_000_000, 0)).toBeNull();
    expect(breakEvenTokensForMonthlyCost(0, 7_000_000, 2_000_000)).toBe(0);
    expect(breakEvenTokensForMonthlyCost(20_000_000, 7_000_000, 2_000_000.5)).toBeNull();
  });

  it('wires the breakeven token count into the snapshot', () => {
    const directOffer = FRONTEND_TEST_CATALOG.modelOffers[0];
    const snapshot = buildCalculatorSnapshot({
      modelOffers: [directOffer],
      selectedModelIds: [directOffer.id],
      modelMixBasisPoints: { [directOffer.id]: 10_000 },
      workload,
      selectedPlan: { ...FRONTEND_TEST_CATALOG.plans[1], supportedModelIds: [directOffer.modelId] },
    });
    expect(snapshot.breakEvenTokens).toBe(11_428_572);
    expect(snapshot.breakEvenMessagesPerDay).toBeGreaterThan(0);
  });

  it('keeps breakeven tokens unavailable when no plan is selected', () => {
    const directOffer = FRONTEND_TEST_CATALOG.modelOffers[0];
    const snapshot = buildCalculatorSnapshot({
      modelOffers: [directOffer],
      selectedModelIds: [directOffer.id],
      modelMixBasisPoints: { [directOffer.id]: 10_000 },
      workload,
    });
    expect(snapshot.breakEvenTokens).toBeNull();
  });

  it('keeps breakeven tokens unavailable for a plan with variable capacity', () => {
    const directOffer = FRONTEND_TEST_CATALOG.modelOffers[0];
    const snapshot = buildCalculatorSnapshot({
      modelOffers: [directOffer],
      selectedModelIds: [directOffer.id],
      modelMixBasisPoints: { [directOffer.id]: 10_000 },
      workload,
      selectedPlan: FRONTEND_TEST_CATALOG.plans[0],
    });

    expect(snapshot.breakEvenTokens).toBeNull();
  });

  it('keeps breakeven tokens unavailable for a zero-workload snapshot', () => {
    const directOffer = FRONTEND_TEST_CATALOG.modelOffers[0];
    const snapshot = buildCalculatorSnapshot({
      modelOffers: [directOffer],
      selectedModelIds: [directOffer.id],
      modelMixBasisPoints: { [directOffer.id]: 10_000 },
      workload: {
        conversationsPerDay: 0,
        messagesPerConversation: 0,
        inputTokensPerMessage: 0,
        outputTokensPerMessage: 0,
        activeDaysPerMonth: 0,
      },
      selectedPlan: FRONTEND_TEST_CATALOG.plans[0],
    });
    expect(snapshot.breakEvenTokens).toBeNull();
  });

  it('keeps cache and long-context price dimensions explicit when only cached-input evidence is published', () => {
    const offer = {
      ...FRONTEND_TEST_CATALOG.modelOffers[0],
      cachedInputMicroDollarsPerMillion: 250_000,
    };
    const snapshot = buildCalculatorSnapshot({
      modelOffers: [offer], selectedModelIds: [offer.id], modelMixBasisPoints: { [offer.id]: 10_000 }, workload,
    });

    const rows = buildCalculatorEvidenceLineItems(snapshot, offer, '2026-08-14T00:00:00.000Z');

    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'source_price', label: 'Published cached-input price', valueMicroDollars: 250_000 }),
      expect.objectContaining({ kind: 'assumption', label: 'Cache-write price', valueMicroDollars: null, assumption: expect.stringMatching(/unavailable.*excluded/i) }),
      expect.objectContaining({ kind: 'assumption', label: 'Long-context tier', valueMicroDollars: null, assumption: expect.stringMatching(/unavailable.*excluded/i) }),
    ]));
  });

  it('applies the published cached-input rate only to the configured cache-read token share', () => {
    const offer = { ...FRONTEND_TEST_CATALOG.modelOffers[0], cachedInputMicroDollarsPerMillion: 250_000 };
    const snapshot = buildCalculatorSnapshot({
      modelOffers: [offer], selectedModelIds: [offer.id], modelMixBasisPoints: { [offer.id]: 10_000 }, workload,
      costUsage: { characterCount: 0, charactersPerToken: 4, manualMonthlyTokens: null, cacheReadBasisPoints: 1_000, cacheWriteTokens: 0, longContextTokens: 0 },
    });

    const rows = buildCalculatorEvidenceLineItems(snapshot, offer, '2026-08-14T00:00:00.000Z');

    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'derived_cost', label: 'Scenario input cost', valueMicroDollars: 2_700_000 }),
      expect.objectContaining({ kind: 'derived_cost', label: 'Scenario cached-input cost', valueMicroDollars: 37_500 }),
    ]));
  });

  it('keeps a manual token override authoritative over a disclosed character estimate until reset', () => {
    const estimator = calculatorState as unknown as {
      resolveMonthlyTokenEstimate: (input: { characterCount: number; charactersPerToken: number; manualMonthlyTokens: number | null }) => { tokens: number; source: 'estimate' | 'manual' };
    };

    expect(estimator.resolveMonthlyTokenEstimate({ characterCount: 40_000, charactersPerToken: 4, manualMonthlyTokens: null })).toEqual({ tokens: 10_000, source: 'estimate' });
    expect(estimator.resolveMonthlyTokenEstimate({ characterCount: 40_000, charactersPerToken: 4, manualMonthlyTokens: 8_500 })).toEqual({ tokens: 8_500, source: 'manual' });
  });
});
