export const MAX_COMPARE_MODELS = 4;

export interface CompareState {
  readonly modelIds: readonly string[];
}

export const DEFAULT_COMPARE_STATE: CompareState = { modelIds: [] };

/** Retains the first requested instance of each bounded comparison identifier. */
export function normalizeCompareModelIds(modelIds: readonly string[]): readonly string[] {
  const normalized: string[] = [];
  for (const candidate of modelIds) {
    const id = candidate.trim();
    if (id.length === 0 || normalized.includes(id)) continue;
    normalized.push(id);
    if (normalized.length === MAX_COMPARE_MODELS) break;
  }
  return normalized;
}

export function decodeCompareState(params: URLSearchParams): CompareState {
  return { modelIds: normalizeCompareModelIds((params.get('models') ?? '').split(',')) };
}

export function encodeCompareState(state: CompareState): URLSearchParams {
  const params = new URLSearchParams();
  const modelIds = normalizeCompareModelIds(state.modelIds);
  if (modelIds.length > 0) params.set('models', modelIds.join(','));
  return params;
}

export function addCompareModel(modelIds: readonly string[], modelId: string): readonly string[] {
  return normalizeCompareModelIds([...modelIds, modelId]);
}

export function removeCompareModel(modelIds: readonly string[], modelId: string): readonly string[] {
  return normalizeCompareModelIds(modelIds.filter((candidate) => candidate !== modelId));
}
