import { describe, expect, it } from 'vitest';
import {
  buildWeightedRanking,
  validateWeights,
  type WeightedRankingModel,
} from './weighted-ranking';

const models: readonly WeightedRankingModel[] = [
  {
    id: 'alpha', name: 'Alpha', provider: 'Provider A', access: 'Proprietary', cost: 2, ttft: 0.4, throughput: 100,
    scores: { reasoning: 90, coding: 60, 'agentic-coding': 75, mathematics: 50, 'data-analysis': 40, language: 70, 'instruction-following': 80 },
  },
  {
    id: 'beta', name: 'Beta', provider: 'Provider B', access: 'Open weights', cost: 1, ttft: 0.9, throughput: 55,
    scores: { reasoning: 70, coding: 95, 'agentic-coding': 40, mathematics: 70, 'data-analysis': 80, language: 65, 'instruction-following': 50 },
  },
];

describe('buildWeightedRanking', () => {
  it('normalizes active weights before computing the weighted score', () => {
    const result = buildWeightedRanking({
      models,
      weights: { reasoning: 2, coding: 1, 'agentic-coding': 0, mathematics: 0, 'data-analysis': 0, language: 0, 'instruction-following': 0 },
      filters: { access: 'all', providers: [], maxTtft: 1.2, minThroughput: 20, showOutsideSla: true },
    });

    expect(result.rows[0]?.score).toBeCloseTo((90 * 2 + 60) / 3, 6);
    expect(result.rows.map((row) => row.id)).toEqual(['alpha', 'beta']);
  });

  it('returns a recoverable validation result when every weight is zero', () => {
    expect(validateWeights({ reasoning: 0, coding: 0, 'agentic-coding': 0, mathematics: 0, 'data-analysis': 0, language: 0, 'instruction-following': 0 }))
      .toEqual({ valid: false, reason: 'At least one capability weight must be greater than zero.' });
  });

  it('keeps chart and semantic-table ordering identical after SLA filtering', () => {
    const result = buildWeightedRanking({
      models,
      weights: { reasoning: 20, coding: 20, 'agentic-coding': 20, mathematics: 15, 'data-analysis': 10, language: 5, 'instruction-following': 10 },
      filters: { access: 'all', providers: [], maxTtft: 0.8, minThroughput: 60, showOutsideSla: false },
    });

    expect(result.rows.map((row) => row.id)).toEqual(['alpha']);
    expect(result.tableRows.map((row) => row.id)).toEqual(result.chartRows.map((row) => row.id));
  });

  it('keeps TTFT and throughput eligibility independent', () => {
    const result = buildWeightedRanking({
      models: [{
        ...models[0],
        id: 'slow-output',
        ttft: 0.4,
        throughput: 55,
      }],
      weights: { reasoning: 20, coding: 20, 'agentic-coding': 20, mathematics: 15, 'data-analysis': 10, language: 5, 'instruction-following': 10 },
      filters: { access: 'all', providers: [], maxTtft: 0.8, minThroughput: 60, showOutsideSla: true },
    });

    expect(result.rows[0]).toMatchObject({ meetsTtft: true, meetsThroughput: false, meetsSla: false });
  });
});
