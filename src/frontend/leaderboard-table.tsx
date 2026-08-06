import type { LeaderboardEntry, LeaderboardSort } from '../benchmarks/leaderboards';
import { LEADERBOARD_ROUTES, type LeaderboardKey } from '../routing/routes';
import { formatDateTime } from './ui';
import type { BenchmarkAttribution, BenchmarkFreshness } from './use-benchmarks';

interface LeaderboardTableProps {
  readonly keyName: LeaderboardKey;
  readonly entries: readonly LeaderboardEntry[];
  readonly sort: LeaderboardSort;
  readonly onSortChange: (sort: LeaderboardSort) => void;
  readonly publishedAt: string;
  readonly freshness: BenchmarkFreshness;
  readonly attribution: readonly BenchmarkAttribution[];
}

function tableLabel(keyName: LeaderboardKey): string {
  return LEADERBOARD_ROUTES[keyName].seo.h1;
}

function cardLabel(keyName: LeaderboardKey): string {
  return `${tableLabel(keyName).replace(/s$/, '')} cards`;
}

function sortDirection(sort: LeaderboardSort, expected: LeaderboardSort): 'ascending' | 'descending' | 'none' {
  if (sort !== expected) return 'none';
  return expected === 'rank-asc' || expected === 'price-asc' ? 'ascending' : 'descending';
}

function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(value);
}

function formatPrice(value: number | null): string {
  return value === null ? 'Unavailable' : `$${formatNumber(value, 4)} / 1M`;
}

function formatContext(value: number | null): string {
  return value === null ? 'Unavailable' : `${formatNumber(value)} tokens`;
}

function metricLabel(metricKey: string): string {
  const labels: Record<string, string> = {
    'benchlm:overall:raw': 'BenchLM overall',
    'benchlm:category:coding': 'BenchLM coding',
    'benchlm:category:agentic': 'BenchLM agentic',
    'benchlm:category:multimodal': 'BenchLM multimodal',
    'lmarena:text_style_control:overall': 'LMArena human preference',
    'lmarena:vision_style_control:overall': 'LMArena vision',
    'lmarena:document_style_control:overall': 'LMArena documents',
    'lmarena:text_to_image:overall': 'LMArena text to image',
    'lmarena:image_edit:overall': 'LMArena image editing',
    'lmarena:text_to_video:overall': 'LMArena text to video',
    'lmarena:image_to_video:overall': 'LMArena image to video',
    'lmarena:video_edit:overall': 'LMArena video editing',
  };
  return labels[metricKey] ?? metricKey;
}

function sourceLenses(entry: LeaderboardEntry) {
  return entry.metrics.length > 0 ? entry.metrics : entry.metric ? [entry.metric] : [];
}

function isEstimated(entry: LeaderboardEntry): boolean {
  return entry.model.evidenceStatus === 'estimated';
}

function evidenceLabel(entry: LeaderboardEntry): string {
  switch (entry.model.evidenceStatus) {
    case 'estimated': return 'Estimated';
    case 'source_only': return 'Source-only';
    default: return 'Supported';
  }
}

function badgeFor(keyName: LeaderboardKey, entry: LeaderboardEntry, position: number): string | null {
  if (isEstimated(entry)) return null;
  if (keyName === 'llm-value' && entry.onValueFrontier) return 'Value Frontier';
  if (position !== 1) return null;
  if (keyName === 'llm-coding') return 'Top Coding';
  if (keyName === 'llm-human-preference' || keyName.startsWith('media-')) return 'Arena Leader';
  return 'Top Capability';
}

function LensList({ entry }: { readonly entry: LeaderboardEntry }) {
  if (isEstimated(entry)) return <span>Unavailable</span>;
  const lenses = sourceLenses(entry);
  if (lenses.length === 0) return <span>Unavailable</span>;
  return <ul className="leaderboard-lenses" aria-label={`${entry.model.name} source lenses`}>
    {lenses.map((metric) => <li key={`${metric.sourceId}-${metric.metricKey}-${metric.sourceArtifactId}`}>
      <span>{metricLabel(metric.metricKey)}</span>
      <strong>{formatNumber(metric.value)}</strong>
      {metric.rank !== null ? <small>Source rank {metric.rank}</small> : null}
    </li>)}
  </ul>;
}

export function LeaderboardEvidence({
  publishedAt,
  freshness,
  attribution,
  label = 'Leaderboard evidence',
  compact = false,
}: Pick<LeaderboardTableProps, 'publishedAt' | 'freshness' | 'attribution'> & {
  readonly label?: string;
  readonly compact?: boolean;
}) {
  return <footer className={`leaderboard-evidence${compact ? ' leaderboard-evidence-compact' : ''}`} aria-label={label}>
    <p><strong>Published</strong> {formatDateTime(publishedAt)} <span aria-hidden="true">·</span> <strong>Checked</strong> {formatDateTime(freshness.checkedAt)} <span className={`leaderboard-freshness freshness-${freshness.status}`}>{freshness.status === 'fresh' ? 'Fresh' : 'Stale'}</span></p>
    {freshness.message ? <p className="muted">{freshness.message}</p> : null}
    <ul aria-label="Source attribution">
      {attribution.map((source) => <li key={`${source.sourceId}-${source.url}`}><a href={source.url} target="_blank" rel="noreferrer">{source.label}</a><span>Updated {formatDateTime(source.updatedAt)}</span></li>)}
    </ul>
  </footer>;
}

function Badge({ value }: { readonly value: string | null }) {
  return value ? <span className="leaderboard-badge">{value}</span> : null;
}

function Card({ keyName, entry, position }: { readonly keyName: LeaderboardKey; readonly entry: LeaderboardEntry; readonly position: number | null; readonly key?: string }) {
  const estimated = isEstimated(entry);
  return <li className={`leaderboard-card${estimated ? ' leaderboard-card-estimated' : ''}`}>
    <div className="leaderboard-card-heading"><span className="leaderboard-position">{position === null ? 'Unranked' : `#${position}`}</span><Badge value={badgeFor(keyName, entry, position ?? 0)} /></div>
    <h3>{entry.model.name}</h3>
    <p className="leaderboard-provider">{entry.model.creator} <span className={`leaderboard-evidence-status evidence-${entry.model.evidenceStatus}`}>{evidenceLabel(entry)}</span></p>
    <dl>
      <div><dt>Metric</dt><dd><LensList entry={entry} /></dd></div>
      <div><dt>Blended cost</dt><dd>{estimated ? 'Unavailable' : formatPrice(entry.blendedCostPerMillion)}</dd></div>
      <div><dt>Context</dt><dd>{estimated ? 'Unavailable' : formatContext(entry.contextWindowTokens)}</dd></div>
      <div><dt>Source rank</dt><dd>{estimated || entry.sourceRank === null ? 'Unavailable' : entry.sourceRank}</dd></div>
    </dl>
  </li>;
}

export function LeaderboardTable({ keyName, entries, sort, onSortChange, publishedAt, freshness, attribution }: LeaderboardTableProps) {
  const label = tableLabel(keyName);
  const orderDescriptionId = `leaderboard-order-${keyName}`;
  const usesSourceLensOrder = keyName === 'multimodal-vision-documents' && sort === 'score-desc';
  const orderDescription = usesSourceLensOrder
    ? 'Current order preserves the published BenchLM multimodal, LMArena vision, and LMArena document lens groups.'
    : sort === 'pareto-score-desc'
      ? 'Current order: value-frontier entries first, then metric score descending, blended cost ascending, and canonical model slug.'
      : null;
  let rankedPosition = 0;
  const rows = entries.map((entry) => ({ entry, position: isEstimated(entry) ? null : ++rankedPosition }));
  return <section className="leaderboard-results" aria-label={label}>
    <div className="leaderboard-desktop-table">
      <table aria-label={label} aria-describedby={orderDescription ? orderDescriptionId : undefined}>
        {orderDescription ? <caption id={orderDescriptionId} className="sr-only">{orderDescription}</caption> : null}
        <thead>
          <tr>
            <th scope="col" aria-sort={sortDirection(sort, 'rank-asc')}><button className="leaderboard-sort-button" type="button" onClick={() => onSortChange('rank-asc')} aria-label="Sort by position">Position</button></th>
            <th scope="col">Model</th>
            <th scope="col" aria-sort={usesSourceLensOrder ? 'other' : sortDirection(sort, 'score-desc')}><button className="leaderboard-sort-button" type="button" onClick={() => onSortChange('score-desc')} aria-label={keyName === 'multimodal-vision-documents' ? 'Use source lens order' : 'Sort by metric'}>Metric</button></th>
            <th scope="col" aria-sort={sortDirection(sort, 'price-asc')}><button className="leaderboard-sort-button" type="button" onClick={() => onSortChange('price-asc')} aria-label="Sort by blended cost">Blended cost</button></th>
            <th scope="col" aria-sort={sortDirection(sort, 'context-desc')}><button className="leaderboard-sort-button" type="button" onClick={() => onSortChange('context-desc')} aria-label="Sort by context window">Context</button></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ entry, position }) => <tr key={entry.model.modelKey} className={isEstimated(entry) ? 'leaderboard-row-estimated' : undefined}>
            <td>{position === null ? 'Unranked' : `#${position}`}</td>
            <th scope="row"><div className="leaderboard-model"><span>{entry.model.name}</span><small>{entry.model.creator}</small><span className={`leaderboard-evidence-status evidence-${entry.model.evidenceStatus}`}>{evidenceLabel(entry)}</span><Badge value={badgeFor(keyName, entry, position ?? 0)} /></div></th>
            <td><LensList entry={entry} /></td>
            <td>{isEstimated(entry) ? 'Unavailable' : formatPrice(entry.blendedCostPerMillion)}</td>
            <td>{isEstimated(entry) ? 'Unavailable' : formatContext(entry.contextWindowTokens)}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
    <ol className="leaderboard-card-list" aria-label={cardLabel(keyName)}>
      {rows.map(({ entry, position }) => <Card key={entry.model.modelKey} keyName={keyName} entry={entry} position={position} />)}
    </ol>
    <LeaderboardEvidence publishedAt={publishedAt} freshness={freshness} attribution={attribution} />
  </section>;
}
