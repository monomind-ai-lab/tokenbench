import type { CatalogResponse, ModelOffer, PlanEntitlement } from './contracts';

function fail(message: string): never {
  throw new Error(message);
}

function requireString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) fail(`${name} must be a non-empty string`);
}

function requireNonNegativeInteger(value: unknown, name: string): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < 0) fail(`${name} must be a non-negative integer`);
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

function validateModelOffer(value: unknown, index: number, sourceIds: Set<string>): asserts value is ModelOffer {
  const name = `modelOffers[${index}]`;
  if (!value || typeof value !== 'object') fail(`${name} must be an object`);
  const offer = value as ModelOffer;
  for (const key of ['id', 'providerId', 'displayName', 'modelId', 'sourceId'] as const) requireString(offer[key], `${name}.${key}`);
  if (!['direct_provider_api', 'openrouter', 'opencode_zen'].includes(offer.pricingBasis)) fail(`${name}.pricingBasis is invalid`);
  if (!['direct_provider', 'openrouter', 'opencode_zen'].includes(offer.route)) fail(`${name}.route is invalid`);
  if (offer.currency !== 'USD') fail(`${name}.currency must be USD`);
  if (offer.unit !== 'micro_dollars_per_million_tokens') fail(`${name}.unit is invalid`);
  requireNonNegativeInteger(offer.inputMicroDollarsPerMillion, `${name}.inputMicroDollarsPerMillion`);
  requireNonNegativeInteger(offer.outputMicroDollarsPerMillion, `${name}.outputMicroDollarsPerMillion`);
  if (offer.cachedInputMicroDollarsPerMillion !== undefined) {
    requireNonNegativeInteger(offer.cachedInputMicroDollarsPerMillion, `${name}.cachedInputMicroDollarsPerMillion`);
  }
  if (!sourceIds.has(offer.sourceId)) fail(`${name}.sourceId must refer to provenance`);
}

export function validateCatalogResponse(value: unknown): CatalogResponse {
  if (!value || typeof value !== 'object') fail('catalog must be an object');
  const catalog = value as CatalogResponse;
  requireString(catalog.revision, 'revision');
  requireString(catalog.publishedAt, 'publishedAt');
  if (!catalog.freshness || typeof catalog.freshness !== 'object') fail('freshness must be an object');
  if (!['fresh', 'stale', 'bootstrap'].includes(catalog.freshness.status)) fail('freshness.status is invalid');
  requireString(catalog.freshness.checkedAt, 'freshness.checkedAt');
  if (!Array.isArray(catalog.provenance) || !Array.isArray(catalog.plans) || !Array.isArray(catalog.modelOffers)) {
    fail('catalog records must be arrays');
  }

  const sourceIds = new Set<string>();
  catalog.provenance.forEach((source, index) => {
    const name = `provenance[${index}]`;
    for (const key of ['id', 'providerId', 'observedAt'] as const) requireString(source[key], `${name}.${key}`);
    requireUrl(source.sourceUrl, `${name}.sourceUrl`);
    if (sourceIds.has(source.id)) fail(`Duplicate provenance id: ${source.id}`);
    sourceIds.add(source.id);
  });

  const planIds = new Set<string>();
  catalog.plans.forEach((plan, index) => {
    const name = `plans[${index}]`;
    for (const key of ['id', 'providerId', 'displayName', 'sourceId'] as const) requireString(plan[key], `${name}.${key}`);
    if (planIds.has(plan.id)) fail(`Duplicate plan id: ${plan.id}`);
    planIds.add(plan.id);
    requireNonNegativeInteger(plan.monthlyCostMicroDollars, `${name}.monthlyCostMicroDollars`);
    if (plan.currency !== 'USD' || plan.pricingBasis !== 'subscription' || plan.route !== 'subscription') fail(`${name} has invalid pricing metadata`);
    validateEntitlement(plan.entitlement, `${name}.entitlement`);
    if (!sourceIds.has(plan.sourceId)) fail(`${name}.sourceId must refer to provenance`);
  });

  const modelIds = new Set<string>();
  catalog.modelOffers.forEach((model, index) => {
    if (modelIds.has(model.id)) fail(`Duplicate model offer id: ${model.id}`);
    modelIds.add(model.id);
    validateModelOffer(model, index, sourceIds);
  });
  return catalog;
}
