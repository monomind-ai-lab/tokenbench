import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildSubscriptionCalculation,
  createUiDataContractV1SchemaValidator,
  parseUiDataContractV1,
  parseUiDataContractV1Runtime,
  validateUiDataContractV1WithAjv,
} from './ui-data-contract-v1';
import type { UiDataContractV1Method } from './ui-data-contract-v1-core';

const METHODS = ['models', 'profile', 'lifecycle', 'rankings', 'comparison', 'subscription'] as const;

type Envelope = Record<string, unknown>;

function example(file: string): Envelope {
  return JSON.parse(readFileSync(
    `contracts/ui-data-contract/v1/examples/${file}`,
    'utf8',
  )) as Envelope;
}

function requestFor(method: UiDataContractV1Method): Record<string, unknown> {
  switch (method) {
    case 'models':
      return { search: null, access: 'all', providerIds: [], limit: 50, cursor: null };
    case 'profile':
      return { slug: 'example-model' };
    case 'lifecycle':
      return { asOf: '2026-08-18T00:00:00.000Z', horizonDays: 30 };
    case 'rankings':
      return {
        operation: 'leaderboard',
        releaseId: null,
        filters: { organizationIds: [], openWeights: 'all', excludeDerivativeFinetunes: false },
        limit: 50,
        cursor: null,
      };
    case 'comparison':
      return { modelSlugs: ['example-model', 'second-model'] };
    case 'subscription':
      return { operation: 'catalog' };
  }
}

function representativeEnvelope(method: UiDataContractV1Method): Envelope {
  return {
    contractVersion: 'ui-data-contract/v1',
    method,
    request: requestFor(method),
    status: 'unavailable',
    reason: 'Illustrative prototype data is not acceptance evidence.',
    fetchedAt: '2026-08-18T08:00:00.000Z',
    effectiveAt: null,
    data: null,
    revisions: {
      projection: 'illustrative-projection-v1',
      catalog: 'illustrative-catalog-v1',
      benchmark: method === 'subscription' ? null : 'illustrative-benchmark-v1',
      runtimeObservationSet: 'illustrative-runtime-v1',
      projectionMethodology: 'illustrative-methodology-v1',
    },
    freshness: {
      catalogObservedAt: '2026-08-18T07:00:00.000Z',
      runtimeObservedAt: '2026-08-18T07:30:00.000Z',
      benchmarkReleasedAt: method === 'subscription' ? null : '2026-08-17T00:00:00.000Z',
      benchmarkCheckedAt: method === 'subscription' ? null : '2026-08-18T07:45:00.000Z',
    },
    sources: [{
      sourceRef: 'illustrative-source',
      fieldGroup: '/data',
      sourceId: 'illustrative-source',
      sourceRevision: 'illustrative-revision-v1',
      label: 'Illustrative prototype data',
      url: 'https://example.com/tokenbench-ui-data-contract-v1',
      licenseId: null,
      observedAt: '2026-08-18T07:00:00.000Z',
      effectiveAt: '2026-08-18T07:00:00.000Z',
    }],
    warnings: [],
    provenance: [{
      sourceRef: 'illustrative-source',
      label: 'Illustrative prototype data',
      effectiveAt: '2026-08-18T07:00:00.000Z',
      note: 'Illustrative prototype data source revision illustrative-revision-v1.',
    }],
  };
}

const fixtureSource = {
  sourceRef: 'fixture-source',
  fieldGroup: '/data',
  sourceId: 'fixture-source',
  sourceRevision: 'fixture-revision-v1',
  label: 'Contract fixture source',
  url: 'https://example.com/tokenbench-ui-data-contract-v1/fixture',
  licenseId: 'CDLA-Permissive-2.0' as const,
  observedAt: '2026-08-18T07:00:00.000Z',
  effectiveAt: '2026-08-18T07:00:00.000Z',
};

function available<T>(value: T) {
  return { availability: 'available' as const, value, sourceRefs: [fixtureSource.sourceRef] };
}

function route() {
  return {
    routeId: 'route-a',
    providerId: 'provider-a',
    status: 'available' as const,
    inputMicroDollarsPerMillion: available(2_000_000),
    outputMicroDollarsPerMillion: available(8_000_000),
    cacheReadMicroDollarsPerMillion: available(500_000),
    cacheWriteMicroDollarsPerMillion: available(1_000_000),
    contextWindowTokens: available(128_000),
    maxOutputTokens: available(16_384),
    inputModalities: ['text'] as const,
    outputModalities: ['text'] as const,
    ttftP50Ms: available(200),
    tpsP50: available(100),
    uptimeBasisPoints: available(9_999),
    runtimeObservation: available({
      windowStartedAt: '2026-08-17T00:00:00.000Z',
      windowEndedAt: '2026-08-18T00:00:00.000Z',
      sampleSize: 100,
      ttftPercentile: 'p50' as const,
      tpsPercentile: 'p50' as const,
    }),
    pricingTiers: [{
      pricingTierId: 'standard',
      minimumContextTokens: 0,
      maximumContextTokens: null,
      inputMicroDollarsPerMillion: available(2_000_000),
      outputMicroDollarsPerMillion: available(8_000_000),
      cacheReadMicroDollarsPerMillion: available(500_000),
      cacheWriteMicroDollarsPerMillion: available(1_000_000),
    }],
  };
}

function scoreFact() {
  return {
    dimensionId: 'overall',
    label: 'Overall',
    score: available(80),
    rank: available(1),
    fieldSize: available(10),
  };
}

function taskFact() {
  return {
    taskId: 'coding',
    label: 'Coding',
    categoryId: 'coding',
    score: available(80),
    questionCount: available(10),
    evaluationCostUsd: available(1),
    inputPriceUsdPerMillion: available(2),
    outputPriceUsdPerMillion: available(8),
    equivalentSuccesses: available(8),
    costPerSuccessfulEvaluationUsd: available(0.125),
    meanInputTokens: available(1_000),
    meanOutputTokens: available(500),
  };
}

function summary(slug = 'alpha') {
  const selectedRoute = route();
  return {
    identity: {
      configurationId: `provider-a:${slug}`,
      slug,
      displayName: slug.toUpperCase(),
      organization: 'Provider A',
    },
    openWeights: available(false),
    isDerivativeFinetune: false,
    baseModelSlug: null,
    overall: scoreFact(),
    categories: [{ ...scoreFact(), dimensionId: 'coding', label: 'Coding' }],
    selectedRouteId: selectedRoute.routeId,
    selectedRoutePolicy: 'lowest available price',
    selectedRoute,
    lifecycleStatus: available('current' as const),
  };
}

function profile(slug = 'alpha') {
  const modelSummary = summary(slug);
  return {
    summary: modelSummary,
    releaseOn: '2026-01-01',
    tasks: [taskFact()],
    routes: [modelSummary.selectedRoute],
    lifecycleEvents: [{
      eventId: `announce-${slug}`,
      eventType: 'announcement' as const,
      effectiveAt: '2026-01-01T00:00:00.000Z',
      observedAt: '2026-01-01T00:00:00.000Z',
      confidence: 'official' as const,
    }],
    replacement: available({ modelSlug: slug, migrationNote: 'No migration required.' }),
  };
}

function leaderboardRequest() {
  return {
    operation: 'leaderboard' as const,
    releaseId: null,
    filters: { organizationIds: [], openWeights: 'all' as const, excludeDerivativeFinetunes: false },
    limit: 50,
    cursor: null,
  };
}

function customRequest(weights = { quality: 100 }) {
  return {
    operation: 'custom' as const,
    dimensionSetRevision: 'fixture-dimensions-v1',
    weights,
    filters: {
      access: 'all' as const,
      providerIds: [],
      excludeDerivativeFinetunes: false,
      requiredInputModalities: [],
      maxInputMicroDollarsPerMillion: null,
      maxOutputMicroDollarsPerMillion: null,
      minTpsP50: null,
      maxTtftP50Ms: null,
      minContextWindowTokens: null,
      minMaxOutputTokens: null,
    },
    includeIneligible: true,
    limit: 50,
  };
}

function leaderboardData() {
  return {
    operation: 'leaderboard' as const,
    release: {
      releaseId: 'release-v1',
      releaseOn: '2026-08-01',
      licenseId: 'CDLA-Permissive-2.0' as const,
      sourceRefs: [fixtureSource.sourceRef],
    },
    taxonomy: [{
      categoryId: 'coding',
      label: 'Coding',
      tasks: [{ taskId: 'coding', label: 'Coding' }],
    }],
    rows: [{
      sourceRank: 1,
      model: summary(),
      taskEconomics: [taskFact()],
      costPerSuccessfulEvaluationUsd: available(0.125),
      meanOutputTokens: available(500),
      pareto: true,
    }],
    total: 1,
    nextCursor: null,
  };
}

function customData() {
  return {
    operation: 'custom' as const,
    dimensionSet: {
      revision: 'fixture-dimensions-v1',
      transformationVersion: 'utility-v1',
      dimensions: [{
        dimensionId: 'quality',
        label: 'Quality',
        kind: 'benchmark' as const,
        unit: 'score' as const,
        utilityAnchor: { best: 100, worst: 0, transform: 'identity' as const },
      }],
    },
    submittedWeights: { quality: 100 },
    normalizedWeights: { quality: 1 },
    rows: [{
      model: summary(),
      dimensions: [{
        dimensionId: 'quality',
        rawValue: available(80),
        utility: 80,
        contribution: 80,
      }],
      total: 80,
      rank: 1,
      pareto: true,
      eligible: true,
      ineligibilityReasons: [],
    }],
    totalEligible: 1,
    totalIneligible: 0,
    truncated: false,
  };
}

function calculateRequest(shareBasisPoints = 10_000) {
  return {
    operation: 'calculate' as const,
    planId: 'plan-a',
    seats: 1,
    modelMix: [{
      modelSlug: 'alpha',
      routeId: 'route-a',
      pricingTierId: null,
      tierContextTokens: 32_000,
      shareBasisPoints,
    }],
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
  };
}

function calculationData() {
  const request = calculateRequest();
  const providerRoute = route();
  const entitlement = {
    projectionId: 'projection-a',
    planId: request.planId,
    evidenceState: 'projected' as const,
    formula: 'Capacity follows the selected workload.',
    assumptions: ['Provider terms remain current.'],
    caveats: ['Provider terms may change.'],
    confidence: 'medium' as const,
    boundType: 'practical_upper' as const,
    projectedCapacity: { minimum: 1_000, maximum: 2_000, unit: 'messages' as const, window: 'monthly' as const },
    workloadShape: {
      ...request.workload,
      cacheReadShareBasisPoints: request.cacheReadShareBasisPoints,
      cacheWriteShareBasisPoints: request.cacheWriteShareBasisPoints,
    },
    sensitivity: { minimum: 800, maximum: 2_500, unit: 'messages' as const },
    methodologyVersion: 'subscription-v1',
    effectiveAt: fixtureSource.effectiveAt,
    sourceRefs: [fixtureSource.sourceRef],
  };
  const facts = {
    plans: [{
      planId: request.planId,
      providerId: 'provider-a',
      displayName: 'Plan A',
      monthlyCostMicroDollars: 20_000_000,
      annualCostMicroDollars: available(200_000_000),
      annualEffectiveMonthlyCostMicroDollars: available(17_000_000),
      entitlement: {
        evidenceStatus: 'projected' as const,
        boundType: 'practical_upper' as const,
        usageNote: 'Provider-managed capacity.',
        dimensions: [{
          metric: 'messages' as const,
          minimum: 1_000,
          maximum: 2_000,
          unit: 'messages',
          window: 'monthly' as const,
          resetRule: null,
          modelId: null,
          feature: null,
          sharedPoolId: null,
        }],
        staleReason: null,
        lastVerifiedAt: fixtureSource.observedAt,
        sourceRefs: [fixtureSource.sourceRef],
      },
      supportedModelSlugs: ['alpha'],
      sourceRefs: [fixtureSource.sourceRef],
    }],
    routes: [providerRoute],
    routeBindings: [{ routeId: providerRoute.routeId, modelSlug: 'alpha', providerId: providerRoute.providerId }],
    entitlementProjections: [entitlement],
    methodologyVersion: 'subscription-v1',
  };
  return {
    operation: 'calculate' as const,
    plans: facts.plans,
    routes: facts.routes,
    routeBindings: facts.routeBindings,
    entitlementProjections: facts.entitlementProjections,
    calculation: buildSubscriptionCalculation(request, facts),
  };
}

function availableEnvelope(
  method: UiDataContractV1Method,
  operation?: 'custom' | 'calculate',
): Envelope {
  let request: Record<string, unknown>;
  let data: unknown;
  switch (method) {
    case 'models':
      request = requestFor(method);
      data = { models: [summary()], total: 1, nextCursor: null };
      break;
    case 'profile':
      request = { slug: 'alpha' };
      data = { model: profile() };
      break;
    case 'lifecycle':
      request = requestFor(method);
      data = { ...request, models: [] };
      break;
    case 'rankings':
      request = operation === 'custom' ? customRequest() : leaderboardRequest();
      data = operation === 'custom' ? customData() : leaderboardData();
      break;
    case 'comparison':
      request = { modelSlugs: ['alpha', 'beta'] };
      data = { requestedModelSlugs: ['alpha', 'beta'], models: [profile('alpha'), profile('beta')] };
      break;
    case 'subscription':
      request = operation === 'calculate' ? calculateRequest() : { operation: 'catalog' };
      data = operation === 'calculate'
        ? calculationData()
        : { operation: 'catalog', plans: [], routes: [], routeBindings: [], entitlementProjections: [], calculation: null };
      break;
  }
  return {
    contractVersion: 'ui-data-contract/v1',
    method,
    request,
    status: 'available',
    reason: null,
    fetchedAt: '2026-08-18T08:00:00.000Z',
    effectiveAt: fixtureSource.effectiveAt,
    data,
    revisions: {
      projection: 'fixture-projection-v1',
      catalog: 'fixture-catalog-v1',
      benchmark: method === 'subscription' ? null : 'fixture-benchmark-v1',
      runtimeObservationSet: 'fixture-runtime-v1',
      projectionMethodology: 'fixture-methodology-v1',
    },
    freshness: {
      catalogObservedAt: fixtureSource.observedAt,
      runtimeObservedAt: fixtureSource.observedAt,
      benchmarkReleasedAt: method === 'subscription' ? null : '2026-08-01T00:00:00.000Z',
      benchmarkCheckedAt: method === 'subscription' ? null : fixtureSource.observedAt,
    },
    sources: [fixtureSource],
    warnings: [],
    provenance: [{
      sourceRef: fixtureSource.sourceRef,
      label: fixtureSource.label,
      effectiveAt: fixtureSource.effectiveAt,
      note: `${fixtureSource.label} source revision ${fixtureSource.sourceRevision}.`,
    }],
  };
}

describe('ui-data-contract/v1 schema and parser parity', () => {
  const schemaValidator = createUiDataContractV1SchemaValidator;
  const rootSchemaValidator = createUiDataContractV1SchemaValidator('');

  it.each(METHODS)(
    'selects exactly one %s method branch and preserves the candidate',
    (method) => {
      const value = representativeEnvelope(method);
      const matchingBranches = METHODS.filter((candidateMethod) => (
        schemaValidator(`#/$defs/${candidateMethod}Envelope`)(value)
      ));

      expect(matchingBranches).toEqual([method]);
      expect(rootSchemaValidator(value)).toBe(true);
      expect(parseUiDataContractV1(value, method)).toBe(value);
    },
  );

  it.each([
    ['models', undefined],
    ['profile', undefined],
    ['lifecycle', undefined],
    ['rankings', undefined],
    ['rankings', 'custom'],
    ['comparison', undefined],
    ['subscription', undefined],
    ['subscription', 'calculate'],
  ] as const)('validates non-null %s data through schema and runtime (%s)', (method, operation) => {
    const value = availableEnvelope(method, operation);

    expect(schemaValidator(`#/$defs/${method}Envelope`)(value)).toBe(true);
    expect(rootSchemaValidator(value)).toBe(true);
    expect(parseUiDataContractV1(value, method)).toBe(value);
  });

  it('accepts available mixed-source data with a null aggregate effective time', () => {
    const value = structuredClone(availableEnvelope('models')) as any;
    value.effectiveAt = null;
    value.sources.push({
      ...value.sources[0],
      sourceRef: 'fixture-source-secondary',
      sourceId: 'fixture-source-secondary',
      sourceRevision: 'fixture-revision-v2',
      effectiveAt: '2026-08-17T00:00:00.000Z',
    });
    value.provenance.push({
      sourceRef: 'fixture-source-secondary',
      label: fixtureSource.label,
      effectiveAt: '2026-08-17T00:00:00.000Z',
      note: `${fixtureSource.label} source revision fixture-revision-v2.`,
    });

    expect(schemaValidator('#/$defs/modelsEnvelope')(value)).toBe(true);
    expect(parseUiDataContractV1(value, 'models')).toBe(value);
  });

  it('accepts an authority-free leaderboard release with multiple licensed sources', () => {
    const value = structuredClone(availableEnvelope('rankings')) as any;
    const secondarySourceRef = 'fixture-source-secondary';
    value.sources.push({
      ...value.sources[0],
      sourceRef: secondarySourceRef,
      sourceId: secondarySourceRef,
      sourceRevision: 'fixture-revision-v2',
      label: 'Secondary contract fixture source',
      url: 'https://example.com/tokenbench-ui-data-contract-v1/fixture-secondary',
    });
    value.provenance.push({
      sourceRef: secondarySourceRef,
      label: 'Secondary contract fixture source',
      effectiveAt: fixtureSource.effectiveAt,
      note: 'Secondary contract fixture source revision fixture-revision-v2.',
    });
    value.data.release.sourceRefs.push(secondarySourceRef);

    expect(schemaValidator('#/$defs/rankingsEnvelope')(value)).toBe(true);
    expect(parseUiDataContractV1(value, 'rankings')).toBe(value);
  });

  it('rejects an authority-free leaderboard that mismatches an explicitly requested release', () => {
    const value = structuredClone(availableEnvelope('rankings')) as any;
    value.request.releaseId = 'release-v2';

    expect(schemaValidator('#/$defs/rankingsEnvelope')(value)).toBe(true);
    expect(() => parseUiDataContractV1(value, 'rankings')).toThrowError(expect.objectContaining({
      code: 'invalid_response',
    }));
  });

  it('reports an explicit method mismatch before unrelated envelope errors', () => {
    const value = { ...representativeEnvelope('profile'), unexpected: true };

    expect(() => parseUiDataContractV1(value, 'models')).toThrowError(expect.objectContaining({
      code: 'method_mismatch',
    }));
  });

  it('normalizes invalid custom and subscription requests even when unavailable', () => {
    const custom = {
      ...representativeEnvelope('rankings'),
      request: customRequest({ quality: 0 }),
    };
    const subscription = {
      ...representativeEnvelope('subscription'),
      request: calculateRequest(9_999),
    };
    const subscriptionCache = {
      ...representativeEnvelope('subscription'),
      request: {
        ...calculateRequest(),
        cacheReadShareBasisPoints: 6_000,
        cacheWriteShareBasisPoints: 5_000,
      },
    };

    for (const [value, method] of [
      [custom, 'rankings'],
      [subscription, 'subscription'],
      [subscriptionCache, 'subscription'],
    ] as const) {
      expect(() => parseUiDataContractV1(value, method)).toThrowError(expect.objectContaining({
        code: 'invalid_request',
      }));
    }
  });

  it.each([
    ['rankings', { request: customRequest(), data: leaderboardData() }],
    ['subscription', { request: calculateRequest(), data: { operation: 'catalog', plans: [], routes: [], routeBindings: [], entitlementProjections: [], calculation: null } }],
  ] as const)('pairs %s request and data operations in schema and runtime', (method, override) => {
    const value = { ...availableEnvelope(method), ...override };

    expect(schemaValidator(`#/$defs/${method}Envelope`)(value)).toBe(false);
    expect(() => parseUiDataContractV1(value, method)).toThrowError(expect.objectContaining({
      code: 'invalid_response',
    }));
  });

  it('validates custom ranking data intrinsically without published authority', () => {
    const value = structuredClone(availableEnvelope('rankings', 'custom')) as any;
    value.data.totalEligible = 2;

    expect(() => parseUiDataContractV1(value, 'rankings')).toThrowError(expect.objectContaining({
      code: 'invalid_response',
    }));
  });

  it('rejects subscription benchmark revision and freshness through schema', () => {
    const value = structuredClone(representativeEnvelope('subscription')) as any;
    value.revisions.benchmark = 'forbidden-benchmark';
    value.freshness.benchmarkReleasedAt = '2026-08-01T00:00:00.000Z';
    value.freshness.benchmarkCheckedAt = '2026-08-18T00:00:00.000Z';

    expect(schemaValidator('#/$defs/subscriptionEnvelope')(value)).toBe(false);
    expect(() => parseUiDataContractV1(value, 'subscription')).toThrowError(expect.objectContaining({
      code: 'invalid_response',
    }));
  });

  it.each([
    ['equivalent successes', (value: any) => { value.data.model.tasks[0].equivalentSuccesses.value = Number.MAX_SAFE_INTEGER + 1; }],
    ['mean input tokens', (value: any) => { value.data.model.tasks[0].meanInputTokens.value = 1.5; }],
  ])('rejects out-of-range model %s through schema and runtime', (_name, mutate) => {
    const value = structuredClone(availableEnvelope('profile'));
    mutate(value);

    expect(schemaValidator('#/$defs/profileEnvelope')(value)).toBe(false);
    expect(() => parseUiDataContractV1(value, 'profile')).toThrowError(expect.objectContaining({
      code: 'invalid_response',
    }));
  });

  it('bounds custom ranking anchors and raw evidence intrinsically', () => {
    const invalidAnchor = structuredClone(availableEnvelope('rankings', 'custom')) as any;
    invalidAnchor.data.dimensionSet.dimensions[0].utilityAnchor.best = 101;
    const invalidRaw = structuredClone(availableEnvelope('rankings', 'custom')) as any;
    invalidRaw.data.rows[0].dimensions[0].rawValue.value = Number.MAX_SAFE_INTEGER + 1;

    expect(schemaValidator('#/$defs/rankingsEnvelope')(invalidAnchor)).toBe(false);
    expect(schemaValidator('#/$defs/rankingsEnvelope')(invalidRaw)).toBe(false);
    expect(() => parseUiDataContractV1(invalidAnchor, 'rankings')).toThrowError(expect.objectContaining({
      code: 'invalid_response',
    }));
    expect(() => parseUiDataContractV1(invalidRaw, 'rankings')).toThrowError(expect.objectContaining({
      code: 'invalid_response',
    }));
  });

  it('leaves custom raw-value kind bounds to published ranking authority', () => {
    const value = structuredClone(availableEnvelope('rankings', 'custom')) as any;
    const dimension = value.data.dimensionSet.dimensions[0];
    dimension.kind = 'cost';
    dimension.unit = 'micro_dollars_per_million';
    dimension.utilityAnchor = { best: 1, worst: 100, transform: 'log_inverse' };
    const result = value.data.rows[0].dimensions[0];
    result.rawValue.value = 1.5;
    result.utility = 100 * Math.log(100 / 1.5) / Math.log(100);
    result.contribution = result.utility;
    value.data.rows[0].total = result.utility;
    const authority = {
      operation: 'custom' as const,
      dimensionSet: value.data.dimensionSet,
      expectedTotalEligible: value.data.totalEligible,
      expectedTotalIneligible: value.data.totalIneligible,
    };

    expect(schemaValidator('#/$defs/rankingsEnvelope')(value)).toBe(true);
    expect(() => parseUiDataContractV1(value, 'rankings', authority)).toThrowError(expect.objectContaining({
      code: 'invalid_response',
    }));
  });

  it.each([
    ['models', 'models.json'],
    ['profile', 'profile.json'],
    ['lifecycle', 'lifecycle.json'],
    ['rankings', 'rankings.json'],
    ['comparison', 'comparison.json'],
    ['subscription', 'subscription.json'],
    ['rankings', 'mixed-source.json'],
  ] as const)('validates the illustrative %s example through exactly one branch', (method, file) => {
    const value = example(file);
    const matchingBranches = METHODS.filter((candidateMethod) => (
      schemaValidator(`#/$defs/${candidateMethod}Envelope`)(value)
    ));

    expect(['available', 'partial']).toContain(value.status);
    expect(value.data).not.toBeNull();
    expect(matchingBranches).toEqual([method]);
    expect(rootSchemaValidator(value)).toBe(true);
    expect(parseUiDataContractV1(value, method)).toBe(value);
  });

  it('rejects unsupported version before all other errors', () => {
    const value = {
      ...representativeEnvelope('profile'),
      contractVersion: 'ui-data-contract/v2',
      fetchedAt: 'bad',
    };

    expect(() => parseUiDataContractV1(value, 'models')).toThrowError(expect.objectContaining({
      code: 'unsupported_contract_version',
    }));
  });

  it('routes missing and invalid method discriminators through schema validation', () => {
    const missing = representativeEnvelope('models');
    delete missing.method;
    const invalid = { ...representativeEnvelope('models'), method: 42 };

    for (const value of [missing, invalid]) {
      expect(() => parseUiDataContractV1(value, 'models')).toThrowError(expect.objectContaining({
        code: 'invalid_response',
      }));
    }
  });

  it('keeps a missing contract version as an Ajv-invalid response rather than an unsupported version', () => {
    const value = representativeEnvelope('models');
    delete value.contractVersion;

    expect(() => validateUiDataContractV1WithAjv(value, 'models')).toThrowError(expect.objectContaining({
      code: 'invalid_response',
    }));
  });

  it('runs schema before full core validation after precedence prechecks', () => {
    const value = { ...representativeEnvelope('models'), unexpected: true };

    expect(() => parseUiDataContractV1(value, 'models')).toThrowError(expect.objectContaining({
      code: 'invalid_response',
    }));
  });

  it.each([
    ['invalid timestamp', (value: any) => { value.fetchedAt = '2026-02-30T00:00:00.000Z'; }, 'invalid_timestamp'],
    ['unsupported version', (value: any) => {
      value.contractVersion = 'ui-data-contract/v2';
      value.fetchedAt = 'bad';
    }, 'unsupported_contract_version'],
  ] as const)('evaluates a $0 mutation independently through Ajv and the runtime-only boundary', (_name, mutate, code) => {
    const value = structuredClone(representativeEnvelope('models')) as any;
    mutate(value);
    const validate = createUiDataContractV1SchemaValidator('#/$defs/modelsEnvelope');

    expect(validate(value)).toBe(false);
    expect(() => validateUiDataContractV1WithAjv(value, 'models')).toThrowError(expect.objectContaining({ code }));
    expect(() => parseUiDataContractV1Runtime(value, 'models')).toThrowError(expect.objectContaining({ code }));
  });

  it.each([
    ['envelope', (value: any) => { value.fetchedAt = '2026-02-30T00:00:00.000Z'; }],
    ['source', (value: any) => { value.sources[0].observedAt = '2026-02-30T00:00:00.000Z'; }],
    ['provenance', (value: any) => { value.provenance[0].effectiveAt = '2026-08-18T08:00:00+08:00'; }],
    ['freshness', (value: any) => { value.freshness.catalogObservedAt = '2026-08-18T00:00:00.00Z'; }],
  ])('rejects invalid %s timestamp through schema and runtime', (_name, mutate) => {
    const value = structuredClone(representativeEnvelope('models'));
    mutate(value);

    expect(schemaValidator('#/$defs/modelsEnvelope')(value)).toBe(false);
    expect(() => parseUiDataContractV1(value, 'models')).toThrowError(expect.objectContaining({
      code: 'invalid_timestamp',
    }));
  });
});
