import { describe, expect, it } from 'vitest';
import {
  decodeModelWorkbenchState,
  encodeModelWorkbenchState,
  profileHref,
} from './model-state';

describe('model workbench URL state', () => {
  it('round-trips two-to-four comparison selections', () => {
    const state = decodeModelWorkbenchState(new URLSearchParams('compare=gpt-4o,deepseek-v3'));

    expect(state.selectedModelIds).toEqual(['gpt-4o', 'deepseek-v3']);
    expect(encodeModelWorkbenchState(state).get('compare')).toBe('gpt-4o,deepseek-v3');
  });

  it('normalizes duplicate, blank, and excess comparison IDs without discarding a pending first selection', () => {
    const state = decodeModelWorkbenchState(new URLSearchParams('compare=gpt-4o,,gpt-4o,deepseek-v3,third,fourth,fifth'));

    expect(state.selectedModelIds).toEqual(['gpt-4o', 'deepseek-v3', 'third', 'fourth']);
    expect(encodeModelWorkbenchState({ ...state, selectedModelIds: ['gpt-4o'] }).get('compare')).toBe('gpt-4o');
  });

  it('keeps the preview profile query URL canonical', () => {
    expect(profileHref('gpt-4o')).toBe('/model-profile?model=gpt-4o');
  });
});
