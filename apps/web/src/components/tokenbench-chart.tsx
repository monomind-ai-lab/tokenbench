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

import type { CatalogModel } from "@/lib/model-catalog";

ChartJS.register(BarElement, CategoryScale, Filler, LinearScale, LogarithmicScale, PointElement, RadialLinearScale, LineElement, Tooltip, Legend);

const chartData = {
  datasets: [
    {
      label: "OpenAI",
      data: [
        { x: 0.15, y: 86 },
        { x: 1.25, y: 92 },
        { x: 2.5, y: 96 },
      ],
      backgroundColor: "#f4f4f5",
      borderColor: "#f4f4f5",
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

function useChartTheme() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setDark(root.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class", "data-theme"] });
    return () => observer.disconnect();
  }, []);

  return dark ? {
    grid: "rgba(255,255,255,.07)",
    muted: "#a1a1aa",
    strong: "#fafafa",
    tooltip: "#18181b",
    tooltipBorder: "#3f3f46",
  } : {
    grid: "rgba(0,0,0,.09)",
    muted: "#71717a",
    strong: "#18181b",
    tooltip: "#ffffff",
    tooltipBorder: "#d4d4d8",
  };
}

export function TokenBenchChart() {
  const theme = useChartTheme();
  const options = useMemo<ChartOptions<"scatter">>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 500 },
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
          label: (context) => `${context.dataset.label}: $${context.parsed.x}/1M · score ${context.parsed.y}`,
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
        ticks: { color: theme.muted, callback: (value) => `$${value}` },
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
      <Scatter data={chartData} options={options} />
    </div>
  );
}

export function ModelFrontierChart({ models, logScale }: { models: CatalogModel[]; logScale: boolean }) {
  const theme = useChartTheme();
  const data = useMemo(() => ({
    datasets: Array.from(new Set(models.map((model) => model.provider))).map((provider) => ({
      label: provider,
      data: models
        .filter((model) => model.provider === provider && model.inputPrice !== null && model.score !== null)
        .map((model) => ({ x: model.inputPrice as number, y: model.score as number, model: model.name })),
      backgroundColor: models.find((model) => model.provider === provider)?.color ?? "#a1a1aa",
      borderColor: models.find((model) => model.provider === provider)?.color ?? "#a1a1aa",
      pointRadius: 5,
      pointHoverRadius: 8,
    })),
  }), [models]);
  const options = useMemo<ChartOptions<"scatter">>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 450 },
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
          label: (context) => `$${context.parsed.x}/1M input · evidence ${context.parsed.y}`,
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
        ticks: { color: theme.muted, callback: (value) => `$${value}` },
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
      <p className="sr-only">The frontier chart plots model input price against evidence score. Models without published price or score are excluded rather than plotted as zero.</p>
    </div>
  );
}

const radarData = {
  labels: ["Agentic", "Coding", "Reasoning", "Math", "Multimodal", "Throughput"],
  datasets: [
    {
      label: "GPT-4o",
      data: [89, 90, 89, 88, 92, 82],
      borderColor: "#f4f4f5",
      backgroundColor: "rgba(244,244,245,.08)",
      pointBackgroundColor: "#f4f4f5",
      pointRadius: 3,
      borderWidth: 2,
    },
    {
      label: "DeepSeek V3",
      data: [87, 92, 89, 89, 75, 68],
      borderColor: "#5489d6",
      backgroundColor: "rgba(84,137,214,.10)",
      pointBackgroundColor: "#5489d6",
      pointRadius: 3,
      borderWidth: 2,
    },
  ],
};

export function CapabilityRadarChart() {
  const theme = useChartTheme();
  const options = useMemo<ChartOptions<"radar">>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 500 },
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
      <Radar data={radarData} options={options} />
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
    datasets: [{ label: model.name, data: values, borderColor: model.color, backgroundColor: `${model.color}20`, pointBackgroundColor: model.color, pointRadius: 3, borderWidth: 2 }],
  }), [model, values]);
  const options = useMemo<ChartOptions<"radar">>(() => ({
    responsive: true,
    maintainAspectRatio: false,
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
      { label: "TTFT (seconds)", data: ttft, borderColor: model.color, backgroundColor: `${model.color}22`, pointRadius: 3, tension: 0.35, yAxisID: "y" },
      { label: "Throughput (tokens/s)", data: throughput, borderColor: "#8b9cc5", backgroundColor: "rgba(139,156,197,.16)", pointRadius: 3, tension: 0.35, yAxisID: "y1" },
    ],
  }), [model, throughput, ttft]);
  const options = useMemo<ChartOptions<"line">>(() => ({
    responsive: true,
    maintainAspectRatio: false,
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
    datasets: models.map((model) => ({
      label: model.name,
      data: comparisonCapabilityValues(model),
      borderColor: model.color,
      backgroundColor: `${model.color}12`,
      pointBackgroundColor: model.color,
      pointRadius: 3,
      borderWidth: 2,
      spanGaps: false,
    })),
  }), [models]);
  const options = useMemo<ChartOptions<"radar">>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: "bottom", labels: { color: theme.muted, pointStyle: "circle", usePointStyle: true } }, tooltip: { backgroundColor: theme.tooltip, borderColor: theme.tooltipBorder, borderWidth: 1, titleColor: theme.strong, bodyColor: theme.muted } },
    scales: { r: { beginAtZero: true, max: 100, min: 0, angleLines: { color: theme.grid }, grid: { color: theme.grid }, pointLabels: { color: theme.muted, font: { size: 11 } }, ticks: { display: false } } },
  }), [theme]);
  return <div aria-label={`${models.map((model) => model.name).join(", ")} capability radar`} className="h-[380px] w-full" role="img"><Radar data={data} options={options} /><p className="sr-only">Exact capability values are available in the adjacent table. Unavailable throughput values are left empty rather than set to zero.</p></div>;
}

export function ComparisonEconomicsCharts({ models }: { models: CatalogModel[] }) {
  const theme = useChartTheme();
  const colors = models.map((model) => model.color);
  const labels = models.map((model) => model.name);
  const optionFor = (axisTitle: string, money = false): ChartOptions<"bar"> => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
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
    interaction: { intersect: false, mode: "index" },
    plugins: { legend: { position: "bottom", labels: { color: theme.muted, pointStyle: "circle", usePointStyle: true } }, tooltip: { backgroundColor: theme.tooltip, borderColor: theme.tooltipBorder, borderWidth: 1, callbacks: { title: (items) => `${items[0]?.label}M monthly tokens`, label: (context) => `${context.dataset.label}: $${Number(context.parsed.y).toFixed(2)}` }, titleColor: theme.strong, bodyColor: theme.muted } },
    scales: { x: { border: { color: theme.grid }, grid: { color: theme.grid }, ticks: { color: theme.muted, callback: (value, index) => `${volumes[index]}M` }, title: { color: theme.muted, display: true, text: "Monthly token volume" } }, y: { beginAtZero: true, border: { color: theme.grid }, grid: { color: theme.grid }, ticks: { color: theme.muted, callback: (value) => `$${value}` }, title: { color: theme.muted, display: true, text: "Monthly USD" } } },
  }), [theme, volumes]);
  return <div aria-label="API versus subscription breakeven chart" className="h-[360px] w-full" role="img"><Line data={data} options={options} /><p className="sr-only">API cost rises with monthly token volume while the selected subscription remains flat at ${subscriptionCost.toFixed(2)}. {crossoverMillions === null ? "No crossover is available." : `The estimated crossover is ${crossoverMillions.toFixed(2)} million tokens.`}</p></div>;
}
