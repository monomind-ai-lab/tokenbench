import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { ChartConfiguration } from 'chart.js';
import { PopularChartCanvas } from '../frontend/popular-models/chart-canvas';
import { fixtureAdapter } from '../frontend/preview-data/adapter';
import { ACCEPTED_CUSTOM_RANKING_QUERY, type PreviewDataAdapter, type PreviewModel, type RankingData, type UiDataContractV1 } from '../frontend/preview-data/contracts';
import { buildWeightedRanking, WEIGHTED_RANKING_CAPABILITIES, type WeightedRankingCapability, type WeightedRankingModel, type WeightedRankingRow } from '../frontend/preview-workbench/weighted-ranking';
import { copyWeightedRankingLink, downloadWeightedRankingCsv, downloadWeightedRankingPng, weightedRankingShareUrl } from '../frontend/preview-workbench/weighted-ranking-export';
import { DEFAULT_WEIGHTED_RANKING_STATE, encodeWeightedRankingState, normalizeWeightedRankingSelection, weightedRankingStateFromQuery, type WeightedRankingState } from '../frontend/preview-workbench/weighted-ranking-state';
import type { PreviewPageProps } from '../preview/route-types';

type RankingContract = UiDataContractV1<RankingData>;
type ActionState = { readonly tone: 'info' | 'error'; readonly message: string } | null;

interface MakeItYoursPageProps extends PreviewPageProps { readonly adapter?: PreviewDataAdapter; }

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

/** Rejects incomplete static envelopes before hydration reads ranking evidence. */
export function parseMakeItYoursPageData(value: unknown): RankingContract | null {
  if (!isRecord(value) || value.contractVersion !== 'ui-data-contract/v1' || !Array.isArray(value.provenance)) return null;
  if (value.status === 'unavailable') return value.data === null ? value as unknown as RankingContract : null;
  return isRecord(value.data) && Array.isArray(value.data.models) && value.data.models.every((entry) => isRecord(entry) && isRecord(entry.model)) ? value as unknown as RankingContract : null;
}

function available<T>(value: { readonly availability: string; readonly value?: T }): T | null { return value.availability === 'available' && value.value !== undefined ? value.value : null; }
function profileHref(row: Pick<WeightedRankingRow, 'id'>): string { return `/model-profile?model=${encodeURIComponent(row.id)}`; }

/** Converts only explicit six-axis, runtime, and blended-cost evidence; it never fills a missing axis from composite score. */
function toWeightedModel(model: PreviewModel): WeightedRankingModel | null {
  const identity = available(model.identity);
  const access = available(model.access);
  const capability = available(model.capability);
  const runtime = available(model.runtime);
  const pricing = available(model.routePricing);
  const cost = pricing?.blendedUsdPerMillion ? available(pricing.blendedUsdPerMillion) : null;
  if (!identity || !access || !capability || !runtime || !pricing || cost === null) return null;
  const axes = new Map(capability.radar.map((axis) => [axis.key, axis.percentile]));
  const scores: Partial<Record<WeightedRankingCapability, number>> = {};
  for (const key of WEIGHTED_RANKING_CAPABILITIES) {
    const score = axes.get(key);
    if (typeof score !== 'number' || !Number.isFinite(score)) return null;
    scores[key] = score;
  }
  return { id: model.id, name: identity.name, provider: identity.provider, access, cost, ttft: runtime.ttftP50Seconds, throughput: runtime.outputTokensPerSecond, scores };
}

function rankingModels(contract: RankingContract | null): { readonly models: readonly WeightedRankingModel[]; readonly unavailableCount: number } {
  const models = contract?.data?.models.flatMap((entry) => {
    const model = toWeightedModel(entry.model);
    return model ? [model] : [];
  }) ?? [];
  return { models, unavailableCount: Math.max(0, (contract?.data?.models.length ?? 0) - models.length) };
}

function updateUrl(state: WeightedRankingState): void {
  if (typeof window === 'undefined') return;
  const search = encodeWeightedRankingState(state).toString();
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`);
}

function chartConfiguration(rows: readonly WeightedRankingRow[], label: string, values: (row: WeightedRankingRow) => number, passes: (row: WeightedRankingRow) => boolean = (row) => row.meetsSla): ChartConfiguration<'bar'> {
  return { type: 'bar', data: { labels: rows.map((row) => row.name), datasets: [{ label, data: rows.map(values), backgroundColor: rows.map((row) => passes(row) ? '#4f46e5' : '#9ca3af'), borderRadius: 4 }] }, options: { maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } } } };
}

function scoreCostConfiguration(rows: readonly WeightedRankingRow[]): ChartConfiguration<'scatter'> {
  const frontier = rows.filter((row) => row.frontier);
  return { type: 'scatter', data: { datasets: [{ label: 'Visible models', data: rows.map((row) => ({ x: row.cost, y: row.score })), backgroundColor: '#4f46e5', pointRadius: 5 }, { label: 'Weighted frontier', data: frontier.map((row) => ({ x: row.cost, y: row.score })), borderColor: '#d946ef', backgroundColor: '#d946ef', showLine: true, pointRadius: 4 }] }, options: { maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { x: { type: 'logarithmic', title: { display: true, text: 'Blended $ / 1M' } }, y: { title: { display: true, text: 'Weighted score' } } } } };
}

function chartOptionId(chartId: string, modelId: string): string { return `${chartId}-option-${modelId}`.replace(/[^A-Za-z0-9_-]/gu, '-'); }

function ChartSelection({ chartId, label, rows, onOpen }: { readonly chartId: string; readonly label: string; readonly rows: readonly WeightedRankingRow[]; readonly onOpen: (row: WeightedRankingRow) => void; }) {
  const [index, setIndex] = useState(0);
  const activeIndex = Math.min(index, Math.max(0, rows.length - 1));
  const active = rows[activeIndex];
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!rows.length) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); setIndex((current) => Math.min(rows.length - 1, current + 1)); }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); setIndex((current) => Math.max(0, current - 1)); }
    if (event.key === 'Home') { event.preventDefault(); setIndex(0); }
    if (event.key === 'End') { event.preventDefault(); setIndex(rows.length - 1); }
    if ((event.key === 'Enter' || event.key === ' ') && active) { event.preventDefault(); onOpen(active); }
  };
  return <div className="weighted-chart-selection" tabIndex={0} role="listbox" aria-label={`${label} chart model selection`} aria-activedescendant={active ? chartOptionId(chartId, active.id) : undefined} onKeyDown={onKeyDown}>
    <span className="sr-only">{rows.map((row, rowIndex) => <span id={chartOptionId(chartId, row.id)} key={row.id} role="option" aria-selected={rowIndex === activeIndex}>{row.name} · {row.provider}</span>)}</span>
    <p className="fixture">{active ? `${active.name} selected. Use Left and Right Arrow to choose a model, then Enter or Space to open its profile.` : 'No models are available to select.'}</p>
  </div>;
}

function RankingTable({ rows, selectedIds, onToggle, ariaLabel = 'Weighted ranking evidence' }: { readonly rows: readonly WeightedRankingRow[]; readonly selectedIds: readonly string[]; readonly onToggle: (id: string) => void; readonly ariaLabel?: string; }) {
  return <div className="table-wrap" role="region" aria-label={ariaLabel} tabIndex={0}><table aria-label={ariaLabel}><thead><tr><th scope="col">Rank</th><th scope="col">Model / profile</th><th scope="col">Provider</th><th scope="col">Weighted score</th><th scope="col">Blended $ / 1M</th><th scope="col">TTFT</th><th scope="col">Throughput</th><th scope="col">SLA result</th><th scope="col">Compare</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.id}><td>{index + 1}</td><th scope="row"><a href={profileHref(row)}>{row.name}</a></th><td>{row.provider}</td><td>{row.score.toFixed(1)}</td><td>${row.cost.toFixed(2)}</td><td>{row.ttft.toFixed(2)}s</td><td>{row.throughput.toFixed(0)} tok/s</td><td>{row.meetsSla ? 'Pass' : 'Outside threshold'}</td><td><button type="button" aria-pressed={selectedIds.includes(row.id)} onClick={() => onToggle(row.id)}>{selectedIds.includes(row.id) ? 'Selected' : 'Compare'}</button></td></tr>)}</tbody></table></div>;
}

function RankingCards({ rows, selectedIds, onToggle }: { readonly rows: readonly WeightedRankingRow[]; readonly selectedIds: readonly string[]; readonly onToggle: (id: string) => void; }) {
  return <div className="grid-3">{rows.map((row, index) => <article className="panel rank-card model-card" key={row.id}><span className="tag">#{index + 1} · {row.provider}</span><h3 className="subhead"><a href={profileHref(row)}>{row.name}</a></h3><p>Weighted score {row.score.toFixed(1)} · ${row.cost.toFixed(2)} / 1M</p><p>TTFT {row.ttft.toFixed(2)}s · {row.throughput.toFixed(0)} tok/s · {row.meetsSla ? 'Pass' : 'Outside SLA'}</p><button type="button" aria-pressed={selectedIds.includes(row.id)} onClick={() => onToggle(row.id)}>{selectedIds.includes(row.id) ? 'Remove from comparison' : 'Select for comparison'}</button></article>)}</div>;
}

function SlaTable({ rows, metric }: { readonly rows: readonly WeightedRankingRow[]; readonly metric: 'ttft' | 'throughput' }) {
  const tableLabel = metric === 'ttft' ? 'Exact TTFT measurements' : 'Exact throughput measurements';
  return <div className="table-wrap" role="region" aria-label={tableLabel} tabIndex={0}><table aria-label={tableLabel}><thead><tr><th scope="col">Model</th><th scope="col">{metric === 'ttft' ? 'TTFT' : 'Throughput'}</th><th scope="col">Result</th><th scope="col">Other metric</th><th scope="col">Eligibility</th></tr></thead><tbody>{rows.map((row) => {
    const passesMetric = metric === 'ttft' ? row.meetsTtft : row.meetsThroughput;
    const value = metric === 'ttft' ? `${row.ttft.toFixed(2)}s` : `${row.throughput.toFixed(0)} tok/s`;
    const other = metric === 'ttft' ? `${row.throughput.toFixed(0)} tok/s` : `${row.ttft.toFixed(2)}s`;
    return <tr key={row.id}><th scope="row"><a href={profileHref(row)}>{row.name}</a></th><td>{value}</td><td>{passesMetric ? 'Pass' : 'Outside threshold'}</td><td>{other}</td><td>{row.meetsSla ? 'Eligible' : 'Excluded when outside-SLA models are hidden'}</td></tr>;
  })}</tbody></table></div>;
}

function sortByTtft(rows: readonly WeightedRankingRow[]): readonly WeightedRankingRow[] { return rows.slice().sort((left, right) => left.ttft - right.ttft || right.score - left.score || left.id.localeCompare(right.id)); }
function sortByThroughput(rows: readonly WeightedRankingRow[]): readonly WeightedRankingRow[] { return rows.slice().sort((left, right) => right.throughput - left.throughput || right.score - left.score || left.id.localeCompare(right.id)); }
function sortByCost(rows: readonly WeightedRankingRow[]): readonly WeightedRankingRow[] { return rows.slice().sort((left, right) => left.cost - right.cost || right.score - left.score || left.id.localeCompare(right.id)); }

export function MakeItYoursPage({ match, data, adapter = fixtureAdapter }: MakeItYoursPageProps) {
  const staticContract = parseMakeItYoursPageData(data);
  const [contract, setContract] = useState<RankingContract | null>(staticContract);
  const [state, setState] = useState<WeightedRankingState>(() => weightedRankingStateFromQuery(match.search));
  const [actionState, setActionState] = useState<ActionState>(null);
  const exportRef = useRef<HTMLElement>(null);
  useEffect(() => { setState(weightedRankingStateFromQuery(match.search)); }, [match.search]);
  useEffect(() => { let active = true; void adapter.rankings(ACCEPTED_CUSTOM_RANKING_QUERY).then((next) => { if (active) setContract(next); }); return () => { active = false; }; }, [adapter]);
  useEffect(() => { updateUrl(state); }, [state]);

  const dataModels = useMemo(() => rankingModels(contract), [contract]);
  const ranking = useMemo(() => buildWeightedRanking({ models: dataModels.models, weights: state.weights, filters: state }), [dataModels.models, state]);
  const selectionRanking = useMemo(() => buildWeightedRanking({ models: dataModels.models, weights: state.weights, filters: state, limit: dataModels.models.length }), [dataModels.models, state]);
  const providers = useMemo<readonly string[]>(() => Array.from<string>(new Set(dataModels.models.map((model) => model.provider))).sort((left, right) => left.localeCompare(right)), [dataModels.models]);
  const ttftRows = useMemo(() => sortByTtft(ranking.candidates), [ranking.candidates]);
  const throughputRows = useMemo(() => sortByThroughput(ranking.candidates), [ranking.candidates]);
  const costRows = useMemo(() => sortByCost(ranking.rows), [ranking.rows]);
  const selectedRows = state.selectedModelIds.flatMap((id) => {
    const row = selectionRanking.candidates.find((candidate) => candidate.id === id);
    return row ? [row] : [];
  });
  const changeState = (next: Partial<WeightedRankingState>) => { setActionState(null); setState((current) => ({ ...current, ...next })); };
  const toggleSelected = (id: string) => setState((current) => {
    const selectedModelIds = current.selectedModelIds.includes(id) ? current.selectedModelIds.filter((candidate) => candidate !== id) : normalizeWeightedRankingSelection([...current.selectedModelIds, id]);
    if (!current.selectedModelIds.includes(id) && selectedModelIds.length === current.selectedModelIds.length) setActionState({ tone: 'error', message: 'Comparison is limited to four models. Remove one before adding another.' });
    return { ...current, selectedModelIds };
  });
  const openProfile = (row: WeightedRankingRow) => { window.location.assign(profileHref(row)); };
  const exportRows = ranking.rows.map((row) => ({ id: row.id, name: row.name, provider: row.provider, score: row.score, cost: row.cost, meetsSla: row.meetsSla, frontier: row.frontier }));
  const currentUrl = () => weightedRankingShareUrl(typeof window === 'undefined' ? `https://tokenbench.test${match.pathname}` : window.location.href, state);
  const date = '2026-08-17';
  if (contract?.status === 'unavailable' || contract?.data === null) return <p role="alert">{contract?.reason ?? 'Weighted ranking data is unavailable.'}</p>;

  return <div className="content-stack make-it-yours-page" ref={exportRef}>
    <header className="panel" aria-labelledby="make-it-yours-heading"><p className="eyebrow">Illustrative prototype data</p><h1 id="make-it-yours-heading">Make it yours</h1><p>Make the ranking reflect a deployment priority. Six weights normalize into one score; operational thresholds remain independent, visible constraints.</p></header>
    <section className="panel leaderboard-weighting-panel" aria-labelledby="weighting-title"><div className="toolbar"><div><h2 id="weighting-title">Capability weighting matrix</h2><p>Composite = Σ(domain score × weight) / Σ(active weights). Throughput stays visible as a service-level measurement.</p></div><button type="button" onClick={() => changeState({ weights: DEFAULT_WEIGHTED_RANKING_STATE.weights })}>Reset default weights</button></div><div className="slider-grid leaderboard-slider-grid">{WEIGHTED_RANKING_CAPABILITIES.map((capability) => <label key={capability} htmlFor={`weight-${capability}`}><span className="label">{capability[0]!.toUpperCase() + capability.slice(1)} <b>{Math.round(state.weights[capability])}%</b></span><input id={`weight-${capability}`} aria-label={`${capability[0]!.toUpperCase() + capability.slice(1)} weight`} type="range" min="0" max="100" value={state.weights[capability]} onChange={(event) => changeState({ weights: { ...state.weights, [capability]: Number(event.currentTarget.value) } })} /></label>)}</div>{!ranking.valid ? <p role="alert">{ranking.reason}</p> : null}</section>
    <section className="leaderboard-analysis" id="weighted-ranking" aria-labelledby="weighted-ranking-title">
      <div className="toolbar"><div><h2 id="weighted-ranking-title">Weighted ranking</h2><p className="fixture">Illustrative prototype data · list view is the default semantic result.</p></div><div role="group" aria-label="Share and export leaderboard"><button data-export-action="true" type="button" onClick={() => { void copyWeightedRankingLink(currentUrl()).then(() => setActionState({ tone: 'info', message: 'Link copied with the current filters, weights, thresholds, and selection.' })).catch(() => setActionState({ tone: 'error', message: 'The link could not be copied. Copy the address from the browser bar instead.' })); }}>Copy link</button><button data-export-action="true" type="button" onClick={() => { if (!exportRef.current) return; void downloadWeightedRankingPng(exportRef.current, `tokenbench-weighted-ranking-${date}.png`).then(() => setActionState({ tone: 'info', message: 'Leaderboard image downloaded.' })).catch(() => setActionState({ tone: 'error', message: 'The image could not be generated. Use the CSV for exact values instead.' })); }}>Download PNG</button><button data-export-action="true" type="button" onClick={() => { downloadWeightedRankingCsv(exportRows, `tokenbench-weighted-ranking-${date}.csv`); setActionState({ tone: 'info', message: `CSV downloaded with ${exportRows.length} visible models.` }); }}>Download CSV</button></div></div>
      {actionState ? <p role="status" data-tone={actionState.tone}>{actionState.message}</p> : null}
      <section className="panel" aria-label="Leaderboard filters"><div className="control-row" role="group" aria-label="Model access filter">{(['all', 'open', 'closed'] as const).map((access) => <button key={access} type="button" aria-pressed={state.access === access} onClick={() => changeState({ access })}>{access === 'all' ? 'All' : access === 'open' ? 'Open weight' : 'Closed'}</button>)}</div><fieldset><legend>Providers</legend>{providers.map((provider) => <label key={provider}><input type="checkbox" checked={state.providers.includes(provider)} onChange={() => changeState({ providers: state.providers.includes(provider) ? state.providers.filter((candidate) => candidate !== provider) : [...state.providers, provider] })} />{provider}</label>)}</fieldset><label>Maximum TTFT <b>≤ {state.maxTtft.toFixed(2)}s</b><input aria-label="Maximum TTFT" type="range" min="0.2" max="1.2" step="0.05" value={state.maxTtft} onChange={(event) => changeState({ maxTtft: Number(event.currentTarget.value) })} /></label><label>Minimum throughput <b>≥ {state.minThroughput} tok/s</b><input aria-label="Minimum throughput" type="range" min="20" max="140" step="5" value={state.minThroughput} onChange={(event) => changeState({ minThroughput: Number(event.currentTarget.value) })} /></label><label><input type="checkbox" checked={state.showOutsideSla} onChange={(event) => changeState({ showOutsideSla: event.currentTarget.checked })} />Show outside SLA</label></section>
      {dataModels.unavailableCount > 0 ? <p role="status">{dataModels.unavailableCount} ranking fixture model{dataModels.unavailableCount === 1 ? '' : 's'} lack complete six-axis or blended-cost evidence and remain unavailable for weighted ranking.</p> : null}
      {!ranking.valid ? <p role="status">Ranking is paused until at least one capability weight is above zero.</p> : ranking.rows.length === 0 ? <p role="status">No visible weighted results. Reset a filter or show outside-SLA models to restore the score and cost evidence.</p> : <>
        <p role="status">Live result: {ranking.rows[0]?.name} leads at {ranking.rows[0]?.score.toFixed(1)}. Showing {ranking.rows.length} of {ranking.candidates.length} filtered candidates; {ranking.rows.filter((row) => row.meetsSla).length} meet both SLA thresholds.</p>
        <div className="grid-2 leaderboard-analysis-grid"><section className="panel ranking-panel"><h2>Weighted score ranking</h2><div className="chart-wrap ranking-chart"><PopularChartCanvas ariaLabel="Horizontal weighted model ranking" configuration={chartConfiguration(ranking.chartRows, 'Weighted score', (row) => row.score)} /></div><ChartSelection chartId="weighted-ranking" label="Weighted model ranking" rows={ranking.chartRows} onOpen={openProfile} /><details open><summary>Semantic ranking table</summary><RankingTable rows={ranking.tableRows} selectedIds={state.selectedModelIds} onToggle={toggleSelected} /></details></section><section className="panel service-level-panel"><h2>Service-level filter</h2><strong>{ranking.candidates.filter((row) => row.meetsSla).length} / {ranking.candidates.length} pass</strong><div className="grid-2 leaderboard-sla-charts"><div><h3>TTFT (seconds)</h3><div className="chart-wrap short"><PopularChartCanvas ariaLabel="Time-to-first-token measurements by model" configuration={chartConfiguration(ttftRows, 'TTFT', (row) => row.ttft, (row) => row.meetsTtft)} /></div><ChartSelection chartId="ttft" label="TTFT" rows={ttftRows} onOpen={openProfile} /><details open><summary>Exact TTFT measurements</summary><SlaTable rows={ttftRows} metric="ttft" /></details></div><div><h3>Output speed (tok/s)</h3><div className="chart-wrap short"><PopularChartCanvas ariaLabel="Output-throughput measurements by model" configuration={chartConfiguration(throughputRows, 'Throughput', (row) => row.throughput, (row) => row.meetsThroughput)} /></div><ChartSelection chartId="throughput" label="Throughput" rows={throughputRows} onOpen={openProfile} /><details open><summary>Exact throughput measurements</summary><SlaTable rows={throughputRows} metric="throughput" /></details></div></div></section></div>
        <section className="weighted-insights" id="weighted-score-cost" aria-labelledby="weighted-score-cost-title"><div className="toolbar"><div><h2 id="weighted-score-cost-title">Weighted score vs. cost</h2><p className="fixture">Current visible result set · blended $ / 1M uses logarithmic cost spacing.</p></div><button type="button" onClick={() => { void copyWeightedRankingLink(weightedRankingShareUrl(currentUrl().href, state, 'weighted-score-cost')).then(() => setActionState({ tone: 'info', message: 'Weighted score insight link copied.' })).catch(() => setActionState({ tone: 'error', message: 'The weighted score insight link could not be copied.' })); }}>Copy insight link</button></div><div className="grid-2 weighted-insights-grid"><section className="panel weighted-insight-panel"><h3>Score frontier</h3><div className="chart-wrap weighted-insight-chart"><PopularChartCanvas ariaLabel="Weighted score versus blended cost for visible models" configuration={scoreCostConfiguration(ranking.chartRows)} /></div><ChartSelection chartId="weighted-score-cost" label="Weighted score versus blended cost" rows={ranking.chartRows} onOpen={openProfile} /><details><summary>Exact weighted score and cost values</summary><RankingTable rows={ranking.tableRows} selectedIds={state.selectedModelIds} onToggle={toggleSelected} ariaLabel="Exact weighted score and cost values" /></details></section><section className="panel weighted-insight-panel"><h3>Cheapest-first score ranking</h3><div className="chart-wrap weighted-insight-chart weighted-cost-chart"><PopularChartCanvas ariaLabel="Weighted score ranking by blended cost" configuration={chartConfiguration(costRows, 'Weighted score', (row) => row.score)} /></div><ChartSelection chartId="weighted-cost-ranking" label="Cheapest-first score ranking" rows={costRows} onOpen={openProfile} /><details><summary>Exact cheapest-first weighted score values</summary><RankingTable rows={costRows} selectedIds={state.selectedModelIds} onToggle={toggleSelected} ariaLabel="Exact cheapest-first weighted score values" /></details></section></div></section>
        {selectedRows.length >= 2 ? <aside className="compare-tray panel" role="region" aria-labelledby="weighted-comparison-title"><div className="toolbar"><div><h2 id="weighted-comparison-title">Quick comparison</h2><p>{selectedRows.length} of 4 models selected · current ranking weights remain applied.</p></div><button type="button" onClick={() => changeState({ selectedModelIds: [] })}>Clear</button></div><ul aria-label="Selected comparison models">{selectedRows.map((row) => <li key={row.id}><a href={profileHref(row)}>{row.name}</a> <button type="button" aria-label={`Remove ${row.name} from comparison`} onClick={() => toggleSelected(row.id)}>Remove</button></li>)}</ul><a href={`/compare?models=${encodeURIComponent(selectedRows.map((row) => row.id).join(','))}`}>Open in-depth comparison</a></aside> : null}
        <section className="leaderboard-output-section" aria-labelledby="ranked-output-title"><div className="toolbar"><div><h2 id="ranked-output-title">Ranked output</h2><p className="fixture">Illustrative prototype data</p></div><div role="group" aria-label="Ranked output view"><button type="button" aria-pressed={state.view === 'cards'} onClick={() => changeState({ view: 'cards' })}>Cards view</button><button type="button" aria-pressed={state.view === 'rows'} onClick={() => changeState({ view: 'rows' })}>Table view</button></div></div>{state.view === 'rows' ? <RankingTable rows={ranking.tableRows} selectedIds={state.selectedModelIds} onToggle={toggleSelected} ariaLabel="Ranked output table" /> : <RankingCards rows={ranking.rows} selectedIds={state.selectedModelIds} onToggle={toggleSelected} />}</section>
      </>}
    </section>
  </div>;
}
