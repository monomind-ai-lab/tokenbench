import { createEvidencePreviewDataComposition } from './composition-evidence';
import { createProductionHttpDataComposition } from './composition-http';
import type { EvidenceTransportOptions } from './evidence-transport';
import type { PreviewDataAdapter } from './contracts';

type FetchLike = Parameters<typeof createProductionHttpDataComposition>[1];

export type UiDataCompositionOptions =
  | { readonly target: 'preview'; readonly mode: 'evidence'; readonly evidence?: EvidenceTransportOptions }
  | { readonly target: 'production'; readonly mode: 'http'; readonly baseUrl: string | undefined; readonly fetchImpl?: FetchLike };

/**
 * Selects one explicit transport for the accepted UI-data gateway.
 *
 * Evidence is a deterministic design/test input only. Production composition
 * is HTTP-only and never catches a transport error to substitute retained
 * evidence or local fixtures.
 */
export function createUiDataComposition(options: UiDataCompositionOptions): PreviewDataAdapter {
  if (options.mode === 'evidence') {
    if (options.target !== 'preview') throw new TypeError('Production UI data composition requires HTTP mode.');
    return createEvidencePreviewDataComposition(options.evidence);
  }

  if (options.target !== 'production') throw new TypeError('Preview UI data composition requires evidence mode.');
  return createProductionHttpDataComposition(options.baseUrl, options.fetchImpl);
}
