import { describe, expect, it, vi } from 'vitest';
import { trackTokenBenchEvent } from './analytics';

describe('trackTokenBenchEvent', () => {
  it('dispatches only the approved stable event payload fields', () => {
    const listener = vi.fn();
    window.addEventListener('tokenbench:analytics', listener);

    (trackTokenBenchEvent as unknown as (name: string, detail: Record<string, string>) => void)(
      'compare_model_added',
      { modelId: 'stable-model-id', route: '/models/', arbitrarySearch: 'private user value' },
    );
    (trackTokenBenchEvent as unknown as (name: string, detail: Record<string, string>) => void)(
      'not_an_approved_event',
      { arbitrarySearch: 'private user value' },
    );
    (trackTokenBenchEvent as unknown as (name: string, detail: Record<string, string>) => void)(
      'compare_model_added',
      { modelId: 'email@example.com', route: '/models/' },
    );

    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      name: 'compare_model_added', modelId: 'stable-model-id', route: '/models/',
    });
    window.removeEventListener('tokenbench:analytics', listener);
  });

  it('allows only bounded comparison interaction categories and stable identifiers', () => {
    const listener = vi.fn();
    window.addEventListener('tokenbench:analytics', listener);
    const track = trackTokenBenchEvent as unknown as (name: string, detail: Record<string, string>) => void;

    track('compare_selector_changed', { modelId: 'provider:model-a', slot: 'first', route: '/compare/' });
    track('compare_pair_swapped', { pairId: 'model-a-vs-model-b', route: '/compare/' });
    track('compare_popular_pair_selected', { pairId: 'model-a-vs-model-b', route: '/compare/' });
    track('compare_prefill_used', { count: '3', route: '/compare/' });
    track('compare_validation_failed', { reason: 'duplicate', route: '/compare/' });
    track('comparison_started', { pairId: 'model-a-vs-model-b', route: '/compare/' });
    track('comparison_workload_changed', { scenario: 'low-latency', route: '/models/compare/model-a-vs-model-b/' });
    track('comparison_host_changed', { host: 'direct-only', route: '/models/compare/model-a-vs-model-b/' });
    track('comparison_workload_changed', { scenario: 'low-latency', rawTokens: '900000', route: '/models/compare/model-a-vs-model-b/' });
    track('comparison_workload_changed', { scenario: 'free text from a URL', route: '/models/compare/model-a-vs-model-b/' });

    expect(listener.mock.calls.map((call) => (call[0] as CustomEvent).detail)).toEqual([
      { name: 'compare_selector_changed', modelId: 'provider:model-a', slot: 'first', route: '/compare/' },
      { name: 'compare_pair_swapped', pairId: 'model-a-vs-model-b', route: '/compare/' },
      { name: 'compare_popular_pair_selected', pairId: 'model-a-vs-model-b', route: '/compare/' },
      { name: 'compare_prefill_used', count: '3', route: '/compare/' },
      { name: 'compare_validation_failed', reason: 'duplicate', route: '/compare/' },
      { name: 'comparison_started', pairId: 'model-a-vs-model-b', route: '/compare/' },
      { name: 'comparison_workload_changed', scenario: 'low-latency', route: '/models/compare/model-a-vs-model-b/' },
      { name: 'comparison_host_changed', host: 'direct-only', route: '/models/compare/model-a-vs-model-b/' },
      { name: 'comparison_workload_changed', scenario: 'low-latency', route: '/models/compare/model-a-vs-model-b/' },
    ]);
    window.removeEventListener('tokenbench:analytics', listener);
  });

  it('keeps cost-tool analytics to bounded categories without workload quantities or share state', () => {
    const listener = vi.fn();
    window.addEventListener('tokenbench:analytics', listener);
    const track = trackTokenBenchEvent as unknown as (name: string, detail: Record<string, string>) => void;

    track('cost_hub_tool_opened', { tool: 'calculator', route: '/cost/', tokens: '300000000' });
    track('cost_input_changed', { field: 'workload', route: '/cost/calculator/', value: '300000000' });
    track('breakeven_unavailable', { reason: 'partial_prices', route: '/cost/breakeven/', fee: '200' });
    track('breakeven_input_changed', { field: 'fee', route: '/cost/breakeven/', value: '200' });

    expect(listener.mock.calls.map((call) => (call[0] as CustomEvent).detail)).toEqual([
      { name: 'cost_hub_tool_opened', tool: 'calculator', route: '/cost/' },
      { name: 'cost_input_changed', field: 'workload', route: '/cost/calculator/' },
      { name: 'breakeven_unavailable', reason: 'partial_prices', route: '/cost/breakeven/' },
      { name: 'breakeven_input_changed', field: 'fee', route: '/cost/breakeven/' },
    ]);
    window.removeEventListener('tokenbench:analytics', listener);
  });
});
