import assert from "node:assert/strict";
import test from "node:test";

import {
  PRICE_PERFORMANCE_SCORE_LANES,
  type PricePerformanceEnvelope,
  type PricePerformancePoint,
} from "@tokenbench/benchmarks/price-performance-contracts";
import { DEFAULT_PRICE_PERFORMANCE_STATE } from "@tokenbench/frontend/price-performance-state";

import {
  decodeLlmPricePerformanceState,
  llmPricePerformancePriceDomain,
  projectLlmPricePerformance,
} from "./llm-price-performance-projector";

function point(
  modelKey: string,
  outputUsdPerMillion: number,
  overrides: Partial<PricePerformancePoint> = {},
): PricePerformancePoint {
  return {
    creator: "Alpha",
    displayName: modelKey,
    evidenceStatus: "supported",
    familyId: null,
    modelKey,
    route: {
      cachedInputUsdPerMillion: null,
      canonicalSlug: modelKey,
      contextWindowTokens: 128_000,
      inputModalities: ["text"],
      inputUsdPerMillion: outputUsdPerMillion / 2,
      maxInputTokens: 128_000,
      maxOutputTokens: 8_192,
      outputModalities: ["text"],
      outputUsdPerMillion,
      providerId: "alpha",
      routeId: `${modelKey}-direct`,
      sourceArtifactId: "artifact-1",
      sourceId: "openrouter",
      sourceModelId: modelKey,
      supportedParameters: ["temperature"],
      verificationStatus: "primary",
    },
    scores: Object.fromEntries(
      PRICE_PERFORMANCE_SCORE_LANES.map((lane) => [lane, lane === "coding" ? 91 : 84]),
    ) as PricePerformancePoint["scores"],
    slug: modelKey,
    sourceType: "Proprietary",
    status: "current",
    ...overrides,
  };
}

const envelope: PricePerformanceEnvelope = {
  attribution: [
    {
      label: "Catalog and pricing data from OpenRouter",
      sourceId: "openrouter",
      updatedAt: "2026-08-20T00:00:00.000Z",
      url: "https://openrouter.ai/api/v1/models",
    },
  ],
  data: {
    capabilities: {
      costBases: ["output", "blended-3-1"],
      creators: ["Alpha"],
      evidenceStatuses: ["supported", "estimated", "source_only"],
      scoreLanes: PRICE_PERFORMANCE_SCORE_LANES,
      sourceTypes: ["Proprietary", "Open Weight", "Unknown"],
      statuses: ["current", "archived"],
    },
    costDefinitions: {
      blended3To1: "(3 × input USD/M + output USD/M) / 4",
      output: "Published output USD per one million tokens",
    },
    points: [point("zero-price", 0), point("paid-price", 2)],
    scoreMethodology: Object.fromEntries(
      PRICE_PERFORMANCE_SCORE_LANES.map((lane) => [lane, `${lane} source score`]),
    ) as PricePerformanceEnvelope["data"]["scoreMethodology"],
  },
  freshness: { checkedAt: "2026-08-20T00:00:00.000Z", status: "fresh" },
  publishedAt: "2026-08-20T00:00:00.000Z",
  revision: "price-performance-test-revision",
};

test("projector retains a published zero cost while keeping score per dollar unavailable", () => {
  const projection = projectLlmPricePerformance(
    envelope,
    DEFAULT_PRICE_PERFORMANCE_STATE,
  );
  const zeroPrice = projection.points.find((value) => value.modelKey === "zero-price");

  assert.equal(zeroPrice?.selectedCost, 0);
  assert.equal(zeroPrice?.scorePerDollar, null);
  assert.equal(projection.points.length, 2);
});

test("URL-backed lane, creator, and exact zero price bounds project only matching rows", () => {
  const state = decodeLlmPricePerformanceState(
    envelope,
    "lane=coding&creator=Alpha&minPrice=0&maxPrice=0",
  );
  const projection = projectLlmPricePerformance(envelope, state);

  assert.equal(state.lane, "coding");
  assert.equal(state.creator, "Alpha");
  assert.deepEqual(state.priceBand, [0, 0]);
  assert.deepEqual(projection.points.map((value) => value.modelKey), ["zero-price"]);
});

test("price-domain slots keep zero as a valid range endpoint", () => {
  assert.deepEqual(
    llmPricePerformancePriceDomain(envelope.data.points, DEFAULT_PRICE_PERFORMANCE_STATE),
    [0, 2],
  );
});
