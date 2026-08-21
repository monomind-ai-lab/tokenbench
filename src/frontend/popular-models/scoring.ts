import {
  POPULAR_CATEGORY_KEYS,
  POPULAR_SORT_KEYS,
  type PopularCategoryKey,
  type PopularLogCostScatter,
  type PopularLogCostScatterPoint,
  type PopularModelFixture,
  type PopularModelsFilterState,
  type PopularModelsSortState,
  type PopularSortDirection,
  type PopularSortKey,
} from './types';

export const DEFAULT_POPULAR_MODELS_FILTER_STATE: PopularModelsFilterState = {
  query: '',
  organization: null,
  category: null,
  minimumCategoryScore: null,
  weights: 'all',
  finetune: 'all',
};

export const DEFAULT_POPULAR_MODELS_SORT_STATE: PopularModelsSortState = {
  key: 'overallScore',
  direction: 'descending',
};

function normalizedSearchText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function boundedScore(value: number | null): number {
  if (value === null || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function hasLowerValueFirst(metric: PopularSortKey): boolean {
  return metric === 'costPerSuccessfulTask'
    || metric === 'outputCostPerMillion'
    || metric === 'verbosityTokens';
}

export function defaultPopularSortDirection(metric: PopularSortKey): PopularSortDirection {
  return hasLowerValueFirst(metric) ? 'ascending' : 'descending';
}

export function popularMetricValue(fixture: PopularModelFixture, metric: PopularSortKey): number {
  switch (metric) {
    case 'overallScore':
      return fixture.overallScore;
    case 'costPerSuccessfulTask':
      return fixture.costPerSuccessfulTask;
    case 'outputCostPerMillion':
      return fixture.outputCostPerMillion;
    case 'verbosityTokens':
      return fixture.verbosityTokens;
    default:
      return fixture.categoryScores[metric];
  }
}

/** Searches fixture identity fields only; it does not imply production catalog matching. */
export function searchPopularModels(
  fixtures: readonly PopularModelFixture[],
  query: string,
): readonly PopularModelFixture[] {
  const needle = normalizedSearchText(query);
  if (needle.length === 0) return fixtures;
  return fixtures.filter((fixture) => [
    fixture.id,
    fixture.slug,
    fixture.name,
    fixture.organization,
  ].some((value) => value.toLocaleLowerCase().includes(needle)));
}

export function filterPopularModelsByOrganization(
  fixtures: readonly PopularModelFixture[],
  organization: string | null,
): readonly PopularModelFixture[] {
  if (organization === null) return fixtures;
  return fixtures.filter((fixture) => fixture.organization === organization);
}

export function filterPopularModelsByCategory(
  fixtures: readonly PopularModelFixture[],
  category: PopularCategoryKey | null,
  minimumScore: number | null,
): readonly PopularModelFixture[] {
  if (category === null) return fixtures;
  const floor = boundedScore(minimumScore);
  return fixtures.filter((fixture) => fixture.categoryScores[category] >= floor);
}

function filterPopularModelsByWeights(
  fixtures: readonly PopularModelFixture[],
  weights: PopularModelsFilterState['weights'],
): readonly PopularModelFixture[] {
  if (weights === 'all') return fixtures;
  const expected = weights === 'openWeights';
  return fixtures.filter((fixture) => fixture.openWeights === expected);
}

function filterPopularModelsByFinetune(
  fixtures: readonly PopularModelFixture[],
  finetune: PopularModelsFilterState['finetune'],
): readonly PopularModelFixture[] {
  if (finetune === 'all') return fixtures;
  const expected = finetune === 'supported';
  return fixtures.filter((fixture) => fixture.finetune === expected);
}

/** Applies each independent, page-local filter while preserving fixture order. */
export function filterPopularModels(
  fixtures: readonly PopularModelFixture[],
  filters: PopularModelsFilterState,
): readonly PopularModelFixture[] {
  return filterPopularModelsByFinetune(
    filterPopularModelsByWeights(
      filterPopularModelsByCategory(
        filterPopularModelsByOrganization(
          searchPopularModels(fixtures, filters.query),
          filters.organization,
        ),
        filters.category,
        filters.minimumCategoryScore,
      ),
      filters.weights,
    ),
    filters.finetune,
  );
}

/** Returns a copied, deterministic ordering; the input fixture array remains untouched. */
export function sortPopularModels(
  fixtures: readonly PopularModelFixture[],
  sort: PopularModelsSortState,
): readonly PopularModelFixture[] {
  const multiplier = sort.direction === 'ascending' ? 1 : -1;
  return [...fixtures].sort((left, right) => {
    const valueDifference = popularMetricValue(left, sort.key) - popularMetricValue(right, sort.key);
    if (valueDifference !== 0) return valueDifference * multiplier;
    return left.name.localeCompare(right.name);
  });
}

export function filterAndSortPopularModels(
  fixtures: readonly PopularModelFixture[],
  filters: PopularModelsFilterState,
  sort: PopularModelsSortState,
): readonly PopularModelFixture[] {
  return sortPopularModels(filterPopularModels(fixtures, filters), sort);
}

/**
 * For quality metrics, five means the highest five; for costs and verbosity,
 * it means the lowest five. This makes every highlighted position a useful UI
 * convention rather than a claim about the underlying fixture values.
 */
export function topFivePopularModelIds(
  fixtures: readonly PopularModelFixture[],
  metric: PopularSortKey,
): readonly string[] {
  return sortPopularModels(fixtures, {
    key: metric,
    direction: defaultPopularSortDirection(metric),
  }).slice(0, 5).map((fixture) => fixture.id);
}

export function topFivePopularModelIdsByMetric(
  fixtures: readonly PopularModelFixture[],
): Readonly<Record<PopularSortKey, readonly string[]>> {
  const topIds = {} as Record<PopularSortKey, readonly string[]>;
  for (const metric of POPULAR_SORT_KEYS) {
    topIds[metric] = topFivePopularModelIds(fixtures, metric);
  }
  return topIds;
}

interface UnmarkedPopularScatterPoint {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly organization: string;
  readonly overallScore: number;
  readonly costPerSuccessfulTask: number;
  readonly logCost: number;
}

function comparePopularScatterPoints(
  left: UnmarkedPopularScatterPoint,
  right: UnmarkedPopularScatterPoint,
): number {
  return left.costPerSuccessfulTask - right.costPerSuccessfulTask
    || right.overallScore - left.overallScore
    || left.name.localeCompare(right.name);
}

/**
 * Generates an x-axis-ready log10(cost) scatter and its Pareto value frontier:
 * no frontier point has both a lower/equal task cost and a higher/equal score.
 */
export function buildPopularLogCostScatter(
  fixtures: readonly PopularModelFixture[],
): PopularLogCostScatter {
  const points = fixtures
    .filter((fixture) => Number.isFinite(fixture.costPerSuccessfulTask)
      && fixture.costPerSuccessfulTask > 0
      && Number.isFinite(fixture.overallScore))
    .map<UnmarkedPopularScatterPoint>((fixture) => ({
      id: fixture.id,
      slug: fixture.slug,
      name: fixture.name,
      organization: fixture.organization,
      overallScore: fixture.overallScore,
      costPerSuccessfulTask: fixture.costPerSuccessfulTask,
      logCost: Math.log10(fixture.costPerSuccessfulTask),
    }))
    .sort(comparePopularScatterPoints);

  const frontierIds = new Set<string>();
  let highestScore = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    if (point.overallScore > highestScore) {
      frontierIds.add(point.id);
      highestScore = point.overallScore;
    }
  }

  const markedPoints: readonly PopularLogCostScatterPoint[] = points.map((point) => ({
    ...point,
    isValueFrontier: frontierIds.has(point.id),
  }));
  return {
    points: markedPoints,
    valueFrontier: markedPoints.filter((point) => point.isValueFrontier),
  };
}

/** Ensures UI comparison controls display two to four valid fixture IDs when possible. */
export function normalizePopularComparisonSelection(
  requestedIds: readonly string[],
  availableFixtures: readonly PopularModelFixture[],
): readonly string[] {
  const availableIds = new Set(availableFixtures.map((fixture) => fixture.id));
  const normalized: string[] = [];
  for (const id of requestedIds) {
    if (normalized.length === 4) break;
    if (availableIds.has(id) && !normalized.includes(id)) normalized.push(id);
  }
  const minimumSelectionCount = Math.min(2, availableFixtures.length);
  for (const fixture of availableFixtures) {
    if (normalized.length >= minimumSelectionCount || normalized.length === 4) break;
    if (!normalized.includes(fixture.id)) normalized.push(fixture.id);
  }
  return normalized;
}

export function formatPopularCost(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value > 0 && value < 0.01) return '<$0.01';
  const fractionDigits = 2;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatPopularCostPerSuccessfulTask(value: number): string {
  const formatted = formatPopularCost(value);
  return formatted === '—' ? formatted : `${formatted} / successful task`;
}

export function formatPopularOutputCostPerMillion(value: number): string {
  const formatted = formatPopularCost(value);
  return formatted === '—' ? formatted : `${formatted} / 1M output tokens`;
}

export { POPULAR_CATEGORY_KEYS };
