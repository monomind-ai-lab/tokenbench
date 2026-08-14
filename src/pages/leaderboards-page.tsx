import { useEffect, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { LEADERBOARD_NAVIGATION, LEADERBOARD_ROUTES, ROUTE_PATHS, type LeaderboardKey } from '../routing/routes';
import { DECISION_PICK_CATEGORIES, type DecisionPickEntry, type DecisionPickGroup } from '../benchmarks/decision-picks';
import { LEADERBOARD_DEFINITIONS } from '../benchmarks/leaderboards';
import { categoryViewFor, V21_OVERVIEW_LEADERBOARDS, type V21LeaderboardDefinition } from '../benchmarks/v21-leaderboards';
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
import { LeaderboardVerticalChart } from '../frontend/charts/leaderboard-vertical-chart';
import { CostScoreScatter, type CostScorePoint } from '../frontend/charts/cost-score-scatter';
import { PriceHistogram, priceBuckets } from '../frontend/charts/price-histogram';
import { modelPath } from '../benchmarks/model-directory';
import type { LeaderboardEntry } from '../benchmarks/leaderboards';
import { ProviderMark } from '../frontend/provider-mark';
import { ShareAction } from '../frontend/share-action';
import { useBenchmarkLeaderboard, useDecisionPicks, type BenchmarkApiEnvelope, type LeaderboardPageResult } from '../frontend/use-benchmarks';
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

const BENCHALIGN_KEYS = new Set<LeaderboardKey>(
  DECISION_PICK_CATEGORIES
    .filter((category) => category.status === 'benchalign')
    .map((category) => category.key),
);

const EVIDENCE_LENS_KEYS = new Set<LeaderboardKey>(
  DECISION_PICK_CATEGORIES
    .filter((category) => category.status === 'evidence-lens')
    .map((category) => category.key),
);

/**
 * Labels each directory card with its evidence status so the vertical index
 * does not read as a fabricated universal composite. BenchAlign views are
 * validated rankings; evidence lenses are published category metrics without
 * a validated rank; source lenses are exact LMArena arena views; value and
 * pricing-context views have their own non-composite presentations.
 */
export function leaderboardEvidenceStatusLabel(keyName: LeaderboardKey): string {
  if (BENCHALIGN_KEYS.has(keyName)) return 'BenchAlign ranking';
  if (EVIDENCE_LENS_KEYS.has(keyName)) return 'Evidence lens';
  const kind = LEADERBOARD_DEFINITIONS[keyName].kind;
  if (kind === 'lmarena') return 'Source lens';
  if (kind === 'value') return 'Value frontier';
  if (kind === 'pricing-context') return 'Route evidence';
  return 'Evidence lens';
}

const SOURCE_LANE_LABELS: Readonly<Record<string, string>> = {
  benchlm: 'BenchLM',
  lmarena: 'LMArena',
  openrouter: 'OpenRouter',
};

/**
 * Names the source lane(s) for a directory card so users know which evidence
 * source they are entering. Multimodal views span BenchLM and LMArena; the
 * list preserves each source lane rather than collapsing them into one label.
 */
export function leaderboardSourceLanes(keyName: LeaderboardKey): readonly string[] {
  const definition = LEADERBOARD_DEFINITIONS[keyName];
  if (definition.kind === 'multimodal') return ['BenchLM', 'LMArena'];
  const sourceId = definition.sourceId;
  if (sourceId && SOURCE_LANE_LABELS[sourceId]) return [SOURCE_LANE_LABELS[sourceId]];
  if (definition.kind === 'value') return ['BenchLM', 'OpenRouter'];
  return [];
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

/**
 * Pairs each entry's published score with its published blended cost. An entry
 * missing either side is excluded rather than plotted at zero, which would
 * invent evidence the source never published.
 */
export function costScoreChartData(
  entries: readonly LeaderboardEntry[],
): readonly CostScorePoint[] {
  return entries
    .filter((entry) => entry.metric !== null
      && Number.isFinite(entry.metric.value)
      && entry.blendedCostPerMillion !== null
      && Number.isFinite(entry.blendedCostPerMillion))
    .map((entry) => ({
      label: entry.model.name,
      score: entry.metric!.value,
      cost: entry.blendedCostPerMillion!,
      frontier: entry.onValueFrontier,
      href: modelPath(entry.model.slug),
    }));
}

/**
 * Renders the cost/score trade-off for routes that publish a workload price.
 * A sorted table cannot show that two models with similar scores differ 10x in
 * price; this can.
 */
function LeaderboardCostScoreChart({
  keyName,
  entries,
}: {
  readonly keyName: LeaderboardKey;
  readonly entries: readonly LeaderboardEntry[];
}) {
  const chartData = useMemo(() => costScoreChartData(entries), [entries]);
  if (chartData.length < 2) return null;

  const frontierCount = chartData.filter((point) => point.frontier).length;
  return <section className="panel leaderboard-cost-score-panel" aria-labelledby="leaderboard-cost-score-heading">
    <div className="panel-heading"><div><span className="eyebrow">Published evidence</span><h2 id="leaderboard-cost-score-heading">Cost versus score</h2><p>Each point pairs a published score with its published workload price. {frontierCount > 0 ? `The connected line marks the ${frontierCount} value-frontier models: no cheaper published route scores higher.` : 'No value-frontier model is published for this view.'}</p></div></div>
    <CostScoreScatter data={chartData} ariaLabel={`${LEADERBOARD_ROUTES[keyName].seo.h1} cost versus score`} />
  </section>;
}

/**
 * Shows where published prices cluster on a route that has prices but no
 * score to plot against. The pricing-context view publishes 400+ routes; a
 * sorted table cannot show that most of them sit in the cheapest band.
 */
function LeaderboardPriceHistogram({
  keyName,
  entries,
}: {
  readonly keyName: LeaderboardKey;
  readonly entries: readonly LeaderboardEntry[];
}) {
  const buckets = useMemo(() => priceBuckets(entries
    .map((entry) => entry.blendedCostPerMillion)
    .filter((cost): cost is number => cost !== null && Number.isFinite(cost))), [entries]);
  const total = useMemo(() => buckets.reduce((sum, bucket) => sum + bucket.count, 0), [buckets]);
  if (total < 2) return null;

  return <section className="panel leaderboard-price-histogram-panel" aria-labelledby="leaderboard-price-histogram-heading">
    <div className="panel-heading"><div><span className="eyebrow">Published evidence</span><h2 id="leaderboard-price-histogram-heading">Price distribution</h2><p>How the {total} published workload prices in this view are spread across the observed range.</p></div></div>
    <PriceHistogram buckets={buckets} ariaLabel={`${LEADERBOARD_ROUTES[keyName].seo.h1} price distribution`} />
  </section>;
}

function embeddedLeaderboardEnvelope(): BenchmarkApiEnvelope<LeaderboardPageResult> | undefined {
  if (typeof document === 'undefined') return undefined;
  const payload = document.getElementById('leaderboards-initial-data');
  if (!(payload instanceof HTMLScriptElement) || payload.type !== 'application/json' || !payload.textContent) return undefined;
  try { return JSON.parse(payload.textContent) as BenchmarkApiEnvelope<LeaderboardPageResult>; } catch { return undefined; }
}

export function LeaderboardPage({
  keyName,
  category,
  initialEnvelope,
}: {
  readonly keyName: LeaderboardKey;
  readonly category?: V21LeaderboardDefinition;
  readonly initialEnvelope?: BenchmarkApiEnvelope<LeaderboardPageResult>;
}) {
  const route = LEADERBOARD_ROUTES[keyName];
  const title = category?.label ?? route.seo.h1;
  const summary = category?.definition ?? route.seo.summary;
  const initialCategoryEnvelope = initialEnvelope ?? (category ? embeddedLeaderboardEnvelope() : undefined);
  const requestedLimit = category ? 20 : 50;
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
    requestedLimit,
    activePage.cursor ?? undefined,
    requestFilters.includeEstimated,
    requestFilters,
    initialCategoryEnvelope,
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

  const entries = category && publishedEntries
    ? categoryViewFor(category.slug, publishedEntries).entries
    : publishedEntries ?? [];
  const pagination = state.envelope?.data.pagination;
  const rankOffset = pagination ? activePage.previousCursors.length * pagination.limit : 0;
  const csvQuery = filterQuery;
  const csvHref = `/api/benchmarks/leaderboards/${encodeURIComponent(keyName)}/csv?${csvQuery}`;
  const shareParameters = new URLSearchParams(filterQuery);
  if (shareParameters.get('profile') === capabilities.defaultProfile) shareParameters.delete('profile');
  if (shareParameters.get('sort') === capabilities.defaultSort) shareParameters.delete('sort');
  const shareQuery = shareParameters.toString();
  const canonicalPath = category ? `${ROUTE_PATHS.leaderboards}${category.slug}/` : route.pathname;
  const shareUrl = `${SITE_CONFIG.origin}${canonicalPath}${shareQuery ? `?${shareQuery}` : ''}`;
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

  return <div className={`content-stack leaderboard-page${category ? ' leaderboard-v21-category-page' : ''}`}>
    <section className="panel leaderboard-hero" aria-labelledby="leaderboard-heading">
      <span className="eyebrow">{category ? `${category.version} category` : 'TokenBench leaderboard'}</span>
      <h1 id="leaderboard-heading">{title}</h1>
      <p>{summary}</p>
      <div className="leaderboard-actions" role="group" aria-label="Leaderboard actions">
        <ShareAction label="Share Leaderboard" canonicalUrl={shareUrl} variant="secondary" />
        <a className="button button-secondary" href={csvHref}>Download CSV</a>
      </div>
    </section>

    {state.phase === 'ready' || state.phase === 'stale'
      ? category
        ? <LeaderboardVerticalChart title={title} entries={entries} />
        : <LeaderboardScoreChart keyName={keyName} entries={entries} />
      : null}

    {state.phase === 'ready' || state.phase === 'stale'
      ? <LeaderboardCostScoreChart keyName={keyName} entries={entries} />
      : null}

    {(state.phase === 'ready' || state.phase === 'stale') && keyName === 'llm-pricing-context'
      ? <LeaderboardPriceHistogram keyName={keyName} entries={entries} />
      : null}

    <section className="panel leaderboard-filter-panel" aria-labelledby="leaderboard-filters-heading">
      <div className="panel-heading"><div><span className="eyebrow">Review the published revision</span><h2 id="leaderboard-filters-heading">Filter and sort</h2><p>Use the filters supported by this route’s published evidence. Estimated records remain visibly separate from ranked evidence.</p></div></div>
      <LeaderboardFilters keyName={keyName} filters={filters} onChange={setFilters} capabilities={capabilities} />
    </section>

    <section aria-label={`${title} results`}>
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

function v21CategoryPath(category: V21LeaderboardDefinition): string {
  return `${ROUTE_PATHS.leaderboards}${category.slug}/`;
}

/** The directory is a compact, source-aware overview rather than a second ranking. */
function V21LeaderboardOverview() {
  const state = useDecisionPicks();
  const groups = new Map((state.decisionPicks ?? []).map((group) => [group.key, group]));
  return <section className="v21-leaderboard-overview" aria-label="V2.1 leaderboard overview">
    <div className="panel-heading"><div><span className="eyebrow">V2.1 overview</span><h2>Compare by decision lens</h2><p>Each card links to one canonical category and preserves the published source evidence behind it.</p></div></div>
    <div className="v21-leaderboard-overview-grid">
      {V21_OVERVIEW_LEADERBOARDS.map((category) => {
        const group = category.legacyKey ? groups.get(category.legacyKey) : undefined;
        const entries = group?.entries ?? [];
        const evidenceState = group?.status === 'benchalign' ? 'BenchAlign ranking' : group ? 'Evidence lens' : null;
        return <article className="panel v21-leaderboard-overview-card" key={category.slug}>
          <div className="v21-leaderboard-overview-card-heading"><div><span className="eyebrow">{category.version}</span><h3>{category.label}</h3></div>{evidenceState ? <span className="leaderboard-directory-card-status">{evidenceState}</span> : null}</div>
          <p>{category.definition}</p>
          {entries.length > 0 ? <ol className="v21-leaderboard-overview-list">
            {entries.slice(0, 10).map((entry) => <li key={entry.modelKey}>
              <a href={modelPath(entry.slug)}>{entry.name}</a>
              <span><ProviderMark providerId={entry.provider} providerName={entry.provider} decorative size={20} />{entry.provider}</span>
              <time dateTime={entry.updatedAt}>{formatDateTime(entry.updatedAt)}</time>
            </li>)}
          </ol> : <p className="leaderboard-evidence-unavailable">{category.unavailableMessage}</p>}
          <a href={v21CategoryPath(category)} aria-label={`Open ${category.label} leaderboard`}>Open category <ArrowRight aria-hidden="true" size={14} /></a>
        </article>;
      })}
    </div>
  </section>;
}

export function V21LeaderboardPage({
  category,
  initialEnvelope,
}: {
  readonly category: V21LeaderboardDefinition;
  readonly initialEnvelope?: BenchmarkApiEnvelope<LeaderboardPageResult>;
}) {
  if (category.legacyKey !== null) {
    return <LeaderboardPage keyName={category.legacyKey} category={category} initialEnvelope={initialEnvelope} />;
  }
  return <div className="content-stack leaderboard-page leaderboard-v21-category-page">
    <section className="panel leaderboard-hero" aria-labelledby="leaderboard-heading">
      <span className="eyebrow">{category.version} category</span>
      <h1 id="leaderboard-heading">{category.label}</h1>
      <p>{category.definition}</p>
    </section>
    <section className="panel leaderboard-state" aria-label={`${category.label} availability`}>
      <h2>Unavailable</h2>
      <p>{category.unavailableMessage}</p>
      <a className="button button-secondary" href={ROUTE_PATHS.leaderboards}>Browse available categories</a>
    </section>
    <section className="panel leaderboard-evidence-panel" aria-labelledby="leaderboard-evidence-heading">
      <div className="panel-heading"><div><span className="eyebrow">Methodology</span><h2 id="leaderboard-evidence-heading">Evidence and methodology</h2><p>TokenBench does not substitute another category score when this category has no comparable published metric.</p></div></div>
    </section>
  </div>;
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
            const statusLabel = leaderboardEvidenceStatusLabel(key);
            const lanes = leaderboardSourceLanes(key);
            return <article className="panel" role="listitem" key={key}>
              <div className="leaderboard-directory-card-meta">
                <span className="leaderboard-directory-card-status">{statusLabel}</span>
                {lanes.length > 0 ? <span className="leaderboard-directory-card-source">{lanes.join(' · ')}</span> : null}
              </div>
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

    <V21LeaderboardOverview />
    <DecisionReadyPicks />
    <LeaderboardDirectory />

    <RelatedLeaderboards />
    <MonoMindCta />
  </div>;
}
