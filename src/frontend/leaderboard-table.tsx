import { LEADERBOARD_DEFINITIONS, type LeaderboardEntry, type LeaderboardSort } from '../benchmarks/leaderboards';
import { modelPath } from '../benchmarks/model-directory';
import { LEADERBOARD_ROUTES, type LeaderboardKey } from '../routing/routes';
import { formatDateTime } from './ui';
import type { BenchmarkAttribution, BenchmarkFreshness } from './use-benchmarks';
import type { LeaderboardQueryCapabilities } from './leaderboard-filter-state';
import { ProviderMark } from './provider-mark';

interface LeaderboardTableProps {
  readonly keyName: LeaderboardKey;
  readonly entries: readonly LeaderboardEntry[];
  readonly rankOffset?: number;
  readonly sort: LeaderboardSort;
  readonly onSortChange: (sort: LeaderboardSort) => void;
  readonly capabilities?: LeaderboardQueryCapabilities;
}

interface LeaderboardEvidenceProps {
  readonly publishedAt: string;
  readonly freshness: BenchmarkFreshness;
  readonly attribution: readonly BenchmarkAttribution[];
  readonly label?: string;
  readonly compact?: boolean;
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

function formatMetricValue(value: number, unit: string): string {
  return unit === 'score'
    ? new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)
    : formatNumber(value);
}

function formatContext(value: number | null): string {
  return value === null ? 'Unavailable' : `${formatNumber(value)} tokens`;
}

function sourceLenses(entry: LeaderboardEntry) {
  return entry.metrics.length > 0 ? entry.metrics : entry.metric ? [entry.metric] : [];
}

function isEstimated(entry: LeaderboardEntry): boolean {
  return entry.model.evidenceStatus === 'estimated';
}

function badgeFor(keyName: LeaderboardKey, entry: LeaderboardEntry, position: number): string | null {
  if (isEstimated(entry)) return null;
  if (keyName === 'llm-value' && entry.onValueFrontier) return 'Value Frontier';
  if (position !== 1) return null;
  if (keyName === 'llm-coding') return 'Top Coding';
  if (keyName === 'llm-reasoning') return 'Top Reasoning';
  if (keyName === 'llm-knowledge') return 'Top Knowledge';
  if (keyName === 'llm-human-preference' || keyName.startsWith('media-')) return 'Arena Leader';
  return 'Top Capability';
}

function usesPublishedSourceRank(keyName: LeaderboardKey): boolean {
  const kind = LEADERBOARD_DEFINITIONS[keyName].kind;
  return kind === 'benchlm' || kind === 'lmarena' || kind === 'multimodal';
}

/** True when at least one row has modality evidence worth a column. */
export function hasModalityEvidence(entries: readonly LeaderboardEntry[]): boolean {
  return entries.some((entry) => {
    const price = entry.primaryPrice;
    return (price?.inputModalities?.length ?? 0) > 0 || (price?.outputModalities?.length ?? 0) > 0;
  });
}

export interface GroupedAttribution {
  readonly sourceId: string;
  readonly label: string;
  readonly urls: readonly string[];
  readonly updatedAt: string;
}

/** Collapses per-artifact attribution into one row per source. */
export function groupAttribution(
  attribution: readonly { sourceId: string; label: string; url: string; updatedAt: string }[],
): readonly GroupedAttribution[] {
  const bySource = new Map<string, { sourceId: string; label: string; urls: string[]; updatedAt: string }>();
  for (const item of attribution) {
    const existing = bySource.get(item.sourceId);
    if (!existing) {
      bySource.set(item.sourceId, { sourceId: item.sourceId, label: item.label, urls: [item.url], updatedAt: item.updatedAt });
      continue;
    }
    if (!existing.urls.includes(item.url)) existing.urls.push(item.url);
    if (item.updatedAt > existing.updatedAt) existing.updatedAt = item.updatedAt;
  }
  return [...bySource.values()];
}

function ScoreValue({ entry }: { readonly entry: LeaderboardEntry }) {
  if (isEstimated(entry)) return <span>Unavailable</span>;
  const lenses = sourceLenses(entry);
  if (lenses.length === 0) return <span>Unavailable</span>;
  return <span className="leaderboard-score-value">{formatMetricValue(lenses[0].value, lenses[0].unit)}</span>;
}

function ModalitiesValue({ entry }: { readonly entry: LeaderboardEntry }) {
  const price = entry.primaryPrice;
  const input = price?.inputModalities ?? null;
  const output = price?.outputModalities ?? null;
  if (input === null && output === null) return <span>Unavailable</span>;
  const parts: string[] = [];
  if (input !== null && input.length > 0) parts.push(input.join(', '));
  if (output !== null && output.length > 0) parts.push(output.join(', '));
  if (parts.length === 0) return <span>Unavailable</span>;
  return <span className="leaderboard-modalities">{parts.join(' · ')}</span>;
}

export function LeaderboardEvidence({
  publishedAt,
  freshness,
  attribution,
  label = 'Leaderboard evidence',
  compact = false,
}: LeaderboardEvidenceProps) {
  return <footer className={`leaderboard-evidence${compact ? ' leaderboard-evidence-compact' : ''}`} aria-label={label}>
    <p><strong>Published</strong> {formatDateTime(publishedAt)} <span aria-hidden="true">·</span> <strong>Checked</strong> {formatDateTime(freshness.checkedAt)} <span className={`leaderboard-freshness freshness-${freshness.status}`}>{freshness.status === 'fresh' ? 'Fresh' : 'Stale'}</span></p>
    {freshness.message ? <p className="muted">{freshness.message}</p> : null}
    <ul aria-label="Source attribution">
      {groupAttribution(attribution).map((source) => <li key={source.sourceId}>
        {source.urls.length > 1
          ? <><span>{source.label}</span>{source.urls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer">Source {index + 1}</a>)}</>
          : <a href={source.urls[0]} target="_blank" rel="noreferrer">{source.label}</a>}
        <span>Observed {formatDateTime(source.updatedAt)}</span>
      </li>)}
    </ul>
  </footer>;
}

function Badge({ value }: { readonly value: string | null }) {
  return value ? <span className="leaderboard-badge">{value}</span> : null;
}

function ProviderIdentity({ entry }: { readonly entry: LeaderboardEntry }) {
  return <span className="leaderboard-provider"><ProviderMark providerId={entry.model.creator} providerName={entry.model.creator} decorative size={20} /><span>{entry.model.creator}</span></span>;
}

function Card({ keyName, entry, position, showModalities }: { readonly keyName: LeaderboardKey; readonly entry: LeaderboardEntry; readonly position: number | null; readonly showModalities: boolean; readonly key?: string }) {
  const estimated = isEstimated(entry);
  return <li className={`leaderboard-card${estimated ? ' leaderboard-card-estimated' : ''}`}>
    <div className="leaderboard-card-heading"><span className="leaderboard-position">{position === null ? 'Unranked' : `#${position}`}</span><Badge value={badgeFor(keyName, entry, position ?? 0)} /></div>
    <h3><a href={modelPath(entry.model.slug)}>{entry.model.name}</a></h3>
    <p className="leaderboard-provider"><ProviderMark providerId={entry.model.creator} providerName={entry.model.creator} decorative size={20} /><span>{entry.model.creator}</span></p>
    <dl>
      <div><dt>Score</dt><dd><ScoreValue entry={entry} /></dd></div>
      {showModalities ? <div><dt>Supported Modalities</dt><dd><ModalitiesValue entry={entry} /></dd></div> : null}
      <div><dt>Context</dt><dd>{estimated ? 'Unavailable' : formatContext(entry.contextWindowTokens)}</dd></div>
      <div><dt>Source rank</dt><dd>{estimated || !usesPublishedSourceRank(keyName) || entry.sourceRank === null ? 'Unavailable' : entry.sourceRank}</dd></div>
    </dl>
  </li>;
}

export function LeaderboardTable({ keyName, entries, rankOffset = 0, sort, onSortChange, capabilities }: LeaderboardTableProps) {
  const label = tableLabel(keyName);
  const showModalities = hasModalityEvidence(entries);
  const orderDescriptionId = `leaderboard-order-${keyName}`;
  const usesSourceLensOrder = keyName === 'multimodal-vision-documents' && sort === 'score-desc';
  const canSort = (candidate: LeaderboardSort) => capabilities === undefined || capabilities.sorts.includes(candidate);
  const orderDescription = usesSourceLensOrder
    ? 'Current order preserves the published BenchLM multimodal, LMArena vision, and LMArena document lens groups.'
    : sort === 'pareto-score-desc'
      ? 'Current order: value-frontier entries first, then metric score descending, blended cost ascending, and canonical model slug.'
      : null;
  const sourceRanked = usesPublishedSourceRank(keyName);
  let rankedPosition = Number.isSafeInteger(rankOffset) && rankOffset >= 0 ? rankOffset : 0;
  const rows = entries.map((entry) => ({
    entry,
    position: isEstimated(entry) ? null : sourceRanked ? entry.sourceRank : ++rankedPosition,
  }));
  return <section className="leaderboard-results" aria-label={label}>
    <div className="leaderboard-desktop-table">
      <table aria-label={label} aria-describedby={orderDescription ? orderDescriptionId : undefined}>
        {orderDescription ? <caption id={orderDescriptionId} className="sr-only">{orderDescription}</caption> : null}
        <thead>
          <tr>
            <th scope="col" aria-sort={canSort('rank-asc') ? sortDirection(sort, 'rank-asc') : 'none'}>{canSort('rank-asc') ? <button className="leaderboard-sort-button" type="button" onClick={() => onSortChange('rank-asc')} aria-label="Sort by position">Position</button> : 'Position'}</th>
            <th scope="col">Model</th>
            <th scope="col" aria-sort={canSort('score-desc') ? (usesSourceLensOrder ? 'other' : sortDirection(sort, 'score-desc')) : 'none'}>{canSort('score-desc') ? <button className="leaderboard-sort-button" type="button" onClick={() => onSortChange('score-desc')} aria-label={keyName === 'multimodal-vision-documents' ? 'Use source lens order' : 'Sort by score'}>Score</button> : 'Score'}</th>
            {showModalities ? <th scope="col">Supported Modalities</th> : null}
            <th scope="col" aria-sort={canSort('context-desc') ? sortDirection(sort, 'context-desc') : 'none'}>{canSort('context-desc') ? <button className="leaderboard-sort-button" type="button" onClick={() => onSortChange('context-desc')} aria-label="Sort by context window">Context</button> : 'Context'}</th>
            <th scope="col">Source rank</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ entry, position }) => <tr key={entry.model.modelKey} className={isEstimated(entry) ? 'leaderboard-row-estimated' : undefined}>
            <td>{position === null ? 'Unranked' : `#${position}`}</td>
            <th scope="row"><div className="leaderboard-model"><a href={modelPath(entry.model.slug)}>{entry.model.name}</a><ProviderIdentity entry={entry} /><Badge value={badgeFor(keyName, entry, position ?? 0)} /></div></th>
            <td><ScoreValue entry={entry} /></td>
            {showModalities ? <td><ModalitiesValue entry={entry} /></td> : null}
            <td>{isEstimated(entry) ? 'Unavailable' : formatContext(entry.contextWindowTokens)}</td>
            <td>{isEstimated(entry) || !sourceRanked || entry.sourceRank === null ? 'Unavailable' : entry.sourceRank}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
    <ol className="leaderboard-card-list" aria-label={cardLabel(keyName)}>
      {rows.map(({ entry, position }) => <Card key={entry.model.modelKey} keyName={keyName} entry={entry} position={position} showModalities={showModalities} />)}
    </ol>
  </section>;
}
