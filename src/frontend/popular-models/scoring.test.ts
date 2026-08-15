import { describe, expect, it } from 'vitest';
import { POPULAR_MODEL_FIXTURES } from './fixtures';
import {
  DEFAULT_POPULAR_MODELS_FILTER_STATE,
  buildPopularLogCostScatter,
  filterPopularModels,
  formatPopularCost,
  normalizePopularComparisonSelection,
  sortPopularModels,
  topFivePopularModelIds,
} from './scoring';

describe('popular-model scoring helpers', () => {
  it('combines a case-insensitive search with organization and category-score filters', () => {
    const visibleFixtures = filterPopularModels(POPULAR_MODEL_FIXTURES, {
      ...DEFAULT_POPULAR_MODELS_FILTER_STATE,
      query: 'sonnet',
      organization: 'Anthropic',
      category: 'coding',
      minimumCategoryScore: 95,
    });

    expect(visibleFixtures.map(({ id }) => id)).toEqual(['claude-sonnet-4-5']);
  });

  it('sorts cost values ascending without mutating the input fixture order', () => {
    const selectedFixtures = POPULAR_MODEL_FIXTURES.slice(0, 3);
    const originalIds = selectedFixtures.map(({ id }) => id);

    expect(sortPopularModels(selectedFixtures, {
      key: 'costPerSuccessfulTask',
      direction: 'ascending',
    }).map(({ id }) => id)).toEqual([
      'claude-haiku-4-5',
      'claude-sonnet-4-5',
      'claude-opus-4-1',
    ]);
    expect(selectedFixtures.map(({ id }) => id)).toEqual(originalIds);
  });

  it('uses high score and low cost conventions when finding top-five fixture IDs', () => {
    expect(topFivePopularModelIds(POPULAR_MODEL_FIXTURES.slice(0, 6), 'overallScore')).toEqual([
      'claude-opus-4-1',
      'gemini-2-5-pro',
      'claude-sonnet-4-5',
      'deepseek-r1',
      'deepseek-v3-2',
    ]);
    expect(topFivePopularModelIds(POPULAR_MODEL_FIXTURES.slice(0, 6), 'costPerSuccessfulTask')).toEqual([
      'deepseek-v3-2',
      'claude-haiku-4-5',
      'gemini-2-5-pro',
      'deepseek-r1',
      'claude-sonnet-4-5',
    ]);
  });

  it('marks only non-dominated quality-cost points as the logarithmic value frontier', () => {
    const [highQualityFixture, lowCostFixture, dominatedFixture] = POPULAR_MODEL_FIXTURES;
    const scatter = buildPopularLogCostScatter([
      { ...highQualityFixture, costPerSuccessfulTask: 4, overallScore: 98 },
      { ...lowCostFixture, costPerSuccessfulTask: 0.2, overallScore: 82 },
      { ...dominatedFixture, costPerSuccessfulTask: 1, overallScore: 75 },
    ]);

    expect(scatter.points.find(({ id }) => id === lowCostFixture.id)?.logCost).toBeCloseTo(-0.699, 3);
    expect(scatter.valueFrontier.map(({ id }) => id)).toEqual([
      lowCostFixture.id,
      highQualityFixture.id,
    ]);
  });

  it('deduplicates, validates, bounds, and backfills comparison selections to two fixtures', () => {
    const selectedFixtures = POPULAR_MODEL_FIXTURES.slice(0, 3);

    expect(normalizePopularComparisonSelection([
      'not-a-fixture',
      selectedFixtures[1]!.id,
      selectedFixtures[1]!.id,
      selectedFixtures[2]!.id,
      selectedFixtures[0]!.id,
      'later-fixture',
    ], selectedFixtures)).toEqual([
      selectedFixtures[1]!.id,
      selectedFixtures[2]!.id,
      selectedFixtures[0]!.id,
    ]);
    expect(normalizePopularComparisonSelection([selectedFixtures[2]!.id], selectedFixtures)).toEqual([
      selectedFixtures[2]!.id,
      selectedFixtures[0]!.id,
    ]);
  });

  it('formats illustrative currency values precisely enough for compact UI labels', () => {
    expect(formatPopularCost(1.25)).toBe('$1.25');
    expect(formatPopularCost(0.0042)).toBe('$0.0042');
    expect(formatPopularCost(Number.NaN)).toBe('—');
  });
});
