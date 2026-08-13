import { AxisBottom, AxisLeft } from '@visx/axis';
import { Group } from '@visx/group';
import { scaleLinear } from '@visx/scale';
import { LinePath } from '@visx/shape';
import { CHART_THEME } from './chart-theme';

export interface CostScorePoint {
  readonly label: string;
  readonly cost: number;
  readonly score: number;
  readonly frontier: boolean;
  readonly href: string | null;
}

export interface CostScoreScatterProps {
  readonly data: readonly CostScorePoint[];
  readonly ariaLabel: string;
  readonly width?: number;
}

const MARGIN = { top: 16, right: 24, bottom: 48, left: 56 } as const;
const HEIGHT = 360;

/**
 * Plots published score against published cost so overpaying is visible in a
 * way a sorted table cannot show. The connected line is the Pareto frontier:
 * models where no cheaper option scores higher.
 *
 * Renders nothing unless every supplied point is finite. A partially drawn
 * chart would silently misrepresent the published evidence, so an incomplete
 * input is surfaced by the caller as an explicit unavailable state instead.
 */
export function CostScoreScatter({ data, ariaLabel, width = 720 }: CostScoreScatterProps) {
  const points = data.filter((point) => Number.isFinite(point.cost) && Number.isFinite(point.score));
  if (points.length === 0 || points.length !== data.length) return null;

  const plotWidth = Math.max(120, width - MARGIN.left - MARGIN.right);
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const maxCost = Math.max(...points.map((point) => point.cost), 0);
  const maxScore = Math.max(...points.map((point) => point.score), 0);
  const x = scaleLinear({ domain: [0, maxCost === 0 ? 1 : maxCost], range: [0, plotWidth], nice: true });
  const y = scaleLinear({ domain: [0, maxScore === 0 ? 1 : maxScore], range: [plotHeight, 0], nice: true });
  const frontier = points
    .filter((point) => point.frontier)
    .slice()
    .sort((left, right) => left.cost - right.cost);

  return <svg
    className="cost-score-scatter"
    viewBox={`0 0 ${width} ${HEIGHT}`}
    width="100%"
    height={HEIGHT}
    role="img"
    aria-label={ariaLabel}
  >
    <Group left={MARGIN.left} top={MARGIN.top}>
      {frontier.length > 1 ? <LinePath
        className="cost-score-frontier"
        data={frontier}
        x={(point) => x(point.cost)}
        y={(point) => y(point.score)}
        stroke={CHART_THEME.bar}
        strokeWidth={2}
        fill="none"
      /> : null}
      {points.map((point) => <circle
        key={point.label}
        className={point.frontier ? 'cost-score-point cost-score-point-frontier' : 'cost-score-point'}
        cx={x(point.cost)}
        cy={y(point.score)}
        r={point.frontier ? 6 : 4}
        fill={point.frontier ? CHART_THEME.bar : CHART_THEME.barMuted}
      >
        <title>{`${point.label}: ${point.score} at $${point.cost} per 1M tokens`}</title>
      </circle>)}
      <AxisLeft
        scale={y}
        numTicks={5}
        stroke={CHART_THEME.axis}
        tickStroke={CHART_THEME.axis}
        label="Score"
        tickLabelProps={() => ({ className: 'cost-score-tick', textAnchor: 'end', dx: '-0.25em', dy: '0.25em' })}
      />
      <AxisBottom
        top={plotHeight}
        scale={x}
        numTicks={5}
        stroke={CHART_THEME.axis}
        tickStroke={CHART_THEME.axis}
        label="USD per 1M tokens"
        tickLabelProps={() => ({ className: 'cost-score-tick', textAnchor: 'middle', dy: '0.25em' })}
      />
    </Group>
  </svg>;
}
