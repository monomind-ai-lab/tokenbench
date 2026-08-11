import { Boxes, CircleCheck, CreditCard, GitBranch, SlidersHorizontal } from 'lucide-react';
import type { ModelOffer, PlanOffer } from '../catalog/contracts';
import { UI_COPY } from '../data/mockData';
import { basisLabel, entitlementLabel, formatCurrencyMicroDollars, formatPercentBasisPoints, WORKLOAD_PRESETS } from './calculator-state';
import type { WorkloadPreset } from './calculator-state';
import { isApiOnlyProvider, paidIndividualPlans } from './plan-filter';
import type { CalculatorControlsProps } from './types';
import { EmptyState, providerLabel } from './ui';
import { ModelMark, ProviderMark } from './provider-mark';

function inputId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

// Keep the range useful for the common workload band while the number field
// remains available for larger, exact token budgets.
const MONTHLY_TOKENS_RANGE_MAX = 100_000_000;
const MONTHLY_TOKENS_RANGE_STEP = 100_000;

function parseFormattedTokens(value: string): number | null {
  const normalized = value.replaceAll(',', '').trim();
  if (!/^\d+$/.test(normalized)) return normalized === '' ? 0 : null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
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
  if (plan.entitlementEvidence.status === 'projected') {
    return 'Projected outer ceiling · scenario only, not a guaranteed allowance.';
  }
  if (plan.entitlementEvidence.status === 'dynamic_unknown') {
    return 'Dynamic or unpublished capacity · this plan cannot be compared automatically.';
  }
  switch (plan.entitlement.kind) {
    case 'fixed_tokens': return 'Published fixed token allowance.';
    case 'rolling_limit': return 'Variable rolling entitlement · exact token capacity is not published.';
    case 'guardrail_limited': return 'Variable guardrail entitlement · exact token capacity is not published.';
    case 'credits': return 'Credit-based entitlement · exact token capacity is not published.';
    case 'unknown': return 'Unpublished entitlement · this plan cannot be compared automatically.';
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

export function CalculatorControls({
  catalog,
  providerIds,
  selectedProviderId,
  selectedPlanId,
  selectedModelIds,
  modelMixBasisPoints,
  inputShareBasisPoints,
  monthlyTokens,
  selectedPreset,
  onProviderChange,
  onPlanChange,
  onModelToggle,
  onModelShareChange,
  onInputShareChange,
  onMonthlyTokensChange,
  onPresetChange,
}: CalculatorControlsProps) {
  const plans = paidIndividualPlans(catalog.plans, selectedProviderId);
  const models = catalog.modelOffers.filter((model) => model.providerId === selectedProviderId);
  const selectedModels = models.filter((model) => selectedModelIds.includes(model.id));

  return (
    <section className="controls-panel" aria-label="Calculator controls">
      <section id="calculator-provider-plan" className="calculator-control-step" aria-labelledby="provider-plan-heading">
        <header className="calculator-step-heading"><span>Step 1</span><h2 id="provider-plan-heading">Choose a provider and plan</h2></header>
        <p className="step-description">Plan price is a monthly fee. A plan is only directly comparable when it publishes a fixed token allowance for the models you selected.</p>
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
            <p className="field-help">Variable, rolling, credit-based, and unpublished entitlements remain visible instead of being treated as a fixed token allowance.</p>
            <div className="choice-list plan-list">
              {plans.map((plan) => <PlanChoice key={plan.id} plan={plan} selected={plan.id === selectedPlanId} onChange={() => onPlanChange(plan.id)} />)}
            </div>
            {plans.length === 0 ? <EmptyState title="No verified plans for this provider" description="Choose another provider or retry catalog refresh." /> : null}
          </fieldset>
        </div>
      </section>

      <section id="calculator-models" className="calculator-control-step" aria-labelledby="models-heading">
        <header className="calculator-step-heading"><span>Step 2</span><h2 id="models-heading">Choose the models you actually use</h2></header>
        <p className="step-description">Start with the sensible verified selection, then keep only the API offers that match your real workload.</p>
        <fieldset className="control-block model-block">
          <legend><span className="control-legend"><Boxes size={18} aria-hidden="true" />{UI_COPY.modelSelection}</span></legend>
          <p className="field-help">Select one or more offers. Direct, OpenRouter, and OpenCode Zen identities stay separate.</p>
          <div className="model-list">
            {models.map((model) => <ModelChoice key={model.id} model={model} selected={selectedModelIds.includes(model.id)} onChange={() => onModelToggle(model.id)} />)}
          </div>
          {models.length === 0 ? <EmptyState title="No verified models for this provider" description="This provider has no published model offers in the current revision. Try another provider or retry." /> : null}
          <details className="model-mix-details">
            <summary>Adjust model usage mix</summary>
            <div className="usage-mix" role="group" aria-label="Model usage mix">
              <div className="mix-heading"><span>Model usage mix</span><strong>{selectedModels.length ? '100% total' : 'Select a model first'}</strong></div>
              {selectedModels.map((model) => {
                const share = modelMixBasisPoints[model.id] ?? 0;
                const id = `share-${inputId(model.id)}`;
                return (
                  <div className="mix-row" key={model.id}>
                    <div className="mix-label"><label htmlFor={id}>{model.displayName}</label><output>{formatPercentBasisPoints(share)}</output></div>
                    <input id={id} type="range" min="0" max="100" step="1" value={share / 100} aria-valuenow={share / 100} aria-valuetext={`${formatPercentBasisPoints(share)} of workload`} onChange={(event) => onModelShareChange(model.id, Math.round(Number(event.target.value) * 100))} />
                  </div>
                );
              })}
              {selectedModels.length === 0 ? <p className="muted">Select at least one model to edit its mix.</p> : null}
            </div>
          </details>
        </fieldset>
      </section>

      <section id="calculator-workload" className="calculator-control-step" aria-labelledby="workload-heading">
        <header className="calculator-step-heading"><span>Step 3</span><h2 id="workload-heading">Describe your monthly workload</h2></header>
        <p className="step-description">For example, 10M tokens at a 50/50 input/output mix describes a balanced monthly workload.</p>
        <fieldset className="control-block usage-block" aria-describedby="usage-help">
          <legend><span className="control-legend"><SlidersHorizontal size={18} aria-hidden="true" />{UI_COPY.workloadUsage}</span></legend>
          <div className="field-label"><label htmlFor="monthly-tokens">Expected monthly usage</label><output id="monthly-tokens-output">{monthlyTokens.toLocaleString()} tokens</output></div>
          <input
            id="monthly-tokens-range"
            className="usage-range"
            type="range"
            min="0"
            max={MONTHLY_TOKENS_RANGE_MAX}
            step={MONTHLY_TOKENS_RANGE_STEP}
            value={Math.min(monthlyTokens, MONTHLY_TOKENS_RANGE_MAX)}
            aria-label="Monthly usage range"
            aria-describedby="monthly-tokens-output"
            aria-valuetext={`${monthlyTokens.toLocaleString()} tokens`}
            onChange={(event) => onMonthlyTokensChange(Number(event.target.value))}
          />
          <div className="range-caption"><span>0 tokens</span><span>100M tokens</span></div>
          <input id="monthly-tokens" className="number-input" type="text" inputMode="numeric" pattern="[0-9,]*" autoComplete="off" value={monthlyTokens.toLocaleString('en-US')} aria-describedby="monthly-tokens-output" onChange={(event) => {
            const parsed = parseFormattedTokens(event.target.value);
            if (parsed !== null) onMonthlyTokensChange(parsed);
          }} />

          <p id="usage-help" className="field-help">Presets are starting points; every value remains editable.</p>
          <div className="preset-row" aria-label="Workload presets">
            <span className="preset-label">Presets</span>
            {(Object.entries(WORKLOAD_PRESETS) as [WorkloadPreset, (typeof WORKLOAD_PRESETS)[WorkloadPreset]][]).map(([preset, values]) => {
              const selected = selectedPreset === preset;
              return <button key={preset} type="button" className={`button button-small preset-button ${selected ? 'preset-selected' : ''}`} aria-pressed={selected} onClick={() => onPresetChange(preset)}>{values.label}</button>;
            })}
          </div>

          <div className="field-label"><label htmlFor="input-share">Input share</label><output id="input-share-output">{formatPercentBasisPoints(inputShareBasisPoints)} input / {formatPercentBasisPoints(10_000 - inputShareBasisPoints)} output</output></div>
          <input id="input-share" type="range" min="0" max="100" step="1" value={inputShareBasisPoints / 100} aria-label="Input share" aria-valuenow={inputShareBasisPoints / 100} aria-valuetext={`${formatPercentBasisPoints(inputShareBasisPoints)} input`} onChange={(event) => onInputShareChange(Math.round(Number(event.target.value) * 100))} />
          <div className="range-caption"><span>More output</span><span>More input</span></div>
        </fieldset>
      </section>
    </section>
  );
}
