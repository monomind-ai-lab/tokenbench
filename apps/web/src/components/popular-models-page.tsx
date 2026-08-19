"use client";

import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  GitCompareArrows,
  Plus,
  RotateCcw,
  Search,
} from "lucide-react";
import Link from "next/link";
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  PopularModelsAggregateCostRankingChart,
  PopularModelsAggregateQualityCostChart,
  PopularModelsComparisonEconomicsChart,
  popularProviderColor,
} from "@/components/popular-models-charts";
import { ResultActions, type CsvRow } from "@/components/result-actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  filterPopularModels,
  normalizePopularModelsComparisonIds,
  popularModelsColumnValue,
  popularModelsColumnWinnerIds,
  popularModelsDefaultSortDirection,
  popularModelsLeaderboardColumns,
  popularModelsMetricValue,
  sortPopularModels,
  type PopularModelV1,
  type PopularModelsCategoryV1,
  type PopularModelsEvidenceNumberV1,
  type PopularModelsLeaderboardColumnV1,
  type PopularModelsSortDirectionV1,
  type PopularModelsSortKeyV1,
  type PopularModelsV1ViewModel,
} from "@tokenbench/frontend/popular-models-v1";

type PopularModelsDataMode = "evidence" | "production" | "unconfigured";

export type PopularModelsPageParameters = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

interface InitialControls {
  readonly categoryKey: string | null;
  readonly insightCategoryKey: string | null;
  readonly openWeightsOnly: boolean;
  readonly providers: readonly string[];
  readonly query: string;
  readonly showProviders: boolean;
  readonly sortDirection: PopularModelsSortDirectionV1;
  readonly sortKey: PopularModelsSortKeyV1;
}

function firstParameter(
  value: string | readonly string[] | undefined,
): string | undefined {
  return typeof value === "string" ? value : value?.[0];
}

function parseProviders(value: string | undefined): readonly string[] {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(",")
        .map((provider) => provider.trim())
        .filter(Boolean),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

function knownSortKey(
  viewModel: PopularModelsV1ViewModel,
  value: string | undefined,
): PopularModelsSortKeyV1 | null {
  if (!value) return null;
  const staticKeys: readonly PopularModelsSortKeyV1[] = [
    "source-rank",
    "model",
    "provider",
    "access",
    "cost-per-success",
    "mean-output",
    "pareto",
    "route-price",
  ];
  if (staticKeys.includes(value as PopularModelsSortKeyV1))
    return value as PopularModelsSortKeyV1;
  const metricKeys = new Set<string>();
  metricKeys.add("overall");
  for (const column of popularModelsLeaderboardColumns(viewModel, null))
    metricKeys.add(column.key);
  for (const category of viewModel.categories) {
    for (const column of popularModelsLeaderboardColumns(
      viewModel,
      category.key,
    ))
      metricKeys.add(column.key);
  }
  return metricKeys.has(value) ? (value as PopularModelsSortKeyV1) : null;
}

function controlsFromParameters(
  parameters: PopularModelsPageParameters,
  viewModel: PopularModelsV1ViewModel,
): InitialControls {
  const requestedCategory = firstParameter(parameters.category);
  const categoryKey = viewModel.categories.some(
    (category) => category.key === requestedCategory,
  )
    ? (requestedCategory ?? null)
    : null;
  const requestedInsight = firstParameter(parameters.insight);
  const insightCategoryKey = viewModel.categories.some(
    (category) => category.key === requestedInsight,
  )
    ? (requestedInsight ?? null)
    : null;
  const fallbackSort: PopularModelsSortKeyV1 =
    categoryKey === null ? "overall" : `category:${categoryKey}`;
  const sortKey =
    knownSortKey(viewModel, firstParameter(parameters.sort)) ?? fallbackSort;
  return {
    categoryKey,
    insightCategoryKey,
    openWeightsOnly: firstParameter(parameters.openWeights) === "only",
    providers: parseProviders(firstParameter(parameters.providers)),
    query: firstParameter(parameters.search)?.slice(0, 120) ?? "",
    showProviders: firstParameter(parameters.providerVisibility) !== "hidden",
    sortDirection:
      firstParameter(parameters.direction) === "asc"
        ? "asc"
        : firstParameter(parameters.direction) === "desc"
          ? "desc"
          : popularModelsDefaultSortDirection(sortKey),
    sortKey,
  };
}

function comparisonIdsFromParameters(
  models: readonly PopularModelV1[],
  parameters: PopularModelsPageParameters,
): readonly string[] {
  const values =
    firstParameter(parameters.models)
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? [];
  return normalizePopularModelsComparisonIds(models, values);
}

function modelName(model: PopularModelV1): string {
  return model.name ?? "Unavailable model identity";
}

function providerName(model: PopularModelV1): string {
  return model.provider ?? "Unavailable provider";
}

function rankLabel(model: PopularModelV1): string {
  return model.rank === null ? "Unavailable" : `#${model.rank}`;
}

function formatNumber(value: number | null, maximumFractionDigits = 3): string {
  return value === null
    ? "Unavailable"
    : new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
}

function formatExactNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toString();
}

function formatPrice(value: number | null): string {
  return value === null ? "Unavailable" : `USD ${formatExactNumber(value)}`;
}

function formatTokens(value: number | null): string {
  return value === null
    ? "Unavailable"
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
        value,
      );
}

function formatEvidenceNumber(
  measurement: PopularModelsEvidenceNumberV1,
  formatter: (value: number) => string = formatExactNumber,
): string {
  return measurement.value === null
    ? `Unavailable${measurement.unavailableReason === null ? "" : `: ${measurement.unavailableReason}`}`
    : formatter(measurement.value);
}

function categoryLabel(
  viewModel: PopularModelsV1ViewModel,
  categoryKey: string | null,
): string {
  return categoryKey === null
    ? "Published overall score"
    : (viewModel.categories.find((category) => category.key === categoryKey)
        ?.label ?? categoryKey);
}

function ProviderDot({ provider }: { provider: string | null }) {
  const color = popularProviderColor(provider);
  return (
    <span
      aria-hidden="true"
      className="size-2.5 shrink-0 rounded-full ring-4 ring-current/10"
      style={{ backgroundColor: color, color }}
    />
  );
}

function ModelLink({ model }: { model: PopularModelV1 }) {
  if (model.slug === null)
    return <span className="font-medium">{modelName(model)}</span>;
  return (
    <Link
      className="font-medium transition-colors hover:text-primary hover:underline"
      href={`/model-profile?model=${encodeURIComponent(model.id)}`}
    >
      {modelName(model)}
    </Link>
  );
}

function RoutePrice({ model }: { model: PopularModelV1 }) {
  if (model.routePricing.availability === "unavailable")
    return (
      <span className="text-muted-foreground" title={model.routePricing.reason}>
        Unavailable
      </span>
    );
  return (
    <span className="font-mono">
      {formatPrice(model.routePricing.blendedUsdPerMillion)}
    </span>
  );
}

function AggregateCost({
  model,
  winner,
}: {
  model: PopularModelV1;
  winner?: boolean;
}) {
  if (model.aggregate === null)
    return <span className="text-muted-foreground">Unavailable</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center justify-end gap-1.5 font-mono",
        winner && "font-semibold text-primary",
      )}
    >
      <span>
        {formatEvidenceNumber(
          model.aggregate.costPerSuccessfulEvaluationUsd,
          (value) => formatPrice(value),
        )}
      </span>
      {winner ? (
        <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-sans text-[9px] font-semibold uppercase tracking-[.08em]">
          Lowest 5
        </span>
      ) : null}
    </span>
  );
}

function ScoreCell({
  column,
  model,
  winnerIds,
}: {
  column: PopularModelsLeaderboardColumnV1;
  model: PopularModelV1;
  winnerIds: ReadonlySet<string> | undefined;
}) {
  const value = popularModelsColumnValue(model, column.key);
  const winner = winnerIds?.has(model.id) ?? false;
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center gap-1.5 font-mono text-xs",
        winner && "font-semibold text-primary",
      )}
    >
      <span>{value === null ? "Unavailable" : formatExactNumber(value)}</span>
      {winner ? (
        <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-sans text-[9px] font-semibold uppercase tracking-[.08em]">
          Top 5
        </span>
      ) : null}
    </span>
  );
}

function EvidenceDetails({
  model,
  selectedCategoryKey,
  visibleOrdinal,
}: {
  model: PopularModelV1;
  selectedCategoryKey: string | null;
  visibleOrdinal: number;
}) {
  const pricing = model.routePricing;
  const aggregate = model.aggregate;
  const axes =
    selectedCategoryKey === null
      ? model.axes
      : model.axes.filter((axis) => axis.key === selectedCategoryKey);
  const tasks =
    selectedCategoryKey === null
      ? model.taskEconomics
      : model.taskEconomics.filter(
          (task) => task.categoryId === selectedCategoryKey,
        );
  const axisScope =
    selectedCategoryKey === null
      ? "Published radar axes"
      : "Selected category axis";
  const taskScope =
    selectedCategoryKey === null
      ? "Exact LiveBench task economics"
      : "Exact selected-category LiveBench task economics";

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs">
      <dl className="grid gap-2 rounded-lg border border-border bg-background/50 p-3 sm:grid-cols-3">
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">
            Visible ordinal
          </dt>
          <dd className="mt-1 font-mono">{visibleOrdinal}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">
            Immutable source rank
          </dt>
          <dd className="mt-1 font-mono">{rankLabel(model)}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">
            Access
          </dt>
          <dd className="mt-1 font-mono">
            {model.access ??
              `Unavailable${model.accessUnavailableReason === null ? "" : `: ${model.accessUnavailableReason}`}`}
          </dd>
        </div>
      </dl>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section aria-label={axisScope}>
          <p className="font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">
            {axisScope}
          </p>
          {axes.length ? (
            <dl className="mt-2 space-y-2">
              {axes.map((axis) => (
                <div
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-t border-border pt-2"
                  key={axis.key}
                >
                  <dt className="min-w-0">
                    <span className="block truncate font-medium">
                      {axis.label}
                    </span>
                    <span className="text-muted-foreground">
                      Published rank{" "}
                      {axis.rank === null ? "unavailable" : axis.rank}
                      {axis.fieldSize === null ? "" : ` / ${axis.fieldSize}`}
                    </span>
                  </dt>
                  <dd className="font-mono">{formatNumber(axis.percentile)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-2 leading-5 text-muted-foreground">
              {model.capabilityUnavailableReason ??
                "No source-published measurement is available for this category."}
            </p>
          )}
        </section>
        <section aria-label="Published release subtasks">
          <p className="font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">
            Published release subtasks
          </p>
          {model.subtasks.length ? (
            <ul className="mt-2 space-y-2">
              {model.subtasks.map((subtask) => (
                <li className="border-t border-border pt-2" key={subtask.id}>
                  <span className="font-medium">{subtask.label}</span>
                  <span className="ml-2 font-mono text-muted-foreground">
                    {subtask.id}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 leading-5 text-muted-foreground">
              {model.benchmarkUnavailableReason ??
                "The published release lists no subtask labels."}
            </p>
          )}
        </section>
      </div>
      <div className="mt-4 grid gap-3 border-t border-border pt-4 lg:grid-cols-3">
        <section aria-label="LiveBench aggregate economics">
          <p className="font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">
            LiveBench aggregate economics
          </p>
          {aggregate === null ? (
            <p className="mt-2 leading-5 text-muted-foreground">
              Unavailable: the source row did not publish aggregate economics.
              Selected-route pricing is separate evidence.
            </p>
          ) : (
            <dl className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <dt className="text-muted-foreground">
                  Cost / successful evaluation
                </dt>
                <dd className="mt-1 font-mono">
                  {formatEvidenceNumber(
                    aggregate.costPerSuccessfulEvaluationUsd,
                    (value) => formatPrice(value),
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Mean output tokens</dt>
                <dd className="mt-1 font-mono">
                  {formatEvidenceNumber(aggregate.meanOutputTokens)}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground">Source Pareto mark</dt>
                <dd className="mt-1 font-mono">
                  {aggregate.pareto ? "Yes" : "No"}
                </dd>
              </div>
            </dl>
          )}
        </section>
        <section aria-label="Selected route pricing">
          <p className="font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">
            Selected-route pricing
          </p>
          {pricing.availability === "available" ? (
            <dl className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <dt className="text-muted-foreground">Input / 1M</dt>
                <dd className="mt-1 font-mono">
                  {formatPrice(pricing.inputUsdPerMillion)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Output / 1M</dt>
                <dd className="mt-1 font-mono">
                  {formatPrice(pricing.outputUsdPerMillion)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Context</dt>
                <dd className="mt-1 font-mono">
                  {formatTokens(pricing.contextWindowTokens)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Max output</dt>
                <dd className="mt-1 font-mono">
                  {formatTokens(pricing.maxOutputTokens)}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground">Route</dt>
                <dd className="mt-1 break-all font-mono text-muted-foreground">
                  {pricing.route}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-2 leading-5 text-muted-foreground">
              Unavailable: {pricing.reason}
            </p>
          )}
        </section>
        <section aria-label="Independent evidence boundaries">
          <p className="font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">
            Independent evidence boundaries
          </p>
          <dl className="mt-2 space-y-2 leading-5">
            <div>
              <dt className="font-medium">Runtime</dt>
              <dd className="text-muted-foreground">
                {model.runtimeUnavailableReason ??
                  "Published runtime evidence is present, but this route does not project a runtime metric."}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Task economics</dt>
              <dd className="text-muted-foreground">
                {tasks.length
                  ? `${tasks.length} exact source task row${tasks.length === 1 ? "" : "s"} shown below.`
                  : (model.taskEconomicsUnavailableReason ??
                    "The source row did not publish task economics.")}
              </dd>
            </div>
            {pricing.availability === "available" &&
            pricing.contextWindowTokens === null ? (
              <div>
                <dt className="font-medium">Context capacity</dt>
                <dd className="text-muted-foreground">
                  {pricing.contextWindowUnavailableReason ?? "Unavailable"}
                </dd>
              </div>
            ) : null}
            {pricing.availability === "available" &&
            pricing.maxOutputTokens === null ? (
              <div>
                <dt className="font-medium">Maximum output</dt>
                <dd className="text-muted-foreground">
                  {pricing.maxOutputUnavailableReason ?? "Unavailable"}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
      </div>
      <section
        className="mt-4 rounded-lg border border-border bg-background/50 p-3"
        aria-label={taskScope}
      >
        <p className="font-medium">
          {taskScope} ({tasks.length})
        </p>
        {tasks.length ? (
          <div
            aria-label="Exact LiveBench task economics table. Scroll horizontally for all columns."
            className="mt-3 w-full min-w-0 max-w-full overflow-x-auto"
            tabIndex={0}
          >
            <table className="w-full min-w-[1160px] text-left text-[11px]">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="pb-2 pr-3">Task</th>
                  <th className="pb-2 pr-3">Category</th>
                  <th className="pb-2 pr-3">Score</th>
                  <th className="pb-2 pr-3">Questions</th>
                  <th className="pb-2 pr-3">Eval cost</th>
                  <th className="pb-2 pr-3">Input / 1M</th>
                  <th className="pb-2 pr-3">Output / 1M</th>
                  <th className="pb-2 pr-3">Equivalent successes</th>
                  <th className="pb-2 pr-3">Cost / success</th>
                  <th className="pb-2 pr-3">Mean input</th>
                  <th className="pb-2">Mean output</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr
                    className="border-t border-border align-top"
                    key={`${task.categoryId}-${task.taskId}`}
                  >
                    <td className="py-2 pr-3">
                      <span className="font-medium">{task.label}</span>
                      <span className="block font-mono text-muted-foreground">
                        {task.taskId}
                      </span>
                    </td>
                    <td className="py-2 pr-3 font-mono">{task.categoryId}</td>
                    <td className="py-2 pr-3 font-mono">
                      {formatEvidenceNumber(task.score)}
                    </td>
                    <td className="py-2 pr-3 font-mono">
                      {formatEvidenceNumber(task.questionCount)}
                    </td>
                    <td className="py-2 pr-3 font-mono">
                      {formatEvidenceNumber(task.evaluationCostUsd, (value) =>
                        formatPrice(value),
                      )}
                    </td>
                    <td className="py-2 pr-3 font-mono">
                      {formatEvidenceNumber(
                        task.inputPriceUsdPerMillion,
                        (value) => formatPrice(value),
                      )}
                    </td>
                    <td className="py-2 pr-3 font-mono">
                      {formatEvidenceNumber(
                        task.outputPriceUsdPerMillion,
                        (value) => formatPrice(value),
                      )}
                    </td>
                    <td className="py-2 pr-3 font-mono">
                      {formatEvidenceNumber(task.equivalentSuccesses)}
                    </td>
                    <td className="py-2 pr-3 font-mono">
                      {formatEvidenceNumber(
                        task.costPerSuccessfulEvaluationUsd,
                        (value) => formatPrice(value),
                      )}
                    </td>
                    <td className="py-2 pr-3 font-mono">
                      {formatEvidenceNumber(task.meanInputTokens)}
                    </td>
                    <td className="py-2 font-mono">
                      {formatEvidenceNumber(task.meanOutputTokens)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 leading-5 text-muted-foreground">
            Unavailable:{" "}
            {model.taskEconomicsUnavailableReason ??
              "the source row did not publish task economics for this scope."}
          </p>
        )}
      </section>
    </div>
  );
}

function SortHeader({
  activeKey,
  children,
  direction,
  onSort,
  sortKey,
}: {
  activeKey: PopularModelsSortKeyV1;
  children: ReactNode;
  direction: PopularModelsSortDirectionV1;
  onSort: (key: PopularModelsSortKeyV1) => void;
  sortKey: PopularModelsSortKeyV1;
}) {
  const active = activeKey === sortKey;
  return (
    <button
      aria-label={`Sort by ${typeof children === "string" ? children : "column"}${active ? `, currently ${direction === "asc" ? "ascending" : "descending"}` : ""}`}
      className="inline-flex min-h-10 items-center gap-1 text-left font-medium transition-colors hover:text-foreground"
      onClick={() => onSort(sortKey)}
      type="button"
    >
      <span>{children}</span>
      {active ? (
        direction === "asc" ? (
          <ChevronDown aria-hidden="true" className="size-3.5 rotate-180" />
        ) : (
          <ChevronDown aria-hidden="true" className="size-3.5" />
        )
      ) : (
        <ChevronDown
          aria-hidden="true"
          className="size-3.5 text-muted-foreground/70"
        />
      )}
    </button>
  );
}

interface TableProps {
  readonly categoryKey: string | null;
  readonly costWinnerIds: ReadonlySet<string>;
  readonly expandedIds: ReadonlySet<string>;
  readonly metricColumns: readonly PopularModelsLeaderboardColumnV1[];
  readonly models: readonly PopularModelV1[];
  readonly onSort: (key: PopularModelsSortKeyV1) => void;
  readonly onToggleEvidence: (id: string) => void;
  readonly showProviders: boolean;
  readonly sortDirection: PopularModelsSortDirectionV1;
  readonly sortKey: PopularModelsSortKeyV1;
  readonly winnerIdsByColumn: ReadonlyMap<string, ReadonlySet<string>>;
}

function ModelTable({
  categoryKey,
  costWinnerIds,
  expandedIds,
  metricColumns,
  models,
  onSort,
  onToggleEvidence,
  showProviders,
  sortDirection,
  sortKey,
  winnerIdsByColumn,
}: TableProps) {
  const columnCount = 5 + metricColumns.length + (showProviders ? 1 : 0);
  const ariaSort = (key: PopularModelsSortKeyV1) =>
    sortKey === key
      ? sortDirection === "asc"
        ? "ascending"
        : "descending"
      : "none";
  return (
    <div
      aria-label="Published model evidence table. Scroll horizontally for all columns."
      className="hidden overflow-x-auto rounded-2xl border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:block"
      tabIndex={0}
    >
      <table className="w-full min-w-[1580px] border-collapse text-sm">
        <thead className="bg-muted/60 text-xs text-muted-foreground">
          <tr>
            <th className="w-12 px-3 py-3 text-left">
              <span className="sr-only">Expand evidence</span>
            </th>
            <th className="px-3 py-3 text-left">#</th>
            <th aria-sort={ariaSort("model")} className="px-3 py-3 text-left">
              <SortHeader
                activeKey={sortKey}
                direction={sortDirection}
                onSort={onSort}
                sortKey="model"
              >
                Model
              </SortHeader>
            </th>
            {showProviders ? (
              <th
                aria-sort={ariaSort("provider")}
                className="px-3 py-3 text-left"
              >
                <SortHeader
                  activeKey={sortKey}
                  direction={sortDirection}
                  onSort={onSort}
                  sortKey="provider"
                >
                  Provider
                </SortHeader>
              </th>
            ) : null}
            {metricColumns.map((column) => (
              <th
                aria-sort={ariaSort(column.key)}
                className="px-3 py-3 text-right"
                key={column.key}
              >
                <SortHeader
                  activeKey={sortKey}
                  direction={sortDirection}
                  onSort={onSort}
                  sortKey={column.key}
                >
                  {column.label}
                </SortHeader>
              </th>
            ))}
            <th
              aria-sort={ariaSort("cost-per-success")}
              className="px-3 py-3 text-right"
            >
              <SortHeader
                activeKey={sortKey}
                direction={sortDirection}
                onSort={onSort}
                sortKey="cost-per-success"
              >
                Cost / task
              </SortHeader>
            </th>
          </tr>
        </thead>
        <tbody>
          {models.map((model, index) => {
            const expanded = expandedIds.has(model.id);
            const evidenceId = `popular-model-evidence-${model.id}`;
            return (
              <Fragment key={model.id}>
                <tr className="border-t border-border align-top transition-colors hover:bg-muted/30">
                  <td className="px-3 py-4">
                    <button
                      aria-controls={evidenceId}
                      aria-expanded={expanded}
                      aria-label={`${expanded ? "Collapse" : "Expand"} ${modelName(model)} source evidence`}
                      className="grid size-10 place-items-center rounded-lg border border-border bg-card transition-colors hover:bg-muted"
                      onClick={() => onToggleEvidence(model.id)}
                      type="button"
                    >
                      {expanded ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                    </button>
                  </td>
                  <td className="px-3 py-4 font-mono text-xs text-muted-foreground">
                    {index + 1}
                  </td>
                  <td className="px-3 py-4">
                    <ModelLink model={model} />
                  </td>
                  {showProviders ? (
                    <td className="px-3 py-4">
                      <span className="flex items-center gap-2">
                        <ProviderDot provider={model.provider} />
                        {providerName(model)}
                      </span>
                    </td>
                  ) : null}
                  {metricColumns.map((column) => (
                    <td className="px-3 py-4 text-right" key={column.key}>
                      <ScoreCell
                        column={column}
                        model={model}
                        winnerIds={winnerIdsByColumn.get(column.key)}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-4 text-right">
                    <AggregateCost
                      model={model}
                      winner={costWinnerIds.has(model.id)}
                    />
                  </td>
                </tr>
                {expanded ? (
                  <tr
                    className="border-t border-border bg-muted/10"
                    id={evidenceId}
                  >
                    <td className="p-4" colSpan={columnCount}>
                      <EvidenceDetails
                        model={model}
                        selectedCategoryKey={categoryKey}
                        visibleOrdinal={index + 1}
                      />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ModelCards({
  props,
}: {
  props: Omit<TableProps, "onSort" | "sortDirection" | "sortKey">;
}) {
  const {
    categoryKey,
    costWinnerIds,
    expandedIds,
    metricColumns,
    models,
    onToggleEvidence,
    showProviders,
    winnerIdsByColumn,
  } = props;
  return (
    <div className="grid gap-3 md:hidden">
      {models.map((model, index) => {
        const expanded = expandedIds.has(model.id);
        const evidenceId = `popular-model-mobile-evidence-${model.id}`;
        return (
          <Card className="overflow-hidden" key={model.id}>
            <CardHeader className="pb-4">
              <div className="flex items-start gap-3">
                <span className="grid min-h-9 min-w-9 place-items-center rounded-xl border border-border bg-muted/60 px-2 font-mono text-xs text-muted-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-lg">
                      <ModelLink model={model} />
                    </CardTitle>
                  </div>
                  {showProviders ? (
                    <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <ProviderDot provider={model.provider} />
                      {providerName(model)}
                    </p>
                  ) : null}
                </div>
                <button
                  aria-controls={evidenceId}
                  aria-expanded={expanded}
                  aria-label={`${expanded ? "Collapse" : "Expand"} ${modelName(model)} source evidence`}
                  className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-card"
                  onClick={() => onToggleEvidence(model.id)}
                  type="button"
                >
                  {expanded ? (
                    <ChevronDown className="size-4" />
                  ) : (
                    <ChevronRight className="size-4" />
                  )}
                </button>
              </div>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border">
                {metricColumns.map((column) => (
                  <div className="bg-muted/55 p-3" key={column.key}>
                    <dt className="text-[10px] text-muted-foreground">
                      {column.label}
                    </dt>
                    <dd className="mt-1">
                      <ScoreCell
                        column={column}
                        model={model}
                        winnerIds={winnerIdsByColumn.get(column.key)}
                      />
                    </dd>
                  </div>
                ))}
                <div className="bg-muted/55 p-3">
                  <dt className="text-[10px] text-muted-foreground">
                    LiveBench cost / success
                  </dt>
                  <dd className="mt-1 text-sm">
                    <AggregateCost
                      model={model}
                      winner={costWinnerIds.has(model.id)}
                    />
                  </dd>
                </div>
              </dl>
              {expanded ? (
                <div className="mt-4" id={evidenceId}>
                  <EvidenceDetails
                    model={model}
                    selectedCategoryKey={categoryKey}
                    visibleOrdinal={index + 1}
                  />
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
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
  const visibleProviders = providers.filter((provider) =>
    provider.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const toggle = (provider: string) =>
    onChange(
      selectedProviders.includes(provider)
        ? selectedProviders.filter((item) => item !== provider)
        : [...selectedProviders, provider].sort((left, right) =>
            left.localeCompare(right),
          ),
    );
  return (
    <details className="rounded-lg border border-input bg-background">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-md px-3 text-sm outline-none marker:content-none focus-visible:ring-2 focus-visible:ring-ring">
        <span>Providers</span>
        <span className="font-mono text-xs text-muted-foreground">
          {selectedProviders.length
            ? `${selectedProviders.length} selected`
            : "All"}
        </span>
      </summary>
      <div className="border-t border-border p-3">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <span className="sr-only">Search providers</span>
          <Input
            className="h-10 pl-9"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search providers"
            type="search"
            value={search}
          />
        </label>
        <fieldset className="mt-3 max-h-44 space-y-1 overflow-y-auto">
          <legend className="sr-only">Choose one or more providers</legend>
          {visibleProviders.map((provider) => (
            <label
              className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm hover:bg-muted"
              key={provider}
            >
              <input
                checked={selectedProviders.includes(provider)}
                className="size-4 accent-primary"
                onChange={() => toggle(provider)}
                type="checkbox"
              />
              <ProviderDot provider={provider} />
              {provider}
            </label>
          ))}
          {visibleProviders.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              No providers match this search.
            </p>
          ) : null}
        </fieldset>
        {selectedProviders.length ? (
          <Button
            className="mt-3 min-h-10"
            onClick={() => onChange([])}
            size="sm"
            type="button"
            variant="ghost"
          >
            All providers
          </Button>
        ) : null}
      </div>
    </details>
  );
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
  const candidates = models.filter(
    (model) =>
      !selectedIds.includes(model.id) &&
      `${modelName(model)} ${providerName(model)} ${model.id}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  const active =
    candidates[Math.min(activeIndex, Math.max(candidates.length - 1, 0))];
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (root.current !== null && !root.current.contains(event.target as Node))
        setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);
  const choose = (model: PopularModelV1 | undefined) => {
    if (model === undefined) return;
    onAdd(model.id);
    setQuery("");
    setActiveIndex(0);
    setOpen(false);
  };
  if (selectedIds.length >= 4)
    return (
      <p className="text-sm text-muted-foreground">
        Maximum of four source models selected.
      </p>
    );
  return (
    <div ref={root}>
      <Button
        aria-expanded={open}
        aria-haspopup="dialog"
        className="min-h-11"
        onClick={() => setOpen(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        <Plus />
        Add a model
      </Button>
      {open ? (
        <div
          aria-label="Add a model to the ordered comparison"
          className="relative mt-3 rounded-xl border border-border bg-popover p-3 shadow-soft"
          role="dialog"
        >
          <div className="flex items-center justify-between gap-3">
            <label
              className="sr-only"
              htmlFor="popular-models-comparison-picker"
            >
              Search and add a source model
            </label>
            <Input
              aria-activedescendant={
                active === undefined
                  ? undefined
                  : `popular-model-option-${active.id}`
              }
              aria-controls="popular-models-comparison-options"
              autoComplete="off"
              className="h-11"
              id="popular-models-comparison-picker"
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setOpen(false);
                } else if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveIndex((index) =>
                    Math.min(index + 1, Math.max(candidates.length - 1, 0)),
                  );
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveIndex((index) => Math.max(index - 1, 0));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  choose(active);
                }
              }}
              placeholder="Search model to add"
              role="combobox"
              type="search"
              value={query}
            />
            <Button
              aria-label="Close add a model dialog"
              onClick={() => setOpen(false)}
              size="sm"
              type="button"
              variant="ghost"
            >
              Close
            </Button>
          </div>
          <div
            className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-border p-1"
            id="popular-models-comparison-options"
            role="listbox"
          >
            {candidates.length ? (
              candidates.map((model, index) => (
                <button
                  aria-selected={index === activeIndex}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm",
                    index === activeIndex
                      ? "bg-active-control text-active-control-foreground"
                      : "hover:bg-muted",
                  )}
                  id={`popular-model-option-${model.id}`}
                  key={model.id}
                  onClick={() => choose(model)}
                  role="option"
                  type="button"
                >
                  <ProviderDot provider={model.provider} />
                  <span className="min-w-0 truncate">{modelName(model)}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {providerName(model)}
                  </span>
                </button>
              ))
            ) : (
              <p className="px-3 py-3 text-sm text-muted-foreground">
                No source models match.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function comparisonRadarPoints(
  model: PopularModelV1,
  categories: readonly PopularModelsCategoryV1[],
): string | null {
  if (categories.length < 3) return null;
  const values = categories.map((category) =>
    popularModelsMetricValue(model, category.key),
  );
  if (values.some((value) => value === null)) return null;
  return values
    .map((value, index) => {
      const angle = (Math.PI * 2 * index) / categories.length - Math.PI / 2;
      const radius = 16 + (value! / 100) * 76;
      return `${100 + Math.cos(angle) * radius},${100 + Math.sin(angle) * radius}`;
    })
    .join(" ");
}

function MatrixValue({ children }: { children: ReactNode }) {
  return <td className="py-2 pr-4 font-mono text-xs last:pr-0">{children}</td>;
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
  const modelHeadings = (
    <>
      {models.map((model) => (
        <th
          className="pb-2 pr-4 text-left font-medium last:pr-0"
          key={model.id}
        >
          <ModelLink model={model} />
        </th>
      ))}
    </>
  );
  return (
    <div className="mt-5 grid min-w-0 max-w-full gap-4">
      <section
        aria-label="Inline comparison radar"
        className="min-w-0 max-w-full rounded-xl border border-border bg-muted/20 p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-medium">Source capability radar</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              A profile is drawn only when every current source radar axis has a
              value; missing values are not plotted as zero.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {models.map((model) => (
              <span
                className="inline-flex items-center gap-1.5 text-xs"
                key={model.id}
              >
                <ProviderDot provider={model.provider} />
                {modelName(model)}
              </span>
            ))}
          </div>
        </div>
        {categories.length < 3 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Unavailable: fewer than three source radar axes are published.
          </p>
        ) : (
          <div className="mt-3 grid min-w-0 gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">
            <svg
              aria-label="Comparison radar of source capability axes"
              className="mx-auto size-[220px]"
              role="img"
              viewBox="0 0 200 200"
            >
              <title>Comparison radar of source capability axes</title>
              {categories.map((category, index) => {
                const angle =
                  (Math.PI * 2 * index) / categories.length - Math.PI / 2;
                return (
                  <line
                    key={category.key}
                    stroke="currentColor"
                    strokeOpacity=".2"
                    x1="100"
                    x2={100 + Math.cos(angle) * 92}
                    y1="100"
                    y2={100 + Math.sin(angle) * 92}
                  />
                );
              })}
              <circle
                cx="100"
                cy="100"
                fill="none"
                r="92"
                stroke="currentColor"
                strokeOpacity=".2"
              />
              {plottedModels.map(({ model, points }) => (
                <polygon
                  fill={popularProviderColor(model.provider)}
                  fillOpacity=".14"
                  key={model.id}
                  points={points}
                  stroke={popularProviderColor(model.provider)}
                  strokeWidth="2"
                />
              ))}
            </svg>
            <div className="min-w-0 text-xs leading-5 text-muted-foreground">
              <p>
                {plottedModels.length} of {models.length} selected models have
                complete values across all {categories.length} current source
                axes.
              </p>
              {plottedModels.length !== models.length ? (
                <p className="mt-2">
                  The capability matrix retains every exact axis value and its
                  unavailable state.
                </p>
              ) : null}
            </div>
          </div>
        )}
      </section>
      <section
        className="min-w-0 max-w-full rounded-xl border border-border bg-muted/20 p-4"
        aria-labelledby="popular-models-decision-matrix-heading"
      >
        <h3 className="font-medium" id="popular-models-decision-matrix-heading">
          Decision matrix
        </h3>
        <div
          aria-label="Metric-first comparison decision matrix. Scroll horizontally for all columns."
          className="mt-4 w-full min-w-0 max-w-full overflow-x-auto"
          tabIndex={0}
        >
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="pb-2 pr-4">Metric</th>
                {modelHeadings}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border">
                <th className="py-2 pr-4 text-left font-medium">
                  Published overall score
                </th>
                {models.map((model) => (
                  <MatrixValue key={model.id}>
                    {formatNumber(model.overallScore)}
                  </MatrixValue>
                ))}
              </tr>
              <tr className="border-t border-border">
                <th className="py-2 pr-4 text-left font-medium">
                  Immutable source rank
                </th>
                {models.map((model) => (
                  <MatrixValue key={model.id}>{rankLabel(model)}</MatrixValue>
                ))}
              </tr>
              <tr className="border-t border-border">
                <th className="py-2 pr-4 text-left font-medium">Access</th>
                {models.map((model) => (
                  <MatrixValue key={model.id}>
                    {model.access ??
                      `Unavailable: ${model.accessUnavailableReason ?? "not published"}`}
                  </MatrixValue>
                ))}
              </tr>
              <tr className="border-t border-border">
                <th className="py-2 pr-4 text-left font-medium">
                  Selected route
                </th>
                {models.map((model) => (
                  <MatrixValue key={model.id}>
                    {model.routePricing.availability === "available"
                      ? model.routePricing.route
                      : `Unavailable: ${model.routePricing.reason}`}
                  </MatrixValue>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section
        className="min-w-0 max-w-full rounded-xl border border-border bg-muted/20 p-4"
        aria-labelledby="popular-models-capability-matrix-heading"
      >
        <h3
          className="font-medium"
          id="popular-models-capability-matrix-heading"
        >
          Exact capability matrix
        </h3>
        <div
          aria-label="Metric-first source capability matrix. Scroll horizontally for all columns."
          className="mt-4 w-full min-w-0 max-w-full overflow-x-auto"
          tabIndex={0}
        >
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="pb-2 pr-4">Published category</th>
                {modelHeadings}
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr className="border-t border-border" key={category.key}>
                  <th className="py-2 pr-4 text-left font-medium">
                    {category.label}
                  </th>
                  {models.map((model) => (
                    <MatrixValue key={model.id}>
                      {formatNumber(
                        popularModelsMetricValue(model, category.key),
                      )}
                    </MatrixValue>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section
        className="min-w-0 max-w-full rounded-xl border border-border bg-muted/20 p-4"
        aria-labelledby="popular-models-evidence-matrix-heading"
      >
        <h3 className="font-medium" id="popular-models-evidence-matrix-heading">
          Exact source evidence matrix
        </h3>
        <div
          aria-label="Metric-first source economics and evidence matrix. Scroll horizontally for all columns."
          className="mt-4 w-full min-w-0 max-w-full overflow-x-auto"
          tabIndex={0}
        >
          <table className="w-full min-w-[780px] text-left text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="pb-2 pr-4">Evidence</th>
                {modelHeadings}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border">
                <th className="py-2 pr-4 text-left font-medium">
                  LiveBench cost / successful evaluation
                </th>
                {models.map((model) => (
                  <MatrixValue key={model.id}>
                    {model.aggregate === null
                      ? "Unavailable"
                      : formatEvidenceNumber(
                          model.aggregate.costPerSuccessfulEvaluationUsd,
                          (value) => formatPrice(value),
                        )}
                  </MatrixValue>
                ))}
              </tr>
              <tr className="border-t border-border">
                <th className="py-2 pr-4 text-left font-medium">
                  Mean output tokens
                </th>
                {models.map((model) => (
                  <MatrixValue key={model.id}>
                    {model.aggregate === null
                      ? "Unavailable"
                      : formatEvidenceNumber(model.aggregate.meanOutputTokens)}
                  </MatrixValue>
                ))}
              </tr>
              <tr className="border-t border-border">
                <th className="py-2 pr-4 text-left font-medium">
                  Source Pareto mark
                </th>
                {models.map((model) => (
                  <MatrixValue key={model.id}>
                    {model.aggregate === null
                      ? "Unavailable"
                      : model.aggregate.pareto
                        ? "Yes"
                        : "No"}
                  </MatrixValue>
                ))}
              </tr>
              <tr className="border-t border-border">
                <th className="py-2 pr-4 text-left font-medium">
                  Exact task rows
                </th>
                {models.map((model) => (
                  <MatrixValue key={model.id}>
                    {model.taskEconomics.length ||
                      `Unavailable: ${model.taskEconomicsUnavailableReason ?? "not published"}`}
                  </MatrixValue>
                ))}
              </tr>
              <tr className="border-t border-border">
                <th className="py-2 pr-4 text-left font-medium">Runtime</th>
                {models.map((model) => (
                  <MatrixValue key={model.id}>
                    {model.runtimeUnavailableReason ?? "Present; not projected"}
                  </MatrixValue>
                ))}
              </tr>
              <tr className="border-t border-border">
                <th className="py-2 pr-4 text-left font-medium">
                  Balanced route price / 1M
                </th>
                {models.map((model) => (
                  <MatrixValue key={model.id}>
                    <RoutePrice model={model} />
                  </MatrixValue>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ComparisonEconomicsCharts({
  models,
}: {
  models: readonly PopularModelV1[];
}) {
  return (
    <section
      aria-label="Per-selection economics charts"
      className="mt-5 grid gap-4 xl:grid-cols-3"
    >
      <Card>
        <CardContent className="pt-6">
          <h3 className="font-medium">
            LiveBench cost / successful evaluation
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Aggregate source economics only; selected-route pricing never
            substitutes for an unavailable LiveBench measurement.
          </p>
          <PopularModelsComparisonEconomicsChart
            metric="cost-per-success"
            models={models}
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <h3 className="font-medium">Selected-route output price / 1M</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Exact published output pricing for the chosen route; no blended
            route price is used in this comparison.
          </p>
          <PopularModelsComparisonEconomicsChart
            metric="route-output-price"
            models={models}
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <h3 className="font-medium">Mean output tokens</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Source-published aggregate output volume for this exact ordered
            selection.
          </p>
          <PopularModelsComparisonEconomicsChart
            metric="mean-output"
            models={models}
          />
        </CardContent>
      </Card>
    </section>
  );
}

function csvRows(
  models: readonly PopularModelV1[],
  viewModel: PopularModelsV1ViewModel,
  columns: readonly PopularModelsLeaderboardColumnV1[],
): CsvRow[] {
  const sourceReceipt = {
    sourceReleaseId: viewModel.release?.releaseId ?? null,
    sourceReleaseOn: viewModel.release?.releaseOn ?? null,
    sourceLicenseId: viewModel.release?.licenseId ?? null,
    sourceTotalRows: viewModel.total,
    sourcePaginationStatus: viewModel.pagination.availability,
    sourceNextCursor:
      viewModel.pagination.availability === "available"
        ? viewModel.pagination.nextCursor
        : null,
    sourcePaginationReason:
      viewModel.pagination.availability === "unavailable"
        ? viewModel.pagination.reason
        : null,
  };
  if (!models.length)
    return [
      {
        status: "unavailable",
        reason:
          viewModel.unavailableReason ??
          "No source-published ranking rows are available.",
        ...sourceReceipt,
      },
    ];
  return models.map((model) => {
    const pricing = model.routePricing;
    const aggregate = model.aggregate;
    return {
      ...sourceReceipt,
      sourceRank: model.rank,
      sourceModelId: model.id,
      sourceModelSlug: model.slug,
      model: model.name,
      provider: model.provider,
      access: model.access,
      ...Object.fromEntries(
        columns.map((column) => [
          `measurement_${column.key}`,
          popularModelsColumnValue(model, column.key),
        ]),
      ),
      selectedRoutePricingStatus: pricing.availability,
      selectedRoutePricingReason:
        pricing.availability === "unavailable" ? pricing.reason : null,
      selectedRoute:
        pricing.availability === "available" ? pricing.route : null,
      inputUsdPerMillion:
        pricing.availability === "available"
          ? pricing.inputUsdPerMillion
          : null,
      outputUsdPerMillion:
        pricing.availability === "available"
          ? pricing.outputUsdPerMillion
          : null,
      balancedUsdPerMillion:
        pricing.availability === "available"
          ? pricing.blendedUsdPerMillion
          : null,
      livebenchAggregateEconomicsStatus:
        aggregate === null ? "unavailable" : "published",
      livebenchCostPerSuccessfulEvaluationUsd:
        aggregate?.costPerSuccessfulEvaluationUsd.value ?? null,
      livebenchCostPerSuccessfulEvaluationReason:
        aggregate?.costPerSuccessfulEvaluationUsd.unavailableReason ??
        "Aggregate economics were not published for this row.",
      livebenchMeanOutputTokens: aggregate?.meanOutputTokens.value ?? null,
      livebenchMeanOutputReason:
        aggregate?.meanOutputTokens.unavailableReason ??
        "Aggregate economics were not published for this row.",
      livebenchPareto: aggregate?.pareto ?? null,
      livebenchTaskEconomicsCount: model.taskEconomics.length,
      runtimeStatus:
        model.runtimeUnavailableReason === null
          ? "present but not projected"
          : "unavailable",
      runtimeReason: model.runtimeUnavailableReason,
      taskEconomicsStatus: model.taskEconomics.length
        ? "published exact task rows"
        : "unavailable",
      taskEconomicsReason: model.taskEconomicsUnavailableReason,
    };
  });
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
  const initial = controlsFromParameters(initialParameters, viewModel);
  const [query, setQuery] = useState(initial.query);
  const [selectedProviders, setSelectedProviders] = useState<readonly string[]>(
    initial.providers,
  );
  const [openWeightsOnly, setOpenWeightsOnly] = useState(
    initial.openWeightsOnly,
  );
  const [showProviders, setShowProviders] = useState(initial.showProviders);
  const [categoryKey, setCategoryKey] = useState<string | null>(
    initial.categoryKey,
  );
  const [insightCategoryKey, setInsightCategoryKey] = useState<string | null>(
    initial.insightCategoryKey,
  );
  const [sortKey, setSortKey] = useState<PopularModelsSortKeyV1>(
    initial.sortKey,
  );
  const [sortDirection, setSortDirection] =
    useState<PopularModelsSortDirectionV1>(initial.sortDirection);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>(() =>
    comparisonIdsFromParameters(viewModel.models, initialParameters),
  );
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const providers = useMemo(
    () =>
      [
        ...new Set(
          viewModel.models
            .map((model) => model.provider)
            .filter((provider): provider is string => provider !== null),
        ),
      ].sort((left, right) => left.localeCompare(right)),
    [viewModel.models],
  );
  const metricColumns = useMemo(
    () => popularModelsLeaderboardColumns(viewModel, categoryKey),
    [categoryKey, viewModel],
  );
  const visibleModels = useMemo(
    () =>
      sortPopularModels(
        filterPopularModels(viewModel.models, {
          openWeightsOnly,
          providers: selectedProviders,
          query,
        }),
        sortKey,
        sortDirection,
      ),
    [
      openWeightsOnly,
      query,
      selectedProviders,
      sortDirection,
      sortKey,
      viewModel.models,
    ],
  );
  const selectedModels = useMemo(
    () =>
      selectedIds.flatMap((id) => {
        const model = viewModel.models.find((candidate) => candidate.id === id);
        return model === undefined ? [] : [model];
      }),
    [selectedIds, viewModel.models],
  );
  const winnerIdsByColumn = useMemo(
    () =>
      new Map(
        metricColumns.map((column) => [
          column.key,
          popularModelsColumnWinnerIds(viewModel.models, column.key, 5, "desc"),
        ]),
      ),
    [metricColumns, viewModel.models],
  );
  const costWinnerIds = useMemo(
    () =>
      popularModelsColumnWinnerIds(
        viewModel.models,
        "cost-per-success",
        5,
        "asc",
      ),
    [viewModel.models],
  );
  const comparisonIds = selectedModels.map((model) => model.id);
  const actionRows = csvRows(visibleModels, viewModel, metricColumns);
  const insightCategoryLabel = categoryLabel(viewModel, insightCategoryKey);
  const canRemoveComparison = selectedIds.length > 2;

  useEffect(() => {
    const parameters = new URLSearchParams();
    if (query.trim()) parameters.set("search", query.trim());
    if (selectedProviders.length)
      parameters.set("providers", selectedProviders.join(","));
    if (openWeightsOnly) parameters.set("openWeights", "only");
    if (!showProviders) parameters.set("providerVisibility", "hidden");
    if (categoryKey !== null) parameters.set("category", categoryKey);
    if (insightCategoryKey !== null)
      parameters.set("insight", insightCategoryKey);
    if (sortKey !== "overall") parameters.set("sort", sortKey);
    if (sortDirection !== popularModelsDefaultSortDirection(sortKey))
      parameters.set("direction", sortDirection);
    if (comparisonIds.length) parameters.set("models", comparisonIds.join(","));
    const nextUrl = `${window.location.pathname}${parameters.size ? `?${parameters}` : ""}${window.location.hash}`;
    if (
      `${window.location.pathname}${window.location.search}${window.location.hash}` !==
      nextUrl
    )
      window.history.replaceState(window.history.state, "", nextUrl);
  }, [
    categoryKey,
    comparisonIds,
    insightCategoryKey,
    openWeightsOnly,
    query,
    selectedProviders,
    showProviders,
    sortDirection,
    sortKey,
  ]);
  useEffect(() => {
    const onPopState = () => {
      const parsed = controlsFromParameters(
        Object.fromEntries(new URLSearchParams(window.location.search)),
        viewModel,
      );
      setQuery(parsed.query);
      setSelectedProviders(parsed.providers);
      setOpenWeightsOnly(parsed.openWeightsOnly);
      setShowProviders(parsed.showProviders);
      setCategoryKey(parsed.categoryKey);
      setInsightCategoryKey(parsed.insightCategoryKey);
      setSortKey(parsed.sortKey);
      setSortDirection(parsed.sortDirection);
      setSelectedIds(
        comparisonIdsFromParameters(
          viewModel.models,
          Object.fromEntries(new URLSearchParams(window.location.search)),
        ),
      );
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [viewModel]);

  const selectCategory = (nextCategoryKey: string | null) => {
    setCategoryKey(nextCategoryKey);
    const nextSort: PopularModelsSortKeyV1 =
      nextCategoryKey === null ? "overall" : `category:${nextCategoryKey}`;
    setSortKey(nextSort);
    setSortDirection("desc");
  };
  const selectSort = (nextSortKey: PopularModelsSortKeyV1) => {
    if (sortKey === nextSortKey)
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSortKey(nextSortKey);
      setSortDirection(popularModelsDefaultSortDirection(nextSortKey));
    }
  };
  const toggleEvidence = (id: string) =>
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleComparison = (id: string) =>
    setSelectedIds((current) => {
      if (current.includes(id))
        return current.length > 2
          ? current.filter((item) => item !== id)
          : current;
      return current.length < 4 &&
        viewModel.models.some((model) => model.id === id)
        ? [...current, id]
        : current;
    });
  const reset = () => {
    setQuery("");
    setSelectedProviders([]);
    setOpenWeightsOnly(false);
    setShowProviders(true);
    selectCategory(null);
    setInsightCategoryKey(null);
    setExpandedIds(new Set());
  };
  const compareHref = `/compare/?models=${comparisonIds.map((id) => encodeURIComponent(id)).join(",")}`;
  const sharedTableProps = {
    categoryKey,
    costWinnerIds,
    expandedIds,
    metricColumns,
    models: visibleModels,
    onToggleEvidence: toggleEvidence,
    showProviders,
    winnerIdsByColumn,
  };

  return (
    <div>
      <p aria-live="polite" className="sr-only">
        {visibleModels.length} of {viewModel.models.length} source ranking rows
        visible. {selectedIds.length} models selected for comparison.
      </p>
      <section
        aria-labelledby="popular-models-heading"
        className="relative overflow-hidden border-b border-border"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,color-mix(in_srgb,var(--primary)_14%,transparent),transparent_30%),radial-gradient(circle_at_15%_90%,rgba(217,119,87,.07),transparent_24%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:px-10 xl:grid-cols-[minmax(0,1fr)_390px] xl:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                className="font-mono text-[10px] uppercase tracking-[.16em]"
                variant="secondary"
              >
                LiveBench capability workbench
              </Badge>
              <Badge variant="outline">Strict v1 ranking evidence</Badge>
              <Badge
                variant={dataMode === "evidence" ? "destructive" : "outline"}
              >
                {dataMode === "evidence"
                  ? "Design-only evidence · not live data"
                  : dataMode === "production"
                    ? "Production source response"
                    : "Source mode unconfigured"}
              </Badge>
              {viewModel.sourceStatus === "partial" ? (
                <Badge variant="outline">Partial source coverage</Badge>
              ) : null}
            </div>
            <h1
              className="mt-6 max-w-4xl text-balance text-5xl font-semibold leading-[.98] tracking-[-.04em] sm:text-6xl"
              id="popular-models-heading"
            >
              Popular models · LiveBench capability workbench
            </h1>
            <p className="mt-6 max-w-3xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
              Browse the source-published capability ranking, inspect its
              dynamic categories and released task evidence, and compare a
              decision set without filling unavailable facts or relabeling a
              source rank.
            </p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border bg-card/90 shadow-soft">
            <div className="border-b border-border px-5 py-4">
              <p className="text-sm font-medium">Strict v1 evidence receipt</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Source release, total, and pagination appear only when
                published. Route pricing remains independent evidence.
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-px bg-border md:grid-cols-3">
              <div className="bg-card p-4">
                <dt className="font-mono text-[10px] uppercase text-muted-foreground">
                  Status
                </dt>
                <dd className="mt-2 text-sm font-medium capitalize">
                  {viewModel.sourceStatus}
                </dd>
              </div>
              <div className="bg-card p-4">
                <dt className="font-mono text-[10px] uppercase text-muted-foreground">
                  Rows in receipt
                </dt>
                <dd className="mt-2 font-mono text-sm">
                  {viewModel.models.length}
                </dd>
              </div>
              <div className="bg-card p-4">
                <dt className="font-mono text-[10px] uppercase text-muted-foreground">
                  Source total
                </dt>
                <dd className="mt-2 font-mono text-sm">
                  {viewModel.total === null ? "Unavailable" : viewModel.total}
                </dd>
              </div>
              <div className="bg-card p-4">
                <dt className="font-mono text-[10px] uppercase text-muted-foreground">
                  Release
                </dt>
                <dd className="mt-2 break-all font-mono text-xs">
                  {viewModel.release === null
                    ? "Unavailable"
                    : viewModel.release.releaseId}
                </dd>
                {viewModel.release === null ? null : (
                  <dd className="mt-1 text-xs text-muted-foreground">
                    {viewModel.release.releaseOn} ·{" "}
                    {viewModel.release.licenseId}
                  </dd>
                )}
              </div>
              <div className="bg-card p-4">
                <dt className="font-mono text-[10px] uppercase text-muted-foreground">
                  Pagination
                </dt>
                <dd className="mt-2 text-xs">
                  {viewModel.pagination.availability === "unavailable"
                    ? "Unavailable"
                    : viewModel.pagination.nextCursor === null
                      ? "No next cursor"
                      : "Next cursor published"}
                </dd>
              </div>
              <div className="bg-card p-4">
                <dt className="font-mono text-[10px] uppercase text-muted-foreground">
                  Categories
                </dt>
                <dd className="mt-2 font-mono text-sm">
                  {viewModel.categories.length}
                </dd>
              </div>
            </dl>
          </div>
        </div>
        <p className="mx-auto max-w-7xl px-5 pb-5 text-xs text-muted-foreground sm:px-8 lg:px-10">
          Ranking scope: {viewModel.models.length} receipt rows
          {viewModel.total === null
            ? "; source total unavailable."
            : ` of ${viewModel.total} source rows.`}{" "}
          {viewModel.pagination.availability === "available"
            ? viewModel.pagination.nextCursor === null
              ? "The source receipt publishes no next cursor."
              : "The source receipt publishes a next cursor; this is not a complete load."
            : "The source receipt does not publish pagination state."}
        </p>
      </section>

      <section
        aria-labelledby="popular-models-leaderboard-heading"
        className="px-5 py-14 sm:px-8 sm:py-16 lg:px-10"
        id="popular-models-leaderboard"
      >
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2
                className="font-mono text-xs text-primary"
                id="popular-models-leaderboard-heading"
              >
                01 Leaderboard
              </h2>
              <p className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                Published model evidence
              </p>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                Search and sort a master table without recomputing the source
                rank. Overall shows every published category; a selected
                category exposes its published task columns and exact evidence
                drawer.
              </p>
            </div>
            <ResultActions
              filename="tokenbench-popular-models-leaderboard"
              label="Share and export popular model leaderboard"
              rows={actionRows}
              targetId="popular-models-leaderboard"
            />
          </div>
          <form
            aria-label="Popular model leaderboard filters"
            className="mt-7 grid gap-3 rounded-2xl border border-border bg-card p-4 md:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1fr_1fr_auto] xl:items-end"
            onSubmit={(event) => event.preventDefault()}
          >
            <label
              className="space-y-1.5 text-xs text-muted-foreground"
              htmlFor="popular-models-search"
            >
              Search model or provider
              <Input
                className="mt-1.5 h-11"
                id="popular-models-search"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Model, provider, or source ID"
                type="search"
                value={query}
              />
            </label>
            <ProviderMultiSelect
              onChange={setSelectedProviders}
              providers={providers}
              selectedProviders={selectedProviders}
            />
            <fieldset className="grid gap-2">
              <legend className="sr-only">
                Access and provider visibility
              </legend>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm">
                <input
                  checked={openWeightsOnly}
                  className="size-4 accent-primary"
                  onChange={(event) => setOpenWeightsOnly(event.target.checked)}
                  type="checkbox"
                />
                Open weights only
              </label>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm">
                <input
                  checked={showProviders}
                  className="size-4 accent-primary"
                  onChange={(event) => setShowProviders(event.target.checked)}
                  type="checkbox"
                />
                Show provider column
              </label>
            </fieldset>
            <label
              className="flex min-h-11 cursor-not-allowed items-center gap-2 rounded-lg border border-dashed border-border px-3 text-xs text-muted-foreground"
              title="Unavailable: strict ranking rows do not publish a derivative-finetune flag."
            >
              <input
                aria-describedby="popular-models-derivative-unavailable"
                className="size-4"
                disabled
                type="checkbox"
              />
              Exclude derivative finetunes
              <span
                className="sr-only"
                id="popular-models-derivative-unavailable"
              >
                Unavailable because strict ranking rows do not publish a
                derivative-finetune flag.
              </span>
            </label>
            <Button
              className="min-h-11"
              onClick={reset}
              size="sm"
              type="button"
              variant="outline"
            >
              <RotateCcw />
              Reset
            </Button>
          </form>
          <div className="mt-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                <span className="font-mono text-foreground">
                  {visibleModels.length}
                </span>{" "}
                of {viewModel.models.length} source rows visible · order:{" "}
                <span className="font-medium text-foreground">
                  {sortDirection === "asc" ? "ascending" : "descending"}
                </span>
              </p>
              <div
                aria-label="Published capability categories"
                className="mt-3 -mx-1 overflow-x-auto pb-1"
                role="group"
              >
                <div className="flex min-w-max gap-2 px-1">
                  <button
                    aria-pressed={categoryKey === null}
                    className={cn(
                      "popular-models-category-tag",
                      categoryKey === null
                        ? "border-active-control bg-active-control text-active-control-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => selectCategory(null)}
                    type="button"
                  >
                    Overall
                  </button>
                  {viewModel.categories.map((category) => (
                    <button
                      aria-pressed={categoryKey === category.key}
                      className={cn(
                        "popular-models-category-tag",
                        categoryKey === category.key
                          ? "border-active-control bg-active-control text-active-control-foreground"
                          : "border-border bg-card text-muted-foreground hover:text-foreground",
                      )}
                      key={category.key}
                      onClick={() => selectCategory(category.key)}
                      type="button"
                    >
                      {category.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <p className="max-w-sm text-xs leading-5 text-muted-foreground">
              Winner marks reflect the five highest source-published score or
              task measurements, and five lowest source costs, across the full
              receipt—not the current filter result.
            </p>
          </div>
          {viewModel.models.length === 0 ? (
            <div className="mt-7 grid min-h-64 place-items-center rounded-2xl border border-dashed border-border text-center">
              <div>
                <CircleAlert className="mx-auto size-6 text-muted-foreground" />
                <h3 className="mt-3 font-medium">
                  LiveBench capability evidence is unavailable
                </h3>
                <p className="mt-1 max-w-lg text-sm leading-6 text-muted-foreground">
                  {viewModel.unavailableReason ??
                    "The strict v1 rankings loader did not return a usable source snapshot."}
                </p>
              </div>
            </div>
          ) : visibleModels.length === 0 ? (
            <div className="mt-7 grid min-h-64 place-items-center rounded-2xl border border-dashed border-border text-center">
              <div>
                <CircleAlert className="mx-auto size-6 text-muted-foreground" />
                <h3 className="mt-3 font-medium">
                  No source rows match these filters
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Broaden the search or reset the workbench controls.
                </p>
                <Button
                  className="mt-4 min-h-11"
                  onClick={reset}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Reset filters
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-7">
              <ModelTable
                {...sharedTableProps}
                onSort={selectSort}
                sortDirection={sortDirection}
                sortKey={sortKey}
              />
              <ModelCards props={sharedTableProps} />
            </div>
          )}
        </div>
      </section>

      <section
        aria-labelledby="popular-models-insights-heading"
        className="border-y border-border bg-muted/25 px-5 py-14 sm:px-8 sm:py-16 lg:px-10"
        id="popular-models-insights"
      >
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2
                className="font-mono text-xs text-primary"
                id="popular-models-insights-heading"
              >
                02 Insights
              </h2>
              <p className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                Quality and LiveBench evaluation economics
              </p>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                The independent selector below changes only the insight axis.
                Both charts use every source receipt row and source-published
                LiveBench aggregate cost per successful evaluation;
                selected-route prices never fill an unavailable source value.
              </p>
            </div>
            <ResultActions
              filename="tokenbench-popular-models-insights"
              label="Share and export popular model insights"
              rows={csvRows(viewModel.models, viewModel, metricColumns)}
              targetId="popular-models-insights"
            />
          </div>
          <div className="mt-6">
            <p className="text-sm text-muted-foreground">
              Insights axis:{" "}
              <span className="font-medium text-foreground">
                {insightCategoryLabel}
              </span>
            </p>
            <div
              aria-label="Independent insight category"
              className="mt-3 -mx-1 overflow-x-auto pb-1"
              role="group"
            >
              <div className="flex min-w-max gap-2 px-1">
                <button
                  aria-pressed={insightCategoryKey === null}
                  className={cn(
                    "popular-models-category-tag",
                    insightCategoryKey === null
                      ? "border-active-control bg-active-control text-active-control-foreground"
                      : "border-border bg-card text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setInsightCategoryKey(null)}
                  type="button"
                >
                  Overall
                </button>
                {viewModel.categories.map((category) => (
                  <button
                    aria-pressed={insightCategoryKey === category.key}
                    className={cn(
                      "popular-models-category-tag",
                      insightCategoryKey === category.key
                        ? "border-active-control bg-active-control text-active-control-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground",
                    )}
                    key={category.key}
                    onClick={() => setInsightCategoryKey(category.key)}
                    type="button"
                  >
                    {category.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-7 grid gap-5 xl:grid-cols-2">
            <Card>
              <CardContent className="pt-6">
                <div className="mb-5">
                  <h3 className="font-medium">
                    {insightCategoryLabel} versus LiveBench cost
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    A strict source-measurement Pareto frontier is traced across
                    cost-ascending, score-improving rows. Tooltips and exact
                    profile-linked values preserve unavailable states.
                  </p>
                </div>
                <PopularModelsAggregateQualityCostChart
                  categoryKey={insightCategoryKey}
                  categoryLabel={insightCategoryLabel}
                  models={viewModel.models}
                />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="mb-5">
                  <h3 className="font-medium">Cost ranking</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Ranks only rows with source-published cost per successful
                    evaluation. Mean output and source Pareto evidence remain
                    explicit.
                  </p>
                </div>
                <PopularModelsAggregateCostRankingChart
                  models={viewModel.models}
                />
              </CardContent>
            </Card>
          </div>
          <section
            aria-labelledby="popular-models-comparison-heading"
            className="mt-14 border-t border-border pt-14"
            id="popular-models-comparison"
          >
            <div className="grid gap-7 lg:grid-cols-[.8fr_1.2fr] lg:items-start">
              <div>
                <h2
                  className="font-mono text-xs text-primary"
                  id="popular-models-comparison-heading"
                >
                  03 Compare popular models
                </h2>
                <p className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                  Build a 2–4 model decision set
                </p>
                <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
                  The tray preserves selection order in this URL as canonical
                  catalog IDs. Legacy source slugs are normalized to IDs before
                  navigation so the comparison route receives exactly the format
                  it accepts.
                </p>
                <div className="mt-5">
                  <ResultActions
                    filename="tokenbench-popular-models-comparison"
                    label="Share and export popular model comparison"
                    rows={csvRows(selectedModels, viewModel, metricColumns)}
                    targetId="popular-models-comparison"
                  />
                </div>
              </div>
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <CardTitle aria-live="polite">
                        {selectedModels.length} / 4 selected
                      </CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Two selected models are retained as the comparison
                        minimum.
                      </p>
                    </div>
                    {selectedIds.length > 2 ? (
                      <Button
                        onClick={() =>
                          setSelectedIds(
                            normalizePopularModelsComparisonIds(
                              viewModel.models,
                              [],
                            ),
                          )
                        }
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Reset tray
                      </Button>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent>
                  <div
                    aria-label="Ordered model comparison selection"
                    className="flex flex-wrap gap-2"
                    role="list"
                  >
                    {selectedModels.map((model, index) => (
                      <span
                        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-muted/40 py-1 pl-3 pr-1 text-sm"
                        key={model.id}
                        role="listitem"
                      >
                        <span className="font-mono text-xs text-muted-foreground">
                          {index + 1}
                        </span>
                        <ProviderDot provider={model.provider} />
                        <span>{modelName(model)}</span>
                        {model.slug === null ? null : (
                          <Link
                            aria-label={`More details for ${modelName(model)}`}
                            className="text-xs text-primary hover:underline"
                            href={`/model-profile?model=${encodeURIComponent(model.id)}`}
                          >
                            More details
                          </Link>
                        )}
                        <button
                          aria-label={`Remove ${modelName(model)} from comparison`}
                          className="grid size-11 place-items-center rounded-full text-muted-foreground transition hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={!canRemoveComparison}
                          onClick={() => toggleComparison(model.id)}
                          type="button"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  {selectedModels.length === 0 ? (
                    <p className="mt-4 text-sm text-muted-foreground">
                      Unavailable: no source models are available to start a
                      comparison.
                    </p>
                  ) : (
                    <div className="mt-4">
                      <ComparisonPicker
                        models={viewModel.models}
                        onAdd={toggleComparison}
                        selectedIds={selectedIds}
                      />
                    </div>
                  )}
                  {selectedModels.length ? (
                    <>
                      <ComparisonEconomicsCharts models={selectedModels} />
                      <ComparisonMatrices
                        categories={viewModel.categories}
                        models={selectedModels}
                      />
                    </>
                  ) : null}
                </CardContent>
                <CardFooter className="justify-between gap-3">
                  <span className="text-xs text-muted-foreground">
                    Minimum 2 · maximum 4
                  </span>
                  {comparisonIds.length >= 2 ? (
                    <Link
                      className={cn(buttonVariants(), "min-h-11")}
                      href={compareHref}
                    >
                      Compare models
                      <GitCompareArrows />
                    </Link>
                  ) : (
                    <Button className="min-h-11" disabled>
                      Compare models
                      <GitCompareArrows />
                    </Button>
                  )}
                </CardFooter>
              </Card>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
