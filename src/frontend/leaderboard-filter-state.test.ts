import { describe, expect, it } from 'vitest';
import type { LeaderboardEntry } from '../benchmarks/leaderboards';
import {
  leaderboardFilterCapabilities,
  parseLeaderboardFilters,
  serializeLeaderboardFilters,
} from './leaderboard-filter-state';

function entry(): LeaderboardEntry {
  return {
    model: {
      modelKey: 'alpha',
      slug: 'alpha',
      name: 'Alpha',
      creator: 'Provider A',
      sourceType: 'Open Weight',
      reasoningType: null,
      releaseDate: null,
      contextWindowTokens: 128_000,
      evidenceStatus: 'supported',
      rankingEligible: true,
      confidenceLower: null,
      confidenceUpper: null,
      benchmarkCount: 1,
      sourceId: 'benchlm',
      sourceModelId: 'alpha',
      sourceArtifactId: 'benchlm-models',
    },
    metric: {
      modelKey: 'alpha',
      metricKey: 'benchlm:category:coding',
      category: 'coding',
      value: 90,
      rank: null,
      lower: null,
      upper: null,
      voteCount: null,
      unit: 'score',
      sourceId: 'benchlm',
      sourceUpdatedAt: '2026-08-06T00:00:00.000Z',
      sourceModelId: 'alpha',
      sourceArtifactId: 'benchlm-models',
      rankingEligible: true,
      methodology: 'benchlm_raw_composite',
      observationCount: null,
      sessionCount: null,
    },
    metrics: [],
    primaryPrice: null,
    blendedCostPerMillion: null,
    contextWindowTokens: 128_000,
    sourceRank: null,
    onValueFrontier: false,
  };
}

describe('leaderboard filter state', () => {
  it('derives controls from the active route and data rather than showing hidden profile or lifecycle inputs', () => {
    const coding = leaderboardFilterCapabilities('llm-coding', [entry()]);
    const value = leaderboardFilterCapabilities('llm-value', [entry()]);

    expect(coding.supportsProfile).toBe(false);
    expect(coding.supportsLifecycle).toBe(false);
    expect(coding.providers).toEqual(['Provider A']);
    expect(value.supportsProfile).toBe(true);
  });

  it('normalizes shared UI URLs and serializes a restorable canonical search string', () => {
    const state = parseLeaderboardFilters(
      '?utm_source=newsletter&profile=outputHeavy&provider=Missing&sourceType=Open%20Weight&evidence=supported&q=Alpha',
      'llm-coding',
      [entry()],
    );

    expect(state).toEqual({
      query: 'Alpha',
      profile: 'balanced',
      priceMode: 'representative',
      metricKey: null,
      sort: 'score-desc',
      providers: [],
      sourceTypes: ['Open Weight'],
      evidence: 'supported',
      priceMinimum: null,
      priceMaximum: null,
      includeEstimated: false,
    });
    expect(serializeLeaderboardFilters(state)).toBe('profile=balanced&sort=score-desc&q=Alpha&sourceType=Open+Weight&evidence=supported');
  });
});
