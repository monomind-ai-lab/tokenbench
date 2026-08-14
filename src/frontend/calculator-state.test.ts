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

function derivedCostTotal(rows: readonly { readonly kind: string; readonly valueMicroDollars: number | null }[]): number {
  return rows
    .filter((row) => row.kind === 'derived_cost')
    .reduce((total, row) => total + (row.valueMicroDollars ?? 0), 0);
}

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

  it('uses a manual monthly-token override, including zero, for the selector total until it is reset', () => {
    const offer = FRONTEND_TEST_CATALOG.modelOffers[0];
    const plan = { ...FRONTEND_TEST_CATALOG.plans[1], monthlyCostMicroDollars: 20_000_000, supportedModelIds: [offer.modelId] };
    const manual = buildCalculatorSnapshot({
      modelOffers: [offer], selectedModelIds: [offer.id], modelMixBasisPoints: { [offer.id]: 10_000 }, workload, selectedPlan: plan,
      costUsage: { characterCount: 40_000_000, charactersPerToken: 4, manualMonthlyTokens: 12_000_000, cacheReadBasisPoints: 0, cacheWriteTokens: 0, longContextTokens: 0 },
    });
    const reset = buildCalculatorSnapshot({
      modelOffers: [offer], selectedModelIds: [offer.id], modelMixBasisPoints: { [offer.id]: 10_000 }, workload, selectedPlan: plan,
      costUsage: { characterCount: 40_000_000, charactersPerToken: 4, manualMonthlyTokens: null, cacheReadBasisPoints: 0, cacheWriteTokens: 0, longContextTokens: 0 },
    });
    const zeroManual = buildCalculatorSnapshot({
      modelOffers: [offer], selectedModelIds: [offer.id], modelMixBasisPoints: { [offer.id]: 10_000 }, workload, selectedPlan: plan,
      costUsage: { characterCount: 40_000_000, charactersPerToken: 4, manualMonthlyTokens: 0, cacheReadBasisPoints: 0, cacheWriteTokens: 0, longContextTokens: 0 },
    });

    expect(manual.derivedWorkload).toEqual({ monthlyMessages: 2_000, monthlyInputTokens: 9_000_000, monthlyOutputTokens: 3_000_000 });
    expect(manual.monthlyTokens).toBe(12_000_000);
    expect(manual.apiEquivalentCost?.apiCostMicroDollars).toBe(42_000_000);
    expect(manual.comparison).toMatchObject({ differenceMicroDollars: 22_000_000, cheaper: 'subscription' });
    expect(manual.capacityEvidence.status).toBe('verified-not-covered');
    expect(reset.monthlyTokens).toBe(10_000_000);
    expect(reset.apiEquivalentCost?.apiCostMicroDollars).toBe(35_000_000);
    expect(zeroManual).toMatchObject({ monthlyTokens: 0, apiEquivalentCost: { apiCostMicroDollars: 0 } });
  });

  it('uses a positive character estimate for the same selector arithmetic while a zero estimate preserves conversation workload', () => {
    const offer = FRONTEND_TEST_CATALOG.modelOffers[0];
    const plan = { ...FRONTEND_TEST_CATALOG.plans[0], monthlyCostMicroDollars: 20_000_000, supportedModelIds: [offer.modelId] };
    const estimated = buildCalculatorSnapshot({
      modelOffers: [offer], selectedModelIds: [offer.id], modelMixBasisPoints: { [offer.id]: 10_000 }, workload, selectedPlan: plan,
      costUsage: { characterCount: 4_000_000, charactersPerToken: 4, manualMonthlyTokens: null, cacheReadBasisPoints: 0, cacheWriteTokens: 0, longContextTokens: 0 },
    });
    const unchanged = buildCalculatorSnapshot({
      modelOffers: [offer], selectedModelIds: [offer.id], modelMixBasisPoints: { [offer.id]: 10_000 }, workload, selectedPlan: plan,
      costUsage: { characterCount: 0, charactersPerToken: 4, manualMonthlyTokens: null, cacheReadBasisPoints: 0, cacheWriteTokens: 0, longContextTokens: 0 },
    });

    expect(estimated.derivedWorkload).toEqual({ monthlyMessages: 2_000, monthlyInputTokens: 750_000, monthlyOutputTokens: 250_000 });
    expect(estimated.apiEquivalentCost?.apiCostMicroDollars).toBe(3_500_000);
    expect(estimated.comparison).toMatchObject({ differenceMicroDollars: -16_500_000, cheaper: 'api' });
    expect(unchanged.derivedWorkload).toEqual({ monthlyMessages: 2_000, monthlyInputTokens: 1_500_000, monthlyOutputTokens: 500_000 });
    expect(unchanged.apiEquivalentCost?.apiCostMicroDollars).toBe(7_000_000);
  });

  it('replaces only the sourced cached-input share in the headline total, chart, and audit ledger', () => {
    const offer = { ...FRONTEND_TEST_CATALOG.modelOffers[0], cachedInputMicroDollarsPerMillion: 250_000 };
    const plan = { ...FRONTEND_TEST_CATALOG.plans[1], monthlyCostMicroDollars: 20_000_000, supportedModelIds: [offer.modelId] };
    const snapshot = buildCalculatorSnapshot({
      modelOffers: [offer], selectedModelIds: [offer.id], modelMixBasisPoints: { [offer.id]: 10_000 }, workload, selectedPlan: plan,
      costUsage: { characterCount: 0, charactersPerToken: 4, manualMonthlyTokens: null, cacheReadBasisPoints: 1_000, cacheWriteTokens: 0, longContextTokens: 0 },
    });
    const rows = buildCalculatorEvidenceLineItems(snapshot, offer, '2026-08-14T00:00:00.000Z');

    expect(snapshot.apiEquivalentCost?.apiCostMicroDollars).toBe(6_737_500);
    expect(snapshot.comparison?.differenceMicroDollars).toBe(-13_262_500);
    expect(snapshot.chartPoints[3]).toEqual({ tokens: 2_000_000, valueMicroDollars: 6_737_500 });
    expect(derivedCostTotal(rows)).toBe(6_737_500);
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Scenario input cost', valueMicroDollars: 2_700_000 }),
      expect.objectContaining({ label: 'Scenario cached-input cost', valueMicroDollars: 37_500 }),
      expect.objectContaining({ label: 'Scenario output cost', valueMicroDollars: 4_000_000 }),
    ]));
  });

  it('includes sourced cache-write and long-context costs in the same headline and breakeven arithmetic as the ledger', () => {
    const offer = {
      ...FRONTEND_TEST_CATALOG.modelOffers[0],
      cacheWriteMicroDollarsPerMillion: 400_000,
      longContextInputMicroDollarsPerMillion: 4_000_000,
      longContextOutputMicroDollarsPerMillion: 16_000_000,
    };
    const plan = { ...FRONTEND_TEST_CATALOG.plans[1], monthlyCostMicroDollars: 20_000_000, supportedModelIds: [offer.modelId] };
    const snapshot = buildCalculatorSnapshot({
      modelOffers: [offer], selectedModelIds: [offer.id], modelMixBasisPoints: { [offer.id]: 10_000 }, workload, selectedPlan: plan,
      costUsage: { characterCount: 0, charactersPerToken: 4, manualMonthlyTokens: null, cacheReadBasisPoints: 0, cacheWriteTokens: 200_000, longContextTokens: 400_000 },
    });
    const rows = buildCalculatorEvidenceLineItems(snapshot, offer, '2026-08-14T00:00:00.000Z');

    expect(snapshot.apiEquivalentCost?.apiCostMicroDollars).toBe(9_880_000);
    expect(snapshot.comparison?.differenceMicroDollars).toBe(-10_120_000);
    expect(snapshot.breakEvenTokens).toBe(4_048_583);
    expect(snapshot.chartPoints[3]).toEqual({ tokens: 2_000_000, valueMicroDollars: 9_880_000 });
    expect(derivedCostTotal(rows)).toBe(9_880_000);
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Scenario cache-write cost', valueMicroDollars: 80_000 }),
      expect.objectContaining({ label: 'Scenario long-context input cost', valueMicroDollars: 1_200_000 }),
      expect.objectContaining({ label: 'Scenario long-context output cost', valueMicroDollars: 1_600_000 }),
    ]));
  });

  it('keeps partially published route dimensions excluded without dropping their standard input from a weighted selector total', () => {
    const direct = {
      ...FRONTEND_TEST_CATALOG.modelOffers[0],
      cachedInputMicroDollarsPerMillion: 250_000,
      cacheWriteMicroDollarsPerMillion: 400_000,
      longContextInputMicroDollarsPerMillion: 4_000_000,
      longContextOutputMicroDollarsPerMillion: 16_000_000,
    };
    const hosted = FRONTEND_TEST_CATALOG.modelOffers[1];
    const snapshot = buildCalculatorSnapshot({
      modelOffers: [direct, hosted], selectedModelIds: [direct.id, hosted.id], modelMixBasisPoints: { [direct.id]: 5_000, [hosted.id]: 5_000 }, workload,
      mappingMode: 'override',
      costUsage: { characterCount: 0, charactersPerToken: 4, manualMonthlyTokens: null, cacheReadBasisPoints: 10_000, cacheWriteTokens: 1_000_000, longContextTokens: 1_000_000 },
    });
    const directRows = buildCalculatorEvidenceLineItems(snapshot, direct, '2026-08-14T00:00:00.000Z');
    const hostedRows = buildCalculatorEvidenceLineItems(snapshot, hosted, '2026-08-14T00:00:00.000Z');

    expect(snapshot.apiEquivalentCost?.apiCostMicroDollars).toBe(10_012_500);
    expect(derivedCostTotal([...directRows, ...hostedRows])).toBe(10_012_500);
    expect(hostedRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'derived_cost', label: 'Scenario input cost', valueMicroDollars: 1_875_000 }),
      expect.objectContaining({ kind: 'assumption', label: 'Cached-input price', assumption: expect.stringMatching(/unavailable.*excluded/i) }),
      expect.objectContaining({ kind: 'assumption', label: 'Cache-write price', assumption: expect.stringMatching(/unavailable.*excluded/i) }),
      expect.objectContaining({ kind: 'assumption', label: 'Long-context tier', assumption: expect.stringMatching(/unavailable.*excluded/i) }),
    ]));
  });
});
