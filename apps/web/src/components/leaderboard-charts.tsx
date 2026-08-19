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

import type { LeaderboardDisplayRow } from "@tokenbench/frontend/leaderboard-detail";

ChartJS.register(BarElement, CategoryScale, Legend, LinearScale, PointElement, Tooltip);

const COLORS = ["#5489d6", "#d97757", "#7c8fd1", "#66a98d", "#c49a53", "#9a7cc1"];

function useLeaderboardChartTheme() {
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

function providerColor(provider: string) {
  let hash = 0;
  for (const character of provider) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
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
    animation: { duration: 400 },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: theme.tooltip,
        borderColor: theme.tooltipBorder,
        borderWidth: 1,
        displayColors: false,
        titleColor: theme.strong,
        bodyColor: theme.muted,
      },
    },
    scales: {
      x: { border: { color: theme.grid }, grid: { display: false }, ticks: { color: theme.muted, maxRotation: 45, minRotation: 0 } },
      y: { beginAtZero: true, border: { color: theme.grid }, grid: { color: theme.grid }, ticks: { color: theme.muted }, title: { color: theme.muted, display: true, text: label } },
    },
  }), [label, theme]);
  if (!visibleRows.length) return null;
  return <div aria-label={`${label} by model`} className="h-[330px] w-full" role="img"><Bar data={data} options={options} /><p className="sr-only">Published {label.toLocaleLowerCase()} for {visibleRows.length} models. Unavailable measurements are omitted rather than plotted as zero.</p></div>;
}

export function LeaderboardCostScoreChart({ rows }: { rows: readonly LeaderboardDisplayRow[] }) {
  const theme = useLeaderboardChartTheme();
  const visibleRows = rows.filter((row) => row.metric !== null && row.blendedUsdPerMillion !== null);
  const data = useMemo(() => ({
    datasets: Array.from(new Set(visibleRows.map((row) => row.provider))).map((provider) => ({
      label: provider,
      data: visibleRows.filter((row) => row.provider === provider).map((row) => ({
        x: row.blendedUsdPerMillion as number,
        y: row.metric as number,
        model: row.name,
        frontier: row.frontier,
      })),
      backgroundColor: providerColor(provider),
      borderColor: providerColor(provider),
      pointRadius: visibleRows.filter((row) => row.provider === provider).map((row) => row.frontier ? 7 : 4),
      pointHoverRadius: 8,
      borderWidth: 1,
    })),
  }), [visibleRows]);
  const options = useMemo<ChartOptions<"scatter">>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
    interaction: { intersect: false, mode: "nearest" },
    plugins: {
      legend: { position: "bottom", labels: { color: theme.muted, pointStyle: "circle", usePointStyle: true } },
      tooltip: {
        backgroundColor: theme.tooltip,
        borderColor: theme.tooltipBorder,
        borderWidth: 1,
        callbacks: {
          title: (items) => String((items[0]?.raw as { model?: string } | undefined)?.model ?? "Model"),
          label: (context) => `$${Number(context.parsed.x).toFixed(2)}/1M blended · score ${Number(context.parsed.y).toFixed(2)}`,
          afterLabel: (context) => (context.raw as { frontier?: boolean }).frontier ? "Value frontier" : "",
        },
        displayColors: false,
        titleColor: theme.strong,
        bodyColor: theme.muted,
      },
    },
    scales: {
      x: { beginAtZero: true, border: { color: theme.grid }, grid: { color: theme.grid }, ticks: { color: theme.muted, callback: (value) => `$${value}` }, title: { color: theme.muted, display: true, text: "Blended route price / 1M tokens" } },
      y: { beginAtZero: true, border: { color: theme.grid }, grid: { color: theme.grid }, ticks: { color: theme.muted }, title: { color: theme.muted, display: true, text: "Published overall score" } },
    },
  }), [theme]);
  if (visibleRows.length < 2) return null;
  return <div aria-label="Cost versus published score" className="h-[360px] w-full" role="img"><Scatter data={data} options={options} /><p className="sr-only">Published overall score plotted against selected-route blended price. Larger points are on the disclosed Pareto frontier.</p></div>;
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
    animation: { duration: 400 },
    plugins: { legend: { display: false }, tooltip: { backgroundColor: theme.tooltip, borderColor: theme.tooltipBorder, borderWidth: 1, displayColors: false, titleColor: theme.strong, bodyColor: theme.muted } },
    scales: {
      x: { beginAtZero: true, border: { color: theme.grid }, grid: { color: theme.grid }, ticks: { color: theme.muted, callback: (value) => `$${value}` }, title: { color: theme.muted, display: true, text: "USD / 1M blended tokens" } },
      y: { border: { color: theme.grid }, grid: { display: false }, ticks: { color: theme.muted } },
    },
  }), [theme]);
  if (!visibleRows.length) return null;
  return <div aria-label="Selected route price by model" className="h-[360px] w-full" role="img"><Bar data={data} options={options} /><p className="sr-only">Selected-route blended price for {visibleRows.length} models. Missing route prices are excluded.</p></div>;
}
