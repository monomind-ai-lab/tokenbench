import assert from "node:assert/strict";
import test from "node:test";

import type { LeaderboardDisplayRow } from "@tokenbench/frontend/leaderboard-detail";

import type { CatalogModel } from "@/lib/model-catalog";
import * as leaderboardCharts from "./leaderboard-charts";
import * as popularModelsCharts from "./popular-models-charts";
import * as tokenBenchCharts from "./tokenbench-chart";

const accent = "#1111ff";

const leaderboardRows: readonly LeaderboardDisplayRow[] = [
  {
    id: "regular",
    name: "Regular model",
    provider: "Provider A",
    access: "Proprietary",
    rank: 2,
    metric: 89,
    metricLabel: "Score",
    fieldSize: null,
    inputUsdPerMillion: 1,
    outputUsdPerMillion: 2,
    blendedUsdPerMillion: 1.5,
    contextWindowTokens: null,
    maxOutputTokens: null,
    route: "route-a",
    frontier: false,
  },
  {
    id: "frontier",
    name: "Frontier model",
    provider: "Provider B",
    access: "Proprietary",
    rank: 1,
    metric: 95,
    metricLabel: "Score",
    fieldSize: null,
    inputUsdPerMillion: 0.5,
    outputUsdPerMillion: 1,
    blendedUsdPerMillion: 0.75,
    contextWindowTokens: null,
    maxOutputTokens: null,
    route: "route-b",
    frontier: true,
  },
];

const model = (overrides: Partial<CatalogModel>): CatalogModel => ({
  id: "model",
  name: "Model",
  provider: "Provider A",
  summary: "",
  access: ["API"],
  category: "Flagship",
  context: 128_000,
  inputPrice: 1,
  outputPrice: 2,
  score: 90,
  speed: 40,
  frontier: false,
  color: "#5489d6",
  released: "2026-01-01",
  ...overrides,
});

test("frontier datasets reserve the MonoMind accent and a shape cue without recoloring provider series", () => {
  const buildDatasets = (leaderboardCharts as unknown as {
    leaderboardCostScoreDatasets?: (rows: readonly LeaderboardDisplayRow[], color: string) => Array<{ label: string; borderColor: string; data: unknown[]; pointStyle?: string }>;
  }).leaderboardCostScoreDatasets;

  assert.equal(typeof buildDatasets, "function");
  const datasets = buildDatasets!(leaderboardRows, accent);
  const frontier = datasets.find((dataset) => dataset.label === "Value frontier");
  const provider = datasets.find((dataset) => dataset.label === "Provider A");

  assert.deepEqual(frontier, {
    label: "Value frontier",
    data: [{ x: 0.75, y: 95, model: "Frontier model", frontier: true }],
    backgroundColor: accent,
    borderColor: accent,
    pointRadius: 7,
    pointHoverRadius: 9,
    pointStyle: "rectRot",
    borderWidth: 2,
  });
  assert.equal(provider?.borderColor, "#c49a53");
  assert.equal(provider?.data.length, 1);
});

test("model frontier datasets use the accent only for published frontier points and omit unavailable data", () => {
  const buildDatasets = (tokenBenchCharts as unknown as {
    modelFrontierDatasets?: (models: readonly CatalogModel[], color: string) => Array<{ label: string; borderColor: string; data: unknown[]; pointStyle?: string }>;
  }).modelFrontierDatasets;

  assert.equal(typeof buildDatasets, "function");
  const datasets = buildDatasets!([
    model({ id: "standard", frontier: false }),
    model({ id: "frontier", name: "Frontier", provider: "Provider B", inputPrice: 0.5, score: 94, frontier: true, color: "#d97757" }),
    model({ id: "unavailable", provider: "Provider C", inputPrice: null, score: 96, frontier: true }),
  ], accent);

  const frontier = datasets.find((dataset) => dataset.label === "Value frontier");
  assert.equal(frontier?.borderColor, accent);
  assert.equal(frontier?.pointStyle, "rectRot");
  assert.equal(frontier?.data.length, 1);
  assert.equal(datasets.some((dataset) => dataset.label === "Provider C"), false);
});

test("aggregate Pareto datasets use the accent as a separate, non-provider frontier series", () => {
  const buildDatasets = (popularModelsCharts as unknown as {
    popularAggregateChartDatasets?: (points: ReadonlyArray<{
      x: number;
      y: number;
      model: string;
      provider: string;
      slug: string | null;
      meanOutputTokens: number | null;
      meanOutputUnavailableReason: string | null;
      pareto: boolean;
    }>, color: string) => Array<{ label: string; borderColor: string; data: unknown[]; pointStyle?: string }>;
  }).popularAggregateChartDatasets;

  assert.equal(typeof buildDatasets, "function");
  const datasets = buildDatasets!([
    { x: 0.6, y: 92, model: "Standard", provider: "Provider A", slug: "standard", meanOutputTokens: 12, meanOutputUnavailableReason: null, pareto: false },
    { x: 0.4, y: 95, model: "Pareto", provider: "Provider B", slug: "pareto", meanOutputTokens: 14, meanOutputUnavailableReason: null, pareto: true },
  ], accent);

  const frontier = datasets.find((dataset) => dataset.label === "Pareto frontier");
  assert.equal(frontier?.borderColor, accent);
  assert.equal(frontier?.pointStyle, "rectRot");
  assert.equal(frontier?.data.length, 1);
  assert.equal(datasets.find((dataset) => dataset.label === "Provider A")?.borderColor, "#c49a53");
});
