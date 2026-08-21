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
import { Bar, Line, Scatter } from "react-chartjs-2";

import {
  formatDisplayNumber,
  formatDisplayUsd,
} from "@tokenbench/frontend/display-format";

import type { CatalogModel } from "@/lib/model-catalog";

ChartJS.register(BarElement, CategoryScale, Filler, LinearScale, LogarithmicScale, PointElement, RadialLinearScale, LineElement, Tooltip, Legend);

const MONOMIND_CHART_ACCENT = "#1111ff";
const MISSING_VALUE = "-";

interface ChartTheme {
  readonly accent: string;
  readonly accentFill: string;
  readonly grid: string;
  readonly muted: string;
  readonly reducedMotion: boolean;
  readonly strong: string;
  readonly tooltip: string;
  readonly tooltipBorder: string;
}

function fallbackChartTheme(dark: boolean, reducedMotion: boolean): ChartTheme {
  const accent = dark ? "#9dabff" : MONOMIND_CHART_ACCENT;
  return dark ? {
    accent,
    accentFill: "rgba(157,171,255,.20)",
    grid: "rgba(255,255,255,.07)",
    muted: "#a1a1aa",
    reducedMotion,
    strong: "#fafafa",
    tooltip: "#18181b",
    tooltipBorder: accent,
  } : {
    accent,
    accentFill: "rgba(17,17,255,.14)",
    grid: "rgba(0,0,0,.09)",
    muted: "#71717a",
    reducedMotion,
    strong: "#18181b",
    tooltip: "#ffffff",
    tooltipBorder: accent,
  };
}

function chartThemeFromRoot(root: HTMLElement, reducedMotion: boolean): ChartTheme {
  const fallback = fallbackChartTheme(root.classList.contains("dark"), reducedMotion);
  const styles = window.getComputedStyle(root);
  const semanticColor = (name: string, value: string) => styles.getPropertyValue(name).trim() || value;
  return {
    ...fallback,
    grid: semanticColor("--border", fallback.grid),
    muted: semanticColor("--muted-foreground", fallback.muted),
    strong: semanticColor("--foreground", fallback.strong),
    tooltip: semanticColor("--popover", fallback.tooltip),
  };
}

function useChartTheme() {
  const [theme, setTheme] = useState<ChartTheme>(() => fallbackChartTheme(true, false));

  useEffect(() => {
    const root = document.documentElement;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setTheme(chartThemeFromRoot(root, motion.matches));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class", "data-theme"] });
    motion.addEventListener("change", sync);
    return () => { observer.disconnect(); motion.removeEventListener("change", sync); };
  }, []);

  return theme;
}

function ChartUnavailable({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-[280px] place-items-center rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm leading-6 text-muted-foreground" role="status">
      <p>{children}</p>
    </div>
  );
}

export function TokenBenchChart({ models = [] }: { models?: readonly CatalogModel[] }) {
  const theme = useChartTheme();
  const data = useMemo(() => ({
    datasets: modelFrontierDatasets(models, theme.accent),
  }), [models, theme.accent]);
  const options = useMemo<ChartOptions<"scatter">>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: theme.reducedMotion ? false : { duration: 500 },
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
        callbacks: {
          label: (context) => {
            const price = context.parsed.x === null
              ? MISSING_VALUE
              : `${formatDisplayUsd(context.parsed.x)}/1M`;
            const score = context.parsed.y === null
              ? MISSING_VALUE
              : formatDisplayNumber(context.parsed.y);
            return `${context.dataset.label}: ${price} · score ${score}`;
          },
        },
        displayColors: false,
        titleColor: theme.strong,
        bodyColor: theme.muted,
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        border: { color: theme.grid },
        grid: { color: theme.grid },
        ticks: { color: theme.muted, callback: (value) => formatDisplayUsd(Number(value)) },
        title: { color: theme.muted, display: true, text: "Input price / 1M tokens" },
      },
      y: {
        suggestedMin: 80,
        suggestedMax: 100,
        border: { color: theme.grid },
        grid: { color: theme.grid },
        ticks: { color: theme.muted, callback: (value) => formatDisplayNumber(Number(value)) },
        title: { color: theme.muted, display: true, text: "Evidence score" },
      },
    },
  }), [theme]);

  if (!models.some((model) => model.inputPrice !== null && model.score !== null)) {
    return <ChartUnavailable>Published input-price and evidence-score pairs are required before this chart can be shown.</ChartUnavailable>;
  }

  return (
    <div className="h-[280px] w-full" role="img" aria-label="Price versus evidence score scatter chart">
      <Scatter data={data} options={options} />
    </div>
  );
}

export function modelFrontierDatasets(models: readonly CatalogModel[], accent: string) {
  const plottedModels = models.filter((model) => model.inputPrice !== null && model.score !== null);
  const providers = Array.from(new Set(plottedModels.map((model) => model.provider)));
  const frontierModels = plottedModels.filter((model) => model.frontier);
  const providerDatasets = providers.map((provider) => {
    const providerModels = plottedModels.filter((model) => model.provider === provider && !model.frontier);
    return {
      label: provider,
      data: providerModels.map((model) => ({ x: model.inputPrice as number, y: model.score as number, model: model.name, frontier: false })),
      backgroundColor: providerModels[0]?.color ?? "#a1a1aa",
      borderColor: providerModels[0]?.color ?? "#a1a1aa",
      pointRadius: 5,
      pointHoverRadius: 8,
      pointStyle: "circle" as const,
    };
  }).filter((dataset) => dataset.data.length > 0);

  return frontierModels.length === 0 ? providerDatasets : [
    ...providerDatasets,
    {
      label: "Value frontier",
      data: frontierModels.map((model) => ({ x: model.inputPrice as number, y: model.score as number, model: model.name, frontier: true })),
      backgroundColor: accent,
      borderColor: accent,
      pointRadius: 8,
      pointHoverRadius: 10,
      pointStyle: "rectRot" as const,
      borderWidth: 2,
    },
  ];
}

export function ModelFrontierChart({ models, logScale }: { models: CatalogModel[]; logScale: boolean }) {
  const theme = useChartTheme();
  const data = useMemo(() => ({
    datasets: modelFrontierDatasets(models, theme.accent),
  }), [models, theme.accent]);
  const options = useMemo<ChartOptions<"scatter">>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: theme.reducedMotion ? false : { duration: 450 },
    interaction: { intersect: false, mode: "nearest" },
    plugins: {
      legend: {
        position: "bottom",
        labels: { boxHeight: 7, boxWidth: 7, color: theme.muted, padding: 14, pointStyle: "circle", usePointStyle: true },
      },
      tooltip: {
        backgroundColor: theme.tooltip,
        borderColor: theme.tooltipBorder,
        borderWidth: 1,
        callbacks: {
          title: (items) => String((items[0]?.raw as { model?: string } | undefined)?.model ?? items[0]?.dataset.label ?? "Model"),
          label: (context) => {
            const price = context.parsed.x === null
              ? MISSING_VALUE
              : `${formatDisplayUsd(context.parsed.x)}/1M input`;
            const evidence = context.parsed.y === null
              ? MISSING_VALUE
              : formatDisplayNumber(context.parsed.y);
            return `${price} · evidence ${evidence}`;
          },
          afterLabel: (context) => (context.raw as { frontier?: boolean }).frontier ? "Value frontier" : "",
        },
        displayColors: false,
        titleColor: theme.strong,
        bodyColor: theme.muted,
      },
    },
    scales: {
      x: {
        type: logScale ? "logarithmic" : "linear",
        beginAtZero: !logScale,
        border: { color: theme.grid },
        grid: { color: theme.grid },
        ticks: { color: theme.muted, callback: (value) => formatDisplayUsd(Number(value)) },
        title: { color: theme.muted, display: true, text: "Input price / 1M tokens" },
      },
      y: {
        min: 78,
        max: 100,
        border: { color: theme.grid },
        grid: { color: theme.grid },
        ticks: { color: theme.muted, callback: (value) => formatDisplayNumber(Number(value)) },
        title: { color: theme.muted, display: true, text: "Evidence score" },
      },
    },
  }), [logScale, theme]);

  return (
    <div className="h-[360px] w-full" role="img" aria-label="Model price and evidence frontier">
      <Scatter data={data} options={options} />
      <p className="sr-only">The frontier chart plots model input price against evidence score. Value-frontier models use larger diamonds and are also labelled in the chart legend and tooltip. Models without published price or score are excluded rather than plotted as zero.</p>
    </div>
  );
}

export function CapabilityRadarChart() {
  return <ChartUnavailable>Published category-level capability facts are required before a comparison radar can be shown.</ChartUnavailable>;
}

export function ModelCapabilityRadar({ model }: { model: CatalogModel }) {
  return <ChartUnavailable>Published category-level capability facts are not available for {model.name}.</ChartUnavailable>;
}

export function ModelSlaHistoryChart({ model }: { model: CatalogModel }) {
  return <ChartUnavailable>Published TTFT and throughput history is not available for {model.name}.</ChartUnavailable>;
}

export function ComparisonRadarChart({ models }: { models: CatalogModel[] }) {
  return <ChartUnavailable>Published category-level capability facts are required before a radar can compare {models.length} selected model{models.length === 1 ? "" : "s"}.</ChartUnavailable>;
}

export function ComparisonEconomicsCharts({ models }: { models: CatalogModel[] }) {
  const theme = useChartTheme();
  const colors = models.map((model, index) => index === 0 ? theme.accent : model.color);
  const labels = models.map((model) => model.name);
  const optionFor = (axisTitle: string, money = false): ChartOptions<"bar"> => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: theme.reducedMotion ? false : { duration: 400 },
    plugins: { legend: { display: false }, tooltip: { backgroundColor: theme.tooltip, borderColor: theme.tooltipBorder, borderWidth: 1, displayColors: false, titleColor: theme.strong, bodyColor: theme.muted } },
    scales: {
      x: { border: { color: theme.grid }, grid: { display: false }, ticks: { color: theme.muted, maxRotation: 0 } },
      y: { beginAtZero: true, border: { color: theme.grid }, grid: { color: theme.grid }, ticks: { color: theme.muted, callback: money ? (value) => formatDisplayUsd(Number(value)) : (value) => formatDisplayNumber(Number(value)) }, title: { color: theme.muted, display: true, text: axisTitle } },
    },
  });
  const charts = [
    { title: "Blended token price", description: "75% input and 25% output per million tokens.", values: models.map((model) => model.inputPrice === null || model.outputPrice === null ? null : model.inputPrice * 0.75 + model.outputPrice * 0.25), options: optionFor("USD / 1M blended tokens", true) },
    { title: "Observed throughput", description: "Comparable tokens per second where available.", values: models.map((model) => model.speed), options: optionFor("Tokens / second") },
    { title: "Context capacity", description: "Published maximum context window.", values: models.map((model) => model.context / 1_000), options: optionFor("Thousands of tokens") },
  ];
  return <div className="grid gap-4 xl:grid-cols-3">{charts.map((chart) => <div className="rounded-xl border border-border bg-card p-4" key={chart.title}><h3 className="font-medium">{chart.title}</h3><p className="mt-1 text-xs text-muted-foreground">{chart.description}</p><div aria-label={`${chart.title} chart`} className="mt-4 h-[250px]" role="img"><Bar data={{ labels, datasets: [{ data: chart.values, backgroundColor: colors, borderColor: colors, borderRadius: 6, borderWidth: 1 }] }} options={chart.options} /></div></div>)}</div>;
}

export function SubscriptionBreakevenChart({ costPerMillion, subscriptionCost, crossoverMillions, currentMillions }: { costPerMillion: number; subscriptionCost: number; crossoverMillions: number | null; currentMillions: number }) {
  const theme = useChartTheme();
  const maxVolume = Math.max(10, Math.ceil(currentMillions * 1.4), Math.ceil((crossoverMillions ?? 0) * 2));
  const volumes = Array.from({ length: 9 }, (_, index) => Number(((maxVolume / 8) * index).toFixed(2)));
  const data = useMemo(() => ({
    labels: volumes,
    datasets: [
      { label: "API estimate", data: volumes.map((volume) => volume * costPerMillion), borderColor: "#5489d6", backgroundColor: "rgba(84,137,214,.14)", pointRadius: 2, tension: 0.2 },
      { label: "Subscription", data: volumes.map(() => subscriptionCost), borderColor: "#d97757", backgroundColor: "rgba(217,119,87,.12)", pointRadius: 0, borderDash: [6, 4], tension: 0 },
    ],
  }), [costPerMillion, subscriptionCost, volumes]);
  const options = useMemo<ChartOptions<"line">>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: theme.reducedMotion ? false : { duration: 400 },
    interaction: { intersect: false, mode: "index" },
    plugins: { legend: { position: "bottom", labels: { color: theme.muted, pointStyle: "circle", usePointStyle: true } }, tooltip: { backgroundColor: theme.tooltip, borderColor: theme.tooltipBorder, borderWidth: 1, callbacks: { title: (items) => `${items[0]?.label}M monthly tokens`, label: (context) => `${context.dataset.label}: ${formatDisplayUsd(Number(context.parsed.y))}` }, titleColor: theme.strong, bodyColor: theme.muted } },
    scales: { x: { border: { color: theme.grid }, grid: { color: theme.grid }, ticks: { color: theme.muted, callback: (value, index) => `${formatDisplayNumber(volumes[index] ?? Number(value))}M` }, title: { color: theme.muted, display: true, text: "Monthly token volume" } }, y: { beginAtZero: true, border: { color: theme.grid }, grid: { color: theme.grid }, ticks: { color: theme.muted, callback: (value) => formatDisplayUsd(Number(value)) }, title: { color: theme.muted, display: true, text: "Monthly USD" } } },
  }), [theme, volumes]);
  return <div aria-label="API versus subscription breakeven chart" className="h-[360px] w-full" role="img"><Line data={data} options={options} /><p className="sr-only">The subscription line uses dashes. API cost rises with monthly token volume while the selected subscription remains flat at {formatDisplayUsd(subscriptionCost)}. {crossoverMillions === null ? "No crossover is available." : `The estimated crossover is ${formatDisplayNumber(crossoverMillions)} million tokens.`}</p></div>;
}
