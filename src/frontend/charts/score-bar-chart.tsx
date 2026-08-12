import { AxisBottom } from '@visx/axis';
import { Group } from '@visx/group';
import { scaleBand, scaleLinear } from '@visx/scale';
import { Bar } from '@visx/shape';
import { CHART_THEME } from './chart-theme';

export interface ScoreBarChartDatum {
  readonly label: string;
  readonly value: number;
  readonly muted?: boolean;
}

export interface ScoreBarChartProps {
  readonly data: readonly ScoreBarChartDatum[];
  readonly ariaLabel: string;
  readonly unit?: string;
  readonly width?: number;
}

const ROW_HEIGHT = 26;
const LABEL_WIDTH = 168;
const VALUE_WIDTH = 64;
const AXIS_HEIGHT = 28;

export function ScoreBarChart({ data, ariaLabel, unit = 'score', width = 720 }: ScoreBarChartProps) {
  if (data.length === 0) return null;
  const plotWidth = Math.max(120, width - LABEL_WIDTH - VALUE_WIDTH);
  const plotHeight = data.length * ROW_HEIGHT;
  const height = plotHeight + AXIS_HEIGHT;
  const maxValue = Math.max(...data.map((datum) => datum.value), 0);
  const x = scaleLinear({ domain: [0, maxValue === 0 ? 1 : maxValue], range: [0, plotWidth] });
  const y = scaleBand({ domain: data.map((datum) => datum.label), range: [0, plotHeight], padding: 0.28 });
  return <svg
    className="score-bar-chart"
    viewBox={`0 0 ${width} ${height}`}
    width="100%"
    height={height}
    role="img"
    aria-label={ariaLabel}
  >
    <Group left={LABEL_WIDTH}>
      {data.map((datum) => {
        const barY = y(datum.label) ?? 0;
        const barWidth = Math.max(1, x(datum.value));
        return <Group key={datum.label}>
          <text x={-10} y={barY + y.bandwidth() / 2} textAnchor="end" dominantBaseline="middle" className="score-bar-chart-label">{datum.label}</text>
          <Bar x={0} y={barY} width={barWidth} height={y.bandwidth()} rx={3} fill={datum.muted ? CHART_THEME.barMuted : CHART_THEME.bar} />
          <text x={barWidth + 8} y={barY + y.bandwidth() / 2} dominantBaseline="middle" className="score-bar-chart-value">{datum.value}</text>
        </Group>;
      })}
      <AxisBottom
        top={plotHeight}
        scale={x}
        numTicks={4}
        stroke={CHART_THEME.axis}
        tickStroke={CHART_THEME.axis}
        label={unit}
        tickLabelProps={() => ({ className: 'score-bar-chart-tick', textAnchor: 'middle', dy: '0.25em' })}
      />
    </Group>
  </svg>;
}
