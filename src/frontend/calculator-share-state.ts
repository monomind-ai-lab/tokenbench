import type { CatalogResponse } from '../catalog/contracts';

const STATE_KEYS = ['provider', 'plan', 'models', 'weights', 'input', 'tokens'] as const;

export interface CalculatorShareState {
  readonly providerId: string;
  readonly planId: string;
  readonly selectedModelIds: readonly string[];
  readonly modelMixBasisPoints: Readonly<Record<string, number>>;
  readonly inputShareBasisPoints: number;
  readonly monthlyTokens: number;
}

export interface DecodedCalculatorShareState {
  readonly state: CalculatorShareState;
  readonly wasNormalized: boolean;
}

function readSingleStateValue(params: URLSearchParams, key: (typeof STATE_KEYS)[number]): string | null {
  const values = params.getAll(key);
  return values.length === 1 ? values[0] : null;
}

function parseInteger(value: string, minimum: number, maximum: number): number | null {
  if (!/^(?:0|[1-9]\d*)$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function parseList(value: string): string[] | null {
  const values = value.split(',');
  return values.length > 0 && values.every(Boolean) ? values : null;
}

function normalizeWeights(entries: readonly { readonly id: string; readonly weight: number }[]): Record<string, number> | null {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) return null;

  const normalized = entries.map((entry, index) => {
    const scaled = entry.weight * 10_000;
    const value = Math.floor(scaled / total);
    return { ...entry, index, value, remainder: scaled % total };
  });
  const remaining = 10_000 - normalized.reduce((sum, entry) => sum + entry.value, 0);
  const largestRemainders = [...normalized].sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  largestRemainders.slice(0, remaining).forEach((entry) => { entry.value += 1; });

  return Object.fromEntries(normalized.map(({ id, value }) => [id, value]));
}

export function encodeCalculatorShareState(state: CalculatorShareState): URLSearchParams {
  const params = new URLSearchParams();
  params.set('provider', state.providerId);
  params.set('plan', state.planId);
  params.set('models', state.selectedModelIds.join(','));
  params.set('weights', state.selectedModelIds.map((id) => state.modelMixBasisPoints[id]).join(','));
  params.set('input', String(state.inputShareBasisPoints));
  params.set('tokens', String(state.monthlyTokens));
  return params;
}

export function decodeCalculatorShareState(params: URLSearchParams, catalog: CatalogResponse): DecodedCalculatorShareState | null {
  const [providerId, planId, encodedModelIds, encodedWeights, encodedInputShare, encodedMonthlyTokens] = STATE_KEYS.map((key) => readSingleStateValue(params, key));
  if (providerId === null || planId === null || encodedModelIds === null || encodedWeights === null || encodedInputShare === null || encodedMonthlyTokens === null) return null;

  const selectedModelIds = parseList(encodedModelIds);
  const encodedWeightValues = parseList(encodedWeights);
  const inputShareBasisPoints = parseInteger(encodedInputShare, 0, 10_000);
  const monthlyTokens = parseInteger(encodedMonthlyTokens, 1, Number.MAX_SAFE_INTEGER);
  if (!selectedModelIds || !encodedWeightValues || selectedModelIds.length !== encodedWeightValues.length || inputShareBasisPoints === null || monthlyTokens === null) return null;
  if (new Set(selectedModelIds).size !== selectedModelIds.length) return null;

  const weights: number[] = [];
  for (const value of encodedWeightValues) {
    const weight = parseInteger(value, 0, 10_000);
    if (weight === null) return null;
    weights.push(weight);
  }
  if (weights.reduce((sum, weight) => sum + weight, 0) !== 10_000) return null;

  const providerExists = catalog.modelOffers.some((offer) => offer.providerId === providerId)
    || catalog.plans.some((plan) => plan.providerId === providerId);
  if (!providerExists) return null;

  const availableModelIds = new Set(catalog.modelOffers.filter((offer) => offer.providerId === providerId).map((offer) => offer.id));
  const survivingModels = selectedModelIds.flatMap((id, index) => availableModelIds.has(id) ? [{ id, weight: weights[index] }] : []);
  const modelMixBasisPoints = normalizeWeights(survivingModels);
  if (!modelMixBasisPoints) return null;

  const normalizedModelIds = survivingModels.map((entry) => entry.id);
  const hasValidPlan = planId === '' || catalog.plans.some((plan) => plan.id === planId && plan.providerId === providerId);
  const normalizedPlanId = hasValidPlan ? planId : '';
  const modelsChanged = normalizedModelIds.length !== selectedModelIds.length
    || normalizedModelIds.some((id, index) => id !== selectedModelIds[index])
    || normalizedModelIds.some((id, index) => modelMixBasisPoints[id] !== weights[index]);

  return {
    state: {
      providerId,
      planId: normalizedPlanId,
      selectedModelIds: normalizedModelIds,
      modelMixBasisPoints,
      inputShareBasisPoints,
      monthlyTokens,
    },
    wasNormalized: normalizedPlanId !== planId || modelsChanged,
  };
}
