import type { ChartConfiguration } from 'chart.js';
import { trackTokenBenchEvent } from './analytics';
import { TokenBenchChartCanvas } from './charts/chart-canvas';
import type { BreakevenResult } from './breakeven-state';

function usd(value: number): string {
  return new Intl.NumberFormat('en-US', { currency: 'USD', maximumFractionDigits: 2, style: 'currency' }).format(value);
}

function million(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(2)}M`;
}

/** Chart.js enhancement over the exact cost-sample table rendered beside it. */
export function BreakevenChart({ result }: { readonly result: Extract<BreakevenResult, { kind: 'available' }> }) {
  const labels = result.points.map((point) => million(point.tokensMillions));
  const configuration: ChartConfiguration<'line'> = {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Metered API cost', data: result.points.map((point) => point.apiCost), borderColor: '#741a66', backgroundColor: 'transparent', tension: 0.2 },
        { label: 'Subscription fee', data: result.points.map((point) => point.subscriptionCost), borderColor: '#7a4b00', backgroundColor: 'transparent', borderDash: [6, 4], tension: 0 },
      ],
    },
    options: {
      plugins: { legend: { display: true }, tooltip: { enabled: true } },
      scales: { y: { beginAtZero: true, title: { display: true, text: 'Monthly cost (USD)' } }, x: { title: { display: true, text: 'Monthly tokens' } } },
    },
  };
  const table = <div className="breakeven-table-scroll" role="region" aria-label="Exact breakeven values" tabIndex={0}>
    <table aria-label="Breakeven cost samples">
      <caption>Breakeven cost samples</caption>
      <thead><tr><th scope="col">Monthly tokens</th><th scope="col">Metered API cost</th><th scope="col">Subscription fee</th><th scope="col">Lower cost</th></tr></thead>
      <tbody>{result.points.map((point) => <tr key={point.tokensMillions}>
        <th scope="row">{million(point.tokensMillions)}</th><td>{usd(point.apiCost)}</td><td>{usd(point.subscriptionCost)}</td><td>{point.cheaper === 'api' ? 'API' : point.cheaper === 'subscription' ? 'Subscription' : 'Equal'}</td>
      </tr>)}</tbody>
    </table>
  </div>;

  return <section className="breakeven-chart-panel" aria-labelledby="breakeven-chart-heading">
    <h2 id="breakeven-chart-heading">Fee crossover by monthly token volume</h2>
    <TokenBenchChartCanvas
      className="breakeven-chart"
      configuration={configuration}
      data={result.points}
      finding={result.message}
      onFailure={() => trackTokenBenchEvent('chart_failed', { chartKind: 'breakeven', reason: 'render', route: '/cost/breakeven/' })}
      table={table}
      title="Breakeven API cost and subscription fee"
    />
  </section>;
}
