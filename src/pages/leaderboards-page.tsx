import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { LEADERBOARD_NAVIGATION, LEADERBOARD_ROUTES, type LeaderboardKey } from '../routing/routes';
import { EmptyState, Skeleton } from '../frontend/ui';
import {
  LeaderboardFilters,
  parseLeaderboardFilters,
  serializeLeaderboardFilters,
  visibleLeaderboardEntries,
  type LeaderboardFilterState,
} from '../frontend/leaderboard-filters';
import { LeaderboardTable } from '../frontend/leaderboard-table';
import { useBenchmarkLeaderboard } from '../frontend/use-benchmarks';

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const query = serializeLeaderboardFilters(filters);
    const current = window.location.search.replace(/^\?/, '');
    if (current === query) return;
    window.history.replaceState({}, '', `${window.location.pathname}?${query}${window.location.hash}`);
  }, [filters]);

  return [filters, setFilters];
}

function RelatedLeaderboards({ keyName }: { readonly keyName?: LeaderboardKey }) {
  const links = LEADERBOARD_NAVIGATION.filter((item) => item.key !== keyName);
  return <section className="leaderboard-related" aria-labelledby="related-leaderboards-heading">
    <div className="panel-heading"><div><span className="eyebrow">Explore by lens</span><h2 id="related-leaderboards-heading">Related leaderboards</h2></div></div>
    <nav aria-label="Related leaderboards">
      {links.map((item) => <a key={item.key} href={item.pathname}>{LEADERBOARD_ROUTES[item.key].seo.h1} <ArrowRight aria-hidden="true" size={14} /></a>)}
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
    return <div className="empty-state leaderboard-state" role="status"><strong>Stale benchmark data</strong><p>{error ?? 'The published revision is past its freshness window, so TokenBench is not presenting its rows as current rankings.'}</p><button type="button" className="button button-secondary" onClick={onRetry}>Retry benchmark refresh</button></div>;
  }
  if (phase === 'unavailable') {
    return <div className="empty-state leaderboard-state" role="status"><strong>Unavailable</strong><p>{error ?? 'No valid published benchmark revision is available for this route.'}</p><button type="button" className="button button-secondary" onClick={onRetry}>Retry benchmark request</button></div>;
  }
  return <div className="empty-state leaderboard-state" role="alert"><strong>Unable to load benchmark data</strong><p>{error ?? 'The cached benchmark request failed.'}</p><button type="button" className="button button-secondary" onClick={onRetry}>Retry benchmark request</button></div>;
}

export function LeaderboardPage({ keyName }: { readonly keyName: LeaderboardKey }) {
  const route = LEADERBOARD_ROUTES[keyName];
  const [filters, setFilters] = useLeaderboardFilters(keyName);
  const state = useBenchmarkLeaderboard(keyName, filters.profile, 50, undefined, filters.includeEstimated);
  const entries = state.envelope ? visibleLeaderboardEntries(state.envelope.data.entries, filters) : [];

  return <div className="content-stack leaderboard-page">
    <section className="panel leaderboard-hero" aria-labelledby="leaderboard-heading">
      <span className="eyebrow">TokenBench leaderboard</span>
      <h1 id="leaderboard-heading">{route.seo.h1}</h1>
      <p>{route.seo.summary}</p>
      <p className="leaderboard-methodology"><strong>Methodology:</strong> {methodologySummary(keyName)}</p>
    </section>

    <section className="panel leaderboard-filter-panel" aria-labelledby="leaderboard-filters-heading">
      <div className="panel-heading"><div><span className="eyebrow">Review the published revision</span><h2 id="leaderboard-filters-heading">Filter and sort</h2><p>Search by model or provider, choose a disclosed workload profile, and keep estimates visibly separate from ranked evidence.</p></div></div>
      <LeaderboardFilters keyName={keyName} filters={filters} onChange={setFilters} />
    </section>

    <section aria-label={`${route.seo.h1} results`}>
      {state.phase === 'loading' ? <Skeleton label="Loading published benchmark data" /> : null}
      {state.phase === 'ready' && state.envelope ? (
        entries.length > 0
          ? <LeaderboardTable keyName={keyName} entries={entries} sort={filters.sort} onSortChange={(sort) => setFilters({ ...filters, sort })} publishedAt={state.envelope.publishedAt} freshness={state.envelope.freshness} attribution={state.envelope.attribution} />
          : <EmptyState title="No published entries match these filters" description="Try a different model/provider search or include reviewed estimated BenchLM records where the route supports them." />
      ) : null}
      {state.phase === 'stale' || state.phase === 'unavailable' || state.phase === 'error'
        ? <LeaderboardState phase={state.phase} error={state.error} onRetry={state.retry} />
        : null}
    </section>

    <RelatedLeaderboards keyName={keyName} />
    <MonoMindCta />
  </div>;
}

export function LeaderboardDirectoryPage() {
  return <div className="content-stack leaderboard-page leaderboard-directory-page">
    <section className="panel leaderboard-hero" aria-labelledby="leaderboard-directory-heading">
      <span className="eyebrow">TokenBench directory</span>
      <h1 id="leaderboard-directory-heading">AI model leaderboards</h1>
      <p>Choose the decision lens you need, then inspect the published source metric, freshness, and methodology on its dedicated route.</p>
      <p className="leaderboard-methodology"><strong>Availability:</strong> Rankings are never embedded in the directory. Each route exposes only a valid active revision or an explicit Unavailable state.</p>
    </section>

    <section className="leaderboard-directory" aria-labelledby="leaderboard-directory-list-heading">
      <div className="panel-heading"><div><span className="eyebrow">Registered routes</span><h2 id="leaderboard-directory-list-heading">Find the relevant evidence lens</h2></div></div>
      <div role="list" aria-label="TokenBench leaderboard categories">
        {LEADERBOARD_NAVIGATION.map((item) => <article className="panel" role="listitem" key={item.key}>
          <h3><a href={item.pathname}>{LEADERBOARD_ROUTES[item.key].seo.h1}</a></h3>
          <p>{LEADERBOARD_ROUTES[item.key].seo.summary}</p>
          <a href={item.pathname}>Open leaderboard <ArrowRight aria-hidden="true" size={14} /></a>
        </article>)}
      </div>
    </section>

    <RelatedLeaderboards />
    <MonoMindCta />
  </div>;
}
