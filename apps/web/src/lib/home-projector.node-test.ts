import assert from "node:assert/strict";
import test from "node:test";

import type {
  CompareData,
  ModelDirectoryData,
  PreviewModel,
  Provenance,
  RankingData,
  SubscriptionData,
  UiDataContractV1,
} from "@tokenbench/frontend/preview-data/contracts";

import type { HomeDataSnapshot } from "./home-data";
import { projectHomeData } from "./home-projector";

const source: Provenance = {
  id: "accepted:home-test",
  label: "Accepted test record",
  kind: "accepted_pipeline",
  effectiveAt: "2026-08-21T00:00:00.000Z",
  note: "Test-only source.",
};

function model(id: string, name: string): PreviewModel {
  return {
    id,
    identity: { availability: "available", value: { slug: id, name, provider: "Provider" }, provenance: source },
    access: { availability: "available", value: "Open weights", provenance: source },
    benchmark: { availability: "unavailable", reason: "No benchmark release." },
    capability: {
      availability: "available",
      value: {
        compositeScore: 91.25,
        radar: [
          { key: "coding", label: "Coding", percentile: 94, rank: 1, fieldSize: 10 },
          { key: "reasoning", label: "Reasoning", percentile: 88, rank: 2, fieldSize: 10 },
          { key: "math", label: "Math", percentile: 90, rank: 2, fieldSize: 10 },
        ],
      },
      provenance: source,
    },
    routePricing: {
      availability: "available",
      value: {
        route: `${id}-direct`,
        inputUsdPerMillion: 1.25,
        outputUsdPerMillion: 4.5,
        contextWindowTokens: { availability: "unavailable", reason: "No context record." },
        maxOutputTokens: { availability: "unavailable", reason: "No output record." },
        inputModalities: ["text"],
        outputModalities: ["text"],
        cache: { availability: "unavailable", reason: "No cache record." },
      },
      provenance: source,
    },
    taskEconomics: { availability: "unavailable", reason: "No task record." },
    runtime: { availability: "available", value: { ttftP50Seconds: 0.42, outputTokensPerSecond: 76, conditions: "Accepted observation." }, provenance: source },
    lifecycle: { availability: "unavailable", reason: "No lifecycle record." },
  };
}

function envelope<T>(data: T | null): UiDataContractV1<T> {
  return {
    contractVersion: "ui-data-contract/v1",
    status: data === null ? "unavailable" : "available",
    ...(data === null ? { reason: "No accepted record." } : {}),
    fetchedAt: "2026-08-21T00:00:00.000Z",
    effectiveAt: source.effectiveAt,
    data,
    provenance: [source],
  };
}

function snapshot(): HomeDataSnapshot {
  const first = model("first", "First model");
  const second = model("second", "Second model");
  return {
    mode: "production",
    models: { envelope: envelope<ModelDirectoryData>({ models: [first, second] }), error: null },
    rankings: { envelope: envelope<RankingData>({ models: [{ model: first, rank: { availability: "available", value: 3, provenance: source } }] }), error: null },
    comparison: { envelope: envelope<CompareData>({ models: [first, second], unavailableModelIds: [] }), error: null },
    subscription: {
      envelope: envelope<SubscriptionData>({
        plans: [{
          id: "accepted-plan",
          provider: { availability: "available", value: "Provider", provenance: source },
          displayName: { availability: "available", value: "Accepted plan", provenance: source },
          monthlyUsd: { availability: "available", value: 30, provenance: source },
          includedUsage: { availability: "unavailable", reason: "No limit record." },
        }],
        models: [first, second],
        selectedModelTaskEconomics: { availability: "unavailable", reason: "No task record." },
        calculation: {
          availability: "available",
          value: {
            request: {
              planId: "accepted-plan",
              seats: 1,
              modelMix: [],
              workload: { activeDaysPerMonth: 20, conversationsPerDay: 5, inputTokensPerMessage: 500, messagesPerConversation: 2, outputTokensPerMessage: 200 },
              cacheReadShareBasisPoints: 0,
              cacheWriteShareBasisPoints: 0,
              crossoverTokenVolume: 2000000,
            },
            monthlySubscriptionUsd: 30,
            selectedVolumeApiUsd: 24,
            crossoverTokens: 2000000,
            domain: [
              { tokens: 1000000, apiUsd: 12, monthlySubscriptionUsd: 30 },
              { tokens: 2000000, apiUsd: 24, monthlySubscriptionUsd: 30 },
            ],
            lineItems: [],
          },
          provenance: source,
        },
      }),
      error: null,
    },
  };
}

test("projects only available Home facts and preserves missing route limits as unavailable", () => {
  const result = projectHomeData(snapshot());

  assert.equal(result.mode, "production");
  assert.equal(result.models[0]?.id, "first");
  assert.equal(result.models[0]?.name, "First model");
  assert.equal(result.models[0]?.inputUsdPerMillion, 1.25);
  assert.equal(result.models[0]?.outputTokensPerSecond, 76);
  assert.equal(result.models[0]?.contextWindowTokens, null);
  assert.deepEqual(result.models[0]?.radar, [
    { key: "coding", label: "Coding", percentile: 94 },
    { key: "reasoning", label: "Reasoning", percentile: 88 },
    { key: "math", label: "Math", percentile: 90 },
  ]);
  assert.equal(result.snapshot[0]?.rank, 3);
  assert.equal(result.comparison.length, 2);
  assert.deepEqual(result.subscription.points, [
    { tokens: 1000000, apiUsd: 12, monthlySubscriptionUsd: 30 },
    { tokens: 2000000, apiUsd: 24, monthlySubscriptionUsd: 30 },
  ]);
  assert.equal(result.subscription.initialPointIndex, 1);
});

test("does not synthesize subscription calculations or Home lists from unavailable envelopes", () => {
  const unavailable: HomeDataSnapshot = {
    mode: "production",
    models: { envelope: envelope<ModelDirectoryData>(null), error: null },
    rankings: { envelope: envelope<RankingData>(null), error: null },
    comparison: { envelope: envelope<CompareData>(null), error: null },
    subscription: { envelope: envelope<SubscriptionData>(null), error: null },
  };
  const result = projectHomeData(unavailable);

  assert.deepEqual(result.models, []);
  assert.deepEqual(result.snapshot, []);
  assert.deepEqual(result.comparison, []);
  assert.equal(result.subscription.monthlySubscriptionUsd, null);
  assert.deepEqual(result.subscription.points, []);
  assert.match(result.subscription.message ?? "", /No accepted record/);
});

test("keeps an unavailable source rank null instead of deriving rank from array order", () => {
  const input = snapshot();
  const rankedModel = model("first", "First model");
  const result = projectHomeData({
    ...input,
    rankings: {
      envelope: envelope<RankingData>({
        models: [{ model: rankedModel, rank: { availability: "unavailable", reason: "No published rank." } }],
      }),
      error: null,
    },
  });

  assert.equal(result.snapshot[0]?.rank, null);
  assert.equal(result.popular[0]?.rank, null);
});
