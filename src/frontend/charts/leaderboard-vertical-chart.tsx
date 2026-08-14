import { useMemo } from 'react';
import type { ChartConfiguration, Plugin } from 'chart.js';
import type { LeaderboardEntry } from '../../benchmarks/leaderboards';
import { buildTopEntries } from '../../benchmarks/v21-leaderboards';
import { TokenBenchChartCanvas } from './chart-canvas';

export interface LeaderboardVerticalChartProps {
  readonly title: string;
  readonly entries: readonly LeaderboardEntry[];
}

const PROVIDER_COLORS = ['#4f46e5', '#0f766e', '#b45309', '#be123c', '#0369a1', '#7e22ce'];

function providerColor(provider: string): string {
  let hash = 0;
  for (const character of provider) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return PROVIDER_COLORS[Math.abs(hash) % PROVIDER_COLORS.length]!;
}

const integerInBarLabels: Plugin<'bar'> = {
  id: 'tokenbench-v21-integer-bar-labels',
  afterDatasetsDraw(chart) {
    const dataset = chart.data.datasets[0];
    if (!dataset) return;
    const elements = chart.getDatasetMeta(0).data;
    const context = chart.ctx;
    context.save();
    context.fillStyle = '#ffffff';
    context.font = '600 11px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'top';
    elements.forEach((element, index) => {
      const value = dataset.data[index];
      if (typeof value !== 'number') return;
      const { x, y } = element.getProps(['x', 'y'], true);
      context.fillText(String(Math.round(value)), x, y + 5);
    });
    context.restore();
  },
};

export function LeaderboardVerticalChart({ title, entries }: LeaderboardVerticalChartProps) {
  const topEntries = useMemo(() => buildTopEntries(entries, 20), [entries]);
  const ariaLabel = `${title} Top 20 vertical index`;
  const configuration = useMemo<ChartConfiguration<'bar'>>(() => ({
    type: 'bar',
    data: {
      labels: topEntries.map((entry) => entry.model.name),
      datasets: [{
        label: `${title} score`,
        data: topEntries.map((entry) => entry.metric!.value),
        backgroundColor: topEntries.map((entry) => providerColor(entry.model.creator)),
        borderWidth: 0,
        borderRadius: 4,
      }],
    },
    plugins: [integerInBarLabels],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: { maxRotation: 55, minRotation: 55, autoSkip: false },
        },
        y: {
          min: 0,
          max: 100,
          ticks: { stepSize: 20 },
        },
      },
      plugins: { legend: { display: false } },
    },
  }), [title, topEntries]);

  if (topEntries.length === 0) return null;

  return <section className="leaderboard-vertical-index" aria-label={ariaLabel}>
    <div role="img" aria-label={ariaLabel}>
      <TokenBenchChartCanvas
        className="leaderboard-vertical-chart"
        title={`${title} Top 20 vertical index`}
        finding="Bars use the exact published category score on a 0–100 scale. Integer labels appear inside each bar."
        configuration={configuration}
        data={topEntries}
        table={<table className="sr-only"><caption>{`${title} Top 20 exact index`}</caption><tbody>{topEntries.map((entry) => <tr key={entry.model.modelKey}><th scope="row">{entry.model.name}</th><td>{entry.metric!.value}</td></tr>)}</tbody></table>}
      />
    </div>
    <ol className="leaderboard-vertical-index-key" aria-label={`${title} Top 20 model index`}>
      {topEntries.map((entry) => <li key={entry.model.modelKey}>
        <span className="leaderboard-vertical-provider" style={{ color: providerColor(entry.model.creator) }}>{entry.model.creator}</span>
        <span>{entry.model.name}</span>
        {entry.model.reasoningType ? <span className="leaderboard-reasoning-marker">{entry.model.reasoningType}</span> : null}
        <strong>{Math.round(entry.metric!.value)}</strong>
      </li>)}
    </ol>
  </section>;
}
