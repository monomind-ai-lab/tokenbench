import assert from "node:assert/strict";
import test from "node:test";

import type {
  EvidenceValue,
  PreviewModel,
  RankingEntry,
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

function unavailable<T>(reason: string): EvidenceValue<T> {
  return { availability: "unavailable", reason };
}

function model(overrides: Partial<PreviewModel> = {}): PreviewModel {
  return {
    id: "verified-model",
    identity: available({ slug: "verified-model", name: "Verified model", provider: "Example provider" }),
    access: available("Proprietary"),
    benchmark: available({ releaseOn: "2026-08-20", subtasks: [] }),
    capability: available({ compositeScore: 99, radar: [
      { key: "agentic-coding", label: "Agentic coding", percentile: 81, rank: 1, fieldSize: 2 },
      { key: "coding", label: "Coding", percentile: 82, rank: 1, fieldSize: 2 },
      { key: "reasoning", label: "Reasoning", percentile: 83, rank: 1, fieldSize: 2 },
      { key: "mathematics", label: "Mathematics", percentile: 84, rank: 1, fieldSize: 2 },
      { key: "data-analysis", label: "Data analysis", percentile: 85, rank: 1, fieldSize: 2 },
      { key: "language", label: "Language", percentile: 86, rank: 1, fieldSize: 2 },
      { key: "if", label: "IF", percentile: 87, rank: 1, fieldSize: 2 },
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

function rankingEntry(model: PreviewModel, evaluationCost = 1.5): RankingEntry {
  return {
    model,
    rank: available(1),
    aggregate: {
      costPerSuccessfulEvaluationUsd: available(evaluationCost),
      meanOutputTokens: available(800),
      pareto: true,
    },
  };
}

function envelope(entries: readonly RankingEntry[]): UiDataContractV1<RankingData> {
  return {
    contractVersion: "ui-data-contract/v1",
    status: "available",
    fetchedAt: "2026-08-20T00:00:00.000Z",
    effectiveAt: null,
    provenance: [],
    data: { models: entries },
  };
}

test("the make-it-yours projector requires all seven published categories and does not use a composite fallback", () => {
  const complete = projectMakeItYoursModels(envelope([rankingEntry(model())]));
  assert.equal(complete.models.length, 1);
  assert.deepEqual(complete.models[0]?.scores, {
    reasoning: 83,
    coding: 82,
    "agentic-coding": 81,
    mathematics: 84,
    "data-analysis": 85,
    language: 86,
    "instruction-following": 87,
  });

  const incompleteCapability = available({
    compositeScore: 99,
    radar: [{ key: "reasoning", label: "Reasoning", percentile: 81, rank: 1, fieldSize: 2 }],
  });
  const incomplete = projectMakeItYoursModels(envelope([rankingEntry(model({ capability: incompleteCapability }))]));
  assert.deepEqual(incomplete, { models: [], unavailableCount: 1 });
});

test("the projector retains published zero prices while incomplete candidates remain excluded", () => {
  const zeroPriced = model({
    routePricing: available({
      route: "direct",
      inputUsdPerMillion: 0,
      outputUsdPerMillion: 0,
      blendedUsdPerMillion: available(0),
      contextWindowTokens: available(128000),
      maxOutputTokens: available(8192),
      inputModalities: ["text"],
      outputModalities: ["text"],
      cache: available({ readUsdPerMillion: available(0), writeUsdPerMillion: available(0) }),
    }),
  });
  const incomplete = model({
    capability: available({
      compositeScore: 99,
      radar: [{ key: "reasoning", label: "Reasoning", percentile: 81, rank: 1, fieldSize: 2 }],
    }),
  });

  const projection = projectMakeItYoursModels(envelope([
    rankingEntry(zeroPriced, 0),
    rankingEntry(incomplete),
  ]));

  assert.equal(projection.models.length, 1);
  assert.equal(projection.models[0]?.cost, 0);
  assert.equal(projection.models[0]?.inputUsdPerMillion, 0);
  assert.equal(projection.models[0]?.outputUsdPerMillion, 0);
  assert.equal(projection.unavailableCount, 1);
});

test("published evaluation cost remains rankable while missing runtime stays explicitly unavailable", () => {
  const projection = projectMakeItYoursModels(envelope([
    rankingEntry(model({ runtime: unavailable("No reviewed runtime observation was supplied.") }), 0.014),
  ]));
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
    "Weighted score": 83.3,
      "Evaluation cost / success USD": 0.01,
    "TTFT seconds": "-",
    "Throughput tok/s": "-",
    "SLA result": "Outside threshold",
    "Weighted frontier": "Yes",
  }]);
});
