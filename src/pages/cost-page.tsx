import { ROUTE_PATHS } from '../routing/routes';
import { trackTokenBenchEvent } from '../frontend/analytics';
import type { ReactNode } from 'react';

export interface CostHubSourceCoverage {
  readonly completePriceRoutes: number;
  readonly effectiveAt: string | null;
  readonly freshness: 'fresh' | 'stale' | 'unavailable';
}

export interface CostHubSharedState {
  readonly present: boolean;
  /** Field names only; never a workload value or share payload. */
  readonly carriedFields: readonly ('model' | 'host' | 'workload' | 'mix')[];
}

const EMPTY_COVERAGE: CostHubSourceCoverage = {
  completePriceRoutes: 0,
  effectiveAt: null,
  freshness: 'unavailable',
};

const EMPTY_SHARED_STATE: CostHubSharedState = { present: false, carriedFields: [] };

function formatEffectiveAt(value: string | null): string {
  if (value === null || !Number.isFinite(Date.parse(value))) return 'Not reported';
  return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC', year: 'numeric' }).format(new Date(value));
}

function carryPath(fields: readonly string[]): string {
  return `${ROUTE_PATHS.calculator}?carry=${encodeURIComponent(fields.join(','))}`;
}

function ToolCard({
  href,
  name,
  title,
  children,
}: {
  readonly href: string;
  readonly name: 'calculator' | 'breakeven';
  readonly title: string;
  readonly children: ReactNode;
}) {
  return <article className="cost-tool-card">
    <h2>{title}</h2>
    <div>{children}</div>
    <a className="button" href={href} onClick={() => trackTokenBenchEvent('cost_hub_tool_opened', { tool: name, route: ROUTE_PATHS.cost })}>
      {name === 'calculator' ? 'Open Cost Simulator' : 'Open Breakeven Calculator'}
    </a>
  </article>;
}

/** Explanatory hub: it deliberately describes the two questions without calculating either. */
export function CostPage({
  sourceCoverage = EMPTY_COVERAGE,
  sharedState = EMPTY_SHARED_STATE,
}: {
  readonly sourceCoverage?: CostHubSourceCoverage;
  readonly sharedState?: CostHubSharedState;
}) {
  const sourceMessage = sourceCoverage.freshness === 'unavailable'
    ? 'Pricing evidence is unavailable right now. Both tools remain available and will state any result limitation.'
    : `${sourceCoverage.completePriceRoutes} complete published price routes · effective ${formatEffectiveAt(sourceCoverage.effectiveAt)}${sourceCoverage.freshness === 'stale' ? ' · stale evidence' : ''}.`;

  return <main className="content-stack cost-page" id="cost-page-content" tabIndex={-1}>
    <header className="cost-page-intro">
      <h1>Choose the right cost question</h1>
      <p>Use Cost Simulator to estimate one concrete workload from normalized source-price line items. Use Breakeven to find where a seat-fee scenario crosses metered API spend.</p>
      <p className="cost-evidence-note"><strong>Fee crossover is not subscription-capacity evidence.</strong> Included tokens or access limits appear only when a separately verified entitlement source publishes them.</p>
    </header>

    <section aria-label="Cost decision tools" className="cost-tool-grid">
      <ToolCard href={ROUTE_PATHS.calculator} name="calculator" title="Cost Simulator">
        <p>Estimate a monthly scenario with model, host, workload mix, cache, and long-context assumptions.</p>
        <dl><div><dt>Output</dt><dd>Auditable subscription and API line items</dd></div><div><dt>Needs</dt><dd>Source prices and workload assumptions</dd></div></dl>
      </ToolCard>
      <ToolCard href={ROUTE_PATHS.breakeven} name="breakeven" title="Breakeven Calculator">
        <p>Compare a monthly seat fee with published metered input and output prices across a displayed token domain.</p>
        <dl><div><dt>Output</dt><dd>Fee crossover and lower-cost region</dd></div><div><dt>Needs</dt><dd>Seat fee, mix, and complete API price dimensions</dd></div></dl>
      </ToolCard>
    </section>

    <section className="cost-tool-comparison" aria-labelledby="cost-tool-comparison-heading">
      <h2 id="cost-tool-comparison-heading">What changes between the tools</h2>
      <dl>
        <div><dt>Simulator answer</dt><dd>A monthly scenario estimate using normalized source-price line items.</dd></div>
        <div><dt>Breakeven answer</dt><dd>The monthly fee crossover between a seat-fee scenario and metered API spend.</dd></div>
        <div><dt>Capacity evidence</dt><dd>Independent from either fee calculation and unavailable unless a verified entitlement publishes it.</dd></div>
      </dl>
    </section>

    <section className="cost-source-coverage" aria-labelledby="cost-source-coverage-heading">
      <h2 id="cost-source-coverage-heading">Pricing source coverage</h2>
      <p>{sourceMessage}</p>
      <p><a href={ROUTE_PATHS.guides}>Read pricing and workload guides</a></p>
    </section>

    {sharedState.present && sharedState.carriedFields.length > 0 ? <section className="cost-shared-state" aria-labelledby="cost-shared-state-heading">
      <h2 id="cost-shared-state-heading">Continue a shared scenario</h2>
      <p>{`The next tool can carry your ${sharedState.carriedFields.join(', ')} selection. Workload quantities are not shown or sent from this hub.`}</p>
      <div className="cost-shared-actions">
        <a className="button" href={carryPath(sharedState.carriedFields)} onClick={() => trackTokenBenchEvent('cost_hub_shared_state_continued', { route: ROUTE_PATHS.cost })}>Continue with shared state</a>
        <a className="button button-secondary" href={ROUTE_PATHS.calculator} onClick={() => trackTokenBenchEvent('cost_hub_start_clean', { route: ROUTE_PATHS.cost })}>Start clean</a>
      </div>
    </section> : null}
  </main>;
}
