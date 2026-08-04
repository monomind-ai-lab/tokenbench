import { Boxes, CreditCard, GitBranch, SlidersHorizontal } from 'lucide-react';
import type { ModelOffer, PlanOffer } from '../catalog/contracts';
import { UI_COPY } from '../data/mockData';
import { basisLabel, entitlementLabel, formatCurrencyMicroDollars, formatPercentBasisPoints } from './calculator-state';
import { paidIndividualPlans } from './plan-filter';
import type { CalculatorControlsProps } from './types';
import { EmptyState, providerLabel } from './ui';

function inputId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

// Keep the range useful for the common workload band while the number field
// remains available for larger, exact token budgets.
const MONTHLY_TOKENS_RANGE_MAX = 100_000_000;
const MONTHLY_TOKENS_RANGE_STEP = 100_000;

interface ProviderChoiceProps {
  readonly key?: string;
  readonly providerId: string;
  readonly selected: boolean;
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

function ProviderChoice({ providerId, selected, onChange }: ProviderChoiceProps) {
  return (
    <label className={`choice-card ${selected ? 'choice-selected' : ''}`}>
      <input type="radio" name="provider" value={providerId} checked={selected} onChange={onChange} />
      <span>{providerLabel(providerId)}</span>
      {selected ? <span className="choice-check" aria-hidden="true">✓</span> : null}
    </label>
  );
}

function PlanChoice({ plan, selected, onChange }: PlanChoiceProps) {
  return (
    <label className={`choice-card plan-choice ${selected ? 'choice-selected' : ''}`}>
      <input type="radio" name="plan" value={plan.id} checked={selected} onChange={onChange} />
      <span className="choice-main"><strong>{plan.displayName}</strong><small>{entitlementLabel(plan.entitlement)}</small></span>
      <span className="choice-price">{formatCurrencyMicroDollars(plan.monthlyCostMicroDollars)}<small>/mo</small></span>
    </label>
  );
}

function ModelChoice({ model, selected, onChange }: ModelChoiceProps) {
  return (
    <label className={`model-choice ${selected ? 'choice-selected' : ''}`}>
      <input type="checkbox" checked={selected} onChange={onChange} />
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
      <div className="control-grid">
        <fieldset className="control-block">
          <legend><span className="control-legend"><GitBranch size={18} aria-hidden="true" />{UI_COPY.providerSelection}</span></legend>
          <p className="field-help">Verified providers with paid individual subscriptions.</p>
          <div className="choice-list provider-list">
            {providerIds.map((providerId) => <ProviderChoice key={providerId} providerId={providerId} selected={selectedProviderId === providerId} onChange={() => onProviderChange(providerId)} />)}
          </div>
          {providerIds.length === 0 ? <EmptyState title="No providers available" description="Refresh the catalog to load verified providers." /> : null}
        </fieldset>

        <fieldset className="control-block">
          <legend><span className="control-legend"><CreditCard size={18} aria-hidden="true" />{UI_COPY.planSelection}</span></legend>
          <p className="field-help">Monthly consumer plans only; published limits remain explicit.</p>
          <div className="choice-list plan-list">
            {plans.map((plan) => <PlanChoice key={plan.id} plan={plan} selected={plan.id === selectedPlanId} onChange={() => onPlanChange(plan.id)} />)}
          </div>
          {plans.length === 0 ? <EmptyState title="No verified plans for this provider" description="Choose another provider or retry catalog refresh." /> : null}
        </fieldset>

        <fieldset className="control-block model-block">
          <legend><span className="control-legend"><Boxes size={18} aria-hidden="true" />{UI_COPY.modelSelection}</span></legend>
          <p className="field-help">Select one or more offers. Direct, OpenRouter, and OpenCode Zen identities stay separate.</p>
          <div className="model-list">
            {models.map((model) => <ModelChoice key={model.id} model={model} selected={selectedModelIds.includes(model.id)} onChange={() => onModelToggle(model.id)} />)}
          </div>
          {models.length === 0 ? <EmptyState title="No verified models for this provider" description="This provider has no published model offers in the current revision. Try another provider or retry." /> : null}
        </fieldset>

        <fieldset className="control-block usage-block" aria-describedby="usage-help">
          <legend><span className="control-legend"><SlidersHorizontal size={18} aria-hidden="true" />{UI_COPY.workloadUsage}</span></legend>
          <p id="usage-help" className="field-help">Presets are starting points; every value remains editable.</p>
          <div className="preset-row" aria-label="Workload presets">
            <span className="preset-label">Presets</span>
            <button type="button" className="button button-small" onClick={() => onPresetChange('balanced')}>Balanced</button>
            <button type="button" className="button button-small" onClick={() => onPresetChange('input-heavy')}>Input-heavy</button>
            <button type="button" className="button button-small" onClick={() => onPresetChange('output-heavy')}>Output-heavy</button>
          </div>

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
          <input id="monthly-tokens" className="number-input" type="number" min="0" max="1000000000000" step="1000" value={monthlyTokens} aria-describedby="monthly-tokens-output" onChange={(event) => onMonthlyTokensChange(Number(event.target.value))} />

          <div className="field-label"><label htmlFor="input-share">Input share</label><output id="input-share-output">{formatPercentBasisPoints(inputShareBasisPoints)} input / {formatPercentBasisPoints(10_000 - inputShareBasisPoints)} output</output></div>
          <input id="input-share" type="range" min="0" max="100" step="1" value={inputShareBasisPoints / 100} aria-label="Input share" aria-valuenow={inputShareBasisPoints / 100} aria-valuetext={`${formatPercentBasisPoints(inputShareBasisPoints)} input`} onChange={(event) => onInputShareChange(Math.round(Number(event.target.value) * 100))} />
          <div className="range-caption"><span>More output</span><span>More input</span></div>

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
        </fieldset>
      </div>
    </section>
  );
}
