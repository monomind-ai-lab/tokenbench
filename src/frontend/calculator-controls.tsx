import { Boxes, CircleCheck, CreditCard, GitBranch, SlidersHorizontal } from 'lucide-react';
import type { ModelOffer, PlanOffer } from '../catalog/contracts';
import { UI_COPY } from '../data/mockData';
import { basisLabel, entitlementLabel, formatCurrencyMicroDollars, formatPercentBasisPoints, resolveMonthlyTokenEstimate, type CalculatorCostUsage } from './calculator-state';
import type { ConversationWorkload } from '../catalog/subscription-api-calculator';
import { isApiOnlyProvider, paidIndividualPlans } from './plan-filter';
import type { CalculatorControlsProps } from './types';
import { EmptyState, providerLabel } from './ui';
import { ModelMark, ProviderMark } from './provider-mark';
import { trackTokenBenchEvent } from './analytics';

function inputId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

interface ProviderChoiceProps {
  readonly key?: string;
  readonly providerId: string;
  readonly selected: boolean;
  readonly apiOnly: boolean;
  readonly onChange: () => void;
}

interface PlanChoiceProps {
  readonly key?: string;
  readonly plan: PlanOffer;
  readonly selected: boolean;
  readonly onChange: () => void;
}

interface ModelChoiceProps {
  readonly key?: string;
  readonly model: ModelOffer;
  readonly selected: boolean;
  readonly onChange: () => void;
}

interface NumberFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly onChange: (value: number) => void;
  readonly onInvalid?: () => void;
}

function NumberField({ id, label, value, min, max, onChange, onInvalid }: NumberFieldProps) {
  return (
    <div className="workload-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="number-input"
        type="number"
        min={min}
        max={max}
        step="1"
        inputMode="numeric"
        value={value}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          if (Number.isSafeInteger(parsed)) onChange(Math.min(max, Math.max(min, parsed)));
          else onInvalid?.();
        }}
      />
    </div>
  );
}

function ProviderChoice({ providerId, selected, apiOnly, onChange }: ProviderChoiceProps) {
  const providerName = providerLabel(providerId);
  return (
    <label className={`choice-card provider-choice ${selected ? 'choice-selected' : ''}`}>
      <input type="radio" name="provider" value={providerId} checked={selected} onChange={onChange} />
      <ProviderMark providerId={providerId} providerName={providerName} size={20} decorative />
      <span className="choice-main"><strong>{providerName}</strong>{apiOnly ? <small>API pricing only · no paid plan</small> : null}</span>
      {selected ? <CircleCheck className="choice-check" aria-hidden="true" size={14} strokeWidth={1.8} /> : null}
    </label>
  );
}

function planEntitlementFlag(plan: PlanOffer): string {
  if (plan.entitlementEvidence.status === 'stale') {
    return `Stale evidence · ${plan.entitlementEvidence.staleReason ?? 'refresh required before comparison.'}`;
  }
  if (plan.entitlementEvidence.status === 'projected') return 'Projected outer ceiling · scenario only, not a guaranteed allowance.';
  if (plan.entitlementEvidence.status === 'dynamic_unknown') return 'Dynamic or unpublished capacity · arithmetic remains available, capacity does not.';
  switch (plan.entitlement.kind) {
    case 'fixed_tokens': return 'Published fixed token allowance.';
    case 'rolling_limit': return 'Variable rolling entitlement · exact token capacity is not published.';
    case 'guardrail_limited': return 'Variable guardrail entitlement · exact token capacity is not published.';
    case 'credits': return 'Credit-based entitlement · exact token capacity is not published.';
    case 'unknown': return 'Unpublished entitlement · capacity is not independently verified.';
  }
}

function PlanChoice({ plan, selected, onChange }: PlanChoiceProps) {
  return (
    <label className={`choice-card plan-choice ${selected ? 'choice-selected' : ''}`}>
      <input type="radio" name="plan" value={plan.id} checked={selected} onChange={onChange} />
      <span className="choice-main"><strong>{plan.displayName}</strong><small>{entitlementLabel(plan.entitlement)}</small><small className="plan-entitlement-flag">{planEntitlementFlag(plan)}</small></span>
      <span className="choice-price">{formatCurrencyMicroDollars(plan.monthlyCostMicroDollars)}<small>/mo</small></span>
    </label>
  );
}

function ModelChoice({ model, selected, onChange }: ModelChoiceProps) {
  const providerName = providerLabel(model.providerId);
  return (
    <label className={`model-choice ${selected ? 'choice-selected' : ''}`}>
      <input type="checkbox" checked={selected} onChange={onChange} />
      {selected ? <ModelMark modelId={model.modelId} providerId={model.providerId} providerName={providerName} size={20} decorative /> : null}
      <span className="choice-main"><strong>{model.displayName}</strong><small>{basisLabel(model.pricingBasis)} · {model.modelId}</small></span>
      <span className="model-price">{formatCurrencyMicroDollars(model.inputMicroDollarsPerMillion)} / {formatCurrencyMicroDollars(model.outputMicroDollarsPerMillion)}<small> in / out per 1M</small></span>
    </label>
  );
}

function updateWorkload(workload: ConversationWorkload, key: keyof ConversationWorkload, value: number): ConversationWorkload {
  return { ...workload, [key]: value };
}

export function CalculatorControls({
  catalog,
  providerIds,
  selectedProviderId,
  selectedPlanId,
  selectedModelIds,
  modelMixBasisPoints,
  workload,
  costUsage = { characterCount: 0, charactersPerToken: 4, manualMonthlyTokens: null, cacheReadBasisPoints: 0, cacheWriteTokens: 0, longContextTokens: 0 },
  onProviderChange,
  onPlanChange,
  onModelToggle,
  onModelShareChange,
  onWorkloadChange,
  onCostUsageChange,
  onMappingModeChange,
}: CalculatorControlsProps) {
  const plans = paidIndividualPlans(catalog.plans, selectedProviderId);
  const models = catalog.modelOffers.filter((model) => model.providerId === selectedProviderId);
  const selectedModels = models.filter((model) => selectedModelIds.includes(model.id));

  const changeWorkload = (key: keyof ConversationWorkload, value: number) => {
    trackTokenBenchEvent('cost_input_changed', { field: 'workload', route: '/cost/calculator/' });
    onWorkloadChange(updateWorkload(workload, key, value));
  };
  const changeCostUsage = (patch: Partial<CalculatorCostUsage>) => {
    trackTokenBenchEvent('cost_input_changed', { field: patch.characterCount !== undefined || patch.charactersPerToken !== undefined || patch.manualMonthlyTokens !== undefined ? 'estimate' : 'cache', route: '/cost/calculator/' });
    onCostUsageChange?.({ ...costUsage, ...patch });
  };
  const tokenEstimate = resolveMonthlyTokenEstimate(costUsage);
  const reportInvalid = () => trackTokenBenchEvent('cost_validation_failed', { reason: 'invalid', route: '/cost/calculator/' });

  return (
    <section className="controls-panel" aria-label="Calculator controls">
      <section id="calculator-provider-plan" className="calculator-control-step" aria-labelledby="provider-plan-heading">
        <header className="calculator-step-heading"><span>Step 1</span><h2 id="provider-plan-heading">Choose a provider and plan</h2></header>
        <div className="control-grid guided-provider-plan-grid">
          <fieldset className="control-block">
            <legend><span className="control-legend"><GitBranch size={18} aria-hidden="true" />{UI_COPY.providerSelection}</span></legend>
            <p className="field-help">Paid individual subscriptions plus API-only providers with verified model pricing.</p>
            <div className="choice-list provider-list">
              {providerIds.map((providerId) => <ProviderChoice key={providerId} providerId={providerId} apiOnly={isApiOnlyProvider(providerId)} selected={selectedProviderId === providerId} onChange={() => onProviderChange(providerId)} />)}
            </div>
            {providerIds.length === 0 ? <EmptyState title="No providers available" description="Refresh the catalog to load verified providers." /> : null}
          </fieldset>

          <fieldset className="control-block">
            <legend><span className="control-legend"><CreditCard size={18} aria-hidden="true" />{UI_COPY.planSelection}</span></legend>
            <p className="field-help">Capacity evidence is a separate result; it never hides valid cost arithmetic.</p>
            <div className="choice-list plan-list">
              {plans.map((plan) => <PlanChoice key={plan.id} plan={plan} selected={plan.id === selectedPlanId} onChange={() => onPlanChange(plan.id)} />)}
            </div>
            {plans.length === 0 ? <EmptyState title="No verified plans for this provider" description="Choose another provider or retry catalog refresh." /> : null}
          </fieldset>
        </div>
      </section>

      <section id="calculator-models" className="calculator-control-step" aria-labelledby="models-heading">
        <header className="calculator-step-heading"><span>Step 2</span><h2 id="models-heading">Choose the models you actually use</h2></header>
        <fieldset className="control-block model-block">
          <legend><span className="control-legend"><Boxes size={18} aria-hidden="true" />{UI_COPY.modelSelection}</span></legend>
          <p className="field-help">Advanced model mapping keeps direct, OpenRouter, and OpenCode Zen pricing identities explicit.</p>
          <details className="model-mix-details" open onToggle={(event) => { if (event.currentTarget.open) onMappingModeChange('override'); }}>
            <summary>Advanced model mapping</summary>
            <div className="model-list">
              {models.map((model) => <ModelChoice key={model.id} model={model} selected={selectedModelIds.includes(model.id)} onChange={() => { onMappingModeChange('override'); onModelToggle(model.id); }} />)}
            </div>
            {models.length === 0 ? <EmptyState title="No verified models for this provider" description="This provider has no published model offers in the current revision." /> : null}
            {selectedModels.length > 1 ? (
              <div className="usage-mix" role="group" aria-label="Model usage mix">
                <div className="mix-heading"><span>Model usage mix</span><strong>100% total</strong></div>
                {selectedModels.map((model) => {
                  const share = modelMixBasisPoints[model.id] ?? 0;
                  const id = `share-${inputId(model.id)}`;
                  return (
                    <div className="mix-row" key={model.id}>
                      <div className="mix-label"><label htmlFor={id}>{model.displayName}</label><output>{formatPercentBasisPoints(share)}</output></div>
                      <input id={id} type="range" min="0" max="100" step="1" value={share / 100} aria-valuenow={share / 100} aria-valuetext={`${formatPercentBasisPoints(share)} of workload`} onChange={(event) => { onMappingModeChange('override'); onModelShareChange(model.id, Math.round(Number(event.target.value) * 100)); }} />
                    </div>
                  );
                })}
              </div>
            ) : null}
          </details>
        </fieldset>
      </section>

      <section id="calculator-workload" className="calculator-control-step" aria-labelledby="workload-heading">
        <header className="calculator-step-heading"><span>Step 3</span><h2 id="workload-heading">Describe your message-level workload</h2></header>
        <fieldset className="control-block usage-block" aria-describedby="usage-help">
          <legend><span className="control-legend"><SlidersHorizontal size={18} aria-hidden="true" />{UI_COPY.workloadUsage}</span></legend>
          <div className="workload-input-grid">
            <NumberField id="conversations-per-day" label="Conversations per day" value={workload.conversationsPerDay} min={0} max={10_000} onChange={(value) => changeWorkload('conversationsPerDay', value)} onInvalid={reportInvalid} />
            <NumberField id="messages-per-conversation" label="Messages per conversation" value={workload.messagesPerConversation} min={0} max={1_000} onChange={(value) => changeWorkload('messagesPerConversation', value)} onInvalid={reportInvalid} />
            <NumberField id="input-tokens-per-message" label="Average input tokens per message" value={workload.inputTokensPerMessage} min={0} max={1_000_000} onChange={(value) => changeWorkload('inputTokensPerMessage', value)} onInvalid={reportInvalid} />
            <NumberField id="output-tokens-per-message" label="Average output tokens per message" value={workload.outputTokensPerMessage} min={0} max={1_000_000} onChange={(value) => changeWorkload('outputTokensPerMessage', value)} onInvalid={reportInvalid} />
            <NumberField id="active-days-per-month" label="Active days per month" value={workload.activeDaysPerMonth} min={0} max={31} onChange={(value) => changeWorkload('activeDaysPerMonth', value)} onInvalid={reportInvalid} />
          </div>
          <p id="usage-help" className="field-help">Zero usage and zero active days are valid. Efficiency and breakeven are shown only when their arithmetic denominator is positive.</p>
          <section className="cost-dimension-controls" aria-labelledby="cost-dimension-heading">
            <h3 id="cost-dimension-heading">Cache, long-context, and token estimate</h3>
            <p className="field-help">Cache-read, cache-write, and long-context quantities are applied only when their selected route publishes that price dimension. Missing dimensions remain excluded.</p>
            <div className="workload-input-grid">
              <NumberField id="character-count" label="Text or code characters per month" value={costUsage.characterCount} min={0} max={1_000_000_000} onChange={(value) => changeCostUsage({ characterCount: value })} />
              <NumberField id="characters-per-token" label="Characters per token estimate" value={costUsage.charactersPerToken} min={1} max={32} onChange={(value) => changeCostUsage({ charactersPerToken: value })} />
              <NumberField id="manual-monthly-tokens" label="Manual monthly token override" value={costUsage.manualMonthlyTokens ?? 0} min={0} max={1_000_000_000} onChange={(value) => changeCostUsage({ manualMonthlyTokens: value })} />
              <NumberField id="cache-read-share" label="Cached-input share (basis points)" value={costUsage.cacheReadBasisPoints} min={0} max={10_000} onChange={(value) => changeCostUsage({ cacheReadBasisPoints: value })} />
              <NumberField id="cache-write-tokens" label="Cache-write tokens per month" value={costUsage.cacheWriteTokens} min={0} max={1_000_000_000} onChange={(value) => changeCostUsage({ cacheWriteTokens: value })} />
              <NumberField id="long-context-tokens" label="Long-context tokens per month" value={costUsage.longContextTokens} min={0} max={1_000_000_000} onChange={(value) => changeCostUsage({ longContextTokens: value })} />
            </div>
            <p className="field-help">{tokenEstimate.source === 'manual' ? `Manual override: ${tokenEstimate.tokens.toLocaleString()} tokens/month.` : `Estimated at ${costUsage.charactersPerToken} characters per token: ${tokenEstimate.tokens.toLocaleString()} tokens/month.`}</p>
            <button className="button button-secondary button-small" type="button" onClick={() => changeCostUsage({ manualMonthlyTokens: null })}>Reset manual token override</button>
          </section>
        </fieldset>
      </section>
    </section>
  );
}
