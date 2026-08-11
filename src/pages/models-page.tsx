import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppShell } from '../frontend/app-shell';
import {
  parseModelDirectoryEnvelope,
  modelPath,
  type ModelDirectoryEntry,
  type ModelDirectoryEnvelope,
} from '../frontend/model-directory-contracts';
import {
  DEFAULT_MODEL_DIRECTORY_QUERY,
  modelDirectoryApiQuery,
  modelDirectoryQueryFromSearch,
  modelDirectoryUrl,
  type ModelDirectoryQueryState,
} from '../frontend/model-directory-state';
import { useSitePreferences } from '../frontend/site-preferences';
import { ROUTE_PATHS } from '../routing/routes';

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

function ModelDirectoryTable({ models }: { readonly models: readonly ModelDirectoryEntry[] }) {
  return <div className="models-desktop-table" data-testid="models-desktop-table">
    <table aria-label="Popular AI models">
      <thead><tr><th scope="col">Model</th><th scope="col">Decision facts</th><th scope="col">Status</th></tr></thead>
      <tbody>{models.map((model) => <tr key={model.canonicalSlug}>
        <th scope="row"><ModelLink model={model} /><small>{model.creator} · {model.sourceType}</small></th>
        <td><ModelDecisionFacts model={model} /></td>
        <td><span className={`model-status model-status-${model.status}`}>{model.status === 'archived' ? 'Archived' : 'Current'}</span></td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function ModelDirectoryCards({ models }: { readonly models: readonly ModelDirectoryEntry[] }) {
  return <ul className="models-mobile-cards" data-testid="models-mobile-cards">{models.map((model) => <li className="model-card" key={model.canonicalSlug}>
    <div className="model-card-heading"><span className={`model-status model-status-${model.status}`}>{model.status === 'archived' ? 'Archived' : 'Current'}</span>{model.weeklyRank === null ? null : <span className="model-card-rank">#{model.weeklyRank}</span>}</div>
    <h2><ModelLink model={model} /></h2>
    <p className="model-card-creator">{model.creator} · {model.sourceType}</p>
    <ModelDecisionFacts model={model} />
  </li>)}</ul>;
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
  const update = (changes: Partial<ModelDirectoryQueryState>) => setDraft((current) => ({ ...current, ...changes }));
  return <form className="models-filter-panel" onSubmit={(event) => { event.preventDefault(); onQueryChange?.(draft); }}>
    <div className="models-search-field">
      <label htmlFor="models-search">Search retained models</label>
      <input id="models-search" type="search" name="q" value={draft.q} placeholder="Search model, creator, or slug" onChange={(event) => update({ q: event.target.value })} />
    </div>
    <div className="models-filter-fields">
      <label><span>Creator / provider</span><select value={draft.creator ?? ''} onChange={(event) => { const next = { ...draft, creator: event.target.value || null }; setDraft(next); onQueryChange?.(next); }}><option value="">All creators</option>{creators.map((creator) => <option value={creator} key={creator}>{creator}</option>)}</select></label>
      <label><span>Source type</span><select value={draft.sourceType ?? ''} onChange={(event) => { const sourceType = event.target.value as ModelDirectoryQueryState['sourceType']; const next = { ...draft, sourceType: sourceType || null }; setDraft(next); onQueryChange?.(next); }}><option value="">All source types</option><option value="Proprietary">Proprietary</option><option value="Open Weight">Open Weight</option><option value="Unknown">Unknown</option></select></label>
      <label><span>Evidence</span><select value={draft.evidenceStatus ?? ''} onChange={(event) => { const evidenceStatus = event.target.value as ModelDirectoryQueryState['evidenceStatus']; const next = { ...draft, evidenceStatus: evidenceStatus || null }; setDraft(next); onQueryChange?.(next); }}><option value="">All evidence</option><option value="supported">Supported</option><option value="estimated">Estimated</option><option value="source_only">Source only</option></select></label>
      <label><span>Directory status</span><select value={draft.status} onChange={(event) => { const next = { ...draft, status: event.target.value as ModelDirectoryQueryState['status'] }; setDraft(next); onQueryChange?.(next); }}><option value="current">Current</option><option value="archived">Archived</option><option value="all">All retained</option></select></label>
    </div>
    <button className="button models-filter-submit" type="submit" disabled={loading}>{loading ? 'Loading models…' : 'Apply filters'}</button>
  </form>;
}

export function ModelsPage({ envelope, query = DEFAULT_MODEL_DIRECTORY_QUERY, onQueryChange, requestError = null, loading = false }: ModelsPageProps) {
  const models = envelope.data.models;
  return <div className="content-stack models-page" data-server-models>
    <section className="models-hero panel" aria-label="Popular AI models">
      <span className="eyebrow">Weekly model directory</span>
      <h1>Popular AI models</h1>
      <p>Start with the current BenchLM-derived top 100, then search the retained directory for models that have left the weekly list or active revision.</p>
      <div className="models-hero-facts"><span>Week of {formatWeek(envelope.data.week?.weekStart ?? null)}</span><span>Revision {envelope.revision}</span><span className={`models-freshness models-freshness-${envelope.freshness.status}`}>{envelope.freshness.status === 'fresh' ? 'Fresh evidence' : 'Snapshot needs refresh'}</span></div>
    </section>
    <ModelFilterForm query={query} envelope={envelope} onQueryChange={onQueryChange} loading={loading} />
    {requestError ? <p className="models-request-status" role="status">Search unavailable. Showing the last validated model list.</p> : null}
    <section className="models-results" aria-labelledby="models-results-heading">
      <div className="models-results-heading"><div><span className="eyebrow">Decision facts</span><h2 id="models-results-heading">{query.q || query.status !== 'current' ? 'Matching retained models' : 'Current weekly leaders'}</h2></div><p>{models.length} model{models.length === 1 ? '' : 's'} shown · Evidence remains source-linked.</p></div>
      {models.length === 0 ? <p className="models-empty-state">No retained models match these filters.</p> : <><ModelDirectoryTable models={models} /><ModelDirectoryCards models={models} /></>}
    </section>
    <section className="models-evidence panel" aria-labelledby="models-evidence-heading">
      <span className="eyebrow">Read the evidence</span>
      <h2 id="models-evidence-heading">A popular model is a starting point, not a verdict.</h2>
      <p>Weekly order follows the corrected BenchLM public <code>bench-align-v5</code> overall order. Scores, category evidence, pricing, and freshness stay visible so you can validate the route that fits your workload.</p>
      <p>Sources: {envelope.attribution.map((source) => <a href={source.url} key={`${source.sourceId}-${source.url}`}>{source.label}</a>)}</p>
      <a href={ROUTE_PATHS.methodologyBenchAlign}>How BenchAlign rankings work</a>
    </section>
  </div>;
}

function ModelsFrame({ children }: { readonly children: ReactNode }) {
  const { theme, language, toggleTheme, changeLanguage } = useSitePreferences();
  return <AppShell theme={theme} language={language} activePage="models" onThemeToggle={toggleTheme} onLanguageChange={changeLanguage}>{children}</AppShell>;
}

export function ModelsApp({ initialEnvelope, initialQuery }: ModelsAppProps) {
  const [query, setQuery] = useState<ModelDirectoryQueryState>(() => initialQuery ?? (typeof window === 'undefined' ? DEFAULT_MODEL_DIRECTORY_QUERY : modelDirectoryQueryFromSearch(window.location.search)));
  const [envelope, setEnvelope] = useState(initialEnvelope);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  const loadQuery = (nextQuery: ModelDirectoryQueryState) => {
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
        if (requestId.current === requestNumber) setRequestError('Search unavailable');
      })
      .finally(() => {
        if (requestId.current === requestNumber) setLoading(false);
      });
  };

  return <ModelsFrame><ModelsPage envelope={envelope} query={query} onQueryChange={loadQuery} requestError={requestError} loading={loading} /></ModelsFrame>;
}
