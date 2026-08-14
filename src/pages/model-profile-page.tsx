import { useState } from 'react';
import type { ModelProfileCategory, ModelProfileLedgerRow, ModelProfilePriceRoute } from '../benchmarks/model-profile';
import { addCompareModel, useCompareState } from '../frontend/compare-state';
import { EditorialCta } from '../frontend/editorial-cta';
import type { EndpointEvidenceRow, ModelProfileViewModel } from '../frontend/model-profile-contracts';
import { ModelRadar } from '../frontend/model-radar';
import { LEADERBOARD_ROUTES, type LeaderboardKey } from '../routing/routes';
import { PercentileBar } from '../frontend/charts/percentile-bar';

export interface ModelProfilePageProps {
  readonly viewModel: ModelProfileViewModel;
}

function score(value: number | null, digits = 2): string {
  return value === null ? 'Unavailable' : value.toFixed(digits);
}

function money(value: number | null): string {
  return value === null ? 'Unavailable' : `$${value.toFixed(2)}`;
}

function number(value: number | null): string {
  return value === null ? 'Unavailable' : value.toLocaleString('en-US');
}

function date(value: string | null): string {
  return value ? new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : 'Unavailable';
}

const SOURCE_DISPLAY_NAMES: Record<string, string> = {
  benchlm: 'BenchLM', lmarena: 'LMArena', litellm: 'LiteLLM', openrouter: 'OpenRouter',
};

function sourceName(sourceId: string): string {
  return SOURCE_DISPLAY_NAMES[sourceId] ?? sourceId;
}

const CATEGORY_LEADERBOARD_KEYS: Record<string, LeaderboardKey> = {
  overall: 'llm-overall', coding: 'llm-coding', agentic: 'llm-agentic', reasoning: 'llm-reasoning',
  knowledge: 'llm-knowledge', multimodal: 'multimodal-vision-documents', multimodalGrounded: 'multimodal-vision-documents',
};

/** Maps a published category key only to an actually published leaderboard. */
export function categoryLeaderboardPath(categoryKey: string): string | null {
  const routeKey = CATEGORY_LEADERBOARD_KEYS[categoryKey];
  return routeKey === undefined ? null : LEADERBOARD_ROUTES[routeKey].pathname;
}

function CategoryCard({ category }: { readonly category: ModelProfileCategory }) {
  const leaderboardHref = categoryLeaderboardPath(category.key);
  return <article className="model-category-card" aria-label={category.label}>
    <header>{leaderboardHref === null ? <span>{category.label}</span> : <a href={leaderboardHref} aria-label={`${category.label} leaderboard`}>{category.label}</a>}<small>{category.evidenceStatus.replace('_', ' ')}</small></header>
    <strong className="model-category-score">{score(category.score, 1)}</strong>
    <dl><div><dt>Rank</dt><dd>{category.rank === null ? 'Not ranked' : `#${category.rank}${category.fieldSize ? ` of ${category.fieldSize}` : ''}`}</dd></div><div><dt>Percentile</dt><dd><PercentileBar percentile={category.percentile} label={`${category.label} percentile`} /></dd></div><div><dt>Benchmarks</dt><dd>{category.benchmarkCount}</dd></div></dl>
  </article>;
}

function PriceRoute({ route }: { readonly route: ModelProfilePriceRoute }) {
  return <article className="model-price-route">
    <header><div><strong>{route.providerId}</strong><span>{route.routeId}</span></div><span className={`evidence-badge evidence-${route.verificationStatus}`}>{route.verificationStatus}</span></header>
    <dl><div><dt>Input / 1M</dt><dd>{money(route.inputUsdPerMillion)}</dd></div><div><dt>Cached input / 1M</dt><dd>{money(route.cachedInputUsdPerMillion)}</dd></div><div><dt>Output / 1M</dt><dd>{money(route.outputUsdPerMillion)}</dd></div><div><dt>Context</dt><dd>{number(route.contextWindowTokens)}</dd></div></dl>
    <a href={route.sourceUrl} rel="noreferrer" target="_blank" aria-label={`${route.providerId} price source`}>View price source</a>
  </article>;
}

function ledgerGroups(rows: readonly ModelProfileLedgerRow[]) {
  const groups = new Map<string, ModelProfileLedgerRow[]>();
  rows.forEach((row) => groups.set(row.category, [...(groups.get(row.category) ?? []), row]));
  return [...groups.entries()];
}

function endpointRows(viewModel: ModelProfileViewModel): readonly EndpointEvidenceRow[] {
  if (viewModel.endpointEvidence !== undefined) return viewModel.endpointEvidence;
  return viewModel.profile.priceRoutes.map((route) => ({
    endpointId: route.routeId,
    hostId: route.providerId,
    // A route listing never proves native availability, so it stays hosted
    // until a source emits an explicit native endpoint evidence row.
    native: false,
    availability: null,
    inputPrice: route.inputUsdPerMillion,
    outputPrice: route.outputUsdPerMillion,
    cacheReadPrice: route.cachedInputUsdPerMillion,
    cacheWritePrice: null,
    longContextRule: route.contextWindowTokens === null ? null : `Published route context: ${route.contextWindowTokens.toLocaleString('en-US')} tokens.`,
    ttft: null,
    throughput: null,
    conditions: null,
    effectiveAt: route.observedAt,
  }));
}

function EndpointTable({ label, rows }: { readonly label: string; readonly rows: readonly EndpointEvidenceRow[] }) {
  if (rows.length === 0) return <p className="model-evidence-empty">No {label.toLocaleLowerCase()} has been supplied.</p>;
  return <div className="model-endpoint-scroll"><table aria-label={label}><thead><tr><th>Endpoint</th><th>Host</th><th>Availability</th><th>Input / 1M</th><th>Output / 1M</th><th>Cache read / 1M</th><th>Cache write / 1M</th><th>Long-context rule</th><th>TTFT</th><th>Throughput</th><th>Conditions</th><th>Effective at</th></tr></thead><tbody>
    {rows.map((row) => <tr key={row.endpointId}><td>{row.endpointId}</td><td>{row.hostId}</td><td>{row.availability ?? 'Unavailable'}</td><td>{money(row.inputPrice)}</td><td>{money(row.outputPrice)}</td><td>{money(row.cacheReadPrice)}</td><td>{money(row.cacheWritePrice)}</td><td>{row.longContextRule ?? 'Unavailable'}</td><td>{row.ttft === null ? 'Unavailable' : `${row.ttft}s`}</td><td>{row.throughput === null ? 'Unavailable' : `${row.throughput} tok/s`}</td><td>{row.conditions ?? 'Unavailable'}</td><td>{date(row.effectiveAt)}</td></tr>)}
  </tbody></table></div>;
}

function CompareAction({ viewModel }: { readonly viewModel: ModelProfileViewModel }) {
  const { selection, setSelection } = useCompareState();
  const [notice, setNotice] = useState('');
  const add = () => {
    const result = addCompareModel(selection, viewModel.directory.modelKey);
    if (result.kind === 'added') {
      setSelection(result.state);
      setNotice(`${viewModel.profile.identity.displayName} added to comparison.`);
      return;
    }
    if (result.kind === 'duplicate') {
      setNotice(`${viewModel.profile.identity.displayName} is already in comparison.`);
      return;
    }
    setNotice('Comparison holds three models. Remove one from the comparison tray before adding another.');
  };
  return <div className="model-profile-compare-action"><button className="button" type="button" onClick={add}>Add {viewModel.profile.identity.displayName} to comparison</button><p role="status" aria-live="polite">{notice}</p></div>;
}

export function ModelProfilePage({ viewModel }: ModelProfilePageProps) {
  const { directory, profile } = viewModel;
  const endpoints = endpointRows(viewModel);
  const nativeEndpoints = endpoints.filter((row) => row.native);
  const hostedEndpoints = endpoints.filter((row) => !row.native);
  const conflicts = profile.priceRoutes.filter((route) => route.verificationStatus === 'conflict');
  const historical = directory.status === 'archived' || viewModel.fallback === 'prior-profile';
  return <div className="model-profile-page">
    {historical ? <aside className="model-history-banner" role="status"><strong>Historical profile</strong><span>{viewModel.fallback === 'prior-profile' ? 'The latest snapshot did not validate, so this page shows the prior valid revision.' : 'This model is no longer present in the current complete ingestion. Its latest valid evidence is retained.'}</span></aside> : null}
    <header className="model-profile-hero">
      <div className="model-profile-identity"><p className="eyebrow">Model evidence profile</p><h1>{profile.identity.displayName}</h1><p>{profile.identity.creator} · {profile.identity.sourceType}{profile.identity.reasoningType ? ` · ${profile.identity.reasoningType}` : ''}</p><div className="model-profile-badges"><span>{directory.status}</span><span>{profile.summary.evidenceStatus.replace('_', ' ')}</span>{profile.identity.variantId ? <span>{profile.identity.variantId}</span> : null}</div></div>
      <dl className="model-decision-score"><div><dt>Overall public score</dt><dd>{score(profile.summary.overallScore)}</dd></div><div><dt>Source rank</dt><dd>{profile.summary.overallRank === null ? 'Not ranked' : `#${profile.summary.overallRank}`}</dd></div><div><dt>Evidence coverage</dt><dd>{profile.summary.coverage.benchmarkCount} benchmarks · {profile.summary.coverage.sourceCount} sources</dd></div></dl>
      <div className="model-decision-copy"><p><strong>Strongest published evidence</strong>{profile.summary.strongestEvidence}</p><p><strong>Validate before choosing</strong>{profile.summary.validateBeforeChoosing}</p></div><p className="model-profile-freshness">Revision {viewModel.selectedRevision} · Published {date(profile.revision.publishedAt)} · Checked {date(profile.revision.checkedAt)} · {viewModel.freshness.status}</p>
    </header>

    <section className="model-profile-section" aria-labelledby="identity-lifecycle-title"><div className="model-section-heading"><div><p className="eyebrow">Identity and source boundaries</p><h2 id="identity-lifecycle-title">Identity, lifecycle, modalities, and limits</h2></div><p>Release, announcement, deprecation, and retirement remain distinct facts.</p></div><dl className="model-spec-grid"><div><dt>Model key</dt><dd>{directory.modelKey}</dd></div><div><dt>Release date</dt><dd>{profile.specifications.releaseDate ?? 'Unavailable'}</dd></div><div><dt>Announcement date</dt><dd>Unavailable</dd></div><div><dt>Deprecation date</dt><dd>Unavailable</dd></div><div><dt>Retirement date</dt><dd>Unavailable</dd></div><div><dt>Context window</dt><dd>{number(profile.specifications.contextWindowTokens)}</dd></div><div><dt>Maximum input</dt><dd>{number(profile.specifications.maxInputTokens)}</dd></div><div><dt>Maximum output</dt><dd>{number(profile.specifications.maxOutputTokens)}</dd></div><div><dt>Input modalities</dt><dd>{profile.specifications.inputModalities.join(', ') || 'Unavailable'}</dd></div><div><dt>Output modalities</dt><dd>{profile.specifications.outputModalities.join(', ') || 'Unavailable'}</dd></div><div><dt>Supported parameters</dt><dd>{profile.specifications.supportedParameters.join(', ') || 'Unavailable'}</dd></div><div><dt>Self hosting</dt><dd>{profile.specifications.selfHostingAvailable === null ? 'Not verified' : profile.specifications.selfHostingAvailable ? 'Available' : 'Not available'}</dd></div></dl></section>

    <ModelRadar axes={profile.radar} />

    <section className="model-profile-section" aria-labelledby="category-scores-title"><div className="model-section-heading"><div><p className="eyebrow">Published measurements</p><h2 id="category-scores-title">Category scores</h2></div><p>Scores retain their source units; percentile and rank appear only for eligible fields.</p></div><div className="model-category-grid">{profile.categories.map((category) => <div key={category.key}><CategoryCard category={category} /></div>)}</div></section>

    <section className="model-profile-section" aria-labelledby="methodology-provenance-title"><div className="model-section-heading"><div><p className="eyebrow">Auditable measurement context</p><h2 id="methodology-provenance-title">Benchmark methodology and provenance</h2></div><p>Only source-published scores, ranks, and observation times appear in this dossier.</p></div><dl className="model-spec-grid"><div><dt>Profile revision</dt><dd>{profile.revision.revision}</dd></div><div><dt>Generated at</dt><dd>{date(profile.revision.generatedAt)}</dd></div><div><dt>Published at</dt><dd>{date(profile.revision.publishedAt)}</dd></div><div><dt>Checked at</dt><dd>{date(profile.revision.checkedAt)}</dd></div></dl><ul className="model-related-links">{profile.sources.map((source) => <li key={`${source.sourceId}:${source.artifactId}`}><a href={source.sourceUrl} target="_blank" rel="noreferrer">{source.attributionText}</a> · {date(source.observedAt)}</li>)}</ul></section>

    <section className="model-profile-section model-price-specs" aria-labelledby="price-specs-title"><div className="model-section-heading"><div><p className="eyebrow">Route-specific facts</p><h2 id="price-specs-title">Pricing and specifications</h2></div><p>Conflicting routes remain separate and attributable.</p></div><div className="model-price-grid">{profile.priceRoutes.length ? profile.priceRoutes.map((route) => <div key={route.routeId}><PriceRoute route={route} /></div>) : <p>Direct API pricing is unavailable.</p>}</div></section>

    <section className="model-profile-section" aria-labelledby="endpoint-evidence-title"><div className="model-section-heading"><div><p className="eyebrow">Endpoint-scoped measurements</p><h2 id="endpoint-evidence-title">Endpoint evidence</h2></div><p>Native and hosted measurements are not combined or treated as interchangeable.</p></div><h3>Native endpoint facts</h3><EndpointTable label="Native endpoint facts" rows={nativeEndpoints} /><h3>Hosted endpoint facts</h3><EndpointTable label="Hosted endpoint facts" rows={hostedEndpoints} /></section>

    <section className="model-profile-section" aria-labelledby="benchmark-ledger-title"><div className="model-section-heading"><div><p className="eyebrow">Auditable evidence</p><h2 id="benchmark-ledger-title">Benchmark ledger</h2></div><p>Display values, source ranks, and provenance remain visible without implying unsupported aggregate weight.</p></div>{ledgerGroups(profile.ledger).map(([category, rows]) => <div className="model-ledger-group" key={category}><h3>{category}</h3><div className="model-ledger-scroll"><table aria-label={`${category[0]!.toUpperCase()}${category.slice(1)} benchmark ledger`}><thead><tr><th>Score</th><th>Rank</th><th>Weight</th><th>Last Updated</th><th>Source</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.metricKey}:${row.sourceArtifactId}`}><td>{score(row.displayValue)}</td><td>{row.rank === null ? 'Not ranked' : `#${row.rank}`}</td><td>{row.weight === null ? 'Not published' : row.weight}</td><td>{date(row.observedAt)}</td><td><a href={row.sourceUrl} rel="noreferrer" target="_blank" aria-label={`${row.benchmarkName} source`}>{sourceName(row.sourceId)}</a></td></tr>)}</tbody></table></div></div>)}</section>

    <section className="model-profile-section" aria-labelledby="history-title"><div className="model-section-heading"><div><p className="eyebrow">Durable revisions</p><h2 id="history-title">History and change log</h2></div><p>Only validated profile revisions are retained.</p></div><ol className="model-history-list"><li><strong>{viewModel.selectedRevision}</strong> · checked {date(profile.revision.checkedAt)} · {viewModel.fallback === 'prior-profile' ? 'Prior valid profile retained after validation failure.' : 'Current validated profile.'}</li></ol></section>

    <section className="model-profile-section" aria-labelledby="workload-examples-title"><div className="model-section-heading"><div><p className="eyebrow">Decision prompts</p><h2 id="workload-examples-title">Workload examples</h2></div><p>These are evaluation prompts, not unsupported performance claims.</p></div><ul><li>Long-context retrieval: validate the exact endpoint’s published context rule against your documents.</li><li>Tool-using agent: compare the supported parameters and measure the same tool workload.</li><li>Latency-sensitive chat: collect TTFT and throughput under matching conditions before choosing a host.</li></ul></section>

    <section className="model-profile-section" aria-labelledby="limitations-title"><div className="model-section-heading"><div><p className="eyebrow">Decision boundary</p><h2 id="limitations-title">Limitations</h2></div></div><p>{profile.summary.validateBeforeChoosing}</p><p>Missing lifecycle dates, endpoint conditions, and pricing dimensions remain explicitly unavailable.</p></section>

    <section className="model-profile-section" aria-labelledby="conflicts-title"><div className="model-section-heading"><div><p className="eyebrow">Evidence disagreements</p><h2 id="conflicts-title">Conflicts</h2></div></div>{conflicts.length ? <ul>{conflicts.map((route) => <li key={route.routeId}><a href={route.sourceUrl} target="_blank" rel="noreferrer">{route.routeId}</a> is marked as conflicting source evidence.</li>)}</ul> : <p>No conflicting route evidence is present in this validated profile.</p>}</section>

    <section className="model-profile-section" aria-labelledby="related-links-title"><div className="model-section-heading"><div><p className="eyebrow">Continue inspection</p><h2 id="related-links-title">Related links</h2></div></div><ul className="model-related-links">{profile.sources.map((source) => <li key={source.sourceUrl}><a href={source.sourceUrl} target="_blank" rel="noreferrer">{sourceName(source.sourceId)}: {source.attributionText}</a></li>)}</ul></section>

    <section className="model-profile-section" aria-labelledby="profile-comparisons-title"><div className="model-section-heading"><div><p className="eyebrow">Related evidence</p><h2 id="profile-comparisons-title">Compare this model</h2></div></div><CompareAction viewModel={viewModel} />{profile.comparisons.length ? <div className="model-comparison-links">{profile.comparisons.map((comparison) => <a href={comparison.path} key={comparison.pairSlug}>{comparison.pairSlug.replaceAll('-', ' ')}</a>)}</div> : <p>No reviewed pair page is currently published.</p>}</section>
    <EditorialCta eligible={!historical && profile.ledger.length > 0 && endpoints.length > 0} route={`/models/${directory.canonicalSlug}/`} precedingAction="evidence" subjectId={directory.modelKey} />
  </div>;
}
