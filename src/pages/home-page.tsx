import { ArrowRight, BadgeDollarSign, Download, Layers3, TrendingUp, Workflow } from 'lucide-react';
import type { DecisionPickEntry, DecisionPickGroup } from '../benchmarks/decision-picks';
import type { RepresentativeComparison } from '../benchmarks/api-projections';
import { ProviderMark } from '../frontend/provider-mark';
import { useDecisionPicks } from '../frontend/use-benchmarks';
import { HOME_PAGE_COPY } from '../brand/site-config';
import { GUIDE_BY_SLUG, guidePath } from '../guides/content';
import { LEADERBOARD_ROUTES, ROUTE_PATHS, type LeaderboardKey } from '../routing/routes';

const PRODUCT_FEATURES = [
  {
    title: 'Exact route pricing',
    description: 'Keep direct-provider, OpenRouter, and OpenCode Zen API routes distinct so a rate always has a clear route behind it.',
    Icon: BadgeDollarSign,
  },
  {
    title: 'Comparable performance evidence',
    description: 'Review source-backed performance in the same view as pricing, while missing evidence stays visibly unavailable.',
    Icon: TrendingUp,
  },
  {
    title: 'Workload calculations',
    description: 'Model your real input/output mix, token volume, and subscription assumptions instead of relying on a generic estimate.',
    Icon: Workflow,
  },
  {
    title: 'Downloads',
    description: 'Download the current evidence and calculations behind a model decision.',
    Icon: Download,
  },
  {
    title: 'Shareable results',
    description: 'Send a reproducible calculator result to the people who need to act on it.',
    Icon: Layers3,
  },
] as const;

const CURATED_GUIDE_SLUGS = [
  'reduce-llm-api-costs-caching-batch-output-limits',
  'openrouter-guide-model-routing-cost-controls',
  'track-claude-code-usage',
] as const;

/**
 * The market section republishes leaders for the five decision routes. Cards
 * are omitted when the active revision has no supported leader, so the page
 * never renders a structurally unavailable card.
 */
const MARKET_LEADER_CARDS: readonly { readonly key: LeaderboardKey; readonly title: string }[] = [
  { key: 'llm-overall', title: 'Overall' },
  { key: 'llm-coding', title: 'Coding' },
  { key: 'llm-agentic', title: 'Agentic' },
  { key: 'llm-reasoning', title: 'Reasoning' },
  { key: 'multimodal-vision-documents', title: 'Multimodal' },
];

interface MarketLeaderCard {
  readonly key: LeaderboardKey;
  readonly title: string;
  readonly status: DecisionPickGroup['status'];
  readonly leader: DecisionPickEntry;
}

function formatScore(score: number, unit: string): string {
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(score)} ${unit}`;
}

function formatRate(rate: number): string {
  return `$${new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(rate)} / 1M`;
}

function formatCheckedAt(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'Unavailable';
  return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC', year: 'numeric' }).format(new Date(timestamp));
}

/**
 * Reads the published leader for each decision route without sorting or
 * re-ranking a filtered subset. `evidence-lens` routes publish evidence the
 * source does not rank, so they are labelled instead of given a position.
 */
function marketLeaderCards(groups: readonly DecisionPickGroup[] | null): readonly MarketLeaderCard[] {
  if (groups === null) return [];
  return MARKET_LEADER_CARDS.flatMap(({ key, title }) => {
    const group = groups.find((candidate) => candidate.key === key);
    const leader = group?.entries[0];
    if (!group || !leader) return [];
    return [{ key, title, status: group.status, leader }];
  });
}

function MarketLeaderArticle({ card }: { readonly card: MarketLeaderCard; readonly key?: string }) {
  const { leader } = card;
  return <article className="panel home-snapshot-card">
    <div className="home-snapshot-card-heading">
      <h3>{card.title}</h3>
      <span className="home-snapshot-rank">{card.status === 'benchalign' && Number.isSafeInteger(leader.rank) && leader.rank > 0 ? `Source rank #${leader.rank}` : 'Not ranked by source'}</span>
    </div>
    <a className="home-snapshot-model" href={leader.routePath}>
      <ProviderMark providerId={leader.provider} providerName={leader.provider} decorative size={20} />
      <span>{leader.name}</span>
      <ArrowRight aria-hidden="true" size={14} />
    </a>
    <dl>
      <div><dt>Published value</dt><dd>{formatScore(leader.score, leader.unit)}</dd></div>
      {leader.representativePriceUsdPerMillion === null
        ? null
        : <div><dt>Representative price</dt><dd>{formatRate(leader.representativePriceUsdPerMillion)}</dd></div>}
    </dl>
  </article>;
}

function RepresentativeComparisonArticle({ comparison }: { readonly comparison: RepresentativeComparison; readonly key?: string }) {
  const strongest = comparison.sharedMetrics[0];
  const leaderName = strongest?.leaderSlug === comparison.modelASlug
    ? comparison.modelAName
    : strongest?.leaderSlug === comparison.modelBSlug ? comparison.modelBName : null;
  const finding = strongest
    ? leaderName ? `${leaderName} leads on ${strongest.category}` : `Tied on ${strongest.category}`
    : 'No comparable metric finding';
  const implication = comparison.modelAPriceUsdPerMillion !== null && comparison.modelBPriceUsdPerMillion !== null
    ? `${comparison.modelAName} ${formatRate(comparison.modelAPriceUsdPerMillion)} · ${comparison.modelBName} ${formatRate(comparison.modelBPriceUsdPerMillion)}`
    : comparison.modelAContextWindowTokens !== null && comparison.modelBContextWindowTokens !== null
      ? `Context: ${formatScore(comparison.modelAContextWindowTokens, 'tokens')} · ${formatScore(comparison.modelBContextWindowTokens, 'tokens')}`
      : null;
  return <li>
    <article className="panel home-snapshot-card home-comparison-card">
      <h3>{comparison.modelAName} vs {comparison.modelBName}</h3>
      <p><strong>{finding}</strong></p>
      {strongest ? <p className="muted">{formatScore(strongest.modelAValue, strongest.unit)} vs {formatScore(strongest.modelBValue, strongest.unit)}</p> : null}
      {implication ? <p className="muted">{implication}</p> : null}
      <a className="home-snapshot-model" href={`/compare/${encodeURIComponent(comparison.pairSlug)}`} aria-label={`Compare ${comparison.modelAName} and ${comparison.modelBName}`}>Open comparison <ArrowRight aria-hidden="true" size={14} /></a>
    </article>
  </li>;
}

function MarketAtAGlance() {
  const state = useDecisionPicks();
  const envelope = state.envelope;
  const cards = marketLeaderCards(state.decisionPicks);
  const comparisons = envelope?.data.representativeComparisons ?? [];

  return <section className="panel home-snapshot-section" aria-label="Market at a glance">
    <div className="panel-heading"><div><span className="eyebrow">Published evidence</span><h2 id="home-market-heading">See the market at a glance</h2><p>Leaders for each decision route, republished from the active source revision without recalculation.</p></div></div>
    {state.phase === 'loading'
      ? <p className="home-snapshot-state" role="status">Loading the published decision snapshot.</p>
      : state.phase === 'error'
        ? <div className="home-snapshot-state home-snapshot-state-error" role="alert">
          <p>Published decision snapshot could not be loaded. {state.error ?? 'Benchmark request failed.'}</p>
          <button className="button button-secondary" onClick={state.retry} type="button">Retry</button>
        </div>
        : <>
          {state.phase === 'stale' ? <p className="home-snapshot-state" role="status">{state.fallback === 'browser-cache'
            ? state.error
            : <>Stale published decision snapshot. {state.error ?? 'The last published decision facts remain visible while refresh is overdue.'}</>}</p> : null}
          {cards.length === 0
            ? <p className="home-snapshot-state" role="status">No decision route has a supported leader in the active revision.</p>
            : <div className="home-snapshot-grid">{cards.map((card) => <MarketLeaderArticle card={card} key={card.key} />)}</div>}
          {comparisons.length > 0 ? <ul className="home-snapshot-grid home-comparison-grid" aria-label="Representative comparisons">
            {comparisons.map((comparison) => <RepresentativeComparisonArticle comparison={comparison} key={comparison.pairSlug} />)}
          </ul> : null}
          {envelope === null ? null : <p className="home-snapshot-provenance">
            <span>Source published {formatCheckedAt(envelope.publishedAt)}</span>
            <span aria-hidden="true">·</span>
            <span>Checked {formatCheckedAt(envelope.freshness.checkedAt)}</span>
            {envelope.attribution.map((source) => <a href={source.url} key={source.sourceId} rel="noreferrer" target="_blank">{source.label}</a>)}
          </p>}
        </>}
    <div className="home-snapshot-actions">
      <a className="button button-secondary" href={ROUTE_PATHS.leaderboards}>Open all leaderboards <ArrowRight aria-hidden="true" size={14} /></a>
      <a className="button button-secondary" href={ROUTE_PATHS.compareHub}>Compare two models <ArrowRight aria-hidden="true" size={14} /></a>
      <a className="home-snapshot-method" href={ROUTE_PATHS.methodologyBenchAlign}>How rankings work <ArrowRight aria-hidden="true" size={14} /></a>
    </div>
  </section>;
}

export function HomePage() {
  return (
    <div className="content-stack home-page">
      <section className="panel home-hero" aria-labelledby="home-hero-heading">
        <span className="eyebrow">TokenBench</span>
        <h1 id="home-hero-heading">{HOME_PAGE_COPY.h1}</h1>
        <p>{HOME_PAGE_COPY.subcopy}</p>
        <div className="home-hero-actions" aria-label="Primary TokenBench decisions">
          <a className="button" href={ROUTE_PATHS.compareHub}>Compare models <ArrowRight aria-hidden="true" size={16} /></a>
          <a className="button button-secondary" href={ROUTE_PATHS.calculator}>Calculate subscription vs API</a>
          <a className="button button-secondary" href={ROUTE_PATHS.leaderboards}>Browse leaderboards</a>
        </div>
      </section>

      <MarketAtAGlance />

      <section className="panel home-calculator-banner" aria-labelledby="home-calculator-heading">
        <div><span className="eyebrow">Subscribe vs API</span><h2 id="home-calculator-heading">Should you subscribe or pay as you go?</h2><p>Choose your model mix, describe the monthly workload, and inspect the resulting cost and coverage implication without assuming unpublished capacity.</p></div>
        <a className="button" href={ROUTE_PATHS.calculator}>Open the calculator <ArrowRight aria-hidden="true" size={16} /></a>
      </section>

      <section className="home-feature-section" aria-labelledby="home-product-heading">
        <div className="panel-heading"><div><span className="eyebrow">Product capabilities</span><h2 id="home-product-heading">What TokenBench gives you</h2><p>One focused workspace for pricing, evidence, workload calculations, and results you can take with you.</p></div></div>
        <div className="home-feature-grid" role="list" aria-label="TokenBench product capabilities">
          {PRODUCT_FEATURES.map(({ title, description, Icon }) => (
            <article className="panel" role="listitem" key={title}>
              <Icon aria-hidden="true" size={22} />
              <h3>{title}</h3>
              <p className="muted">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-feature-section" aria-labelledby="home-guides-heading">
        <div className="panel-heading"><div><span className="eyebrow">Practical guides</span><h2 id="home-guides-heading">Make the next decision with less guessing</h2><p>Curated operating guides for cost control, routing, and usage visibility.</p></div><a href={ROUTE_PATHS.guides}>Browse all guides <ArrowRight aria-hidden="true" size={14} /></a></div>
        <div className="home-feature-grid home-guide-grid" role="list">
          {CURATED_GUIDE_SLUGS.map((slug) => GUIDE_BY_SLUG.get(slug)).filter((guide) => guide !== undefined).map((guide) => <article className="panel" role="listitem" key={guide.slug}>
            <span className="eyebrow">{guide.category}</span>
            <h3>{guide.title}</h3>
            <p className="muted">{guide.description}</p>
            <a href={guidePath(guide.slug)}>Read guide <ArrowRight aria-hidden="true" size={14} /></a>
          </article>)}
        </div>
      </section>

      <section className="panel home-builder-section" aria-labelledby="home-builders-heading">
        <span className="eyebrow">A practical decision engine</span>
        <h2 id="home-builders-heading">Built for AI builders</h2>
        <p>Use the same transparent inputs to compare a new model, explain a budget choice, or hand an evidence-backed result to the rest of your team.</p>
      </section>

      <aside className="panel home-monomind-banner" aria-label="MonoMind optimization services">
        <div className="home-monomind-label"><img src="/brand/monomind-tokenbench.png" alt="" /><h2 className="eyebrow">MonoMind AI Lab</h2></div>
        <p>Spending over $1,000/month on LLM tokens? MonoMind designs routing, caching, and agent pipelines that can cut API bills by up to 90%.</p>
        <a className="button" href="https://monomind.one/">Talk to MonoMind <ArrowRight aria-hidden="true" size={16} /></a>
      </aside>
    </div>
  );
}
