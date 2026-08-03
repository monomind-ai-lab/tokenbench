import type { CatalogResponse, PlanOffer } from '../catalog/contracts';
import type { CalculatorSnapshot } from './calculator-state';
import { formatCurrencyMicroDollars, formatTokens } from './calculator-state';
import { recommendCostFirst } from '../catalog/calculator';
import { ConfidenceLabel, EvidenceLink, SectionCard, providerLabel } from './ui';

function collectCaveats(catalog: CatalogResponse, plan: PlanOffer | undefined): string[] {
  const caveats: string[] = [];
  if (catalog.freshness.status === 'stale') caveats.push('Catalog data is stale; verify current pricing and limits before acting.');
  if (catalog.freshness.status === 'bootstrap') caveats.push('This is verified bootstrap data; live ingestion has not published a revision yet.');
  if (plan) {
    const source = catalog.provenance.find((item) => item.id === plan.sourceId);
    if (source?.confidence === 'manual_verified') caveats.push('This plan uses a manual-verified source; confirm the provider page before purchase.');
    if (plan.entitlement.kind !== 'fixed_tokens') caveats.push(`${plan.displayName} has variable access limits; maximum plan value is not calculated.`);
    if (plan.entitlement.kind !== 'fixed_tokens' && plan.entitlement.description) caveats.push(plan.entitlement.description);
  }
  return Array.from(new Set(caveats));
}

export function Recommendation({ catalog, providerId, snapshot }: { catalog: CatalogResponse; providerId: string; snapshot: CalculatorSnapshot }) {
  const plans = catalog.plans.filter((plan) => plan.providerId === providerId);
  const recommendation = recommendCostFirst(
    plans.map((plan) => ({ id: plan.id, monthlyCostMicroDollars: plan.monthlyCostMicroDollars, entitlement: plan.entitlement, supportedModelIds: plan.supportedModelIds })),
    snapshot.monthlyApiCostMicroDollars,
    snapshot.monthlyTokens,
    snapshot.selectedOffers.map((offer) => offer.modelId),
  );
  const plan = plans.find((candidate) => candidate.id === recommendation.recommendedPlanId);
  const routeCaveat = snapshot.selectedOffers.length ? `API estimate uses the selected ${snapshot.selectedOffers.map((offer) => offer.pricingBasis).filter((value, index, values) => values.indexOf(value) === index).join(', ')} route.` : 'Select a model route to calculate an API estimate.';
  const caveats = [...recommendation.caveats, ...collectCaveats(catalog, plan), routeCaveat].filter((caveat, index, all) => all.indexOf(caveat) === index);

  return (
    <SectionCard className="recommendation-panel" title="Cost-first recommendation" description="The lowest verified monthly fee is surfaced first; entitlement limitations remain visible.">
      <div className="recommendation-content">
        <div className="recommendation-lead"><span className="recommendation-kicker">{recommendation.kind === 'api' ? 'Recommended API route' : `Recommended for ${providerLabel(providerId)}`}</span><h3>{recommendation.kind === 'api' ? 'Pay-as-you-go API' : plan?.displayName}</h3><strong>{formatCurrencyMicroDollars(recommendation.expectedMonthlyCostMicroDollars)}<small> / month</small></strong><p>{recommendation.kind === 'api' ? 'This is the calculated current-workload API cost. Subscription access is shown separately because variable limits are not comparable.' : `Published entitlement: ${formatTokens(plan?.entitlement.kind === 'fixed_tokens' ? plan.entitlement.monthlyTokens : null)} tokens/month.`}</p></div>
        <div className="recommendation-evidence">{plan ? <><ConfidenceLabel catalog={catalog} sourceId={plan.sourceId} /><EvidenceLink catalog={catalog} sourceId={plan.sourceId} /></> : null}<ul>{caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}</ul></div>
      </div>
    </SectionCard>
  );
}
