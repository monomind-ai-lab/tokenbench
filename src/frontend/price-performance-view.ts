import { modelPath } from '../benchmarks/model-directory';
import type { PricePerformanceAttribution, PricePerformancePointView } from '../benchmarks/price-performance-contracts';
import { formatDisplayUsd } from './display-format';

export interface PricePerformancePointViewFacts {
  readonly modelName: string;
  readonly score: string;
  readonly selectedCost: string;
  readonly scorePerDollar: string;
  readonly provider: string;
  readonly route: string;
  readonly evidence: string;
  readonly frontier: string;
  readonly status: string;
  readonly sourceHref: string | null;
  readonly sourceLinkLabel: string;
  readonly profileHref: string;
  readonly profileLinkLabel: string;
  readonly accessibleName: string;
}

function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value);
}

function formatScore(value: number): string {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

function costBasisLabel(point: PricePerformancePointView): string {
  return point.costBasis === 'output' ? 'output price' : '3:1 blended price';
}

function evidenceLabel(point: PricePerformancePointView): string {
  if (point.evidenceStatus === 'supported') return 'Supported';
  if (point.evidenceStatus === 'estimated') return 'Estimated evidence';
  return 'Source-only evidence';
}

/** Formats every human-facing fact from one validated point view. */
export function formatPricePerformancePointView(
  point: PricePerformancePointView,
  attribution: readonly PricePerformanceAttribution[] = [],
): PricePerformancePointViewFacts {
  const score = formatScore(point.score);
  const selectedCost = `${formatDisplayUsd(point.selectedCost)} / 1M ${costBasisLabel(point)}`;
  // The unit is stated once in the column header, not once per cell. A screen
  // reader user cannot see that header, so `accessibleName` still speaks it.
  const scorePerDollar = point.scorePerDollar === null
    ? 'Unavailable'
    : formatNumber(point.scorePerDollar, 2);
  const spokenScorePerDollar = point.scorePerDollar === null
    ? 'score per dollar unavailable'
    : `${formatNumber(point.scorePerDollar, 2)} score per dollar`;
  const provider = point.creator;
  const route = `${point.route.providerId} · ${point.route.routeId}`;
  const sourceLinkLabel = `${provider} · ${route}`;
  const sourceHref = attribution.find((source) => source.sourceId === point.route.sourceId)?.url ?? null;
  const evidence = evidenceLabel(point);
  const frontier = point.frontier ? 'Pareto frontier' : 'Not on Pareto frontier';
  const status = point.status === 'current' ? 'Current model' : 'Archived model';
  const profileHref = modelPath(point.slug);
  const profileLinkLabel = `View ${point.displayName} model profile`;
  const accessibleName = `${point.displayName}, score ${score}, ${selectedCost}, ${spokenScorePerDollar}, ${evidence}, ${frontier}`;
  return {
    modelName: point.displayName,
    score,
    selectedCost,
    scorePerDollar,
    provider,
    route,
    evidence,
    frontier,
    status,
    sourceHref,
    sourceLinkLabel,
    profileHref,
    profileLinkLabel,
    accessibleName,
  };
}

export const pricePerformancePointFacts = formatPricePerformancePointView;
