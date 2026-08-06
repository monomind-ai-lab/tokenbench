import { CircleDollarSign, TrendingUp, WalletCards } from 'lucide-react';
import { recommendCostFirst } from '../catalog/calculator';
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
  readonly showBreakEven: boolean;
}

interface ResultRecommendation {
  readonly copy: string;
  readonly unavailableFacts: readonly string[];
  readonly comparisonAvailable: boolean;
}

function resultRecommendation(selectedPlan: PlanOffer | undefined, snapshot: CalculatorSnapshot): ResultRecommendation {
  if (!selectedPlan) {
    return {
      copy: 'Choose a subscription with published capacity before comparing it with pay as you go.',
      unavailableFacts: ['No subscription plan is selected.'],
      comparisonAvailable: false,
    };
  }
  if (snapshot.selectedOffers.length === 0 || snapshot.estimatedMonthlySavingsMicroDollars === null) {
    return {
      copy: 'Unable to compare this subscription with pay as you go until you select a complete model mix.',
      unavailableFacts: ['A complete selected-model mix is required to calculate an API-equivalent cost.'],
      comparisonAvailable: false,
    };
  }

  const eligibility = recommendCostFirst(
    [selectedPlan],
    snapshot.monthlyApiCostMicroDollars,
    snapshot.monthlyTokens,
    [...new Set(snapshot.selectedOffers.map((offer) => offer.modelId))],
  );
  const savings = snapshot.estimatedMonthlySavingsMicroDollars;
  if (eligibility.caveats.length > 0) {
    return {
      copy: 'Unable to compare this subscription with pay as you go because its published entitlement does not verify this workload.',
      unavailableFacts: eligibility.caveats,
      comparisonAvailable: false,
    };
  }
  if (savings > 0 && eligibility.kind === 'subscription') {
    return {
      copy: `Subscription is cheaper for this workload: ${selectedPlan.displayName} is ${formatCurrencyMicroDollars(savings)} below the API-equivalent cost.`,
      unavailableFacts: [],
      comparisonAvailable: true,
    };
  }
  if (savings === 0) {
    return {
      copy: 'Subscription and pay as you go cost the same for this workload.',
      unavailableFacts: [],
      comparisonAvailable: true,
    };
  }
  return {
    copy: `Pay as you go is cheaper for this workload: it is ${formatCurrencyMicroDollars(Math.abs(savings))} below the subscription price.`,
    unavailableFacts: [],
    comparisonAvailable: true,
  };
}

export function recommendationForResult(selectedPlan: PlanOffer | undefined, snapshot: CalculatorSnapshot): string {
  return resultRecommendation(selectedPlan, snapshot).copy;
}

function TrendChart({ snapshot, showBreakEven }: TrendChartProps) {
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
      <div
        className="trend-chart"
        role="img"
        aria-label={`API-equivalent value trend by expected monthly tokens. Current mix: ${formatTokens(snapshot.monthlyTokens)} tokens and ${formatCurrencyMicroDollars(snapshot.apiEquivalentValueMicroDollars)} API-equivalent value.`}
      >
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
        {showBreakEven && snapshot.breakEvenTokens !== null ? (
          <div className="break-even-marker" style={{ left: `${Math.min(100, Math.max(0, (snapshot.breakEvenTokens / lastTokens) * 100))}%` }}>
            <span>Breakeven: {formatTokens(snapshot.breakEvenTokens)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ValueSummary({ selectedPlan, snapshot, recommendation }: ResultsDashboardProps & { readonly recommendation: ResultRecommendation }) {
  const savings = recommendation.comparisonAvailable ? snapshot.estimatedMonthlySavingsMicroDollars : null;
  const savingsTone = savings === null || savings === 0 ? 'neutral' : savings > 0 ? 'positive' : 'negative';

  return (
    <article className="value-summary-card">
      <p className="result-recommendation">{recommendation.copy}</p>
      <div className="value-summary-main">
        <div className="value-metric value-subscription-price">
          <h3>Subscription price</h3>
          <strong>{selectedPlan ? formatCurrencyMicroDollars(selectedPlan.monthlyCostMicroDollars) : 'No plan selected'}</strong>
          <span>{selectedPlan ? `${selectedPlan.displayName} per month` : 'Select a plan with published capacity to compare it.'}</span>
        </div>
        <div className="value-metric">
          <h3><CircleDollarSign aria-hidden="true" size={19} />{UI_COPY.apiEquivalentValue}</h3>
          <strong>{formatCurrencyMicroDollars(snapshot.apiEquivalentValueMicroDollars)}</strong>
          <span>Total market value at expected usage</span>
        </div>
        <div className="value-metric value-savings">
          <h3><WalletCards aria-hidden="true" size={19} />{recommendation.comparisonAvailable ? UI_COPY.estimatedMonthlySavings : 'Estimated difference'}</h3>
          <strong data-savings-tone={savingsTone}>{recommendation.comparisonAvailable ? formatCurrencyMicroDollars(savings) : 'Unavailable'}</strong>
          <span>{recommendation.comparisonAvailable && selectedPlan ? `Difference: API value minus ${selectedPlan.displayName}` : 'Difference unavailable because this plan is not comparable to the selected workload.'}</span>
        </div>
      </div>
      <div className="value-summary-footer">
        <div>
          <span>Breakeven point</span>
          <strong>{recommendation.comparisonAvailable ? <>{formatTokens(snapshot.breakEvenTokens)}{snapshot.breakEvenTokens !== null ? ' tokens' : ''}</> : 'Unavailable'}</strong>
        </div>
        <div>
          <span>Efficiency</span>
          <strong>{recommendation.comparisonAvailable ? formatSignedPercentBasisPoints(snapshot.efficiencyBasisPoints) : 'Unavailable'}</strong>
        </div>
      </div>
      <div className="value-summary-notes">
        <section>
          <h3>Assumptions</h3>
          <p>API-equivalent cost uses the selected model mix, your input/output split, and monthly token volume. It does not invent capacity that a provider has not published.</p>
        </section>
        <section>
          <h3>Unavailable facts</h3>
          {recommendation.unavailableFacts.length > 0 ? <ul>{recommendation.unavailableFacts.map((fact) => <li key={fact}>{fact}</li>)}</ul> : <p>Published plan capacity and selected-model support are available for this workload.</p>}
        </section>
      </div>
    </article>
  );
}

export function ResultsDashboard({ selectedPlan, snapshot }: ResultsDashboardProps) {
  const recommendation = resultRecommendation(selectedPlan, snapshot);

  return (
    <section id="calculator-result" className="results-panel" aria-label="Calculated plan value" tabIndex={-1}>
      <header className="calculator-step-heading"><span>Step 4</span><h2>Review the recommendation</h2></header>
      {snapshot.selectedOffers.length === 0 ? (
        <EmptyState title="Select a verified model" description="Choose one or more models to calculate API-equivalent value, savings, breakeven, and the usage trend." />
      ) : (
        <div className="results-grid">
          <ValueSummary selectedPlan={selectedPlan} snapshot={snapshot} recommendation={recommendation} />
          <article className="trend-panel">
            <div className="trend-heading">
              <div>
                <h3>{UI_COPY.valueTrendAnalysis}</h3>
                <p>API Equivalent Value ($) vs Est. Monthly Tokens</p>
              </div>
              <TrendingUp aria-hidden="true" size={21} />
            </div>
            <TrendChart snapshot={snapshot} showBreakEven={recommendation.comparisonAvailable} />
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
