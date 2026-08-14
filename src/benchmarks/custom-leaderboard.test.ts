import { describe, expect, it } from 'vitest';
import { buildCustomLeaderboard, normalizeCustomWeights } from './custom-leaderboard';

const models = [{
  id: 'balanced',
  scores: { agentic: 80, coding: 90, reasoning: 70, math: 75, multimodal: 60 },
  throughput: 100,
}, {
  id: 'fast',
  scores: { agentic: 70, coding: 70, reasoning: 70, math: 70, multimodal: 70 },
  throughput: 200,
}];

describe('custom leaderboard weights', () => {
  it('rejects the zero-sum case instead of producing a NaN composite', () => {
    expect(normalizeCustomWeights({ agentic: 0, coding: 0, reasoning: 0, math: 0, multimodal: 0, throughput: 0 }))
      .toEqual({ ok: false, reason: 'At least one weight must be greater than zero' });
    expect(buildCustomLeaderboard(models, { agentic: 0, coding: 0, reasoning: 0, math: 0, multimodal: 0, throughput: 0 })).toEqual([]);
  });

  it('uses all six exact weights and sums contribution points to the composite', () => {
    const ranking = buildCustomLeaderboard(models, {
      agentic: 25, coding: 25, reasoning: 20, math: 10, multimodal: 10, throughput: 10,
    });

    expect(ranking.every((row) => Number.isFinite(row.composite))).toBe(true);
    expect(ranking[0]!.contributions.reduce((sum, value) => sum + value.points, 0))
      .toBeCloseTo(ranking[0]!.composite, 8);
    expect(ranking[0]!.throughputRange).toEqual({ minimum: 100, maximum: 200, eligibleCount: 2 });
  });

  it('excludes only models that lack a positively weighted published domain', () => {
    const ranking = buildCustomLeaderboard([
      ...models,
      { id: 'incomplete', scores: { agentic: 99, coding: null, reasoning: 99, math: 99, multimodal: 99 }, throughput: 99 },
    ], { agentic: 1, coding: 0, reasoning: 1, math: 1, multimodal: 1, throughput: 1 });

    expect(ranking.map((row) => row.id)).toContain('incomplete');
    expect(ranking.find((row) => row.id === 'incomplete')?.excludedReason).toBeNull();
  });
});
