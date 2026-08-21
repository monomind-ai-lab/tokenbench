import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSubscriptionCalculationRequest,
  projectSubscriptionCatalog,
  subscriptionRequestMatches,
  reconcileSubscriptionScenario,
  type StrictSubscriptionEnvelope,
} from "./subscription-simulator-projector";
import type { SubscriptionScenario } from "./subscription-simulator";

function catalogEnvelope(): StrictSubscriptionEnvelope {
  return {
    contractVersion: "ui-data-contract/v1",
    method: "subscription",
    request: { operation: "catalog" },
    status: "available",
    reason: null,
    fetchedAt: "2026-08-21T00:00:00.000Z",
    effectiveAt: null,
    data: {
      operation: "catalog",
      plans: [
        {
          planId: "openai-reviewed",
          providerId: "openai",
          displayName: "Reviewed OpenAI plan",
          monthlyCostMicroDollars: 20_000_000,
          supportedModelSlugs: [],
          sourceRefs: ["openai-source"],
        },
        {
          planId: "perplexity-reviewed",
          providerId: "perplexity",
          displayName: "Reviewed Perplexity plan",
          monthlyCostMicroDollars: 20_000_000,
          supportedModelSlugs: [],
          sourceRefs: ["perplexity-source"],
        },
        {
          planId: "out-of-scope",
          providerId: "not-in-product-scope",
          displayName: "Out of scope",
          monthlyCostMicroDollars: 1,
          supportedModelSlugs: [],
          sourceRefs: ["other-source"],
        },
      ],
      routes: [],
      routeBindings: [],
      entitlementProjections: [
        {
          projectionId: "openai-dynamic-limit",
          planId: "openai-reviewed",
          evidenceState: "dynamic_unknown",
          formula: null,
          assumptions: [],
          caveats: ["Provider changes this limit dynamically."],
          confidence: null,
          boundType: "unknown",
          projectedCapacity: null,
          workloadShape: {
            conversationsPerDay: 1,
            messagesPerConversation: 1,
            inputTokensPerMessage: 1,
            outputTokensPerMessage: 1,
            activeDaysPerMonth: 1,
            cacheReadShareBasisPoints: 0,
            cacheWriteShareBasisPoints: 0,
          },
          sensitivity: { minimum: null, maximum: null, unit: "messages" },
          methodologyVersion: "test-v1",
          effectiveAt: null,
          sourceRefs: ["openai-source"],
        },
      ],
      calculation: null,
    },
    revisions: {
      projection: "test-v1",
      catalog: "test-catalog",
      benchmark: null,
      runtimeObservationSet: null,
      projectionMethodology: "test-v1",
    },
    freshness: {
      catalogObservedAt: "2026-08-21T00:00:00.000Z",
      runtimeObservedAt: null,
      benchmarkReleasedAt: null,
      benchmarkCheckedAt: null,
    },
    sources: [],
    warnings: [],
    provenance: [],
  } as StrictSubscriptionEnvelope;
}

test("projects only the fixed seven-provider scope and leaves missing slots unavailable", () => {
  const catalog = projectSubscriptionCatalog(catalogEnvelope(), "production");

  assert.deepEqual(catalog.providers.map((provider) => provider.id), [
    "openai", "anthropic", "google", "xai", "zai", "perplexity", "microsoft",
  ]);
  assert.deepEqual(catalog.providers.find((provider) => provider.id === "openai")?.plans.map((plan) => plan.id), ["openai-reviewed"]);
  assert.deepEqual(catalog.providers.find((provider) => provider.id === "perplexity")?.plans.map((plan) => plan.id), ["perplexity-reviewed"]);
  assert.equal(catalog.providers.find((provider) => provider.id === "microsoft")?.plans.length, 0);
  assert.equal(catalog.providers.find((provider) => provider.id === "openai")?.plans[0]?.limit.state, "variable");
  assert.equal(catalog.providers.some((provider) => provider.plans.some((plan) => plan.id === "out-of-scope")), false);
});

test("retains source-published annual price and entitlement verification without deriving savings", () => {
  const envelope = catalogEnvelope();
  const data = envelope.data as Record<string, unknown>;
  const plans = (data.plans as Array<Record<string, unknown>>).map((plan) => plan.planId !== "openai-reviewed"
    ? plan
    : {
      ...plan,
      annualCostMicroDollars: { availability: "available", value: 200_000_000 },
      annualEffectiveMonthlyCostMicroDollars: { availability: "available", value: 16_666_667 },
      entitlement: {
        evidenceStatus: "verified",
        boundType: "hard_max",
        usageNote: "Provider-published annual plan receipt.",
        dimensions: [{
          metric: "messages", minimum: null, maximum: 80, unit: "messages",
          window: "rolling_5h", resetRule: "Rolling", modelId: null, feature: null, sharedPoolId: null,
        }],
        staleReason: null,
        lastVerifiedAt: "2026-08-21T00:00:00.000Z",
        sourceRefs: ["openai-source"],
      },
    });
  const catalog = projectSubscriptionCatalog({ ...envelope, data: { ...data, plans } } as StrictSubscriptionEnvelope, "production");
  const plan = catalog.providers.find((provider) => provider.id === "openai")?.plans[0];

  assert.deepEqual(plan, {
    id: "openai-reviewed",
    displayName: "Reviewed OpenAI plan",
    monthlyUsd: 20,
    annualUsd: 200,
    annualEffectiveMonthlyUsd: 16.666667,
    entitlement: {
      evidenceStatus: "verified",
      boundType: "hard_max",
      usageNote: "Provider-published annual plan receipt.",
      dimensions: [{
        metric: "messages", minimum: null, maximum: 80, unit: "messages",
        window: "rolling_5h", resetRule: "Rolling", modelId: null, feature: null, sharedPoolId: null,
      }],
      staleReason: null,
      lastVerifiedAt: "2026-08-21T00:00:00.000Z",
      sourceRefs: ["openai-source"],
    },
    sourceRefs: ["openai-source"],
    limit: { state: "available", label: "Up to 80 messages / rolling 5h", detail: "Provider-published annual plan receipt." },
  });
});

test("accepts only an exact echoed subscription request", () => {
  const envelope = catalogEnvelope();
  assert.equal(subscriptionRequestMatches(envelope, { operation: "catalog" }), true);
  assert.equal(subscriptionRequestMatches(envelope, expectRequest({
    modelSlug: "gpt-4o",
    routeId: "gpt-4o-direct",
    tierContextTokens: 128_000,
  })), false);
});

test("does not preserve a plan or model that the strict catalog cannot validate", () => {
  const catalog = projectSubscriptionCatalog(catalogEnvelope(), "production");
  const reconciled = reconcileSubscriptionScenario({
    provider: "openai",
    plan: "unreviewed-plan",
    models: ["unbound-model"],
    mix: { "unbound-model": 100 },
    conversationsPerDay: 5,
    messagesPerConversation: 8,
    activeDays: 22,
    inputTokensPerMessage: 1200,
    outputTokensPerMessage: 350,
    cacheReadShare: 20,
    cacheWriteShare: 5,
    seats: 1,
    tokenVolume: 0,
    inputCharactersPerMessage: 4800,
    outputCharactersPerMessage: 1400,
    contentType: "text",
    longContext: false,
  }, catalog);

  assert.equal(reconciled.plan, "openai-reviewed");
  assert.deepEqual(reconciled.models, []);
  assert.deepEqual(reconciled.mix, {});
  assert.match(catalog.modelSelectionReason, /model-to-route binding/);
});

test("does not synthesize a model route from a returned persisted route ID", () => {
  const envelope = catalogEnvelope();
  const data = envelope.data as Record<string, unknown>;
  const catalogData = {
    ...data,
    plans: (data.plans as Array<Record<string, unknown>>).map((plan) => plan.planId === "openai-reviewed"
      ? { ...plan, supportedModelSlugs: ["gpt-4o"] }
      : plan),
    routes: [{
      routeId: "openai:gpt-4o:direct",
      providerId: "openai",
      status: "available",
      contextWindowTokens: { availability: "available", value: 128_000 },
    }],
  };
  const catalog = projectSubscriptionCatalog({ ...envelope, data: catalogData } as StrictSubscriptionEnvelope, "production");
  const scenarioSeed: SubscriptionScenario = {
    provider: "openai", plan: "openai-reviewed", models: ["gpt-4o"], mix: { "gpt-4o": 100 },
    conversationsPerDay: 1, messagesPerConversation: 1, activeDays: 20, inputTokensPerMessage: 1_000,
    outputTokensPerMessage: 500, cacheReadShare: 0, cacheWriteShare: 0, seats: 1, tokenVolume: 1,
    inputCharactersPerMessage: 4_000, outputCharactersPerMessage: 2_000, contentType: "text", longContext: false,
  };
  const scenario = reconcileSubscriptionScenario(scenarioSeed, catalog);

  assert.deepEqual(catalog.models, []);
  assert.match(catalog.modelSelectionReason, /exact reviewed plan-to-model-to-route binding/);
  assert.deepEqual(buildSubscriptionCalculationRequest(scenario, catalog), {
    request: null,
    reason: "Choose a reviewed plan and at least one exactly bound API model.",
  });

  const boundCatalog = projectSubscriptionCatalog({
    ...envelope,
    data: {
      ...catalogData,
      routeBindings: [{
        routeId: "openai:gpt-4o:direct",
        modelSlug: "gpt-4o",
        providerId: "openai",
      }],
    },
  } as StrictSubscriptionEnvelope, "production");
  const boundScenario = reconcileSubscriptionScenario(scenarioSeed, boundCatalog);

  assert.deepEqual(buildSubscriptionCalculationRequest(boundScenario, boundCatalog), {
    request: expectRequest({
      modelSlug: "gpt-4o", routeId: "openai:gpt-4o:direct", tierContextTokens: 128_000,
    }),
    reason: null,
  });
});

function expectRequest(model: { modelSlug: string; routeId: string; tierContextTokens: number }) {
  return {
    operation: "calculate" as const,
    planId: "openai-reviewed",
    seats: 1,
    modelMix: [{ ...model, pricingTierId: null, shareBasisPoints: 10_000 }],
    workload: {
      conversationsPerDay: 1, messagesPerConversation: 1, inputTokensPerMessage: 1_000,
      outputTokensPerMessage: 500, activeDaysPerMonth: 20,
    },
    cacheReadShareBasisPoints: 0,
    cacheWriteShareBasisPoints: 0,
    crossoverTokenVolume: 1_000_000,
  };
}
