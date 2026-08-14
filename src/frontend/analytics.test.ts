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
});
