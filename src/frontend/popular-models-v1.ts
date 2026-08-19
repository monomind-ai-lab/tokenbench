import type {
  BenchmarkSubtask,
  EvidenceValue,
  PreviewModel,
  Provenance,
  RankingEntry,
  RankingData,
  RankingTaxonomyCategory,
  RankingTaskEconomics,
  RoutePricing,
  UiDataContractV1,
} from "./preview-data/contracts";

export interface PopularModelsCategoryV1 {
  readonly key: string;
  readonly label: string;
}

export interface PopularModelsAxisV1 {
  readonly key: string;
  readonly label: string;
  readonly percentile: number | null;
  readonly rank: number | null;
  readonly fieldSize: number | null;
}

export interface PopularModelsRoutePricingV1Available {
  readonly availability: "available";
  readonly route: string;
  readonly inputUsdPerMillion: number | null;
  readonly outputUsdPerMillion: number | null;
  /** A disclosed 50/50 arithmetic view of the published input and output prices. */
  readonly blendedUsdPerMillion: number | null;
  readonly contextWindowTokens: number | null;
  readonly contextWindowUnavailableReason: string | null;
  readonly maxOutputTokens: number | null;
  readonly maxOutputUnavailableReason: string | null;
  readonly inputModalities: readonly string[];
  readonly outputModalities: readonly string[];
}

export interface PopularModelsRoutePricingV1Unavailable {
  readonly availability: "unavailable";
  readonly reason: string;
}

export type PopularModelsRoutePricingV1 =
  PopularModelsRoutePricingV1Available | PopularModelsRoutePricingV1Unavailable;

/** A scalar source measurement that never turns unavailable evidence into zero. */
export interface PopularModelsEvidenceNumberV1 {
  readonly value: number | null;
  readonly unavailableReason: string | null;
}

/** Aggregate economics published alongside a LiveBench leaderboard row, not route pricing. */
export interface PopularModelsAggregateEconomicsV1 {
  readonly costPerSuccessfulEvaluationUsd: PopularModelsEvidenceNumberV1;
  readonly meanOutputTokens: PopularModelsEvidenceNumberV1;
  readonly pareto: boolean;
}

/** Every exact task-level measurement retained by the strict v1 leaderboard response. */
export interface PopularModelsTaskEconomicsV1 {
  readonly taskId: string;
  readonly label: string;
  readonly categoryId: string;
  readonly score: PopularModelsEvidenceNumberV1;
  readonly questionCount: PopularModelsEvidenceNumberV1;
  readonly evaluationCostUsd: PopularModelsEvidenceNumberV1;
  readonly inputPriceUsdPerMillion: PopularModelsEvidenceNumberV1;
  readonly outputPriceUsdPerMillion: PopularModelsEvidenceNumberV1;
  readonly equivalentSuccesses: PopularModelsEvidenceNumberV1;
  readonly costPerSuccessfulEvaluationUsd: PopularModelsEvidenceNumberV1;
  readonly meanInputTokens: PopularModelsEvidenceNumberV1;
  readonly meanOutputTokens: PopularModelsEvidenceNumberV1;
}

export type PopularModelsPaginationV1 =
  | { readonly availability: "available"; readonly nextCursor: string | null }
  | { readonly availability: "unavailable"; readonly reason: string };

export interface PopularModelV1 {
  readonly id: string;
  readonly slug: string | null;
  readonly name: string | null;
  readonly provider: string | null;
  readonly identityUnavailableReason: string | null;
  readonly access: "Proprietary" | "Open weights" | null;
  readonly accessUnavailableReason: string | null;
  readonly rank: number | null;
  readonly rankUnavailableReason: string | null;
  readonly overallScore: number | null;
  readonly capabilityUnavailableReason: string | null;
  readonly axes: readonly PopularModelsAxisV1[];
  readonly subtasks: readonly BenchmarkSubtask[];
  readonly benchmarkUnavailableReason: string | null;
  readonly aggregate: PopularModelsAggregateEconomicsV1 | null;
  readonly taskEconomics: readonly PopularModelsTaskEconomicsV1[];
  readonly taskEconomicsUnavailableReason: string | null;
  readonly runtimeUnavailableReason: string | null;
  readonly routePricing: PopularModelsRoutePricingV1;
}

export interface PopularModelsV1ViewModel {
  readonly sourceStatus: UiDataContractV1<RankingData>["status"];
  readonly unavailableReason: string | null;
  readonly fetchedAt: string | null;
  readonly effectiveAt: string | null;
  readonly provenance: readonly Provenance[];
  readonly release: NonNullable<RankingData["release"]> | null;
  readonly taxonomy: readonly RankingTaxonomyCategory[];
  readonly total: number | null;
  readonly totalUnavailableReason: string | null;
  readonly pagination: PopularModelsPaginationV1;
  readonly categories: readonly PopularModelsCategoryV1[];
  readonly models: readonly PopularModelV1[];
}

export type PopularModelsMetricColumnKeyV1 =
  "overall" | `category:${string}` | `task:${string}:${string}`;

export type PopularModelsSortKeyV1 =
  | "source-rank"
  | "model"
  | "provider"
  | "access"
  | "cost-per-success"
  | "mean-output"
  | "pareto"
  | "route-price"
  | PopularModelsMetricColumnKeyV1;

export type PopularModelsSortDirectionV1 = "asc" | "desc";

export interface PopularModelsLeaderboardColumnV1 {
  readonly key: PopularModelsMetricColumnKeyV1;
  readonly label: string;
  readonly categoryKey: string | null;
  readonly taskId: string | null;
}

export interface PopularModelsFilterV1 {
  readonly openWeightsOnly?: boolean;
  readonly providers?: readonly string[];
  readonly query?: string;
}

function valueOrNull<T>(evidence: EvidenceValue<T>): T | null {
  return evidence.availability === "available" ? evidence.value : null;
}

function reasonOrNull<T>(evidence: EvidenceValue<T>): string | null {
  return evidence.availability === "unavailable" ? evidence.reason : null;
}

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function taskParts(
  key: string,
): { readonly categoryId: string; readonly taskId: string } | null {
  if (!key.startsWith("task:")) return null;
  const [, categoryId, ...taskIdParts] = key.split(":");
  if (!categoryId || taskIdParts.length === 0) return null;
  return { categoryId, taskId: taskIdParts.join(":") };
}

function stringValue(
  model: PopularModelV1,
  key: PopularModelsSortKeyV1,
): string | null {
  if (key === "model") return model.name;
  if (key === "provider") return model.provider;
  if (key === "access") return model.access;
  return null;
}

function mapEvidenceNumber(
  evidence: EvidenceValue<number>,
): PopularModelsEvidenceNumberV1 {
  return {
    value: valueOrNull(evidence),
    unavailableReason: reasonOrNull(evidence),
  };
}

function mapTaskEconomics(
  task: RankingTaskEconomics,
): PopularModelsTaskEconomicsV1 {
  return {
    taskId: task.taskId,
    label: task.label,
    categoryId: task.categoryId,
    score: mapEvidenceNumber(task.score),
    questionCount: mapEvidenceNumber(task.questionCount),
    evaluationCostUsd: mapEvidenceNumber(task.evaluationCostUsd),
    inputPriceUsdPerMillion: mapEvidenceNumber(task.inputPriceUsdPerMillion),
    outputPriceUsdPerMillion: mapEvidenceNumber(task.outputPriceUsdPerMillion),
    equivalentSuccesses: mapEvidenceNumber(task.equivalentSuccesses),
    costPerSuccessfulEvaluationUsd: mapEvidenceNumber(
      task.costPerSuccessfulEvaluationUsd,
    ),
    meanInputTokens: mapEvidenceNumber(task.meanInputTokens),
    meanOutputTokens: mapEvidenceNumber(task.meanOutputTokens),
  };
}

function mapRoutePricing(
  evidence: EvidenceValue<RoutePricing>,
): PopularModelsRoutePricingV1 {
  const pricing = valueOrNull(evidence);
  if (!pricing)
    return {
      availability: "unavailable",
      reason:
        reasonOrNull(evidence) ?? "Selected-route pricing is unavailable.",
    };

  const inputUsdPerMillion = finiteOrNull(pricing.inputUsdPerMillion);
  const outputUsdPerMillion = finiteOrNull(pricing.outputUsdPerMillion);
  const contextWindowTokens = valueOrNull(pricing.contextWindowTokens);
  const maxOutputTokens = valueOrNull(pricing.maxOutputTokens);

  return {
    availability: "available",
    route: pricing.route,
    inputUsdPerMillion,
    outputUsdPerMillion,
    blendedUsdPerMillion:
      inputUsdPerMillion === null || outputUsdPerMillion === null
        ? null
        : (inputUsdPerMillion + outputUsdPerMillion) / 2,
    contextWindowTokens,
    contextWindowUnavailableReason: reasonOrNull(pricing.contextWindowTokens),
    maxOutputTokens,
    maxOutputUnavailableReason: reasonOrNull(pricing.maxOutputTokens),
    inputModalities: pricing.inputModalities,
    outputModalities: pricing.outputModalities,
  };
}

function mapModel(entry: RankingEntry): PopularModelV1 {
  const { model, rank } = entry;
  const identity = valueOrNull(model.identity);
  const capability = valueOrNull(model.capability);
  const benchmark = valueOrNull(model.benchmark);
  const sourceRank =
    entry.sourceRank === undefined ? null : finiteOrNull(entry.sourceRank);
  return {
    id: model.id,
    slug: identity?.slug ?? null,
    name: identity?.name ?? null,
    provider: identity?.provider ?? null,
    identityUnavailableReason: reasonOrNull(model.identity),
    access: valueOrNull(model.access),
    accessUnavailableReason: reasonOrNull(model.access),
    rank: sourceRank ?? valueOrNull(rank),
    rankUnavailableReason: sourceRank === null ? reasonOrNull(rank) : null,
    overallScore:
      capability === null ? null : finiteOrNull(capability.compositeScore),
    capabilityUnavailableReason: reasonOrNull(model.capability),
    axes:
      capability?.radar.map((axis) => ({
        key: axis.key,
        label: axis.label,
        percentile: axis.percentile,
        rank: axis.rank,
        fieldSize: axis.fieldSize,
      })) ?? [],
    subtasks: benchmark?.subtasks ?? [],
    benchmarkUnavailableReason: reasonOrNull(model.benchmark),
    aggregate:
      entry.aggregate === undefined
        ? null
        : {
            costPerSuccessfulEvaluationUsd: mapEvidenceNumber(
              entry.aggregate.costPerSuccessfulEvaluationUsd,
            ),
            meanOutputTokens: mapEvidenceNumber(
              entry.aggregate.meanOutputTokens,
            ),
            pareto: entry.aggregate.pareto,
          },
    taskEconomics: (entry.taskEconomics ?? []).map(mapTaskEconomics),
    taskEconomicsUnavailableReason: reasonOrNull(model.taskEconomics),
    runtimeUnavailableReason: reasonOrNull(model.runtime),
    routePricing: mapRoutePricing(model.routePricing),
  };
}

function comparePublishedRank(
  left: { readonly model: PopularModelV1; readonly sourceIndex: number },
  right: { readonly model: PopularModelV1; readonly sourceIndex: number },
): number {
  if (left.model.rank !== null && right.model.rank !== null) {
    return (
      left.model.rank - right.model.rank || left.sourceIndex - right.sourceIndex
    );
  }
  if (left.model.rank !== null) return -1;
  if (right.model.rank !== null) return 1;
  return left.sourceIndex - right.sourceIndex;
}

function sourceCategories(
  models: readonly PopularModelV1[],
  taxonomy: readonly RankingTaxonomyCategory[],
): readonly PopularModelsCategoryV1[] {
  const categories = new Map<string, PopularModelsCategoryV1>();
  for (const model of models) {
    for (const axis of model.axes) {
      if (!categories.has(axis.key))
        categories.set(axis.key, { key: axis.key, label: axis.label });
    }
  }
  for (const category of taxonomy) {
    if (!categories.has(category.categoryId)) {
      categories.set(category.categoryId, {
        key: category.categoryId,
        label: category.label,
      });
    }
  }
  return [...categories.values()];
}

/**
 * Projects only the strict v1 ranking envelope into the capability workbench.
 * It never substitutes fixture values, applies a popularity cutoff, recomputes
 * ranks, or treats unavailable source facts as zero.
 */
export function projectPopularModelsV1(
  envelope: UiDataContractV1<RankingData> | null,
  loaderError: string | null = null,
): PopularModelsV1ViewModel {
  if (envelope === null || envelope.data === null) {
    return {
      sourceStatus: "unavailable",
      unavailableReason:
        loaderError ??
        envelope?.reason ??
        "No verified Popular Models ranking is available.",
      fetchedAt: envelope?.fetchedAt ?? null,
      effectiveAt: envelope?.effectiveAt ?? null,
      provenance: envelope?.provenance ?? [],
      release: null,
      taxonomy: [],
      total: null,
      totalUnavailableReason: "No strict v1 ranking receipt is available.",
      pagination: {
        availability: "unavailable",
        reason: "No strict v1 ranking receipt is available.",
      },
      categories: [],
      models: [],
    };
  }

  const models = envelope.data.models
    .map((entry, sourceIndex) => ({ model: mapModel(entry), sourceIndex }))
    .sort(comparePublishedRank)
    .map(({ model }) => model);

  return {
    sourceStatus: envelope.status,
    unavailableReason: loaderError ?? envelope.reason ?? null,
    fetchedAt: envelope.fetchedAt,
    effectiveAt: envelope.effectiveAt,
    provenance: envelope.provenance,
    release: envelope.data.release ?? null,
    taxonomy: envelope.data.taxonomy ?? [],
    total: envelope.data.total ?? null,
    totalUnavailableReason:
      envelope.data.total === undefined
        ? "The strict v1 ranking receipt did not publish a total row count."
        : null,
    pagination:
      envelope.data.nextCursor === undefined
        ? {
            availability: "unavailable",
            reason:
              "The strict v1 ranking receipt did not publish pagination state.",
          }
        : { availability: "available", nextCursor: envelope.data.nextCursor },
    categories: sourceCategories(models, envelope.data.taxonomy ?? []),
    models,
  };
}

/** Returns the selected source category percentile, leaving missing evidence null. */
export function popularModelsMetricValue(
  model: PopularModelV1,
  categoryKey: string | null,
): number | null {
  if (categoryKey === null) return model.overallScore;
  return (
    model.axes.find((axis) => axis.key === categoryKey)?.percentile ?? null
  );
}

/** Returns an exact source measurement for a displayed leaderboard column. */
export function popularModelsColumnValue(
  model: PopularModelV1,
  key: PopularModelsSortKeyV1,
): number | null {
  if (key === "source-rank") return model.rank;
  if (key === "cost-per-success")
    return model.aggregate?.costPerSuccessfulEvaluationUsd.value ?? null;
  if (key === "mean-output")
    return model.aggregate?.meanOutputTokens.value ?? null;
  if (key === "pareto")
    return model.aggregate === null ? null : model.aggregate.pareto ? 1 : 0;
  if (key === "route-price") {
    return model.routePricing.availability === "available"
      ? model.routePricing.blendedUsdPerMillion
      : null;
  }
  if (key === "overall") return model.overallScore;
  if (key.startsWith("category:"))
    return popularModelsMetricValue(model, key.slice("category:".length));
  const task = taskParts(key);
  if (task === null) return null;
  return (
    model.taskEconomics.find(
      (item) =>
        item.categoryId === task.categoryId && item.taskId === task.taskId,
    )?.score.value ?? null
  );
}

/**
 * Builds score columns from source-published categories and taxonomy only.
 * Overall shows every published category; a category selection adds its exact
 * published task columns without filling absent task measurements.
 */
export function popularModelsLeaderboardColumns(
  viewModel: Pick<
    PopularModelsV1ViewModel,
    "categories" | "models" | "taxonomy"
  >,
  categoryKey: string | null,
): readonly PopularModelsLeaderboardColumnV1[] {
  if (categoryKey === null) {
    return [
      {
        key: "overall",
        label: "Overall",
        categoryKey: null,
        taskId: null,
      },
      ...viewModel.categories.map((category) => ({
        key: `category:${category.key}` as const,
        label: category.label,
        categoryKey: category.key,
        taskId: null,
      })),
    ];
  }

  const category = viewModel.categories.find(
    (item) => item.key === categoryKey,
  );
  const taskLabels = new Map<string, string>();
  for (const task of viewModel.taxonomy.find(
    (item) => item.categoryId === categoryKey,
  )?.tasks ?? []) {
    taskLabels.set(task.taskId, task.label);
  }
  for (const model of viewModel.models) {
    for (const task of model.taskEconomics) {
      if (task.categoryId === categoryKey && !taskLabels.has(task.taskId))
        taskLabels.set(task.taskId, task.label);
    }
  }
  return [
    {
      key: `category:${categoryKey}`,
      label: category?.label ?? categoryKey,
      categoryKey,
      taskId: null,
    },
    ...[...taskLabels.entries()].map(([taskId, label]) => ({
      key: `task:${categoryKey}:${taskId}` as const,
      label,
      categoryKey,
      taskId,
    })),
  ];
}

/** Filters only on source identity and source access facts. */
export function filterPopularModels(
  models: readonly PopularModelV1[],
  filters: PopularModelsFilterV1,
): readonly PopularModelV1[] {
  const query = filters.query?.trim().toLocaleLowerCase() ?? "";
  const providers = new Set(filters.providers ?? []);
  return models.filter((model) => {
    const searchable = [model.id, model.slug, model.name, model.provider]
      .filter((item): item is string => item !== null)
      .join(" ")
      .toLocaleLowerCase();
    return (
      (!query || searchable.includes(query)) &&
      (providers.size === 0 ||
        (model.provider !== null && providers.has(model.provider))) &&
      (!filters.openWeightsOnly || model.access === "Open weights")
    );
  });
}

/** Sorts row order only; model.rank remains the immutable source-published rank. */
export function sortPopularModels(
  models: readonly PopularModelV1[],
  key: PopularModelsSortKeyV1,
  direction: PopularModelsSortDirectionV1,
): readonly PopularModelV1[] {
  const multiplier = direction === "asc" ? 1 : -1;
  return models
    .map((model, sourceIndex) => ({ model, sourceIndex }))
    .sort((left, right) => {
      const leftText = stringValue(left.model, key);
      const rightText = stringValue(right.model, key);
      if (leftText !== null || rightText !== null) {
        if (leftText === null) return 1;
        if (rightText === null) return -1;
        const result = leftText.localeCompare(rightText, undefined, {
          sensitivity: "base",
        });
        return result === 0
          ? left.sourceIndex - right.sourceIndex
          : result * multiplier;
      }
      const leftValue = popularModelsColumnValue(left.model, key);
      const rightValue = popularModelsColumnValue(right.model, key);
      if (leftValue === null && rightValue === null)
        return left.sourceIndex - right.sourceIndex;
      if (leftValue === null) return 1;
      if (rightValue === null) return -1;
      const result = leftValue - rightValue;
      return result === 0
        ? left.sourceIndex - right.sourceIndex
        : result * multiplier;
    })
    .map(({ model }) => model);
}

export function popularModelsDefaultSortDirection(
  key: PopularModelsSortKeyV1,
): PopularModelsSortDirectionV1 {
  return key === "source-rank" ||
    key === "cost-per-success" ||
    key === "mean-output" ||
    key === "route-price" ||
    key === "model" ||
    key === "provider" ||
    key === "access"
    ? "asc"
    : "desc";
}

/** Highest source score winners for a category. Missing values are never treated as zero. */
export function popularModelsCategoryWinnerIds(
  models: readonly PopularModelV1[],
  categoryKey: string | null,
  limit = 5,
): ReadonlySet<string> {
  const key: PopularModelsMetricColumnKeyV1 =
    categoryKey === null ? "overall" : `category:${categoryKey}`;
  return popularModelsColumnWinnerIds(models, key, limit, "desc");
}

/** Source-measurement winner marks for any score/task/economic column. */
export function popularModelsColumnWinnerIds(
  models: readonly PopularModelV1[],
  key: PopularModelsSortKeyV1,
  limit = 5,
  direction: PopularModelsSortDirectionV1 = "desc",
): ReadonlySet<string> {
  return new Set(
    sortPopularModels(
      models.filter((model) => popularModelsColumnValue(model, key) !== null),
      key,
      direction,
    )
      .slice(0, Math.max(limit, 0))
      .map((model) => model.id),
  );
}

function defaultComparisonIds(models: readonly PopularModelV1[]): string[] {
  return models
    .filter((model) => model.slug !== null)
    .slice(0, 2)
    .map((model) => model.id);
}

/**
 * Retains a click/URL order of two to four routeable source identities. IDs
 * are canonical because /compare accepts catalog IDs. Legacy source slugs are
 * mapped to their IDs so a changed id/slug pair never silently drops a model.
 */
export function normalizePopularModelsComparisonIds(
  models: readonly PopularModelV1[],
  candidates: readonly string[],
): readonly string[] {
  const normalized: string[] = [];
  for (const candidate of candidates) {
    const model = models.find(
      (item) => item.id === candidate || item.slug === candidate,
    );
    if (
      model === undefined ||
      model.slug === null ||
      normalized.includes(model.id)
    )
      continue;
    normalized.push(model.id);
    if (normalized.length === 4) break;
  }
  return normalized.length >= 2 ? normalized : defaultComparisonIds(models);
}
