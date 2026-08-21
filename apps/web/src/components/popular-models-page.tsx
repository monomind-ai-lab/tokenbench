"use client";

import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  GitCompareArrows,
  LayoutGrid,
  List,
  Plus,
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

import { formatDisplayNumber } from "@tokenbench/frontend/display-format";

import {
  PopularModelsAggregateCostRankingChart,
  PopularModelsAggregateQualityCostChart,
  PopularModelsComparisonRadar,
  PopularModelsComparisonEconomicsChart,
  popularProviderColor,
} from "@/components/popular-models-charts";
import { ResultActions, type CsvRow } from "@/components/result-actions";
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
  POPULAR_MODELS_CATEGORY_CONTROL_SLOTS,
  popularModelsColumnValue,
  popularModelsColumnWinnerIds,
  popularModelsCategorySlotKey,
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
  readonly viewMode: "cards" | "list";
}

const MISSING_VALUE = "-";

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
  const categoryKey =
    requestedCategory === undefined || requestedCategory === "all"
      ? null
      : popularModelsCategorySlotKey(requestedCategory);
  const requestedInsight = firstParameter(parameters.insight);
  const insightCategoryKey =
    requestedInsight === undefined || requestedInsight === "all"
      ? null
      : popularModelsCategorySlotKey(requestedInsight);
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
    viewMode: firstParameter(parameters.view) === "cards" ? "cards" : "list",
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
  return model.name ?? MISSING_VALUE;
}

function providerName(model: PopularModelV1): string {
  return model.provider ?? MISSING_VALUE;
}

function rankLabel(model: PopularModelV1): string {
  return model.rank === null ? MISSING_VALUE : `#${model.rank}`;
}

function formatNumber(value: number | null, maximumFractionDigits = 2): string {
  return value === null
    ? MISSING_VALUE
    : formatDisplayNumber(value, { maximumFractionDigits });
}

function formatExactNumber(value: number): string {
  return formatDisplayNumber(value);
}

function formatPrice(value: number | null): string {
  if (value === null) return MISSING_VALUE;
  return value > 0 && value < 0.01 ? "USD <0.01" : `USD ${formatExactNumber(value)}`;
}

function formatTokens(value: number | null): string {
  return value === null
    ? MISSING_VALUE
    : formatDisplayNumber(value, { maximumFractionDigits: 0 });
}

function formatEvidenceNumber(
  measurement: PopularModelsEvidenceNumberV1,
  formatter: (value: number) => string = formatExactNumber,
): string {
  return measurement.value === null
    ? MISSING_VALUE
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
    return <span className="block truncate font-medium">{modelName(model)}</span>;
  return (
    <Link
      className="block truncate font-medium transition-colors hover:text-primary hover:underline"
      href={`/model-profile?model=${encodeURIComponent(model.slug)}`}
    >
      {modelName(model)}
    </Link>
  );
}

function RoutePrice({ model }: { model: PopularModelV1 }) {
  if (model.routePricing.availability === "unavailable")
    return <span className="text-muted-foreground">{MISSING_VALUE}</span>;
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
    return <span className="text-muted-foreground">{MISSING_VALUE}</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center justify-end gap-1 font-mono",
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
        <span
          aria-label="Among the five lowest published evaluation costs"
          className="font-sans text-xs font-bold text-primary"
          title="Among the five lowest published evaluation costs"
        >
          ↓
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
        "inline-flex min-h-7 items-center gap-1 font-mono text-xs",
        winner && "font-semibold text-primary",
      )}
    >
      <span>{value === null ? MISSING_VALUE : formatExactNumber(value)}</span>
      {winner ? (
        <span
          aria-label="Among the five highest published values"
          className="font-sans text-xs font-bold text-primary"
          title="Among the five highest published values"
        >
          ★
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
      : model.axes.filter(
          (axis) =>
            popularModelsCategorySlotKey(axis.key, axis.label) ===
            selectedCategoryKey,
        );
  const tasks =
    selectedCategoryKey === null
      ? model.taskEconomics
      : model.taskEconomics.filter(
          (task) =>
            popularModelsCategorySlotKey(task.categoryId) === selectedCategoryKey,
        );
  const axisScope =
    selectedCategoryKey === null
      ? "Published capability categories"
      : "Selected benchmark category";
  const taskScope =
    selectedCategoryKey === null
      ? "Published task measurements"
      : "Selected-category task measurements";

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
            Published rank
          </dt>
          <dd className="mt-1 font-mono">{rankLabel(model)}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">
            Access
          </dt>
          <dd className="mt-1 font-mono">
            {model.access ?? MISSING_VALUE}
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
                      {axis.rank === null ? MISSING_VALUE : formatDisplayNumber(axis.rank)}
                      {axis.fieldSize === null ? "" : ` / ${formatDisplayNumber(axis.fieldSize)}`}
                    </span>
                  </dt>
                  <dd className="font-mono">{formatNumber(axis.percentile)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-2 leading-5 text-muted-foreground">
              Unavailable for this category.
            </p>
          )}
        </section>
        <section aria-label="Published task labels">
          <p className="font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">
            Published task labels
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
              No published task labels are available.
            </p>
          )}
        </section>
      </div>
      <div className="mt-4 grid gap-3 border-t border-border pt-4 lg:grid-cols-3">
        <section aria-label="Evaluation cost">
          <p className="font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">
            Evaluation cost
          </p>
          {aggregate === null ? (
            <p className="mt-2 leading-5 text-muted-foreground">
              Unavailable. Selected-route pricing is separate published data.
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
                <dt className="text-muted-foreground">Published Pareto mark</dt>
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
              Unavailable for the selected route.
            </p>
          )}
        </section>
        <section aria-label="Data coverage">
          <p className="font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">
            Data coverage
          </p>
          <dl className="mt-2 space-y-2 leading-5">
            <div>
              <dt className="font-medium">Runtime</dt>
              <dd className="text-muted-foreground">
                {model.runtimeUnavailableReason === null
                  ? "Published data is available; no runtime metric is shown."
                  : MISSING_VALUE}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Task economics</dt>
              <dd className="text-muted-foreground">
                {tasks.length
                  ? `${tasks.length} published task row${tasks.length === 1 ? "" : "s"} shown below.`
                  : MISSING_VALUE}
              </dd>
            </div>
            {pricing.availability === "available" &&
            pricing.contextWindowTokens === null ? (
              <div>
                <dt className="font-medium">Context capacity</dt>
                <dd className="text-muted-foreground">
                  {MISSING_VALUE}
                </dd>
              </div>
            ) : null}
            {pricing.availability === "available" &&
            pricing.maxOutputTokens === null ? (
              <div>
                <dt className="font-medium">Maximum output</dt>
                <dd className="text-muted-foreground">
                  {MISSING_VALUE}
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
            aria-label="Published task measurements table. Scroll horizontally for all columns."
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
            Unavailable for this scope.
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
  const columnCount = 4 + metricColumns.length + (showProviders ? 1 : 0);
  const ariaSort = (key: PopularModelsSortKeyV1) =>
    sortKey === key
      ? sortDirection === "asc"
        ? "ascending"
        : "descending"
      : "none";
  return (
    <div
      aria-label="Published benchmark table. Scroll horizontally only when the current task columns require it."
      className="hidden overflow-x-auto rounded-2xl border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:block"
      tabIndex={0}
    >
      <table className="w-full min-w-[1110px] table-fixed border-collapse text-xs">
        <thead className="bg-muted/60 text-[11px] text-muted-foreground">
          <tr>
            <th className="w-9 px-1.5 py-2 text-left">
              <span className="sr-only">Expand evidence</span>
            </th>
            <th className="w-9 px-1.5 py-2 text-left">#</th>
            <th aria-sort={ariaSort("model")} className="w-40 px-2 py-2 text-left">
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
                className="w-28 px-2 py-2 text-left"
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
                className="w-[4.5rem] px-1.5 py-2 text-right leading-3"
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
              className="w-24 px-2 py-2 text-right"
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
                <tr className="border-t border-border align-middle transition-colors hover:bg-muted/30">
                  <td className="align-middle px-1.5 py-2.5">
                    <button
                      aria-controls={evidenceId}
                      aria-expanded={expanded}
                      aria-label={`${expanded ? "Collapse" : "Expand"} ${modelName(model)} published data`}
                      className="grid size-8 place-items-center rounded-md border border-border bg-card transition-colors hover:bg-muted"
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
                  <td className="align-middle px-1.5 py-2.5 font-mono text-xs text-muted-foreground">
                    <span
                      aria-label={
                        model.rank === null
                          ? "Published rank -"
                          : `Published rank ${model.rank}`
                      }
                    >
                      {model.rank ?? MISSING_VALUE}
                    </span>
                  </td>
                  <td className="align-middle px-2 py-2.5">
                    <ModelLink model={model} />
                  </td>
                  {showProviders ? (
                    <td className="align-middle px-2 py-2.5">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <ProviderDot provider={model.provider} />
                        <span className="truncate">{providerName(model)}</span>
                      </span>
                    </td>
                  ) : null}
                  {metricColumns.map((column) => (
                    <td className="align-middle px-1.5 py-2.5 text-right" key={column.key}>
                      <ScoreCell
                        column={column}
                        model={model}
                        winnerIds={winnerIdsByColumn.get(column.key)}
                      />
                    </td>
                  ))}
                  <td className="align-middle px-2 py-2.5 text-right">
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
                    <td className="p-3" colSpan={columnCount}>
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
  className = "grid gap-3 md:hidden",
  props,
}: {
  className?: string;
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
    <div className={className}>
      {models.map((model, index) => {
        const expanded = expandedIds.has(model.id);
        const evidenceId = `popular-model-mobile-evidence-${model.id}`;
        return (
          <Card className="overflow-hidden" key={model.id}>
            <CardHeader className="pb-4">
              <div className="flex items-start gap-3">
                <span className="grid min-h-9 min-w-9 place-items-center rounded-xl border border-border bg-muted/60 px-2 font-mono text-xs text-muted-foreground">
                  <span
                      aria-label={
                        model.rank === null
                          ? "Published rank -"
                          : `Published rank ${model.rank}`
                      }
                    >
                    {model.rank ?? MISSING_VALUE}
                  </span>
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
                  aria-label={`${expanded ? "Collapse" : "Expand"} ${modelName(model)} published data`}
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
                    Evaluation cost / success
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
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
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
  const close = (returnFocus = false) => {
    setOpen(false);
    if (returnFocus)
      window.requestAnimationFrame(() => trigger.current?.focus());
  };
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (root.current !== null && !root.current.contains(event.target as Node))
        close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);
  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => searchInput.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);
  return (
    <div
      className="relative min-w-0"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close(true);
        }
      }}
      ref={root}
    >
      <Button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Providers, ${selectedProviders.length ? `${selectedProviders.length} selected` : "all selected"}`}
        className="flex min-h-11 w-full justify-between gap-3"
        onClick={() => setOpen((current) => !current)}
        ref={trigger}
        type="button"
        variant="outline"
      >
        <span>Providers</span>
        <span className="font-mono text-xs text-muted-foreground">
          {selectedProviders.length
            ? `${selectedProviders.length} selected`
            : "All"}
        </span>
      </Button>
      {open ? (
        <div
          aria-label="Choose one or more providers"
          className="absolute left-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-2.5rem))] rounded-xl border border-border bg-popover p-3 shadow-soft"
          role="dialog"
        >
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <span className="sr-only">Search providers</span>
            <Input
              className="h-10 pl-9"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search providers"
              ref={searchInput}
              type="search"
              value={search}
            />
          </label>
          <fieldset className="mt-3 max-h-52 space-y-1 overflow-y-auto">
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
          <div className="mt-3 flex items-center justify-between gap-3">
            {selectedProviders.length ? (
              <Button
                className="min-h-10"
                onClick={() => onChange([])}
                size="sm"
                type="button"
                variant="ghost"
              >
                Clear
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">All providers</span>
            )}
            <Button
              className="min-h-10"
              onClick={() => close(true)}
              size="sm"
              type="button"
              variant="ghost"
            >
              Close
            </Button>
          </div>
        </div>
      ) : null}
    </div>
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
        Maximum of four published models selected.
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
              Search and add a published model
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
                No published models match.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
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
            <h3 className="font-medium">Capability radar</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              A profile is drawn only when every current benchmark category has a
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
        <PopularModelsComparisonRadar categories={categories} models={models} />
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
                  Published rank
                </th>
                {models.map((model) => (
                  <MatrixValue key={model.id}>{rankLabel(model)}</MatrixValue>
                ))}
              </tr>
              <tr className="border-t border-border">
                <th className="py-2 pr-4 text-left font-medium">Access</th>
                {models.map((model) => (
                  <MatrixValue key={model.id}>
                    {model.access ?? MISSING_VALUE}
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
                      : MISSING_VALUE}
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
          aria-label="Metric-first benchmark capability matrix. Scroll horizontally for all columns."
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
          Exact published data matrix
        </h3>
        <div
          aria-label="Metric-first evaluation cost and data coverage matrix. Scroll horizontally for all columns."
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
                  Evaluation cost / successful evaluation
                </th>
                {models.map((model) => (
                  <MatrixValue key={model.id}>
                    {model.aggregate === null
                      ? MISSING_VALUE
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
                      ? MISSING_VALUE
                      : formatEvidenceNumber(model.aggregate.meanOutputTokens)}
                  </MatrixValue>
                ))}
              </tr>
              <tr className="border-t border-border">
                <th className="py-2 pr-4 text-left font-medium">
                  Published Pareto mark
                </th>
                {models.map((model) => (
                  <MatrixValue key={model.id}>
                    {model.aggregate === null
                      ? MISSING_VALUE
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
                    {model.taskEconomics.length || MISSING_VALUE}
                  </MatrixValue>
                ))}
              </tr>
              <tr className="border-t border-border">
                <th className="py-2 pr-4 text-left font-medium">Runtime</th>
                {models.map((model) => (
                  <MatrixValue key={model.id}>
                    {model.runtimeUnavailableReason === null
                      ? "Available; not projected"
                      : MISSING_VALUE}
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
            Evaluation cost / successful evaluation
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Aggregate published evaluation cost only; selected-route pricing
            never substitutes for an unavailable benchmark measurement.
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
            Published aggregate output volume for this exact ordered
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
  const dataCoverage = {
    dataReleaseId: viewModel.release?.releaseId ?? null,
    dataReleaseOn: viewModel.release?.releaseOn ?? null,
    dataLicenseId: viewModel.release?.licenseId ?? null,
    publishedTotalRows: viewModel.total,
    dataCoverageStatus: viewModel.pagination.availability,
    dataCoverageNextCursor:
      viewModel.pagination.availability === "available"
        ? viewModel.pagination.nextCursor
        : null,
    dataCoverageReason:
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
          "No published ranking rows are available.",
        ...dataCoverage,
      },
    ];
  return models.map((model) => {
    const pricing = model.routePricing;
    const aggregate = model.aggregate;
    return {
      ...dataCoverage,
      publishedRank: model.rank,
      modelId: model.id,
      modelSlug: model.slug,
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
      evaluationCostStatus:
        aggregate === null ? "unavailable" : "published",
      evaluationCostPerSuccessfulEvaluationUsd:
        aggregate?.costPerSuccessfulEvaluationUsd.value ?? null,
      evaluationCostPerSuccessfulEvaluationReason:
        aggregate?.costPerSuccessfulEvaluationUsd.unavailableReason ??
        "Aggregate economics were not published for this row.",
      evaluationMeanOutputTokens: aggregate?.meanOutputTokens.value ?? null,
      evaluationMeanOutputReason:
        aggregate?.meanOutputTokens.unavailableReason ??
        "Aggregate economics were not published for this row.",
      publishedPareto: aggregate?.pareto ?? null,
      publishedTaskMeasurementCount: model.taskEconomics.length,
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
  const [viewMode, setViewMode] = useState<"cards" | "list">(initial.viewMode);
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
  const comparisonIds = selectedModels.flatMap((model) =>
    model.slug === null ? [] : [model.slug],
  );
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
    if (viewMode === "cards") parameters.set("view", "cards");
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
    viewMode,
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
      setViewMode(parsed.viewMode);
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
    setViewMode("list");
  };
  const compareHref = `/compare?models=${comparisonIds.map((id) => encodeURIComponent(id)).join(",")}`;
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
        {visibleModels.length} of {viewModel.models.length} published ranking rows
        visible. {selectedIds.length} models selected for comparison.
      </p>
      <section
        aria-labelledby="popular-models-heading"
        className="relative overflow-hidden border-b border-border"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,color-mix(in_srgb,var(--primary)_14%,transparent),transparent_30%),radial-gradient(circle_at_15%_90%,rgba(217,119,87,.07),transparent_24%)]" />
        <div className="relative mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
          <h1
            className="max-w-4xl text-balance text-5xl font-semibold leading-[.98] tracking-[-.04em] sm:text-6xl"
            id="popular-models-heading"
          >
            Popular models · benchmark workbench
          </h1>
          <p className="mt-6 max-w-3xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
            Browse published benchmark data across fixed capability categories,
            inspect task measurements, and compare a decision set without
            deriving values for unavailable fields or changing published rank.
          </p>
          <p className="mt-5 max-w-3xl text-sm leading-6 text-muted-foreground">
            Data coverage and provenance stay explicit throughout the
            workbench. Evaluation cost and route pricing remain separate
            measurements.
          </p>
          {dataMode === "evidence" ? (
            <div
              className="mt-7 flex max-w-3xl items-start gap-3 rounded-xl border border-border bg-muted/45 p-4 text-sm leading-6 text-muted-foreground"
              role="status"
            >
              <CircleAlert
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-primary"
              />
              <p>
                <span className="font-medium text-foreground">Preview data.</span>{" "}
                Values shown here are for interface review only; they are not
                live benchmark results or pricing guidance.
              </p>
            </div>
          ) : null}
        </div>
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
                Search and sort a master table without recomputing published
                rank. All shows every fixed category; a selected
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
            className="mt-7 grid gap-3 rounded-2xl border border-border bg-card p-4 lg:grid-cols-[minmax(16rem,1.6fr)_minmax(11rem,1fr)_auto_auto_auto] lg:items-center"
            onSubmit={(event) => event.preventDefault()}
          >
            <label className="relative min-w-0" htmlFor="popular-models-search">
              <span className="sr-only">Search model or provider</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                className="h-11 pl-9"
                id="popular-models-search"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Model, provider, or model ID"
                type="search"
                value={query}
              />
            </label>
            <ProviderMultiSelect
              onChange={setSelectedProviders}
              providers={providers}
              selectedProviders={selectedProviders}
            />
            <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm whitespace-nowrap">
              <input
                checked={openWeightsOnly}
                className="size-4 accent-primary"
                onChange={(event) => setOpenWeightsOnly(event.target.checked)}
                type="checkbox"
              />
              Open weights
            </label>
            <label
              className="flex min-h-11 cursor-not-allowed items-center gap-2 rounded-lg border border-dashed border-border px-3 text-sm text-muted-foreground whitespace-nowrap"
              title="Unavailable: published data does not include a finetune flag."
            >
              <input
                aria-describedby="popular-models-finetune-unavailable"
                className="size-4"
                disabled
                type="checkbox"
              />
              Exclude finetunes
              <span
                className="sr-only"
                id="popular-models-finetune-unavailable"
              >
                Unavailable because published data does not include a finetune
                flag.
              </span>
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm whitespace-nowrap">
              <input
                checked={showProviders}
                className="size-4 accent-primary"
                onChange={(event) => setShowProviders(event.target.checked)}
                type="checkbox"
              />
              Show provider
            </label>
          </form>
          <div className="mt-5 border-t border-border pt-5">
            <div
              aria-label="Benchmark categories"
              className="-mx-1 overflow-x-auto pb-1"
              role="group"
            >
              <div className="flex min-w-max flex-nowrap gap-2 px-1">
                {POPULAR_MODELS_CATEGORY_CONTROL_SLOTS.map((category) => (
                  <button
                    aria-pressed={categoryKey === category.key}
                    className={cn(
                      "popular-models-category-tag shrink-0 whitespace-nowrap",
                      categoryKey === category.key
                        ? "border-active-control bg-active-control text-active-control-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground",
                    )}
                    key={category.label}
                    onClick={() => selectCategory(category.key)}
                    type="button"
                  >
                    {category.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div aria-live="polite" className="text-sm text-muted-foreground">
                <span className="font-mono text-foreground">{visibleModels.length}</span>{" "}
                of {viewModel.models.length} published rows ·{" "}
                <span className="font-medium text-foreground">
                  {sortDirection === "asc" ? "ascending" : "descending"}
                </span>
              </div>
              <div aria-label="Leaderboard view" className="inline-flex rounded-lg border border-border bg-card p-1" role="group">
                <Button aria-pressed={viewMode === "cards"} className="min-h-9" onClick={() => setViewMode("cards")} size="sm" type="button" variant={viewMode === "cards" ? "secondary" : "ghost"}><LayoutGrid />Cards</Button>
                <Button aria-pressed={viewMode === "list"} className="min-h-9" onClick={() => setViewMode("list")} size="sm" type="button" variant={viewMode === "list" ? "secondary" : "ghost"}><List />List</Button>
              </div>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              A star marks one of the five highest published values; a down
              arrow marks one of the five lowest evaluation costs across all
              loaded data, not the current filter result.
            </p>
          </div>
          {viewModel.models.length === 0 ? (
            <div className="mt-7 grid min-h-64 place-items-center rounded-2xl border border-dashed border-border text-center">
              <div>
                <CircleAlert className="mx-auto size-6 text-muted-foreground" />
                <h3 className="mt-3 font-medium">
                  Benchmark data is unavailable
                </h3>
                <p className="mt-1 max-w-lg text-sm leading-6 text-muted-foreground">
                  Published data coverage is unavailable for this view.
                </p>
              </div>
            </div>
          ) : visibleModels.length === 0 ? (
            <div className="mt-7 grid min-h-64 place-items-center rounded-2xl border border-dashed border-border text-center">
              <div>
                <CircleAlert className="mx-auto size-6 text-muted-foreground" />
                <h3 className="mt-3 font-medium">
                  No published rows match these filters
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
              {viewMode === "list" ? (
                <ModelTable
                  {...sharedTableProps}
                  onSort={selectSort}
                  sortDirection={sortDirection}
                  sortKey={sortKey}
                />
              ) : null}
              <ModelCards
                className={viewMode === "cards" ? "grid gap-3 md:grid-cols-2 xl:grid-cols-3" : "grid gap-3 md:hidden"}
                props={sharedTableProps}
              />
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
                Quality and evaluation cost
              </p>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                The independent selector below changes only the insight axis.
                Both charts use every published row and its published
                evaluation cost; selected-route prices never fill an
                unavailable benchmark value.
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
              <div className="flex min-w-max flex-nowrap gap-2 px-1">
                {POPULAR_MODELS_CATEGORY_CONTROL_SLOTS.map((category) => (
                  <button
                    aria-pressed={insightCategoryKey === category.key}
                    className={cn(
                      "popular-models-category-tag shrink-0 whitespace-nowrap",
                      insightCategoryKey === category.key
                        ? "border-active-control bg-active-control text-active-control-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground",
                    )}
                    key={category.label}
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
                    {insightCategoryLabel} versus evaluation cost
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    A published-data Pareto frontier is traced across
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
                    Ranks only rows with published cost per successful
                    evaluation. Mean output and published Pareto data remain
                    explicit.
                  </p>
                </div>
                <PopularModelsAggregateCostRankingChart
                  models={viewModel.models}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="popular-models-comparison-heading"
        className="border-b border-border px-5 py-14 sm:px-8 sm:py-16 lg:px-10"
        id="popular-models-comparison"
      >
        <div className="mx-auto max-w-7xl">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
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
                <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                  The tray preserves selection order in this URL as canonical
                  catalog IDs. Legacy catalog slugs are normalized before
                  navigation so the comparison route receives the IDs it accepts.
                </p>
              </div>
              <div className="max-w-full shrink-0">
                <ResultActions
                  filename="tokenbench-popular-models-comparison"
                  label="Share and export popular model comparison"
                  rows={csvRows(selectedModels, viewModel, metricColumns)}
                  targetId="popular-models-comparison"
                />
              </div>
            </div>
            <Card className="mt-7">
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
                            href={`/model-profile?model=${encodeURIComponent(model.slug)}`}
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
                      Unavailable: no published models are available to start a
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
  );
}
