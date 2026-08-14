import { TrendingUp } from 'lucide-react';
import type { ModelOffer, PlanOffer } from '../catalog/contracts';
import { UI_COPY } from '../data/mockData';
import {
  buildCalculatorEvidenceLineItems,
  calculatorCsv,
  formatCurrencyMicroDollars,
  formatSignedPercentBasisPoints,
  formatTokens,
  type CalculatorSnapshot,
} from './calculator-state';
import { trackTokenBenchEvent } from './analytics';
import { isPaidIndividualPlan } from './plan-filter';
import type { ResultsDashboardProps } from './types';
import { EmptyState } from './ui';
import { EditorialCta } from './editorial-cta';

interface TrendChartProps {
  readonly snapshot: CalculatorSnapshot;
}

function recommendationForSnapshot(selectedPlan: PlanOffer | undefined, snapshot: CalculatorSnapshot): string {
  const comparison = snapshot.comparison;
  if (!selectedPlan || !comparison) return 'Select a paid individual plan to compare.';
  if (comparison.cheaper === 'subscription') return 'Subscription is cheaper on a token-equivalent basis.';
  if (comparison.cheaper === 'api') return 'API is cheaper on a token-equivalent basis.';
  return 'The token-equivalent costs are equal.';
}

export function recommendationForResult(selectedPlan: PlanOffer | undefined, snapshot: CalculatorSnapshot): string {
  return recommendationForSnapshot(selectedPlan, snapshot);
}

function TrendChart({ snapshot }: TrendChartProps) {
  const maxValue = Math.max(...snapshot.chartPoints.map((point) => point.valueMicroDollars), snapshot.apiEquivalentValueMicroDollars, 1);

  return (
    <div className="trend-chart-wrap">
      <div className="chart-axis" aria-hidden="true">
        <span>{formatCurrencyMicroDollars(maxValue)}</span>
        <span>{formatCurrencyMicroDollars(Math.round(maxValue * 0.75))}</span>
        <span>{formatCurrencyMicroDollars(Math.round(maxValue / 2))}</span>
        <span>{formatCurrencyMicroDollars(Math.round(maxValue * 0.25))}</span>
        <span>$0</span>
      </div>
      <div
        className="trend-chart"
        role="img"
        aria-label={`API-equivalent value trend by monthly tokens. Current workload: ${formatTokens(snapshot.monthlyTokens)} tokens and ${formatCurrencyMicroDollars(snapshot.apiEquivalentValueMicroDollars)} API-equivalent value.`}
      >
        {snapshot.chartPoints.map((point, index) => (
          <div className={`chart-column ${index === 3 ? 'chart-column-current' : ''}`} key={`${point.tokens}-${index}`} data-testid="chart-point">
            {index === 3 ? <span className="current-mix-label">Current workload</span> : null}
            <div
              className="chart-bar"
              style={{ height: `${Math.max(point.valueMicroDollars > 0 ? 4 : 0, (point.valueMicroDollars / maxValue) * 100)}%` }}
              title={`${formatTokens(point.tokens)}: ${formatCurrencyMicroDollars(point.valueMicroDollars)}`}
            />
            <span>{formatTokens(point.tokens)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value, detail }: { readonly label: string; readonly value: string; readonly detail?: string }) {
  return (
    <div className="value-metric">
      <h3>{label}</h3>
      <strong>{value}</strong>
      {detail ? <span>{detail}</span> : null}
    </div>
  );
}

/** The audit view preserves published price evidence separately from derived scenario costs. */
function AuditLedger({ snapshot, catalog }: Pick<ResultsDashboardProps, 'snapshot' | 'catalog'>) {
  const offer = snapshot.apiMapping.defaultOffer ?? snapshot.apiMapping.selectedOffers[0] ?? null;
  const source = offer && catalog ? catalog.provenance.find((entry) => entry.id === offer.sourceId) : undefined;
  const lineItems = buildCalculatorEvidenceLineItems(snapshot, offer, source?.observedAt ?? null);
  const csv = calculatorCsv(lineItems);

  return <section className="calculator-audit-ledger" aria-labelledby="calculator-audit-heading">
    <h2 id="calculator-audit-heading">Published source prices</h2>
    <dl className="calculator-audit-rows">
      {lineItems.filter((row) => row.kind !== 'assumption').map((row) => <div className={`calculator-audit-row calculator-audit-${row.kind}`} key={row.label}>
        <dt>{row.label}</dt>
        <dd>{row.valueMicroDollars === null ? 'Unavailable' : formatCurrencyMicroDollars(row.valueMicroDollars)}{row.kind === 'source_price' ? ' per 1M tokens' : ''}</dd>
        {row.priceEffectiveAt ? <dd className="calculator-audit-effective">Effective {row.priceEffectiveAt}</dd> : null}
      </div>)}
    </dl>
    <p className="calculator-audit-missing">Cache read, cache write, and long-context dimensions appear only when their route-specific source price is published; unavailable dimensions are excluded rather than priced at zero.</p>
    {source ? <p><a href={source.sourceUrl} target="_blank" rel="noreferrer">Open published pricing source</a></p> : <p>Pricing source: <strong>Unavailable</strong></p>}
    <section aria-labelledby="calculator-assumptions-heading">
      <h2 id="calculator-assumptions-heading">Calculation assumptions</h2>
      <ul>{lineItems.filter((row) => row.kind === 'assumption').map((row) => <li key={row.label}>{row.assumption}</li>)}</ul>
      <p>Calculation timestamp: {snapshot.calculationTimestamp}</p>
    </section>
    <div className="calculator-audit-actions">
      <a className="button button-secondary" download="tokenbench-cost-scenario.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`} onClick={() => trackTokenBenchEvent('cost_csv_exported', { route: '/cost/calculator/' })}>Download CSV audit rows</a>
      <button className="button button-secondary" type="button" onClick={() => {
        trackTokenBenchEvent('cost_printed', { route: '/cost/calculator/' });
        window.print();
      }}>Print scenario</button>
    </div>
  </section>;
}

function evidenceStatusLabel(plan: PlanOffer): string {
  if (plan.entitlementEvidence.status === 'stale') return 'Stale evidence';
  if (plan.entitlementEvidence.status === 'projected') return `Projected ${plan.entitlementEvidence.boundType.replace('_', ' ')}`;
  if (plan.entitlementEvidence.status === 'dynamic_unknown') return 'Dynamic or unknown evidence';
  return 'Verified evidence';
}

function ValueSummary({ selectedPlan, snapshot, catalog }: Pick<ResultsDashboardProps, 'selectedPlan' | 'snapshot' | 'catalog'>) {
  const comparison = snapshot.comparison;
  const recommendation = recommendationForSnapshot(selectedPlan, snapshot);
  const difference = comparison?.differenceMicroDollars ?? null;
  const mappingSource = snapshot.apiMapping.defaultOffer && catalog
    ? catalog.provenance.find((item) => item.id === snapshot.apiMapping.defaultOffer?.sourceId)
    : undefined;

  return (
    <article className="value-summary-card">
      <p className="result-recommendation">{recommendation}</p>
      <dl className="value-summary-main">
        <Metric label="API-equivalent monthly cost" value={formatCurrencyMicroDollars(snapshot.apiEquivalentValueMicroDollars)} detail="Directional input and output rates for this message-level workload." />
        <Metric label="Subscription monthly fee" value={selectedPlan ? formatCurrencyMicroDollars(selectedPlan.monthlyCostMicroDollars) : 'No plan selected'} detail={selectedPlan?.displayName ?? 'Select a paid individual plan to compare.'} />
        <Metric label="Monthly messages" value={snapshot.derivedWorkload.monthlyMessages.toLocaleString()} detail={`${snapshot.derivedWorkload.monthlyInputTokens.toLocaleString()} input tokens · ${snapshot.derivedWorkload.monthlyOutputTokens.toLocaleString()} output tokens`} />
        <Metric label="Monthly difference" value={difference === null ? 'Unavailable' : formatCurrencyMicroDollars(difference)} detail="API-equivalent cost minus subscription fee." />
      </dl>
      <dl className="value-summary-footer">
        <div>
          <dt>Breakeven messages per day</dt>
          <dd>{comparison?.breakEvenMessagesPerDay === null || comparison?.breakEvenMessagesPerDay === undefined ? 'Unavailable' : `${comparison.breakEvenMessagesPerDay.toLocaleString()} messages/day`}</dd>
        </div>
        <div>
          <dt>Breakeven monthly tokens</dt>
          <dd>{snapshot.breakEvenTokens === null || snapshot.breakEvenTokens === undefined ? 'Unavailable' : formatTokens(snapshot.breakEvenTokens)}</dd>
        </div>
        <div>
          <dt>Efficiency</dt>
          <dd>{comparison?.efficiencyBasisPoints === null || comparison?.efficiencyBasisPoints === undefined
            ? 'Unavailable'
            : formatSignedPercentBasisPoints(comparison.efficiencyBasisPoints)}</dd>
        </div>
      </dl>
      <div className="value-summary-notes">
        <section>
          <h3>API mapping</h3>
          <p><strong>{snapshot.apiMapping.mode === 'default' ? 'Deterministic default' : 'Advanced override'}</strong></p>
          <p>{snapshot.apiMapping.defaultOffer ? `${snapshot.apiMapping.defaultOffer.displayName} · ${snapshot.apiMapping.defaultOffer.route}` : 'No direct provider API offer is published for the selected plan.'}</p>
          {mappingSource ? <p><a href={mappingSource.sourceUrl} target="_blank" rel="noreferrer">Open API pricing source</a></p> : null}
        </section>
        <section>
          <h3>Catalog and calculation</h3>
          <p>Catalog freshness: {snapshot.catalogFreshness?.status ?? 'Not published'}</p>
          <p>Calculation timestamp: {snapshot.calculationTimestamp}</p>
        </section>
        <section>
          <h3>Capacity evidence</h3>
          <p><strong>{snapshot.capacityEvidence.status === 'verified-covered' ? 'Verified covered' : snapshot.capacityEvidence.status === 'verified-not-covered' ? 'Verified not covered' : snapshot.capacityEvidence.status === 'projected' ? 'Projected' : 'Not independently verified'}</strong></p>
          {selectedPlan ? <p>{evidenceStatusLabel(selectedPlan)}</p> : null}
          <p>{snapshot.capacityEvidence.explanation}</p>
          {selectedPlan?.entitlementEvidence.projection ? <>
            <p><strong>Formula:</strong> {selectedPlan.entitlementEvidence.projection.formula}</p>
            <h4>Projection assumptions</h4>
            <ul>{selectedPlan.entitlementEvidence.projection.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul>
            <h4>Projection caveats</h4>
            <ul>{selectedPlan.entitlementEvidence.projection.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}</ul>
          </> : null}
          {selectedPlan ? <p><a href={selectedPlan.entitlementEvidence.source.url} target="_blank" rel="noreferrer">Open entitlement source</a></p> : null}
        </section>
      </div>
    </article>
  );
}

export function ResultsDashboard({ selectedPlan, snapshot, hasAvailableModels, catalog }: ResultsDashboardProps) {
  return (
    <section id="calculator-result" className="results-panel" aria-label="Calculated plan value" tabIndex={-1}>
      <header className="calculator-step-heading"><span>Step 4</span><h2>Review the recommendation</h2></header>
      {snapshot.selectedOffers.length === 0 || !snapshot.apiEquivalentCost ? (
        hasAvailableModels
          ? <EmptyState title="Select a verified model" description="Choose one or more models to calculate API-equivalent value, cost difference, breakeven, and efficiency." />
          : <EmptyState title="No verified models are available for this provider" description="Choose another provider or retry catalog refresh." />
      ) : <>
        <div className="results-grid">
          <ValueSummary selectedPlan={selectedPlan} snapshot={snapshot} catalog={catalog} />
          <article className="trend-panel">
            <div className="trend-heading">
              <div>
                <h3>{UI_COPY.valueTrendAnalysis}</h3>
                <p>API-equivalent value vs total monthly tokens</p>
              </div>
              <TrendingUp aria-hidden="true" size={21} />
            </div>
            <TrendChart snapshot={snapshot} />
          </article>
        </div>
        <AuditLedger snapshot={snapshot} catalog={catalog} />
        <button className="button button-secondary" type="button" onClick={() => trackTokenBenchEvent('cost_simulated', { route: '/cost/calculator/' })}>Update simulation</button>
        <EditorialCta eligible route="/cost/calculator/" precedingAction="scenario" subjectId={snapshot.apiMapping.selectedOffers[0]?.id} />
      </>}
      {snapshot.monthlyTokens > 20_000_000 ? (
        <aside className="panel agency-routing-notice" role="status" aria-label="High-volume optimization guidance">
          <strong>High-volume optimization guidance</strong>
          <p>At this volume, custom model routing, prompt caching, and agent pipelines may materially reduce spend.</p>
          <a className="button" href="https://monomind.one/">Talk to MonoMind</a>
        </aside>
      ) : null}
    </section>
  );
}

export function selectedPlanForProvider(plans: PlanOffer[], providerId: string, planId: string): PlanOffer | undefined {
  return plans.find((plan) => plan.providerId === providerId && plan.id === planId && isPaidIndividualPlan(plan));
}

export function selectedOffersForProvider(offers: ModelOffer[], providerId: string, selectedIds: string[]): ModelOffer[] {
  return offers.filter((offer) => offer.providerId === providerId && selectedIds.includes(offer.id));
}
