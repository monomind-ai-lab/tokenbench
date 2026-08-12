import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { compareUtf8Binary } from '../benchmarks/contracts';
import type { PricePerformanceAttribution, PricePerformancePointView, PricePerformanceScoreLane } from '../benchmarks/price-performance-contracts';
import { formatPricePerformancePointView } from './price-performance-view';
import type { PricePerformanceScale } from './price-performance-state';

const WIDTH = 760;
const HEIGHT = 420;
const PLOT = { left: 64, right: 22, top: 24, bottom: 52 } as const;
const TICK_COUNT = 5;
const MARKER_SIZE = 26;
const TIE_MARKER_STEP = 30;
const AXIS_FORMATTER = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export interface PricePerformanceChartProps {
  readonly points: readonly PricePerformancePointView[];
  readonly attribution?: readonly PricePerformanceAttribution[];
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

function transformedCost(cost: number, scale: PricePerformanceScale): number {
  return scale === 'log' ? Math.log(cost) : cost;
}

function axisTickValues(values: readonly number[], scale: PricePerformanceScale): readonly number[] {
  const range = numericRange(values.map((value) => transformedCost(value, scale)));
  return Array.from({ length: TICK_COUNT }, (_, index) => {
    const transformed = range.min + ((range.max - range.min) * index) / (TICK_COUNT - 1);
    return scale === 'log' ? Math.exp(transformed) : transformed;
  });
}

function formatAxisNumber(value: number): string {
  return AXIS_FORMATTER.format(value);
}

function xCoordinate(cost: number, range: { min: number; max: number }, scale: PricePerformanceScale): number {
  const transformed = transformedCost(cost, scale);
  return PLOT.left + ((transformed - range.min) / (range.max - range.min)) * (WIDTH - PLOT.left - PLOT.right);
}

function yCoordinate(score: number, range: { min: number; max: number }): number {
  return HEIGHT - PLOT.bottom - ((score - range.min) / (range.max - range.min)) * (HEIGHT - PLOT.top - PLOT.bottom);
}

interface ChartCoordinate {
  readonly x: number;
  readonly y: number;
}

interface ChartLayout {
  readonly costRange: { readonly min: number; readonly max: number };
  readonly scoreRange: { readonly min: number; readonly max: number };
  readonly base: ReadonlyMap<string, ChartCoordinate>;
  readonly scatter: ReadonlyMap<string, ChartCoordinate>;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

/** Computes chart ranges once and separates exact ties into touch-safe clusters. */
export function pricePerformanceChartLayout(
  points: readonly PricePerformancePointView[],
  scale: PricePerformanceScale,
): ChartLayout | null {
  if (points.length === 0) return null;
  const costRange = numericRange(points.map((point) => transformedCost(point.selectedCost, scale)));
  const scoreRange = numericRange(points.map((point) => point.score));
  const base = new Map<string, ChartCoordinate>();
  const groups = new Map<string, PricePerformancePointView[]>();
  for (const point of points) {
    base.set(point.modelKey, {
      x: xCoordinate(point.selectedCost, costRange, scale),
      y: yCoordinate(point.score, scoreRange),
    });
    const key = `${point.selectedCost}\u0000${point.score}`;
    const group = groups.get(key);
    if (group) group.push(point);
    else groups.set(key, [point]);
  }

  const scatter = new Map<string, ChartCoordinate>();
  const plotLeft = PLOT.left + MARKER_SIZE / 2;
  const plotRight = WIDTH - PLOT.right - MARKER_SIZE / 2;
  const plotTop = PLOT.top + MARKER_SIZE / 2;
  const plotBottom = HEIGHT - PLOT.bottom - MARKER_SIZE / 2;
  const maximumColumns = Math.max(1, Math.floor((plotRight - plotLeft) / TIE_MARKER_STEP) + 1);
  for (const group of groups.values()) {
    const ordered = group.slice().sort((left, right) => compareUtf8Binary(left.modelKey, right.modelKey));
    if (ordered.length === 1) {
      scatter.set(ordered[0]!.modelKey, base.get(ordered[0]!.modelKey)!);
      continue;
    }
    const columns = Math.min(ordered.length, maximumColumns);
    const rows = Math.ceil(ordered.length / columns);
    const offsets = ordered.map((_, index) => ({
      x: (index % columns - (columns - 1) / 2) * TIE_MARKER_STEP,
      y: (Math.floor(index / columns) - (rows - 1) / 2) * TIE_MARKER_STEP,
    }));
    const minimumX = Math.min(...offsets.map((offset) => offset.x));
    const maximumX = Math.max(...offsets.map((offset) => offset.x));
    const minimumY = Math.min(...offsets.map((offset) => offset.y));
    const maximumY = Math.max(...offsets.map((offset) => offset.y));
    const origin = base.get(ordered[0]!.modelKey)!;
    const clusterX = clamp(origin.x, plotLeft - minimumX, plotRight - maximumX);
    const clusterY = clamp(origin.y, plotTop - minimumY, plotBottom - maximumY);
    ordered.forEach((point, index) => {
      const offset = offsets[index]!;
      scatter.set(point.modelKey, { x: clusterX + offset.x, y: clusterY + offset.y });
    });
  }
  return { costRange, scoreRange, base, scatter };
}

function frontierPath(
  points: readonly PricePerformancePointView[],
  coordinates: ReadonlyMap<string, ChartCoordinate>,
): string {
  const frontier = points.filter((point) => point.frontier).sort((left, right) => left.selectedCost - right.selectedCost || right.score - left.score);
  return frontier.map((point, index) => {
    const coordinate = coordinates.get(point.modelKey)!;
    return `${index === 0 ? 'M' : 'L'} ${coordinate.x.toFixed(2)} ${coordinate.y.toFixed(2)}`;
  }).join(' ');
}

export function pointAccessibleName(point: PricePerformancePointView): string {
  return formatPricePerformancePointView(point).accessibleName;
}

function PointDetails({
  point,
  attribution,
  onClose,
}: {
  readonly point: PricePerformancePointView;
  readonly attribution: readonly PricePerformanceAttribution[];
  readonly onClose: () => void;
}) {
  const facts = formatPricePerformancePointView(point, attribution);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener('keydown', onKeyDown);
    return () => dialog.removeEventListener('keydown', onKeyDown);
  }, []);
  return <div ref={dialogRef} className="price-performance-point-details" role="dialog" aria-modal="true" aria-labelledby="price-performance-details-heading">
    <div className="price-performance-details-heading">
      <div><span className="eyebrow">Selected point</span><h2 id="price-performance-details-heading">{point.displayName} details</h2></div>
      <button ref={closeButtonRef} className="button button-secondary" type="button" onClick={onClose} aria-label="Close model details">Close</button>
    </div>
    <dl className="price-performance-details-facts">
      <div><dt>Score</dt><dd>{facts.score}</dd></div>
      <div><dt>Selected cost</dt><dd>{facts.selectedCost}</dd></div>
      <div><dt>Score per dollar</dt><dd>{facts.scorePerDollar}</dd></div>
      <div><dt>Provider and route</dt><dd>{facts.sourceHref ? <a href={facts.sourceHref} target="_blank" rel="noreferrer">{facts.sourceLinkLabel}</a> : facts.sourceLinkLabel}</dd></div>
      <div><dt>Evidence</dt><dd>{facts.evidence}</dd></div>
      <div><dt>Frontier state</dt><dd>{facts.frontier}</dd></div>
    </dl>
    <a className="button button-primary" href={facts.profileHref}>{facts.profileLinkLabel}</a>
  </div>;
}

export function PricePerformanceChart({
  points,
  attribution = [],
  lane = 'overall',
  basis = 'output',
  scale = 'linear',
  onSelect,
}: PricePerformanceChartProps) {
  const [selected, setSelected] = useState<PricePerformancePointView | null>(null);
  const chartSummaryId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const costs = useMemo(() => points.map((point) => point.selectedCost), [points]);
  const scores = useMemo(() => points.map((point) => point.score), [points]);
  const safeScale = scale === 'log' && costs.every((cost) => Number.isFinite(cost) && cost > 0) ? 'log' : 'linear';
  const layout = useMemo(() => pricePerformanceChartLayout(points, safeScale), [points, safeScale]);
  const label = `${humanize(lane)} score by ${basis === 'output' ? 'output price' : '3:1 blended price'}`;
  const costTicks = useMemo(() => costs.length === 0 ? [] : axisTickValues(costs, safeScale), [costs, safeScale]);
  const scoreTicks = useMemo(() => scores.length === 0 ? [] : axisTickValues(scores, 'linear'), [scores]);
  const frontierCount = points.filter((point) => point.frontier).length;
  const summaryText = points.length === 0
    ? 'No eligible models match these filters.'
    : `Scatter plot with ${points.length} model${points.length === 1 ? '' : 's'}. ${frontierCount} Pareto frontier point${frontierCount === 1 ? '' : 's'}. Score values range from ${formatAxisNumber(Math.min(...scores))} to ${formatAxisNumber(Math.max(...scores))}. Selected cost values range from ${formatAxisNumber(Math.min(...costs))} to ${formatAxisNumber(Math.max(...costs))}.`;

  useEffect(() => {
    if (selected && !points.some((point) => point.modelKey === selected.modelKey)) setSelected(null);
  }, [points, selected]);

  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setSelected(null);
      triggerRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selected]);

  if (points.length === 0) {
    return <div className="price-performance-chart-empty" role="status" aria-label="No eligible models match these filters"><strong>No eligible models match these filters</strong><p>Try another score lane, provider, evidence state, or price band.</p></div>;
  }

  const selectPoint = (point: PricePerformancePointView, trigger?: HTMLButtonElement) => {
    if (trigger) triggerRef.current = trigger;
    setSelected(point);
    onSelect?.(point);
  };
  const closeSelected = () => {
    setSelected(null);
    triggerRef.current?.focus();
  };

  return <figure className="price-performance-chart-figure">
    <svg className="price-performance-chart-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="group" aria-label={label} aria-describedby={chartSummaryId} preserveAspectRatio="xMidYMid meet">
      <g className="price-performance-chart-axes">
        <line x1={PLOT.left} y1={PLOT.top} x2={PLOT.left} y2={HEIGHT - PLOT.bottom} />
        <line x1={PLOT.left} y1={HEIGHT - PLOT.bottom} x2={WIDTH - PLOT.right} y2={HEIGHT - PLOT.bottom} />
        {scoreTicks.map((value) => {
          const y = yCoordinate(value, layout!.scoreRange);
          return <g key={`score-${value}`}><line className="price-performance-chart-gridline" x1={PLOT.left} y1={y} x2={WIDTH - PLOT.right} y2={y} /><text x={PLOT.left - 10} y={y + 4} textAnchor="end">{formatAxisNumber(value)}</text></g>;
        })}
        {costTicks.map((value) => {
          const x = xCoordinate(value, layout!.costRange, safeScale);
          return <g key={`cost-${value}`}><line className="price-performance-chart-gridline" x1={x} y1={PLOT.top} x2={x} y2={HEIGHT - PLOT.bottom} /><text x={x} y={HEIGHT - 34} textAnchor="middle">{formatAxisNumber(value)}</text></g>;
        })}
        <text x={(PLOT.left + WIDTH - PLOT.right) / 2} y={HEIGHT - 12} textAnchor="middle">Cost</text>
        <text x={PLOT.left - 10} y={PLOT.top - 8} textAnchor="end">Score</text>
      </g>
      <path className="price-performance-frontier" d={frontierPath(points, layout!.base)} aria-hidden="true" />
      {points.map((point) => {
        const base = layout!.base.get(point.modelKey)!;
        const scatter = layout!.scatter.get(point.modelKey)!;
        return base.x === scatter.x && base.y === scatter.y
          ? null
          : <line key={`tie-${point.modelKey}`} className="price-performance-tie-connector" x1={base.x} y1={base.y} x2={scatter.x} y2={scatter.y} aria-hidden="true" />;
      })}
      {points.map((point) => {
        const coordinates = layout!.scatter.get(point.modelKey)!;
        const facts = formatPricePerformancePointView(point, attribution);
        const base = layout!.base.get(point.modelKey)!;
        const tieSeparated = base.x !== coordinates.x || base.y !== coordinates.y;
        return <foreignObject key={point.modelKey} className="price-performance-scatter-point" data-frontier={point.frontier ? 'true' : 'false'} data-evidence={point.evidenceStatus} data-tie-separated={tieSeparated ? 'true' : 'false'} x={coordinates.x - (MARKER_SIZE + 4) / 2} y={coordinates.y - (MARKER_SIZE + 4) / 2} width={MARKER_SIZE + 4} height={MARKER_SIZE + 4}>
          <button
            className={`scatter-point evidence-${point.evidenceStatus}${point.frontier ? ' scatter-point-frontier' : ''}`}
            type="button"
            aria-label={facts.accessibleName}
            data-model-key={point.modelKey}
            onClick={(event) => selectPoint(point, event.currentTarget)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                selectPoint(point, event.currentTarget);
              }
            }}
            onTouchEnd={(event) => {
              event.preventDefault();
              selectPoint(point, event.currentTarget);
            }}
          ><span aria-hidden="true">{point.frontier ? '◆' : '●'}</span><span className="sr-only">{point.frontier ? 'Frontier point' : 'Non-frontier point'}</span></button>
        </foreignObject>;
      })}
    </svg>
    <p id={chartSummaryId} className="sr-only">{summaryText}</p>
    <div className="price-performance-chart-legend" aria-label="Chart legend">
      <span><span className="price-performance-legend-marker frontier" aria-hidden="true">◆</span>Pareto frontier</span>
      <span><span className="price-performance-legend-marker supported" aria-hidden="true">●</span>Supported evidence</span>
      <span><span className="price-performance-legend-marker estimated" aria-hidden="true">●</span>Estimated evidence</span>
      <span><span className="price-performance-legend-marker source-only" aria-hidden="true">●</span>Source-only evidence</span>
    </div>
    <figcaption className="price-performance-chart-caption">Each point is keyboard and touch accessible. Exact score/cost ties are separated with connector lines so every model keeps a full touch target. Shape and text identify frontier and evidence state; details include the durable model profile link.</figcaption>
    {selected ? <PointDetails point={selected} attribution={attribution} onClose={closeSelected} /> : null}
  </figure>;
}

export { formatPricePerformancePointView } from './price-performance-view';
