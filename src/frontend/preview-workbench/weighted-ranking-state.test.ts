import { describe, expect, it } from 'vitest';
import { DEFAULT_WEIGHTED_RANKING_STATE, encodeWeightedRankingState, weightedRankingStateFromQuery } from './weighted-ranking-state';

describe('weightedRankingStateFromQuery', () => {
  it('round-trips shareable filters, weights, thresholds, list view, and model selections', () => {
    const state = {
      ...DEFAULT_WEIGHTED_RANKING_STATE,
      access: 'open' as const,
      providers: ['DeepSeek', 'OpenAI'],
      selectedModelIds: ['deepseek-v3', 'gpt-4o'],
      maxTtft: 0.55,
      minThroughput: 65,
      showOutsideSla: false,
      view: 'cards' as const,
      weights: { agentic: 15, coding: 25, reasoning: 30, math: 10, multimodal: 10, throughput: 10 },
    };

    expect(weightedRankingStateFromQuery(encodeWeightedRankingState(state))).toEqual(state);
  });

  it('falls back to safe defaults for malformed query state', () => {
    expect(weightedRankingStateFromQuery(new URLSearchParams('access=unsupported&ttft=wrong&weights=reasoning:-1')))
      .toEqual(DEFAULT_WEIGHTED_RANKING_STATE);
  });

  it('keeps every provider filter while limiting comparison selections to four', () => {
    const state = weightedRankingStateFromQuery(new URLSearchParams('provider=A,B,C,D,E&models=one,two,three,four,five'));

    expect(state.providers).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(state.selectedModelIds).toEqual(['one', 'two', 'three', 'four']);
  });
});
