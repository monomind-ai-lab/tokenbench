import type { ModelProfileRadarAxis } from '../benchmarks/model-profile';

export interface ModelRadarProps {
  readonly axes: readonly ModelProfileRadarAxis[];
}

const SIZE = 360;
const CENTER = SIZE / 2;
const RADIUS = 132;
const LABEL_RADIUS = RADIUS + 16;
/**
 * Smallest plotted radius for a measured axis.
 *
 * A 0 percentile is real evidence, but plotting it at the exact centre makes
 * it visually identical to an axis with no evidence at all. A measured floor
 * keeps the marker visible and readable without implying a higher value.
 */
const MEASURED_FLOOR_RADIUS = 6;

function radiusFor(percentile: number): number {
  const bounded = Math.max(0, Math.min(100, percentile));
  return MEASURED_FLOOR_RADIUS + (RADIUS - MEASURED_FLOOR_RADIUS) * bounded / 100;
}

function point(index: number, count: number, radius: number) {
  const angle = -Math.PI / 2 + index * 2 * Math.PI / count;
  return { x: CENTER + Math.cos(angle) * radius, y: CENTER + Math.sin(angle) * radius };
}

function pointsFor(count: number, radius: number): string {
  return Array.from({ length: count }, (_, index) => {
    const current = point(index, count, radius);
    return `${current.x.toFixed(3)},${current.y.toFixed(3)}`;
  }).join(' ');
}

function percentileLabel(value: number): string {
  return `${value.toFixed(1)} percentile`;
}

export function ModelRadar({ axes }: ModelRadarProps) {
  const count = Math.max(axes.length, 3);
  const boundaryPoints = pointsFor(count, RADIUS);
  const measured = axes.filter((axis) => axis.percentile !== null).length;
  const evidencePoints = axes
    .map((axis, index) => ({ axis, index }))
    .filter(({ axis }) => axis.percentile !== null)
    .map(({ axis, index }) => point(index, count, radiusFor(axis.percentile ?? 0)));
  const seriesPoints = evidencePoints.length >= 3
    ? evidencePoints.map(({ x, y }) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' ')
    : '';
  return <section className="model-profile-section model-radar-section" aria-label="Capability radar">
    <div className="model-section-heading">
      <div><p className="eyebrow">Relative field position</p><h2>Capability radar</h2></div>
      <p>Percentiles use eligible source ranks. Missing axes remain unavailable and never become zero.</p>
    </div>
    <div className="model-radar-layout">
      <svg className="model-radar-chart" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Capability ranking percentile radar">
        <title>Capability ranking percentile radar</title>
        <polygon className="model-radar-boundary" points={boundaryPoints} aria-hidden="true" />
        {measured >= 3 ? <polygon className="model-radar-evidence" points={seriesPoints} aria-hidden="true" /> : null}
        {axes.map((axis, index) => {
          const label = point(index, count, LABEL_RADIUS);
          const available = axis.percentile !== null;
          const valuePoint = point(index, count, radiusFor(axis.percentile ?? 0));
          return <g key={axis.key}>
            <text x={label.x} y={label.y} textAnchor="middle" className="model-radar-label">{axis.label}</text>
            {available ? <circle
              cx={valuePoint.x}
              cy={valuePoint.y}
              r="3"
              className={axis.percentile === 0 ? 'model-radar-point model-radar-point-floor' : 'model-radar-point'}
              aria-hidden="true"
            /> : null}
          </g>;
        })}
      </svg>
      <dl className="model-radar-text" aria-label="Capability radar values">
        {axes.map((axis) => <div key={axis.key}>
          <dt>{axis.label} percentile</dt>
          <dd>{axis.percentile === null
            ? `${axis.label}: Unavailable`
            : <><strong>{percentileLabel(axis.percentile)}</strong><span>{axis.rank !== null && axis.fieldSize !== null ? `Rank #${axis.rank} of ${axis.fieldSize}` : 'Eligible field unavailable'}</span></>}</dd>
        </div>)}
      </dl>
    </div>
  </section>;
}
