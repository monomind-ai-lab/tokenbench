import assert from "node:assert/strict";
import test from "node:test";

import type {
  EvidenceValue,
  PreviewModel,
  RankingData,
  UiDataContractV1,
} from "@tokenbench/frontend/preview-data/contracts";
import { buildWeightedRanking } from "@tokenbench/frontend/preview-workbench/weighted-ranking";
import { DEFAULT_WEIGHTED_RANKING_STATE } from "@tokenbench/frontend/preview-workbench/weighted-ranking-state";

import { makeItYoursCsvRows, projectMakeItYoursModels } from "./make-it-yours-projector";

function available<T>(value: T): EvidenceValue<T> {
  return {
    availability: "available",
    provenance: { id: "test", kind: "accepted_pipeline", label: "Test evidence", effectiveAt: null, note: "test" },
    value,
  };
}

function model(overrides: Partial<PreviewModel> = {}): PreviewModel {
  return {
    id: "verified-model",
    identity: available({ slug: "verified-model", name: "Verified model", provider: "Example provider" }),
    access: available("Proprietary"),
    benchmark: available({ releaseOn: "2026-08-20", subtasks: [] }),
    capability: available({ compositeScore: 99, radar: [
      { key: "agentic", label: "Agentic", percentile: 81, rank: 1, fieldSize: 2 },
      { key: "coding", label: "Coding", percentile: 82, rank: 1, fieldSize: 2 },
      { key: "reasoning", label: "Reasoning", percentile: 83, rank: 1, fieldSize: 2 },
      { key: "math", label: "Math", percentile: 84, rank: 1, fieldSize: 2 },
      { key: "multimodal", label: "Multimodal", percentile: 85, rank: 1, fieldSize: 2 },
      { key: "throughput", label: "Throughput", percentile: 86, rank: 1, fieldSize: 2 },
    ] }),
    routePricing: available({
      route: "direct",
      inputUsdPerMillion: 1,
      outputUsdPerMillion: 3,
      blendedUsdPerMillion: available(1.5),
      contextWindowTokens: available(128000),
      maxOutputTokens: available(8192),
      inputModalities: ["text"],
      outputModalities: ["text"],
      cache: available({ readUsdPerMillion: available(0.1), writeUsdPerMillion: available(0.2) }),
    }),
    taskEconomics: available({ costUsdPerSuccessfulTask: 0.1, workload: "test" }),
    runtime: available({ ttftP50Seconds: 0.4, outputTokensPerSecond: 80, conditions: "test" }),
    lifecycle: available({ status: "Current", sunsetOn: available("2027-01-01") }),
    ...overrides,
  };
}

function envelope(models: readonly PreviewModel[]): UiDataContractV1<RankingData> {
  return {
    contractVersion: "ui-data-contract/v1",
    status: "available",
    fetchedAt: "2026-08-20T00:00:00.000Z",
    effectiveAt: null,
    provenance: [],
    data: { models: models.map((model) => ({ model, rank: available(1) })) },
  };
}

test("the make-it-yours projector requires all exact six axes and does not use a composite fallback", () => {
  const complete = projectMakeItYoursModels(envelope([model()]));
  assert.equal(complete.models.length, 1);
  assert.deepEqual(complete.models[0]?.scores, {
    agentic: 81,
    coding: 82,
    reasoning: 83,
    math: 84,
    multimodal: 85,
    throughput: 86,
  });

  const incompleteCapability = available({
    compositeScore: 99,
    radar: [{ key: "agentic", label: "Agentic", percentile: 81, rank: 1, fieldSize: 2 }],
  });
  const incomplete = projectMakeItYoursModels(envelope([model({ capability: incompleteCapability })]));
  assert.deepEqual(incomplete, { models: [], unavailableCount: 1 });
});

test("the projected raw SLA and published blended cost flow into ranked CSV rows", () => {
  const projection = projectMakeItYoursModels(envelope([model()]));
  const ranking = buildWeightedRanking({
    models: projection.models,
    weights: DEFAULT_WEIGHTED_RANKING_STATE.weights,
    filters: DEFAULT_WEIGHTED_RANKING_STATE,
  });
  assert.equal(ranking.valid, true);

  assert.deepEqual(makeItYoursCsvRows(ranking.rows), [{
    "Weighted rank": 1,
    Model: "Verified model",
    Provider: "Example provider",
    "Weighted score": 83.2,
    "Blended USD / 1M": 1.5,
    "TTFT seconds": 0.4,
    "Throughput tok/s": 80,
    "SLA result": "Pass",
    "Weighted frontier": "Yes",
  }]);
});
