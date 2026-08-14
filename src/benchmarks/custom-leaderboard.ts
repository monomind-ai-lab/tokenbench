export const CUSTOM_DOMAINS = ['agentic', 'coding', 'reasoning', 'math', 'multimodal', 'throughput'] as const;

export type CustomDomain = typeof CUSTOM_DOMAINS[number];
export type CustomScoreDomain = Exclude<CustomDomain, 'throughput'>;
export type CustomWeights = Readonly<Record<CustomDomain, number>>;

export interface CustomLeaderboardInput {
  readonly id: string;
  readonly scores: Readonly<Partial<Record<CustomScoreDomain, number | null>>>;
  readonly throughput: number | null;
}

export interface CustomWeightValidationSuccess {
  readonly ok: true;
  readonly weights: CustomWeights;
  readonly total: number;
}

export interface CustomWeightValidationFailure {
  readonly ok: false;
  readonly reason: string;
}

export type CustomWeightValidation = CustomWeightValidationSuccess | CustomWeightValidationFailure;

export interface CustomContribution {
  readonly domain: CustomDomain;
  readonly sourceValue: number | null;
  readonly normalizedValue: number | null;
  readonly weight: number;
  readonly points: number;
}

export interface CustomThroughputRange {
  readonly minimum: number;
  readonly maximum: number;
  readonly eligibleCount: number;
}

export interface CustomLeaderboardRow<T extends CustomLeaderboardInput = CustomLeaderboardInput> {
  readonly id: string;
  readonly model: T;
  readonly composite: number;
  readonly contributions: readonly CustomContribution[];
  readonly throughputRange: CustomThroughputRange;
  readonly excludedReason: null;
}

export const DEFAULT_CUSTOM_WEIGHTS: CustomWeights = {
  agentic: 25,
  coding: 25,
  reasoning: 20,
  math: 10,
  multimodal: 10,
  throughput: 10,
};

const MAX_CUSTOM_WEIGHT = 100;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function sourceValue(model: CustomLeaderboardInput, domain: CustomDomain): number | null {
  const value = domain === 'throughput' ? model.throughput : model.scores[domain];
  return isFiniteNumber(value) ? value : null;
}

/**
 * Accepts only share-safe integer weights. We deliberately do not rescale a
 * valid vector: the supplied six-domain integers are the user’s exact intent.
 */
export function normalizeCustomWeights(value: Readonly<Partial<Record<CustomDomain, unknown>>>): CustomWeightValidation {
  const weights = {} as Record<CustomDomain, number>;
  for (const domain of CUSTOM_DOMAINS) {
    const candidate = value[domain];
    if (!Number.isSafeInteger(candidate) || (candidate as number) < 0 || (candidate as number) > MAX_CUSTOM_WEIGHT) {
      return { ok: false, reason: 'Each weight must be an integer from 0 to 100' };
    }
    weights[domain] = candidate as number;
  }
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return { ok: false, reason: 'At least one weight must be greater than zero' };
  return { ok: true, weights, total };
}

export function normalizeThroughput(value: number, minimum: number, maximum: number): number {
  if (maximum === minimum) return 100;
  return Math.max(0, Math.min(100, ((value - minimum) / (maximum - minimum)) * 100));
}

export function weightedComposite(values: Record<CustomDomain, number>, weights: CustomWeights): number {
  const denominator = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (denominator <= 0) throw new RangeError('At least one weight must be greater than zero');
  return CUSTOM_DOMAINS.reduce((sum, domain) => sum + values[domain] * weights[domain], 0) / denominator;
}

/**
 * A model must publish every positively weighted domain. Zero-weight missing
 * domains do not block it, so a user can consciously remove an unavailable
 * source lens without turning it into a made-up zero score.
 */
function hasRequiredEvidence(model: CustomLeaderboardInput, weights: CustomWeights): boolean {
  return CUSTOM_DOMAINS.every((domain) => weights[domain] === 0 || sourceValue(model, domain) !== null);
}

function compareRows(left: CustomLeaderboardRow, right: CustomLeaderboardRow): number {
  const difference = right.composite - left.composite;
  return difference !== 0 ? difference : left.id.localeCompare(right.id);
}

/**
 * Builds a transparent, user-weighted ranking. Missing required evidence is
 * excluded rather than coerced to zero, and throughput is normalized only
 * across the resulting eligible published set.
 */
export function buildCustomLeaderboard<T extends CustomLeaderboardInput>(
  models: readonly T[],
  rawWeights: Readonly<Partial<Record<CustomDomain, unknown>>>,
): readonly CustomLeaderboardRow<T>[] {
  const normalized = normalizeCustomWeights(rawWeights);
  if (!normalized.ok) return [];
  const eligible = models.filter((model) => hasRequiredEvidence(model, normalized.weights));
  if (eligible.length === 0) return [];

  const throughputs = eligible
    .map((model) => sourceValue(model, 'throughput'))
    .filter((value): value is number => value !== null);
  // A nonzero throughput weight makes this non-empty; keeping the fallback
  // makes the zero-weight case explicit without inventing a plotted value.
  const minimum = throughputs.length > 0 ? Math.min(...throughputs) : 0;
  const maximum = throughputs.length > 0 ? Math.max(...throughputs) : 0;
  const throughputRange: CustomThroughputRange = {
    minimum,
    maximum,
    eligibleCount: eligible.length,
  };

  return eligible.map((model) => {
    const values = {} as Record<CustomDomain, number>;
    const contributions = CUSTOM_DOMAINS.map((domain) => {
      const rawValue = sourceValue(model, domain);
      const normalizedValue = domain === 'throughput'
        ? rawValue === null ? null : normalizeThroughput(rawValue, minimum, maximum)
        : rawValue;
      const value = normalizedValue ?? 0;
      values[domain] = value;
      return {
        domain,
        sourceValue: rawValue,
        normalizedValue,
        weight: normalized.weights[domain],
        points: value * normalized.weights[domain] / normalized.total,
      };
    });
    return {
      id: model.id,
      model,
      composite: weightedComposite(values, normalized.weights),
      contributions,
      throughputRange,
      excludedReason: null,
    };
  }).sort(compareRows);
}
