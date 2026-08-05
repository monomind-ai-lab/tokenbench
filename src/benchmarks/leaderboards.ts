import type {
  BenchmarkMetric,
  BenchmarkModel,
  BenchmarkPriceCheck,
  BenchmarkSourceId,
} from './contracts';
import type { LeaderboardKey } from '../routing/routes';
import {
  isWorkloadProfile,
  paretoFrontier,
  primaryHostedPriceForModel,
  primaryHostedRoutesForModel,
  type WorkloadProfile,
  type ValueCandidate,
} from './value';

export type LeaderboardSort = 'score-desc' | 'rank-asc' | 'pareto-score-desc' | 'price-asc' | 'context-desc';
export type LeaderboardKind = 'benchlm' | 'lmarena' | 'value' | 'pricing-context' | 'multimodal';

export interface LeaderboardDefinition {
  readonly kind: LeaderboardKind;
  readonly sourceId?: BenchmarkSourceId;
  readonly metricKeys: readonly string[];
  readonly defaultSort: LeaderboardSort;
  readonly userSortable?: boolean;
}

const BENCHLM_OVERALL = 'benchlm:overall:raw';
const BENCHLM_CODING = 'benchlm:category:coding';
const BENCHLM_AGENTIC = 'benchlm:category:agentic';
const BENCHLM_MULTIMODAL = 'benchlm:category:multimodal';
const LMARENA_HUMAN_PREFERENCE = 'lmarena:text_style_control:overall';
const LMARENA_VISION = 'lmarena:vision_style_control:overall';
const LMARENA_DOCUMENT = 'lmarena:document_style_control:overall';

/** This is the sole v1 route-to-evidence registry; no metric names are inferred. */
export const LEADERBOARD_DEFINITIONS = {
  'llm-overall': {
    kind: 'benchlm',
    sourceId: 'benchlm',
    metricKeys: [BENCHLM_OVERALL],
    defaultSort: 'score-desc',
  },
  'llm-coding': {
    kind: 'benchlm',
    sourceId: 'benchlm',
    metricKeys: [BENCHLM_CODING],
    defaultSort: 'score-desc',
  },
  'llm-agentic': {
    kind: 'benchlm',
    sourceId: 'benchlm',
    metricKeys: [BENCHLM_AGENTIC],
    defaultSort: 'score-desc',
  },
  'llm-human-preference': {
    kind: 'lmarena',
    sourceId: 'lmarena',
    metricKeys: [LMARENA_HUMAN_PREFERENCE],
    defaultSort: 'rank-asc',
  },
  'llm-value': {
    kind: 'value',
    sourceId: 'benchlm',
    metricKeys: [BENCHLM_OVERALL],
    defaultSort: 'pareto-score-desc',
  },
  'llm-pricing-context': {
    kind: 'pricing-context',
    sourceId: 'openrouter',
    metricKeys: [],
    defaultSort: 'price-asc',
    userSortable: true,
  },
  'multimodal-vision-documents': {
    kind: 'multimodal',
    metricKeys: [BENCHLM_MULTIMODAL, LMARENA_VISION, LMARENA_DOCUMENT],
    defaultSort: 'score-desc',
  },
  'media-text-to-image': {
    kind: 'lmarena',
    sourceId: 'lmarena',
    metricKeys: ['lmarena:text_to_image:overall'],
    defaultSort: 'rank-asc',
  },
  'media-image-editing': {
    kind: 'lmarena',
    sourceId: 'lmarena',
    metricKeys: ['lmarena:image_edit:overall'],
    defaultSort: 'rank-asc',
  },
  'media-text-to-video': {
    kind: 'lmarena',
    sourceId: 'lmarena',
    metricKeys: ['lmarena:text_to_video:overall'],
    defaultSort: 'rank-asc',
  },
  'media-image-to-video': {
    kind: 'lmarena',
    sourceId: 'lmarena',
    metricKeys: ['lmarena:image_to_video:overall'],
    defaultSort: 'rank-asc',
  },
  'media-video-editing': {
    kind: 'lmarena',
    sourceId: 'lmarena',
    metricKeys: ['lmarena:video_edit:overall'],
    defaultSort: 'rank-asc',
  },
} as const satisfies Record<LeaderboardKey, LeaderboardDefinition>;

export interface LeaderboardEntry {
  readonly model: BenchmarkModel;
  /** Primary source metric for the route or null for price/context rows. */
  readonly metric: BenchmarkMetric | null;
  /** Separate exact source lenses; these are never averaged or normalized together. */
  readonly metrics: readonly BenchmarkMetric[];
  readonly primaryPrice: BenchmarkPriceCheck | null;
  readonly blendedCostPerMillion: number | null;
  readonly contextWindowTokens: number | null;
  /** An upstream LMArena rank, kept separate from the rendered row position. */
  readonly sourceRank: number | null;
  readonly onValueFrontier: boolean;
}

export interface LeaderboardResult {
  readonly key: LeaderboardKey;
  readonly profile: WorkloadProfile;
  readonly definition: LeaderboardDefinition;
  readonly entries: readonly LeaderboardEntry[];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareModels(left: BenchmarkModel, right: BenchmarkModel): number {
  const slugOrder = compareText(left.slug, right.slug);
  return slugOrder !== 0 ? slugOrder : compareText(left.modelKey, right.modelKey);
}

function isFiniteMetric(metric: BenchmarkMetric): boolean {
  return Number.isFinite(metric.value);
}

function isPositiveRank(rank: number | null): rank is number {
  return Number.isSafeInteger(rank) && rank > 0;
}

function isSupportedBenchLmMetric(model: BenchmarkModel, metric: BenchmarkMetric, metricKey: string): boolean {
  return model.sourceId === 'benchlm'
    && model.evidenceStatus === 'supported'
    // Overall and value views use the model-level overall eligibility. Safe
    // category views deliberately rely on their own category eligibility.
    && (metricKey !== BENCHLM_OVERALL || model.rankingEligible)
    && metric.modelKey === model.modelKey
    && metric.sourceId === 'benchlm'
    && metric.metricKey === metricKey
    && metric.methodology === 'benchlm_raw_composite'
    && metric.rankingEligible
    && isFiniteMetric(metric);
}

function isExactLmArenaMetric(model: BenchmarkModel, metric: BenchmarkMetric, metricKey: string): boolean {
  if (model.evidenceStatus === 'estimated') return false;
  if (model.evidenceStatus === 'source_only' && model.sourceId !== 'lmarena') return false;
  return metric.modelKey === model.modelKey
    && metric.sourceId === 'lmarena'
    && metric.metricKey === metricKey
    && metric.methodology === 'bradley_terry'
    && metric.rankingEligible
    && isFiniteMetric(metric)
    && isPositiveRank(metric.rank);
}

function selectMetric(
  model: BenchmarkModel,
  metrics: readonly BenchmarkMetric[],
  predicate: (metric: BenchmarkMetric) => boolean,
): BenchmarkMetric | null {
  const matches = metrics.filter(predicate).slice().sort((left, right) => {
    const updatedOrder = compareText(right.sourceUpdatedAt, left.sourceUpdatedAt);
    if (updatedOrder !== 0) return updatedOrder;
    const artifactOrder = compareText(left.sourceArtifactId, right.sourceArtifactId);
    return artifactOrder !== 0 ? artifactOrder : compareText(left.sourceModelId, right.sourceModelId);
  });
  return matches.find((metric) => metric.modelKey === model.modelKey) ?? null;
}

function sourceRank(metric: BenchmarkMetric | null): number | null {
  return metric && isPositiveRank(metric.rank) ? metric.rank : null;
}

function validContextWindow(value: number | null): number | null {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function makeEntry(
  model: BenchmarkModel,
  metric: BenchmarkMetric | null,
  metrics: readonly BenchmarkMetric[] = metric ? [metric] : [],
  primaryPrice: BenchmarkPriceCheck | null = null,
  blendedCostPerMillion: number | null = null,
  onValueFrontier = false,
): LeaderboardEntry {
  return {
    model,
    metric,
    metrics: [...metrics],
    primaryPrice,
    blendedCostPerMillion,
    contextWindowTokens: validContextWindow(primaryPrice === null
      ? model.contextWindowTokens
      : primaryPrice.contextWindowTokens),
    sourceRank: metric?.sourceId === 'lmarena' ? sourceRank(metric) : null,
    onValueFrontier,
  };
}

function sortNullableAscending(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

function sortNullableDescending(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

function entrySlugOrder(left: LeaderboardEntry, right: LeaderboardEntry): number {
  const slugOrder = compareText(left.model.slug, right.model.slug);
  return slugOrder !== 0 ? slugOrder : compareText(left.model.modelKey, right.model.modelKey);
}

/** Returns a sorted copy so API/UI callers can offer a deterministic sort control. */
export function sortLeaderboardEntries(
  entries: readonly LeaderboardEntry[],
  sort: LeaderboardSort,
): readonly LeaderboardEntry[] {
  return entries.slice().sort((left, right) => {
    if (sort === 'score-desc') {
      const scoreOrder = sortNullableDescending(left.metric?.value ?? null, right.metric?.value ?? null);
      return scoreOrder !== 0 ? scoreOrder : entrySlugOrder(left, right);
    }
    if (sort === 'rank-asc') {
      const rankOrder = sortNullableAscending(left.sourceRank, right.sourceRank);
      return rankOrder !== 0 ? rankOrder : entrySlugOrder(left, right);
    }
    if (sort === 'price-asc') {
      const costOrder = sortNullableAscending(left.blendedCostPerMillion, right.blendedCostPerMillion);
      if (costOrder !== 0) return costOrder;
      return entrySlugOrder(left, right);
    }
    if (sort === 'context-desc') {
      const contextOrder = sortNullableDescending(left.contextWindowTokens, right.contextWindowTokens);
      return contextOrder !== 0 ? contextOrder : entrySlugOrder(left, right);
    }

    if (left.onValueFrontier !== right.onValueFrontier) return left.onValueFrontier ? -1 : 1;
    const scoreOrder = sortNullableDescending(left.metric?.value ?? null, right.metric?.value ?? null);
    if (scoreOrder !== 0) return scoreOrder;
    const costOrder = sortNullableAscending(left.blendedCostPerMillion, right.blendedCostPerMillion);
    return costOrder !== 0 ? costOrder : entrySlugOrder(left, right);
  });
}

function buildBenchLmLeaderboard(
  definition: LeaderboardDefinition,
  models: readonly BenchmarkModel[],
  metrics: readonly BenchmarkMetric[],
): readonly LeaderboardEntry[] {
  const metricKey = definition.metricKeys[0];
  const entries = models
    .slice()
    .sort(compareModels)
    .flatMap((model) => {
      const metric = selectMetric(model, metrics, (candidate) => isSupportedBenchLmMetric(model, candidate, metricKey));
      return metric ? [makeEntry(model, metric)] : [];
    });
  return sortLeaderboardEntries(entries, definition.defaultSort);
}

function buildLmArenaLeaderboard(
  definition: LeaderboardDefinition,
  models: readonly BenchmarkModel[],
  metrics: readonly BenchmarkMetric[],
): readonly LeaderboardEntry[] {
  const metricKey = definition.metricKeys[0];
  const entries = models
    .slice()
    .sort(compareModels)
    .flatMap((model) => {
      const metric = selectMetric(model, metrics, (candidate) => isExactLmArenaMetric(model, candidate, metricKey));
      return metric ? [makeEntry(model, metric)] : [];
    });
  return sortLeaderboardEntries(entries, definition.defaultSort);
}

function buildValueLeaderboard(
  definition: LeaderboardDefinition,
  models: readonly BenchmarkModel[],
  metrics: readonly BenchmarkMetric[],
  prices: readonly BenchmarkPriceCheck[],
  profile: WorkloadProfile,
): readonly LeaderboardEntry[] {
  const metricKey = definition.metricKeys[0];
  const entries = models
    .slice()
    .sort(compareModels)
    .flatMap((model) => {
      const metric = selectMetric(model, metrics, (candidate) => isSupportedBenchLmMetric(model, candidate, metricKey));
      if (!metric) return [];
      const hostedPrice = primaryHostedPriceForModel(model.modelKey, prices, profile);
      return hostedPrice
        ? [makeEntry(model, metric, [metric], hostedPrice.price, hostedPrice.blendedCostPerMillion)]
        : [];
    });

  const frontierKeys = new Set(paretoFrontier(entries.map<ValueCandidate>((entry) => ({
    modelKey: entry.model.modelKey,
    slug: entry.model.slug,
    score: entry.metric?.value ?? Number.NaN,
    blendedCostPerMillion: entry.blendedCostPerMillion ?? Number.NaN,
  }))).map((candidate) => candidate.modelKey));
  const marked = entries.map((entry) => ({ ...entry, onValueFrontier: frontierKeys.has(entry.model.modelKey) }));
  return sortLeaderboardEntries(marked, definition.defaultSort);
}

function allowsPricingContext(model: BenchmarkModel): boolean {
  return model.evidenceStatus !== 'estimated'
    && !(model.evidenceStatus === 'source_only' && model.sourceId === 'lmarena');
}

function buildPricingContextLeaderboard(
  models: readonly BenchmarkModel[],
  prices: readonly BenchmarkPriceCheck[],
  profile: WorkloadProfile,
): readonly LeaderboardEntry[] {
  const entries = models
    .slice()
    .sort(compareModels)
    .flatMap((model) => {
      if (!allowsPricingContext(model)) return [];
      const routes = primaryHostedRoutesForModel(model.modelKey, prices, profile);
      const primaryPrice = routes[0] ?? null;
      if (!primaryPrice) return [];
      const hostedPrice = primaryHostedPriceForModel(model.modelKey, prices, profile);
      return [makeEntry(model, null, [], primaryPrice, hostedPrice?.blendedCostPerMillion ?? null)];
    });
  return sortLeaderboardEntries(entries, 'price-asc');
}

function metricForMultimodalLens(
  model: BenchmarkModel,
  metrics: readonly BenchmarkMetric[],
  metricKey: string,
): BenchmarkMetric | null {
  if (metricKey === BENCHLM_MULTIMODAL) {
    return selectMetric(model, metrics, (candidate) => isSupportedBenchLmMetric(model, candidate, metricKey));
  }
  return selectMetric(model, metrics, (candidate) => isExactLmArenaMetric(model, candidate, metricKey));
}

function multimodalGroup(entry: LeaderboardEntry, metricKeys: readonly string[]): number {
  const metricKey = entry.metric?.metricKey;
  const group = metricKey ? metricKeys.indexOf(metricKey) : -1;
  return group === -1 ? metricKeys.length : group;
}

function buildMultimodalLeaderboard(
  definition: LeaderboardDefinition,
  models: readonly BenchmarkModel[],
  metrics: readonly BenchmarkMetric[],
): readonly LeaderboardEntry[] {
  const entries = models
    .slice()
    .sort(compareModels)
    .flatMap((model) => {
      const lenses = definition.metricKeys
        .map((metricKey) => metricForMultimodalLens(model, metrics, metricKey))
        .filter((metric): metric is BenchmarkMetric => metric !== null);
      return lenses.length > 0 ? [makeEntry(model, lenses[0], lenses)] : [];
    });

  return entries.slice().sort((left, right) => {
    const groupOrder = multimodalGroup(left, definition.metricKeys) - multimodalGroup(right, definition.metricKeys);
    if (groupOrder !== 0) return groupOrder;
    if (left.metric?.sourceId === 'lmarena' && right.metric?.sourceId === 'lmarena') {
      const rankOrder = sortNullableAscending(left.sourceRank, right.sourceRank);
      return rankOrder !== 0 ? rankOrder : entrySlugOrder(left, right);
    }
    const scoreOrder = sortNullableDescending(left.metric?.value ?? null, right.metric?.value ?? null);
    return scoreOrder !== 0 ? scoreOrder : entrySlugOrder(left, right);
  });
}

/**
 * Builds one transparent v1 leaderboard from a single immutable benchmark
 * revision. Callers must pass only facts from that same published revision.
 */
export function buildLeaderboard(
  key: LeaderboardKey,
  models: readonly BenchmarkModel[],
  metrics: readonly BenchmarkMetric[],
  prices: readonly BenchmarkPriceCheck[],
  profile: WorkloadProfile = 'balanced',
): LeaderboardResult {
  if (!isWorkloadProfile(profile)) throw new RangeError('profile must be a supported workload profile');
  const definition = LEADERBOARD_DEFINITIONS[key];
  let entries: readonly LeaderboardEntry[];

  switch (definition.kind) {
    case 'benchlm':
      entries = buildBenchLmLeaderboard(definition, models, metrics);
      break;
    case 'lmarena':
      entries = buildLmArenaLeaderboard(definition, models, metrics);
      break;
    case 'value':
      entries = buildValueLeaderboard(definition, models, metrics, prices, profile);
      break;
    case 'pricing-context':
      entries = buildPricingContextLeaderboard(models, prices, profile);
      break;
    case 'multimodal':
      entries = buildMultimodalLeaderboard(definition, models, metrics);
      break;
  }

  return { key, profile, definition, entries };
}
