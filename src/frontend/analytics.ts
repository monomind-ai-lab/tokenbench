export interface TokenBenchEventDetail {
  readonly compare_model_added: { readonly modelId: string; readonly route: string };
  readonly compare_model_removed: { readonly modelId: string; readonly route: string };
  readonly compare_tray_opened: { readonly route: string };
  readonly chart_failed: { readonly chartKind: 'pareto' | 'radar' | 'vertical' | 'ttft' | 'throughput' | 'breakeven'; readonly route: string; readonly reason: 'render' | 'update' };
  readonly editorial_cta_clicked: { readonly route: string; readonly precedingAction: 'catalog' | 'compare_tray' | 'evidence' | 'migration' | 'scenario' | 'article'; readonly subjectId?: string; readonly variant: 'contextual' | 'default' };
}

export type TokenBenchEventName = keyof TokenBenchEventDetail;

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isEditorialAction(value: unknown): value is TokenBenchEventDetail['editorial_cta_clicked']['precedingAction'] {
  return value === 'catalog' || value === 'compare_tray' || value === 'evidence'
    || value === 'migration' || value === 'scenario' || value === 'article';
}

function isEditorialVariant(value: unknown): value is TokenBenchEventDetail['editorial_cta_clicked']['variant'] {
  return value === 'contextual' || value === 'default';
}

function payloadForEvent(name: string, detail: Record<string, unknown>): Record<string, string> | null {
  if (name === 'compare_model_added' || name === 'compare_model_removed') {
    return hasText(detail.modelId) && isStableCompareModelId(detail.modelId) && hasText(detail.route)
      ? { modelId: detail.modelId, route: detail.route }
      : null;
  }
  if (name === 'compare_tray_opened') return hasText(detail.route) ? { route: detail.route } : null;
  if (name === 'chart_failed') {
    return hasText(detail.chartKind) && hasText(detail.route) && (detail.reason === 'render' || detail.reason === 'update')
      ? { chartKind: detail.chartKind, route: detail.route, reason: detail.reason }
      : null;
  }
  if (name === 'editorial_cta_clicked') {
    const { precedingAction, route, subjectId, variant } = detail;
    if (!hasText(route) || !isEditorialAction(precedingAction) || !isEditorialVariant(variant)) return null;
    return hasText(subjectId)
      ? { route, precedingAction, subjectId, variant }
      : { route, precedingAction, variant };
  }
  return null;
}

export function trackTokenBenchEvent<K extends TokenBenchEventName>(name: K, detail: TokenBenchEventDetail[K]): void {
  if (typeof window === 'undefined' || navigator.doNotTrack === '1') return;
  const payload = payloadForEvent(name, detail as Record<string, unknown>);
  if (payload === null) return;
  window.dispatchEvent(new CustomEvent('tokenbench:analytics', { detail: { name, ...payload } }));
}
import { isStableCompareModelId } from './compare-state';
