import assert from "node:assert/strict";
import test from "node:test";

import { parseModelDirectoryEnvelope } from "@tokenbench/frontend/model-directory-contracts";
import {
  popularModelsMetricValue,
  POPULAR_MODELS_CATEGORY_SLOTS,
  type PopularModelV1,
  type PopularModelsV1ViewModel,
} from "@tokenbench/frontend/popular-models-v1";

import {
  loadPopularModelsLiveDirectory,
  projectPopularModelsLive,
  projectPopularModelsLiveWithStrict,
  resolvePopularModelsDataPath,
} from "./popular-models-live";

const AT = "2026-08-21T12:00:00.000Z";

function rawEntry(
  id: string,
  options: {
    readonly weeklyRank: number | null;
    readonly overallScore: number | null;
    readonly category?: { readonly key: string; readonly label: string; readonly score: number } | null;
    readonly sourceType?: "Proprietary" | "Open Weight" | "Unknown";
    readonly price?: boolean;
  },
) {
  return {
    modelKey: `benchlm:test:${id}`,
    canonicalSlug: id,
    displayName: `Model ${id}`,
    creator: "Test provider",
    sourceType: options.sourceType ?? "Proprietary",
    reasoningType: null,
    familyId: null,
    variantId: null,
    firstSeenRevision: "directory-r1",
    firstSeenAt: AT,
    lastSeenRevision: "directory-r1",
    lastSeenAt: AT,
    latestProfileRevision: "directory-r1",
    status: "current",
    sourceId: "benchlm",
    sourceModelId: id,
    updatedAt: AT,
    weeklyRank: options.weeklyRank,
    overallScore: options.overallScore,
    overallRank: null,
    strongestCategory:
      options.category === undefined
        ? null
        : options.category === null
          ? null
          : {
              key: options.category.key,
              metricKey: `benchlm:category:${options.category.key}`,
              label: options.category.label,
              score: options.category.score,
              rawScore: null,
              rank: null,
              fieldSize: null,
              percentile: null,
              evidenceStatus: "supported",
              benchmarkCount: 1,
              rankingEligible: true,
              unit: "score",
              sourceId: "benchlm",
            },
    representativePrice:
      options.price === false
        ? null
        : {
            sourceId: "openrouter",
            providerId: "test-provider",
            routeId: `openrouter:${id}`,
            sourceModelId: id,
            canonicalSlug: id,
            inputUsdPerMillion: 0,
            cachedInputUsdPerMillion: null,
            outputUsdPerMillion: 0,
            contextWindowTokens: null,
            maxInputTokens: null,
            maxOutputTokens: null,
            inputModalities: null,
            outputModalities: null,
            supportedParameters: null,
            verificationStatus: "primary",
            sourceArtifactId: "test-pricing",
            sourceUrl: "https://example.test/pricing",
            observedAt: AT,
          },
    evidenceStatus: "supported",
    profileRevision: "directory-r1",
    profileFallback: "none",
    profilePublishedAt: AT,
    profileCheckedAt: AT,
  };
}

function rawEnvelope() {
  return {
    revision: "directory-r1",
    publishedAt: AT,
    freshness: { status: "fresh", checkedAt: AT },
    attribution: [
      {
        sourceId: "benchlm",
        label: "BenchLM weekly directory",
        url: "https://example.test/weekly",
        updatedAt: AT,
      },
    ],
    data: {
      week: {
        weekStart: "2026-08-17T00:00:00.000Z",
        benchmarkRevision: "directory-r1",
        sourceSnapshotId: "weekly-test",
        methodologyVersion: "weekly-v1",
        generatedAt: AT,
      },
      // Deliberately not source-rank ordered: projection must use weeklyRank,
      // not derive a position from this array index.
      models: [
        rawEntry("zero-score", {
          weeklyRank: 37,
          overallScore: 0,
          category: { key: "coding", label: "Coding", score: 0 },
        }),
        rawEntry("first", {
          weeklyRank: 4,
          overallScore: 91.5,
          category: { key: "math", label: "Mathematics", score: 88.25 },
          sourceType: "Open Weight",
        }),
        rawEntry("unranked", {
          weeklyRank: null,
          overallScore: null,
          category: { key: "vision", label: "Vision", score: 44 },
          price: false,
          sourceType: "Unknown",
        }),
      ],
      nextCursor: null,
    },
  };
}

function envelope() {
  const parsed = parseModelDirectoryEnvelope(rawEnvelope());
  assert.ok(parsed);
  return parsed;
}

function measurement(value: number | null) {
  return {
    value,
    unavailableReason: value === null ? "Strict source did not publish this measurement." : null,
  };
}

function strictModel(id: string, slug: string): PopularModelV1 {
  return {
    id,
    slug,
    name: `Strict ${id}`,
    provider: "Strict provider",
    identityUnavailableReason: null,
    access: "Proprietary",
    accessUnavailableReason: null,
    rank: 99,
    rankUnavailableReason: null,
    overallScore: 97.25,
    capabilityUnavailableReason: null,
    axes: [
      {
        key: "reasoning",
        label: "Strict reasoning",
        percentile: 95.5,
        rank: 2,
        fieldSize: 100,
      },
    ],
    subtasks: [{ id: "reasoning-a", label: "Strict reasoning task" }],
    benchmarkUnavailableReason: null,
    aggregate: {
      costPerSuccessfulEvaluationUsd: measurement(0.015),
      meanOutputTokens: measurement(840),
      pareto: true,
    },
    taskEconomics: [
      {
        taskId: "reasoning-a",
        label: "Strict reasoning task",
        categoryId: "reasoning",
        score: measurement(94),
        questionCount: measurement(25),
        evaluationCostUsd: measurement(0.5),
        inputPriceUsdPerMillion: measurement(2),
        outputPriceUsdPerMillion: measurement(8),
        equivalentSuccesses: measurement(20),
        costPerSuccessfulEvaluationUsd: measurement(0.025),
        meanInputTokens: measurement(1_200),
        meanOutputTokens: measurement(840),
      },
    ],
    taskEconomicsUnavailableReason: null,
    runtimeUnavailableReason: null,
    routePricing: {
      availability: "available",
      route: `${id}/strict-route`,
      inputUsdPerMillion: 2,
      outputUsdPerMillion: 8,
      blendedUsdPerMillion: 5,
      contextWindowTokens: 256_000,
      contextWindowUnavailableReason: null,
      maxOutputTokens: 32_000,
      maxOutputUnavailableReason: null,
      inputModalities: ["text"],
      outputModalities: ["text"],
    },
  };
}

function strictView(
  models: readonly PopularModelV1[],
): PopularModelsV1ViewModel {
  return {
    sourceStatus: "available",
    unavailableReason: null,
    fetchedAt: AT,
    effectiveAt: AT,
    provenance: [],
    release: {
      releaseId: "strict-release",
      releaseOn: "2026-08-21",
      licenseId: "strict-license",
      provenance: [],
    },
    taxonomy: [
      {
        categoryId: "reasoning",
        label: "Strict reasoning",
        tasks: [{ taskId: "reasoning-a", label: "Strict reasoning task" }],
      },
    ],
    total: 100,
    totalUnavailableReason: null,
    pagination: { availability: "available", nextCursor: "strict-next" },
    categories: POPULAR_MODELS_CATEGORY_SLOTS,
    models,
  };
}

test("projects source weekly ranks rather than using array indexes", () => {
  const view = projectPopularModelsLive(envelope());

  assert.deepEqual(
    view.models.map((model) => [model.id, model.rank]),
    [
      ["first", 4],
      ["zero-score", 37],
      ["unranked", null],
    ],
  );
  assert.equal(view.models[0]?.rank, 4);
  assert.notEqual(view.models[0]?.rank, 1);
  assert.deepEqual(view.categories, POPULAR_MODELS_CATEGORY_SLOTS);
  assert.equal(
    popularModelsMetricValue(view.models[0]!, "mathematics"),
    88.25,
  );
});

test("keeps a published zero distinct from an unavailable live value", () => {
  const view = projectPopularModelsLive(envelope());
  const zero = view.models.find((model) => model.id === "zero-score");
  const missing = view.models.find((model) => model.id === "unranked");

  assert.equal(zero?.overallScore, 0);
  assert.equal(zero?.axes[0]?.percentile, 0);
  assert.equal(zero?.routePricing.availability, "available");
  if (zero?.routePricing.availability === "available") {
    assert.equal(zero.routePricing.inputUsdPerMillion, 0);
    assert.equal(zero.routePricing.outputUsdPerMillion, 0);
    assert.equal(zero.routePricing.blendedUsdPerMillion, null);
  }
  assert.equal(missing?.overallScore, null);
  // Vision has a source score, but is not one of the immutable UI slot aliases.
  assert.deepEqual(missing?.axes, []);
  assert.equal(missing?.routePricing.availability, "unavailable");
});

test("overrides strict benchmark rank while retaining strict capability and economics", () => {
  // The strict ID differs, so this confirms an exact canonical-slug join.
  const strict = strictView([strictModel("strict-first", "first")]);
  const view = projectPopularModelsLiveWithStrict(envelope(), strict);
  const first = view.models.find((model) => model.slug === "first");

  assert.equal(first?.id, "first");
  assert.equal(first?.name, "Model first");
  assert.equal(first?.provider, "Test provider");
  assert.equal(first?.access, "Open weights");
  assert.equal(first?.rank, 4);
  assert.notEqual(first?.rank, 99);
  assert.deepEqual(first?.axes, strict.models[0]?.axes);
  assert.equal(first?.overallScore, 97.25);
  assert.deepEqual(first?.taskEconomics, strict.models[0]?.taskEconomics);
  assert.equal(first?.aggregate?.costPerSuccessfulEvaluationUsd.value, 0.015);
  assert.equal(first?.runtimeUnavailableReason, null);
  assert.equal(first?.routePricing.availability, "available");
  if (first?.routePricing.availability === "available")
    assert.equal(first.routePricing.route, "strict-first/strict-route");
  assert.equal(view.release?.releaseId, "strict-release");
  assert.deepEqual(view.taxonomy, strict.taxonomy);
  assert.deepEqual(view.pagination, { availability: "available", nextCursor: "strict-next" });
});

test("does not attach a strict row when neither its canonical slug nor model id matches", () => {
  const strict = strictView([strictModel("strict-mismatch", "other-model")]);
  const view = projectPopularModelsLiveWithStrict(envelope(), strict);
  const first = view.models.find((model) => model.slug === "first");

  assert.equal(view.models.some((model) => model.id === "strict-mismatch"), false);
  assert.equal(first?.rank, 4);
  assert.equal(first?.overallScore, 91.5);
  assert.deepEqual(first?.axes.map((axis) => axis.key), ["math"]);
  assert.equal(first?.aggregate, null);
  assert.equal(first?.taskEconomics.length, 0);
  assert.equal(view.sourceStatus, "partial");
});

test("falls back to the partial weekly view only when strict data is unavailable", () => {
  const strict = strictView([strictModel("strict-first", "first")]);
  const withoutStrict = projectPopularModelsLiveWithStrict(envelope(), null);
  const withoutWeekly = projectPopularModelsLiveWithStrict(
    null,
    strict,
    "The weekly popularity source is unavailable.",
  );

  assert.equal(withoutStrict.sourceStatus, "partial");
  assert.equal(withoutStrict.models.find((model) => model.slug === "first")?.rank, 4);
  assert.equal(withoutStrict.models.find((model) => model.slug === "first")?.overallScore, 91.5);
  assert.equal(withoutWeekly.sourceStatus, "unavailable");
  assert.deepEqual(withoutWeekly.models, []);
  assert.equal(
    withoutWeekly.unavailableReason,
    "The weekly popularity source is unavailable.",
  );
});

test("uses the legacy endpoint for the live data path and validates its envelope", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const fetchImpl: typeof fetch = async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify(rawEnvelope()), { status: 200 });
  };

  const loaded = await loadPopularModelsLiveDirectory(
    "https://ui.example.test/",
    fetchImpl,
  );

  assert.equal(
    requestUrl,
    "https://ui.example.test/api/benchmarks/models?limit=100",
  );
  assert.equal(new Headers(requestInit?.headers).get("accept"), "application/json");
  assert.equal(requestInit?.cache, "no-store");
  assert.equal(loaded.data.models[0]?.weeklyRank, 37);
  assert.equal(resolvePopularModelsDataPath("http", "development"), "live");
  assert.equal(resolvePopularModelsDataPath(undefined, "production"), "live");
  assert.equal(resolvePopularModelsDataPath("evidence", "development"), "evidence");
  assert.equal(resolvePopularModelsDataPath("evidence", "production"), "unconfigured");
});
