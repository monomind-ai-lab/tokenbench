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

export interface ComparisonSynthesis {
  readonly observedFacts: readonly string[];
  readonly calculations: readonly string[];
  readonly facts: readonly string[];
  readonly conclusion: string;
  readonly winner: 0 | 1 | null;
}

const COMPACT_SCORE_CATEGORIES_PER_MODEL = 3;
const COMPACT_SCORE_MODEL_LABEL_UTF8_BYTES = 32;
const COMPACT_SCORE_CATEGORY_LABEL_UTF8_BYTES = 32;
/**
 * Compact score evidence is bounded by construction: two 32-byte model labels,
 * three 32-byte category labels per model, and a ten-digit omitted-category
 * count fit within this UTF-8 claim budget without dropping either model.
 */
const COMPACT_SCORE_CLAIM_UTF8_BYTES = 448;
/** The section presents two to four evidence-backed findings, never a list. */
const MAXIMUM_KEY_IMPLICATIONS = 4;
const ELLIPSIS = '…';
const UTF8_ENCODER = new TextEncoder();

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

function utf8ByteLength(value: string): number {
  return UTF8_ENCODER.encode(value).byteLength;
}

function replaceUnpairedSurrogates(value: string): string {
  let result = '';
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xD800 && codeUnit <= 0xDBFF) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (nextCodeUnit >= 0xDC00 && nextCodeUnit <= 0xDFFF) {
        result += value.slice(index, index + 2);
        index += 1;
      } else {
        result += '\uFFFD';
      }
    } else if (codeUnit >= 0xDC00 && codeUnit <= 0xDFFF) {
      result += '\uFFFD';
    } else {
      result += value[index]!;
    }
  }
  return result;
}

function sanitizeCompactLabel(value: string): string {
  return replaceUnpairedSurrogates(value)
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (utf8ByteLength(value) <= maxBytes) return value;
  const ellipsisBytes = utf8ByteLength(ELLIPSIS);
  const contentBudget = maxBytes - ellipsisBytes;
  if (contentBudget <= 0) return ELLIPSIS;
  let result = '';
  let usedBytes = 0;
  for (const codePoint of value) {
    const codePointBytes = utf8ByteLength(codePoint);
    if (usedBytes + codePointBytes > contentBudget) break;
    result += codePoint;
    usedBytes += codePointBytes;
  }
  return `${result}${ELLIPSIS}`;
}

function compactLabel(value: string, maxBytes: number, fallback: string): string {
  return truncateUtf8(sanitizeCompactLabel(value) || fallback, maxBytes);
}

function summaryModelLabel(models: readonly [BenchmarkModel, BenchmarkModel], index: 0 | 1): string {
  return compactLabel(displayedModelName(models, index), COMPACT_SCORE_MODEL_LABEL_UTF8_BYTES, 'Model');
}

function summaryCategoryLabel(value: string): string {
  return compactLabel(value, COMPACT_SCORE_CATEGORY_LABEL_UTF8_BYTES, 'Metric');
}

function summarySentence(value: string): string {
  return truncateUtf8(sanitizeCompactLabel(value), COMPACT_SCORE_CLAIM_UTF8_BYTES);
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
  if (route?.verificationStatus !== 'primary') return null;
  const value = route?.[dimension];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

interface ScoreLead {
  readonly category: string;
  readonly winnerIndex: 0 | 1;
  readonly winnerValue: string;
  readonly otherValue: string;
  /** Absolute published gap; drives "largest meaningful gap first" ordering. */
  readonly gap: number;
}

function scoreLeads(
  rows: readonly ComparisonMetricRow[],
): readonly ScoreLead[] {
  const leads = rows.flatMap((row) => {
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
      gap: Math.abs(metricA.value - metricB.value),
    }];
  });
  // The first implication must be the capability lead with the largest
  // meaningful gap. Rows arrive in a deterministic order, so equal gaps keep
  // that order and the result stays reproducible from shared state.
  return leads
    .map((lead, index) => ({ lead, index }))
    .sort((left, right) => right.lead.gap - left.lead.gap || left.index - right.index)
    .map(({ lead }) => lead);
}

function scoreSentences(
  leads: readonly ScoreLead[],
  models: readonly [BenchmarkModel, BenchmarkModel],
): readonly string[] {
  return leads.map((lead) => `On ${summaryCategoryLabel(lead.category)}, ${summaryModelLabel(models, lead.winnerIndex)} has a higher supported BenchLM score (${lead.winnerValue} vs ${lead.otherValue}).`);
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
    const modelLeads = leads
      .filter((lead) => lead.winnerIndex === winnerIndex)
    if (modelLeads.length === 0) return [];
    const labels = modelLeads
      .slice(0, COMPACT_SCORE_CATEGORIES_PER_MODEL)
      .map((lead) => summaryCategoryLabel(lead.category));
    const omittedCount = modelLeads.length - labels.length;
    const omittedCopy = omittedCount === 0
      ? ''
      : ` (and ${omittedCount} more categor${omittedCount === 1 ? 'y' : 'ies'})`;
    const scoreNoun = modelLeads.length === 1 ? 'a higher score' : 'higher scores';
    const modelLabel = summaryModelLabel(models, winnerIndex);
    return [`${modelLabel} has ${scoreNoun} in ${joinLabels(labels)}${omittedCopy}`];
  });
  if (groupedClaims.length === 0) return null;
  return `Across compatible supported BenchLM categories, ${groupedClaims.join('; ')}.`;
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
  return `${label}: ${summaryModelLabel(models, winnerIndex)} has the lower verified rate (${winnerValue} vs ${otherValue}).`;
}

function contextSentence(models: readonly [BenchmarkModel, BenchmarkModel]): string | null {
  const left = models[0].contextWindowTokens;
  const right = models[1].contextWindowTokens;
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || left <= 0 || right <= 0 || left === right) return null;
  const winnerIndex: 0 | 1 = left > right ? 0 : 1;
  const winner = winnerIndex === 0 ? left : right;
  const other = winnerIndex === 0 ? right : left;
  return `Context window: ${summaryModelLabel(models, winnerIndex)} has the larger published context window (${formatContextWindow(winner)} vs ${formatContextWindow(other)}).`;
}

function coverageFor(sharedMetricCount: number): ComparisonSummary['coverage'] {
  if (sharedMetricCount >= 4) return 'strong';
  return sharedMetricCount > 0 ? 'limited' : 'none';
}

/* Coverage is disclosed through `coverage`; it never becomes a finding. */

function publishedModalities(route: BenchmarkPriceCheck | null, direction: 'inputModalities' | 'outputModalities'): readonly string[] | null {
  if (route?.verificationStatus !== 'primary') return null;
  const value = route?.[direction];
  if (!Array.isArray(value)) return null;
  const normalized = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return normalized.length === 0 ? null : normalized;
}

/**
 * States a verified directional modality difference on the selected routes. It
 * never infers a direction that neither route publishes.
 */
function modalitySentence(
  direction: 'inputModalities' | 'outputModalities',
  routes: readonly [BenchmarkPriceCheck | null, BenchmarkPriceCheck | null],
  models: readonly [BenchmarkModel, BenchmarkModel],
): string | null {
  const left = publishedModalities(routes[0], direction);
  const right = publishedModalities(routes[1], direction);
  if (left === null || right === null) return null;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const onlyLeft = [...new Set(left.filter((item) => !rightSet.has(item)))];
  const onlyRight = [...new Set(right.filter((item) => !leftSet.has(item)))];
  if (onlyLeft.length === 0 && onlyRight.length === 0) return null;
  const label = direction === 'inputModalities' ? 'Input modalities' : 'Output modalities';
  const verb = direction === 'inputModalities' ? 'accepts' : 'returns';
  const claims = [
    onlyLeft.length === 0 ? null : `${summaryModelLabel(models, 0)} additionally ${verb} ${joinLabels(onlyLeft.map(summaryCategoryLabel))}`,
    onlyRight.length === 0 ? null : `${summaryModelLabel(models, 1)} additionally ${verb} ${joinLabels(onlyRight.map(summaryCategoryLabel))}`,
  ].filter((claim): claim is string => claim !== null);
  return `${label}: ${claims.join('; ')} on the selected route.`;
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
 *
 * Findings are ordered as capability lead, selected-route price, context, and
 * verified modality difference. Shared-metric coverage is reported through the
 * separate `coverage` field, so no finding is metric-count filler.
 */
export function comparisonSummary(viewModel: ComparisonViewModel): ComparisonSummary {
  const compatibleRows = compatibleScoreRows(viewModel);
  const coverage = coverageFor(compatibleRows.length);
  const routes = viewModel.priceChecks.map(selectedComparisonPriceCheck) as [BenchmarkPriceCheck | null, BenchmarkPriceCheck | null];
  const supportedScoreLeads = scoreLeads(compatibleRows);
  const scoreClaims = scoreSentences(supportedScoreLeads, viewModel.models);
  const operationalClaims = [
    rateSentence('inputUsdPerMillion', routes, viewModel.models),
    rateSentence('outputUsdPerMillion', routes, viewModel.models),
    contextSentence(viewModel.models),
    modalitySentence('inputModalities', routes, viewModel.models),
    modalitySentence('outputModalities', routes, viewModel.models),
  ].filter((sentence): sentence is string => sentence !== null);
  const tiedScoreSentence = coverage === 'strong' && scoreRowsAreExactlyTied(compatibleRows)
    ? `The compatible supported BenchLM scores are tied across ${compatibleRows.length} shared metrics.`
    : null;
  const scoreEvidenceClaims = tiedScoreSentence === null ? scoreClaims : [tiedScoreSentence];
  const evidenceClaims = cappedEvidenceClaims(
    scoreEvidenceClaims,
    tiedScoreSentence === null ? compactScoreSentence(supportedScoreLeads, viewModel.models) : null,
    operationalClaims,
    MAXIMUM_KEY_IMPLICATIONS,
  );
  const sentences = evidenceClaims.map(summarySentence);

  return { heading: 'Key implications', sentences, coverage };
}

/**
 * Keeps observed source facts, TokenBench arithmetic, and editorial language
 * separate. This deliberately requires compatible score evidence and complete
 * primary price evidence before it can identify a pair-level winner.
 */
export function buildComparisonSynthesis(viewModel: ComparisonViewModel): ComparisonSynthesis {
  const compatibleRows = compatibleScoreRows(viewModel);
  const routes = viewModel.priceChecks.map(selectedComparisonPriceCheck) as [BenchmarkPriceCheck | null, BenchmarkPriceCheck | null];
  const inputRates = routes.map((route) => publishedRate(route, 'inputUsdPerMillion')) as [number | null, number | null];
  const outputRates = routes.map((route) => publishedRate(route, 'outputUsdPerMillion')) as [number | null, number | null];
  const observedFacts = compatibleRows.map((row) => {
    const a = row.modelA!;
    const b = row.modelB!;
    return `${friendlyMetricLabel(row.metricKey, row.category)}: ${formatMetricValue(a.value)} vs ${formatMetricValue(b.value)} ${row.unit}.`;
  });
  const calculations: string[] = [];
  for (const [label, rates] of [['Input API price', inputRates], ['Output API price', outputRates]] as const) {
    const [left, right] = rates;
    if (left === null || right === null || left === right) continue;
    const lowerIndex: 0 | 1 = left < right ? 0 : 1;
    const lower = lowerIndex === 0 ? left : right;
    const higher = lowerIndex === 0 ? right : left;
    const percentage = Math.round(((higher - lower) / higher) * 100);
    calculations.push(`Price calculation (${label}): ${summaryModelLabel(viewModel.models, lowerIndex)} is ${percentage}% lower than the other selected primary route.`);
  }

  const facts = [...observedFacts, ...calculations];
  const scoreEvidence = scoreLeads(compatibleRows);
  const priceComplete = inputRates.every((rate) => rate !== null) && outputRates.every((rate) => rate !== null);
  const allScoresAgree = compatibleRows.length >= 4
    && scoreEvidence.length === compatibleRows.length
    && scoreEvidence.every((lead) => lead.winnerIndex === scoreEvidence[0]?.winnerIndex);
  const priceWinner = priceComplete && inputRates[0] !== inputRates[1] && outputRates[0] !== outputRates[1]
    && (inputRates[0]! < inputRates[1]! ? 0 : 1) === (outputRates[0]! < outputRates[1]! ? 0 : 1)
    ? (inputRates[0]! < inputRates[1]! ? 0 : 1) as 0 | 1
    : null;
  const winner = allScoresAgree && priceWinner !== null && scoreEvidence[0]!.winnerIndex === priceWinner ? priceWinner : null;
  const conclusion = winner === null
    ? 'The available evidence does not support one overall winner.'
    : `${summaryModelLabel(viewModel.models, winner)} leads on the compatible published evidence for this pair.`;

  return { observedFacts, calculations, facts, conclusion, winner };
}
