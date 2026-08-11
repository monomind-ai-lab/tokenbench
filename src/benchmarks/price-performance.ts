import {
  compareUtf8Binary,
  type BenchmarkMetric,
  type BenchmarkModel,
  type BenchmarkPriceCheck,
} from './contracts';
import { isModelSlugRouteSafe } from './model-directory';
import { isNonNegativeFinite } from './value';
import {
  PRICE_PERFORMANCE_COST_BASES,
  PRICE_PERFORMANCE_SCORE_LANES,
  type PricePerformanceCostBasis,
  type PricePerformanceFilters,
  type PricePerformancePoint,
  type PricePerformancePointView,
  type PricePerformanceProjection,
  type PricePerformanceProjectionInput,
  type PricePerformanceRoute,
  type PricePerformanceScoreLane,
  type PricePerformanceSelectionOptions,
  type PricePerformanceStatus,
  type PricePerformanceVariantMode,
} from './price-performance-contracts';

export {
  PRICE_PERFORMANCE_COST_BASES,
  PRICE_PERFORMANCE_SCORE_LANES,
};
export type {
  CostBasis,
  PricePerformanceCostBasis,
  PricePerformanceFilters,
  PricePerformanceInput,
  PricePerformancePoint,
  PricePerformancePointView,
  PricePerformanceProjection,
  PricePerformanceProjectionInput,
  PricePerformanceRoute,
  PricePerformanceScoreLane,
  PricePerformanceSelectionOptions,
  PricePerformanceStatus,
  PricePerformanceVariantMode,
  ScoreLane,
} from './price-performance-contracts';

/** The only public BenchLM metric key used for each chart score lane. */
export const PRICE_PERFORMANCE_METRIC_KEYS: Readonly<Record<PricePerformanceScoreLane, string>> = {
  overall: 'benchlm:overall:raw',
  agentic: 'benchlm:category:agentic',
  coding: 'benchlm:category:coding',
  reasoning: 'benchlm:category:reasoning',
  knowledge: 'benchlm:category:knowledge',
  multimodal: 'benchlm:category:multimodalGrounded',
  mathematics: 'benchlm:category:math',
  multilingual: 'benchlm:category:multilingual',
  'instruction-following': 'benchlm:category:instructionFollowing',
};

const NON_RANKED_LANES = new Set<PricePerformanceScoreLane>([
  'reasoning',
  'knowledge',
  'mathematics',
  'multilingual',
  'instruction-following',
]);

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function scoreFor(point: PricePerformancePoint, lane: PricePerformanceScoreLane): number | null {
  const score = point.scores[lane];
  return isNonNegativeFinite(score) ? score : null;
}

function selectedCostFor(point: PricePerformancePoint, basis: PricePerformanceCostBasis): number | null {
  return priceForBasis(point.route, basis);
}

function compareText(left: string, right: string): number {
  return compareUtf8Binary(left, right);
}

function compareNullableDescending(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

function compareNullableAscending(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

function selectionOptions(
  options: PricePerformanceSelectionOptions
    | PricePerformanceScoreLane
    | PricePerformanceCostBasis
    | undefined,
): Required<PricePerformanceSelectionOptions> {
  if (typeof options === 'string') {
    return PRICE_PERFORMANCE_SCORE_LANES.includes(options as PricePerformanceScoreLane)
      ? { lane: options as PricePerformanceScoreLane, costBasis: 'output' }
      : { lane: 'overall', costBasis: options as PricePerformanceCostBasis };
  }
  return {
    lane: options?.lane ?? 'overall',
    costBasis: options?.costBasis ?? 'output',
  };
}

function statusFor(
  input: PricePerformanceProjectionInput,
  model: BenchmarkModel,
): PricePerformanceStatus {
  const statusByModelKey = input.statusByModelKey;
  const fromMap = statusByModelKey instanceof Map
    ? statusByModelKey.get(model.modelKey)
    : statusByModelKey?.[model.modelKey];
  if (fromMap === 'current' || fromMap === 'archived') return fromMap;
  const fromDirectory = input.directoryRecords?.find((record) => record.modelKey === model.modelKey)?.status;
  if (fromDirectory === 'current' || fromDirectory === 'archived') return fromDirectory;
  const modelStatus = (model as BenchmarkModel & { readonly status?: unknown }).status;
  return modelStatus === 'archived' ? 'archived' : 'current';
}

function scoreMetricIsEligible(
  model: BenchmarkModel,
  metric: BenchmarkMetric,
  lane: PricePerformanceScoreLane,
  metricKey: string,
): boolean {
  const rankUsable = metric.rankingEligible || (NON_RANKED_LANES.has(lane) && metric.rank === null);
  return model.sourceId === 'benchlm'
    && model.evidenceStatus === 'supported'
    && (lane !== 'overall' || model.rankingEligible)
    && metric.modelKey === model.modelKey
    && metric.sourceId === 'benchlm'
    && metric.metricKey === metricKey
    && metric.methodology === 'benchlm_raw_composite'
    && metric.unit === 'score'
    && rankUsable
    && isNonNegativeFinite(metric.value)
    && text(metric.sourceModelId)
    && text(metric.sourceArtifactId);
}

function selectMetric(
  model: BenchmarkModel,
  metrics: readonly BenchmarkMetric[],
  lane: PricePerformanceScoreLane,
): BenchmarkMetric | null {
  const metricKey = PRICE_PERFORMANCE_METRIC_KEYS[lane];
  return metrics
    .filter((metric) => scoreMetricIsEligible(model, metric, lane, metricKey))
    .slice()
    .sort((left, right) => compareText(right.sourceUpdatedAt, left.sourceUpdatedAt)
      || compareText(left.sourceArtifactId, right.sourceArtifactId)
      || compareText(left.sourceModelId, right.sourceModelId))[0] ?? null;
}

function routeIsComplete(model: BenchmarkModel, route: BenchmarkPriceCheck): boolean {
  return route.modelKey === model.modelKey
    && route.verificationStatus === 'primary'
    && text(route.providerId)
    && text(route.routeId)
    && text(route.sourceModelId)
    && text(route.sourceArtifactId)
    && isNonNegativeFinite(route.inputUsdPerMillion)
    && isNonNegativeFinite(route.outputUsdPerMillion)
    && (route.canonicalSlug === null || isModelSlugRouteSafe(route.canonicalSlug));
}

function routePriority(model: BenchmarkModel, route: BenchmarkPriceCheck): number {
  const exactDirectEvidence = route.sourceId === model.sourceId
    && route.sourceModelId === model.sourceModelId
    && (route.canonicalSlug === null || route.canonicalSlug === model.slug);
  if (exactDirectEvidence && route.sourceId !== 'openrouter') return 0;
  if (route.sourceId !== 'openrouter') return 1;
  return 2;
}

function selectRoute(model: BenchmarkModel, prices: readonly BenchmarkPriceCheck[]): PricePerformanceRoute | null {
  const candidate = prices
    .filter((route) => routeIsComplete(model, route))
    .slice()
    .sort((left, right) => routePriority(model, left) - routePriority(model, right)
      || compareText(left.providerId, right.providerId)
      || compareText(left.routeId, right.routeId))[0];
  if (!candidate) return null;
  return {
    sourceId: candidate.sourceId,
    providerId: candidate.providerId,
    routeId: candidate.routeId,
    sourceModelId: candidate.sourceModelId,
    canonicalSlug: candidate.canonicalSlug,
    sourceArtifactId: candidate.sourceArtifactId,
    inputUsdPerMillion: candidate.inputUsdPerMillion,
    cachedInputUsdPerMillion: candidate.cachedInputUsdPerMillion,
    outputUsdPerMillion: candidate.outputUsdPerMillion,
    contextWindowTokens: candidate.contextWindowTokens,
    verificationStatus: candidate.verificationStatus,
    maxInputTokens: candidate.maxInputTokens,
    maxOutputTokens: candidate.maxOutputTokens,
    inputModalities: candidate.inputModalities,
    outputModalities: candidate.outputModalities,
    supportedParameters: candidate.supportedParameters,
  };
}

function modelPoint(
  input: PricePerformanceProjectionInput,
  model: BenchmarkModel,
  metrics: readonly BenchmarkMetric[],
  prices: readonly BenchmarkPriceCheck[],
): PricePerformancePoint | null {
  if (!text(model.modelKey) || !isModelSlugRouteSafe(model.slug) || !text(model.name) || !text(model.creator)) return null;
  const route = selectRoute(model, prices);
  if (!route) return null;
  const scores = {} as Record<PricePerformanceScoreLane, number | null>;
  let scoreCount = 0;
  for (const lane of PRICE_PERFORMANCE_SCORE_LANES) {
    const metric = selectMetric(model, metrics, lane);
    scores[lane] = metric?.value ?? null;
    if (metric) scoreCount += 1;
  }
  if (scoreCount === 0) return null;
  return {
    modelKey: model.modelKey,
    slug: model.slug,
    displayName: model.name,
    creator: model.creator,
    familyId: model.familyId ?? null,
    status: statusFor(input, model),
    sourceType: model.sourceType,
    evidenceStatus: model.evidenceStatus,
    scores,
    route,
  };
}

/** Builds one deterministic, source-backed point for each eligible model. */
export function buildPricePerformanceProjection(
  input: PricePerformanceProjectionInput,
): PricePerformanceProjection {
  const metricsByModel = new Map<string, BenchmarkMetric[]>();
  const pricesByModel = new Map<string, BenchmarkPriceCheck[]>();
  for (const metric of input.metrics) {
    const values = metricsByModel.get(metric.modelKey);
    if (values) values.push(metric);
    else metricsByModel.set(metric.modelKey, [metric]);
  }
  for (const price of input.priceChecks) {
    const values = pricesByModel.get(price.modelKey);
    if (values) values.push(price);
    else pricesByModel.set(price.modelKey, [price]);
  }
  const points = input.models
    .map((model) => modelPoint(input, model, metricsByModel.get(model.modelKey) ?? [], pricesByModel.get(model.modelKey) ?? []))
    .filter((point): point is PricePerformancePoint => point !== null)
    .sort((left, right) => compareText(left.modelKey, right.modelKey));
  return { points };
}

function valuesFor<T>(value: T | readonly T[] | null | undefined): readonly T[] | null {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? value as readonly T[] : [value as T];
}

function priceBandBounds(
  value: PricePerformanceFilters['priceBand'],
): readonly [number | null, number | null] {
  if (Array.isArray(value)) return [value[0] ?? null, value[1] ?? null];
  if (value !== null && value !== undefined) {
    const bounds = value as { readonly min?: number | null; readonly max?: number | null };
    return [bounds.min ?? null, bounds.max ?? null];
  }
  return [null, null];
}

/** Applies normalized decision filters while keeping the caller's array immutable. */
export function filterPricePerformancePoints(
  points: readonly PricePerformancePoint[],
  filters: PricePerformanceFilters = {},
): readonly PricePerformancePoint[] {
  const lane = filters.lane ?? 'overall';
  const costBasis = filters.costBasis ?? 'output';
  const creators = valuesFor(filters.creator);
  const sourceTypes = valuesFor(filters.sourceType);
  const evidenceStatuses = valuesFor(filters.evidenceStatus);
  const statuses = valuesFor(filters.status ?? 'current');
  const [minimumCost, maximumCost] = priceBandBounds(filters.priceBand);
  const filtered = points.filter((point) => {
    const score = scoreFor(point, lane);
    const cost = selectedCostFor(point, costBasis);
    return score !== null
      && cost !== null
      && (creators === null || creators.includes(point.creator))
      && (sourceTypes === null || sourceTypes.includes(point.sourceType))
      && (evidenceStatuses === null || evidenceStatuses.includes(point.evidenceStatus))
      && (statuses === null || statuses.includes(point.status))
      && (minimumCost === null || (isNonNegativeFinite(minimumCost) && cost >= minimumCost))
      && (maximumCost === null || (isNonNegativeFinite(maximumCost) && cost <= maximumCost));
  });
  return filters.variants !== 'all-variants'
    ? oneRepresentativePerFamily(filtered, { lane, costBasis })
    : filtered.slice();
}

function candidateOrder(
  left: PricePerformancePoint,
  right: PricePerformancePoint,
  lane: PricePerformanceScoreLane,
  costBasis: PricePerformanceCostBasis,
): number {
  const scoreOrder = compareNullableDescending(scoreFor(left, lane), scoreFor(right, lane));
  if (scoreOrder !== 0) return scoreOrder;
  const costOrder = compareNullableAscending(selectedCostFor(left, costBasis), selectedCostFor(right, costBasis));
  if (costOrder !== 0) return costOrder;
  return compareText(left.modelKey, right.modelKey);
}

/** Selects deterministic model-family representatives without mutating input. */
export function oneRepresentativePerFamily(
  points: readonly PricePerformancePoint[],
  options: PricePerformanceSelectionOptions | PricePerformanceScoreLane | PricePerformanceCostBasis = {},
): readonly PricePerformancePoint[] {
  const { lane, costBasis } = selectionOptions(options);
  const representatives = new Map<string, PricePerformancePoint>();
  for (const point of points) {
    const familyKey = point.familyId === null
      ? `model\u0000${point.modelKey}`
      : `family\u0000${point.familyId}`;
    const current = representatives.get(familyKey);
    if (!current || candidateOrder(point, current, lane, costBasis) < 0) representatives.set(familyKey, point);
  }
  return [...representatives.values()].sort((left, right) => candidateOrder(left, right, lane, costBasis));
}

function viewFor(
  point: PricePerformancePoint,
  lane: PricePerformanceScoreLane,
  costBasis: PricePerformanceCostBasis,
  frontier: boolean,
): PricePerformancePointView | null {
  const score = scoreFor(point, lane);
  const selectedCost = selectedCostFor(point, costBasis);
  if (score === null || selectedCost === null) return null;
  const scorePerDollar = selectedCost === 0 ? null : score / selectedCost;
  return {
    ...point,
    scoreLane: lane,
    costBasis,
    score,
    selectedCost,
    scorePerDollar: Number.isFinite(scorePerDollar) ? scorePerDollar : null,
    frontier,
  };
}

/** Marks all exact score/cost ties together on a deterministic Pareto frontier. */
export function markParetoFrontier(
  points: readonly PricePerformancePoint[],
  options: PricePerformanceSelectionOptions | PricePerformanceScoreLane | PricePerformanceCostBasis = {},
): readonly PricePerformancePointView[] {
  const { lane, costBasis } = selectionOptions(options);
  const ordered = points
    .map((point) => ({ point, score: scoreFor(point, lane), cost: selectedCostFor(point, costBasis) }))
    .filter((entry): entry is { point: PricePerformancePoint; score: number; cost: number } => (
      entry.score !== null && entry.cost !== null
    ))
    .sort((left, right) => left.cost - right.cost || right.score - left.score || compareText(left.point.modelKey, right.point.modelKey));

  const views: PricePerformancePointView[] = [];
  let highestPriorScore = Number.NEGATIVE_INFINITY;
  let index = 0;
  while (index < ordered.length) {
    const groupStart = index;
    const score = ordered[index]!.score;
    const cost = ordered[index]!.cost;
    while (index < ordered.length
      && ordered[index]!.score === score
      && ordered[index]!.cost === cost) index += 1;
    const frontier = score > highestPriorScore;
    for (let groupIndex = groupStart; groupIndex < index; groupIndex += 1) {
      const view = viewFor(ordered[groupIndex]!.point, lane, costBasis, frontier);
      if (view) views.push(view);
    }
    if (score > highestPriorScore) highestPriorScore = score;
  }
  return views;
}

/** Returns the exact output or 3:1 blended USD/M cost for a selected route. */
export function priceForBasis(
  route: PricePerformanceRoute,
  basis: PricePerformanceCostBasis,
): number | null {
  if (!isNonNegativeFinite(route.outputUsdPerMillion)) return null;
  if (basis === 'output') return route.outputUsdPerMillion;
  if (basis !== 'blended-3-1' || !isNonNegativeFinite(route.inputUsdPerMillion)) return null;
  const blended = (3 * route.inputUsdPerMillion + route.outputUsdPerMillion) / 4;
  return Number.isFinite(blended) ? blended : null;
}
