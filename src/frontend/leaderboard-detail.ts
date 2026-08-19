import type { LeaderboardKey } from '../routing/leaderboard-routes';
import { LEADERBOARD_ROUTES } from '../routing/leaderboard-routes';
import type {
  EvidenceValue,
  RankingData,
  RankingEntry,
  UiDataContractV1,
} from './preview-data/contracts';

export type LeaderboardProfile = 'inputHeavy' | 'balanced' | 'outputHeavy';
export type LeaderboardView = 'cards' | 'list';
export type LeaderboardSort =
  | 'score-desc'
  | 'rank-asc'
  | 'pareto-score-desc'
  | 'price-asc'
  | 'context-desc';

export interface LeaderboardFilters {
  readonly search: string;
  readonly provider: string;
  readonly access: 'all' | 'open' | 'closed';
  readonly profile: LeaderboardProfile;
  readonly sort: LeaderboardSort;
  readonly view: LeaderboardView;
}

type LensKind = 'overall' | 'category' | 'value' | 'pricing' | 'unsupported';

export interface LeaderboardDetailDefinition {
  readonly key: LeaderboardKey;
  readonly sourceLabel: string;
  readonly kind: LensKind;
  readonly categoryTerms: readonly string[];
  readonly defaultProfile: LeaderboardProfile;
  readonly defaultSort: LeaderboardSort;
  readonly supportsProfile: boolean;
  readonly sortOptions: readonly LeaderboardSort[];
  readonly methodology: string;
  readonly positionNote: string;
  readonly unavailableReason: string;
}

export interface LeaderboardDisplayRow {
  readonly id: string;
  readonly name: string;
  readonly provider: string;
  readonly access: 'Open weights' | 'Proprietary' | 'Unavailable';
  readonly rank: number | null;
  readonly metric: number | null;
  readonly metricLabel: string;
  readonly fieldSize: number | null;
  readonly inputUsdPerMillion: number | null;
  readonly outputUsdPerMillion: number | null;
  readonly blendedUsdPerMillion: number | null;
  readonly contextWindowTokens: number | null;
  readonly maxOutputTokens: number | null;
  readonly route: string | null;
  readonly frontier: boolean;
}

const EXACT_SOURCE_POSITION = 'Positions use the published source rank for this exact lens. Missing positions stay unavailable and are never rebuilt from the filtered row number.';
const CATEGORY_POSITION = 'Positions use the published category rank when the source provides one. A missing category rank stays unranked rather than being inferred from the visible rows.';

const DETAIL_DEFINITIONS: Record<LeaderboardKey, Omit<LeaderboardDetailDefinition, 'key'>> = {
  'llm-overall': {
    sourceLabel: 'LiveBench',
    kind: 'overall',
    categoryTerms: [],
    defaultProfile: 'balanced',
    defaultSort: 'score-desc',
    supportsProfile: false,
    sortOptions: ['score-desc', 'rank-asc'],
    methodology: 'The overall view shows the published LiveBench global-average projection. Category evidence remains separate, and unavailable model or route facts are never converted to zero.',
    positionNote: EXACT_SOURCE_POSITION,
    unavailableReason: 'No verified LiveBench overall ranking is available for this release.',
  },
  'llm-coding': {
    sourceLabel: 'LiveBench',
    kind: 'category',
    categoryTerms: ['coding', 'code'],
    defaultProfile: 'balanced',
    defaultSort: 'score-desc',
    supportsProfile: false,
    sortOptions: ['score-desc', 'rank-asc'],
    methodology: 'Only the source-published coding category is shown. It is not blended with overall, reasoning, cost, or runtime evidence.',
    positionNote: CATEGORY_POSITION,
    unavailableReason: 'The active LiveBench release does not publish a coding category for this view.',
  },
  'llm-agentic': {
    sourceLabel: 'LiveBench',
    kind: 'category',
    categoryTerms: ['agentic', 'agent'],
    defaultProfile: 'balanced',
    defaultSort: 'score-desc',
    supportsProfile: false,
    sortOptions: ['score-desc', 'rank-asc'],
    methodology: 'Only an exact source-published agentic category is eligible. TokenBench does not treat coding or tool-use proxies as interchangeable agentic evidence.',
    positionNote: CATEGORY_POSITION,
    unavailableReason: 'The active LiveBench release does not publish an exact agentic category for this view.',
  },
  'llm-reasoning': {
    sourceLabel: 'LiveBench',
    kind: 'category',
    categoryTerms: ['reasoning'],
    defaultProfile: 'balanced',
    defaultSort: 'score-desc',
    supportsProfile: false,
    sortOptions: ['score-desc', 'rank-asc'],
    methodology: 'Reasoning remains a source-published category lens. It is not presented as a universal model ranking or inferred from adjacent benchmark categories.',
    positionNote: CATEGORY_POSITION,
    unavailableReason: 'The active LiveBench release does not publish a reasoning category for this view.',
  },
  'llm-knowledge': {
    sourceLabel: 'LiveBench',
    kind: 'category',
    categoryTerms: ['knowledge'],
    defaultProfile: 'balanced',
    defaultSort: 'score-desc',
    supportsProfile: false,
    sortOptions: ['score-desc', 'rank-asc'],
    methodology: 'Knowledge remains an exact source-published category lens. Language, reasoning, and instruction-following scores are not silently relabeled as knowledge.',
    positionNote: CATEGORY_POSITION,
    unavailableReason: 'The active LiveBench release does not publish an exact knowledge category for this view.',
  },
  'llm-human-preference': {
    sourceLabel: 'LMArena',
    kind: 'unsupported',
    categoryTerms: [],
    defaultProfile: 'balanced',
    defaultSort: 'rank-asc',
    supportsProfile: false,
    sortOptions: ['rank-asc', 'score-desc'],
    methodology: 'Human-preference evidence must remain an exact LMArena source lens. It is not reconstructed from LiveBench capability scores.',
    positionNote: EXACT_SOURCE_POSITION,
    unavailableReason: 'The v1 producer does not yet publish a verified LMArena human-preference projection.',
  },
  'llm-value': {
    sourceLabel: 'TokenBench',
    kind: 'value',
    categoryTerms: [],
    defaultProfile: 'balanced',
    defaultSort: 'pareto-score-desc',
    supportsProfile: true,
    sortOptions: ['pareto-score-desc', 'score-desc', 'price-asc', 'rank-asc'],
    methodology: 'This frontier pairs source-published overall capability with one selected, source-attributed route price under the disclosed workload mix. It is not an opaque universal value score.',
    positionNote: EXACT_SOURCE_POSITION,
    unavailableReason: 'A value frontier requires both verified capability and selected-route pricing; the active projection does not provide both.',
  },
  'llm-pricing-context': {
    sourceLabel: 'OpenRouter',
    kind: 'pricing',
    categoryTerms: [],
    defaultProfile: 'balanced',
    defaultSort: 'price-asc',
    supportsProfile: true,
    sortOptions: ['price-asc', 'context-desc'],
    methodology: 'Pricing and context stay tied to the exact selected provider route. Missing prices, context windows, and output limits remain unavailable.',
    positionNote: 'Rows are sorted by the selected pricing or context lens; no benchmark rank is implied.',
    unavailableReason: 'The v1 producer has no verified selected-route pricing projection for this view.',
  },
  'multimodal-vision-documents': {
    sourceLabel: 'LiveBench + LMArena',
    kind: 'category',
    categoryTerms: ['multimodalgrounded', 'multimodal', 'vision', 'document'],
    defaultProfile: 'balanced',
    defaultSort: 'score-desc',
    supportsProfile: false,
    sortOptions: ['score-desc', 'rank-asc'],
    methodology: 'Vision and document categories stay separately labelled by the publisher. TokenBench selects an exact published lens per model and never averages unlike source categories together.',
    positionNote: CATEGORY_POSITION,
    unavailableReason: 'The active v1 release does not publish a verified vision or document category for this view.',
  },
  'media-text-to-image': {
    sourceLabel: 'LMArena',
    kind: 'unsupported',
    categoryTerms: [],
    defaultProfile: 'balanced',
    defaultSort: 'rank-asc',
    supportsProfile: false,
    sortOptions: ['rank-asc', 'score-desc'],
    methodology: 'Text-to-image evidence remains an exact LMArena category with its own measured conditions, source rank, and publication time.',
    positionNote: EXACT_SOURCE_POSITION,
    unavailableReason: 'The v1 producer does not yet publish a verified LMArena text-to-image projection.',
  },
  'media-image-editing': {
    sourceLabel: 'LMArena',
    kind: 'unsupported',
    categoryTerms: [],
    defaultProfile: 'balanced',
    defaultSort: 'rank-asc',
    supportsProfile: false,
    sortOptions: ['rank-asc', 'score-desc'],
    methodology: 'Image-editing evidence remains an exact LMArena category; creation scores are not reused as editing scores.',
    positionNote: EXACT_SOURCE_POSITION,
    unavailableReason: 'The v1 producer does not yet publish a verified LMArena image-editing projection.',
  },
  'media-text-to-video': {
    sourceLabel: 'LMArena',
    kind: 'unsupported',
    categoryTerms: [],
    defaultProfile: 'balanced',
    defaultSort: 'rank-asc',
    supportsProfile: false,
    sortOptions: ['rank-asc', 'score-desc'],
    methodology: 'Text-to-video evidence remains an exact source category, with duration, controls, and evaluation conditions kept outside unrelated image rankings.',
    positionNote: EXACT_SOURCE_POSITION,
    unavailableReason: 'The v1 producer does not yet publish a verified LMArena text-to-video projection.',
  },
  'media-image-to-video': {
    sourceLabel: 'LMArena',
    kind: 'unsupported',
    categoryTerms: [],
    defaultProfile: 'balanced',
    defaultSort: 'rank-asc',
    supportsProfile: false,
    sortOptions: ['rank-asc', 'score-desc'],
    methodology: 'Image-to-video evidence remains an exact source category; text-to-video scores are not treated as a substitute.',
    positionNote: EXACT_SOURCE_POSITION,
    unavailableReason: 'The v1 producer does not yet publish a verified LMArena image-to-video projection.',
  },
  'media-video-editing': {
    sourceLabel: 'LMArena',
    kind: 'unsupported',
    categoryTerms: [],
    defaultProfile: 'balanced',
    defaultSort: 'rank-asc',
    supportsProfile: false,
    sortOptions: ['rank-asc', 'score-desc'],
    methodology: 'Video-editing evidence remains an exact source category and is not inferred from generation rankings.',
    positionNote: EXACT_SOURCE_POSITION,
    unavailableReason: 'The v1 producer does not yet publish a verified LMArena video-editing projection.',
  },
};

export function leaderboardDetailDefinition(key: LeaderboardKey): LeaderboardDetailDefinition {
  return { key, ...DETAIL_DEFINITIONS[key] };
}

export function leaderboardKeyFromSegments(segments: readonly string[]): LeaderboardKey | null {
  const pathname = `/leaderboards/${segments.join('/')}/`;
  return (Object.entries(LEADERBOARD_ROUTES) as [LeaderboardKey, (typeof LEADERBOARD_ROUTES)[LeaderboardKey]][])
    .find(([, route]) => route.pathname === pathname)?.[0] ?? null;
}

function singleParameter(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function parseLeaderboardFilters(
  definition: LeaderboardDetailDefinition,
  parameters: Readonly<Record<string, string | readonly string[] | undefined>>,
): LeaderboardFilters {
  const profile = singleParameter(parameters.profile);
  const sort = singleParameter(parameters.sort);
  const access = singleParameter(parameters.access);
  const view = singleParameter(parameters.view);
  return {
    search: singleParameter(parameters.search)?.slice(0, 120) ?? '',
    provider: singleParameter(parameters.provider)?.slice(0, 120) ?? 'all',
    access: access === 'open' || access === 'closed' ? access : 'all',
    profile: profile === 'inputHeavy' || profile === 'outputHeavy' ? profile : definition.defaultProfile,
    sort: definition.sortOptions.includes(sort as LeaderboardSort) ? sort as LeaderboardSort : definition.defaultSort,
    view: view === 'cards' ? 'cards' : 'list',
  };
}

export function serializeLeaderboardFilters(
  definition: LeaderboardDetailDefinition,
  filters: LeaderboardFilters,
): string {
  const parameters = new URLSearchParams();
  if (filters.search.trim()) parameters.set('search', filters.search.trim());
  if (filters.provider !== 'all') parameters.set('provider', filters.provider);
  if (filters.access !== 'all') parameters.set('access', filters.access);
  if (definition.supportsProfile && filters.profile !== definition.defaultProfile) parameters.set('profile', filters.profile);
  if (filters.sort !== definition.defaultSort) parameters.set('sort', filters.sort);
  if (filters.view !== 'list') parameters.set('view', filters.view);
  return parameters.toString();
}

function evidenceValue<T>(evidence: EvidenceValue<T>): T | null {
  return evidence.availability === 'available' ? evidence.value : null;
}

function normalized(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/gu, '');
}

function categoryFor(entry: RankingEntry, terms: readonly string[]) {
  const capability = evidenceValue(entry.model.capability);
  if (!capability) return null;
  const exactTerms = terms.map(normalized);
  return capability.radar.find((axis) => {
    const candidates = [normalized(axis.key), normalized(axis.label)];
    return exactTerms.some((term) => candidates.includes(term));
  }) ?? null;
}

function blendedPrice(input: number, output: number, profile: LeaderboardProfile): number {
  const inputShare = profile === 'inputHeavy' ? 0.75 : profile === 'outputHeavy' ? 0.25 : 0.5;
  return input * inputShare + output * (1 - inputShare);
}

function baseDisplayRow(entry: RankingEntry, profile: LeaderboardProfile): LeaderboardDisplayRow {
  const identity = evidenceValue(entry.model.identity);
  const access = evidenceValue(entry.model.access);
  const pricing = evidenceValue(entry.model.routePricing);
  return {
    id: entry.model.id,
    name: identity?.name ?? entry.model.id,
    provider: identity?.provider ?? 'Unavailable',
    access: access ?? 'Unavailable',
    rank: evidenceValue(entry.rank),
    metric: null,
    metricLabel: 'Unavailable',
    fieldSize: null,
    inputUsdPerMillion: pricing?.inputUsdPerMillion ?? null,
    outputUsdPerMillion: pricing?.outputUsdPerMillion ?? null,
    blendedUsdPerMillion: pricing ? blendedPrice(pricing.inputUsdPerMillion, pricing.outputUsdPerMillion, profile) : null,
    contextWindowTokens: pricing ? evidenceValue(pricing.contextWindowTokens) : null,
    maxOutputTokens: pricing ? evidenceValue(pricing.maxOutputTokens) : null,
    route: pricing?.route ?? null,
    frontier: false,
  };
}

function withParetoFrontier(rows: readonly LeaderboardDisplayRow[]): readonly LeaderboardDisplayRow[] {
  return rows.map((candidate) => {
    if (candidate.metric === null || candidate.blendedUsdPerMillion === null) return candidate;
    const candidateMetric = candidate.metric;
    const candidatePrice = candidate.blendedUsdPerMillion;
    const dominated = rows.some((other) => {
      if (candidate === other || other.metric === null || other.blendedUsdPerMillion === null) return false;
      return other.metric >= candidateMetric
        && other.blendedUsdPerMillion <= candidatePrice
        && (other.metric > candidateMetric || other.blendedUsdPerMillion < candidatePrice);
    });
    return { ...candidate, frontier: !dominated };
  });
}

function compareNullable(left: number | null, right: number | null, direction: 'asc' | 'desc'): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return direction === 'asc' ? left - right : right - left;
}

function sortRows(rows: readonly LeaderboardDisplayRow[], sort: LeaderboardSort): readonly LeaderboardDisplayRow[] {
  return rows.slice().sort((left, right) => {
    let result = 0;
    if (sort === 'score-desc') result = compareNullable(left.metric, right.metric, 'desc');
    else if (sort === 'rank-asc') result = compareNullable(left.rank, right.rank, 'asc');
    else if (sort === 'price-asc') result = compareNullable(left.blendedUsdPerMillion, right.blendedUsdPerMillion, 'asc');
    else if (sort === 'context-desc') result = compareNullable(left.contextWindowTokens, right.contextWindowTokens, 'desc');
    else {
      if (left.frontier !== right.frontier) result = left.frontier ? -1 : 1;
      else result = compareNullable(left.metric, right.metric, 'desc')
        || compareNullable(left.blendedUsdPerMillion, right.blendedUsdPerMillion, 'asc');
    }
    return result || left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
  });
}

export function projectLeaderboardRows(
  definition: LeaderboardDetailDefinition,
  envelope: UiDataContractV1<RankingData> | null,
  filters: LeaderboardFilters,
): readonly LeaderboardDisplayRow[] {
  if (definition.kind === 'unsupported' || envelope?.data === null || !envelope?.data) return [];
  let rows = envelope.data.models.flatMap((entry) => {
    const base = baseDisplayRow(entry, filters.profile);
    if (definition.kind === 'pricing') return base.route === null ? [] : [base];
    const capability = evidenceValue(entry.model.capability);
    if (!capability) return [];
    if (definition.kind === 'overall' || definition.kind === 'value') {
      const row = { ...base, metric: capability.compositeScore, metricLabel: 'Overall' };
      return definition.kind === 'value' && row.blendedUsdPerMillion === null ? [] : [row];
    }
    const category = categoryFor(entry, definition.categoryTerms);
    if (!category || category.percentile === null) return [];
    return [{
      ...base,
      rank: category.rank,
      metric: category.percentile,
      metricLabel: category.label,
      fieldSize: category.fieldSize,
    }];
  });
  if (definition.kind === 'value') rows = [...withParetoFrontier(rows)];
  const query = filters.search.trim().toLocaleLowerCase();
  rows = rows.filter((row) => !query || `${row.name} ${row.provider} ${row.route ?? ''}`.toLocaleLowerCase().includes(query));
  rows = rows.filter((row) => filters.provider === 'all' || row.provider === filters.provider);
  rows = rows.filter((row) => filters.access === 'all'
    || (filters.access === 'open' ? row.access === 'Open weights' : row.access === 'Proprietary'));
  return sortRows(rows, filters.sort);
}

export function providersForLeaderboard(envelope: UiDataContractV1<RankingData> | null): readonly string[] {
  if (!envelope?.data) return [];
  return [...new Set(envelope.data.models.flatMap((entry) => {
    const identity = evidenceValue(entry.model.identity);
    return identity ? [identity.provider] : [];
  }))].sort();
}
