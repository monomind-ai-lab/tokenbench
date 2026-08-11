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
  readonly coverageCopy: string;
  readonly unavailableFacts: readonly string[];
  readonly comparisonAvailable: boolean;
}

/**
 * Coverage copy names the actual published condition. Verified capacity is the
 * only state that may drive savings, breakeven, and efficiency; every other
 * state says what the provider did not publish rather than estimating it.
 */
const COVERAGE_COPY = {
  noPlan: 'No subscription plan is selected, so no published allowance can be checked.',
  incompleteMix: 'A complete selected-model mix is required before a published allowance can be checked.',
  unsupportedModel: 'The plan does not publish access to one or more selected models.',
  verified: 'The published allowance covers this workload under the selected model limits.',
  insufficient: 'The published allowance is below this workload.',
  credits: 'The plan includes credits. The provider does not publish a stable token conversion, so TokenBench cannot verify token coverage.',
  rolling: 'The provider publishes a rolling usage limit without a numeric monthly cap or reset schedule, so TokenBench cannot verify token coverage.',
  dynamicUnknown: 'The provider advertises higher limits but does not publish a numeric cap or reset schedule.',
  projected: 'Projected outer ceiling: this is a scenario derived from published limits, not a guaranteed allowance.',
  stale: 'Stale evidence: this plan cannot back a recommendation until its source facts are refreshed.',
} as const;

function supportsSelectedModels(plan: PlanOffer, snapshot: CalculatorSnapshot): boolean {
  const selectedModelIds = [...new Set(snapshot.selectedOffers.map((offer) => offer.modelId))];
  return plan.supportedModelIds?.length
    ? selectedModelIds.every((modelId) => plan.supportedModelIds?.includes(modelId))
    : false;
}

function coverageCopyFor(plan: PlanOffer, snapshot: CalculatorSnapshot): string {
  if (!supportsSelectedModels(plan, snapshot)) return COVERAGE_COPY.unsupportedModel;
  if (plan.entitlementEvidence.status === 'stale') {
    return `${COVERAGE_COPY.stale}${plan.entitlementEvidence.staleReason ? ` ${plan.entitlementEvidence.staleReason}` : ''}`;
  }
  if (plan.entitlementEvidence.status === 'projected') return COVERAGE_COPY.projected;
  if (plan.entitlementEvidence.status === 'dynamic_unknown') return COVERAGE_COPY.dynamicUnknown;
  const entitlement = plan.entitlement;
  if (entitlement.kind === 'fixed_tokens') {
    return entitlement.monthlyTokens >= snapshot.monthlyTokens ? COVERAGE_COPY.verified : COVERAGE_COPY.insufficient;
  }
  if (entitlement.kind === 'credits') return COVERAGE_COPY.credits;
  if (entitlement.kind === 'rolling_limit') return COVERAGE_COPY.rolling;
  return COVERAGE_COPY.dynamicUnknown;
}

function evidenceStatusLabel(plan: PlanOffer): string {
  if (plan.entitlementEvidence.status === 'stale') return 'Stale evidence';
  if (plan.entitlementEvidence.status === 'projected') {
    return `Projected ${plan.entitlementEvidence.boundType.replace('_', ' ')}`;
  }
  if (plan.entitlementEvidence.status === 'dynamic_unknown') return 'Dynamic or unknown evidence';
  return 'Verified evidence';
}

function resultRecommendation(selectedPlan: PlanOffer | undefined, snapshot: CalculatorSnapshot): ResultRecommendation {
  if (!selectedPlan) {
    return {
      copy: 'Choose a subscription with published capacity before comparing it with pay as you go.',
      coverageCopy: COVERAGE_COPY.noPlan,
      unavailableFacts: [COVERAGE_COPY.noPlan],
      comparisonAvailable: false,
    };
  }
  if (snapshot.selectedOffers.length === 0 || snapshot.estimatedMonthlySavingsMicroDollars === null) {
    return {
      copy: 'Unable to compare this subscription with pay as you go until you select a complete model mix.',
      coverageCopy: COVERAGE_COPY.incompleteMix,
      unavailableFacts: [COVERAGE_COPY.incompleteMix],
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
  const coverageCopy = coverageCopyFor(selectedPlan, snapshot);
  if (eligibility.caveats.length > 0) {
    return {
      copy: 'TokenBench can calculate the API-equivalent cost and subscription fee, but the published entitlement cannot verify coverage for this workload.',
      coverageCopy,
      unavailableFacts: [coverageCopy],
      comparisonAvailable: false,
    };
  }
  if (savings > 0 && eligibility.kind === 'subscription') {
    return {
      copy: `Subscription is cheaper for this workload: ${selectedPlan.displayName} is ${formatCurrencyMicroDollars(savings)} below the API-equivalent cost.`,
      coverageCopy,
      unavailableFacts: [],
      comparisonAvailable: true,
    };
  }
  if (savings === 0) {
    return {
      copy: 'Subscription and pay as you go cost the same for this workload.',
      coverageCopy,
      unavailableFacts: [],
      comparisonAvailable: true,
    };
  }
  return {
    copy: `Pay as you go is cheaper for this workload: it is ${formatCurrencyMicroDollars(Math.abs(savings))} below the subscription price.`,
    coverageCopy,
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

function ValueSummary({ selectedPlan, snapshot, recommendation }: Pick<ResultsDashboardProps, 'selectedPlan' | 'snapshot'> & { readonly recommendation: ResultRecommendation }) {
  const savings = recommendation.comparisonAvailable ? snapshot.estimatedMonthlySavingsMicroDollars : null;
  const savingsTone = savings === null || savings === 0 ? 'neutral' : savings > 0 ? 'positive' : 'negative';

  return (
    <article className="value-summary-card">
      <p className="result-recommendation">{recommendation.copy}</p>
      <div className="value-summary-main">
        <div className="value-metric">
          <h3><CircleDollarSign aria-hidden="true" size={19} />What does API usage cost?</h3>
          <strong>{formatCurrencyMicroDollars(snapshot.apiEquivalentValueMicroDollars)}</strong>
          <span>{UI_COPY.apiEquivalentValue} for the selected model mix and monthly workload.</span>
        </div>
        <div className="value-metric value-subscription-price">
          <h3>What does the subscription cost?</h3>
          <strong>{selectedPlan ? formatCurrencyMicroDollars(selectedPlan.monthlyCostMicroDollars) : 'No plan selected'}</strong>
          <span>{selectedPlan ? `${selectedPlan.displayName} per month` : 'Select a plan to compare its published fee.'}</span>
        </div>
        <div className="value-metric value-savings">
          <h3><WalletCards aria-hidden="true" size={19} />Can the plan cover this workload?</h3>
          <strong data-savings-tone={savingsTone}>{recommendation.comparisonAvailable ? formatCurrencyMicroDollars(savings) : 'Not verified'}</strong>
          <span>{recommendation.coverageCopy}</span>
          <span>{recommendation.comparisonAvailable && selectedPlan ? `${UI_COPY.estimatedMonthlySavings}: API cost minus ${selectedPlan.displayName}.` : 'Coverage-dependent savings, breakeven, and efficiency are withheld.'}</span>
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
          <h3>Coverage evidence</h3>
          {selectedPlan ? <>
            <p><strong>{evidenceStatusLabel(selectedPlan)}</strong></p>
            {recommendation.unavailableFacts.length > 0 ? <ul>{recommendation.unavailableFacts.map((fact) => <li key={fact}>{fact}</li>)}</ul> : <p>{recommendation.coverageCopy}</p>}
            {selectedPlan.entitlementEvidence.projection ? <>
              <p><strong>Formula:</strong> {selectedPlan.entitlementEvidence.projection.formula}</p>
              <h4>Projection assumptions</h4>
              <ul>{selectedPlan.entitlementEvidence.projection.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul>
              <h4>Projection caveats</h4>
              <ul>{selectedPlan.entitlementEvidence.projection.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}</ul>
            </> : null}
            <p><a href={selectedPlan.entitlementEvidence.source.url} target="_blank" rel="noreferrer">Open entitlement source</a></p>
          </> : <p>{recommendation.coverageCopy}</p>}
        </section>
      </div>
    </article>
  );
}

export function ResultsDashboard({ selectedPlan, snapshot, hasAvailableModels }: ResultsDashboardProps) {
  const recommendation = resultRecommendation(selectedPlan, snapshot);

  return (
    <section id="calculator-result" className="results-panel" aria-label="Calculated plan value" tabIndex={-1}>
      <header className="calculator-step-heading"><span>Step 4</span><h2>Review the recommendation</h2></header>
      {snapshot.selectedOffers.length === 0 ? (
        hasAvailableModels
          ? <EmptyState title="Select a verified model" description="Choose one or more models to calculate API-equivalent value, savings, breakeven, and the usage trend." />
          : <EmptyState title="No verified models are available for this provider" description="Choose another provider or retry catalog refresh." />
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
