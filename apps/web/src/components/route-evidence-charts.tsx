"use client";

import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  RadialLinearScale,
  Tooltip,
  type ChartOptions,
} from "chart.js";
import { useEffect, useMemo, useState } from "react";
import { Bar, Radar } from "react-chartjs-2";

import { formatDisplayNumber, formatDisplayUsd } from "@tokenbench/frontend/display-format";
import type { SurfaceModel } from "@tokenbench/frontend/model-surface-projectors";

ChartJS.register(
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  RadialLinearScale,
  Tooltip,
);

const SERIES = ["#1111ff", "#5489d6", "#d97757", "#66a98d"];

interface Theme {
  readonly grid: string;
  readonly muted: string;
  readonly reducedMotion: boolean;
  readonly strong: string;
  readonly tooltip: string;
}

function fallbackTheme(dark: boolean, reducedMotion: boolean): Theme {
  return dark
    ? { grid: "rgba(255,255,255,.12)", muted: "#a1a1aa", reducedMotion, strong: "#fafafa", tooltip: "#18181b" }
    : { grid: "rgba(0,0,0,.10)", muted: "#71717a", reducedMotion, strong: "#18181b", tooltip: "#ffffff" };
}

function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(() => fallbackTheme(true, false));
  useEffect(() => {
    const root = document.documentElement;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      const fallback = fallbackTheme(root.classList.contains("dark"), motion.matches);
      const styles = window.getComputedStyle(root);
      const color = (name: string, value: string) => styles.getPropertyValue(name).trim() || value;
      setTheme({
        ...fallback,
        grid: color("--border", fallback.grid),
        muted: color("--muted-foreground", fallback.muted),
        strong: color("--foreground", fallback.strong),
        tooltip: color("--popover", fallback.tooltip),
      });
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class", "data-theme"] });
    motion.addEventListener("change", sync);
    return () => {
      observer.disconnect();
      motion.removeEventListener("change", sync);
    };
  }, []);
  return theme;
}

function transparent(color: string, alpha: string) {
  return `color-mix(in srgb, ${color} ${alpha}, transparent)`;
}

export function RouteEvidenceCapabilityRadar({ models }: { models: readonly SurfaceModel[] }) {
  const theme = useTheme();
  const axes = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const model of models) {
      for (const axis of model.capabilityAxes) byKey.set(axis.key, axis.label);
    }
    return [...byKey].map(([key, label]) => ({ key, label }));
  }, [models]);
  const chartModels = models.filter(
    (model) => model.capabilityAxes.filter((axis) => axis.percentile !== null).length >= 3,
  );
  const data = useMemo(() => ({
    labels: axes.map((axis) => axis.label),
    datasets: chartModels.map((model, index) => {
      const color = SERIES[index % SERIES.length] ?? SERIES[0]!;
      const values = new Map(model.capabilityAxes.map((axis) => [axis.key, axis.percentile]));
      return {
        label: model.name,
        data: axes.map((axis) => values.get(axis.key) ?? null),
        backgroundColor: transparent(color, "12%"),
        borderColor: color,
        borderWidth: 2,
        pointBackgroundColor: color,
        pointRadius: 3,
        spanGaps: false,
      };
    }),
  }), [axes, chartModels]);
  const options = useMemo<ChartOptions<"radar">>(() => ({
    animation: theme.reducedMotion ? false : { duration: 400 },
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: theme.muted, pointStyle: "circle", usePointStyle: true }, position: "bottom" },
      tooltip: { backgroundColor: theme.tooltip, borderColor: theme.grid, borderWidth: 1, bodyColor: theme.strong, titleColor: theme.strong },
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

  if (axes.length < 3 || chartModels.length === 0) return null;
  return (
    <div aria-label={`Capability radar for ${chartModels.map((model) => model.name).join(", ")}`} className="h-[360px] min-w-0" role="img">
      <Radar data={data} options={options} />
      <p className="sr-only">Only published capability axes are plotted. Missing axes remain gaps and are not replaced with zero.</p>
    </div>
  );
}

function MetricBars({
  ariaLabel,
  format,
  models,
  title,
  value,
}: {
  ariaLabel: string;
  format: (value: number) => string;
  models: readonly SurfaceModel[];
  title: string;
  value: (model: SurfaceModel) => number | null;
}) {
  const theme = useTheme();
  const rows = models.flatMap((model) => {
    const measurement = value(model);
    return measurement === null ? [] : [{ model, measurement }];
  });
  const data = useMemo(() => ({
    labels: rows.map((row) => row.model.name),
    datasets: [{
      label: title,
      data: rows.map((row) => row.measurement),
      backgroundColor: rows.map((_, index) => SERIES[index % SERIES.length] ?? SERIES[0]!),
      borderRadius: 5,
    }],
  }), [rows, title]);
  const options = useMemo<ChartOptions<"bar">>(() => ({
    animation: theme.reducedMotion ? false : { duration: 400 },
    indexAxis: "y",
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: theme.tooltip,
        borderColor: theme.grid,
        borderWidth: 1,
        bodyColor: theme.strong,
        callbacks: { label: (context) => `${title}: ${format(Number(context.raw))}` },
        displayColors: false,
        titleColor: theme.strong,
      },
    },
    responsive: true,
    scales: {
      x: { beginAtZero: true, border: { color: theme.grid }, grid: { color: theme.grid }, ticks: { color: theme.muted, callback: (tick) => format(Number(tick)) } },
      y: { border: { color: theme.grid }, grid: { display: false }, ticks: { color: theme.muted } },
    },
  }), [format, theme, title]);

  if (rows.length === 0) return null;
  return <div aria-label={ariaLabel} className="h-[260px] min-w-0" role="img"><Bar data={data} options={options} /></div>;
}

export function RouteEvidenceRuntimeCharts({ models }: { models: readonly SurfaceModel[] }) {
  const ttft = models.some((model) => model.ttftP50Seconds !== null);
  const throughput = models.some((model) => model.outputTokensPerSecond !== null);
  if (!ttft && !throughput) return null;
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      {ttft ? <MetricBars ariaLabel="Accepted p50 time to first token by model" format={(value) => `${formatDisplayNumber(value)} s`} models={models} title="TTFT p50" value={(model) => model.ttftP50Seconds} /> : null}
      {throughput ? <MetricBars ariaLabel="Accepted p50 output throughput by model" format={(value) => `${formatDisplayNumber(value)} tok/s`} models={models} title="Output throughput p50" value={(model) => model.outputTokensPerSecond} /> : null}
    </div>
  );
}

export function RouteEvidencePriceCharts({ models }: { models: readonly SurfaceModel[] }) {
  const input = models.some((model) => model.inputUsdPerMillion !== null);
  const output = models.some((model) => model.outputUsdPerMillion !== null);
  if (!input && !output) return null;
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      {input ? <MetricBars ariaLabel="Selected-route input price by model" format={formatDisplayUsd} models={models} title="Input price / 1M" value={(model) => model.inputUsdPerMillion} /> : null}
      {output ? <MetricBars ariaLabel="Selected-route output price by model" format={formatDisplayUsd} models={models} title="Output price / 1M" value={(model) => model.outputUsdPerMillion} /> : null}
    </div>
  );
}
