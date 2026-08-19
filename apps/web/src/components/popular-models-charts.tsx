"use client";

import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartOptions,
} from "chart.js";
import { useEffect, useMemo, useState } from "react";
import { Bar, Scatter } from "react-chartjs-2";

import { popularModelsMetricValue, type PopularModelV1 } from "@tokenbench/frontend/popular-models-v1";

ChartJS.register(BarElement, CategoryScale, Legend, LinearScale, PointElement, Tooltip);

const PROVIDER_COLORS = ["#5489d6", "#d97757", "#7c8fd1", "#66a98d", "#c49a53", "#9a7cc1"];

interface ChartTheme {
  readonly grid: string;
  readonly muted: string;
  readonly reducedMotion: boolean;
  readonly strong: string;
  readonly tooltip: string;
  readonly tooltipBorder: string;
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
  readonly model: string;
  readonly provider: string;
  readonly slug: string | null;
  readonly meanOutputTokens: number | null;
  readonly meanOutputUnavailableReason: string | null;
  readonly pareto: boolean;
}

function useChartTheme(): ChartTheme {
  const [dark, setDark] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setDark(root.classList.contains("dark"));
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setReducedMotion(motion.matches);
    sync();
    syncMotion();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class", "data-theme"] });
    motion.addEventListener("change", syncMotion);
    return () => { observer.disconnect(); motion.removeEventListener("change", syncMotion); };
  }, []);
  return dark ? {
    grid: "rgba(255,255,255,.07)",
    muted: "#a1a1aa",
    reducedMotion,
    strong: "#fafafa",
    tooltip: "#18181b",
    tooltipBorder: "#3f3f46",
  } : {
    grid: "rgba(0,0,0,.09)",
    muted: "#71717a",
    reducedMotion,
    strong: "#18181b",
    tooltip: "#ffffff",
    tooltipBorder: "#d4d4d8",
  };
}

export function popularProviderColor(provider: string | null): string {
  const text = provider ?? "unavailable";
  let hash = 0;
  for (const character of text) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return PROVIDER_COLORS[hash % PROVIDER_COLORS.length] ?? PROVIDER_COLORS[0]!;
}

function providerName(model: PopularModelV1): string {
  return model.provider ?? "Unavailable provider";
}

function modelName(model: PopularModelV1): string {
  return model.name ?? "Unavailable model identity";
}

function modelProfileHref(slug: string | null): string | null {
  return slug === null ? null : `/models/${encodeURIComponent(slug)}/`;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 1 ? 3 : 2,
  }).format(value);
}

function formatScore(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function formatTokens(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatSourceValue(value: number | null, unavailableReason: string | null, formatter: (value: number) => string): string {
  return value === null ? `Unavailable${unavailableReason === null ? "" : `: ${unavailableReason}`}` : formatter(value);
}

function ChartUnavailable({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-[300px] place-items-center rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm leading-6 text-muted-foreground"><p>{children}</p></div>;
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
  const pricedModels = useMemo(() => models.filter((model) => model.routePricing.availability === "available" && model.routePricing.blendedUsdPerMillion !== null), [models]);
  const points = useMemo<PopularChartPoint[]>(() => pricedModels.flatMap((model) => {
    const score = popularModelsMetricValue(model, categoryKey);
    const pricing = model.routePricing;
    if (score === null || pricing.availability !== "available" || pricing.blendedUsdPerMillion === null) return [];
    return [{
      x: pricing.blendedUsdPerMillion,
      y: score,
      model: modelName(model),
      provider: providerName(model),
      route: pricing.route,
    }];
  }), [categoryKey, pricedModels]);
  const providers = useMemo(() => [...new Set(points.map((point) => point.provider))], [points]);
  const data = useMemo(() => ({
    datasets: providers.map((provider) => ({
      label: provider,
      data: points.filter((point) => point.provider === provider),
      backgroundColor: popularProviderColor(provider),
      borderColor: popularProviderColor(provider),
      pointRadius: 5,
      pointHoverRadius: 8,
    })),
  }), [points, providers]);
  const options = useMemo<ChartOptions<"scatter">>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: theme.reducedMotion ? false : { duration: 400 },
    interaction: { intersect: false, mode: "nearest" },
    plugins: {
      legend: { position: "bottom", labels: { boxHeight: 7, boxWidth: 7, color: theme.muted, padding: 18, pointStyle: "circle", usePointStyle: true } },
      tooltip: {
        backgroundColor: theme.tooltip,
        borderColor: theme.tooltipBorder,
        borderWidth: 1,
        displayColors: false,
        titleColor: theme.strong,
        bodyColor: theme.muted,
        callbacks: {
          title: (items) => String((items[0]?.raw as PopularChartPoint | undefined)?.model ?? "Model"),
          label: (context) => {
            const point = context.raw as PopularChartPoint;
            return `${formatScore(point.y)} ${categoryLabel.toLocaleLowerCase()} · ${formatUsd(point.x)} balanced / 1M`;
          },
          afterLabel: (context) => `Selected route: ${(context.raw as PopularChartPoint).route}`,
        },
      },
    },
    scales: {
      x: { beginAtZero: true, border: { color: theme.grid }, grid: { color: theme.grid }, ticks: { color: theme.muted, callback: (value) => formatUsd(Number(value)) }, title: { color: theme.muted, display: true, text: "Balanced selected-route price / 1M tokens" } },
      y: { border: { color: theme.grid }, grid: { color: theme.grid }, ticks: { color: theme.muted }, title: { color: theme.muted, display: true, text: categoryLabel } },
    },
  }), [categoryLabel, theme]);

  if (pricedModels.length === 0) return <ChartUnavailable>Selected-route pricing is unavailable for the visible result set, so TokenBench cannot plot a quality-versus-cost relationship.</ChartUnavailable>;
  if (points.length === 0) return <ChartUnavailable>Selected-route pricing is published for some visible models, but none also have the selected {categoryLabel.toLocaleLowerCase()} measurement.</ChartUnavailable>;

  return <div>
    <div aria-label={`${categoryLabel} versus selected-route price`} className="h-[340px] w-full" role="img"><Scatter data={data} options={options} /></div>
    <details className="mt-4 rounded-xl border border-border bg-muted/20 p-4 text-sm">
      <summary className="flex min-h-11 cursor-pointer items-center rounded-md font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">Exact quality and selected-route price values</summary>
      <div aria-label="Exact selected-route quality and price values. Scroll horizontally for all columns." className="mt-4 w-full min-w-0 max-w-full overflow-x-auto" tabIndex={0}><table className="w-full min-w-[540px] text-left text-xs"><thead className="text-muted-foreground"><tr><th className="pb-2 pr-4">Model</th><th className="pb-2 pr-4">Provider</th><th className="pb-2 pr-4">{categoryLabel}</th><th className="pb-2 pr-4">Balanced / 1M</th><th className="pb-2">Route</th></tr></thead><tbody>{points.map((point) => <tr className="border-t border-border" key={`${point.provider}-${point.model}`}><td className="py-2 pr-4 font-medium">{point.model}</td><td className="py-2 pr-4">{point.provider}</td><td className="py-2 pr-4 font-mono">{formatScore(point.y)}</td><td className="py-2 pr-4 font-mono">{formatUsd(point.x)}</td><td className="py-2 font-mono text-muted-foreground">{point.route}</td></tr>)}</tbody></table></div>
    </details>
  </div>;
}

export function PopularModelsCostRankingChart({ models }: { models: readonly PopularModelV1[] }) {
  const theme = useChartTheme();
  const pricedModels = useMemo(() => models
    .filter((model) => model.routePricing.availability === "available" && model.routePricing.blendedUsdPerMillion !== null)
    .toSorted((left, right) => {
      const leftPrice = left.routePricing.availability === "available" ? left.routePricing.blendedUsdPerMillion : null;
      const rightPrice = right.routePricing.availability === "available" ? right.routePricing.blendedUsdPerMillion : null;
      return (leftPrice ?? Number.POSITIVE_INFINITY) - (rightPrice ?? Number.POSITIVE_INFINITY);
    }), [models]);
  const data = useMemo(() => ({
    labels: pricedModels.map(modelName),
    datasets: [{
      label: "Balanced selected-route price",
      data: pricedModels.map((model) => model.routePricing.availability === "available" ? model.routePricing.blendedUsdPerMillion : null),
      backgroundColor: pricedModels.map((model) => popularProviderColor(model.provider)),
      borderColor: pricedModels.map((model) => popularProviderColor(model.provider)),
      borderRadius: 5,
      borderWidth: 1,
    }],
  }), [pricedModels]);
  const options = useMemo<ChartOptions<"bar">>(() => ({
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
          title: (items) => modelName(pricedModels[items[0]?.dataIndex ?? -1] ?? models[0]!),
          label: (context) => `${formatUsd(Number(context.raw))} balanced / 1M`,
          afterLabel: (context) => {
            const model = pricedModels[context.dataIndex];
            return model?.routePricing.availability === "available" ? `Selected route: ${model.routePricing.route}` : "";
          },
        },
      },
    },
    scales: {
      x: { beginAtZero: true, border: { color: theme.grid }, grid: { color: theme.grid }, ticks: { color: theme.muted, callback: (value) => formatUsd(Number(value)) }, title: { color: theme.muted, display: true, text: "Balanced selected-route price / 1M tokens" } },
      y: { border: { color: theme.grid }, grid: { display: false }, ticks: { color: theme.muted } },
    },
  }), [models, pricedModels, theme]);

  if (pricedModels.length === 0) return <ChartUnavailable>Selected-route pricing is unavailable for the visible result set, so no cost ranking can be shown.</ChartUnavailable>;

  return <div>
    <div aria-label="Selected-route cost ranking" className="h-[340px] w-full" role="img"><Bar data={data} options={options} /></div>
    <details className="mt-4 rounded-xl border border-border bg-muted/20 p-4 text-sm">
      <summary className="flex min-h-11 cursor-pointer items-center rounded-md font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">Exact selected-route cost ranking</summary>
      <ol className="mt-4 space-y-2 text-xs">{pricedModels.map((model) => {
        const pricing = model.routePricing;
        return pricing.availability === "available" ? <li className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 first:border-t-0 first:pt-0" key={model.id}><span><span className="font-medium">{modelName(model)}</span> <span className="text-muted-foreground">· {providerName(model)}</span></span><span className="font-mono">{pricing.blendedUsdPerMillion === null ? "Unavailable" : formatUsd(pricing.blendedUsdPerMillion)} / 1M</span></li> : null;
      })}</ol>
    </details>
  </div>;
}

/** Uses only row-level LiveBench aggregate economics, never selected-route pricing. */
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
  const economicModels = useMemo(() => models.filter((model) => model.aggregate?.costPerSuccessfulEvaluationUsd.value !== null), [models]);
  const points = useMemo<PopularAggregateChartPoint[]>(() => economicModels.flatMap((model) => {
    const score = popularModelsMetricValue(model, categoryKey);
    const aggregate = model.aggregate;
    if (score === null || aggregate === null || aggregate.costPerSuccessfulEvaluationUsd.value === null) return [];
    return [{
      x: aggregate.costPerSuccessfulEvaluationUsd.value,
      y: score,
      model: modelName(model),
      provider: providerName(model),
      slug: model.slug,
      meanOutputTokens: aggregate.meanOutputTokens.value,
      meanOutputUnavailableReason: aggregate.meanOutputTokens.unavailableReason,
      pareto: aggregate.pareto,
    }];
  }), [categoryKey, economicModels]);
  const providers = useMemo(() => [...new Set(points.map((point) => point.provider))], [points]);
  const data = useMemo(() => ({
    datasets: providers.map((provider) => ({
      label: provider,
      data: points.filter((point) => point.provider === provider),
      backgroundColor: popularProviderColor(provider),
      borderColor: popularProviderColor(provider),
      pointRadius: (context: { raw: unknown }) => (context.raw as PopularAggregateChartPoint).pareto ? 8 : 5,
      pointHoverRadius: 9,
    })),
  }), [points, providers]);
  const options = useMemo<ChartOptions<"scatter">>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: theme.reducedMotion ? false : { duration: 400 },
    interaction: { intersect: false, mode: "nearest" },
    plugins: {
      legend: { position: "bottom", labels: { boxHeight: 7, boxWidth: 7, color: theme.muted, padding: 18, pointStyle: "circle", usePointStyle: true } },
      tooltip: {
        backgroundColor: theme.tooltip,
        borderColor: theme.tooltipBorder,
        borderWidth: 1,
        displayColors: false,
        titleColor: theme.strong,
        bodyColor: theme.muted,
        callbacks: {
          title: (items) => String((items[0]?.raw as PopularAggregateChartPoint | undefined)?.model ?? "Model"),
          label: (context) => {
            const point = context.raw as PopularAggregateChartPoint;
            return `${formatScore(point.y)} ${categoryLabel.toLocaleLowerCase()} · ${formatUsd(point.x)} / successful evaluation`;
          },
          afterLabel: (context) => {
            const point = context.raw as PopularAggregateChartPoint;
            return [
              `Mean output: ${formatSourceValue(point.meanOutputTokens, point.meanOutputUnavailableReason, formatTokens)} tokens`,
              `Pareto: ${point.pareto ? "yes" : "no"}`,
            ];
          },
        },
      },
    },
    scales: {
      x: { beginAtZero: true, border: { color: theme.grid }, grid: { color: theme.grid }, ticks: { color: theme.muted, callback: (value) => formatUsd(Number(value)) }, title: { color: theme.muted, display: true, text: "LiveBench cost / successful evaluation" } },
      y: { border: { color: theme.grid }, grid: { color: theme.grid }, ticks: { color: theme.muted }, title: { color: theme.muted, display: true, text: categoryLabel } },
    },
  }), [categoryLabel, theme]);

  if (economicModels.length === 0) return <ChartUnavailable>LiveBench aggregate cost per successful evaluation is unavailable for the visible result set. Selected-route pricing is not used as a replacement.</ChartUnavailable>;
  if (points.length === 0) return <ChartUnavailable>LiveBench aggregate economics are published for some visible models, but none also have the selected {categoryLabel.toLocaleLowerCase()} measurement.</ChartUnavailable>;

  return <div>
    <div aria-label={`${categoryLabel} versus LiveBench aggregate evaluation cost`} className="h-[340px] w-full" role="img"><Scatter data={data} options={options} /></div>
    <details className="mt-4 rounded-xl border border-border bg-muted/20 p-4 text-sm">
      <summary className="flex min-h-11 cursor-pointer items-center rounded-md font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">Exact LiveBench aggregate economics values</summary>
      <div aria-label="Exact LiveBench aggregate economics values. Scroll horizontally for all columns." className="mt-4 w-full min-w-0 max-w-full overflow-x-auto" tabIndex={0}><table className="w-full min-w-[690px] text-left text-xs"><thead className="text-muted-foreground"><tr><th className="pb-2 pr-4">Model</th><th className="pb-2 pr-4">Provider</th><th className="pb-2 pr-4">{categoryLabel}</th><th className="pb-2 pr-4">Cost / successful evaluation</th><th className="pb-2 pr-4">Mean output tokens</th><th className="pb-2">Pareto</th></tr></thead><tbody>{points.map((point) => <tr className="border-t border-border" key={`${point.provider}-${point.model}`}><td className="py-2 pr-4 font-medium">{modelProfileHref(point.slug) === null ? point.model : <a className="hover:underline" href={modelProfileHref(point.slug)!}>{point.model}</a>}</td><td className="py-2 pr-4">{point.provider}</td><td className="py-2 pr-4 font-mono">{formatScore(point.y)}</td><td className="py-2 pr-4 font-mono">{formatUsd(point.x)}</td><td className="py-2 pr-4 font-mono">{formatSourceValue(point.meanOutputTokens, point.meanOutputUnavailableReason, formatTokens)}</td><td className="py-2 font-mono">{point.pareto ? "Yes" : "No"}</td></tr>)}</tbody></table></div>
    </details>
  </div>;
}

/** Ordered by the source-published aggregate evaluation cost, with source output/Pareto details. */
export function PopularModelsAggregateCostRankingChart({ models }: { models: readonly PopularModelV1[] }) {
  const theme = useChartTheme();
  const economicModels = useMemo(() => models
    .filter((model) => model.aggregate?.costPerSuccessfulEvaluationUsd.value !== null)
    .toSorted((left, right) => (left.aggregate?.costPerSuccessfulEvaluationUsd.value ?? Number.POSITIVE_INFINITY) - (right.aggregate?.costPerSuccessfulEvaluationUsd.value ?? Number.POSITIVE_INFINITY)), [models]);
  const data = useMemo(() => ({
    labels: economicModels.map(modelName),
    datasets: [{
      label: "LiveBench cost / successful evaluation",
      data: economicModels.map((model) => model.aggregate?.costPerSuccessfulEvaluationUsd.value ?? null),
      backgroundColor: economicModels.map((model) => popularProviderColor(model.provider)),
      borderColor: economicModels.map((model) => popularProviderColor(model.provider)),
      borderRadius: 5,
      borderWidth: 1,
    }],
  }), [economicModels]);
  const options = useMemo<ChartOptions<"bar">>(() => ({
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
          title: (items) => modelName(economicModels[items[0]?.dataIndex ?? -1] ?? models[0]!),
          label: (context) => `${formatUsd(Number(context.raw))} / successful evaluation`,
          afterLabel: (context) => {
            const aggregate = economicModels[context.dataIndex]?.aggregate;
            if (!aggregate) return "";
            return [
              `Mean output: ${formatSourceValue(aggregate.meanOutputTokens.value, aggregate.meanOutputTokens.unavailableReason, formatTokens)} tokens`,
              `Pareto: ${aggregate.pareto ? "yes" : "no"}`,
            ];
          },
        },
      },
    },
    scales: {
      x: { beginAtZero: true, border: { color: theme.grid }, grid: { color: theme.grid }, ticks: { color: theme.muted, callback: (value) => formatUsd(Number(value)) }, title: { color: theme.muted, display: true, text: "LiveBench cost / successful evaluation" } },
      y: { border: { color: theme.grid }, grid: { display: false }, ticks: { color: theme.muted } },
    },
  }), [economicModels, models, theme]);

  if (economicModels.length === 0) return <ChartUnavailable>LiveBench aggregate cost per successful evaluation is unavailable for the visible result set, so no aggregate-economics ranking can be shown.</ChartUnavailable>;

  return <div>
    <div aria-label="LiveBench aggregate cost ranking" className="h-[340px] w-full" role="img"><Bar data={data} options={options} /></div>
    <details className="mt-4 rounded-xl border border-border bg-muted/20 p-4 text-sm">
      <summary className="flex min-h-11 cursor-pointer items-center rounded-md font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">Exact LiveBench aggregate cost ranking</summary>
      <ol className="mt-4 space-y-2 text-xs">{economicModels.map((model) => {
        const aggregate = model.aggregate!;
        return <li className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 first:border-t-0 first:pt-0" key={model.id}><span><span className="font-medium">{modelName(model)}</span> <span className="text-muted-foreground">· {providerName(model)}{aggregate.pareto ? " · Pareto" : ""}</span></span><span className="font-mono">{formatUsd(aggregate.costPerSuccessfulEvaluationUsd.value!)} / successful evaluation · mean output {formatSourceValue(aggregate.meanOutputTokens.value, aggregate.meanOutputTokens.unavailableReason, formatTokens)}</span></li>;
      })}</ol>
    </details>
  </div>;
}
