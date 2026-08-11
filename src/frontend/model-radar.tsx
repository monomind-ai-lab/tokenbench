import type { ModelProfileRadarAxis } from '../benchmarks/model-profile';

export interface ModelRadarProps {
  readonly axes: readonly ModelProfileRadarAxis[];
}

const SIZE = 360;
const CENTER = SIZE / 2;
const RADIUS = 132;

function point(index: number, count: number, radius: number) {
  const angle = -Math.PI / 2 + index * 2 * Math.PI / count;
  return { x: CENTER + Math.cos(angle) * radius, y: CENTER + Math.sin(angle) * radius };
}

function pointsFor(count: number, radius: number): string {
  return Array.from({ length: count }, (_, index) => {
    const current = point(index, count, radius);
    return `${current.x},${current.y}`;
  }).join(' ');
}

function percentileLabel(value: number): string {
  return `${value.toFixed(1)} percentile`;
}

export function ModelRadar({ axes }: ModelRadarProps) {
  const count = Math.max(axes.length, 3);
  const allAvailable = axes.length >= 3 && axes.every((axis) => axis.percentile !== null);
  const evidencePoints = allAvailable
    ? axes.map((axis, index) => point(index, count, RADIUS * Math.max(0, Math.min(100, axis.percentile ?? 0)) / 100))
    : [];
  return <section className="model-profile-section model-radar-section" aria-label="Capability radar">
    <div className="model-section-heading">
      <div><p className="eyebrow">Relative field position</p><h2>Capability radar</h2></div>
      <p>Percentiles use eligible source ranks. Missing axes remain unavailable and never become zero.</p>
    </div>
    <div className="model-radar-layout">
      <svg className="model-radar-chart" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Capability ranking percentile radar">
        {[25, 50, 75, 100].map((level) => <polygon key={level} points={pointsFor(count, RADIUS * level / 100)} className="model-radar-grid" />)}
        {axes.map((axis, index) => {
          const edge = point(index, count, RADIUS);
          const label = point(index, count, RADIUS + 28);
          const available = axis.percentile !== null;
          const valuePoint = point(index, count, RADIUS * Math.max(0, Math.min(100, axis.percentile ?? 0)) / 100);
          return <g key={axis.key}>
            <line x1={CENTER} y1={CENTER} x2={edge.x} y2={edge.y} className="model-radar-axis" />
            <text x={label.x} y={label.y} textAnchor={label.x < CENTER - 8 ? 'end' : label.x > CENTER + 8 ? 'start' : 'middle'} className="model-radar-label">{axis.label}</text>
            {available ? <circle cx={valuePoint.x} cy={valuePoint.y} r="5" className="model-radar-point" /> : null}
          </g>;
        })}
        {allAvailable ? <polygon points={evidencePoints.map(({ x, y }) => `${x},${y}`).join(' ')} className="model-radar-evidence" /> : null}
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
