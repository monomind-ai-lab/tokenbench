import { compareUtf8Binary, type BenchmarkModel, type BenchmarkPriceCheck } from '../benchmarks/contracts';
import { primaryHostedPriceForModel } from '../benchmarks/value';
import {
  compareComparisonMetricRows,
  isSupportedBenchLmComparisonMetric,
  type ComparisonMetricRow,
  type ComparisonSummary,
  type ComparisonViewModel,
} from './comparison-contracts';

export type { ComparisonSummary } from './comparison-contracts';

function titleCase(value: string): string {
  return value
    .trim()
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`)
    .join(' ');
}

/** Uses the published category when available, never exposing implementation prefixes to readers. */
export function friendlyMetricLabel(metricKey: string, category: string): string {
  const fallback = metricKey.split(':').filter(Boolean).at(-1) ?? metricKey;
  return titleCase(category || fallback);
}

function formatMetricValue(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value);
}

function formatRate(value: number): string {
  return `$${new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(value)} / 1M tokens`;
}

function formatContextWindow(value: number): string {
  return `${new Intl.NumberFormat('en-US').format(value)} tokens`;
}

function displayedModelName(models: readonly [BenchmarkModel, BenchmarkModel], index: 0 | 1): string {
  const model = models[index];
  return models[1 - index].name === model.name ? `${model.name} (${model.slug})` : model.name;
}

function compareMetricRowsForSummary(left: ComparisonMetricRow, right: ComparisonMetricRow): number {
  const labelOrder = compareUtf8Binary(
    friendlyMetricLabel(left.metricKey, left.category),
    friendlyMetricLabel(right.metricKey, right.category),
  );
  return labelOrder || compareComparisonMetricRows(left, right);
}

function compatibleScoreRows(viewModel: ComparisonViewModel): readonly ComparisonMetricRow[] {
  return viewModel.metricRows
    .filter((row) => isSupportedBenchLmComparisonMetric(row, viewModel.models))
    .slice()
    .sort(compareMetricRowsForSummary);
}

function selectedVerifiedRoute(modelKey: string, checks: readonly BenchmarkPriceCheck[]): BenchmarkPriceCheck | null {
  return primaryHostedPriceForModel(modelKey, checks, 'balanced')?.price ?? null;
}

function publishedRate(route: BenchmarkPriceCheck | null, dimension: 'inputUsdPerMillion' | 'outputUsdPerMillion'): number | null {
  const value = route?.[dimension];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function scoreSentences(
  rows: readonly ComparisonMetricRow[],
  models: readonly [BenchmarkModel, BenchmarkModel],
): readonly string[] {
  return rows.flatMap((row) => {
    const metricA = row.modelA;
    const metricB = row.modelB;
    if (metricA === null || metricB === null || metricA.value === metricB.value) return [];
    const winnerIndex: 0 | 1 = metricA.value > metricB.value ? 0 : 1;
    const winner = winnerIndex === 0 ? metricA : metricB;
    const other = winnerIndex === 0 ? metricB : metricA;
    return [`On ${friendlyMetricLabel(row.metricKey, row.category)}, ${displayedModelName(models, winnerIndex)} has a higher supported BenchLM score (${formatMetricValue(winner.value)} vs ${formatMetricValue(other.value)}).`];
  });
}

function rateSentence(
  dimension: 'inputUsdPerMillion' | 'outputUsdPerMillion',
  routes: readonly [BenchmarkPriceCheck | null, BenchmarkPriceCheck | null],
  models: readonly [BenchmarkModel, BenchmarkModel],
): string | null {
  const left = publishedRate(routes[0], dimension);
  const right = publishedRate(routes[1], dimension);
  if (left === null || right === null || left === right) return null;
  const winnerIndex: 0 | 1 = left < right ? 0 : 1;
  const winner = winnerIndex === 0 ? left : right;
  const other = winnerIndex === 0 ? right : left;
  const label = dimension === 'inputUsdPerMillion' ? 'Input API price' : 'Output API price';
  return `${label}: ${displayedModelName(models, winnerIndex)} has the lower verified rate (${formatRate(winner)} vs ${formatRate(other)}).`;
}

function contextSentence(models: readonly [BenchmarkModel, BenchmarkModel]): string | null {
  const left = models[0].contextWindowTokens;
  const right = models[1].contextWindowTokens;
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || left <= 0 || right <= 0 || left === right) return null;
  const winnerIndex: 0 | 1 = left > right ? 0 : 1;
  const winner = winnerIndex === 0 ? left : right;
  const other = winnerIndex === 0 ? right : left;
  return `Context window: ${displayedModelName(models, winnerIndex)} has the larger published context window (${formatContextWindow(winner)} vs ${formatContextWindow(other)}).`;
}

function coverageFor(sharedMetricCount: number): ComparisonSummary['coverage'] {
  if (sharedMetricCount >= 4) return 'strong';
  return sharedMetricCount > 0 ? 'limited' : 'none';
}

function coverageSentence(coverage: ComparisonSummary['coverage'], sharedMetricCount: number): string | null {
  if (coverage === 'strong') return null;
  if (coverage === 'none') return 'There is not enough shared evidence to make a supported BenchLM score comparison.';
  const metricLabel = `compatible shared BenchLM metric${sharedMetricCount === 1 ? '' : 's'}`;
  const verb = sharedMetricCount === 1 ? 'is' : 'are';
  return `Only ${sharedMetricCount} ${metricLabel} ${verb} available, so the score evidence is limited.`;
}

/**
 * Derives bounded, evidence-specific comparison copy from the published view
 * model. No sentence selects a universal winner or fills in an absent fact.
 */
export function comparisonSummary(viewModel: ComparisonViewModel): ComparisonSummary {
  const compatibleRows = compatibleScoreRows(viewModel);
  const coverage = coverageFor(compatibleRows.length);
  const routes = viewModel.priceChecks.map((group, index) => selectedVerifiedRoute(viewModel.models[index].modelKey, group.checks)) as [BenchmarkPriceCheck | null, BenchmarkPriceCheck | null];
  const scoreClaims = scoreSentences(compatibleRows, viewModel.models);
  const pricingClaims = [
    rateSentence('inputUsdPerMillion', routes, viewModel.models),
    rateSentence('outputUsdPerMillion', routes, viewModel.models),
    contextSentence(viewModel.models),
  ].filter((sentence): sentence is string => sentence !== null);
  const advantageClaims = [...scoreClaims, ...pricingClaims];
  const caveat = coverageSentence(coverage, compatibleRows.length);
  const tiedScoreSentence = coverage === 'strong' && scoreClaims.length === 0
    ? `The compatible supported BenchLM scores are tied across ${compatibleRows.length} shared metrics.`
    : null;
  const sentences = caveat === null
    ? [...(tiedScoreSentence === null ? [] : [tiedScoreSentence]), ...advantageClaims].slice(0, 4)
    : [...advantageClaims.slice(0, 3), caveat];

  return { heading: 'Comparison summary', sentences, coverage };
}
