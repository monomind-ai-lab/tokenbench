import type {
  EvidenceValue,
  PreviewModel,
  SubscriptionCalculation,
  SubscriptionData,
  UiDataContractV1,
} from "@tokenbench/frontend/preview-data/contracts";

import type { HomeDataMode, HomeDataSnapshot, HomeOperationSnapshot } from "@/lib/home-data";

export type HomeModel = Readonly<{
  id: string;
  name: string | null;
  provider: string | null;
  access: string | null;
  capabilityScore: number | null;
  radar: readonly HomeRadarAxis[];
  inputUsdPerMillion: number | null;
  outputUsdPerMillion: number | null;
  blendedUsdPerMillion: number | null;
  contextWindowTokens: number | null;
  ttftP50Seconds: number | null;
  outputTokensPerSecond: number | null;
  color: string;
}>;

export type HomeRadarAxis = Readonly<{
  key: string;
  label: string;
  percentile: number | null;
}>;

export type HomeRankingRow = Readonly<{
  model: HomeModel;
  rank: number | null;
}>;

export type HomeSubscriptionPoint = Readonly<{
  tokens: number;
  apiUsd: number;
  monthlySubscriptionUsd: number;
}>;

export type HomeSubscription = Readonly<{
  planName: string | null;
  monthlySubscriptionUsd: number | null;
  selectedVolumeApiUsd: number | null;
  crossoverTokens: number | null;
  points: readonly HomeSubscriptionPoint[];
  initialPointIndex: number;
  message: string | null;
}>;

export type HomePageData = Readonly<{
  mode: HomeDataMode;
  updatedAt: string | null;
  models: readonly HomeModel[];
  modelMessage: string | null;
  snapshot: readonly HomeRankingRow[];
  popular: readonly HomeRankingRow[];
  rankingMessage: string | null;
  comparison: readonly HomeModel[];
  comparisonMessage: string | null;
  subscription: HomeSubscription;
}>;

function available<T>(evidence: EvidenceValue<T>): T | null {
  return evidence.availability === "available" ? evidence.value : null;
}

function optionalAvailable<T>(evidence: EvidenceValue<T> | undefined): T | null {
  return evidence?.availability === "available" ? evidence.value : null;
}

function finite(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) ? value : null;
}

/** A deterministic visual treatment, never an evidence claim. */
export function homeModelColor(id: string): string {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(hash) % 360} 58% 51%)`;
}

export function projectHomeModel(model: PreviewModel): HomeModel {
  const identity = available(model.identity);
  const route = available(model.routePricing);
  const capability = available(model.capability);
  const runtime = available(model.runtime);

  return {
    id: model.id,
    name: identity?.name ?? null,
    provider: identity?.provider ?? null,
    access: available(model.access),
    capabilityScore: finite(capability?.compositeScore),
    radar: capability?.radar.map((axis) => ({
      key: axis.key,
      label: axis.label,
      percentile: finite(axis.percentile),
    })) ?? [],
    inputUsdPerMillion: finite(route?.inputUsdPerMillion),
    outputUsdPerMillion: finite(route?.outputUsdPerMillion),
    blendedUsdPerMillion: finite(optionalAvailable(route?.blendedUsdPerMillion)),
    contextWindowTokens: finite(optionalAvailable(route?.contextWindowTokens)),
    ttftP50Seconds: finite(runtime?.ttftP50Seconds),
    outputTokensPerSecond: finite(runtime?.outputTokensPerSecond),
    color: homeModelColor(model.id),
  };
}

function operationMessage<T>(operation: HomeOperationSnapshot<T>, fallback: string): string | null {
  if (operation.envelope === null) return operation.error ?? fallback;
  if (operation.envelope.data === null) return operation.envelope.reason ?? fallback;
  return null;
}

function projectSubscription(calculation: SubscriptionCalculation): HomeSubscriptionPoint[] {
  const domain = calculation.domain
    .map((point) => ({
      tokens: finite(point.tokens),
      apiUsd: finite(point.apiUsd),
      monthlySubscriptionUsd: finite(point.monthlySubscriptionUsd),
    }))
    .filter((point): point is HomeSubscriptionPoint => point.tokens !== null && point.apiUsd !== null && point.monthlySubscriptionUsd !== null);
  if (domain.length > 0) return domain;

  const tokens = finite(calculation.request.crossoverTokenVolume);
  const apiUsd = finite(calculation.selectedVolumeApiUsd);
  const monthlySubscriptionUsd = finite(calculation.monthlySubscriptionUsd);
  return tokens === null || apiUsd === null || monthlySubscriptionUsd === null
    ? []
    : [{ tokens, apiUsd, monthlySubscriptionUsd }];
}

function projectHomeSubscription(
  operation: HomeOperationSnapshot<SubscriptionData>,
): HomeSubscription {
  const data = operation.envelope?.data;
  const calculationEvidence = data?.calculation;
  const calculation = calculationEvidence === undefined ? null : available(calculationEvidence);
  const plan = calculation === null
    ? null
    : data?.plans.find((candidate) => candidate.id === calculation.request.planId) ?? null;
  const points = calculation === null ? [] : projectSubscription(calculation);
  const requestedTokens = calculation?.request.crossoverTokenVolume ?? null;
  const initialPointIndex = Math.max(0, points.findIndex((point) => point.tokens === requestedTokens));

  return {
    planName: plan === null ? null : available(plan.displayName),
    monthlySubscriptionUsd: finite(calculation?.monthlySubscriptionUsd),
    selectedVolumeApiUsd: finite(calculation?.selectedVolumeApiUsd),
    crossoverTokens: finite(calculation?.crossoverTokens),
    points,
    initialPointIndex,
    message: calculation === null
      ? calculationEvidence?.availability === "unavailable"
        ? calculationEvidence.reason
        : operationMessage(operation, "No accepted subscription calculation is available.")
      : null,
  };
}

function updatedAt(snapshot: HomeDataSnapshot): string | null {
  const envelopes: readonly (UiDataContractV1<unknown> | null)[] = [
    snapshot.rankings.envelope,
    snapshot.models.envelope,
    snapshot.comparison.envelope,
    snapshot.subscription.envelope,
  ];
  return envelopes.find((envelope) => envelope !== null && envelope.effectiveAt !== null)?.effectiveAt ?? null;
}

export function projectHomeData(snapshot: HomeDataSnapshot): HomePageData {
  const models = (snapshot.models.envelope?.data?.models ?? []).map(projectHomeModel);
  const ranked = (snapshot.rankings.envelope?.data?.models ?? []).map((entry) => ({
    model: projectHomeModel(entry.model),
    rank: available(entry.rank),
  }));
  const comparison = (snapshot.comparison.envelope?.data?.models ?? []).map(projectHomeModel);

  return {
    mode: snapshot.mode,
    updatedAt: updatedAt(snapshot),
    models,
    modelMessage: operationMessage(snapshot.models, "No accepted model records are available."),
    snapshot: ranked.slice(0, 3),
    popular: ranked.slice(0, 4),
    rankingMessage: operationMessage(snapshot.rankings, "No accepted ranking records are available."),
    comparison,
    comparisonMessage: operationMessage(snapshot.comparison, "No accepted comparison records are available."),
    subscription: projectHomeSubscription(snapshot.subscription),
  };
}
