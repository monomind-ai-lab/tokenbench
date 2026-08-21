import { compareUtf8Binary, isCanonicalIsoTimestamp } from '../benchmarks/contracts';
import {
  decodeBoundedJson,
  UiDataContractValidationError,
  type EvidenceValue,
  type SourceAttribution,
} from './ui-data-contract-v1-core';
import {
  SAFE_MODEL_SLUG,
  type RouteFact,
  type RoutePricingTier,
  type SafeModelSlug,
} from './ui-data-contract-v1-models';
import type {
  EntitlementBoundType,
  EntitlementEvidenceStatus,
  EntitlementMetric,
  EntitlementWindow,
} from '../catalog/contracts';

const BASIS_POINTS = 10_000;
const MILLION = 1_000_000n;
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const COST_LINE_ORDER = ['standard_input', 'cache_read', 'cache_write', 'output'] as const;
const CROSSOVER_DOMAIN = [
  0, 25_000_000, 50_000_000, 100_000_000, 150_000_000, 200_000_000, 250_000_000, 300_000_000,
] as const;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;

type UnknownRecord = Record<string, unknown>;

export interface SubscriptionMixItem {
  readonly modelSlug: SafeModelSlug;
  readonly routeId: string;
  readonly pricingTierId: string | null;
  readonly tierContextTokens: number;
  readonly shareBasisPoints: number;
}

export interface SubscriptionWorkload {
  readonly conversationsPerDay: number;
  readonly messagesPerConversation: number;
  readonly inputTokensPerMessage: number;
  readonly outputTokensPerMessage: number;
  readonly activeDaysPerMonth: number;
}

export interface SubscriptionWorkloadShape extends SubscriptionWorkload {
  readonly cacheReadShareBasisPoints: number;
  readonly cacheWriteShareBasisPoints: number;
}

export type SubscriptionRequest =
  | { readonly operation: 'catalog' }
  | {
    readonly operation: 'calculate';
    readonly planId: string;
    readonly seats: number;
    readonly modelMix: readonly SubscriptionMixItem[];
    readonly workload: SubscriptionWorkload;
    readonly cacheReadShareBasisPoints: number;
    readonly cacheWriteShareBasisPoints: number;
    readonly crossoverTokenVolume: number;
  };

export type SubscriptionCalculationRequest = Extract<SubscriptionRequest, { readonly operation: 'calculate' }>;

export interface SubscriptionPlanFact {
  readonly planId: string;
  readonly providerId: string;
  readonly displayName: string;
  readonly monthlyCostMicroDollars: number;
  /** Provider-disclosed annual checkout amount; unavailable stays distinct from zero. */
  readonly annualCostMicroDollars: EvidenceValue<number>;
  /** Provider-disclosed effective monthly annual price; TokenBench never derives this value. */
  readonly annualEffectiveMonthlyCostMicroDollars: EvidenceValue<number>;
  /**
   * First-party entitlement receipt. Feature limits remain source facts rather
   * than token-equivalent estimates, and `lastVerifiedAt` is the evidence
   * receipt timestamp, not a derived catalog freshness value.
   */
  readonly entitlement: SubscriptionEntitlementReceipt;
  readonly supportedModelSlugs: readonly SafeModelSlug[];
  readonly sourceRefs: readonly string[];
}

export interface SubscriptionEntitlementDimensionReceipt {
  readonly metric: EntitlementMetric;
  readonly minimum: number | null;
  readonly maximum: number | null;
  readonly unit: string;
  readonly window: EntitlementWindow;
  readonly resetRule: string | null;
  readonly modelId: string | null;
  readonly feature: string | null;
  readonly sharedPoolId: string | null;
}

export interface SubscriptionEntitlementReceipt {
  readonly evidenceStatus: EntitlementEvidenceStatus;
  readonly boundType: EntitlementBoundType;
  readonly usageNote: string | null;
  readonly dimensions: readonly SubscriptionEntitlementDimensionReceipt[];
  readonly staleReason: string | null;
  readonly lastVerifiedAt: string;
  readonly sourceRefs: readonly string[];
}

export type EntitlementCapacityUnit =
  | 'messages'
  | 'model_calls'
  | 'credits_micro_dollars'
  | 'tasks'
  | 'feature_uses';

export type EntitlementCapacityWindow = 'rolling_5h' | 'weekly' | 'monthly' | 'billing_cycle';

export interface EntitlementProjectionFact {
  readonly projectionId: string;
  readonly planId: string;
  readonly evidenceState: 'provider_stated' | 'projected' | 'dynamic_unknown';
  readonly formula: string | null;
  readonly assumptions: readonly string[];
  readonly caveats: readonly string[];
  readonly confidence: 'high' | 'medium' | 'low' | null;
  readonly boundType: 'hard_max' | 'practical_upper' | 'outer_ceiling' | 'unknown';
  readonly projectedCapacity: {
    readonly minimum: number | null;
    readonly maximum: number | null;
    readonly unit: EntitlementCapacityUnit;
    readonly window: EntitlementCapacityWindow;
  } | null;
  readonly workloadShape: SubscriptionWorkloadShape;
  readonly sensitivity: {
    readonly minimum: number | null;
    readonly maximum: number | null;
    readonly unit: EntitlementCapacityUnit;
  };
  readonly methodologyVersion: string;
  readonly effectiveAt: string | null;
  readonly sourceRefs: readonly string[];
}

export interface SubscriptionCostLineItem {
  readonly kind: (typeof COST_LINE_ORDER)[number];
  readonly modelSlug: SafeModelSlug;
  readonly routeId: string;
  readonly pricingTierId: string | null;
  readonly tokens: number;
  readonly rateMicroDollarsPerMillion: number;
  readonly costMicroDollars: number;
}

export interface SubscriptionCalculation {
  readonly selectedPlanId: string;
  readonly selectedTiers: readonly {
    readonly modelSlug: SafeModelSlug;
    readonly routeId: string;
    readonly pricingTierId: string | null;
    readonly tierContextTokens: number;
  }[];
  readonly derivedWorkload: {
    readonly monthlyMessages: number;
    readonly monthlyInputTokens: number;
    readonly monthlyOutputTokens: number;
  };
  readonly lineItems: readonly SubscriptionCostLineItem[];
  readonly monthlyApiCostMicroDollars: number;
  readonly monthlySubscriptionCostMicroDollars: number;
  readonly differenceMicroDollars: number;
  readonly cheaper: 'subscription' | 'api' | 'equal';
  readonly breakEvenMessagesPerDay: number | null;
  readonly crossoverTokenVolume: number;
  readonly crossoverApiCostMicroDollars: number;
  readonly crossoverTokens: number | null;
  readonly crossoverDomain: readonly {
    readonly tokenVolume: number;
    readonly apiCostMicroDollars: number;
    readonly subscriptionCostMicroDollars: number;
  }[];
  readonly entitlement: EntitlementProjectionFact;
  readonly methodologyVersion: string;
}

export interface SubscriptionData {
  readonly operation: 'catalog' | 'calculate';
  readonly plans: readonly SubscriptionPlanFact[];
  readonly routes: readonly RouteFact[];
  /**
   * Exact catalog identity for each subscription route. RouteFact intentionally
   * remains reusable across model surfaces, where its owning model is already
   * explicit; the subscription catalog needs this separate, one-to-one map to
   * associate revisioned offer IDs with a provider and model without inference.
   */
  readonly routeBindings: readonly SubscriptionRouteBinding[];
  readonly entitlementProjections: readonly EntitlementProjectionFact[];
  readonly calculation: SubscriptionCalculation | null;
}

export interface SubscriptionRouteBinding {
  readonly routeId: string;
  readonly modelSlug: SafeModelSlug;
  readonly providerId: string;
}

export interface SubscriptionCalculationFacts {
  readonly plans: readonly SubscriptionPlanFact[];
  readonly routes: readonly RouteFact[];
  readonly routeBindings: readonly SubscriptionRouteBinding[];
  readonly entitlementProjections: readonly EntitlementProjectionFact[];
  readonly methodologyVersion: string;
}

interface SelectedPricing {
  readonly mix: SubscriptionMixItem;
  readonly pricingTierId: string | null;
  readonly inputRate: number;
  /** Null remains source-unknown and may only be used when its allocation is zero. */
  readonly cacheReadRate: number | null;
  /** Null remains source-unknown and may only be used when its allocation is zero. */
  readonly cacheWriteRate: number | null;
  readonly outputRate: number;
}

function failRequest(path: string, message: string): never {
  throw new UiDataContractValidationError('invalid_request', path, message);
}

function failResponse(path: string, message: string, code: 'invalid_response' | 'undeclared_field' = 'invalid_response'): never {
  throw new UiDataContractValidationError(code, path, message);
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectRequestRecord(value: unknown, path: string): UnknownRecord {
  if (!isRecord(value)) failRequest(path, 'must be an object');
  return value;
}

function expectResponseRecord(value: unknown, path: string): UnknownRecord {
  if (!isRecord(value)) failResponse(path, 'must be an object');
  return value;
}

function expectRequestKeys(record: UnknownRecord, keys: readonly string[], path: string): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) failRequest(`${path}/${key}`, 'is not declared by ui-data-contract/v1');
  }
  for (const key of keys) {
    if (!(key in record)) failRequest(path, `is missing required field ${key}`);
  }
}

function expectResponseKeys(record: UnknownRecord, keys: readonly string[], path: string): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) failResponse(`${path}/${key}`, 'is not declared by ui-data-contract/v1', 'undeclared_field');
  }
  for (const key of keys) {
    if (!(key in record)) failResponse(path, `is missing required field ${key}`);
  }
}

function expectRequestArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) failRequest(path, 'must be an array');
  return value;
}

function expectResponseArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) failResponse(path, 'must be an array');
  return value;
}

function expectRequestSafeInteger(value: unknown, path: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    failRequest(path, `must be a safe integer from ${minimum} through ${maximum}`);
  }
  return value;
}

function expectResponseSafeInteger(value: unknown, path: string, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    failResponse(path, `must be a safe integer from ${minimum} through ${maximum}`);
  }
  return value;
}

function expectResponseFiniteNumber(value: unknown, path: string, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    failResponse(path, `must be a finite number from ${minimum} through ${maximum}`);
  }
  return value;
}

function expectRequestIdentifier(value: unknown, path: string, maximumLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || Array.from(value).length > maximumLength || CONTROL_CHARACTER.test(value)) {
    failRequest(path, `must be a control-free identifier of at most ${maximumLength} characters`);
  }
  return value;
}

function expectResponseIdentifier(value: unknown, path: string, maximumLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || Array.from(value).length > maximumLength || CONTROL_CHARACTER.test(value)) {
    failResponse(path, `must be a control-free identifier of at most ${maximumLength} characters`);
  }
  return value;
}

function expectRequestModelSlug(value: unknown, path: string): SafeModelSlug {
  if (typeof value !== 'string' || !SAFE_MODEL_SLUG.test(value)) failRequest(path, 'must be a safe model slug');
  return value;
}

function expectResponseModelSlug(value: unknown, path: string): SafeModelSlug {
  if (typeof value !== 'string' || !SAFE_MODEL_SLUG.test(value)) failResponse(path, 'must be a safe model slug');
  return value;
}

function expectNonEmptyResponseString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) failResponse(path, 'must be a non-empty string');
  return value;
}

function expectCanonicalTimestamp(value: unknown, path: string): string {
  if (typeof value !== 'string' || !isCanonicalIsoTimestamp(value)) {
    failResponse(path, 'must be a canonical UTC timestamp');
  }
  return value;
}

function expectUniqueStrings(values: readonly string[], path: string, request = false): void {
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    if (seen.has(value)) {
      if (request) failRequest(`${path}/${index}`, 'must not repeat a value');
      failResponse(`${path}/${index}`, 'must not repeat a value');
    }
    seen.add(value);
  }
}

function normalizeWorkload(value: unknown, path: string): SubscriptionWorkload {
  const workload = expectRequestRecord(value, path);
  expectRequestKeys(workload, [
    'conversationsPerDay', 'messagesPerConversation', 'inputTokensPerMessage', 'outputTokensPerMessage', 'activeDaysPerMonth',
  ], path);
  return {
    conversationsPerDay: expectRequestSafeInteger(workload.conversationsPerDay, `${path}/conversationsPerDay`, 0, 10_000),
    messagesPerConversation: expectRequestSafeInteger(workload.messagesPerConversation, `${path}/messagesPerConversation`, 0, 1_000),
    inputTokensPerMessage: expectRequestSafeInteger(workload.inputTokensPerMessage, `${path}/inputTokensPerMessage`, 0, 1_000_000),
    outputTokensPerMessage: expectRequestSafeInteger(workload.outputTokensPerMessage, `${path}/outputTokensPerMessage`, 0, 1_000_000),
    activeDaysPerMonth: expectRequestSafeInteger(workload.activeDaysPerMonth, `${path}/activeDaysPerMonth`, 0, 31),
  };
}

export function normalizeSubscriptionRequest(value: unknown): SubscriptionRequest {
  const request = expectRequestRecord(value, '$/request');
  if (request.operation === 'catalog') {
    expectRequestKeys(request, ['operation'], '$/request');
    return { operation: 'catalog' };
  }
  if (request.operation !== 'calculate') failRequest('$/request/operation', 'must be catalog or calculate');
  expectRequestKeys(request, [
    'operation', 'planId', 'seats', 'modelMix', 'workload', 'cacheReadShareBasisPoints', 'cacheWriteShareBasisPoints', 'crossoverTokenVolume',
  ], '$/request');
  const modelMix = expectRequestArray(request.modelMix, '$/request/modelMix').map((candidate, index) => {
    const path = `$/request/modelMix/${index}`;
    const mix = expectRequestRecord(candidate, path);
    expectRequestKeys(mix, ['modelSlug', 'routeId', 'pricingTierId', 'tierContextTokens', 'shareBasisPoints'], path);
    const pricingTierId = mix.pricingTierId;
    if (pricingTierId !== null) expectRequestIdentifier(pricingTierId, `${path}/pricingTierId`, 256);
    return {
      modelSlug: expectRequestModelSlug(mix.modelSlug, `${path}/modelSlug`),
      routeId: expectRequestIdentifier(mix.routeId, `${path}/routeId`, 512),
      pricingTierId: pricingTierId as string | null,
      tierContextTokens: expectRequestSafeInteger(mix.tierContextTokens, `${path}/tierContextTokens`, 0, Number.MAX_SAFE_INTEGER),
      shareBasisPoints: expectRequestSafeInteger(mix.shareBasisPoints, `${path}/shareBasisPoints`, 0, BASIS_POINTS),
    } as SubscriptionMixItem;
  });
  if (modelMix.length === 0 || modelMix.length > 16) failRequest('$/request/modelMix', 'must contain one through sixteen model routes');
  const pairs = modelMix.map((mix) => `${mix.modelSlug}\u0000${mix.routeId}`);
  expectUniqueStrings(pairs, '$/request/modelMix', true);
  const shareSum = modelMix.reduce((sum, mix) => sum + mix.shareBasisPoints, 0);
  if (shareSum !== BASIS_POINTS) failRequest('$/request/modelMix', 'shares must sum exactly to 10,000 basis points');
  const cacheReadShareBasisPoints = expectRequestSafeInteger(
    request.cacheReadShareBasisPoints,
    '$/request/cacheReadShareBasisPoints',
    0,
    BASIS_POINTS,
  );
  const cacheWriteShareBasisPoints = expectRequestSafeInteger(
    request.cacheWriteShareBasisPoints,
    '$/request/cacheWriteShareBasisPoints',
    0,
    BASIS_POINTS,
  );
  if (cacheReadShareBasisPoints + cacheWriteShareBasisPoints > BASIS_POINTS) {
    failRequest('$/request', 'cache read and write shares must not exceed 10,000 basis points');
  }
  return {
    operation: 'calculate',
    planId: expectRequestIdentifier(request.planId, '$/request/planId', 256),
    seats: expectRequestSafeInteger(request.seats, '$/request/seats', 1, 50),
    modelMix,
    workload: normalizeWorkload(request.workload, '$/request/workload'),
    cacheReadShareBasisPoints,
    cacheWriteShareBasisPoints,
    crossoverTokenVolume: expectRequestSafeInteger(request.crossoverTokenVolume, '$/request/crossoverTokenVolume', 0, 300_000_000),
  };
}

export function parseSubscriptionBody(bytes: Uint8Array): SubscriptionCalculationRequest {
  const request = normalizeSubscriptionRequest(decodeBoundedJson(bytes, 65_536));
  if (request.operation !== 'calculate') failRequest('$/request/operation', 'subscription request bodies must use calculate operation');
  return request;
}

function safeUnsigned(value: bigint, label: string): number {
  if (value < 0n || value > MAX_SAFE_BIGINT) failResponse('$', `${label} exceeds the safe integer range`);
  return Number(value);
}

function safeSigned(value: bigint, label: string): number {
  if (value < -MAX_SAFE_BIGINT || value > MAX_SAFE_BIGINT) failResponse('$', `${label} exceeds the safe integer range`);
  return Number(value);
}

function roundedCost(tokens: number, rateMicroDollarsPerMillion: number, label: string): number {
  const numerator = BigInt(tokens) * BigInt(rateMicroDollarsPerMillion);
  return safeUnsigned((numerator + 500_000n) / MILLION, label);
}

function ceilingDivide(numerator: bigint, denominator: bigint, label: string): number {
  if (denominator <= 0n) failResponse('$', `${label} requires a positive denominator`);
  return safeUnsigned((numerator + denominator - 1n) / denominator, label);
}

function allocateTokens(total: number, weights: readonly number[], label: string): number[] {
  if (!Number.isSafeInteger(total) || total < 0) failResponse('$', `${label} total must be a non-negative safe integer`);
  const totalTokens = BigInt(total);
  const normalizedWeights = weights.map((weight) => {
    if (!Number.isSafeInteger(weight) || weight < 0) failResponse('$', `${label} weights must be non-negative safe integers`);
    return BigInt(weight);
  });
  const denominator = normalizedWeights.reduce((sum, weight) => sum + weight, 0n);
  if (denominator <= 0n) failResponse('$', `${label} weights must include a positive value`);
  const completeCycles = totalTokens / denominator;
  const remainder = totalTokens % denominator;
  let intervalStart = 0n;
  const allocated = normalizedWeights.map((weight) => {
    const intervalEnd = intervalStart + weight;
    const overlapEnd = remainder < intervalEnd ? remainder : intervalEnd;
    const overlap = overlapEnd > intervalStart ? overlapEnd - intervalStart : 0n;
    const tokens = completeCycles * weight + overlap;
    intervalStart = intervalEnd;
    return tokens;
  });
  const assigned = allocated.reduce((sum, tokens) => sum + tokens, 0n);
  if (assigned !== totalTokens) failResponse('$', `${label} token allocation must preserve the total`);
  return allocated.map((tokens) => safeUnsigned(tokens, `${label} allocated tokens`));
}

function evidenceRate(value: EvidenceValue<number>, label: string): number {
  if (value.availability !== 'available') failResponse('$', `${label} must be available for a calculation`);
  if (!Number.isSafeInteger(value.value) || value.value < 0) failResponse('$', `${label} must be a non-negative safe integer`);
  return value.value;
}

function optionalEvidenceRate(value: EvidenceValue<number>, label: string): number | null {
  if (value.availability === 'unavailable') return null;
  if (!Number.isSafeInteger(value.value) || value.value < 0) failResponse('$', `${label} must be a non-negative safe integer`);
  return value.value;
}

function evidenceContext(value: EvidenceValue<number>, label: string): number {
  if (value.availability !== 'available') failResponse('$', `${label} must be available for a calculation`);
  if (!Number.isSafeInteger(value.value) || value.value < 1) failResponse('$', `${label} must be a positive safe integer`);
  return value.value;
}

function findExactlyOne<T>(values: readonly T[], predicate: (value: T) => boolean, path: string, message: string): T {
  const matches = values.filter(predicate);
  if (matches.length !== 1) failResponse(path, message);
  return matches[0];
}

function tierContains(tier: RoutePricingTier, contextTokens: number): boolean {
  return tier.minimumContextTokens <= contextTokens
    && (tier.maximumContextTokens === null || contextTokens <= tier.maximumContextTokens);
}

function resolveTier(route: RouteFact, mix: SubscriptionMixItem): RoutePricingTier | null {
  if (route.status === 'unavailable') failResponse('$/data/routes', `route ${route.routeId} is unavailable for calculation`);
  const contextWindow = evidenceContext(route.contextWindowTokens, `route ${route.routeId} context window`);
  if (mix.tierContextTokens > contextWindow) {
    failRequest('$/request/modelMix', `tier context exceeds route ${route.routeId} context window`);
  }
  if (mix.pricingTierId !== null) {
    const tier = route.pricingTiers.find((candidate) => candidate.pricingTierId === mix.pricingTierId);
    if (tier === undefined) failRequest('$/request/modelMix', `pricing tier ${mix.pricingTierId} does not exist for route ${route.routeId}`);
    if (!tierContains(tier, mix.tierContextTokens)) {
      failRequest('$/request/modelMix', `pricing tier ${mix.pricingTierId} does not cover the requested context`);
    }
    return tier;
  }
  const candidates = route.pricingTiers.filter((tier) => tierContains(tier, mix.tierContextTokens));
  if (candidates.length === 0) return null;
  return [...candidates].sort((left, right) => (
    right.minimumContextTokens - left.minimumContextTokens
    || (left.maximumContextTokens ?? Number.MAX_SAFE_INTEGER) - (right.maximumContextTokens ?? Number.MAX_SAFE_INTEGER)
    || compareUtf8Binary(left.pricingTierId, right.pricingTierId)
  ))[0];
}

function selectedPricing(request: SubscriptionCalculationRequest, facts: SubscriptionCalculationFacts): {
  readonly plan: SubscriptionPlanFact;
  readonly entitlement: EntitlementProjectionFact;
  readonly prices: readonly SelectedPricing[];
} {
  if (
    !Array.isArray(facts.plans)
    || !Array.isArray(facts.routes)
    || !Array.isArray(facts.routeBindings)
    || !Array.isArray(facts.entitlementProjections)
  ) {
    failResponse('$', 'subscription calculation facts must contain plans, routes, route bindings, and entitlement projections');
  }
  if (typeof facts.methodologyVersion !== 'string' || facts.methodologyVersion.trim().length === 0) {
    failResponse('$', 'subscription calculation facts require a methodology version');
  }
  const plan = findExactlyOne(facts.plans, (candidate) => candidate.planId === request.planId, '$/data/plans', 'must contain exactly one selected plan');
  if (!Number.isSafeInteger(plan.monthlyCostMicroDollars) || plan.monthlyCostMicroDollars < 0) {
    failResponse('$/data/plans', 'selected plan monthly cost must be a non-negative safe integer');
  }
  const entitlement = findExactlyOne(
    facts.entitlementProjections,
    (candidate) => candidate.planId === request.planId,
    '$/data/entitlementProjections',
    'must contain exactly one entitlement projection for the selected plan',
  );
  if (entitlement.methodologyVersion !== facts.methodologyVersion) {
    failResponse('$/data/entitlementProjections', 'selected entitlement methodology must match calculation facts');
  }
  const workloadShape = entitlement.workloadShape;
  if (
    workloadShape.conversationsPerDay !== request.workload.conversationsPerDay
    || workloadShape.messagesPerConversation !== request.workload.messagesPerConversation
    || workloadShape.inputTokensPerMessage !== request.workload.inputTokensPerMessage
    || workloadShape.outputTokensPerMessage !== request.workload.outputTokensPerMessage
    || workloadShape.activeDaysPerMonth !== request.workload.activeDaysPerMonth
    || workloadShape.cacheReadShareBasisPoints !== request.cacheReadShareBasisPoints
    || workloadShape.cacheWriteShareBasisPoints !== request.cacheWriteShareBasisPoints
  ) {
    failResponse('$/data/entitlementProjections', 'selected entitlement workload shape must match the calculation request');
  }
  const prices = request.modelMix.map((mix) => {
    if (!plan.supportedModelSlugs.includes(mix.modelSlug)) {
      failRequest('$/request/modelMix', `selected plan does not support ${mix.modelSlug}`);
    }
    const route = findExactlyOne(facts.routes, (candidate) => candidate.routeId === mix.routeId, '$/data/routes', 'must contain exactly one selected route');
    const binding = findExactlyOne(
      facts.routeBindings,
      (candidate) => candidate.routeId === mix.routeId,
      '$/data/routeBindings',
      'must contain exactly one selected route binding',
    );
    if (binding.modelSlug !== mix.modelSlug || binding.providerId !== plan.providerId || binding.providerId !== route.providerId) {
      failRequest('$/request/modelMix', 'selected route must have an exact reviewed model and provider binding for the selected plan');
    }
    const tier = resolveTier(route, mix);
    const rateSource = tier ?? route;
    return {
      mix,
      pricingTierId: tier?.pricingTierId ?? null,
      inputRate: evidenceRate(rateSource.inputMicroDollarsPerMillion, `${mix.routeId} input price`),
      cacheReadRate: optionalEvidenceRate(rateSource.cacheReadMicroDollarsPerMillion, `${mix.routeId} cache read price`),
      cacheWriteRate: optionalEvidenceRate(rateSource.cacheWriteMicroDollarsPerMillion, `${mix.routeId} cache write price`),
      outputRate: evidenceRate(rateSource.outputMicroDollarsPerMillion, `${mix.routeId} output price`),
    };
  });
  return { plan, entitlement, prices };
}

function deriveWorkload(workload: SubscriptionWorkload): SubscriptionCalculation['derivedWorkload'] {
  const monthlyMessages = BigInt(workload.conversationsPerDay)
    * BigInt(workload.messagesPerConversation)
    * BigInt(workload.activeDaysPerMonth);
  return {
    monthlyMessages: safeUnsigned(monthlyMessages, 'monthly messages'),
    monthlyInputTokens: safeUnsigned(monthlyMessages * BigInt(workload.inputTokensPerMessage), 'monthly input tokens'),
    monthlyOutputTokens: safeUnsigned(monthlyMessages * BigInt(workload.outputTokensPerMessage), 'monthly output tokens'),
  };
}

function priceDirectionalTokens(
  inputTokenTotal: number,
  outputTokenTotal: number,
  request: SubscriptionCalculationRequest,
  prices: readonly SelectedPricing[],
  totalLabel: string,
): { readonly lineItems: SubscriptionCostLineItem[]; readonly totalMicroDollars: number } {
  const inputTokens = allocateTokens(inputTokenTotal, prices.map((price) => price.mix.shareBasisPoints), 'model input');
  const outputTokens = allocateTokens(outputTokenTotal, prices.map((price) => price.mix.shareBasisPoints), 'model output');
  const inputLineShares = [
    BASIS_POINTS - request.cacheReadShareBasisPoints - request.cacheWriteShareBasisPoints,
    request.cacheReadShareBasisPoints,
    request.cacheWriteShareBasisPoints,
  ];
  const lineItems: SubscriptionCostLineItem[] = [];
  for (const [index, price] of prices.entries()) {
    const [standardInput, cacheRead, cacheWrite] = allocateTokens(inputTokens[index], inputLineShares, 'cache input');
    const definitions: ReadonlyArray<readonly [(typeof COST_LINE_ORDER)[number], number, number | null]> = [
      ['standard_input', standardInput, price.inputRate],
      ['cache_read', cacheRead, price.cacheReadRate],
      ['cache_write', cacheWrite, price.cacheWriteRate],
      ['output', outputTokens[index], price.outputRate],
    ];
    for (const [kind, tokens, rateMicroDollarsPerMillion] of definitions) {
      if (rateMicroDollarsPerMillion === null) {
        if (tokens > 0) {
          failResponse('$', `${price.mix.routeId} ${kind.replace('_', ' ')} price must be available when its allocation is positive`);
        }
        continue;
      }
      lineItems.push({
        kind,
        modelSlug: price.mix.modelSlug,
        routeId: price.mix.routeId,
        pricingTierId: price.pricingTierId,
        tokens,
        rateMicroDollarsPerMillion,
        costMicroDollars: roundedCost(tokens, rateMicroDollarsPerMillion, `${kind} cost`),
      });
    }
  }
  return {
    lineItems,
    totalMicroDollars: safeUnsigned(
      lineItems.reduce((sum, lineItem) => sum + BigInt(lineItem.costMicroDollars), 0n),
      totalLabel,
    ),
  };
}

function buildLineItems(
  request: SubscriptionCalculationRequest,
  prices: readonly SelectedPricing[],
  derived: SubscriptionCalculation['derivedWorkload'],
): { readonly lineItems: SubscriptionCostLineItem[]; readonly totalMicroDollars: number } {
  return priceDirectionalTokens(
    derived.monthlyInputTokens,
    derived.monthlyOutputTokens,
    request,
    prices,
    'monthly API cost',
  );
}

function crossoverApiCost(
  tokenVolume: number,
  request: SubscriptionCalculationRequest,
  prices: readonly SelectedPricing[],
): number {
  const composition = request.workload.inputTokensPerMessage + request.workload.outputTokensPerMessage;
  if (composition === 0) return 0;
  const [inputTokens, outputTokens] = allocateTokens(tokenVolume, [
    request.workload.inputTokensPerMessage,
    request.workload.outputTokensPerMessage,
  ], 'crossover direction');
  return priceDirectionalTokens(
    inputTokens,
    outputTokens,
    request,
    prices,
    'crossover API cost',
  ).totalMicroDollars;
}

function findCrossoverTokens(
  subscriptionCostMicroDollars: number,
  request: SubscriptionCalculationRequest,
  prices: readonly SelectedPricing[],
): number | null {
  if (crossoverApiCost(300_000_000, request, prices) < subscriptionCostMicroDollars) return null;
  let low = 0;
  let high = 300_000_000;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (crossoverApiCost(middle, request, prices) >= subscriptionCostMicroDollars) high = middle;
    else low = middle + 1;
  }
  return low;
}

export function buildSubscriptionCalculation(
  value: SubscriptionCalculationRequest,
  facts: SubscriptionCalculationFacts,
): SubscriptionCalculation {
  const normalized = normalizeSubscriptionRequest(value);
  if (normalized.operation !== 'calculate') failRequest('$/request/operation', 'a subscription calculation requires calculate operation');
  const { plan, entitlement, prices } = selectedPricing(normalized, facts);
  const derivedWorkload = deriveWorkload(normalized.workload);
  const monthlyPricing = buildLineItems(normalized, prices, derivedWorkload);
  const lineItems = monthlyPricing.lineItems;
  const monthlyApiCostMicroDollars = monthlyPricing.totalMicroDollars;
  const monthlySubscriptionCostMicroDollars = safeUnsigned(
    BigInt(plan.monthlyCostMicroDollars) * BigInt(normalized.seats),
    'monthly subscription cost',
  );
  const differenceMicroDollars = safeSigned(
    BigInt(monthlyApiCostMicroDollars) - BigInt(monthlySubscriptionCostMicroDollars),
    'subscription/API difference',
  );
  const breakEvenCandidate = normalized.workload.activeDaysPerMonth > 0
    && derivedWorkload.monthlyMessages > 0
    && monthlyApiCostMicroDollars > 0
    ? ceilingDivide(
      BigInt(monthlySubscriptionCostMicroDollars) * BigInt(derivedWorkload.monthlyMessages),
      BigInt(monthlyApiCostMicroDollars) * BigInt(normalized.workload.activeDaysPerMonth),
      'break-even messages per day',
    )
    : null;
  const breakEvenMessagesPerDay = breakEvenCandidate !== null && breakEvenCandidate <= 1_000_000_000
    ? breakEvenCandidate
    : null;
  const crossoverTokens = findCrossoverTokens(monthlySubscriptionCostMicroDollars, normalized, prices);
  const domain = new Set<number>([...CROSSOVER_DOMAIN, normalized.crossoverTokenVolume]);
  if (crossoverTokens !== null) domain.add(crossoverTokens);
  const crossoverDomain = [...domain].sort((left, right) => left - right).map((tokenVolume) => ({
    tokenVolume,
    apiCostMicroDollars: crossoverApiCost(tokenVolume, normalized, prices),
    subscriptionCostMicroDollars: monthlySubscriptionCostMicroDollars,
  }));
  return {
    selectedPlanId: plan.planId,
    selectedTiers: prices.map((price) => ({
      modelSlug: price.mix.modelSlug,
      routeId: price.mix.routeId,
      pricingTierId: price.pricingTierId,
      tierContextTokens: price.mix.tierContextTokens,
    })),
    derivedWorkload,
    lineItems,
    monthlyApiCostMicroDollars,
    monthlySubscriptionCostMicroDollars,
    differenceMicroDollars,
    cheaper: differenceMicroDollars > 0 ? 'subscription' : differenceMicroDollars < 0 ? 'api' : 'equal',
    breakEvenMessagesPerDay,
    crossoverTokenVolume: normalized.crossoverTokenVolume,
    crossoverApiCostMicroDollars: crossoverApiCost(normalized.crossoverTokenVolume, normalized, prices),
    crossoverTokens,
    crossoverDomain,
    entitlement,
    methodologyVersion: facts.methodologyVersion,
  };
}

function sourceReferenceSet(sources: readonly SourceAttribution[]): ReadonlySet<string> {
  const result = new Set<string>();
  for (const [index, source] of sources.entries()) {
    if (result.has(source.sourceRef)) failResponse(`$/sources/${index}/sourceRef`, 'must not repeat a source reference');
    result.add(source.sourceRef);
  }
  return result;
}

function validateSourceRefs(value: unknown, path: string, sourceRefs: ReadonlySet<string>, required: boolean): string[] {
  const refs = expectResponseArray(value, path).map((candidate, index) => expectResponseIdentifier(candidate, `${path}/${index}`, 256));
  if (required && refs.length === 0) failResponse(path, 'must include at least one source reference');
  expectUniqueStrings(refs, path);
  for (const [index, sourceRef] of refs.entries()) {
    if (!sourceRefs.has(sourceRef)) failResponse(`${path}/${index}`, 'must reference a declared source');
  }
  return refs;
}

function validateEvidence<T>(
  value: unknown,
  path: string,
  sourceRefs: ReadonlySet<string>,
  parseAvailable: (value: unknown, path: string) => T,
): EvidenceValue<T> {
  const evidence = expectResponseRecord(value, path);
  if (evidence.availability === 'available') {
    expectResponseKeys(evidence, ['availability', 'value', 'sourceRefs'], path);
    return {
      availability: 'available',
      value: parseAvailable(evidence.value, `${path}/value`),
      sourceRefs: validateSourceRefs(evidence.sourceRefs, `${path}/sourceRefs`, sourceRefs, true),
    };
  }
  if (evidence.availability === 'unavailable') {
    expectResponseKeys(evidence, ['availability', 'value', 'reason', 'sourceRefs'], path);
    if (evidence.value !== null) failResponse(`${path}/value`, 'must be null when unavailable');
    return {
      availability: 'unavailable',
      value: null,
      reason: expectNonEmptyResponseString(evidence.reason, `${path}/reason`),
      sourceRefs: validateSourceRefs(evidence.sourceRefs, `${path}/sourceRefs`, sourceRefs, false),
    };
  }
  failResponse(`${path}/availability`, 'must be available or unavailable');
}

function validatePricingTier(value: unknown, path: string, sourceRefs: ReadonlySet<string>): RoutePricingTier {
  const tier = expectResponseRecord(value, path);
  expectResponseKeys(tier, [
    'pricingTierId', 'minimumContextTokens', 'maximumContextTokens', 'inputMicroDollarsPerMillion', 'outputMicroDollarsPerMillion',
    'cacheReadMicroDollarsPerMillion', 'cacheWriteMicroDollarsPerMillion',
  ], path);
  const minimumContextTokens = expectResponseSafeInteger(tier.minimumContextTokens, `${path}/minimumContextTokens`, 0);
  const maximumContextTokens = tier.maximumContextTokens === null
    ? null
    : expectResponseSafeInteger(tier.maximumContextTokens, `${path}/maximumContextTokens`, minimumContextTokens);
  return {
    pricingTierId: expectResponseIdentifier(tier.pricingTierId, `${path}/pricingTierId`, 256),
    minimumContextTokens,
    maximumContextTokens,
    inputMicroDollarsPerMillion: validateEvidence(tier.inputMicroDollarsPerMillion, `${path}/inputMicroDollarsPerMillion`, sourceRefs, (candidate, candidatePath) => (
      expectResponseSafeInteger(candidate, candidatePath, 0)
    )),
    outputMicroDollarsPerMillion: validateEvidence(tier.outputMicroDollarsPerMillion, `${path}/outputMicroDollarsPerMillion`, sourceRefs, (candidate, candidatePath) => (
      expectResponseSafeInteger(candidate, candidatePath, 0)
    )),
    cacheReadMicroDollarsPerMillion: validateEvidence(tier.cacheReadMicroDollarsPerMillion, `${path}/cacheReadMicroDollarsPerMillion`, sourceRefs, (candidate, candidatePath) => (
      expectResponseSafeInteger(candidate, candidatePath, 0)
    )),
    cacheWriteMicroDollarsPerMillion: validateEvidence(tier.cacheWriteMicroDollarsPerMillion, `${path}/cacheWriteMicroDollarsPerMillion`, sourceRefs, (candidate, candidatePath) => (
      expectResponseSafeInteger(candidate, candidatePath, 0)
    )),
  };
}

function validateModalities(value: unknown, path: string): RouteFact['inputModalities'] {
  const allowed = new Set<RouteFact['inputModalities'][number]>(['text', 'image', 'audio', 'video', 'file']);
  const modalities = expectResponseArray(value, path).map((candidate, index) => {
    if (typeof candidate !== 'string' || !allowed.has(candidate as RouteFact['inputModalities'][number])) {
      failResponse(`${path}/${index}`, 'must be a declared modality');
    }
    return candidate as RouteFact['inputModalities'][number];
  });
  expectUniqueStrings(modalities, path);
  return modalities;
}

function validateRuntimeObservation(value: unknown, path: string): {
  readonly windowStartedAt: string;
  readonly windowEndedAt: string;
  readonly sampleSize: number;
  readonly ttftPercentile: 'p50';
  readonly tpsPercentile: 'p50';
} {
  const observation = expectResponseRecord(value, path);
  expectResponseKeys(observation, ['windowStartedAt', 'windowEndedAt', 'sampleSize', 'ttftPercentile', 'tpsPercentile'], path);
  if (!isCanonicalIsoTimestamp(observation.windowStartedAt) || !isCanonicalIsoTimestamp(observation.windowEndedAt)) {
    failResponse(path, 'must use canonical UTC observation timestamps');
  }
  if (observation.windowStartedAt > observation.windowEndedAt) failResponse(path, 'must not end before it starts');
  if (observation.ttftPercentile !== 'p50' || observation.tpsPercentile !== 'p50') {
    failResponse(path, 'must publish p50 runtime observations');
  }
  return {
    windowStartedAt: observation.windowStartedAt,
    windowEndedAt: observation.windowEndedAt,
    sampleSize: expectResponseSafeInteger(observation.sampleSize, `${path}/sampleSize`, 1),
    ttftPercentile: 'p50',
    tpsPercentile: 'p50',
  };
}

function validateRoute(value: unknown, path: string, sourceRefs: ReadonlySet<string>): RouteFact {
  const route = expectResponseRecord(value, path);
  expectResponseKeys(route, [
    'routeId', 'providerId', 'status', 'inputMicroDollarsPerMillion', 'outputMicroDollarsPerMillion',
    'cacheReadMicroDollarsPerMillion', 'cacheWriteMicroDollarsPerMillion', 'contextWindowTokens', 'maxOutputTokens',
    'inputModalities', 'outputModalities', 'ttftP50Ms', 'tpsP50', 'uptimeBasisPoints', 'runtimeObservation', 'pricingTiers',
  ], path);
  if (route.status !== 'available' && route.status !== 'limited' && route.status !== 'deprecated' && route.status !== 'unavailable') {
    failResponse(`${path}/status`, 'must be a declared route status');
  }
  const pricingTiers = expectResponseArray(route.pricingTiers, `${path}/pricingTiers`).map((tier, index) => (
    validatePricingTier(tier, `${path}/pricingTiers/${index}`, sourceRefs)
  ));
  expectUniqueStrings(pricingTiers.map((tier) => tier.pricingTierId), `${path}/pricingTiers`);
  return {
    routeId: expectResponseIdentifier(route.routeId, `${path}/routeId`, 512),
    providerId: expectResponseIdentifier(route.providerId, `${path}/providerId`, 256),
    status: route.status,
    inputMicroDollarsPerMillion: validateEvidence(route.inputMicroDollarsPerMillion, `${path}/inputMicroDollarsPerMillion`, sourceRefs, (candidate, candidatePath) => (
      expectResponseSafeInteger(candidate, candidatePath, 0)
    )),
    outputMicroDollarsPerMillion: validateEvidence(route.outputMicroDollarsPerMillion, `${path}/outputMicroDollarsPerMillion`, sourceRefs, (candidate, candidatePath) => (
      expectResponseSafeInteger(candidate, candidatePath, 0)
    )),
    cacheReadMicroDollarsPerMillion: validateEvidence(route.cacheReadMicroDollarsPerMillion, `${path}/cacheReadMicroDollarsPerMillion`, sourceRefs, (candidate, candidatePath) => (
      expectResponseSafeInteger(candidate, candidatePath, 0)
    )),
    cacheWriteMicroDollarsPerMillion: validateEvidence(route.cacheWriteMicroDollarsPerMillion, `${path}/cacheWriteMicroDollarsPerMillion`, sourceRefs, (candidate, candidatePath) => (
      expectResponseSafeInteger(candidate, candidatePath, 0)
    )),
    contextWindowTokens: validateEvidence(route.contextWindowTokens, `${path}/contextWindowTokens`, sourceRefs, (candidate, candidatePath) => (
      expectResponseSafeInteger(candidate, candidatePath, 1)
    )),
    maxOutputTokens: validateEvidence(route.maxOutputTokens, `${path}/maxOutputTokens`, sourceRefs, (candidate, candidatePath) => (
      expectResponseSafeInteger(candidate, candidatePath, 1)
    )),
    inputModalities: validateModalities(route.inputModalities, `${path}/inputModalities`),
    outputModalities: validateModalities(route.outputModalities, `${path}/outputModalities`),
    ttftP50Ms: validateEvidence(route.ttftP50Ms, `${path}/ttftP50Ms`, sourceRefs, (candidate, candidatePath) => (
      expectResponseSafeInteger(candidate, candidatePath, 0, 86_400_000)
    )),
    tpsP50: validateEvidence(route.tpsP50, `${path}/tpsP50`, sourceRefs, (candidate, candidatePath) => (
      expectResponseFiniteNumber(candidate, candidatePath, 0, 1_000_000)
    )),
    uptimeBasisPoints: validateEvidence(route.uptimeBasisPoints, `${path}/uptimeBasisPoints`, sourceRefs, (candidate, candidatePath) => (
      expectResponseSafeInteger(candidate, candidatePath, 0, BASIS_POINTS)
    )),
    runtimeObservation: validateEvidence(route.runtimeObservation, `${path}/runtimeObservation`, sourceRefs, validateRuntimeObservation),
    pricingTiers,
  };
}

function validateRouteBinding(value: unknown, path: string): SubscriptionRouteBinding {
  const binding = expectResponseRecord(value, path);
  expectResponseKeys(binding, ['routeId', 'modelSlug', 'providerId'], path);
  return {
    routeId: expectResponseIdentifier(binding.routeId, `${path}/routeId`, 512),
    modelSlug: expectResponseModelSlug(binding.modelSlug, `${path}/modelSlug`),
    providerId: expectResponseIdentifier(binding.providerId, `${path}/providerId`, 256),
  };
}

function validatePlan(value: unknown, path: string, sourceRefs: ReadonlySet<string>): SubscriptionPlanFact {
  const plan = expectResponseRecord(value, path);
  expectResponseKeys(plan, [
    'planId', 'providerId', 'displayName', 'monthlyCostMicroDollars', 'annualCostMicroDollars',
    'annualEffectiveMonthlyCostMicroDollars', 'entitlement', 'supportedModelSlugs', 'sourceRefs',
  ], path);
  const supportedModelSlugs = expectResponseArray(plan.supportedModelSlugs, `${path}/supportedModelSlugs`).map((candidate, index) => (
    expectResponseModelSlug(candidate, `${path}/supportedModelSlugs/${index}`)
  ));
  expectUniqueStrings(supportedModelSlugs, `${path}/supportedModelSlugs`);
  return {
    planId: expectResponseIdentifier(plan.planId, `${path}/planId`, 256),
    providerId: expectResponseIdentifier(plan.providerId, `${path}/providerId`, 256),
    displayName: expectNonEmptyResponseString(plan.displayName, `${path}/displayName`),
    monthlyCostMicroDollars: expectResponseSafeInteger(plan.monthlyCostMicroDollars, `${path}/monthlyCostMicroDollars`, 0),
    annualCostMicroDollars: validateEvidence(plan.annualCostMicroDollars, `${path}/annualCostMicroDollars`, sourceRefs, (candidate, candidatePath) => (
      expectResponseSafeInteger(candidate, candidatePath, 0)
    )),
    annualEffectiveMonthlyCostMicroDollars: validateEvidence(
      plan.annualEffectiveMonthlyCostMicroDollars,
      `${path}/annualEffectiveMonthlyCostMicroDollars`,
      sourceRefs,
      (candidate, candidatePath) => expectResponseSafeInteger(candidate, candidatePath, 0),
    ),
    entitlement: validateEntitlementReceipt(plan.entitlement, `${path}/entitlement`, sourceRefs),
    supportedModelSlugs,
    sourceRefs: validateSourceRefs(plan.sourceRefs, `${path}/sourceRefs`, sourceRefs, true),
  };
}

function nullableReceiptText(value: unknown, path: string): string | null {
  return value === null ? null : expectNonEmptyResponseString(value, path);
}

function nullableReceiptBound(value: unknown, path: string): number | null {
  return value === null ? null : expectResponseFiniteNumber(value, path, 0);
}

function validateEntitlementDimensionReceipt(
  value: unknown,
  path: string,
): SubscriptionEntitlementDimensionReceipt {
  const dimension = expectResponseRecord(value, path);
  expectResponseKeys(dimension, [
    'metric', 'minimum', 'maximum', 'unit', 'window', 'resetRule', 'modelId', 'feature', 'sharedPoolId',
  ], path);
  const metrics = new Set<EntitlementMetric>(['messages', 'model_calls', 'credits', 'tasks', 'feature_uses']);
  const windows = new Set<EntitlementWindow>(['rolling_5h', 'weekly', 'monthly', 'billing_cycle']);
  if (!metrics.has(dimension.metric as EntitlementMetric)) failResponse(`${path}/metric`, 'must be a declared entitlement metric');
  if (!windows.has(dimension.window as EntitlementWindow)) failResponse(`${path}/window`, 'must be a declared entitlement window');
  const minimum = nullableReceiptBound(dimension.minimum, `${path}/minimum`);
  const maximum = nullableReceiptBound(dimension.maximum, `${path}/maximum`);
  if (minimum !== null && maximum !== null && minimum > maximum) failResponse(path, 'minimum must not exceed maximum');
  return {
    metric: dimension.metric as EntitlementMetric,
    minimum,
    maximum,
    unit: expectNonEmptyResponseString(dimension.unit, `${path}/unit`),
    window: dimension.window as EntitlementWindow,
    resetRule: nullableReceiptText(dimension.resetRule, `${path}/resetRule`),
    modelId: nullableReceiptText(dimension.modelId, `${path}/modelId`),
    feature: nullableReceiptText(dimension.feature, `${path}/feature`),
    sharedPoolId: nullableReceiptText(dimension.sharedPoolId, `${path}/sharedPoolId`),
  };
}

function validateEntitlementReceipt(
  value: unknown,
  path: string,
  sourceRefs: ReadonlySet<string>,
): SubscriptionEntitlementReceipt {
  const receipt = expectResponseRecord(value, path);
  expectResponseKeys(receipt, [
    'evidenceStatus', 'boundType', 'usageNote', 'dimensions', 'staleReason', 'lastVerifiedAt', 'sourceRefs',
  ], path);
  const statuses = new Set<EntitlementEvidenceStatus>(['verified', 'projected', 'dynamic_unknown', 'stale']);
  const boundTypes = new Set<EntitlementBoundType>(['hard_max', 'practical_upper', 'outer_ceiling', 'unknown']);
  if (!statuses.has(receipt.evidenceStatus as EntitlementEvidenceStatus)) {
    failResponse(`${path}/evidenceStatus`, 'must be a declared entitlement evidence status');
  }
  if (!boundTypes.has(receipt.boundType as EntitlementBoundType)) {
    failResponse(`${path}/boundType`, 'must be a declared entitlement bound type');
  }
  const staleReason = nullableReceiptText(receipt.staleReason, `${path}/staleReason`);
  if (receipt.evidenceStatus === 'stale' && staleReason === null) {
    failResponse(`${path}/staleReason`, 'is required for stale entitlement evidence');
  }
  return {
    evidenceStatus: receipt.evidenceStatus as EntitlementEvidenceStatus,
    boundType: receipt.boundType as EntitlementBoundType,
    usageNote: nullableReceiptText(receipt.usageNote, `${path}/usageNote`),
    dimensions: expectResponseArray(receipt.dimensions, `${path}/dimensions`).map((dimension, index) => (
      validateEntitlementDimensionReceipt(dimension, `${path}/dimensions/${index}`)
    )),
    staleReason,
    lastVerifiedAt: expectCanonicalTimestamp(receipt.lastVerifiedAt, `${path}/lastVerifiedAt`),
    sourceRefs: validateSourceRefs(receipt.sourceRefs, `${path}/sourceRefs`, sourceRefs, true),
  };
}

function validateNullableCapacityBound(value: unknown, path: string): number | null {
  return value === null ? null : expectResponseSafeInteger(value, path, 0);
}

function validateCapacity(value: unknown, path: string): EntitlementProjectionFact['projectedCapacity'] {
  if (value === null) return null;
  const capacity = expectResponseRecord(value, path);
  expectResponseKeys(capacity, ['minimum', 'maximum', 'unit', 'window'], path);
  const minimum = validateNullableCapacityBound(capacity.minimum, `${path}/minimum`);
  const maximum = validateNullableCapacityBound(capacity.maximum, `${path}/maximum`);
  if (minimum === null && maximum === null) failResponse(path, 'must include at least one capacity bound');
  if (minimum !== null && maximum !== null && minimum > maximum) failResponse(path, 'minimum must not exceed maximum');
  const units = new Set<EntitlementCapacityUnit>(['messages', 'model_calls', 'credits_micro_dollars', 'tasks', 'feature_uses']);
  const windows = new Set<EntitlementCapacityWindow>(['rolling_5h', 'weekly', 'monthly', 'billing_cycle']);
  if (!units.has(capacity.unit as EntitlementCapacityUnit)) failResponse(`${path}/unit`, 'must be a declared capacity unit');
  if (!windows.has(capacity.window as EntitlementCapacityWindow)) failResponse(`${path}/window`, 'must be a declared capacity window');
  return { minimum, maximum, unit: capacity.unit as EntitlementCapacityUnit, window: capacity.window as EntitlementCapacityWindow };
}

function validateWorkloadShape(value: unknown, path: string): SubscriptionWorkloadShape {
  const shape = expectResponseRecord(value, path);
  expectResponseKeys(shape, [
    'conversationsPerDay', 'messagesPerConversation', 'inputTokensPerMessage', 'outputTokensPerMessage', 'activeDaysPerMonth',
    'cacheReadShareBasisPoints', 'cacheWriteShareBasisPoints',
  ], path);
  const workload = {
    conversationsPerDay: expectResponseSafeInteger(shape.conversationsPerDay, `${path}/conversationsPerDay`, 0, 10_000),
    messagesPerConversation: expectResponseSafeInteger(shape.messagesPerConversation, `${path}/messagesPerConversation`, 0, 1_000),
    inputTokensPerMessage: expectResponseSafeInteger(shape.inputTokensPerMessage, `${path}/inputTokensPerMessage`, 0, 1_000_000),
    outputTokensPerMessage: expectResponseSafeInteger(shape.outputTokensPerMessage, `${path}/outputTokensPerMessage`, 0, 1_000_000),
    activeDaysPerMonth: expectResponseSafeInteger(shape.activeDaysPerMonth, `${path}/activeDaysPerMonth`, 0, 31),
  };
  const cacheReadShareBasisPoints = expectResponseSafeInteger(shape.cacheReadShareBasisPoints, `${path}/cacheReadShareBasisPoints`, 0, BASIS_POINTS);
  const cacheWriteShareBasisPoints = expectResponseSafeInteger(shape.cacheWriteShareBasisPoints, `${path}/cacheWriteShareBasisPoints`, 0, BASIS_POINTS);
  if (cacheReadShareBasisPoints + cacheWriteShareBasisPoints > BASIS_POINTS) {
    failResponse(path, 'cache read and write shares must not exceed 10,000 basis points');
  }
  return { ...workload, cacheReadShareBasisPoints, cacheWriteShareBasisPoints };
}

function validateTextList(value: unknown, path: string): string[] {
  return expectResponseArray(value, path).map((candidate, index) => expectNonEmptyResponseString(candidate, `${path}/${index}`));
}

function validateEntitlement(value: unknown, path: string, sourceRefs: ReadonlySet<string>): EntitlementProjectionFact {
  const projection = expectResponseRecord(value, path);
  expectResponseKeys(projection, [
    'projectionId', 'planId', 'evidenceState', 'formula', 'assumptions', 'caveats', 'confidence', 'boundType', 'projectedCapacity',
    'workloadShape', 'sensitivity', 'methodologyVersion', 'effectiveAt', 'sourceRefs',
  ], path);
  if (projection.evidenceState !== 'provider_stated' && projection.evidenceState !== 'projected' && projection.evidenceState !== 'dynamic_unknown') {
    failResponse(`${path}/evidenceState`, 'must be provider_stated, projected, or dynamic_unknown');
  }
  const formula = projection.formula === null ? null : expectNonEmptyResponseString(projection.formula, `${path}/formula`);
  const assumptions = validateTextList(projection.assumptions, `${path}/assumptions`);
  const caveats = validateTextList(projection.caveats, `${path}/caveats`);
  let confidence: EntitlementProjectionFact['confidence'];
  if (projection.confidence === null) confidence = null;
  else if (projection.confidence === 'high' || projection.confidence === 'medium' || projection.confidence === 'low') {
    confidence = projection.confidence;
  } else failResponse(`${path}/confidence`, 'must be high, medium, low, or null');
  const boundType = projection.boundType;
  if (boundType !== 'hard_max' && boundType !== 'practical_upper' && boundType !== 'outer_ceiling' && boundType !== 'unknown') {
    failResponse(`${path}/boundType`, 'must be a declared bound type');
  }
  const projectedCapacity = validateCapacity(projection.projectedCapacity, `${path}/projectedCapacity`);
  const sensitivity = expectResponseRecord(projection.sensitivity, `${path}/sensitivity`);
  expectResponseKeys(sensitivity, ['minimum', 'maximum', 'unit'], `${path}/sensitivity`);
  const sensitivityMinimum = validateNullableCapacityBound(sensitivity.minimum, `${path}/sensitivity/minimum`);
  const sensitivityMaximum = validateNullableCapacityBound(sensitivity.maximum, `${path}/sensitivity/maximum`);
  if (sensitivityMinimum !== null && sensitivityMaximum !== null && sensitivityMinimum > sensitivityMaximum) {
    failResponse(`${path}/sensitivity`, 'minimum must not exceed maximum');
  }
  const capacityUnits = new Set<EntitlementCapacityUnit>(['messages', 'model_calls', 'credits_micro_dollars', 'tasks', 'feature_uses']);
  if (!capacityUnits.has(sensitivity.unit as EntitlementCapacityUnit)) {
    failResponse(`${path}/sensitivity/unit`, 'must be a declared capacity unit');
  }
  if (projectedCapacity !== null && sensitivity.unit !== projectedCapacity.unit) {
    failResponse(`${path}/sensitivity/unit`, 'must match the projected capacity unit');
  }
  if (projection.evidenceState === 'projected') {
    if (formula === null || assumptions.length === 0 || projectedCapacity === null || confidence === null || boundType === 'unknown') {
      failResponse(path, 'projected entitlement requires formula, assumptions, capacity, confidence, and a non-unknown bound');
    }
  } else if (projection.evidenceState === 'provider_stated') {
    if (formula !== null || assumptions.length !== 0 || confidence !== null) {
      failResponse(path, 'provider-stated entitlement must not contain projection formula or assumptions');
    }
    if (projectedCapacity === null && (boundType !== 'unknown' || caveats.length === 0)) {
      failResponse(path, 'qualitative provider-stated entitlement requires an unknown bound and a caveat');
    }
    if (projectedCapacity !== null && boundType === 'unknown') {
      failResponse(path, 'quantitative provider-stated entitlement requires a non-unknown bound');
    }
  } else if (projectedCapacity !== null || formula !== null || assumptions.length !== 0 || confidence !== null || boundType !== 'unknown') {
    failResponse(path, 'dynamic unknown entitlement must retain unknown projection state without projected capacity');
  }
  const validatedSourceRefs = validateSourceRefs(
    projection.sourceRefs,
    `${path}/sourceRefs`,
    sourceRefs,
    projection.evidenceState !== 'dynamic_unknown',
  );
  const effectiveAt = projection.effectiveAt === null
    ? null
    : expectCanonicalTimestamp(projection.effectiveAt, `${path}/effectiveAt`);
  return {
    projectionId: expectResponseIdentifier(projection.projectionId, `${path}/projectionId`, 256),
    planId: expectResponseIdentifier(projection.planId, `${path}/planId`, 256),
    evidenceState: projection.evidenceState,
    formula,
    assumptions,
    caveats,
    confidence,
    boundType,
    projectedCapacity,
    workloadShape: validateWorkloadShape(projection.workloadShape, `${path}/workloadShape`),
    sensitivity: {
      minimum: sensitivityMinimum,
      maximum: sensitivityMaximum,
      unit: sensitivity.unit as EntitlementCapacityUnit,
    },
    methodologyVersion: expectResponseIdentifier(projection.methodologyVersion, `${path}/methodologyVersion`, 256),
    effectiveAt,
    sourceRefs: validatedSourceRefs,
  };
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => sameValue(value, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && sameValue(left[key], right[key]));
}

export function validateSubscriptionData(
  value: SubscriptionRequest,
  candidate: unknown,
  sources: readonly SourceAttribution[],
): SubscriptionData {
  const request = normalizeSubscriptionRequest(value);
  const sourceRefs = sourceReferenceSet(sources);
  const data = expectResponseRecord(candidate, '$/data');
  expectResponseKeys(data, ['operation', 'plans', 'routes', 'routeBindings', 'entitlementProjections', 'calculation'], '$/data');
  if (data.operation !== 'catalog' && data.operation !== 'calculate') failResponse('$/data/operation', 'must be catalog or calculate');
  if (data.operation !== request.operation) failResponse('$/data/operation', 'must match the normalized request operation');
  const plans = expectResponseArray(data.plans, '$/data/plans').map((plan, index) => validatePlan(plan, `$/data/plans/${index}`, sourceRefs));
  const routes = expectResponseArray(data.routes, '$/data/routes').map((route, index) => validateRoute(route, `$/data/routes/${index}`, sourceRefs));
  const routeBindings = expectResponseArray(data.routeBindings, '$/data/routeBindings').map((binding, index) => (
    validateRouteBinding(binding, `$/data/routeBindings/${index}`)
  ));
  const entitlementProjections = expectResponseArray(data.entitlementProjections, '$/data/entitlementProjections').map((projection, index) => (
    validateEntitlement(projection, `$/data/entitlementProjections/${index}`, sourceRefs)
  ));
  expectUniqueStrings(plans.map((plan) => plan.planId), '$/data/plans');
  expectUniqueStrings(routes.map((route) => route.routeId), '$/data/routes');
  expectUniqueStrings(routeBindings.map((binding) => binding.routeId), '$/data/routeBindings');
  expectUniqueStrings(entitlementProjections.map((projection) => projection.projectionId), '$/data/entitlementProjections');
  for (const [index, binding] of routeBindings.entries()) {
    const route = findExactlyOne(
      routes,
      (candidate) => candidate.routeId === binding.routeId,
      '$/data/routes',
      'must contain exactly one route for each route binding',
    );
    if (route.providerId !== binding.providerId) {
      failResponse(`$/data/routeBindings/${index}/providerId`, 'must exactly match its route provider');
    }
  }
  for (const [index, route] of routes.entries()) {
    if (!routeBindings.some((binding) => binding.routeId === route.routeId)) {
      failResponse(`$/data/routes/${index}/routeId`, 'must have exactly one route binding');
    }
  }
  for (const [index, projection] of entitlementProjections.entries()) {
    if (!plans.some((plan) => plan.planId === projection.planId)) {
      failResponse(`$/data/entitlementProjections/${index}/planId`, 'must reference a listed plan');
    }
  }
  if (request.operation === 'catalog') {
    if (data.calculation !== null) failResponse('$/data/calculation', 'must be null for catalog responses');
    return { operation: 'catalog', plans, routes, routeBindings, entitlementProjections, calculation: null };
  }
  if (data.calculation === null) failResponse('$/data/calculation', 'must be non-null for calculate responses');
  expectResponseRecord(data.calculation, '$/data/calculation');
  const selectedEntitlement = findExactlyOne(
    entitlementProjections,
    (projection) => projection.planId === request.planId,
    '$/data/entitlementProjections',
    'must contain exactly one entitlement projection for the selected plan',
  );
  const selectedPlan = findExactlyOne(
    plans,
    (plan) => plan.planId === request.planId,
    '$/data/plans',
    'must contain exactly one selected plan',
  );
  for (const [index, mix] of request.modelMix.entries()) {
    const binding = findExactlyOne(
      routeBindings,
      (candidate) => candidate.routeId === mix.routeId,
      '$/data/routeBindings',
      'must contain exactly one binding for each selected route',
    );
    if (binding.modelSlug !== mix.modelSlug || binding.providerId !== selectedPlan.providerId) {
      failResponse(`$/data/routeBindings/${index}`, 'must exactly bind each selected route to the requested model and plan provider');
    }
  }
  const expectedCalculation = buildSubscriptionCalculation(request, {
    plans,
    routes,
    routeBindings,
    entitlementProjections,
    methodologyVersion: selectedEntitlement.methodologyVersion,
  });
  if (!sameValue(data.calculation, expectedCalculation)) {
    failResponse('$/data/calculation', 'must exactly match the selected plan, routes, tiers, workload, and projection facts');
  }
  return {
    operation: 'calculate',
    plans,
    routes,
    routeBindings,
    entitlementProjections,
    calculation: expectedCalculation,
  };
}
