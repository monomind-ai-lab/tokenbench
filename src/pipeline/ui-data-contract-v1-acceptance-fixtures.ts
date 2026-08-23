import {
  buildUiDataContractV1Envelope,
  UiDataContractValidationError,
  type EvidenceValue,
  type SourceAttribution,
  type UiDataContractErrorCode,
  type UiDataContractV1Method,
} from './ui-data-contract-v1-core';
import {
  normalizeComparisonRequest,
  normalizeLifecycleRequest,
  normalizeModelsRequest,
  normalizeProfileRequest,
} from './ui-data-contract-v1-models';
import { normalizeRankingsRequest, buildCustomRankingsData } from './ui-data-contract-v1-rankings';
import { normalizeSubscriptionRequest, buildSubscriptionCalculation } from './ui-data-contract-v1-subscription';
import { parseUiDataContractV1Runtime, validateUiDataContractV1WithAjv } from './ui-data-contract-v1';

export const UI_DATA_CONTRACT_V1_ACCEPTANCE_TIME = '2026-08-18T00:00:00.000Z';
export const UI_DATA_CONTRACT_V1_FRONTEND_BASELINE = '5d649d315a0bdb052e90bb96d6b7e94544f9ad31';

export type UiDataContractV1AcceptanceOutcome = 'accept' | 'reject';

export interface UiDataContractV1AcceptanceFixture {
  readonly id: string;
  readonly classification: 'method_response' | 'mixed_source' | 'unavailable' | 'expected_rejection';
  readonly method: UiDataContractV1Method;
  readonly transport: {
    readonly httpMethod: 'GET' | 'POST';
    readonly path: string;
    readonly rawQuery: string | null;
    readonly expectedHttpStatus: number | null;
  };
  readonly normalizedRequest: object;
  readonly path: string;
  readonly schemaRef: string;
  readonly expected: {
    readonly outcome: UiDataContractV1AcceptanceOutcome;
    readonly errorCode: UiDataContractErrorCode | null;
  };
  readonly candidate: unknown;
}

export interface UiDataContractV1ValidationObservation {
  readonly validatorId: 'ajv-2020' | 'runtime-boundary';
  readonly outcome: UiDataContractV1AcceptanceOutcome;
  readonly errorCode: UiDataContractErrorCode | null;
}

const PRIMARY_SOURCE: SourceAttribution = {
  sourceRef: 'fixture:primary-2026-08-18',
  fieldGroup: '/data',
  sourceId: 'fixture-primary',
  sourceRevision: 'fixture-primary-r1',
  label: 'Deterministic primary contract fixture',
  url: 'https://example.com/tokenbench/ui-data-contract-v1/primary',
  licenseId: 'Apache-2.0',
  observedAt: UI_DATA_CONTRACT_V1_ACCEPTANCE_TIME,
  effectiveAt: UI_DATA_CONTRACT_V1_ACCEPTANCE_TIME,
};

const SECONDARY_SOURCE: SourceAttribution = {
  ...PRIMARY_SOURCE,
  sourceRef: 'fixture:secondary-2026-08-17',
  sourceId: 'fixture-secondary',
  sourceRevision: 'fixture-secondary-r1',
  label: 'Deterministic secondary contract fixture',
  url: 'https://example.com/tokenbench/ui-data-contract-v1/secondary',
  effectiveAt: '2026-08-17T00:00:00.000Z',
};

function available<T>(value: T): EvidenceValue<T> {
  return { availability: 'available', value, sourceRefs: [PRIMARY_SOURCE.sourceRef] };
}

function route(slug: string, index: number) {
  const routeId = `${slug}-direct`;
  return {
    routeId,
    providerId: 'fixture-provider',
    status: 'available' as const,
    inputMicroDollarsPerMillion: available(2_000_000 + index * 100_000),
    outputMicroDollarsPerMillion: available(8_000_000 + index * 100_000),
    cacheReadMicroDollarsPerMillion: available(500_000 + index * 50_000),
    cacheWriteMicroDollarsPerMillion: available(1_000_000 + index * 50_000),
    contextWindowTokens: available(128_000),
    maxOutputTokens: available(16_384),
    inputModalities: ['text'] as const,
    outputModalities: ['text'] as const,
    ttftP50Ms: available(200 + index * 10),
    tpsP50: available(100 - index * 5),
    uptimeBasisPoints: available(9_999),
    runtimeObservation: available({
      windowStartedAt: '2026-08-17T00:00:00.000Z',
      windowEndedAt: UI_DATA_CONTRACT_V1_ACCEPTANCE_TIME,
      sampleSize: 100,
      ttftPercentile: 'p50' as const,
      tpsPercentile: 'p50' as const,
    }),
    pricingTiers: [{
      pricingTierId: `${routeId}-standard`,
      minimumContextTokens: 0,
      maximumContextTokens: null,
      inputMicroDollarsPerMillion: available(2_000_000 + index * 100_000),
      outputMicroDollarsPerMillion: available(8_000_000 + index * 100_000),
      cacheReadMicroDollarsPerMillion: available(500_000 + index * 50_000),
      cacheWriteMicroDollarsPerMillion: available(1_000_000 + index * 50_000),
    }],
  };
}

function scoreFact(dimensionId: string, label: string, score: number, rank: number) {
  return {
    dimensionId,
    label,
    score: available(score),
    rank: available(rank),
    fieldSize: available(10),
  };
}

function taskFact(slug: string, score: number) {
  return {
    taskId: `${slug}-coding`,
    label: `${slug.toUpperCase()} coding`,
    categoryId: 'coding',
    score: available(score),
    questionCount: available(100),
    evaluationCostUsd: available(1.25),
    inputPriceUsdPerMillion: available(2.5),
    outputPriceUsdPerMillion: available(10),
    equivalentSuccesses: available(score),
    costPerSuccessfulEvaluationUsd: available(0.014),
    meanInputTokens: available(4_000),
    meanOutputTokens: available(800),
  };
}

function modelSummary(slug: string, index = 0) {
  const selectedRoute = route(slug, index);
  return {
    identity: {
      configurationId: `provider-${index}:${slug}`,
      slug,
      displayName: slug.toUpperCase(),
      organization: `Provider ${index}`,
    },
    openWeights: available(false),
    isDerivativeFinetune: false,
    baseModelSlug: null,
    overall: scoreFact('overall', 'Overall', 90 - index * 5, index + 1),
    categories: [scoreFact('coding', 'Coding', 91 - index * 5, index + 1)],
    selectedRouteId: selectedRoute.routeId,
    selectedRoutePolicy: 'lowest available price',
    selectedRoute,
    lifecycleStatus: available('current' as const),
  };
}

function modelProfile(slug: string, index = 0) {
  const summary = modelSummary(slug, index);
  return {
    summary,
    releaseOn: '2026-01-01',
    tasks: [taskFact(slug, 91 - index * 5)],
    routes: [summary.selectedRoute],
    lifecycleEvents: [{
      eventId: `${slug}-announcement`,
      eventType: 'announcement' as const,
      effectiveAt: '2026-01-01T00:00:00.000Z',
      observedAt: '2026-01-01T00:00:00.000Z',
      confidence: 'official' as const,
    }],
    replacement: available({ modelSlug: slug, migrationNote: 'No migration required.' }),
  };
}

function revisions(method: UiDataContractV1Method) {
  return {
    projection: 'ui-data-contract-v1-fixture-projection',
    catalog: 'ui-data-contract-v1-fixture-catalog',
    benchmark: method === 'subscription' ? null : 'ui-data-contract-v1-fixture-benchmark',
    runtimeObservationSet: 'ui-data-contract-v1-fixture-runtime',
    projectionMethodology: 'ui-data-contract-v1-fixture-methodology',
  };
}

function freshness(method: UiDataContractV1Method) {
  return {
    catalogObservedAt: UI_DATA_CONTRACT_V1_ACCEPTANCE_TIME,
    runtimeObservedAt: UI_DATA_CONTRACT_V1_ACCEPTANCE_TIME,
    benchmarkReleasedAt: method === 'subscription' ? null : '2026-08-01T00:00:00.000Z',
    benchmarkCheckedAt: method === 'subscription' ? null : UI_DATA_CONTRACT_V1_ACCEPTANCE_TIME,
  };
}

function buildEnvelope<M extends UiDataContractV1Method, R, D>(
  method: M,
  request: R,
  data: D,
  status: 'available' | 'partial' | 'unavailable' = 'available',
  reason: string | null = null,
  sources: readonly SourceAttribution[] = [PRIMARY_SOURCE],
) {
  return buildUiDataContractV1Envelope({
    method,
    request,
    status,
    reason,
    fetchedAt: UI_DATA_CONTRACT_V1_ACCEPTANCE_TIME,
    data,
    revisions: revisions(method),
    freshness: freshness(method),
    sources,
    warnings: [],
  });
}

function customRankingsData() {
  const dimensionSet = {
    revision: 'ui-data-contract-v1-fixture-dimensions',
    transformationVersion: 'utility-v1',
    dimensions: [
      { dimensionId: 'capability', label: 'Capability', kind: 'benchmark' as const, unit: 'score' as const, utilityAnchor: { best: 100, worst: 0, transform: 'identity' as const } },
      { dimensionId: 'reliability', label: 'Reliability', kind: 'benchmark' as const, unit: 'score' as const, utilityAnchor: { best: 100, worst: 0, transform: 'identity' as const } },
      { dimensionId: 'efficiency', label: 'Efficiency', kind: 'benchmark' as const, unit: 'score' as const, utilityAnchor: { best: 100, worst: 0, transform: 'identity' as const } },
    ],
  };
  const request = normalizeRankingsRequest({
    operation: 'custom',
    dimensionSetRevision: dimensionSet.revision,
    weights: { capability: 20, reliability: 30, efficiency: 50 },
    filters: {
      access: 'all',
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
  }, dimensionSet);
  if (request.operation !== 'custom') throw new Error('Expected a custom rankings request.');
  return {
    request,
    data: buildCustomRankingsData(request, dimensionSet, [
      { model: modelSummary('alpha', 0), values: { capability: available(90), reliability: available(84), efficiency: available(75) } },
      { model: modelSummary('beta', 1), values: { capability: available(82), reliability: available(91), efficiency: available(88) } },
      { model: modelSummary('gamma', 2), values: { capability: available(79), reliability: available(80), efficiency: available(96) } },
    ]),
  };
}

function subscriptionData() {
  const request = normalizeSubscriptionRequest({
    operation: 'calculate',
    planId: 'fixture-pro',
    seats: 2,
    modelMix: [
      { modelSlug: 'alpha', routeId: 'alpha-direct', pricingTierId: null, tierContextTokens: 32_000, shareBasisPoints: 6_000 },
      { modelSlug: 'beta', routeId: 'beta-direct', pricingTierId: null, tierContextTokens: 32_000, shareBasisPoints: 4_000 },
    ],
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
  });
  if (request.operation !== 'calculate') throw new Error('Expected a subscription calculation request.');
  const routes = [route('alpha', 0), route('beta', 1)];
  const plans = [{
    planId: 'fixture-pro',
    providerId: 'fixture-provider',
    displayName: 'Fixture Pro',
    monthlyCostMicroDollars: 20_000_000,
    annualCostMicroDollars: available(200_000_000),
    annualEffectiveMonthlyCostMicroDollars: available(17_000_000),
    entitlement: {
      evidenceStatus: 'projected' as const,
      boundType: 'practical_upper' as const,
      usageNote: 'Provider-managed plan capacity.',
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
      lastVerifiedAt: UI_DATA_CONTRACT_V1_ACCEPTANCE_TIME,
      sourceRefs: [PRIMARY_SOURCE.sourceRef],
    },
    supportedModelSlugs: ['alpha', 'beta'],
    sourceRefs: [PRIMARY_SOURCE.sourceRef],
  }];
  const entitlementProjections = [{
    projectionId: 'fixture-pro-capacity',
    planId: 'fixture-pro',
    evidenceState: 'projected' as const,
    formula: 'Deterministic capacity estimate for the selected workload.',
    assumptions: ['Published plan terms remain current.'],
    caveats: ['Provider limits may change.'],
    confidence: 'medium' as const,
    boundType: 'practical_upper' as const,
    projectedCapacity: { minimum: 1_000, maximum: 2_000, unit: 'messages' as const, window: 'monthly' as const },
    workloadShape: { ...request.workload, cacheReadShareBasisPoints: request.cacheReadShareBasisPoints, cacheWriteShareBasisPoints: request.cacheWriteShareBasisPoints },
    sensitivity: { minimum: 800, maximum: 2_500, unit: 'messages' as const },
    methodologyVersion: 'subscription-v1',
    effectiveAt: UI_DATA_CONTRACT_V1_ACCEPTANCE_TIME,
    sourceRefs: [PRIMARY_SOURCE.sourceRef],
  }];
  const routeBindings = routes.map((route) => ({
    routeId: route.routeId,
    modelSlug: request.modelMix.find((mix) => mix.routeId === route.routeId)?.modelSlug ?? 'unbound',
    providerId: route.providerId,
  }));
  const facts = { plans, routes, routeBindings, entitlementProjections, methodologyVersion: 'subscription-v1' };
  return {
    request,
    data: {
      operation: 'calculate' as const,
      plans,
      routes,
      routeBindings,
      entitlementProjections,
      calculation: buildSubscriptionCalculation(request, facts),
    },
  };
}

function leaderboardData() {
  return {
    operation: 'leaderboard' as const,
    release: {
      releaseId: 'fixture-release-2026-08-01',
      releaseOn: '2026-08-01',
      licenseId: 'Apache-2.0' as const,
      sourceRefs: [PRIMARY_SOURCE.sourceRef],
    },
    taxonomy: [{
      categoryId: 'coding',
      label: 'Coding',
      tasks: [{ taskId: 'alpha-coding', label: 'ALPHA coding' }],
    }],
    rows: ['alpha', 'beta', 'gamma'].map((slug, index) => ({
      sourceRank: index + 1,
      model: modelSummary(slug, index),
      taskEconomics: [taskFact('alpha', 91 - index * 5)],
      costPerSuccessfulEvaluationUsd: available(0.014),
      meanOutputTokens: available(800),
      pareto: index === 0,
    })),
    total: 3,
    nextCursor: null,
  };
}

export function evaluateUiDataContractV1AcceptanceFixture(
  fixture: UiDataContractV1AcceptanceFixture,
): readonly UiDataContractV1ValidationObservation[] {
  let ajvCode: UiDataContractErrorCode | null = null;
  let ajvMessage = '';
  try {
    validateUiDataContractV1WithAjv(fixture.candidate, fixture.method);
  } catch (error) {
    if (!(error instanceof UiDataContractValidationError)) throw error;
    ajvCode = error.code;
    ajvMessage = error.message;
  }
  let runtimeCode: UiDataContractErrorCode | null = null;
  let runtimeMessage = '';
  try {
    parseUiDataContractV1Runtime(fixture.candidate, fixture.method);
  } catch (error) {
    if (!(error instanceof UiDataContractValidationError)) throw error;
    runtimeCode = error.code;
    runtimeMessage = error.message;
  }
  const observations = [
    { validatorId: 'ajv-2020' as const, outcome: ajvCode === null ? 'accept' as const : 'reject' as const, errorCode: ajvCode },
    { validatorId: 'runtime-boundary' as const, outcome: runtimeCode === null ? 'accept' as const : 'reject' as const, errorCode: runtimeCode },
  ];
  for (const observation of observations) {
    if (observation.outcome !== fixture.expected.outcome || observation.errorCode !== fixture.expected.errorCode) {
      throw new Error(`${fixture.id} ${observation.validatorId} produced ${observation.outcome}/${observation.errorCode}: ${ajvMessage || runtimeMessage}`);
    }
  }
  return observations;
}

export function buildUiDataContractV1AcceptanceFixtures(): readonly UiDataContractV1AcceptanceFixture[] {
  const modelsRequest = normalizeModelsRequest({ search: null, access: 'all', providerIds: [], limit: 3, cursor: null });
  const profileRequest = normalizeProfileRequest({ slug: 'alpha' });
  const lifecycleRequest = normalizeLifecycleRequest({ asOf: UI_DATA_CONTRACT_V1_ACCEPTANCE_TIME, horizonDays: 30 });
  const comparisonRequest = normalizeComparisonRequest({ modelSlugs: ['alpha', 'beta', 'gamma'] });
  const rankingsRequest = normalizeRankingsRequest({
    operation: 'leaderboard', releaseId: null,
    filters: { organizationIds: [], openWeights: 'all', excludeDerivativeFinetunes: false },
    limit: 50, cursor: null,
  });
  const custom = customRankingsData();
  const subscription = subscriptionData();
  const models = buildEnvelope('models', modelsRequest, {
    models: ['alpha', 'beta', 'gamma'].map((slug, index) => modelSummary(slug, index)), total: 3, nextCursor: null,
  });
  const profile = buildEnvelope('profile', profileRequest, { model: modelProfile('alpha') });
  const lifecycle = buildEnvelope('lifecycle', lifecycleRequest, { ...lifecycleRequest, models: [] });
  const rankings = buildEnvelope('rankings', rankingsRequest, leaderboardData());
  const comparison = buildEnvelope('comparison', comparisonRequest, {
    requestedModelSlugs: comparisonRequest.modelSlugs,
    models: comparisonRequest.modelSlugs.map((slug, index) => modelProfile(slug, index)),
  });
  const subscriptionEnvelope = buildEnvelope('subscription', subscription.request, subscription.data);
  const mixedSource = buildEnvelope('rankings', custom.request, custom.data, 'available', null, [PRIMARY_SOURCE, SECONDARY_SOURCE]);
  const unavailableSource = { ...PRIMARY_SOURCE, effectiveAt: null };
  const unavailableProfile = buildEnvelope(
    'profile', profileRequest, null, 'unavailable', 'The requested profile is unavailable in this deterministic fixture.', [unavailableSource],
  );
  const invalidTimestamp = { ...structuredClone(models), fetchedAt: '2026-08-18T00:00:00+00:00' };
  const unsupportedVersion = { ...structuredClone(models), contractVersion: 'ui-data-contract/v2' };
  const fixtures: readonly UiDataContractV1AcceptanceFixture[] = [
    { id: 'models', classification: 'method_response', method: 'models', transport: { httpMethod: 'GET', path: '/api/benchmarks/models', rawQuery: 'access=all&limit=3', expectedHttpStatus: 200 }, normalizedRequest: modelsRequest, path: 'contracts/ui-data-contract/v1/evidence/responses/models.json', schemaRef: '#/$defs/modelsEnvelope', expected: { outcome: 'accept', errorCode: null }, candidate: models },
    { id: 'profile', classification: 'method_response', method: 'profile', transport: { httpMethod: 'GET', path: '/api/benchmarks/models/alpha', rawQuery: null, expectedHttpStatus: 200 }, normalizedRequest: profileRequest, path: 'contracts/ui-data-contract/v1/evidence/responses/profile.json', schemaRef: '#/$defs/profileEnvelope', expected: { outcome: 'accept', errorCode: null }, candidate: profile },
    { id: 'lifecycle', classification: 'method_response', method: 'lifecycle', transport: { httpMethod: 'GET', path: '/api/benchmarks/lifecycle', rawQuery: 'asOf=2026-08-18T00%3A00%3A00.000Z&horizonDays=30', expectedHttpStatus: 200 }, normalizedRequest: lifecycleRequest, path: 'contracts/ui-data-contract/v1/evidence/responses/lifecycle.json', schemaRef: '#/$defs/lifecycleEnvelope', expected: { outcome: 'accept', errorCode: null }, candidate: lifecycle },
    { id: 'rankings', classification: 'method_response', method: 'rankings', transport: { httpMethod: 'GET', path: '/api/benchmarks/rankings', rawQuery: 'operation=leaderboard&limit=50', expectedHttpStatus: 200 }, normalizedRequest: rankingsRequest, path: 'contracts/ui-data-contract/v1/evidence/responses/rankings.json', schemaRef: '#/$defs/rankingsEnvelope', expected: { outcome: 'accept', errorCode: null }, candidate: rankings },
    { id: 'comparison', classification: 'method_response', method: 'comparison', transport: { httpMethod: 'GET', path: '/api/benchmarks/comparison', rawQuery: 'models=alpha%2Cbeta%2Cgamma', expectedHttpStatus: 200 }, normalizedRequest: comparisonRequest, path: 'contracts/ui-data-contract/v1/evidence/responses/comparison.json', schemaRef: '#/$defs/comparisonEnvelope', expected: { outcome: 'accept', errorCode: null }, candidate: comparison },
    { id: 'subscription', classification: 'method_response', method: 'subscription', transport: { httpMethod: 'POST', path: '/api/benchmarks/subscription', rawQuery: null, expectedHttpStatus: 200 }, normalizedRequest: subscription.request, path: 'contracts/ui-data-contract/v1/evidence/responses/subscription.json', schemaRef: '#/$defs/subscriptionEnvelope', expected: { outcome: 'accept', errorCode: null }, candidate: subscriptionEnvelope },
    { id: 'rankings-mixed-source', classification: 'mixed_source', method: 'rankings', transport: { httpMethod: 'POST', path: '/api/benchmarks/rankings', rawQuery: null, expectedHttpStatus: 200 }, normalizedRequest: custom.request, path: 'contracts/ui-data-contract/v1/evidence/responses/rankings.mixed-source.json', schemaRef: '#/$defs/rankingsEnvelope', expected: { outcome: 'accept', errorCode: null }, candidate: mixedSource },
    { id: 'profile-unavailable', classification: 'unavailable', method: 'profile', transport: { httpMethod: 'GET', path: '/api/benchmarks/models/alpha', rawQuery: null, expectedHttpStatus: 404 }, normalizedRequest: profileRequest, path: 'contracts/ui-data-contract/v1/evidence/responses/profile.unavailable.json', schemaRef: '#/$defs/profileEnvelope', expected: { outcome: 'accept', errorCode: null }, candidate: unavailableProfile },
    { id: 'models-invalid-timestamp', classification: 'expected_rejection', method: 'models', transport: { httpMethod: 'GET', path: '/api/benchmarks/models', rawQuery: 'access=all&limit=3', expectedHttpStatus: null }, normalizedRequest: modelsRequest, path: 'contracts/ui-data-contract/v1/evidence/rejections/models.invalid-timestamp.json', schemaRef: '#/$defs/modelsEnvelope', expected: { outcome: 'reject', errorCode: 'invalid_timestamp' }, candidate: invalidTimestamp },
    { id: 'models-unsupported-version', classification: 'expected_rejection', method: 'models', transport: { httpMethod: 'GET', path: '/api/benchmarks/models', rawQuery: 'access=all&limit=3', expectedHttpStatus: null }, normalizedRequest: modelsRequest, path: 'contracts/ui-data-contract/v1/evidence/rejections/models.unsupported-version.json', schemaRef: '#/$defs/modelsEnvelope', expected: { outcome: 'reject', errorCode: 'unsupported_contract_version' }, candidate: unsupportedVersion },
  ];
  fixtures.forEach(evaluateUiDataContractV1AcceptanceFixture);
  return fixtures;
}

const INTERNAL_KEYS = new Set(['r2Key', 'd1Table', 'cacheChunkKey', 'bindingName', 'authorization', 'headers']);
const CREDENTIAL_KEYS = new Set(['credential', 'credentials', 'password', 'secret', 'token', 'apiKey', 'accessKey', 'privateKey', 'sourcePayload', 'payload']);
const HOME_PATH = /^(?:\/Users\/|\/home\/|C:\\Users\\|\\\\Users\\)/u;

export async function assertUiDataContractV1PublicEvidenceSafe(value: unknown): Promise<void> {
  const candidate = typeof value === 'string' ? JSON.parse(value) : value;
  const visit = (node: unknown): void => {
    if (typeof node === 'string') {
      if (HOME_PATH.test(node)) throw new Error('Public evidence must not contain a host path.');
      if (/^(?:Basic|Bearer)\s+\S+/iu.test(node) || /-----BEGIN [A-Z ]*PRIVATE KEY-----/u.test(node)) {
        throw new Error('Public evidence must not contain credentials.');
      }
      return;
    }
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    for (const [key, nested] of Object.entries(node)) {
      if (INTERNAL_KEYS.has(key)) throw new Error(`Public evidence must not contain storage internal or headers key ${key}.`);
      if (CREDENTIAL_KEYS.has(key)) throw new Error(`Public evidence must not contain credentials or source payload key ${key}.`);
      visit(nested);
    }
  };
  visit(candidate);
}
