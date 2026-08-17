import { describe, expect, it } from 'vitest';
import {
  addCompareModel,
  decodeCompareState,
  encodeCompareState,
  removeCompareModel,
} from './compare-state';

describe('compare workbench URL state', () => {
  it('normalizes duplicate and excess model ids while preserving the requested order', () => {
    const state = decodeCompareState(new URLSearchParams('models=gpt-4o,gpt-4o,deepseek-v3,llama-3-3-70b,claude-3-5-sonnet,ignored'));

    expect(state.modelIds).toEqual(['gpt-4o', 'deepseek-v3', 'llama-3-3-70b', 'claude-3-5-sonnet']);
    expect(encodeCompareState(state).toString()).toBe('models=gpt-4o%2Cdeepseek-v3%2Cllama-3-3-70b%2Cclaude-3-5-sonnet');
  });

  it('adds and removes selected models without reordering retained selections', () => {
    expect(addCompareModel(['gpt-4o', 'deepseek-v3'], 'llama-3-3-70b')).toEqual(['gpt-4o', 'deepseek-v3', 'llama-3-3-70b']);
    expect(removeCompareModel(['gpt-4o', 'deepseek-v3', 'llama-3-3-70b'], 'deepseek-v3')).toEqual(['gpt-4o', 'llama-3-3-70b']);
  });
});
