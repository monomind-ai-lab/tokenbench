import { useEffect, useMemo, useState } from 'react';
import { editorialComparisonFor } from '../benchmarks/comparison-allowlist';
import { compareUtf8Binary } from '../benchmarks/contracts';
import { trackTokenBenchEvent } from '../frontend/analytics';
import { useCompareState } from '../frontend/compare-state';
import { ModelPairPicker, type CompareDirectoryEnvelope, type DirectoryModel, type DirectoryPair, type EvidenceStatus, type SourceType } from '../frontend/model-pair-picker';
import { NewsletterSignup } from '../frontend/newsletter-signup';
import { ROUTE_PATHS } from '../routing/routes';

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
  const { slug, name, creator, sourceType, evidenceStatus, utilitySelectable, metricCategories } = value;
  if (!isText(slug)
    || !isText(name)
    || !isText(creator)
    || !isSourceType(sourceType)
    || !isEvidenceStatus(evidenceStatus)
    || typeof utilitySelectable !== 'boolean'
    || !Array.isArray(metricCategories)
    || !metricCategories.every(isText)) return null;
  return {
    slug,
    name,
    creator,
    sourceType,
    evidenceStatus,
    utilitySelectable,
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

function modelPairLabel(pair: DirectoryPair, modelsBySlug: ReadonlyMap<string, DirectoryModel>): string {
  const modelA = modelsBySlug.get(pair.modelASlug);
  const modelB = modelsBySlug.get(pair.modelBSlug);
  if (!modelA || !modelB) return pair.pairSlug;
  return modelA.name === modelB.name
    ? `${modelA.name} (${modelA.slug}) vs ${modelB.name} (${modelB.slug})`
    : `${modelA.name} vs ${modelB.name}`;
}

function CompareHubHero() {
  return <section className="comparison-hub-hero" aria-labelledby="compare-hub-heading">
    <h1 id="compare-hub-heading">Compare models<br /> side by side</h1>
    <p>Choose two models to compare benchmark performance, API pricing, context limits, and evidence coverage.</p>
  </section>;
}

export interface CompareFormState {
  readonly valid: boolean;
  readonly reason: string;
}

/** The landing action accepts two distinct published stable IDs and nothing else. */
export function compareFormState(ids: readonly string[], publishedIds?: ReadonlySet<string>): CompareFormState {
  if (ids.length !== 2 || ids.some((id) => id.trim().length === 0)) return { valid: false, reason: 'Choose two models' };
  if (ids[0] === ids[1]) return { valid: false, reason: 'Choose two different models' };
  if (publishedIds && ids.some((id) => !publishedIds.has(id))) return { valid: false, reason: 'Choose two known published models' };
  return { valid: true, reason: 'Two distinct published models are selected.' };
}

/** Presentation order may swap, but pair URLs always use binary stable-slug order. */
function canonicalPairId(first: DirectoryModel, second: DirectoryModel): string {
  const [left, right] = [first.slug, second.slug].sort(compareUtf8Binary);
  return `${left}-vs-${right}`;
}

export function comparisonPath(first: DirectoryModel, second: DirectoryModel): string {
  return `${ROUTE_PATHS.comparison}${encodeURIComponent(canonicalPairId(first, second))}/`;
}

function featuredEffectiveDate(value: string): string {
  const [year, month, day] = value.split('-');
  const monthName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(month) - 1];
  return monthName ? `${Number(day)} ${monthName} ${year}` : value;
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

export function CompareHubPage() {
  const state = useCompareDirectory();
  const { selection } = useCompareState();
  const [firstModelSlug, setFirstModelSlug] = useState('');
  const [secondModelSlug, setSecondModelSlug] = useState('');
  const [prefillNotice, setPrefillNotice] = useState('');
  const directory = state.envelope?.data.compareDirectory;
  const models = directory?.models ?? [];
  const pairs = directory?.indexablePairs ?? [];
  const modelsBySlug = useMemo(() => new Map(models.map((model) => [model.slug, model])), [models]);
  const selectableModelsBySlug = useMemo(() => new Map(models.filter((model) => model.utilitySelectable).map((model) => [model.slug, model])), [models]);
  const selectedIds = [firstModelSlug, secondModelSlug] as const;
  const initialState = compareFormState(selectedIds, new Set(selectableModelsBySlug.keys()));
  const hasRetiredSelection = selectedIds.some((slug) => slug !== '' && modelsBySlug.has(slug) && !selectableModelsBySlug.has(slug));
  const formState = hasRetiredSelection
    ? { valid: false, reason: 'That model is retired or unavailable for comparison.' }
    : initialState;
  const first = selectableModelsBySlug.get(firstModelSlug) ?? null;
  const second = selectableModelsBySlug.get(secondModelSlug) ?? null;
  const comparisonHref = formState.valid && first && second ? comparisonPath(first, second) : null;
  const popularPairs = pairs.slice(0, 12);
  const selectionMessage = formState.valid && (first?.evidenceStatus !== 'supported' || second?.evidenceStatus !== 'supported')
    ? 'This pair has partial evidence. Unavailable fields will stay visible in the result.'
    : formState.reason;

  const validationFailure = (ids: readonly [string, string]): 'missing' | 'duplicate' | 'unknown' | 'retired' | null => {
    if (ids.some((slug) => slug !== '' && !modelsBySlug.has(slug))) return 'unknown';
    if (ids.some((slug) => slug !== '' && modelsBySlug.has(slug) && !selectableModelsBySlug.has(slug))) return 'retired';
    if (ids.some((slug) => slug === '')) return 'missing';
    if (ids[0] === ids[1]) return 'duplicate';
    return null;
  };
  const trackValidationFailure = (ids: readonly [string, string]) => {
    const reason = validationFailure(ids);
    if (reason !== null) trackTokenBenchEvent('compare_validation_failed', { reason, route: ROUTE_PATHS.compareHub });
  };
  const updateFirstModel = (slug: string) => {
    setFirstModelSlug(slug);
    if (selectableModelsBySlug.has(slug)) trackTokenBenchEvent('compare_selector_changed', { modelId: slug, route: ROUTE_PATHS.compareHub, slot: 'first' });
    trackValidationFailure([slug, secondModelSlug]);
  };
  const updateSecondModel = (slug: string) => {
    setSecondModelSlug(slug);
    if (selectableModelsBySlug.has(slug)) trackTokenBenchEvent('compare_selector_changed', { modelId: slug, route: ROUTE_PATHS.compareHub, slot: 'second' });
    trackValidationFailure([firstModelSlug, slug]);
  };

  useEffect(() => {
    if (state.phase !== 'ready' || firstModelSlug || secondModelSlug || selection.ids.length < 2) return;
    const usable = selection.ids.filter((id) => selectableModelsBySlug.has(id));
    if (usable.length >= 2) {
      setFirstModelSlug(usable[0]!);
      setSecondModelSlug(usable[1]!);
      setPrefillNotice(selection.ids.length > 2 ? 'The first two valid shared models were prefilled; the third remains in the comparison tray.' : 'Your shared model pair was prefilled.');
      trackTokenBenchEvent('compare_prefill_used', { count: usable.length === 3 ? '3' : '2', route: ROUTE_PATHS.compareHub });
    } else {
      setPrefillNotice('A shared model selection could not be used because one or more published IDs are unavailable.');
    }
  }, [firstModelSlug, secondModelSlug, selectableModelsBySlug, selection.ids, state.phase]);

  return <div className="comparison-page comparison-hub-page">
    <CompareHubHero />
    {state.phase === 'loading' ? <section className="comparison-state-panel" role="status"><strong>Loading published benchmark directory</strong><p>Checking the available models and reviewed matchups.</p></section> : null}
    {state.phase === 'unavailable' ? <section className="comparison-state-panel comparison-empty-state" role="status"><strong>Unavailable</strong><p>The published benchmark directory is unavailable. No comparison navigation is being created from incomplete data.</p></section> : null}
    {state.phase === 'ready' && state.envelope && directory ? <>
      {state.envelope.freshness.status === 'stale' ? <section className="comparison-state-panel comparison-stale" role="status"><strong>Published benchmark revision is stale</strong><p>{state.envelope.freshness.message ?? 'Published benchmark revision is stale.'}</p></section> : null}
      <div aria-label="Comparison tools" className="comparison-tool-grid" role="group">
        <section className="comparison-panel comparison-selector-panel" aria-labelledby="comparison-select-heading">
          <div className="comparison-section-heading"><h2 id="comparison-select-heading">Choose a model pair</h2><p>Popular models appear first. Search to browse every selectable model in the published directory.</p></div>
          <form action={comparisonHref ?? ROUTE_PATHS.comparison} method="get" onSubmit={() => {
            if (!formState.valid || !first || !second) {
              trackValidationFailure(selectedIds);
              return;
            }
            trackTokenBenchEvent('comparison_started', { pairId: canonicalPairId(first, second), route: ROUTE_PATHS.compareHub });
          }}>
            <ModelPairPicker firstModelSlug={firstModelSlug} idPrefix="comparison" models={models} onFirstModelChange={updateFirstModel} onSecondModelChange={updateSecondModel} pairs={pairs} secondModelSlug={secondModelSlug} />
            <div className="comparison-selection-action">
              {prefillNotice ? <p role="status">{prefillNotice}</p> : null}
              <p aria-live="polite" id="compare-validation-message">{selectionMessage}</p>
              <button className="button button-secondary comparison-swap" disabled={!first || !second} onClick={() => {
                if (first && second) trackTokenBenchEvent('compare_pair_swapped', { pairId: canonicalPairId(first, second), route: ROUTE_PATHS.compareHub });
                setFirstModelSlug(secondModelSlug);
                setSecondModelSlug(firstModelSlug);
              }} type="button">Swap selected models</button>
              <button aria-describedby="compare-validation-message" aria-disabled={!formState.valid} className="button" disabled={!formState.valid} type="submit">Compare selected models</button>
              <button className="button button-secondary" disabled={!firstModelSlug && !secondModelSlug} onClick={() => { setFirstModelSlug(''); setSecondModelSlug(''); setPrefillNotice(''); }} type="button">Clear model selection</button>
            </div>
          </form>
        </section>

        <aside aria-label="Model and price alerts" className="comparison-newsletter-signup"><NewsletterSignup compact context="compare" /></aside>
      </div>

      <section className="comparison-panel comparison-section" aria-labelledby="comparison-reviewed-heading">
        <div className="comparison-section-heading"><h2 id="comparison-reviewed-heading">Popular model pairs</h2><p>These published pair shortcuts fill the selector first, so you can review the evidence status before comparing.</p></div>
        {popularPairs.length === 0 ? <div className="comparison-empty-state"><strong>No reviewed matchups published yet</strong><p>This directory remains honest when the active revision contains models but no indexable pair records.</p></div> : <ol className="comparison-reviewed-list">
          {popularPairs.map((pair) => {
            const featured = editorialComparisonFor(pair.pairSlug);
            return <li key={pair.pairSlug}>
              <button className="comparison-matchup-link" onClick={() => {
                const pairModels = [modelsBySlug.get(pair.modelASlug), modelsBySlug.get(pair.modelBSlug)] as const;
                if (pairModels[0] && pairModels[1]) trackTokenBenchEvent('compare_popular_pair_selected', { pairId: canonicalPairId(pairModels[0], pairModels[1]), route: ROUTE_PATHS.compareHub });
                setFirstModelSlug(pair.modelASlug);
                setSecondModelSlug(pair.modelBSlug);
                setPrefillNotice('Popular pair selected. Review the validation message, then compare.');
              }} type="button"><strong>Use {modelPairLabel(pair, modelsBySlug)}</strong><span aria-hidden="true">→</span></button>
              {featured ? <div className="comparison-reviewed-feature" role="note"><strong>Reviewed editorial comparison</strong><p>{featured.claim}</p><span>Effective {featuredEffectiveDate(featured.effectiveDate)}</span><span>Source coverage: {featured.sourceCoverage}</span></div> : null}
            </li>;
          })}
        </ol>}
      </section>
    </> : null}
  </div>;
}
