import { createContext, useContext, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';

export interface CompareSelection {
  readonly ids: readonly string[];
}

export type CompareAddResult =
  | { readonly kind: 'added'; readonly state: CompareSelection }
  | { readonly kind: 'duplicate'; readonly state: CompareSelection }
  | { readonly kind: 'replacement_required'; readonly state: CompareSelection; readonly incomingId: string };

const MAX_COMPARE_MODELS = 3;

export interface CompareState {
  readonly selection: CompareSelection;
  readonly setSelection: Dispatch<SetStateAction<CompareSelection>>;
}

const EMPTY_SELECTION: CompareSelection = { ids: [] };
const EMPTY_COMPARE_STATE: CompareState = { selection: EMPTY_SELECTION, setSelection: () => undefined };
const CompareContext = createContext<CompareState | null>(null);
const STABLE_MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:%/-]{0,199}$/u;

export function isStableCompareModelId(value: string): boolean {
  return STABLE_MODEL_ID.test(value);
}

export function addCompareModel(state: CompareSelection, id: string): CompareAddResult {
  if (state.ids.includes(id)) return { kind: 'duplicate', state };
  if (state.ids.length >= MAX_COMPARE_MODELS) return { kind: 'replacement_required', state, incomingId: id };
  return { kind: 'added', state: { ids: [...state.ids, id] } };
}

export function removeCompareModel(state: CompareSelection, id: string): CompareSelection {
  return { ids: state.ids.filter((selectedId) => selectedId !== id) };
}

export function decodeCompareSearch(search: string): CompareSelection {
  const encodedIds = new URLSearchParams(search).get('compare');
  if (!encodedIds) return EMPTY_SELECTION;

  const ids: string[] = [];
  for (const id of encodedIds.split(',')) {
    if (isStableCompareModelId(id) && !ids.includes(id) && ids.length < MAX_COMPARE_MODELS) ids.push(id);
  }
  return { ids };
}

export function CompareProvider({ children }: { readonly children: ReactNode }) {
  const [selection, setSelection] = useState<CompareSelection>(() =>
    typeof window === 'undefined' ? EMPTY_SELECTION : decodeCompareSearch(window.location.search));
  const value = useMemo(() => ({ selection, setSelection }), [selection]);
  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}

export function useCompareState(): CompareState {
  return useContext(CompareContext) ?? EMPTY_COMPARE_STATE;
}
