import type {
  AcceptedSourceAttribution,
  AcceptedUiDataContractV1,
} from "@tokenbench/frontend/preview-data/contract-v1";

import {
  SUBSCRIPTION_PROVIDERS,
  normalizeMix,
  type SubscriptionProvider,
  type SubscriptionScenario,
} from "@/lib/subscription-simulator";

/** A subscription envelope validated by the import-safe strict v1 schema. */
export type StrictSubscriptionEnvelope = AcceptedUiDataContractV1<"subscription">;

type JsonRecord = Record<string, unknown>;

function sameJsonValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => sameJsonValue(value, right[index]));
  }
  const leftRecord = record(left);
  const rightRecord = record(right);
  if (leftRecord === null || rightRecord === null) return false;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && sameJsonValue(leftRecord[key], rightRecord[key]));
}

/** Retained evidence and HTTP responses must echo the exact requested operation. */
export function subscriptionRequestMatches(
  envelope: StrictSubscriptionEnvelope,
  query: { readonly operation: "catalog" } | StrictSubscriptionCalculationQuery,
): boolean {
  return sameJsonValue(envelope.request, query);
}

type StrictEntitlement = Readonly<{
  planId: string;
  evidenceState: "provider_stated" | "projected" | "dynamic_unknown";
  boundType: "hard_max" | "practical_upper" | "outer_ceiling" | "unknown";
  projectedCapacity: Readonly<{
    minimum: number | null;
    maximum: number | null;
    unit: string;
    window: string;
  }> | null;
  assumptions: readonly string[];
  caveats: readonly string[];
}>;

type StrictPlan = Readonly<{
  planId: string;
  providerId: string;
  displayName: string;
  monthlyCostMicroDollars: number;
  annualCostMicroDollars: number | null;
  annualEffectiveMonthlyCostMicroDollars: number | null;
  entitlement: StrictEntitlementReceipt | null;
  supportedModelSlugs: readonly string[];
  sourceRefs: readonly string[];
}>;

type StrictEntitlementReceipt = Readonly<{
  evidenceStatus: "verified" | "projected" | "dynamic_unknown" | "stale";
  boundType: "hard_max" | "practical_upper" | "outer_ceiling" | "unknown";
  usageNote: string | null;
  dimensions: readonly SubscriptionEntitlementDimensionView[];
  staleReason: string | null;
  lastVerifiedAt: string;
  sourceRefs: readonly string[];
}>;

type StrictRoute = Readonly<{
  routeId: string;
  providerId: string;
  status: "available" | "limited" | "deprecated" | "unavailable";
  contextWindowTokens: number | null;
}>;

type StrictRouteBinding = Readonly<{
  routeId: string;
  modelSlug: string;
  providerId: string;
}>;

type StrictCalculation = Readonly<{
  selectedPlanId: string;
  monthlyApiCostMicroDollars: number;
  monthlySubscriptionCostMicroDollars: number;
  differenceMicroDollars: number;
  cheaper: "subscription" | "api" | "equal";
  crossoverTokens: number | null;
  crossoverTokenVolume: number;
  crossoverApiCostMicroDollars: number;
  derivedWorkload: Readonly<{
    monthlyMessages: number;
    monthlyInputTokens: number;
    monthlyOutputTokens: number;
  }>;
  crossoverDomain: readonly Readonly<{
    tokenVolume: number;
    apiCostMicroDollars: number;
    subscriptionCostMicroDollars: number;
  }>[];
  lineItems: readonly Readonly<{
    modelSlug: string;
    kind: "standard_input" | "cache_read" | "cache_write" | "output";
    tokens: number;
    rateMicroDollarsPerMillion: number;
    costMicroDollars: number;
  }>[];
}>;

type StrictCostKind = StrictCalculation["lineItems"][number]["kind"];

type StrictSubscriptionData = Readonly<{
  plans: readonly StrictPlan[];
  routes: readonly StrictRoute[];
  routeBindings: readonly StrictRouteBinding[];
  entitlementProjections: readonly StrictEntitlement[];
  calculation: StrictCalculation | null;
}>;

export type SubscriptionLimitState = "available" | "variable" | "unavailable";

export type SubscriptionLimitView = Readonly<{
  state: SubscriptionLimitState;
  label: string;
  detail: string | null;
}>;

export type SubscriptionPlanView = Readonly<{
  id: string;
  displayName: string | null;
  monthlyUsd: number | null;
  /** Exact provider-published annual checkout amount; never derived. */
  annualUsd: number | null;
  /** Exact provider-displayed annual effective monthly amount; never derived. */
  annualEffectiveMonthlyUsd: number | null;
  entitlement: SubscriptionEntitlementView | null;
  sourceRefs: readonly string[];
  limit: SubscriptionLimitView;
}>;

export type SubscriptionEntitlementDimensionView = Readonly<{
  metric: string;
  minimum: number | null;
  maximum: number | null;
  unit: string;
  window: string;
  resetRule: string | null;
  modelId: string | null;
  feature: string | null;
  sharedPoolId: string | null;
}>;

export type SubscriptionEntitlementView = Readonly<{
  evidenceStatus: "verified" | "projected" | "dynamic_unknown" | "stale";
  boundType: "hard_max" | "practical_upper" | "outer_ceiling" | "unknown";
  usageNote: string | null;
  dimensions: readonly SubscriptionEntitlementDimensionView[];
  staleReason: string | null;
  lastVerifiedAt: string | null;
  sourceRefs: readonly string[];
}>;

export type SubscriptionSourceReceipt = Readonly<{
  sourceRef: string;
  label: string;
  url: string;
  observedAt: string;
  effectiveAt: string | null;
}>;

export type SubscriptionProviderView = Readonly<{
  id: SubscriptionProvider;
  label: string;
  plans: readonly SubscriptionPlanView[];
  unavailableReason: string | null;
}>;

export type SubscriptionModelView = Readonly<{
  id: string;
  planId: string;
  providerId: SubscriptionProvider;
  routeId: string;
  tierContextTokens: number;
}>;

export type SubscriptionCalculationView = Readonly<{
  monthlyApiUsd: number;
  monthlySubscriptionUsd: number;
  differenceUsd: number;
  cheaper: "subscription" | "api" | "equal";
  crossoverTokens: number | null;
  selectedTokenVolume: number;
  selectedVolumeApiUsd: number;
  monthlyMessages: number;
  monthlyInputTokens: number;
  monthlyOutputTokens: number;
  modelShares: Readonly<Record<string, number>>;
  domain: readonly {
    tokens: number;
    apiUsd: number;
    subscriptionUsd: number;
  }[];
  lineItems: readonly {
    id: string;
    modelSlug: string;
    kind: "standard_input" | "cache_read" | "cache_write" | "output";
    tokens: number;
    rateUsdPerMillion: number;
    costUsd: number;
  }[];
}>;

export type SubscriptionSimulatorCatalog = Readonly<{
  sourceMode: "production" | "evidence" | "unconfigured";
  status: "available" | "partial" | "unavailable";
  reason: string | null;
  providers: readonly SubscriptionProviderView[];
  models: readonly SubscriptionModelView[];
  /** Exact direct-route bindings unavailable for one or more selected plan models. */
  modelSelectionReason: string;
  calculation: SubscriptionCalculationView | null;
  calculationReason: string | null;
  /** Full source receipts keyed by plan/entitlement sourceRefs. */
  sources: readonly SubscriptionSourceReceipt[];
}>;

function sourceReceipt(source: AcceptedSourceAttribution): SubscriptionSourceReceipt {
  return {
    sourceRef: source.sourceRef,
    label: source.label,
    url: source.url,
    observedAt: source.observedAt,
    effectiveAt: source.effectiveAt,
  };
}

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonRecord : null;
}

function records(value: unknown): readonly JsonRecord[] | null {
  if (!Array.isArray(value)) return null;
  const values = value.map(record);
  return values.every((item): item is JsonRecord => item !== null) ? values : null;
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullableFinite(value: unknown): number | null | undefined {
  return value === null ? null : finite(value) ?? undefined;
}

function strings(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null;
  const values = value.map(string);
  return values.every((item): item is string => item !== null) ? values : null;
}

function evidenceNumber(value: unknown): number | null {
  const candidate = record(value);
  if (candidate === null) return null;
  if (candidate.availability === "unavailable") return null;
  return candidate.availability === "available" ? finite(candidate.value) : null;
}

function nullableText(value: unknown): string | null | undefined {
  return value === null ? null : string(value) ?? undefined;
}

function entitlementDimension(value: unknown): SubscriptionEntitlementDimensionView | null {
  const candidate = record(value);
  const metric = string(candidate?.metric);
  const minimum = nullableFinite(candidate?.minimum);
  const maximum = nullableFinite(candidate?.maximum);
  const unit = string(candidate?.unit);
  const window = string(candidate?.window);
  const resetRule = nullableText(candidate?.resetRule);
  const modelId = nullableText(candidate?.modelId);
  const feature = nullableText(candidate?.feature);
  const sharedPoolId = nullableText(candidate?.sharedPoolId);
  return metric === null || minimum === undefined || maximum === undefined || unit === null || window === null
    || resetRule === undefined || modelId === undefined || feature === undefined || sharedPoolId === undefined
    ? null
    : { metric, minimum, maximum, unit, window, resetRule, modelId, feature, sharedPoolId };
}

/** Newer strict plan receipts retain verified entitlement facts next to their plan price. */
function planEntitlement(value: unknown): StrictEntitlementReceipt | null {
  const candidate = record(value);
  if (candidate === null) return null;
  const evidenceStatus = candidate.evidenceStatus;
  const boundType = candidate.boundType;
  const usageNote = nullableText(candidate.usageNote);
  const staleReason = nullableText(candidate.staleReason);
  const lastVerifiedAt = string(candidate.lastVerifiedAt);
  const sourceRefs = strings(candidate.sourceRefs);
  const dimensions = records(candidate.dimensions)?.map(entitlementDimension);
  if (
    (evidenceStatus !== "verified" && evidenceStatus !== "projected" && evidenceStatus !== "dynamic_unknown" && evidenceStatus !== "stale")
    || (boundType !== "hard_max" && boundType !== "practical_upper" && boundType !== "outer_ceiling" && boundType !== "unknown")
    || usageNote === undefined || staleReason === undefined || lastVerifiedAt === null || sourceRefs === null || dimensions === undefined
    || !dimensions.every((dimension): dimension is SubscriptionEntitlementDimensionView => dimension !== null)
  ) return null;
  return { evidenceStatus, boundType, usageNote, dimensions, staleReason, lastVerifiedAt, sourceRefs };
}

function plans(value: unknown): readonly StrictPlan[] | null {
  const candidates = records(value);
  if (candidates === null) return null;
  const projected = candidates.map((candidate) => {
    const planId = string(candidate.planId);
    const providerId = string(candidate.providerId);
    const displayName = string(candidate.displayName);
    const monthlyCostMicroDollars = finite(candidate.monthlyCostMicroDollars);
    const annualCostMicroDollars = candidate.annualCostMicroDollars === undefined
      ? null
      : evidenceNumber(candidate.annualCostMicroDollars);
    const annualEffectiveMonthlyCostMicroDollars = candidate.annualEffectiveMonthlyCostMicroDollars === undefined
      ? null
      : evidenceNumber(candidate.annualEffectiveMonthlyCostMicroDollars);
    const entitlement = candidate.entitlement === undefined ? null : planEntitlement(candidate.entitlement);
    const supportedModelSlugs = strings(candidate.supportedModelSlugs);
    const sourceRefs = candidate.sourceRefs === undefined ? [] : strings(candidate.sourceRefs);
    return planId === null || providerId === null || displayName === null || monthlyCostMicroDollars === null || supportedModelSlugs === null || sourceRefs === null
      || (candidate.entitlement !== undefined && entitlement === null)
      ? null
      : {
        planId,
        providerId,
        displayName,
        monthlyCostMicroDollars,
        annualCostMicroDollars,
        annualEffectiveMonthlyCostMicroDollars,
        entitlement,
        supportedModelSlugs,
        sourceRefs,
      };
  });
  return projected.every((item): item is StrictPlan => item !== null) ? projected : null;
}

function route(value: unknown): StrictRoute | null {
  const candidate = record(value);
  const routeId = string(candidate?.routeId);
  const providerId = string(candidate?.providerId);
  const status = candidate?.status;
  const context = record(candidate?.contextWindowTokens);
  const contextWindowTokens = context?.availability === "available" ? finite(context.value) : null;
  if (
    routeId === null || providerId === null
    || (status !== "available" && status !== "limited" && status !== "deprecated" && status !== "unavailable")
    || (contextWindowTokens !== null && (!Number.isSafeInteger(contextWindowTokens) || contextWindowTokens < 1))
  ) return null;
  return { routeId, providerId, status, contextWindowTokens };
}

function routes(value: unknown): readonly StrictRoute[] | null {
  const candidates = Array.isArray(value) ? value : null;
  if (candidates === null) return null;
  const projected = candidates.map(route);
  return projected.every((item): item is StrictRoute => item !== null) ? projected : null;
}

function routeBinding(value: unknown): StrictRouteBinding | null {
  const candidate = record(value);
  const routeId = string(candidate?.routeId);
  const modelSlug = string(candidate?.modelSlug);
  const providerId = string(candidate?.providerId);
  return routeId === null || modelSlug === null || providerId === null
    ? null
    : { routeId, modelSlug, providerId };
}

function routeBindings(value: unknown): readonly StrictRouteBinding[] | null {
  // Strict v1 responses published before the binding field remain readable,
  // but have no factual plan-to-model-to-route selection data. Do not restore
  // the removed slug-derived route-ID convention for those older receipts.
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const projected = value.map(routeBinding);
  return projected.every((item): item is StrictRouteBinding => item !== null)
    ? projected
    : null;
}

function entitlement(value: unknown): StrictEntitlement | null {
  const candidate = record(value);
  if (candidate === null) return null;
  const planId = string(candidate?.planId);
  const evidenceState = candidate?.evidenceState;
  const boundType = candidate?.boundType;
  const assumptions = strings(candidate?.assumptions);
  const caveats = strings(candidate?.caveats);
  if (
    planId === null
    || (evidenceState !== "provider_stated" && evidenceState !== "projected" && evidenceState !== "dynamic_unknown")
    || (boundType !== "hard_max" && boundType !== "practical_upper" && boundType !== "outer_ceiling" && boundType !== "unknown")
    || assumptions === null
    || caveats === null
  ) return null;

  if (candidate.projectedCapacity === null) {
    return { planId, evidenceState, boundType, projectedCapacity: null, assumptions, caveats };
  }
  const capacity = record(candidate.projectedCapacity);
  const minimum = nullableFinite(capacity?.minimum);
  const maximum = nullableFinite(capacity?.maximum);
  const unit = string(capacity?.unit);
  const window = string(capacity?.window);
  if (capacity === null || minimum === undefined || maximum === undefined || unit === null || window === null) return null;
  return {
    planId,
    evidenceState,
    boundType,
    projectedCapacity: { minimum, maximum, unit, window },
    assumptions,
    caveats,
  };
}

function costKind(value: unknown): value is StrictCostKind {
  return value === "standard_input" || value === "cache_read" || value === "cache_write" || value === "output";
}

function entitlements(value: unknown): readonly StrictEntitlement[] | null {
  const candidates = Array.isArray(value) ? value : null;
  if (candidates === null) return null;
  const projected = candidates.map(entitlement);
  return projected.every((item): item is StrictEntitlement => item !== null) ? projected : null;
}

function calculation(value: unknown): StrictCalculation | null {
  if (value === null) return null;
  const candidate = record(value);
  const selectedPlanId = string(candidate?.selectedPlanId);
  const monthlyApiCostMicroDollars = finite(candidate?.monthlyApiCostMicroDollars);
  const monthlySubscriptionCostMicroDollars = finite(candidate?.monthlySubscriptionCostMicroDollars);
  const differenceMicroDollars = finite(candidate?.differenceMicroDollars);
  const cheaper = candidate?.cheaper;
  const crossoverTokens = nullableFinite(candidate?.crossoverTokens);
  const crossoverTokenVolume = finite(candidate?.crossoverTokenVolume);
  const crossoverApiCostMicroDollars = finite(candidate?.crossoverApiCostMicroDollars);
  const workload = record(candidate?.derivedWorkload);
  const monthlyMessages = finite(workload?.monthlyMessages);
  const monthlyInputTokens = finite(workload?.monthlyInputTokens);
  const monthlyOutputTokens = finite(workload?.monthlyOutputTokens);
  const domain = records(candidate?.crossoverDomain)?.map((point) => {
    const tokenVolume = finite(point.tokenVolume);
    const apiCostMicroDollars = finite(point.apiCostMicroDollars);
    const subscriptionCostMicroDollars = finite(point.subscriptionCostMicroDollars);
    return tokenVolume === null || apiCostMicroDollars === null || subscriptionCostMicroDollars === null
      ? null
      : { tokenVolume, apiCostMicroDollars, subscriptionCostMicroDollars };
  });
  const lines = records(candidate?.lineItems)?.map((line) => {
    const modelSlug = string(line.modelSlug);
    const kind = line.kind;
    const tokens = finite(line.tokens);
    const rateMicroDollarsPerMillion = finite(line.rateMicroDollarsPerMillion);
    const costMicroDollars = finite(line.costMicroDollars);
    if (
      modelSlug === null || !costKind(kind) || tokens === null
      || rateMicroDollarsPerMillion === null || costMicroDollars === null
    ) return null;
    return { modelSlug, kind, tokens, rateMicroDollarsPerMillion, costMicroDollars };
  });
  if (
    selectedPlanId === null || monthlyApiCostMicroDollars === null || monthlySubscriptionCostMicroDollars === null
    || differenceMicroDollars === null || (cheaper !== "subscription" && cheaper !== "api" && cheaper !== "equal")
    || crossoverTokens === undefined || crossoverTokenVolume === null || crossoverApiCostMicroDollars === null
    || monthlyMessages === null || monthlyInputTokens === null || monthlyOutputTokens === null
    || domain === undefined || lines === undefined
    || !domain.every((point): point is NonNullable<typeof point> => point !== null)
    || !lines.every((line): line is NonNullable<typeof line> => line !== null)
  ) return null;
  return {
    selectedPlanId,
    monthlyApiCostMicroDollars,
    monthlySubscriptionCostMicroDollars,
    differenceMicroDollars,
    cheaper,
    crossoverTokens,
    crossoverTokenVolume,
    crossoverApiCostMicroDollars,
    derivedWorkload: { monthlyMessages, monthlyInputTokens, monthlyOutputTokens },
    crossoverDomain: domain,
    lineItems: lines,
  };
}

function parseSubscriptionData(value: unknown): StrictSubscriptionData | null {
  const data = record(value);
  if (data === null || (data.operation !== "catalog" && data.operation !== "calculate")) return null;
  const projectedPlans = plans(data.plans);
  const projectedRoutes = routes(data.routes);
  const projectedRouteBindings = routeBindings(data.routeBindings);
  const projectedEntitlements = entitlements(data.entitlementProjections);
  const projectedCalculation = calculation(data.calculation);
  if (projectedPlans === null || projectedRoutes === null || projectedRouteBindings === null || projectedEntitlements === null || (data.calculation !== null && projectedCalculation === null)) return null;
  return {
    plans: projectedPlans,
    routes: projectedRoutes,
    routeBindings: projectedRouteBindings,
    entitlementProjections: projectedEntitlements,
    calculation: projectedCalculation,
  };
}

function calculationModelShares(request: JsonRecord): Readonly<Record<string, number>> {
  if (request.operation !== "calculate") return {};
  const modelMix = records(request.modelMix);
  if (modelMix === null) return {};
  return Object.fromEntries(modelMix.flatMap((item) => {
    const slug = string(item.modelSlug);
    const shareBasisPoints = finite(item.shareBasisPoints);
    return slug === null || shareBasisPoints === null ? [] : [[slug, shareBasisPoints / 100] as const];
  }));
}

function unavailableLimit(reason: string): SubscriptionLimitView {
  return { state: "unavailable", label: "Unavailable", detail: reason };
}

function capacityLabel(capacity: NonNullable<StrictEntitlement["projectedCapacity"]>): string | null {
  let amount: string | null = null;
  if (capacity.minimum !== null && capacity.maximum !== null) {
    amount = capacity.minimum === capacity.maximum
      ? capacity.minimum.toLocaleString()
      : `${capacity.minimum.toLocaleString()}–${capacity.maximum.toLocaleString()}`;
  } else if (capacity.maximum !== null) {
    amount = `Up to ${capacity.maximum.toLocaleString()}`;
  } else if (capacity.minimum !== null) {
    amount = `At least ${capacity.minimum.toLocaleString()}`;
  }
  return amount === null ? null : `${amount} ${capacity.unit.replaceAll("_", " ")} / ${capacity.window.replaceAll("_", " ")}`;
}

function projectLimit(entitlementFact: StrictEntitlement | undefined): SubscriptionLimitView {
  if (entitlementFact === undefined) return unavailableLimit("No reviewed entitlement record is available for this plan.");
  if (entitlementFact.evidenceState === "dynamic_unknown" || entitlementFact.boundType === "unknown") {
    return {
      state: "variable",
      label: "Variable — provider-managed",
      detail: entitlementFact.caveats[0] ?? "The provider does not publish a fixed usage limit for this plan.",
    };
  }
  if (entitlementFact.projectedCapacity === null) {
    return unavailableLimit(entitlementFact.caveats[0] ?? "No reviewed capacity value is available for this plan.");
  }
  const capacity = capacityLabel(entitlementFact.projectedCapacity);
  if (capacity === null) return unavailableLimit("No reviewed capacity value is available for this plan.");
  if (entitlementFact.evidenceState === "provider_stated" && entitlementFact.boundType === "hard_max") {
    return { state: "available", label: capacity, detail: null };
  }
  return {
    state: "variable",
    label: `${entitlementFact.evidenceState === "projected" ? "Projected" : "Variable"} — ${capacity}`,
    detail: entitlementFact.caveats[0] ?? entitlementFact.assumptions[0] ?? null,
  };
}

function projectPlanReceiptLimit(receipt: StrictEntitlementReceipt): SubscriptionLimitView {
  if (receipt.evidenceStatus === "dynamic_unknown" || receipt.evidenceStatus === "stale" || receipt.boundType === "unknown") {
    return {
      state: "variable",
      label: "Variable — provider-managed",
      detail: receipt.staleReason ?? receipt.usageNote,
    };
  }
  const dimension = receipt.dimensions.length === 1 ? receipt.dimensions[0] : null;
  if (dimension === null || dimension.metric === "credits") {
    return unavailableLimit("No comparable published capacity is available for this plan.");
  }
  const amount = dimension.minimum !== null && dimension.maximum !== null
    ? dimension.minimum === dimension.maximum
      ? dimension.minimum.toLocaleString()
      : `${dimension.minimum.toLocaleString()}–${dimension.maximum.toLocaleString()}`
    : dimension.maximum !== null
      ? `Up to ${dimension.maximum.toLocaleString()}`
      : dimension.minimum !== null
        ? `At least ${dimension.minimum.toLocaleString()}`
        : null;
  if (amount === null) return unavailableLimit("No comparable published capacity is available for this plan.");
  const label = `${amount} ${dimension.unit} / ${dimension.window.replaceAll("_", " ")}`;
  return receipt.evidenceStatus === "verified" && receipt.boundType === "hard_max"
    ? { state: "available", label, detail: receipt.usageNote }
    : { state: "variable", label: `Published — ${label}`, detail: receipt.usageNote };
}

function projectCalculation(
  strictCalculation: StrictCalculation,
  modelShares: Readonly<Record<string, number>>,
): SubscriptionCalculationView {
  return {
    monthlyApiUsd: strictCalculation.monthlyApiCostMicroDollars / 1_000_000,
    monthlySubscriptionUsd: strictCalculation.monthlySubscriptionCostMicroDollars / 1_000_000,
    differenceUsd: strictCalculation.differenceMicroDollars / 1_000_000,
    cheaper: strictCalculation.cheaper,
    crossoverTokens: strictCalculation.crossoverTokens,
    selectedTokenVolume: strictCalculation.crossoverTokenVolume,
    selectedVolumeApiUsd: strictCalculation.crossoverApiCostMicroDollars / 1_000_000,
    monthlyMessages: strictCalculation.derivedWorkload.monthlyMessages,
    monthlyInputTokens: strictCalculation.derivedWorkload.monthlyInputTokens,
    monthlyOutputTokens: strictCalculation.derivedWorkload.monthlyOutputTokens,
    modelShares,
    domain: strictCalculation.crossoverDomain.map((point) => ({
      tokens: point.tokenVolume,
      apiUsd: point.apiCostMicroDollars / 1_000_000,
      subscriptionUsd: point.subscriptionCostMicroDollars / 1_000_000,
    })),
    lineItems: strictCalculation.lineItems.map((line) => ({
      id: `${line.modelSlug}-${line.kind}`,
      modelSlug: line.modelSlug,
      kind: line.kind,
      tokens: line.tokens,
      rateUsdPerMillion: line.rateMicroDollarsPerMillion / 1_000_000,
      costUsd: line.costMicroDollars / 1_000_000,
    })),
  };
}

function providerViews(data: StrictSubscriptionData | null, fallbackReason: string): readonly SubscriptionProviderView[] {
  return SUBSCRIPTION_PROVIDERS.map((provider) => {
    const providerPlans = data?.plans
      .filter((plan) => plan.providerId === provider.id)
      .map((plan) => ({
        id: plan.planId,
        displayName: plan.displayName,
        monthlyUsd: plan.monthlyCostMicroDollars / 1_000_000,
        annualUsd: plan.annualCostMicroDollars === null ? null : plan.annualCostMicroDollars / 1_000_000,
        annualEffectiveMonthlyUsd: plan.annualEffectiveMonthlyCostMicroDollars === null
          ? null
          : plan.annualEffectiveMonthlyCostMicroDollars / 1_000_000,
        entitlement: plan.entitlement,
        sourceRefs: plan.sourceRefs,
        limit: plan.entitlement === null
          ? projectLimit(data.entitlementProjections.find((entitlementFact) => entitlementFact.planId === plan.planId))
          : projectPlanReceiptLimit(plan.entitlement),
      })) ?? [];
    return { ...provider, plans: providerPlans, unavailableReason: providerPlans.length === 0 ? fallbackReason : null };
  });
}

function modelViews(data: StrictSubscriptionData | null): readonly SubscriptionModelView[] {
  if (data === null) return [];
  const models: SubscriptionModelView[] = [];
  for (const plan of data.plans) {
    const provider = SUBSCRIPTION_PROVIDERS.find((candidate) => candidate.id === plan.providerId);
    if (provider === undefined) continue;
    for (const modelSlug of plan.supportedModelSlugs) {
      const bindings = data.routeBindings.filter((candidate) => (
        candidate.providerId === plan.providerId
        && candidate.modelSlug === modelSlug
      ));
      if (bindings.length !== 1) continue;
      const binding = bindings[0]!;
      // RouteFact.routeId is opaque. The producer's explicit binding is the
      // only permissible way to associate it with a plan-supported model;
      // never reconstruct `${modelSlug}-direct` or parse a provider route ID.
      const routes = data.routes.filter((candidate) => (
        candidate.providerId === plan.providerId
        && candidate.routeId === binding.routeId
        && candidate.status !== "unavailable"
        && candidate.contextWindowTokens !== null
      ));
      if (routes.length !== 1) continue;
      const route = routes[0]!;
      const tierContextTokens = route?.contextWindowTokens;
      if (tierContextTokens === undefined || tierContextTokens === null || models.some((candidate) => candidate.planId === plan.planId && candidate.id === modelSlug)) continue;
      models.push({
        id: modelSlug,
        planId: plan.planId,
        providerId: provider.id,
        routeId: route.routeId,
        tierContextTokens,
      });
    }
  }
  return models;
}

/**
 * Project a validated strict-v1 envelope into client-safe controls. Provider
 * slots are fixed by product scope, while plan rows only emit reviewed facts
 * that are present for the matching provider ID.
 */
export function projectSubscriptionCatalog(
  envelope: StrictSubscriptionEnvelope | null,
  sourceMode: SubscriptionSimulatorCatalog["sourceMode"],
  loaderError: string | null = null,
): SubscriptionSimulatorCatalog {
  const parsedData = envelope?.data === null || envelope === null ? null : parseSubscriptionData(envelope.data);
  const projectionFailure = envelope !== null && envelope.data !== null && parsedData === null;
  const reason = loaderError
    ?? envelope?.reason
    ?? (projectionFailure ? "The strict subscription response could not be projected safely." : null)
    ?? (envelope?.data === null ? "No verified subscription/catalog projection is available." : null);
  const fallbackReason = reason ?? "No reviewed plan is available for this provider.";
  const scopedPlanIds = new Set(parsedData?.plans
    .filter((plan) => SUBSCRIPTION_PROVIDERS.some((provider) => provider.id === plan.providerId))
    .map((plan) => plan.planId) ?? []);
  const calculationIsInScope = parsedData?.calculation !== null
    && parsedData !== null
    && scopedPlanIds.has(parsedData.calculation.selectedPlanId);
  const projectedCalculation = calculationIsInScope && parsedData?.calculation !== null
    ? projectCalculation(parsedData.calculation, calculationModelShares(envelope?.request ?? {}))
    : null;
  const calculationReason = projectedCalculation === null
    ? reason ?? (parsedData?.calculation !== null && parsedData !== null
      ? "No reviewed calculation is available for the selected seven-provider scope."
      : "A strict calculation requires an exact reviewed plan-to-model-to-route binding.")
    : null;
  const models = modelViews(parsedData);

  return {
    sourceMode,
    status: projectionFailure ? "unavailable" : envelope?.status ?? "unavailable",
    reason,
    providers: providerViews(parsedData, fallbackReason),
    models,
    modelSelectionReason: parsedData === null
      ? fallbackReason
      : models.length === 0
        ? "No exact reviewed plan-to-model-to-route binding is available in this catalog."
        : "Only models with an exact reviewed plan-to-route binding are selectable.",
    calculation: projectedCalculation,
    calculationReason,
    sources: envelope?.sources.map(sourceReceipt) ?? [],
  };
}

/** Keep URL state shareable while stripping unverified plan or model IDs. */
export function reconcileSubscriptionScenario(
  scenario: SubscriptionScenario,
  catalog: SubscriptionSimulatorCatalog,
): SubscriptionScenario {
  const provider = catalog.providers.find((candidate) => candidate.id === scenario.provider) ?? catalog.providers[0];
  const plan = provider.plans.some((candidate) => candidate.id === scenario.plan)
    ? scenario.plan
    : provider.plans[0]?.id ?? "";
  const availableModels = catalog.models.filter((candidate) => candidate.planId === plan);
  const requestedModels = scenario.models.filter((modelId) => availableModels.some((candidate) => candidate.id === modelId));
  const models = requestedModels.length > 0
    ? requestedModels
    : availableModels[0] === undefined ? [] : [availableModels[0].id];
  return { ...scenario, provider: provider.id, plan, models, mix: normalizeMix(models, scenario.mix) };
}

export function selectedPlan(
  scenario: SubscriptionScenario,
  catalog: SubscriptionSimulatorCatalog,
): SubscriptionPlanView | null {
  return catalog.providers
    .find((provider) => provider.id === scenario.provider)
    ?.plans.find((plan) => plan.id === scenario.plan) ?? null;
}

export type StrictSubscriptionCalculationQuery = Readonly<{
  operation: "calculate";
  planId: string;
  seats: number;
  modelMix: readonly Readonly<{
    modelSlug: string;
    routeId: string;
    pricingTierId: null;
    tierContextTokens: number;
    shareBasisPoints: number;
  }>[];
  workload: Readonly<{
    conversationsPerDay: number;
    messagesPerConversation: number;
    inputTokensPerMessage: number;
    outputTokensPerMessage: number;
    activeDaysPerMonth: number;
  }>;
  cacheReadShareBasisPoints: number;
  cacheWriteShareBasisPoints: number;
  crossoverTokenVolume: number;
}>;

export type StrictSubscriptionCalculationRequest = Readonly<{
  request: StrictSubscriptionCalculationQuery | null;
  reason: string | null;
}>;

function safeInteger(value: number, minimum: number, maximum: number): boolean {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

/**
 * Build the exact POST body from URL state only when every model is an emitted
 * catalog binding. The long-context helper rounds to whole tokens before it is
 * sent because strict v1 represents token counts as integers.
 */
export function buildSubscriptionCalculationRequest(
  scenario: SubscriptionScenario,
  catalog: SubscriptionSimulatorCatalog,
): StrictSubscriptionCalculationRequest {
  const selected = catalog.models.filter((candidate) => candidate.planId === scenario.plan);
  if (scenario.plan.length === 0 || scenario.models.length === 0) {
    return { request: null, reason: "Choose a reviewed plan and at least one exactly bound API model." };
  }
  if (scenario.models.some((modelId) => !selected.some((candidate) => candidate.id === modelId))) {
    return { request: null, reason: "The selected model does not have an exact reviewed binding for this plan." };
  }
  const inputTokensPerMessage = scenario.longContext
    ? Math.round(scenario.inputTokensPerMessage * 1.5)
    : scenario.inputTokensPerMessage;
  const numericValues = [
    [scenario.conversationsPerDay, 0, 10_000],
    [scenario.messagesPerConversation, 0, 1_000],
    [inputTokensPerMessage, 0, 1_000_000],
    [scenario.outputTokensPerMessage, 0, 1_000_000],
    [scenario.activeDays, 0, 31],
    [scenario.seats, 1, 50],
  ] as const;
  if (!numericValues.every(([value, minimum, maximum]) => safeInteger(value, minimum, maximum))) {
    return { request: null, reason: "Strict calculations require whole-number workload values within the published request bounds." };
  }
  const cacheReadShareBasisPoints = scenario.cacheReadShare * 100;
  const cacheWriteShareBasisPoints = scenario.cacheWriteShare * 100;
  if (
    !safeInteger(cacheReadShareBasisPoints, 0, 10_000)
    || !safeInteger(cacheWriteShareBasisPoints, 0, 10_000)
    || cacheReadShareBasisPoints + cacheWriteShareBasisPoints > 10_000
  ) return { request: null, reason: "Cache shares must be whole percentages totaling no more than 100%." };
  const modelMix = scenario.models.map((modelSlug) => {
    const model = selected.find((candidate) => candidate.id === modelSlug);
    const shareBasisPoints = (scenario.mix[modelSlug] ?? 0) * 100;
    return model === undefined || !safeInteger(shareBasisPoints, 0, 10_000)
      ? null
      : {
        modelSlug,
        routeId: model.routeId,
        pricingTierId: null,
        tierContextTokens: model.tierContextTokens,
        shareBasisPoints,
      } as const;
  });
  if (modelMix.some((item) => item === null) || modelMix.reduce((sum, item) => sum + (item?.shareBasisPoints ?? 0), 0) !== 10_000) {
    return { request: null, reason: "Model usage ratios must total exactly 100%." };
  }
  const monthlyMessages = scenario.conversationsPerDay * scenario.messagesPerConversation * scenario.activeDays;
  const derivedVolume = monthlyMessages * (inputTokensPerMessage + scenario.outputTokensPerMessage);
  const crossoverTokenVolume = scenario.tokenVolume > 0
    ? Math.round(scenario.tokenVolume * 1_000_000)
    : derivedVolume;
  if (!safeInteger(crossoverTokenVolume, 0, 300_000_000)) {
    return { request: null, reason: "The selected token volume exceeds the strict calculation boundary." };
  }
  return {
    request: {
      operation: "calculate",
      planId: scenario.plan,
      seats: scenario.seats,
      modelMix: modelMix as Exclude<(typeof modelMix)[number], null>[],
      workload: {
        conversationsPerDay: scenario.conversationsPerDay,
        messagesPerConversation: scenario.messagesPerConversation,
        inputTokensPerMessage,
        outputTokensPerMessage: scenario.outputTokensPerMessage,
        activeDaysPerMonth: scenario.activeDays,
      },
      cacheReadShareBasisPoints,
      cacheWriteShareBasisPoints,
      crossoverTokenVolume,
    },
    reason: null,
  };
}

export function mergeSubscriptionCalculation(
  catalog: SubscriptionSimulatorCatalog,
  calculated: SubscriptionSimulatorCatalog,
): SubscriptionSimulatorCatalog {
  if (calculated.calculation === null) {
    return {
      ...catalog,
      calculationReason: calculated.reason ?? calculated.calculationReason ?? catalog.calculationReason,
    };
  }
  return { ...catalog, calculation: calculated.calculation, calculationReason: null };
}
