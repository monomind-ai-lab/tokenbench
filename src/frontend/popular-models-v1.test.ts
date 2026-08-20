import { describe, expect, it } from "vitest";

import {
  filterPopularModels,
  normalizePopularModelsComparisonIds,
  POPULAR_MODELS_CATEGORY_CONTROL_SLOTS,
  popularModelsCategoryWinnerIds,
  popularModelsFieldUnavailableLabel,
  popularModelsLeaderboardColumns,
  popularModelsMetricValue,
  projectPopularModelsV1,
  sortPopularModels,
} from "./popular-models-v1";
import type {
  EvidenceValue,
  PreviewModel,
  Provenance,
  RankingData,
  RoutePricing,
  UiDataContractV1,
} from "./preview-data/contracts";

const provenance: Provenance = {
  id: "source-release",
  label: "Verified source release",
  kind: "accepted_pipeline",
  effectiveAt: "2026-08-19T00:00:00.000Z",
  note: "Test-only source receipt.",
};

function available<T>(value: T): EvidenceValue<T> {
  return { availability: "available", value, provenance };
}

function unavailable<T>(reason: string): EvidenceValue<T> {
  return { availability: "unavailable", reason };
}

function model(
  id: string,
  options: {
    readonly capability?: PreviewModel["capability"];
    readonly identity?: PreviewModel["identity"];
    readonly pricing?: EvidenceValue<RoutePricing>;
  } = {},
): PreviewModel {
  return {
    id,
    identity:
      options.identity ??
      available({ slug: id, name: `Model ${id}`, provider: "Acme" }),
    access: available("Proprietary"),
    benchmark: available({
      releaseOn: "2026-08-19",
      subtasks: [{ id: "task-a", label: "Published task A" }],
    }),
    capability:
      options.capability ??
      available({
        compositeScore: 90,
        radar: [
          {
            key: "reasoning",
            label: "Source reasoning",
            percentile: 91,
            rank: 2,
            fieldSize: 40,
          },
        ],
      }),
    routePricing:
      options.pricing ?? unavailable("No verified selected route price"),
    taskEconomics: unavailable("No verified task economics"),
    runtime: unavailable("No verified runtime evidence"),
    lifecycle: unavailable("No verified lifecycle evidence"),
  };
}

function envelope(
  models: RankingData["models"],
  status: UiDataContractV1<RankingData>["status"] = "available",
  details: Omit<RankingData, "models"> = {},
): UiDataContractV1<RankingData> {
  return {
    contractVersion: "ui-data-contract/v1",
    status,
    fetchedAt: "2026-08-19T00:00:00.000Z",
    effectiveAt: "2026-08-19T00:00:00.000Z",
    data: { models, ...details },
    provenance: [provenance],
  };
}

describe("Popular Models v1 projection", () => {
  it("keeps every source-published category available for an Overall leaderboard, including taxonomy categories without a radar value", () => {
    const alpha = model("alpha", {
      capability: available({
        compositeScore: 92,
        radar: [
          {
            key: "reasoning",
            label: "Source reasoning",
            percentile: 96,
            rank: 1,
            fieldSize: 40,
          },
        ],
      }),
    });

    const view = projectPopularModelsV1(
      envelope([{ model: alpha, rank: available(1) }], "available", {
        taxonomy: [
          {
            categoryId: "coding",
            label: "Published coding",
            tasks: [{ taskId: "coding-a", label: "Published coding task" }],
          },
        ],
      }),
    );

    expect(view.categories).toEqual([
      { key: "reasoning", label: "Reasoning" },
      { key: "coding", label: "Coding" },
      { key: "agentic-coding", label: "Agentic coding" },
      { key: "mathematics", label: "Mathematics" },
      { key: "data-analysis", label: "Data analysis" },
      { key: "language", label: "Language" },
      { key: "instruction-following", label: "Instruction following" },
    ]);
  });

  it("uses the immutable All-through-instruction-following category slots and maps published taxonomy aliases into their slots", () => {
    const alpha = model("alpha", {
      capability: available({
        compositeScore: 92,
        radar: [
          {
            key: "agenticCoding",
            label: "Agentic work",
            percentile: 88,
            rank: 3,
            fieldSize: 40,
          },
          {
            key: "math",
            label: "Math",
            percentile: 95,
            rank: 1,
            fieldSize: 40,
          },
        ],
      }),
    });
    const view = projectPopularModelsV1(
      envelope([{ model: alpha, rank: available(1) }], "available", {
        taxonomy: [
          {
            categoryId: "dataAnalysis",
            label: "Data analysis",
            tasks: [{ taskId: "data-a", label: "Data A" }],
          },
          {
            categoryId: "math",
            label: "Math",
            tasks: [{ taskId: "math-a", label: "Math A" }],
          },
        ],
      }),
    );

    expect(POPULAR_MODELS_CATEGORY_CONTROL_SLOTS).toEqual([
      { key: null, label: "All" },
      { key: "reasoning", label: "Reasoning" },
      { key: "coding", label: "Coding" },
      { key: "agentic-coding", label: "Agentic coding" },
      { key: "mathematics", label: "Mathematics" },
      { key: "data-analysis", label: "Data analysis" },
      { key: "language", label: "Language" },
      { key: "instruction-following", label: "Instruction following" },
    ]);
    expect(view.categories).toEqual(
      POPULAR_MODELS_CATEGORY_CONTROL_SLOTS.slice(1),
    );
    expect(popularModelsMetricValue(view.models[0]!, "agentic-coding")).toBe(
      88,
    );
    expect(popularModelsMetricValue(view.models[0]!, "mathematics")).toBe(95);
    expect(
      popularModelsLeaderboardColumns(view, "mathematics").map(
        (column) => column.key,
      ),
    ).toEqual(["category:mathematics", "task:mathematics:math-a"]);
  });

  it("keeps fixed category columns and missing source measurements unavailable instead of inventing zero", () => {
    const view = projectPopularModelsV1(
      envelope([{ model: model("alpha"), rank: available(1) }]),
    );

    expect(popularModelsMetricValue(view.models[0]!, "language")).toBeNull();
    expect(
      popularModelsLeaderboardColumns(view, null).map((column) => column.key),
    ).toContain("category:language");
    expect(
      popularModelsLeaderboardColumns(view, "language")[0],
    ).toMatchObject({
      key: "category:language",
      label: "Language",
    });
  });

  it("uses a neutral field-level unavailable label rather than reflecting raw provenance text", () => {
    expect(
      popularModelsFieldUnavailableLabel(
        "A named publication did not publish this field.",
      ),
    ).toBe("Unavailable");
  });

  it("uses published radar axes and retains unavailable values instead of substituting zero", () => {
    const alpha = model("alpha", {
      capability: available({
        compositeScore: 96.5,
        radar: [
          {
            key: "reasoning",
            label: "Source reasoning",
            percentile: 98,
            rank: 1,
            fieldSize: 40,
          },
          {
            key: "tool-use",
            label: "Source tool use",
            percentile: null,
            rank: null,
            fieldSize: null,
          },
        ],
      }),
      pricing: unavailable("Verified route pricing has not been joined"),
    });
    const beta = model("beta", {
      capability: unavailable("No published capability projection"),
      pricing: available({
        route: "beta/direct",
        inputUsdPerMillion: 2,
        outputUsdPerMillion: 3,
        contextWindowTokens: unavailable("No published context window"),
        maxOutputTokens: available(16_000),
        inputModalities: ["text"],
        outputModalities: ["text"],
        cache: unavailable("No cache price"),
      }),
    });

    const view = projectPopularModelsV1(
      envelope(
        [
          { model: beta, rank: unavailable("No source position") },
          { model: alpha, rank: available(1) },
        ],
        "partial",
      ),
    );

    expect(view.categories).toEqual(
      POPULAR_MODELS_CATEGORY_CONTROL_SLOTS.slice(1),
    );
    expect(view.models.map((item) => item.id)).toEqual(["alpha", "beta"]);
    expect(view.models[0]).toMatchObject({
      rank: 1,
      overallScore: 96.5,
      axes: [
        { key: "reasoning", percentile: 98, rank: 1, fieldSize: 40 },
        { key: "tool-use", percentile: null, rank: null, fieldSize: null },
      ],
      routePricing: {
        availability: "unavailable",
        reason: "Verified route pricing has not been joined",
      },
    });
    expect(view.models[1]).toMatchObject({
      rank: null,
      overallScore: null,
      capabilityUnavailableReason: "No published capability projection",
      routePricing: {
        availability: "available",
        route: "beta/direct",
        inputUsdPerMillion: 2,
        outputUsdPerMillion: 3,
        blendedUsdPerMillion: 2.5,
        contextWindowTokens: null,
        maxOutputTokens: 16_000,
      },
      runtimeUnavailableReason: "No verified runtime evidence",
      taskEconomicsUnavailableReason: "No verified task economics",
    });
  });

  it("retains every strict loader row in published-rank order without inventing a popularity cutoff", () => {
    const rows = Array.from({ length: 25 }, (_, index) => {
      const rank = 25 - index;
      return { model: model(`model-${rank}`), rank: available(rank) };
    });

    const view = projectPopularModelsV1(envelope(rows));

    expect(view.models).toHaveLength(25);
    expect(view.models.map((item) => item.rank)).toEqual(
      Array.from({ length: 25 }, (_, index) => index + 1),
    );
  });

  it("preserves the enriched leaderboard receipt, source rank, aggregate economics, and every task measurement", () => {
    const alpha = model("alpha");
    const view = projectPopularModelsV1(
      envelope(
        [
          {
            model: alpha,
            rank: available(99),
            sourceRank: 4,
            aggregate: {
              costPerSuccessfulEvaluationUsd: available(0.01875),
              meanOutputTokens: unavailable(
                "The release did not publish mean output tokens.",
              ),
              pareto: true,
            },
            taskEconomics: [
              {
                taskId: "coding-a",
                label: "Published coding task",
                categoryId: "coding",
                score: available(84.2),
                questionCount: available(40),
                evaluationCostUsd: available(1.5),
                inputPriceUsdPerMillion: available(2),
                outputPriceUsdPerMillion: available(8),
                equivalentSuccesses: unavailable(
                  "No equivalent-success count was published.",
                ),
                costPerSuccessfulEvaluationUsd: available(0.044),
                meanInputTokens: available(3_200),
                meanOutputTokens: available(850),
              },
            ],
          },
        ],
        "available",
        {
          release: {
            releaseId: "fixture-release-2026-08-01",
            releaseOn: "2026-08-01",
            licenseId: "CC-BY-4.0",
            provenance: [provenance],
          },
          taxonomy: [
            {
              categoryId: "coding",
              label: "Published coding",
              tasks: [{ taskId: "coding-a", label: "Published coding task" }],
            },
          ],
          total: 87,
          nextCursor: null,
        },
      ),
    );

    expect(view.models[0]).toMatchObject({
      rank: 4,
      aggregate: {
        costPerSuccessfulEvaluationUsd: {
          value: 0.01875,
          unavailableReason: null,
        },
        meanOutputTokens: {
          value: null,
          unavailableReason: "The release did not publish mean output tokens.",
        },
        pareto: true,
      },
      taskEconomics: [
        {
          taskId: "coding-a",
          categoryId: "coding",
          evaluationCostUsd: { value: 1.5, unavailableReason: null },
          equivalentSuccesses: {
            value: null,
            unavailableReason: "No equivalent-success count was published.",
          },
          meanOutputTokens: { value: 850, unavailableReason: null },
        },
      ],
    });
    expect(view).toMatchObject({
      release: {
        releaseId: "fixture-release-2026-08-01",
        licenseId: "CC-BY-4.0",
      },
      taxonomy: [{ categoryId: "coding", tasks: [{ taskId: "coding-a" }] }],
      total: 87,
      pagination: { availability: "available", nextCursor: null },
    });
  });

  it("keeps a loader failure explicitly unavailable rather than falling back to other data", () => {
    const view = projectPopularModelsV1(
      null,
      "The verified ranking service could not complete this request.",
    );

    expect(view).toMatchObject({
      sourceStatus: "unavailable",
      models: [],
      categories: POPULAR_MODELS_CATEGORY_CONTROL_SLOTS.slice(1),
      unavailableReason:
        "The verified ranking service could not complete this request.",
    });
  });

  it("filters real-time queries and provider selections without changing source-rank evidence", () => {
    const alpha = model("alpha", {
      identity: available({
        slug: "alpha",
        name: "Atlas One",
        provider: "Atlas",
      }),
    });
    const beta = model("beta", {
      identity: available({
        slug: "beta",
        name: "Beacon Two",
        provider: "Beacon",
      }),
    });
    const view = projectPopularModelsV1(
      envelope([
        { model: alpha, rank: available(2), sourceRank: 2 },
        { model: beta, rank: available(1), sourceRank: 1 },
      ]),
    );

    const result = filterPopularModels(view.models, {
      query: "beacon",
      providers: ["Beacon"],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "beta",
      rank: 1,
      provider: "Beacon",
    });
  });

  it("sorts a selected source category while retaining each model's immutable published source rank", () => {
    const alpha = model("alpha", {
      capability: available({
        compositeScore: 90,
        radar: [
          {
            key: "coding",
            label: "Coding",
            percentile: 91,
            rank: 2,
            fieldSize: 20,
          },
        ],
      }),
    });
    const beta = model("beta", {
      capability: available({
        compositeScore: 95,
        radar: [
          {
            key: "coding",
            label: "Coding",
            percentile: 82,
            rank: 4,
            fieldSize: 20,
          },
        ],
      }),
    });
    const gamma = model("gamma", {
      capability: available({
        compositeScore: 88,
        radar: [
          {
            key: "coding",
            label: "Coding",
            percentile: 97,
            rank: 1,
            fieldSize: 20,
          },
        ],
      }),
    });
    const view = projectPopularModelsV1(
      envelope([
        { model: alpha, rank: available(2), sourceRank: 2 },
        { model: beta, rank: available(1), sourceRank: 1 },
        { model: gamma, rank: available(3), sourceRank: 3 },
      ]),
    );

    const sorted = sortPopularModels(view.models, "category:coding", "desc");

    expect(sorted.map((item) => item.id)).toEqual(["gamma", "alpha", "beta"]);
    expect(sorted.map((item) => item.rank)).toEqual([3, 2, 1]);
  });

  it("uses source category measurements for winner marks and leaves unavailable values out of the winner set", () => {
    const alpha = model("alpha", {
      capability: available({
        compositeScore: 90,
        radar: [
          {
            key: "reasoning",
            label: "Reasoning",
            percentile: 94,
            rank: 2,
            fieldSize: 20,
          },
        ],
      }),
    });
    const beta = model("beta", {
      capability: available({
        compositeScore: 95,
        radar: [
          {
            key: "reasoning",
            label: "Reasoning",
            percentile: 99,
            rank: 1,
            fieldSize: 20,
          },
        ],
      }),
    });
    const gamma = model("gamma", {
      capability: available({
        compositeScore: 88,
        radar: [
          {
            key: "reasoning",
            label: "Reasoning",
            percentile: null,
            rank: null,
            fieldSize: null,
          },
        ],
      }),
    });
    const view = projectPopularModelsV1(
      envelope([
        { model: alpha, rank: available(2), sourceRank: 2 },
        { model: beta, rank: available(1), sourceRank: 1 },
        { model: gamma, rank: available(3), sourceRank: 3 },
      ]),
    );

    expect(popularModelsCategoryWinnerIds(view.models, "reasoning", 2)).toEqual(
      new Set(["beta", "alpha"]),
    );
  });

  it("builds all source category columns in Overall mode and source taxonomy task columns for a selected category", () => {
    const alpha = model("alpha", {
      capability: available({
        compositeScore: 90,
        radar: [
          {
            key: "reasoning",
            label: "Reasoning",
            percentile: 94,
            rank: 2,
            fieldSize: 20,
          },
          {
            key: "coding",
            label: "Coding",
            percentile: 89,
            rank: 3,
            fieldSize: 20,
          },
        ],
      }),
    });
    const view = projectPopularModelsV1(
      envelope([{ model: alpha, rank: available(1) }], "available", {
        taxonomy: [
          {
            categoryId: "coding",
            label: "Coding",
            tasks: [{ taskId: "coding-a", label: "Coding A" }],
          },
        ],
      }),
    );

    expect(
      popularModelsLeaderboardColumns(view, null).map((column) => column.key),
    ).toEqual([
      "overall",
      "category:reasoning",
      "category:coding",
      "category:agentic-coding",
      "category:mathematics",
      "category:data-analysis",
      "category:language",
      "category:instruction-following",
    ]);
    expect(
      popularModelsLeaderboardColumns(view, "coding").map(
        (column) => column.key,
      ),
    ).toEqual(["category:coding", "task:coding:coding-a"]);
  });

  it("normalizes a URL-backed comparison to two through four searchable source models in caller order", () => {
    const alpha = model("alpha");
    const beta = model("beta");
    const gamma = model("gamma");
    const unavailableModel = model("unavailable", {
      identity: unavailable("No profile link"),
    });
    const view = projectPopularModelsV1(
      envelope([
        { model: alpha, rank: available(1) },
        { model: beta, rank: available(2) },
        { model: gamma, rank: available(3) },
        { model: unavailableModel, rank: available(4) },
      ]),
    );

    expect(
      normalizePopularModelsComparisonIds(view.models, [
        "gamma",
        "alpha",
        "gamma",
        "unavailable",
        "beta",
      ]),
    ).toEqual(["gamma", "alpha", "beta"]);
    expect(normalizePopularModelsComparisonIds(view.models, ["gamma"])).toEqual(
      ["alpha", "beta"],
    );
  });
});
