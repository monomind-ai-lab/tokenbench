import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  filterPricePerformancePoints,
  markParetoFrontier,
  priceForBasis,
  type PricePerformancePointView,
} from '../benchmarks/price-performance';
import {
  parsePricePerformanceEnvelope,
  type PricePerformanceAttribution,
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
  type PricePerformanceState,
} from '../frontend/price-performance-state';

export interface PricePerformancePageProps {
  readonly envelope: PricePerformanceEnvelope;
  readonly chartAvailable?: boolean;
  readonly initialState?: PricePerformanceState;
  readonly deferLocationState?: boolean;
  readonly onRequestArchived?: () => void;
}

function labelForLane(lane: string): string {
  return lane.replace(/-/gu, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const UTF8_ENCODER = new TextEncoder();

function compareModelKeys(left: string, right: string): number {
  const leftBytes = UTF8_ENCODER.encode(left);
  const rightBytes = UTF8_ENCODER.encode(right);
  const sharedLength = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < sharedLength; index += 1) {
    if (leftBytes[index] !== rightBytes[index]) return leftBytes[index] - rightBytes[index];
  }
  return leftBytes.length - rightBytes.length;
}


function decodedPageState(envelope: PricePerformanceEnvelope, search: string): PricePerformanceState {
  const capabilities = envelope.data.capabilities;
  // Preserve a requested log scale for the filter pass, then validate it
  // against only the points that the decoded filters actually display.
  const firstPass = decodePricePerformanceState(search, capabilities, [1]).state;
  const filtered = filterPricePerformancePoints(envelope.data.points, pricePerformanceFilters(firstPass));
  const views = markParetoFrontier(filtered, { lane: firstPass.lane, costBasis: firstPass.costBasis });
  return decodePricePerformanceState(
    search,
    capabilities,
    views.map((point) => point.selectedCost),
  ).state;
}

function initialPageState(envelope: PricePerformanceEnvelope): PricePerformanceState {
  return typeof window === 'undefined'
    ? DEFAULT_PRICE_PERFORMANCE_STATE
    : decodedPageState(envelope, window.location.search);
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
  if (points.length <= 10) return [...points].sort((left, right) => compareModelKeys(left.modelKey, right.modelKey));
  const lowestCostHalf = [...points]
    .sort((left, right) => left.selectedCost - right.selectedCost || compareModelKeys(left.modelKey, right.modelKey))
    .slice(0, Math.max(1, Math.ceil(points.length / 2)));
  return lowestCostHalf
    .sort((left, right) => right.score - left.score || left.selectedCost - right.selectedCost || compareModelKeys(left.modelKey, right.modelKey))
    .slice(0, 10);
}

function priceRangeDomain(points: readonly PricePerformancePoint[], basis: PricePerformanceState['costBasis']): readonly number[] {
  const costs = points
    .map((point) => priceForBasis(point.route, basis))
    .filter((cost): cost is number => cost !== null && Number.isFinite(cost) && cost >= 0);
  return [...new Set(costs)].sort((left, right) => left - right);
}

function PriceRangeSlider({
  domain,
  priceBand,
  onChange,
}: {
  readonly domain: readonly number[];
  readonly priceBand: PricePerformanceState['priceBand'];
  readonly onChange: (priceBand: PricePerformanceState['priceBand']) => void;
}) {
  const lastIndex = Math.max(0, domain.length - 1);
  const minimumIndex = priceBand?.[0] !== null && priceBand?.[0] !== undefined && domain.includes(priceBand[0]) ? domain.indexOf(priceBand[0]) : 0;
  const maximumIndex = priceBand?.[1] !== null && priceBand?.[1] !== undefined && domain.includes(priceBand[1]) ? domain.indexOf(priceBand[1]) : lastIndex;
  const minimumPercent = lastIndex === 0 ? 0 : (minimumIndex / lastIndex) * 100;
  const maximumPercent = lastIndex === 0 ? 100 : (maximumIndex / lastIndex) * 100;
  const position = (percent: number) => `calc(${percent}%)`;
  const rangeStyle = {
    '--range-start': `${minimumPercent}%`,
    '--range-end': `${maximumPercent}%`,
    '--range-start-position': position(minimumPercent),
    '--range-end-position': position(maximumPercent),
  } as CSSProperties & Record<'--range-start' | '--range-end' | '--range-start-position' | '--range-end-position', string>;
  const formatCost = (value: number) => `$${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)} / 1M`;
  const minimumId = 'price-performance-min-price';
  const maximumId = 'price-performance-max-price';

  return <fieldset className="price-performance-price-band">
    <legend>Price range per 1M tokens</legend>
    {domain.length === 0 ? <p className="price-performance-price-band-empty">No published prices are available for this selection.</p> : <>
      <div className="price-performance-price-values">
        <label htmlFor={minimumId}><span>Minimum</span><output htmlFor={minimumId}>{formatCost(domain[minimumIndex]!)}</output></label>
        <label htmlFor={maximumId}><span>Maximum</span><output htmlFor={maximumId}>{formatCost(domain[maximumIndex]!)}</output></label>
      </div>
      <div className="price-performance-price-range-stack" style={rangeStyle}>
        <input
          aria-label="Minimum price per 1M tokens"
          aria-valuetext={formatCost(domain[minimumIndex]!)}
          id={minimumId}
          max={lastIndex}
          min="0"
          onChange={(event) => {
            const proposed = Number(event.currentTarget.value);
            const next = Math.min(proposed, maximumIndex);
            onChange([domain[next]!, domain[maximumIndex]!]);
          }}
          step="1"
          type="range"
          value={minimumIndex}
        />
        <input
          aria-label="Maximum price per 1M tokens"
          aria-valuetext={formatCost(domain[maximumIndex]!)}
          id={maximumId}
          max={lastIndex}
          min="0"
          onChange={(event) => {
            const proposed = Number(event.currentTarget.value);
            const next = Math.max(proposed, minimumIndex);
            onChange([domain[minimumIndex]!, domain[next]!]);
          }}
          step="1"
          type="range"
          value={maximumIndex}
        />
        <span aria-hidden="true" className="price-performance-price-range-dot price-performance-price-range-dot-minimum" />
        <span aria-hidden="true" className="price-performance-price-range-dot price-performance-price-range-dot-maximum" />
      </div>
    </>}
  </fieldset>;
}

function FilterTags({
  label,
  options,
  selected,
  onSelect,
}: {
  readonly label: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly selected: string | null;
  readonly onSelect: (value: string | null) => void;
}) {
  return <fieldset className="price-performance-filter-tags">
    <legend>{label}</legend>
    <div className="price-performance-tag-row">
      <button
        aria-pressed={selected === null}
        className="price-performance-tag"
        onClick={() => onSelect(null)}
        type="button"
      >All</button>
      {options.map((option) => <button
        aria-pressed={selected === option.value}
        className="price-performance-tag"
        key={option.value}
        onClick={() => onSelect(selected === option.value ? null : option.value)}
        type="button"
      >{option.label}</button>)}
    </div>
  </fieldset>;
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
  const rangeDomain = useMemo(() => priceRangeDomain(envelope.data.points, state.costBasis), [envelope.data.points, state.costBasis]);
  return <div className="price-performance-filters" role="group" aria-label="Price-performance filters">
    <FilterTags label="Score lane" options={capabilities.scoreLanes.map((lane) => ({ value: lane, label: labelForLane(lane) }))} selected={state.lane} onSelect={(value) => update({ lane: (value ?? 'overall') as PricePerformanceState['lane'] })} />
    <FilterTags label="Creator" options={capabilities.creators.map((creator) => ({ value: creator, label: creator }))} selected={state.creator} onSelect={(value) => update({ creator: value })} />
    <PriceRangeSlider domain={rangeDomain} priceBand={state.priceBand} onChange={(priceBand) => update({ priceBand })} />
  </div>;
}


function latestAttributionBySource(attribution: readonly PricePerformanceAttribution[]): readonly PricePerformanceAttribution[] {
  const latest = new Map<string, PricePerformanceAttribution>();
  for (const source of attribution) {
    const existing = latest.get(source.sourceId);
    if (!existing || source.updatedAt > existing.updatedAt) {
      latest.set(source.sourceId, source);
    }
  }
  return [...latest.values()];
}

function Evidence({ envelope }: { readonly envelope: PricePerformanceEnvelope }) {
  return <section className="panel price-performance-evidence" aria-labelledby="price-performance-evidence-heading">
    <div className="panel-heading"><div><h2 id="price-performance-evidence-heading">Method and freshness</h2><p>Scores are source-published benchmark lanes. Missing score or price facts are unavailable and excluded; published zero prices remain visible without a finite score-per-dollar value.</p></div></div>
    <dl className="price-performance-evidence-facts"><div><dt>Revision</dt><dd>{envelope.revision}</dd></div><div><dt>Published</dt><dd>{envelope.publishedAt}</dd></div><div><dt>Checked</dt><dd>{envelope.freshness.checkedAt}</dd></div></dl>
    <ul className="price-performance-source-list" aria-label="Price-performance sources">{latestAttributionBySource(envelope.attribution).map((source) => <li key={source.sourceId}><a href={source.url} target="_blank" rel="noreferrer">{source.label}</a><span>Updated {source.updatedAt}</span></li>)}</ul>
  </section>;
}

export function PricePerformancePage({ envelope, chartAvailable = true, initialState, deferLocationState = false, onRequestArchived }: PricePerformancePageProps) {
  const capabilities = envelope.data.capabilities;
  const [state, setState] = useState<PricePerformanceState>(() => initialState
    ?? (deferLocationState ? DEFAULT_PRICE_PERFORMANCE_STATE : initialPageState(envelope)));
  const [locationStateReady, setLocationStateReady] = useState(!deferLocationState);
  const filtered = useMemo(() => filterPricePerformancePoints(envelope.data.points, pricePerformanceFilters(state)), [envelope.data.points, state]);
  const views = useMemo(() => markParetoFrontier(filtered, { lane: state.lane, costBasis: state.costBasis }), [filtered, state.costBasis, state.lane]);
  const displayedCosts = useMemo(() => views.map((point) => point.selectedCost), [views]);
  const summary = useMemo(() => summaryPoints(views), [views]);
  const normalized = useMemo(() => normalizePricePerformanceState(state, capabilities, displayedCosts), [capabilities, displayedCosts, state]);
  const hasArchivedRows = useMemo(
    () => envelope.data.points.some((point) => point.status === 'archived'),
    [envelope.data.points],
  );

  useEffect(() => {
    if (state.status === 'archived' && !hasArchivedRows) onRequestArchived?.();
  }, [hasArchivedRows, onRequestArchived, state.status]);

  useEffect(() => {
    if (!sameState(state, normalized)) setState(normalized);
  }, [normalized, state]);

  useEffect(() => {
    if (locationStateReady || typeof window === 'undefined') return;
    setState(decodedPageState(envelope, window.location.search));
    setLocationStateReady(true);
  }, [envelope, locationStateReady]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopState = () => {
      setState(decodedPageState(envelope, window.location.search));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [envelope]);

  useEffect(() => {
    if (!locationStateReady || typeof window === 'undefined' || window.location.pathname !== '/llm-price-performance/') return;
    const canonical = encodePricePerformanceState(state, displayedCosts).toString();
    const current = window.location.search.replace(/^\?/, '');
    if (current === canonical) return;
    window.history.replaceState(window.history.state, '', `${pricePerformanceUrl(state, displayedCosts)}${window.location.hash}`);
  }, [displayedCosts, locationStateReady, state]);

  const stale = envelope.freshness.status === 'stale';
  const noMatches = views.length === 0;
  const tableLabel = 'Price versus performance values';

  return <div className="content-stack price-performance-page">
    <section className="panel price-performance-hero" aria-labelledby="price-performance-heading">
      <h1 id="price-performance-heading">LLM Price vs. Performance Benchmark</h1>
      <p>Compare real-time LLM API pricing against verified benchmark scores. Track Pareto frontier models to identify the optimal balance of intelligence and cost for your workload.</p>
      <div className="price-performance-facts"><span className={stale ? 'price-performance-freshness stale' : 'price-performance-freshness'}>{stale ? 'Stale evidence' : 'Fresh evidence'}</span><span>Output USD / 1M default</span></div>
    </section>

    {stale ? <div className="price-performance-stale" role="status"><strong>Stale benchmark data</strong><span>{envelope.freshness.message ?? 'Showing the last valid published revision while refresh is unavailable.'}</span></div> : null}

    <section className="panel price-performance-filter-panel" aria-labelledby="price-performance-filters-heading">
      <div className="panel-heading"><div><h2 id="price-performance-filters-heading">Filter Models &amp; Data Parameters</h2><p>Customize the score lane, pricing range, vendor filters to update the scatter plot and data tables below.</p></div></div>
      <PricePerformanceFilters state={state} envelope={envelope} displayedCosts={displayedCosts} onChange={setState} />
    </section>

    <section className="panel price-performance-chart-panel" aria-labelledby="price-performance-chart-heading">
      <div className="panel-heading"><div><h2 id="price-performance-chart-heading">Price–Performance Pareto Frontier</h2><p>Models on the dotted line represent the best performance available at their given price point (Pareto frontier). Click any point to inspect exact scores and token costs.</p></div></div>
      {chartAvailable
        ? noMatches
          ? <p className="price-performance-chart-empty-note">No chart points are available for this category.</p>
          : <PricePerformanceChart points={views} attribution={envelope.attribution} lane={state.lane} basis={state.costBasis} scale={state.scale} />
        : <div className="price-performance-chart-failure" role="alert"><strong>Chart unavailable</strong><p>The analytical SVG could not render. The equivalent values table remains available below.</p></div>}
    </section>

    <section className="panel price-performance-results" aria-labelledby="price-performance-results-heading">
      <div className="panel-heading"><div><h2 id="price-performance-results-heading">Model Performance &amp; Value Leaderboard</h2><p>Compare efficiency metrics, including score-per-dollar values, across all current models.</p></div></div>
      {noMatches ? <div className="price-performance-category-empty" role="status" aria-label="No eligible models match these filters"><strong>No eligible models match these filters</strong><p>Try another score lane, creator, evidence state, status, or price band.</p></div> : null}
      <PricePerformanceTable points={summary} attribution={envelope.attribution} label={tableLabel} showEmptyState={false} />
      {!noMatches && views.length > summary.length ? <details className="price-performance-full-table"><summary>View all {views.length} filtered models</summary><PricePerformanceTable points={views} attribution={envelope.attribution} label="All filtered price versus performance values" showEmptyState={false} /></details> : null}
    </section>

    <Evidence envelope={envelope} />
  </div>;
}

async function fetchPricePerformanceEnvelope(endpoint: string): Promise<PricePerformanceEnvelope> {
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error(`Price-performance request failed (${response.status}).`);
  const value = await response.json() as unknown;
  const parsed = parsePricePerformanceEnvelope(value);
  if (!parsed) throw new Error('Price-performance response was incomplete.');
  return parsed;
}

function browserFallbackEnvelope(
  cached: { readonly value: PricePerformanceEnvelope; readonly storedAt: string },
): PricePerformanceEnvelope {
  return {
    ...cached.value,
    freshness: {
      ...cached.value.freshness,
      status: 'stale',
      message: `Showing the last valid browser-cached revision from ${cached.storedAt}.`,
    },
  };
}

function refreshFailureEnvelope(
  current: PricePerformanceEnvelope,
  cached: { readonly value: PricePerformanceEnvelope; readonly storedAt: string } | null,
): PricePerformanceEnvelope {
  const currentCheckedAt = Date.parse(current.freshness.checkedAt);
  const cachedCheckedAt = cached ? Date.parse(cached.value.freshness.checkedAt) : Number.NEGATIVE_INFINITY;
  if (cached && cachedCheckedAt > currentCheckedAt) return browserFallbackEnvelope(cached);
  if (current.freshness.status === 'stale') return current;
  return {
    ...current,
    freshness: {
      ...current.freshness,
      status: 'stale',
      message: 'Showing the server-rendered revision because the browser refresh is unavailable.',
    },
  };
}

export interface PricePerformanceAppProps {
  readonly initialEnvelope?: PricePerformanceEnvelope;
  readonly chartAvailable?: boolean;
}

export function PricePerformanceApp({ initialEnvelope, chartAvailable = true }: PricePerformanceAppProps) {
  const [envelope, setEnvelope] = useState<PricePerformanceEnvelope | undefined>(initialEnvelope);
  const [error, setError] = useState<string | null>(null);
  const archivedRequestStarted = useRef(false);
  const archivedRequestWon = useRef(false);
  const requestArchived = useCallback(() => {
    if (archivedRequestStarted.current) return;
    archivedRequestStarted.current = true;
    void fetchPricePerformanceEnvelope('/api/benchmarks/price-performance?includeArchived=1')
      .then((parsed) => {
        archivedRequestWon.current = true;
        setEnvelope(parsed);
        writePricePerformanceEnvelopeCache(parsed);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;
    void fetchPricePerformanceEnvelope('/api/benchmarks/price-performance')
      .then((parsed) => {
        if (!active || archivedRequestWon.current) return;
        setEnvelope(parsed);
        writePricePerformanceEnvelopeCache(parsed);
      })
      .catch(() => {
        if (!active || archivedRequestWon.current) return;
        const cached = readPricePerformanceEnvelopeCache();
        if (initialEnvelope) {
          setEnvelope((current) => refreshFailureEnvelope(current ?? initialEnvelope, cached));
        } else if (cached) {
          setEnvelope(browserFallbackEnvelope(cached));
        } else {
          setError('No valid published price-performance revision is available.');
        }
      });
    return () => { active = false; };
  }, [initialEnvelope]);

  if (envelope) {
    return <PricePerformancePage
      envelope={envelope}
      chartAvailable={chartAvailable}
      deferLocationState={initialEnvelope !== undefined}
      onRequestArchived={requestArchived}
    />;
  }
  if (error) return <div className="empty-state price-performance-load-state" role="alert"><strong>Unable to load benchmark data</strong><p>{error}</p></div>;
  return <div className="skeleton-stack" aria-busy="true" aria-label="Loading price-performance data"><span className="skeleton skeleton-lg" /><span className="skeleton" /><span className="skeleton skeleton-short" /></div>;
}
