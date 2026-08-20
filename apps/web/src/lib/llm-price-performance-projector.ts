import {
  filterPricePerformancePoints,
  markParetoFrontier,
  priceForBasis,
  type PricePerformancePointView,
} from "@tokenbench/benchmarks/price-performance";
import type {
  PricePerformanceEnvelope,
  PricePerformancePoint,
} from "@tokenbench/benchmarks/price-performance-contracts";
import {
  DEFAULT_PRICE_PERFORMANCE_STATE,
  decodePricePerformanceState,
  normalizePricePerformanceState,
  pricePerformanceFilters,
  type PricePerformanceState,
} from "@tokenbench/frontend/price-performance-state";

export interface LlmPricePerformanceProjection {
  readonly displayedCosts: readonly number[];
  readonly points: readonly PricePerformancePointView[];
  readonly state: PricePerformanceState;
  readonly summary: readonly PricePerformancePointView[];
}

const utf8Encoder = new TextEncoder();

function compareModelKeys(left: string, right: string): number {
  const leftBytes = utf8Encoder.encode(left);
  const rightBytes = utf8Encoder.encode(right);
  const sharedLength = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < sharedLength; index += 1) {
    if (leftBytes[index] !== rightBytes[index])
      return leftBytes[index]! - rightBytes[index]!;
  }
  return leftBytes.length - rightBytes.length;
}

function sameState(
  left: PricePerformanceState,
  right: PricePerformanceState,
): boolean {
  return (
    left.lane === right.lane &&
    left.costBasis === right.costBasis &&
    left.creator === right.creator &&
    left.sourceType === right.sourceType &&
    left.priceBand?.[0] === right.priceBand?.[0] &&
    left.priceBand?.[1] === right.priceBand?.[1] &&
    left.evidenceStatus === right.evidenceStatus &&
    left.variants === right.variants &&
    left.status === right.status &&
    left.scale === right.scale
  );
}

function summaryPoints(
  points: readonly PricePerformancePointView[],
): readonly PricePerformancePointView[] {
  if (points.length <= 10)
    return [...points].sort((left, right) =>
      compareModelKeys(left.modelKey, right.modelKey),
    );

  const lowestCostHalf = [...points]
    .sort(
      (left, right) =>
        left.selectedCost - right.selectedCost ||
        compareModelKeys(left.modelKey, right.modelKey),
    )
    .slice(0, Math.max(1, Math.ceil(points.length / 2)));

  return lowestCostHalf
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.selectedCost - right.selectedCost ||
        compareModelKeys(left.modelKey, right.modelKey),
    )
    .slice(0, 10);
}

function viewsFor(
  envelope: PricePerformanceEnvelope,
  state: PricePerformanceState,
): readonly PricePerformancePointView[] {
  const filtered = filterPricePerformancePoints(
    envelope.data.points,
    pricePerformanceFilters(state),
  );
  return markParetoFrontier(filtered, {
    costBasis: state.costBasis,
    lane: state.lane,
  });
}

/**
 * Projects only the validated price-performance envelope. Scores or costs that
 * are absent never enter this result; a published zero cost stays zero and the
 * upstream projector keeps its score-per-dollar value unavailable.
 */
export function projectLlmPricePerformance(
  envelope: PricePerformanceEnvelope,
  candidate: PricePerformanceState,
): LlmPricePerformanceProjection {
  const capabilities = envelope.data.capabilities;
  const firstState = normalizePricePerformanceState(candidate, capabilities, [1]);
  const firstViews = viewsFor(envelope, firstState);
  const state = normalizePricePerformanceState(
    firstState,
    capabilities,
    firstViews.map((point) => point.selectedCost),
  );
  const points = sameState(firstState, state)
    ? firstViews
    : viewsFor(envelope, state);

  return {
    displayedCosts: points.map((point) => point.selectedCost),
    points,
    state,
    summary: summaryPoints(points),
  };
}

/** Decode URL state twice so logarithmic scale is accepted only for its rows. */
export function decodeLlmPricePerformanceState(
  envelope: PricePerformanceEnvelope,
  search: string | URLSearchParams,
): PricePerformanceState {
  const first = decodePricePerformanceState(
    search,
    envelope.data.capabilities,
    [1],
  ).state;
  const firstProjection = projectLlmPricePerformance(envelope, first);
  return decodePricePerformanceState(
    search,
    envelope.data.capabilities,
    firstProjection.displayedCosts,
  ).state;
}

export function llmPricePerformancePriceDomain(
  points: readonly PricePerformancePoint[],
  state: PricePerformanceState,
): readonly number[] {
  return [
    ...new Set(
      points
        .map((point) => priceForBasis(point.route, state.costBasis))
        .filter(
          (cost): cost is number =>
            cost !== null && Number.isFinite(cost) && cost >= 0,
        ),
    ),
  ].sort((left, right) => left - right);
}

export function llmPricePerformanceLaneLabel(value: string): string {
  return value
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export const llmPricePerformanceDefaultState =
  DEFAULT_PRICE_PERFORMANCE_STATE;
