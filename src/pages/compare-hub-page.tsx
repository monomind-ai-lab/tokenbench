import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { guidePath } from '../guides/content';
import { LEADERBOARD_ROUTES, ROUTE_PATHS } from '../routing/routes';

type EvidenceStatus = 'supported' | 'estimated' | 'source_only';
type SourceType = 'Proprietary' | 'Open Weight' | 'Unknown';
type Picker = 'first' | 'second' | null;

interface DirectoryModel {
  readonly slug: string;
  readonly name: string;
  readonly creator: string;
  readonly sourceType: SourceType;
  readonly evidenceStatus: EvidenceStatus;
  readonly metricCategories: readonly string[];
}

interface DirectoryPair {
  readonly pairSlug: string;
  readonly modelASlug: string;
  readonly modelBSlug: string;
  readonly featuredRank: number | null;
  readonly sharedMetricCount: number;
}

interface CompareDirectoryEnvelope {
  readonly revision: string;
  readonly publishedAt: string;
  readonly freshness: {
    readonly status: 'fresh' | 'stale';
    readonly checkedAt: string;
    readonly message?: string;
  };
  readonly data: {
    readonly compareDirectory: {
      readonly models: readonly DirectoryModel[];
      readonly indexablePairs: readonly DirectoryPair[];
    };
  };
}

interface DirectoryState {
  readonly phase: 'loading' | 'ready' | 'unavailable';
  readonly envelope: CompareDirectoryEnvelope | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isTimestamp(value: unknown): value is string {
  return isText(value)
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function isEvidenceStatus(value: unknown): value is EvidenceStatus {
  return value === 'supported' || value === 'estimated' || value === 'source_only';
}

function isSourceType(value: unknown): value is SourceType {
  return value === 'Proprietary' || value === 'Open Weight' || value === 'Unknown';
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function parseDirectoryModel(value: unknown): DirectoryModel | null {
  if (!isRecord(value)) return null;
  const { slug, name, creator, sourceType, evidenceStatus, metricCategories } = value;
  if (!isText(slug)
    || !isText(name)
    || !isText(creator)
    || !isSourceType(sourceType)
    || !isEvidenceStatus(evidenceStatus)
    || !Array.isArray(metricCategories)
    || !metricCategories.every(isText)) return null;
  return {
    slug,
    name,
    creator,
    sourceType,
    evidenceStatus,
    metricCategories,
  };
}

function parseDirectoryPair(value: unknown, slugs: ReadonlySet<string>): DirectoryPair | null {
  if (!isRecord(value)) return null;
  const { pairSlug, modelASlug, modelBSlug, featuredRank, sharedMetricCount } = value;
  const parsedFeaturedRank = featuredRank === null ? null : isPositiveInteger(featuredRank) ? featuredRank : undefined;
  const parsedSharedMetricCount = isPositiveInteger(sharedMetricCount) ? sharedMetricCount : undefined;
  if (!isText(pairSlug)
    || !isText(modelASlug)
    || !isText(modelBSlug)
    || pairSlug !== `${modelASlug}-vs-${modelBSlug}`
    || !slugs.has(modelASlug)
    || !slugs.has(modelBSlug)
    || modelASlug === modelBSlug
    || parsedFeaturedRank === undefined
    || parsedSharedMetricCount === undefined
    || parsedSharedMetricCount < 2) return null;
  return {
    pairSlug,
    modelASlug,
    modelBSlug,
    featuredRank: parsedFeaturedRank,
    sharedMetricCount: parsedSharedMetricCount,
  };
}

function parseDirectoryEnvelope(value: unknown): CompareDirectoryEnvelope | null {
  if (!isRecord(value)) return null;
  const { revision, publishedAt, freshness, data } = value;
  if (!isText(revision) || !isTimestamp(publishedAt) || !isRecord(freshness) || !isRecord(data) || !isRecord(data.compareDirectory)) return null;
  const { status, checkedAt, message } = freshness;
  const { models: rawModels, indexablePairs: rawPairs } = data.compareDirectory;
  const parsedMessage = message === undefined ? undefined : isText(message) ? message : null;
  if ((status !== 'fresh' && status !== 'stale')
    || !isTimestamp(checkedAt)
    || parsedMessage === null
    || !Array.isArray(rawModels)
    || !Array.isArray(rawPairs)) return null;

  const models = rawModels.map(parseDirectoryModel);
  if (models.some((model) => model === null)) return null;
  const resolvedModels = models as DirectoryModel[];
  const slugs = new Set(resolvedModels.map((model) => model.slug));
  if (slugs.size !== resolvedModels.length) return null;

  const pairs = rawPairs.map((pair) => parseDirectoryPair(pair, slugs));
  if (pairs.some((pair) => pair === null)) return null;
  const resolvedPairs = pairs as DirectoryPair[];
  if (new Set(resolvedPairs.map((pair) => pair.pairSlug)).size !== resolvedPairs.length) return null;

  return {
    revision,
    publishedAt,
    freshness: {
      status,
      checkedAt,
      ...(parsedMessage ? { message: parsedMessage } : {}),
    },
    data: { compareDirectory: { models: resolvedModels, indexablePairs: resolvedPairs } },
  };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function modelLabel(model: DirectoryModel): string {
  return `${model.name} · ${model.creator}`;
}

function modelOptionLabel(model: DirectoryModel, duplicateNames: ReadonlySet<string>): string {
  const label = modelLabel(model);
  return duplicateNames.has(model.name) ? `${label} · ${model.slug}` : label;
}

function evidenceLabel(status: EvidenceStatus): string {
  if (status === 'supported') return 'Supported evidence';
  if (status === 'estimated') return 'Estimated evidence';
  return 'Source-only record';
}

function modelPairLabel(pair: DirectoryPair, modelsBySlug: ReadonlyMap<string, DirectoryModel>): string {
  const modelA = modelsBySlug.get(pair.modelASlug);
  const modelB = modelsBySlug.get(pair.modelBSlug);
  if (!modelA || !modelB) return pair.pairSlug;
  return modelA.name === modelB.name
    ? `${modelA.name} (${modelA.slug}) vs ${modelB.name} (${modelB.slug})`
    : `${modelA.name} vs ${modelB.name}`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    timeZone: 'UTC',
    timeZoneName: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function CompareHubHero({ envelope }: { readonly envelope: CompareDirectoryEnvelope | null }) {
  return <section className="comparison-hub-hero" aria-labelledby="compare-hub-heading">
    <h1 id="compare-hub-heading">Compare AI models</h1>
    <p>Start with two known catalog models, then inspect the source metrics, route pricing, freshness, and methodology on the comparison page.</p>
    {envelope ? <>
      <p className="comparison-revision">Published revision: {envelope.revision}</p>
      <dl className="comparison-revision-timing">
        <div><dt>Publication time</dt><dd>{formatDateTime(envelope.publishedAt)}</dd></div>
        <div><dt>Checked at</dt><dd>{formatDateTime(envelope.freshness.checkedAt)}</dd></div>
      </dl>
    </> : <p className="comparison-revision">Published revision: checking availability</p>}
  </section>;
}

/** Exact reviewed records take precedence; other known pairs remain server-canonicalized. */
function comparisonPath(first: DirectoryModel, second: DirectoryModel, pairs: readonly DirectoryPair[]): string {
  const reviewedPair = pairs.find((pair) => (pair.modelASlug === first.slug && pair.modelBSlug === second.slug)
    || (pair.modelASlug === second.slug && pair.modelBSlug === first.slug));
  const pairSlug = reviewedPair?.pairSlug ?? `${first.slug}-vs-${second.slug}`;
  return `/compare/${encodeURIComponent(pairSlug)}`;
}

function useCompareDirectory(): DirectoryState {
  const [state, setState] = useState<DirectoryState>({ phase: 'loading', envelope: null });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const load = async () => {
      try {
        const response = await fetch('/api/benchmarks', {
          headers: { accept: 'application/json' },
          signal: controller.signal,
        });
        if (!active || controller.signal.aborted) return;
        if (!response.ok) {
          setState({ phase: 'unavailable', envelope: null });
          return;
        }
        const payload = parseDirectoryEnvelope(await response.json());
        if (!active || controller.signal.aborted || !payload) {
          if (active && !controller.signal.aborted) setState({ phase: 'unavailable', envelope: null });
          return;
        }
        setState({ phase: 'ready', envelope: payload });
      } catch {
        if (active && !controller.signal.aborted) setState({ phase: 'unavailable', envelope: null });
      }
    };
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  return state;
}

function ModelCombobox({
  label,
  picker,
  value,
  activePicker,
  activeOptionId,
  onActivate,
  onBlur,
  onKeyDown,
  onValueChange,
}: {
  readonly label: string;
  readonly picker: Exclude<Picker, null>;
  readonly value: string;
  readonly activePicker: Picker;
  readonly activeOptionId: string | undefined;
  readonly onActivate: (picker: Exclude<Picker, null>) => void;
  readonly onBlur: () => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  readonly onValueChange: (value: string) => void;
}) {
  const id = `compare-${picker}-model`;
  return <div className="comparison-model-combobox">
    <label htmlFor={id}>{label}</label>
    <input
      aria-autocomplete="list"
      aria-activedescendant={activePicker === picker ? activeOptionId : undefined}
      aria-controls="comparison-model-options"
      aria-expanded={activePicker === picker}
      aria-haspopup="listbox"
      id={id}
      onBlur={onBlur}
      onChange={(event) => onValueChange(event.currentTarget.value)}
      onFocus={() => onActivate(picker)}
      onKeyDown={onKeyDown}
      placeholder="Enter a canonical model slug"
      role="combobox"
      type="search"
      value={value}
    />
    <p>Selections are identified by canonical model slug; labels retain the creator for duplicate display names.</p>
  </div>;
}

export function CompareHubPage() {
  const state = useCompareDirectory();
  const [firstSlug, setFirstSlug] = useState('');
  const [secondSlug, setSecondSlug] = useState('');
  const [creatorFilter, setCreatorFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [activePicker, setActivePicker] = useState<Picker>(null);
  const [activeOptionIndex, setActiveOptionIndex] = useState(-1);

  const directory = state.envelope?.data.compareDirectory;
  const models = directory?.models ?? [];
  const pairs = directory?.indexablePairs ?? [];
  const modelsBySlug = useMemo(() => new Map(models.map((model) => [model.slug, model])), [models]);
  const duplicateModelNames = useMemo(() => {
    const counts = new Map<string, number>();
    models.forEach((model) => counts.set(model.name, (counts.get(model.name) ?? 0) + 1));
    return new Set([...counts].filter(([, count]) => count > 1).map(([name]) => name));
  }, [models]);
  const creators = useMemo(() => [...new Set(models.map((model) => model.creator))].sort(compareText), [models]);
  const categories = useMemo(() => [...new Set(models.flatMap((model) => model.metricCategories))].sort(compareText), [models]);
  const filteredModels = useMemo(() => models.filter((model) => (creatorFilter === '' || model.creator === creatorFilter)
    && (categoryFilter === '' || model.metricCategories.includes(categoryFilter))), [categoryFilter, creatorFilter, models]);
  const activeQuery = activePicker === 'first' ? firstSlug : activePicker === 'second' ? secondSlug : '';
  const selectableModels = useMemo(() => {
    const query = activeQuery.trim().toLocaleLowerCase();
    if (query === '') return filteredModels;
    return filteredModels.filter((model) => [model.slug, model.name, model.creator]
      .some((value) => value.toLocaleLowerCase().includes(query)));
  }, [activeQuery, filteredModels]);

  const first = modelsBySlug.get(firstSlug) ?? null;
  const second = modelsBySlug.get(secondSlug) ?? null;
  const comparisonHref = first && second && first.slug !== second.slug ? comparisonPath(first, second, pairs) : null;
  const activeOption = activeOptionIndex >= 0 ? selectableModels[activeOptionIndex] : undefined;
  const activeOptionId = activeOption ? `comparison-model-option-${activeOptionIndex}` : undefined;
  const popularPairs = pairs.slice(0, 12);
  const selectionMessage = !firstSlug && !secondSlug
    ? 'Select two distinct models to continue.'
    : first && second && first.slug === second.slug
      ? 'Choose two different known models to continue.'
      : !first || !second
        ? 'Choose two known models to continue.'
        : 'Two distinct known models are selected.';

  const activatePicker = (picker: Exclude<Picker, null>) => {
    setActivePicker(picker);
    setActiveOptionIndex(-1);
  };
  const updatePickerValue = (picker: Exclude<Picker, null>, value: string) => {
    if (picker === 'first') setFirstSlug(value);
    else setSecondSlug(value);
    setActivePicker(picker);
    setActiveOptionIndex(-1);
  };
  const chooseModel = (model: DirectoryModel, picker = activePicker) => {
    if (picker === 'second') setSecondSlug(model.slug);
    else setFirstSlug(model.slug);
    setActivePicker(null);
    setActiveOptionIndex(-1);
  };
  const handleComboboxKeyDown = (picker: Exclude<Picker, null>, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setActivePicker(null);
      setActiveOptionIndex(-1);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (selectableModels.length === 0) return;
      setActivePicker(picker);
      setActiveOptionIndex((currentIndex) => {
        if (event.key === 'ArrowDown') return currentIndex < 0 ? 0 : Math.min(currentIndex + 1, selectableModels.length - 1);
        return currentIndex < 0 ? selectableModels.length - 1 : Math.max(currentIndex - 1, 0);
      });
      return;
    }
    if (event.key === 'Enter') {
      const exactMatch = selectableModels.find((model) => model.slug === (picker === 'first' ? firstSlug : secondSlug));
      const model = activePicker === picker && activeOptionIndex >= 0 ? selectableModels[activeOptionIndex] : exactMatch;
      if (model) {
        event.preventDefault();
        chooseModel(model, picker);
      }
    }
  };

  return <div className="comparison-page comparison-hub-page" data-combobox-open={activePicker === null ? 'false' : 'true'}>
    <CompareHubHero envelope={state.envelope} />
    {state.phase === 'loading' ? <section className="comparison-state-panel" role="status"><strong>Loading published benchmark directory</strong><p>Checking the active revision and reviewed matchups.</p></section> : null}
    {state.phase === 'unavailable' ? <section className="comparison-state-panel comparison-empty-state" role="status"><strong>Unavailable</strong><p>The published benchmark directory is unavailable. No comparison navigation is being created from incomplete data.</p></section> : null}
    {state.phase === 'ready' && state.envelope && directory ? <>
      {state.envelope.freshness.status === 'stale' ? <section className="comparison-state-panel comparison-stale" role="status"><strong>Published benchmark revision is stale</strong><p>{state.envelope.freshness.message ?? 'Published benchmark revision is stale.'}</p></section> : null}
      <section className="comparison-panel comparison-selector-panel" aria-labelledby="comparison-select-heading">
        <div className="comparison-section-heading"><h2 id="comparison-select-heading">Choose a model pair</h2><p>Both fields retain canonical slugs even when display names are the same.</p></div>
        <div className="comparison-filter-grid">
          <label><span>Provider or creator</span><select aria-label="Provider or creator" onChange={(event) => setCreatorFilter(event.currentTarget.value)} value={creatorFilter}><option value="">All creators</option>{creators.map((creator) => <option key={creator} value={creator}>{creator}</option>)}</select></label>
          <label><span>Metric category</span><select aria-label="Metric category" onChange={(event) => setCategoryFilter(event.currentTarget.value)} value={categoryFilter}><option value="">All metric categories</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
        </div>
        <div className="comparison-picker-grid">
          <ModelCombobox activeOptionId={activeOptionId} activePicker={activePicker} label="First model" onActivate={activatePicker} onBlur={() => { setActivePicker(null); setActiveOptionIndex(-1); }} onKeyDown={(event) => handleComboboxKeyDown('first', event)} onValueChange={(value) => updatePickerValue('first', value)} picker="first" value={firstSlug} />
          <button className="button button-secondary comparison-swap" disabled={!first || !second} onClick={() => { setFirstSlug(secondSlug); setSecondSlug(firstSlug); }} type="button">Swap selected models</button>
          <ModelCombobox activeOptionId={activeOptionId} activePicker={activePicker} label="Second model" onActivate={activatePicker} onBlur={() => { setActivePicker(null); setActiveOptionIndex(-1); }} onKeyDown={(event) => handleComboboxKeyDown('second', event)} onValueChange={(value) => updatePickerValue('second', value)} picker="second" value={secondSlug} />
        </div>
        <ul aria-label="Available models" className="comparison-model-options" id="comparison-model-options" role="listbox">
          {selectableModels.map((model, index) => <li aria-label={modelOptionLabel(model, duplicateModelNames)} aria-selected={(activePicker === 'second' ? secondSlug : firstSlug) === model.slug} data-active={activeOption?.slug === model.slug} id={`comparison-model-option-${index}`} key={model.slug} onClick={() => chooseModel(model)} onMouseDown={(event) => event.preventDefault()} role="option">
            <strong>{modelLabel(model)}</strong><span><code>{model.slug}</code> · {evidenceLabel(model.evidenceStatus)}</span>
          </li>)}
        </ul>
        {selectableModels.length === 0 ? <p className="comparison-empty-copy">No catalog models match these creator, metric-category, and search filters.</p> : null}
        <div className="comparison-selection-action">
          <p aria-live="polite">{selectionMessage}</p>
          {comparisonHref ? <a className="button" href={comparisonHref}>Compare selected models</a> : <button className="button" disabled type="button">Compare selected models</button>}
        </div>
      </section>

      <section className="comparison-panel comparison-section" aria-labelledby="comparison-reviewed-heading">
        <div className="comparison-section-heading"><h2 id="comparison-reviewed-heading">Popular reviewed matchups</h2><p>Only source-backed, indexable pairs are listed as published matchup links.</p></div>
        {popularPairs.length === 0 ? <div className="comparison-empty-state"><strong>No reviewed matchups published yet</strong><p>This directory remains honest when the active revision contains models but no indexable pair records.</p></div> : <ol className="comparison-reviewed-list">
          {popularPairs.map((pair) => <li key={pair.pairSlug}><a href={`/compare/${encodeURIComponent(pair.pairSlug)}`}>{modelPairLabel(pair, modelsBySlug)}</a><span>{pair.sharedMetricCount} shared source metrics</span></li>)}
        </ol>}
      </section>

      <div className="comparison-hub-support-grid">
        <section className="comparison-panel comparison-section" aria-labelledby="comparison-method-heading"><div className="comparison-section-heading"><h2 id="comparison-method-heading">How to read a matchup</h2><p>Compare exact source metric names and units. A workload profile recalculates only route-cost interpretation; it does not create a blended winner.</p></div></section>
        <section className="comparison-panel comparison-section" aria-labelledby="comparison-directory-heading"><div className="comparison-section-heading"><h2 id="comparison-directory-heading">Catalog evidence states</h2><p>Supported, estimated, and source-only records remain visibly distinct in the catalog options and detail evidence.</p></div></section>
      </div>

      <section className="comparison-panel comparison-section comparison-related-guides" aria-labelledby="comparison-guides-heading">
        <div className="comparison-section-heading"><h2 id="comparison-guides-heading">Related guides and tools</h2><p>Use these adjacent decision aids without treating a subscription estimate or a ranking lens as a model verdict.</p></div>
        <nav aria-label="Related comparison guides"><a href={ROUTE_PATHS.calculator}>Subscription vs. API calculator</a><a href={guidePath('openrouter-guide-model-routing-cost-controls')}>OpenRouter routing and cost controls guide</a><a href={LEADERBOARD_ROUTES['llm-pricing-context'].pathname}>Pricing and context leaderboard</a></nav>
      </section>
    </> : null}
  </div>;
}
