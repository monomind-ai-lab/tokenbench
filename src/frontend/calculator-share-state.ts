import { compareUtf8Binary } from '../benchmarks/contracts';
import type { CatalogResponse } from '../catalog/contracts';
import { defaultApiEquivalentForPlan } from '../catalog/plan-api-equivalent';
import type { ConversationWorkload } from '../catalog/subscription-api-calculator';
import { isPaidIndividualPlan } from './plan-filter';

const SHARE_KEYS = ['c', 'm', 'i', 'o', 'd', 'models', 'weights', 'provider', 'plan'] as const;
const ADVANCED_SHARE_KEYS = ['cacheReadShare', 'cacheWriteShare', 'longContext', 'contentType', 'inputCharactersPerMessage', 'outputCharactersPerMessage', 'seats', 'tokenVolume'] as const;
const LEGACY_KEYS = ['input', 'tokens'] as const;
type ShareKey = (typeof SHARE_KEYS)[number];

export interface CalculatorShareState {
  readonly providerId: string;
  readonly planId: string;
  readonly workload: ConversationWorkload;
  readonly selectedModelIds: readonly string[];
  readonly modelMixBasisPoints: Readonly<Record<string, number>>;
  readonly mappingMode: 'default' | 'override';
  readonly cacheReadShareBasisPoints?: number;
  readonly cacheWriteShareBasisPoints?: number;
  readonly longContext?: boolean;
  readonly characterEstimate?: {
    readonly contentType: 'text' | 'code';
    readonly inputCharactersPerMessage: number;
    readonly outputCharactersPerMessage: number;
  };
  readonly seats?: number;
  readonly tokenVolume?: number;
}

export interface DecodedCalculatorShareState {
  readonly state: CalculatorShareState;
  readonly wasNormalized: boolean;
}

function readSingleStateValue(params: URLSearchParams, key: string): string | null {
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

function legacyWorkload(inputShareBasisPoints: number, monthlyTokens: number): ConversationWorkload {
  const safeTokens = Math.max(0, monthlyTokens);
  const activeDaysPerMonth = 30;
  const totalTokensPerMessage = Math.min(1_000_000, Math.floor(safeTokens / activeDaysPerMonth));
  const inputTokensPerMessage = Math.floor(totalTokensPerMessage * inputShareBasisPoints / 10_000);
  return {
    conversationsPerDay: safeTokens === 0 ? 0 : 1,
    messagesPerConversation: safeTokens === 0 ? 0 : 1,
    inputTokensPerMessage,
    outputTokensPerMessage: totalTokensPerMessage - inputTokensPerMessage,
    activeDaysPerMonth,
  };
}

function defaultOfferForState(providerId: string, planId: string, catalog: CatalogResponse) {
  const plan = catalog.plans.find((candidate) => candidate.id === planId && candidate.providerId === providerId && isPaidIndividualPlan(candidate));
  if (plan) return defaultApiEquivalentForPlan(plan, catalog.modelOffers);
  return catalog.modelOffers
    .filter((offer) => offer.providerId === providerId && offer.pricingBasis === 'direct_provider_api' && offer.route === 'direct_provider')
    .sort((left, right) => compareUtf8Binary(left.modelId, right.modelId) || compareUtf8Binary(left.id, right.id))[0] ?? null;
}

function inferredMappingMode(
  providerId: string,
  planId: string,
  selectedModelIds: readonly string[],
  modelMixBasisPoints: Readonly<Record<string, number>>,
  catalog: CatalogResponse,
): 'default' | 'override' {
  const defaultOffer = defaultOfferForState(providerId, planId, catalog);
  return defaultOffer
    && selectedModelIds.length === 1
    && selectedModelIds[0] === defaultOffer.id
    && modelMixBasisPoints[defaultOffer.id] === 10_000
    ? 'default'
    : 'override';
}

export function encodeCalculatorShareState(state: CalculatorShareState): URLSearchParams {
  const params = new URLSearchParams();
  params.set('c', String(state.workload.conversationsPerDay));
  params.set('m', String(state.workload.messagesPerConversation));
  params.set('i', String(state.workload.inputTokensPerMessage));
  params.set('o', String(state.workload.outputTokensPerMessage));
  params.set('d', String(state.workload.activeDaysPerMonth));
  params.set('models', state.selectedModelIds.join(','));
  params.set('weights', state.selectedModelIds.map((id) => state.modelMixBasisPoints[id]).join(','));
  params.set('provider', state.providerId);
  params.set('plan', state.planId);
  const hasAdvancedState = state.cacheReadShareBasisPoints !== undefined
    && state.cacheWriteShareBasisPoints !== undefined
    && state.longContext !== undefined
    && state.characterEstimate !== undefined
    && state.seats !== undefined
    && state.tokenVolume !== undefined;
  if (hasAdvancedState) {
    params.set('cacheReadShare', String(state.cacheReadShareBasisPoints! / 100));
    params.set('cacheWriteShare', String(state.cacheWriteShareBasisPoints! / 100));
    params.set('longContext', state.longContext ? '1' : '0');
    params.set('contentType', state.characterEstimate!.contentType);
    params.set('inputCharactersPerMessage', String(state.characterEstimate!.inputCharactersPerMessage));
    params.set('outputCharactersPerMessage', String(state.characterEstimate!.outputCharactersPerMessage));
    params.set('seats', String(state.seats));
    params.set('tokenVolume', String(state.tokenVolume));
  }
  return params;
}

export function decodeCalculatorShareState(params: URLSearchParams, catalog: CatalogResponse): DecodedCalculatorShareState | null {
  const values = SHARE_KEYS.map((key) => readSingleStateValue(params, key));
  const [encodedConversations, encodedMessages, encodedInputTokens, encodedOutputTokens, encodedDays, encodedModelIds, encodedWeights, providerId, planId] = values;
  if (providerId === null || planId === null || encodedModelIds === null || encodedWeights === null) return null;

  const hasLegacy = LEGACY_KEYS.some((key) => params.has(key));
  const hasNewWorkload = values.slice(0, 5).every((value) => value !== null);
  const hasAnyNewWorkload = SHARE_KEYS.slice(0, 5).some((key) => params.has(key));
  if (hasAnyNewWorkload && !hasNewWorkload) return null;
  let workload: ConversationWorkload;
  if (hasNewWorkload) {
    const conversationsPerDay = parseInteger(encodedConversations!, 0, 10_000);
    const messagesPerConversation = parseInteger(encodedMessages!, 0, 1_000);
    const inputTokensPerMessage = parseInteger(encodedInputTokens!, 0, 1_000_000);
    const outputTokensPerMessage = parseInteger(encodedOutputTokens!, 0, 1_000_000);
    const activeDaysPerMonth = parseInteger(encodedDays!, 0, 31);
    if ([conversationsPerDay, messagesPerConversation, inputTokensPerMessage, outputTokensPerMessage, activeDaysPerMonth].some((value) => value === null)) return null;
    workload = { conversationsPerDay, messagesPerConversation, inputTokensPerMessage, outputTokensPerMessage, activeDaysPerMonth };
  } else {
    const encodedInputShare = readSingleStateValue(params, 'input');
    const encodedMonthlyTokens = readSingleStateValue(params, 'tokens');
    if (!encodedInputShare || !encodedMonthlyTokens) return null;
    const inputShareBasisPoints = parseInteger(encodedInputShare, 0, 10_000);
    const monthlyTokens = parseInteger(encodedMonthlyTokens, 0, Number.MAX_SAFE_INTEGER);
    if (inputShareBasisPoints === null || monthlyTokens === null) return null;
    workload = legacyWorkload(inputShareBasisPoints, monthlyTokens);
  }

  const selectedModelIds = parseList(encodedModelIds);
  const encodedWeightValues = parseList(encodedWeights);
  if (!selectedModelIds || !encodedWeightValues || selectedModelIds.length !== encodedWeightValues.length) return null;
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
  const hasValidPlan = planId === '' || catalog.plans.some((plan) => (
    plan.id === planId
    && plan.providerId === providerId
    && isPaidIndividualPlan(plan)
  ));
  const normalizedPlanId = hasValidPlan ? planId : '';
  const modelsChanged = normalizedModelIds.length !== selectedModelIds.length
    || normalizedModelIds.some((id, index) => id !== selectedModelIds[index])
    || normalizedModelIds.some((id, index) => modelMixBasisPoints[id] !== weights[index]);
  const mappingMode = inferredMappingMode(providerId, normalizedPlanId, normalizedModelIds, modelMixBasisPoints, catalog);
  const advancedValues = ADVANCED_SHARE_KEYS.map((key) => readSingleStateValue(params, key));
  const hasAdvanced = advancedValues.some((value) => value !== null);
  let advancedState: Pick<CalculatorShareState, 'cacheReadShareBasisPoints' | 'cacheWriteShareBasisPoints' | 'longContext' | 'characterEstimate' | 'seats' | 'tokenVolume'> = {};
  if (hasAdvanced) {
    if (advancedValues.some((value) => value === null)) return null;
    const [encodedCacheRead, encodedCacheWrite, encodedLongContext, encodedContentType, encodedInputCharacters, encodedOutputCharacters, encodedSeats, encodedTokenVolume] = advancedValues;
    const cacheReadShare = parseInteger(encodedCacheRead!, 0, 100);
    const cacheWriteShare = parseInteger(encodedCacheWrite!, 0, 100);
    const inputCharactersPerMessage = parseInteger(encodedInputCharacters!, 0, 4_000_000);
    const outputCharactersPerMessage = parseInteger(encodedOutputCharacters!, 0, 4_000_000);
    const seats = parseInteger(encodedSeats!, 1, 50);
    const tokenVolume = parseInteger(encodedTokenVolume!, 0, 300_000_000);
    if (cacheReadShare === null
      || cacheWriteShare === null
      || cacheReadShare + cacheWriteShare > 100
      || inputCharactersPerMessage === null
      || outputCharactersPerMessage === null
      || seats === null
      || tokenVolume === null
      || (encodedLongContext !== '0' && encodedLongContext !== '1')
      || (encodedContentType !== 'text' && encodedContentType !== 'code')) return null;
    advancedState = {
      cacheReadShareBasisPoints: cacheReadShare * 100,
      cacheWriteShareBasisPoints: cacheWriteShare * 100,
      longContext: encodedLongContext === '1',
      characterEstimate: { contentType: encodedContentType, inputCharactersPerMessage, outputCharactersPerMessage },
      seats,
      tokenVolume,
    };
  }

  return {
    state: {
      providerId,
      planId: normalizedPlanId,
      workload,
      selectedModelIds: normalizedModelIds,
      modelMixBasisPoints,
      mappingMode,
      ...advancedState,
    },
    wasNormalized: hasLegacy || normalizedPlanId !== planId || modelsChanged,
  };
}
