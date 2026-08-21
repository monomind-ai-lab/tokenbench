import { describe, expect, it } from 'vitest';
import type { EvidenceValue, SourceAttribution } from './ui-data-contract-v1-core';
import type { RouteFact } from './ui-data-contract-v1-models';
import {
  buildSubscriptionCalculation,
  normalizeSubscriptionRequest,
  parseSubscriptionBody,
  validateSubscriptionData,
  type EntitlementProjectionFact,
  type SubscriptionCalculationRequest,
  type SubscriptionCalculationFacts,
} from './ui-data-contract-v1-subscription';

const source: SourceAttribution = {
  sourceRef: 'provider:pricing-2026-08-18',
  fieldGroup: '/data/subscription',
  sourceId: 'provider',
  sourceRevision: 'pricing-2026-08-18',
  label: 'Provider pricing',
  url: 'https://example.test/pricing',
  licenseId: 'provider-terms',
  observedAt: '2026-08-18T00:00:00.000Z',
  effectiveAt: '2026-08-18T00:00:00.000Z',
};

const sources = [source] as const;

function available<T>(value: T): EvidenceValue<T> {
  return { availability: 'available', value, sourceRefs: [source.sourceRef] };
}

function route(routeId: string, rates: {
  readonly input: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
  readonly output: number;
}): RouteFact {
  return {
    routeId,
    providerId: 'provider',
    status: 'available',
    inputMicroDollarsPerMillion: available(rates.input),
    outputMicroDollarsPerMillion: available(rates.output),
    cacheReadMicroDollarsPerMillion: available(rates.cacheRead),
    cacheWriteMicroDollarsPerMillion: available(rates.cacheWrite),
    contextWindowTokens: available(128_000),
    maxOutputTokens: available(16_384),
    inputModalities: ['text'],
    outputModalities: ['text'],
    ttftP50Ms: available(200),
    tpsP50: available(100),
    uptimeBasisPoints: available(9_999),
    runtimeObservation: available({
      windowStartedAt: '2026-08-17T00:00:00.000Z',
      windowEndedAt: '2026-08-18T00:00:00.000Z',
      sampleSize: 100,
      ttftPercentile: 'p50',
      tpsPercentile: 'p50',
    }),
    pricingTiers: [{
      pricingTierId: `${routeId}-standard`,
      minimumContextTokens: 0,
      maximumContextTokens: null,
      inputMicroDollarsPerMillion: available(rates.input),
      outputMicroDollarsPerMillion: available(rates.output),
      cacheReadMicroDollarsPerMillion: available(rates.cacheRead),
      cacheWriteMicroDollarsPerMillion: available(rates.cacheWrite),
    }],
  };
}

const alphaRoute = route('route-a', {
  input: 2_000_000,
  cacheRead: 500_000,
  cacheWrite: 1_000_000,
  output: 8_000_000,
});
const betaRoute = route('route-b', {
  input: 3_000_000,
  cacheRead: 1_000_000,
  cacheWrite: 2_000_000,
  output: 9_000_000,
});

const entitlement: EntitlementProjectionFact = {
  projectionId: 'provider-pro',
  planId: 'pro',
  evidenceState: 'projected',
  formula: 'Provider plan capacity is evaluated against the selected workload.',
  assumptions: ['Published provider plan terms remain current.'],
  caveats: ['Provider limits may change without notice.'],
  confidence: 'medium',
  boundType: 'practical_upper',
  projectedCapacity: {
    minimum: 1_000,
    maximum: 2_000,
    unit: 'messages',
    window: 'monthly',
  },
  workloadShape: {
    conversationsPerDay: 10,
    messagesPerConversation: 5,
    inputTokensPerMessage: 1_000,
    outputTokensPerMessage: 500,
    activeDaysPerMonth: 20,
    cacheReadShareBasisPoints: 2_000,
    cacheWriteShareBasisPoints: 1_000,
  },
  sensitivity: {
    minimum: 800,
    maximum: 2_500,
    unit: 'messages',
  },
  methodologyVersion: 'subscription-v1',
  effectiveAt: source.effectiveAt,
  sourceRefs: [source.sourceRef],
};

const calculationFacts: SubscriptionCalculationFacts = {
  plans: [{
    planId: 'pro',
    providerId: 'provider',
    displayName: 'Provider Pro',
    monthlyCostMicroDollars: 20_000_000,
    supportedModelSlugs: ['alpha', 'beta'],
    sourceRefs: [source.sourceRef],
  }],
  routes: [alphaRoute, betaRoute],
  routeBindings: [
    { routeId: 'route-a', modelSlug: 'alpha', providerId: 'provider' },
    { routeId: 'route-b', modelSlug: 'beta', providerId: 'provider' },
  ],
  entitlementProjections: [entitlement],
  methodologyVersion: 'subscription-v1',
};

function mix(modelSlug: string, routeId: string, shareBasisPoints: number) {
  return {
    modelSlug,
    routeId,
    pricingTierId: null,
    tierContextTokens: 32_000,
    shareBasisPoints,
  };
}

function calculateRequest(overrides: Partial<{
  readonly planId: string;
  readonly seats: number;
  readonly modelMix: readonly ReturnType<typeof mix>[];
  readonly workload: {
    readonly conversationsPerDay: number;
    readonly messagesPerConversation: number;
    readonly inputTokensPerMessage: number;
    readonly outputTokensPerMessage: number;
    readonly activeDaysPerMonth: number;
  };
  readonly cacheReadShareBasisPoints: number;
  readonly cacheWriteShareBasisPoints: number;
  readonly crossoverTokenVolume: number;
}> = {}) {
  return {
    operation: 'calculate' as const,
    planId: 'pro',
    seats: 1,
    modelMix: [mix('alpha', 'route-a', 6_000), mix('beta', 'route-b', 4_000)],
    workload: {
      conversationsPerDay: 10,
      messagesPerConversation: 5,
      inputTokensPerMessage: 1_000,
      outputTokensPerMessage: 500,
      activeDaysPerMonth: 20,
    },
    cacheReadShareBasisPoints: 2_000,
    cacheWriteShareBasisPoints: 1_000,
    crossoverTokenVolume: 40_000_000,
    ...overrides,
  };
}

function normalizedCalculate(overrides: Parameters<typeof calculateRequest>[0] = {}): SubscriptionCalculationRequest {
  const request = normalizeSubscriptionRequest(calculateRequest(overrides));
  if (request.operation !== 'calculate') throw new Error('Expected a calculation request.');
  return request;
}

function projectionForRequest(
  request: SubscriptionCalculationRequest,
  overrides: Partial<EntitlementProjectionFact> = {},
): EntitlementProjectionFact {
  return {
    ...entitlement,
    workloadShape: {
      ...request.workload,
      cacheReadShareBasisPoints: request.cacheReadShareBasisPoints,
      cacheWriteShareBasisPoints: request.cacheWriteShareBasisPoints,
    },
    ...overrides,
  };
}

function routeBindingsFor(request: SubscriptionCalculationRequest, routes: readonly RouteFact[]) {
  return routes.map((route) => ({
    routeId: route.routeId,
    modelSlug: request.modelMix.find((mix) => mix.routeId === route.routeId)?.modelSlug ?? 'unbound',
    providerId: route.providerId,
  }));
}

function factsForRequest(
  request: SubscriptionCalculationRequest,
  overrides: Partial<SubscriptionCalculationFacts> & {
    readonly monthlyCostMicroDollars?: number;
  } = {},
): SubscriptionCalculationFacts {
  const routes = overrides.routes ?? calculationFacts.routes;
  return {
    plans: overrides.plans ?? [{
      ...calculationFacts.plans[0],
      planId: request.planId,
      monthlyCostMicroDollars: overrides.monthlyCostMicroDollars ?? calculationFacts.plans[0].monthlyCostMicroDollars,
      supportedModelSlugs: [...new Set(request.modelMix.map((item) => item.modelSlug))],
    }],
    routes,
    routeBindings: overrides.routeBindings ?? routeBindingsFor(request, routes),
    entitlementProjections: overrides.entitlementProjections ?? [projectionForRequest(request)],
    methodologyVersion: overrides.methodologyVersion ?? calculationFacts.methodologyVersion,
  };
}

function dataForCalculation(request: SubscriptionCalculationRequest, facts: SubscriptionCalculationFacts) {
  return {
    operation: 'calculate' as const,
    plans: facts.plans,
    routes: facts.routes,
    routeBindings: facts.routeBindings,
    entitlementProjections: facts.entitlementProjections,
    calculation: buildSubscriptionCalculation(request, facts),
  };
}

describe('UI data contract v1 subscription', () => {
  it('normalizes catalog requests and requires null catalog calculations', () => {
    const request = normalizeSubscriptionRequest({ operation: 'catalog' });
    const data = {
      operation: 'catalog' as const,
      plans: calculationFacts.plans,
      routes: calculationFacts.routes,
      routeBindings: calculationFacts.routeBindings,
      entitlementProjections: calculationFacts.entitlementProjections,
      calculation: null,
    };

    expect(request).toEqual({ operation: 'catalog' });
    expect(validateSubscriptionData(request, data, sources)).toEqual(data);
    expect(() => parseSubscriptionBody(new TextEncoder().encode(JSON.stringify(request))))
      .toThrowError(expect.objectContaining({ code: 'invalid_request' }));
    expect(() => validateSubscriptionData(request, { ...data, calculation: {} }, sources))
      .toThrowError(expect.objectContaining({ code: 'invalid_response' }));
  });

  it('requires an exact one-to-one subscription route binding for each offer ID', () => {
    const request = normalizedCalculate();
    const data = dataForCalculation(request, factsForRequest(request));

    expect(validateSubscriptionData(request, data, sources)).toEqual(data);
    expect(() => validateSubscriptionData(request, {
      ...data,
      routeBindings: data.routeBindings.map((binding) => (
        binding.routeId === 'route-a' ? { ...binding, modelSlug: 'beta' } : binding
      )),
    }, sources)).toThrowError(expect.objectContaining({ code: 'invalid_response' }));
    expect(() => validateSubscriptionData(request, {
      ...data,
      routeBindings: data.routeBindings.slice(1),
    }, sources)).toThrowError(expect.objectContaining({ code: 'invalid_response' }));
    expect(() => validateSubscriptionData(request, {
      ...data,
      routeBindings: data.routeBindings.map((binding) => ({ ...binding, providerId: 'other-provider' })),
    }, sources)).toThrowError(expect.objectContaining({ code: 'invalid_response' }));
  });

  it('accepts exact seat and workload bounds and rejects values outside them', () => {
    expect(normalizedCalculate({ seats: 1 }).seats).toBe(1);
    expect(normalizedCalculate({ seats: 50 }).seats).toBe(50);
    expect(normalizedCalculate({
      workload: {
        conversationsPerDay: 10_000,
        messagesPerConversation: 1_000,
        inputTokensPerMessage: 1_000_000,
        outputTokensPerMessage: 1_000_000,
        activeDaysPerMonth: 31,
      },
    }).workload).toEqual({
      conversationsPerDay: 10_000,
      messagesPerConversation: 1_000,
      inputTokensPerMessage: 1_000_000,
      outputTokensPerMessage: 1_000_000,
      activeDaysPerMonth: 31,
    });
    for (const request of [
      calculateRequest({ seats: 0 }),
      calculateRequest({ seats: 51 }),
      calculateRequest({ workload: { ...calculateRequest().workload, conversationsPerDay: 10_001 } }),
      calculateRequest({ workload: { ...calculateRequest().workload, messagesPerConversation: 1_001 } }),
      calculateRequest({ workload: { ...calculateRequest().workload, inputTokensPerMessage: 1_000_001 } }),
      calculateRequest({ workload: { ...calculateRequest().workload, outputTokensPerMessage: 1_000_001 } }),
      calculateRequest({ workload: { ...calculateRequest().workload, activeDaysPerMonth: 32 } }),
    ]) expect(() => normalizeSubscriptionRequest(request)).toThrowError(expect.objectContaining({ code: 'invalid_request' }));
  });

  it('rejects duplicate model-route pairs and mixes that do not sum exactly to 10,000', () => {
    expect(() => normalizeSubscriptionRequest(calculateRequest({
      modelMix: [mix('alpha', 'route-a', 5_000), mix('alpha', 'route-a', 5_000)],
    }))).toThrowError(expect.objectContaining({ code: 'invalid_request' }));
    expect(() => normalizeSubscriptionRequest(calculateRequest({
      modelMix: [mix('alpha', 'route-a', 9_999)],
    }))).toThrowError(expect.objectContaining({ code: 'invalid_request' }));
    expect(() => normalizeSubscriptionRequest(calculateRequest({
      modelMix: [mix('alpha', 'route-a', 10_000)],
    }))).not.toThrow();
  });

  it('calculates cache and tier lines in canonical request order', () => {
    const request = normalizeSubscriptionRequest(calculateRequest({
      modelMix: [mix('alpha', 'route-a', 6_000), mix('beta', 'route-b', 4_000)],
    }));
    if (request.operation !== 'calculate') throw new Error('Expected a calculation request.');

    const result = buildSubscriptionCalculation(request, calculationFacts);

    expect(result.selectedTiers.map((item) => item.modelSlug)).toEqual(['alpha', 'beta']);
    expect(result.lineItems.map((item) => [item.modelSlug, item.kind])).toEqual([
      ['alpha', 'standard_input'], ['alpha', 'cache_read'], ['alpha', 'cache_write'], ['alpha', 'output'],
      ['beta', 'standard_input'], ['beta', 'cache_read'], ['beta', 'cache_write'], ['beta', 'output'],
    ]);
    expect(result.lineItems.map((item) => item.costMicroDollars)).toEqual([
      840_000, 60_000, 60_000, 2_400_000,
      840_000, 80_000, 80_000, 1_800_000,
    ]);
    for (const line of result.lineItems) {
      expect(line.costMicroDollars).toBe(Number(
        (BigInt(line.tokens) * BigInt(line.rateMicroDollarsPerMillion) + 500_000n) / 1_000_000n,
      ));
    }
    expect(result.monthlyApiCostMicroDollars).toBe(6_160_000);
  });

  it('keeps crossover volume out of monthly workload cost', () => {
    const lowRequest = normalizeSubscriptionRequest(calculateRequest({ crossoverTokenVolume: 25_000_000 }));
    const highRequest = normalizeSubscriptionRequest(calculateRequest({ crossoverTokenVolume: 300_000_000 }));
    if (lowRequest.operation !== 'calculate' || highRequest.operation !== 'calculate') {
      throw new Error('Expected calculation requests.');
    }

    const low = buildSubscriptionCalculation(lowRequest, calculationFacts);
    const high = buildSubscriptionCalculation(highRequest, calculationFacts);

    expect(low.monthlyApiCostMicroDollars).toBe(high.monthlyApiCostMicroDollars);
    expect(low.crossoverApiCostMicroDollars).not.toBe(high.crossoverApiCostMicroDollars);
  });

  it('bounds bodies, cache shares, and model-mix cardinality', () => {
    expect(() => parseSubscriptionBody(new Uint8Array(65_537)))
      .toThrowError(expect.objectContaining({ code: 'invalid_request' }));
    expect(() => normalizeSubscriptionRequest(calculateRequest({
      cacheReadShareBasisPoints: 6_000,
      cacheWriteShareBasisPoints: 5_000,
    }))).toThrow();
    expect(() => normalizeSubscriptionRequest(calculateRequest({
      modelMix: Array.from({ length: 17 }, (_, index) => mix(
        `model-${index}`,
        `route-${index}`,
        index === 16 ? 10_000 : 0,
      )),
    }))).toThrow();
  });

  it('orders and bounds the crossover domain', () => {
    const request = normalizeSubscriptionRequest(calculateRequest({ crossoverTokenVolume: 40_000_000 }));
    if (request.operation !== 'calculate') throw new Error('Expected a calculation request.');
    const result = buildSubscriptionCalculation(request, calculationFacts);
    const volumes = result.crossoverDomain.map((point) => point.tokenVolume);

    expect(volumes).toEqual([...volumes].sort((left, right) => left - right));
    expect(new Set(volumes).size).toBe(volumes.length);
    expect(volumes).toContain(40_000_000);
    expect(result.crossoverDomain.length).toBeGreaterThanOrEqual(8);
    expect(result.crossoverDomain.length).toBeLessThanOrEqual(10);
  });

  it('uses fixed-cycle line allocation for monotonic crossover pricing and the first crossing', () => {
    const request = normalizedCalculate({
      modelMix: [
        mix('alpha', 'route-a', 1_428),
        mix('beta', 'route-b', 4_286),
        mix('gamma', 'route-c', 4_286),
      ],
      workload: {
        conversationsPerDay: 4,
        messagesPerConversation: 1,
        inputTokensPerMessage: 1,
        outputTokensPerMessage: 0,
        activeDaysPerMonth: 1,
      },
      cacheReadShareBasisPoints: 0,
      cacheWriteShareBasisPoints: 0,
      crossoverTokenVolume: 3,
    });
    const rates = [
      route('route-a', { input: 1_000_000, cacheRead: 0, cacheWrite: 0, output: 0 }),
      route('route-b', { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }),
      route('route-c', { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }),
    ];
    const facts = factsForRequest(request, { routes: rates, monthlyCostMicroDollars: 1 });
    const results = [3, 4, 5].map((crossoverTokenVolume) => buildSubscriptionCalculation(
      { ...request, crossoverTokenVolume },
      facts,
    ));
    const localDomainCosts = Array.from({ length: 21 }, (_, crossoverTokenVolume) => buildSubscriptionCalculation(
      { ...request, crossoverTokenVolume },
      facts,
    ).crossoverApiCostMicroDollars);
    const cycleBoundaryCosts = [9_999, 10_000, 10_001].map((crossoverTokenVolume) => buildSubscriptionCalculation(
      { ...request, crossoverTokenVolume },
      facts,
    ).crossoverApiCostMicroDollars);

    expect(results.map((result) => result.crossoverApiCostMicroDollars)).toEqual([3, 4, 5]);
    expect(localDomainCosts.every((cost, index) => index === 0 || cost >= localDomainCosts[index - 1])).toBe(true);
    expect(cycleBoundaryCosts).toEqual([1_428, 1_428, 1_429]);
    expect(results[0].crossoverTokens).toBe(1);
    expect(results[0].monthlyApiCostMicroDollars).toBe(4);
    expect(results[0].lineItems.reduce((sum, item) => sum + item.costMicroDollars, 0)).toBe(4);
  });

  it('prices identical monthly and crossover token volumes through the same direction-first order', () => {
    const request = normalizedCalculate({
      modelMix: [
        mix('alpha', 'route-a', 5_000),
        mix('beta', 'route-b', 5_000),
      ],
      workload: {
        conversationsPerDay: 5_000,
        messagesPerConversation: 1,
        inputTokensPerMessage: 1,
        outputTokensPerMessage: 1,
        activeDaysPerMonth: 1,
      },
      cacheReadShareBasisPoints: 0,
      cacheWriteShareBasisPoints: 0,
      crossoverTokenVolume: 10_000,
    });
    const facts = factsForRequest(request, {
      routes: [
        route('route-a', { input: 1_000_000, cacheRead: 0, cacheWrite: 0, output: 1_000_000 }),
        route('route-b', { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }),
      ],
    });
    const result = buildSubscriptionCalculation(request, facts);

    expect(result.derivedWorkload).toEqual({
      monthlyMessages: 5_000,
      monthlyInputTokens: 5_000,
      monthlyOutputTokens: 5_000,
    });
    expect(result.monthlyApiCostMicroDollars).toBe(10_000);
    expect(result.crossoverApiCostMicroDollars).toBe(result.monthlyApiCostMicroDollars);
  });

  it('derives every line cost exactly from its displayed integer tokens and rate', () => {
    const request = normalizedCalculate({
      modelMix: [
        mix('alpha', 'route-a', 1_428),
        mix('beta', 'route-b', 4_286),
        mix('gamma', 'route-c', 4_286),
      ],
      workload: {
        conversationsPerDay: 4,
        messagesPerConversation: 1,
        inputTokensPerMessage: 1,
        outputTokensPerMessage: 0,
        activeDaysPerMonth: 1,
      },
      cacheReadShareBasisPoints: 0,
      cacheWriteShareBasisPoints: 0,
    });
    const facts = factsForRequest(request, {
      routes: [
        route('route-a', { input: 1_000_000, cacheRead: 0, cacheWrite: 0, output: 0 }),
        route('route-b', { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }),
        route('route-c', { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }),
      ],
    });
    const result = buildSubscriptionCalculation(request, facts);

    for (const line of result.lineItems) {
      const literalCost = Number(
        (BigInt(line.tokens) * BigInt(line.rateMicroDollarsPerMillion) + 500_000n) / 1_000_000n,
      );
      if (line.tokens === 0) expect(line.costMicroDollars).toBe(0);
      expect(line.costMicroDollars).toBe(literalCost);
    }
    expect(result.lineItems.reduce((sum, line) => sum + line.costMicroDollars, 0))
      .toBe(result.monthlyApiCostMicroDollars);
  });

  it('keeps the exact required eight crossover points when no extra point is needed', () => {
    const request = normalizedCalculate({ crossoverTokenVolume: 25_000_000 });
    const result = buildSubscriptionCalculation(request, factsForRequest(request, { monthlyCostMicroDollars: 0 }));

    expect(result.crossoverDomain.map((point) => point.tokenVolume)).toEqual([
      0, 25_000_000, 50_000_000, 100_000_000, 150_000_000, 200_000_000, 250_000_000, 300_000_000,
    ]);
    expect(result.crossoverTokens).toBe(0);
  });

  it('resolves named and automatic tiers at their exact context bounds', () => {
    const base = route('route-tiered', { input: 1_000_000, cacheRead: 250_000, cacheWrite: 500_000, output: 2_000_000 });
    const tieredRoute: RouteFact = {
      ...base,
      pricingTiers: [
        { ...base.pricingTiers[0], pricingTierId: 'short', minimumContextTokens: 0, maximumContextTokens: 999 },
        { ...base.pricingTiers[0], pricingTierId: 'long', minimumContextTokens: 1_000, maximumContextTokens: null },
      ],
    };
    const shortRequest = normalizedCalculate({
      modelMix: [{ ...mix('alpha', 'route-tiered', 10_000), tierContextTokens: 999 }],
    });
    const longRequest = normalizedCalculate({
      modelMix: [{ ...mix('alpha', 'route-tiered', 10_000), tierContextTokens: 1_000 }],
    });

    expect(buildSubscriptionCalculation(shortRequest, factsForRequest(shortRequest, { routes: [tieredRoute] })).selectedTiers[0].pricingTierId)
      .toBe('short');
    expect(buildSubscriptionCalculation(longRequest, factsForRequest(longRequest, { routes: [tieredRoute] })).selectedTiers[0].pricingTierId)
      .toBe('long');
    expect(() => buildSubscriptionCalculation({
      ...longRequest,
      modelMix: [{ ...longRequest.modelMix[0], pricingTierId: 'short' }],
    }, factsForRequest(longRequest, { routes: [tieredRoute] }))).toThrowError(expect.objectContaining({ code: 'invalid_request' }));
  });

  it('uses UTF-8 binary ordering to select tied Unicode tiers and their economics', () => {
    const base = route('route-unicode-tiers', { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 });
    const tieredRoute: RouteFact = {
      ...base,
      pricingTiers: [
        {
          ...base.pricingTiers[0],
          pricingTierId: 'ä-tier',
          inputMicroDollarsPerMillion: available(1_000_000),
        },
        {
          ...base.pricingTiers[0],
          pricingTierId: 'z-tier',
          inputMicroDollarsPerMillion: available(3_000_000),
        },
      ],
    };
    const request = normalizedCalculate({
      modelMix: [{ ...mix('alpha', 'route-unicode-tiers', 10_000), tierContextTokens: 32_000 }],
      workload: {
        conversationsPerDay: 1,
        messagesPerConversation: 1,
        inputTokensPerMessage: 1_000_000,
        outputTokensPerMessage: 0,
        activeDaysPerMonth: 1,
      },
      cacheReadShareBasisPoints: 0,
      cacheWriteShareBasisPoints: 0,
    });

    const result = buildSubscriptionCalculation(request, factsForRequest(request, { routes: [tieredRoute] }));

    expect(result.selectedTiers).toEqual([{
      modelSlug: 'alpha', routeId: 'route-unicode-tiers', pricingTierId: 'z-tier', tierContextTokens: 32_000,
    }]);
    expect(result.lineItems.map((line) => [line.kind, line.rateMicroDollarsPerMillion, line.costMicroDollars])).toEqual([
      ['standard_input', 3_000_000, 3_000_000],
      ['cache_read', 0, 0],
      ['cache_write', 0, 0],
      ['output', 0, 0],
    ]);
    expect(result.monthlyApiCostMicroDollars).toBe(3_000_000);
  });

  it('retains all four canonical zero lines for a zero workload', () => {
    const request = normalizedCalculate({
      modelMix: [mix('alpha', 'route-a', 10_000)],
      workload: {
        conversationsPerDay: 0,
        messagesPerConversation: 0,
        inputTokensPerMessage: 0,
        outputTokensPerMessage: 0,
        activeDaysPerMonth: 0,
      },
      cacheReadShareBasisPoints: 0,
      cacheWriteShareBasisPoints: 0,
    });
    const result = buildSubscriptionCalculation(request, factsForRequest(request, { routes: [alphaRoute] }));

    expect(result.lineItems.map((item) => item.kind)).toEqual([
      'standard_input', 'cache_read', 'cache_write', 'output',
    ]);
    expect(result.lineItems.map((item) => [item.tokens, item.costMicroDollars])).toEqual([
      [0, 0], [0, 0], [0, 0], [0, 0],
    ]);
  });

  it('rejects unresolved plans, routes, and named tiers', () => {
    const request = normalizedCalculate({ modelMix: [mix('alpha', 'route-a', 10_000)] });
    expect(() => buildSubscriptionCalculation({ ...request, planId: 'missing' }, factsForRequest(request)))
      .toThrow(/selected plan/i);
    expect(() => buildSubscriptionCalculation({
      ...request,
      modelMix: [{ ...request.modelMix[0], routeId: 'missing' }],
    }, factsForRequest(request))).toThrow(/selected route/i);
    expect(() => buildSubscriptionCalculation({
      ...request,
      modelMix: [{ ...request.modelMix[0], pricingTierId: 'missing' }],
    }, factsForRequest(request))).toThrowError(expect.objectContaining({ code: 'invalid_request' }));
  });

  it('rejects subscription and aggregate API arithmetic overflow', () => {
    const request = normalizedCalculate({
      seats: 2,
      modelMix: [mix('alpha', 'route-a', 10_000)],
    });
    expect(() => buildSubscriptionCalculation(request, factsForRequest(request, {
      monthlyCostMicroDollars: Number.MAX_SAFE_INTEGER,
      routes: [alphaRoute],
    }))).toThrow(/safe integer/i);

    const maximumRequest = normalizedCalculate({
      modelMix: [mix('alpha', 'route-a', 10_000)],
      workload: {
        conversationsPerDay: 10_000,
        messagesPerConversation: 1_000,
        inputTokensPerMessage: 1_000_000,
        outputTokensPerMessage: 1_000_000,
        activeDaysPerMonth: 31,
      },
    });
    const maximumRateRoute = route('route-a', {
      input: Number.MAX_SAFE_INTEGER,
      cacheRead: Number.MAX_SAFE_INTEGER,
      cacheWrite: Number.MAX_SAFE_INTEGER,
      output: Number.MAX_SAFE_INTEGER,
    });
    expect(() => buildSubscriptionCalculation(maximumRequest, factsForRequest(maximumRequest, {
      routes: [maximumRateRoute],
    }))).toThrow(/safe integer/i);
  });

  it('retains unavailable cache pricing as unavailable rather than zero-priced', () => {
    const unavailableCacheRoute = {
      ...alphaRoute,
      cacheReadMicroDollarsPerMillion: {
        availability: 'unavailable' as const,
        value: null,
        reason: 'The provider does not publish cache-read prices.',
        sourceRefs: [source.sourceRef],
      },
      pricingTiers: alphaRoute.pricingTiers.map((tier) => ({
        ...tier,
        cacheReadMicroDollarsPerMillion: {
          availability: 'unavailable' as const,
          value: null,
          reason: 'The provider does not publish cache-read prices.',
          sourceRefs: [source.sourceRef],
        },
      })),
    };
    const request = normalizeSubscriptionRequest(calculateRequest({
      modelMix: [mix('alpha', 'route-a', 10_000)],
    }));
    if (request.operation !== 'calculate') throw new Error('Expected a calculation request.');

    expect(() => buildSubscriptionCalculation(request, {
      ...calculationFacts,
      routes: [unavailableCacheRoute],
    })).toThrow(/cache read.*available/i);
  });

  it('permits an unavailable cache-write rate only when its allocation is exactly zero', () => {
    const unavailableCacheWriteRoute: RouteFact = {
      ...alphaRoute,
      cacheWriteMicroDollarsPerMillion: {
        availability: 'unavailable',
        value: null,
        reason: 'The provider does not publish a cache-write price.',
        sourceRefs: [source.sourceRef],
      },
      pricingTiers: alphaRoute.pricingTiers.map((tier) => ({
        ...tier,
        cacheWriteMicroDollarsPerMillion: {
          availability: 'unavailable' as const,
          value: null,
          reason: 'The provider does not publish a cache-write price.',
          sourceRefs: [source.sourceRef],
        },
      })),
    };
    const noCacheWrite = normalizedCalculate({
      modelMix: [mix('alpha', 'route-a', 10_000)],
      cacheReadShareBasisPoints: 0,
      cacheWriteShareBasisPoints: 0,
    });

    const result = buildSubscriptionCalculation(noCacheWrite, factsForRequest(noCacheWrite, {
      routes: [unavailableCacheWriteRoute],
    }));
    expect(result.lineItems.some((line) => line.kind === 'cache_write')).toBe(false);

    const positiveCacheWrite = normalizedCalculate({
      modelMix: [mix('alpha', 'route-a', 10_000)],
      cacheReadShareBasisPoints: 0,
      cacheWriteShareBasisPoints: 1,
    });
    expect(() => buildSubscriptionCalculation(positiveCacheWrite, factsForRequest(positiveCacheWrite, {
      routes: [unavailableCacheWriteRoute],
    }))).toThrow(/cache write price must be available when its allocation is positive/i);
  });

  it('rejects a projection whose workload shape differs from the calculation request', () => {
    const request = normalizeSubscriptionRequest(calculateRequest());
    if (request.operation !== 'calculate') throw new Error('Expected a calculation request.');

    expect(() => buildSubscriptionCalculation(request, {
      ...calculationFacts,
      entitlementProjections: [{
        ...entitlement,
        workloadShape: { ...entitlement.workloadShape, activeDaysPerMonth: 21 },
      }],
    })).toThrow(/workload shape.*request/i);
  });

  it('accepts projected, dynamic unknown, quantitative provider, and qualitative provider entitlements', () => {
    const request = normalizedCalculate();
    const projections: EntitlementProjectionFact[] = [
      projectionForRequest(request),
      projectionForRequest(request, {
        evidenceState: 'dynamic_unknown',
        formula: null,
        assumptions: [],
        confidence: null,
        boundType: 'unknown',
        projectedCapacity: null,
        sensitivity: { minimum: null, maximum: null, unit: 'messages' },
        effectiveAt: null,
        sourceRefs: [],
      }),
      projectionForRequest(request, {
        evidenceState: 'provider_stated',
        formula: null,
        assumptions: [],
        confidence: null,
        boundType: 'hard_max',
        projectedCapacity: { minimum: 2_000, maximum: 2_000, unit: 'messages', window: 'monthly' },
        sensitivity: { minimum: 2_000, maximum: 2_000, unit: 'messages' },
        caveats: ['The provider publishes a fixed monthly message cap.'],
      }),
      projectionForRequest(request, {
        evidenceState: 'provider_stated',
        formula: null,
        assumptions: [],
        confidence: null,
        boundType: 'unknown',
        projectedCapacity: null,
        sensitivity: { minimum: null, maximum: null, unit: 'messages' },
        caveats: ['The provider describes capacity qualitatively without a numeric cap.'],
      }),
    ];

    for (const projection of projections) {
      const facts = factsForRequest(request, { entitlementProjections: [projection] });
      const data = dataForCalculation(request, facts);
      expect(validateSubscriptionData(request, data, sources)).toEqual(data);
    }
  });

  it('requires unknown bounds and a caveat for qualitative provider-stated capacity', () => {
    const request = normalizedCalculate();
    for (const projection of [
      projectionForRequest(request, {
        evidenceState: 'provider_stated',
        formula: null,
        assumptions: [],
        confidence: null,
        boundType: 'hard_max',
        projectedCapacity: null,
        sensitivity: { minimum: null, maximum: null, unit: 'messages' },
        caveats: ['Capacity is qualitative.'],
      }),
      projectionForRequest(request, {
        evidenceState: 'provider_stated',
        formula: null,
        assumptions: [],
        confidence: null,
        boundType: 'unknown',
        projectedCapacity: null,
        sensitivity: { minimum: null, maximum: null, unit: 'messages' },
        caveats: [],
      }),
      projectionForRequest(request, {
        evidenceState: 'provider_stated',
        formula: null,
        assumptions: ['A provider statement is not a TokenBench projection assumption.'],
        confidence: null,
        boundType: 'unknown',
        projectedCapacity: null,
        sensitivity: { minimum: null, maximum: null, unit: 'messages' },
        caveats: ['Capacity is qualitative.'],
      }),
    ]) {
      const facts = factsForRequest(request, { entitlementProjections: [projection] });
      const data = dataForCalculation(request, facts);
      expect(() => validateSubscriptionData(request, data, sources))
        .toThrowError(expect.objectContaining({ code: 'invalid_response' }));
    }
  });

  it('validates the calculated response against provider facts and projection assumptions', () => {
    const request = normalizeSubscriptionRequest(calculateRequest());
    if (request.operation !== 'calculate') throw new Error('Expected a calculation request.');
    const calculation = buildSubscriptionCalculation(request, calculationFacts);
    const data = {
      operation: 'calculate' as const,
      plans: calculationFacts.plans,
      routes: calculationFacts.routes,
      routeBindings: calculationFacts.routeBindings,
      entitlementProjections: calculationFacts.entitlementProjections,
      calculation,
    };

    expect(validateSubscriptionData(request, data, sources)).toEqual(data);
    expect(() => validateSubscriptionData(request, {
      ...data,
      calculation: {
        ...calculation,
        lineItems: [...calculation.lineItems].reverse(),
      },
    }, sources)).toThrowError(expect.objectContaining({ code: 'invalid_response' }));
  });

  it('exposes subscription calculations from the public contract boundary', async () => {
    const contract = await import('./ui-data-contract-v1');
    expect(contract.buildSubscriptionCalculation).toBe(buildSubscriptionCalculation);
  });
});
