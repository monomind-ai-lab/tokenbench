import { ArrowRight, BadgeDollarSign, Layers3, TrendingUp, Workflow } from 'lucide-react';
import { LEADERBOARD_ROUTES, ROUTE_PATHS } from '../routing/routes';
import { formatDateTime } from '../frontend/ui';
import { useBenchmarkLeaderboard } from '../frontend/use-benchmarks';

const FEATURE_CARDS = [
  {
    title: 'Price the decision you are actually making',
    description: 'Compare a paid subscription with the direct API routes and model mix that match your expected monthly workload.',
    Icon: BadgeDollarSign,
  },
  {
    title: 'Keep model routes distinct',
    description: 'Direct-provider, OpenRouter, and OpenCode Zen offers stay separate so their pricing and evidence are not blended together.',
    Icon: Layers3,
  },
  {
    title: 'Use benchmark context honestly',
    description: 'Model performance views identify their source and leave unavailable results unavailable rather than inventing a universal score.',
    Icon: TrendingUp,
  },
  {
    title: 'Design for the workload ahead',
    description: 'Turn token volume, input/output mix, and provider constraints into a transparent starting point for a routing decision.',
    Icon: Workflow,
  },
] as const;

const TEASERS = [
  {
    title: 'Overall Model Value',
    description: 'Supported BenchLM overall capability and disclosed workload price context, without relabeling the value frontier as coding evidence.',
    keyName: 'llm-value',
    href: LEADERBOARD_ROUTES['llm-value'].pathname,
    supportedOnly: true,
  },
  {
    title: 'Human Preference',
    description: 'Human-preference evidence will be shown with its source timestamp and methodology when the published data is available.',
    keyName: 'llm-human-preference',
    href: LEADERBOARD_ROUTES['llm-human-preference'].pathname,
    supportedOnly: false,
  },
  {
    title: 'Image Generation',
    description: 'Image-generation evidence will remain unavailable until a supported source revision can be attributed and displayed.',
    keyName: 'media-text-to-image',
    href: LEADERBOARD_ROUTES['media-text-to-image'].pathname,
    supportedOnly: false,
  },
] as const;

function TerminalPane({ label, children }: { readonly label: string; readonly children: string }) {
  return <article className="panel" aria-label={label}><pre><code>{children}</code></pre></article>;
}

function metricSummary(entry: { readonly metric: { readonly sourceId: string; readonly value: number } | null; readonly blendedCostPerMillion: number | null }) {
  if (!entry.metric) return 'Metric Unavailable';
  const metric = `${entry.metric.sourceId === 'lmarena' ? 'LMArena' : 'BenchLM'} ${entry.metric.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return entry.blendedCostPerMillion === null
    ? metric
    : `${metric} · $${entry.blendedCostPerMillion.toLocaleString(undefined, { maximumFractionDigits: 4 })} / 1M`;
}

type BenchmarkTeaserProps = typeof TEASERS[number] & { readonly key?: string };

function BenchmarkTeaser({
  title,
  description,
  keyName,
  href,
  supportedOnly,
}: BenchmarkTeaserProps) {
  const state = useBenchmarkLeaderboard(keyName, 'balanced', 3);
  const hasPublishedEnvelope = state.envelope !== null && (state.phase === 'ready' || state.phase === 'stale');
  const entries = hasPublishedEnvelope
    ? state.envelope.data.entries.filter((entry) => supportedOnly ? entry.model.evidenceStatus === 'supported' : entry.model.evidenceStatus !== 'estimated').slice(0, 3)
    : [];
  const attribution = state.envelope?.attribution ?? [];

  return <article className="panel" role="listitem">
    <h3>{title}</h3>
    <p className="muted">{description}</p>
    {state.phase === 'loading' ? <p role="status">Loading published benchmark data.</p> : null}
    {state.phase === 'stale' ? <p role="status">Stale benchmark data{state.envelope ? ` · showing the last published results checked ${formatDateTime(state.envelope.freshness.checkedAt)}` : ''}</p> : null}
    {hasPublishedEnvelope && entries.length > 0 ? <>
      <ol className="home-teaser-list" aria-label={`${title} published entries`}>
        {entries.map((entry, index) => <li key={entry.model.modelKey}><span>{index + 1}. {entry.model.name}</span><small>{metricSummary(entry)}</small></li>)}
      </ol>
      <p className="home-teaser-meta">{state.phase === 'stale' ? 'Last checked' : 'Fresh as of'} {formatDateTime(state.envelope?.freshness.checkedAt ?? null)}{attribution.map((source) => <span key={`${source.sourceId}-${source.url}`}> <span aria-hidden="true">·</span> <a href={source.url} target="_blank" rel="noreferrer">{source.label}</a></span>)}</p>
    </> : null}
    {hasPublishedEnvelope && entries.length === 0 ? <p role="status">Unavailable — no supported published entries are available for this teaser.</p> : null}
    {state.phase === 'unavailable' ? <p role="status">Unavailable — awaiting a valid published benchmark revision.</p> : null}
    {state.phase === 'error' ? <p role="status">Benchmark data unavailable — open the full route to retry.</p> : null}
    <a href={href}>View the full leaderboard <ArrowRight aria-hidden="true" size={14} /></a>
  </article>;
}

export function HomePage() {
  return (
    <div className="content-stack home-page">
      <section className="panel home-hero" aria-labelledby="home-hero-heading">
        <span className="eyebrow">TokenBench</span>
        <h1 id="home-hero-heading">Stop Guessing Your AI Costs. Start Optimizing.</h1>
        <p>Make source-aware AI cost and model decisions with transparent workload inputs, route-level pricing context, and honest benchmark availability.</p>
        <div className="home-hero-actions">
          <a className="button" href={`${ROUTE_PATHS.calculator}#calculator`}>Calculate your costs <ArrowRight aria-hidden="true" size={16} /></a>
          <a className="button button-secondary" href={LEADERBOARD_ROUTES['llm-value'].pathname}>Explore model value</a>
        </div>
        <div className="home-terminal-grid" role="group" aria-label="TokenBench decision workflow">
          <TerminalPane label="Workload input">$ monthly_tokens = 10,000,000</TerminalPane>
          <TerminalPane label="Model route input">$ route = direct_provider_api</TerminalPane>
          <TerminalPane label="Evidence result">✓ provider evidence attached</TerminalPane>
          <TerminalPane label="Decision output">→ review the tradeoffs</TerminalPane>
        </div>
      </section>

      <section className="home-feature-section" aria-labelledby="home-features-heading">
        <div className="panel-heading"><div><span className="eyebrow">Decision support</span><h2 id="home-features-heading">A clearer path from usage to action</h2></div></div>
        <div className="home-feature-grid" role="list" aria-label="TokenBench decision features">
          {FEATURE_CARDS.map(({ title, description, Icon }) => (
            <article className="panel" role="listitem" key={title}>
              <Icon aria-hidden="true" size={22} />
              <h3>{title}</h3>
              <p className="muted">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel home-benchmark-section" aria-labelledby="home-benchmark-heading">
        <div className="panel-heading"><div><span className="eyebrow">Benchmark signals</span><h2 id="home-benchmark-heading">Evidence when it is ready, not invented before it is</h2><p>Each teaser reads only a published cached revision and keeps stale, unavailable, and missing measurements explicit.</p></div></div>
        <div className="home-teaser-grid" role="list" aria-label="TokenBench benchmark teasers">
          {TEASERS.map((teaser) => <BenchmarkTeaser key={teaser.keyName} {...teaser} />)}
        </div>
      </section>

      <aside className="panel home-monomind-banner" aria-label="MonoMind optimization services">
        <span className="eyebrow">MonoMind AI Lab</span>
        <p>Spending &gt;$1,000/mo on LLM tokens? MonoMind designs custom routing, prompt caching, and agent pipelines to cut API bills by up to 60%.</p>
        <a className="button" href="https://monomind.one/">Talk to MonoMind <ArrowRight aria-hidden="true" size={16} /></a>
      </aside>
    </div>
  );
}
