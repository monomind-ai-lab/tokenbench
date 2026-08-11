import type { CatalogResponse, EntitlementEvidence, ModelOffer, PlanEntitlement } from './contracts';

function fail(message: string): never {
  throw new Error(message);
}

function requireString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) fail(`${name} must be a non-empty string`);
}

function requireFiniteIsoTimestamp(value: unknown, name: string): asserts value is string {
  requireString(value, name);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) {
    fail(`${name} must be a finite ISO timestamp`);
  }
}

function requireNonNegativeInteger(value: unknown, name: string): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < 0) fail(`${name} must be a non-negative integer`);
}

function validateOptionalString(value: unknown, name: string): void {
  if (value !== undefined) requireString(value, name);
}

function validateOptionalStringArray(value: unknown, name: string): void {
  if (value !== undefined && (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item))) fail(`${name} must be an array of non-empty strings`);
}

function requireUrl(value: unknown, name: string): void {
  requireString(value, name);
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') fail(`${name} must be an https URL`);
  } catch {
    fail(`${name} must be an https URL`);
  }
}

function validateEntitlement(value: unknown, name: string): asserts value is PlanEntitlement {
  if (!value || typeof value !== 'object' || !('kind' in value)) fail(`${name} must be a valid entitlement`);
  const entitlement = value as PlanEntitlement;
  if (!['fixed_tokens', 'rolling_limit', 'credits', 'guardrail_limited', 'unknown'].includes(entitlement.kind)) {
    fail(`${name} must be a valid entitlement`);
  }
  if (entitlement.kind === 'fixed_tokens') requireNonNegativeInteger(entitlement.monthlyTokens, `${name}.monthlyTokens`);
  if (entitlement.kind !== 'fixed_tokens') requireString(entitlement.description, `${name}.description`);
  if (entitlement.kind === 'credits' && entitlement.creditsMicroDollars !== undefined) {
    requireNonNegativeInteger(entitlement.creditsMicroDollars, `${name}.creditsMicroDollars`);
  }
}

const ENTITLEMENT_METRICS = ['messages', 'model_calls', 'credits', 'tasks', 'feature_uses'];
const ENTITLEMENT_WINDOWS = ['rolling_5h', 'weekly', 'monthly', 'billing_cycle'];

/**
 * Entitlement evidence must stay separable from copy: a projected bound always
 * carries its formula, assumptions, and caveats so nothing can present a
 * hypothesis as a guarantee, and a stale row always explains why it is blocked.
 */
function validateEntitlementEvidence(value: unknown, name: string): asserts value is EntitlementEvidence {
  if (!value || typeof value !== 'object') fail(`${name} must be an object`);
  const evidence = value as EntitlementEvidence;
  if (!['verified', 'projected', 'dynamic_unknown', 'stale'].includes(evidence.status)) fail(`${name}.status is invalid`);
  if (!['hard_max', 'practical_upper', 'outer_ceiling', 'unknown'].includes(evidence.boundType)) fail(`${name}.boundType is invalid`);
  if (!Array.isArray(evidence.dimensions)) fail(`${name}.dimensions must be an array`);
  evidence.dimensions.forEach((dimension, index) => {
    const dimensionName = `${name}.dimensions[${index}]`;
    if (!dimension || typeof dimension !== 'object') fail(`${dimensionName} must be an object`);
    if (!ENTITLEMENT_METRICS.includes(dimension.metric)) fail(`${dimensionName}.metric is invalid`);
    if (!ENTITLEMENT_WINDOWS.includes(dimension.window)) fail(`${dimensionName}.window is invalid`);
    requireString(dimension.unit, `${dimensionName}.unit`);
    for (const bound of ['min', 'max'] as const) {
      if (dimension[bound] === undefined) continue;
      if (typeof dimension[bound] !== 'number' || !Number.isFinite(dimension[bound]) || (dimension[bound] as number) < 0) {
        fail(`${dimensionName}.${bound} must be a non-negative finite number`);
      }
    }
    if (dimension.min !== undefined && dimension.max !== undefined && dimension.min > dimension.max) {
      fail(`${dimensionName}.min must not exceed ${dimensionName}.max`);
    }
  });

  // A projected bound is a scenario, so it may never ship without its derivation.
  if (evidence.status === 'projected' && evidence.projection === undefined) {
    fail(`${name}.projection is required when status is projected`);
  }
  if (evidence.projection !== undefined) {
    requireString(evidence.projection.formula, `${name}.projection.formula`);
    for (const key of ['assumptions', 'caveats'] as const) {
      if (!Array.isArray(evidence.projection[key]) || evidence.projection[key].length === 0) {
        fail(`${name}.projection.${key} must be a non-empty array`);
      }
      evidence.projection[key].forEach((entry, index) => requireString(entry, `${name}.projection.${key}[${index}]`));
    }
  }
  // Dynamic-unknown rows must not manufacture a number.
  if (evidence.status === 'dynamic_unknown' && evidence.dimensions.some((dimension) => dimension.min !== undefined || dimension.max !== undefined)) {
    fail(`${name} must not publish a numeric bound when status is dynamic_unknown`);
  }
  if (evidence.status === 'stale') requireString(evidence.staleReason, `${name}.staleReason`);

  if (!evidence.source || typeof evidence.source !== 'object') fail(`${name}.source must be an object`);
  requireUrl(evidence.source.url, `${name}.source.url`);
  requireString(evidence.source.accessedAt, `${name}.source.accessedAt`);
  if (!['high', 'medium', 'low'].includes(evidence.source.confidence)) fail(`${name}.source.confidence is invalid`);
}

function validateModelOffer(value: unknown, index: number, sourceIds: Set<string>): asserts value is ModelOffer {
  const name = `modelOffers[${index}]`;
  if (!value || typeof value !== 'object') fail(`${name} must be an object`);
  const offer = value as ModelOffer;
  for (const key of ['id', 'providerId', 'displayName', 'modelId', 'sourceId'] as const) requireString(offer[key], `${name}.${key}`);
  if (!['direct_provider_api', 'openrouter', 'opencode_zen'].includes(offer.pricingBasis)) fail(`${name}.pricingBasis is invalid`);
  if (!['direct_provider', 'openrouter', 'opencode_zen'].includes(offer.route)) fail(`${name}.route is invalid`);
  if (offer.currency !== 'USD') fail(`${name}.currency must be USD`);
  if (offer.unit !== 'micro_dollars_per_million_tokens') fail(`${name}.unit is invalid`);
  if ((offer.pricingBasis === 'direct_provider_api' && offer.route !== 'direct_provider')
    || (offer.pricingBasis === 'openrouter' && offer.route !== 'openrouter')
    || (offer.pricingBasis === 'opencode_zen' && offer.route !== 'opencode_zen')) {
    fail(`${name}.pricingBasis and route must match`);
  }
  requireNonNegativeInteger(offer.inputMicroDollarsPerMillion, `${name}.inputMicroDollarsPerMillion`);
  requireNonNegativeInteger(offer.outputMicroDollarsPerMillion, `${name}.outputMicroDollarsPerMillion`);
  if (offer.cachedInputMicroDollarsPerMillion !== undefined) {
    requireNonNegativeInteger(offer.cachedInputMicroDollarsPerMillion, `${name}.cachedInputMicroDollarsPerMillion`);
  }
  if (offer.contextWindowTokens !== undefined) requireNonNegativeInteger(offer.contextWindowTokens, `${name}.contextWindowTokens`);
  if (offer.maxOutputTokens !== undefined) requireNonNegativeInteger(offer.maxOutputTokens, `${name}.maxOutputTokens`);
  if (offer.availability !== undefined && !['available', 'limited', 'deprecated'].includes(offer.availability)) fail(`${name}.availability is invalid`);
  if (!sourceIds.has(offer.sourceId)) fail(`${name}.sourceId must refer to provenance`);
}

export function validateCatalogResponse(value: unknown): CatalogResponse {
  if (!value || typeof value !== 'object') fail('catalog must be an object');
  const catalog = value as CatalogResponse;
  requireString(catalog.revision, 'revision');
  requireFiniteIsoTimestamp(catalog.publishedAt, 'publishedAt');
  if (!catalog.freshness || typeof catalog.freshness !== 'object') fail('freshness must be an object');
  if (!['fresh', 'stale', 'bootstrap'].includes(catalog.freshness.status)) fail('freshness.status is invalid');
  requireFiniteIsoTimestamp(catalog.freshness.checkedAt, 'freshness.checkedAt');
  if (!Array.isArray(catalog.provenance) || !Array.isArray(catalog.plans) || !Array.isArray(catalog.modelOffers)) {
    fail('catalog records must be arrays');
  }

  const sourceProviders = new Map<string, string>();
  catalog.provenance.forEach((source, index) => {
    const name = `provenance[${index}]`;
    for (const key of ['id', 'providerId'] as const) requireString(source[key], `${name}.${key}`);
    requireFiniteIsoTimestamp(source.observedAt, `${name}.observedAt`);
    requireUrl(source.sourceUrl, `${name}.sourceUrl`);
    if (!['official_json', 'official_html', 'manual_manifest'].includes(source.sourceKind)) fail(`${name}.sourceKind is invalid`);
    if (!['official', 'manual_verified'].includes(source.confidence)) fail(`${name}.confidence is invalid`);
    for (const key of ['contentHash', 'parserVersion', 'evidenceLocator'] as const) validateOptionalString(source[key], `${name}.${key}`);
    if (source.reviewStatus !== undefined && !['verified', 'needs_review', 'rejected'].includes(source.reviewStatus)) fail(`${name}.reviewStatus is invalid`);
    if (sourceProviders.has(source.id)) fail(`Duplicate provenance id: ${source.id}`);
    sourceProviders.set(source.id, source.providerId);
  });

  const planIds = new Set<string>();
  catalog.plans.forEach((plan, index) => {
    const name = `plans[${index}]`;
    for (const key of ['id', 'providerId', 'displayName', 'sourceId'] as const) requireString(plan[key], `${name}.${key}`);
    if (planIds.has(plan.id)) fail(`Duplicate plan id: ${plan.id}`);
    planIds.add(plan.id);
    requireNonNegativeInteger(plan.monthlyCostMicroDollars, `${name}.monthlyCostMicroDollars`);
    if (plan.billingCycle !== undefined && !['monthly', 'annual', 'other'].includes(plan.billingCycle)) fail(`${name}.billingCycle is invalid`);
    validateOptionalStringArray(plan.supportedModelIds, `${name}.supportedModelIds`);
    if (plan.currency !== 'USD' || plan.pricingBasis !== 'subscription' || plan.route !== 'subscription') fail(`${name} has invalid pricing metadata`);
    validateEntitlement(plan.entitlement, `${name}.entitlement`);
    validateEntitlementEvidence(plan.entitlementEvidence, `${name}.entitlementEvidence`);
    const sourceProvider = sourceProviders.get(plan.sourceId);
    if (!sourceProvider) fail(`${name}.sourceId must refer to provenance`);
    if (sourceProvider !== plan.providerId) fail(`${name}.sourceId must belong to provider ${plan.providerId}`);
  });

  const modelIds = new Set<string>();
  catalog.modelOffers.forEach((model, index) => {
    if (modelIds.has(model.id)) fail(`Duplicate model offer id: ${model.id}`);
    modelIds.add(model.id);
    validateModelOffer(model, index, new Set(sourceProviders.keys()));
    const sourceProvider = sourceProviders.get(model.sourceId);
    const expectedSourceProvider = model.route === 'direct_provider' ? model.providerId : model.route === 'openrouter' ? 'openrouter' : 'opencode';
    if (sourceProvider !== expectedSourceProvider) fail(`modelOffers[${index}].sourceId must belong to provider ${expectedSourceProvider}`);
  });
  return catalog;
}
