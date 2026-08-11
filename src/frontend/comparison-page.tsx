import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { BenchmarkMetric, BenchmarkModel, BenchmarkPriceCheck, BenchmarkSourceRecord } from '../benchmarks/contracts';
import { modelPath } from '../benchmarks/model-directory';
import { SITE_CONFIG } from '../brand/site-config';
import { ComparisonRadar, radarAxes } from './comparison-radar';
import { comparisonSummary, friendlyMetricLabel } from './comparison-summary';
import {
  comparisonMetricRowIdentity,
  type ComparisonMetricRow,
  type ComparisonPriceChecks,
  type ComparisonViewModel,
} from './comparison-contracts';
import { ModelPairPicker, type DirectoryModel, type DirectoryPair } from './model-pair-picker';
import { ProviderMark } from './provider-mark';
import { ShareAction } from './share-action';

type SelectedRouteState =
  | { readonly status: 'selected'; readonly route: BenchmarkPriceCheck }
  | { readonly status: 'ambiguous' | 'absent'; readonly route: null };

interface QuickPair extends DirectoryPair {
  readonly href: string;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value);
}

function formatDateTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'Unavailable';
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    timeZone: 'UTC',
    year: 'numeric',
    timeZoneName: 'short',
  }).format(new Date(timestamp));
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.length > 0;
  } catch {
    return false;
  }
}

function unavailable(): ReactNode {
  return <span className="comparison-unavailable">Unavailable</span>;
}

function notVerified(): ReactNode {
  return <span className="comparison-not-published">Not verified</span>;
}

function metricValue(metric: BenchmarkMetric | null): ReactNode {
  return metric === null ? unavailable() : formatNumber(metric.value);
}

function priceValue(value: number | null): ReactNode {
  return value === null ? notVerified() : `$${formatNumber(value)}`;
}

function tokenValue(value: number | null): ReactNode {
  return value === null ? notVerified() : new Intl.NumberFormat('en-US').format(value);
}

function listValue(value: readonly string[] | null): ReactNode {
  if (value === null) return notVerified();
  if (value.length === 0) return 'None published';
  return value.join(', ');
}

function unresolvedRouteValue(selection: SelectedRouteState): ReactNode | null {
  if (selection.status === 'ambiguous') return unavailable();
  if (selection.status === 'absent') return notVerified();
  return null;
}

function routePriceValue(selection: SelectedRouteState, value: number | null): ReactNode {
  return unresolvedRouteValue(selection) ?? priceValue(value);
}

function routeTokenValue(selection: SelectedRouteState, value: number | null): ReactNode {
  return unresolvedRouteValue(selection) ?? tokenValue(value);
}

function routeListValue(selection: SelectedRouteState, value: readonly string[] | null): ReactNode {
  return unresolvedRouteValue(selection) ?? listValue(value);
}

function modelEvidenceLabel(model: BenchmarkModel): string {
  if (model.evidenceStatus === 'supported') return 'Supported evidence';
  if (model.evidenceStatus === 'estimated') return 'Estimated evidence';
  return 'Source-only record';
}

function modelDisplayLabel(models: readonly [BenchmarkModel, BenchmarkModel], index: 0 | 1): string {
  const model = models[index];
  return models[1 - index].name === model.name ? `${model.name} (${model.slug})` : model.name;
}

function selectedRoute(group: ComparisonPriceChecks, selectedRouteId: string | null): SelectedRouteState {
  if (selectedRouteId !== null) {
    const matches = group.checks.filter((check) => check.routeId === selectedRouteId);
    if (matches.length === 1) return { status: 'selected', route: matches[0]! };
  }

  const routeIds = group.checks.map((check) => check.routeId);
  return {
    status: new Set(routeIds).size !== routeIds.length ? 'ambiguous' : 'absent',
    route: null,
  };
}

function selectableRoutes(group: ComparisonPriceChecks): readonly BenchmarkPriceCheck[] {
  const counts = new Map<string, number>();
  group.checks.forEach((check) => counts.set(check.routeId, (counts.get(check.routeId) ?? 0) + 1));
  return group.checks.filter((check) => counts.get(check.routeId) === 1);
}

function routeAvailability(selection: SelectedRouteState): ReactNode {
  if (selection.status === 'absent') return notVerified();
  return <span className="comparison-unavailable">Unavailable — route selection is ambiguous</span>;
}

function routeVerificationLabel(status: BenchmarkPriceCheck['verificationStatus']): string {
  if (status === 'primary') return 'Primary source';
  if (status === 'corroborating') return 'Corroborating source';
  return 'Conflicting source evidence';
}

/**
 * Verification belongs to the selected route, not to a separate table row. The
 * badge repeats the state as text so it never depends on colour alone.
 */
function RouteVerificationBadge({ selection }: { readonly selection: SelectedRouteState }) {
  if (selection.status !== 'selected') return null;
  const status = selection.route.verificationStatus;
  return <span className="comparison-route-verification" data-verification={status}>{routeVerificationLabel(status)}</span>;
}

function routeProvenanceLabel(
  models: readonly [BenchmarkModel, BenchmarkModel],
  index: 0 | 1,
  selection: SelectedRouteState,
): string {
  const model = modelDisplayLabel(models, index);
  if (selection.status === 'absent') return `${model} — Not published`;
  if (selection.status === 'ambiguous') return `${model} — Unavailable — Route selection is ambiguous`;
  return `${model} — route ${selection.route.routeId} · source ${selection.route.sourceId} · provider ${selection.route.providerId}`;
}

function modelDirectoryRecord(model: BenchmarkModel): DirectoryModel {
  return {
    slug: model.slug,
    name: model.name,
    creator: model.creator,
    sourceType: model.sourceType,
    evidenceStatus: model.evidenceStatus,
    utilitySelectable: true,
    metricCategories: [],
  };
}

function quickPairRecords(viewModel: ComparisonViewModel): readonly QuickPair[] {
  const currentPair: QuickPair = {
    pairSlug: viewModel.canonicalPath.slice('/compare/'.length),
    modelASlug: viewModel.models[0].slug,
    modelBSlug: viewModel.models[1].slug,
    featuredRank: 0,
    sharedMetricCount: viewModel.metricRows.length,
    href: viewModel.canonicalPath,
  };
  const records = [
    currentPair,
    ...viewModel.relatedPairs.map((pair): QuickPair => ({
      pairSlug: pair.pairSlug,
      modelASlug: pair.modelA.slug,
      modelBSlug: pair.modelB.slug,
      featuredRank: pair.featuredRank,
      sharedMetricCount: pair.sharedMetricCount,
      href: `/compare/${encodeURIComponent(pair.pairSlug)}`,
    })),
  ];
  const unique = new Map<string, QuickPair>();
  records.forEach((pair) => {
    if (!unique.has(pair.pairSlug)) unique.set(pair.pairSlug, pair);
  });
  return [...unique.values()];
}

function quickDirectoryModels(viewModel: ComparisonViewModel): readonly DirectoryModel[] {
  const records = [
    ...viewModel.models,
    ...viewModel.relatedPairs.flatMap((pair) => [pair.modelA, pair.modelB]),
  ];
  const unique = new Map<string, DirectoryModel>();
  records.forEach((model) => {
    if (!unique.has(model.slug)) unique.set(model.slug, modelDirectoryRecord(model));
  });
  return [...unique.values()];
}

function quickPairHref(firstSlug: string, secondSlug: string, pairs: readonly QuickPair[]): string | null {
  if (firstSlug === secondSlug) return null;
  return pairs.find((pair) => (pair.modelASlug === firstSlug && pair.modelBSlug === secondSlug)
    || (pair.modelASlug === secondSlug && pair.modelBSlug === firstSlug))?.href ?? null;
}

function ModelIdentity({ models, index }: { readonly models: readonly [BenchmarkModel, BenchmarkModel]; readonly index: 0 | 1 }) {
  const model = models[index];
  const headingId = `comparison-model-${index === 0 ? 'a' : 'b'}`;
  return <article className="comparison-model-identity" aria-labelledby={headingId}>
    <div className="comparison-model-heading">
      <ProviderMark loading="eager" providerId={model.creator} providerName={model.creator} size={32} />
      <div><p>{model.creator}</p><h3 id={headingId}><a href={modelPath(model.slug)}>{modelDisplayLabel(models, index)}</a></h3></div>
    </div>
    <dl>
      <div><dt>Model type</dt><dd>{model.sourceType}</dd></div>
      <div><dt>Evidence state</dt><dd>{modelEvidenceLabel(model)}</dd></div>
      <div><dt>Published context</dt><dd>{tokenValue(model.contextWindowTokens)}</dd></div>
    </dl>
  </article>;
}

function QuickPairSwitch({ viewModel }: { readonly viewModel: ComparisonViewModel }) {
  const options = useMemo(() => quickDirectoryModels(viewModel), [viewModel]);
  const pairs = useMemo(() => quickPairRecords(viewModel), [viewModel]);
  const [firstModelSlug, setFirstModelSlug] = useState(viewModel.models[0].slug);
  const [secondModelSlug, setSecondModelSlug] = useState(viewModel.models[1].slug);
  const href = quickPairHref(firstModelSlug, secondModelSlug, pairs);

  useEffect(() => {
    setFirstModelSlug(viewModel.models[0].slug);
    setSecondModelSlug(viewModel.models[1].slug);
  }, [viewModel.canonicalPath, viewModel.models]);

  return <section className="comparison-quick-switch" aria-labelledby="comparison-quick-switch-heading">
    <div className="comparison-section-heading">
      <h3 id="comparison-quick-switch-heading">Switch model pair</h3>
      <p>Choose from this result’s current and reviewed related models. Switching opens a reviewed comparison; it does not change this result’s evidence.</p>
    </div>
    <ModelPairPicker firstModelSlug={firstModelSlug} idPrefix="comparison-result" models={options} onFirstModelChange={setFirstModelSlug} onSecondModelChange={setSecondModelSlug} pairs={pairs} secondModelSlug={secondModelSlug} />
    <div className="comparison-selection-action">
      {href === null
        ? <p aria-live="polite">Choose a reviewed pair from the supplied result records.</p>
        : <a className="button button-secondary" href={href}>View selected comparison</a>}
    </div>
  </section>;
}

function PairHeader({ viewModel }: { readonly viewModel: ComparisonViewModel }) {
  const models = viewModel.models;
  const title = `${modelDisplayLabel(models, 0)} vs ${modelDisplayLabel(models, 1)}`;
  return <section className="comparison-intro comparison-result-header" aria-labelledby="comparison-detail-heading">
    <div className="comparison-header-topline">
      <nav className="comparison-breadcrumb" aria-label="Breadcrumb"><a href="/compare/">Compare</a><span aria-hidden="true">/</span><span aria-current="page">{title}</span></nav>
      <ShareAction text={`Compare ${title} on TokenBench.`} title={`${title} comparison`} url={`${SITE_CONFIG.origin}${viewModel.canonicalPath}`} />
    </div>
    <h1 id="comparison-detail-heading">{title}</h1>
    <p>Read the published evidence, route context, and missing facts before making a local decision. This page does not name a universal winner.</p>
    <section className="comparison-model-pair" aria-labelledby="comparison-model-pair-heading">
      <div className="comparison-section-heading"><h2 id="comparison-model-pair-heading">Models in this comparison</h2><p>Provider identity and evidence state stay balanced across the pair.</p></div>
      <div className="comparison-model-pair-grid"><ModelIdentity index={0} models={models} /><span className="comparison-versus-marker" aria-label="versus">VS</span><ModelIdentity index={1} models={models} /></div>
    </section>
    <QuickPairSwitch viewModel={viewModel} />
  </section>;
}

function Summary({ viewModel }: { readonly viewModel: ComparisonViewModel }) {
  const summary = comparisonSummary(viewModel);
  const coverage = summary.coverage === 'strong'
    ? 'Broad shared-metric coverage'
    : summary.coverage === 'limited'
      ? 'Limited shared-metric coverage'
      : 'Insufficient shared-metric coverage';
  return <section className="comparison-panel comparison-section" aria-labelledby="comparison-summary-heading">
    <div className="comparison-section-heading"><h2 id="comparison-summary-heading">{summary.heading}</h2><p>{coverage}. Each finding is tied to a published metric, price, context, or modality fact.</p></div>
    {summary.sentences.length === 0
      ? <p className="comparison-empty-copy">No decision-relevant implication can be verified for this pair yet.</p>
      : <ol className="comparison-highlights-list">{summary.sentences.map((sentence) => <li key={sentence}>{sentence}</li>)}</ol>}
  </section>;
}

function SharedMetricView({ viewModel }: { readonly viewModel: ComparisonViewModel }) {
  const axes = radarAxes(viewModel.metricRows, viewModel.models);
  const models = viewModel.models;
  return <section className="comparison-panel comparison-section" aria-labelledby="comparison-shared-metric-heading">
    <div className="comparison-section-heading"><h2 id="comparison-shared-metric-heading">Shared metric view</h2><p>{axes.length === 0 ? 'A radar is shown only when at least four compatible supported score metrics are published.' : 'The radar is a per-axis relative view; exact values and units remain available in its adjacent table.'}</p></div>
    {axes.length === 0 ? <div className="comparison-radar-fallback">
      <h3>Comparable metric detail</h3>
      {viewModel.metricRows.length === 0 ? <p className="comparison-empty-copy">No source metric detail is published for this active revision.</p> : <ul>
        {viewModel.metricRows.map((row) => <li key={comparisonMetricRowIdentity(row)}><strong>{friendlyMetricLabel(row.metricKey, row.category)}</strong><span>{modelDisplayLabel(models, 0)}: {metricValue(row.modelA)} · {modelDisplayLabel(models, 1)}: {metricValue(row.modelB)}</span></li>)}
      </ul>}
    </div> : <ComparisonRadar modelAName={modelDisplayLabel(models, 0)} modelBName={modelDisplayLabel(models, 1)} models={models} rows={viewModel.metricRows} />}
  </section>;
}

function SourceMetrics({ rows, models }: { readonly rows: readonly ComparisonMetricRow[]; readonly models: readonly [BenchmarkModel, BenchmarkModel] }) {
  return <section className="comparison-panel comparison-section" aria-labelledby="comparison-metrics-heading">
    <div className="comparison-section-heading"><h2 id="comparison-metrics-heading">Source metrics</h2><p>Friendly metric names and published units stay visible. Missing measurements remain unavailable rather than becoming a score.</p></div>
    {rows.length === 0 ? <p className="comparison-empty-copy">No source metrics are published for this active revision.</p> : <>
      <div className="comparison-table-wrap">
        <table className="comparison-table">
          <caption>Source metric comparison</caption>
          <thead><tr><th scope="col">Metric</th><th scope="col">Unit</th><th scope="col">{modelDisplayLabel(models, 0)}</th><th scope="col">{modelDisplayLabel(models, 1)}</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={comparisonMetricRowIdentity(row)}><th scope="row">{friendlyMetricLabel(row.metricKey, row.category)}</th><td>{row.unit}</td><td>{metricValue(row.modelA)}</td><td>{metricValue(row.modelB)}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="comparison-mobile-cards" aria-label="Source metrics, ordered cards">
        {rows.map((row) => <article className="comparison-mobile-card" key={comparisonMetricRowIdentity(row)}><h3>{friendlyMetricLabel(row.metricKey, row.category)}</h3><dl><div><dt>Unit</dt><dd>{row.unit}</dd></div><div><dt>{modelDisplayLabel(models, 0)}</dt><dd>{metricValue(row.modelA)}</dd></div><div><dt>{modelDisplayLabel(models, 1)}</dt><dd>{metricValue(row.modelB)}</dd></div></dl></article>)}
      </div>
    </>}
  </section>;
}

function RoutePicker({
  group,
  index,
  models,
  selectedRouteId,
  onChange,
}: {
  readonly group: ComparisonPriceChecks;
  readonly index: 0 | 1;
  readonly models: readonly [BenchmarkModel, BenchmarkModel];
  readonly selectedRouteId: string | null;
  readonly onChange: (routeId: string | null) => void;
}) {
  const options = selectableRoutes(group);
  const selection = selectedRoute(group, selectedRouteId);
  const hasSelectedOption = selectedRouteId !== null && options.some((route) => route.routeId === selectedRouteId);
  const label = `${modelDisplayLabel(models, index)} pricing route`;
  return <label className="comparison-route-picker">
    <span>{label}</span>
    {options.length === 0 ? <span className="comparison-route-picker-state">{routeAvailability(selection)}</span> : <select aria-label={label} onChange={(event) => onChange(event.currentTarget.value || null)} value={hasSelectedOption ? selectedRouteId ?? '' : ''}>
      {!hasSelectedOption ? <option value="">Choose a published route</option> : null}
      {options.map((route) => <option key={route.routeId} value={route.routeId}>{route.routeId} · {route.verificationStatus}</option>)}
    </select>}
    <RouteVerificationBadge selection={selection} />
  </label>;
}

function PricingContext({
  groups,
  models,
  selectedRouteIds,
  onRouteChange,
}: {
  readonly groups: readonly [ComparisonPriceChecks, ComparisonPriceChecks];
  readonly models: readonly [BenchmarkModel, BenchmarkModel];
  readonly selectedRouteIds: readonly [string | null, string | null];
  readonly onRouteChange: (index: 0 | 1, routeId: string | null) => void;
}) {
  const selections = [
    selectedRoute(groups[0], selectedRouteIds[0]),
    selectedRoute(groups[1], selectedRouteIds[1]),
  ] as const;
  const routes = [selections[0].route, selections[1].route] as const;
  // The cached-input row only exists when at least one side publishes the fact;
  // an all-empty row would read as evidence that neither side caches.
  const cachedInputPublished = typeof routes[0]?.cachedInputUsdPerMillion === 'number'
    || typeof routes[1]?.cachedInputUsdPerMillion === 'number';
  const rows: readonly { readonly label: string; readonly unit: string; readonly left: ReactNode; readonly right: ReactNode }[] = [
    { label: 'Input API price', unit: 'USD / 1M tokens', left: routePriceValue(selections[0], routes[0]?.inputUsdPerMillion ?? null), right: routePriceValue(selections[1], routes[1]?.inputUsdPerMillion ?? null) },
    ...(cachedInputPublished
      ? [{ label: 'Cached input API price', unit: 'USD / 1M tokens', left: routePriceValue(selections[0], routes[0]?.cachedInputUsdPerMillion ?? null), right: routePriceValue(selections[1], routes[1]?.cachedInputUsdPerMillion ?? null) }]
      : []),
    { label: 'Output API price', unit: 'USD / 1M tokens', left: routePriceValue(selections[0], routes[0]?.outputUsdPerMillion ?? null), right: routePriceValue(selections[1], routes[1]?.outputUsdPerMillion ?? null) },
    { label: 'Route context', unit: 'tokens', left: routeTokenValue(selections[0], routes[0]?.contextWindowTokens ?? null), right: routeTokenValue(selections[1], routes[1]?.contextWindowTokens ?? null) },
    { label: 'Input modalities', unit: 'published list', left: routeListValue(selections[0], routes[0]?.inputModalities ?? null), right: routeListValue(selections[1], routes[1]?.inputModalities ?? null) },
    { label: 'Output modalities', unit: 'published list', left: routeListValue(selections[0], routes[0]?.outputModalities ?? null), right: routeListValue(selections[1], routes[1]?.outputModalities ?? null) },
  ];

  return <section className="comparison-panel comparison-section" aria-labelledby="comparison-pricing-heading">
    <div className="comparison-section-heading"><h2 id="comparison-pricing-heading">Pricing and context</h2><p>Verification is shown beside each selected route. Missing facts remain <em>Not verified</em>.</p></div>
    <div className="comparison-route-picker-grid">
      <RoutePicker group={groups[0]} index={0} models={models} onChange={(routeId) => onRouteChange(0, routeId)} selectedRouteId={selectedRouteIds[0]} />
      <RoutePicker group={groups[1]} index={1} models={models} onChange={(routeId) => onRouteChange(1, routeId)} selectedRouteId={selectedRouteIds[1]} />
    </div>
    <div className="comparison-table-wrap">
      <table className="comparison-table">
        <caption>Route pricing and context comparison</caption>
        <thead><tr><th scope="col">Field</th><th scope="col">Unit</th><th scope="col">{modelDisplayLabel(models, 0)}</th><th scope="col">{modelDisplayLabel(models, 1)}</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.unit}</td><td>{row.left}</td><td>{row.right}</td></tr>)}</tbody>
      </table>
    </div>
    <div className="comparison-mobile-cards" aria-label="Pricing and context, ordered cards">
      {rows.map((row) => <article className="comparison-mobile-card" key={row.label}><h3>{row.label}</h3><dl><div><dt>Unit</dt><dd>{row.unit}</dd></div><div><dt>{modelDisplayLabel(models, 0)}</dt><dd>{row.left}</dd></div><div><dt>{modelDisplayLabel(models, 1)}</dt><dd>{row.right}</dd></div></dl></article>)}
    </div>
  </section>;
}

function Attribution({ source }: { readonly source: BenchmarkSourceRecord }) {
  return <>{isHttpsUrl(source.sourceUrl)
    ? <a href={source.sourceUrl} rel="noreferrer" target="_blank">{source.attributionText}</a>
    : <span>{source.attributionText}</span>}<span>{source.sourceId} · observed {formatDateTime(source.observedAt)}</span></>;
}

function EvidenceProvenance({
  selectedRoutes,
  viewModel,
}: {
  readonly selectedRoutes: readonly [SelectedRouteState, SelectedRouteState];
  readonly viewModel: ComparisonViewModel;
}) {
  const freshness = viewModel.freshness.status === 'fresh' ? 'Fresh' : 'Stale';
  const methodology = viewModel.methodology.length === 0
    ? 'Unavailable'
    : viewModel.methodology.map((item) => `${item.sourceId}: ${item.methodology}`).join(' · ');
  return <section className="comparison-panel comparison-section comparison-provenance" aria-labelledby="comparison-provenance-heading">
    <div className="comparison-section-heading"><h2 id="comparison-provenance-heading">Evidence provenance</h2><p>Source records, route identity, timestamps, and methodology are consolidated here without declaring either model a winner.</p></div>
    <dl className="comparison-provenance-list">
      <div><dt>Publication time</dt><dd>{formatDateTime(viewModel.publishedAt)}</dd></div>
      <div><dt>Freshness</dt><dd>{freshness}{viewModel.freshness.message ? ` — ${viewModel.freshness.message}` : ''}</dd></div>
      <div><dt>Methodology</dt><dd>{methodology === 'Unavailable' ? unavailable() : methodology}</dd></div>
      <div className="comparison-provenance-sources"><dt>Model records</dt><dd><ul>{viewModel.models.map((model, index) => <li key={model.modelKey}>{modelDisplayLabel(viewModel.models, index as 0 | 1)} — source {model.sourceId} · artifact {model.sourceArtifactId} · model {model.sourceModelId}</li>)}</ul></dd></div>
      <div className="comparison-provenance-sources"><dt>Selected price routes</dt><dd><ul>{selectedRoutes.map((selection, index) => <li key={viewModel.models[index]!.modelKey}>{routeProvenanceLabel(viewModel.models, index as 0 | 1, selection)}</li>)}</ul></dd></div>
      <div className="comparison-provenance-sources"><dt>Source records</dt><dd><ul>{viewModel.attribution.map((source) => <li key={`${source.sourceId}:${source.artifactId}`}><Attribution source={source} /></li>)}</ul></dd></div>
    </dl>
  </section>;
}

export function ComparisonPage({ viewModel }: { readonly viewModel: ComparisonViewModel }) {
  const [clientHydrated, setClientHydrated] = useState(false);
  const [selectedRouteIds, setSelectedRouteIds] = useState<readonly [string | null, string | null]>(() => [
    viewModel.priceChecks[0].selectedRouteId,
    viewModel.priceChecks[1].selectedRouteId,
  ]);
  const selectedRoutes = [
    selectedRoute(viewModel.priceChecks[0], selectedRouteIds[0]),
    selectedRoute(viewModel.priceChecks[1], selectedRouteIds[1]),
  ] as const;
  const summaryViewModel: ComparisonViewModel = {
    ...viewModel,
    priceChecks: [
      { ...viewModel.priceChecks[0], selectedRouteId: selectedRouteIds[0] },
      { ...viewModel.priceChecks[1], selectedRouteId: selectedRouteIds[1] },
    ],
  };

  useEffect(() => setClientHydrated(true), []);
  useEffect(() => {
    setSelectedRouteIds([viewModel.priceChecks[0].selectedRouteId, viewModel.priceChecks[1].selectedRouteId]);
  }, [viewModel.canonicalPath, viewModel.priceChecks]);

  return <div className="comparison-page comparison-detail-page" data-client-hydrated={clientHydrated ? 'true' : 'false'}>
    <PairHeader viewModel={viewModel} />
    <Summary viewModel={summaryViewModel} />
    <SharedMetricView viewModel={viewModel} />
    <SourceMetrics models={viewModel.models} rows={viewModel.metricRows} />
    <PricingContext groups={viewModel.priceChecks} models={viewModel.models} onRouteChange={(index, routeId) => setSelectedRouteIds((current) => index === 0 ? [routeId, current[1]] : [current[0], routeId])} selectedRouteIds={selectedRouteIds} />
    <EvidenceProvenance selectedRoutes={selectedRoutes} viewModel={viewModel} />
  </div>;
}
