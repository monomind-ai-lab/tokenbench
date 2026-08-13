import type { ModelProfileCategory, ModelProfileLedgerRow, ModelProfilePriceRoute } from '../benchmarks/model-profile';
import type { ModelProfileViewModel } from '../frontend/model-profile-contracts';
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
  benchlm: 'BenchLM',
  lmarena: 'LMArena',
  litellm: 'LiteLLM',
  openrouter: 'OpenRouter',
};

function sourceName(sourceId: string): string {
  return SOURCE_DISPLAY_NAMES[sourceId] ?? sourceId;
}

/**
 * Maps a published profile category key to its leaderboard route.
 *
 * An explicit table is required: a `llm-${key}` template resolves for coding,
 * agentic, knowledge, reasoning, and overall, but `multimodalGrounded` would
 * yield the nonexistent `llm-multimodalGrounded` whose real route is
 * `multimodal-vision-documents`. A category with no published leaderboard
 * returns null and stays plain text rather than linking somewhere wrong.
 */
const CATEGORY_LEADERBOARD_KEYS: Record<string, LeaderboardKey> = {
  overall: 'llm-overall',
  coding: 'llm-coding',
  agentic: 'llm-agentic',
  reasoning: 'llm-reasoning',
  knowledge: 'llm-knowledge',
  multimodal: 'multimodal-vision-documents',
  multimodalGrounded: 'multimodal-vision-documents',
};

export function categoryLeaderboardPath(categoryKey: string): string | null {
  const routeKey = CATEGORY_LEADERBOARD_KEYS[categoryKey];
  return routeKey === undefined ? null : LEADERBOARD_ROUTES[routeKey].pathname;
}

function CategoryCard({ category }: { readonly category: ModelProfileCategory }) {
  const leaderboardHref = categoryLeaderboardPath(category.key);
  return <article className="model-category-card" aria-label={category.label}>
    <header>
      {leaderboardHref === null
        ? <span>{category.label}</span>
        : <a href={leaderboardHref} aria-label={`${category.label} leaderboard`}>{category.label}</a>}
      <small>{category.evidenceStatus.replace('_', ' ')}</small>
    </header>
    <strong className="model-category-score">{score(category.score, 1)}</strong>
    <dl>
      <div><dt>Rank</dt><dd>{category.rank === null ? 'Not ranked' : `#${category.rank}${category.fieldSize ? ` of ${category.fieldSize}` : ''}`}</dd></div>
      <div><dt>Percentile</dt><dd><PercentileBar percentile={category.percentile} label={`${category.label} percentile`} /></dd></div>
      <div><dt>Benchmarks</dt><dd>{category.benchmarkCount}</dd></div>
    </dl>
  </article>;
}

function PriceRoute({ route }: { readonly route: ModelProfilePriceRoute }) {
  return <article className="model-price-route">
    <header><div><strong>{route.providerId}</strong><span>{route.routeId}</span></div><span className={`evidence-badge evidence-${route.verificationStatus}`}>{route.verificationStatus}</span></header>
    <dl>
      <div><dt>Input / 1M</dt><dd>{money(route.inputUsdPerMillion)}</dd></div>
      <div><dt>Cached input / 1M</dt><dd>{money(route.cachedInputUsdPerMillion)}</dd></div>
      <div><dt>Output / 1M</dt><dd>{money(route.outputUsdPerMillion)}</dd></div>
      <div><dt>Context</dt><dd>{number(route.contextWindowTokens)}</dd></div>
    </dl>
    <a href={route.sourceUrl} rel="noreferrer" target="_blank" aria-label={`${route.providerId} price source`}>View price source</a>
  </article>;
}

function ledgerGroups(rows: readonly ModelProfileLedgerRow[]) {
  const groups = new Map<string, ModelProfileLedgerRow[]>();
  rows.forEach((row) => groups.set(row.category, [...(groups.get(row.category) ?? []), row]));
  return [...groups.entries()];
}

export function ModelProfilePage({ viewModel }: ModelProfilePageProps) {
  const { directory, profile } = viewModel;
  return <div className="model-profile-page">
    {directory.status === 'archived' || viewModel.fallback === 'prior-profile'
      ? <aside className="model-history-banner" role="status"><strong>Historical profile</strong><span>{viewModel.fallback === 'prior-profile' ? 'The latest snapshot did not validate, so this page shows the prior valid revision.' : 'This model is no longer present in the current complete ingestion. Its latest valid evidence is retained.'}</span></aside>
      : null}
    <header className="model-profile-hero">
      <div className="model-profile-identity">
        <p className="eyebrow">Model evidence profile</p>
        <h1>{profile.identity.displayName}</h1>
        <p>{profile.identity.creator} · {profile.identity.sourceType}{profile.identity.reasoningType ? ` · ${profile.identity.reasoningType}` : ''}</p>
        <div className="model-profile-badges"><span>{directory.status}</span><span>{profile.summary.evidenceStatus.replace('_', ' ')}</span>{profile.identity.variantId ? <span>{profile.identity.variantId}</span> : null}</div>
      </div>
      <dl className="model-decision-score">
        <div><dt>Overall public score</dt><dd>{score(profile.summary.overallScore)}</dd></div>
        <div><dt>Source rank</dt><dd>{profile.summary.overallRank === null ? 'Not ranked' : `#${profile.summary.overallRank}`}</dd></div>
        <div><dt>Evidence coverage</dt><dd>{profile.summary.coverage.benchmarkCount} benchmarks · {profile.summary.coverage.sourceCount} sources</dd></div>
      </dl>
      <div className="model-decision-copy"><p><strong>Strongest published evidence</strong>{profile.summary.strongestEvidence}</p><p><strong>Validate before choosing</strong>{profile.summary.validateBeforeChoosing}</p></div>
      <p className="model-profile-freshness">Revision {viewModel.selectedRevision} · Published {date(profile.revision.publishedAt)} · Checked {date(profile.revision.checkedAt)} · {viewModel.freshness.status}</p>
    </header>

    <ModelRadar axes={profile.radar} />

    <section className="model-profile-section" aria-labelledby="category-scores-title">
      <div className="model-section-heading"><div><p className="eyebrow">Published measurements</p><h2 id="category-scores-title">Category scores</h2></div><p>Scores retain their source units; percentile and rank appear only for eligible fields.</p></div>
      <div className="model-category-grid">{profile.categories.map((category) => <div key={category.key}><CategoryCard category={category} /></div>)}</div>
    </section>

    <section className="model-profile-section model-price-specs" aria-labelledby="price-specs-title">
      <div className="model-section-heading"><div><p className="eyebrow">Route-specific facts</p><h2 id="price-specs-title">Pricing and specifications</h2></div><p>Conflicting routes remain separate and attributable.</p></div>
      <div className="model-price-grid">{profile.priceRoutes.length ? profile.priceRoutes.map((route) => <div key={route.routeId}><PriceRoute route={route} /></div>) : <p>Direct API pricing is unavailable.</p>}</div>
      <dl className="model-spec-grid">
        <div><dt>Context window</dt><dd>{number(profile.specifications.contextWindowTokens)}</dd></div>
        <div><dt>Maximum output</dt><dd>{number(profile.specifications.maxOutputTokens)}</dd></div>
        <div><dt>Input modalities</dt><dd>{profile.specifications.inputModalities.join(', ') || 'Unavailable'}</dd></div>
        <div><dt>Output modalities</dt><dd>{profile.specifications.outputModalities.join(', ') || 'Unavailable'}</dd></div>
        <div><dt>Release date</dt><dd>{profile.specifications.releaseDate ?? 'Unavailable'}</dd></div>
        <div><dt>Self hosting</dt><dd>{profile.specifications.selfHostingAvailable === null ? 'Not verified' : profile.specifications.selfHostingAvailable ? 'Available' : 'Not available'}</dd></div>
      </dl>
    </section>

    <section className="model-profile-section" aria-labelledby="benchmark-ledger-title">
      <div className="model-section-heading"><div><p className="eyebrow">Auditable evidence</p><h2 id="benchmark-ledger-title">Benchmark ledger</h2></div><p>Display values, source ranks, and provenance remain visible without implying unsupported aggregate weight.</p></div>
      {ledgerGroups(profile.ledger).map(([category, rows]) => <div className="model-ledger-group" key={category}>
        <h3>{category}</h3>
        <div className="model-ledger-scroll"><table><thead><tr><th>Score</th><th>Rank</th><th>Weight</th><th>Last Updated</th><th>Source</th></tr></thead><tbody>
          {rows.map((row) => <tr key={`${row.metricKey}:${row.sourceArtifactId}`}><td>{score(row.displayValue)}</td><td>{row.rank === null ? 'Not ranked' : `#${row.rank}`}</td><td>{row.weight === null ? 'Not published' : row.weight}</td><td>{date(row.observedAt)}</td><td><a href={row.sourceUrl} rel="noreferrer" target="_blank" aria-label={`${row.benchmarkName} source`}>{sourceName(row.sourceId)}</a></td></tr>)}
        </tbody></table></div>
      </div>)}
    </section>

    {profile.comparisons.length ? <section className="model-profile-section" aria-labelledby="profile-comparisons-title"><div className="model-section-heading"><div><p className="eyebrow">Related evidence</p><h2 id="profile-comparisons-title">Compare this model</h2></div></div><div className="model-comparison-links">{profile.comparisons.map((comparison) => <a href={comparison.path} key={comparison.pairSlug}>{comparison.pairSlug.replaceAll('-', ' ')}</a>)}</div></section> : null}
  </div>;
}
