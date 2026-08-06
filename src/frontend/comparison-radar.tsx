import { compareUtf8Binary, type BenchmarkModel } from '../benchmarks/contracts';
import { friendlyMetricLabel } from './comparison-summary';
import { isSupportedBenchLmComparisonMetric, type ComparisonMetricRow } from './comparison-contracts';

export interface RadarAxis {
  readonly label: string;
  readonly modelA: number;
  readonly modelB: number;
  readonly minimum: number;
  readonly maximum: number;
}

interface RadarAxisEntry {
  readonly axis: RadarAxis;
  readonly identity: string;
  readonly metricKey: string;
  readonly methodology: string;
  readonly sourceId: string;
  readonly unit: string;
}

const CENTER = 160;
const RADIUS = 112;
const LABEL_RADIUS = RADIUS + 14;

function isMatchingRankingEligibleScore(
  metric: NonNullable<ComparisonMetricRow['modelA']>,
  row: ComparisonMetricRow,
): boolean {
  return metric.metricKey === row.metricKey
    && metric.sourceId === row.sourceId
    && metric.sourceArtifactId.length > 0
    && metric.unit === row.unit
    && metric.methodology === row.methodology
    && metric.rankingEligible === true
    && Number.isFinite(metric.value)
    && metric.value >= 0;
}

function isScorePair(
  row: ComparisonMetricRow,
  models: readonly [BenchmarkModel, BenchmarkModel],
): boolean {
  const { modelA, modelB } = row;
  return row.unit === 'score'
    && modelA !== null
    && modelB !== null
    && isSupportedBenchLmComparisonMetric(row, models)
    && modelA.sourceArtifactId === modelB.sourceArtifactId
    && isMatchingRankingEligibleScore(modelA, row)
    && isMatchingRankingEligibleScore(modelB, row);
}

function compareRadarEntries(left: RadarAxisEntry, right: RadarAxisEntry): number {
  return compareUtf8Binary(left.axis.label, right.axis.label)
    || compareUtf8Binary(left.metricKey, right.metricKey)
    || compareUtf8Binary(left.identity, right.identity);
}

function radarAxisEntries(
  rows: readonly ComparisonMetricRow[],
  models: readonly [BenchmarkModel, BenchmarkModel],
): readonly RadarAxisEntry[] {
  const entries = rows
    .filter((row) => isScorePair(row, models))
    .map((row) => {
      const modelA = row.modelA!;
      const modelB = row.modelB!;
      return {
        axis: {
          label: friendlyMetricLabel(row.metricKey, row.category),
          modelA: modelA.value,
          modelB: modelB.value,
          minimum: Math.min(modelA.value, modelB.value),
          maximum: Math.max(modelA.value, modelB.value),
        },
        identity: [row.metricKey, row.sourceId, modelA.sourceArtifactId, row.methodology].join('\u0000'),
        metricKey: row.metricKey,
        methodology: row.methodology,
        sourceId: row.sourceId,
        unit: row.unit,
      };
    })
    .sort(compareRadarEntries);

  return entries.length >= 4 ? entries : [];
}

export function radarAxes(
  rows: readonly ComparisonMetricRow[],
  models: readonly [BenchmarkModel, BenchmarkModel],
): readonly RadarAxis[] {
  return radarAxisEntries(rows, models).map(({ axis }) => axis);
}

function roundedCoordinate(value: number): number {
  return Number(value.toFixed(3));
}

function radialPoint(index: number, count: number, radius: number): readonly [number, number] {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
  return [
    roundedCoordinate(CENTER + Math.cos(angle) * radius),
    roundedCoordinate(CENTER + Math.sin(angle) * radius),
  ];
}

function point(axis: RadarAxis, index: number, count: number, value: number): readonly [number, number] {
  const proportion = axis.maximum === 0 ? 0 : value / axis.maximum;
  return radialPoint(index, count, RADIUS * proportion);
}

function labelPlacement(index: number, count: number): { readonly x: number; readonly y: number; readonly textAnchor: 'start' | 'middle' | 'end' } {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
  const [x, y] = radialPoint(index, count, LABEL_RADIUS);
  const horizontalPosition = Math.cos(angle);
  return {
    x,
    y,
    textAnchor: horizontalPosition > 0.3 ? 'end' : horizontalPosition < -0.3 ? 'start' : 'middle',
  };
}

function svgPoints(points: readonly (readonly [number, number])[]): string {
  return points.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' ');
}

function formatExactValue(value: number): string {
  return String(value);
}

export function ComparisonRadar({
  modelAName,
  modelBName,
  models,
  rows,
}: {
  readonly modelAName: string;
  readonly modelBName: string;
  readonly models: readonly [BenchmarkModel, BenchmarkModel];
  readonly rows: readonly ComparisonMetricRow[];
}) {
  const entries = radarAxisEntries(rows, models);
  if (entries.length === 0) return null;

  const axes = entries.map(({ axis }) => axis);
  const modelAPoints = axes.map((axis, index) => point(axis, index, axes.length, axis.modelA));
  const modelBPoints = axes.map((axis, index) => point(axis, index, axes.length, axis.modelB));
  const boundaryPoints = axes.map((_axis, index) => radialPoint(index, axes.length, RADIUS));
  const allValuesZero = axes.every((axis) => axis.maximum === 0);
  const chartLabel = `${modelAName} and ${modelBName} shared metric radar`;

  return <section className="comparison-radar">
    <figure className="comparison-radar-figure">
      <figcaption>Per-axis relative view: each axis scales to the higher published value for that exact shared metric. The table preserves the exact published values and units.</figcaption>
      <ul className="comparison-radar-legend" aria-label="Radar chart series">
        <li><span className="comparison-radar-legend-swatch comparison-radar-legend-swatch-a" aria-hidden="true" />{modelAName}: solid line</li>
        <li><span className="comparison-radar-legend-swatch comparison-radar-legend-swatch-b" aria-hidden="true" />{modelBName}: dashed line</li>
      </ul>
      {allValuesZero ? <p className="comparison-radar-zero-note">All compatible source values are zero; plotted points meet at the center.</p> : null}
      <svg className="comparison-radar-chart" viewBox="0 0 320 320" role="img" aria-label={chartLabel}>
        <title>{chartLabel}</title>
        <polygon className="comparison-radar-boundary" points={svgPoints(boundaryPoints)} aria-hidden="true" />
        <polygon className="comparison-radar-series comparison-radar-series-a" points={svgPoints(modelAPoints)} strokeDasharray="none" aria-hidden="true" />
        <polygon className="comparison-radar-series comparison-radar-series-b" points={svgPoints(modelBPoints)} strokeDasharray="7 4" aria-hidden="true" />
        {axes.map((axis, index) => {
          const { x, y, textAnchor } = labelPlacement(index, axes.length);
          return <text className="comparison-radar-axis-label" key={entries[index]!.identity} x={x} y={y} textAnchor={textAnchor}>{axis.label}</text>;
        })}
        {modelAPoints.map(([cx, cy], index) => <circle className="comparison-radar-marker comparison-radar-marker-a" key={`a-${entries[index]!.identity}`} cx={cx} cy={cy} r="3" aria-hidden="true" />)}
        {modelBPoints.map(([cx, cy], index) => <circle className="comparison-radar-marker comparison-radar-marker-b" key={`b-${entries[index]!.identity}`} cx={cx} cy={cy} r="3" aria-hidden="true" />)}
      </svg>
      <table className="comparison-radar-table" aria-label="Radar chart data">
        <caption>Exact published values used in the per-axis relative radar chart.</caption>
        <thead><tr><th scope="col">Metric</th><th scope="col">{modelAName}</th><th scope="col">{modelBName}</th><th scope="col">Unit</th></tr></thead>
        <tbody>{entries.map(({ axis, identity, unit }) => <tr key={identity}>
          <th scope="row">{axis.label}</th>
          <td>{formatExactValue(axis.modelA)}</td>
          <td>{formatExactValue(axis.modelB)}</td>
          <td>{unit}</td>
        </tr>)}</tbody>
      </table>
    </figure>
  </section>;
}
