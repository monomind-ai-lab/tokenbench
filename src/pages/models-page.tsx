import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppShell } from '../frontend/app-shell';
import { addCompareModel, removeCompareModel, CompareProvider, useCompareState } from '../frontend/compare-state';
import {
  parseModelDirectoryEnvelope,
  modelPath,
  type ModelDirectoryEntry,
  type ModelDirectoryEnvelope,
} from '../frontend/model-directory-contracts';
import { ModelDirectoryPareto } from '../frontend/model-directory-pareto';
import {
  DEFAULT_MODEL_DIRECTORY_QUERY,
  filterModelDirectoryEntries,
  modelDirectoryApiQuery,
  modelDirectoryQueryFromSearch,
  modelDirectoryUrl,
  type ModelDirectoryQueryState,
} from '../frontend/model-directory-state';
import { useSitePreferences } from '../frontend/site-preferences';
import { ROUTE_PATHS } from '../routing/routes';

const CATALOG_PAGE_SIZE = 12;

export interface ModelsPageProps {
  readonly envelope: ModelDirectoryEnvelope;
  readonly query?: ModelDirectoryQueryState;
  readonly onQueryChange?: (query: ModelDirectoryQueryState) => void;
  readonly requestError?: string | null;
  readonly loading?: boolean;
}

export interface ModelsAppProps {
  readonly initialEnvelope: ModelDirectoryEnvelope;
  readonly initialQuery?: ModelDirectoryQueryState;
}

function formatScore(value: number | null): string {
  return value === null ? 'Unavailable' : value.toFixed(2);
}

function formatPrice(value: number | null): string {
  return value === null ? 'Unavailable' : `$${value.toFixed(2)}`;
}

function formatEvidence(value: ModelDirectoryEntry['evidenceStatus']): string {
  return value === 'source_only' ? 'Source only' : value[0].toUpperCase() + value.slice(1);
}

function formatWeek(value: string | null): string {
  if (value === null) return 'No weekly snapshot';
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
}

function categorySummary(model: ModelDirectoryEntry): string {
  if (!model.strongestCategory) return 'Unavailable';
  return `${model.strongestCategory.label} · ${formatScore(model.strongestCategory.score)}`;
}

function priceSummary(model: ModelDirectoryEntry): string {
  if (!model.representativePrice) return 'Unavailable';
  const input = formatPrice(model.representativePrice.inputUsdPerMillion);
  const output = formatPrice(model.representativePrice.outputUsdPerMillion);
  return `${input} in / ${output} out per 1M`;
}

function blendedCost(model: ModelDirectoryEntry): number | null {
  const route = model.representativePrice;
  if (!route || route.inputUsdPerMillion === null || route.outputUsdPerMillion === null) return null;
  const value = (3 * route.inputUsdPerMillion + route.outputUsdPerMillion) / 4;
  return Number.isFinite(value) ? value : null;
}

function ModelDecisionFacts({ model }: { readonly model: ModelDirectoryEntry }) {
  return <dl className="model-decision-facts">
    <div><dt>Weekly rank</dt><dd>{model.weeklyRank === null ? 'Not in current top 100' : `#${model.weeklyRank}`}</dd></div>
    <div><dt>Overall</dt><dd>{formatScore(model.overallScore)}</dd></div>
    <div><dt>Strongest category</dt><dd>{categorySummary(model)}</dd></div>
    <div><dt>Direct API</dt><dd>{priceSummary(model)}</dd></div>
    <div><dt>Evidence</dt><dd>{formatEvidence(model.evidenceStatus)}</dd></div>
  </dl>;
}

function ModelLink({ model }: { readonly model: ModelDirectoryEntry }) {
  return <a className="model-name-link" href={modelPath(model.canonicalSlug)}>{model.displayName}</a>;
}

function ModelActions({ model, onCompare, surface }: { readonly model: ModelDirectoryEntry; readonly onCompare: (model: ModelDirectoryEntry) => void; readonly surface: 'catalog' | 'table' }) {
  return <div className="models-row-actions"><a className="button button-secondary button-small" href={modelPath(model.canonicalSlug)}>{`${model.displayName} profile`}</a><button className="button button-small" type="button" onClick={() => onCompare(model)}>{`Compare ${model.displayName} from ${surface}`}</button></div>;
}

function ModelDirectoryTable({ models, onCompare }: { readonly models: readonly ModelDirectoryEntry[]; readonly onCompare: (model: ModelDirectoryEntry) => void }) {
  return <div className="models-desktop-table" data-testid="models-desktop-table" role="region" aria-label="Model catalog table" tabIndex={0}>
    <table aria-label="Popular AI models">
      <thead><tr><th scope="col">Model</th><th scope="col">Decision facts</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
      <tbody>{models.map((model) => <tr className="model-directory-row" key={model.modelKey}>
        <th className="models-table-identity" scope="row"><ModelLink model={model} /><small>{model.creator} · {model.sourceType}</small></th>
        <td><ModelDecisionFacts model={model} /></td>
        <td><span className={`model-status model-status-${model.status}`}>{model.status === 'archived' ? 'Archived' : 'Current'}</span></td>
        <td><ModelActions model={model} onCompare={onCompare} surface="table" /></td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function ModelDirectoryCards({ models, onCompare }: { readonly models: readonly ModelDirectoryEntry[]; readonly onCompare: (model: ModelDirectoryEntry) => void }) {
  return <ul className="models-mobile-cards" data-testid="models-mobile-cards">{models.map((model) => <li className="model-card" key={model.modelKey}>
    <div className="model-card-heading"><span className={`model-status model-status-${model.status}`}>{model.status === 'archived' ? 'Archived' : 'Current'}</span>{model.weeklyRank === null ? null : <span className="model-card-rank">#{model.weeklyRank}</span>}</div>
    <h2><ModelLink model={model} /></h2>
    <p className="model-card-creator">{model.creator} · {model.sourceType}</p>
    <ModelDecisionFacts model={model} />
    <ModelActions model={model} onCompare={onCompare} surface="catalog" />
  </li>)}</ul>;
}

function activeFilterCount(query: ModelDirectoryQueryState): number {
  return [query.q, query.creator, query.provider, query.modality, query.sourceType, query.evidenceStatus, query.status !== 'current' ? query.status : null, query.sort !== 'rank' ? query.sort : null].filter(Boolean).length;
}

function ModelFilterForm({ query, envelope, onQueryChange, loading }: {
  readonly query: ModelDirectoryQueryState;
  readonly envelope: ModelDirectoryEnvelope;
  readonly onQueryChange?: (query: ModelDirectoryQueryState) => void;
  readonly loading: boolean;
}) {
  const [draft, setDraft] = useState(query);
  useEffect(() => setDraft(query), [query]);
  const creators = useMemo(() => Array.from(new Set(envelope.data.models.map((model) => model.creator))).sort((a, b) => a.localeCompare(b)), [envelope.data.models]);
  const providers = useMemo(() => Array.from(new Set(envelope.data.models.flatMap((model) => model.representativePrice ? [model.representativePrice.providerId] : []))).sort((a, b) => a.localeCompare(b)), [envelope.data.models]);
  const modalities = useMemo(() => Array.from(new Set(envelope.data.models.flatMap((model) => [
    ...(model.representativePrice?.inputModalities ?? []), ...(model.representativePrice?.outputModalities ?? []),
  ]))).sort((a, b) => a.localeCompare(b)), [envelope.data.models]);
  const update = (changes: Partial<ModelDirectoryQueryState>) => setDraft((current) => ({ ...current, ...changes, page: changes.page ?? 1 }));
  const apply = (next: ModelDirectoryQueryState) => onQueryChange?.(next);
  return <form className="models-filter-panel" onSubmit={(event) => { event.preventDefault(); apply(draft); }}>
    <div className="models-search-field"><label htmlFor="models-search">Search retained models</label><input id="models-search" type="search" name="q" value={draft.q} placeholder="Search model, creator, or slug" onChange={(event) => update({ q: event.target.value })} /></div>
    <div className="models-filter-fields">
      <label><span>Creator</span><select value={draft.creator ?? ''} onChange={(event) => { const next = { ...draft, creator: event.target.value || null, page: 1 }; setDraft(next); apply(next); }}><option value="">All creators</option>{creators.map((creator) => <option value={creator} key={creator}>{creator}</option>)}</select></label>
      <label><span>Provider</span><select value={draft.provider ?? ''} onChange={(event) => { const next = { ...draft, provider: event.target.value || null, page: 1 }; setDraft(next); apply(next); }}><option value="">All providers</option>{providers.map((provider) => <option value={provider} key={provider}>{provider}</option>)}</select></label>
      <label><span>Modality</span><select value={draft.modality ?? ''} onChange={(event) => { const next = { ...draft, modality: event.target.value || null, page: 1 }; setDraft(next); apply(next); }}><option value="">All modalities</option>{modalities.map((modality) => <option value={modality} key={modality}>{modality}</option>)}</select></label>
      <label><span>Access</span><select value={draft.sourceType ?? ''} onChange={(event) => { const sourceType = event.target.value as ModelDirectoryQueryState['sourceType']; const next = { ...draft, sourceType: sourceType || null, page: 1 }; setDraft(next); apply(next); }}><option value="">All access types</option><option value="Proprietary">Proprietary</option><option value="Open Weight">Open Weight</option><option value="Unknown">Unknown</option></select></label>
      <label><span>Evidence</span><select value={draft.evidenceStatus ?? ''} onChange={(event) => { const evidenceStatus = event.target.value as ModelDirectoryQueryState['evidenceStatus']; const next = { ...draft, evidenceStatus: evidenceStatus || null, page: 1 }; setDraft(next); apply(next); }}><option value="">All evidence</option><option value="supported">Supported</option><option value="estimated">Estimated</option><option value="source_only">Source only</option></select></label>
      <label><span>Directory status</span><select value={draft.status} onChange={(event) => { const next = { ...draft, status: event.target.value as ModelDirectoryQueryState['status'], page: 1 }; setDraft(next); apply(next); }}><option value="current">Current</option><option value="archived">Archived</option><option value="all">All retained</option></select></label>
      <label><span>Sort</span><select value={draft.sort} onChange={(event) => { const next = { ...draft, sort: event.target.value as ModelDirectoryQueryState['sort'], page: 1 }; setDraft(next); apply(next); }}><option value="rank">Weekly rank</option><option value="score">Composite quality</option><option value="cost">Blended cost</option><option value="name">Model name</option></select></label>
    </div>
    <div className="models-filter-actions"><button className="button models-filter-submit" type="submit" disabled={loading}>{loading ? 'Loading models…' : 'Apply filters'}</button>{activeFilterCount(query) > 0 ? <button className="button button-secondary" type="button" onClick={() => { setDraft(DEFAULT_MODEL_DIRECTORY_QUERY); apply(DEFAULT_MODEL_DIRECTORY_QUERY); }}>Reset {activeFilterCount(query)} filter{activeFilterCount(query) === 1 ? '' : 's'}</button> : null}</div>
  </form>;
}

function orderedModels(models: readonly ModelDirectoryEntry[], query: ModelDirectoryQueryState): readonly ModelDirectoryEntry[] {
  return filterModelDirectoryEntries(models, query).slice().sort((left, right) => {
    if (query.sort === 'score') return (right.overallScore ?? Number.NEGATIVE_INFINITY) - (left.overallScore ?? Number.NEGATIVE_INFINITY) || left.displayName.localeCompare(right.displayName);
    if (query.sort === 'cost') return (blendedCost(left) ?? Number.POSITIVE_INFINITY) - (blendedCost(right) ?? Number.POSITIVE_INFINITY) || left.displayName.localeCompare(right.displayName);
    if (query.sort === 'name') return left.displayName.localeCompare(right.displayName) || left.modelKey.localeCompare(right.modelKey);
    return (left.weeklyRank ?? Number.MAX_SAFE_INTEGER) - (right.weeklyRank ?? Number.MAX_SAFE_INTEGER) || left.displayName.localeCompare(right.displayName);
  });
}

function CatalogPagination({ query, pageCount }: { readonly query: ModelDirectoryQueryState; readonly pageCount: number }) {
  if (pageCount < 2) return <nav className="models-pagination" aria-label="Catalog pagination"><span>Page 1 of 1</span></nav>;
  const previous = Math.max(1, query.page - 1);
  const next = Math.min(pageCount, query.page + 1);
  return <nav className="models-pagination" aria-label="Catalog pagination"><span>{`Page ${query.page} of ${pageCount}`}</span>{query.page > 1 ? <a href={modelDirectoryUrl({ ...query, page: previous })}>Previous page</a> : <span aria-disabled="true">Previous page</span>}<a href={modelDirectoryUrl({ ...query, page: next })}>{query.page < pageCount ? 'Next page' : 'Next page unavailable'}</a></nav>;
}

const RADAR_AXES = ['Overall', 'Category', 'Input price', 'Output price', 'Context', 'Evidence'] as const;

function finiteValue(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function evidenceValue(value: ModelDirectoryEntry['evidenceStatus']): number {
  return value === 'supported' ? 1 : value === 'estimated' ? 0.66 : 0.33;
}

function polarPoint(index: number, fraction: number, radius = 72, center = 100): readonly [number, number] {
  const angle = -Math.PI / 2 + index * (2 * Math.PI / RADAR_AXES.length);
  return [center + Math.cos(angle) * radius * fraction, center + Math.sin(angle) * radius * fraction];
}

function ModelComparatorRadar({ models }: { readonly models: readonly (ModelDirectoryEntry | null)[] }) {
  const known = models.filter((model): model is ModelDirectoryEntry => model !== null);
  const maximum = (values: readonly (number | null | undefined)[]) => Math.max(0, ...values.filter(finiteValue));
  const overallMaximum = maximum(known.map((model) => model.overallScore));
  const categoryMaximum = maximum(known.map((model) => model.strongestCategory?.score));
  const contextMaximum = maximum(known.map((model) => model.representativePrice?.contextWindowTokens));
  const inputPrices = known.map((model) => model.representativePrice?.inputUsdPerMillion).filter(finiteValue);
  const outputPrices = known.map((model) => model.representativePrice?.outputUsdPerMillion).filter(finiteValue);
  const minimumInput = inputPrices.length > 0 ? Math.min(...inputPrices) : null;
  const minimumOutput = outputPrices.length > 0 ? Math.min(...outputPrices) : null;
  const inversePrice = (value: number | null | undefined, minimum: number | null): number | null => {
    if (!finiteValue(value) || value < 0 || minimum === null) return null;
    if (value === 0) return 1;
    return minimum === 0 ? 0 : Math.min(1, minimum / value);
  };
  const valuesFor = (model: ModelDirectoryEntry): readonly (number | null)[] => [
    finiteValue(model.overallScore) && overallMaximum > 0 ? Math.min(1, model.overallScore / overallMaximum) : null,
    finiteValue(model.strongestCategory?.score) && categoryMaximum > 0 ? Math.min(1, model.strongestCategory.score / categoryMaximum) : null,
    inversePrice(model.representativePrice?.inputUsdPerMillion, minimumInput),
    inversePrice(model.representativePrice?.outputUsdPerMillion, minimumOutput),
    finiteValue(model.representativePrice?.contextWindowTokens) && contextMaximum > 0 ? Math.min(1, model.representativePrice.contextWindowTokens / contextMaximum) : null,
    evidenceValue(model.evidenceStatus),
  ];
  const labels = RADAR_AXES.map((label, index) => ({ label, point: polarPoint(index, 1, 88) }));
  return <figure className="models-comparator-radar"><svg viewBox="0 0 200 200" role="img" aria-label="Six-axis comparison radar">
    {[0.25, 0.5, 0.75, 1].map((fraction) => <polygon className="models-comparator-radar-grid" key={fraction} points={RADAR_AXES.map((_, index) => polarPoint(index, fraction).join(',')).join(' ')} />)}
    {labels.map(({ label, point }, index) => <g key={label}><line className="models-comparator-radar-axis" x1="100" y1="100" x2={polarPoint(index, 1).join(' ')} /><text x={point[0]} y={point[1]}>{label}</text></g>)}
    {known.map((model, modelIndex) => {
      const values = valuesFor(model);
      if (values.some((value) => value === null)) return null;
      return <polygon className={`models-comparator-radar-series models-comparator-radar-series-${modelIndex + 1}`} key={model.modelKey} points={values.map((value, index) => polarPoint(index, value!).join(',')).join(' ')} />;
    })}
  </svg><figcaption>Relative only: each axis normalizes reported facts among the selected models. Missing facts are not drawn and remain labeled in the exact comparison below.</figcaption></figure>;
}

function scoreDelta(models: readonly (ModelDirectoryEntry | null)[]): string {
  const [first, second] = models;
  if (!first || !second || !finiteValue(first.overallScore) || !finiteValue(second.overallScore)) return 'Not reported because either selected model lacks a composite score.';
  const delta = second.overallScore - first.overallScore;
  return `${second.displayName} is ${Math.abs(delta).toFixed(2)} ${delta >= 0 ? 'higher' : 'lower'} than ${first.displayName}.`;
}

function ModelComparator({ models, replacement, onReplace, onDismissReplacement, announcement, setAnnouncement }: {
  readonly models: readonly ModelDirectoryEntry[];
  readonly replacement: ModelDirectoryEntry | null;
  readonly onReplace: (id: string) => void;
  readonly onDismissReplacement: () => void;
  readonly announcement: string;
  readonly setAnnouncement: (value: string) => void;
}) {
  const { selection, setSelection } = useCompareState();
  const byId = useMemo(() => new Map(models.map((model) => [model.modelKey, model])), [models]);
  const selected = selection.ids.map((id) => byId.get(id) ?? null);
  const remove = (id: string) => {
    setSelection((current) => removeCompareModel(current, id));
    setAnnouncement(`Removed ${byId.get(id)?.displayName ?? id} from comparison`);
  };
  const clear = () => {
    setSelection({ ids: [] });
    setAnnouncement('Cleared comparison selection');
  };
  const pair = selected.length === 2 && selected.every((model): model is ModelDirectoryEntry => model !== null)
    ? `${selected[0]!.canonicalSlug}-vs-${selected[1]!.canonicalSlug}` : null;
  return <>
    <p className="models-announcement" role="status" aria-live="polite">{announcement}</p>
    {selection.ids.length >= 2 ? <aside className="models-comparator" aria-label="Model comparator" role="complementary">
      <header><div><h2>{`${selection.ids.length} models selected`}</h2><p>Keep up to three models in transient exploration; a canonical result is available only for a pair.</p></div><button className="button button-secondary button-small" type="button" onClick={clear}>Clear comparison</button></header>
      <ul aria-label="Selected models">{selection.ids.map((id, index) => <li key={id}><span>{selected[index]?.displayName ?? id}</span><button className="button button-secondary button-small" type="button" onClick={() => remove(id)}>{`Remove ${selected[index]?.displayName ?? id} from comparison`}</button></li>)}</ul>
      <ModelComparatorRadar models={selected} />
      <p className="models-comparator-delta"><strong>Score delta:</strong> {scoreDelta(selected)}</p>
      <div className="models-comparator-summary"><dl>
        <div><dt>Overall score</dt>{selected.map((model, index) => <dd key={selection.ids[index]}>{model ? formatScore(model.overallScore) : 'Not reported'}</dd>)}</div>
        <div><dt>Strongest category</dt>{selected.map((model, index) => <dd key={selection.ids[index]}>{model ? categorySummary(model) : 'Not reported'}</dd>)}</div>
        <div><dt>Input price</dt>{selected.map((model, index) => <dd key={selection.ids[index]}>{model ? formatPrice(model.representativePrice?.inputUsdPerMillion ?? null) : 'Not reported'}</dd>)}</div>
        <div><dt>Output price</dt>{selected.map((model, index) => <dd key={selection.ids[index]}>{model ? formatPrice(model.representativePrice?.outputUsdPerMillion ?? null) : 'Not reported'}</dd>)}</div>
        <div><dt>Context</dt>{selected.map((model, index) => <dd key={selection.ids[index]}>{model?.representativePrice?.contextWindowTokens?.toLocaleString() ?? 'Not reported'}</dd>)}</div>
        <div><dt>Evidence</dt>{selected.map((model, index) => <dd key={selection.ids[index]}>{model ? formatEvidence(model.evidenceStatus) : 'Not reported'}</dd>)}</div>
      </dl></div>
      {pair ? <a className="button" href={`${ROUTE_PATHS.comparison}${encodeURIComponent(pair)}/`}>Open canonical pair</a> : <span className="models-comparator-pair-note">A canonical pair needs two models available in this catalog.</span>}
    </aside> : null}
    {replacement ? <div className="models-replacement-dialog" role="dialog" aria-label="Choose a model to replace"><h2>Choose a model to replace</h2><p>{`Add ${replacement.displayName} by replacing one of the three current selections.`}</p><div>{selection.ids.map((id) => <button className="button button-secondary" key={id} type="button" onClick={() => onReplace(id)}>{`Replace ${byId.get(id)?.displayName ?? id} with ${replacement.displayName}`}</button>)}</div><button className="button button-small" type="button" onClick={onDismissReplacement}>Keep current selections</button></div> : null}
  </>;
}

export function ModelsPage({ envelope, query = DEFAULT_MODEL_DIRECTORY_QUERY, onQueryChange, requestError = null, loading = false }: ModelsPageProps) {
  const { selection, setSelection } = useCompareState();
  const [replacement, setReplacement] = useState<ModelDirectoryEntry | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const ordered = useMemo(() => orderedModels(envelope.data.models, query), [envelope.data.models, query]);
  const pageCount = Math.max(1, Math.ceil(ordered.length / CATALOG_PAGE_SIZE));
  const currentPage = Math.min(query.page, pageCount);
  const models = ordered.slice((currentPage - 1) * CATALOG_PAGE_SIZE, currentPage * CATALOG_PAGE_SIZE);
  const updateQuery = (next: ModelDirectoryQueryState) => onQueryChange?.({ ...next, page: Math.min(next.page, Math.max(1, Math.ceil(orderedModels(envelope.data.models, next).length / CATALOG_PAGE_SIZE)) || 1) });
  const requestCompare = (model: ModelDirectoryEntry) => {
    const result = addCompareModel(selection, model.modelKey);
    if (result.kind === 'added') {
      setSelection(result.state);
      setAnnouncement(`Added ${model.displayName} to comparison`);
    } else if (result.kind === 'duplicate') setAnnouncement(`${model.displayName} is already selected for comparison`);
    else setReplacement(model);
  };
  const replace = (id: string) => {
    if (!replacement) return;
    setSelection((current) => ({ ids: current.ids.map((selectedId) => selectedId === id ? replacement.modelKey : selectedId) }));
    setAnnouncement(`Replaced ${id} with ${replacement.displayName} in comparison`);
    setReplacement(null);
  };
  return <div className="content-stack models-page" data-server-models data-catalog-view={query.view}>
    <section className="models-hero panel" aria-label="Popular AI models"><h1>Popular AI models</h1><p>Start with the current BenchLM-derived top 100, then filter the retained catalog by provider, access, modality, evidence, score, and blended price.</p><div className="models-hero-facts"><span>Week of {formatWeek(envelope.data.week?.weekStart ?? null)}</span><span>Published {envelope.publishedAt}</span><span className={`models-freshness models-freshness-${envelope.freshness.status}`}>{envelope.freshness.status === 'fresh' ? 'Fresh evidence' : 'Snapshot needs refresh'}</span></div></section>
    <ModelDirectoryPareto models={ordered} attribution={envelope.attribution} onCompare={(id) => { const model = envelope.data.models.find((item) => item.modelKey === id); if (model) requestCompare(model); }} />
    <ModelFilterForm query={query} envelope={envelope} onQueryChange={updateQuery} loading={loading} />
    {requestError ? <p className="models-request-status" role="status">Search unavailable. Showing the last validated model list.</p> : null}
    <section className="models-results" aria-labelledby="models-results-heading"><div className="models-results-heading"><div><h2 id="models-results-heading">{query.q || query.status !== 'current' ? 'Matching retained models' : 'Current weekly leaders'}</h2></div><p>{`${ordered.length} filtered result${ordered.length === 1 ? '' : 's'} · ${models.length} on this page`}</p><div className="models-view-switch" role="group" aria-label="Catalog view"><button type="button" aria-pressed={query.view === 'cards'} onClick={() => updateQuery({ ...query, view: 'cards' })}>Cards</button><button type="button" aria-pressed={query.view === 'table'} onClick={() => updateQuery({ ...query, view: 'table' })}>Table</button></div></div>
      {models.length === 0 ? <p className="models-empty-state">No retained models match these filters.</p> : query.view === 'table' ? <ModelDirectoryTable models={models} onCompare={requestCompare} /> : <ModelDirectoryCards models={models} onCompare={requestCompare} />}
      <CatalogPagination query={{ ...query, page: currentPage }} pageCount={pageCount} />
    </section>
    <ModelComparator models={envelope.data.models} replacement={replacement} onReplace={replace} onDismissReplacement={() => setReplacement(null)} announcement={announcement} setAnnouncement={setAnnouncement} />
    <section className="models-evidence panel" aria-labelledby="models-evidence-heading"><h2 id="models-evidence-heading">A popular model is a starting point, not a verdict.</h2><p>{`Weekly order follows the corrected BenchLM public ${envelope.data.week?.methodologyVersion ?? 'methodology'} snapshot. Scores, category evidence, pricing, and freshness stay visible so you can validate the route that fits your workload.`}</p><p>Sources: {envelope.attribution.map((source) => <a href={source.url} key={`${source.sourceId}-${source.url}`}>{source.label}</a>)}</p><a href={ROUTE_PATHS.methodologyBenchAlign}>How BenchAlign rankings work</a></section>
  </div>;
}

function ModelsFrame({ children }: { readonly children: ReactNode }) {
  const { theme, language, toggleTheme, changeLanguage } = useSitePreferences();
  return <CompareProvider><AppShell theme={theme} language={language} activePage="models" onThemeToggle={toggleTheme} onLanguageChange={changeLanguage}>{children}</AppShell></CompareProvider>;
}

export function ModelsApp({ initialEnvelope, initialQuery }: ModelsAppProps) {
  const [query, setQuery] = useState<ModelDirectoryQueryState>(() => initialQuery ?? (typeof window === 'undefined' ? DEFAULT_MODEL_DIRECTORY_QUERY : modelDirectoryQueryFromSearch(window.location.search)));
  const [envelope, setEnvelope] = useState(initialEnvelope);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  const loadQuery = (nextQuery: ModelDirectoryQueryState) => {
    const previousQuery = query;
    setQuery(nextQuery);
    setRequestError(null);
    if (typeof window !== 'undefined') window.history.replaceState(window.history.state, '', modelDirectoryUrl(nextQuery));
    const requestNumber = requestId.current + 1;
    requestId.current = requestNumber;
    setLoading(true);
    void fetch(modelDirectoryApiQuery(nextQuery), { headers: { accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`model directory request failed: ${response.status}`);
        const parsed = parseModelDirectoryEnvelope(await response.json());
        if (!parsed) throw new Error('model directory response failed validation');
        if (requestId.current === requestNumber) setEnvelope(parsed);
      })
      .catch(() => {
        if (requestId.current !== requestNumber) return;
        setQuery(previousQuery);
        if (typeof window !== 'undefined') window.history.replaceState(window.history.state, '', modelDirectoryUrl(previousQuery));
        setRequestError('Search unavailable');
      })
      .finally(() => { if (requestId.current === requestNumber) setLoading(false); });
  };
  return <ModelsFrame><ModelsPage envelope={envelope} query={query} onQueryChange={loadQuery} requestError={requestError} loading={loading} /></ModelsFrame>;
}
