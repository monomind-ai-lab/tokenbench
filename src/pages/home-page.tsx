import { ArrowRight, BadgeDollarSign, Download, Layers3, TrendingUp, Workflow } from 'lucide-react';
import type { ReactNode } from 'react';
import type { DecisionPickEntry, HomeDecisionSlot, HomeRepresentativeRate, PricePerformancePoint } from '../benchmarks/decision-picks';
import { LeaderboardEvidence } from '../frontend/leaderboard-table';
import { ProviderMark } from '../frontend/provider-mark';
import { useHomeDecisionSnapshot } from '../frontend/use-benchmarks';
import { HOME_PAGE_COPY } from '../brand/site-config';
import { GUIDE_BY_SLUG, guidePath } from '../guides/content';
import { LEADERBOARD_ROUTES, ROUTE_PATHS } from '../routing/routes';

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

type HomeSnapshotEntry = DecisionPickEntry | HomeRepresentativeRate;

function formatScore(score: number, unit: string): string {
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(score)} ${unit}`;
}

function formatRate(rate: number): string {
  return `$${new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(rate)} / 1M`;
}

function DecisionSnapshotCard<T extends HomeSnapshotEntry>({
  title,
  slot,
  children,
}: {
  readonly title: string;
  readonly slot: HomeDecisionSlot<T>;
  readonly children: (value: T) => ReactNode;
}) {
  return <article className="panel home-snapshot-card">
    <h3>{title}</h3>
    {slot.status === 'unavailable' ? <p className="home-snapshot-unavailable" role="status">Unavailable</p> : <>
      <a className="home-snapshot-model" href={slot.value.routePath}>
        <ProviderMark providerId={slot.value.provider} providerName={slot.value.provider} decorative size={20} />
        <span>{slot.value.name}</span>
        <ArrowRight aria-hidden="true" size={14} />
      </a>
      <div className="home-snapshot-detail">{children(slot.value)}</div>
    </>}
  </article>;
}

function pricePerformanceDescription(points: readonly PricePerformancePoint[]): string {
  const values = points.map((point) => `${point.name}: $${new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(point.representativePriceUsdPerMillion)} per 1M tokens and ${formatScore(point.score, point.unit)}.`);
  return `${values.join(' ')} Higher performance and lower representative price are better.`;
}

function plotCoordinate(value: number, minimum: number, maximum: number, start: number, end: number): number {
  if (maximum === minimum) return (start + end) / 2;
  return start + ((value - minimum) / (maximum - minimum)) * (end - start);
}

function PricePerformancePlot({ points }: { readonly points: readonly PricePerformancePoint[] }) {
  const descriptionId = 'home-price-performance-description';
  if (points.length === 0) {
    return <article className="panel home-price-performance-card">
      <h3>Price versus performance</h3>
      <p className="home-snapshot-unavailable" role="status">Unavailable</p>
      <p className="muted">No supported model has both a representative verified API rate and comparable overall performance evidence in the published snapshot.</p>
    </article>;
  }

  const prices = points.map((point) => point.representativePriceUsdPerMillion);
  const scores = points.map((point) => point.score);
  const lowPrice = Math.min(...prices);
  const highPrice = Math.max(...prices);
  const lowScore = Math.min(...scores);
  const highScore = Math.max(...scores);
  const description = pricePerformanceDescription(points);

  return <article className="panel home-price-performance-card">
    <div className="home-price-performance-heading"><div><h3>Price versus performance</h3><p className="muted">Supported overall evidence paired with a representative verified API rate.</p></div><a href={LEADERBOARD_ROUTES['llm-overall'].pathname}>Open overall benchmarks <ArrowRight aria-hidden="true" size={14} /></a></div>
    <svg className="home-price-performance-plot" role="img" aria-label="Price versus performance" aria-describedby={descriptionId} viewBox="0 0 320 188">
      <line x1="34" x2="300" y1="154" y2="154" />
      <line x1="34" x2="34" y1="20" y2="154" />
      <text x="166" y="181" textAnchor="middle">Lower representative price</text>
      <text x="10" y="89" textAnchor="middle" transform="rotate(-90 10 89)">Higher performance</text>
      {points.map((point) => {
        const x = plotCoordinate(point.representativePriceUsdPerMillion, lowPrice, highPrice, 56, 282);
        const y = plotCoordinate(point.score, lowScore, highScore, 132, 42);
        return <g key={point.modelKey} className="home-price-performance-point">
          <circle cx={x} cy={y} r="7" />
          <text x={x} y={y - 12} textAnchor="middle">{point.name}</text>
        </g>;
      })}
    </svg>
    <p id={descriptionId} className="home-price-performance-description">{description}</p>
  </article>;
}

function LiveDecisionSnapshot() {
  const state = useHomeDecisionSnapshot();
  const envelope = state.envelope;
  const snapshot = state.homeDecisionSnapshot;

  return <section className="panel home-snapshot-section" aria-label="Live decision snapshot">
    <div className="panel-heading"><div><span className="eyebrow">Published evidence</span><h2 id="home-market-heading">See the market at a glance</h2><p>A single published summary keeps the current decision facts together and preserves unavailable evidence as unavailable.</p></div></div>
    {snapshot === null || envelope === null ? state.phase === 'loading'
      ? <p className="home-snapshot-state" role="status">Loading the published decision snapshot.</p>
      : state.phase === 'error'
        ? <p className="home-snapshot-state home-snapshot-state-error" role="alert">Published decision snapshot could not be loaded. {state.error ?? 'Benchmark request failed.'}</p>
        : <p className="home-snapshot-state" role="status">Published decision snapshot is unavailable. {state.error ?? 'No published snapshot was received.'}</p>
      : <>
        {state.phase === 'stale' ? <p className="home-snapshot-state" role="status">Stale published decision snapshot. {state.error ?? 'The last published decision facts remain visible while refresh is overdue.'}</p> : null}
        <div className="home-snapshot-grid">
          <DecisionSnapshotCard title="BenchAlign leader" slot={snapshot.benchAlignLeader}>{(leader) => <dl><div><dt>Overall score</dt><dd>{formatScore(leader.score, leader.unit)}</dd></div></dl>}</DecisionSnapshotCard>
          <DecisionSnapshotCard title="Value-frontier leader" slot={snapshot.valueFrontierLeader}>{(leader) => <dl><div><dt>Representative price</dt><dd>{leader.representativePriceUsdPerMillion === null ? 'Unavailable' : formatRate(leader.representativePriceUsdPerMillion)}</dd></div></dl>}</DecisionSnapshotCard>
          <DecisionSnapshotCard title="Lowest verified API rate" slot={snapshot.lowestVerifiedRepresentativeRate}>{(rate) => <dl><div><dt>Representative price</dt><dd>{formatRate(rate.representativePriceUsdPerMillion)}</dd></div></dl>}</DecisionSnapshotCard>
          <PricePerformancePlot points={snapshot.pricePerformancePoints} />
        </div>
        <LeaderboardEvidence
          publishedAt={envelope.publishedAt}
          freshness={envelope.freshness}
          attribution={envelope.attribution}
          label="Decision snapshot evidence"
          compact
        />
      </>}
    <a className="home-snapshot-method" href={ROUTE_PATHS.methodologyBenchAlign}>How rankings work <ArrowRight aria-hidden="true" size={14} /></a>
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

      <LiveDecisionSnapshot />

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
