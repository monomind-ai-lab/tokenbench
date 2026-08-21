"use client";

import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LogarithmicScale,
  PointElement,
  Tooltip,
  type ChartOptions,
} from "chart.js";
import { ChevronDown, CircleAlert, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Bar, Scatter } from "react-chartjs-2";

import type {
  RankingData,
  UiDataContractV1,
} from "@tokenbench/frontend/preview-data/contracts";
import {
  buildWeightedRanking,
  WEIGHTED_RANKING_CAPABILITIES,
  type WeightedRankingCapability,
  type WeightedRankingFilters,
  type WeightedRankingRow,
} from "@tokenbench/frontend/preview-workbench/weighted-ranking";
import {
  DEFAULT_WEIGHTED_RANKING_STATE,
  encodeWeightedRankingState,
  normalizeWeightedRankingSelection,
  weightedRankingStateFromQuery,
  type WeightedRankingState,
} from "@tokenbench/frontend/preview-workbench/weighted-ranking-state";

import {
  makeItYoursCsvRows,
  projectMakeItYoursModels,
  type MakeItYoursProjectedModel,
} from "@/lib/make-it-yours-projector";
import { cn } from "@/lib/utils";

import { ResultActions, ViewModeToggle } from "./result-actions";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";

ChartJS.register(
  BarElement,
  CategoryScale,
  Legend,
  LinearScale,
  LogarithmicScale,
  PointElement,
  Tooltip,
);

type MakeItYoursDataMode = "evidence" | "production" | "unconfigured";
type SearchParameterRecord = Record<string, string | string[] | undefined>;
type Message = { readonly tone: "error" | "info"; readonly text: string } | null;

interface MakeItYoursChartTheme {
  readonly accent: string;
  readonly grid: string;
  readonly muted: string;
  readonly reducedMotion: boolean;
  readonly strong: string;
  readonly tooltip: string;
  readonly tooltipBorder: string;
}

const PROVIDER_COLORS = [
  "#5489d6",
  "#d97757",
  "#7c8fd1",
  "#66a98d",
  "#c49a53",
  "#9a7cc1",
] as const;

function fallbackChartTheme(dark: boolean, reducedMotion: boolean): MakeItYoursChartTheme {
  const accent = dark ? "#9696ff" : "#1111ff";
  return dark
    ? {
        accent,
        grid: "rgba(255,255,255,.09)",
        muted: "#b6b7c9",
        reducedMotion,
        strong: "#f8f8ff",
        tooltip: "#191a2b",
        tooltipBorder: accent,
      }
    : {
        accent,
        grid: "rgba(0,0,0,.10)",
        muted: "#5f6277",
        reducedMotion,
        strong: "#171727",
        tooltip: "#ffffff",
        tooltipBorder: accent,
      };
}

function useMakeItYoursChartTheme() {
  const [theme, setTheme] = useState<MakeItYoursChartTheme>(() =>
    fallbackChartTheme(true, false),
  );

  useEffect(() => {
    const root = document.documentElement;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      const fallback = fallbackChartTheme(root.classList.contains("dark"), motion.matches);
      const styles = window.getComputedStyle(root);
      const token = (name: string, fallbackValue: string) =>
        styles.getPropertyValue(name).trim() || fallbackValue;
      setTheme({
        ...fallback,
        grid: token("--border", fallback.grid),
        muted: token("--muted-foreground", fallback.muted),
        strong: token("--foreground", fallback.strong),
        tooltip: token("--popover", fallback.tooltip),
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

function providerColor(provider: string) {
  let hash = 0;
  for (const character of provider) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return PROVIDER_COLORS[hash % PROVIDER_COLORS.length] ?? PROVIDER_COLORS[0];
}

function titleCase(value: string) {
  const label = value.replaceAll("-", " ");
  return `${label.slice(0, 1).toUpperCase()}${label.slice(1)}`;
}

function formatMoney(value: number | null) {
  return value === null ? "Unavailable" : `$${value.toFixed(value < 0.1 ? 3 : 2)}`;
}

function formatTtft(value: number | null) {
  return value === null ? "Unavailable" : `${value.toFixed(2)}s`;
}

function formatThroughput(value: number | null) {
  return value === null ? "Unavailable" : `${value.toFixed(0)} tok/s`;
}

function searchParametersFromRecord(record: SearchParameterRecord) {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string") parameters.set(key, value);
    else if (Array.isArray(value)) value.forEach((item) => parameters.append(key, item));
  }
  return parameters;
}

function filtersFromState(state: WeightedRankingState): WeightedRankingFilters {
  return {
    access: state.access,
    providers: state.providers,
    maxTtft: state.maxTtft,
    minThroughput: state.minThroughput,
    showOutsideSla: state.showOutsideSla,
  };
}

function sortByTtft(rows: readonly WeightedRankingRow[]) {
  return rows.slice().sort((left, right) =>
    (left.ttft === null ? 1 : right.ttft === null ? -1 : left.ttft - right.ttft)
    || right.score - left.score || left.id.localeCompare(right.id),
  );
}

function sortByThroughput(rows: readonly WeightedRankingRow[]) {
  return rows.slice().sort((left, right) =>
    (left.throughput === null ? 1 : right.throughput === null ? -1 : right.throughput - left.throughput)
    || right.score - left.score || left.id.localeCompare(right.id),
  );
}

function sortByCost(rows: readonly WeightedRankingRow[]) {
  return rows.slice().sort((left, right) =>
    left.cost - right.cost || right.score - left.score || left.id.localeCompare(right.id),
  );
}

function MakeItYoursRankChart({ rows }: { readonly rows: readonly WeightedRankingRow[] }) {
  const theme = useMakeItYoursChartTheme();
  const visibleRows = rows.slice(0, 14);
  const data = useMemo(
    () => ({
      labels: visibleRows.map((row) => row.name),
      datasets: [{
        label: "Weighted score",
        data: visibleRows.map((row) => row.score),
        backgroundColor: visibleRows.map((row) => providerColor(row.provider)),
        borderColor: visibleRows.map((row) => providerColor(row.provider)),
        borderRadius: 5,
        borderWidth: 1,
      }],
    }),
    [visibleRows],
  );
  const options = useMemo<ChartOptions<"bar">>(
    () => ({
      animation: theme.reducedMotion ? false : { duration: 400 },
      indexAxis: "y",
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: theme.tooltip,
          borderColor: theme.tooltipBorder,
          borderWidth: 1,
          callbacks: { label: (item) => `Weighted score ${Number(item.parsed.x).toFixed(1)}` },
          displayColors: false,
          titleColor: theme.strong,
          bodyColor: theme.muted,
        },
      },
      responsive: true,
      scales: {
        x: {
          border: { color: theme.grid },
          grid: { color: theme.grid },
          ticks: { color: theme.muted },
          title: { color: theme.muted, display: true, text: "Weighted score" },
        },
        y: { border: { color: theme.grid }, grid: { display: false }, ticks: { color: theme.muted } },
      },
    }),
    [theme],
  );

  if (!visibleRows.length) return null;
  return <div aria-label="Weighted score ranking by model" className="h-[420px] w-full" role="img"><Bar data={data} options={options} /><p className="sr-only">The chart uses the same ordered rows as the semantic weighted-ranking table. Missing scores are never plotted as zero.</p></div>;
}

function MakeItYoursSlaChart({
  metric,
  rows,
}: {
  readonly metric: "ttft" | "throughput";
  readonly rows: readonly WeightedRankingRow[];
}) {
  const theme = useMakeItYoursChartTheme();
  const visibleRows = rows.filter((row) => (metric === "ttft" ? row.ttft : row.throughput) !== null).slice(0, 12);
  const label = metric === "ttft" ? "TTFT (seconds)" : "Output speed (tok/s)";
  const data = useMemo(
    () => ({
      labels: visibleRows.map((row) => row.name),
      datasets: [{
        label,
        data: visibleRows.map((row) => metric === "ttft" ? row.ttft : row.throughput),
        backgroundColor: visibleRows.map((row) => {
          const passes = metric === "ttft" ? row.meetsTtft : row.meetsThroughput;
          return passes ? providerColor(row.provider) : "#c46b4f";
        }),
        borderRadius: 5,
        borderWidth: 0,
      }],
    }),
    [label, metric, visibleRows],
  );
  const options = useMemo<ChartOptions<"bar">>(
    () => ({
      animation: theme.reducedMotion ? false : { duration: 400 },
      indexAxis: "y",
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: theme.tooltip,
          borderColor: theme.tooltipBorder,
          borderWidth: 1,
          callbacks: {
            label: (item) => metric === "ttft"
              ? `${Number(item.parsed.x).toFixed(2)} seconds`
              : `${Number(item.parsed.x).toFixed(0)} tok/s`,
          },
          displayColors: false,
          titleColor: theme.strong,
          bodyColor: theme.muted,
        },
      },
      responsive: true,
      scales: {
        x: { border: { color: theme.grid }, grid: { color: theme.grid }, ticks: { color: theme.muted } },
        y: { border: { color: theme.grid }, grid: { display: false }, ticks: { color: theme.muted } },
      },
    }),
    [metric, theme],
  );

  if (!visibleRows.length) return <p className="py-12 text-center text-sm text-muted-foreground" role="status">No observed {metric === "ttft" ? "TTFT" : "throughput"} measurements are published for these candidates.</p>;
  return <div aria-label={`${label} by model`} className="h-[350px] w-full" role="img"><Bar data={data} options={options} /><p className="sr-only">Provider-colored bars pass the selected threshold. Warm bars are outside it. Exact values are listed in the SLA table.</p></div>;
}

function MakeItYoursCostChart({ rows }: { readonly rows: readonly WeightedRankingRow[] }) {
  const theme = useMakeItYoursChartTheme();
  const providerNames = useMemo(
    () => Array.from(new Set(rows.map((row) => row.provider))),
    [rows],
  );
  const data = useMemo(() => ({
    datasets: [
      ...providerNames.map((provider) => ({
        label: provider,
        data: rows.filter((row) => row.provider === provider && !row.frontier).map((row) => ({
          x: row.cost,
          y: row.score,
          model: row.name,
          frontier: false,
        })),
        backgroundColor: providerColor(provider),
        borderColor: providerColor(provider),
        pointRadius: 4,
        pointHoverRadius: 7,
      })).filter((dataset) => dataset.data.length > 0),
      {
        label: "Weighted frontier",
        data: rows.filter((row) => row.frontier).map((row) => ({
          x: row.cost,
          y: row.score,
          model: row.name,
          frontier: true,
        })),
        backgroundColor: theme.accent,
        borderColor: theme.accent,
        pointRadius: 7,
        pointHoverRadius: 9,
        pointStyle: "rectRot" as const,
      },
    ],
  }), [providerNames, rows, theme.accent]);
  const options = useMemo<ChartOptions<"scatter">>(
    () => ({
      animation: theme.reducedMotion ? false : { duration: 400 },
      interaction: { intersect: false, mode: "nearest" },
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: theme.muted, pointStyle: "circle", usePointStyle: true }, position: "bottom" },
        tooltip: {
          backgroundColor: theme.tooltip,
          borderColor: theme.tooltipBorder,
          borderWidth: 1,
          callbacks: {
            title: (items) => String((items[0]?.raw as { model?: string } | undefined)?.model ?? "Model"),
            label: (item) => `${formatMoney(Number(item.parsed.x))} / successful evaluation · score ${Number(item.parsed.y).toFixed(1)}`,
            afterLabel: (item) => (item.raw as { frontier?: boolean }).frontier ? "Weighted frontier" : "",
          },
          displayColors: false,
          titleColor: theme.strong,
          bodyColor: theme.muted,
        },
      },
      responsive: true,
      scales: {
        x: {
          border: { color: theme.grid },
          grid: { color: theme.grid },
          ticks: { color: theme.muted, callback: (value) => `$${value}` },
          title: { color: theme.muted, display: true, text: "USD / successful evaluation" },
          type: "logarithmic",
        },
        y: {
          border: { color: theme.grid },
          grid: { color: theme.grid },
          ticks: { color: theme.muted },
          title: { color: theme.muted, display: true, text: "Weighted score" },
        },
      },
    }),
    [theme],
  );

  if (rows.length < 2) return null;
  return <div aria-label="Weighted score versus evaluation cost" className="h-[390px] w-full" role="img"><Scatter data={data} options={options} /><p className="sr-only">The chart shows only models with a published cost per successful evaluation and uses logarithmic cost spacing. Larger diamond markers identify weighted-frontier rows.</p></div>;
}

function MakeItYoursCostRankingChart({ rows }: { readonly rows: readonly WeightedRankingRow[] }) {
  const theme = useMakeItYoursChartTheme();
  const visibleRows = rows.slice(0, 14);
  const data = useMemo(() => ({
    labels: visibleRows.map((row) => row.name),
    datasets: [{
      label: "Weighted score",
      data: visibleRows.map((row) => row.score),
      backgroundColor: visibleRows.map((row) => providerColor(row.provider)),
      borderRadius: 5,
      borderWidth: 0,
    }],
  }), [visibleRows]);
  const options = useMemo<ChartOptions<"bar">>(() => ({
    animation: theme.reducedMotion ? false : { duration: 400 },
    indexAxis: "y",
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: theme.tooltip,
        borderColor: theme.tooltipBorder,
        borderWidth: 1,
        callbacks: { label: (item) => `Weighted score ${Number(item.parsed.x).toFixed(1)}` },
        displayColors: false,
        titleColor: theme.strong,
        bodyColor: theme.muted,
      },
    },
    responsive: true,
    scales: {
      x: { border: { color: theme.grid }, grid: { color: theme.grid }, ticks: { color: theme.muted } },
      y: { border: { color: theme.grid }, grid: { display: false }, ticks: { color: theme.muted } },
    },
  }), [theme]);

  if (!visibleRows.length) return null;
  return <div aria-label="Weighted score ranking by evaluation cost" className="h-[390px] w-full" role="img"><Bar data={data} options={options} /><p className="sr-only">Rows are ordered by published evaluation cost, then weighted score. Exact values are available in the adjacent table.</p></div>;
}

function MakeItYoursRankingTable({
  modelsById,
  rows,
  selectedIds,
  onToggle,
  tableLabel = "Weighted ranking evidence",
}: {
  readonly modelsById: ReadonlyMap<string, MakeItYoursProjectedModel>;
  readonly rows: readonly WeightedRankingRow[];
  readonly selectedIds: readonly string[];
  readonly onToggle: (id: string) => void;
  readonly tableLabel?: string;
}) {
  return (
    <div aria-label={tableLabel} className="overflow-x-auto" role="region" tabIndex={0}>
      <table className="w-full min-w-[880px] border-separate border-spacing-0 text-left text-sm">
        <caption className="sr-only">{tableLabel}</caption>
        <thead className="text-xs text-muted-foreground">
          <tr>
            {[
              "Rank",
              "Model",
              "Provider",
              "Weighted",
              "Route price in / out",
              "TTFT",
              "Throughput",
              "Lifecycle",
              "SLA",
              "Compare",
            ].map((heading) => <th className="border-b border-border px-3 py-3 font-medium" key={heading} scope="col">{heading}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const projected = modelsById.get(row.id);
            const selected = selectedIds.includes(row.id);
            return (
              <tr className="align-middle hover:bg-muted/45" key={row.id}>
                <td className="border-b border-border/70 px-3 py-3 font-mono text-xs tabular-nums">{index + 1}</td>
                <th className="border-b border-border/70 px-3 py-3 font-medium" scope="row">{row.name}</th>
                <td className="border-b border-border/70 px-3 py-3 text-muted-foreground">{row.provider}</td>
                <td className="border-b border-border/70 px-3 py-3 font-mono text-xs tabular-nums">{row.score.toFixed(1)}</td>
                <td className="border-b border-border/70 px-3 py-3 font-mono text-xs tabular-nums">{projected ? `${formatMoney(projected.inputUsdPerMillion)} / ${formatMoney(projected.outputUsdPerMillion)}` : "Unavailable"}</td>
                <td className="border-b border-border/70 px-3 py-3 font-mono text-xs tabular-nums">{formatTtft(row.ttft)}</td>
                <td className="border-b border-border/70 px-3 py-3 font-mono text-xs tabular-nums">{formatThroughput(row.throughput)}</td>
                <td className="border-b border-border/70 px-3 py-3 text-muted-foreground">{projected?.lifecycle ?? "Unavailable"}</td>
                <td className="border-b border-border/70 px-3 py-3"><Badge variant={row.meetsSla ? "secondary" : "outline"}>{row.ttft === null || row.throughput === null ? "SLA unobserved" : row.meetsSla ? "Pass" : "Outside SLA"}</Badge></td>
                <td className="border-b border-border/70 px-3 py-3"><Button aria-pressed={selected} className={cn("min-h-11", selected && "bg-active-control text-active-control-foreground")} onClick={() => onToggle(row.id)} size="sm" type="button" variant={selected ? "secondary" : "outline"}>{selected ? "Selected" : "Compare"}</Button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MakeItYoursRankingCards({
  modelsById,
  rows,
  selectedIds,
  onToggle,
}: {
  readonly modelsById: ReadonlyMap<string, MakeItYoursProjectedModel>;
  readonly rows: readonly WeightedRankingRow[];
  readonly selectedIds: readonly string[];
  readonly onToggle: (id: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((row, index) => {
        const projected = modelsById.get(row.id);
        const selected = selectedIds.includes(row.id);
        return (
          <article className="rounded-xl border border-border bg-card p-4" key={row.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs text-muted-foreground">#{index + 1} · {row.provider}</p>
                <h3 className="mt-1 text-base font-medium">{row.name}</h3>
              </div>
              <Badge variant={row.meetsSla ? "secondary" : "outline"}>{row.ttft === null || row.throughput === null ? "SLA unobserved" : row.meetsSla ? "Pass" : "Outside SLA"}</Badge>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 text-xs">
              <div><dt className="text-muted-foreground">Weighted</dt><dd className="mt-1 font-mono tabular-nums">{row.score.toFixed(1)}</dd></div>
              <div><dt className="text-muted-foreground">Evaluation cost / success</dt><dd className="mt-1 font-mono tabular-nums">{formatMoney(row.cost)}</dd></div>
              <div><dt className="text-muted-foreground">TTFT</dt><dd className="mt-1 font-mono tabular-nums">{formatTtft(row.ttft)}</dd></div>
              <div><dt className="text-muted-foreground">Throughput</dt><dd className="mt-1 font-mono tabular-nums">{formatThroughput(row.throughput)}</dd></div>
              <div className="col-span-2"><dt className="text-muted-foreground">Lifecycle</dt><dd className="mt-1">{projected?.lifecycle ?? "Unavailable"}</dd></div>
            </dl>
            <Button aria-pressed={selected} className={cn("mt-4 min-h-11 w-full", selected && "bg-active-control text-active-control-foreground")} onClick={() => onToggle(row.id)} type="button" variant={selected ? "secondary" : "outline"}>{selected ? "Remove from comparison" : "Select for comparison"}</Button>
          </article>
        );
      })}
    </div>
  );
}

function MakeItYoursSlaTable({ rows }: { readonly rows: readonly WeightedRankingRow[] }) {
  return (
    <div aria-label="Exact SLA measurements" className="overflow-x-auto" role="region" tabIndex={0}>
      <table className="w-full min-w-[700px] text-left text-sm">
        <caption className="sr-only">Exact SLA measurements</caption>
        <thead className="text-xs text-muted-foreground"><tr>{["Model", "TTFT", "TTFT result", "Throughput", "Throughput result", "Eligibility"].map((heading) => <th className="border-b border-border px-3 py-3 font-medium" key={heading} scope="col">{heading}</th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr className="hover:bg-muted/45" key={row.id}><th className="border-b border-border/70 px-3 py-3 font-medium" scope="row">{row.name}</th><td className="border-b border-border/70 px-3 py-3 font-mono text-xs tabular-nums">{formatTtft(row.ttft)}</td><td className="border-b border-border/70 px-3 py-3">{row.ttft === null ? "Unobserved" : row.meetsTtft ? "Pass" : "Outside threshold"}</td><td className="border-b border-border/70 px-3 py-3 font-mono text-xs tabular-nums">{formatThroughput(row.throughput)}</td><td className="border-b border-border/70 px-3 py-3">{row.throughput === null ? "Unobserved" : row.meetsThroughput ? "Pass" : "Outside threshold"}</td><td className="border-b border-border/70 px-3 py-3">{row.ttft === null || row.throughput === null ? "Unobserved" : row.meetsSla ? "Eligible" : "Outside SLA"}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function MakeItYoursCostTable({ rows }: { readonly rows: readonly WeightedRankingRow[] }) {
  return (
    <div aria-label="Exact weighted score and cost values" className="overflow-x-auto" role="region" tabIndex={0}>
      <table className="w-full min-w-[680px] text-left text-sm">
        <caption className="sr-only">Exact weighted score and cost values</caption>
        <thead className="text-xs text-muted-foreground"><tr>{["Cost rank", "Model", "Provider", "Weighted", "Evaluation cost / success", "Frontier", "SLA"].map((heading) => <th className="border-b border-border px-3 py-3 font-medium" key={heading} scope="col">{heading}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr className="hover:bg-muted/45" key={row.id}><td className="border-b border-border/70 px-3 py-3 font-mono text-xs tabular-nums">{index + 1}</td><th className="border-b border-border/70 px-3 py-3 font-medium" scope="row">{row.name}</th><td className="border-b border-border/70 px-3 py-3 text-muted-foreground">{row.provider}</td><td className="border-b border-border/70 px-3 py-3 font-mono text-xs tabular-nums">{row.score.toFixed(1)}</td><td className="border-b border-border/70 px-3 py-3 font-mono text-xs tabular-nums">{formatMoney(row.cost)}</td><td className="border-b border-border/70 px-3 py-3">{row.frontier ? "Weighted frontier" : "Dominated"}</td><td className="border-b border-border/70 px-3 py-3">{row.meetsSla ? "Pass" : "Outside SLA"}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function MakeItYoursComparisonTray({
  candidates,
  onClear,
  onRemove,
  onSelect,
  selectedRows,
}: {
  readonly candidates: readonly WeightedRankingRow[];
  readonly onClear: () => void;
  readonly onRemove: (id: string) => void;
  readonly onSelect: (id: string) => void;
  readonly selectedRows: readonly WeightedRankingRow[];
}) {
  if (selectedRows.length < 2) return null;
  const candidateIds = new Set(selectedRows.map((row) => row.id));
  const available = candidates.filter((row) => !candidateIds.has(row.id));
  const compareHref = `/compare/?models=${selectedRows.map((row) => encodeURIComponent(row.id)).join(",")}`;

  return (
    <aside aria-label="Quick comparison" className="rounded-xl border border-border bg-card p-5" role="region">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><h2 className="text-xl font-semibold tracking-tight">Quick comparison</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">The selection order is preserved in the in-depth comparison. Choose two to four verified rows.</p></div>
        <Button className="min-h-11" onClick={onClear} type="button" variant="outline">Clear selection</Button>
      </div>
      <ol className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {selectedRows.map((row, index) => <li className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border bg-muted/35 px-3 py-2" key={row.id}><span className="min-w-0"><span className="mr-2 font-mono text-xs text-muted-foreground">{index + 1}</span><span className="text-sm font-medium">{row.name}</span></span><button aria-label={`Remove ${row.name} from comparison`} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onRemove(row.id)} type="button"><X className="size-4" /></button></li>)}
      </ol>
      <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-end sm:justify-between">
        <label className="grid gap-1.5 text-sm font-medium">Add a filtered model
          <select className="min-h-11 min-w-0 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" defaultValue="" disabled={selectedRows.length >= 4 || available.length === 0} onChange={(event) => { if (event.currentTarget.value) { onSelect(event.currentTarget.value); event.currentTarget.value = ""; } }}>
            <option value="">{selectedRows.length >= 4 ? "Comparison is full" : available.length ? "Choose a model" : "No additional filtered models"}</option>
            {available.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.provider}</option>)}
          </select>
        </label>
        <Button className="min-h-11" render={<a href={compareHref} />} type="button">Open in-depth comparison</Button>
      </div>
    </aside>
  );
}

export function MakeItYoursWorkbench({
  dataMode,
  envelope,
  initialSearchParams,
  loaderError,
}: {
  readonly dataMode: MakeItYoursDataMode;
  readonly envelope: UiDataContractV1<RankingData> | null;
  readonly initialSearchParams: SearchParameterRecord;
  readonly loaderError: string | null;
}) {
  const initialState = useMemo(
    () => weightedRankingStateFromQuery(searchParametersFromRecord(initialSearchParams)),
    [initialSearchParams],
  );
  const [state, setState] = useState<WeightedRankingState>(initialState);
  const [message, setMessage] = useState<Message>(null);
  const projection = useMemo(() => projectMakeItYoursModels(envelope), [envelope]);
  const filters = useMemo(() => filtersFromState(state), [state]);
  const ranking = useMemo(
    () => buildWeightedRanking({ models: projection.models, weights: state.weights, filters }),
    [filters, projection.models, state.weights],
  );
  const selectionRanking = useMemo(
    () => buildWeightedRanking({ models: projection.models, weights: state.weights, filters, limit: projection.models.length }),
    [filters, projection.models, state.weights],
  );
  const providers = useMemo(
    () => Array.from(new Set(projection.models.map((model) => model.provider))).sort((left, right) => left.localeCompare(right)),
    [projection.models],
  );
  const modelsById = useMemo(
    () => new Map(projection.models.map((model) => [model.id, model])),
    [projection.models],
  );
  const ttftRows = useMemo(() => sortByTtft(ranking.candidates), [ranking.candidates]);
  const throughputRows = useMemo(() => sortByThroughput(ranking.candidates), [ranking.candidates]);
  const costRows = useMemo(() => sortByCost(ranking.rows), [ranking.rows]);
  const selectedRows = useMemo(
    () => state.selectedModelIds.flatMap((id) => {
      const row = selectionRanking.candidates.find((candidate) => candidate.id === id);
      return row ? [row] : [];
    }),
    [selectionRanking.candidates, state.selectedModelIds],
  );

  useEffect(() => {
    const syncFromHistory = () => setState(
      weightedRankingStateFromQuery(new URLSearchParams(window.location.search)),
    );
    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.search = encodeWeightedRankingState(state).toString();
    url.hash = "weighted-ranking";
    window.history.replaceState(window.history.state, "", url);
  }, [state]);

  const patchState = (patch: Partial<WeightedRankingState>) => {
    setMessage(null);
    setState((current) => ({ ...current, ...patch }));
  };
  const updateWeight = (capability: WeightedRankingCapability, value: number) =>
    patchState({ weights: { ...state.weights, [capability]: value } });
  const toggleProvider = (provider: string) => patchState({
    providers: state.providers.includes(provider)
      ? state.providers.filter((candidate) => candidate !== provider)
      : [...state.providers, provider],
  });
  const toggleSelected = (id: string) => setState((current) => {
    if (current.selectedModelIds.includes(id)) {
      return { ...current, selectedModelIds: current.selectedModelIds.filter((candidate) => candidate !== id) };
    }
    const selectedModelIds = normalizeWeightedRankingSelection([...current.selectedModelIds, id]);
    if (selectedModelIds.length === current.selectedModelIds.length) {
      setMessage({ tone: "error", text: "Comparison is limited to four models. Remove one before adding another." });
      return current;
    }
    return { ...current, selectedModelIds };
  });
  const missingRequiredFacts = projection.models.length === 0 && projection.unavailableCount > 0;
  const unavailable = envelope === null || envelope.data === null || missingRequiredFacts;
  const unavailableReason = loaderError
    ?? envelope?.reason
    ?? (missingRequiredFacts
      ? "The returned rows omit one or more published category scores or aggregate evaluation-cost facts required by this ranking."
      : "The custom ranking is unavailable. Check the configured verified data service and try again.");
  const passingCount = ranking.candidates.filter((row) => row.meetsSla).length;
  const runtimeObservedCount = ranking.candidates.filter((row) => row.ttft !== null && row.throughput !== null).length;

  return (
    <div>
      <section aria-labelledby="make-it-yours-heading" className="border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-18 lg:px-10">
          <h1 className="max-w-4xl text-balance text-5xl font-semibold leading-[.98] tracking-[-.04em] sm:text-6xl" id="make-it-yours-heading">Make it yours</h1>
          <p className="mt-5 max-w-3xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">Make a custom ranking reflect a deployment priority. Published capability categories and evaluation cost drive the score; access, provider, and observed service-level constraints stay independent.</p>
          {dataMode === "evidence" ? <div className="mt-6 flex max-w-3xl items-start gap-3 rounded-xl border border-border bg-muted/45 p-4 text-sm leading-6 text-muted-foreground" role="status"><CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" /><p><span className="font-medium text-foreground">Preview evidence.</span> Retained accepted evidence is used for interface review only; it is never a production fallback, and unavailable facts remain unavailable.</p></div> : null}
          {dataMode === "production" && envelope?.status === "partial" ? <div className="mt-6 flex max-w-3xl items-start gap-3 rounded-xl border border-border bg-muted/45 p-4 text-sm leading-6 text-muted-foreground" role="status"><CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" /><p><span className="font-medium text-foreground">Partial verified response.</span> The workbench keeps any incomplete row out of the custom score and reports it below.</p></div> : null}
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-8 px-5 py-10 sm:px-8 sm:py-12 lg:px-10">
        {unavailable ? <Card><CardHeader><CardTitle>Custom ranking unavailable</CardTitle><CardDescription>The published response did not include a complete category-and-evaluation-cost row, so no weighted result can be shown.</CardDescription></CardHeader><CardContent><p className="rounded-lg border border-border bg-muted/35 p-4 text-sm leading-6 text-muted-foreground" role="alert">{unavailableReason}</p></CardContent></Card> : null}
        <section aria-labelledby="weighting-title">
            <Card>
              <CardHeader className="gap-5 sm:flex sm:flex-row sm:items-start sm:justify-between">
                <div><CardTitle id="weighting-title">Capability weighting matrix</CardTitle><CardDescription className="mt-2 max-w-3xl leading-6">Composite = Σ(published category score × entered weight) / Σ(active weights). Values are applied exactly as set; inputs are not silently rebalanced. Runtime stays outside the score and is shown only when observed.</CardDescription></div>
                <Button className="min-h-11" onClick={() => patchState({ weights: DEFAULT_WEIGHTED_RANKING_STATE.weights })} type="button" variant="outline">Reset default weights</Button>
              </CardHeader>
              <CardContent>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                  {WEIGHTED_RANKING_CAPABILITIES.map((capability) => <label className="grid gap-2" htmlFor={`make-it-yours-${capability}`} key={capability}><span className="flex items-baseline justify-between gap-3 text-sm font-medium"><span>{titleCase(capability)}</span><output className="font-mono text-xs tabular-nums text-muted-foreground" htmlFor={`make-it-yours-${capability}`}>{state.weights[capability].toFixed(0)}%</output></span><input aria-label={`${titleCase(capability)} weight`} className="h-11 w-full accent-primary" id={`make-it-yours-${capability}`} max="100" min="0" onChange={(event) => updateWeight(capability, Number(event.currentTarget.value))} step="1" type="range" value={state.weights[capability]} /></label>)}
                </div>
                {!ranking.valid ? <p className="mt-5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{ranking.reason}</p> : null}
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="weighted-ranking-title" id="weighted-ranking">
            <div className="flex flex-col gap-5 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
              <div><h2 className="text-3xl font-semibold tracking-tight" id="weighted-ranking-title">Weighted ranking</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Filtered candidates retain exact category scores and evaluation cost. Missing runtime stays visibly unobserved and never becomes a synthetic SLA value.</p></div>
              <ResultActions filename="tokenbench-weighted-ranking" label="Share and export weighted ranking" rows={makeItYoursCsvRows(ranking.rows)} targetId="make-it-yours-ranking-output" />
            </div>

            <div className="mt-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Model access filter">
                {(["all", "open", "closed"] as const).map((access) => <button aria-pressed={state.access === access} className={cn("min-h-11 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", state.access === access ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground")} key={access} onClick={() => patchState({ access })} type="button">{access === "all" ? "All" : access === "open" ? "Open weight" : "Closed"}</button>)}
                <details className="group relative"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-muted"><span>Providers</span><span className="text-xs text-muted-foreground">{state.providers.length ? `${state.providers.length} selected` : "All providers"}</span><ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180" /></summary><div className="absolute z-20 mt-2 grid w-[min(22rem,calc(100vw-2.5rem))] gap-1 rounded-xl border border-border bg-popover p-2 shadow-soft"><div className="flex items-center justify-between px-2 py-1.5"><span className="text-xs text-muted-foreground">{providers.length} providers available</span>{state.providers.length ? <button className="text-xs font-medium text-primary hover:underline" onClick={() => patchState({ providers: [] })} type="button">Clear</button> : null}</div>{providers.map((provider) => <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg px-2 text-sm hover:bg-muted" key={provider}><span>{provider}</span><input checked={state.providers.includes(provider)} className="size-4 accent-primary" onChange={() => toggleProvider(provider)} type="checkbox" /></label>)}</div></details>
              </div>
              <p aria-live="polite" className="text-sm text-muted-foreground">{selectedRows.length} of 4 models selected for comparison.</p>
            </div>

            <div id="make-it-yours-ranking-output" className="mt-5 space-y-6 rounded-xl border border-border bg-card p-4 sm:p-5">
              {projection.unavailableCount > 0 ? <p className="rounded-lg border border-border bg-muted/35 p-3 text-sm leading-6 text-muted-foreground" role="status">{projection.unavailableCount} returned model{projection.unavailableCount === 1 ? "" : "s"} lack a complete published category or evaluation-cost fact and remain outside this custom ranking.</p> : null}
              {message ? <p className={cn("rounded-lg border p-3 text-sm", message.tone === "error" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-border bg-muted/35 text-muted-foreground")} role="status">{message.text}</p> : null}
              {!ranking.valid ? <p className="rounded-lg border border-border bg-muted/35 p-4 text-sm text-muted-foreground" role="status">Ranking is paused until at least one capability weight is above zero.</p> : ranking.rows.length === 0 ? <p className="rounded-lg border border-border bg-muted/35 p-4 text-sm leading-6 text-muted-foreground" role="status">{missingRequiredFacts ? "No complete returned model can be ranked until the verified source publishes every required capability category and aggregate evaluation-cost fact." : "No visible weighted results match the current filters. Reset an access or provider filter, or keep candidates with unobserved or outside-SLA runtime to restore evidence."}</p> : <>
                <p className="font-mono text-xs leading-5 text-muted-foreground" role="status">Live result: <span className="font-semibold text-foreground">{ranking.rows[0]?.name}</span> leads at {ranking.rows[0]?.score.toFixed(1)}. Showing {ranking.rows.length} of {ranking.candidates.length} filtered candidates; {runtimeObservedCount === 0 ? "runtime SLA measurements are not published for this release" : `${passingCount} of ${runtimeObservedCount} observed candidates meet both SLA thresholds`}.</p>
                <div className="grid gap-5 xl:grid-cols-[1.08fr_.92fr]">
                  <section aria-labelledby="weighted-chart-title" className="rounded-xl border border-border bg-background p-4"><h3 className="text-lg font-semibold" id="weighted-chart-title">Weighted score ranking</h3><p className="mt-1 text-sm text-muted-foreground">Provider color identifies the source organization; ranking uses the exact current matrix.</p><div className="mt-5"><MakeItYoursRankChart rows={ranking.chartRows} /></div></section>
                  <section aria-labelledby="sla-title" className="rounded-xl border border-border bg-background p-4"><div className="flex items-start justify-between gap-4"><div><h3 className="text-lg font-semibold" id="sla-title">Service-level filter</h3><p className="mt-1 text-sm text-muted-foreground">Constraints operate beside the score and activate only for observed runtime rows.</p></div><Badge variant={runtimeObservedCount > 0 && passingCount === runtimeObservedCount ? "secondary" : "outline"}>{runtimeObservedCount === 0 ? "Runtime unobserved" : `${passingCount} / ${runtimeObservedCount} pass`}</Badge></div><div className="mt-5 grid gap-5"><label className="grid gap-2 text-sm font-medium"><span className="flex justify-between gap-3"><span>Maximum TTFT</span><output className="font-mono text-xs text-muted-foreground">≤ {state.maxTtft.toFixed(2)}s</output></span><input aria-label="Maximum TTFT" className="h-11 w-full accent-primary disabled:opacity-45" disabled={runtimeObservedCount === 0} max="1.2" min="0.2" onChange={(event) => patchState({ maxTtft: Number(event.currentTarget.value) })} step="0.05" type="range" value={state.maxTtft} /></label><label className="grid gap-2 text-sm font-medium"><span className="flex justify-between gap-3"><span>Minimum throughput</span><output className="font-mono text-xs text-muted-foreground">≥ {state.minThroughput} tok/s</output></span><input aria-label="Minimum throughput" className="h-11 w-full accent-primary disabled:opacity-45" disabled={runtimeObservedCount === 0} max="140" min="20" onChange={(event) => patchState({ minThroughput: Number(event.currentTarget.value) })} step="5" type="range" value={state.minThroughput} /></label><label className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 text-sm font-medium"><input checked={state.showOutsideSla} className="size-4 accent-primary" onChange={(event) => patchState({ showOutsideSla: event.currentTarget.checked })} type="checkbox" />Keep candidates with unobserved or outside-SLA runtime</label></div></section>
                </div>

                <div className="grid gap-5 xl:grid-cols-2">
                  <section aria-labelledby="ttft-title" className="rounded-xl border border-border bg-background p-4"><h3 className="text-lg font-semibold" id="ttft-title">TTFT (seconds)</h3><p className="mt-1 text-sm text-muted-foreground">Lower is better. Warm bars sit outside the selected threshold.</p><div className="mt-5"><MakeItYoursSlaChart metric="ttft" rows={ttftRows} /></div></section>
                  <section aria-labelledby="throughput-title" className="rounded-xl border border-border bg-background p-4"><h3 className="text-lg font-semibold" id="throughput-title">Output speed (tok/s)</h3><p className="mt-1 text-sm text-muted-foreground">Higher is better. Observed throughput stays separate from the capability score.</p><div className="mt-5"><MakeItYoursSlaChart metric="throughput" rows={throughputRows} /></div></section>
                </div>

                <section aria-labelledby="sla-evidence-title" className="rounded-xl border border-border bg-background p-4"><h3 className="text-lg font-semibold" id="sla-evidence-title">Exact SLA measurements</h3><p className="mt-1 text-sm text-muted-foreground">This semantic table records observed runtime values and keeps absent measurements explicitly unobserved.</p><div className="mt-4 hidden lg:block"><MakeItYoursSlaTable rows={ranking.candidates} /></div><div className="mt-4 grid gap-3 lg:hidden">{ranking.candidates.map((row) => <article className="rounded-lg border border-border p-3" key={row.id}><div className="flex justify-between gap-3"><h4 className="text-sm font-medium">{row.name}</h4><Badge variant={row.meetsSla ? "secondary" : "outline"}>{row.ttft === null || row.throughput === null ? "SLA unobserved" : row.meetsSla ? "Eligible" : "Outside SLA"}</Badge></div><p className="mt-3 font-mono text-xs text-muted-foreground">TTFT {formatTtft(row.ttft)} · {row.ttft === null ? "Unobserved" : row.meetsTtft ? "Pass" : "Outside"} · Throughput {formatThroughput(row.throughput)} · {row.throughput === null ? "Unobserved" : row.meetsThroughput ? "Pass" : "Outside"}</p></article>)}</div></section>

                <section aria-labelledby="score-cost-title"><div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-2xl font-semibold tracking-tight" id="score-cost-title">Weighted score vs. evaluation cost</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">The cost view uses published aggregate cost per successful evaluation. Frontier membership is recalculated from the exact visible score/cost pairs.</p></div></div><div className="mt-5 grid gap-5 xl:grid-cols-2"><section className="rounded-xl border border-border bg-background p-4"><h3 className="text-lg font-semibold">Score frontier</h3><div className="mt-5"><MakeItYoursCostChart rows={ranking.chartRows} /></div></section><section className="rounded-xl border border-border bg-background p-4"><h3 className="text-lg font-semibold">Cheapest-first score ranking</h3><div className="mt-5"><MakeItYoursCostRankingChart rows={costRows} /></div></section></div><div className="mt-5 hidden rounded-xl border border-border bg-background p-4 lg:block"><h3 className="text-lg font-semibold">Exact score and evaluation-cost values</h3><div className="mt-4"><MakeItYoursCostTable rows={costRows} /></div></div></section>

                <MakeItYoursComparisonTray candidates={selectionRanking.candidates} onClear={() => patchState({ selectedModelIds: [] })} onRemove={toggleSelected} onSelect={toggleSelected} selectedRows={selectedRows} />

                <section aria-labelledby="ranked-output-title"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-2xl font-semibold tracking-tight" id="ranked-output-title">Ranked output</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Switch views on larger screens; small screens use the equivalent ordered cards so no column is hidden behind page-wide scrolling.</p></div><ViewModeToggle label="Ranked output view" mode={state.view === "cards" ? "cards" : "list"} onChange={(mode) => patchState({ view: mode === "cards" ? "cards" : "rows" })} /></div><div className="mt-5">{state.view === "cards" ? <MakeItYoursRankingCards modelsById={modelsById} onToggle={toggleSelected} rows={ranking.rows} selectedIds={state.selectedModelIds} /> : <><div className="hidden lg:block"><MakeItYoursRankingTable modelsById={modelsById} onToggle={toggleSelected} rows={ranking.tableRows} selectedIds={state.selectedModelIds} tableLabel="Weighted ranking evidence" /></div><div className="lg:hidden"><MakeItYoursRankingCards modelsById={modelsById} onToggle={toggleSelected} rows={ranking.rows} selectedIds={state.selectedModelIds} /></div></>}</div></section>
              </>}
            </div>
        </section>
      </div>
    </div>
  );
}
