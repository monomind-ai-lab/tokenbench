import { useEffect, useState, type ReactNode } from 'react';
import type { PreviewPageProps } from '../preview/route-types';
import { fixtureAdapter } from '../frontend/preview-data/adapter';
import type {
  EvidenceValue,
  ModelDirectoryData,
  ModelDirectoryQuery,
  ModelAccess,
  PreviewDataAdapter,
  PreviewModel,
  UiDataContractV1,
} from '../frontend/preview-data/contracts';
import {
  decodeModelWorkbenchState,
  DEFAULT_MODEL_WORKBENCH_STATE,
  encodeModelWorkbenchState,
  profileHref,
  type ModelWorkbenchState,
} from '../frontend/preview-workbench/model-state';

type ModelsContract = UiDataContractV1<ModelDirectoryData>;

interface PreviewModelsPageProps extends PreviewPageProps {
  readonly adapter?: PreviewDataAdapter;
}

interface ModelRow {
  readonly model: PreviewModel;
  readonly id: string;
  readonly name: string;
  readonly provider: string;
  readonly slug: string;
  readonly access: ModelAccess | null;
  readonly capability: number | null;
  readonly taskCost: number | null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function provenance(value: unknown): boolean {
  return isRecord(value)
    && text(value.id)
    && text(value.label)
    && (value.kind === 'illustrative_prototype' || value.kind === 'approved_manual' || value.kind === 'accepted_pipeline')
    && (value.effectiveAt === null || text(value.effectiveAt))
    && text(value.note);
}

function evidence(value: unknown, validValue: (candidate: unknown) => boolean): boolean {
  if (!isRecord(value)) return false;
  if (value.availability === 'unavailable') return text(value.reason);
  return value.availability === 'available' && validValue(value.value) && provenance(value.provenance);
}

function modelIdentity(value: unknown): boolean {
  return isRecord(value) && text(value.slug) && text(value.name) && text(value.provider);
}

function benchmarkRelease(value: unknown): boolean {
  return isRecord(value)
    && text(value.releaseOn)
    && Array.isArray(value.subtasks)
    && value.subtasks.every((subtask) => isRecord(subtask) && text(subtask.id) && text(subtask.label));
}

function capability(value: unknown): boolean {
  return isRecord(value)
    && finiteNumber(value.compositeScore)
    && Array.isArray(value.radar)
    && value.radar.every((axis) => isRecord(axis)
      && text(axis.key)
      && text(axis.label)
      && (axis.percentile === null || finiteNumber(axis.percentile))
      && (axis.rank === null || Number.isSafeInteger(axis.rank))
      && (axis.fieldSize === null || Number.isSafeInteger(axis.fieldSize)));
}

function cachePricing(value: unknown): boolean {
  return isRecord(value)
    && evidence(value.readUsdPerMillion, finiteNumber)
    && evidence(value.writeUsdPerMillion, finiteNumber);
}

function routePricing(value: unknown): boolean {
  return isRecord(value)
    && text(value.route)
    && finiteNumber(value.inputUsdPerMillion)
    && finiteNumber(value.outputUsdPerMillion)
    && evidence(value.cache, cachePricing);
}

function taskEconomics(value: unknown): boolean {
  return isRecord(value) && finiteNumber(value.costUsdPerSuccessfulTask) && text(value.workload);
}

function runtimeSla(value: unknown): boolean {
  return isRecord(value)
    && finiteNumber(value.ttftP50Seconds)
    && finiteNumber(value.outputTokensPerSecond)
    && text(value.conditions);
}

function lifecycle(value: unknown): boolean {
  return isRecord(value)
    && (value.status === 'Current' || value.status === 'Retirement scheduled')
    && evidence(value.sunsetOn, text);
}

function previewModel(value: unknown): boolean {
  return isRecord(value)
    && text(value.id)
    && evidence(value.identity, modelIdentity)
    && evidence(value.access, (access) => access === 'Proprietary' || access === 'Open weights')
    && evidence(value.benchmark, benchmarkRelease)
    && evidence(value.capability, capability)
    && evidence(value.routePricing, routePricing)
    && evidence(value.taskEconomics, taskEconomics)
    && evidence(value.runtime, runtimeSla)
    && evidence(value.lifecycle, lifecycle);
}

function isContract(value: unknown): value is ModelsContract {
  return isRecord(value)
    && value.contractVersion === 'ui-data-contract/v1'
    && (value.status === 'available' || value.status === 'partial' || value.status === 'unavailable')
    && typeof value.fetchedAt === 'string'
    && Array.isArray(value.provenance)
    && (value.data === null || (isRecord(value.data) && Array.isArray(value.data.models) && value.data.models.every(previewModel)));
}

/** Validates the small static payload boundary owned by the preview Models page. */
export function parsePreviewModelsPageData(value: unknown): ModelsContract | null {
  return isContract(value) ? value : null;
}

function valueOf<T>(evidence: EvidenceValue<T>): T | null {
  return evidence.availability === 'available' ? evidence.value : null;
}

function modelRow(model: PreviewModel): ModelRow | null {
  const identity = valueOf(model.identity);
  if (!identity) return null;
  return {
    model,
    id: model.id,
    name: identity.name,
    provider: identity.provider,
    slug: identity.slug,
    access: valueOf(model.access),
    capability: valueOf(model.capability)?.compositeScore ?? null,
    taskCost: valueOf(model.taskEconomics)?.costUsdPerSuccessfulTask ?? null,
  };
}

function money(value: number | null): string {
  return value === null ? 'Unavailable' : `$${value.toFixed(2)}`;
}

function score(value: number | null): string {
  return value === null ? 'Unavailable' : value.toFixed(1);
}

function visibleRows(data: ModelDirectoryData | null, state: ModelWorkbenchState): readonly ModelRow[] {
  const needle = state.search.trim().toLocaleLowerCase();
  const provider = state.provider?.toLocaleLowerCase() ?? null;
  const rows = (data?.models ?? [])
    .map(modelRow)
    .filter((row): row is ModelRow => row !== null)
    .filter((row) => (needle.length === 0 || [row.name, row.provider, row.slug]
      .some((value) => value.toLocaleLowerCase().includes(needle)))
      && (state.access === null || row.access === state.access)
      && (provider === null || row.provider.toLocaleLowerCase() === provider));
  return rows.slice().sort((left, right) => {
    if (state.sort === 'cost-asc') return (left.taskCost ?? Number.POSITIVE_INFINITY) - (right.taskCost ?? Number.POSITIVE_INFINITY)
      || left.name.localeCompare(right.name);
    if (state.sort === 'name-asc') return left.name.localeCompare(right.name);
    return (right.capability ?? Number.NEGATIVE_INFINITY) - (left.capability ?? Number.NEGATIVE_INFINITY)
      || left.name.localeCompare(right.name);
  });
}

function frontierRows(rows: readonly ModelRow[]): readonly ModelRow[] {
  return rows
    .filter((candidate) => candidate.capability !== null && candidate.taskCost !== null)
    .filter((candidate) => !rows.some((other) => other !== candidate
      && other.capability !== null
      && other.taskCost !== null
      && other.capability >= candidate.capability!
      && other.taskCost <= candidate.taskCost!
      && (other.capability > candidate.capability! || other.taskCost < candidate.taskCost!)))
    .slice()
    .sort((left, right) => left.taskCost! - right.taskCost! || right.capability! - left.capability! || left.name.localeCompare(right.name));
}

function queryFor(state: ModelWorkbenchState): ModelDirectoryQuery {
  return {
    search: state.search || undefined,
    access: state.access ?? undefined,
    provider: state.provider ?? undefined,
  };
}

function replaceWorkbenchUrl(state: ModelWorkbenchState): void {
  if (typeof window === 'undefined') return;
  const query = encodeModelWorkbenchState(state).toString();
  const search = query.length > 0 ? `?${query}` : '';
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${search}${window.location.hash}`);
}

function FrontierChart({ rows }: { readonly rows: readonly ModelRow[] }) {
  const plotted = rows.filter((row) => row.capability !== null && row.taskCost !== null);
  const frontier = frontierRows(rows);
  const maxCost = Math.max(...plotted.map((row) => row.taskCost ?? 0), 1);
  const minScore = Math.min(...plotted.map((row) => row.capability ?? 0), 0);
  const maxScore = Math.max(...plotted.map((row) => row.capability ?? 0), 1);
  const point = (row: ModelRow) => ({
    x: 40 + ((row.taskCost ?? 0) / maxCost) * 280,
    y: 160 - (((row.capability ?? minScore) - minScore) / Math.max(maxScore - minScore, 1)) * 120,
  });
  const connection = frontier.map((row) => {
    const position = point(row);
    return `${position.x.toFixed(2)},${position.y.toFixed(2)}`;
  }).join(' ');
  return <section className="panel" aria-labelledby="models-frontier-heading">
    <div className="panel-heading"><div><p className="eyebrow">Illustrative prototype data</p><h2 id="models-frontier-heading">Price–performance frontier</h2><p>Illustrative composite capability against representative successful-task cost.</p></div></div>
    <svg viewBox="0 0 360 200" role="img" aria-label="Price–performance frontier">
      <line x1="40" x2="320" y1="160" y2="160" aria-hidden="true" />
      <line x1="40" x2="40" y1="20" y2="160" aria-hidden="true" />
      {frontier.length > 1 ? <polyline data-frontier-connection="true" fill="none" points={connection} /> : null}
      {plotted.map((row) => {
        const position = point(row);
        return <g key={row.id}><circle cx={position.x} cy={position.y} r="5" /><text x={position.x} y={position.y - 9} textAnchor="middle">{row.name}</text></g>;
      })}
    </svg>
    <p>Frontier models from lowest cost to highest capability: {frontier.length ? frontier.map((row) => row.name).join(', ') : 'Unavailable'}.</p>
  </section>;
}

function ModelSelectionButton({ row, selected, onToggle }: {
  readonly row: ModelRow;
  readonly selected: boolean;
  readonly onToggle: (id: string) => void;
}) {
  return <button type="button" aria-pressed={selected} aria-label={`${selected ? 'Remove' : 'Select'} ${row.name} ${selected ? 'from' : 'for'} comparison`} onClick={() => onToggle(row.id)}>
    {selected ? 'Remove from comparison' : 'Select for comparison'}
  </button>;
}

function ModelCards({ rows, selectedModelIds, onToggle }: {
  readonly rows: readonly ModelRow[];
  readonly selectedModelIds: readonly string[];
  readonly onToggle: (id: string) => void;
}) {
  return <div className="grid-2" aria-label="Model catalog cards">{rows.map((row) => <article className="panel" key={row.id}>
    <p className="eyebrow">{row.provider} · {row.access ?? 'Unavailable'}</p>
    <h3><a href={profileHref(row.slug)}>{row.name}</a></h3>
    <dl><div><dt>Illustrative capability</dt><dd>{score(row.capability)}</dd></div><div><dt>Representative task cost</dt><dd>{money(row.taskCost)}</dd></div></dl>
    <ModelSelectionButton row={row} selected={selectedModelIds.includes(row.id)} onToggle={onToggle} />
  </article>)}</div>;
}

function ModelTable({ rows, selectedModelIds, onToggle }: {
  readonly rows: readonly ModelRow[];
  readonly selectedModelIds: readonly string[];
  readonly onToggle: (id: string) => void;
}) {
  return <div role="region" aria-label="Model catalog table" tabIndex={0}><table aria-label="Model catalog">
    <thead><tr><th scope="col">Model</th><th scope="col">Provider</th><th scope="col">Access</th><th scope="col">Illustrative capability</th><th scope="col">Representative task cost</th><th scope="col">Comparison</th></tr></thead>
    <tbody>{rows.map((row) => <tr key={row.id}><th scope="row"><a href={profileHref(row.slug)}>{row.name}</a></th><td>{row.provider}</td><td>{row.access ?? 'Unavailable'}</td><td>{score(row.capability)}</td><td>{money(row.taskCost)}</td><td><ModelSelectionButton row={row} selected={selectedModelIds.includes(row.id)} onToggle={onToggle} /></td></tr>)}</tbody>
  </table></div>;
}

function EvidenceBoundary({ contract, children }: {
  readonly contract: ModelsContract | null;
  readonly children: (data: ModelDirectoryData) => ReactNode;
}) {
  if (contract === null) return <p role="status">Loading illustrative model data.</p>;
  if (contract.status === 'unavailable' || contract.data === null) return <section className="panel" role="alert"><h1>Model data unavailable</h1><p>{contract.reason ?? 'No approved preview model data is available.'}</p></section>;
  return <>{children(contract.data)}{contract.status === 'partial' ? <p className="fixture" role="status">Illustrative prototype data may be partial; unavailable facts remain labelled.</p> : null}</>;
}

export function PreviewModelsPage({ match, data, adapter = fixtureAdapter }: PreviewModelsPageProps) {
  // The generated document is always the unfiltered /models payload. Apply a
  // direct URL's filters only after hydration so its first client tree matches
  // that static document exactly.
  const [state, setState] = useState<ModelWorkbenchState>(DEFAULT_MODEL_WORKBENCH_STATE);
  const [routeStateApplied, setRouteStateApplied] = useState(false);
  const [contract, setContract] = useState<ModelsContract | null>(() => parsePreviewModelsPageData(data));

  useEffect(() => {
    setState(decodeModelWorkbenchState(match.search));
    setRouteStateApplied(true);
  }, [match.search]);
  useEffect(() => {
    let active = true;
    void adapter.models(queryFor(state)).then((next) => { if (active) setContract(next); });
    return () => { active = false; };
  }, [adapter, state.access, state.provider, state.search]);
  useEffect(() => {
    if (routeStateApplied) replaceWorkbenchUrl(state);
  }, [routeStateApplied, state]);

  const update = (changes: Partial<ModelWorkbenchState>) => setState((current) => ({ ...current, ...changes }));
  const toggle = (id: string) => setState((current) => {
    const selected = current.selectedModelIds.includes(id)
      ? current.selectedModelIds.filter((candidate) => candidate !== id)
      : current.selectedModelIds.length < 4 ? [...current.selectedModelIds, id] : current.selectedModelIds;
    return { ...current, selectedModelIds: selected };
  });

  return <div className="content-stack preview-models-page">
    <header className="panel" aria-labelledby="models-workbench-heading"><p className="eyebrow">Illustrative prototype data</p><h1 id="models-workbench-heading">Models workbench</h1><p>Price, capability and service constraints in one working surface. Select two to four candidates only when you are ready to compare trade-offs.</p></header>
    <EvidenceBoundary contract={contract}>{(directory) => {
      const allRows = visibleRows(directory, state);
      const frontier = frontierRows(allRows);
      const rows = state.frontierOnly ? frontier : allRows;
      const providers = Array.from(new Set((directory.models ?? []).map(modelRow).filter((row): row is ModelRow => row !== null).map((row) => row.provider))).sort((left, right) => left.localeCompare(right));
      return <>
        <FrontierChart rows={allRows} />
        <section id="catalog" className="panel" aria-labelledby="catalog-heading">
          <div className="panel-heading"><div><p className="eyebrow">Illustrative prototype data</p><h2 id="catalog-heading">Catalog</h2><p>{rows.length} model{rows.length === 1 ? '' : 's'} shown.</p></div></div>
          <div role="group" aria-label="Catalog filters">
            <label htmlFor="models-workbench-search">Search model or provider</label><input id="models-workbench-search" type="search" value={state.search} onChange={(event) => update({ search: event.currentTarget.value })} />
            <label htmlFor="models-workbench-access">Access</label><select id="models-workbench-access" value={state.access ?? ''} onChange={(event) => update({ access: event.currentTarget.value === '' ? null : event.currentTarget.value as ModelAccess })}><option value="">All access</option><option value="Proprietary">Proprietary</option><option value="Open weights">Open weights</option></select>
            <label htmlFor="models-workbench-provider">Provider</label><select id="models-workbench-provider" value={state.provider ?? ''} onChange={(event) => update({ provider: event.currentTarget.value || null })}><option value="">All providers</option>{providers.map((provider) => <option key={provider} value={provider}>{provider}</option>)}</select>
            <label htmlFor="models-workbench-sort">Sort</label><select id="models-workbench-sort" value={state.sort} onChange={(event) => update({ sort: event.currentTarget.value as ModelWorkbenchState['sort'] })}><option value="capability-desc">Capability</option><option value="cost-asc">Cost</option><option value="name-asc">Name</option></select>
            <label><input type="checkbox" checked={state.frontierOnly} onChange={(event) => update({ frontierOnly: event.currentTarget.checked })} /> Frontier only</label>
            <button type="button" aria-pressed={state.view === 'cards'} onClick={() => update({ view: 'cards' })}>Cards view</button><button type="button" aria-pressed={state.view === 'table'} onClick={() => update({ view: 'table' })}>Table view</button>
          </div>
          {state.view === 'cards' ? <ModelCards rows={rows} selectedModelIds={state.selectedModelIds} onToggle={toggle} /> : <ModelTable rows={rows} selectedModelIds={state.selectedModelIds} onToggle={toggle} />}
          {rows.length === 0 ? <p role="status">No illustrative models match these filters.</p> : null}
        </section>
        {state.selectedModelIds.length >= 2 ? <section className="panel compare-tray" aria-label="Compare selected models">
          <h2>Compare selected models</h2><p>{state.selectedModelIds.length} of 4 models selected.</p><a href={`/compare?${new URLSearchParams({ models: state.selectedModelIds.join(',') }).toString()}`}>Open comparison</a><button type="button" onClick={() => update({ selectedModelIds: [] })}>Clear selection</button>
        </section> : null}
      </>;
    }}</EvidenceBoundary>
  </div>;
}
