import { useEffect, useState, type ReactNode } from 'react';
import type { BenchmarkMetric, BenchmarkModel, BenchmarkPriceCheck, BenchmarkSourceRecord } from '../benchmarks/contracts';
import { blendedCostPerMillion, type WorkloadProfile } from '../benchmarks/value';
import { ROUTE_PATHS } from '../routing/routes';
import { comparisonMetricRowIdentity, selectedComparisonPriceCheck, type ComparisonMetricRow, type ComparisonPriceChecks, type ComparisonViewModel, type RelatedComparison } from './comparison-contracts';

const WORKLOAD_OPTIONS: readonly { readonly id: WorkloadProfile; readonly label: string; readonly description: string }[] = [
  { id: 'inputHeavy', label: 'Input-heavy', description: 'For work dominated by incoming context.' },
  { id: 'balanced', label: 'Balanced', description: 'For an even input and output view.' },
  { id: 'outputHeavy', label: 'Output-heavy', description: 'For work dominated by generated output.' },
];

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value);
}

function formatTokens(value: number | null): string {
  return value === null ? 'Unavailable' : `${new Intl.NumberFormat('en-US').format(value)} tokens`;
}

function formatCost(value: number | null): string {
  return value === null
    ? 'Unavailable'
    : `${new Intl.NumberFormat('en-US', { currency: 'USD', maximumFractionDigits: 2, minimumFractionDigits: 2, style: 'currency' }).format(value)} / 1M`;
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

function unavailable(value: string): ReactNode {
  return value === 'Unavailable' ? <span className="comparison-unavailable">Unavailable</span> : value;
}

function metricValue(metric: BenchmarkMetric | null): ReactNode {
  return metric === null ? unavailable('Unavailable') : formatNumber(metric.value);
}

function modelEvidenceLabel(model: BenchmarkModel): string {
  if (model.evidenceStatus === 'supported') return 'Supported';
  if (model.evidenceStatus === 'estimated') return 'Estimated';
  return 'Source only';
}

function stableDomId(prefix: string, value: string): string {
  const encoded = new TextEncoder().encode(value);
  const hex = [...encoded].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${prefix}-${hex}`;
}

function modelDisplayLabel(models: readonly [BenchmarkModel, BenchmarkModel], index: 0 | 1): string {
  const model = models[index];
  return models[1 - index].name === model.name ? `${model.name} (${model.slug})` : model.name;
}

function duplicateRelatedModelNames(pairs: readonly RelatedComparison[]): ReadonlySet<string> {
  const modelKeysByName = new Map<string, Set<string>>();
  for (const pair of pairs) {
    for (const model of [pair.modelA, pair.modelB]) {
      const modelKeys = modelKeysByName.get(model.name) ?? new Set<string>();
      modelKeys.add(model.modelKey);
      modelKeysByName.set(model.name, modelKeys);
    }
  }
  return new Set([...modelKeysByName].flatMap(([name, modelKeys]) => modelKeys.size > 1 ? [name] : []));
}

function relatedComparisonLabel(pair: RelatedComparison, duplicateNames: ReadonlySet<string>): string {
  const modelLabel = (model: BenchmarkModel): string => duplicateNames.has(model.name) ? `${model.name} (${model.slug})` : model.name;
  return `${modelLabel(pair.modelA)} vs ${modelLabel(pair.modelB)}`;
}

function selectedRoute(
  group: ComparisonPriceChecks,
): BenchmarkPriceCheck | null {
  return selectedComparisonPriceCheck(group);
}

function routeWorkloadCost(route: BenchmarkPriceCheck | null, profile: WorkloadProfile): number | null {
  if (route?.inputUsdPerMillion === null || route?.outputUsdPerMillion === null || route === null) return null;
  return blendedCostPerMillion(route.inputUsdPerMillion, route.outputUsdPerMillion, profile);
}

function priceAmount(value: number | null): ReactNode {
  return value === null ? unavailable('Unavailable') : `$${formatNumber(value)}`;
}

function routeContext(route: BenchmarkPriceCheck | null): ReactNode {
  const contextWindowTokens = route?.contextWindowTokens ?? null;
  return unavailable(contextWindowTokens === null ? 'Unavailable' : new Intl.NumberFormat('en-US').format(contextWindowTokens));
}

function PriceRouteContext({
  models,
  index,
  route,
}: {
  readonly models: readonly [BenchmarkModel, BenchmarkModel];
  readonly index: 0 | 1;
  readonly route: BenchmarkPriceCheck | null;
}) {
  return <div className="comparison-route-context">
    <strong>{modelDisplayLabel(models, index)}</strong>
    {route ? <code>{route.routeId}</code> : <span className="comparison-unavailable">No primary hosted route</span>}
  </div>;
}

function ModelIdentity({ models, index }: { readonly models: readonly [BenchmarkModel, BenchmarkModel]; readonly index: 0 | 1 }) {
  const model = models[index];
  const headingId = stableDomId('comparison-model', model.modelKey);
  return <article className="comparison-model-identity" aria-labelledby={headingId}>
    <h3 id={headingId}>{modelDisplayLabel(models, index)}</h3>
    <dl>
      <div><dt>Creator</dt><dd>{model.creator}</dd></div>
      <div><dt>Model type</dt><dd>{model.sourceType}</dd></div>
      <div><dt>Evidence state</dt><dd>{modelEvidenceLabel(model)}</dd></div>
      <div><dt>Declared context</dt><dd>{unavailable(formatTokens(model.contextWindowTokens))}</dd></div>
    </dl>
    <p className="comparison-identity-source">Source model: <code>{model.sourceModelId}</code></p>
  </article>;
}

function SourceMetrics({ rows, models }: { readonly rows: readonly ComparisonMetricRow[]; readonly models: readonly [BenchmarkModel, BenchmarkModel] }) {
  return <section className="comparison-panel comparison-section" aria-labelledby="comparison-metrics-heading">
    <div className="comparison-section-heading">
      <h2 id="comparison-metrics-heading">Source metrics</h2>
      <p>Metric names, source roles, and units stay visible. Missing measurements remain unavailable rather than being normalized into a score.</p>
    </div>
    {rows.length === 0 ? <p className="comparison-empty-copy">No source metrics are available for this active revision.</p> : <>
      <div className="comparison-table-wrap">
        <table className="comparison-table">
          <caption>Source metric comparison</caption>
          <thead><tr><th scope="col">Metric</th><th scope="col">Source</th><th scope="col">Unit</th><th scope="col">{modelDisplayLabel(models, 0)}</th><th scope="col">{modelDisplayLabel(models, 1)}</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={comparisonMetricRowIdentity(row)}>
            <th scope="row"><code>{row.metricKey}</code></th><td>{row.sourceId}</td><td>{row.unit}</td><td>{metricValue(row.modelA)}</td><td>{metricValue(row.modelB)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="comparison-mobile-cards" aria-label="Source metrics, ordered cards">
        {rows.map((row) => <article className="comparison-mobile-card" key={comparisonMetricRowIdentity(row)}>
          <h3><code>{row.metricKey}</code></h3>
          <dl>
            <div><dt>Source</dt><dd>{row.sourceId}</dd></div><div><dt>Category</dt><dd>{row.category}</dd></div><div><dt>Unit</dt><dd>{row.unit}</dd></div><div><dt>Methodology</dt><dd>{row.methodology}</dd></div>
            <div><dt>{modelDisplayLabel(models, 0)}</dt><dd>{metricValue(row.modelA)}</dd></div><div><dt>{modelDisplayLabel(models, 1)}</dt><dd>{metricValue(row.modelB)}</dd></div>
          </dl>
        </article>)}
      </div>
    </>}
  </section>;
}

function PricingContext({
  groups,
  models,
  profile,
}: {
  readonly groups: readonly [ComparisonPriceChecks, ComparisonPriceChecks];
  readonly models: readonly [BenchmarkModel, BenchmarkModel];
  readonly profile: WorkloadProfile;
}) {
  const routes = groups.map((group) => selectedRoute(group)) as [BenchmarkPriceCheck | null, BenchmarkPriceCheck | null];
  const leftWorkloadCost = formatCost(routeWorkloadCost(routes[0], profile));
  const rightWorkloadCost = formatCost(routeWorkloadCost(routes[1], profile));
  const leftRouteContext = routeContext(routes[0]);
  const rightRouteContext = routeContext(routes[1]);
  const rows: readonly {
    readonly label: string;
    readonly unit: string;
    readonly left: ReactNode;
    readonly right: ReactNode;
    readonly mobileLeft: ReactNode;
    readonly mobileRight: ReactNode;
  }[] = [
    { label: 'Input API price', unit: 'USD / 1M tokens', left: priceAmount(routes[0]?.inputUsdPerMillion ?? null), right: priceAmount(routes[1]?.inputUsdPerMillion ?? null), mobileLeft: priceAmount(routes[0]?.inputUsdPerMillion ?? null), mobileRight: priceAmount(routes[1]?.inputUsdPerMillion ?? null) },
    { label: 'Output API price', unit: 'USD / 1M tokens', left: priceAmount(routes[0]?.outputUsdPerMillion ?? null), right: priceAmount(routes[1]?.outputUsdPerMillion ?? null), mobileLeft: priceAmount(routes[0]?.outputUsdPerMillion ?? null), mobileRight: priceAmount(routes[1]?.outputUsdPerMillion ?? null) },
    {
      label: 'Route context',
      unit: 'tokens',
      left: leftRouteContext,
      right: rightRouteContext,
      mobileLeft: leftRouteContext,
      mobileRight: rightRouteContext,
    },
    {
      label: 'Workload estimate',
      unit: 'USD / 1M tokens',
      left: <span data-testid={`workload-cost-${models[0].modelKey}`}>{unavailable(leftWorkloadCost)}</span>,
      right: <span data-testid={`workload-cost-${models[1].modelKey}`}>{unavailable(rightWorkloadCost)}</span>,
      mobileLeft: unavailable(leftWorkloadCost),
      mobileRight: unavailable(rightWorkloadCost),
    },
  ];

  return <section className="comparison-panel comparison-section" aria-labelledby="comparison-pricing-heading">
    <div className="comparison-section-heading">
      <h2 id="comparison-pricing-heading">Pricing and context</h2>
      <p>Route-level pricing and declared context remain attached to the selected source route. The workload lens changes cost interpretation, not evidence status.</p>
    </div>
    <div className="comparison-table-wrap">
      <table className="comparison-table">
        <caption>Route pricing and context comparison</caption>
        <thead><tr><th scope="col">Field</th><th scope="col">Source</th><th scope="col">Unit</th><th scope="col">{modelDisplayLabel(models, 0)}</th><th scope="col">{modelDisplayLabel(models, 1)}</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.label}><th scope="row">{row.label}</th><td>OpenRouter</td><td>{row.unit}</td><td>{row.left}</td><td>{row.right}</td></tr>)}</tbody>
      </table>
    </div>
    <div className="comparison-mobile-cards" aria-label="Pricing and context, ordered cards">
      {rows.map((row) => <article className="comparison-mobile-card" key={row.label}><h3>{row.label}</h3><dl><div><dt>Source</dt><dd>OpenRouter</dd></div><div><dt>Unit</dt><dd>{row.unit}</dd></div><div><dt>{modelDisplayLabel(models, 0)}</dt><dd>{row.mobileLeft}</dd></div><div><dt>{modelDisplayLabel(models, 1)}</dt><dd>{row.mobileRight}</dd></div></dl></article>)}
    </div>
    <div className="comparison-route-list" aria-label="Primary hosted routes used for pricing">
      <PriceRouteContext index={0} models={models} route={routes[0]} /><PriceRouteContext index={1} models={models} route={routes[1]} />
    </div>
  </section>;
}

function WorkloadPicker({ profile, onChange }: { readonly profile: WorkloadProfile; readonly onChange: (profile: WorkloadProfile) => void }) {
  return <section className="comparison-panel comparison-section" aria-labelledby="comparison-workload-heading">
    <div className="comparison-section-heading"><h2 id="comparison-workload-heading">Workload view</h2><p>Choose the token shape that reflects the work under review. A workload lens changes cost interpretation, not the evidence state.</p></div>
    <fieldset className="comparison-workload-fieldset">
      <legend>Input and output emphasis</legend>
      <div className="comparison-workload-options">
        {WORKLOAD_OPTIONS.map((option) => <label className="comparison-workload-option" key={option.id}>
          <input aria-label={option.label} checked={profile === option.id} name="comparison-workload" onChange={() => onChange(option.id)} type="radio" value={option.id} />
          <span><strong>{option.label}</strong><small>{option.description}</small></span>
        </label>)}
      </div>
    </fieldset>
  </section>;
}

function Attribution({ source }: { readonly source: BenchmarkSourceRecord }) {
  const label = source.attributionText;
  return <>{isHttpsUrl(source.sourceUrl)
    ? <a href={source.sourceUrl} rel="noreferrer" target="_blank">{label}</a>
    : <span>{label}</span>}<span>{source.sourceId} · observed {formatDateTime(source.observedAt)}</span></>;
}

function EvidenceProvenance({ viewModel }: { readonly viewModel: ComparisonViewModel }) {
  const freshness = viewModel.freshness.status === 'fresh' ? 'Fresh' : 'Stale';
  const methodology = viewModel.methodology.length === 0
    ? 'Unavailable'
    : viewModel.methodology.map((item) => `${item.sourceId}: ${item.methodology}`).join(' · ');
  return <section className="comparison-panel comparison-section" aria-labelledby="comparison-provenance-heading">
    <div className="comparison-section-heading"><h2 id="comparison-provenance-heading">Evidence provenance</h2><p>Source roles, timestamps, and methodology stay explicit without declaring either model a winner.</p></div>
    <dl className="comparison-provenance-list">
      <div><dt>Publication time</dt><dd>{formatDateTime(viewModel.publishedAt)}</dd></div>
      <div><dt>Freshness</dt><dd>{freshness}{viewModel.freshness.message ? ` — ${viewModel.freshness.message}` : ''}</dd></div>
      <div><dt>Methodology</dt><dd>{unavailable(methodology)}</dd></div>
      <div className="comparison-provenance-sources"><dt>Source records</dt><dd><ul>{viewModel.attribution.map((source) => <li key={`${source.sourceId}:${source.artifactId}`}><Attribution source={source} /></li>)}</ul></dd></div>
    </dl>
  </section>;
}

function RelatedComparisons({ viewModel }: { readonly viewModel: ComparisonViewModel }) {
  const duplicateNames = duplicateRelatedModelNames(viewModel.relatedPairs);
  return <section className="comparison-panel comparison-section" aria-labelledby="comparison-related-heading">
    <div className="comparison-section-heading"><h2 id="comparison-related-heading">Related comparisons</h2><p>Only reviewed, evidence-qualified pairs appear in this area.</p></div>
    {viewModel.relatedPairs.length === 0 ? <div className="comparison-empty-state"><strong>No related reviewed comparisons are available.</strong><p>This empty state avoids implying an editorially reviewed or published matchup.</p></div> : <ul className="comparison-related-list">
      {viewModel.relatedPairs.map((pair) => <li key={pair.pairSlug}><a href={`/compare/${encodeURIComponent(pair.pairSlug)}`}>{relatedComparisonLabel(pair, duplicateNames)}</a><span>{pair.sharedMetricCount} shared source metric{pair.sharedMetricCount === 1 ? '' : 's'}</span></li>)}
    </ul>}
  </section>;
}

export function ComparisonPage({ viewModel }: { readonly viewModel: ComparisonViewModel }) {
  const [profile, setProfile] = useState<WorkloadProfile>('balanced');
  const [clientHydrated, setClientHydrated] = useState(false);
  const models = viewModel.models;

  useEffect(() => setClientHydrated(true), []);

  return <div className="comparison-page comparison-detail-page" data-client-hydrated={clientHydrated ? 'true' : 'false'}>
    <section className="comparison-intro" aria-labelledby="comparison-detail-heading">
      <nav className="comparison-breadcrumb" aria-label="Breadcrumb"><a href="/compare/">Compare</a><span aria-hidden="true">/</span><span aria-current="page">{modelDisplayLabel(models, 0)} vs {modelDisplayLabel(models, 1)}</span></nav>
      <h1 id="comparison-detail-heading">{modelDisplayLabel(models, 0)} vs {modelDisplayLabel(models, 1)}</h1>
      <p>Read the named evidence fields, route context, and unavailable values before making a workload-specific judgment.</p>
    </section>

    <section className="comparison-panel comparison-section comparison-model-pair" aria-labelledby="comparison-model-pair-heading">
      <div className="comparison-section-heading"><h2 id="comparison-model-pair-heading">Model pair</h2><p>Identity panels have equal weight. The center marker only names the pairing; it does not declare a better model.</p></div>
      <div className="comparison-model-pair-grid"><ModelIdentity index={0} models={models} /><span className="comparison-versus-marker" aria-label="versus">VS</span><ModelIdentity index={1} models={models} /></div>
    </section>

    <SourceMetrics models={models} rows={viewModel.metricRows} />
    <WorkloadPicker onChange={setProfile} profile={profile} />
    <PricingContext groups={viewModel.priceChecks} models={models} profile={profile} />

    <div className="comparison-side-grid">
      <section className="comparison-panel comparison-section" aria-labelledby="comparison-subscription-heading">
        <div className="comparison-section-heading"><h2 id="comparison-subscription-heading">Subscription match</h2><p>A subscription comparison needs a reviewed mapping and workload-specific basis.</p></div>
        <div className="comparison-empty-state"><strong>No verified subscription match</strong><p>Use the calculator with your observed usage when evaluating subscription capacity beside API pricing.</p><a className="comparison-inline-action" href={ROUTE_PATHS.calculator}>Open subscription vs. API calculator</a></div>
      </section>
      <EvidenceProvenance viewModel={viewModel} />
    </div>

    <RelatedComparisons viewModel={viewModel} />
  </div>;
}
