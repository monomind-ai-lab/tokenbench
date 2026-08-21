"use client";

import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Brain,
  Braces,
  ChartNoAxesCombined,
  CircleAlert,
  Clapperboard,
  Code2,
  DatabaseZap,
  DollarSign,
  Eye,
  Image,
  Images,
  RotateCcw,
  Scale,
  Scissors,
  Sparkles,
  Trophy,
  Users,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  leaderboardDetailDefinition,
  parseLeaderboardFilters,
  projectLeaderboardRows,
  providersForLeaderboard,
  serializeLeaderboardFilters,
  visibleLeaderboardRows,
  type LeaderboardDisplayRow,
  type LeaderboardFilters,
  type LeaderboardSort,
} from "@tokenbench/frontend/leaderboard-detail";
import { formatDisplayNumber, formatDisplayUsd } from "@tokenbench/frontend/display-format";
import type { LeaderboardKey } from "@tokenbench/routing/leaderboard-routes";
import { LEADERBOARD_ROUTES } from "@tokenbench/routing/leaderboard-routes";

import { LeaderboardCostScoreChart, LeaderboardPriceChart, LeaderboardScoreChart } from "@/components/leaderboard-charts";
import { ResultActions, ViewModeToggle, type CsvRow } from "@/components/result-actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { LeaderboardDataSnapshot } from "@/lib/ui-data.server";
import { cn } from "@/lib/utils";

const ICON_BY_ROUTE: Record<LeaderboardKey, LucideIcon> = {
  "llm-overall": Trophy,
  "llm-coding": Code2,
  "llm-agentic": Bot,
  "llm-reasoning": Brain,
  "llm-knowledge": Braces,
  "llm-human-preference": Users,
  "llm-value": Scale,
  "llm-pricing-context": DollarSign,
  "multimodal-vision-documents": Eye,
  "media-text-to-image": Image,
  "media-image-editing": WandSparkles,
  "media-text-to-video": Clapperboard,
  "media-image-to-video": Images,
  "media-video-editing": Scissors,
};

const SORT_LABELS: Record<LeaderboardSort, string> = {
  "score-desc": "Published score",
  "rank-asc": "Source rank",
  "pareto-score-desc": "Value frontier",
  "price-asc": "Lowest blended price",
  "context-desc": "Largest context",
};

const PROFILE_LABELS = {
  inputHeavy: "Input-heavy",
  balanced: "Balanced",
  outputHeavy: "Output-heavy",
} as const;

function formatScore(value: number | null) {
  return value === null ? "Unavailable" : formatDisplayNumber(value);
}

function formatPrice(value: number | null) {
  return value === null ? "Unavailable" : formatDisplayUsd(value);
}

function formatTokens(value: number | null) {
  if (value === null) return "Unavailable";
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M`;
  if (value >= 1_000) return `${Number((value / 1_000).toFixed(1))}K`;
  return value.toLocaleString("en-US");
}

function formatTimestamp(value: string | null) {
  if (value === null) return "Mixed or unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date) + " UTC";
}

function providerColor(provider: string) {
  const palette = ["#5489d6", "#d97757", "#7c8fd1", "#66a98d", "#c49a53", "#9a7cc1"];
  let hash = 0;
  for (const character of provider) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

function ProviderDot({ provider }: { provider: string }) {
  const color = providerColor(provider);
  return <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full ring-4 ring-current/10" style={{ backgroundColor: color, color }} />;
}

function LeaderboardRowCard({ row, position, pricingOnly }: { row: LeaderboardDisplayRow; position: number; pricingOnly: boolean }) {
  return (
    <Card className={cn("transition-colors hover:ring-foreground/20", row.frontier && "ring-1 ring-primary/35")}>
      <CardContent>
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-muted/60 font-mono text-xs text-muted-foreground">
            {row.rank === null ? String(position + 1).padStart(2, "0") : `#${row.rank}`}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium">{row.name}</h3>
              {row.frontier ? <Badge variant="secondary"><Sparkles />Frontier</Badge> : null}
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground"><ProviderDot provider={row.provider} />{row.provider} · {row.access}</div>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border sm:grid-cols-4">
          {!pricingOnly ? <div className="bg-muted/55 p-3"><dt className="text-[10px] text-muted-foreground">{row.metricLabel}</dt><dd className="mt-1 font-mono text-sm">{formatScore(row.metric)}</dd></div> : null}
          <div className="bg-muted/55 p-3"><dt className="text-[10px] text-muted-foreground">Blended / 1M</dt><dd className="mt-1 font-mono text-sm">{formatPrice(row.blendedUsdPerMillion)}</dd></div>
          <div className="bg-muted/55 p-3"><dt className="text-[10px] text-muted-foreground">Context</dt><dd className="mt-1 font-mono text-sm">{formatTokens(row.contextWindowTokens)}</dd></div>
          <div className="bg-muted/55 p-3"><dt className="text-[10px] text-muted-foreground">Route</dt><dd className="mt-1 truncate font-mono text-sm" title={row.route ?? undefined}>{row.route ?? "Unavailable"}</dd></div>
        </dl>
      </CardContent>
    </Card>
  );
}

function LeaderboardTable({ rows, pricingOnly }: { rows: readonly LeaderboardDisplayRow[]; pricingOnly: boolean }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full min-w-[980px] border-collapse text-sm">
        <thead className="bg-muted/60 text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-3 text-left">Position</th>
            <th className="px-4 py-3 text-left">Model</th>
            <th className="px-4 py-3 text-left">Access</th>
            {!pricingOnly ? <th className="px-4 py-3 text-right">Published score</th> : null}
            <th className="px-4 py-3 text-right">Input / 1M</th>
            <th className="px-4 py-3 text-right">Output / 1M</th>
            <th className="px-4 py-3 text-right">Blended / 1M</th>
            <th className="px-4 py-3 text-right">Context</th>
            <th className="px-4 py-3 text-left">Selected route</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-t border-border transition-colors hover:bg-muted/30" key={row.id}>
              <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{row.rank === null ? "Unranked" : `#${row.rank}`}{row.frontier ? <Badge className="ml-2" variant="secondary">Frontier</Badge> : null}</td>
              <td className="px-4 py-3"><span className="flex items-center gap-3"><ProviderDot provider={row.provider} /><span><span className="block font-medium">{row.name}</span><span className="block text-xs text-muted-foreground">{row.provider}</span></span></span></td>
              <td className="px-4 py-3 text-muted-foreground">{row.access}</td>
              {!pricingOnly ? <td className="px-4 py-3 text-right"><span className="font-mono">{formatScore(row.metric)}</span><span className="block text-[10px] text-muted-foreground">{row.metricLabel}{row.fieldSize === null ? "" : ` · field ${row.fieldSize}`}</span></td> : null}
              <td className="px-4 py-3 text-right font-mono">{formatPrice(row.inputUsdPerMillion)}</td>
              <td className="px-4 py-3 text-right font-mono">{formatPrice(row.outputUsdPerMillion)}</td>
              <td className="px-4 py-3 text-right font-mono">{formatPrice(row.blendedUsdPerMillion)}</td>
              <td className="px-4 py-3 text-right font-mono">{formatTokens(row.contextWindowTokens)}</td>
              <td className="max-w-52 px-4 py-3 font-mono text-xs text-muted-foreground"><span className="block truncate" title={row.route ?? undefined}>{row.route ?? "Unavailable"}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function csvRows(rows: readonly LeaderboardDisplayRow[], unavailableReason: string | null): CsvRow[] {
  if (!rows.length) return [{ status: "unavailable", reason: unavailableReason }];
  return rows.map((row) => ({
    rank: row.rank,
    model: row.name,
    provider: row.provider,
    access: row.access,
    metric: row.metric,
    metricLabel: row.metricLabel,
    fieldSize: row.fieldSize,
    inputUsdPerMillion: row.inputUsdPerMillion,
    outputUsdPerMillion: row.outputUsdPerMillion,
    blendedUsdPerMillion: row.blendedUsdPerMillion,
    contextWindowTokens: row.contextWindowTokens,
    maxOutputTokens: row.maxOutputTokens,
    route: row.route,
    valueFrontier: row.frontier,
  }));
}

export function LeaderboardDetailPage({
  routeKey,
  snapshot,
  initialFilters,
}: {
  routeKey: LeaderboardKey;
  snapshot: LeaderboardDataSnapshot;
  initialFilters: LeaderboardFilters;
}) {
  const route = LEADERBOARD_ROUTES[routeKey];
  const definition = useMemo(() => leaderboardDetailDefinition(routeKey), [routeKey]);
  const Icon = ICON_BY_ROUTE[routeKey];
  const [filters, setFilters] = useState(initialFilters);
  const rows = useMemo(() => projectLeaderboardRows(definition, snapshot.envelope, filters), [definition, filters, snapshot.envelope]);
  const visibleRows = useMemo(() => visibleLeaderboardRows(rows), [rows]);
  const sourceRows = useMemo(() => projectLeaderboardRows(definition, snapshot.envelope, {
    ...filters,
    search: "",
    provider: "all",
    access: "all",
  }), [definition, filters, snapshot.envelope]);
  const sourceUnavailable = sourceRows.length === 0;
  const providers = useMemo(
    () => sourceUnavailable ? [] : providersForLeaderboard(snapshot.envelope),
    [snapshot.envelope, sourceUnavailable],
  );
  const unavailableReason = snapshot.error
    ?? snapshot.envelope?.reason
    ?? (sourceUnavailable ? definition.unavailableReason : null);
  const pricingOnly = definition.kind === "pricing";
  const metricLabel = visibleRows.find((row) => row.metric !== null)?.metricLabel ?? route.seo.h1;

  useEffect(() => {
    const query = serializeLeaderboardFilters(definition, filters);
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== nextUrl) {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
  }, [definition, filters]);

  useEffect(() => {
    const onPopState = () => {
      const parameters = Object.fromEntries(new URLSearchParams(window.location.search));
      setFilters(parseLeaderboardFilters(definition, parameters));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [definition]);

  const reset = () => setFilters(parseLeaderboardFilters(definition, {}));
  const update = <Key extends keyof LeaderboardFilters>(key: Key, value: LeaderboardFilters[Key]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  return (
    <div>
      <section aria-labelledby="leaderboard-heading" className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,color-mix(in_srgb,var(--primary)_14%,transparent),transparent_30%),radial-gradient(circle_at_15%_90%,rgba(217,119,87,.07),transparent_24%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1fr_390px] lg:items-end lg:px-10">
          <div>
            <Link className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground" href="/leaderboards/"><ArrowLeft className="size-4" />All leaderboards</Link>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Badge className="font-mono text-[10px] uppercase tracking-[.16em]" variant="secondary"><Icon />Evidence lens</Badge>
              <Badge variant="outline">Published source</Badge>
              {snapshot.mode === "evidence" ? <Badge variant="outline">Design evidence</Badge> : null}
            </div>
            <h1 className="mt-6 max-w-4xl text-balance text-5xl font-semibold leading-[.98] tracking-[-.04em] sm:text-6xl" id="leaderboard-heading">{route.seo.h1}</h1>
            <p className="mt-6 max-w-3xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">{route.seo.summary}</p>
            <div className="mt-8"><ResultActions filename={`tokenbench-${routeKey}`} rows={csvRows(visibleRows, unavailableReason)} targetId="leaderboard-results" /></div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border bg-card/90 shadow-soft">
            <div className="border-b border-border px-5 py-4"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-medium">Evidence receipt</p><p className="mt-1 text-xs text-muted-foreground">The timestamp and coverage travel with the result.</p></div><Link className="shrink-0 text-xs font-medium text-link hover:underline" href="/data-sources/">Data sources</Link></div></div>
            <dl className="grid grid-cols-2 gap-px bg-border">
              <div className="bg-card p-4"><dt className="font-mono text-[10px] uppercase text-muted-foreground">Status</dt><dd className="mt-2 text-sm font-medium capitalize">{sourceUnavailable ? "Unavailable" : snapshot.envelope?.status ?? "Unavailable"}</dd></div>
              <div className="bg-card p-4"><dt className="font-mono text-[10px] uppercase text-muted-foreground">Published rows</dt><dd className="mt-2 font-mono text-sm">{sourceRows.length}</dd></div>
              <div className="col-span-2 bg-card p-4"><dt className="font-mono text-[10px] uppercase text-muted-foreground">Last updated</dt><dd className="mt-2 text-sm">{formatTimestamp(sourceUnavailable ? null : snapshot.envelope?.effectiveAt ?? null)}</dd></div>
            </dl>
          </div>
        </div>
      </section>

      {!sourceUnavailable && definition.kind !== "pricing" ? (
        <section aria-labelledby="score-chart-heading" className="px-5 py-14 sm:px-8 sm:py-16 lg:px-10">
          <div className="mx-auto max-w-7xl">
            <p className="font-mono text-xs text-muted-foreground">01 / PUBLISHED EVIDENCE</p>
            <div className="mt-2 grid gap-4 md:grid-cols-[1fr_1fr] md:items-end"><div><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl" id="score-chart-heading">Score comparison</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">The visible field for this exact evidence lens. Exact values remain in the result table below.</p></div><p className="text-sm text-muted-foreground md:justify-self-end">Unavailable measurements are omitted, never plotted at zero.</p></div>
            <Card className="mt-7"><CardContent className="pt-2"><LeaderboardScoreChart label={metricLabel} rows={visibleRows} /></CardContent></Card>
          </div>
        </section>
      ) : null}

      {!sourceUnavailable && definition.kind === "value" ? (
        <section aria-labelledby="frontier-chart-heading" className="border-y border-border bg-muted/25 px-5 py-14 sm:px-8 sm:py-16 lg:px-10">
          <div className="mx-auto max-w-7xl"><p className="font-mono text-xs text-muted-foreground">02 / VALUE FRONTIER</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl" id="frontier-chart-heading">Cost versus published score</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Larger points are non-dominated under the selected workload mix: no cheaper published route scores higher.</p><Card className="mt-7"><CardContent className="pt-2"><LeaderboardCostScoreChart rows={visibleRows} /></CardContent></Card></div>
        </section>
      ) : null}

      {!sourceUnavailable && pricingOnly ? (
        <section aria-labelledby="price-chart-heading" className="px-5 py-14 sm:px-8 sm:py-16 lg:px-10">
          <div className="mx-auto max-w-7xl"><p className="font-mono text-xs text-muted-foreground">01 / ROUTE ECONOMICS</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl" id="price-chart-heading">Selected-route price comparison</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Prices use the active workload mix and remain tied to the selected provider route.</p><Card className="mt-7"><CardContent className="pt-2"><LeaderboardPriceChart rows={visibleRows} /></CardContent></Card></div>
        </section>
      ) : null}

      <section aria-labelledby="leaderboard-filters-heading" className="border-y border-border bg-muted/25 px-5 py-14 sm:px-8 sm:py-16 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-6 md:grid-cols-[.7fr_1.3fr] md:items-end"><div><p className="font-mono text-xs text-muted-foreground">{definition.kind === "value" ? "03" : "02"} / FILTER AND SORT</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl" id="leaderboard-filters-heading">Review the published revision</h2></div><p className="max-w-2xl text-sm leading-6 text-muted-foreground md:justify-self-end">Filters change the visible result only. They do not rewrite the source metric, reconstruct missing positions, or substitute another benchmark.</p></div>
          <form aria-label="Leaderboard filters" className="mt-7 grid gap-3 rounded-2xl border border-border bg-card p-4 md:grid-cols-2 xl:grid-cols-[1.35fr_1fr_1fr_1fr_auto] xl:items-end" onSubmit={(event) => event.preventDefault()}>
            <label className="space-y-1.5 text-xs text-muted-foreground" htmlFor="leaderboard-search">Search model or provider<Input className="mt-1.5 h-11" id="leaderboard-search" onChange={(event) => update("search", event.target.value)} placeholder="Model, provider, or route" type="search" value={filters.search} /></label>
            <label className="space-y-1.5 text-xs text-muted-foreground" htmlFor="leaderboard-provider">Provider<select className="mt-1.5 block h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" id="leaderboard-provider" onChange={(event) => update("provider", event.target.value)} value={filters.provider}><option value="all">All providers</option>{providers.map((provider) => <option key={provider} value={provider}>{provider}</option>)}</select></label>
            <label className="space-y-1.5 text-xs text-muted-foreground" htmlFor="leaderboard-access">Access<select className="mt-1.5 block h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" id="leaderboard-access" onChange={(event) => update("access", event.target.value as LeaderboardFilters["access"])} value={filters.access}><option value="all">All access</option><option value="open">Open weights</option><option value="closed">Proprietary</option></select></label>
            <label className="space-y-1.5 text-xs text-muted-foreground" htmlFor="leaderboard-sort">Sort<select className="mt-1.5 block h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" id="leaderboard-sort" onChange={(event) => update("sort", event.target.value as LeaderboardSort)} value={filters.sort}>{definition.sortOptions.map((sort) => <option key={sort} value={sort}>{SORT_LABELS[sort]}</option>)}</select></label>
            <Button className="min-h-11" onClick={reset} type="button" variant="outline"><RotateCcw />Reset</Button>
          </form>
          {definition.supportsProfile ? <fieldset className="mt-4 rounded-2xl border border-border bg-card p-4"><legend className="px-1 text-xs text-muted-foreground">Workload profile</legend><div className="flex flex-wrap gap-2">{(Object.keys(PROFILE_LABELS) as (keyof typeof PROFILE_LABELS)[]).map((profile) => <label className={cn("flex min-h-11 cursor-pointer items-center rounded-xl border px-4 text-sm transition-colors", filters.profile === profile ? "border-active-control bg-active-control text-active-control-foreground" : "border-border")} key={profile}><input checked={filters.profile === profile} className="sr-only" name="workload-profile" onChange={() => update("profile", profile)} type="radio" value={profile} />{PROFILE_LABELS[profile]}</label>)}</div><p className="mt-3 text-xs text-muted-foreground">Input-heavy is 75% input / 25% output, balanced is 50% / 50%, and output-heavy is 25% / 75%.</p></fieldset> : null}
        </div>
      </section>

      <section aria-labelledby="leaderboard-results-heading" className="px-5 py-14 sm:px-8 sm:py-16 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-xs text-muted-foreground">{definition.kind === "value" ? "04" : "03"} / RESULT FIELD</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl" id="leaderboard-results-heading">{route.seo.h1} results</h2><p aria-live="polite" className="mt-2 text-sm text-muted-foreground"><span className="font-mono text-foreground">{visibleRows.length}</span>{rows.length > visibleRows.length ? <> of <span className="font-mono text-foreground">{rows.length}</span></> : null} published {visibleRows.length === 1 ? "row" : "rows"} shown</p></div><ViewModeToggle mode={filters.view} onChange={(view) => update("view", view)} /></div>
          <div className="mt-7" id="leaderboard-results">
            {sourceUnavailable ? <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center" role="status"><div className="max-w-xl"><DatabaseZap className="mx-auto size-7 text-muted-foreground" /><h3 className="mt-4 text-lg font-medium">Verified source projection unavailable</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{unavailableReason}</p><p className="mt-4 text-xs leading-5 text-muted-foreground">This route remains published so its methodology, query semantics, exports, and future data boundary are stable. TokenBench does not fill it with another source&apos;s scores.</p></div></div> : null}
            {!sourceUnavailable && rows.length === 0 ? <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-border text-center"><div><CircleAlert className="mx-auto size-6 text-muted-foreground" /><h3 className="mt-3 font-medium">No published rows match these filters</h3><p className="mt-1 text-sm text-muted-foreground">Broaden the query or reset the visible result field.</p><Button className="mt-4 min-h-11" onClick={reset} variant="outline"><RotateCcw />Reset filters</Button></div></div> : null}
            {visibleRows.length > 0 && filters.view === "cards" ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{visibleRows.map((row, index) => <LeaderboardRowCard key={row.id} position={index} pricingOnly={pricingOnly} row={row} />)}</div> : null}
            {visibleRows.length > 0 && filters.view === "list" ? <><div className="grid gap-3 md:hidden">{visibleRows.map((row, index) => <LeaderboardRowCard key={row.id} position={index} pricingOnly={pricingOnly} row={row} />)}</div><div className="hidden md:block"><LeaderboardTable pricingOnly={pricingOnly} rows={visibleRows} /></div></> : null}
          </div>
        </div>
      </section>

      <section aria-labelledby="related-leaderboards-heading" className="px-5 py-14 sm:px-8 sm:py-16 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-xs text-muted-foreground">EXPLORE BY LENS</p><h2 className="mt-2 text-2xl font-semibold" id="related-leaderboards-heading">Related leaderboards</h2></div><Link className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-link hover:underline" href="/data-sources/">Review data sources<ArrowRight className="size-4" /></Link></div>
          <nav aria-label="Featured leaderboards" className="mt-7 grid gap-3 sm:grid-cols-2">
            {[
              ["/popular-models/", "Popular models", "Browse the published model table, category lenses, insights, and ordered comparison set."],
              ["/make-it-yours/", "Make it yours", "Re-rank published candidates with your own capability weights and SLA thresholds."],
            ].map(([href, title, copy]) => <Link className="group rounded-2xl border border-primary/35 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--primary)_10%,var(--card)),var(--card))] p-5 transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={href} key={href}><span className="flex items-center justify-between gap-4"><Badge variant="secondary">Featured</Badge><ArrowRight className="size-4 text-primary transition-transform group-hover:translate-x-1" /></span><span className="mt-5 block text-lg font-semibold">{title}</span><span className="mt-2 block text-sm leading-6 text-muted-foreground">{copy}</span></Link>)}
          </nav>
          <nav aria-label="Related leaderboards" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(Object.entries(LEADERBOARD_ROUTES) as [LeaderboardKey, (typeof LEADERBOARD_ROUTES)[LeaderboardKey]][]).filter(([key]) => key !== routeKey).map(([key, related]) => { const RelatedIcon = ICON_BY_ROUTE[key]; return <Link className="group flex min-h-20 items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={related.pathname} key={key}><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><RelatedIcon className="size-4" /></span><span className="min-w-0 flex-1 text-sm font-medium">{related.navigationLabel}</span><ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" /></Link>; })}</nav>
        </div>
      </section>

      <aside aria-label="MonoMind optimization services" className="border-t border-border bg-muted/25 px-5 py-14 sm:px-8 sm:py-16 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_auto] lg:items-end"><div><ChartNoAxesCombined className="size-5 text-muted-foreground" /><p className="mt-5 font-mono text-xs text-muted-foreground">MONOMIND AI LAB</p><h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight">Need a workload-specific model decision?</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">MonoMind can review routing, caching, evaluation design, and agent architecture against the evidence and operating constraints that matter to your team.</p></div><a className={cn(buttonVariants(), "min-h-11")} href="https://monomind.one/">Talk to MonoMind<ArrowRight /></a></div>
      </aside>
    </div>
  );
}
