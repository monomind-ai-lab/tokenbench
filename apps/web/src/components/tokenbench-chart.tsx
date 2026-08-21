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
import { Bar, Line, Radar, Scatter } from "react-chartjs-2";

import {
  formatDisplayNumber,
  formatDisplayUsd,
} from "@tokenbench/frontend/display-format";

import type { CatalogModel } from "@/lib/model-catalog";

ChartJS.register(BarElement, CategoryScale, Filler, LinearScale, LogarithmicScale, PointElement, RadialLinearScale, LineElement, Tooltip, Legend);

const MONOMIND_CHART_ACCENT = "#1111ff";

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
  const accent = dark ? "#9696ff" : MONOMIND_CHART_ACCENT;
  return dark ? {
    accent,
    accentFill: "rgba(150,150,255,.20)",
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

function tokenBenchChartData() {
  return {
    datasets: [
      {
        label: "OpenAI",
        data: [
          { x: 0.15, y: 86 },
          { x: 1.25, y: 92 },
          { x: 2.5, y: 96 },
        ],
        backgroundColor: "#7c8fd1",
        borderColor: "#7c8fd1",
        pointRadius: 5,
        pointHoverRadius: 7,
      },
      {
        label: "Anthropic",
        data: [
          { x: 0.8, y: 88 },
          { x: 3, y: 95 },
          { x: 5, y: 98 },
        ],
        backgroundColor: "#d97757",
        borderColor: "#d97757",
        pointRadius: 5,
        pointHoverRadius: 7,
      },
      {
        label: "Google",
        data: [
          { x: 0.1, y: 84 },
          { x: 0.35, y: 90 },
          { x: 2, y: 97 },
        ],
        backgroundColor: "#5489d6",
        borderColor: "#5489d6",
        pointRadius: 5,
        pointHoverRadius: 7,
      },
    ],
  };
}

export function TokenBenchChart() {
  const theme = useChartTheme();
  const data = useMemo(() => tokenBenchChartData(), []);
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
              ? "Price unavailable"
              : `${formatDisplayUsd(context.parsed.x)}/1M`;
            const score = context.parsed.y === null
              ? "Unavailable"
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
        ticks: { color: theme.muted },
        title: { color: theme.muted, display: true, text: "Evidence score" },
      },
    },
  }), [theme]);

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
              ? "Input price unavailable"
              : `${formatDisplayUsd(context.parsed.x)}/1M input`;
            const evidence = context.parsed.y === null
              ? "Unavailable"
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
        ticks: { color: theme.muted },
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

function capabilityRadarData() {
  return {
    labels: ["Agentic", "Coding", "Reasoning", "Math", "Multimodal", "Throughput"],
    datasets: [
      {
        label: "GPT-4o",
        data: [89, 90, 89, 88, 92, 82],
        borderColor: "#7c8fd1",
        backgroundColor: "rgba(124,143,209,.10)",
        pointBackgroundColor: "#7c8fd1",
        pointRadius: 3,
        pointStyle: "circle" as const,
        borderWidth: 2,
      },
      {
        label: "DeepSeek V3",
        data: [87, 92, 89, 89, 75, 68],
        borderColor: "#d97757",
        backgroundColor: "rgba(217,119,87,.10)",
        pointBackgroundColor: "#d97757",
        pointRadius: 3,
        pointStyle: "circle" as const,
        borderWidth: 2,
      },
    ],
  };
}

export function CapabilityRadarChart() {
  const theme = useChartTheme();
  const data = useMemo(() => capabilityRadarData(), []);
  const options = useMemo<ChartOptions<"radar">>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: theme.reducedMotion ? false : { duration: 500 },
    plugins: {
      legend: {
        position: "bottom",
        labels: { color: theme.muted, pointStyle: "circle", usePointStyle: true },
      },
      tooltip: {
        backgroundColor: theme.tooltip,
        borderColor: theme.tooltipBorder,
        borderWidth: 1,
        titleColor: theme.strong,
        bodyColor: theme.muted,
      },
    },
    scales: {
      r: {
        beginAtZero: true,
        max: 100,
        min: 0,
        angleLines: { color: theme.grid },
        grid: { color: theme.grid },
        pointLabels: { color: theme.muted, font: { size: 11 } },
        ticks: { backdropColor: "transparent", color: theme.muted, display: false, stepSize: 20 },
      },
    },
  }), [theme]);

  return (
    <div className="h-[340px] w-full" role="img" aria-label="GPT-4o and DeepSeek V3 capability comparison">
      <Radar data={data} options={options} />
      <p className="sr-only">GPT-4o: Agentic 89, Coding 90, Reasoning 89, Math 88, Multimodal 92, Throughput 82. DeepSeek V3: Agentic 87, Coding 92, Reasoning 89, Math 89, Multimodal 75, Throughput 68.</p>
    </div>
  );
}

export function ModelCapabilityRadar({ model }: { model: CatalogModel }) {
  const theme = useChartTheme();
  const values = useMemo(() => {
    const base = model.score ?? 72;
    return [base, Math.max(45, base - (model.category === "Code" ? -3 : 5)), Math.max(45, base - (model.category === "Reasoning" ? -2 : 4)), Math.max(45, base - 7), Math.max(40, base - (model.category === "Flagship" ? 2 : 11)), model.speed ?? Math.max(35, base - 18)];
  }, [model]);
  const data = useMemo(() => ({
    labels: ["Agentic", "Coding", "Reasoning", "Knowledge", "Multimodal", "Throughput"],
    datasets: [{ label: model.name, data: values, borderColor: theme.accent, backgroundColor: theme.accentFill, pointBackgroundColor: theme.accent, pointRadius: 4, pointStyle: "rectRot" as const, borderWidth: 3 }],
  }), [model.name, theme.accent, theme.accentFill, values]);
  const options = useMemo<ChartOptions<"radar">>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: theme.reducedMotion ? false : { duration: 400 },
    plugins: { legend: { display: false }, tooltip: { backgroundColor: theme.tooltip, borderColor: theme.tooltipBorder, borderWidth: 1, displayColors: false, titleColor: theme.strong, bodyColor: theme.muted } },
    scales: { r: { beginAtZero: true, max: 100, min: 0, angleLines: { color: theme.grid }, grid: { color: theme.grid }, pointLabels: { color: theme.muted, font: { size: 11 } }, ticks: { display: false } } },
  }), [theme]);
  return <div aria-label={`${model.name} capability profile`} className="h-[340px] w-full" role="img"><Radar data={data} options={options} /><p className="sr-only">{values.map((value, index) => `${["Agentic", "Coding", "Reasoning", "Knowledge", "Multimodal", "Throughput"][index]} ${value}`).join(", ")}.</p></div>;
}

export function ModelSlaHistoryChart({ model }: { model: CatalogModel }) {
  const theme = useChartTheme();
  const { throughput, ttft } = useMemo(() => {
    const speed = model.speed ?? 55;
    return {
      ttft: [1.22, 1.08, 1.14, 0.98, 1.04, 0.91].map((value) => Number((value * (100 / speed)).toFixed(2))),
      throughput: [0.92, 0.97, 0.94, 1.02, 1.06, 1.03].map((value) => Math.round(value * speed)),
    };
  }, [model.speed]);
  const data = useMemo(() => ({
    labels: ["Mar", "Apr", "May", "Jun", "Jul", "Aug"],
    datasets: [
      { label: "TTFT (seconds)", data: ttft, borderColor: theme.accent, backgroundColor: theme.accentFill, pointRadius: 4, pointStyle: "rectRot" as const, tension: 0.35, yAxisID: "y" },
      { label: "Throughput (tokens/s)", data: throughput, borderColor: "#8b9cc5", backgroundColor: "rgba(139,156,197,.16)", pointRadius: 3, tension: 0.35, yAxisID: "y1" },
    ],
  }), [theme.accent, theme.accentFill, throughput, ttft]);
  const options = useMemo<ChartOptions<"line">>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: theme.reducedMotion ? false : { duration: 400 },
    interaction: { intersect: false, mode: "index" },
    plugins: { legend: { position: "bottom", labels: { color: theme.muted, pointStyle: "circle", usePointStyle: true } }, tooltip: { backgroundColor: theme.tooltip, borderColor: theme.tooltipBorder, borderWidth: 1, titleColor: theme.strong, bodyColor: theme.muted } },
    scales: {
      x: { border: { color: theme.grid }, grid: { color: theme.grid }, ticks: { color: theme.muted } },
      y: { beginAtZero: true, border: { color: theme.grid }, grid: { color: theme.grid }, ticks: { color: theme.muted }, title: { color: theme.muted, display: true, text: "TTFT seconds" } },
      y1: { beginAtZero: true, border: { color: theme.grid }, grid: { drawOnChartArea: false }, position: "right", ticks: { color: theme.muted }, title: { color: theme.muted, display: true, text: "Tokens / second" } },
    },
  }), [theme]);
  return <div aria-label={`${model.name} time-to-first-token and throughput history`} className="h-[330px] w-full" role="img"><Line data={data} options={options} /><p className="sr-only">Six-month observed TTFT and throughput history. Missing provider observations remain absent rather than being estimated as zero.</p></div>;
}

function comparisonCapabilityValues(model: CatalogModel) {
  const base = model.score ?? 68;
  return [base, Math.max(40, base + (model.category === "Code" ? 3 : -4)), Math.max(40, base + (model.category === "Reasoning" ? 2 : -3)), Math.max(40, base - 6), Math.max(35, base + (model.category === "Flagship" ? -2 : -10)), model.speed];
}

export function ComparisonRadarChart({ models }: { models: CatalogModel[] }) {
  const theme = useChartTheme();
  const data = useMemo(() => ({
    labels: ["Agentic", "Coding", "Reasoning", "Knowledge", "Multimodal", "Throughput"],
    datasets: models.map((model, index) => ({
      label: model.name,
      data: comparisonCapabilityValues(model),
      borderColor: index === 0 ? theme.accent : model.color,
      backgroundColor: index === 0 ? theme.accentFill : `${model.color}12`,
      pointBackgroundColor: index === 0 ? theme.accent : model.color,
      pointRadius: index === 0 ? 4 : 3,
      pointStyle: index === 0 ? "rectRot" as const : "circle" as const,
      borderWidth: index === 0 ? 3 : 2,
      spanGaps: false,
    })),
  }), [models, theme.accent, theme.accentFill]);
  const options = useMemo<ChartOptions<"radar">>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: theme.reducedMotion ? false : { duration: 400 },
    plugins: { legend: { position: "bottom", labels: { color: theme.muted, pointStyle: "circle", usePointStyle: true } }, tooltip: { backgroundColor: theme.tooltip, borderColor: theme.tooltipBorder, borderWidth: 1, titleColor: theme.strong, bodyColor: theme.muted } },
    scales: { r: { beginAtZero: true, max: 100, min: 0, angleLines: { color: theme.grid }, grid: { color: theme.grid }, pointLabels: { color: theme.muted, font: { size: 11 } }, ticks: { display: false } } },
  }), [theme]);
  return <div aria-label={`${models.map((model) => model.name).join(", ")} capability radar`} className="h-[380px] w-full" role="img"><Radar data={data} options={options} /><p className="sr-only">The first selected model uses a thicker diamond marker; the other selected models use circles. Exact capability values are available in the adjacent table. Unavailable throughput values are left empty rather than set to zero.</p></div>;
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
      y: { beginAtZero: true, border: { color: theme.grid }, grid: { color: theme.grid }, ticks: { color: theme.muted, callback: money ? (value) => `$${value}` : undefined }, title: { color: theme.muted, display: true, text: axisTitle } },
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
    plugins: { legend: { position: "bottom", labels: { color: theme.muted, pointStyle: "circle", usePointStyle: true } }, tooltip: { backgroundColor: theme.tooltip, borderColor: theme.tooltipBorder, borderWidth: 1, callbacks: { title: (items) => `${items[0]?.label}M monthly tokens`, label: (context) => `${context.dataset.label}: $${Number(context.parsed.y).toFixed(2)}` }, titleColor: theme.strong, bodyColor: theme.muted } },
    scales: { x: { border: { color: theme.grid }, grid: { color: theme.grid }, ticks: { color: theme.muted, callback: (value, index) => `${formatDisplayNumber(volumes[index] ?? Number(value))}M` }, title: { color: theme.muted, display: true, text: "Monthly token volume" } }, y: { beginAtZero: true, border: { color: theme.grid }, grid: { color: theme.grid }, ticks: { color: theme.muted, callback: (value) => formatDisplayUsd(Number(value)) }, title: { color: theme.muted, display: true, text: "Monthly USD" } } },
  }), [theme, volumes]);
  return <div aria-label="API versus subscription breakeven chart" className="h-[360px] w-full" role="img"><Line data={data} options={options} /><p className="sr-only">The subscription line uses dashes. API cost rises with monthly token volume while the selected subscription remains flat at ${subscriptionCost.toFixed(2)}. {crossoverMillions === null ? "No crossover is available." : `The estimated crossover is ${crossoverMillions.toFixed(2)} million tokens.`}</p></div>;
}
