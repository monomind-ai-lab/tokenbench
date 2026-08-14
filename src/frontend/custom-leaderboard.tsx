import { useMemo, useRef, useState } from 'react';
import {
  buildCustomLeaderboard,
  CUSTOM_DOMAINS,
  DEFAULT_CUSTOM_WEIGHTS,
  normalizeCustomWeights,
  type CustomDomain,
  type CustomLeaderboardInput,
  type CustomLeaderboardRow,
  type CustomWeights,
} from '../benchmarks/custom-leaderboard';
import { addCompareModel, useCompareState } from './compare-state';
import { InspectionCard, type InspectionRecord } from './inspection-card';

export type { CustomDomain, CustomWeights } from '../benchmarks/custom-leaderboard';

export interface CustomLeaderboardModel extends CustomLeaderboardInput {
  readonly slug: string;
  readonly name: string;
  readonly provider: string;
  readonly observedAt: string | null;
  readonly sourceLabel: string;
  readonly sourceUrl: string;
  readonly evidenceStatus: 'supported' | 'estimated' | 'source_only';
}

const DOMAIN_LABELS: Readonly<Record<CustomDomain, string>> = {
  agentic: 'Agentic', coding: 'Coding', reasoning: 'Reasoning', math: 'Math', multimodal: 'Multimodal', throughput: 'Throughput',
};

const EQUAL_CUSTOM_WEIGHTS: CustomWeights = {
  agentic: 17, coding: 17, reasoning: 17, math: 17, multimodal: 16, throughput: 16,
};

function initialWeights(value: CustomWeights | undefined): CustomWeights {
  const normalized = normalizeCustomWeights(value ?? DEFAULT_CUSTOM_WEIGHTS);
  return normalized.ok ? normalized.weights : DEFAULT_CUSTOM_WEIGHTS;
}

function shareUrl(canonicalUrl: string, weights: CustomWeights): string {
  const url = new URL(canonicalUrl);
  CUSTOM_DOMAINS.forEach((domain) => url.searchParams.set(domain, String(weights[domain])));
  return url.toString();
}

function formatValue(value: number | null, digits = 1): string {
  return value === null ? 'Not reported' : value.toFixed(digits);
}

function applyBrowserState(url: string, weights: CustomWeights): void {
  if (typeof window === 'undefined') return;
  const next = new URL(url);
  if (next.origin === window.location.origin) {
    window.history.replaceState(window.history.state, '', `${next.pathname}${next.search}${next.hash}`);
  }
  window.dispatchEvent(new CustomEvent('tokenbench:analytics', {
    detail: { name: 'custom_leaderboard_applied', route: next.pathname, weights },
  }));
}

function inspectionRecord(row: CustomLeaderboardRow<CustomLeaderboardModel>): InspectionRecord {
  return {
    modelId: row.model.id,
    modelSlug: row.model.slug,
    modelName: row.model.name,
    provider: row.model.provider,
    host: null,
    inputPrice: null,
    outputPrice: null,
    cachePrice: null,
    ttft: null,
    throughput: row.model.throughput,
    context: null,
    capability: { label: 'Custom composite', value: row.composite, methodology: 'Applied custom domain weights' },
    evidenceStatus: row.model.evidenceStatus,
    sourceLabel: row.model.sourceLabel,
    sourceUrl: row.model.sourceUrl,
    effectiveAt: row.model.observedAt,
  };
}

function ContributionTable({ row }: { readonly row: CustomLeaderboardRow<CustomLeaderboardModel> }) {
  return <table aria-label={`${row.model.name} contribution rows`}><thead><tr><th>Domain</th><th>Source value</th><th>Normalized</th><th>Weight</th><th>Points</th></tr></thead><tbody>{row.contributions.map((contribution) => <tr key={contribution.domain}><th scope="row">{DOMAIN_LABELS[contribution.domain]}</th><td>{formatValue(contribution.sourceValue)}</td><td>{formatValue(contribution.normalizedValue)}</td><td>{contribution.weight}</td><td>{contribution.points.toFixed(4)}</td></tr>)}</tbody></table>;
}

export interface CustomLeaderboardProps {
  readonly models: readonly CustomLeaderboardModel[];
  readonly canonicalUrl: string;
  readonly initialWeights?: CustomWeights;
  readonly onApplied?: (weights: CustomWeights) => void;
}

export function CustomLeaderboard({ models, canonicalUrl, initialWeights: providedWeights, onApplied }: CustomLeaderboardProps) {
  const initial = initialWeights(providedWeights);
  const [draft, setDraft] = useState<CustomWeights>(initial);
  const [applied, setApplied] = useState<CustomWeights>(initial);
  const [hasApplied, setHasApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [inspected, setInspected] = useState<CustomLeaderboardRow<CustomLeaderboardModel> | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { selection, setSelection } = useCompareState();
  const ranking = useMemo(() => buildCustomLeaderboard(models, applied), [applied, models]);
  const draftValidation = normalizeCustomWeights(draft);
  const excludedCount = models.length - ranking.length;
  const throughputRange = ranking[0]?.throughputRange;
  const appliedUrl = shareUrl(canonicalUrl, applied);
  const weightSum = CUSTOM_DOMAINS.reduce((sum, domain) => sum + draft[domain], 0);
  const eligibleLabel = throughputRange
    ? `${throughputRange.eligibleCount} eligible published model${throughputRange.eligibleCount === 1 ? '' : 's'}`
    : null;

  const commit = () => {
    const validation = normalizeCustomWeights(draft);
    if (validation.ok === false) {
      setError(validation.reason);
      setNotice('');
      return;
    }
    setApplied(validation.weights);
    setHasApplied(true);
    setError(null);
    setNotice(`Applied ${validation.total} points across six custom domains.`);
    applyBrowserState(shareUrl(canonicalUrl, validation.weights), validation.weights);
    onApplied?.(validation.weights);
  };

  const compare = (row: CustomLeaderboardRow<CustomLeaderboardModel>) => {
    const result = addCompareModel(selection, row.model.id);
    if (result.kind === 'added') {
      setSelection(result.state);
      setNotice(`Added ${row.model.name} to comparison.`);
    } else if (result.kind === 'duplicate') {
      setNotice(`${row.model.name} is already in comparison.`);
    } else {
      setNotice('Comparison holds three models. Remove one before adding another.');
    }
  };

  return <div className="content-stack custom-leaderboard">
    <section className="panel custom-controls" aria-labelledby="custom-controls-heading">
      <div className="panel-heading"><div><span className="eyebrow">Your explicit policy</span><h2 id="custom-controls-heading">Build a custom leaderboard</h2><p>Only integer weights that include at least one positive domain become shareable. A model missing a positively weighted published domain is excluded, never assigned a made-up zero.</p></div></div>
      <form method="get" action={new URL(canonicalUrl).pathname} onSubmit={(event) => { event.preventDefault(); commit(); }}>
        <div className="custom-weight-grid">{CUSTOM_DOMAINS.map((domain) => <label key={domain}><span>{DOMAIN_LABELS[domain]} weight</span><input aria-label={`${DOMAIN_LABELS[domain]} weight`} name={domain} type="number" min="0" max="100" step="1" inputMode="numeric" value={draft[domain]} onChange={(event) => setDraft((current) => ({ ...current, [domain]: Number(event.target.value) }))} /></label>)}</div>
        <p className="custom-weight-sum">Weight sum: {weightSum}{draftValidation.ok ? '' : ' · invalid'}</p>
        <div className="custom-control-actions"><button className="button" type="submit">Apply custom weights</button><button className="button button-secondary" type="button" onClick={() => setDraft(EQUAL_CUSTOM_WEIGHTS)}>Equalize weights</button><button className="button button-secondary" type="button" onClick={() => setDraft(DEFAULT_CUSTOM_WEIGHTS)}>Reset weights</button></div>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status" aria-live="polite">{notice}</p> : null}
      {hasApplied ? <label className="custom-share-url"><span>Share URL</span><input aria-label="Share URL" readOnly value={appliedUrl} /></label> : null}
    </section>

    <section className="panel custom-methodology" aria-label="Custom throughput normalization">
      {throughputRange ? <p>Throughput normalization: {eligibleLabel}, min {throughputRange.minimum} tok/s, max {throughputRange.maximum} tok/s.</p> : <p>Throughput normalization is unavailable until at least one model publishes every positively weighted domain.</p>}
      <p>{excludedCount > 0 ? `${excludedCount} model${excludedCount === 1 ? '' : 's'} excluded for missing positively weighted evidence.` : 'All supplied models publish every positively weighted domain.'}</p>
    </section>

    {ranking.length > 0 ? <><section className="custom-card-grid" aria-label="Custom leaderboard cards">{ranking.map((row, index) => <article className="panel custom-card" key={row.id}><div><span className="eyebrow">#{index + 1}</span><h3>{row.model.name}</h3><p>{row.model.provider}</p></div><strong>{row.composite.toFixed(2)}</strong><div className="custom-row-actions"><button ref={triggerRef} className="button button-secondary button-small" type="button" onClick={() => setInspected(row)}>Inspect {row.model.name}</button><button className="button button-small" type="button" onClick={() => compare(row)}>Compare {row.model.name}</button></div></article>)}</section>
      <section className="panel custom-results"><h2>Custom ranking</h2><div className="custom-table-wrap"><table aria-label="Custom leaderboard results"><thead><tr><th>Position</th><th>Model</th><th>Composite</th><th>Source timestamp</th><th>Actions</th></tr></thead><tbody>{ranking.map((row, index) => <tr key={row.id}><td>{index + 1}</td><th scope="row"><a href={`/models/${row.model.slug}/`}>{row.model.name}</a><small>{row.model.provider}</small></th><td>{row.composite.toFixed(4)}</td><td><time dateTime={row.model.observedAt ?? undefined}>{row.model.observedAt ?? 'Not reported'}</time></td><td><button className="button button-small" type="button" onClick={() => compare(row)}>Compare {row.model.name}</button></td></tr>)}</tbody></table></div></section>
      <section className="panel custom-contributions" aria-labelledby="custom-contributions-heading"><h2 id="custom-contributions-heading">Contribution rows</h2><p>Each composite is the exact sum of the displayed weighted points.</p>{ranking.map((row) => <div className="custom-table-wrap" key={row.id}><h3>{row.model.name}</h3><ContributionTable row={row} /></div>)}</section>
    </> : <section className="panel custom-empty" role="status"><h2>No custom ranking is available</h2><p>No model publishes every positively weighted domain in the current evidence set. Adjust the weights or wait for complete published evidence; TokenBench will not infer missing scores.</p></section>}
    {inspected ? <InspectionCard record={inspectionRecord(inspected)} onClose={() => setInspected(null)} returnFocusRef={triggerRef} /> : null}
  </div>;
}
