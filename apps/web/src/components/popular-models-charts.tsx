"use client";

import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  LogarithmicScale,
  PointElement,
  RadialLinearScale,
  Tooltip,
  type ChartOptions,
} from "chart.js";
import { useEffect, useMemo, useState } from "react";
import { Bar, Radar, Scatter } from "react-chartjs-2";

import { formatDisplayNumber } from "@tokenbench/frontend/display-format";

import {
  popularModelsMetricValue,
  type PopularModelV1,
  type PopularModelsCategoryV1,
} from "@tokenbench/frontend/popular-models-v1";

ChartJS.register(
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  LogarithmicScale,
  PointElement,
  RadialLinearScale,
  Tooltip,
);

const PROVIDER_COLORS = [
  "#5489d6",
  "#d97757",
  "#7c8fd1",
  "#66a98d",
  "#c49a53",
  "#9a7cc1",
];
const MONOMIND_CHART_ACCENT = "#1111ff";
const MISSING_VALUE = "-";

interface ChartTheme {
  readonly accent: string;
  readonly grid: string;
  readonly muted: string;
  readonly reducedMotion: boolean;
  readonly strong: string;
  readonly tooltip: string;
  readonly tooltipBorder: string;
}

function fallbackChartTheme(dark: boolean, reducedMotion: boolean): ChartTheme {
  const accent = dark ? "#9dabff" : MONOMIND_CHART_ACCENT;
  return dark
    ? {
        accent,
        grid: "rgba(255,255,255,.07)",
        muted: "#a1a1aa",
        reducedMotion,
        strong: "#fafafa",
        tooltip: "#18181b",
        tooltipBorder: accent,
      }
    : {
        accent,
        grid: "rgba(0,0,0,.09)",
        muted: "#71717a",
        reducedMotion,
        strong: "#18181b",
        tooltip: "#ffffff",
        tooltipBorder: accent,
      };
}

function chartThemeFromRoot(
  root: HTMLElement,
  reducedMotion: boolean,
): ChartTheme {
  const fallback = fallbackChartTheme(
    root.classList.contains("dark"),
    reducedMotion,
  );
  const styles = window.getComputedStyle(root);
  const semanticColor = (name: string, value: string) =>
    styles.getPropertyValue(name).trim() || value;
  return {
    ...fallback,
    grid: semanticColor("--border", fallback.grid),
    muted: semanticColor("--muted-foreground", fallback.muted),
    strong: semanticColor("--foreground", fallback.strong),
    tooltip: semanticColor("--popover", fallback.tooltip),
  };
}

interface PopularChartPoint {
  readonly x: number;
  readonly y: number;
  readonly model: string;
  readonly provider: string;
  readonly route: string;
}

interface PopularAggregateChartPoint {
  readonly x: number;
  readonly y: number;
  readonly id: string;
  readonly model: string;
  readonly provider: string;
  readonly slug: string | null;
  readonly meanOutputTokens: number | null;
  readonly meanOutputUnavailableReason: string | null;
  readonly pareto: boolean;
}

function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(() =>
    fallbackChartTheme(true, false),
  );
  useEffect(() => {
    const root = document.documentElement;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setTheme(chartThemeFromRoot(root, motion.matches));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    motion.addEventListener("change", sync);
    return () => {
      observer.disconnect();
      motion.removeEventListener("change", sync);
    };
  }, []);
  return theme;
}

export function popularProviderColor(provider: string | null): string {
  const text = provider ?? "unavailable";
  let hash = 0;
  for (const character of text)
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return PROVIDER_COLORS[hash % PROVIDER_COLORS.length] ?? PROVIDER_COLORS[0]!;
}

export function PopularModelsComparisonRadar({
  categories,
  models,
}: {
  categories: readonly PopularModelsCategoryV1[];
  models: readonly PopularModelV1[];
}) {
  const theme = useChartTheme();
  const complete = models.filter((model) =>
    categories.length >= 3
    && categories.every((category) => popularModelsMetricValue(model, category.key) !== null),
  );
  const data = useMemo(() => ({
    labels: categories.map((category) => category.label),
    datasets: complete.map((model, index) => {
      const color = index === 0 ? theme.accent : popularProviderColor(model.provider);
      return {
        label: model.name ?? model.slug ?? model.id,
        data: categories.map((category) => popularModelsMetricValue(model, category.key) as number),
        backgroundColor: `${color}20`,
        borderColor: color,
        borderWidth: 2,
        pointBackgroundColor: color,
        pointRadius: 3,
      };
    }),
  }), [categories, complete, theme.accent]);
  const options = useMemo<ChartOptions<"radar">>(() => ({
    animation: theme.reducedMotion ? false : { duration: 400 },
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: theme.muted, pointStyle: "circle", usePointStyle: true }, position: "bottom" },
      tooltip: { backgroundColor: theme.tooltip, borderColor: theme.tooltipBorder, borderWidth: 1, bodyColor: theme.strong, titleColor: theme.strong },
    },
    responsive: true,
    scales: {
      r: {
        angleLines: { color: theme.grid },
        beginAtZero: true,
        grid: { color: theme.grid },
        max: 100,
        min: 0,
        pointLabels: { color: theme.muted, font: { size: 11 } },
        ticks: { backdropColor: "transparent", color: theme.muted, stepSize: 20 },
      },
    },
  }), [theme]);
  if (categories.length < 3 || complete.length === 0) {
    return (
      <ChartUnavailable>
        At least three complete published category values are required for a radar. Exact matrix values remain below.
      </ChartUnavailable>
    );
  }
  return (
    <div aria-label="Comparison radar of published benchmark categories" className="mt-4 h-[340px] min-w-0" role="img">
      <Radar data={data} options={options} />
      <p className="sr-only">{complete.length} of {models.length} selected models have complete values across all {categories.length} published categories. Missing values remain in the exact matrix and are not plotted as zero.</p>
    </div>
  );
}

/**
 * Cost-ascending, strictly score-improving frontier derived from the exact
 * published measurements plotted in the chart. It does not infer values for rows
 * with unavailable economics or capability measurements.
 */
export function popularAggregateQualityCostFrontier(
  points: readonly PopularAggregateChartPoint[],
): readonly PopularAggregateChartPoint[] {
  let bestScore = Number.NEGATIVE_INFINITY;
  return [...points]
    .sort(
      (left, right) =>
        left.x - right.x ||
        right.y - left.y ||
        left.model.localeCompare(right.model),
    )
    .filter((point) => {
      if (point.y <= bestScore) return false;
      bestScore = point.y;
      return true;
    });
}

export function popularAggregateChartDatasets(
  points: readonly PopularAggregateChartPoint[],
  accent: string,
) {
  const providers = [...new Set(points.map((point) => point.provider))];
  const paretoPoints = points.filter((point) => point.pareto);
  const frontierPoints = popularAggregateQualityCostFrontier(points);
  const providerDatasets = providers
    .map((provider) => ({
      label: provider,
      data: points.filter((point) => point.provider === provider),
      backgroundColor: popularProviderColor(provider),
      borderColor: popularProviderColor(provider),
      pointRadius: 5,
      pointHoverRadius: 8,
      pointStyle: "circle" as const,
    }))
    .filter((dataset) => dataset.data.length > 0);

  const publishedParetoDataset =
    paretoPoints.length === 0
      ? []
      : [
          {
            label: "Pareto frontier",
            data: paretoPoints,
            backgroundColor: accent,
            borderColor: accent,
            pointRadius: 8,
            pointHoverRadius: 10,
            pointStyle: "rectRot" as const,
            borderWidth: 2,
          },
        ];
  const computedFrontierDataset =
    frontierPoints.length < 2
      ? []
      : [
          {
            label: "Cost–quality frontier",
            data: frontierPoints,
            backgroundColor: "transparent",
            borderColor: accent,
            pointRadius: 0,
            pointHoverRadius: 0,
            pointStyle: "line" as const,
            borderWidth: 2,
            borderDash: [6, 4],
            showLine: true,
            tension: 0.18,
          },
        ];
  return [
    ...providerDatasets,
    ...publishedParetoDataset,
    ...computedFrontierDataset,
  ];
}

function providerName(model: PopularModelV1): string {
  return model.provider ?? MISSING_VALUE;
}

function modelName(model: PopularModelV1): string {
  return model.name ?? MISSING_VALUE;
}

function modelProfileHref(
  model: Readonly<{ id: string; slug: string | null }>,
): string | null {
  return model.slug === null
    ? null
    : `/model-profile?model=${encodeURIComponent(model.id)}`;
}

function formatUsd(value: number): string {
  return value > 0 && value < 0.01
    ? "USD <0.01"
    : `USD ${formatDisplayNumber(value)}`;
}

function formatScore(value: number): string {
  return formatDisplayNumber(value);
}

function formatTokens(value: number): string {
  return formatDisplayNumber(value, { maximumFractionDigits: 0 });
}

function formatPublishedValue(
  value: number | null,
  _unavailableReason: string | null,
  formatter: (value: number) => string,
): string {
  return value === null
    ? MISSING_VALUE
    : formatter(value);
}

function ChartUnavailable({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-[300px] place-items-center rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm leading-6 text-muted-foreground">
      <p>{children}</p>
    </div>
  );
}

function aggregateCostLabel(model: PopularModelV1): string {
  if (model.aggregate === null) return MISSING_VALUE;
  return formatPublishedValue(
    model.aggregate.costPerSuccessfulEvaluationUsd.value,
    model.aggregate.costPerSuccessfulEvaluationUsd.unavailableReason,
    formatUsd,
  );
}

function aggregateMeanOutputLabel(model: PopularModelV1): string {
  if (model.aggregate === null) return MISSING_VALUE;
  return formatPublishedValue(
    model.aggregate.meanOutputTokens.value,
    model.aggregate.meanOutputTokens.unavailableReason,
    formatTokens,
  );
}

function capabilityLabel(
  model: PopularModelV1,
  categoryKey: string | null,
): string {
  const value = popularModelsMetricValue(model, categoryKey);
  return value === null
    ? MISSING_VALUE
    : formatScore(value);
}

function AggregateExactValues({
  categoryKey,
  categoryLabel,
  models,
}: {
  categoryKey: string | null;
  categoryLabel: string;
  models: readonly PopularModelV1[];
}) {
  return (
    <details className="mt-4 rounded-xl border border-border bg-muted/20 p-4 text-sm">
      <summary className="flex min-h-11 cursor-pointer items-center rounded-md font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Exact evaluation cost values
      </summary>
      <div
        aria-label="Exact evaluation cost values. Scroll horizontally for all columns."
        className="mt-4 w-full min-w-0 max-w-full overflow-x-auto"
        tabIndex={0}
      >
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="pb-2 pr-4">Model</th>
              <th className="pb-2 pr-4">Provider</th>
              <th className="pb-2 pr-4">{categoryLabel}</th>
              <th className="pb-2 pr-4">Cost / successful evaluation</th>
              <th className="pb-2 pr-4">Mean output tokens</th>
              <th className="pb-2">Pareto</th>
            </tr>
          </thead>
          <tbody>
            {models.map((model) => (
              <tr className="border-t border-border" key={model.id}>
                <td className="py-2 pr-4 font-medium">
                  {modelProfileHref(model) === null ? (
                    modelName(model)
                  ) : (
                    <a
                      className="hover:underline"
                      href={modelProfileHref(model)!}
                    >
                      {modelName(model)}
                    </a>
                  )}
                </td>
                <td className="py-2 pr-4">{providerName(model)}</td>
                <td className="py-2 pr-4 font-mono">
                  {capabilityLabel(model, categoryKey)}
                </td>
                <td className="py-2 pr-4 font-mono">
                  {aggregateCostLabel(model)}
                </td>
                <td className="py-2 pr-4 font-mono">
                  {aggregateMeanOutputLabel(model)}
                </td>
                <td className="py-2 font-mono">
                  {model.aggregate === null
                    ? MISSING_VALUE
                    : model.aggregate.pareto
                      ? "Yes"
                      : "No"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function AggregateCostExactRanking({
  models,
}: {
  models: readonly PopularModelV1[];
}) {
  const ranked = [...models].sort((left, right) => {
    const leftCost =
      left.aggregate?.costPerSuccessfulEvaluationUsd.value ?? null;
    const rightCost =
      right.aggregate?.costPerSuccessfulEvaluationUsd.value ?? null;
    if (leftCost === null && rightCost === null) return 0;
    if (leftCost === null) return 1;
    if (rightCost === null) return -1;
    return leftCost - rightCost;
  });
  return (
    <details className="mt-4 rounded-xl border border-border bg-muted/20 p-4 text-sm">
      <summary className="flex min-h-11 cursor-pointer items-center rounded-md font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Exact evaluation cost ranking
      </summary>
      <ol className="mt-4 space-y-2 text-xs">
        {ranked.map((model, index) => {
          const cost = model.aggregate?.costPerSuccessfulEvaluationUsd.value;
          return (
            <li
              className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 first:border-t-0 first:pt-0"
              key={model.id}
            >
              <span>
                <span className="font-mono text-muted-foreground">
                  {cost === null || cost === undefined ? "—" : index + 1}
                </span>{" "}
                <span className="font-medium">{modelName(model)}</span>{" "}
                <span className="text-muted-foreground">
                  · {providerName(model)}
                  {model.aggregate?.pareto ? " · Pareto" : ""}
                </span>
              </span>
              <span className="font-mono">
                {aggregateCostLabel(model)} · mean output{" "}
                {aggregateMeanOutputLabel(model)}
              </span>
            </li>
          );
        })}
      </ol>
    </details>
  );
}

export function PopularModelsQualityCostChart({
  categoryKey,
  categoryLabel,
  models,
}: {
  categoryKey: string | null;
  categoryLabel: string;
  models: readonly PopularModelV1[];
}) {
  const theme = useChartTheme();
  const pricedModels = useMemo(
    () =>
      models.filter(
        (model) =>
          model.routePricing.availability === "available" &&
          model.routePricing.blendedUsdPerMillion !== null,
      ),
    [models],
  );
  const points = useMemo<PopularChartPoint[]>(
    () =>
      pricedModels.flatMap((model) => {
        const score = popularModelsMetricValue(model, categoryKey);
        const pricing = model.routePricing;
        if (
          score === null ||
          pricing.availability !== "available" ||
          pricing.blendedUsdPerMillion === null
        )
          return [];
        return [
          {
            x: pricing.blendedUsdPerMillion,
            y: score,
            model: modelName(model),
            provider: providerName(model),
            route: pricing.route,
          },
        ];
      }),
    [categoryKey, pricedModels],
  );
  const providers = useMemo(
    () => [...new Set(points.map((point) => point.provider))],
    [points],
  );
  const data = useMemo(
    () => ({
      datasets: providers.map((provider) => ({
        label: provider,
        data: points.filter((point) => point.provider === provider),
        backgroundColor: popularProviderColor(provider),
        borderColor: popularProviderColor(provider),
        pointRadius: 5,
        pointHoverRadius: 8,
      })),
    }),
    [points, providers],
  );
  const options = useMemo<ChartOptions<"scatter">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: theme.reducedMotion ? false : { duration: 400 },
      interaction: { intersect: false, mode: "nearest" },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            boxHeight: 7,
            boxWidth: 7,
            color: theme.muted,
            padding: 18,
            pointStyle: "circle",
            usePointStyle: true,
          },
        },
        tooltip: {
          backgroundColor: theme.tooltip,
          borderColor: theme.tooltipBorder,
          borderWidth: 1,
          displayColors: false,
          titleColor: theme.strong,
          bodyColor: theme.muted,
          callbacks: {
            title: (items) =>
              String(
                (items[0]?.raw as PopularChartPoint | undefined)?.model ??
                  "Model",
              ),
            label: (context) => {
              const point = context.raw as PopularChartPoint;
              return `${formatScore(point.y)} ${categoryLabel.toLocaleLowerCase()} · ${formatUsd(point.x)} balanced / 1M`;
            },
            afterLabel: (context) =>
              `Selected route: ${(context.raw as PopularChartPoint).route}`,
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          border: { color: theme.grid },
          grid: { color: theme.grid },
          ticks: {
            color: theme.muted,
            callback: (value) => formatUsd(Number(value)),
          },
          title: {
            color: theme.muted,
            display: true,
            text: "Balanced selected-route price / 1M tokens",
          },
        },
        y: {
          border: { color: theme.grid },
          grid: { color: theme.grid },
          ticks: { color: theme.muted, callback: (value) => formatScore(Number(value)) },
          title: { color: theme.muted, display: true, text: categoryLabel },
        },
      },
    }),
    [categoryLabel, theme],
  );

  if (pricedModels.length === 0)
    return (
      <ChartUnavailable>
        Selected-route pricing is unavailable for the visible result set, so
        TokenBench cannot plot a quality-versus-cost relationship.
      </ChartUnavailable>
    );
  if (points.length === 0)
    return (
      <ChartUnavailable>
        Selected-route pricing is published for some visible models, but none
        also have the selected {categoryLabel.toLocaleLowerCase()} measurement.
      </ChartUnavailable>
    );

  return (
    <div>
      <div
        aria-label={`${categoryLabel} versus selected-route price`}
        className="h-[340px] w-full"
        role="img"
      >
        <Scatter data={data} options={options} />
      </div>
      <details className="mt-4 rounded-xl border border-border bg-muted/20 p-4 text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center rounded-md font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Exact quality and selected-route price values
        </summary>
        <div
          aria-label="Exact selected-route quality and price values. Scroll horizontally for all columns."
          className="mt-4 w-full min-w-0 max-w-full overflow-x-auto"
          tabIndex={0}
        >
          <table className="w-full min-w-[540px] text-left text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="pb-2 pr-4">Model</th>
                <th className="pb-2 pr-4">Provider</th>
                <th className="pb-2 pr-4">{categoryLabel}</th>
                <th className="pb-2 pr-4">Balanced / 1M</th>
                <th className="pb-2">Route</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr
                  className="border-t border-border"
                  key={`${point.provider}-${point.model}`}
                >
                  <td className="py-2 pr-4 font-medium">{point.model}</td>
                  <td className="py-2 pr-4">{point.provider}</td>
                  <td className="py-2 pr-4 font-mono">
                    {formatScore(point.y)}
                  </td>
                  <td className="py-2 pr-4 font-mono">{formatUsd(point.x)}</td>
                  <td className="py-2 font-mono text-muted-foreground">
                    {point.route}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

export function PopularModelsCostRankingChart({
  models,
}: {
  models: readonly PopularModelV1[];
}) {
  const theme = useChartTheme();
  const pricedModels = useMemo(
    () =>
      models
        .filter(
          (model) =>
            model.routePricing.availability === "available" &&
            model.routePricing.blendedUsdPerMillion !== null,
        )
        .toSorted((left, right) => {
          const leftPrice =
            left.routePricing.availability === "available"
              ? left.routePricing.blendedUsdPerMillion
              : null;
          const rightPrice =
            right.routePricing.availability === "available"
              ? right.routePricing.blendedUsdPerMillion
              : null;
          return (
            (leftPrice ?? Number.POSITIVE_INFINITY) -
            (rightPrice ?? Number.POSITIVE_INFINITY)
          );
        }),
    [models],
  );
  const data = useMemo(
    () => ({
      labels: pricedModels.map(modelName),
      datasets: [
        {
          label: "Balanced selected-route price",
          data: pricedModels.map((model) =>
            model.routePricing.availability === "available"
              ? model.routePricing.blendedUsdPerMillion
              : null,
          ),
          backgroundColor: pricedModels.map((model) =>
            popularProviderColor(model.provider),
          ),
          borderColor: pricedModels.map((model) =>
            popularProviderColor(model.provider),
          ),
          borderRadius: 5,
          borderWidth: 1,
        },
      ],
    }),
    [pricedModels],
  );
  const options = useMemo<ChartOptions<"bar">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      animation: theme.reducedMotion ? false : { duration: 400 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: theme.tooltip,
          borderColor: theme.tooltipBorder,
          borderWidth: 1,
          displayColors: false,
          titleColor: theme.strong,
          bodyColor: theme.muted,
          callbacks: {
            title: (items) =>
              modelName(pricedModels[items[0]?.dataIndex ?? -1] ?? models[0]!),
            label: (context) =>
              `${formatUsd(Number(context.raw))} balanced / 1M`,
            afterLabel: (context) => {
              const model = pricedModels[context.dataIndex];
              return model?.routePricing.availability === "available"
                ? `Selected route: ${model.routePricing.route}`
                : "";
            },
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          border: { color: theme.grid },
          grid: { color: theme.grid },
          ticks: {
            color: theme.muted,
            callback: (value) => formatUsd(Number(value)),
          },
          title: {
            color: theme.muted,
            display: true,
            text: "Balanced selected-route price / 1M tokens",
          },
        },
        y: {
          border: { color: theme.grid },
          grid: { display: false },
          ticks: { color: theme.muted },
        },
      },
    }),
    [models, pricedModels, theme],
  );

  if (pricedModels.length === 0)
    return (
      <ChartUnavailable>
        Selected-route pricing is unavailable for the visible result set, so no
        cost ranking can be shown.
      </ChartUnavailable>
    );

  return (
    <div>
      <div
        aria-label="Selected-route cost ranking"
        className="h-[340px] w-full"
        role="img"
      >
        <Bar data={data} options={options} />
      </div>
      <details className="mt-4 rounded-xl border border-border bg-muted/20 p-4 text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center rounded-md font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Exact selected-route cost ranking
        </summary>
        <ol className="mt-4 space-y-2 text-xs">
          {pricedModels.map((model) => {
            const pricing = model.routePricing;
            return pricing.availability === "available" ? (
              <li
                className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 first:border-t-0 first:pt-0"
                key={model.id}
              >
                <span>
                  <span className="font-medium">{modelName(model)}</span>{" "}
                  <span className="text-muted-foreground">
                    · {providerName(model)}
                  </span>
                </span>
                <span className="font-mono">
                  {pricing.blendedUsdPerMillion === null
                    ? MISSING_VALUE
                    : formatUsd(pricing.blendedUsdPerMillion)}{" "}
                  / 1M
                </span>
              </li>
            ) : null;
          })}
        </ol>
      </details>
    </div>
  );
}

/** Uses only row-level published evaluation cost, never selected-route pricing. */
export function PopularModelsAggregateQualityCostChart({
  categoryKey,
  categoryLabel,
  models,
}: {
  categoryKey: string | null;
  categoryLabel: string;
  models: readonly PopularModelV1[];
}) {
  const theme = useChartTheme();
  const economicModels = useMemo(
    () =>
      models.filter(
        (model) =>
          model.aggregate?.costPerSuccessfulEvaluationUsd.value !== null,
      ),
    [models],
  );
  const points = useMemo<PopularAggregateChartPoint[]>(
    () =>
      economicModels.flatMap((model) => {
        const score = popularModelsMetricValue(model, categoryKey);
        const aggregate = model.aggregate;
        if (
          score === null ||
          aggregate === null ||
          aggregate.costPerSuccessfulEvaluationUsd.value === null ||
          aggregate.costPerSuccessfulEvaluationUsd.value <= 0
        )
          return [];
        return [
          {
            x: aggregate.costPerSuccessfulEvaluationUsd.value,
            y: score,
            id: model.id,
            model: modelName(model),
            provider: providerName(model),
            slug: model.slug,
            meanOutputTokens: aggregate.meanOutputTokens.value,
            meanOutputUnavailableReason:
              aggregate.meanOutputTokens.unavailableReason,
            pareto: aggregate.pareto,
          },
        ];
      }),
    [categoryKey, economicModels],
  );
  const data = useMemo(
    () => ({
      datasets: popularAggregateChartDatasets(points, theme.accent),
    }),
    [points, theme.accent],
  );
  const options = useMemo<ChartOptions<"scatter">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: theme.reducedMotion ? false : { duration: 400 },
      interaction: { intersect: false, mode: "nearest" },
      onClick: (_event, elements) => {
        const first = elements[0];
        const dataset = data.datasets[first?.datasetIndex ?? -1] as
          { data?: readonly PopularAggregateChartPoint[] } | undefined;
        const point = dataset?.data?.[first?.index ?? -1];
        const href = point === undefined ? null : modelProfileHref(point);
        if (href !== null) window.location.assign(href);
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            boxHeight: 7,
            boxWidth: 7,
            color: theme.muted,
            padding: 18,
            pointStyle: "circle",
            usePointStyle: true,
          },
        },
        tooltip: {
          backgroundColor: theme.tooltip,
          borderColor: theme.tooltipBorder,
          borderWidth: 1,
          displayColors: false,
          titleColor: theme.strong,
          bodyColor: theme.muted,
          callbacks: {
            title: (items) =>
              String(
                (items[0]?.raw as PopularAggregateChartPoint | undefined)
                  ?.model ?? "Model",
              ),
            label: (context) => {
              const point = context.raw as PopularAggregateChartPoint;
              return `${formatScore(point.y)} ${categoryLabel.toLocaleLowerCase()} · ${formatUsd(point.x)} / successful evaluation`;
            },
            afterLabel: (context) => {
              const point = context.raw as PopularAggregateChartPoint;
              return [
                `Mean output: ${formatPublishedValue(point.meanOutputTokens, point.meanOutputUnavailableReason, formatTokens)} tokens`,
                `Pareto: ${point.pareto ? "yes" : "no"}`,
              ];
            },
          },
        },
      },
      scales: {
        x: {
          type: "logarithmic",
          border: { color: theme.grid },
          grid: { color: theme.grid },
          ticks: {
            color: theme.muted,
            callback: (value) => formatUsd(Number(value)),
          },
          title: {
            color: theme.muted,
            display: true,
            text: "Evaluation cost / successful evaluation (log scale)",
          },
        },
        y: {
          border: { color: theme.grid },
          grid: { color: theme.grid },
          ticks: { color: theme.muted, callback: (value) => formatScore(Number(value)) },
          title: { color: theme.muted, display: true, text: categoryLabel },
        },
      },
    }),
    [categoryLabel, data, theme],
  );

  const chart =
    economicModels.length === 0 ? (
      <ChartUnavailable>
        Published evaluation cost is unavailable for this benchmark. Selected-route
        pricing is not used as a replacement.
      </ChartUnavailable>
    ) : points.length === 0 ? (
      <ChartUnavailable>
        Published evaluation cost is available for some rows, but
        none also have a positive logarithmic cost and the selected{" "}
        {categoryLabel.toLocaleLowerCase()} measurement.
      </ChartUnavailable>
    ) : (
      <div
        aria-label={`${categoryLabel} versus published evaluation cost`}
        className="h-[340px] w-full"
        role="img"
      >
        <Scatter data={data} options={options} />
      </div>
    );

  return (
    <div>
      {chart}
      <AggregateExactValues
        categoryKey={categoryKey}
        categoryLabel={categoryLabel}
        models={models}
      />
    </div>
  );
}

/** Ordered by published aggregate evaluation cost, with output/Pareto details. */
export function PopularModelsAggregateCostRankingChart({
  models,
}: {
  models: readonly PopularModelV1[];
}) {
  const theme = useChartTheme();
  const economicModels = useMemo(
    () =>
      models
        .filter(
          (model) =>
            model.aggregate?.costPerSuccessfulEvaluationUsd.value !== null,
        )
        .toSorted(
          (left, right) =>
            (left.aggregate?.costPerSuccessfulEvaluationUsd.value ??
              Number.POSITIVE_INFINITY) -
            (right.aggregate?.costPerSuccessfulEvaluationUsd.value ??
              Number.POSITIVE_INFINITY),
        ),
    [models],
  );
  const data = useMemo(
    () => ({
      labels: economicModels.map(modelName),
      datasets: [
        {
          label: "Evaluation cost / successful evaluation",
          data: economicModels.map(
            (model) =>
              model.aggregate?.costPerSuccessfulEvaluationUsd.value ?? null,
          ),
          backgroundColor: economicModels.map((model) =>
            popularProviderColor(model.provider),
          ),
          borderColor: economicModels.map((model) =>
            popularProviderColor(model.provider),
          ),
          borderRadius: 5,
          borderWidth: 1,
        },
      ],
    }),
    [economicModels],
  );
  const options = useMemo<ChartOptions<"bar">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      animation: theme.reducedMotion ? false : { duration: 400 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: theme.tooltip,
          borderColor: theme.tooltipBorder,
          borderWidth: 1,
          displayColors: false,
          titleColor: theme.strong,
          bodyColor: theme.muted,
          callbacks: {
            title: (items) =>
              modelName(
                economicModels[items[0]?.dataIndex ?? -1] ?? models[0]!,
              ),
            label: (context) =>
              `${formatUsd(Number(context.raw))} / successful evaluation`,
            afterLabel: (context) => {
              const aggregate = economicModels[context.dataIndex]?.aggregate;
              if (!aggregate) return "";
              return [
                `Mean output: ${formatPublishedValue(aggregate.meanOutputTokens.value, aggregate.meanOutputTokens.unavailableReason, formatTokens)} tokens`,
                `Pareto: ${aggregate.pareto ? "yes" : "no"}`,
              ];
            },
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          border: { color: theme.grid },
          grid: { color: theme.grid },
          ticks: {
            color: theme.muted,
            callback: (value) => formatUsd(Number(value)),
          },
          title: {
            color: theme.muted,
            display: true,
            text: "Evaluation cost / successful evaluation",
          },
        },
        y: {
          border: { color: theme.grid },
          grid: { display: false },
          ticks: { color: theme.muted },
        },
      },
    }),
    [economicModels, models, theme],
  );

  const chart =
    economicModels.length === 0 ? (
      <ChartUnavailable>
        Published evaluation cost is unavailable, so no cost ranking can be
        shown.
      </ChartUnavailable>
    ) : (
      <div
        aria-label="Published evaluation cost ranking"
        className="h-[340px] w-full"
        role="img"
      >
        <Bar data={data} options={options} />
      </div>
    );

  return (
    <div>
      {chart}
      <AggregateCostExactRanking models={models} />
    </div>
  );
}

export type PopularModelsComparisonEconomicsMetric =
  "cost-per-success" | "route-output-price" | "mean-output";

interface ComparisonEconomicsDefinition {
  readonly exactLabel: string;
  readonly title: string;
  readonly valueFor: (model: PopularModelV1) => {
    readonly unavailableReason: string | null;
    readonly value: number | null;
  };
  readonly format: (value: number) => string;
}

interface ComparisonEconomicsRow {
  readonly model: PopularModelV1;
  readonly unavailableReason: string | null;
  readonly value: number | null;
}

function comparisonEconomicsDefinition(
  metric: PopularModelsComparisonEconomicsMetric,
): ComparisonEconomicsDefinition {
  switch (metric) {
    case "cost-per-success":
      return {
        exactLabel: "Published evaluation cost",
        title: "Evaluation cost / successful evaluation",
        format: formatUsd,
        valueFor: (model) =>
          model.aggregate === null
            ? {
                value: null,
                unavailableReason:
                  "Aggregate evaluation cost is unavailable.",
              }
            : model.aggregate.costPerSuccessfulEvaluationUsd,
      };
    case "route-output-price":
      return {
        exactLabel: "Selected route output / 1M",
        title: "Selected-route output price / 1M",
        format: formatUsd,
        valueFor: (model) => {
          if (model.routePricing.availability === "unavailable")
            return {
              value: null,
              unavailableReason: model.routePricing.reason,
            };
          return {
            value: model.routePricing.outputUsdPerMillion,
            unavailableReason:
              model.routePricing.outputUsdPerMillion === null
                ? "The selected route did not publish an output price."
                : null,
          };
        },
      };
    case "mean-output":
      return {
        exactLabel: "Published aggregate",
        title: "Mean output tokens",
        format: formatTokens,
        valueFor: (model) =>
          model.aggregate === null
            ? {
                value: null,
                unavailableReason:
                  "Published aggregate data is unavailable.",
              }
            : model.aggregate.meanOutputTokens,
      };
  }
}

function comparisonEconomicsDataLabel(
  model: PopularModelV1,
  metric: PopularModelsComparisonEconomicsMetric,
  definition: ComparisonEconomicsDefinition,
): string {
  if (metric !== "route-output-price") return definition.exactLabel;
  return model.routePricing.availability === "available"
    ? model.routePricing.route
    : definition.exactLabel;
}

/** An interactive exact-value chart for one ordered comparison economics measure. */
export function PopularModelsComparisonEconomicsChart({
  metric,
  models,
}: {
  metric: PopularModelsComparisonEconomicsMetric;
  models: readonly PopularModelV1[];
}) {
  const theme = useChartTheme();
  const definition = useMemo(
    () => comparisonEconomicsDefinition(metric),
    [metric],
  );
  const rows = useMemo<readonly ComparisonEconomicsRow[]>(
    () =>
      models.map((model) => ({
        model,
        ...definition.valueFor(model),
      })),
    [definition, models],
  );
  const plottedRows = useMemo(
    () =>
      rows.filter(
        (row): row is ComparisonEconomicsRow & { readonly value: number } =>
          row.value !== null,
      ),
    [rows],
  );
  const data = useMemo(
    () => ({
      labels: plottedRows.map((row) => modelName(row.model)),
      datasets: [
        {
          label: definition.title,
          data: plottedRows.map((row) => row.value),
          backgroundColor: plottedRows.map((row) =>
            popularProviderColor(row.model.provider),
          ),
          borderColor: plottedRows.map((row) =>
            popularProviderColor(row.model.provider),
          ),
          borderRadius: 5,
          borderWidth: 1,
        },
      ],
    }),
    [definition.title, plottedRows],
  );
  const options = useMemo<ChartOptions<"bar">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: theme.reducedMotion ? false : { duration: 400 },
      onClick: (_event, elements) => {
        const row = plottedRows[elements[0]?.index ?? -1];
        const href = row === undefined ? null : modelProfileHref(row.model);
        if (href !== null) window.location.assign(href);
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: theme.tooltip,
          borderColor: theme.tooltipBorder,
          borderWidth: 1,
          displayColors: false,
          titleColor: theme.strong,
          bodyColor: theme.muted,
          callbacks: {
            title: (items) => {
              const row = plottedRows[items[0]?.dataIndex ?? -1];
              return row === undefined ? "Model" : modelName(row.model);
            },
            label: (context) => definition.format(Number(context.raw)),
            afterLabel: (context) => {
              const row = plottedRows[context.dataIndex];
              return row === undefined
                ? ""
                : `${providerName(row.model)} · ${comparisonEconomicsDataLabel(row.model, metric, definition)}`;
            },
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          border: { color: theme.grid },
          grid: { color: theme.grid },
          ticks: {
            color: theme.muted,
            callback: (value) => definition.format(Number(value)),
          },
          title: {
            color: theme.muted,
            display: true,
            text: definition.title,
          },
        },
        y: {
          border: { color: theme.grid },
          grid: { display: false },
          ticks: { color: theme.muted },
        },
      },
    }),
    [definition, metric, plottedRows, theme],
  );
  const chart =
    plottedRows.length === 0 ? (
      <ChartUnavailable>
        {definition.title} is unavailable for this selected model set. Field
        availability remains below.
      </ChartUnavailable>
    ) : (
      <div
        aria-label={`${definition.title} comparison chart`}
        className="mt-4 h-[280px] w-full"
        role="img"
      >
        <Bar data={data} options={options} />
      </div>
    );

  return (
    <div>
      {chart}
      <details className="mt-4 rounded-xl border border-border bg-muted/20 p-3 text-xs">
        <summary className="flex min-h-10 cursor-pointer items-center rounded-md font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Exact values and data coverage
        </summary>
        <div
          aria-label={`${definition.title} exact comparison values. Scroll horizontally for all columns.`}
          className="mt-3 w-full min-w-0 max-w-full overflow-x-auto"
          tabIndex={0}
        >
          <table className="w-full min-w-[510px] text-left">
            <thead className="text-muted-foreground">
              <tr>
                <th className="pb-2 pr-3">Model</th>
                <th className="pb-2 pr-3">Provider</th>
                <th className="pb-2 pr-3">Exact value</th>
                <th className="pb-2">Coverage</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const href = modelProfileHref(row.model);
                return (
                  <tr className="border-t border-border" key={row.model.id}>
                    <td className="py-2 pr-3 font-medium">
                      {href === null ? (
                        modelName(row.model)
                      ) : (
                        <a className="hover:underline" href={href}>
                          {modelName(row.model)}
                        </a>
                      )}
                    </td>
                    <td className="py-2 pr-3">{providerName(row.model)}</td>
                    <td className="py-2 pr-3 font-mono">
                      {row.value === null
                        ? MISSING_VALUE
                        : definition.format(row.value)}
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {comparisonEconomicsDataLabel(
                        row.model,
                        metric,
                        definition,
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
