import type {
  EvidenceValue,
  RankingEntry,
  RankingData,
  UiDataContractV1,
} from "@tokenbench/frontend/preview-data/contracts";
import { popularModelsCategorySlotKey } from "@tokenbench/frontend/popular-models-v1";
import {
  WEIGHTED_RANKING_CAPABILITIES,
  type WeightedRankingCapability,
  type WeightedRankingModel,
  type WeightedRankingRow,
} from "@tokenbench/frontend/preview-workbench/weighted-ranking";

export interface MakeItYoursProjectedModel extends WeightedRankingModel {
  readonly inputUsdPerMillion: number | null;
  readonly outputUsdPerMillion: number | null;
  readonly lifecycle: string | null;
}

export interface MakeItYoursModelProjection {
  readonly models: readonly MakeItYoursProjectedModel[];
  readonly unavailableCount: number;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function available<T>(value: EvidenceValue<T>): T | null {
  return value.availability === "available" ? value.value : null;
}

/**
 * A row participates only when the published release supplies every named
 * category and aggregate cost per successful evaluation. Runtime is optional
 * and remains a separate, explicitly unobserved SLA field.
 */
function projectModel(entry: RankingEntry): MakeItYoursProjectedModel | null {
  const model = entry.model;
  const identity = available(model.identity);
  const access = available(model.access);
  const capability = available(model.capability);
  const pricing = available(model.routePricing);
  const runtime = available(model.runtime);
  const lifecycle = available(model.lifecycle);
  const evaluationCost = entry.aggregate === undefined
    ? null
    : available(entry.aggregate.costPerSuccessfulEvaluationUsd);

  if (
    !identity ||
    !access ||
    !capability ||
    !finite(evaluationCost)
  ) {
    return null;
  }

  const publishedAxes = new Map<string, number>();
  for (const axis of capability.radar) {
    const slotKey = popularModelsCategorySlotKey(axis.key, axis.label);
    if (slotKey !== null && finite(axis.percentile)) {
      publishedAxes.set(slotKey, axis.percentile);
    }
  }
  const scores = {} as Record<WeightedRankingCapability, number>;
  for (const capabilityKey of WEIGHTED_RANKING_CAPABILITIES) {
    const score = publishedAxes.get(capabilityKey);
    if (!finite(score)) return null;
    scores[capabilityKey] = score;
  }

  return {
    id: model.id,
    name: identity.name,
    provider: identity.provider,
    access,
    cost: evaluationCost,
    inputUsdPerMillion: finite(pricing?.inputUsdPerMillion) ? pricing.inputUsdPerMillion : null,
    outputUsdPerMillion: finite(pricing?.outputUsdPerMillion) ? pricing.outputUsdPerMillion : null,
    ttft: finite(runtime?.ttftP50Seconds) ? runtime.ttftP50Seconds : null,
    throughput: finite(runtime?.outputTokensPerSecond) ? runtime.outputTokensPerSecond : null,
    lifecycle: lifecycle?.status ?? null,
    scores,
  };
}

export function projectMakeItYoursModels(
  envelope: UiDataContractV1<RankingData> | null,
): MakeItYoursModelProjection {
  const sourceEntries = envelope?.data?.models ?? [];
  const models = sourceEntries.flatMap((entry) => {
    const projected = projectModel(entry);
    return projected ? [projected] : [];
  });

  return {
    models,
    unavailableCount: Math.max(0, sourceEntries.length - models.length),
  };
}

export function makeItYoursCsvRows(
  rows: readonly WeightedRankingRow[],
): Array<Record<string, string | number>> {
  return rows.map((row, index) => ({
    "Weighted rank": index + 1,
    Model: row.name,
    Provider: row.provider,
    "Weighted score": Number(row.score.toFixed(1)),
    "Evaluation cost / success USD": Number(row.cost.toFixed(6)),
    "TTFT seconds": row.ttft === null ? "Unavailable" : Number(row.ttft.toFixed(2)),
    "Throughput tok/s": row.throughput === null ? "Unavailable" : Number(row.throughput.toFixed(0)),
    "SLA result": row.meetsSla ? "Pass" : "Outside threshold",
    "Weighted frontier": row.frontier ? "Yes" : "No",
  }));
}
