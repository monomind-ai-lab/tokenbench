import { describe, expect, it } from 'vitest';
import {
  buildWeightedRanking,
  validateWeights,
  type WeightedRankingModel,
} from './weighted-ranking';

const models: readonly WeightedRankingModel[] = [
  {
    id: 'alpha', name: 'Alpha', provider: 'Provider A', access: 'Proprietary', cost: 2, ttft: 0.4, throughput: 100,
    scores: { agentic: 75, coding: 60, reasoning: 90, math: 50, multimodal: 40, throughput: 80 },
  },
  {
    id: 'beta', name: 'Beta', provider: 'Provider B', access: 'Open weights', cost: 1, ttft: 0.9, throughput: 55,
    scores: { agentic: 40, coding: 95, reasoning: 70, math: 70, multimodal: 80, throughput: 50 },
  },
];

describe('buildWeightedRanking', () => {
  it('normalizes active weights before computing the weighted score', () => {
    const result = buildWeightedRanking({
      models,
      weights: { agentic: 0, coding: 1, reasoning: 2, math: 0, multimodal: 0, throughput: 0 },
      filters: { access: 'all', providers: [], maxTtft: 1.2, minThroughput: 20, showOutsideSla: true },
    });

    expect(result.rows[0]?.score).toBeCloseTo((90 * 2 + 60) / 3, 6);
    expect(result.rows.map((row) => row.id)).toEqual(['alpha', 'beta']);
  });

  it('returns a recoverable validation result when every weight is zero', () => {
    expect(validateWeights({ agentic: 0, coding: 0, reasoning: 0, math: 0, multimodal: 0, throughput: 0 }))
      .toEqual({ valid: false, reason: 'At least one capability weight must be greater than zero.' });
  });

  it('keeps chart and semantic-table ordering identical after SLA filtering', () => {
    const result = buildWeightedRanking({
      models,
      weights: { agentic: 20, coding: 20, reasoning: 20, math: 15, multimodal: 15, throughput: 10 },
      filters: { access: 'all', providers: [], maxTtft: 0.8, minThroughput: 60, showOutsideSla: false },
    });

    expect(result.rows.map((row) => row.id)).toEqual(['alpha']);
    expect(result.tableRows.map((row) => row.id)).toEqual(result.chartRows.map((row) => row.id));
  });
});
