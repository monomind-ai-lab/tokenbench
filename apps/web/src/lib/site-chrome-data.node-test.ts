import assert from "node:assert/strict";
import test from "node:test";

import type { LeaderboardDataSnapshot } from "./ui-data.server";
import { projectSiteChromeData } from "./site-chrome-data";

const unavailable = { availability: "unavailable", reason: "not published" } as const;
const provenance = {
  id: "accepted-ranking",
  label: "Accepted ranking",
  kind: "accepted_pipeline",
  effectiveAt: "2026-08-20T00:00:00.000Z",
  note: "Test provenance",
} as const;

function snapshot(): LeaderboardDataSnapshot {
  return {
    mode: "production",
    error: null,
    envelope: {
      contractVersion: "ui-data-contract/v1",
      status: "available",
      fetchedAt: "2026-08-21T00:00:00.000Z",
      effectiveAt: "2026-08-20T00:00:00.000Z",
      provenance: [provenance],
      data: {
        models: [
          {
            sourceRank: 7,
            rank: { availability: "available", value: 7, provenance },
            model: {
              id: "alpha-id",
              identity: {
                availability: "available",
                value: { slug: "alpha", name: "Alpha", provider: "Provider A" },
                provenance,
              },
              access: unavailable,
              benchmark: unavailable,
              capability: {
                availability: "available",
                value: { compositeScore: 91.25, radar: [] },
                provenance,
              },
              routePricing: unavailable,
              runtime: unavailable,
              lifecycle: unavailable,
              taskEconomics: unavailable,
            },
          },
          {
            rank: unavailable,
            model: {
              id: "unranked",
              identity: {
                availability: "available",
                value: { slug: "unranked", name: "Unranked", provider: "Provider B" },
                provenance,
              },
              access: unavailable,
              benchmark: unavailable,
              capability: unavailable,
              routePricing: unavailable,
              runtime: unavailable,
              lifecycle: unavailable,
              taskEconomics: unavailable,
            },
          },
        ],
      },
    },
  };
}

test("projects only accepted ranked rows into the shared Models menu", () => {
  const result = projectSiteChromeData(snapshot());
  assert.deepEqual(result.topModels, [
    {
      modelId: "alpha",
      name: "Alpha",
      provider: "Provider A",
      rank: 7,
      score: "91.3",
    },
  ]);
  assert.equal(result.topModelsLabel, "Published Aug 20, 2026");
});

test("keeps an unavailable ranking empty instead of inventing menu rows", () => {
  const result = projectSiteChromeData({
    mode: "unconfigured",
    envelope: null,
    error: "not configured",
  });
  assert.deepEqual(result.topModels, []);
  assert.equal(result.topModelsLabel, "Ranking unavailable");
});
