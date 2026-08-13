import { ArrowRight, BadgeDollarSign, Download, Layers3, TrendingUp, Workflow } from 'lucide-react';
import type { DecisionPickEntry, DecisionPickGroup } from '../benchmarks/decision-picks';
import type { RepresentativeComparison } from '../benchmarks/api-projections';
import { modelPath } from '../benchmarks/model-directory';
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
  { key: 'multimodal-vision-documents', title: 'Multimodal' },
  { key: 'llm-knowledge', title: 'Knowledge' },
];

interface MarketLeaderCard {
  readonly key: LeaderboardKey;
  readonly title: string;
  readonly status: DecisionPickGroup['status'];
  readonly leaders: readonly DecisionPickEntry[];
}

/**
 * Renders a published value with its unit, except where the surrounding label
 * already states it. A leader row under a "Score" heading reads "82.79", not
 * "82.79 score"; a context window still reads "128,000 tokens" because that
 * unit is not self-evident from the label alone.
 */
const SELF_EVIDENT_UNITS = new Set(['score', 'arena_score']);

function formatScore(score: number, unit: string): string {
  const value = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(score);
  return SELF_EVIDENT_UNITS.has(unit) ? value : `${value} ${unit}`;
}

/**
 * Reads the published top three leaders for each decision route without
 * sorting or re-ranking a filtered subset. `evidence-lens` routes publish
 * evidence the source does not rank, so they are shown without a position.
 */
function marketLeaderCards(groups: readonly DecisionPickGroup[] | null): readonly MarketLeaderCard[] {
  if (groups === null) return [];
  return MARKET_LEADER_CARDS.flatMap(({ key, title }) => {
    const group = groups.find((candidate) => candidate.key === key);
    const leaders = group?.entries.slice(0, 3) ?? [];
    if (!group || leaders.length === 0) return [];
    return [{ key, title, status: group.status, leaders }];
  });
}

function MarketLeaderArticle({ card }: { readonly card: MarketLeaderCard; readonly key?: string }) {
  return <article className="panel home-snapshot-card">
    <h3><a href={LEADERBOARD_ROUTES[card.key].pathname}>{card.title}</a></h3>
    <ol className="home-snapshot-leaders">
      {card.leaders.map((leader, index) => <li key={leader.modelKey}>
        <span className="home-snapshot-leader-rank">{card.status === 'benchalign' && Number.isSafeInteger(leader.rank) && leader.rank > 0 ? leader.rank : index + 1}</span>
        <a className="home-snapshot-model" href={modelPath(leader.slug)}>
          <ProviderMark providerId={leader.provider} providerName={leader.provider} decorative size={20} />
          <span className="home-snapshot-leader-name">{leader.name}</span>
          <span className="home-snapshot-leader-score" title={`${leader.unit.replace('_', ' ')}: ${formatScore(leader.score, leader.unit)}`}>{formatScore(leader.score, leader.unit)}</span>
          <ArrowRight aria-hidden="true" size={14} />
        </a>
      </li>)}
    </ol>
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
  const scoreLine = strongest
    ? `${formatScore(strongest.modelAValue, strongest.unit)} vs ${formatScore(strongest.modelBValue, strongest.unit)}`
    : null;
  const contextLine = comparison.modelAContextWindowTokens !== null && comparison.modelBContextWindowTokens !== null
    ? `${formatScore(comparison.modelAContextWindowTokens, 'tokens')} · ${formatScore(comparison.modelBContextWindowTokens, 'tokens')}`
    : null;
  return <li>
    <article className="panel home-snapshot-card home-comparison-card">
      <h3><a href={modelPath(comparison.modelASlug)}>{comparison.modelAName}</a> <span className="home-comparison-vs">vs</span> <a href={modelPath(comparison.modelBSlug)}>{comparison.modelBName}</a></h3>
      <p className="home-comparison-result"><strong>{finding}</strong></p>
      <dl className="home-comparison-details">
        {scoreLine ? <div><dt>Score</dt><dd>{scoreLine}</dd></div> : null}
        {contextLine ? <div><dt>Context window</dt><dd>{contextLine}</dd></div> : null}
      </dl>
      <a className="home-snapshot-model home-comparison-cta" href={`/compare/${encodeURIComponent(comparison.pairSlug)}`} aria-label={`Compare ${comparison.modelAName} and ${comparison.modelBName}`}>Open comparison <ArrowRight aria-hidden="true" size={14} /></a>
    </article>
  </li>;
}

function MarketAtAGlance() {
  const state = useDecisionPicks();
  const envelope = state.envelope;
  const cards = marketLeaderCards(state.decisionPicks);
  const comparisons = envelope?.data.representativeComparisons ?? [];

  return <>
    <section className="panel home-snapshot-section" aria-label="Market at a glance">
      <div className="panel-heading">
        <div><span className="eyebrow">Published evidence</span><h2 id="home-market-heading">See the market at a glance</h2><p>Leaders for each decision route, republished from the active source revision without recalculation.</p></div>
      </div>
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
          </>}
      <div className="home-snapshot-actions">
        <a className="home-snapshot-method" href={ROUTE_PATHS.leaderboards}>Explore more leaderboards <ArrowRight aria-hidden="true" size={14} /></a>
      </div>
    </section>
    {comparisons.length > 0 ? <section className="panel home-comparison-section" aria-label="Representative comparisons">
      <div className="panel-heading">
        <div><span className="eyebrow">Representative comparisons</span><h3 id="home-comparison-heading">Compare best models</h3><p>Each card pairs two models from the active source revision and names the category where the published evidence actually differs — priced and scored as the source published them.</p></div>
      </div>
      <ul className="home-snapshot-grid home-comparison-grid" aria-label="Representative comparisons">
        {comparisons.map((comparison) => <RepresentativeComparisonArticle comparison={comparison} key={comparison.pairSlug} />)}
      </ul>
      <div className="home-snapshot-actions">
        <a className="home-snapshot-method" href={ROUTE_PATHS.compareHub}>Compare more models <ArrowRight aria-hidden="true" size={14} /></a>
      </div>
    </section> : null}
  </>;
}

export function HomePage() {
  return (
    <div className="content-stack home-page">
      <section className="panel home-hero" aria-labelledby="home-hero-heading">
        <span className="eyebrow">TokenBench</span>
        <h1 id="home-hero-heading">{HOME_PAGE_COPY.heroH1Leading}<br />{HOME_PAGE_COPY.heroH1Trailing}</h1>
        <p>{HOME_PAGE_COPY.subcopy}</p>
        <div className="home-hero-actions" aria-label="Primary TokenBench decisions">
          <a className="button" href={ROUTE_PATHS.compareHub}>Compare models <ArrowRight aria-hidden="true" size={16} /></a>
          <a className="button button-secondary" href={ROUTE_PATHS.calculator}>Review Your Subscriptions</a>
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

      <section className="home-feature-section" aria-labelledby="home-articles-heading">
        <div className="panel-heading"><div><span className="eyebrow">Articles</span><h2 id="home-articles-heading">Evidence-ledger articles</h2><p>Source-backed guides and analysis channels, with each destination's population state stated explicitly.</p></div></div>
        <div className="home-feature-grid home-guide-grid" role="list" aria-label="TokenBench Articles channels">
          <article className="panel" role="listitem">
            <span className="eyebrow">Guides</span>
            <h3>Practical operating guides</h3>
            <p className="muted">Curated, source-backed guides for cost control, routing, and usage visibility.</p>
            <a href={ROUTE_PATHS.guides}>Browse all guides <ArrowRight aria-hidden="true" size={14} /></a>
          </article>
          <article className="panel" role="listitem">
            <span className="eyebrow">Insights</span>
            <h3>LLM insights</h3>
            <p className="muted">Not yet separately populated. This channel is reserved for future evidence-ledger analysis.</p>
            <a href={ROUTE_PATHS.insights}>LLM insights <ArrowRight aria-hidden="true" size={14} /></a>
          </article>
        </div>
      </section>

      <aside className="panel home-monomind-banner" aria-label="MonoMind optimization services">
        <div className="home-monomind-label"><img src="/brand/monomind-tokenbench.png" alt="" /><h2 className="eyebrow">MonoMind AI Lab</h2></div>
        <p className="home-monomind-lead">Spending over $1,000/month on LLM tokens?</p>
        <p className="home-monomind-copy">MonoMind designs routing, caching, and agent pipelines that can cut API bills by up to 90%.</p>
        <a className="button" href="https://monomind.one/">Talk to MonoMind <ArrowRight aria-hidden="true" size={16} /></a>
      </aside>
    </div>
  );
}
