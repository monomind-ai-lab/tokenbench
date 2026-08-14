import { describe, expect, it } from 'vitest';
import type { LeaderboardEntry } from './leaderboards';
import { buildTopEntries, categoryViewFor, V21_LEADERBOARDS } from './v21-leaderboards';

function entry(index: number, metric = true): LeaderboardEntry {
  return {
    model: {
      modelKey: `model-${index}`,
      slug: `model-${index}`,
      name: `Model ${index}`,
      creator: 'Example Labs',
      sourceType: 'Proprietary',
      reasoningType: index === 0 ? 'Reasoning model' : null,
      releaseDate: null,
      contextWindowTokens: 128_000,
      evidenceStatus: 'supported',
      rankingEligible: true,
      confidenceLower: null,
      confidenceUpper: null,
      benchmarkCount: 1,
      sourceId: 'benchlm',
      sourceModelId: `model-${index}`,
      sourceArtifactId: 'benchlm-models',
    },
    metric: metric ? {
      modelKey: `model-${index}`,
      metricKey: 'benchlm:category:coding',
      category: 'coding',
      value: 100 - index,
      rawValue: null,
      rank: index + 1,
      lower: null,
      upper: null,
      voteCount: null,
      unit: 'score',
      sourceId: 'benchlm',
      sourceUpdatedAt: '2026-08-14T00:00:00.000Z',
      sourceModelId: `model-${index}`,
      sourceArtifactId: 'benchlm-models',
      rankingEligible: true,
      methodology: 'benchlm_raw_composite',
      observationCount: null,
      sessionCount: null,
    } : null,
    metrics: [],
    primaryPrice: null,
    blendedCostPerMillion: null,
    contextWindowTokens: 128_000,
    sourceRank: index + 1,
    onValueFrontier: false,
  };
}

describe('V2.1 leaderboards', () => {
  it('publishes the canonical category sequence and retains only scored Top 20 entries', () => {
    const entries = Array.from({ length: 25 }, (_, index) => entry(index));

    expect(V21_LEADERBOARDS.map((item) => item.slug)).toEqual([
      'overall', 'coding', 'agentic', 'math', 'reasoning', 'multimodal', 'sla', 'custom',
    ]);
    expect(buildTopEntries(entries, 20)).toHaveLength(20);
    expect(buildTopEntries([...entries, entry(99, false)], 20).every((item) => item.metric !== null)).toBe(true);
  });

  it('marks an unsupported category unavailable rather than borrowing another source lens', () => {
    const codingEntries = Array.from({ length: 3 }, (_, index) => entry(index));

    expect(categoryViewFor('math', codingEntries)).toMatchObject({ availability: 'unavailable', entries: [] });
  });
});
