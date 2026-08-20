import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCEPTED_SUBSCRIPTION_QUERY,
  type CompareData,
  type LifecycleData,
  type ModelDirectoryData,
  type PreviewDataAdapter,
  type PreviewModel,
  type PreviewModelProfileData,
  type RankingData,
  type SubscriptionData,
  type UiDataContractV1,
} from "@tokenbench/frontend/preview-data/contracts";

import {
  HOME_EVIDENCE_COMPARISON_QUERY,
  HOME_EVIDENCE_MODELS_QUERY,
  HOME_RANKINGS_QUERY,
  loadHomeDataFromAdapter,
} from "./home-data";
import { createEvidencePreviewDataComposition } from "@tokenbench/frontend/preview-data/composition-evidence";

function envelope<T>(data: T | null): UiDataContractV1<T> {
  return {
    contractVersion: "ui-data-contract/v1",
    status: data === null ? "unavailable" : "available",
    ...(data === null ? { reason: "No accepted value." } : {}),
    fetchedAt: "2026-08-21T00:00:00.000Z",
    effectiveAt: "2026-08-21T00:00:00.000Z",
    data,
    provenance: [],
  };
}

function model(id: string): PreviewModel {
  return { id } as PreviewModel;
}

function adapter(overrides: Partial<PreviewDataAdapter> = {}): PreviewDataAdapter {
  return {
    models: async () => envelope<ModelDirectoryData>(null),
    profile: async () => envelope<PreviewModelProfileData>(null),
    lifecycle: async () => envelope<LifecycleData>(null),
    rankings: async () => envelope<RankingData>(null),
    comparison: async () => envelope<CompareData>(null),
    subscription: async () => envelope<SubscriptionData>(null),
    ...overrides,
  };
}

test("evidence mode sends only the retained accepted Home requests", async () => {
  let modelsQuery: unknown;
  let rankingsQuery: unknown;
  let comparisonQuery: unknown;
  let subscriptionQuery: unknown;
  const snapshot = await loadHomeDataFromAdapter("evidence", adapter({
    models: async (query) => {
      modelsQuery = query;
      return envelope<ModelDirectoryData>({ models: [model("alpha"), model("beta"), model("gamma")] });
    },
    rankings: async (query) => {
      rankingsQuery = query;
      return envelope<RankingData>({ models: [] });
    },
    comparison: async (query) => {
      comparisonQuery = query;
      return envelope<CompareData>({ models: [], unavailableModelIds: [] });
    },
    subscription: async (query) => {
      subscriptionQuery = query;
      return envelope<SubscriptionData>({
        plans: [], models: [],
        selectedModelTaskEconomics: { availability: "unavailable", reason: "No task record." },
        calculation: { availability: "unavailable", reason: "No calculation." },
      });
    },
  }));

  assert.equal(snapshot.mode, "evidence");
  assert.deepEqual(modelsQuery, HOME_EVIDENCE_MODELS_QUERY);
  assert.deepEqual(rankingsQuery, HOME_RANKINGS_QUERY);
  assert.deepEqual(comparisonQuery, HOME_EVIDENCE_COMPARISON_QUERY);
  assert.deepEqual(subscriptionQuery, ACCEPTED_SUBSCRIPTION_QUERY);
});

test("the retained evidence adapter accepts every Home evidence request", async () => {
  const snapshot = await loadHomeDataFromAdapter("evidence", createEvidencePreviewDataComposition());

  assert.equal(snapshot.models.envelope?.status, "available");
  assert.equal(snapshot.rankings.envelope?.status, "available");
  assert.equal(snapshot.comparison.envelope?.status, "available");
  assert.equal(snapshot.subscription.envelope?.status, "available");
});

test("production comparison IDs come from the HTTP directory response and never use retained evidence IDs", async () => {
  let comparisonQuery: unknown;
  let subscriptionQuery: unknown;
  const snapshot = await loadHomeDataFromAdapter("production", adapter({
    models: async () => envelope<ModelDirectoryData>({ models: [model("live-one"), model("live-two"), model("live-three")] }),
    rankings: async () => envelope<RankingData>({ models: [] }),
    comparison: async (query) => {
      comparisonQuery = query;
      return envelope<CompareData>({ models: [], unavailableModelIds: [] });
    },
    subscription: async (query) => {
      subscriptionQuery = query;
      return envelope<SubscriptionData>({
        plans: [], models: [],
        selectedModelTaskEconomics: { availability: "unavailable", reason: "No task record." },
        calculation: { availability: "unavailable", reason: "No calculation." },
      });
    },
  }));

  assert.equal(snapshot.mode, "production");
  assert.deepEqual(comparisonQuery, { modelIds: ["live-one", "live-two", "live-three"] });
  assert.deepEqual(subscriptionQuery, { operation: "catalog" });
});

test("production leaves comparison unavailable when fewer than two HTTP model records are accepted", async () => {
  let comparisonCalls = 0;
  const snapshot = await loadHomeDataFromAdapter("production", adapter({
    models: async () => envelope<ModelDirectoryData>({ models: [model("only-live-record")] }),
    rankings: async () => envelope<RankingData>({ models: [] }),
    comparison: async () => {
      comparisonCalls += 1;
      return envelope<CompareData>({ models: [], unavailableModelIds: [] });
    },
    subscription: async () => envelope<SubscriptionData>({
      plans: [], models: [],
      selectedModelTaskEconomics: { availability: "unavailable", reason: "No task record." },
      calculation: { availability: "unavailable", reason: "No calculation." },
    }),
  }));

  assert.equal(comparisonCalls, 0);
  assert.equal(snapshot.comparison.envelope, null);
  assert.match(snapshot.comparison.error ?? "", /At least two accepted model records/);
});
