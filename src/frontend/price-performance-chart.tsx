import { useEffect, useMemo, useState } from 'react';
import type { PricePerformancePointView, PricePerformanceScoreLane } from '../benchmarks/price-performance-contracts';
import { formatPricePerformancePointView } from './price-performance-view';
import type { PricePerformanceScale } from './price-performance-state';

const WIDTH = 760;
const HEIGHT = 420;
const PLOT = { left: 64, right: 22, top: 24, bottom: 52 } as const;

export interface PricePerformanceChartProps {
  readonly points: readonly PricePerformancePointView[];
  readonly lane?: PricePerformanceScoreLane;
  readonly basis?: PricePerformancePointView['costBasis'];
  readonly scale?: PricePerformanceScale;
  readonly onSelect?: (point: PricePerformancePointView) => void;
}

function humanize(value: string): string {
  return value.replace(/-/gu, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function numericRange(values: readonly number[]): { min: number; max: number } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? { min: min - 1, max: max + 1 } : { min, max };
}

function xCoordinate(cost: number, costs: readonly number[], scale: PricePerformanceScale): number {
  const transformed = scale === 'log' ? Math.log(cost) : cost;
  const transformedCosts = costs.map((value) => scale === 'log' ? Math.log(value) : value);
  const range = numericRange(transformedCosts);
  return PLOT.left + ((transformed - range.min) / (range.max - range.min)) * (WIDTH - PLOT.left - PLOT.right);
}

function yCoordinate(score: number, scores: readonly number[]): number {
  const range = numericRange(scores);
  return HEIGHT - PLOT.bottom - ((score - range.min) / (range.max - range.min)) * (HEIGHT - PLOT.top - PLOT.bottom);
}

function plotPoint(
  point: PricePerformancePointView,
  points: readonly PricePerformancePointView[],
  scale: PricePerformanceScale,
): { x: number; y: number } {
  return {
    x: xCoordinate(point.selectedCost, points.map((candidate) => candidate.selectedCost), scale),
    y: yCoordinate(point.score, points.map((candidate) => candidate.score)),
  };
}

function frontierPath(points: readonly PricePerformancePointView[], scale: PricePerformanceScale): string {
  const frontier = points.filter((point) => point.frontier).sort((left, right) => left.selectedCost - right.selectedCost || right.score - left.score);
  return frontier.map((point, index) => {
    const coordinates = plotPoint(point, points, scale);
    return `${index === 0 ? 'M' : 'L'} ${coordinates.x.toFixed(2)} ${coordinates.y.toFixed(2)}`;
  }).join(' ');
}

export function pointAccessibleName(point: PricePerformancePointView): string {
  return formatPricePerformancePointView(point).accessibleName;
}

function PointDetails({ point, onClose }: { readonly point: PricePerformancePointView; readonly onClose: () => void }) {
  const facts = formatPricePerformancePointView(point);
  return <div className="price-performance-point-details" role="dialog" aria-modal="true" aria-labelledby="price-performance-details-heading">
    <div className="price-performance-details-heading">
      <div><span className="eyebrow">Selected point</span><h2 id="price-performance-details-heading">{point.displayName} details</h2></div>
      <button className="button button-secondary" type="button" onClick={onClose} aria-label="Close model details">Close</button>
    </div>
    <dl className="price-performance-details-facts">
      <div><dt>Score</dt><dd>{facts.score}</dd></div>
      <div><dt>Selected cost</dt><dd>{facts.selectedCost}</dd></div>
      <div><dt>Score per dollar</dt><dd>{facts.scorePerDollar}</dd></div>
      <div><dt>Provider and route</dt><dd>{facts.provider} · {facts.route}</dd></div>
      <div><dt>Evidence</dt><dd>{facts.evidence}</dd></div>
      <div><dt>Frontier state</dt><dd>{facts.frontier}</dd></div>
    </dl>
    <a className="button button-primary" href={facts.profileHref}>{facts.profileLinkLabel}</a>
  </div>;
}

export function PricePerformanceChart({
  points,
  lane = 'overall',
  basis = 'output',
  scale = 'linear',
  onSelect,
}: PricePerformanceChartProps) {
  const [selected, setSelected] = useState<PricePerformancePointView | null>(null);
  const costs = useMemo(() => points.map((point) => point.selectedCost), [points]);
  const safeScale = scale === 'log' && costs.every((cost) => Number.isFinite(cost) && cost > 0) ? 'log' : 'linear';
  const label = `${humanize(lane)} score by ${basis === 'output' ? 'output price' : '3:1 blended price'}`;

  useEffect(() => {
    if (selected && !points.some((point) => point.modelKey === selected.modelKey)) setSelected(null);
  }, [points, selected]);

  if (points.length === 0) {
    return <div className="price-performance-chart-empty" role="status" aria-label="No eligible models match these filters"><strong>No eligible models match these filters</strong><p>Try another score lane, provider, evidence state, or price band.</p></div>;
  }

  const selectPoint = (point: PricePerformancePointView) => {
    setSelected(point);
    onSelect?.(point);
  };

  return <figure className="price-performance-chart-figure">
    <svg className="price-performance-chart-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="group" aria-label={label} preserveAspectRatio="xMidYMid meet">
      <g aria-hidden="true" className="price-performance-chart-axes">
        <line x1={PLOT.left} y1={PLOT.top} x2={PLOT.left} y2={HEIGHT - PLOT.bottom} />
        <line x1={PLOT.left} y1={HEIGHT - PLOT.bottom} x2={WIDTH - PLOT.right} y2={HEIGHT - PLOT.bottom} />
        <text x={PLOT.left} y={HEIGHT - 16}>Cost</text>
        <text x={PLOT.left - 10} y={PLOT.top + 2} textAnchor="end">Score</text>
      </g>
      <path className="price-performance-frontier" d={frontierPath(points, safeScale)} aria-hidden="true" />
      {points.map((point) => {
        const coordinates = plotPoint(point, points, safeScale);
        const facts = formatPricePerformancePointView(point);
        return <foreignObject key={point.modelKey} className="price-performance-scatter-point" data-frontier={point.frontier ? 'true' : 'false'} data-evidence={point.evidenceStatus} x={coordinates.x - 24} y={coordinates.y - 24} width="48" height="48">
          <button
            className={`scatter-point evidence-${point.evidenceStatus}${point.frontier ? ' scatter-point-frontier' : ''}`}
            type="button"
            aria-label={facts.accessibleName}
            data-model-key={point.modelKey}
            onClick={() => selectPoint(point)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                selectPoint(point);
              }
            }}
            onTouchEnd={(event) => {
              event.preventDefault();
              selectPoint(point);
            }}
          ><span aria-hidden="true">{point.frontier ? '◆' : '●'}</span><span className="sr-only">{point.frontier ? 'Frontier point' : 'Non-frontier point'}</span></button>
        </foreignObject>;
      })}
    </svg>
    <figcaption className="price-performance-chart-caption">Each point is keyboard and touch accessible. Shape and text identify frontier and evidence state; details include the durable model profile link.</figcaption>
    {selected ? <PointDetails point={selected} onClose={() => setSelected(null)} /> : null}
  </figure>;
}

export { formatPricePerformancePointView } from './price-performance-view';
