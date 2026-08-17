import { ImageDown, Link, Plus, Table2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { ChartConfiguration } from 'chart.js';
import { PopularChartCanvas } from '../frontend/popular-models/chart-canvas';
import { fixtureAdapter } from '../frontend/preview-data/adapter';
import type { CompareData, EvidenceValue, PreviewDataAdapter, PreviewModel, UiDataContractV1 } from '../frontend/preview-data/contracts';
import {
  copyCompareLink,
  downloadCompareCsv,
  downloadComparePng,
  type CompareExportRow,
} from '../frontend/preview-workbench/compare-export-actions';
import {
  addCompareModel,
  decodeCompareState,
  DEFAULT_COMPARE_STATE,
  encodeCompareState,
  MAX_COMPARE_MODELS,
  removeCompareModel,
  type CompareState,
} from '../frontend/preview-workbench/compare-state';
import { parsePreviewModelsPageData } from './preview-models-page';
import type { PreviewPageProps } from '../preview/route-types';

type CompareContract = UiDataContractV1<CompareData>;
type CompareActionState = { readonly tone: 'info' | 'error'; readonly message: string } | null;

interface PreviewComparePageProps extends PreviewPageProps {
  readonly adapter?: PreviewDataAdapter;
}

interface CompareMatrixRow extends CompareExportRow {
  readonly id: string;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unavailableId(value: unknown): value is EvidenceValue<string> {
  return isRecord(value) && value.availability === 'unavailable' && typeof value.reason === 'string';
}

/** Validates the static comparison envelope before client-side code reads evidence fields. */
export function parsePreviewComparePageData(value: unknown): CompareContract | null {
  const directoryContract = parsePreviewModelsPageData(value);
  if (directoryContract === null || !isRecord(value)) return null;
  if (directoryContract.data === null) return directoryContract.status === 'unavailable' ? value as unknown as CompareContract : null;
  const data = value.data;
  return isRecord(data)
    && Array.isArray(data.unavailableModelIds)
    && data.unavailableModelIds.every(unavailableId)
    ? value as unknown as CompareContract
    : null;
}

function evidenceValue<T>(value: EvidenceValue<T>): T | null {
  return value.availability === 'available' ? value.value : null;
}

function evidenceText<T>(value: EvidenceValue<T>, format: (item: T) => string): string {
  return value.availability === 'available' ? format(value.value) : 'Unavailable';
}

function identity(model: PreviewModel) {
  return evidenceValue(model.identity);
}

function modelName(model: PreviewModel): string {
  return identity(model)?.name ?? model.id;
}

function modelProvider(model: PreviewModel): string {
  return identity(model)?.provider ?? 'Unavailable';
}

function profileHref(model: PreviewModel): string {
  return `/model-profile?model=${encodeURIComponent(identity(model)?.slug ?? model.id)}`;
}

function decimal(value: number | null, digits = 1): string {
  return value === null ? 'Unavailable' : value.toFixed(digits);
}

function money(value: number | null): string {
  return value === null ? 'Unavailable' : `$${value.toFixed(2)}`;
}

function selectedModelsInOrder(modelIds: readonly string[], models: readonly PreviewModel[]): readonly PreviewModel[] {
  const byId = new Map(models.map((model) => [model.id, model]));
  return modelIds.flatMap((id) => {
    const model = byId.get(id);
    return model ? [model] : [];
  });
}

function capabilityRows(models: readonly PreviewModel[]): readonly CompareMatrixRow[] {
  const axes = models.flatMap((model) => evidenceValue(model.capability)?.radar ?? []);
  const keys = Array.from(new Set(axes.map((axis) => axis.key)));
  return keys.map((key) => {
    const axis = axes.find((candidate) => candidate.key === key)!;
    return {
      id: `capability-${key}`,
      label: axis.label,
      values: models.map((model) => {
        const value = evidenceValue(model.capability)?.radar.find((candidate) => candidate.key === key)?.percentile ?? null;
        return decimal(value);
      }),
    };
  });
}

function decisionRows(models: readonly PreviewModel[]): readonly CompareMatrixRow[] {
  return [
    { id: 'rank', label: 'Rank', values: models.map((_model, index) => `#${index + 1}`) },
    { id: 'provider', label: 'Provider', values: models.map(modelProvider) },
    { id: 'access', label: 'Access', values: models.map((model) => evidenceText(model.access, (value) => value)) },
    { id: 'composite', label: 'Composite score', values: models.map((model) => decimal(evidenceValue(model.capability)?.compositeScore ?? null)) },
    { id: 'input-output', label: 'Input / output · $/1M', values: models.map((model) => {
      const pricing = evidenceValue(model.routePricing);
      return pricing ? `${money(pricing.inputUsdPerMillion)} / ${money(pricing.outputUsdPerMillion)}` : 'Unavailable';
    }) },
    { id: 'cache-read', label: 'Cache read · $/1M', values: models.map((model) => {
      const cache = evidenceValue(model.routePricing)?.cache;
      return cache ? evidenceText(cache, (value) => evidenceText(value.readUsdPerMillion, money)) : 'Unavailable';
    }) },
    { id: 'task-cost', label: 'Cost per successful task', values: models.map((model) => money(evidenceValue(model.taskEconomics)?.costUsdPerSuccessfulTask ?? null)) },
    { id: 'ttft', label: 'TTFT p50', values: models.map((model) => {
      const ttft = evidenceValue(model.runtime)?.ttftP50Seconds ?? null;
      return ttft === null ? 'Unavailable' : `${ttft.toFixed(2)}s`;
    }) },
    { id: 'throughput', label: 'Throughput', values: models.map((model) => {
      const throughput = evidenceValue(model.runtime)?.outputTokensPerSecond ?? null;
      return throughput === null ? 'Unavailable' : `${throughput.toFixed(0)} tok/s`;
    }) },
    { id: 'runtime-conditions', label: 'Runtime conditions', values: models.map((model) => evidenceText(model.runtime, (value) => value.conditions)) },
    { id: 'benchmark-release', label: 'Benchmark release', values: models.map((model) => evidenceText(model.benchmark, (value) => value.releaseOn)) },
    { id: 'lifecycle', label: 'Lifecycle', values: models.map((model) => evidenceText(model.lifecycle, (value) => value.status)) },
    { id: 'sunset', label: 'Sunset', values: models.map((model) => {
      const lifecycle = evidenceValue(model.lifecycle);
      return lifecycle ? evidenceText(lifecycle.sunsetOn, (value) => value) : 'Unavailable';
    }) },
  ];
}

function chartColors(count: number): readonly string[] {
  const palette = ['#4f46e5', '#f97316', '#10b981', '#d946ef'];
  return Array.from({ length: count }, (_value, index) => palette[index % palette.length]!);
}

function radarChart(models: readonly PreviewModel[]): ChartConfiguration<'radar'> {
  const axes = capabilityRows(models);
  const colors = chartColors(models.length);
  return {
    type: 'radar',
    data: {
      labels: axes.map((row) => row.label),
      datasets: models.map((model, index) => ({
        label: modelName(model),
        data: axes.map((row) => Number(row.values[index]) || 0),
        borderColor: colors[index],
        backgroundColor: `${colors[index]}28`,
        borderDash: index === 1 ? [7, 3] : index === 2 ? [2, 3] : index === 3 ? [10, 3, 2, 3] : [],
        pointRadius: 3,
        borderWidth: 2,
      })),
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { padding: 32, usePointStyle: true } } },
      scales: { r: { min: 0, max: 100, ticks: { display: false } } },
    },
  };
}

function barChart(label: string, models: readonly PreviewModel[], values: readonly (number | null)[]): ChartConfiguration<'bar'> {
  return {
    type: 'bar',
    data: {
      labels: models.map(modelName),
      datasets: [{
        label,
        data: values.map((value) => value ?? 0),
        backgroundColor: chartColors(models.length),
        borderRadius: 4,
      }],
    },
    options: {
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: { legend: { display: false } },
    },
  };
}

function ComparisonMatrix({ ariaLabel, id, models, rows }: {
  readonly ariaLabel: string;
  readonly id: string;
  readonly models: readonly PreviewModel[];
  readonly rows: readonly CompareMatrixRow[];
}) {
  return <div className="comparison-matrix popular-models-comparison-matrix" id={id}>
    <div className="comparison-matrix-table popular-models-comparison-matrix-table" role="region" aria-label={ariaLabel} tabIndex={0}>
      <table>
        <thead><tr><th scope="col">Metric</th>{models.map((model) => <th scope="col" key={model.id}><span>{modelName(model)}</span><small aria-hidden="true">{modelProvider(model)}</small></th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}><th scope="row">{row.label}</th>{row.values.map((value, index) => <td key={`${row.id}-${models[index]?.id ?? index}`}>{value}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <p className="sr-only">Scroll horizontally to view every selected model.</p>
    <div className="comparison-matrix-mobile popular-models-comparison-matrix-cards" role="list" aria-label={`${ariaLabel}, metric-first mobile view`}>
      {rows.map((row) => <section key={row.id} role="listitem"><h4>{row.label}</h4><dl>{models.map((model, index) => <div key={model.id}><dt>{modelName(model)}</dt><dd>{row.values[index]}</dd></div>)}</dl></section>)}
    </div>
  </div>;
}

function SelectionChips({ modelIds, models, onRemove }: {
  readonly modelIds: readonly string[];
  readonly models: readonly PreviewModel[];
  readonly onRemove: (modelId: string) => void;
}) {
  const modelById = new Map(models.map((model) => [model.id, model]));
  return <div className="compare-list" role="list" aria-label="Selected comparison models">
    {modelIds.map((id) => {
      const model = modelById.get(id);
      const name = model ? modelName(model) : id;
      return <span className="compare-model-chip" key={id} role="listitem">
        {model ? <a href={profileHref(model)}>{name}</a> : <span>{name}</span>}
        <button type="button" aria-label={`Remove ${name} from comparison`} onClick={() => onRemove(id)}><X aria-hidden="true" size={14} /></button>
      </span>;
    })}
  </div>;
}

function ModelPicker({ models, selectedIds, onAdd }: {
  readonly models: readonly PreviewModel[];
  readonly selectedIds: readonly string[];
  readonly onAdd: (modelId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const atLimit = selectedIds.length >= MAX_COMPARE_MODELS;
  const available = models.filter((model) => !selectedIds.includes(model.id));
  const matches = available.filter((model) => `${modelName(model)} ${modelProvider(model)}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  return <div className="compare-model-picker">
    <button type="button" className="button" aria-expanded={open} aria-haspopup="dialog" disabled={atLimit} onClick={() => setOpen((current) => !current)}><Plus aria-hidden="true" size={16} />Add a model</button>
    {open && !atLimit ? <div role="dialog" aria-label="Add a model" className="compare-model-picker-panel">
      <label>Search models or providers<input aria-controls="compare-model-picker-options" aria-expanded="true" autoFocus onChange={(event) => setQuery(event.currentTarget.value)} role="combobox" type="search" value={query} /></label>
      <div id="compare-model-picker-options" role="listbox" aria-label="Available models">
        {matches.map((model) => <button key={model.id} type="button" role="option" aria-label={`${modelName(model)} · ${modelProvider(model)}`} onClick={() => { onAdd(model.id); setOpen(false); setQuery(''); }}><strong>{modelName(model)}</strong><small>{modelProvider(model)}</small></button>)}
        {matches.length === 0 ? <p role="status">{available.length === 0 ? 'Every available model is already selected.' : 'No models match this search.'}</p> : null}
      </div>
    </div> : null}
  </div>;
}

function ResultActions({ data, exportRoot, onState }: {
  readonly data: { readonly models: readonly PreviewModel[]; readonly rows: readonly CompareMatrixRow[] };
  readonly exportRoot: RefObject<HTMLElement | null>;
  readonly onState: (state: CompareActionState) => void;
}) {
  const date = new Date().toISOString().slice(0, 10);
  const exportData = { models: data.models.map((model) => ({ name: modelName(model) })), rows: data.rows };
  const copy = async () => {
    try {
      await copyCompareLink();
      onState({ tone: 'info', message: 'Comparison link copied.' });
    } catch {
      onState({ tone: 'error', message: 'The comparison link could not be copied. Copy the address from the browser bar instead.' });
    }
  };
  const png = async () => {
    if (!exportRoot.current) return;
    try {
      await downloadComparePng(exportRoot.current, `tokenbench-comparison-${date}.png`);
      onState({ tone: 'info', message: 'Comparison image downloaded.' });
    } catch {
      onState({ tone: 'error', message: 'The comparison image could not be generated. Use the CSV for exact values instead.' });
    }
  };
  const csv = () => {
    downloadCompareCsv(exportData, `tokenbench-comparison-${date}.csv`);
    onState({ tone: 'info', message: `Comparison CSV downloaded for ${data.models.length} models.` });
  };

  return <div className="compare-result-actions" role="group" aria-label="Share and export comparison">
    <button data-export-action="true" type="button" aria-label="Copy link to comparison" title="Copy link" onClick={() => { void copy(); }}><Link aria-hidden="true" size={18} /></button>
    <button data-export-action="true" type="button" aria-label="Download comparison image as PNG" title="Download PNG" onClick={() => { void png(); }}><ImageDown aria-hidden="true" size={18} /></button>
    <button data-export-action="true" type="button" aria-label="Download comparison data as CSV" title="Download CSV" onClick={csv}><Table2 aria-hidden="true" size={18} /></button>
  </div>;
}

function ResultBoundary({ contract, children }: {
  readonly contract: CompareContract | null;
  readonly children: (data: CompareData) => ReactNode;
}) {
  if (contract === null) return <p role="status">Loading illustrative comparison data.</p>;
  if (contract.status === 'unavailable' || contract.data === null) return <p role="alert">{contract.reason ?? 'Comparison data is unavailable.'}</p>;
  return <>{children(contract.data)}{contract.status === 'partial' ? <p className="fixture" role="status">Illustrative prototype data may be partial; unavailable facts remain labelled.</p> : null}</>;
}

function taskCost(model: PreviewModel): number | null {
  return model.taskEconomics.availability === 'available'
    ? model.taskEconomics.value.costUsdPerSuccessfulTask
    : null;
}

function ttft(model: PreviewModel): number | null {
  return model.runtime.availability === 'available'
    ? model.runtime.value.ttftP50Seconds
    : null;
}

function throughput(model: PreviewModel): number | null {
  return model.runtime.availability === 'available'
    ? model.runtime.value.outputTokensPerSecond
    : null;
}

export function PreviewComparePage({ match, data, adapter = fixtureAdapter }: PreviewComparePageProps) {
  const [state, setState] = useState<CompareState>(DEFAULT_COMPARE_STATE);
  const [routeStateApplied, setRouteStateApplied] = useState(false);
  const [contract, setContract] = useState<CompareContract | null>(() => parsePreviewComparePageData(data));
  const [directoryModels, setDirectoryModels] = useState<readonly PreviewModel[]>([]);
  const [resultsVisible, setResultsVisible] = useState(false);
  const [revealResults, setRevealResults] = useState(false);
  const [actionState, setActionState] = useState<CompareActionState>(null);
  const resultRef = useRef<HTMLElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setState(decodeCompareState(match.search));
    setResultsVisible(decodeCompareState(match.search).modelIds.length >= 2);
    setRouteStateApplied(true);
  }, [match.search]);
  useEffect(() => {
    let active = true;
    void adapter.models({}).then((next) => {
      if (active && next.data) setDirectoryModels(next.data.models);
    });
    return () => { active = false; };
  }, [adapter]);
  useEffect(() => {
    let active = true;
    void adapter.comparison({ modelIds: state.modelIds }).then((next) => { if (active) setContract(next); });
    return () => { active = false; };
  }, [adapter, state.modelIds]);
  useEffect(() => {
    if (!routeStateApplied || typeof window === 'undefined') return;
    const query = encodeCompareState(state).toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }, [routeStateApplied, state]);
  useEffect(() => {
    if (!resultsVisible || !revealResults) return;
    resultRef.current?.focus({ preventScroll: true });
    resultRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    setRevealResults(false);
  }, [resultsVisible, revealResults]);

  const selectedModels = useMemo(() => selectedModelsInOrder(state.modelIds, contract?.data?.models ?? []), [contract?.data?.models, state.modelIds]);
  const selectedDirectoryModels = useMemo(() => selectedModelsInOrder(state.modelIds, directoryModels), [directoryModels, state.modelIds]);
  const capability = useMemo(() => capabilityRows(selectedModels), [selectedModels]);
  const decision = useMemo(() => decisionRows(selectedModels), [selectedModels]);
  const allRows = useMemo(() => [...capability, ...decision], [capability, decision]);
  const title = state.modelIds.length === 2 && selectedModels.length === 2
    ? `${modelName(selectedModels[0]!)} vs ${modelName(selectedModels[1]!)}`
    : `${state.modelIds.length}-model comparison`;
  const unavailableCount = Math.max(0, state.modelIds.length - selectedModels.length);
  const runComparison = () => {
    if (state.modelIds.length < 2) return;
    setResultsVisible(true);
    setRevealResults(true);
  };
  const updateSelection = (modelIds: readonly string[]) => {
    setState({ modelIds });
    setActionState(null);
    if (modelIds.length < 2) setResultsVisible(false);
  };

  return <div className="content-stack preview-compare-page">
    <header className="panel" aria-labelledby="compare-page-heading"><p className="eyebrow">Illustrative prototype data</p><h1 id="compare-page-heading">Compare models</h1><p>Choose 2–4 models, then inspect capability, runtime, cost, context and lifecycle differences without collapsing unlike evidence.</p></header>
    <section className="panel compare-selector-panel" aria-labelledby="compare-selector-title">
      <div className="compare-selector-head"><div><p className="eyebrow">Start here</p><h2 id="compare-selector-title">Choose 2–4 models</h2><p>Search and add at least two models, then add up to two more if needed. Selections from the Models workbench arrive here prefilled.</p></div><div className="selection-progress" aria-live="polite"><span>Selected</span><strong>{state.modelIds.length} / {MAX_COMPARE_MODELS}</strong></div></div>
      <div className="compare-composer"><div><span className="eyebrow">Selected models</span><SelectionChips modelIds={state.modelIds} models={selectedDirectoryModels} onRemove={(id) => updateSelection(removeCompareModel(state.modelIds, id))} /></div><ModelPicker models={directoryModels} selectedIds={state.modelIds} onAdd={(id) => updateSelection(addCompareModel(state.modelIds, id))} /></div>
      <div className="selector-actions"><p role="status">{state.modelIds.length === 0 ? 'Add at least two models to begin.' : state.modelIds.length === 1 ? '1 of 4 selected · add one more model to compare.' : `${state.modelIds.length} of 4 selected · ready to compare.${state.modelIds.length < 4 ? ` Add up to ${MAX_COMPARE_MODELS - state.modelIds.length} more model${state.modelIds.length === 3 ? '' : 's'} if needed.` : ''}`}</p><button className="button" disabled={state.modelIds.length < 2} onClick={runComparison} type="button">{state.modelIds.length >= 2 ? `Compare ${state.modelIds.length} models` : 'Compare models'}</button></div>
    </section>
    {resultsVisible ? <section className="compare-result-panel" id="compare-result" ref={resultRef} tabIndex={-1} aria-labelledby="result-title">
      <div className="compare-result-head"><div><p className="eyebrow">Review result</p><h2 id="result-title">{title}</h2></div><ResultActions data={{ models: selectedModels, rows: allRows }} exportRoot={exportRef} onState={setActionState} /></div>
      {actionState ? <p role="status" data-tone={actionState.tone}>{actionState.message}</p> : null}
      {unavailableCount > 0 ? <p role="status">{unavailableCount} selected model{unavailableCount === 1 ? '' : 's'} do not have approved comparison fixtures yet and remain in the selection above.</p> : null}
      <ResultBoundary contract={contract}>{() => selectedModels.length > 0 ? <div ref={exportRef}>
        <div className="grid-2 compare-summary-grid">
          <section className="panel compare-radar-panel" aria-labelledby="compare-radar-title"><h3 id="compare-radar-title">Six-domain capability overlay</h3><p className="fixture">Normalized fixture scores · identical axes</p><div className="compare-chart-wrap compare-radar-wrap"><PopularChartCanvas ariaLabel={`Capability comparison radar for ${selectedModels.map(modelName).join(', ')}`} configuration={radarChart(selectedModels)} /></div></section>
          <section className="panel compare-capability-panel" aria-labelledby="compare-capability-title"><h3 id="compare-capability-title">Exact capability values</h3><ComparisonMatrix ariaLabel="Exact capability comparison" id="compare-capability-matrix" models={selectedModels} rows={capability} /></section>
        </div>
        <section className="panel compare-economics-panel" aria-labelledby="compare-economics-title"><h3 id="compare-economics-title">Runtime and route economics</h3><p className="fixture">Representative hosted-route fixtures · p50 · streaming · 1× concurrency</p><div className="grid-3 compare-bars"><div><span>Cost per successful task</span><div className="compare-chart-wrap"><PopularChartCanvas ariaLabel={`Cost comparison for ${selectedModels.map(modelName).join(', ')}`} configuration={barChart('Cost per successful task', selectedModels, selectedModels.map(taskCost))} /></div></div><div><span>TTFT (seconds)</span><div className="compare-chart-wrap"><PopularChartCanvas ariaLabel={`Time to first token comparison for ${selectedModels.map(modelName).join(', ')}`} configuration={barChart('TTFT', selectedModels, selectedModels.map(ttft))} /></div></div><div><span>Throughput (tok/s)</span><div className="compare-chart-wrap"><PopularChartCanvas ariaLabel={`Throughput comparison for ${selectedModels.map(modelName).join(', ')}`} configuration={barChart('Throughput', selectedModels, selectedModels.map(throughput))} /></div></div></div></section>
        <section className="panel compare-decision-panel" aria-labelledby="compare-decision-title"><h3 id="compare-decision-title">Decision deltas</h3><p className="fixture">Tabulated specs for quick comparison.</p><ComparisonMatrix ariaLabel="Itemized model comparison" id="compare-specification-matrix" models={selectedModels} rows={decision} /><p className="fixture">Sources and freshness · route, benchmark and lifecycle records are staging fixtures. Missing evidence remains unavailable.</p></section>
      </div> : <p role="status">No approved fixture data is available for the selected models.</p>}</ResultBoundary>
    </section> : null}
  </div>;
}
