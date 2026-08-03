import { useCallback, useEffect, useRef, useState } from 'react';
import type { CatalogResponse } from '../catalog/contracts';
import { loadCatalog, type CatalogLoadResult } from './catalog-cache';

export type CatalogPhase = 'loading' | 'ready' | 'error';

export interface CatalogState {
  catalog: CatalogResponse | null;
  phase: CatalogPhase;
  status: CatalogLoadResult['status'] | null;
  fromCache: boolean;
  notice?: string;
  error?: string;
  lastSuccessfulRefreshAt: string | null;
  retry: () => void;
}

export function useCatalog(): CatalogState {
  const [state, setState] = useState<Omit<CatalogState, 'retry'>>({
    catalog: null,
    phase: 'loading',
    status: null,
    fromCache: false,
    lastSuccessfulRefreshAt: null,
  });
  const requestVersion = useRef(0);
  const [retryVersion, setRetryVersion] = useState(0);

  const retry = useCallback(() => setRetryVersion((version) => version + 1), []);

  useEffect(() => {
    let active = true;
    const version = ++requestVersion.current;
    if (!state.catalog) setState((current) => ({ ...current, phase: 'loading', error: undefined }));

    loadCatalog().then((result) => {
      if (!active || requestVersion.current !== version) return;
      setState({
        catalog: result.catalog,
        phase: 'ready',
        status: result.status,
        fromCache: result.fromCache,
        notice: result.notice,
        error: result.notice?.startsWith('Catalog unavailable') ? result.notice : undefined,
        lastSuccessfulRefreshAt: result.lastSuccessfulRefreshAt,
      });
    }).catch((error: unknown) => {
      if (!active || requestVersion.current !== version) return;
      setState((current) => ({
        ...current,
        phase: 'error',
        error: error instanceof Error ? error.message : 'Catalog request failed',
      }));
    });

    return () => { active = false; };
    // The retry version is intentionally the only trigger; the hook must not re-fetch on state updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryVersion]);

  return { ...state, retry };
}
