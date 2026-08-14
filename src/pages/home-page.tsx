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

export interface HomeMetrics {
  readonly trackedModels: number | null;
  readonly maxSavingsPercent: number | null;
  readonly topThroughput: number | null;
  readonly effectiveAt: string | null;
}

export interface HomeMetricModel {
  readonly modelKey: string;
  readonly current?: boolean;
  readonly status?: 'current' | 'archived';
  readonly updatedAt?: string;
}

export interface HomeMetricPrice {
  readonly modelKey: string;
  readonly inputUsdPerMillion: number | null;
  readonly outputUsdPerMillion: number | null;
  readonly current?: boolean;
  readonly compatible?: boolean;
  readonly status?: 'current' | 'archived';
  readonly updatedAt?: string;
}

export interface HomeMetricPerformance {
  readonly modelKey: string;
  readonly throughputTokensPerSecond?: number | null;
  readonly throughput?: number | null;
  readonly value?: number | null;
  readonly unit?: string;
  readonly evidenceStatus?: 'supported' | 'estimated' | 'source_only';
  readonly current?: boolean;
  readonly status?: 'current' | 'archived';
  readonly updatedAt?: string;
}

export interface HomeMetricsInput {
  readonly models: readonly HomeMetricModel[];
  readonly prices: readonly HomeMetricPrice[];
  readonly performance: readonly HomeMetricPerformance[];
}

const HOME_WORKLOAD_MIX = { inputShare: 0.5, outputShare: 0.5 } as const;

function isCurrentHomeEvidence(record: { readonly current?: boolean; readonly status?: 'current' | 'archived' }): boolean {
  return record.current !== false && record.status !== 'archived';
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function formatHomeMetric(value: number | null, unit = ''): string {
  return value === null ? 'Not reported' : `${value}${unit}`;
}

/** Builds only metrics backed by current, compatible records. */
export function buildHomeMetrics({ models, prices, performance }: HomeMetricsInput): HomeMetrics {
  const currentModels = models.filter(isCurrentHomeEvidence);
  const trackedModels = currentModels.length > 0
    ? new Set(currentModels.map((model) => model.modelKey)).size
    : null;
  const currentPrices = prices.filter((price) => isCurrentHomeEvidence(price) && price.compatible !== false
    && finiteNonNegative(price.inputUsdPerMillion) && finiteNonNegative(price.outputUsdPerMillion));
  const costsByModel = new Map<string, number>();
  currentPrices.forEach((price) => {
    const cost = price.inputUsdPerMillion * HOME_WORKLOAD_MIX.inputShare
      + price.outputUsdPerMillion * HOME_WORKLOAD_MIX.outputShare;
    const previous = costsByModel.get(price.modelKey);
    if (previous === undefined || cost < previous) costsByModel.set(price.modelKey, cost);
  });
  const costs = [...costsByModel.values()];
  const highestCost = costs.length > 1 ? Math.max(...costs) : null;
  const lowestCost = costs.length > 1 ? Math.min(...costs) : null;
  const maxSavingsPercent = highestCost !== null && lowestCost !== null
    ? Math.round(((highestCost - lowestCost) / highestCost) * 100)
    : null;
  const throughputs = performance
    .filter(isCurrentHomeEvidence)
    .filter((record) => record.evidenceStatus === undefined || record.evidenceStatus === 'supported')
    .map((record) => record.throughputTokensPerSecond ?? record.throughput
      ?? (record.unit === 'tokens_per_second' ? record.value : null))
    .filter(finiteNonNegative);
  const effectiveDates = [...currentModels, ...currentPrices, ...performance.filter(isCurrentHomeEvidence)]
    .map((record) => record.updatedAt)
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .sort();
  return {
    trackedModels,
    maxSavingsPercent,
    topThroughput: throughputs.length > 0 ? Math.max(...throughputs) : null,
    effectiveAt: effectiveDates.at(-1) ?? null,
  };
}

const HOME_PREVIEWS = [
  { title: 'Models preview', description: 'Browse current and archived model records with route-level evidence.', href: ROUTE_PATHS.models, action: 'Inspect models' },
  { title: 'Leaderboards preview', description: 'Review published benchmark lanes and evidence lenses.', href: ROUTE_PATHS.leaderboards, action: 'Inspect leaderboards' },
  { title: 'Compare preview', description: 'Put two models side by side with comparable facts.', href: ROUTE_PATHS.compareHub, action: 'Inspect comparisons' },
  { title: 'Subscribe vs API preview', description: 'Compare observed workload cost with supported subscription evidence.', href: ROUTE_PATHS.calculator, action: 'Inspect subscription costs' },
  { title: 'Articles preview', description: 'Read source-backed guides for practical AI operating decisions.', href: ROUTE_PATHS.articles, action: 'Inspect articles' },
] as const;

function HomeMetricsStrip({ metrics }: { readonly metrics: HomeMetrics }) {
  return <section className="home-metrics panel" aria-label="Home metrics">
    <p className="eyebrow">Evidence snapshot · 50/50 input/output mix</p>
    <dl className="home-metrics-grid">
      <div><dt>Models tracked</dt><dd>{formatHomeMetric(metrics.trackedModels)}</dd></div>
      <div><dt>Max savings</dt><dd>{formatHomeMetric(metrics.maxSavingsPercent, '%')}</dd></div>
      <div><dt>Top throughput</dt><dd>{formatHomeMetric(metrics.topThroughput, ' tokens/s')}</dd></div>
      <div><dt>Effective at</dt><dd>{metrics.effectiveAt ?? 'Not reported'}</dd></div>
    </dl>
  </section>;
}

function HomePreviewGrid() {
  return <section className="home-preview-section" aria-labelledby="home-previews-heading">
    <div className="panel-heading"><div><span className="eyebrow">Decision surfaces</span><h2 id="home-previews-heading">Inspect the evidence before you act</h2></div></div>
    <div className="home-preview-grid">
      {HOME_PREVIEWS.map((preview) => <section className="panel home-preview" data-home-preview key={preview.href} aria-labelledby={`home-preview-${preview.href.replaceAll(/[^a-z0-9]+/giu, '-')}`}>
        <h2 id={`home-preview-${preview.href.replaceAll(/[^a-z0-9]+/giu, '-')}`}>{preview.title}</h2>
        <p>{preview.description}</p>
        <a className="button button-secondary" href={preview.href}>{preview.action}<ArrowRight aria-hidden="true" size={14} /></a>
      </section>)}
    </div>
  </section>;
}

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
  const metrics = buildHomeMetrics({
    models: (state.decisionPicks ?? []).flatMap((group) => group.entries).map((entry) => ({
      modelKey: entry.modelKey,
      current: true,
      updatedAt: entry.updatedAt,
    })),
    prices: [],
    performance: [],
  });

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
    <HomeMetricsStrip metrics={metrics} />
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

      <HomePreviewGrid />

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
