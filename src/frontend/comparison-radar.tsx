import type { ChartConfiguration } from 'chart.js';
import { compareUtf8Binary, type BenchmarkModel } from '../benchmarks/contracts';
import { friendlyMetricLabel } from './comparison-summary';
import { isSupportedBenchLmComparisonMetric, type ComparisonMetricRow } from './comparison-contracts';
import { TokenBenchChartCanvas } from './charts/chart-canvas';

export interface RadarAxis {
  readonly label: string;
  readonly modelA: number;
  readonly modelB: number;
  readonly sourceId: string;
  readonly inspectionId: string;
  readonly unit: string;
}

function isCompatibleScore(row: ComparisonMetricRow, models: readonly [BenchmarkModel, BenchmarkModel]): boolean {
  const { modelA, modelB } = row;
  return row.unit === 'score'
    && modelA !== null
    && modelB !== null
    && modelA.sourceId === modelB.sourceId
    && modelA.sourceArtifactId === modelB.sourceArtifactId
    && modelA.methodology === modelB.methodology
    && modelA.rankingEligible
    && modelB.rankingEligible
    && Number.isFinite(modelA.value)
    && Number.isFinite(modelB.value)
    && modelA.value >= 0
    && modelB.value >= 0
    && isSupportedBenchLmComparisonMetric(row, models);
}

function axisEntries(rows: readonly ComparisonMetricRow[], models: readonly [BenchmarkModel, BenchmarkModel]): readonly RadarAxis[] {
  const compatible = rows
    .filter((row) => isCompatibleScore(row, models))
    .map((row) => ({
      label: friendlyMetricLabel(row.metricKey, row.category),
      modelA: row.modelA!.value,
      modelB: row.modelB!.value,
      sourceId: row.sourceId,
      inspectionId: [row.metricKey, row.sourceId, row.modelA!.sourceArtifactId, row.methodology].join('\u0000'),
      unit: row.unit,
    }))
    .sort((left, right) => compareUtf8Binary(left.label, right.label) || compareUtf8Binary(left.inspectionId, right.inspectionId));
  return compatible.length >= 6 ? compatible.slice(0, 6) : [];
}

export function radarAxes(rows: readonly ComparisonMetricRow[], models: readonly [BenchmarkModel, BenchmarkModel]): readonly RadarAxis[] {
  return axisEntries(rows, models);
}

function exactValue(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value);
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
  const axes = axisEntries(rows, models);
  if (axes.length === 0) return null;

  const configuration: ChartConfiguration<'radar'> = {
    type: 'radar',
    data: {
      labels: axes.map((axis) => axis.label),
      datasets: [
        { label: modelAName, data: axes.map((axis) => axis.modelA), borderColor: '#0e7490', backgroundColor: 'rgba(14, 116, 144, 0.16)', pointBackgroundColor: '#0e7490' },
        { label: modelBName, data: axes.map((axis) => axis.modelB), borderColor: '#be123c', backgroundColor: 'rgba(190, 18, 60, 0.13)', pointBackgroundColor: '#be123c' },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: { r: { beginAtZero: true, ticks: { display: false } } },
      plugins: { legend: { position: 'bottom' } },
    },
  };
  const table = <table className="comparison-radar-table" aria-label="Radar chart data">
    <caption>Exact published values used in the six-axis radar chart.</caption>
    <thead><tr><th scope="col">Metric</th><th scope="col">{modelAName}</th><th scope="col">{modelBName}</th><th scope="col">Unit</th></tr></thead>
    <tbody>{axes.map((axis) => <tr data-inspection-id={axis.inspectionId} data-source-id={axis.sourceId} key={axis.inspectionId}>
      <th scope="row">{axis.label}</th><td>{exactValue(axis.modelA)}</td><td>{exactValue(axis.modelB)}</td><td>{axis.unit}</td>
    </tr>)}</tbody>
  </table>;

  return <section className="comparison-radar">
    <TokenBenchChartCanvas
      className="comparison-radar-figure"
      configuration={configuration}
      data={axes}
      finding="Six compatible source-backed axes are plotted here; the adjacent table keeps the exact published values, source IDs, and inspection identities available."
      table={table}
      title={`${modelAName} and ${modelBName} shared metric radar`}
    />
  </section>;
}
