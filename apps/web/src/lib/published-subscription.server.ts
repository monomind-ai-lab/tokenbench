import "server-only";

import type { CatalogResponse, ModelOffer, PlanOffer } from "@tokenbench/catalog/contracts";
import type {
  EvidenceValue,
  PreviewModel,
  Provenance,
  SubscriptionCalculation,
  SubscriptionData,
  UiDataContractV1,
} from "@tokenbench/frontend/preview-data/contracts";

import {
  defaultSubscriptionScenario,
  type SubscriptionScenario,
  SUBSCRIPTION_PROVIDERS,
  type SubscriptionProvider,
} from "@/lib/subscription-simulator";
import type {
  StrictSubscriptionCalculationQuery,
  SubscriptionCalculationView,
  SubscriptionLimitView,
  SubscriptionModelView,
  SubscriptionPlanView,
  SubscriptionProviderView,
  SubscriptionSimulatorCatalog,
} from "@/lib/subscription-simulator-projector";
import {
  buildSubscriptionCalculationRequest,
  reconcileSubscriptionScenario,
} from "@/lib/subscription-simulator-projector";

const PROVIDERS = new Set<SubscriptionProvider>(SUBSCRIPTION_PROVIDERS.map((provider) => provider.id));

function reviewedSource(catalog: CatalogResponse, sourceId: string): boolean {
  const source = catalog.provenance.find((candidate) => candidate.id === sourceId);
  return source !== undefined
    && source.reviewStatus !== "rejected"
    && (source.reviewStatus === undefined || source.reviewStatus === "verified")
    && (source.confidence === "official" || source.confidence === "manual_verified");
}

function scopedPlans(catalog: CatalogResponse): readonly PlanOffer[] {
  return catalog.plans.filter((plan) => PROVIDERS.has(plan.providerId as SubscriptionProvider) && reviewedSource(catalog, plan.sourceId));
}

function scopedDirectOffers(catalog: CatalogResponse): readonly ModelOffer[] {
  const candidates = catalog.modelOffers.filter((offer) => (
    PROVIDERS.has(offer.providerId as SubscriptionProvider)
    && offer.pricingBasis === "direct_provider_api"
    && offer.route === "direct_provider"
    && reviewedSource(catalog, offer.sourceId)
  ));
  const counts = new Map<string, number>();
  for (const offer of candidates) {
    const key = `${offer.providerId}\u0000${offer.modelId}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return candidates.filter((offer) => counts.get(`${offer.providerId}\u0000${offer.modelId}`) === 1);
}

function limitView(plan: PlanOffer): SubscriptionLimitView {
  const evidence = plan.entitlementEvidence;
  const dimension = evidence.dimensions.length === 1 ? evidence.dimensions[0] : undefined;
  if (evidence.status === "dynamic_unknown" || evidence.status === "stale" || dimension === undefined) {
    return {
      state: "variable",
      label: "Variable — provider-managed",
      detail: evidence.staleReason ?? evidence.projection?.caveats[0] ?? "The provider does not publish one fixed comparable capacity.",
    };
  }
  const minimum = dimension.min ?? null;
  const maximum = dimension.max ?? null;
  const amount = minimum !== null && maximum !== null
    ? minimum === maximum ? minimum.toLocaleString() : `${minimum.toLocaleString()}–${maximum.toLocaleString()}`
    : maximum !== null ? `Up to ${maximum.toLocaleString()}`
      : minimum !== null ? `At least ${minimum.toLocaleString()}` : null;
  if (amount === null || dimension.metric === "credits") {
    return { state: "unavailable", label: "Unavailable", detail: "No comparable published capacity is available for this plan." };
  }
  const label = `${amount} ${dimension.unit} / ${dimension.window.replaceAll("_", " ")}`;
  return evidence.status === "verified" && evidence.boundType === "hard_max"
    ? { state: "available", label, detail: null }
    : { state: "variable", label: `Projected — ${label}`, detail: evidence.projection?.caveats[0] ?? null };
}

function planViews(catalog: CatalogResponse): readonly SubscriptionProviderView[] {
  const plans = scopedPlans(catalog);
  return SUBSCRIPTION_PROVIDERS.map((provider) => {
    const providerPlans: SubscriptionPlanView[] = plans
      .filter((plan) => plan.providerId === provider.id)
      .map((plan) => ({
        id: plan.id,
        displayName: plan.displayName,
        monthlyUsd: plan.monthlyCostMicroDollars / 1_000_000,
        limit: limitView(plan),
      }));
    return {
      ...provider,
      plans: providerPlans,
      unavailableReason: providerPlans.length === 0 ? "No reviewed plan is currently published for this provider." : null,
    };
  });
}

function modelViews(catalog: CatalogResponse): readonly SubscriptionModelView[] {
  const offers = scopedDirectOffers(catalog);
  return scopedPlans(catalog).flatMap((plan) => (plan.supportedModelIds ?? []).flatMap((modelId) => {
    const offer = offers.find((candidate) => (
      candidate.providerId === plan.providerId
      && candidate.modelId === modelId
      && candidate.availability !== "deprecated"
      && candidate.contextWindowTokens !== undefined
    ));
    if (offer === undefined || !PROVIDERS.has(plan.providerId as SubscriptionProvider)) return [];
    return [{
      id: modelId,
      planId: plan.id,
      providerId: plan.providerId as SubscriptionProvider,
      // `model_offers.id` is the persisted route identity. It may differ from
      // a model slug and must never be reconstructed from one.
      routeId: offer.id,
      tierContextTokens: offer.contextWindowTokens as number,
    }];
  }));
}

export function projectPublishedSubscriptionCatalog(catalog: CatalogResponse): SubscriptionSimulatorCatalog {
  const providers = planViews(catalog);
  const models = modelViews(catalog);
  return {
    sourceMode: "production",
    status: providers.some((provider) => provider.plans.length > 0) ? "partial" : "unavailable",
    reason: providers.some((provider) => provider.plans.length > 0) ? null : "No reviewed subscription plans are published.",
    providers,
    models,
    modelSelectionReason: models.length > 0
      ? "Only exact provider-plan-model-route bindings from the reviewed catalog are selectable."
      : "No exact provider-plan-model-route binding is currently published.",
    calculation: null,
    calculationReason: "Choose a reviewed plan and model to calculate the workload.",
  };
}

function safeNumber(value: bigint, label: string): number {
  if (value < BigInt(0) || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new TypeError(`${label} exceeds the safe integer range.`);
  return Number(value);
}

function allocate(total: number, weights: readonly number[], label: string): number[] {
  const denominator = weights.reduce((sum, weight) => sum + weight, 0);
  if (!Number.isSafeInteger(total) || total < 0 || denominator <= 0) throw new TypeError(`${label} allocation is invalid.`);
  const totalValue = BigInt(total);
  const denominatorValue = BigInt(denominator);
  const complete = totalValue / denominatorValue;
  const remainder = totalValue % denominatorValue;
  let start = BigInt(0);
  return weights.map((weight) => {
    const width = BigInt(weight);
    const end = start + width;
    const overlapEnd = remainder < end ? remainder : end;
    const overlap = overlapEnd > start ? overlapEnd - start : BigInt(0);
    const result = safeNumber(complete * width + overlap, label);
    start = end;
    return result;
  });
}

function roundedCost(tokens: number, rate: number): number {
  return safeNumber((BigInt(tokens) * BigInt(rate) + BigInt(500_000)) / BigInt(1_000_000), "Published API cost");
}

type CostLine = SubscriptionCalculationView["lineItems"][number];

function priceTokens(
  inputTokens: number,
  outputTokens: number,
  request: StrictSubscriptionCalculationQuery,
  offers: readonly ModelOffer[],
): { readonly totalMicroDollars: number; readonly lines: readonly CostLine[] } {
  const modelInput = allocate(inputTokens, request.modelMix.map((item) => item.shareBasisPoints), "Model input");
  const modelOutput = allocate(outputTokens, request.modelMix.map((item) => item.shareBasisPoints), "Model output");
  const cacheShares = [
    10_000 - request.cacheReadShareBasisPoints - request.cacheWriteShareBasisPoints,
    request.cacheReadShareBasisPoints,
    request.cacheWriteShareBasisPoints,
  ];
  const lines: CostLine[] = [];
  for (const [index, item] of request.modelMix.entries()) {
    const offer = offers[index];
    if (offer === undefined) throw new TypeError("A selected route price is missing.");
    const [standardInput, cacheRead, cacheWrite] = allocate(modelInput[index] as number, cacheShares, "Cache input");
    const definitions = [
      ["standard_input", standardInput, offer.inputMicroDollarsPerMillion],
      ["cache_read", cacheRead, offer.cachedInputMicroDollarsPerMillion ?? null],
      ["cache_write", cacheWrite, offer.cacheWriteMicroDollarsPerMillion ?? null],
      ["output", modelOutput[index] as number, offer.outputMicroDollarsPerMillion],
    ] as const;
    for (const [kind, tokens, rate] of definitions) {
      if (rate === null) {
        if (tokens > 0) throw new TypeError(`No reviewed ${kind.replaceAll("_", " ")} rate is published for ${item.modelSlug}. Set that allocation to 0%.`);
        continue;
      }
      const costMicroDollars = roundedCost(tokens, rate);
      lines.push({
        id: `${item.routeId}-${kind}`,
        modelSlug: item.modelSlug,
        kind,
        tokens,
        rateUsdPerMillion: rate / 1_000_000,
        costUsd: costMicroDollars / 1_000_000,
      });
    }
  }
  return {
    lines,
    totalMicroDollars: Math.round(lines.reduce((sum, line) => sum + line.costUsd, 0) * 1_000_000),
  };
}

function crossoverCost(tokenVolume: number, request: StrictSubscriptionCalculationQuery, offers: readonly ModelOffer[]): number {
  const composition = request.workload.inputTokensPerMessage + request.workload.outputTokensPerMessage;
  if (composition === 0) return 0;
  const [inputTokens, outputTokens] = allocate(tokenVolume, [
    request.workload.inputTokensPerMessage,
    request.workload.outputTokensPerMessage,
  ], "Crossover direction");
  return priceTokens(inputTokens as number, outputTokens as number, request, offers).totalMicroDollars;
}

function calculateView(
  plan: PlanOffer,
  offers: readonly ModelOffer[],
  request: StrictSubscriptionCalculationQuery,
): SubscriptionCalculationView {
  const monthlyMessages = request.workload.conversationsPerDay * request.workload.messagesPerConversation * request.workload.activeDaysPerMonth;
  const monthlyInputTokens = monthlyMessages * request.workload.inputTokensPerMessage;
  const monthlyOutputTokens = monthlyMessages * request.workload.outputTokensPerMessage;
  const monthly = priceTokens(monthlyInputTokens, monthlyOutputTokens, request, offers);
  const monthlySubscriptionMicroDollars = plan.monthlyCostMicroDollars * request.seats;
  const differenceMicroDollars = monthly.totalMicroDollars - monthlySubscriptionMicroDollars;
  const maximum = 300_000_000;
  let crossoverTokens: number | null = null;
  if (crossoverCost(maximum, request, offers) >= monthlySubscriptionMicroDollars) {
    let low = 0;
    let high = maximum;
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2);
      if (crossoverCost(middle, request, offers) >= monthlySubscriptionMicroDollars) high = middle;
      else low = middle + 1;
    }
    crossoverTokens = low;
  }
  const volumes = new Set([0, 25_000_000, 50_000_000, 100_000_000, 150_000_000, 200_000_000, 250_000_000, maximum, request.crossoverTokenVolume]);
  if (crossoverTokens !== null) volumes.add(crossoverTokens);
  return {
    monthlyApiUsd: monthly.totalMicroDollars / 1_000_000,
    monthlySubscriptionUsd: monthlySubscriptionMicroDollars / 1_000_000,
    differenceUsd: differenceMicroDollars / 1_000_000,
    cheaper: differenceMicroDollars > 0 ? "subscription" : differenceMicroDollars < 0 ? "api" : "equal",
    crossoverTokens,
    selectedTokenVolume: request.crossoverTokenVolume,
    selectedVolumeApiUsd: crossoverCost(request.crossoverTokenVolume, request, offers) / 1_000_000,
    monthlyMessages,
    monthlyInputTokens,
    monthlyOutputTokens,
    modelShares: Object.fromEntries(request.modelMix.map((item) => [item.modelSlug, item.shareBasisPoints / 100])),
    domain: [...volumes].sort((left, right) => left - right).map((tokens) => ({
      tokens,
      apiUsd: crossoverCost(tokens, request, offers) / 1_000_000,
      subscriptionUsd: monthlySubscriptionMicroDollars / 1_000_000,
    })),
    lineItems: monthly.lines,
  };
}

export function calculatePublishedSubscription(
  catalog: CatalogResponse,
  request: StrictSubscriptionCalculationQuery,
): SubscriptionSimulatorCatalog {
  const projected = projectPublishedSubscriptionCatalog(catalog);
  try {
    const plan = scopedPlans(catalog).find((candidate) => candidate.id === request.planId);
    if (plan === undefined) throw new TypeError("The selected plan is not in the reviewed catalog.");
    const offers = scopedDirectOffers(catalog);
    for (const item of request.modelMix) {
      if (!(plan.supportedModelIds ?? []).includes(item.modelSlug)) throw new TypeError("The selected model is not published for this plan.");
      if (!offers.some((offer) => (
        offer.providerId === plan.providerId
        && offer.modelId === item.modelSlug
        && offer.id === item.routeId
      ))) {
        throw new TypeError("The selected model has no exact reviewed direct route.");
      }
    }
    const selectedOffers = request.modelMix.map((item) => offers.find((offer) => (
      offer.providerId === plan.providerId
      && offer.modelId === item.modelSlug
      && offer.id === item.routeId
    )) as ModelOffer);
    return { ...projected, calculation: calculateView(plan, selectedOffers, request), calculationReason: null };
  } catch (error) {
    return {
      ...projected,
      calculationReason: error instanceof Error ? error.message : "The published calculation could not be completed.",
    };
  }
}

function homeProvenance(catalog: CatalogResponse): Provenance {
  return {
    id: `catalog:${catalog.revision}`,
    label: "Published provider catalog",
    kind: "accepted_pipeline",
    effectiveAt: catalog.freshness.checkedAt,
    note: "Reviewed provider plans, entitlement evidence, and direct API prices.",
  };
}

function homeAvailable<T>(value: T, provenance: Provenance): EvidenceValue<T> {
  return { availability: "available", value, provenance };
}

function homeUnavailable<T>(reason: string, provenance: Provenance): EvidenceValue<T> {
  return { availability: "unavailable", reason, provenance };
}

function homeModels(catalog: CatalogResponse, provenance: Provenance): readonly PreviewModel[] {
  return scopedDirectOffers(catalog).flatMap((offer) => {
    if (offer.contextWindowTokens === undefined) return [];
    return [{
      id: offer.modelId,
      identity: homeAvailable({ slug: offer.modelId, name: offer.displayName, provider: offer.providerId }, provenance),
      access: homeUnavailable("The provider catalog does not classify model weights.", provenance),
      benchmark: homeUnavailable("The provider catalog is not a benchmark source.", provenance),
      capability: homeUnavailable("The provider catalog is not a capability source.", provenance),
      routePricing: homeAvailable({
        route: offer.id,
        inputUsdPerMillion: offer.inputMicroDollarsPerMillion / 1_000_000,
        outputUsdPerMillion: offer.outputMicroDollarsPerMillion / 1_000_000,
        contextWindowTokens: homeAvailable(offer.contextWindowTokens, provenance),
        maxOutputTokens: offer.maxOutputTokens === undefined
          ? homeUnavailable("No reviewed maximum-output value is published.", provenance)
          : homeAvailable(offer.maxOutputTokens, provenance),
        inputModalities: [],
        outputModalities: [],
        cache: offer.cachedInputMicroDollarsPerMillion === undefined
          ? homeUnavailable("No reviewed cache-read rate is published.", provenance)
          : homeAvailable({
            readUsdPerMillion: homeAvailable(offer.cachedInputMicroDollarsPerMillion / 1_000_000, provenance),
            writeUsdPerMillion: offer.cacheWriteMicroDollarsPerMillion === undefined
              ? homeUnavailable("No reviewed cache-write rate is published.", provenance)
              : homeAvailable(offer.cacheWriteMicroDollarsPerMillion / 1_000_000, provenance),
          }, provenance),
      }, provenance),
      taskEconomics: homeUnavailable("The provider catalog is not a task-economics source.", provenance),
      runtime: homeUnavailable("No observed runtime data is published in the provider catalog.", provenance),
      lifecycle: homeUnavailable("Lifecycle is projected from explicit endpoint expiration dates only.", provenance),
    }];
  });
}

export function projectPublishedHomeSubscription(
  catalog: CatalogResponse,
  scenarioSeed: SubscriptionScenario = defaultSubscriptionScenario,
  fetchedAt = new Date().toISOString(),
): UiDataContractV1<SubscriptionData> {
  const provenance = homeProvenance(catalog);
  const catalogView = projectPublishedSubscriptionCatalog(catalog);
  const scenario = reconcileSubscriptionScenario(scenarioSeed, catalogView);
  const request = buildSubscriptionCalculationRequest(scenario, catalogView);
  const calculated = request.request === null ? catalogView : calculatePublishedSubscription(catalog, request.request);
  const plans = scopedPlans(catalog).map((plan) => ({
    id: plan.id,
    provider: homeAvailable(plan.providerId, provenance),
    displayName: homeAvailable(plan.displayName, provenance),
    monthlyUsd: homeAvailable(plan.monthlyCostMicroDollars / 1_000_000, provenance),
    includedUsage: homeAvailable(limitView(plan).label, provenance),
  }));
  const calculation: EvidenceValue<SubscriptionCalculation> = calculated.calculation === null || request.request === null
    ? homeUnavailable<SubscriptionCalculation>(calculated.calculationReason ?? request.reason ?? "No exact published calculation is available.", provenance)
    : homeAvailable({
      request: request.request,
      monthlySubscriptionUsd: calculated.calculation.monthlySubscriptionUsd,
      selectedVolumeApiUsd: calculated.calculation.selectedVolumeApiUsd,
      crossoverTokens: calculated.calculation.crossoverTokens,
      domain: calculated.calculation.domain.map((point) => ({
        tokens: point.tokens,
        apiUsd: point.apiUsd,
        monthlySubscriptionUsd: point.subscriptionUsd,
      })),
      lineItems: calculated.calculation.lineItems.map((line) => ({
        id: line.id,
        tokens: line.tokens,
        rateUsdPerMillion: line.rateUsdPerMillion,
        costUsd: line.costUsd,
      })),
    }, provenance);
  return {
    contractVersion: "ui-data-contract/v1",
    status: calculation.availability === "available" ? "partial" : "partial",
    fetchedAt,
    effectiveAt: catalog.freshness.checkedAt,
    data: {
      plans,
      models: homeModels(catalog, provenance),
      selectedModelTaskEconomics: homeUnavailable("Task economics are published on benchmark surfaces, not subscription plans.", provenance),
      calculation,
    },
    provenance: [provenance],
  };
}
