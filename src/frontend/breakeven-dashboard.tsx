import { buildBreakevenSeries, formatCurrencyMicroDollars, type CalculatorSnapshot } from './calculator-state';

export interface BreakevenDashboardProps { readonly snapshot: CalculatorSnapshot; readonly hasAvailableModels: boolean }

export function BreakevenDashboard({ snapshot, hasAvailableModels }: BreakevenDashboardProps) {
  const series = hasAvailableModels ? buildBreakevenSeries(snapshot) : { status: 'unavailable' as const, reason: 'No verified models are available.', points: [] as const };
  if (series.status === 'unavailable') return <section className="results-panel" aria-label="Breakeven analysis"><h2>Breakeven evidence</h2><p><strong>Unavailable</strong></p><p>{series.reason}</p></section>;
  const maxApiCost = Math.max(...series.points.flatMap((point) => [point.apiCostMicroDollars, point.planFeeMicroDollars]), 1);
  const width = 640;
  const height = 220;
  const x = (index: number) => 24 + (index * (width - 48)) / Math.max(series.points.length - 1, 1);
  const y = (value: number) => height - 24 - (value / maxApiCost) * (height - 48);
  const apiPath = series.points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(point.apiCostMicroDollars)}`).join(' ');
  const planY = y(series.points[0].planFeeMicroDollars);
  return <section className="results-panel breakeven-dashboard" aria-label="Breakeven analysis">
    <h2>Breakeven evidence</h2><p>Derived from the shared calculator snapshot using the selected plan fee and published API price.</p>
    <figure><svg className="breakeven-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="breakeven-chart-title breakeven-chart-description"><title id="breakeven-chart-title">Breakeven API cost compared with subscription fee by monthly tokens</title><desc id="breakeven-chart-description">The API cost line uses the exact shared snapshot series. The plan fee is a flat horizontal line.</desc><path d={apiPath} data-testid="breakeven-api-series" fill="none" stroke="currentColor" strokeWidth="3" /><line x1="24" x2={width - 24} y1={planY} y2={planY} data-testid="breakeven-plan-series" stroke="var(--color-plum, #741a66)" strokeDasharray="8 6" strokeWidth="3" />{series.points.map((point, index) => <circle key={point.tokens} cx={x(index)} cy={y(point.apiCostMicroDollars)} data-testid="breakeven-api-point" r="4" />)}</svg><figcaption>API cost rises with monthly tokens; the published plan fee remains fixed.</figcaption></figure>
    <div className="breakeven-table-scroll" role="region" aria-label="Exact breakeven values" tabIndex={0}><table><caption>Exact breakeven series</caption><thead><tr><th scope="col">Monthly tokens</th><th scope="col">API cost</th><th scope="col">Plan fee</th><th scope="col">Difference</th></tr></thead><tbody>{series.points.map((point) => <tr key={point.tokens}><th scope="row">{point.tokens.toLocaleString()}</th><td>{formatCurrencyMicroDollars(point.apiCostMicroDollars)}</td><td>{formatCurrencyMicroDollars(point.planFeeMicroDollars)}</td><td>{formatCurrencyMicroDollars(point.differenceMicroDollars)}</td></tr>)}</tbody></table></div>
  </section>;
}
