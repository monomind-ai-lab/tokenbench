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
  readonly cost_hub_tool_opened: { readonly route: string; readonly tool: 'calculator' | 'breakeven' };
  readonly cost_hub_start_clean: { readonly route: string };
  readonly cost_hub_shared_state_continued: { readonly route: string };
  readonly cost_input_changed: { readonly field: 'subscription' | 'model' | 'host' | 'workload' | 'mix' | 'cache' | 'long_context' | 'estimate'; readonly route: string };
  readonly cost_simulated: { readonly route: string };
  readonly cost_share_created: { readonly route: string };
  readonly cost_printed: { readonly route: string };
  readonly cost_csv_exported: { readonly route: string };
  readonly cost_validation_failed: { readonly reason: 'invalid' | 'incomplete' | 'unsupported' | 'missing_price' | 'partial_price' | 'stale' | 'conflict'; readonly route: string };
  readonly breakeven_input_changed: { readonly field: 'seats' | 'fee' | 'volume' | 'model' | 'host' | 'workload' | 'mix' | 'cache' | 'long_context'; readonly route: string };
  readonly breakeven_calculated: { readonly route: string };
  readonly breakeven_crossover_inspected: { readonly route: string };
  readonly breakeven_share_created: { readonly route: string };
  readonly breakeven_unavailable: { readonly reason: 'invalid_seats' | 'invalid_domain' | 'invalid_mix' | 'partial_prices' | 'stale' | 'conflict'; readonly route: string };
  readonly articles_channel_opened: { readonly channel: 'guides' | 'insights'; readonly route: string };
  readonly articles_topic_filtered: { readonly topic: string; readonly route: string };
  readonly article_opened: { readonly articleId: string; readonly route: string };
  readonly article_tool_opened: { readonly tool: 'compare' | 'cost' | 'lifecycle' | 'profile' | 'leaderboard'; readonly route: string; readonly subjectId: string };
  readonly guide_viewed: { readonly articleId: string; readonly route: string };
  readonly guide_toc_opened: { readonly articleId: string; readonly route: string };
  readonly guide_source_opened: { readonly articleId: string; readonly route: string };
  readonly guide_related_opened: { readonly articleId: string; readonly route: string };
  readonly insight_viewed: { readonly articleId: string; readonly route: string };
  readonly insight_topic_filtered: { readonly topic: string; readonly route: string };
  readonly insight_source_opened: { readonly articleId: string; readonly route: string };
  readonly insight_affected_model_opened: { readonly articleId: string; readonly route: string };
  readonly insight_correction_opened: { readonly articleId: string; readonly route: string };
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

function isStableArticleId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9-]{1,199}$/u.test(value);
}

function isArticleTopic(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9-]{0,79}$/u.test(value);
}

function isCostInputField(value: unknown): value is TokenBenchEventDetail['cost_input_changed']['field'] {
  return value === 'subscription' || value === 'model' || value === 'host' || value === 'workload'
    || value === 'mix' || value === 'cache' || value === 'long_context' || value === 'estimate';
}

function isBreakevenInputField(value: unknown): value is TokenBenchEventDetail['breakeven_input_changed']['field'] {
  return value === 'seats' || value === 'fee' || value === 'volume' || value === 'model'
    || value === 'host' || value === 'workload' || value === 'mix' || value === 'cache' || value === 'long_context';
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
  if (name === 'cost_hub_tool_opened') {
    return (detail.tool === 'calculator' || detail.tool === 'breakeven') && isSafeRoute(detail.route)
      ? { tool: detail.tool, route: detail.route }
      : null;
  }
  if (name === 'cost_hub_start_clean' || name === 'cost_hub_shared_state_continued'
    || name === 'cost_simulated' || name === 'cost_share_created' || name === 'cost_printed' || name === 'cost_csv_exported'
    || name === 'breakeven_calculated' || name === 'breakeven_crossover_inspected' || name === 'breakeven_share_created') {
    return isSafeRoute(detail.route) ? { route: detail.route } : null;
  }
  if (name === 'cost_input_changed') {
    return isCostInputField(detail.field) && isSafeRoute(detail.route)
      ? { field: detail.field, route: detail.route }
      : null;
  }
  if (name === 'cost_validation_failed') {
    return (detail.reason === 'invalid' || detail.reason === 'incomplete' || detail.reason === 'unsupported'
      || detail.reason === 'missing_price' || detail.reason === 'partial_price' || detail.reason === 'stale' || detail.reason === 'conflict') && isSafeRoute(detail.route)
      ? { reason: detail.reason, route: detail.route }
      : null;
  }
  if (name === 'breakeven_input_changed') {
    return isBreakevenInputField(detail.field) && isSafeRoute(detail.route)
      ? { field: detail.field, route: detail.route }
      : null;
  }
  if (name === 'breakeven_unavailable') {
    return (detail.reason === 'invalid_seats' || detail.reason === 'invalid_domain' || detail.reason === 'invalid_mix'
      || detail.reason === 'partial_prices' || detail.reason === 'stale' || detail.reason === 'conflict') && isSafeRoute(detail.route)
      ? { reason: detail.reason, route: detail.route }
      : null;
  }
  if (name === 'articles_channel_opened') {
    return (detail.channel === 'guides' || detail.channel === 'insights') && isSafeRoute(detail.route)
      ? { channel: detail.channel, route: detail.route }
      : null;
  }
  if (name === 'articles_topic_filtered' || name === 'insight_topic_filtered') {
    return isArticleTopic(detail.topic) && isSafeRoute(detail.route)
      ? { topic: detail.topic, route: detail.route }
      : null;
  }
  if (name === 'article_opened' || name === 'guide_viewed' || name === 'guide_toc_opened' || name === 'guide_source_opened'
    || name === 'guide_related_opened' || name === 'insight_viewed' || name === 'insight_source_opened'
    || name === 'insight_affected_model_opened' || name === 'insight_correction_opened') {
    return isStableArticleId(detail.articleId) && isSafeRoute(detail.route)
      ? { articleId: detail.articleId, route: detail.route }
      : null;
  }
  if (name === 'article_tool_opened') {
    return (detail.tool === 'compare' || detail.tool === 'cost' || detail.tool === 'lifecycle' || detail.tool === 'profile' || detail.tool === 'leaderboard')
      && isStableArticleId(detail.subjectId) && isSafeRoute(detail.route)
      ? { tool: detail.tool, subjectId: detail.subjectId, route: detail.route }
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
