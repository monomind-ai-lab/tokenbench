import { readPublishedCatalog } from '../catalog';
import type {
  CatalogResponse,
  EntitlementDimension,
  PlanOffer,
  SourceProvenance,
} from '../../../src/catalog/contracts';
import {
  buildUiDataContractV1Envelope,
  type DataWarning,
  type EvidenceValue,
  type SourceAttribution,
} from '../../../src/pipeline/ui-data-contract-v1-core';
import {
  SAFE_MODEL_SLUG,
  type RouteFact,
} from '../../../src/pipeline/ui-data-contract-v1-models';
import {
  buildSubscriptionCalculation,
  normalizeSubscriptionRequest,
  parseSubscriptionBody,
  validateSubscriptionData,
  type EntitlementProjectionFact,
  type SubscriptionCalculationRequest,
  type SubscriptionData,
  type SubscriptionRequest,
  type SubscriptionWorkloadShape,
} from '../../../src/pipeline/ui-data-contract-v1-subscription';
import {
  buildUnavailableUiDataEnvelope,
  jsonUiDataResponse,
} from '../../_shared/livebench-v1-api';

interface D1Statement {
  bind(...values: unknown[]): { all(): Promise<{ results: unknown[] }> };
}

interface D1Database {
  prepare(query: string): D1Statement;
}

interface Env {
  CATALOG_DB?: D1Database;
}

const PROVIDER_SCOPE = new Set([
  'openai',
  'anthropic',
  'google',
  'xai',
  'zai',
  'perplexity',
  'microsoft',
]);
const PROJECTION_METHODOLOGY = 'catalog-subscription-v1';
const CATALOG_WORKLOAD_SHAPE = {
  conversationsPerDay: 0,
  messagesPerConversation: 0,
  inputTokensPerMessage: 0,
  outputTokensPerMessage: 0,
  activeDaysPerMonth: 0,
  cacheReadShareBasisPoints: 0,
  cacheWriteShareBasisPoints: 0,
} as const;

function unavailable(request: SubscriptionRequest, fetchedAt: string, reason: string): Response {
  return jsonUiDataResponse(buildUnavailableUiDataEnvelope({
    method: 'subscription',
    request,
    fetchedAt,
    reason,
  }), 404);
}

function invalidRequest(): Response {
  return jsonUiDataResponse({ error: { code: 'invalid_request', message: 'The subscription request is invalid.' } }, 400);
}

function reviewedSource(source: SourceProvenance): boolean {
  return source.reviewStatus !== 'rejected'
    && (source.confidence === 'official' || source.confidence === 'manual_verified')
    && (source.reviewStatus === undefined || source.reviewStatus === 'verified');
}

function sourceRef(revision: string, sourceId: string): string {
  return `catalog:${revision}:${sourceId}`;
}

function sourceAttribution(catalog: CatalogResponse, source: SourceProvenance): SourceAttribution {
  return {
    sourceRef: sourceRef(catalog.revision, source.id),
    fieldGroup: '/data',
    sourceId: source.id,
    sourceRevision: catalog.revision,
    label: 'Reviewed provider catalog record',
    url: source.sourceUrl,
    licenseId: 'provider-terms',
    observedAt: source.observedAt,
    effectiveAt: source.observedAt,
  };
}

function available<T>(value: T, source: string): EvidenceValue<T> {
  return { availability: 'available', value, sourceRefs: [source] };
}

function unknown<T>(reason: string, source: string): EvidenceValue<T> {
  return { availability: 'unavailable', value: null, reason, sourceRefs: [source] };
}

function subscriptionUnavailableWarnings(value: unknown): DataWarning[] {
  const warnings: DataWarning[] = [];
  const walk = (current: unknown, path: string): void => {
    if (Array.isArray(current)) {
      current.forEach((entry, index) => walk(entry, `${path}/${index}`));
      return;
    }
    if (!current || typeof current !== 'object') return;
    const record = current as Record<string, unknown>;
    if (record.availability === 'unavailable' && record.value === null) {
      warnings.push({
        code: 'subscription_field_unavailable',
        fieldGroup: path,
        state: 'unknown',
        message: typeof record.reason === 'string' && record.reason.trim().length > 0
          ? record.reason
          : 'This reviewed subscription field is unavailable.',
      });
      return;
    }
    for (const [key, nested] of Object.entries(record)) walk(nested, `${path}/${key}`);
  };
  walk(value, '/data');
  return warnings;
}

function safeModelSlugs(plan: PlanOffer): string[] {
  return [...new Set((plan.supportedModelIds ?? []).filter((modelId) => SAFE_MODEL_SLUG.test(modelId)))];
}

function routeStatus(availability: 'available' | 'limited' | 'deprecated' | undefined): RouteFact['status'] {
  return availability ?? 'unavailable';
}

function documentedPositiveInteger(
  value: number | undefined,
  reason: string,
  source: string,
): EvidenceValue<number> {
  return value !== undefined && Number.isSafeInteger(value) && value > 0
    ? available(value, source)
    : unknown(reason, source);
}

function projectRoute(offer: CatalogResponse['modelOffers'][number], catalogSourceRef: string): RouteFact {
  return {
    // Explicit strict-v1 catalog convention: a safe direct model slug is bound
    // to this exact route ID. This mirrors the accepted v1 evidence contract.
    routeId: `${offer.modelId}-direct`,
    providerId: offer.providerId,
    status: routeStatus(offer.availability),
    inputMicroDollarsPerMillion: available(offer.inputMicroDollarsPerMillion, catalogSourceRef),
    outputMicroDollarsPerMillion: available(offer.outputMicroDollarsPerMillion, catalogSourceRef),
    cacheReadMicroDollarsPerMillion: offer.cachedInputMicroDollarsPerMillion === undefined
      ? unknown('No reviewed cache-read rate is available for this route.', catalogSourceRef)
      : available(offer.cachedInputMicroDollarsPerMillion, catalogSourceRef),
    cacheWriteMicroDollarsPerMillion: unknown('No reviewed cache-write rate is available for this route.', catalogSourceRef),
    contextWindowTokens: documentedPositiveInteger(
      offer.contextWindowTokens,
      'No reviewed context-window value is available for this route.',
      catalogSourceRef,
    ),
    maxOutputTokens: documentedPositiveInteger(
      offer.maxOutputTokens,
      'No reviewed maximum-output value is available for this route.',
      catalogSourceRef,
    ),
    // Catalog offers do not carry modality or runtime observations.
    inputModalities: [],
    outputModalities: [],
    ttftP50Ms: unknown('No reviewed runtime latency observation is available for this route.', catalogSourceRef),
    tpsP50: unknown('No reviewed runtime throughput observation is available for this route.', catalogSourceRef),
    uptimeBasisPoints: unknown('No reviewed runtime availability observation is available for this route.', catalogSourceRef),
    runtimeObservation: unknown('No reviewed runtime observation window is available for this route.', catalogSourceRef),
    pricingTiers: [],
  };
}

function comparableDimension(plan: PlanOffer): EntitlementDimension | null {
  const dimensions = plan.entitlementEvidence.dimensions;
  if (dimensions.length !== 1) return null;
  const dimension = dimensions[0]!;
  if (
    dimension.min === undefined && dimension.max === undefined
    || dimension.metric === 'credits'
    || !Number.isSafeInteger(dimension.min ?? 0)
    || !Number.isSafeInteger(dimension.max ?? 0)
  ) return null;
  return dimension;
}

function strictCapacityUnit(dimension: EntitlementDimension): EntitlementProjectionFact['projectedCapacity'] extends infer Value
  ? Value extends { unit: infer Unit } | null ? Unit : never
  : never {
  switch (dimension.metric) {
    case 'messages': return 'messages';
    case 'model_calls': return 'model_calls';
    case 'tasks': return 'tasks';
    case 'feature_uses': return 'feature_uses';
    case 'credits': throw new Error('Credits need a verified micro-dollar conversion before projection.');
  }
}

function dynamicEntitlement(
  plan: PlanOffer,
  catalogSourceRef: string,
  workloadShape: SubscriptionWorkloadShape,
): EntitlementProjectionFact {
  const staleReason = plan.entitlementEvidence.status === 'stale'
    ? plan.entitlementEvidence.staleReason ?? 'The reviewed entitlement record is stale.'
    : null;
  return {
    projectionId: `${plan.id}:entitlement`,
    planId: plan.id,
    evidenceState: 'dynamic_unknown',
    formula: null,
    assumptions: [],
    caveats: [staleReason ?? 'No single fixed, comparable capacity is published for this plan.'],
    confidence: null,
    boundType: 'unknown',
    projectedCapacity: null,
    workloadShape,
    sensitivity: { minimum: null, maximum: null, unit: 'messages' },
    methodologyVersion: PROJECTION_METHODOLOGY,
    effectiveAt: null,
    sourceRefs: [catalogSourceRef],
  };
}

function projectEntitlement(
  plan: PlanOffer,
  catalogSourceRef: string,
  observedAt: string,
  workloadShape: SubscriptionWorkloadShape,
): EntitlementProjectionFact {
  const evidence = plan.entitlementEvidence;
  const dimension = comparableDimension(plan);
  if (evidence.status === 'dynamic_unknown' || evidence.status === 'stale' || dimension === null) {
    return dynamicEntitlement(plan, catalogSourceRef, workloadShape);
  }
  const projectedCapacity = {
    minimum: dimension.min ?? null,
    maximum: dimension.max ?? null,
    unit: strictCapacityUnit(dimension),
    window: dimension.window,
  } as const;
  if (evidence.status === 'verified') {
    return {
      projectionId: `${plan.id}:entitlement`,
      planId: plan.id,
      evidenceState: 'provider_stated',
      formula: null,
      assumptions: [],
      caveats: [],
      confidence: null,
      boundType: evidence.boundType,
      projectedCapacity,
      workloadShape,
      sensitivity: { minimum: projectedCapacity.minimum, maximum: projectedCapacity.maximum, unit: projectedCapacity.unit },
      methodologyVersion: PROJECTION_METHODOLOGY,
      effectiveAt: observedAt,
      sourceRefs: [catalogSourceRef],
    };
  }
  const projection = evidence.projection;
  if (projection === undefined || evidence.boundType === 'unknown') return dynamicEntitlement(plan, catalogSourceRef, workloadShape);
  return {
    projectionId: `${plan.id}:entitlement`,
    planId: plan.id,
    evidenceState: 'projected',
    formula: projection.formula,
    assumptions: projection.assumptions,
    caveats: projection.caveats,
    confidence: evidence.source.confidence,
    boundType: evidence.boundType,
    projectedCapacity,
    workloadShape,
    sensitivity: { minimum: projectedCapacity.minimum, maximum: projectedCapacity.maximum, unit: projectedCapacity.unit },
    methodologyVersion: PROJECTION_METHODOLOGY,
    effectiveAt: observedAt,
    sourceRefs: [catalogSourceRef],
  };
}

function buildCatalogProjection(input: {
  readonly catalog: CatalogResponse;
  readonly workloadShape: SubscriptionWorkloadShape;
  readonly includeCalculationBindingWarning: boolean;
}): {
  readonly data: SubscriptionData;
  readonly sources: readonly SourceAttribution[];
  readonly warnings: readonly DataWarning[];
} | null {
  const { catalog, workloadShape, includeCalculationBindingWarning } = input;
  const sourceById = new Map(catalog.provenance.filter(reviewedSource).map((source) => [source.id, source]));
  const plans = catalog.plans.filter((plan) => PROVIDER_SCOPE.has(plan.providerId) && sourceById.has(plan.sourceId));
  const directOffers = catalog.modelOffers.filter((offer) => (
    PROVIDER_SCOPE.has(offer.providerId)
    && offer.pricingBasis === 'direct_provider_api'
    && offer.route === 'direct_provider'
    && SAFE_MODEL_SLUG.test(offer.modelId)
    && sourceById.has(offer.sourceId)
  ));
  const routeSlugCounts = new Map<string, number>();
  for (const offer of directOffers) {
    routeSlugCounts.set(offer.modelId, (routeSlugCounts.get(offer.modelId) ?? 0) + 1);
  }
  // `${modelSlug}-direct` is the established public binding convention. If
  // two catalog rows would claim it, omit both rather than choose one.
  const routes = directOffers.filter((offer) => routeSlugCounts.get(offer.modelId) === 1);
  const usedSourceIds = new Set([...plans, ...routes].map((offer) => offer.sourceId));
  if (usedSourceIds.size === 0) return null;
  const sources = [...usedSourceIds]
    .map((sourceId) => sourceById.get(sourceId))
    .filter((source): source is SourceProvenance => source !== undefined)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((source) => sourceAttribution(catalog, source));
  const sourceRefs = new Map(sources.map((source) => [source.sourceId, source.sourceRef]));
  const sourceObservedAt = new Map(sources.map((source) => [source.sourceId, source.observedAt]));

  const projectedPlans = plans.map((plan) => {
    const catalogSourceRef = sourceRefs.get(plan.sourceId);
    const observedAt = sourceObservedAt.get(plan.sourceId);
    if (catalogSourceRef === undefined || observedAt === undefined) throw new Error('Missing plan source attribution.');
    return {
      planId: plan.id,
      providerId: plan.providerId,
      displayName: plan.displayName,
      monthlyCostMicroDollars: plan.monthlyCostMicroDollars,
      supportedModelSlugs: safeModelSlugs(plan),
      sourceRefs: [catalogSourceRef],
      entitlement: projectEntitlement(plan, catalogSourceRef, observedAt, workloadShape),
    };
  });
  const projectedRoutes = routes.map((offer) => {
    const catalogSourceRef = sourceRefs.get(offer.sourceId);
    if (catalogSourceRef === undefined) throw new Error('Missing route source attribution.');
    return projectRoute(offer, catalogSourceRef);
  });

  const data: SubscriptionData = {
    operation: 'catalog',
    plans: projectedPlans.map(({ entitlement: _entitlement, ...plan }) => plan),
    routes: projectedRoutes,
    entitlementProjections: projectedPlans.map((plan) => plan.entitlement),
    calculation: null,
  };
  const warnings: DataWarning[] = [
    ...subscriptionUnavailableWarnings(data),
    ...(includeCalculationBindingWarning ? [{
      code: 'subscription_calculation_binding_unavailable',
      fieldGroup: '/data/calculation',
      state: 'unknown' as const,
      message: 'Some catalog plans do not publish a strict model-to-route binding required for calculation.',
    }] : []),
  ];
  return { data, sources, warnings };
}

async function catalogResponse(request: SubscriptionRequest, env: Env | undefined, fetchedAt: string): Promise<Response> {
  const db = env?.CATALOG_DB;
  if (!db) return unavailable(request, fetchedAt, 'No reviewed subscription catalog is available.');
  try {
    const catalog = await readPublishedCatalog(db);
    if (catalog === null) return unavailable(request, fetchedAt, 'No reviewed subscription catalog is available.');
    const projection = buildCatalogProjection({
      catalog,
      workloadShape: CATALOG_WORKLOAD_SHAPE,
      includeCalculationBindingWarning: true,
    });
    if (projection === null) return unavailable(request, fetchedAt, 'No reviewed subscription catalog records are available for this surface.');
    validateSubscriptionData(request, projection.data, projection.sources);
    const envelope = buildUiDataContractV1Envelope({
      method: 'subscription',
      request,
      status: 'partial',
      reason: null,
      fetchedAt,
      data: projection.data,
      revisions: {
        projection: `${PROJECTION_METHODOLOGY}:${catalog.revision}`,
        catalog: catalog.revision,
        benchmark: null,
        runtimeObservationSet: null,
        projectionMethodology: PROJECTION_METHODOLOGY,
      },
      freshness: {
        catalogObservedAt: catalog.freshness.checkedAt,
        runtimeObservedAt: null,
        benchmarkReleasedAt: null,
        benchmarkCheckedAt: null,
      },
      sources: projection.sources,
      warnings: projection.warnings,
    });
    return jsonUiDataResponse(envelope, 200, `"${PROJECTION_METHODOLOGY}:${catalog.revision}"`);
  } catch {
    return jsonUiDataResponse({
      error: {
        code: 'subscription_catalog_projection_failed',
        message: 'Published subscription catalog data could not be projected.',
      },
    }, 503);
  }
}

function workloadShape(request: SubscriptionCalculationRequest): SubscriptionWorkloadShape {
  return {
    ...request.workload,
    cacheReadShareBasisPoints: request.cacheReadShareBasisPoints,
    cacheWriteShareBasisPoints: request.cacheWriteShareBasisPoints,
  };
}

function calculationBindingFailure(
  request: SubscriptionCalculationRequest,
  data: SubscriptionData,
): string | null {
  const plan = data.plans.find((candidate) => candidate.planId === request.planId);
  if (plan === undefined) return 'The selected plan is not a reviewed catalog plan.';
  for (const mix of request.modelMix) {
    if (!plan.supportedModelSlugs.includes(mix.modelSlug)) return 'The selected model is not reviewed as supported by this plan.';
    if (mix.routeId !== `${mix.modelSlug}-direct`) return 'The selected route does not match the published direct-route binding convention.';
    const route = data.routes.find((candidate) => (
      candidate.routeId === mix.routeId
      && candidate.providerId === plan.providerId
      && candidate.status !== 'unavailable'
    ));
    if (route === undefined) return 'No exact reviewed direct route is available for the selected model and plan.';
    if (request.cacheReadShareBasisPoints > 0 && route.cacheReadMicroDollarsPerMillion.availability !== 'available') {
      return 'The requested positive cache-read allocation requires a reviewed cache-read rate.';
    }
    if (request.cacheWriteShareBasisPoints > 0 && route.cacheWriteMicroDollarsPerMillion.availability !== 'available') {
      return 'The requested positive cache-write allocation requires a reviewed cache-write rate.';
    }
  }
  return null;
}

async function calculationResponse(
  request: SubscriptionCalculationRequest,
  env: Env | undefined,
  fetchedAt: string,
): Promise<Response> {
  const db = env?.CATALOG_DB;
  if (!db) return unavailable(request, fetchedAt, 'No reviewed subscription catalog is available.');
  try {
    const catalog = await readPublishedCatalog(db);
    if (catalog === null) return unavailable(request, fetchedAt, 'No reviewed subscription catalog is available.');
    const projection = buildCatalogProjection({
      catalog,
      workloadShape: workloadShape(request),
      includeCalculationBindingWarning: false,
    });
    if (projection === null) {
      return unavailable(request, fetchedAt, 'No reviewed subscription catalog records are available for this calculation.');
    }
    const bindingFailure = calculationBindingFailure(request, projection.data);
    if (bindingFailure !== null) {
      return unavailable(request, fetchedAt, bindingFailure);
    }
    const selectedEntitlement = projection.data.entitlementProjections.find((entry) => entry.planId === request.planId);
    if (selectedEntitlement === undefined) {
      return unavailable(request, fetchedAt, 'No reviewed entitlement projection is available for this calculation.');
    }
    const calculation = buildSubscriptionCalculation(request, {
      plans: projection.data.plans,
      routes: projection.data.routes,
      entitlementProjections: projection.data.entitlementProjections,
      methodologyVersion: selectedEntitlement.methodologyVersion,
    });
    const data: SubscriptionData = { ...projection.data, operation: 'calculate', calculation };
    const warnings = subscriptionUnavailableWarnings(data);
    validateSubscriptionData(request, data, projection.sources);
    const envelope = buildUiDataContractV1Envelope({
      method: 'subscription',
      request,
      status: 'partial',
      reason: null,
      fetchedAt,
      data,
      revisions: {
        projection: `${PROJECTION_METHODOLOGY}:${catalog.revision}`,
        catalog: catalog.revision,
        benchmark: null,
        runtimeObservationSet: null,
        projectionMethodology: PROJECTION_METHODOLOGY,
      },
      freshness: {
        catalogObservedAt: catalog.freshness.checkedAt,
        runtimeObservedAt: null,
        benchmarkReleasedAt: null,
        benchmarkCheckedAt: null,
      },
      sources: projection.sources,
      warnings,
    });
    return jsonUiDataResponse(envelope, 200);
  } catch {
    return jsonUiDataResponse({
      error: {
        code: 'subscription_calculation_projection_failed',
        message: 'Published subscription calculation data could not be projected.',
      },
    }, 503);
  }
}

export async function onRequestGet({ request, env }: { request: Request; env?: Env }): Promise<Response> {
  const fetchedAt = new Date().toISOString();
  try {
    const url = new URL(request.url);
    if ([...url.searchParams.keys()].some((key) => key !== 'operation')
      || url.searchParams.getAll('operation').length > 1) throw new Error('invalid subscription query');
    const normalized = normalizeSubscriptionRequest({ operation: url.searchParams.get('operation') ?? 'catalog' });
    return catalogResponse(normalized, env, fetchedAt);
  } catch {
    return invalidRequest();
  }
}

export async function onRequestPost({ request, env }: { request: Request; env?: Env }): Promise<Response> {
  const fetchedAt = new Date().toISOString();
  try {
    const normalized = parseSubscriptionBody(new Uint8Array(await request.arrayBuffer()));
    return calculationResponse(normalized, env, fetchedAt);
  } catch {
    return invalidRequest();
  }
}
