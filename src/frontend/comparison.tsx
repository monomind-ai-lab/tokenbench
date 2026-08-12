import { BadgeDollarSign, Layers3 } from 'lucide-react';
import type { CatalogResponse, ModelOffer, PlanOffer } from '../catalog/contracts';
import { defaultApiEquivalentForPlan } from '../catalog/plan-api-equivalent';
import { UI_COPY } from '../data/mockData';
import type { ConversationWorkload } from '../catalog/subscription-api-calculator';
import { basisKeys, basisLabel, buildCalculatorSnapshot, entitlementLabel, formatCurrencyMicroDollars, formatTokens, groupOffersByBasis, type CalculatorSnapshot } from './calculator-state';
import { paidIndividualPlans } from './plan-filter';
import { recommendationForResult } from './results-dashboard';
import { ConfidenceLabel, EmptyState, EvidenceLink, SectionCard, providerLabel } from './ui';

interface ComparisonProps {
  readonly catalog: CatalogResponse;
  readonly selectedProviderId: string;
  readonly selectedModelIds: string[];
  readonly selectedPlanId: string;
  readonly workload: ConversationWorkload;
  readonly modelMixBasisPoints: Record<string, number>;
}

interface OfferProps {
  readonly offer: ModelOffer;
  readonly catalog: CatalogResponse;
  readonly selected: boolean;
}

interface BasisComparisonProps {
  readonly key?: string;
  readonly basis: ModelOffer['pricingBasis'];
  readonly offers: ModelOffer[];
  readonly catalog: CatalogResponse;
  readonly selectedModelIds: ReadonlySet<string>;
}

function SelectedBadge() {
  return <span className="selected-badge">Selected</span>;
}

function OfferCells({ offer, catalog, selected }: OfferProps) {
  return <>
    <td data-label="Model">
      <span className="offer-title-line"><strong>{offer.displayName}</strong>{selected ? <SelectedBadge /> : null}</span>
      <small>{offer.modelId}</small>
    </td>
    <td data-label="Input / 1M"><strong>{formatCurrencyMicroDollars(offer.inputMicroDollarsPerMillion)}</strong></td>
    <td data-label="Output / 1M"><strong>{formatCurrencyMicroDollars(offer.outputMicroDollarsPerMillion)}</strong></td>
    <td data-label="Confidence"><ConfidenceLabel catalog={catalog} sourceId={offer.sourceId} /></td>
    <td data-label="Evidence"><EvidenceLink catalog={catalog} sourceId={offer.sourceId} /></td>
  </>;
}

function BasisComparison({ basis, offers, catalog, selectedModelIds }: BasisComparisonProps) {
  return (
    <section className="comparison-group" data-identity={basis}>
      <div className="comparison-heading">
        <div>
          <h3>{basisLabel(basis)}</h3>
          <p>{offers.length ? `${offers.length} verified offer${offers.length === 1 ? '' : 's'} · pricing identity kept separate` : 'No verified offers in the current catalog.'}</p>
        </div>
      </div>
      {offers.length === 0 ? <EmptyState title={`No ${basisLabel(basis)} offers`} description="This source has no verified record for the selected provider yet." /> : (
        <>
          <div className="comparison-table-wrap">
            <table className="comparison-table api-price-table">
              <caption>{basisLabel(basis)} model pricing</caption>
              <thead><tr><th scope="col">Model</th><th scope="col">Input / 1M</th><th scope="col">Output / 1M</th><th scope="col">Confidence</th><th scope="col">Evidence</th></tr></thead>
              <tbody>{offers.map((offer) => {
                const selected = selectedModelIds.has(offer.id);
                return <tr className={selected ? 'offer-selected' : undefined} data-selected={selected ? 'true' : 'false'} key={offer.id}><OfferCells offer={offer} catalog={catalog} selected={selected} /></tr>;
              })}</tbody>
            </table>
          </div>
          <div className="comparison-cards">
            {offers.map((offer) => {
              const selected = selectedModelIds.has(offer.id);
              return (
                <article className={`offer-card ${selected ? 'offer-selected' : ''}`} data-selected={selected ? 'true' : 'false'} data-testid="offer-card" key={offer.id}>
                  <div className="offer-card-heading"><h4>{offer.displayName}</h4>{selected ? <SelectedBadge /> : null}</div>
                  <p>{offer.modelId} · Availability: {offer.availability ?? 'not published'}</p>
                  <dl><div><dt>Input / 1M</dt><dd>{formatCurrencyMicroDollars(offer.inputMicroDollarsPerMillion)}</dd></div><div><dt>Output / 1M</dt><dd>{formatCurrencyMicroDollars(offer.outputMicroDollarsPerMillion)}</dd></div></dl>
                  <div className="card-meta"><ConfidenceLabel catalog={catalog} sourceId={offer.sourceId} /><EvidenceLink catalog={catalog} sourceId={offer.sourceId} /></div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function ModelOfferComparison({ catalog, providerId, selectedModelIds }: {
  readonly catalog: CatalogResponse;
  readonly providerId: string;
  readonly selectedModelIds: string[];
}) {
  const offers = catalog.modelOffers.filter((offer) => offer.providerId === providerId);
  const grouped = groupOffersByBasis(offers);
  const selectedIds = new Set(selectedModelIds);
  return <div className="comparison-sections">{basisKeys().map((basis) => <BasisComparison key={basis} basis={basis} offers={grouped[basis]} catalog={catalog} selectedModelIds={selectedIds} />)}</div>;
}

function planCapacityLabel(snapshot: CalculatorSnapshot): string {
  switch (snapshot.capacityEvidence.status) {
    case 'verified-covered': return 'Verified covered';
    case 'verified-not-covered': return 'Verified not covered';
    case 'projected': return 'Projected';
    case 'not-verified': return 'Not independently verified';
  }
}

function SameWorkloadPlanComparison({ plans, catalog, workload }: {
  readonly plans: readonly PlanOffer[];
  readonly catalog: CatalogResponse;
  readonly workload: ConversationWorkload;
}) {
  return (
    <div className="same-workload-comparison">
      <h3>Same-workload plan comparison</h3>
      <div className="comparison-table-wrap">
        <table className="comparison-table same-workload-table">
          <caption>Same-workload plan comparison</caption>
          <thead><tr><th scope="col">Plan</th><th scope="col">API-equivalent monthly cost</th><th scope="col">Plan fee</th><th scope="col">Recommendation</th><th scope="col">Capacity evidence</th></tr></thead>
          <tbody>{plans.map((plan) => {
            const defaultOffer = defaultApiEquivalentForPlan(plan, catalog.modelOffers);
            const snapshot = defaultOffer
              ? buildCalculatorSnapshot({
                modelOffers: [defaultOffer],
                selectedModelIds: [defaultOffer.id],
                modelMixBasisPoints: { [defaultOffer.id]: 10_000 },
                workload,
                mappingMode: 'default',
                selectedPlan: plan,
              })
              : null;
            return (
              <tr className={plan.id === plans[0]?.id ? 'offer-selected' : undefined} key={plan.id}>
                <th scope="row">{plan.displayName}</th>
                <td>{snapshot?.apiEquivalentCost ? formatCurrencyMicroDollars(snapshot.apiEquivalentCost.apiCostMicroDollars) : 'Unavailable'}</td>
                <td>{formatCurrencyMicroDollars(plan.monthlyCostMicroDollars)}</td>
                <td>{snapshot ? recommendationForResult(plan, snapshot) : 'Unavailable'}</td>
                <td>{snapshot ? planCapacityLabel(snapshot) : 'Not independently verified'}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </div>
  );
}

function PlanComparison({ catalog, providerId, selectedPlanId, workload, modelMixBasisPoints }: {
  readonly catalog: CatalogResponse;
  readonly providerId: string;
  readonly selectedPlanId: string;
  readonly workload: ConversationWorkload;
  readonly modelMixBasisPoints: Record<string, number>;
}) {
  const plans = paidIndividualPlans(catalog.plans, providerId);
  return (
    <div className="comparison-group plan-comparison">
      {plans.length === 0 ? <EmptyState title="No verified individual plans" description="This provider has no paid individual subscription in the current catalog." /> : (
        <>
          <div className="comparison-table-wrap">
            <table className="comparison-table plan-price-table">
              <caption>{providerLabel(providerId)} paid individual subscription plans</caption>
              <thead><tr><th scope="col">Plan</th><th scope="col">Monthly fee</th><th scope="col">Entitlement</th><th scope="col">Confidence</th><th scope="col">Evidence</th></tr></thead>
              <tbody>{plans.map((plan) => {
                const selected = plan.id === selectedPlanId;
                return <tr className={selected ? 'offer-selected' : undefined} data-selected={selected ? 'true' : 'false'} key={plan.id}><td data-label="Plan"><span className="offer-title-line"><strong>{plan.displayName}</strong>{selected ? <SelectedBadge /> : null}</span></td><td data-label="Monthly fee"><strong>{formatCurrencyMicroDollars(plan.monthlyCostMicroDollars)}</strong></td><td data-label="Entitlement">{plan.entitlement.kind === 'fixed_tokens' ? formatTokens(plan.entitlement.monthlyTokens) : entitlementLabel(plan.entitlement)}</td><td data-label="Confidence"><ConfidenceLabel catalog={catalog} sourceId={plan.sourceId} /></td><td data-label="Evidence"><EvidenceLink catalog={catalog} sourceId={plan.sourceId} /></td></tr>;
              })}</tbody>
            </table>
          </div>
          <SameWorkloadPlanComparison plans={plans} catalog={catalog} workload={workload} />
          <div className="comparison-cards">
            {plans.map((plan) => {
              const selected = plan.id === selectedPlanId;
              return <article className={`offer-card ${selected ? 'offer-selected' : ''}`} data-selected={selected ? 'true' : 'false'} data-testid="offer-card" key={plan.id}><div className="offer-card-heading"><h4>{plan.displayName}</h4>{selected ? <SelectedBadge /> : null}</div><p>{formatCurrencyMicroDollars(plan.monthlyCostMicroDollars)} / month</p><p>{entitlementLabel(plan.entitlement)}</p><div className="card-meta"><ConfidenceLabel catalog={catalog} sourceId={plan.sourceId} /><EvidenceLink catalog={catalog} sourceId={plan.sourceId} /></div></article>;
            })}
          </div>
        </>
      )}
    </div>
  );
}

export function Comparison({ catalog, selectedProviderId, selectedModelIds, selectedPlanId, workload, modelMixBasisPoints }: ComparisonProps) {
  return (
    <div className="pricing-stack" id="comparison">
      <SectionCard className="pricing-panel plan-pricing-panel" title={UI_COPY.planPrices} description={`${providerLabel(selectedProviderId)} · paid monthly plans for one person`}>
        <div className="pricing-panel-icon" aria-hidden="true"><Layers3 size={22} /></div>
        <PlanComparison catalog={catalog} providerId={selectedProviderId} selectedPlanId={selectedPlanId} workload={workload} modelMixBasisPoints={modelMixBasisPoints} />
      </SectionCard>
      <SectionCard className="pricing-panel api-pricing-panel" title={UI_COPY.apiPrices} description="Selected calculator models are highlighted across each verified API route.">
        <div className="pricing-panel-icon" aria-hidden="true"><BadgeDollarSign size={22} /></div>
        <ModelOfferComparison catalog={catalog} providerId={selectedProviderId} selectedModelIds={selectedModelIds} />
      </SectionCard>
    </div>
  );
}
