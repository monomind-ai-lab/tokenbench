import { CircleDollarSign, TrendingUp, WalletCards } from 'lucide-react';
import type { ModelOffer, PlanOffer } from '../catalog/contracts';
import { UI_COPY } from '../data/mockData';
import {
  formatCurrencyMicroDollars,
  formatSignedPercentBasisPoints,
  formatTokens,
  type CalculatorSnapshot,
} from './calculator-state';
import { isPaidIndividualPlan } from './plan-filter';
import type { ResultsDashboardProps } from './types';
import { EmptyState } from './ui';

interface TrendChartProps {
  readonly snapshot: CalculatorSnapshot;
}

function TrendChart({ snapshot }: TrendChartProps) {
  const maxValue = Math.max(...snapshot.chartPoints.map((point) => point.valueMicroDollars), snapshot.apiEquivalentValueMicroDollars, 1);
  const lastTokens = Math.max(snapshot.chartPoints.at(-1)?.tokens ?? snapshot.breakEvenTokens ?? 1, 1);

  return (
    <div className="trend-chart-wrap">
      <div className="chart-axis" aria-hidden="true">
        <span>{formatCurrencyMicroDollars(maxValue)}</span>
        <span>{formatCurrencyMicroDollars(Math.round(maxValue * 0.75))}</span>
        <span>{formatCurrencyMicroDollars(Math.round(maxValue / 2))}</span>
        <span>{formatCurrencyMicroDollars(Math.round(maxValue * 0.25))}</span>
        <span>$0</span>
      </div>
      <div className="trend-chart" role="img" aria-label="API-equivalent value trend by expected monthly tokens">
        {snapshot.chartPoints.map((point, index) => (
          <div className={`chart-column ${index === 3 ? 'chart-column-current' : ''}`} key={`${point.tokens}-${index}`} data-testid="chart-point">
            {index === 3 ? <span className="current-mix-label">Current mix</span> : null}
            <div
              className="chart-bar"
              style={{ height: `${Math.max(point.valueMicroDollars > 0 ? 4 : 0, (point.valueMicroDollars / maxValue) * 100)}%` }}
              title={`${formatTokens(point.tokens)}: ${formatCurrencyMicroDollars(point.valueMicroDollars)}`}
            />
            <span>{formatTokens(point.tokens)}</span>
          </div>
        ))}
        {snapshot.breakEvenTokens !== null ? (
          <div className="break-even-marker" style={{ left: `${Math.min(100, Math.max(0, (snapshot.breakEvenTokens / lastTokens) * 100))}%` }}>
            <span>Breakeven: {formatTokens(snapshot.breakEvenTokens)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ValueSummary({ selectedPlan, snapshot }: ResultsDashboardProps) {
  const savings = snapshot.estimatedMonthlySavingsMicroDollars;
  const savingsTone = savings === null || savings === 0 ? 'neutral' : savings > 0 ? 'positive' : 'negative';

  return (
    <article className="value-summary-card">
      <div className="value-summary-main">
        <div className="value-metric">
          <h2><CircleDollarSign aria-hidden="true" size={19} />{UI_COPY.apiEquivalentValue}</h2>
          <strong>{formatCurrencyMicroDollars(snapshot.apiEquivalentValueMicroDollars)}</strong>
          <span>Total market value at expected usage</span>
        </div>
        <div className="value-metric value-savings">
          <h2><WalletCards aria-hidden="true" size={19} />{UI_COPY.estimatedMonthlySavings}</h2>
          <strong data-savings-tone={savingsTone}>{formatCurrencyMicroDollars(savings)}</strong>
          <span>{selectedPlan ? `API value minus ${selectedPlan.displayName}` : 'Select a plan to compare'}</span>
        </div>
      </div>
      <div className="value-summary-footer">
        <div>
          <span>Breakeven point</span>
          <strong>{formatTokens(snapshot.breakEvenTokens)}{snapshot.breakEvenTokens !== null ? ' tokens' : ''}</strong>
        </div>
        <div>
          <span>Efficiency</span>
          <strong>{formatSignedPercentBasisPoints(snapshot.efficiencyBasisPoints)}</strong>
        </div>
      </div>
    </article>
  );
}

export function ResultsDashboard({ selectedPlan, snapshot }: ResultsDashboardProps) {
  return (
    <section className="results-panel" aria-label="Calculated plan value">
      {snapshot.selectedOffers.length === 0 ? (
        <EmptyState title="Select a verified model" description="Choose one or more models to calculate API-equivalent value, savings, breakeven, and the usage trend." />
      ) : (
        <div className="results-grid">
          <ValueSummary selectedPlan={selectedPlan} snapshot={snapshot} />
          <article className="trend-panel">
            <div className="trend-heading">
              <div>
                <h2>{UI_COPY.valueTrendAnalysis}</h2>
                <p>API Equivalent Value ($) vs Est. Monthly Tokens</p>
              </div>
              <TrendingUp aria-hidden="true" size={21} />
            </div>
            <TrendChart snapshot={snapshot} />
          </article>
        </div>
      )}
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
