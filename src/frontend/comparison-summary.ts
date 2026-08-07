import { compareUtf8Binary, type BenchmarkModel, type BenchmarkPriceCheck } from '../benchmarks/contracts';
import {
  compareComparisonMetricRows,
  isSupportedBenchLmComparisonMetric,
  selectedComparisonPriceCheck,
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

function publishedRate(route: BenchmarkPriceCheck | null, dimension: 'inputUsdPerMillion' | 'outputUsdPerMillion'): number | null {
  const value = route?.[dimension];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

interface ScoreLead {
  readonly category: string;
  readonly winnerIndex: 0 | 1;
  readonly winnerValue: string;
  readonly otherValue: string;
}

function scoreLeads(
  rows: readonly ComparisonMetricRow[],
): readonly ScoreLead[] {
  return rows.flatMap((row) => {
    const metricA = row.modelA;
    const metricB = row.modelB;
    if (metricA === null || metricB === null) return [];
    if (metricA.value === metricB.value) return [];
    const displayedA = formatMetricValue(metricA.value);
    const displayedB = formatMetricValue(metricB.value);
    if (displayedA === displayedB) return [];
    const winnerIndex: 0 | 1 = metricA.value > metricB.value ? 0 : 1;
    const winnerValue = winnerIndex === 0 ? displayedA : displayedB;
    const otherValue = winnerIndex === 0 ? displayedB : displayedA;
    return [{
      category: friendlyMetricLabel(row.metricKey, row.category),
      winnerIndex,
      winnerValue,
      otherValue,
    }];
  });
}

function scoreSentences(
  leads: readonly ScoreLead[],
  models: readonly [BenchmarkModel, BenchmarkModel],
): readonly string[] {
  return leads.map((lead) => `On ${lead.category}, ${displayedModelName(models, lead.winnerIndex)} has a higher supported BenchLM score (${lead.winnerValue} vs ${lead.otherValue}).`);
}

function joinLabels(labels: readonly string[]): string {
  if (labels.length <= 1) return labels[0] ?? '';
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)}`;
}

function compactScoreSentence(
  leads: readonly ScoreLead[],
  models: readonly [BenchmarkModel, BenchmarkModel],
): string | null {
  const groupedClaims = ([0, 1] as const).flatMap((winnerIndex) => {
    const labels = leads
      .filter((lead) => lead.winnerIndex === winnerIndex)
      .map((lead) => lead.category);
    if (labels.length === 0) return [];
    const scoreNoun = labels.length === 1 ? 'a higher score' : 'higher scores';
    return [`${displayedModelName(models, winnerIndex)} has ${scoreNoun} in ${joinLabels(labels)}`];
  });
  return groupedClaims.length > 0
    ? `Across compatible supported BenchLM categories, ${groupedClaims.join('; ')}.`
    : null;
}

function rateSentence(
  dimension: 'inputUsdPerMillion' | 'outputUsdPerMillion',
  routes: readonly [BenchmarkPriceCheck | null, BenchmarkPriceCheck | null],
  models: readonly [BenchmarkModel, BenchmarkModel],
): string | null {
  const left = publishedRate(routes[0], dimension);
  const right = publishedRate(routes[1], dimension);
  if (left === null || right === null) return null;
  if (left === right) return null;
  const displayedLeft = formatRate(left);
  const displayedRight = formatRate(right);
  if (displayedLeft === displayedRight) return null;
  const winnerIndex: 0 | 1 = left < right ? 0 : 1;
  const winnerValue = winnerIndex === 0 ? displayedLeft : displayedRight;
  const otherValue = winnerIndex === 0 ? displayedRight : displayedLeft;
  const label = dimension === 'inputUsdPerMillion' ? 'Input API price' : 'Output API price';
  return `${label}: ${displayedModelName(models, winnerIndex)} has the lower verified rate (${winnerValue} vs ${otherValue}).`;
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

function scoreRowsAreExactlyTied(rows: readonly ComparisonMetricRow[]): boolean {
  return rows.length > 0 && rows.every((row) => row.modelA?.value === row.modelB?.value);
}

function cappedEvidenceClaims(
  scoreClaims: readonly string[],
  compactScoreClaim: string | null,
  pricingClaims: readonly string[],
  limit: number,
): readonly string[] {
  const availableScoreSlots = pricingClaims.length > 0 ? Math.max(0, limit - 1) : limit;
  if (scoreClaims.length > availableScoreSlots && compactScoreClaim !== null) {
    // A dense benchmark result should not hide either model's supported
    // category evidence. Collapse every category-specific lead into one
    // bounded, model-grouped claim, while retaining bounded operational
    // facts in priority order: input API price, output price, then context.
    return [compactScoreClaim, ...pricingClaims].slice(0, limit);
  }
  return [...scoreClaims, ...pricingClaims].slice(0, limit);
}

/**
 * Derives bounded, evidence-specific comparison copy from the published view
 * model. No sentence selects a universal winner or fills in an absent fact.
 */
export function comparisonSummary(viewModel: ComparisonViewModel): ComparisonSummary {
  const compatibleRows = compatibleScoreRows(viewModel);
  const coverage = coverageFor(compatibleRows.length);
  const routes = viewModel.priceChecks.map(selectedComparisonPriceCheck) as [BenchmarkPriceCheck | null, BenchmarkPriceCheck | null];
  const supportedScoreLeads = scoreLeads(compatibleRows);
  const scoreClaims = scoreSentences(supportedScoreLeads, viewModel.models);
  const pricingClaims = [
    rateSentence('inputUsdPerMillion', routes, viewModel.models),
    rateSentence('outputUsdPerMillion', routes, viewModel.models),
    contextSentence(viewModel.models),
  ].filter((sentence): sentence is string => sentence !== null);
  const caveat = coverageSentence(coverage, compatibleRows.length);
  const tiedScoreSentence = coverage === 'strong' && scoreRowsAreExactlyTied(compatibleRows)
    ? `The compatible supported BenchLM scores are tied across ${compatibleRows.length} shared metrics.`
    : null;
  const scoreEvidenceClaims = tiedScoreSentence === null ? scoreClaims : [tiedScoreSentence];
  const claimLimit = caveat === null ? 4 : 3;
  const evidenceClaims = cappedEvidenceClaims(
    scoreEvidenceClaims,
    tiedScoreSentence === null ? compactScoreSentence(supportedScoreLeads, viewModel.models) : null,
    pricingClaims,
    claimLimit,
  );
  const sentences = caveat === null ? evidenceClaims : [...evidenceClaims, caveat];

  return { heading: 'Comparison summary', sentences, coverage };
}
