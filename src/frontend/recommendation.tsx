import type { CatalogResponse, PlanOffer } from '../catalog/contracts';
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

export function Recommendation({ catalog, providerId }: { catalog: CatalogResponse; providerId: string }) {
  const plans = catalog.plans.filter((plan) => plan.providerId === providerId);
  const recommendation = recommendCostFirst(plans.map((plan) => ({ id: plan.id, monthlyCostMicroDollars: plan.monthlyCostMicroDollars, entitlement: plan.entitlement })));
  const plan = plans.find((candidate) => candidate.id === recommendation.recommendedPlanId);
  const caveats = [...recommendation.caveats, ...collectCaveats(catalog, plan)].filter((caveat, index, all) => all.indexOf(caveat) === index);

  return (
    <SectionCard className="recommendation-panel" title="Cost-first recommendation" description="The lowest verified monthly fee is surfaced first; entitlement limitations remain visible.">
      {!plan ? <div className="empty-state"><strong>No recommendation yet</strong><p>There are no verified subscription plans for {providerLabel(providerId)} in the current catalog.</p></div> : <div className="recommendation-content">
        <div className="recommendation-lead"><span className="recommendation-kicker">Recommended for {providerLabel(providerId)}</span><h3>{plan.displayName}</h3><strong>{formatCurrencyMicroDollars(plan.monthlyCostMicroDollars)}<small> / month</small></strong><p>{plan.entitlement.kind === 'fixed_tokens' ? `Published entitlement: ${formatTokens(plan.entitlement.monthlyTokens)} tokens/month.` : 'Published access is variable; use the provider evidence link to confirm current limits.'}</p></div>
        <div className="recommendation-evidence"><ConfidenceLabel catalog={catalog} sourceId={plan.sourceId} /><EvidenceLink catalog={catalog} sourceId={plan.sourceId} /><ul>{caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}</ul></div>
      </div>}
    </SectionCard>
  );
}
