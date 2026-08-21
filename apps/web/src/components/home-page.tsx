"use client";

import {
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  PointElement,
  RadialLinearScale,
  Tooltip,
  type ChartOptions,
} from "chart.js";
import { ArrowRight, Check, ChevronRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Radar } from "react-chartjs-2";

import { formatDisplayNumber, formatDisplayUsd } from "@tokenbench/frontend/display-format";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HomeModel, HomePageData, HomeRankingRow } from "@/lib/home-projector";
import { cn } from "@/lib/utils";

type FilterName = "all" | "open" | "latency" | "throughput";

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

const RESEARCH = [
  { href: "/articles/hybrid-router/", label: "Architecture", title: "A hybrid router for high-stakes agentic work", copy: "Reserve expensive capability for the requests that need it while keeping routine work observable and reversible.", meta: "9 min read · Aug 2026" },
  { href: "/guides/reduce-llm-api-costs-caching-batch-output-limits/", label: "Cost optimization", title: "Lower LLM API Costs with Caching, Batch Jobs, and Output Caps", copy: "Reduce cost per successful task without shifting expense into retries, latency, or human review.", meta: "11 min read · Aug 2026" },
  { href: "/guides/openrouter-guide-model-routing-cost-controls/", label: "API routing", title: "Model routing and cost controls", copy: "Use explicit budgets, logging, and provider-policy choices when one API reaches multiple models.", meta: "10 min read · Aug 2026" },
] as const;

function unavailable(value: string | null | undefined): string {
  return value === null || value === undefined || value.length === 0 ? "Unavailable" : value;
}

function formatNumber(value: number | null, decimals = 0): string {
  if (value === null || !Number.isFinite(value)) return "Unavailable";
  return formatDisplayNumber(value, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatScore(value: number | null): string {
  return value === null ? "Unavailable" : formatNumber(value, 1);
}

function formatUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Unavailable";
  return formatDisplayUsd(value);
}

function formatRoutePrice(value: number | null): string {
  return value === null ? "Unavailable" : `${formatUsd(value)} / 1M`;
}

function formatRuntime(value: number | null): string {
  return value === null ? "Unavailable" : `${formatNumber(value, 2)}s`;
}

function formatThroughput(value: number | null): string {
  return value === null ? "Unavailable" : `${formatNumber(value)} tok/s`;
}

function formatTokens(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Unavailable";
  if (value >= 1_000_000) return `${formatNumber(value / 1_000_000, 1)}M`;
  if (value >= 1_000) return `${formatNumber(value / 1_000, 1)}k`;
  return formatNumber(value);
}

function identityRecordStatus(value: string | null): string {
  return value === null ? "Unavailable" : "Recorded";
}

function modeLabel(mode: HomePageData["mode"]): string {
  if (mode === "evidence") return "Retained preview evidence";
  if (mode === "production") return "Published data";
  return "Data unavailable";
}

function BrandDot({ color }: { color: string }) {
  return <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full ring-4 ring-foreground/5" style={{ backgroundColor: color }} />;
}

function SectionHeader({ number, title, copy, href, action }: { number: string; title: string; copy: string; href?: string; action?: string }) {
  return (
    <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
      <div className="max-w-2xl">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[.22em] text-muted-foreground">{number}</p>
        <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
        <p className="mt-3 text-pretty text-sm leading-6 text-muted-foreground sm:text-base">{copy}</p>
      </div>
      {href && action ? <Button className="self-start rounded-full sm:self-auto" nativeButton={false} render={<Link href={href} />} variant="outline">{action}<ArrowRight /></Button> : null}
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-8 text-sm leading-6 text-muted-foreground" role="status">{children}</p>;
}

function DecisionSnapshot({ data }: { data: HomePageData }) {
  const rows = data.snapshot;
  return (
    <Card aria-label="Current model evidence snapshot" className="overflow-hidden border-foreground/10 bg-card/90 py-0 shadow-2xl shadow-black/20 backdrop-blur">
      <CardHeader className="border-b border-border px-5 py-5 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div><p className="font-mono text-[10px] tracking-[.18em] text-muted-foreground">DECISION SNAPSHOT</p><CardTitle className="mt-2 text-base">Observed model evidence</CardTitle></div>
          <Badge variant="outline">{data.updatedAt?.slice(0, 10) ?? "Timestamp unavailable"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-5 sm:p-6">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 border-b border-border pb-3 font-mono text-[9px] uppercase tracking-wider text-muted-foreground"><span>Candidate</span><span>Score</span><span>TTFT</span><span>Input / 1M</span></div>
        {rows.length === 0 ? <EmptyState>{data.rankingMessage}</EmptyState> : <ol className="divide-y divide-border">
          {rows.map((row) => <SnapshotRow key={row.model.id} row={row} />)}
        </ol>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"><span className="flex items-center gap-2"><Check className="size-3.5" />Source-linked evidence</span><span>Unknowns remain unavailable</span></div>
      </CardContent>
    </Card>
  );
}

function SnapshotRow({ row }: { row: HomeRankingRow }) {
  const { model } = row;
  return (
    <li className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 py-4">
      <div className="flex min-w-0 items-center gap-3"><span aria-label={row.rank === null ? "Rank unavailable" : undefined} className="font-mono text-[10px] text-muted-foreground">{row.rank === null ? "—" : `#${row.rank}`}</span><BrandDot color={model.color} /><span className="min-w-0"><span className="block truncate text-sm font-medium">{unavailable(model.name)}</span><span className="block truncate text-[10px] text-muted-foreground">{unavailable(model.access)}</span></span></div>
      <span className="font-mono text-xs">{formatScore(model.capabilityScore)}</span><span className="font-mono text-xs">{formatRuntime(model.ttftP50Seconds)}</span><span className="font-mono text-xs">{formatUsd(model.inputUsdPerMillion)}</span>
    </li>
  );
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0 ? (ordered[middle - 1] + ordered[middle]) / 2 : ordered[middle];
}

function ModelWorkbenchPreview({ data }: { data: HomePageData }) {
  const [filter, setFilter] = useState<FilterName>("all");
  const latencyCutoff = useMemo(() => median(data.models.flatMap((model) => model.ttftP50Seconds === null ? [] : [model.ttftP50Seconds])), [data.models]);
  const throughputCutoff = useMemo(() => median(data.models.flatMap((model) => model.outputTokensPerSecond === null ? [] : [model.outputTokensPerSecond])), [data.models]);
  const models = useMemo(() => data.models.filter((model) => {
    if (filter === "open") return model.access === "Open weights";
    if (filter === "latency") return model.ttftP50Seconds !== null && latencyCutoff !== null && model.ttftP50Seconds <= latencyCutoff;
    if (filter === "throughput") return model.outputTokensPerSecond !== null && throughputCutoff !== null && model.outputTokensPerSecond >= throughputCutoff;
    return true;
  }), [data.models, filter, latencyCutoff, throughputCutoff]);

  return (
    <div className="mt-8">
      <div aria-label="Model workbench filters" className="mb-5 flex flex-wrap gap-2" role="group">
        {([ ["all", "All models"], ["open", "Open-weight"], ["latency", "Low-latency"], ["throughput", "High-throughput"] ] as const).map(([id, label]) => <button aria-pressed={filter === id} className={cn("rounded-full border px-4 py-2 text-xs transition-colors", filter === id ? "border-active-control bg-active-control text-active-control-foreground hover:bg-active-control" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground")} key={id} onClick={() => setFilter(id)} type="button">{label}</button>)}
      </div>
      <div aria-label="Model workbench preview" className="overflow-x-auto rounded-2xl border border-border bg-card" role="region">
        <table className="min-w-[760px] w-full border-collapse text-sm">
          <caption className="sr-only">Available model identity, access, route pricing, and runtime facts</caption>
          <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="px-5 py-4 font-medium">Model</th><th className="px-4 py-4 font-medium">Identity record</th><th className="px-4 py-4 font-medium">Access</th><th className="px-4 py-4 text-right font-medium">Input / 1M</th><th className="px-4 py-4 text-right font-medium">Output / 1M</th><th className="px-4 py-4 text-right font-medium">TTFT · p50</th><th className="px-5 py-4 text-right font-medium">Throughput</th></tr></thead>
          <tbody>{models.length > 0 ? models.map((model) => <tr className="border-b border-border last:border-b-0 hover:bg-muted/40" key={model.id}><td className="px-5 py-4 font-medium">{model.name === null ? <span className="text-muted-foreground">Unavailable</span> : <Link className="hover:underline" href={`/model-profile?model=${encodeURIComponent(model.id)}`}>{model.name}</Link>}</td><td className="px-4 py-4 text-muted-foreground">{identityRecordStatus(model.provider)}</td><td className="px-4 py-4 text-muted-foreground">{unavailable(model.access)}</td><td className="px-4 py-4 text-right font-mono">{formatRoutePrice(model.inputUsdPerMillion)}</td><td className="px-4 py-4 text-right font-mono">{formatRoutePrice(model.outputUsdPerMillion)}</td><td className="px-4 py-4 text-right font-mono">{formatRuntime(model.ttftP50Seconds)}</td><td className="px-5 py-4 text-right font-mono">{formatThroughput(model.outputTokensPerSecond)}</td></tr>) : <tr><td className="px-5 py-8 text-sm text-muted-foreground" colSpan={7}>{data.modelMessage ?? "No accepted model records match this filter."}</td></tr>}</tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{models.length} accepted {models.length === 1 ? "model" : "models"} shown. Runtime filters include only records with that observed measurement.</p>
    </div>
  );
}

type HomeChartTheme = Readonly<{
  accent: string;
  accentFill: string;
  grid: string;
  muted: string;
  reducedMotion: boolean;
  strong: string;
  tooltip: string;
  tooltipBorder: string;
}>;

function fallbackHomeChartTheme(dark: boolean, reducedMotion: boolean): HomeChartTheme {
  const accent = dark ? "#9dabff" : "#1111ff";
  return dark ? {
    accent,
    accentFill: "rgba(157,171,255,.18)",
    grid: "rgba(255,255,255,.12)",
    muted: "#a1a1aa",
    reducedMotion,
    strong: "#fafafa",
    tooltip: "#18181b",
    tooltipBorder: accent,
  } : {
    accent,
    accentFill: "rgba(17,17,255,.14)",
    grid: "rgba(0,0,0,.12)",
    muted: "#71717a",
    reducedMotion,
    strong: "#18181b",
    tooltip: "#ffffff",
    tooltipBorder: accent,
  };
}

function useHomeChartTheme(): HomeChartTheme {
  const [theme, setTheme] = useState<HomeChartTheme>(() => fallbackHomeChartTheme(false, false));

  useEffect(() => {
    const root = document.documentElement;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      const fallback = fallbackHomeChartTheme(root.classList.contains("dark"), motion.matches);
      const styles = window.getComputedStyle(root);
      const color = (token: string, value: string) => styles.getPropertyValue(token).trim() || value;
      setTheme({
        ...fallback,
        accent: color("--primary", fallback.accent),
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

function translucentHomeModelColor(color: string): string {
  return color.startsWith("hsl(") && color.endsWith(")") ? `${color.slice(0, -1)} / 0.14)` : color;
}

function ComparisonRadar({ models }: { models: readonly HomeModel[] }) {
  const axes = useMemo(() => {
    const first = models[0]?.radar ?? [];
    return first.flatMap((axis) => {
      const values = models.map((model) => model.radar.find((candidate) => candidate.key === axis.key)?.percentile ?? null);
      return values.every((value): value is number => value !== null) ? [{ label: axis.label, values }] : [];
    });
  }, [models]);
  const theme = useHomeChartTheme();
  const data = useMemo(() => ({
    labels: axes.map((axis) => axis.label),
    datasets: models.map((model, modelIndex) => ({
      label: unavailable(model.name),
      data: axes.map((axis) => axis.values[modelIndex] ?? null),
      borderColor: modelIndex === 0 ? theme.accent : model.color,
      backgroundColor: modelIndex === 0 ? theme.accentFill : translucentHomeModelColor(model.color),
      borderWidth: modelIndex === 0 ? 3 : 2,
      pointBackgroundColor: modelIndex === 0 ? theme.accent : model.color,
      pointRadius: modelIndex === 0 ? 4 : 3,
      pointStyle: modelIndex === 0 ? "rectRot" as const : "circle" as const,
      spanGaps: false,
    })),
  }), [axes, models, theme.accent, theme.accentFill]);
  const options = useMemo<ChartOptions<"radar">>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: theme.reducedMotion ? false : { duration: 400 },
    plugins: {
      legend: {
        position: "bottom",
        labels: { color: theme.muted, padding: 16, pointStyle: "circle", usePointStyle: true },
      },
      tooltip: {
        backgroundColor: theme.tooltip,
        borderColor: theme.tooltipBorder,
        borderWidth: 1,
        bodyColor: theme.muted,
        titleColor: theme.strong,
        callbacks: { label: (context) => `${context.dataset.label}: ${formatScore(context.parsed.r)}` },
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
        ticks: { display: false },
      },
    },
  }), [theme]);
  const description = models.map((model, modelIndex) => `${unavailable(model.name)}: ${axes.map((axis) => `${axis.label} ${formatScore(axis.values[modelIndex])}`).join(", ")}`).join(". ");

  if (models.length < 2 || axes.length === 0) {
    return <EmptyState>Capability overlay is unavailable until two compared models provide matching accepted axes.</EmptyState>;
  }

  if (axes.length < 3) {
    return (
      <div aria-label="Capability comparison by published axis" className="grid gap-5" role="img">
        {axes.map((axis) => (
          <section className="grid gap-3" key={axis.label}>
            <h4 className="text-sm font-medium">{axis.label}</h4>
            {models.map((model, modelIndex) => {
              const value = axis.values[modelIndex] ?? 0;
              return (
                <div className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-3" key={model.id}>
                  <div className="grid min-w-0 gap-1.5">
                    <span className="truncate text-xs text-muted-foreground">{unavailable(model.name)}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <span className="block h-full rounded-full" style={{ backgroundColor: model.color, width: `${Math.max(0, Math.min(100, value))}%` }} />
                    </span>
                  </div>
                  <span className="text-right font-mono text-xs tabular-nums">{formatScore(value)}</span>
                </div>
              );
            })}
          </section>
        ))}
        <p className="sr-only">{description}</p>
      </div>
    );
  }

  return (
    <div aria-describedby="home-comparison-radar-description" aria-label="Capability comparison overlay" className="h-[380px] w-full" role="img">
      <Radar aria-hidden="true" data={data} id="home-comparison-radar" options={options} />
      <p className="sr-only" id="home-comparison-radar-description">{description}. Missing source axes remain unavailable rather than being estimated as zero.</p>
    </div>
  );
}

function ComparisonPreview({ data }: { data: HomePageData }) {
  const models = data.comparison.slice(0, 2);
  const first = models[0] ?? null;
  const second = models[1] ?? null;
  const rows: readonly [string, string, string][] = [
    ["TTFT · lower is better", formatRuntime(first?.ttftP50Seconds ?? null), formatRuntime(second?.ttftP50Seconds ?? null)],
    ["Throughput · higher is better", formatThroughput(first?.outputTokensPerSecond ?? null), formatThroughput(second?.outputTokensPerSecond ?? null)],
    ["Input / output", `${formatRoutePrice(first?.inputUsdPerMillion ?? null)} · ${formatRoutePrice(first?.outputUsdPerMillion ?? null)}`, `${formatRoutePrice(second?.inputUsdPerMillion ?? null)} · ${formatRoutePrice(second?.outputUsdPerMillion ?? null)}`],
    ["Blended cost", formatRoutePrice(first?.blendedUsdPerMillion ?? null), formatRoutePrice(second?.blendedUsdPerMillion ?? null)],
    ["Context", formatTokens(first?.contextWindowTokens ?? null), formatTokens(second?.contextWindowTokens ?? null)],
  ];

  return <div className="mt-9 grid gap-6 lg:grid-cols-[1.1fr_.9fr]"><Card><CardHeader><CardTitle className="text-base">Capability overlay</CardTitle></CardHeader><CardContent><ComparisonRadar models={models} /></CardContent></Card><Card><CardContent className="p-6"><div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-center"><ComparisonIdentity model={first} /><span className="font-mono text-[10px] text-muted-foreground">VS</span><ComparisonIdentity model={second} /></div><dl className="mt-7 divide-y divide-border rounded-xl border border-border text-sm">{rows.map(([label, left, right]) => <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-3" key={label}><dt className="text-muted-foreground">{label}</dt><dd className="max-w-28 text-right font-mono text-xs">{left}</dd><dd className="max-w-28 text-right font-mono text-xs">{right}</dd></div>)}</dl><p className="mt-5 text-xs leading-5 text-muted-foreground">{data.comparisonMessage ?? "Only accepted comparison values are shown; missing measurements remain unavailable."}</p></CardContent></Card></div>;
}

function ComparisonIdentity({ model }: { model: HomeModel | null }) {
  return <div className="min-w-0"><Badge variant="outline">{unavailable(model?.access)}</Badge><h3 className="mt-3 truncate text-lg font-semibold">{unavailable(model?.name)}</h3><p className="truncate text-xs text-muted-foreground">{model?.provider === null || model === null ? "Identity record unavailable" : "Identity record available"}</p></div>;
}

function SubscriptionPreview({ data }: { data: HomePageData }) {
  const { subscription } = data;
  const [pointIndex, setPointIndex] = useState(subscription.initialPointIndex);
  const points = subscription.points;
  const selected = points[Math.min(Math.max(pointIndex, 0), Math.max(0, points.length - 1))] ?? null;
  const fixed = selected?.monthlySubscriptionUsd ?? subscription.monthlySubscriptionUsd;
  const api = selected?.apiUsd ?? subscription.selectedVolumeApiUsd;
  const hasSamples = selected !== null && fixed !== null && api !== null;
  const apiLower = hasSamples && api < fixed;
  const rangeStart = points[0]?.tokens ?? null;
  const rangeEnd = points.at(-1)?.tokens ?? null;

  return (
    <div className="mt-9 grid items-stretch gap-6 lg:grid-cols-[.8fr_1.2fr]">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <Card className="h-full"><CardContent className="flex h-full flex-col justify-center p-5 text-center"><p className="text-xs text-muted-foreground">Validated subscription</p><p className="mt-3 font-mono text-3xl">{formatUsd(fixed)}</p><p className="mt-1 text-xs text-muted-foreground">{subscription.planName ?? "Plan unavailable"}</p></CardContent></Card>
        <span className="font-mono text-[10px] text-muted-foreground">VERSUS</span>
        <Card className="h-full"><CardContent className="flex h-full flex-col justify-center p-5 text-center"><p className="text-xs text-muted-foreground">API consumption</p><p className="mt-3 font-mono text-3xl">{formatUsd(api)}</p><p className="mt-1 text-xs text-muted-foreground">selected validated volume</p></CardContent></Card>
      </div>
      <Card><CardContent className="p-6">
        <div className="flex items-end justify-between gap-4"><div><label className="text-xs text-muted-foreground" htmlFor="home-token-volume">Validated token-volume sample</label><output className="mt-2 block font-mono text-3xl" htmlFor="home-token-volume">{formatTokens(selected?.tokens ?? null)}</output></div><Badge variant={hasSamples ? apiLower ? "secondary" : "default" : "outline"}>{hasSamples ? apiLower ? "API lower" : "Subscription lower" : "Unavailable"}</Badge></div>
        <input aria-describedby="home-token-volume-note" aria-label="Validated token-volume sample" className="mt-7 w-full accent-primary disabled:cursor-not-allowed disabled:opacity-50" disabled={!hasSamples} id="home-token-volume" max={Math.max(0, points.length - 1)} min={0} onChange={(event) => setPointIndex(Number(event.target.value))} step={1} type="range" value={Math.min(Math.max(pointIndex, 0), Math.max(0, points.length - 1))} />
        <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground"><span>{formatTokens(rangeStart)}</span><span>{formatTokens(rangeEnd)}</span></div>
        <p className="mt-5 text-sm leading-6 text-muted-foreground" id="home-token-volume-note">{hasSamples ? <>This comparison uses the selected validated domain sample. {subscription.crossoverTokens === null ? "The crossover volume is unavailable." : `The reported crossover is ${formatTokens(subscription.crossoverTokens)} tokens.`}</> : subscription.message ?? "No accepted subscription calculation is available."}</p>
      </CardContent></Card>
    </div>
  );
}

export function HomePage({ data }: { data: HomePageData }) {
  return (
    <>
      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_8%,color-mix(in_srgb,var(--primary)_16%,transparent),transparent_28%),radial-gradient(circle_at_92%_62%,rgba(217,119,87,.12),transparent_24%)]" />
        <div className="relative mx-auto grid min-h-[690px] max-w-7xl items-center gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1.02fr_.98fr] lg:px-10">
          <div>
            <Badge className="mb-6 gap-2 rounded-full px-3 py-1 font-mono text-[11px]" variant="secondary"><Sparkles className="size-3" />Independent evidence layer</Badge>
            <h1 className="max-w-3xl text-balance text-5xl font-semibold leading-[.98] tracking-[-.045em] sm:text-6xl lg:text-7xl">Empirical evidence for practical AI runtime and cost decisions.</h1>
            <p className="mt-7 max-w-xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">Independent quantitative LLM analysis of capability, streaming latency, and route economics—without collapsed or hidden data.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row"><Button className="rounded-full" nativeButton={false} render={<Link href="/models/" />} size="lg">Explore models workbench<ArrowRight /></Button><Button className="rounded-full" nativeButton={false} render={<Link href="/compare/" />} size="lg" variant="outline">Compare models</Button></div>
            <p className="mt-7 max-w-xl text-xs leading-5 text-muted-foreground">{modeLabel(data.mode)} · {data.updatedAt === null ? "revision timestamp unavailable" : `effective ${data.updatedAt.slice(0, 10)}`}</p>
          </div>
          <DecisionSnapshot data={data} />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10"><SectionHeader action="Open models workbench" copy="Move from candidate discovery to exact route economics without leaving the evidence surface." href="/models/" number="01" title="Discover & Filter Models" /><ModelWorkbenchPreview data={data} /></section>

      <section className="border-y border-border bg-muted/20"><div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10"><SectionHeader action="View all popular model insights" copy="Scan the capability, service, and cost signals people compare most often." href="/popular-models/" number="02" title="Popular Model Insights" />{data.popular.length === 0 ? <EmptyState>{data.rankingMessage}</EmptyState> : <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{data.popular.map((row) => <PopularModelCard key={row.model.id} row={row} />)}</div>}<p className="mt-4 text-xs text-muted-foreground">Only accepted ranking and service values are shown.</p></div></section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10"><SectionHeader action="Compare all models" copy="Compare capability shape and route constraints before choosing a default runtime." href="/compare/" number="03" title="Head-to-Head Capability & Economics" /><ComparisonPreview data={data} /></section>

      <section className="border-y border-border bg-muted/20"><div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10"><SectionHeader action="Calculate subscription vs API savings" copy="Test when a fixed individual seat crosses an API-equivalent workload instead of treating either route as universally cheaper." href="/subscribe-vs-api/" number="04" title="Subscription vs. Pay-As-You-Go API Analysis" /><p className="mt-5 text-xs text-muted-foreground">This view uses only the reviewed plan, route-price, and workload facts behind the calculation.</p><SubscriptionPreview data={data} /></div></section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10"><SectionHeader action="Browse all articles" copy="Follow the assumptions, monitoring practices, and architecture behind defensible model decisions." href="/articles/" number="05" title="Methodological Research & Analysis" /><div className="mt-9 overflow-hidden rounded-2xl border border-border bg-card">{RESEARCH.map((article, index) => <Link className="group grid gap-3 border-b border-border px-5 py-5 transition-colors last:border-b-0 hover:bg-muted/50 sm:grid-cols-[120px_1fr_auto] sm:items-center" href={article.href} key={article.href}><span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{article.label}</span><span><span className="block text-sm font-medium">{article.title}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{article.copy}</span></span><span className="flex items-center gap-3 text-xs text-muted-foreground"><span>{article.meta}</span><ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" /></span><span className="sr-only">Article {index + 1}</span></Link>)}</div></section>
    </>
  );
}

function PopularModelCard({ row }: { row: HomeRankingRow }) {
  const { model } = row;
  return <Card className="group"><CardHeader><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><BrandDot color={model.color} /><div className="min-w-0"><p className="truncate text-xs text-muted-foreground">{unavailable(model.access)}</p><CardTitle className="mt-1 truncate text-sm">{unavailable(model.name)}</CardTitle></div></div><Badge className="shrink-0 font-mono" variant="outline">{row.rank === null ? "Rank unavailable" : `Rank #${row.rank}`}</Badge></div></CardHeader><CardContent><dl className="grid gap-3 border-t border-border pt-4 text-xs"><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Capability score</dt><dd className="font-mono">{formatScore(model.capabilityScore)}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Throughput</dt><dd className="font-mono">{formatThroughput(model.outputTokensPerSecond)}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Input / output</dt><dd className="text-right font-mono">{formatRoutePrice(model.inputUsdPerMillion)} · {formatRoutePrice(model.outputUsdPerMillion)}</dd></div></dl></CardContent></Card>;
}
