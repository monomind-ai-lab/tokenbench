import { ArrowRight, BadgeDollarSign, Layers3, TrendingUp, Workflow } from 'lucide-react';
import { LEADERBOARD_ROUTES, ROUTE_PATHS } from '../routing/routes';

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
    title: 'Coding Value',
    description: 'Workload-aware coding capability and price context will appear after a supported benchmark revision is published.',
    href: LEADERBOARD_ROUTES['llm-value'].pathname,
  },
  {
    title: 'Human Preference',
    description: 'Human-preference evidence will be shown with its source timestamp and methodology when the published data is available.',
    href: LEADERBOARD_ROUTES['llm-human-preference'].pathname,
  },
  {
    title: 'Image Generation',
    description: 'Image-generation evidence will remain unavailable until a supported source revision can be attributed and displayed.',
    href: LEADERBOARD_ROUTES['media-text-to-image'].pathname,
  },
] as const;

function TerminalPane({ label, children }: { readonly label: string; readonly children: string }) {
  return <article className="panel" aria-label={label}><pre><code>{children}</code></pre></article>;
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
        <div className="panel-heading"><div><span className="eyebrow">Benchmark signals</span><h2 id="home-benchmark-heading">Evidence when it is ready, not invented before it is</h2><p>These slots deliberately remain source-aware until TokenBench has a published, attributable benchmark revision to display.</p></div></div>
        <div className="home-teaser-grid" role="list" aria-label="TokenBench benchmark teasers">
          {TEASERS.map(({ title, description, href }) => (
            <article className="panel" role="listitem" key={title}>
              <h3>{title}</h3>
              <p className="muted">{description}</p>
              <p role="status">Awaiting a published benchmark revision.</p>
              <a href={href}>View the methodology route <ArrowRight aria-hidden="true" size={14} /></a>
            </article>
          ))}
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
