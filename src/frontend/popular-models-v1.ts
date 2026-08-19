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
  | PopularModelsRoutePricingV1Available
  | PopularModelsRoutePricingV1Unavailable;

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

function valueOrNull<T>(evidence: EvidenceValue<T>): T | null {
  return evidence.availability === "available" ? evidence.value : null;
}

function reasonOrNull<T>(evidence: EvidenceValue<T>): string | null {
  return evidence.availability === "unavailable" ? evidence.reason : null;
}

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function mapEvidenceNumber(evidence: EvidenceValue<number>): PopularModelsEvidenceNumberV1 {
  return { value: valueOrNull(evidence), unavailableReason: reasonOrNull(evidence) };
}

function mapTaskEconomics(task: RankingTaskEconomics): PopularModelsTaskEconomicsV1 {
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
    costPerSuccessfulEvaluationUsd: mapEvidenceNumber(task.costPerSuccessfulEvaluationUsd),
    meanInputTokens: mapEvidenceNumber(task.meanInputTokens),
    meanOutputTokens: mapEvidenceNumber(task.meanOutputTokens),
  };
}

function mapRoutePricing(evidence: EvidenceValue<RoutePricing>): PopularModelsRoutePricingV1 {
  const pricing = valueOrNull(evidence);
  if (!pricing) return { availability: "unavailable", reason: reasonOrNull(evidence) ?? "Selected-route pricing is unavailable." };

  const inputUsdPerMillion = finiteOrNull(pricing.inputUsdPerMillion);
  const outputUsdPerMillion = finiteOrNull(pricing.outputUsdPerMillion);
  const contextWindowTokens = valueOrNull(pricing.contextWindowTokens);
  const maxOutputTokens = valueOrNull(pricing.maxOutputTokens);

  return {
    availability: "available",
    route: pricing.route,
    inputUsdPerMillion,
    outputUsdPerMillion,
    blendedUsdPerMillion: inputUsdPerMillion === null || outputUsdPerMillion === null
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
  const sourceRank = entry.sourceRank === undefined ? null : finiteOrNull(entry.sourceRank);
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
    overallScore: capability === null ? null : finiteOrNull(capability.compositeScore),
    capabilityUnavailableReason: reasonOrNull(model.capability),
    axes: capability?.radar.map((axis) => ({
      key: axis.key,
      label: axis.label,
      percentile: axis.percentile,
      rank: axis.rank,
      fieldSize: axis.fieldSize,
    })) ?? [],
    subtasks: benchmark?.subtasks ?? [],
    benchmarkUnavailableReason: reasonOrNull(model.benchmark),
    aggregate: entry.aggregate === undefined ? null : {
      costPerSuccessfulEvaluationUsd: mapEvidenceNumber(entry.aggregate.costPerSuccessfulEvaluationUsd),
      meanOutputTokens: mapEvidenceNumber(entry.aggregate.meanOutputTokens),
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
    return left.model.rank - right.model.rank || left.sourceIndex - right.sourceIndex;
  }
  if (left.model.rank !== null) return -1;
  if (right.model.rank !== null) return 1;
  return left.sourceIndex - right.sourceIndex;
}

function sourceCategories(models: readonly PopularModelV1[]): readonly PopularModelsCategoryV1[] {
  const categories = new Map<string, PopularModelsCategoryV1>();
  for (const model of models) {
    for (const axis of model.axes) {
      if (!categories.has(axis.key)) categories.set(axis.key, { key: axis.key, label: axis.label });
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
      unavailableReason: loaderError ?? envelope?.reason ?? "No verified Popular Models ranking is available.",
      fetchedAt: envelope?.fetchedAt ?? null,
      effectiveAt: envelope?.effectiveAt ?? null,
      provenance: envelope?.provenance ?? [],
      release: null,
      taxonomy: [],
      total: null,
      totalUnavailableReason: "No strict v1 ranking receipt is available.",
      pagination: { availability: "unavailable", reason: "No strict v1 ranking receipt is available." },
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
    totalUnavailableReason: envelope.data.total === undefined ? "The strict v1 ranking receipt did not publish a total row count." : null,
    pagination: envelope.data.nextCursor === undefined
      ? { availability: "unavailable", reason: "The strict v1 ranking receipt did not publish pagination state." }
      : { availability: "available", nextCursor: envelope.data.nextCursor },
    categories: sourceCategories(models),
    models,
  };
}

/** Returns the selected source category percentile, leaving missing evidence null. */
export function popularModelsMetricValue(model: PopularModelV1, categoryKey: string | null): number | null {
  if (categoryKey === null) return model.overallScore;
  return model.axes.find((axis) => axis.key === categoryKey)?.percentile ?? null;
}
