export interface BreakevenScenario {
  readonly seats: number;
  readonly feePerSeat: number;
  readonly maxTokensMillions: number;
  readonly inputShare: number;
  readonly inputPricePerMillion: number | null;
  readonly outputPricePerMillion: number | null;
  /** Entitlement evidence remains separate from the fee comparison. */
  readonly capacityTokens: number | null;
  readonly currentVolumeMillions?: number;
}

export type BreakevenCapacity =
  | { readonly kind: 'available'; readonly tokens: number }
  | { readonly kind: 'unavailable' };

export interface BreakevenPoint {
  readonly tokensMillions: number;
  readonly apiCost: number;
  readonly subscriptionCost: number;
  readonly cheaper: 'api' | 'subscription' | 'equal';
}

export type BreakevenResult =
  | { readonly kind: 'unavailable'; readonly reason: 'invalid_seats' | 'invalid_domain' | 'invalid_mix' | 'partial_prices' }
  | {
    readonly kind: 'available';
    readonly subscriptionFee: number;
    readonly apiCostPerMillion: number;
    readonly crossoverMillions: number | null;
    readonly crossoverInDomain: boolean;
    readonly points: readonly BreakevenPoint[];
    readonly message: string;
    readonly capacity: BreakevenCapacity;
    readonly capacityMessage: string;
  };

function isFiniteNonNegative(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function cheaperAt(apiCost: number, subscriptionCost: number): BreakevenPoint['cheaper'] {
  if (apiCost < subscriptionCost) return 'api';
  if (apiCost > subscriptionCost) return 'subscription';
  return 'equal';
}

function capacityEvidence(value: number | null): { readonly capacity: BreakevenCapacity; readonly message: string } {
  return value === null
    ? { capacity: { kind: 'unavailable' }, message: 'Subscription capacity evidence is unavailable; no included tokens are inferred.' }
    : { capacity: { kind: 'available', tokens: value }, message: 'Published subscription capacity is shown separately from the fee crossover.' };
}

/**
 * Computes the fee crossover in dollars per month from complete published API
 * price dimensions. The result retains full precision; presentation rounds.
 */
export function buildBreakevenResult(scenario: BreakevenScenario): BreakevenResult {
  if (!Number.isInteger(scenario.seats) || scenario.seats < 1 || scenario.seats > 50) return { kind: 'unavailable', reason: 'invalid_seats' };
  if (!Number.isFinite(scenario.feePerSeat) || scenario.feePerSeat < 0
    || !Number.isFinite(scenario.maxTokensMillions) || scenario.maxTokensMillions < 0 || scenario.maxTokensMillions > 300) {
    return { kind: 'unavailable', reason: 'invalid_domain' };
  }
  if (!Number.isFinite(scenario.inputShare) || scenario.inputShare < 0 || scenario.inputShare > 1) return { kind: 'unavailable', reason: 'invalid_mix' };
  if (!isFiniteNonNegative(scenario.inputPricePerMillion) || !isFiniteNonNegative(scenario.outputPricePerMillion)) {
    return { kind: 'unavailable', reason: 'partial_prices' };
  }

  const subscriptionFee = scenario.seats * scenario.feePerSeat;
  const apiCostPerMillion = (scenario.inputShare * scenario.inputPricePerMillion)
    + ((1 - scenario.inputShare) * scenario.outputPricePerMillion);
  const crossoverMillions = subscriptionFee > 0 && apiCostPerMillion > 0 ? subscriptionFee / apiCostPerMillion : null;
  const crossoverInDomain = crossoverMillions !== null && crossoverMillions >= 0 && crossoverMillions <= scenario.maxTokensMillions;
  const sampleVolumes = [0, 0.25, 0.5, 0.75, 1]
    .map((portion) => scenario.maxTokensMillions * portion);
  const points = sampleVolumes.map((tokensMillions) => {
    const apiCost = tokensMillions * apiCostPerMillion;
    return {
      tokensMillions,
      apiCost,
      subscriptionCost: subscriptionFee,
      cheaper: cheaperAt(apiCost, subscriptionFee),
    };
  });
  const domain = `0–${scenario.maxTokensMillions}M`;
  const endState = points.at(-1)?.cheaper ?? 'equal';
  const message = crossoverMillions === null
    ? apiCostPerMillion === 0
      ? 'Published API cost is zero for this scenario, so no positive fee crossover can be calculated.'
      : 'The subscription fee is zero, so no positive fee crossover can be calculated.'
    : crossoverInDomain
      ? `The fee crossover occurs at ${crossoverMillions.toFixed(6)}M monthly tokens within the displayed ${domain} range.`
      : `The fee crossover is outside the displayed ${domain} range. ${endState === 'api' ? 'API spend is lower throughout this domain.' : endState === 'subscription' ? 'Subscription fees are lower throughout this domain.' : 'The two costs are equal at the displayed endpoint.'}`;
  const capacity = capacityEvidence(scenario.capacityTokens);

  return {
    kind: 'available',
    subscriptionFee,
    apiCostPerMillion,
    crossoverMillions,
    crossoverInDomain,
    points,
    message,
    capacity: capacity.capacity,
    capacityMessage: capacity.message,
  };
}
