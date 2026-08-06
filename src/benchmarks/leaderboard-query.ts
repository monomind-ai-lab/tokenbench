import type { EvidenceStatus } from './contracts';
import {
  sortLeaderboardEntries,
  type LeaderboardDefinition,
  type LeaderboardEntry,
  type LeaderboardSort,
} from './leaderboards';
import { isPrimaryHostedRoute, isWorkloadProfile, type WorkloadProfile } from './value';

export type LeaderboardSourceType = LeaderboardEntry['model']['sourceType'];
export type LeaderboardPriceMode = 'profile' | 'representative';

/** The one URL-backed filter state shared by the interactive UI and API consumers. */
export interface LeaderboardQueryState {
  readonly query: string;
  readonly profile: WorkloadProfile;
  /** Derived from the route; never accepted from or serialized into the URL. */
  readonly priceMode: LeaderboardPriceMode;
  readonly metricKey: string | null;
  readonly sort: LeaderboardSort;
  readonly providers: readonly string[];
  readonly sourceTypes: readonly LeaderboardSourceType[];
  readonly evidence: EvidenceStatus | null;
  readonly priceMinimum: number | null;
  readonly priceMaximum: number | null;
  readonly includeEstimated: boolean;
  /** Keeps the published multimodal lens grouping when the default sort is selected. */
  readonly preserveSourceLensOrder?: boolean;
}

/** Values that a route may truthfully expose from its definition and current rows. */
export interface LeaderboardQueryCapabilities {
  readonly dataReady: boolean;
  readonly defaultProfile: WorkloadProfile;
  readonly defaultSort: LeaderboardSort;
  readonly supportsProfile: boolean;
  readonly supportsEstimated: boolean;
  readonly supportsLifecycle: false;
  readonly priceMode: LeaderboardPriceMode;
  /** `null` means the UI has not received route rows yet. */
  readonly supportsPrice: boolean | null;
  readonly metricKeys: readonly string[];
  readonly sorts: readonly LeaderboardSort[];
  readonly providers: readonly string[] | null;
  readonly sourceTypes: readonly LeaderboardSourceType[] | null;
  readonly evidenceStatuses: readonly EvidenceStatus[] | null;
}

export type LeaderboardQueryParseResult =
  | { readonly ok: true; readonly state: LeaderboardQueryState }
  | { readonly ok: false; readonly status: 400; readonly error: string };

export type LeaderboardQueryInput = URLSearchParams | string;

/** Public query keys shared by the UI, JSON API, and complete CSV export. */
export const LEADERBOARD_QUERY_KEYS = [
  'q',
  'profile',
  'metric',
  'sort',
  'provider',
  'evidence',
  'sourceType',
  'lifecycle',
  'minPrice',
  'maxPrice',
  'estimated',
] as const;
export const LEADERBOARD_SINGLE_VALUE_QUERY_KEYS = [
  'q',
  'profile',
  'metric',
  'sort',
  'evidence',
  'lifecycle',
  'minPrice',
  'maxPrice',
  'estimated',
] as const;
const QUERY_KEYS = new Set<string>(LEADERBOARD_QUERY_KEYS);
const SOURCE_TYPES: readonly LeaderboardSourceType[] = ['Open Weight', 'Proprietary', 'Unknown'];
const EVIDENCE_STATUSES: readonly EvidenceStatus[] = ['supported', 'source_only', 'estimated'];
const SORT_ORDER: readonly LeaderboardSort[] = [
  'score-desc',
  'rank-asc',
  'pareto-score-desc',
  'price-asc',
  'context-desc',
];
const MAX_QUERY_LENGTH = 120;
const MAX_LIST_VALUES = 24;
const MAX_PRICE = 1_000_000_000;
const INVALID = Symbol('invalid query value');

type QueryValue = string | null | typeof INVALID;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort(compareText);
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isEvidenceStatus(value: unknown): value is EvidenceStatus {
  return typeof value === 'string' && EVIDENCE_STATUSES.includes(value as EvidenceStatus);
}

function supportsEstimatedModels(definition: LeaderboardDefinition): boolean {
  return definition.sourceId === 'benchlm' || definition.kind === 'multimodal';
}

function usesVisibleProfile(definition: LeaderboardDefinition): boolean {
  return definition.kind === 'value' || definition.kind === 'pricing-context';
}

function representativePrice(entry: LeaderboardEntry): number | null {
  const price = entry.primaryPrice;
  if (price === null
    || price.modelKey !== entry.model.modelKey
    || !isPrimaryHostedRoute(price)
    || !isNonNegativeFinite(price.inputUsdPerMillion)
    || !isNonNegativeFinite(price.outputUsdPerMillion)) return null;
  const result = (price.inputUsdPerMillion + price.outputUsdPerMillion) / 2;
  return isNonNegativeFinite(result) ? result : null;
}

function priceForEntry(entry: LeaderboardEntry, mode: LeaderboardPriceMode): number | null {
  if (mode === 'profile') return isNonNegativeFinite(entry.blendedCostPerMillion) ? entry.blendedCostPerMillion : null;
  return representativePrice(entry);
}

function metricKeysFor(entry: LeaderboardEntry): readonly string[] {
  return sortedUnique([
    ...(entry.metric === null ? [] : [entry.metric.metricKey]),
    ...entry.metrics.map((metric) => metric.metricKey),
  ]);
}

function allowedSorts(
  definition: LeaderboardDefinition,
  entries: readonly LeaderboardEntry[],
  priceMode: LeaderboardPriceMode,
): readonly LeaderboardSort[] {
  const allowed = new Set<LeaderboardSort>([definition.defaultSort]);
  if (entries.some((entry) => entry.metric !== null)) allowed.add('score-desc');
  if (entries.some((entry) => entry.sourceRank !== null)) allowed.add('rank-asc');
  if (definition.kind === 'value') allowed.add('pareto-score-desc');
  if (entries.some((entry) => priceForEntry(entry, priceMode) !== null)) allowed.add('price-asc');
  if (entries.some((entry) => entry.contextWindowTokens !== null)) allowed.add('context-desc');
  return SORT_ORDER.filter((sort) => allowed.has(sort));
}

function potentialSorts(definition: LeaderboardDefinition): readonly LeaderboardSort[] {
  const possible = new Set<LeaderboardSort>([definition.defaultSort]);
  if (definition.metricKeys.length > 0) possible.add('score-desc');
  if (definition.kind === 'value') {
    possible.add('pareto-score-desc');
  }
  if (definition.kind === 'lmarena' || definition.kind === 'multimodal') possible.add('rank-asc');
  possible.add('price-asc');
  possible.add('context-desc');
  return SORT_ORDER.filter((sort) => possible.has(sort));
}

/** Derives UI/API controls only from the route definition and published route data. */
export function createLeaderboardQueryCapabilities(
  definition: LeaderboardDefinition,
  entries?: readonly LeaderboardEntry[],
): LeaderboardQueryCapabilities {
  const routeEntriesKnown = entries !== undefined;
  const routeEntries = entries ?? [];
  const priceMode: LeaderboardPriceMode = usesVisibleProfile(definition) ? 'profile' : 'representative';
  return {
    dataReady: routeEntriesKnown,
    defaultProfile: 'balanced',
    defaultSort: definition.defaultSort,
    supportsProfile: usesVisibleProfile(definition),
    supportsEstimated: supportsEstimatedModels(definition),
    supportsLifecycle: false,
    priceMode,
    supportsPrice: routeEntriesKnown
      ? routeEntries.some((entry) => priceForEntry(entry, priceMode) !== null)
      : null,
    metricKeys: [...definition.metricKeys],
    sorts: routeEntriesKnown
      ? allowedSorts(definition, routeEntries, priceMode)
      : potentialSorts(definition),
    providers: routeEntriesKnown
      ? sortedUnique(routeEntries.map((entry) => entry.model.creator).filter((provider) => provider.trim().length > 0))
      : null,
    sourceTypes: routeEntriesKnown
      ? SOURCE_TYPES.filter((sourceType) => routeEntries.some((entry) => entry.model.sourceType === sourceType))
      : null,
    evidenceStatuses: routeEntriesKnown
      ? EVIDENCE_STATUSES.filter((status) => routeEntries.some((entry) => entry.model.evidenceStatus === status))
      : null,
  };
}

export function defaultLeaderboardQueryState(
  definition: LeaderboardDefinition,
  capabilities: Pick<LeaderboardQueryCapabilities, 'defaultProfile' | 'defaultSort' | 'priceMode'> = createLeaderboardQueryCapabilities(definition),
): LeaderboardQueryState {
  return {
    query: '',
    profile: capabilities.defaultProfile,
    priceMode: capabilities.priceMode,
    metricKey: null,
    sort: capabilities.defaultSort,
    providers: [],
    sourceTypes: [],
    evidence: null,
    priceMinimum: null,
    priceMaximum: null,
    includeEstimated: false,
  };
}

function parseList(values: readonly string[]): readonly string[] | null {
  if (values.length === 0 || values.length > MAX_LIST_VALUES || values.some((item) => item.length === 0 || item.length > MAX_QUERY_LENGTH)) return null;
  const normalized = sortedUnique(values.map((item) => item.trim()));
  if (normalized.some((item) => item.length === 0 || item.length > MAX_QUERY_LENGTH)) return null;
  return normalized.length === values.length ? normalized : null;
}

function parsePrice(value: string): number | null {
  if (!/^\d+(?:\.\d+)?$/.test(value)) return null;
  const parsed = Number(value);
  return isNonNegativeFinite(parsed) && parsed <= MAX_PRICE ? parsed : null;
}

function parseQueryText(value: string): string | null {
  const normalized = value.trim();
  if (normalized.length > MAX_QUERY_LENGTH || /[\u0000-\u001f\u007f]/.test(normalized)) return null;
  return normalized;
}

function isAllowedDynamicValue(values: readonly string[] | null, value: string, mode: 'ui' | 'api'): boolean {
  return values === null ? mode === 'ui' : values.includes(value);
}

function invalidResult(): LeaderboardQueryParseResult {
  return { ok: false, status: 400, error: 'Invalid leaderboard query' };
}

/** URLSearchParams repairs malformed escapes, so strict callers validate the untouched search first. */
export function hasValidLeaderboardQueryEncoding(search: string): boolean {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  try {
    decodeURIComponent(raw.replace(/\+/g, ' '));
    return true;
  } catch {
    return false;
  }
}

/**
 * Parses the public allowlist. UI parsing deliberately recovers to defaults so
 * shared links with unrelated campaign parameters remain usable; API callers
 * receive an explicit structured 400 instead.
 */
export function parseLeaderboardQuery(
  input: LeaderboardQueryInput,
  definition: LeaderboardDefinition,
  capabilities: LeaderboardQueryCapabilities,
  mode: 'ui' | 'api',
): LeaderboardQueryParseResult {
  if (mode === 'api' && typeof input === 'string' && !hasValidLeaderboardQueryEncoding(input)) return invalidResult();
  const params = typeof input === 'string'
    ? new URLSearchParams(input.startsWith('?') ? input.slice(1) : input)
    : input;
  if (mode === 'api' && [...params.keys()].some((name) => !QUERY_KEYS.has(name))) return invalidResult();

  let malformed = false;
  const readSingle = (name: string): QueryValue => {
    const values = params.getAll(name);
    if (values.length <= 1) return values[0] ?? null;
    malformed = true;
    return INVALID;
  };
  const defaults = defaultLeaderboardQueryState(definition, capabilities);
  let query = defaults.query;
  let profile = defaults.profile;
  let metricKey = defaults.metricKey;
  let sort = defaults.sort;
  let providers = defaults.providers;
  let sourceTypes = defaults.sourceTypes;
  let evidence = defaults.evidence;
  let priceMinimum = defaults.priceMinimum;
  let priceMaximum = defaults.priceMaximum;
  let includeEstimated = defaults.includeEstimated;

  const q = readSingle('q');
  if (q !== null) {
    const parsed = q === INVALID ? null : parseQueryText(q);
    if (parsed === null) malformed = true;
    else query = parsed;
  }

  const rawProfile = readSingle('profile');
  if (rawProfile !== null) {
    if (rawProfile === INVALID || !isWorkloadProfile(rawProfile)
      || (!capabilities.supportsProfile && rawProfile !== capabilities.defaultProfile)) malformed = true;
    else profile = rawProfile;
  }

  const rawMetric = readSingle('metric');
  if (rawMetric !== null) {
    if (rawMetric === INVALID || rawMetric.length === 0 || rawMetric.length > MAX_QUERY_LENGTH || !capabilities.metricKeys.includes(rawMetric)) malformed = true;
    else metricKey = rawMetric;
  }

  const rawSort = readSingle('sort');
  if (rawSort !== null) {
    const knownSort = rawSort !== INVALID && SORT_ORDER.includes(rawSort as LeaderboardSort);
    if (!knownSort || (capabilities.dataReady && !capabilities.sorts.includes(rawSort as LeaderboardSort))) malformed = true;
    else sort = rawSort as LeaderboardSort;
  }

  const rawProviders = params.getAll('provider');
  if (rawProviders.length > 0) {
    const parsed = parseList(rawProviders);
    if (parsed === null || !parsed.every((provider) => isAllowedDynamicValue(capabilities.providers, provider, mode))) malformed = true;
    else providers = parsed;
  }

  const rawSourceTypes = params.getAll('sourceType');
  if (rawSourceTypes.length > 0) {
    const parsed = parseList(rawSourceTypes);
    if (parsed === null || !parsed.every((sourceType) => SOURCE_TYPES.includes(sourceType as LeaderboardSourceType)
      && isAllowedDynamicValue(capabilities.sourceTypes, sourceType, mode))) malformed = true;
    else sourceTypes = parsed as readonly LeaderboardSourceType[];
  }

  const rawEvidence = readSingle('evidence');
  if (rawEvidence !== null) {
    if (rawEvidence === INVALID || !isEvidenceStatus(rawEvidence)
      || !isAllowedDynamicValue(capabilities.evidenceStatuses, rawEvidence, mode)) malformed = true;
    else evidence = rawEvidence;
  }

  const rawMinimum = readSingle('minPrice');
  if (rawMinimum !== null) {
    const parsed = rawMinimum === INVALID ? null : parsePrice(rawMinimum);
    if (parsed === null || capabilities.supportsPrice === false || (mode === 'api' && capabilities.supportsPrice === null)) malformed = true;
    else priceMinimum = parsed;
  }

  const rawMaximum = readSingle('maxPrice');
  if (rawMaximum !== null) {
    const parsed = rawMaximum === INVALID ? null : parsePrice(rawMaximum);
    if (parsed === null || capabilities.supportsPrice === false || (mode === 'api' && capabilities.supportsPrice === null)) malformed = true;
    else priceMaximum = parsed;
  }

  const rawEstimated = readSingle('estimated');
  if (rawEstimated !== null) {
    if (rawEstimated === INVALID || rawEstimated !== '1' || !capabilities.supportsEstimated) malformed = true;
    else includeEstimated = true;
  }

  // Lifecycle is deliberately allowlisted for a useful API error rather than
  // becoming an unknown field. No published entry currently carries that fact.
  if (params.has('lifecycle')) {
    if (params.getAll('lifecycle').length > 1) malformed = true;
    if (mode === 'api' || capabilities.supportsLifecycle) malformed = true;
  }

  if (priceMinimum !== null && priceMaximum !== null && priceMinimum > priceMaximum) {
    malformed = true;
    priceMinimum = null;
    priceMaximum = null;
  }
  if (evidence === 'estimated' && !includeEstimated) {
    malformed = true;
    evidence = null;
  }

  if (mode === 'api' && malformed) return invalidResult();

  return {
    ok: true,
    state: {
      query,
      profile,
      priceMode: capabilities.priceMode,
      metricKey,
      sort,
      providers,
      sourceTypes,
      evidence,
      priceMinimum,
      priceMaximum,
      includeEstimated,
    },
  };
}

function canonicalList(values: readonly string[]): readonly string[] {
  return sortedUnique(values
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && value.length <= MAX_QUERY_LENGTH));
}

function canonicalPrice(value: number | null): string | null {
  return isNonNegativeFinite(value) && value <= MAX_PRICE ? String(value) : null;
}

/** Stable key ordering and URLSearchParams encoding make links shareable. */
export function leaderboardQueryToSearchParams(state: LeaderboardQueryState): URLSearchParams {
  const params = new URLSearchParams();
  params.set('profile', isWorkloadProfile(state.profile) ? state.profile : 'balanced');
  params.set('sort', SORT_ORDER.includes(state.sort) ? state.sort : 'score-desc');
  const query = parseQueryText(state.query);
  if (query) params.set('q', query);
  if (state.metricKey && state.metricKey.length <= MAX_QUERY_LENGTH) params.set('metric', state.metricKey);
  const providers = canonicalList(state.providers);
  for (const provider of providers) params.append('provider', provider);
  const sourceTypes = canonicalList(state.sourceTypes).filter((value): value is LeaderboardSourceType => SOURCE_TYPES.includes(value as LeaderboardSourceType));
  for (const sourceType of sourceTypes) params.append('sourceType', sourceType);
  if (isEvidenceStatus(state.evidence)) params.set('evidence', state.evidence);
  const minimum = canonicalPrice(state.priceMinimum);
  const maximum = canonicalPrice(state.priceMaximum);
  const hasContradictoryRange = minimum !== null
    && maximum !== null
    && Number(minimum) > Number(maximum);
  if (!hasContradictoryRange) {
    if (minimum !== null) params.set('minPrice', minimum);
    if (maximum !== null) params.set('maxPrice', maximum);
  }
  if (state.includeEstimated) params.set('estimated', '1');
  return params;
}

/** Normalizes any control update through the same forgiving UI parser. */
export function normalizeLeaderboardQueryState(
  state: LeaderboardQueryState,
  definition: LeaderboardDefinition,
  capabilities: LeaderboardQueryCapabilities,
): LeaderboardQueryState {
  const parsed = parseLeaderboardQuery(leaderboardQueryToSearchParams(state), definition, capabilities, 'ui');
  return parsed.ok ? parsed.state : defaultLeaderboardQueryState(definition, capabilities);
}

function matchesQuery(entry: LeaderboardEntry, query: string): boolean {
  if (query.length === 0) return true;
  const lowerQuery = query.toLocaleLowerCase();
  return [entry.model.name, entry.model.creator, entry.model.slug]
    .some((value) => value.toLocaleLowerCase().includes(lowerQuery));
}

function matchesMetric(entry: LeaderboardEntry, metricKey: string | null): boolean {
  return metricKey === null || metricKeysFor(entry).includes(metricKey);
}

function entryWithDisplayPrice(entry: LeaderboardEntry, mode: LeaderboardPriceMode): LeaderboardEntry {
  const price = priceForEntry(entry, mode);
  return entry.blendedCostPerMillion === price ? entry : { ...entry, blendedCostPerMillion: price };
}

function matchesPrice(entry: LeaderboardEntry, minimum: number | null, maximum: number | null): boolean {
  if (minimum === null && maximum === null) return true;
  const price = entry.blendedCostPerMillion;
  return price !== null
    && (minimum === null || price >= minimum)
    && (maximum === null || price <= maximum);
}

/**
 * Applies predicates in the published order and only then sorts the complete
 * non-estimated result with the existing deterministic tie-breakers.
 */
export function filterLeaderboardEntries(
  entries: readonly LeaderboardEntry[],
  state: LeaderboardQueryState,
): readonly LeaderboardEntry[] {
  const prepared = entries.map((entry) => entryWithDisplayPrice(entry, state.priceMode));
  const queryFiltered = prepared.filter((entry) => matchesQuery(entry, state.query.trim()));
  const providerFiltered = state.providers.length === 0
    ? queryFiltered
    : queryFiltered.filter((entry) => state.providers.includes(entry.model.creator));
  const sourceFiltered = state.sourceTypes.length === 0
    ? providerFiltered
    : providerFiltered.filter((entry) => state.sourceTypes.includes(entry.model.sourceType));
  const evidenceFiltered = state.evidence === null
    ? sourceFiltered
    : sourceFiltered.filter((entry) => entry.model.evidenceStatus === state.evidence);
  const priceFiltered = evidenceFiltered.filter((entry) => matchesPrice(entry, state.priceMinimum, state.priceMaximum));
  const metricFiltered = priceFiltered.filter((entry) => matchesMetric(entry, state.metricKey));
  const ranked = metricFiltered.filter((entry) => entry.model.evidenceStatus !== 'estimated');
  const estimates = state.includeEstimated
    ? metricFiltered
      .filter((entry) => entry.model.evidenceStatus === 'estimated')
      .slice()
      .sort((left, right) => compareText(left.model.slug, right.model.slug) || compareText(left.model.modelKey, right.model.modelKey))
    : [];
  const sortedRanked = state.preserveSourceLensOrder
    ? ranked
    : sortLeaderboardEntries(ranked, state.sort);
  return [...sortedRanked, ...estimates];
}
