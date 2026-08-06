import type { LeaderboardKey } from '../routing/routes';
import type { WorkloadProfile } from './value';

/** A revision-scoped response that powers the compare and leaderboard hubs. */
export const BENCHMARK_SUMMARY_CACHE_KEY = 'summary';

export interface BenchmarkLeaderboardCacheParameters {
  readonly key: LeaderboardKey;
  readonly profile: WorkloadProfile;
  readonly limit: number;
  readonly cursor: string | null;
  readonly includeEstimated: boolean;
}

/**
 * The cache key is derived only after request validation/defaulting. A cursor
 * is opaque but restricted to the base64url form before it reaches this key.
 */
export function benchmarkLeaderboardCacheKey(parameters: BenchmarkLeaderboardCacheParameters): string {
  return `leaderboard:${parameters.key}:${parameters.profile}:${parameters.limit}:${parameters.cursor ?? ''}:${parameters.includeEstimated ? '1' : '0'}`;
}

export interface BenchmarkLeaderboardProjectionCacheParameters {
  readonly key: LeaderboardKey;
  readonly profile: WorkloadProfile;
  readonly includeEstimated: boolean;
}

/** A complete ordered leaderboard projection used for bounded pagination. */
export function benchmarkLeaderboardProjectionCacheKey(
  parameters: BenchmarkLeaderboardProjectionCacheParameters,
): string {
  return `leaderboard-projection:${parameters.key}:${parameters.profile}:${parameters.includeEstimated ? '1' : '0'}`;
}
