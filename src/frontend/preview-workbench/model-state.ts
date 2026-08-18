import type { ModelAccess, ModelDirectoryQuery } from '../preview-data/contracts';

export type ModelWorkbenchSort = 'capability-desc' | 'cost-asc' | 'name-asc';
export type ModelWorkbenchView = 'cards' | 'table';

export interface ModelWorkbenchState {
  readonly search: string;
  readonly access: ModelAccess | null;
  readonly provider: string | null;
  readonly sort: ModelWorkbenchSort;
  readonly view: ModelWorkbenchView;
  readonly frontierOnly: boolean;
  readonly selectedModelIds: readonly string[];
}

export const DEFAULT_MODEL_WORKBENCH_STATE: ModelWorkbenchState = {
  search: '',
  access: null,
  provider: null,
  sort: 'capability-desc',
  view: 'cards',
  frontierOnly: false,
  selectedModelIds: [],
};

const MODEL_ACCESS_VALUES = new Set<ModelAccess>(['Proprietary', 'Open weights']);
const MODEL_SORT_VALUES = new Set<ModelWorkbenchSort>(['capability-desc', 'cost-asc', 'name-asc']);
const MODEL_VIEW_VALUES = new Set<ModelWorkbenchView>(['cards', 'table']);

function boundedText(value: string | null, limit: number): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= limit ? normalized : null;
}

function comparisonIds(value: string | null): readonly string[] {
  const selected: string[] = [];
  for (const candidate of (value ?? '').split(',')) {
    const id = candidate.trim();
    if (id.length === 0 || selected.includes(id)) continue;
    selected.push(id);
    if (selected.length === 4) break;
  }
  return selected;
}

/** Decodes bounded, preview-only state without accepting arbitrary query keys. */
export function decodeModelWorkbenchState(params: URLSearchParams): ModelWorkbenchState {
  const accessValue = params.get('access');
  const sortValue = params.get('sort');
  const viewValue = params.get('view');
  return {
    search: boundedText(params.get('q'), 80) ?? '',
    access: accessValue !== null && MODEL_ACCESS_VALUES.has(accessValue as ModelAccess)
      ? accessValue as ModelAccess
      : null,
    provider: boundedText(params.get('provider'), 80),
    sort: sortValue !== null && MODEL_SORT_VALUES.has(sortValue as ModelWorkbenchSort)
      ? sortValue as ModelWorkbenchSort
      : DEFAULT_MODEL_WORKBENCH_STATE.sort,
    view: viewValue !== null && MODEL_VIEW_VALUES.has(viewValue as ModelWorkbenchView)
      ? viewValue as ModelWorkbenchView
      : DEFAULT_MODEL_WORKBENCH_STATE.view,
    frontierOnly: params.get('frontier') === '1',
    selectedModelIds: comparisonIds(params.get('compare')),
  };
}

/** Emits one stable preview URL for equivalent workbench state. */
export function encodeModelWorkbenchState(state: ModelWorkbenchState): URLSearchParams {
  const params = new URLSearchParams();
  const search = boundedText(state.search, 80);
  const provider = boundedText(state.provider, 80);
  const selectedModelIds = comparisonIds(state.selectedModelIds.join(','));
  if (state.access) params.set('access', state.access);
  if (selectedModelIds.length > 0) params.set('compare', selectedModelIds.join(','));
  if (state.frontierOnly) params.set('frontier', '1');
  if (provider) params.set('provider', provider);
  if (search) params.set('q', search);
  if (state.sort !== DEFAULT_MODEL_WORKBENCH_STATE.sort) params.set('sort', state.sort);
  if (state.view !== DEFAULT_MODEL_WORKBENCH_STATE.view) params.set('view', state.view);
  return params;
}

/** Translates only the evidence-bearing workbench inputs into a retained request. */
export function modelDirectoryQueryForWorkbenchState(state: ModelWorkbenchState): ModelDirectoryQuery {
  return {
    search: state.search || undefined,
    access: state.access ?? undefined,
    provider: state.provider ?? undefined,
  };
}

export function profileHref(slug: string): string {
  return `/model-profile?model=${encodeURIComponent(slug)}`;
}
