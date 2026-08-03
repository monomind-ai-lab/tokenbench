import type { CatalogResponse, ModelOffer } from '../catalog/contracts';
import { basisKeys, basisLabel, entitlementLabel, formatCurrencyMicroDollars, formatTokens, groupOffersByBasis } from './calculator-state';
import { ConfidenceLabel, EmptyState, EvidenceLink, SectionCard, providerLabel } from './ui';

function OfferCells({ offer, catalog }: { offer: ModelOffer; catalog: CatalogResponse }) {
  return <>
    <td data-label="Model"><strong>{offer.displayName}</strong><small>{offer.modelId}</small></td>
    <td data-label="Input / 1M">{formatCurrencyMicroDollars(offer.inputMicroDollarsPerMillion)}</td>
    <td data-label="Output / 1M">{formatCurrencyMicroDollars(offer.outputMicroDollarsPerMillion)}</td>
    <td data-label="Confidence"><ConfidenceLabel catalog={catalog} sourceId={offer.sourceId} /></td>
    <td data-label="Evidence"><EvidenceLink catalog={catalog} sourceId={offer.sourceId} /></td>
  </>;
}

function ModelOfferComparison({ catalog, providerId }: { catalog: CatalogResponse; providerId: string }) {
  const offers = catalog.modelOffers.filter((offer) => offer.providerId === providerId);
  const grouped = groupOffersByBasis(offers);
  return (
    <div className="comparison-sections">
      {basisKeys().map((basis) => <BasisComparison key={basis} basis={basis} offers={grouped[basis]} catalog={catalog} />)}
    </div>
  );
}

function BasisComparison({ basis, offers, catalog }: { basis: ModelOffer['pricingBasis']; offers: ModelOffer[]; catalog: CatalogResponse; key?: string }) {
  return (
    <section className="comparison-group" data-identity={basis}>
      <div className="comparison-heading"><div><h3>{basisLabel(basis)}</h3><p>{offers.length ? `${offers.length} verified offer${offers.length === 1 ? '' : 's'}; pricing identity kept separate.` : 'No verified offers in the current catalog.'}</p></div></div>
      {offers.length === 0 ? <EmptyState title={`No ${basisLabel(basis)} offers`} description="This source has no verified record for the selected provider yet." /> : null}
      <table className="comparison-table">
        <caption>{basisLabel(basis)} model pricing</caption>
        <thead><tr><th scope="col">Model</th><th scope="col">Input / 1M</th><th scope="col">Output / 1M</th><th scope="col">Confidence</th><th scope="col">Evidence</th></tr></thead>
        <tbody>{offers.map((offer) => <tr key={offer.id}><OfferCells offer={offer} catalog={catalog} /></tr>)}</tbody>
      </table>
      <div className="comparison-cards">
        {offers.map((offer) => <article className="offer-card" data-testid="offer-card" key={offer.id}><h4>{offer.displayName}</h4><p>{offer.modelId}</p><dl><div><dt>Input / 1M</dt><dd>{formatCurrencyMicroDollars(offer.inputMicroDollarsPerMillion)}</dd></div><div><dt>Output / 1M</dt><dd>{formatCurrencyMicroDollars(offer.outputMicroDollarsPerMillion)}</dd></div></dl><div className="card-meta"><ConfidenceLabel catalog={catalog} sourceId={offer.sourceId} /><EvidenceLink catalog={catalog} sourceId={offer.sourceId} /></div></article>)}
      </div>
    </section>
  );
}

function PlanComparison({ catalog, providerId }: { catalog: CatalogResponse; providerId: string }) {
  const plans = catalog.plans.filter((plan) => plan.providerId === providerId);
  return (
    <section className="comparison-group plan-comparison">
      <div className="comparison-heading"><div><h3>{providerLabel(providerId)} plans</h3><p>Verified subscription identities and published entitlement caveats.</p></div></div>
      {plans.length === 0 ? <EmptyState title="No verified plans" description="This provider has no subscription offers in the current catalog." /> : null}
      <table className="comparison-table">
        <caption>{providerLabel(providerId)} subscription plans</caption>
        <thead><tr><th scope="col">Plan</th><th scope="col">Monthly fee</th><th scope="col">Entitlement</th><th scope="col">Confidence</th><th scope="col">Evidence</th></tr></thead>
        <tbody>{plans.map((plan) => <tr key={plan.id}><td data-label="Plan"><strong>{plan.displayName}</strong></td><td data-label="Monthly fee">{formatCurrencyMicroDollars(plan.monthlyCostMicroDollars)}</td><td data-label="Entitlement">{plan.entitlement.kind === 'fixed_tokens' ? formatTokens(plan.entitlement.monthlyTokens) : entitlementLabel(plan.entitlement)}</td><td data-label="Confidence"><ConfidenceLabel catalog={catalog} sourceId={plan.sourceId} /></td><td data-label="Evidence"><EvidenceLink catalog={catalog} sourceId={plan.sourceId} /></td></tr>)}</tbody>
      </table>
      <div className="comparison-cards">
        {plans.map((plan) => <article className="offer-card" data-testid="offer-card" key={plan.id}><h4>{plan.displayName}</h4><p>{formatCurrencyMicroDollars(plan.monthlyCostMicroDollars)} / month</p><p>{entitlementLabel(plan.entitlement)}</p><div className="card-meta"><ConfidenceLabel catalog={catalog} sourceId={plan.sourceId} /><EvidenceLink catalog={catalog} sourceId={plan.sourceId} /></div></article>)}
      </div>
    </section>
  );
}

export function Comparison({ catalog, selectedProviderId }: { catalog: CatalogResponse; selectedProviderId: string }) {
  return <SectionCard className="comparison-panel" title="Verified pricing comparison" description="Compare subscription plans with direct-provider, OpenRouter, and OpenCode Zen offers without merging their identities."><PlanComparison catalog={catalog} providerId={selectedProviderId} /><ModelOfferComparison catalog={catalog} providerId={selectedProviderId} /></SectionCard>;
}
