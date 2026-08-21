import assert from "node:assert/strict";
import test from "node:test";

import type {
  BenchmarkMetric,
  BenchmarkModel,
  BenchmarkPriceCheck,
  BenchmarkSourceId,
} from "@tokenbench/benchmarks/contracts";
import {
  LEADERBOARD_DEFINITIONS,
  type LeaderboardEntry,
} from "@tokenbench/benchmarks/leaderboards";
import { createLeaderboardQueryCapabilities } from "@tokenbench/benchmarks/leaderboard-query";
import { blendedCostPerMillion, type WorkloadProfile } from "@tokenbench/benchmarks/value";
import type { LeaderboardKey } from "@tokenbench/routing/leaderboard-routes";

import {
  LEADERBOARD_ROUTE_LIVE_LIMIT,
  leaderboardRouteLiveEndpoint,
  mergeLeaderboardRouteLiveEnvelopes,
  parseLeaderboardRouteLiveEnvelope,
  projectLeaderboardRouteLiveEnvelope,
  type LeaderboardRouteApiEnvelope,
  type LeaderboardRoutePageResult,
} from "./leaderboard-route-live";

const ISO_TIME = "2026-08-21T00:00:00.000Z";

function model(overrides: Partial<BenchmarkModel> = {}): BenchmarkModel {
  return {
    modelKey: "model-a",
    slug: "model-a",
    name: "Model A",
    creator: "Provider A",
    sourceType: "Proprietary",
    reasoningType: null,
    releaseDate: null,
    contextWindowTokens: null,
    evidenceStatus: "supported",
    rankingEligible: true,
    confidenceLower: null,
    confidenceUpper: null,
    benchmarkCount: 1,
    sourceId: "benchlm",
    sourceModelId: "model-a",
    sourceArtifactId: "benchlm-artifact",
    ...overrides,
  };
}

function metric(
  metricKey: string,
  category: string,
  overrides: Partial<BenchmarkMetric> = {},
): BenchmarkMetric {
  return {
    modelKey: "model-a",
    metricKey,
    category,
    value: 82.4,
    rawValue: null,
    rank: 2,
    rankFieldSize: 100,
    lower: null,
    upper: null,
    voteCount: null,
    unit: "score",
    sourceId: "benchlm",
    sourceUpdatedAt: ISO_TIME,
    sourceModelId: "model-a",
    sourceArtifactId: "benchlm-artifact",
    rankingEligible: true,
    methodology: "benchlm_raw_composite",
    observationCount: null,
    sessionCount: null,
    ...overrides,
  };
}

function primaryPrice(overrides: Partial<BenchmarkPriceCheck> = {}): BenchmarkPriceCheck {
  return {
    modelKey: "model-a",
    sourceId: "openrouter",
    providerId: "openrouter",
    inputUsdPerMillion: 1,
    cachedInputUsdPerMillion: 0.1,
    outputUsdPerMillion: 4,
    contextWindowTokens: 128_000,
    verificationStatus: "primary",
    routeId: "openrouter:model-a",
    sourceModelId: "model-a",
    canonicalSlug: "model-a",
    maxInputTokens: 120_000,
    maxOutputTokens: 8_192,
    inputModalities: ["text"],
    outputModalities: ["text"],
    supportedParameters: ["temperature"],
    sourceArtifactId: "openrouter-artifact",
    ...overrides,
  };
}

function source(sourceId: BenchmarkSourceId) {
  return {
    sourceId,
    label: `Published ${sourceId} evidence`,
    url: `https://example.com/${sourceId}`,
    updatedAt: ISO_TIME,
  };
}

function envelope(
  key: LeaderboardKey,
  profile: WorkloadProfile,
  entries: readonly LeaderboardEntry[],
): LeaderboardRouteApiEnvelope<LeaderboardRoutePageResult> {
  const definition = LEADERBOARD_DEFINITIONS[key];
  const ids = new Set<BenchmarkSourceId>();
  for (const entry of entries) {
    ids.add(entry.model.sourceId);
    if (entry.metric !== null) ids.add(entry.metric.sourceId);
    for (const candidate of entry.metrics) ids.add(candidate.sourceId);
    if (entry.primaryPrice !== null) ids.add(entry.primaryPrice.sourceId);
  }
  if (ids.size === 0) {
    if (definition.kind === "value") {
      ids.add("benchlm");
      ids.add("openrouter");
    } else if (definition.kind === "pricing-context") {
      ids.add("openrouter");
    } else if (definition.kind === "lmarena") {
      ids.add("lmarena");
    } else {
      ids.add("benchlm");
    }
  }
  return {
    revision: "benchmark-revision-1",
    publishedAt: ISO_TIME,
    freshness: { status: "fresh", checkedAt: ISO_TIME },
    attribution: [...ids].map(source),
    data: {
      key,
      profile,
      definition,
      entries,
      pagination: {
        limit: LEADERBOARD_ROUTE_LIVE_LIMIT,
        total: entries.length,
        nextCursor: null,
      },
      capabilities: createLeaderboardQueryCapabilities(definition, entries),
    },
  };
}

test("capability routes retain the exact source category, rank, and model access", () => {
  const sourceMetric = metric("benchlm:category:coding", "coding");
  const response = envelope("llm-coding", "balanced", [{
    model: model({ sourceType: "Open Weight" }),
    metric: sourceMetric,
    metrics: [sourceMetric],
    primaryPrice: null,
    blendedCostPerMillion: null,
    contextWindowTokens: null,
    sourceRank: 2,
    onValueFrontier: false,
  }]);
  const parsed = parseLeaderboardRouteLiveEnvelope(response, "llm-coding", "balanced");
  const projected = projectLeaderboardRouteLiveEnvelope(parsed);
  const row = projected.data?.models[0];

  assert.equal(leaderboardRouteLiveEndpoint("llm-coding", "balanced"), "/api/benchmarks/leaderboards/llm-coding?profile=balanced&limit=200");
  assert.equal(projected.status, "available");
  assert.equal(projected.effectiveAt, ISO_TIME);
  assert.equal(projected.provenance[0]?.effectiveAt, ISO_TIME);
  assert.match(projected.provenance[0]?.note ?? "", /fresh published revision/);
  const stale = projectLeaderboardRouteLiveEnvelope(parseLeaderboardRouteLiveEnvelope({
    ...response,
    freshness: {
      status: "stale",
      checkedAt: ISO_TIME,
      message: "Published benchmark data is stale.",
    },
  }, "llm-coding", "balanced"));
  assert.equal(stale.status, "partial");
  assert.equal(stale.reason, "Published benchmark data is stale.");
  assert.equal(row?.rank.availability, "available");
  assert.equal(row?.rank.availability === "available" ? row.rank.value : null, 2);
  assert.equal(row?.model.access.availability, "available");
  assert.equal(row?.model.access.availability === "available" ? row.model.access.value : null, "Open weights");
  assert.equal(row?.model.capability.availability, "available");
  assert.deepEqual(row?.model.capability.availability === "available" ? row.model.capability.value.radar[0] : null, {
    key: "benchlm:category:coding",
    label: "coding",
    percentile: 82.4,
    rank: 2,
    fieldSize: 100,
  });
});

test("value and pricing routes retain selected route economics and frontier facts", () => {
  const overall = metric("benchlm:overall:raw", "overall");
  const valuePrice = primaryPrice();
  const valueResponse = envelope("llm-value", "inputHeavy", [{
    model: model(),
    metric: overall,
    metrics: [overall],
    primaryPrice: valuePrice,
    blendedCostPerMillion: blendedCostPerMillion(1, 4, "inputHeavy"),
    contextWindowTokens: 128_000,
    sourceRank: 2,
    onValueFrontier: true,
  }]);
  const value = projectLeaderboardRouteLiveEnvelope(
    parseLeaderboardRouteLiveEnvelope(valueResponse, "llm-value", "inputHeavy"),
  );
  const valueRow = value.data?.models[0];
  assert.equal(valueRow?.aggregate?.pareto, true);
  assert.equal(valueRow?.model.routePricing.availability, "available");
  assert.equal(
    valueRow?.model.routePricing.availability === "available"
      ? valueRow.model.routePricing.value.blendedUsdPerMillion?.availability
      : null,
    "available",
  );
  assert.equal(
    valueRow?.model.routePricing.availability === "available"
      && valueRow.model.routePricing.value.blendedUsdPerMillion?.availability === "available"
      ? valueRow.model.routePricing.value.blendedUsdPerMillion.value
      : null,
    blendedCostPerMillion(1, 4, "inputHeavy"),
  );

  const pricingPrice = primaryPrice();
  const pricingResponse = envelope("llm-pricing-context", "outputHeavy", [{
    model: model({ sourceId: "openrouter" }),
    metric: null,
    metrics: [],
    primaryPrice: pricingPrice,
    blendedCostPerMillion: blendedCostPerMillion(1, 4, "outputHeavy"),
    contextWindowTokens: 128_000,
    sourceRank: null,
    onValueFrontier: false,
  }]);
  const pricing = projectLeaderboardRouteLiveEnvelope(
    parseLeaderboardRouteLiveEnvelope(pricingResponse, "llm-pricing-context", "outputHeavy"),
  );
  const pricingRow = pricing.data?.models[0];
  assert.equal(pricingRow?.model.capability.availability, "unavailable");
  assert.equal(pricingRow?.model.routePricing.availability, "available");
  assert.equal(
    pricingRow?.model.routePricing.availability === "available"
      ? pricingRow.model.routePricing.value.contextWindowTokens.availability
      : null,
    "available",
  );
  assert.equal(
    pricingRow?.model.routePricing.availability === "available"
      && pricingRow.model.routePricing.value.contextWindowTokens.availability === "available"
      ? pricingRow.model.routePricing.value.contextWindowTokens.value
      : null,
    128_000,
  );
});

test("published null rank and route facts remain unavailable rather than becoming zero", () => {
  const sourceMetric = metric("benchlm:category:reasoning", "reasoning", {
    rank: null,
    rankFieldSize: null,
  });
  const response = envelope("llm-reasoning", "balanced", [{
    model: model(),
    metric: sourceMetric,
    metrics: [sourceMetric],
    primaryPrice: null,
    blendedCostPerMillion: null,
    contextWindowTokens: null,
    sourceRank: null,
    onValueFrontier: false,
  }]);
  const projected = projectLeaderboardRouteLiveEnvelope(
    parseLeaderboardRouteLiveEnvelope(response, "llm-reasoning", "balanced"),
  );
  const row = projected.data?.models[0];

  assert.equal(row?.rank.availability, "unavailable");
  assert.equal(row?.model.routePricing.availability, "unavailable");
  assert.equal(row?.model.capability.availability, "available");
  assert.equal(
    row?.model.capability.availability === "available"
      ? row.model.capability.value.radar[0]?.rank
      : undefined,
    null,
  );
  assert.equal(
    row?.model.capability.availability === "available"
      ? row.model.capability.value.radar[0]?.fieldSize
      : undefined,
    null,
  );
});

test("validated cursor pages merge into one complete route result", () => {
  const sourceMetric = metric("benchlm:category:coding", "coding");
  const response = envelope("llm-coding", "balanced", [{
    model: model(),
    metric: sourceMetric,
    metrics: [sourceMetric],
    primaryPrice: null,
    blendedCostPerMillion: null,
    contextWindowTokens: null,
    sourceRank: 2,
    onValueFrontier: false,
  }]);
  const firstPage = {
    ...response,
    data: {
      ...response.data,
      pagination: {
        ...response.data.pagination,
        total: 2,
        nextCursor: "opaque-cursor",
      },
    },
  };
  const secondMetric = metric("benchlm:category:coding", "coding", { modelKey: "model-b", sourceModelId: "model-b", rank: 3 });
  const secondPage = envelope("llm-coding", "balanced", [{
    model: model({ modelKey: "model-b", slug: "model-b", name: "Model B", sourceModelId: "model-b" }),
    metric: secondMetric,
    metrics: [secondMetric],
    primaryPrice: null,
    blendedCostPerMillion: null,
    contextWindowTokens: null,
    sourceRank: 3,
    onValueFrontier: false,
  }]);
  const merged = mergeLeaderboardRouteLiveEnvelopes([
    parseLeaderboardRouteLiveEnvelope(firstPage, "llm-coding", "balanced"),
    parseLeaderboardRouteLiveEnvelope({
      ...secondPage,
      attribution: [{ ...source("benchlm"), url: "https://example.com/benchlm?page=2" }],
      data: { ...secondPage.data, pagination: { ...secondPage.data.pagination, total: 2 } },
    }, "llm-coding", "balanced"),
  ]);
  assert.equal(leaderboardRouteLiveEndpoint("llm-coding", "balanced", "opaque-cursor"), "/api/benchmarks/leaderboards/llm-coding?profile=balanced&limit=200&cursor=opaque-cursor");
  assert.equal(merged.data.entries.length, 2);
  assert.equal(merged.data.pagination.nextCursor, null);
  assert.equal(merged.attribution.length, 2);
});
