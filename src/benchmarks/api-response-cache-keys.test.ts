import { describe, expect, it } from 'vitest';
import {
  BENCHMARK_SUMMARY_CACHE_KEY,
  benchmarkLeaderboardCacheKey,
  benchmarkLeaderboardProjectionCacheKey,
  benchmarkPricePerformanceProjectionCacheKey,
} from './api-response-cache-keys';

describe('benchmark API response cache keys', () => {
  it('keeps the price-performance complete projection on a stable, materialized key', () => {
    expect(benchmarkPricePerformanceProjectionCacheKey()).toBe('price-performance:complete:v1');
  });

  it('keeps the complete projection key distinct from summary and leaderboard keys', () => {
    const complete = benchmarkPricePerformanceProjectionCacheKey();
    expect(complete).not.toBe(BENCHMARK_SUMMARY_CACHE_KEY);
    expect(complete).not.toBe(benchmarkLeaderboardCacheKey({
      key: 'llm-overall',
      profile: 'balanced',
      limit: 50,
      cursor: null,
      includeEstimated: false,
    }));
    expect(complete).not.toBe(benchmarkLeaderboardProjectionCacheKey({
      key: 'llm-overall',
      profile: 'balanced',
      includeEstimated: false,
    }));
  });
});
