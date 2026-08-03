import type { ModelOffer, PlanOffer } from '../catalog/contracts';
import { formatCurrencyMicroDollars, formatTokens, type CalculatorSnapshot } from './calculator-state';
import type { ResultsDashboardProps } from './types';
import { EmptyState, SectionCard } from './ui';

function Metric({ label, value, detail, accent = false }: { label: string; value: string; detail?: string; accent?: boolean }) {
  return <div className={`metric ${accent ? 'metric-accent' : ''}`}><h3 className="metric-label">{label}</h3><strong>{value}</strong>{detail ? <small>{detail}</small> : null}</div>;
}

function TrendChart({ snapshot }: { snapshot: CalculatorSnapshot }) {
  const maxValue = Math.max(...snapshot.chartPoints.map((point) => point.valueMicroDollars), snapshot.apiEquivalentValueMicroDollars, 1);
  return (
    <div className="trend-chart-wrap">
      <div className="chart-axis" aria-hidden="true"><span>{formatCurrencyMicroDollars(maxValue)}</span><span>{formatCurrencyMicroDollars(Math.round(maxValue / 2))}</span><span>$0</span></div>
      <div className="trend-chart" role="img" aria-label="API-equivalent value trend">
        {snapshot.chartPoints.map((point) => (
          <div className="chart-column" key={point.tokens} data-testid="chart-point">
            <div className="chart-bar" style={{ height: `${Math.max(point.valueMicroDollars > 0 ? 4 : 0, (point.valueMicroDollars / maxValue) * 100)}%` }} title={`${formatTokens(point.tokens)}: ${formatCurrencyMicroDollars(point.valueMicroDollars)}`} />
            <span>{formatTokens(point.tokens)}</span>
          </div>
        ))}
        {snapshot.breakEvenTokens !== null ? <div className="break-even-marker" style={{ left: `${Math.min(100, Math.max(0, (snapshot.breakEvenTokens / Math.max(snapshot.chartPoints.at(-1)?.tokens ?? snapshot.breakEvenTokens, 1)) * 100))}%` }}><span>Break-even</span></div> : null}
      </div>
    </div>
  );
}

export function ResultsDashboard({ selectedPlan, snapshot }: ResultsDashboardProps) {
  return (
    <SectionCard className="results-panel" title="Results dashboard" description="Every metric is recalculated from the current catalog selection and workload.">
      {snapshot.selectedOffers.length === 0 ? (
        <EmptyState title="Select a verified model" description="Choose one or more models to calculate API-equivalent value, break-even, and the usage trend." />
      ) : (
        <div className="results-content">
          <div className="metrics-grid">
            <Metric label="API-equivalent value" value={formatCurrencyMicroDollars(snapshot.apiEquivalentValueMicroDollars)} detail="at expected monthly usage" accent />
            <Metric label="Blended cost / 1M tokens" value={formatCurrencyMicroDollars(snapshot.costPerMillionMicroDollars)} detail="input/output mix weighted" />
            <Metric label="Break-even" value={formatTokens(snapshot.breakEvenTokens)} detail={selectedPlan ? `against ${selectedPlan.displayName}` : 'Select a plan to compare'} />
            <Metric label="Maximum plan value" value={formatCurrencyMicroDollars(snapshot.maximumPlanValueMicroDollars)} detail={selectedPlan?.entitlement.kind === 'fixed_tokens' ? 'fixed entitlement only' : 'variable limit; not calculated'} />
          </div>
          <div className="trend-panel">
            <div className="panel-heading"><div><h3>Value trend analysis</h3><p>API-equivalent value derived from expected monthly tokens.</p></div></div>
            <TrendChart snapshot={snapshot} />
          </div>
        </div>
      )}
    </SectionCard>
  );
}

export function selectedPlanForProvider(plans: PlanOffer[], providerId: string, planId: string): PlanOffer | undefined {
  return plans.find((plan) => plan.providerId === providerId && plan.id === planId);
}

export function selectedOffersForProvider(offers: ModelOffer[], providerId: string, selectedIds: string[]): ModelOffer[] {
  return offers.filter((offer) => offer.providerId === providerId && selectedIds.includes(offer.id));
}
