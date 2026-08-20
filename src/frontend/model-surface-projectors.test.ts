import { describe, expect, it } from "vitest";

import type {
  CompareData,
  PreviewModel,
  PreviewModelProfileData,
  Provenance,
  UiDataContractV1,
} from "./preview-data/contracts";
import {
  parseSurfaceComparisonQuery,
  projectSurfaceComparison,
  projectSurfaceProfile,
  surfaceParetoModelIds,
  type SurfaceModel,
} from "./model-surface-projectors";

const source: Provenance = {
  id: "fixture:surface",
  label: "Accepted preview record",
  kind: "illustrative_prototype",
  effectiveAt: "2026-08-18T00:00:00.000Z",
  note: "Preview only.",
};

function model(id: string, name = id.toUpperCase()): PreviewModel {
  return {
    id,
    identity: {
      availability: "available",
      value: { slug: id, name, provider: "Provider" },
      provenance: source,
    },
    access: {
      availability: "available",
      value: "Proprietary",
      provenance: source,
    },
    benchmark: {
      availability: "available",
      value: { releaseOn: "2026-01-01", subtasks: [] },
      provenance: source,
    },
    capability: {
      availability: "available",
      value: {
        compositeScore: 91,
        radar: [
          {
            key: "coding",
            label: "Coding",
            percentile: 94,
            rank: 1,
            fieldSize: 10,
          },
        ],
      },
      provenance: source,
    },
    routePricing: {
      availability: "available",
      value: {
        route: `${id}-route`,
        inputUsdPerMillion: 2,
        outputUsdPerMillion: 8,
        contextWindowTokens: {
          availability: "unavailable",
          reason: "No accepted context source.",
        },
        maxOutputTokens: {
          availability: "unavailable",
          reason: "No accepted output source.",
        },
        inputModalities: ["text"],
        outputModalities: ["text"],
        cache: {
          availability: "unavailable",
          reason: "No accepted cache source.",
        },
      },
      provenance: source,
    },
    taskEconomics: {
      availability: "unavailable",
      reason: "No accepted task source.",
    },
    runtime: {
      availability: "unavailable",
      reason: "No accepted runtime source.",
    },
    lifecycle: {
      availability: "unavailable",
      reason: "No accepted lifecycle source.",
    },
  };
}

function envelope<T>(data: T | null): UiDataContractV1<T> {
  return {
    contractVersion: "ui-data-contract/v1",
    status: data === null ? "unavailable" : "available",
    fetchedAt: "2026-08-18T00:00:00.000Z",
    effectiveAt: source.effectiveAt,
    data,
    provenance: [source],
  };
}

describe("model surface projectors", () => {
  it("keeps unavailable route limits and runtime facts unavailable instead of synthesizing values", () => {
    const result = projectSurfaceProfile(
      envelope<PreviewModelProfileData>({ model: model("alpha") }),
    );
    expect(result.mode).toBe("preview");
    expect(result.data).toMatchObject({
      id: "alpha",
      capabilityScore: 91,
      inputUsdPerMillion: 2,
      contextWindowTokens: null,
      maxOutputTokens: null,
      ttftP50Seconds: null,
      outputTokensPerSecond: null,
    });
    expect(result.data?.capabilityAxes).toEqual([
      expect.objectContaining({ key: "coding", percentile: 94 }),
    ]);
  });

  it("keeps comparison order and leaves an absent requested id as null", () => {
    const result = projectSurfaceComparison(
      envelope<CompareData>({
        models: [model("beta"), model("alpha")],
        unavailableModelIds: [],
      }),
      ["alpha", "missing", "beta"],
    );
    expect(result.data?.models.map((item) => item?.id ?? null)).toEqual([
      "alpha",
      null,
      "beta",
    ]);
    expect(result.data?.unavailableIds).toEqual(["missing"]);
  });

  it("keeps comparison query order but rejects malformed or duplicated values", () => {
    expect(parseSurfaceComparisonQuery("alpha,beta")).toEqual({
      requestedIds: ["alpha", "beta"],
      valid: true,
    });
    expect(parseSurfaceComparisonQuery("alpha")).toEqual({
      requestedIds: ["alpha"],
      valid: true,
    });
    expect(parseSurfaceComparisonQuery("alpha,alpha")).toEqual({
      requestedIds: ["alpha", "alpha"],
      valid: false,
    });
    expect(parseSurfaceComparisonQuery("alpha,,beta")).toEqual({
      requestedIds: ["alpha", "beta"],
      valid: false,
    });
    expect(parseSurfaceComparisonQuery(["alpha,beta", "gamma"])).toEqual({
      requestedIds: [],
      valid: false,
    });
  });

  it("does not replace an unavailable profile response with a catalog model", () => {
    const result = projectSurfaceProfile(
      envelope<PreviewModelProfileData>(null),
    );
    expect(result.data).toBeNull();
    expect(result.status).toBe("unavailable");
  });

  it("derives Pareto membership only from supplied score and price pairs", () => {
    const fixture = (
      id: string,
      inputUsdPerMillion: number | null,
      capabilityScore: number | null,
    ): SurfaceModel => ({
      ...projectSurfaceProfile(
        envelope<PreviewModelProfileData>({ model: model(id) }),
      ).data!,
      inputUsdPerMillion,
      capabilityScore,
    });

    const ids = surfaceParetoModelIds([
      fixture("cheap", 1, 80),
      fixture("strong", 3, 95),
      fixture("dominated", 4, 80),
      fixture("missing-price", null, 99),
      fixture("missing-score", 0.5, null),
    ]);

    expect([...ids]).toEqual(["cheap", "strong"]);
    expect(ids.has("dominated")).toBe(false);
    expect(ids.has("missing-price")).toBe(false);
    expect(ids.has("missing-score")).toBe(false);
  });
});
