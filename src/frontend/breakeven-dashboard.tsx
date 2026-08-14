import { useMemo } from 'react';
import { trackTokenBenchEvent } from './analytics';
import { BreakevenChart } from './breakeven-chart';
import { buildBreakevenResult, type BreakevenScenario } from './breakeven-state';
import { formatCurrencyMicroDollars, type CalculatorSnapshot } from './calculator-state';

export interface BreakevenDashboardProps {
  readonly snapshot: CalculatorSnapshot;
  readonly hasAvailableModels: boolean;
  readonly seats?: number;
  readonly feePerSeat?: number;
  readonly maxTokensMillions?: number;
  readonly onScenarioChange?: (scenario: Pick<BreakevenScenario, 'seats' | 'feePerSeat' | 'maxTokensMillions'>) => void;
}

function money(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
}

function pricePerMillion(value: number): number | null {
  return Number.isFinite(value) && value >= 0 ? value / 1_000_000 : null;
}

function weightedPrice(
  snapshot: CalculatorSnapshot,
  field: 'inputMicroDollarsPerMillion' | 'outputMicroDollarsPerMillion',
): number | null {
  const entries = snapshot.mixEntries;
  if (entries.length === 0 || entries.reduce((sum, entry) => sum + entry.shareBasisPoints, 0) !== 10_000) return null;
  return pricePerMillion(entries.reduce((sum, entry) => sum + entry.model[field] * entry.shareBasisPoints, 0) / 10_000);
}

/** Keeps the client chart, table, summary, and share-relevant controls on one pure scenario selector. */
export function breakevenScenarioFromSnapshot(
  snapshot: CalculatorSnapshot,
  seats: number,
  feePerSeat: number,
  maxTokensMillions: number,
): BreakevenScenario {
  const totalTokens = snapshot.derivedWorkload.monthlyInputTokens + snapshot.derivedWorkload.monthlyOutputTokens;
  return {
    seats,
    feePerSeat,
    maxTokensMillions,
    inputShare: totalTokens > 0 ? snapshot.derivedWorkload.monthlyInputTokens / totalTokens : 0.5,
    inputPricePerMillion: weightedPrice(snapshot, 'inputMicroDollarsPerMillion'),
    outputPricePerMillion: weightedPrice(snapshot, 'outputMicroDollarsPerMillion'),
    // A verified current-workload coverage result is not the same as a published token entitlement.
    capacityTokens: null,
    currentVolumeMillions: Math.min(maxTokensMillions, totalTokens / 1_000_000),
  };
}

function CapacityPanel({ snapshot }: { readonly snapshot: CalculatorSnapshot }) {
  const isVerified = snapshot.capacityEvidence.status === 'verified-covered' || snapshot.capacityEvidence.status === 'verified-not-covered';
  return <section className="breakeven-capacity-panel" aria-labelledby="breakeven-capacity-heading">
    <h2 id="breakeven-capacity-heading">Subscription capacity evidence</h2>
    <p><strong>{isVerified ? 'Current-workload coverage reported' : 'Unavailable'}</strong></p>
    <p>{snapshot.capacityEvidence.explanation}</p>
    <p>Capacity evidence is separate from the seat-fee crossover and is never inferred from it.</p>
  </section>;
}

function NumberControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly onChange: (value: number) => void;
}) {
  return <label className="breakeven-number-control">{label}
    <input type="number" min={min} max={max} step={step} value={value} onChange={(event) => {
      const next = Number(event.currentTarget.value);
      if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
    }} />
  </label>;
}

export function BreakevenDashboard({
  snapshot,
  hasAvailableModels,
  seats = 1,
  feePerSeat = 20,
  maxTokensMillions = 300,
  onScenarioChange,
}: BreakevenDashboardProps) {
  const scenario = useMemo(
    () => breakevenScenarioFromSnapshot(snapshot, seats, feePerSeat, maxTokensMillions),
    [feePerSeat, maxTokensMillions, seats, snapshot],
  );
  const result = buildBreakevenResult(scenario);
  const sourceEffectiveAt = snapshot.catalogFreshness?.checkedAt ?? 'Unavailable';
  const change = (field: 'seats' | 'fee' | 'volume', next: number) => {
    const nextScenario = field === 'seats'
      ? { seats: next, feePerSeat, maxTokensMillions }
      : field === 'fee'
        ? { seats, feePerSeat: next, maxTokensMillions }
        : { seats, feePerSeat, maxTokensMillions: next };
    trackTokenBenchEvent('breakeven_input_changed', { field, route: '/cost/breakeven/' });
    trackTokenBenchEvent('breakeven_calculated', { route: '/cost/breakeven/' });
    onScenarioChange?.(nextScenario);
  };

  if (!hasAvailableModels) return <section className="results-panel" aria-label="Breakeven analysis"><h2>Breakeven evidence</h2><p><strong>Unavailable</strong></p><p>No verified models are available for this comparison.</p><CapacityPanel snapshot={snapshot} /></section>;
  if (result.kind === 'unavailable') {
    trackTokenBenchEvent('breakeven_unavailable', { reason: result.reason, route: '/cost/breakeven/' });
    return <section className="results-panel" aria-label="Breakeven analysis"><h2>Breakeven evidence</h2><p><strong>Unavailable</strong></p><p>{result.reason === 'partial_prices' ? 'Complete published input and output API price dimensions are required; missing prices are not treated as zero.' : 'Seats, fee, input/output mix, or the displayed 0–300M domain is invalid.'}</p><CapacityPanel snapshot={snapshot} /></section>;
  }

  return <section className="results-panel breakeven-dashboard" aria-label="Breakeven analysis">
    <header>
      <h2>Breakeven evidence</h2>
      <p>Compare a monthly seat fee with complete published API price dimensions. This is a fee crossover, not a claim about included subscription capacity.</p>
    </header>
    <fieldset className="breakeven-controls">
      <legend>Fee crossover controls</legend>
      <NumberControl label="Seats" value={seats} min={1} max={50} step={1} onChange={(next) => change('seats', Math.round(next))} />
      <NumberControl label="Fee per seat (USD/month)" value={feePerSeat} min={0} max={100_000} step={1} onChange={(next) => change('fee', next)} />
      <label className="breakeven-number-control">Displayed monthly token domain (0–300M)
        <input type="range" min="0" max="300" step="1" value={maxTokensMillions} onChange={(event) => change('volume', Number(event.currentTarget.value))} />
        <input type="number" min="0" max="300" step="1" value={maxTokensMillions} aria-label="Exact displayed monthly token domain in millions" onChange={(event) => change('volume', Number(event.currentTarget.value))} />
      </label>
    </fieldset>
    <dl className="breakeven-summary">
      <div><dt>Subscription fee</dt><dd>{money(result.subscriptionFee)}</dd></div>
      <div><dt>API cost per 1M tokens</dt><dd>{money(result.apiCostPerMillion)}</dd></div>
      <div><dt>Fee crossover</dt><dd>{result.crossoverMillions === null ? 'No positive crossover' : `${result.crossoverMillions.toFixed(2)}M tokens/month`}</dd></div>
    </dl>
    <p className="breakeven-finding">{result.message}</p>
    <p>Formula: seats × monthly fee per seat = monthly fee; API cost = input tokens × published input price + output tokens × published output price. Rounding is display-only; the crossover uses full precision.</p>
    <section className="breakeven-source-prices" aria-labelledby="breakeven-source-prices-heading">
      <h2 id="breakeven-source-prices-heading">Published source prices</h2>
      <dl>
        <div><dt>Input</dt><dd>{scenario.inputPricePerMillion === null ? 'Unavailable' : `${money(scenario.inputPricePerMillion)} per 1M tokens`}</dd></div>
        <div><dt>Output</dt><dd>{scenario.outputPricePerMillion === null ? 'Unavailable' : `${money(scenario.outputPricePerMillion)} per 1M tokens`}</dd></div>
        <div><dt>Effective time</dt><dd>{sourceEffectiveAt}</dd></div>
      </dl>
      <p>Selected native and hosted route records remain distinct in the calculator controls; this scenario uses the selected route mix.</p>
    </section>
    <BreakevenChart result={result} />
    <CapacityPanel snapshot={snapshot} />
  </section>;
}
