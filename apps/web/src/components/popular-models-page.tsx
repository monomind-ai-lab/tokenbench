"use client";

import {
  ArrowRight,
  Check,
  CircleAlert,
  GitCompareArrows,
  Plus,
  RotateCcw,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  PopularModelsAggregateCostRankingChart,
  PopularModelsAggregateQualityCostChart,
  PopularModelsCostRankingChart,
  PopularModelsQualityCostChart,
  popularProviderColor,
} from "@/components/popular-models-charts";
import { ResultActions, ViewModeToggle, type CsvRow } from "@/components/result-actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  popularModelsMetricValue,
  type PopularModelV1,
  type PopularModelsCategoryV1,
  type PopularModelsEvidenceNumberV1,
  type PopularModelsV1ViewModel,
} from "@tokenbench/frontend/popular-models-v1";

type SortKey = "metric" | "rank" | "price" | "name";
type AccessFilter = "all" | "open" | "closed";
type ViewMode = "cards" | "list";
type PopularModelsDataMode = "evidence" | "production" | "unconfigured";

export type PopularModelsPageParameters = Readonly<Record<string, string | readonly string[] | undefined>>;

interface InitialControls {
  readonly access: AccessFilter;
  readonly categoryKey: string | null;
  readonly insightCategoryKey: string | null;
  readonly providers: readonly string[];
  readonly search: string;
  readonly sort: SortKey;
  readonly view: ViewMode;
}

function firstParameter(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === "string" ? value : value?.[0];
}

function supportedSort(value: string | undefined): SortKey {
  return value === "rank" || value === "price" || value === "name" ? value : "metric";
}

function supportedAccess(value: string | undefined): AccessFilter {
  return value === "open" || value === "closed" ? value : "all";
}

function parseProviders(value: string | undefined): readonly string[] {
  if (!value) return [];
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))].toSorted();
}

function initialControls(parameters: PopularModelsPageParameters, categories: readonly PopularModelsCategoryV1[]): InitialControls {
  const category = firstParameter(parameters.category);
  const insightCategory = firstParameter(parameters.insight);
  return {
    access: supportedAccess(firstParameter(parameters.access)),
    categoryKey: categories.some((item) => item.key === category) ? category ?? null : null,
    insightCategoryKey: categories.some((item) => item.key === insightCategory) ? insightCategory ?? null : null,
    providers: parseProviders(firstParameter(parameters.providers)),
    search: firstParameter(parameters.search)?.slice(0, 120) ?? "",
    sort: supportedSort(firstParameter(parameters.sort)),
    view: firstParameter(parameters.view) === "cards" ? "cards" : "list",
  };
}

function modelName(model: PopularModelV1): string {
  return model.name ?? "Unavailable model identity";
}

function providerName(model: PopularModelV1): string {
  return model.provider ?? "Unavailable provider";
}

function rankLabel(model: PopularModelV1): string {
  return model.rank === null ? "Unranked" : `#${model.rank}`;
}

function formatNumber(value: number | null, maximumFractionDigits = 2): string {
  return value === null ? "Unavailable" : new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
}

function formatPrice(value: number | null): string {
  if (value === null) return "Unavailable";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 1 ? 3 : 2,
  }).format(value);
}

function formatTokens(value: number | null): string {
  if (value === null) return "Unavailable";
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M`;
  if (value >= 1_000) return `${Number((value / 1_000).toFixed(1))}K`;
  return value.toLocaleString("en-US");
}

function compareNullable(left: number | null, right: number | null, direction: "asc" | "desc"): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return direction === "asc" ? left - right : right - left;
}

function pricingValue(model: PopularModelV1): number | null {
  return model.routePricing.availability === "available" ? model.routePricing.blendedUsdPerMillion : null;
}

function formatEvidenceNumber(
  measurement: PopularModelsEvidenceNumberV1,
  formatter: (value: number) => string = (value) => formatNumber(value),
): string {
  return measurement.value === null
    ? `Unavailable${measurement.unavailableReason === null ? "" : `: ${measurement.unavailableReason}`}`
    : formatter(measurement.value);
}

function ProviderDot({ provider }: { provider: string | null }) {
  const color = popularProviderColor(provider);
  return <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full ring-4 ring-current/10" style={{ backgroundColor: color, color }} />;
}

function ModelLink({ model }: { model: PopularModelV1 }) {
  if (model.slug === null) return <span className="font-medium">{modelName(model)}</span>;
  return <Link className="font-medium transition-colors hover:text-primary hover:underline" href={`/models/${encodeURIComponent(model.slug)}/`}>{modelName(model)}</Link>;
}

function RoutePrice({ model }: { model: PopularModelV1 }) {
  if (model.routePricing.availability === "unavailable") return <span className="text-muted-foreground">Unavailable</span>;
  return <span className="font-mono">{formatPrice(model.routePricing.blendedUsdPerMillion)}</span>;
}

function AggregateCost({ model }: { model: PopularModelV1 }) {
  if (model.aggregate === null) return <span className="text-muted-foreground">Unavailable</span>;
  return <span className="font-mono">{formatEvidenceNumber(model.aggregate.costPerSuccessfulEvaluationUsd, formatPrice)}</span>;
}

function EvidenceDetails({ model }: { model: PopularModelV1 }) {
  const pricing = model.routePricing;
  const aggregate = model.aggregate;
  return (
    <details className="rounded-xl border border-border bg-muted/20 p-3 text-xs">
      <summary className="flex min-h-11 cursor-pointer items-center rounded-md font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">Expand category and source evidence</summary>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section aria-label="Published radar categories">
          <p className="font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">Published radar axes</p>
          {model.axes.length ? (
            <dl className="mt-2 space-y-2">
              {model.axes.map((axis) => (
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-t border-border pt-2" key={axis.key}>
                  <dt className="min-w-0">
                    <span className="block truncate font-medium">{axis.label}</span>
                    <span className="text-muted-foreground">Rank {axis.rank === null ? "unavailable" : axis.rank}{axis.fieldSize === null ? "" : ` / ${axis.fieldSize}`}</span>
                  </dt>
                  <dd className="font-mono">{formatNumber(axis.percentile)}</dd>
                </div>
              ))}
            </dl>
          ) : <p className="mt-2 leading-5 text-muted-foreground">{model.capabilityUnavailableReason ?? "No source-published radar axis is available."}</p>}
        </section>
        <section aria-label="Published release subtask labels">
          <p className="font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">Published release subtasks</p>
          {model.subtasks.length ? (
            <ul className="mt-2 space-y-2">
              {model.subtasks.map((subtask) => <li className="border-t border-border pt-2" key={subtask.id}><span className="font-medium">{subtask.label}</span><span className="ml-2 font-mono text-muted-foreground">{subtask.id}</span></li>)}
            </ul>
          ) : <p className="mt-2 leading-5 text-muted-foreground">{model.benchmarkUnavailableReason ?? "The published release lists no subtask labels."}</p>}
        </section>
      </div>
      <div className="mt-4 grid gap-3 border-t border-border pt-4 lg:grid-cols-3">
        <section aria-label="LiveBench aggregate economics">
          <p className="font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">LiveBench aggregate economics</p>
          {aggregate === null ? <p className="mt-2 leading-5 text-muted-foreground">Unavailable: the source row did not publish aggregate economics. Selected-route pricing is separate evidence.</p> : <dl className="mt-2 grid grid-cols-2 gap-2"><div><dt className="text-muted-foreground">Cost / successful evaluation</dt><dd className="mt-1 font-mono">{formatEvidenceNumber(aggregate.costPerSuccessfulEvaluationUsd, formatPrice)}</dd></div><div><dt className="text-muted-foreground">Mean output tokens</dt><dd className="mt-1 font-mono">{formatEvidenceNumber(aggregate.meanOutputTokens, formatTokens)}</dd></div><div className="col-span-2"><dt className="text-muted-foreground">Pareto</dt><dd className="mt-1 font-mono">{aggregate.pareto ? "Yes" : "No"}</dd></div></dl>}
        </section>
        <section aria-label="Selected route pricing">
          <p className="font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">Selected route</p>
          {pricing.availability === "available" ? (
            <dl className="mt-2 grid grid-cols-2 gap-2">
              <div><dt className="text-muted-foreground">Input / 1M</dt><dd className="mt-1 font-mono">{formatPrice(pricing.inputUsdPerMillion)}</dd></div>
              <div><dt className="text-muted-foreground">Output / 1M</dt><dd className="mt-1 font-mono">{formatPrice(pricing.outputUsdPerMillion)}</dd></div>
              <div><dt className="text-muted-foreground">Context</dt><dd className="mt-1 font-mono">{formatTokens(pricing.contextWindowTokens)}</dd></div>
              <div><dt className="text-muted-foreground">Max output</dt><dd className="mt-1 font-mono">{formatTokens(pricing.maxOutputTokens)}</dd></div>
              <div className="col-span-2"><dt className="text-muted-foreground">Route</dt><dd className="mt-1 break-all font-mono text-muted-foreground">{pricing.route}</dd></div>
            </dl>
          ) : <p className="mt-2 leading-5 text-muted-foreground">Unavailable: {pricing.reason}</p>}
        </section>
        <section aria-label="Runtime and source economics boundaries">
          <p className="font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">Independent evidence boundaries</p>
          <dl className="mt-2 space-y-2 leading-5">
            <div><dt className="font-medium">Runtime</dt><dd className="text-muted-foreground">{model.runtimeUnavailableReason ?? "Published runtime evidence is present, but this route does not project a runtime metric."}</dd></div>
            <div><dt className="font-medium">Task economics</dt><dd className="text-muted-foreground">{model.taskEconomics.length ? `${model.taskEconomics.length} exact source task row${model.taskEconomics.length === 1 ? "" : "s"} shown below.` : (model.taskEconomicsUnavailableReason ?? "The source row did not publish task economics.")}</dd></div>
            {pricing.availability === "available" && pricing.contextWindowTokens === null ? <div><dt className="font-medium">Context capacity</dt><dd className="text-muted-foreground">{pricing.contextWindowUnavailableReason ?? "Unavailable"}</dd></div> : null}
            {pricing.availability === "available" && pricing.maxOutputTokens === null ? <div><dt className="font-medium">Maximum output</dt><dd className="text-muted-foreground">{pricing.maxOutputUnavailableReason ?? "Unavailable"}</dd></div> : null}
          </dl>
        </section>
      </div>
      <details className="mt-4 rounded-lg border border-border bg-background/50 p-3">
        <summary className="flex min-h-11 cursor-pointer items-center rounded-md font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">Exact LiveBench task economics ({model.taskEconomics.length})</summary>
        {model.taskEconomics.length ? <div aria-label="Exact LiveBench task economics table. Scroll horizontally for all columns." className="mt-3 w-full min-w-0 max-w-full overflow-x-auto" tabIndex={0}><table className="w-full min-w-[1160px] text-left text-[11px]"><thead className="text-muted-foreground"><tr><th className="pb-2 pr-3">Task</th><th className="pb-2 pr-3">Category</th><th className="pb-2 pr-3">Score</th><th className="pb-2 pr-3">Questions</th><th className="pb-2 pr-3">Eval cost</th><th className="pb-2 pr-3">Input / 1M</th><th className="pb-2 pr-3">Output / 1M</th><th className="pb-2 pr-3">Equivalent successes</th><th className="pb-2 pr-3">Cost / success</th><th className="pb-2 pr-3">Mean input</th><th className="pb-2">Mean output</th></tr></thead><tbody>{model.taskEconomics.map((task) => <tr className="border-t border-border align-top" key={task.taskId}><td className="py-2 pr-3"><span className="font-medium">{task.label}</span><span className="block font-mono text-muted-foreground">{task.taskId}</span></td><td className="py-2 pr-3 font-mono">{task.categoryId}</td><td className="py-2 pr-3 font-mono">{formatEvidenceNumber(task.score)}</td><td className="py-2 pr-3 font-mono">{formatEvidenceNumber(task.questionCount, formatNumber)}</td><td className="py-2 pr-3 font-mono">{formatEvidenceNumber(task.evaluationCostUsd, formatPrice)}</td><td className="py-2 pr-3 font-mono">{formatEvidenceNumber(task.inputPriceUsdPerMillion, formatPrice)}</td><td className="py-2 pr-3 font-mono">{formatEvidenceNumber(task.outputPriceUsdPerMillion, formatPrice)}</td><td className="py-2 pr-3 font-mono">{formatEvidenceNumber(task.equivalentSuccesses, formatNumber)}</td><td className="py-2 pr-3 font-mono">{formatEvidenceNumber(task.costPerSuccessfulEvaluationUsd, formatPrice)}</td><td className="py-2 pr-3 font-mono">{formatEvidenceNumber(task.meanInputTokens, formatTokens)}</td><td className="py-2 font-mono">{formatEvidenceNumber(task.meanOutputTokens, formatTokens)}</td></tr>)}</tbody></table></div> : <p className="mt-2 leading-5 text-muted-foreground">Unavailable: {model.taskEconomicsUnavailableReason ?? "the source row did not publish task economics."}</p>}
      </details>
    </details>
  );
}

function ComparisonToggle({
  canAdd,
  canRemove,
  model,
  onToggle,
  selected,
}: {
  canAdd: boolean;
  canRemove: boolean;
  model: PopularModelV1;
  onToggle: () => void;
  selected: boolean;
}) {
  const disabled = model.slug === null || (selected ? !canRemove : !canAdd);
  return <Button aria-label={`${selected ? "Remove" : "Add"} ${modelName(model)} ${selected ? "from" : "to"} ordered comparison`} aria-pressed={selected} className="min-h-11" disabled={disabled} onClick={onToggle} size="sm" type="button" variant={selected ? "default" : "outline"}>{selected ? <Check /> : <Plus />}{selected ? "Selected" : "Compare"}</Button>;
}

function ModelCard({
  canAdd,
  canRemove,
  categoryKey,
  categoryLabel,
  model,
  onToggleComparison,
  selected,
}: {
  canAdd: boolean;
  canRemove: boolean;
  categoryKey: string | null;
  categoryLabel: string;
  model: PopularModelV1;
  onToggleComparison: () => void;
  selected: boolean;
}) {
  const metric = popularModelsMetricValue(model, categoryKey);
  return (
    <Card className={cn("transition-colors hover:ring-foreground/20", selected && "ring-1 ring-primary/50")}>
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className="grid min-h-9 min-w-9 shrink-0 place-items-center rounded-xl border border-border bg-muted/60 px-2 font-mono text-xs text-muted-foreground">{rankLabel(model)}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><CardTitle className="text-lg"><ModelLink model={model} /></CardTitle>{model.access === "Open weights" ? <Badge variant="secondary">Open weights</Badge> : null}</div>
            <p className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground"><ProviderDot provider={model.provider} />{providerName(model)}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border sm:grid-cols-3">
          <div className="bg-muted/55 p-3"><dt className="text-[10px] text-muted-foreground">{categoryLabel}</dt><dd className="mt-1 font-mono text-sm">{formatNumber(metric)}</dd></div>
          <div className="bg-muted/55 p-3"><dt className="text-[10px] text-muted-foreground">LiveBench cost / success</dt><dd className="mt-1 text-sm"><AggregateCost model={model} /></dd></div>
          <div className="bg-muted/55 p-3"><dt className="text-[10px] text-muted-foreground">Mean output / Pareto</dt><dd className="mt-1 font-mono text-sm">{model.aggregate === null ? "Unavailable" : `${formatEvidenceNumber(model.aggregate.meanOutputTokens, formatTokens)} · ${model.aggregate.pareto ? "Yes" : "No"}`}</dd></div>
          <div className="bg-muted/55 p-3"><dt className="text-[10px] text-muted-foreground">Selected route / 1M</dt><dd className="mt-1 text-sm"><RoutePrice model={model} /></dd></div>
          <div className="bg-muted/55 p-3"><dt className="text-[10px] text-muted-foreground">Source rank</dt><dd className="mt-1 font-mono text-sm">{rankLabel(model)}</dd></div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {model.axes.slice(0, 4).map((axis) => <Badge key={axis.key} variant="outline">{axis.label}: {formatNumber(axis.percentile)}</Badge>)}
          {model.axes.length > 4 ? <Badge variant="outline">+{model.axes.length - 4} axes</Badge> : null}
        </div>
        <div className="mt-4"><EvidenceDetails model={model} /></div>
      </CardContent>
      <CardFooter className="justify-between gap-3"><span className="text-xs text-muted-foreground">{model.access ?? "Access unavailable"}</span><ComparisonToggle canAdd={canAdd} canRemove={canRemove} model={model} onToggle={onToggleComparison} selected={selected} /></CardFooter>
    </Card>
  );
}

function ModelTable({
  canAdd,
  canRemove,
  categoryKey,
  categoryLabel,
  models,
  onToggleComparison,
  selectedIds,
}: {
  canAdd: boolean;
  canRemove: boolean;
  categoryKey: string | null;
  categoryLabel: string;
  models: readonly PopularModelV1[];
  onToggleComparison: (id: string) => void;
  selectedIds: readonly string[];
}) {
  return (
    <div aria-label="Published model evidence table. Scroll horizontally for all columns." className="hidden overflow-x-auto rounded-2xl border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:block" tabIndex={0}>
      <table className="w-full min-w-[1320px] border-collapse text-sm">
        <thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="px-4 py-3 text-left">Rank</th><th className="px-4 py-3 text-left">Model</th><th className="px-4 py-3 text-left">Provider</th><th className="px-4 py-3 text-right">{categoryLabel}</th><th className="px-4 py-3 text-right">LiveBench cost / success</th><th className="px-4 py-3 text-right">Mean output / Pareto</th><th className="px-4 py-3 text-right">Selected route / 1M</th><th className="px-4 py-3 text-left">Route pricing</th><th className="px-4 py-3 text-left">Evidence</th><th className="px-4 py-3 text-right">Compare</th></tr></thead>
        <tbody>
          {models.map((model) => {
            const pricing = model.routePricing;
            const selected = selectedIds.includes(model.id);
            return <tr className="border-t border-border align-top transition-colors hover:bg-muted/30" key={model.id}><td className="px-4 py-4 font-mono text-xs text-muted-foreground">{rankLabel(model)}</td><td className="px-4 py-4"><ModelLink model={model} /><span className="mt-1 block text-xs text-muted-foreground">{model.access ?? "Access unavailable"}</span></td><td className="px-4 py-4"><span className="flex items-center gap-2"><ProviderDot provider={model.provider} />{providerName(model)}</span></td><td className="px-4 py-4 text-right font-mono">{formatNumber(popularModelsMetricValue(model, categoryKey))}</td><td className="px-4 py-4 text-right"><AggregateCost model={model} /></td><td className="px-4 py-4 text-right font-mono text-xs">{model.aggregate === null ? "Unavailable" : <>{formatEvidenceNumber(model.aggregate.meanOutputTokens, formatTokens)}<span className="block text-muted-foreground">{model.aggregate.pareto ? "Pareto" : "Not Pareto"}</span></>}</td><td className="px-4 py-4 text-right"><RoutePrice model={model} /></td><td className="max-w-48 px-4 py-4 font-mono text-xs text-muted-foreground">{pricing.availability === "available" ? <span className="block truncate" title={pricing.route}>{pricing.route}</span> : <span title={pricing.reason}>Unavailable</span>}</td><td className="min-w-72 px-4 py-3"><EvidenceDetails model={model} /></td><td className="px-4 py-4 text-right"><ComparisonToggle canAdd={canAdd} canRemove={canRemove} model={model} onToggle={() => onToggleComparison(model.id)} selected={selected} /></td></tr>;
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProviderMultiSelect({
  providers,
  selectedProviders,
  onChange,
}: {
  providers: readonly string[];
  selectedProviders: readonly string[];
  onChange: (providers: readonly string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [showProviderControls, setShowProviderControls] = useState(true);
  useEffect(() => {
    const sync = () => setShowProviderControls(new URLSearchParams(window.location.search).get("providerControls") !== "hidden");
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const visibleProviders = providers.filter((provider) => provider.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const toggle = (provider: string) => onChange(selectedProviders.includes(provider) ? selectedProviders.filter((item) => item !== provider) : [...selectedProviders, provider].toSorted());
  const setProviderControls = (visible: boolean) => {
    const query = new URLSearchParams(window.location.search);
    if (visible) query.delete("providerControls"); else query.set("providerControls", "hidden");
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${query.size ? `?${query}` : ""}${window.location.hash}`);
    setShowProviderControls(visible);
  };
  return <fieldset className="grid gap-2"><legend className="sr-only">Source filter controls</legend><label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm"><input checked={showProviderControls} className="size-4 accent-primary" onChange={(event) => setProviderControls(event.target.checked)} type="checkbox" />Show provider controls</label><label className="flex min-h-11 cursor-not-allowed items-center gap-2 rounded-lg border border-dashed border-border px-3 text-xs text-muted-foreground" title="Unavailable: strict ranking rows do not publish a derivative-finetune flag."><input aria-describedby="popular-models-derivative-unavailable" className="size-4" disabled type="checkbox" />Exclude derivative finetunes<span className="sr-only" id="popular-models-derivative-unavailable">Unavailable because strict ranking rows do not publish a derivative-finetune flag.</span></label>{showProviderControls ? <details className="group rounded-lg border border-input bg-background"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-md px-3 text-sm outline-none marker:content-none focus-visible:ring-2 focus-visible:ring-ring"><span>Providers</span><span className="font-mono text-xs text-muted-foreground">{selectedProviders.length ? `${selectedProviders.length} selected` : "All"}</span></summary><div className="border-t border-border p-3"><label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><span className="sr-only">Search providers</span><Input className="h-10 pl-9" onChange={(event) => setSearch(event.target.value)} placeholder="Search providers" type="search" value={search} /></label><fieldset className="mt-3 max-h-44 space-y-1 overflow-y-auto"><legend className="sr-only">Choose one or more providers</legend>{visibleProviders.map((provider) => <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm hover:bg-muted" key={provider}><input checked={selectedProviders.includes(provider)} className="size-4 accent-primary" onChange={() => toggle(provider)} type="checkbox" /><ProviderDot provider={provider} />{provider}</label>)}{visibleProviders.length === 0 ? <p className="px-2 py-3 text-sm text-muted-foreground">No providers match this search.</p> : null}</fieldset>{selectedProviders.length ? <Button className="mt-3 min-h-10" onClick={() => onChange([])} size="sm" type="button" variant="ghost">All providers</Button> : null}</div></details> : <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">Provider controls are hidden. Re-enable them to filter source rows.</p>}</fieldset>;
}

function ComparisonPicker({
  models,
  onAdd,
  selectedIds,
}: {
  models: readonly PopularModelV1[];
  onAdd: (id: string) => void;
  selectedIds: readonly string[];
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const candidates = models.filter((model) => model.slug !== null && !selectedIds.includes(model.id) && `${modelName(model)} ${providerName(model)}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const active = candidates[Math.min(activeIndex, Math.max(candidates.length - 1, 0))];

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (root.current !== null && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  if (selectedIds.length >= 4) return null;
  const choose = (model: PopularModelV1 | undefined) => {
    if (model === undefined) return;
    onAdd(model.id);
    setQuery("");
    setActiveIndex(0);
    setOpen(false);
  };
  return <div className="relative min-w-56" ref={root}><label className="sr-only" htmlFor="popular-models-comparison-picker">Search and add a source model</label><Input aria-activedescendant={active === undefined ? undefined : `popular-model-option-${active.id}`} aria-controls="popular-models-comparison-options" aria-expanded={open} autoComplete="off" className="h-11" id="popular-models-comparison-picker" onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setOpen(false); } else if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActiveIndex((index) => Math.min(index + 1, Math.max(candidates.length - 1, 0))); } else if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)); } else if (event.key === "Enter") { event.preventDefault(); choose(active); } }} placeholder="Search model to add" role="combobox" type="search" value={query} />{open ? <div className="absolute z-20 mt-2 max-h-56 w-full overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-soft" id="popular-models-comparison-options" role="listbox">{candidates.length ? candidates.map((model, index) => <button aria-selected={index === activeIndex} className={cn("flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-muted", index === activeIndex && "bg-muted")} id={`popular-model-option-${model.id}`} key={model.id} onClick={() => choose(model)} role="option" type="button"><ProviderDot provider={model.provider} /><span className="min-w-0 truncate">{modelName(model)}</span><span className="ml-auto shrink-0 text-xs text-muted-foreground">{providerName(model)}</span></button>) : <p className="px-3 py-3 text-sm text-muted-foreground">No source models match.</p>}</div> : null}</div>;
}

function comparisonRadarPoints(model: PopularModelV1, categories: readonly PopularModelsCategoryV1[]): string | null {
  if (categories.length < 3) return null;
  const values = categories.map((category) => popularModelsMetricValue(model, category.key));
  if (values.some((value) => value === null)) return null;
  return values.map((value, index) => {
    const angle = (Math.PI * 2 * index / categories.length) - Math.PI / 2;
    const radius = 16 + (value! / 100) * 76;
    return `${100 + Math.cos(angle) * radius},${100 + Math.sin(angle) * radius}`;
  }).join(" ");
}

function ComparisonMatrices({
  categories,
  models,
}: {
  categories: readonly PopularModelsCategoryV1[];
  models: readonly PopularModelV1[];
}) {
  const plottedModels = models.flatMap((model) => {
    const points = comparisonRadarPoints(model, categories);
    return points === null ? [] : [{ model, points }];
  });
  return (
    <div className="mt-5 grid min-w-0 max-w-full gap-4">
      <section aria-label="Inline comparison radar" className="min-w-0 max-w-full rounded-xl border border-border bg-muted/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-medium">Inline source-radar profiles</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">A profile is drawn only when every current source radar axis has a value; missing values are not plotted as zero.</p></div><div className="flex flex-wrap gap-2">{models.map((model) => <span className="inline-flex items-center gap-1.5 text-xs" key={model.id}><ProviderDot provider={model.provider} />{modelName(model)}</span>)}</div></div>
        {categories.length < 3 ? <p className="mt-4 text-sm text-muted-foreground">Unavailable: fewer than three source radar axes are published.</p> : <div className="mt-3 grid min-w-0 gap-4 sm:grid-cols-[220px_minmax(0,1fr)]"><svg aria-label="Comparison radar of source capability axes" className="mx-auto size-[220px]" role="img" viewBox="0 0 200 200">{categories.map((category, index) => { const angle = (Math.PI * 2 * index / categories.length) - Math.PI / 2; return <line key={category.key} stroke="currentColor" strokeOpacity=".2" x1="100" x2={100 + Math.cos(angle) * 92} y1="100" y2={100 + Math.sin(angle) * 92} />; })}<circle cx="100" cy="100" fill="none" r="92" stroke="currentColor" strokeOpacity=".2" />{plottedModels.map(({ model, points }) => <polygon fill={popularProviderColor(model.provider)} fillOpacity=".14" key={model.id} points={points} stroke={popularProviderColor(model.provider)} strokeWidth="2" />)}</svg><div className="min-w-0 text-xs leading-5 text-muted-foreground"><p>{plottedModels.length} of {models.length} selected models have complete values across all {categories.length} current source axes.</p>{plottedModels.length !== models.length ? <p className="mt-2">The capability matrix below retains every exact axis value and its unavailable state.</p> : null}</div></div>}
      </section>
      <details className="min-w-0 max-w-full rounded-xl border border-border bg-muted/20 p-4" open><summary className="flex min-h-11 cursor-pointer items-center rounded-md font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">Exact capability matrix</summary><div aria-label="Exact source capability matrix. Scroll horizontally for all columns." className="mt-4 w-full min-w-0 max-w-full overflow-x-auto" tabIndex={0}><table className="w-full min-w-[640px] text-left text-xs"><thead className="text-muted-foreground"><tr><th className="pb-2 pr-4">Model</th>{categories.map((category) => <th className="pb-2 pr-4" key={category.key}>{category.label}</th>)}</tr></thead><tbody>{models.map((model) => <tr className="border-t border-border" key={model.id}><td className="py-2 pr-4 font-medium">{modelName(model)}</td>{categories.map((category) => <td className="py-2 pr-4 font-mono" key={category.key}>{formatNumber(popularModelsMetricValue(model, category.key))}</td>)}</tr>)}</tbody></table></div></details>
      <details className="min-w-0 max-w-full rounded-xl border border-border bg-muted/20 p-4"><summary className="flex min-h-11 cursor-pointer items-center rounded-md font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">Exact source economics and evidence matrix</summary><div aria-label="Exact source economics and evidence matrix. Scroll horizontally for all columns." className="mt-4 w-full min-w-0 max-w-full overflow-x-auto" tabIndex={0}><table className="w-full min-w-[940px] text-left text-xs"><thead className="text-muted-foreground"><tr><th className="pb-2 pr-4">Model</th><th className="pb-2 pr-4">Source rank</th><th className="pb-2 pr-4">LiveBench cost / success</th><th className="pb-2 pr-4">Mean output</th><th className="pb-2 pr-4">Pareto</th><th className="pb-2 pr-4">Exact task rows</th><th className="pb-2 pr-4">Runtime</th><th className="pb-2">Selected-route price</th></tr></thead><tbody>{models.map((model) => <tr className="border-t border-border align-top" key={model.id}><td className="py-2 pr-4 font-medium">{modelName(model)}</td><td className="py-2 pr-4 font-mono">{rankLabel(model)}</td><td className="py-2 pr-4 font-mono">{model.aggregate === null ? "Unavailable" : formatEvidenceNumber(model.aggregate.costPerSuccessfulEvaluationUsd, formatPrice)}</td><td className="py-2 pr-4 font-mono">{model.aggregate === null ? "Unavailable" : formatEvidenceNumber(model.aggregate.meanOutputTokens, formatTokens)}</td><td className="py-2 pr-4">{model.aggregate === null ? "Unavailable" : (model.aggregate.pareto ? "Yes" : "No")}</td><td className="py-2 pr-4">{model.taskEconomics.length || (model.taskEconomicsUnavailableReason ?? "Unavailable")}</td><td className="py-2 pr-4">{model.runtimeUnavailableReason ?? "Present; not projected"}</td><td className="py-2 font-mono"><RoutePrice model={model} /></td></tr>)}</tbody></table></div></details>
    </div>
  );
}

function csvRows(
  models: readonly PopularModelV1[],
  categoryKey: string | null,
  categoryLabel: string,
  unavailableReason: string | null,
  receipt: Pick<PopularModelsV1ViewModel, "pagination" | "release" | "total">,
): CsvRow[] {
  const sourceReceipt = {
    sourceReleaseId: receipt.release?.releaseId ?? null,
    sourceReleaseOn: receipt.release?.releaseOn ?? null,
    sourceLicenseId: receipt.release?.licenseId ?? null,
    sourceTotalRows: receipt.total,
    sourcePaginationStatus: receipt.pagination.availability,
    sourceNextCursor: receipt.pagination.availability === "available" ? receipt.pagination.nextCursor : null,
    sourcePaginationReason: receipt.pagination.availability === "unavailable" ? receipt.pagination.reason : null,
  };
  if (!models.length) return [{ status: "unavailable", reason: unavailableReason ?? "No source-published ranking rows are available.", ...sourceReceipt }];
  return models.map((model) => {
    const pricing = model.routePricing;
    const aggregate = model.aggregate;
    return {
      ...sourceReceipt,
      sourceRank: model.rank,
      model: model.name,
      provider: model.provider,
      access: model.access,
      metric: popularModelsMetricValue(model, categoryKey),
      metricLabel: categoryLabel,
      routePricingStatus: pricing.availability,
      routePricingReason: pricing.availability === "unavailable" ? pricing.reason : null,
      selectedRoute: pricing.availability === "available" ? pricing.route : null,
      inputUsdPerMillion: pricing.availability === "available" ? pricing.inputUsdPerMillion : null,
      outputUsdPerMillion: pricing.availability === "available" ? pricing.outputUsdPerMillion : null,
      balancedUsdPerMillion: pricing.availability === "available" ? pricing.blendedUsdPerMillion : null,
      contextWindowTokens: pricing.availability === "available" ? pricing.contextWindowTokens : null,
      maxOutputTokens: pricing.availability === "available" ? pricing.maxOutputTokens : null,
      livebenchAggregateEconomicsStatus: aggregate === null ? "unavailable" : "published",
      livebenchCostPerSuccessfulEvaluationUsd: aggregate?.costPerSuccessfulEvaluationUsd.value ?? null,
      livebenchCostPerSuccessfulEvaluationReason: aggregate?.costPerSuccessfulEvaluationUsd.unavailableReason ?? "Aggregate economics were not published for this row.",
      livebenchMeanOutputTokens: aggregate?.meanOutputTokens.value ?? null,
      livebenchMeanOutputReason: aggregate?.meanOutputTokens.unavailableReason ?? "Aggregate economics were not published for this row.",
      livebenchPareto: aggregate?.pareto ?? null,
      livebenchTaskEconomicsCount: model.taskEconomics.length,
      runtimeStatus: model.runtimeUnavailableReason === null ? "present but not projected" : "unavailable",
      runtimeReason: model.runtimeUnavailableReason,
      taskEconomicsStatus: model.taskEconomics.length ? "published exact task rows" : "unavailable",
      taskEconomicsReason: model.taskEconomicsUnavailableReason,
    };
  });
}

function defaultComparisonIds(models: readonly PopularModelV1[]): string[] {
  return models.filter((model) => model.slug !== null).slice(0, 2).map((model) => model.id);
}

function comparisonIdsFromParameters(models: readonly PopularModelV1[], parameters: PopularModelsPageParameters): string[] {
  const slugs = firstParameter(parameters.models)?.split(",").map((slug) => slug.trim()).filter(Boolean) ?? [];
  const ids = slugs.flatMap((slug) => {
    const model = models.find((candidate) => candidate.slug === slug);
    return model === undefined ? [] : [model.id];
  });
  return ids.length >= 2 && ids.length <= 4 && new Set(ids).size === ids.length ? ids : defaultComparisonIds(models);
}

export function PopularModelsPage({
  dataMode,
  initialParameters = {},
  viewModel,
}: {
  dataMode: PopularModelsDataMode;
  initialParameters?: PopularModelsPageParameters;
  viewModel: PopularModelsV1ViewModel;
}) {
  const initial = initialControls(initialParameters, viewModel.categories);
  const [search, setSearch] = useState(initial.search);
  const [selectedProviders, setSelectedProviders] = useState<readonly string[]>(initial.providers);
  const [access, setAccess] = useState<AccessFilter>(initial.access);
  const [categoryKey, setCategoryKey] = useState<string | null>(initial.categoryKey);
  const [insightCategoryKey, setInsightCategoryKey] = useState<string | null>(initial.insightCategoryKey);
  const [sort, setSort] = useState<SortKey>(initial.sort);
  const [view, setView] = useState<ViewMode>(initial.view);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => comparisonIdsFromParameters(viewModel.models, initialParameters));

  const category = viewModel.categories.find((item) => item.key === categoryKey) ?? null;
  const categoryLabel = category?.label ?? "Published overall score";
  const insightCategory = viewModel.categories.find((item) => item.key === insightCategoryKey) ?? null;
  const insightCategoryLabel = insightCategory?.label ?? "Published overall score";
  const providers = useMemo(() => [...new Set(viewModel.models.map((model) => model.provider).filter((item): item is string => item !== null))].toSorted(), [viewModel.models]);
  const visibleModels = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return viewModel.models
      .filter((model) => !query || `${model.name ?? ""} ${model.provider ?? ""} ${model.id}`.toLocaleLowerCase().includes(query))
      .filter((model) => selectedProviders.length === 0 || (model.provider !== null && selectedProviders.includes(model.provider)))
      .filter((model) => access === "all" || (access === "open" ? model.access === "Open weights" : model.access === "Proprietary"))
      .toSorted((left, right) => {
        if (sort === "rank") return compareNullable(left.rank, right.rank, "asc") || modelName(left).localeCompare(modelName(right));
        if (sort === "price") return compareNullable(pricingValue(left), pricingValue(right), "asc") || modelName(left).localeCompare(modelName(right));
        if (sort === "name") return modelName(left).localeCompare(modelName(right));
        return compareNullable(popularModelsMetricValue(left, categoryKey), popularModelsMetricValue(right, categoryKey), "desc") || modelName(left).localeCompare(modelName(right));
      });
  }, [access, categoryKey, search, selectedProviders, sort, viewModel.models]);
  const selectedModels = useMemo(() => selectedIds.map((id) => viewModel.models.find((model) => model.id === id)).filter((model): model is PopularModelV1 => Boolean(model)), [selectedIds, viewModel.models]);
  const comparisonSlugs = selectedModels.flatMap((model) => model.slug === null ? [] : [model.slug]);
  const pricingAvailableCount = viewModel.models.filter((model) => pricingValue(model) !== null).length;
  const canAddComparison = selectedIds.length < 4;
  const canRemoveComparison = selectedIds.length > 2;

  useEffect(() => {
    const query = new URLSearchParams();
    if (search.trim()) query.set("search", search.trim());
    if (selectedProviders.length) query.set("providers", selectedProviders.join(","));
    if (access !== "all") query.set("access", access);
    if (categoryKey !== null) query.set("category", categoryKey);
    if (insightCategoryKey !== null) query.set("insight", insightCategoryKey);
    if (sort !== "metric") query.set("sort", sort);
    if (view !== "list") query.set("view", view);
    const persistedComparisonSlugs = selectedIds.flatMap((id) => viewModel.models.find((model) => model.id === id)?.slug ?? []);
    if (persistedComparisonSlugs.length >= 2) query.set("models", persistedComparisonSlugs.join(","));
    const nextUrl = `${window.location.pathname}${query.size ? `?${query}` : ""}${window.location.hash}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== nextUrl) window.history.replaceState(window.history.state, "", nextUrl);
  }, [access, categoryKey, insightCategoryKey, search, selectedIds, selectedProviders, sort, view, viewModel.models]);

  useEffect(() => {
    const onPopState = () => {
      const parsed = initialControls(Object.fromEntries(new URLSearchParams(window.location.search)), viewModel.categories);
      setSearch(parsed.search);
      setSelectedProviders(parsed.providers);
      setAccess(parsed.access);
      setCategoryKey(parsed.categoryKey);
      setInsightCategoryKey(parsed.insightCategoryKey);
      setSort(parsed.sort);
      setView(parsed.view);
      setSelectedIds(comparisonIdsFromParameters(viewModel.models, Object.fromEntries(new URLSearchParams(window.location.search))));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [viewModel.categories, viewModel.models]);

  const toggleComparison = (id: string) => setSelectedIds((current) => {
    const model = viewModel.models.find((item) => item.id === id);
    if (model?.slug === null || model === undefined) return current;
    if (current.includes(id)) return current.length > 2 ? current.filter((item) => item !== id) : current;
    return current.length < 4 ? [...current, id] : current;
  });

  const reset = () => {
    setSearch("");
    setSelectedProviders([]);
    setAccess("all");
    setCategoryKey(null);
    setInsightCategoryKey(null);
    setSort("metric");
    setView("list");
  };

  const compareHref = `/compare/?models=${comparisonSlugs.map((slug) => encodeURIComponent(slug)).join(",")}`;
  const actionRows = csvRows(visibleModels, categoryKey, categoryLabel, viewModel.unavailableReason, viewModel);

  return <div><p aria-live="polite" className="sr-only">{visibleModels.length} of {viewModel.models.length} source ranking rows visible. {selectedIds.length} models selected for comparison.</p>
    <section aria-labelledby="popular-models-heading" className="relative overflow-hidden border-b border-border">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,rgba(84,137,214,.14),transparent_30%),radial-gradient(circle_at_15%_90%,rgba(217,119,87,.07),transparent_24%)]" />
      <div className="relative mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:px-10 xl:grid-cols-[minmax(0,1fr)_390px] xl:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2"><Badge className="font-mono text-[10px] uppercase tracking-[.16em]" variant="secondary">LiveBench capability workbench</Badge><Badge variant="outline">Strict v1 ranking evidence</Badge><Badge variant={dataMode === "evidence" ? "destructive" : "outline"}>{dataMode === "evidence" ? "Design-only evidence · not live data" : dataMode === "production" ? "Production source response" : "Source mode unconfigured"}</Badge>{viewModel.sourceStatus === "partial" ? <Badge variant="outline">Partial source coverage</Badge> : null}</div>
          <h1 className="mt-6 max-w-4xl text-balance text-5xl font-semibold leading-[.98] tracking-[-.04em] sm:text-6xl" id="popular-models-heading">Popular models · LiveBench capability workbench</h1>
          <p className="mt-6 max-w-3xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">Browse the source-published capability ranking, inspect its radar axes and released task evidence, and compare selected-route pricing only when that separate evidence is available. This route does not relabel the ranking as a popularity list or replace unavailable values.</p>
          <div className="mt-8"><ResultActions filename="tokenbench-livebench-capability-workbench" rows={actionRows} targetId="popular-models-results" /></div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border bg-card/90 shadow-soft"><div className="border-b border-border px-5 py-4"><p className="text-sm font-medium">Strict v1 evidence receipt</p><p className="mt-1 text-xs text-muted-foreground">Source release, total, and pagination are shown only when published; route pricing remains separate.</p></div><dl className="grid grid-cols-2 gap-px bg-border md:grid-cols-3"><div className="bg-card p-4"><dt className="font-mono text-[10px] uppercase text-muted-foreground">Status</dt><dd className="mt-2 text-sm font-medium capitalize">{viewModel.sourceStatus}</dd></div><div className="bg-card p-4"><dt className="font-mono text-[10px] uppercase text-muted-foreground">Rows in receipt</dt><dd className="mt-2 font-mono text-sm">{viewModel.models.length}</dd></div><div className="bg-card p-4"><dt className="font-mono text-[10px] uppercase text-muted-foreground">Source total</dt><dd className="mt-2 font-mono text-sm">{viewModel.total === null ? "Unavailable" : viewModel.total}</dd></div><div className="bg-card p-4"><dt className="font-mono text-[10px] uppercase text-muted-foreground">Release</dt><dd className="mt-2 break-all font-mono text-xs">{viewModel.release === null ? "Unavailable" : viewModel.release.releaseId}</dd>{viewModel.release === null ? null : <dd className="mt-1 text-xs text-muted-foreground">{viewModel.release.releaseOn} · {viewModel.release.licenseId}</dd>}</div><div className="bg-card p-4"><dt className="font-mono text-[10px] uppercase text-muted-foreground">Pagination</dt><dd className="mt-2 text-xs">{viewModel.pagination.availability === "unavailable" ? "Unavailable" : (viewModel.pagination.nextCursor === null ? "No next cursor" : "Next cursor published")}</dd></div><div className="bg-card p-4"><dt className="font-mono text-[10px] uppercase text-muted-foreground">Route pricing</dt><dd className="mt-2 font-mono text-sm">{pricingAvailableCount} / {viewModel.models.length}</dd></div></dl>{viewModel.taxonomy.length ? <details className="border-t border-border px-5 py-4 text-xs"><summary className="cursor-pointer font-medium">Published taxonomy ({viewModel.taxonomy.length} categories)</summary><ul className="mt-3 grid gap-3 sm:grid-cols-2">{viewModel.taxonomy.map((category) => <li className="rounded-lg bg-muted/40 p-3" key={category.categoryId}><span className="font-medium">{category.label}</span><span className="ml-2 font-mono text-muted-foreground">{category.categoryId}</span><ul className="mt-2 space-y-1 text-muted-foreground">{category.tasks.map((task) => <li key={task.taskId}>{task.label} <span className="font-mono">· {task.taskId}</span></li>)}</ul></li>)}</ul></details> : <p className="border-t border-border px-5 py-4 text-xs text-muted-foreground">Published taxonomy unavailable in this source receipt.</p>}</div>
      </div>
      <p className="mx-auto max-w-7xl px-5 pb-5 text-xs text-muted-foreground sm:px-8 lg:px-10">Ranking scope: {viewModel.models.length} receipt rows{viewModel.total === null ? "; source total unavailable." : ` of ${viewModel.total} source rows.`} {viewModel.pagination.availability === "available" ? (viewModel.pagination.nextCursor === null ? "The source receipt publishes no next cursor." : "The source receipt publishes a next cursor; this is not a complete load.") : "The source receipt does not publish pagination state."}</p>
    </section>

    {viewModel.models.length === 0 ? <section className="px-5 py-16 sm:px-8 sm:py-20 lg:px-10"><div className="mx-auto max-w-3xl rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center"><CircleAlert className="mx-auto size-6 text-muted-foreground" /><h2 className="mt-4 text-xl font-semibold">LiveBench capability evidence is unavailable</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{viewModel.unavailableReason ?? "The strict v1 rankings loader did not return a usable source snapshot."}</p><Link className={cn(buttonVariants({ variant: "outline" }), "mt-6 min-h-11")} href="/leaderboards/">Review published leaderboard lenses<ArrowRight /></Link></div></section> : <>
      <section aria-labelledby="popular-models-filters-heading" className="border-y border-border bg-muted/25 px-5 py-14 sm:px-8 sm:py-16 lg:px-10"><div className="mx-auto max-w-7xl"><div className="grid gap-6 md:grid-cols-[.7fr_1.3fr] md:items-end"><div><p className="font-mono text-xs text-muted-foreground">01 / EXPLORE SOURCE EVIDENCE</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl" id="popular-models-filters-heading">Search the published capability surface</h2></div><p className="max-w-2xl text-sm leading-6 text-muted-foreground md:justify-self-end">Category chips are generated only from the current source radar axes. Null scores, source ranks, route prices, and runtime facts remain unavailable rather than being converted to zero.</p></div><form aria-label="LiveBench capability filters" className="mt-7 grid gap-3 rounded-2xl border border-border bg-card p-4 md:grid-cols-2 xl:grid-cols-[1.35fr_1fr_1fr_1fr_auto] xl:items-end" onSubmit={(event) => event.preventDefault()}><label className="space-y-1.5 text-xs text-muted-foreground" htmlFor="popular-models-search">Search model or provider<Input className="mt-1.5 h-11" id="popular-models-search" onChange={(event) => setSearch(event.target.value)} placeholder="Model, provider, or source ID" type="search" value={search} /></label><ProviderMultiSelect onChange={setSelectedProviders} providers={providers} selectedProviders={selectedProviders} /><label className="space-y-1.5 text-xs text-muted-foreground" htmlFor="popular-models-access">Access<select className="mt-1.5 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" id="popular-models-access" onChange={(event) => setAccess(event.target.value as AccessFilter)} value={access}><option value="all">All access types</option><option value="open">Open weights</option><option value="closed">Proprietary</option></select></label><label className="space-y-1.5 text-xs text-muted-foreground" htmlFor="popular-models-sort">Sort rows<select className="mt-1.5 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" id="popular-models-sort" onChange={(event) => setSort(event.target.value as SortKey)} value={sort}><option value="metric">{categoryLabel}</option><option value="rank">Published rank</option><option value="price">Selected-route price</option><option value="name">Model name</option></select></label><Button className="min-h-11" onClick={reset} size="sm" type="button" variant="outline"><RotateCcw />Reset</Button></form><div className="mt-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><p className="text-sm text-muted-foreground"><span className="font-mono text-foreground">{visibleModels.length}</span> of {viewModel.models.length} source rows visible</p><div aria-label="Published capability categories" className="mt-3 -mx-1 overflow-x-auto pb-1" role="group"><div className="flex min-w-max gap-2 px-1"><button aria-pressed={categoryKey === null} className={cn("min-h-11 rounded-full border px-3 text-xs transition-colors", categoryKey === null ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:text-foreground")} onClick={() => { setCategoryKey(null); setSort("metric"); }} type="button">Overall</button>{viewModel.categories.map((item) => <button aria-pressed={categoryKey === item.key} className={cn("min-h-11 rounded-full border px-3 text-xs transition-colors", categoryKey === item.key ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:text-foreground")} key={item.key} onClick={() => { setCategoryKey(item.key); setSort("metric"); }} type="button">{item.label}</button>)}</div></div></div><ViewModeToggle label="Capability result view" mode={view} onChange={setView} /></div></div></section>

      <section className="px-5 py-14 sm:px-8 sm:py-16 lg:px-10"><div className="mx-auto max-w-7xl"><div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-xs text-muted-foreground">02 / SOURCE RANKING</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Published model evidence</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Selected-route pricing, runtime, and task economics are independent evidence boundaries. Open a row to inspect category axes and the exact unavailable state.</p></div><ResultActions filename="tokenbench-livebench-capability-result" rows={actionRows} targetId="popular-models-results" /></div><div id="popular-models-results">{visibleModels.length === 0 ? <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-border text-center"><div><CircleAlert className="mx-auto size-6 text-muted-foreground" /><h3 className="mt-3 font-medium">No source rows match these filters</h3><p className="mt-1 text-sm text-muted-foreground">Broaden the search or reset the workbench controls.</p><Button className="mt-4 min-h-11" onClick={reset} size="sm" variant="outline">Reset filters</Button></div></div> : null}{visibleModels.length > 0 && view === "list" ? <><ModelTable canAdd={canAddComparison} canRemove={canRemoveComparison} categoryKey={categoryKey} categoryLabel={categoryLabel} models={visibleModels} onToggleComparison={toggleComparison} selectedIds={selectedIds} /><div className="grid gap-3 md:hidden">{visibleModels.map((model) => <ModelCard canAdd={canAddComparison} canRemove={canRemoveComparison} categoryKey={categoryKey} categoryLabel={categoryLabel} key={model.id} model={model} onToggleComparison={() => toggleComparison(model.id)} selected={selectedIds.includes(model.id)} />)}</div></> : null}{visibleModels.length > 0 && view === "cards" ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{visibleModels.map((model) => <ModelCard canAdd={canAddComparison} canRemove={canRemoveComparison} categoryKey={categoryKey} categoryLabel={categoryLabel} key={model.id} model={model} onToggleComparison={() => toggleComparison(model.id)} selected={selectedIds.includes(model.id)} />)}</div> : null}</div></div></section>

      <section aria-labelledby="popular-models-aggregate-insights-heading" className="border-y border-border bg-muted/25 px-5 py-14 sm:px-8 sm:py-16 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-6 md:grid-cols-[.7fr_1.3fr] md:items-end"><div><p className="font-mono text-xs text-muted-foreground">03 / LIVEBENCH AGGREGATE ECONOMICS</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl" id="popular-models-aggregate-insights-heading">Quality and source-published evaluation economics</h2></div><p className="max-w-2xl text-sm leading-6 text-muted-foreground md:justify-self-end">These charts use only source-published LiveBench cost per successful evaluation, mean output, and Pareto evidence. Selected-route token prices are never used as a substitute.</p></div>
          <div className="mt-6"><p className="text-sm text-muted-foreground">Insights axis: <span className="font-medium text-foreground">{insightCategoryLabel}</span></p><div aria-label="Separate insight category" className="mt-3 -mx-1 overflow-x-auto pb-1" role="group"><div className="flex min-w-max gap-2 px-1"><button aria-pressed={insightCategoryKey === null} className={cn("min-h-11 rounded-full border px-3 text-xs transition-colors", insightCategoryKey === null ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:text-foreground")} onClick={() => setInsightCategoryKey(null)} type="button">Overall</button>{viewModel.categories.map((item) => <button aria-pressed={insightCategoryKey === item.key} className={cn("min-h-11 rounded-full border px-3 text-xs transition-colors", insightCategoryKey === item.key ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:text-foreground")} key={item.key} onClick={() => setInsightCategoryKey(item.key)} type="button">{item.label}</button>)}</div></div></div>
          <div className="mt-7 grid gap-5 xl:grid-cols-2"><Card><CardContent className="pt-6"><div className="mb-5"><h3 className="font-medium">{insightCategoryLabel} versus LiveBench evaluation cost</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">Larger points are source-published Pareto rows; open an exact-value row to reach its model profile. Unavailable source values remain explicit.</p></div><PopularModelsAggregateQualityCostChart categoryKey={insightCategoryKey} categoryLabel={insightCategoryLabel} models={visibleModels} /></CardContent></Card><Card><CardContent className="pt-6"><div className="mb-5"><h3 className="font-medium">LiveBench evaluation-cost ranking</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">Ranks only visible rows with a published cost per successful evaluation, alongside source mean-output and Pareto details.</p></div><PopularModelsAggregateCostRankingChart models={visibleModels} /></CardContent></Card></div>
        </div>
      </section>

      <section aria-labelledby="popular-models-insights-heading" className="border-y border-border px-5 py-14 sm:px-8 sm:py-16 lg:px-10"><div className="mx-auto max-w-7xl"><div className="grid gap-6 md:grid-cols-[.7fr_1.3fr] md:items-end"><div><p className="font-mono text-xs text-muted-foreground">04 / SELECTED-ROUTE PRICING</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl" id="popular-models-insights-heading">Route pricing, when separate evidence is published</h2></div><p className="max-w-2xl text-sm leading-6 text-muted-foreground md:justify-self-end">The x-axis is an explicitly derived 50/50 average of published input and output route prices. It is not LiveBench task economics, a popularity score, or a substitute for absent pricing.</p></div><div className="mt-7 grid gap-5 xl:grid-cols-2"><Card><CardContent className="pt-6"><div className="mb-5"><h3 className="font-medium">{categoryLabel} versus selected-route price</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">Only models with both this capability measurement and selected-route prices are plotted.</p></div><PopularModelsQualityCostChart categoryKey={categoryKey} categoryLabel={categoryLabel} models={visibleModels} /></CardContent></Card><Card><CardContent className="pt-6"><div className="mb-5"><h3 className="font-medium">Selected-route price ranking</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">Ranks the same visible source rows by the disclosed balanced route price.</p></div><PopularModelsCostRankingChart models={visibleModels} /></CardContent></Card></div></div></section>

      <section aria-labelledby="popular-models-comparison-heading" className="px-5 py-14 sm:px-8 sm:py-16 lg:px-10"><div className="mx-auto max-w-7xl"><div className="grid gap-7 lg:grid-cols-[.8fr_1.2fr] lg:items-start"><div><p className="font-mono text-xs text-muted-foreground">05 / ORDERED COMPARISON</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl" id="popular-models-comparison-heading">Build a 2–4 model decision set</h2><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">The tray preserves click order, persists source slugs in this URL, and carries those slugs to the comparison route. Matrices retain exact capability, aggregate economics, and evidence boundaries.</p></div><Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-4"><div><CardTitle aria-live="polite">{selectedModels.length} / 4 selected</CardTitle><p className="mt-1 text-sm text-muted-foreground">Two selected models are retained as the comparison minimum.</p></div>{selectedModels.length > 2 ? <Button onClick={() => setSelectedIds(defaultComparisonIds(viewModel.models))} size="sm" variant="ghost">Reset tray</Button> : null}</div></CardHeader><CardContent><div aria-label="Ordered model comparison selection" className="flex flex-wrap gap-2" role="list">{selectedModels.map((model, index) => <span className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-muted/40 py-1 pl-3 pr-1 text-sm" key={model.id} role="listitem"><span className="font-mono text-xs text-muted-foreground">{index + 1}</span><ProviderDot provider={model.provider} /><span>{modelName(model)}</span><button aria-label={`Remove ${modelName(model)} from comparison`} className="grid size-11 place-items-center rounded-full text-muted-foreground transition hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40" disabled={!canRemoveComparison} onClick={() => toggleComparison(model.id)} type="button">×</button></span>)}</div><div className="mt-4">{canAddComparison ? <ComparisonPicker models={viewModel.models} onAdd={toggleComparison} selectedIds={selectedIds} /> : <p className="text-sm text-muted-foreground">Maximum of four source models selected.</p>}</div><ComparisonMatrices categories={viewModel.categories} models={selectedModels} /></CardContent><CardFooter className="justify-between gap-3"><span className="text-xs text-muted-foreground">Minimum 2 · maximum 4</span>{comparisonSlugs.length >= 2 ? <Link className={cn(buttonVariants(), "min-h-11")} href={compareHref}>Compare models<GitCompareArrows /></Link> : <Button className="min-h-11" disabled>Compare models<GitCompareArrows /></Button>}</CardFooter></Card></div></div></section>
    </>}
  </div>;
}
