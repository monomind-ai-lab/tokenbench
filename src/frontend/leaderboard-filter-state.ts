import {
  createLeaderboardQueryCapabilities,
  defaultLeaderboardQueryState,
  filterLeaderboardEntries,
  leaderboardQueryToSearchParams,
  normalizeLeaderboardQueryState,
  parseLeaderboardQuery,
  type LeaderboardQueryCapabilities,
  type LeaderboardQueryState,
} from '../benchmarks/leaderboard-query';
import { LEADERBOARD_DEFINITIONS, type LeaderboardEntry } from '../benchmarks/leaderboards';
import type { LeaderboardKey } from '../routing/routes';

/** Compatibility name for the UI's one shared query state; never a second state shape. */
export type LeaderboardFilterState = LeaderboardQueryState;
export type { LeaderboardQueryCapabilities } from '../benchmarks/leaderboard-query';

export function leaderboardFilterCapabilities(
  keyName: LeaderboardKey,
  entries?: readonly LeaderboardEntry[],
): LeaderboardQueryCapabilities {
  return createLeaderboardQueryCapabilities(LEADERBOARD_DEFINITIONS[keyName], entries);
}

export function defaultLeaderboardFilters(keyName: LeaderboardKey): LeaderboardFilterState {
  const definition = LEADERBOARD_DEFINITIONS[keyName];
  const capabilities = leaderboardFilterCapabilities(keyName);
  return defaultLeaderboardQueryState(definition, capabilities);
}

/**
 * Keeps a shared UI link usable before the page receives dynamic capabilities.
 * The API remains strict for dynamic values; the first bounded request omits
 * those values, then the complete projection either confirms or removes them.
 */
export function bootstrapLeaderboardFilters(
  keyName: LeaderboardKey,
  filters: LeaderboardFilterState,
): LeaderboardFilterState {
  const definition = LEADERBOARD_DEFINITIONS[keyName];
  return {
    ...filters,
    sort: definition.defaultSort,
    providers: [],
    sourceTypes: [],
    evidence: null,
    priceMinimum: null,
    priceMaximum: null,
  };
}

/** Reads only URL state and uses the forgiving UI branch of the shared parser. */
export function parseLeaderboardFilters(
  search: string,
  keyName: LeaderboardKey,
  entries?: readonly LeaderboardEntry[],
  capabilities?: LeaderboardQueryCapabilities,
): LeaderboardFilterState {
  const definition = LEADERBOARD_DEFINITIONS[keyName];
  const routeCapabilities = capabilities ?? leaderboardFilterCapabilities(keyName, entries);
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const parsed = parseLeaderboardQuery(params, definition, routeCapabilities, 'ui');
  return parsed.ok ? parsed.state : defaultLeaderboardQueryState(definition, routeCapabilities);
}

/** Stable ordering and URL encoding are owned by the shared benchmark contract. */
export function serializeLeaderboardFilters(filters: LeaderboardFilterState): string {
  return leaderboardQueryToSearchParams(filters).toString();
}

export function normalizeLeaderboardFilters(
  keyName: LeaderboardKey,
  filters: LeaderboardFilterState,
  entries?: readonly LeaderboardEntry[],
  capabilities?: LeaderboardQueryCapabilities,
): LeaderboardFilterState {
  const definition = LEADERBOARD_DEFINITIONS[keyName];
  return normalizeLeaderboardQueryState(filters, definition, capabilities ?? leaderboardFilterCapabilities(keyName, entries));
}

/** Preserves the published multimodal lens grouping only for its default view. */
export function visibleLeaderboardEntries(
  entries: readonly LeaderboardEntry[],
  filters: LeaderboardFilterState,
  keyName: LeaderboardKey,
): readonly LeaderboardEntry[] {
  const capabilities = leaderboardFilterCapabilities(keyName, entries);
  return filterLeaderboardEntries(entries, {
    ...filters,
    priceMode: capabilities.priceMode,
    preserveSourceLensOrder: keyName === 'multimodal-vision-documents'
      && filters.sort === LEADERBOARD_DEFINITIONS[keyName].defaultSort,
  });
}

export function sameLeaderboardFilters(left: LeaderboardFilterState, right: LeaderboardFilterState): boolean {
  return left.query === right.query
    && left.profile === right.profile
    && left.priceMode === right.priceMode
    && left.metricKey === right.metricKey
    && left.sort === right.sort
    && left.evidence === right.evidence
    && left.priceMinimum === right.priceMinimum
    && left.priceMaximum === right.priceMaximum
    && left.includeEstimated === right.includeEstimated
    && left.providers.length === right.providers.length
    && left.providers.every((value, index) => value === right.providers[index])
    && left.sourceTypes.length === right.sourceTypes.length
    && left.sourceTypes.every((value, index) => value === right.sourceTypes[index]);
}
