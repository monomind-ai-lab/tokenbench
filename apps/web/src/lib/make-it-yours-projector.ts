import type {
  EvidenceValue,
  PreviewModel,
  RankingData,
  UiDataContractV1,
} from "@tokenbench/frontend/preview-data/contracts";
import {
  WEIGHTED_RANKING_CAPABILITIES,
  type WeightedRankingCapability,
  type WeightedRankingModel,
  type WeightedRankingRow,
} from "@tokenbench/frontend/preview-workbench/weighted-ranking";

export interface MakeItYoursProjectedModel extends WeightedRankingModel {
  readonly inputUsdPerMillion: number;
  readonly outputUsdPerMillion: number;
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
 * The workbench is deliberately strict: a row participates only when the
 * returned candidate facts supply every named axis, raw SLA measurement, and
 * a published blended route cost. A composite score is never used as a stand-in.
 */
function projectModel(model: PreviewModel): MakeItYoursProjectedModel | null {
  const identity = available(model.identity);
  const access = available(model.access);
  const capability = available(model.capability);
  const pricing = available(model.routePricing);
  const runtime = available(model.runtime);
  const lifecycle = available(model.lifecycle);
  const blendedCost = pricing?.blendedUsdPerMillion
    ? available(pricing.blendedUsdPerMillion)
    : null;

  if (
    !identity ||
    !access ||
    !capability ||
    !pricing ||
    !runtime ||
    !finite(blendedCost) ||
    !finite(pricing.inputUsdPerMillion) ||
    !finite(pricing.outputUsdPerMillion) ||
    !finite(runtime.ttftP50Seconds) ||
    !finite(runtime.outputTokensPerSecond)
  ) {
    return null;
  }

  const publishedAxes = new Map(
    capability.radar.map((axis) => [axis.key, axis.percentile]),
  );
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
    cost: blendedCost,
    inputUsdPerMillion: pricing.inputUsdPerMillion,
    outputUsdPerMillion: pricing.outputUsdPerMillion,
    ttft: runtime.ttftP50Seconds,
    throughput: runtime.outputTokensPerSecond,
    lifecycle: lifecycle?.status ?? null,
    scores,
  };
}

export function projectMakeItYoursModels(
  envelope: UiDataContractV1<RankingData> | null,
): MakeItYoursModelProjection {
  const sourceModels = envelope?.data?.models.map((entry) => entry.model) ?? [];
  const models = sourceModels.flatMap((model) => {
    const projected = projectModel(model);
    return projected ? [projected] : [];
  });

  return {
    models,
    unavailableCount: Math.max(0, sourceModels.length - models.length),
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
    "Blended USD / 1M": Number(row.cost.toFixed(2)),
    "TTFT seconds": Number(row.ttft.toFixed(2)),
    "Throughput tok/s": Number(row.throughput.toFixed(0)),
    "SLA result": row.meetsSla ? "Pass" : "Outside threshold",
    "Weighted frontier": row.frontier ? "Yes" : "No",
  }));
}
