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

import {
  formatDisplayNumber,
  formatDisplayUsd,
} from "@tokenbench/frontend/display-format";
import type { LeaderboardDisplayRow } from "@tokenbench/frontend/leaderboard-detail";

ChartJS.register(BarElement, CategoryScale, Legend, LinearScale, PointElement, Tooltip);

const COLORS = ["#5489d6", "#d97757", "#7c8fd1", "#66a98d", "#c49a53", "#9a7cc1"];
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
  return dark ? {
    accent,
    grid: "rgba(255,255,255,.07)",
    muted: "#a1a1aa",
    reducedMotion,
    strong: "#fafafa",
    tooltip: "#18181b",
    tooltipBorder: accent,
  } : {
    accent,
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

function useLeaderboardChartTheme() {
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

function providerColor(provider: string) {
  let hash = 0;
  for (const character of provider) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

export function leaderboardCostScoreDatasets(rows: readonly LeaderboardDisplayRow[], accent: string) {
  const providers = Array.from(new Set(rows.map((row) => row.provider)));
  const frontierRows = rows.filter((row) => row.frontier);
  const providerDatasets = providers.map((provider) => ({
    label: provider,
    data: rows.filter((row) => row.provider === provider && !row.frontier).map((row) => ({
      x: row.blendedUsdPerMillion as number,
      y: row.metric as number,
      model: row.name,
      frontier: row.frontier,
    })),
    backgroundColor: providerColor(provider),
    borderColor: providerColor(provider),
    pointRadius: 4,
    pointHoverRadius: 8,
    pointStyle: "circle" as const,
    borderWidth: 1,
  })).filter((dataset) => dataset.data.length > 0);

  return frontierRows.length === 0 ? providerDatasets : [
    ...providerDatasets,
    {
      label: "Value frontier",
      data: frontierRows.map((row) => ({
        x: row.blendedUsdPerMillion as number,
        y: row.metric as number,
        model: row.name,
        frontier: true,
      })),
      backgroundColor: accent,
      borderColor: accent,
      pointRadius: 7,
      pointHoverRadius: 9,
      pointStyle: "rectRot" as const,
      borderWidth: 2,
    },
  ];
}

export function LeaderboardScoreChart({ rows, label }: { rows: readonly LeaderboardDisplayRow[]; label: string }) {
  const theme = useLeaderboardChartTheme();
  const visibleRows = rows.filter((row) => row.metric !== null).slice(0, 14);
  const data = useMemo(() => ({
    labels: visibleRows.map((row) => row.name),
    datasets: [{
      label,
      data: visibleRows.map((row) => row.metric),
      backgroundColor: visibleRows.map((row) => providerColor(row.provider)),
      borderColor: visibleRows.map((row) => providerColor(row.provider)),
      borderRadius: 5,
      borderWidth: 1,
    }],
  }), [label, visibleRows]);
  const options = useMemo<ChartOptions<"bar">>(() => ({
    responsive: true,
    maintainAspectRatio: false,
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
        callbacks: { label: (context) => formatDisplayNumber(Number(context.raw)) },
      },
    },
    scales: {
      x: { border: { color: theme.grid }, grid: { display: false }, ticks: { color: theme.muted, maxRotation: 45, minRotation: 0 } },
      y: { beginAtZero: true, border: { color: theme.grid }, grid: { color: theme.grid }, ticks: { color: theme.muted, callback: (value) => formatDisplayNumber(Number(value)) }, title: { color: theme.muted, display: true, text: label } },
    },
  }), [label, theme]);
  if (!visibleRows.length) return null;
  return <div aria-label={`${label} by model`} className="h-[330px] w-full" role="img"><Bar data={data} options={options} /><p className="sr-only">Published {label.toLocaleLowerCase()} for {visibleRows.length} models. Unavailable measurements are omitted rather than plotted as zero.</p></div>;
}

export function LeaderboardCostScoreChart({
  label = "Published score",
  rows,
}: {
  label?: string;
  rows: readonly LeaderboardDisplayRow[];
}) {
  const theme = useLeaderboardChartTheme();
  const visibleRows = rows.filter((row) => row.metric !== null && row.blendedUsdPerMillion !== null);
  const data = useMemo(() => ({
    datasets: leaderboardCostScoreDatasets(visibleRows, theme.accent),
  }), [theme.accent, visibleRows]);
  const options = useMemo<ChartOptions<"scatter">>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: theme.reducedMotion ? false : { duration: 400 },
    interaction: { intersect: false, mode: "nearest" },
    plugins: {
      legend: { position: "bottom", labels: { color: theme.muted, pointStyle: "circle", usePointStyle: true } },
      tooltip: {
        backgroundColor: theme.tooltip,
        borderColor: theme.tooltipBorder,
        borderWidth: 1,
        callbacks: {
          title: (items) => String((items[0]?.raw as { model?: string } | undefined)?.model ?? "Model"),
          label: (context) => {
            const price = context.parsed.x === null
              ? MISSING_VALUE
              : `${formatDisplayUsd(context.parsed.x)}/1M blended`;
            const score = context.parsed.y === null
              ? MISSING_VALUE
              : formatDisplayNumber(context.parsed.y);
            return `${price} · ${label.toLocaleLowerCase()} ${score}`;
          },
          afterLabel: (context) => (context.raw as { frontier?: boolean }).frontier ? "Value frontier" : "",
        },
        displayColors: false,
        titleColor: theme.strong,
        bodyColor: theme.muted,
      },
    },
    scales: {
      x: { beginAtZero: true, border: { color: theme.grid }, grid: { color: theme.grid }, ticks: { color: theme.muted, callback: (value) => formatDisplayUsd(Number(value)) }, title: { color: theme.muted, display: true, text: "Blended route price / 1M tokens" } },
      y: { beginAtZero: true, border: { color: theme.grid }, grid: { color: theme.grid }, ticks: { color: theme.muted, callback: (value) => formatDisplayNumber(Number(value)) }, title: { color: theme.muted, display: true, text: label } },
    },
  }), [label, theme]);
  if (visibleRows.length < 2) return null;
  return <div aria-label={`Cost versus ${label.toLocaleLowerCase()}`} className="h-[360px] w-full" role="img"><Scatter data={data} options={options} /><p className="sr-only">{label} plotted against selected-route blended price. Value-frontier points are larger diamonds and are also labelled in the chart legend and tooltip.</p></div>;
}

export function LeaderboardPriceChart({ rows }: { rows: readonly LeaderboardDisplayRow[] }) {
  const theme = useLeaderboardChartTheme();
  const visibleRows = rows.filter((row) => row.blendedUsdPerMillion !== null).slice(0, 14);
  const data = useMemo(() => ({
    labels: visibleRows.map((row) => row.name),
    datasets: [{
      label: "Blended route price",
      data: visibleRows.map((row) => row.blendedUsdPerMillion),
      backgroundColor: visibleRows.map((row) => providerColor(row.provider)),
      borderColor: visibleRows.map((row) => providerColor(row.provider)),
      borderRadius: 5,
      borderWidth: 1,
    }],
  }), [visibleRows]);
  const options = useMemo<ChartOptions<"bar">>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: "y",
    animation: theme.reducedMotion ? false : { duration: 400 },
    plugins: { legend: { display: false }, tooltip: { backgroundColor: theme.tooltip, borderColor: theme.tooltipBorder, borderWidth: 1, displayColors: false, titleColor: theme.strong, bodyColor: theme.muted, callbacks: { label: (context) => `${formatDisplayUsd(Number(context.raw))}/1M` } } },
    scales: {
      x: { beginAtZero: true, border: { color: theme.grid }, grid: { color: theme.grid }, ticks: { color: theme.muted, callback: (value) => formatDisplayUsd(Number(value)) }, title: { color: theme.muted, display: true, text: "USD / 1M blended tokens" } },
      y: { border: { color: theme.grid }, grid: { display: false }, ticks: { color: theme.muted } },
    },
  }), [theme]);
  if (!visibleRows.length) return null;
  return <div aria-label="Selected route price by model" className="h-[360px] w-full" role="img"><Bar data={data} options={options} /><p className="sr-only">Selected-route blended price for {visibleRows.length} models. Missing route prices are excluded.</p></div>;
}
