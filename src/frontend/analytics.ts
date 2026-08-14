export interface TokenBenchEventDetail {
  readonly compare_model_added: { readonly modelId: string; readonly route: string };
  readonly compare_model_removed: { readonly modelId: string; readonly route: string };
  readonly compare_tray_opened: { readonly route: string };
  readonly chart_failed: { readonly chartKind: 'pareto' | 'radar' | 'vertical' | 'ttft' | 'throughput' | 'breakeven'; readonly route: string; readonly reason: 'render' | 'update' };
  readonly editorial_cta_clicked: { readonly route: string; readonly precedingAction: 'catalog' | 'compare_tray' | 'evidence' | 'migration' | 'scenario' | 'article'; readonly subjectId?: string; readonly variant: 'contextual' | 'default' };
  readonly compare_selector_changed: { readonly modelId: string; readonly route: string; readonly slot: 'first' | 'second' };
  readonly compare_pair_swapped: { readonly pairId: string; readonly route: string };
  readonly compare_popular_pair_selected: { readonly pairId: string; readonly route: string };
  readonly compare_prefill_used: { readonly count: '2' | '3'; readonly route: string };
  readonly compare_validation_failed: { readonly reason: 'missing' | 'duplicate' | 'unknown' | 'retired'; readonly route: string };
  readonly comparison_started: { readonly pairId: string; readonly route: string };
  readonly comparison_workload_changed: { readonly scenario: 'balanced' | 'low-latency' | 'long-context'; readonly route: string };
  readonly comparison_host_changed: { readonly host: 'published' | 'direct-only'; readonly route: string };
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

function isStablePairId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}-vs-[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/u.test(value);
}

function isSafeRoute(value: unknown): value is string {
  return typeof value === 'string' && /^\/[A-Za-z0-9._~%\-/]*$/u.test(value);
}

function payloadForEvent(name: string, detail: Record<string, unknown>): Record<string, string> | null {
  if (name === 'compare_model_added' || name === 'compare_model_removed') {
    return hasText(detail.modelId) && isStableCompareModelId(detail.modelId) && isSafeRoute(detail.route)
      ? { modelId: detail.modelId, route: detail.route }
      : null;
  }
  if (name === 'compare_tray_opened') return isSafeRoute(detail.route) ? { route: detail.route } : null;
  if (name === 'chart_failed') {
    return hasText(detail.chartKind) && isSafeRoute(detail.route) && (detail.reason === 'render' || detail.reason === 'update')
      ? { chartKind: detail.chartKind, route: detail.route, reason: detail.reason }
      : null;
  }
  if (name === 'editorial_cta_clicked') {
    const { precedingAction, route, subjectId, variant } = detail;
    if (!isSafeRoute(route) || !isEditorialAction(precedingAction) || !isEditorialVariant(variant)) return null;
    return hasText(subjectId)
      ? { route, precedingAction, subjectId, variant }
      : { route, precedingAction, variant };
  }
  if (name === 'compare_selector_changed') {
    return hasText(detail.modelId) && isStableCompareModelId(detail.modelId) && (detail.slot === 'first' || detail.slot === 'second') && isSafeRoute(detail.route)
      ? { modelId: detail.modelId, slot: detail.slot, route: detail.route }
      : null;
  }
  if (name === 'compare_pair_swapped' || name === 'compare_popular_pair_selected' || name === 'comparison_started') {
    return isStablePairId(detail.pairId) && isSafeRoute(detail.route)
      ? { pairId: detail.pairId, route: detail.route }
      : null;
  }
  if (name === 'compare_prefill_used') {
    return (detail.count === '2' || detail.count === '3') && isSafeRoute(detail.route)
      ? { count: detail.count, route: detail.route }
      : null;
  }
  if (name === 'compare_validation_failed') {
    return (detail.reason === 'missing' || detail.reason === 'duplicate' || detail.reason === 'unknown' || detail.reason === 'retired') && isSafeRoute(detail.route)
      ? { reason: detail.reason, route: detail.route }
      : null;
  }
  if (name === 'comparison_workload_changed') {
    return (detail.scenario === 'balanced' || detail.scenario === 'low-latency' || detail.scenario === 'long-context') && isSafeRoute(detail.route)
      ? { scenario: detail.scenario, route: detail.route }
      : null;
  }
  if (name === 'comparison_host_changed') {
    return (detail.host === 'published' || detail.host === 'direct-only') && isSafeRoute(detail.route)
      ? { host: detail.host, route: detail.route }
      : null;
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
