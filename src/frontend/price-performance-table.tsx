import type { PricePerformancePointView } from '../benchmarks/price-performance-contracts';
import { formatPricePerformancePointView, type PricePerformancePointViewFacts } from './price-performance-view';

export interface PricePerformanceTableProps {
  readonly points: readonly PricePerformancePointView[];
  readonly label?: string;
  readonly showEmptyState?: boolean;
}

function PointFacts({ facts }: { readonly facts: PricePerformancePointViewFacts }) {
  return <>
    <div><dt>Score</dt><dd>{facts.score}</dd></div>
    <div><dt>Selected cost</dt><dd>{facts.selectedCost}</dd></div>
    <div><dt>Score per dollar</dt><dd>{facts.scorePerDollar}</dd></div>
    <div><dt>Provider / route</dt><dd>{facts.provider} · {facts.route}</dd></div>
    <div><dt>Evidence</dt><dd>{facts.evidence}</dd></div>
    <div><dt>Frontier</dt><dd>{facts.frontier}</dd></div>
  </>;
}

function MobileCard({ point, facts }: { readonly point: PricePerformancePointView; readonly facts: PricePerformancePointViewFacts; readonly key?: string }) {
  return <li className="price-performance-card">
    <div className="price-performance-card-heading"><h3>{facts.modelName}</h3><span className={`price-performance-status status-${point.status}`}>{facts.status}</span></div>
    <dl><PointFacts facts={facts} /></dl>
    <a className="price-performance-profile-link" href={facts.profileHref}>{facts.profileLinkLabel}</a>
  </li>;
}
export function PricePerformanceTable({ points, label = 'Price versus performance values', showEmptyState = true }: PricePerformanceTableProps) {
  const rows = points.map((point) => ({ point, facts: formatPricePerformancePointView(point) }));
  return <section className="price-performance-table-section" aria-label={label}>
    {showEmptyState && rows.length === 0 ? <div className="price-performance-table-empty" role="status" aria-label="No eligible models match these filters"><strong>No eligible models match these filters</strong><p>Unavailable values are excluded rather than treated as zero.</p></div> : null}
    <div className="price-performance-desktop-table">
      <table aria-label={label}>
        <caption className="sr-only">Price versus performance values for the selected filters</caption>
        <thead><tr>
          <th scope="col">Model</th>
          <th scope="col">Score</th>
          <th scope="col">Selected cost</th>
          <th scope="col">Score / dollar</th>
          <th scope="col">Provider / route</th>
          <th scope="col">Evidence</th>
          <th scope="col">Frontier</th>
          <th scope="col">Profile</th>
        </tr></thead>
        <tbody>{rows.map(({ point, facts }) => <tr key={point.modelKey}>
          <th scope="row">{facts.modelName}<span className={`price-performance-status status-${point.status}`}>{facts.status}</span></th>
          <td>{facts.score}</td>
          <td>{facts.selectedCost}</td>
          <td>{facts.scorePerDollar}</td>
          <td>{facts.provider} · {facts.route}</td>
          <td>{facts.evidence}</td>
          <td>{facts.frontier}</td>
          <td><a className="price-performance-profile-link" href={facts.profileHref}>{facts.profileLinkLabel}</a></td>
        </tr>)}</tbody>
      </table>
    </div>
    <ol className="price-performance-mobile-cards" aria-label="Price versus performance model cards">
      {rows.map(({ point, facts }) => <MobileCard key={point.modelKey} point={point} facts={facts} />)}
    </ol>
  </section>;
}

export { formatPricePerformancePointView } from './price-performance-view';
