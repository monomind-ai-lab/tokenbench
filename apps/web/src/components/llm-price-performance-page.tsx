"use client";

import {
  Chart as ChartJS,
  Legend,
  LinearScale,
  LogarithmicScale,
  PointElement,
  Tooltip,
  type ChartOptions,
} from "chart.js";
import {
  CircleAlert,
  ExternalLink,
  Info,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Scatter } from "react-chartjs-2";

import { ResultActions, type CsvRow } from "@/components/result-actions";
import { Button } from "@/components/ui/button";
import type {
  LlmPricePerformanceDataMode,
  LlmPricePerformanceSnapshot,
} from "@/lib/llm-price-performance-data.server";
import {
  decodeLlmPricePerformanceState,
  llmPricePerformanceDefaultState,
  llmPricePerformanceLaneLabel,
  llmPricePerformancePriceDomain,
  projectLlmPricePerformance,
} from "@/lib/llm-price-performance-projector";
import { cn } from "@/lib/utils";
import { PRICE_PERFORMANCE_SCORE_LANES } from "@tokenbench/benchmarks/price-performance-contracts";
import type {
  PricePerformanceAttribution,
  PricePerformancePointView,
} from "@tokenbench/benchmarks/price-performance-contracts";
import { pricePerformanceUrl, type PricePerformanceState } from "@tokenbench/frontend/price-performance-state";
import { formatPricePerformancePointView } from "@tokenbench/frontend/price-performance-view";

ChartJS.register(LinearScale, LogarithmicScale, PointElement, Tooltip, Legend);

type LlmChartPoint = {
  readonly displayName: string;
  readonly frontier: boolean;
  readonly modelKey: string;
  readonly provider: string;
  readonly selectedCost: number;
  readonly x: number;
  readonly y: number;
};

type ChartTheme = {
  readonly accent: string;
  readonly grid: string;
  readonly muted: string;
  readonly reducedMotion: boolean;
  readonly strong: string;
  readonly tooltip: string;
};

const SOURCE_SLOTS = [
  { id: "benchlm", label: "Capability benchmark source" },
  { id: "litellm", label: "Pricing corroboration source" },
  { id: "lmarena", label: "Preference benchmark source" },
  { id: "openrouter", label: "Route catalog source" },
] as const;

function fallbackChartTheme(dark: boolean, reducedMotion: boolean): ChartTheme {
  return dark
    ? {
        accent: "#9696ff",
        grid: "rgba(255,255,255,.11)",
        muted: "#b8b8c6",
        reducedMotion,
        strong: "#fafafa",
        tooltip: "#242433",
      }
    : {
        accent: "#1111ff",
        grid: "rgba(0,0,0,.12)",
        muted: "#5d5d69",
        reducedMotion,
        strong: "#171720",
        tooltip: "#ffffff",
      };
}

function useLlmPricePerformanceChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(() =>
    fallbackChartTheme(true, false),
  );

  useEffect(() => {
    const root = document.documentElement;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      const fallback = fallbackChartTheme(root.classList.contains("dark"), motion.matches);
      const styles = window.getComputedStyle(root);
      setTheme({
        ...fallback,
        grid: styles.getPropertyValue("--border").trim() || fallback.grid,
        muted:
          styles.getPropertyValue("--muted-foreground").trim() ||
          fallback.muted,
        strong:
          styles.getPropertyValue("--foreground").trim() || fallback.strong,
        tooltip:
          styles.getPropertyValue("--popover").trim() || fallback.tooltip,
      });
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, {
      attributeFilter: ["class", "data-theme"],
      attributes: true,
    });
    motion.addEventListener("change", sync);
    return () => {
      observer.disconnect();
      motion.removeEventListener("change", sync);
    };
  }, []);

  return theme;
}

function providerColor(provider: string): string {
  const colors = ["#5489d6", "#d97757", "#7c8fd1", "#66a98d", "#c49a53", "#9a7cc1"];
  let hash = 0;
  for (const character of provider)
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return colors[hash % colors.length] ?? colors[0]!;
}

function formatCost(value: number): string {
  return `$${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 4,
  }).format(value)} / 1M`;
}

function formatAxis(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function priceRangeIndexes(
  domain: readonly number[],
  priceBand: PricePerformanceState["priceBand"],
): readonly [number, number] {
  const lastIndex = Math.max(0, domain.length - 1);
  const minimum =
    priceBand?.[0] !== null && priceBand?.[0] !== undefined
      ? domain.indexOf(priceBand[0])
      : 0;
  const maximum =
    priceBand?.[1] !== null && priceBand?.[1] !== undefined
      ? domain.indexOf(priceBand[1])
      : lastIndex;
  return [
    minimum >= 0 ? Math.min(minimum, lastIndex) : 0,
    maximum >= 0 ? Math.max(maximum, 0) : lastIndex,
  ];
}

function dataModeLabel(mode: LlmPricePerformanceDataMode): string {
  if (mode === "preview") return "Preview evidence — development only";
  if (mode === "production") return "Published evidence";
  return "Projection unavailable";
}

function LlmPricePerformanceControls({
  disabled,
  domain,
  providers,
  state,
  onChange,
}: {
  readonly disabled: boolean;
  readonly domain: readonly number[];
  readonly providers: readonly string[];
  readonly state: PricePerformanceState;
  readonly onChange: (changes: Partial<PricePerformanceState>) => void;
}) {
  const [minimumIndex, maximumIndex] = priceRangeIndexes(domain, state.priceBand);
  const lastIndex = Math.max(0, domain.length - 1);
  const changeMinimum = (value: number) => {
    const next = Math.min(value, maximumIndex);
    onChange({ priceBand: [domain[next]!, domain[maximumIndex]!] });
  };
  const changeMaximum = (value: number) => {
    const next = Math.max(value, minimumIndex);
    onChange({ priceBand: [domain[minimumIndex]!, domain[next]!] });
  };

  return (
    <div aria-label="Price-performance filters" className="grid gap-6" role="group">
      <fieldset className="min-w-0">
        <legend className="text-sm font-medium">Score lane</legend>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
          <button
            aria-pressed={false}
            className="min-h-11 shrink-0 rounded-lg border border-border bg-background px-3 text-xs text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-55"
            disabled={disabled}
            onClick={() => onChange({ lane: "overall" })}
            type="button"
          >
            All
          </button>
          {(disabled ? PRICE_PERFORMANCE_SCORE_LANES : PRICE_PERFORMANCE_SCORE_LANES).map(
            (lane) => (
              <button
                aria-pressed={state.lane === lane}
                className={cn(
                  "min-h-11 shrink-0 rounded-lg border px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55",
                  state.lane === lane
                    ? "border-primary bg-active-control text-active-control-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                disabled={disabled}
                key={lane}
                onClick={() => onChange({ lane })}
                type="button"
              >
                {llmPricePerformanceLaneLabel(lane)}
              </button>
            ),
          )}
        </div>
      </fieldset>

      <fieldset className="min-w-0">
        <legend className="text-sm font-medium">Creator</legend>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
          <button
            aria-pressed={state.creator === null}
            className={cn(
              "min-h-11 shrink-0 rounded-lg border px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55",
              state.creator === null
                ? "border-primary bg-active-control text-active-control-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            disabled={disabled}
            onClick={() => onChange({ creator: null })}
            type="button"
          >
            All
          </button>
          {providers.length ? (
            providers.map((provider) => (
              <button
                aria-pressed={state.creator === provider}
                className={cn(
                  "min-h-11 shrink-0 rounded-lg border px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55",
                  state.creator === provider
                    ? "border-primary bg-active-control text-active-control-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                disabled={disabled}
                key={provider}
                onClick={() =>
                  onChange({
                    creator: state.creator === provider ? null : provider,
                  })
                }
                type="button"
              >
                {provider}
              </button>
            ))
          ) : (
            <span className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-dashed border-border px-3 text-xs text-muted-foreground">
              Unavailable
            </span>
          )}
        </div>
      </fieldset>

      <fieldset className="min-w-0">
        <legend className="text-sm font-medium">Price range per 1M tokens</legend>
        {domain.length ? (
          <div className="mt-3 rounded-xl border border-border bg-muted/35 p-4">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <label className="grid gap-1.5" htmlFor="llm-price-performance-min-price">
                <span className="text-xs text-muted-foreground">Minimum</span>
                <output className="font-mono text-sm" htmlFor="llm-price-performance-min-price">
                  {formatCost(domain[minimumIndex]!)}
                </output>
              </label>
              <label className="grid gap-1.5" htmlFor="llm-price-performance-max-price">
                <span className="text-xs text-muted-foreground">Maximum</span>
                <output className="font-mono text-sm" htmlFor="llm-price-performance-max-price">
                  {formatCost(domain[maximumIndex]!)}
                </output>
              </label>
            </div>
            <div className="mt-4 grid gap-3">
              <input
                aria-label="Minimum price per 1M tokens"
                aria-valuetext={formatCost(domain[minimumIndex]!)}
                className="h-4 w-full accent-primary"
                disabled={disabled}
                id="llm-price-performance-min-price"
                max={lastIndex}
                min="0"
                onChange={(event) => changeMinimum(Number(event.currentTarget.value))}
                step="1"
                type="range"
                value={minimumIndex}
              />
              <input
                aria-label="Maximum price per 1M tokens"
                aria-valuetext={formatCost(domain[maximumIndex]!)}
                className="h-4 w-full accent-primary"
                disabled={disabled}
                id="llm-price-performance-max-price"
                max={lastIndex}
                min="0"
                onChange={(event) => changeMaximum(Number(event.currentTarget.value))}
                step="1"
                type="range"
                value={maximumIndex}
              />
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-border bg-muted/35 p-4 text-sm text-muted-foreground">
            No published prices are available for this selection.
          </div>
        )}
      </fieldset>
    </div>
  );
}

function LlmPricePerformanceParetoChart({
  attribution,
  basis,
  lane,
  onSelect,
  points,
}: {
  readonly attribution: readonly PricePerformanceAttribution[];
  readonly basis: PricePerformanceState["costBasis"];
  readonly lane: PricePerformanceState["lane"];
  readonly onSelect: (point: PricePerformancePointView, trigger: HTMLElement | null) => void;
  readonly points: readonly PricePerformancePointView[];
}) {
  const chartTheme = useLlmPricePerformanceChartTheme();
  const summaryId = useId();
  const figureRef = useRef<HTMLElement>(null);
  const data = useMemo(() => {
    const rows: LlmChartPoint[] = points.map((point) => ({
      displayName: point.displayName,
      frontier: point.frontier,
      modelKey: point.modelKey,
      provider: point.creator,
      selectedCost: point.selectedCost,
      x: point.selectedCost,
      y: point.score,
    }));
    const frontier = rows
      .filter((point) => point.frontier)
      .toSorted((left, right) => left.x - right.x || right.y - left.y);
    return {
      datasets: [
        {
          backgroundColor: rows.map((point) => providerColor(point.provider)),
          borderColor: rows.map((point) => providerColor(point.provider)),
          data: rows,
          label: "Models",
          pointHoverRadius: rows.map((point) => (point.frontier ? 10 : 8)),
          pointRadius: rows.map((point) => (point.frontier ? 7 : 5)),
          pointStyle: rows.map((point) =>
            point.frontier ? ("rectRot" as const) : ("circle" as const),
          ),
        },
        {
          backgroundColor: "transparent",
          borderColor: chartTheme.accent,
          borderDash: [6, 4],
          borderWidth: 2,
          data: frontier,
          label: "Pareto frontier",
          pointHoverRadius: 0,
          pointRadius: 0,
          showLine: true,
          tension: 0.18,
        },
      ],
    };
  }, [chartTheme.accent, points]);
  const pointByKey = useMemo(
    () => new Map(points.map((point) => [point.modelKey, point])),
    [points],
  );
  const canUseLog = points.length > 0 && points.every((point) => point.selectedCost > 0);
  const options = useMemo<ChartOptions<"scatter">>(
    () => ({
      animation: chartTheme.reducedMotion ? false : { duration: 360 },
      interaction: { intersect: false, mode: "nearest" },
      maintainAspectRatio: false,
      onClick: (_event, elements) => {
        const modelElement = elements.find((element) => element.datasetIndex === 0);
        if (!modelElement) return;
        const raw = data.datasets[0]?.data[modelElement.index] as
          | LlmChartPoint
          | undefined;
        const selected = raw ? pointByKey.get(raw.modelKey) : undefined;
        if (selected) onSelect(selected, figureRef.current);
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: chartTheme.tooltip,
          borderColor: chartTheme.accent,
          borderWidth: 1,
          callbacks: {
            afterLabel: (context) => {
              const raw = context.raw as LlmChartPoint;
              return raw.frontier ? "Pareto frontier" : "Not on Pareto frontier";
            },
            label: (context) => {
              const raw = context.raw as LlmChartPoint;
              return `${formatCost(raw.selectedCost)} ${
                basis === "output" ? "output" : "3:1 blended"
              } · score ${formatAxis(raw.y)}`;
            },
            title: (items) =>
              String((items[0]?.raw as LlmChartPoint | undefined)?.displayName ?? "Model"),
          },
          displayColors: false,
          titleColor: chartTheme.strong,
          bodyColor: chartTheme.muted,
        },
      },
      responsive: true,
      scales: {
        x: {
          beginAtZero: !canUseLog,
          border: { color: chartTheme.grid },
          grid: { color: chartTheme.grid },
          ticks: {
            callback: (value) => `$${formatAxis(Number(value))}`,
            color: chartTheme.muted,
          },
          title: {
            color: chartTheme.muted,
            display: true,
            text:
              basis === "output"
                ? "Output price / 1M tokens"
                : "3:1 blended price / 1M tokens",
          },
          type: canUseLog && basis !== "output" ? "logarithmic" : "linear",
        },
        y: {
          border: { color: chartTheme.grid },
          grid: { color: chartTheme.grid },
          ticks: { color: chartTheme.muted },
          title: {
            color: chartTheme.muted,
            display: true,
            text: `${llmPricePerformanceLaneLabel(lane)} score`,
          },
        },
      },
    }),
    [basis, canUseLog, chartTheme, data.datasets, lane, onSelect, pointByKey],
  );
  const frontierCount = points.filter((point) => point.frontier).length;
  const scores = points.map((point) => point.score);
  const costs = points.map((point) => point.selectedCost);
  const summary =
    points.length === 0
      ? "No eligible models match these filters."
      : `Scatter plot with ${points.length} models. ${frontierCount} Pareto frontier points. Score values range from ${formatAxis(Math.min(...scores))} to ${formatAxis(Math.max(...scores))}. Selected cost values range from ${formatAxis(Math.min(...costs))} to ${formatAxis(Math.max(...costs))}.`;

  if (!points.length) {
    return (
      <div
        aria-label="No eligible models match these filters"
        className="rounded-xl border border-dashed border-border bg-muted/35 p-6 text-sm text-muted-foreground"
        role="status"
      >
        <strong className="block text-foreground">No eligible models match these filters</strong>
        <p className="mt-2">Try another score lane, creator, or price range.</p>
      </div>
    );
  }

  return (
    <figure
      aria-describedby={summaryId}
      aria-label={`${llmPricePerformanceLaneLabel(lane)} score by ${basis === "output" ? "output price" : "3:1 blended price"}`}
      className="min-w-0"
      ref={figureRef}
      tabIndex={-1}
    >
      <div className="h-[285px] min-w-0 sm:h-[420px]">
        <Scatter data={data} options={options} />
      </div>
      <p className="sr-only" id={summaryId}>
        {summary}
      </p>
      <div aria-label="Chart legend" className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="size-2.5 rotate-45 bg-primary" />
          Pareto frontier
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-chart-1" />
          Supported evidence
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="size-2.5 rounded-full border border-amber-500" />
          Estimated evidence
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="size-2.5 rounded-full border border-muted-foreground" />
          Source-only evidence
        </span>
      </div>
      <figcaption className="mt-3 text-xs leading-5 text-muted-foreground">
        Each point is keyboard and touch accessible. Shape and text identify frontier and evidence state; details include the durable model profile link.
      </figcaption>
      <ol className="sr-only" aria-label="Accessible chart points">
        {points.map((point) => {
          const facts = formatPricePerformancePointView(point, attribution);
          return (
            <li key={point.modelKey}>
              <button onClick={(event) => onSelect(point, event.currentTarget)} type="button">
                {facts.accessibleName}
              </button>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}

function LlmPricePerformanceDetailDialog({
  attribution,
  onClose,
  point,
  triggerRef,
}: {
  readonly attribution: readonly PricePerformanceAttribution[];
  readonly onClose: () => void;
  readonly point: PricePerformancePointView;
  readonly triggerRef: RefObject<HTMLElement | null>;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const facts = formatPricePerformancePointView(point, attribution);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        requestAnimationFrame(() => triggerRef.current?.focus());
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const controls = [
        ...dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href]',
        ),
      ];
      if (!controls.length) return;
      const first = controls[0]!;
      const last = controls[controls.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, triggerRef]);

  const close = () => {
    onClose();
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <div
      aria-labelledby="llm-price-performance-detail-title"
      aria-modal="true"
      className="fixed inset-0 z-[70] grid place-items-center bg-black/60 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      role="dialog"
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-popover p-5 shadow-soft sm:p-6"
        ref={dialogRef}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Selected point</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em]" id="llm-price-performance-detail-title">
              {point.displayName} details
            </h2>
          </div>
          <Button aria-label="Close model details" onClick={close} ref={closeRef} size="icon" variant="outline">
            <X />
          </Button>
        </div>
        <dl className="mt-6 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
          {[
            ["Score", facts.score],
            ["Selected cost", facts.selectedCost],
            ["Score per dollar", facts.scorePerDollar],
            ["Evidence", facts.evidence],
            ["Frontier state", facts.frontier],
          ].map(([term, value]) => (
            <div className="bg-card p-4" key={term}>
              <dt className="text-xs text-muted-foreground">{term}</dt>
              <dd className="mt-1 font-mono text-sm">{value}</dd>
            </div>
          ))}
          <div className="bg-card p-4 sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Provider and route</dt>
            <dd className="mt-1 text-sm">
              {facts.sourceHref ? (
                <a
                  className="inline-flex items-center gap-1 text-link underline-offset-4 hover:underline"
                  href={facts.sourceHref}
                  rel="noreferrer"
                  target="_blank"
                >
                  {facts.sourceLinkLabel}
                  <ExternalLink className="size-3" />
                </a>
              ) : (
                facts.sourceLinkLabel
              )}
            </dd>
          </div>
        </dl>
        <Link className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover" href={facts.profileHref}>
          {facts.profileLinkLabel}
        </Link>
      </div>
    </div>
  );
}

function LlmPricePerformanceTable({
  attribution,
  label,
  points,
}: {
  readonly attribution: readonly PricePerformanceAttribution[];
  readonly label: string;
  readonly points: readonly PricePerformancePointView[];
}) {
  const rows = points.map((point) => ({
    facts: formatPricePerformancePointView(point, attribution),
    point,
  }));
  return (
    <section aria-label={label} className="min-w-0">
      {!rows.length ? (
        <div
          aria-label="No eligible models match these filters"
          className="mb-4 rounded-xl border border-dashed border-border bg-muted/35 p-5 text-sm text-muted-foreground"
          role="status"
        >
          <strong className="block text-foreground">No eligible models match these filters</strong>
          <p className="mt-2">Unavailable scores and prices are excluded rather than treated as zero.</p>
        </div>
      ) : null}
      <div className="hidden min-w-0 overflow-x-auto md:block">
        <table className="w-full min-w-[48rem] border-separate border-spacing-0 text-left text-sm" aria-label={label}>
          <caption className="sr-only">Price versus performance values for the selected filters</caption>
          <thead className="text-xs text-muted-foreground">
            <tr>
              {["Model", "Score", "Selected cost", "Score / dollar", "Evidence", "Frontier"].map((heading) => (
                <th className="border-b border-border px-3 py-3 font-medium" key={heading} scope="col">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ facts, point }) => (
              <tr className="group hover:bg-muted/45" key={point.modelKey}>
                <th className="border-b border-border px-3 py-3 font-medium" scope="row">
                  <Link className="hover:text-link hover:underline" href={facts.profileHref}>
                    {facts.modelName}
                  </Link>
                </th>
                <td className="border-b border-border px-3 py-3 font-mono text-xs">{facts.score}</td>
                <td className="border-b border-border px-3 py-3 font-mono text-xs">{facts.selectedCost}</td>
                <td className="border-b border-border px-3 py-3 font-mono text-xs">{facts.scorePerDollar}</td>
                <td className="border-b border-border px-3 py-3 text-xs">{facts.evidence}</td>
                <td className="border-b border-border px-3 py-3 text-xs">{facts.frontier}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ol aria-label="Price versus performance model cards" className="grid gap-3 md:hidden">
        {rows.map(({ facts, point }) => (
          <li className="rounded-xl border border-border bg-card p-4" key={point.modelKey}>
            <Link className="font-medium hover:text-link hover:underline" href={facts.profileHref}>
              {facts.modelName}
            </Link>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {[
                ["Score", facts.score],
                ["Selected cost", facts.selectedCost],
                ["Score per dollar", facts.scorePerDollar],
                ["Evidence", facts.evidence],
                ["Frontier", facts.frontier],
              ].map(([term, value]) => (
                <div className="min-w-0" key={term}>
                  <dt className="text-xs text-muted-foreground">{term}</dt>
                  <dd className="mt-1 break-words font-mono text-xs">{value}</dd>
                </div>
              ))}
            </dl>
            <Link className="mt-4 inline-flex text-sm text-link underline-offset-4 hover:underline" href={facts.profileHref}>
              {facts.profileLinkLabel}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

function LlmPricePerformanceEvidence({
  dataMode,
  envelope,
}: {
  readonly dataMode: LlmPricePerformanceDataMode;
  readonly envelope: LlmPricePerformanceSnapshot["envelope"];
}) {
  const sourceById = new Map(envelope?.attribution.map((source) => [source.sourceId, source]));
  return (
    <section aria-labelledby="llm-price-performance-evidence-heading" className="border-t border-border py-10 sm:py-14">
      <div className="max-w-3xl">
        <p className="text-sm text-muted-foreground">{dataModeLabel(dataMode)}</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.025em]" id="llm-price-performance-evidence-heading">
          Method and freshness
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Scores are source-published benchmark lanes. Missing score or price facts are unavailable and excluded; published zero prices remain visible without a finite score-per-dollar value.
        </p>
      </div>
      <dl className="mt-7 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
        {[
          ["Revision", envelope?.revision ?? "Unavailable"],
          ["Published", envelope?.publishedAt ?? "Unavailable"],
          ["Checked", envelope?.freshness.checkedAt ?? "Unavailable"],
        ].map(([term, value]) => (
          <div className="bg-card p-4" key={term}>
            <dt className="text-xs text-muted-foreground">{term}</dt>
            <dd className="mt-1 break-words font-mono text-xs">{value}</dd>
          </div>
        ))}
      </dl>
      <ul aria-label="Price-performance sources" className="mt-5 grid gap-3 sm:grid-cols-2">
        {SOURCE_SLOTS.map((slot) => {
          const source = sourceById.get(slot.id);
          return (
            <li className="rounded-xl border border-border bg-card p-4" key={slot.id}>
              {source ? (
                <a className="inline-flex items-center gap-1 text-sm font-medium text-link underline-offset-4 hover:underline" href={source.url} rel="noreferrer" target="_blank">
                  {slot.label}
                  <ExternalLink className="size-3" />
                </a>
              ) : (
                <span className="text-sm font-medium text-muted-foreground">{slot.label}</span>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                {source ? `Updated ${source.updatedAt}` : "Unavailable"}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function csvRows(
  points: readonly PricePerformancePointView[],
  attribution: readonly PricePerformanceAttribution[],
): CsvRow[] {
  return points.map((point) => {
    const facts = formatPricePerformancePointView(point, attribution);
    return {
      Model: facts.modelName,
      Score: facts.score,
      "Selected cost": facts.selectedCost,
      "Score / dollar": facts.scorePerDollar,
      Evidence: facts.evidence,
      Frontier: facts.frontier,
      Provider: facts.provider,
      Route: facts.route,
    };
  });
}

export function LlmPricePerformancePage({
  snapshot,
}: {
  readonly snapshot: LlmPricePerformanceSnapshot;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const envelope = snapshot.envelope;
  const [selected, setSelected] = useState<PricePerformancePointView | null>(null);
  const selectedTriggerRef = useRef<HTMLElement | null>(null);
  const state = useMemo(
    () =>
      envelope
        ? decodeLlmPricePerformanceState(envelope, query)
        : llmPricePerformanceDefaultState,
    [envelope, query],
  );
  const projection = useMemo(
    () => (envelope ? projectLlmPricePerformance(envelope, state) : null),
    [envelope, state],
  );
  const settledState = projection?.state ?? state;
  const canonicalUrl = projection
    ? pricePerformanceUrl(projection.state, projection.displayedCosts)
    : null;
  const currentUrl = query ? `/llm-price-performance/?${query}` : "/llm-price-performance/";

  useEffect(() => {
    if (canonicalUrl && canonicalUrl !== currentUrl)
      router.replace(canonicalUrl, { scroll: false });
  }, [canonicalUrl, currentUrl, router]);

  const updateState = (changes: Partial<PricePerformanceState>) => {
    if (!envelope) return;
    const next = projectLlmPricePerformance(envelope, { ...settledState, ...changes });
    router.replace(pricePerformanceUrl(next.state, next.displayedCosts), {
      scroll: false,
    });
  };
  const select = (point: PricePerformancePointView, trigger: HTMLElement | null) => {
    selectedTriggerRef.current = trigger;
    setSelected(point);
  };
  const attribution = envelope?.attribution ?? [];
  const points = projection?.points ?? [];
  const summary = projection?.summary ?? [];
  const visibleSelected =
    selected && points.some((point) => point.modelKey === selected.modelKey)
      ? selected
      : null;
  const domain = envelope
    ? llmPricePerformancePriceDomain(envelope.data.points, settledState)
    : [];
  const rows = csvRows(points, attribution);

  return (
    <main className="overflow-x-clip" id="page-content">
      <section className="border-b border-border px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <p className="text-sm text-muted-foreground">TokenBench decision surface</p>
          <div className="mt-3 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <h1 className="text-balance text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">
                LLM Price vs. Performance Benchmark
              </h1>
              <p className="mt-5 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
                Compare real-time LLM API pricing against verified benchmark scores. Track Pareto frontier models to identify the optimal balance of intelligence and cost for your workload.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className={cn("inline-flex min-h-8 items-center rounded-full border px-3", snapshot.mode === "unconfigured" ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "border-primary/30 bg-active-control text-active-control-foreground")}>
                {envelope?.freshness.status === "stale" ? "Stale evidence" : dataModeLabel(snapshot.mode)}
              </span>
              <span className="inline-flex min-h-8 items-center rounded-full border border-border bg-card px-3 text-muted-foreground">
                Output USD / 1M default
              </span>
            </div>
          </div>
          {snapshot.mode === "preview" ? (
            <p className="mt-5 inline-flex items-center gap-2 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200" role="status">
              <Info className="size-3.5" />
              Preview evidence is shown for local design review only and is not a production fallback.
            </p>
          ) : null}
          {envelope?.freshness.status === "stale" ? (
            <p className="mt-5 inline-flex items-center gap-2 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200" role="status">
              <CircleAlert className="size-3.5" />
              {envelope.freshness.message ?? "Showing the last valid published revision while refresh is unavailable."}
            </p>
          ) : null}
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <section aria-labelledby="llm-price-performance-filters-heading" className="border-b border-border py-10 sm:py-14">
          <div className="max-w-3xl">
            <p className="text-sm text-muted-foreground">Decision controls</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.025em]" id="llm-price-performance-filters-heading">
              Filter Models &amp; Data Parameters
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Customize the score lane, pricing range, and vendor filters to update the scatter plot and data tables below.
            </p>
          </div>
          <div className="mt-7 rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-6">
            <LlmPricePerformanceControls
              disabled={!envelope}
              domain={domain}
              onChange={updateState}
              providers={envelope?.data.capabilities.creators ?? []}
              state={settledState}
            />
          </div>
        </section>

        <section aria-labelledby="llm-price-performance-chart-heading" className="border-b border-border py-10 sm:py-14">
          <div className="max-w-3xl">
            <p className="text-sm text-muted-foreground">Analytical view</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.025em]" id="llm-price-performance-chart-heading">
              Price–Performance Pareto Frontier
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Models on the dotted line represent the best performance available at their given price point (Pareto frontier). Select any point to inspect exact scores and token costs.
            </p>
          </div>
          <div className="mt-7 rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-6">
            {envelope ? (
              <LlmPricePerformanceParetoChart
                attribution={attribution}
                basis={settledState.costBasis}
                lane={settledState.lane}
                onSelect={select}
                points={points}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-muted/35 p-6 text-sm text-muted-foreground" role="alert">
                <strong className="block text-foreground">Chart unavailable</strong>
                <p className="mt-2">{snapshot.error ?? "No validated price-performance projection is available."}</p>
                <p className="mt-2">The equivalent values table remains available below with its unavailable state.</p>
              </div>
            )}
          </div>
        </section>

        <section aria-labelledby="llm-price-performance-results-heading" className="py-10 sm:py-14" id="llm-price-performance-result">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm text-muted-foreground">Equivalent values</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.025em]" id="llm-price-performance-results-heading">
                Model Performance &amp; Value Leaderboard
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Compare efficiency metrics, including score-per-dollar values, across all current models.
              </p>
            </div>
            <ResultActions
              filename="tokenbench-llm-price-performance"
              label="Share and export price-performance results"
              rows={rows}
              targetId="llm-price-performance-result"
            />
          </div>
          {!envelope ? (
            <p className="mt-5 inline-flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/35 px-3 py-2 text-xs text-muted-foreground" role="status">
              <CircleAlert className="size-3.5" />
              {snapshot.error ?? "No validated projection is available. Values remain unavailable rather than using a sample."}
            </p>
          ) : null}
          <div className="mt-7 rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-6">
            <LlmPricePerformanceTable attribution={attribution} label="Price versus performance values" points={summary} />
            {points.length > summary.length ? (
              <details className="mt-5 border-t border-border pt-4">
                <summary className="min-h-11 cursor-pointer rounded-lg px-2 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-none">
                  View all {points.length} filtered models
                </summary>
                <div className="mt-4">
                  <LlmPricePerformanceTable attribution={attribution} label="All filtered price versus performance values" points={points} />
                </div>
              </details>
            ) : null}
          </div>
        </section>

        <LlmPricePerformanceEvidence dataMode={snapshot.mode} envelope={envelope} />
      </div>

      {visibleSelected ? (
        <LlmPricePerformanceDetailDialog
          attribution={attribution}
          onClose={() => setSelected(null)}
          point={visibleSelected}
          triggerRef={selectedTriggerRef}
        />
      ) : null}
    </main>
  );
}
