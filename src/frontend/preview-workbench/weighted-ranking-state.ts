import { WEIGHTED_RANKING_CAPABILITIES, type WeightedRankingAccess, type WeightedRankingCapability, type WeightedRankingFilters, type WeightedRankingWeights } from './weighted-ranking';

export type WeightedRankingView = 'rows' | 'cards';

export interface WeightedRankingState extends WeightedRankingFilters {
  readonly weights: WeightedRankingWeights;
  readonly selectedModelIds: readonly string[];
  readonly view: WeightedRankingView;
}

export const DEFAULT_WEIGHTED_RANKING_STATE: WeightedRankingState = {
  access: 'all',
  providers: [],
  selectedModelIds: [],
  maxTtft: 0.8,
  minThroughput: 60,
  showOutsideSla: true,
  view: 'rows',
  weights: { agentic: 20, coding: 20, reasoning: 20, math: 15, multimodal: 15, throughput: 10 },
};

function boundedNumber(value: string | null, minimum: number, maximum: number): number | null {
  if (value === null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function normalizeIds(ids: readonly string[]): readonly string[] {
  const normalized: string[] = [];
  for (const candidate of ids) {
    const id = candidate.trim();
    if (!id || normalized.includes(id)) continue;
    normalized.push(id);
  }
  return normalized;
}

export function normalizeWeightedRankingSelection(ids: readonly string[]): readonly string[] {
  return normalizeIds(ids).slice(0, 4);
}

function parseWeights(value: string | null): WeightedRankingWeights | null {
  if (value === null || value === '') return DEFAULT_WEIGHTED_RANKING_STATE.weights;
  const parsed: Partial<Record<WeightedRankingCapability, number>> = {};
  for (const pair of value.split(',')) {
    const [capability, rawWeight, extra] = pair.split(':');
    const weight = boundedNumber(rawWeight ?? null, 0, 100);
    if (extra !== undefined || !WEIGHTED_RANKING_CAPABILITIES.includes(capability as WeightedRankingCapability) || weight === null || parsed[capability as WeightedRankingCapability] !== undefined) return null;
    parsed[capability as WeightedRankingCapability] = weight;
  }
  return WEIGHTED_RANKING_CAPABILITIES.every((capability) => parsed[capability] !== undefined)
    ? parsed as WeightedRankingWeights
    : null;
}

/** Decodes only a complete valid query; malformed partial state cannot change a static document. */
export function weightedRankingStateFromQuery(params: URLSearchParams): WeightedRankingState {
  const access = params.get('access');
  const view = params.get('view');
  const outside = params.get('outside');
  const maxTtft = boundedNumber(params.get('ttft'), 0.2, 1.2);
  const minThroughput = boundedNumber(params.get('tps'), 20, 140);
  const weights = parseWeights(params.get('weights'));
  if ((access !== null && !(['all', 'open', 'closed'] as const).includes(access as WeightedRankingAccess))
    || (view !== null && view !== 'rows' && view !== 'cards')
    || (outside !== null && outside !== '0' && outside !== '1')
    || (params.has('ttft') && maxTtft === null)
    || (params.has('tps') && minThroughput === null)
    || weights === null) return DEFAULT_WEIGHTED_RANKING_STATE;

  return {
    access: (access ?? DEFAULT_WEIGHTED_RANKING_STATE.access) as WeightedRankingAccess,
    providers: normalizeIds((params.get('provider') ?? '').split(',')),
    selectedModelIds: normalizeWeightedRankingSelection((params.get('models') ?? '').split(',')),
    maxTtft: maxTtft ?? DEFAULT_WEIGHTED_RANKING_STATE.maxTtft,
    minThroughput: minThroughput ?? DEFAULT_WEIGHTED_RANKING_STATE.minThroughput,
    showOutsideSla: outside !== '0',
    view: (view ?? DEFAULT_WEIGHTED_RANKING_STATE.view) as WeightedRankingView,
    weights,
  };
}

export function encodeWeightedRankingState(state: WeightedRankingState): URLSearchParams {
  const params = new URLSearchParams();
  params.set('access', state.access);
  if (state.providers.length) params.set('provider', normalizeIds(state.providers).join(','));
  if (state.selectedModelIds.length) params.set('models', normalizeWeightedRankingSelection(state.selectedModelIds).join(','));
  params.set('outside', state.showOutsideSla ? '1' : '0');
  params.set('ttft', state.maxTtft.toFixed(2));
  params.set('tps', String(state.minThroughput));
  params.set('view', state.view);
  params.set('weights', WEIGHTED_RANKING_CAPABILITIES.map((capability) => `${capability}:${state.weights[capability].toFixed(2)}`).join(','));
  return params;
}
