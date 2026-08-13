import { CHART_THEME } from './chart-theme';

export interface PercentileBarProps {
  readonly percentile: number | null;
  readonly label: string;
}

const WIDTH = 120;
const HEIGHT = 8;

/**
 * Renders a published percentile as a short bar. A missing or non-finite
 * percentile renders an explicit `Unavailable`, never a zero-width bar that
 * would read as a real last-place measurement.
 */
export function PercentileBar({ percentile, label }: PercentileBarProps) {
  if (percentile === null || !Number.isFinite(percentile)) {
    return <span className="percentile-bar-unavailable">Unavailable</span>;
  }
  const clamped = Math.min(100, Math.max(0, percentile));
  const filled = (clamped / 100) * WIDTH;
  const text = `${clamped.toFixed(1)}%`;
  return <span className="percentile-bar">
    <svg
      className="percentile-bar-track"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
      role="img"
      aria-label={`${label}: ${text}`}
    >
      <rect x={0} y={0} width={WIDTH} height={HEIGHT} rx={4} fill={CHART_THEME.grid} />
      <rect x={0} y={0} width={filled} height={HEIGHT} rx={4} fill={CHART_THEME.bar} />
    </svg>
    <span className="percentile-bar-value">{text}</span>
  </span>;
}
