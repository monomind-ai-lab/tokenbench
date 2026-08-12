import { useEffect, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { LEADERBOARD_NAVIGATION, LEADERBOARD_ROUTES, ROUTE_PATHS, type LeaderboardKey } from '../routing/routes';
import type { DecisionPickEntry, DecisionPickGroup } from '../benchmarks/decision-picks';
import { EmptyState, Skeleton, formatDateTime } from '../frontend/ui';
import {
  LeaderboardFilters,
} from '../frontend/leaderboard-filters';
import {
  bootstrapLeaderboardFilters,
  leaderboardFilterCapabilities,
  normalizeLeaderboardFilters,
  parseLeaderboardFilters,
  sameLeaderboardFilters,
  serializeLeaderboardFilters,
  type LeaderboardFilterState,
  type LeaderboardQueryCapabilities,
} from '../frontend/leaderboard-filter-state';
import { LeaderboardEvidence, LeaderboardTable } from '../frontend/leaderboard-table';
import { ScoreBarChart, type ScoreBarChartDatum } from '../frontend/charts/score-bar-chart';
import type { LeaderboardEntry } from '../benchmarks/leaderboards';
import { ProviderMark } from '../frontend/provider-mark';
import { ShareAction } from '../frontend/share-action';
import { useBenchmarkLeaderboard, useDecisionPicks } from '../frontend/use-benchmarks';
import { SITE_CONFIG } from '../brand/site-config';

const UNRANKED_LENS_KEYS = new Set<LeaderboardKey>(['llm-reasoning', 'llm-knowledge']);

/**
 * Positions are published source ranks, so a category view can legitimately
 * start at #2 or skip a number when the model at that rank has no measurement
 * for the category. Say so, rather than letting the gap read as a defect.
 */
export function positionNoteFor(keyName: LeaderboardKey): string {
  return UNRANKED_LENS_KEYS.has(keyName)
    ? 'This is an unranked evidence lens. Positions come from the source where published, and rows without a published rank stay unranked rather than being renumbered.'
    : 'Positions are the published source rank, not the row number. A gap means the model at that rank has no published measurement for this category.';
}

function methodologySummary(keyName: LeaderboardKey): string {
  if (keyName === 'llm-value') {
    return 'This is an overall-capability value frontier: it pairs supported BenchLM overall evidence with a disclosed workload price. It is not a coding-value ranking.';
  }
  if (keyName === 'llm-pricing-context') {
    return 'Pricing and context stay tied to their exact OpenRouter route. Missing prices and context windows remain unavailable.';
  }
  if (keyName === 'multimodal-vision-documents') {
    return 'BenchLM multimodal, LMArena vision, and LMArena document lenses stay separately labeled. They are not merged into one score.';
  }
  if (keyName === 'llm-human-preference' || keyName.startsWith('media-')) {
    return 'LMArena evidence remains an exact source lens: source rank, category, and publication time stay visible without being blended with BenchLM scores.';
  }
  return 'Only the exact published source metric for this route is shown. Missing measurements remain unavailable rather than being converted to zero.';
}

function useLeaderboardFilters(keyName: LeaderboardKey): [LeaderboardFilterState, (filters: LeaderboardFilterState) => void] {
  const [filters, setFilters] = useState(() => parseLeaderboardFilters(
    typeof window === 'undefined' ? '' : window.location.search,
    keyName,
  ));
  return [filters, setFilters];
}

interface LeaderboardPageCursorState {
  readonly identity: string;
  readonly cursor: string | null;
  readonly previousCursors: readonly (string | null)[];
}

function firstLeaderboardPage(identity: string): LeaderboardPageCursorState {
  return { identity, cursor: null, previousCursors: [] };
}

function sameValues<T>(left: readonly T[] | null, right: readonly T[] | null): boolean {
  return left === right || (left !== null && right !== null
    && left.length === right.length
    && left.every((value, index) => value === right[index]));
}

/** Responses decode into fresh objects; only real complete-projection changes should refetch. */
function sameLeaderboardCapabilities(
  left: LeaderboardQueryCapabilities,
  right: LeaderboardQueryCapabilities,
): boolean {
  return left.dataReady === right.dataReady
    && left.defaultProfile === right.defaultProfile
    && left.defaultSort === right.defaultSort
    && left.supportsProfile === right.supportsProfile
    && left.supportsEstimated === right.supportsEstimated
    && left.supportsLifecycle === right.supportsLifecycle
    && left.priceMode === right.priceMode
    && left.supportsPrice === right.supportsPrice
    && sameValues(left.priceValues, right.priceValues)
    && sameValues(left.metricKeys, right.metricKeys)
    && sameValues(left.sorts, right.sorts)
    && sameValues(left.providers, right.providers)
    && sameValues(left.sourceTypes, right.sourceTypes)
    && sameValues(left.evidenceStatuses, right.evidenceStatuses);
}

function LeaderboardPagination({
  entriesCount,
  limit,
  total,
  pageIndex,
  hasNextPage,
  onPrevious,
  onNext,
}: {
  readonly entriesCount: number;
  readonly limit: number;
  readonly total: number;
  readonly pageIndex: number;
  readonly hasNextPage: boolean;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
}) {
  const start = entriesCount === 0 ? 0 : pageIndex * limit + 1;
  const end = entriesCount === 0 ? 0 : Math.min(total, start + entriesCount - 1);
  return <nav className="leaderboard-pagination" aria-label="Leaderboard result pages">
    <p aria-live="polite">{entriesCount === 0 ? `Showing 0 of ${total} published entries` : `Showing ${start}–${end} of ${total} published entries`}</p>
    <div>
      <button type="button" className="button button-secondary button-small" onClick={onPrevious} disabled={pageIndex === 0}>Previous page</button>
      <button type="button" className="button button-secondary button-small" onClick={onNext} disabled={!hasNextPage}>Next page</button>
    </div>
  </nav>;
}

function RelatedLeaderboards({ keyName }: { readonly keyName?: LeaderboardKey }) {
  const links = LEADERBOARD_NAVIGATION.filter((item) => item.key !== keyName);
  return <section className="leaderboard-related" aria-labelledby="related-leaderboards-heading">
    <div className="panel-heading"><div><span className="eyebrow">Explore by lens</span><h2 id="related-leaderboards-heading">Related leaderboards</h2></div></div>
    <nav aria-label="Related leaderboards">
      {links.map((item) => <a key={item.key} href={item.pathname}>{item.label} <ArrowRight aria-hidden="true" size={14} /></a>)}
    </nav>
  </section>;
}

function MonoMindCta() {
  return <aside className="panel leaderboard-monomind-cta" aria-label="MonoMind optimization services">
    <span className="eyebrow">MonoMind AI Lab</span>
    <h2>Need a workload-specific model decision?</h2>
    <p>MonoMind can review routing, caching, evaluation design, and agent architecture against the evidence and operating constraints that matter to your team.</p>
    <a className="button" href="https://monomind.one/">Talk to MonoMind <ArrowRight aria-hidden="true" size={16} /></a>
  </aside>;
}

function LeaderboardState({
  phase,
  error,
  onRetry,
}: {
  readonly phase: 'stale' | 'unavailable' | 'error';
  readonly error: string | null;
  readonly onRetry: () => void;
}) {
  if (phase === 'stale') {
    return <div className="empty-state leaderboard-state" role="status"><strong>Stale benchmark data</strong><p>{error ?? 'The published revision is past its freshness window. TokenBench is showing the last published results while the next refresh is overdue.'}</p><button type="button" className="button button-secondary" onClick={onRetry}>Retry benchmark refresh</button></div>;
  }
  if (phase === 'unavailable') {
    return <div className="empty-state leaderboard-state" role="status"><strong>Unavailable</strong><p>{error ?? 'No valid published benchmark revision is available for this route.'}</p><button type="button" className="button button-secondary" onClick={onRetry}>Retry benchmark request</button></div>;
  }
  return <div className="empty-state leaderboard-state" role="alert"><strong>Unable to load benchmark data</strong><p>{error ?? 'The cached benchmark request failed.'}</p><button type="button" className="button button-secondary" onClick={onRetry}>Retry benchmark request</button></div>;
}

/**
 * Projects leaderboard rows into chart rows without inventing a score. Rows
 * with no published measurement are dropped rather than plotted at zero.
 */
export function scoreChartData(
  entries: readonly LeaderboardEntry[],
  limit = 12,
): readonly ScoreBarChartDatum[] {
  return entries
    .filter((entry) => entry.metric !== null && Number.isFinite(entry.metric.value))
    .slice(0, limit)
    .map((entry) => ({
      label: entry.model.name,
      value: entry.metric!.value,
      muted: entry.model.evidenceStatus === 'estimated',
    }));
}

/**
 * Replaces the former "Decision-ready picks" panel, which restated the top
 * three rows of the table directly beneath it. The chart shows the whole
 * visible field at a glance while exact values stay in that table.
 */
function LeaderboardScoreChart({
  keyName,
  entries,
}: {
  readonly keyName: LeaderboardKey;
  readonly entries: readonly LeaderboardEntry[];
}) {
  const chartData = useMemo(() => scoreChartData(entries), [entries]);
  if (chartData.length === 0) return null;

  return <section className="panel leaderboard-score-chart-panel" aria-labelledby="leaderboard-score-chart-heading">
    <div className="panel-heading"><div><span className="eyebrow">Published evidence</span><h2 id="leaderboard-score-chart-heading">Score comparison</h2><p>The published score for each model in this view. Exact values stay in the table below.</p></div></div>
    <ScoreBarChart data={chartData} ariaLabel={`${LEADERBOARD_ROUTES[keyName].seo.h1} score by model`} />
  </section>;
}

export function LeaderboardPage({ keyName }: { readonly keyName: LeaderboardKey }) {
  const route = LEADERBOARD_ROUTES[keyName];
  const [filters, setFilters] = useLeaderboardFilters(keyName);
  const [knownCapabilities, setKnownCapabilities] = useState<{
    readonly keyName: LeaderboardKey;
    readonly value: LeaderboardQueryCapabilities;
  } | null>(null);
  const completeCapabilities = knownCapabilities?.keyName === keyName ? knownCapabilities.value : undefined;
  const requestFilters = useMemo(
    () => completeCapabilities ? filters : bootstrapLeaderboardFilters(keyName, filters),
    [completeCapabilities, filters, keyName],
  );
  const filterQuery = serializeLeaderboardFilters(filters);
  const requestFilterQuery = serializeLeaderboardFilters(requestFilters);
  const pageIdentity = `${keyName}\u0000${requestFilterQuery}`;
  const [pageState, setPageState] = useState<LeaderboardPageCursorState>(() => firstLeaderboardPage(pageIdentity));
  const [recoveryNoticeVisible, setRecoveryNoticeVisible] = useState(false);
  const activePage = pageState.identity === pageIdentity ? pageState : firstLeaderboardPage(pageIdentity);
  const state = useBenchmarkLeaderboard(
    keyName,
    requestFilters.profile,
    50,
    activePage.cursor ?? undefined,
    requestFilters.includeEstimated,
    requestFilters,
  );
  const publishedEntries = state.envelope?.data.entries;
  const responseCapabilities = state.envelope?.data.capabilities;

  useEffect(() => {
    if (!responseCapabilities) return;
    setKnownCapabilities((current) => current?.keyName === keyName
      && sameLeaderboardCapabilities(current.value, responseCapabilities)
      ? current
      : { keyName, value: responseCapabilities });
  }, [keyName, responseCapabilities]);

  const capabilities = useMemo(
    () => responseCapabilities ?? completeCapabilities ?? leaderboardFilterCapabilities(keyName, publishedEntries),
    [completeCapabilities, keyName, publishedEntries, responseCapabilities],
  );

  useEffect(() => {
    setPageState((current) => current.identity === pageIdentity ? current : firstLeaderboardPage(pageIdentity));
  }, [pageIdentity]);

  useEffect(() => {
    if (state.phase !== 'error' || state.statusCode !== 400 || activePage.cursor === null) return;
    setKnownCapabilities(null);
    setPageState(firstLeaderboardPage(pageIdentity));
    setRecoveryNoticeVisible(true);
  }, [activePage.cursor, pageIdentity, state.phase, state.statusCode]);

  useEffect(() => {
    if (!publishedEntries) return;
    const normalized = normalizeLeaderboardFilters(keyName, filters, publishedEntries, capabilities);
    if (!sameLeaderboardFilters(filters, normalized)) setFilters(normalized);
  }, [capabilities, filters, keyName, publishedEntries, setFilters]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopState = () => {
      const restored = parseLeaderboardFilters(window.location.search, keyName, publishedEntries, capabilities);
      if (!sameLeaderboardFilters(filters, restored)) setFilters(restored);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [capabilities, filters, keyName, publishedEntries, setFilters]);

  useEffect(() => {
    if (typeof window === 'undefined' || !publishedEntries) return;
    const normalized = normalizeLeaderboardFilters(keyName, filters, publishedEntries, capabilities);
    if (!sameLeaderboardFilters(filters, normalized)) return;
    const query = filterQuery;
    const current = window.location.search.replace(/^\?/, '');
    if (current === query) return;
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${query}${window.location.hash}`);
  }, [capabilities, filterQuery, filters, keyName, publishedEntries]);

  const entries = publishedEntries ?? [];
  const pagination = state.envelope?.data.pagination;
  const rankOffset = pagination ? activePage.previousCursors.length * pagination.limit : 0;
  const csvQuery = filterQuery;
  const csvHref = `/api/benchmarks/leaderboards/${encodeURIComponent(keyName)}/csv?${csvQuery}`;
  const shareParameters = new URLSearchParams(filterQuery);
  if (shareParameters.get('profile') === capabilities.defaultProfile) shareParameters.delete('profile');
  if (shareParameters.get('sort') === capabilities.defaultSort) shareParameters.delete('sort');
  const shareQuery = shareParameters.toString();
  const shareUrl = `${SITE_CONFIG.origin}${route.pathname}${shareQuery ? `?${shareQuery}` : ''}`;
  const goToNextPage = () => {
    const nextCursor = pagination?.nextCursor;
    if (!nextCursor) return;
    setRecoveryNoticeVisible(false);
    setPageState((current) => {
      const active = current.identity === pageIdentity ? current : firstLeaderboardPage(pageIdentity);
      return {
        identity: pageIdentity,
        cursor: nextCursor,
        previousCursors: [...active.previousCursors, active.cursor],
      };
    });
  };
  const goToPreviousPage = () => {
    setRecoveryNoticeVisible(false);
    setPageState((current) => {
      const active = current.identity === pageIdentity ? current : firstLeaderboardPage(pageIdentity);
      if (active.previousCursors.length === 0) return active;
      const previousIndex = active.previousCursors.length - 1;
      return {
        identity: pageIdentity,
        cursor: active.previousCursors[previousIndex]!,
        previousCursors: active.previousCursors.slice(0, previousIndex),
      };
    });
  };

  return <div className="content-stack leaderboard-page">
    <section className="panel leaderboard-hero" aria-labelledby="leaderboard-heading">
      <span className="eyebrow">TokenBench leaderboard</span>
      <h1 id="leaderboard-heading">{route.seo.h1}</h1>
      <p>{route.seo.summary}</p>
      <div className="leaderboard-actions" role="group" aria-label="Leaderboard actions">
        <ShareAction label="Share Leaderboard" canonicalUrl={shareUrl} variant="secondary" />
        <a className="button button-secondary" href={csvHref}>Download CSV</a>
      </div>
    </section>

    {state.phase === 'ready' || state.phase === 'stale'
      ? <LeaderboardScoreChart keyName={keyName} entries={entries} />
      : null}

    <section className="panel leaderboard-filter-panel" aria-labelledby="leaderboard-filters-heading">
      <div className="panel-heading"><div><span className="eyebrow">Review the published revision</span><h2 id="leaderboard-filters-heading">Filter and sort</h2><p>Use the filters supported by this route’s published evidence. Estimated records remain visibly separate from ranked evidence.</p></div></div>
      <LeaderboardFilters keyName={keyName} filters={filters} onChange={setFilters} capabilities={capabilities} />
    </section>

    <section aria-label={`${route.seo.h1} results`}>
      {recoveryNoticeVisible
        ? <p className="leaderboard-recovery-notice" role="status">Leaderboard revision changed. Showing the first page of the latest results.</p>
        : null}
      {state.phase === 'loading' ? <Skeleton label="Loading published benchmark data" /> : null}
      {state.phase === 'ready' && state.envelope ? (
        entries.length > 0
          ? <><LeaderboardTable keyName={keyName} entries={entries} rankOffset={rankOffset} sort={filters.sort} onSortChange={(sort) => setFilters({ ...filters, sort })} capabilities={capabilities} />
            {pagination ? <LeaderboardPagination entriesCount={entries.length} limit={pagination.limit} total={pagination.total} pageIndex={activePage.previousCursors.length} hasNextPage={pagination.nextCursor !== null} onPrevious={goToPreviousPage} onNext={goToNextPage} /> : null}</>
          : <>
            <EmptyState title="No published entries match these filters" description="Try a different model/provider search or include reviewed estimated BenchLM records where the route supports them." />
            {pagination ? <LeaderboardPagination entriesCount={0} limit={pagination.limit} total={pagination.total} pageIndex={activePage.previousCursors.length} hasNextPage={pagination.nextCursor !== null} onPrevious={goToPreviousPage} onNext={goToNextPage} /> : null}
          </>
      ) : null}
      {state.phase === 'stale' && state.envelope ? <>
        <LeaderboardState phase={state.phase} error={state.error} onRetry={state.retry} />
        {entries.length > 0
          ? <><LeaderboardTable keyName={keyName} entries={entries} rankOffset={rankOffset} sort={filters.sort} onSortChange={(sort) => setFilters({ ...filters, sort })} capabilities={capabilities} />
            {pagination ? <LeaderboardPagination entriesCount={entries.length} limit={pagination.limit} total={pagination.total} pageIndex={activePage.previousCursors.length} hasNextPage={pagination.nextCursor !== null} onPrevious={goToPreviousPage} onNext={goToNextPage} /> : null}</>
          : <>
            <EmptyState title="No cached entries match these filters" description="Try a different model/provider search or include reviewed estimated BenchLM records where the route supports them." />
            {pagination ? <LeaderboardPagination entriesCount={0} limit={pagination.limit} total={pagination.total} pageIndex={activePage.previousCursors.length} hasNextPage={pagination.nextCursor !== null} onPrevious={goToPreviousPage} onNext={goToNextPage} /> : null}
          </>}
      </> : null}
      {state.phase === 'unavailable' || state.phase === 'error'
        ? <LeaderboardState phase={state.phase} error={state.error} onRetry={state.retry} />
        : null}
    </section>

    <section className="panel leaderboard-evidence-panel" aria-labelledby="leaderboard-evidence-heading">
      <div className="panel-heading"><div><span className="eyebrow">Published evidence</span><h2 id="leaderboard-evidence-heading">Evidence and methodology</h2><p>{methodologySummary(keyName)}</p><p className="muted">{positionNoteFor(keyName)}</p></div></div>
      {state.envelope
        ? <LeaderboardEvidence publishedAt={state.envelope.publishedAt} freshness={state.envelope.freshness} attribution={state.envelope.attribution} label="Published leaderboard evidence" compact />
        : <p className="leaderboard-evidence-unavailable">No published source record is available for this view yet. TokenBench will show source links, publication time, and freshness here when a valid revision is available.</p>}
    </section>

    <RelatedLeaderboards keyName={keyName} />
    <MonoMindCta />
  </div>;
}

const DECISION_GROUP_TITLES: Readonly<Partial<Record<DecisionPickGroup['key'], string>>> = {
  'llm-overall': 'BenchAlign',
  'llm-agentic': 'Agent',
  'llm-coding': 'Coding',
  'llm-reasoning': 'Reasoning',
  'multimodal-vision-documents': 'Multimodal',
  'llm-knowledge': 'Knowledge',
};

interface DirectoryGroup {
  readonly title: string;
  readonly keys: readonly LeaderboardKey[];
}

const DIRECTORY_GROUPS: readonly DirectoryGroup[] = [
  {
    title: 'Language models',
    keys: [
      'llm-overall',
      'llm-agentic',
      'llm-coding',
      'llm-reasoning',
      'llm-knowledge',
      'llm-human-preference',
      'llm-value',
      'llm-pricing-context',
    ],
  },
  { title: 'Multimodal', keys: ['multimodal-vision-documents'] },
  {
    title: 'Media',
    keys: [
      'media-text-to-image',
      'media-image-editing',
      'media-text-to-video',
      'media-image-to-video',
      'media-video-editing',
    ],
  },
];

function formatScore(score: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(score);
}

function decisionTitle(group: DecisionPickGroup): string {
  return DECISION_GROUP_TITLES[group.key] ?? group.label;
}

function DecisionEntry({ entry }: { readonly entry: DecisionPickEntry; readonly key?: string }) {
  return <li className="decision-pick-entry">
    <div className="decision-pick-entry-heading">
      <span className="decision-pick-rank">{entry.rank === null ? 'Unranked' : `Rank ${entry.rank}`}</span>
    </div>
    <h4>{entry.name}</h4>
    <p className="decision-pick-provider"><ProviderMark providerId={entry.provider} providerName={entry.provider} decorative size={20} /><span>{entry.provider}</span></p>
    <dl>
      <div><dt>Score</dt><dd>{formatScore(entry.score)} {entry.unit}</dd></div>
      <div><dt>Updated</dt><dd><time dateTime={entry.updatedAt}>Updated {formatDateTime(entry.updatedAt)}</time></dd></div>
    </dl>
  </li>;
}

function DecisionPickCard({ group }: { readonly group: DecisionPickGroup; readonly key?: string }) {
  const title = decisionTitle(group);
  const headingId = `decision-pick-${group.key}`;
  const statusText = group.status === 'benchalign'
    ? 'BenchAlign ranking'
    : 'Evidence lens — not a BenchAlign ranking';
  return <section
    className={`panel decision-pick-card decision-pick-card-${group.status}`}
    aria-label={`${title} leaders`}
  >
    <div className="decision-pick-card-heading">
      <div><span className="eyebrow">{statusText}</span><h3 id={headingId}>{title}</h3></div>
      <a href={group.entries[0]?.routePath ?? LEADERBOARD_ROUTES[group.key].pathname}>View full leaderboard <ArrowRight aria-hidden="true" size={14} /></a>
    </div>
    {group.entries.length > 0
      ? <ol className="decision-pick-list">{group.entries.map((entry) => <DecisionEntry key={entry.modelKey} entry={entry} />)}</ol>
      : <EmptyState
        title="No supported ranking is published."
        description="This view has no supported entry in the latest published benchmark summary."
      />}
  </section>;
}

function DecisionReadyPicks() {
  const state = useDecisionPicks();
  return <section className="decision-picks" aria-labelledby="decision-picks-heading">
    <div className="panel-heading"><div><span className="eyebrow">Start with the supported signal</span><h2 id="decision-picks-heading">Decision-ready picks</h2><p>Each preview is limited to source-supported results from the current published summary.</p></div></div>
    {state.phase === 'loading' ? <Skeleton label="Loading decision-ready picks" /> : null}
    {state.phase === 'stale' ? <LeaderboardState phase="stale" error={state.error} onRetry={state.retry} /> : null}
    {state.phase === 'ready' || state.phase === 'stale'
      ? <div className="decision-picks-grid">{(state.decisionPicks ?? []).map((group) => <DecisionPickCard key={group.key} group={group} />)}</div>
      : null}
    {state.phase === 'unavailable' || state.phase === 'error'
      ? <LeaderboardState phase={state.phase} error={state.error} onRetry={state.retry} />
      : null}
  </section>;
}

function LeaderboardDirectory() {
  return <section className="leaderboard-directory" aria-labelledby="leaderboard-directory-list-heading">
    <div className="panel-heading"><div><span className="eyebrow">All published views</span><h2 id="leaderboard-directory-list-heading">Full leaderboard directory</h2><p>Choose the evidence lens that matches your decision, then inspect its source and methodology.</p></div></div>
    {DIRECTORY_GROUPS.map((group) => {
      const headingId = `leaderboard-directory-${group.title.toLowerCase().replace(/\s+/g, '-')}`;
      return <section className="leaderboard-directory-group" aria-labelledby={headingId} key={group.title}>
        <h3 id={headingId}>{group.title}</h3>
        <div className="leaderboard-directory-list" role="list" aria-label={`${group.title} leaderboard views`}>
          {group.keys.map((key) => {
            const route = LEADERBOARD_ROUTES[key];
            const title = route.seo.h1;
            return <article className="panel" role="listitem" key={key}>
              <h4><a href={route.pathname}>{title}</a></h4>
              <p>{route.seo.summary}</p>
              <a href={route.pathname}>View leaderboard <ArrowRight aria-hidden="true" size={14} /></a>
            </article>;
          })}
        </div>
      </section>;
    })}
  </section>;
}

export function LeaderboardDirectoryPage() {
  return <div className="content-stack leaderboard-page leaderboard-directory-page">
    <section className="panel leaderboard-hero" aria-labelledby="leaderboard-directory-heading">
      <span className="eyebrow">TokenBench directory</span>
      <h1 id="leaderboard-directory-heading">Model leaderboards</h1>
      <p>Explore current model leaders by capability, workload, cost, and human preference.</p>
      <p className="leaderboard-methodology"><strong>Method:</strong> Overall, Agent, and Coding are validated BenchAlign views. Reasoning, Multimodal, and Knowledge remain clearly labeled evidence lenses. <a href={ROUTE_PATHS.methodologyBenchAlign}>How BenchAlign rankings work</a>.</p>
    </section>

    <DecisionReadyPicks />
    <LeaderboardDirectory />

    <RelatedLeaderboards />
    <MonoMindCta />
  </div>;
}
