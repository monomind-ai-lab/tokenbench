import type { BenchmarkPriceCheck } from './contracts';

export const WORKLOAD_PROFILES = {
  inputHeavy: { inputShare: 0.90, outputShare: 0.10 },
  balanced: { inputShare: 0.75, outputShare: 0.25 },
  outputHeavy: { inputShare: 0.50, outputShare: 0.50 },
} as const;

export type WorkloadProfile = keyof typeof WORKLOAD_PROFILES;

/** Maximum blended USD per million tokens for the disclosed budget filters. */
export const BUDGET_BANDS = [0.5, 1, 5, 10] as const;

export const LONG_CONTEXT_SCENARIOS = [
  { inputTokens: 32_000, outputTokens: 2_000 },
  { inputTokens: 128_000, outputTokens: 2_000 },
  { inputTokens: 1_000_000, outputTokens: 2_000 },
] as const;

export interface PrimaryHostedPrice {
  readonly price: BenchmarkPriceCheck;
  readonly routeId: string;
  readonly blendedCostPerMillion: number;
}

export interface ValueCandidate {
  readonly modelKey: string;
  readonly slug: string;
  readonly score: number;
  readonly blendedCostPerMillion: number;
}

export interface LongContextExample {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly available: boolean;
  readonly costUsd: number | null;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function requireNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
  if (value < 0) throw new RangeError(`${label} must be non-negative`);
}

function nullableBlendedCost(price: BenchmarkPriceCheck, profile: WorkloadProfile): number | null {
  if (!isNonNegativeFinite(price.inputUsdPerMillion) || !isNonNegativeFinite(price.outputUsdPerMillion)) return null;
  return blendedCostPerMillion(price.inputUsdPerMillion, price.outputUsdPerMillion, profile);
}

export function isWorkloadProfile(value: unknown): value is WorkloadProfile {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(WORKLOAD_PROFILES, value);
}

/**
 * Calculates a disclosed workload mix. It intentionally has no benchmark
 * score term, so callers cannot turn it into an opaque universal value score.
 */
export function blendedCostPerMillion(
  inputUsdPerMillion: number,
  outputUsdPerMillion: number,
  profile: WorkloadProfile,
): number {
  requireNonNegativeFinite(inputUsdPerMillion, 'inputUsdPerMillion');
  requireNonNegativeFinite(outputUsdPerMillion, 'outputUsdPerMillion');
  if (!isWorkloadProfile(profile)) throw new RangeError('profile must be a supported workload profile');

  const shares = WORKLOAD_PROFILES[profile];
  return inputUsdPerMillion * shares.inputShare + outputUsdPerMillion * shares.outputShare;
}

/**
 * A cost-derived calculation can only use an explicit, primary OpenRouter
 * route. A zero on a self-hosted or corroborating source is evidence, but not
 * proof of a hosted API route.
 */
export function isPrimaryHostedRoute(price: BenchmarkPriceCheck): boolean {
  return price.sourceId === 'openrouter'
    && price.verificationStatus === 'primary'
    && typeof price.routeId === 'string'
    && price.routeId.trim().length > 0
    && typeof price.providerId === 'string'
    && price.providerId.trim().length > 0;
}

/**
 * Returns exact model-key route evidence ordered by usable blended cost, then
 * route identity. The caller's array is never mutated.
 */
export function primaryHostedRoutesForModel(
  modelKey: string,
  prices: readonly BenchmarkPriceCheck[],
  profile: WorkloadProfile,
): readonly BenchmarkPriceCheck[] {
  if (!isWorkloadProfile(profile)) throw new RangeError('profile must be a supported workload profile');

  return prices
    .filter((price) => price.modelKey === modelKey && isPrimaryHostedRoute(price))
    .slice()
    .sort((left, right) => {
      const leftCost = nullableBlendedCost(left, profile);
      const rightCost = nullableBlendedCost(right, profile);
      const leftSortCost = leftCost ?? Number.POSITIVE_INFINITY;
      const rightSortCost = rightCost ?? Number.POSITIVE_INFINITY;
      if (leftSortCost !== rightSortCost) return leftSortCost - rightSortCost;
      const providerOrder = compareText(left.providerId, right.providerId);
      if (providerOrder !== 0) return providerOrder;
      return compareText(left.routeId, right.routeId);
    });
}

/** Returns the lowest-cost exact hosted route only when both price sides exist. */
export function primaryHostedPriceForModel(
  modelKey: string,
  prices: readonly BenchmarkPriceCheck[],
  profile: WorkloadProfile,
): PrimaryHostedPrice | null {
  for (const price of primaryHostedRoutesForModel(modelKey, prices, profile)) {
    const cost = nullableBlendedCost(price, profile);
    if (cost !== null) {
      return {
        price,
        routeId: price.routeId,
        blendedCostPerMillion: cost,
      };
    }
  }
  return null;
}

export function isWithinBudget(costPerMillion: number | null, maximumCostPerMillion: number): boolean {
  return isNonNegativeFinite(costPerMillion)
    && isNonNegativeFinite(maximumCostPerMillion)
    && costPerMillion <= maximumCostPerMillion;
}

function isUsableCandidate(candidate: ValueCandidate): boolean {
  return typeof candidate.modelKey === 'string'
    && candidate.modelKey.length > 0
    && typeof candidate.slug === 'string'
    && candidate.slug.length > 0
    && Number.isFinite(candidate.score)
    && isNonNegativeFinite(candidate.blendedCostPerMillion);
}

function dominates(left: ValueCandidate, right: ValueCandidate): boolean {
  return left.score >= right.score
    && left.blendedCostPerMillion <= right.blendedCostPerMillion
    && (left.score > right.score || left.blendedCostPerMillion < right.blendedCostPerMillion);
}

/**
 * Pareto membership maximizes capability and minimizes disclosed hosted cost.
 * Equal trade-offs remain visible and have a canonical-slug fallback order.
 */
export function paretoFrontier(candidates: readonly ValueCandidate[]): readonly ValueCandidate[] {
  const usable = candidates.filter(isUsableCandidate);
  return usable
    .filter((candidate) => !usable.some((other) => other !== candidate && dominates(other, candidate)))
    .slice()
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score;
      if (left.blendedCostPerMillion !== right.blendedCostPerMillion) {
        return left.blendedCostPerMillion - right.blendedCostPerMillion;
      }
      const slugOrder = compareText(left.slug, right.slug);
      return slugOrder !== 0 ? slugOrder : compareText(left.modelKey, right.modelKey);
    });
}

function isUsableContextWindow(contextWindowTokens: number | null): contextWindowTokens is number {
  return Number.isSafeInteger(contextWindowTokens) && contextWindowTokens > 0;
}

/**
 * Keeps every disclosed long-context scenario visible. A scenario that cannot
 * fit the declared window (or lacks hosted pricing) is explicitly null rather
 * than silently priced as zero.
 */
export function longContextExamples(
  hostedPrice: PrimaryHostedPrice | null,
  contextWindowTokens: number | null,
): readonly LongContextExample[] {
  return LONG_CONTEXT_SCENARIOS.map((scenario) => {
    const totalTokens = scenario.inputTokens + scenario.outputTokens;
    const canFit = isUsableContextWindow(contextWindowTokens) && contextWindowTokens >= totalTokens;
    if (!hostedPrice || !canFit) {
      return {
        ...scenario,
        totalTokens,
        available: false,
        costUsd: null,
      };
    }

    const inputPrice = hostedPrice.price.inputUsdPerMillion;
    const outputPrice = hostedPrice.price.outputUsdPerMillion;
    if (!isNonNegativeFinite(inputPrice) || !isNonNegativeFinite(outputPrice)) {
      return {
        ...scenario,
        totalTokens,
        available: false,
        costUsd: null,
      };
    }

    const costUsd = scenario.inputTokens / 1_000_000 * inputPrice
      + scenario.outputTokens / 1_000_000 * outputPrice;
    return {
      ...scenario,
      totalTokens,
      available: Number.isFinite(costUsd),
      costUsd: Number.isFinite(costUsd) ? costUsd : null,
    };
  });
}
