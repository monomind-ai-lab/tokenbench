import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  filterPricePerformancePoints,
  markParetoFrontier,
  priceForBasis,
  type PricePerformancePointView,
} from '../benchmarks/price-performance';
import {
  parsePricePerformanceEnvelope,
  type PricePerformanceEnvelope,
  type PricePerformancePoint,
} from '../benchmarks/price-performance-contracts';
import { PricePerformanceChart } from '../frontend/price-performance-chart';
import {
  readPricePerformanceEnvelopeCache,
  writePricePerformanceEnvelopeCache,
} from '../frontend/benchmark-cache';
import { PricePerformanceTable } from '../frontend/price-performance-table';
import {
  DEFAULT_PRICE_PERFORMANCE_STATE,
  decodePricePerformanceState,
  encodePricePerformanceState,
  normalizePricePerformanceState,
  pricePerformanceFilters,
  pricePerformanceUrl,
  type PricePerformanceScale,
  type PricePerformanceState,
} from '../frontend/price-performance-state';

export interface PricePerformancePageProps {
  readonly envelope: PricePerformanceEnvelope;
  readonly chartAvailable?: boolean;
  readonly initialState?: PricePerformanceState;
}

function labelForLane(lane: string): string {
  return lane.replace(/-/gu, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function selectedCosts(points: readonly PricePerformancePoint[], basis: PricePerformanceState['costBasis']): readonly (number | null)[] {
  return points.map((point) => priceForBasis(point.route, basis));
}

function initialPageState(envelope: PricePerformanceEnvelope): PricePerformanceState {
  if (typeof window === 'undefined') return DEFAULT_PRICE_PERFORMANCE_STATE;
  const capabilities = envelope.data.capabilities;
  const firstPass = decodePricePerformanceState(window.location.search, capabilities).state;
  return decodePricePerformanceState(
    window.location.search,
    capabilities,
    selectedCosts(envelope.data.points, firstPass.costBasis),
  ).state;
}

function samePriceBand(left: PricePerformanceState['priceBand'], right: PricePerformanceState['priceBand']): boolean {
  return left === right || left !== null && right !== null && left[0] === right[0] && left[1] === right[1];
}

function sameState(left: PricePerformanceState, right: PricePerformanceState): boolean {
  return left.lane === right.lane
    && left.costBasis === right.costBasis
    && left.creator === right.creator
    && left.sourceType === right.sourceType
    && samePriceBand(left.priceBand, right.priceBand)
    && left.evidenceStatus === right.evidenceStatus
    && left.variants === right.variants
    && left.status === right.status
    && left.scale === right.scale;
}

function summaryPoints(points: readonly PricePerformancePointView[]): readonly PricePerformancePointView[] {
  if (points.length <= 10) return points;
  const lowestCostHalf = [...points]
    .sort((left, right) => left.selectedCost - right.selectedCost || left.modelKey.localeCompare(right.modelKey))
    .slice(0, Math.max(1, Math.ceil(points.length / 2)));
  return lowestCostHalf
    .sort((left, right) => right.score - left.score || left.selectedCost - right.selectedCost || left.modelKey.localeCompare(right.modelKey))
    .slice(0, 10);
}

function FilterField({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return <label className="price-performance-filter-field"><span>{label}</span>{children}</label>;
}

function PricePerformanceFilters({
  state,
  envelope,
  displayedCosts,
  onChange,
}: {
  readonly state: PricePerformanceState;
  readonly envelope: PricePerformanceEnvelope;
  readonly displayedCosts: readonly (number | null)[];
  readonly onChange: (next: PricePerformanceState) => void;
}) {
  const capabilities = envelope.data.capabilities;
  const update = (changes: Partial<PricePerformanceState>) => onChange(normalizePricePerformanceState({ ...state, ...changes }, capabilities, displayedCosts));
  const minimum = state.priceBand?.[0] ?? '';
  const maximum = state.priceBand?.[1] ?? '';
  const updatePriceBand = (nextMinimum: string, nextMaximum: string) => {
    const minimumValue = nextMinimum === '' ? null : Number(nextMinimum);
    const maximumValue = nextMaximum === '' ? null : Number(nextMaximum);
    update({ priceBand: [Number.isFinite(minimumValue) ? minimumValue : null, Number.isFinite(maximumValue) ? maximumValue : null] });
  };
  return <div className="price-performance-filters" role="group" aria-label="Price-performance filters">
    <div className="price-performance-filter-grid">
      <FilterField label="Score lane"><select value={state.lane} onChange={(event) => update({ lane: event.target.value as PricePerformanceState['lane'] })}>{capabilities.scoreLanes.map((lane) => <option key={lane} value={lane}>{labelForLane(lane)}</option>)}</select></FilterField>
      <FilterField label="Cost basis"><select value={state.costBasis} onChange={(event) => update({ costBasis: event.target.value as PricePerformanceState['costBasis'] })}>{capabilities.costBases.map((basis) => <option key={basis} value={basis}>{basis === 'output' ? 'Output USD / 1M' : '3:1 blended USD / 1M'}</option>)}</select></FilterField>
      <FilterField label="Creator"><select value={state.creator ?? ''} onChange={(event) => update({ creator: event.target.value || null })}><option value="">All creators</option>{capabilities.creators.map((creator) => <option key={creator} value={creator}>{creator}</option>)}</select></FilterField>
      <FilterField label="Source type"><select value={state.sourceType ?? ''} onChange={(event) => update({ sourceType: (event.target.value || null) as PricePerformanceState['sourceType'] })}><option value="">All source types</option>{capabilities.sourceTypes.map((sourceType) => <option key={sourceType} value={sourceType}>{sourceType}</option>)}</select></FilterField>
      <FilterField label="Evidence"><select value={state.evidenceStatus ?? ''} onChange={(event) => update({ evidenceStatus: (event.target.value || null) as PricePerformanceState['evidenceStatus'] })}><option value="">All evidence</option>{capabilities.evidenceStatuses.map((evidence) => <option key={evidence} value={evidence}>{labelForLane(evidence)}</option>)}</select></FilterField>
      <FilterField label="Variants"><select value={state.variants} onChange={(event) => update({ variants: event.target.value as PricePerformanceState['variants'] })}>{['one-per-family', 'all-variants'].map((variants) => <option key={variants} value={variants}>{variants === 'one-per-family' ? 'One per family' : 'All model variants'}</option>)}</select></FilterField>
      <FilterField label="Status"><select value={state.status} onChange={(event) => update({ status: event.target.value as PricePerformanceState['status'] })}>{capabilities.statuses.map((status) => <option key={status} value={status}>{labelForLane(status)}</option>)}</select></FilterField>
      <FilterField label="Scale"><select value={state.scale} onChange={(event) => update({ scale: event.target.value as PricePerformanceScale })}><option value="linear">Linear</option><option value="log">Log (positive costs only)</option></select></FilterField>
    </div>
    <fieldset className="price-performance-price-band"><legend>Selected price band</legend><div><label htmlFor="price-performance-min-price">Minimum USD / 1M</label><input id="price-performance-min-price" inputMode="decimal" min="0" type="number" value={minimum} onChange={(event) => updatePriceBand(event.target.value, maximum === '' ? '' : String(maximum))} /></div><div><label htmlFor="price-performance-max-price">Maximum USD / 1M</label><input id="price-performance-max-price" inputMode="decimal" min="0" type="number" value={maximum} onChange={(event) => updatePriceBand(minimum === '' ? '' : String(minimum), event.target.value)} /></div></fieldset>
  </div>;
}

function Evidence({ envelope }: { readonly envelope: PricePerformanceEnvelope }) {
  return <section className="panel price-performance-evidence" aria-labelledby="price-performance-evidence-heading">
    <div className="panel-heading"><div><span className="eyebrow">Published evidence</span><h2 id="price-performance-evidence-heading">Method and freshness</h2><p>Scores are source-published benchmark lanes. Missing score or price facts are unavailable and excluded; published zero prices remain visible without a finite score-per-dollar value.</p></div></div>
    <dl className="price-performance-evidence-facts"><div><dt>Revision</dt><dd>{envelope.revision}</dd></div><div><dt>Published</dt><dd>{envelope.publishedAt}</dd></div><div><dt>Checked</dt><dd>{envelope.freshness.checkedAt}</dd></div></dl>
    <ul className="price-performance-source-list" aria-label="Price-performance sources">{envelope.attribution.map((source) => <li key={`${source.sourceId}-${source.url}`}><a href={source.url} target="_blank" rel="noreferrer">{source.label}</a><span>Updated {source.updatedAt}</span></li>)}</ul>
  </section>;
}

export function PricePerformancePage({ envelope, chartAvailable = true, initialState }: PricePerformancePageProps) {
  const capabilities = envelope.data.capabilities;
  const [state, setState] = useState<PricePerformanceState>(() => initialState ?? initialPageState(envelope));
  const [selectedPoint, setSelectedPoint] = useState<PricePerformancePointView | null>(null);
  const costs = useMemo(() => selectedCosts(envelope.data.points, state.costBasis), [envelope.data.points, state.costBasis]);
  const filtered = useMemo(() => filterPricePerformancePoints(envelope.data.points, pricePerformanceFilters(state)), [envelope.data.points, state]);
  const views = useMemo(() => markParetoFrontier(filtered, { lane: state.lane, costBasis: state.costBasis }), [filtered, state.costBasis, state.lane]);
  const summary = useMemo(() => summaryPoints(views), [views]);
  const normalized = useMemo(() => normalizePricePerformanceState(state, capabilities, views.map((point) => point.selectedCost)), [capabilities, state, views]);

  useEffect(() => {
    if (!sameState(state, normalized)) setState(normalized);
  }, [normalized, state]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopState = () => {
      const decoded = decodePricePerformanceState(window.location.search, capabilities, costs);
      setState(decoded.state);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [capabilities, costs]);

  useEffect(() => {
    if (typeof window === 'undefined' || window.location.pathname !== '/llm-price-performance/') return;
    const canonical = encodePricePerformanceState(state).toString();
    const current = window.location.search.replace(/^\?/, '');
    if (current === canonical) return;
    window.history.replaceState(window.history.state, '', `${pricePerformanceUrl(state)}${window.location.hash}`);
  }, [state]);

  const stale = envelope.freshness.status === 'stale';
  const noMatches = views.length === 0;
  const tableLabel = 'Price versus performance values';

  return <div className="content-stack price-performance-page">
    <section className="panel price-performance-hero" aria-labelledby="price-performance-heading">
      <span className="eyebrow">TokenBench decision surface</span>
      <h1 id="price-performance-heading">Price versus performance</h1>
      <p>Compare corrected public benchmark scores against published API prices. Use the frontier to find score/cost trade-offs, then inspect the equivalent values table.</p>
      <div className="price-performance-facts"><span>Revision {envelope.revision}</span><span className={stale ? 'price-performance-freshness stale' : 'price-performance-freshness'}>{stale ? 'Stale evidence' : 'Fresh evidence'}</span><span>Output USD / 1M default</span></div>
    </section>

    {stale ? <div className="price-performance-stale" role="status"><strong>Stale benchmark data</strong><span>{envelope.freshness.message ?? 'Showing the last valid published revision while refresh is unavailable.'}</span></div> : null}

    <section className="panel price-performance-filter-panel" aria-labelledby="price-performance-filters-heading">
      <div className="panel-heading"><div><span className="eyebrow">Choose a decision lens</span><h2 id="price-performance-filters-heading">Filter the complete projection</h2><p>The complete validated projection is cached once; filters are normalized in the browser and reflected in the shareable URL.</p></div></div>
      <PricePerformanceFilters state={state} envelope={envelope} displayedCosts={costs} onChange={setState} />
    </section>

    <section className="panel price-performance-chart-panel" aria-labelledby="price-performance-chart-heading">
      <div className="panel-heading"><div><span className="eyebrow">Analytical view</span><h2 id="price-performance-chart-heading">Score and selected cost</h2><p>Frontier points maximize score while minimizing selected cost. Equal score/cost ties share frontier state.</p></div></div>
      {chartAvailable
        ? noMatches
          ? <p className="price-performance-chart-empty-note">No chart points are available for this category.</p>
          : <PricePerformanceChart points={views} lane={state.lane} basis={state.costBasis} scale={state.scale} onSelect={setSelectedPoint} />
        : <div className="price-performance-chart-failure" role="alert"><strong>Chart unavailable</strong><p>The analytical SVG could not render. The equivalent values table remains available below.</p></div>}
      {selectedPoint ? <span className="sr-only" role="status">Selected {selectedPoint.displayName}</span> : null}
    </section>

    <section className="panel price-performance-results" aria-labelledby="price-performance-results-heading">
      <div className="panel-heading"><div><span className="eyebrow">Equivalent values</span><h2 id="price-performance-results-heading">Decision-ready model values</h2><p>{noMatches ? 'No eligible models match these filters.' : `Showing ${summary.length} summary model${summary.length === 1 ? '' : 's'}; the full filtered set remains available below.`}</p></div></div>
      {noMatches ? <div className="price-performance-category-empty" role="status" aria-label="No eligible models match these filters"><strong>No eligible models match these filters</strong><p>Try another score lane, creator, evidence state, status, or price band.</p></div> : null}
      <PricePerformanceTable points={summary} label={tableLabel} showEmptyState={false} />
      {!noMatches && views.length > summary.length ? <details className="price-performance-full-table"><summary>View all {views.length} filtered models</summary><PricePerformanceTable points={views} label="All filtered price versus performance values" showEmptyState={false} /></details> : null}
    </section>

    <Evidence envelope={envelope} />
  </div>;
}

export interface PricePerformanceAppProps {
  readonly initialEnvelope?: PricePerformanceEnvelope;
  readonly chartAvailable?: boolean;
}

export function PricePerformanceApp({ initialEnvelope, chartAvailable = true }: PricePerformanceAppProps) {
  const [envelope, setEnvelope] = useState<PricePerformanceEnvelope | undefined>(initialEnvelope);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/benchmarks/price-performance')
      .then(async (response) => {
        if (!response.ok) throw new Error(`Price-performance request failed (${response.status}).`);
        return response.json() as Promise<unknown>;
      })
      .then((value) => {
        if (!active) return;
        const parsed = parsePricePerformanceEnvelope(value);
        if (!parsed) throw new Error('Price-performance response was incomplete.');
        setEnvelope(parsed);
        writePricePerformanceEnvelopeCache(parsed);
      })
      .catch(() => {
        if (!active) return;
        const cached = readPricePerformanceEnvelopeCache();
        if (cached) setEnvelope(cached.value);
        else setError('No valid published price-performance revision is available.');
      });
    return () => { active = false; };
  }, []);

  if (envelope) return <PricePerformancePage envelope={envelope} chartAvailable={chartAvailable} />;
  if (error) return <div className="empty-state price-performance-load-state" role="alert"><strong>Unable to load benchmark data</strong><p>{error}</p></div>;
  return <div className="skeleton-stack" aria-busy="true" aria-label="Loading price-performance data"><span className="skeleton skeleton-lg" /><span className="skeleton" /><span className="skeleton skeleton-short" /></div>;
}
