import { useMemo, useRef, useState } from 'react';
import { ScoreBarChart } from './charts/score-bar-chart';
import { addCompareModel, useCompareState } from './compare-state';
import { InspectionCard, type InspectionRecord } from './inspection-card';

export interface SlaThresholds {
  readonly maxTtft: number;
  readonly minThroughput: number;
}

export interface SlaEvidenceRow {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly provider: string;
  readonly ttft: number | null;
  readonly throughput: number | null;
  readonly conditions: string | null;
  readonly observedAt: string | null;
  readonly sourceLabel: string;
  readonly sourceUrl: string;
  readonly evidenceStatus: 'supported' | 'estimated' | 'source_only';
}

export type SlaEvidenceClassification = 'pass' | 'fail' | 'incomplete';

export const DEFAULT_SLA_THRESHOLDS: SlaThresholds = { maxTtft: 0.8, minThroughput: 60 };

function finite(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

/** Missing source evidence remains incomplete; it is never recast as a failure or a zero. */
export function classifySlaEvidence(
  evidence: Pick<SlaEvidenceRow, 'ttft' | 'throughput'>,
  thresholds: SlaThresholds,
): SlaEvidenceClassification {
  if (!finite(evidence.ttft) || !finite(evidence.throughput)) return 'incomplete';
  return evidence.ttft <= thresholds.maxTtft && evidence.throughput >= thresholds.minThroughput ? 'pass' : 'fail';
}

function sameThresholds(left: SlaThresholds, right: SlaThresholds): boolean {
  return left.maxTtft === right.maxTtft && left.minThroughput === right.minThroughput;
}

function validThresholds(value: SlaThresholds): boolean {
  return Number.isFinite(value.maxTtft) && value.maxTtft > 0 && value.maxTtft <= 60
    && Number.isFinite(value.minThroughput) && value.minThroughput >= 0 && value.minThroughput <= 100_000;
}

function metric(value: number | null, suffix: string): string {
  return finite(value) ? `${value}${suffix}` : 'Not reported';
}

function formatTimestamp(value: string | null): string {
  return value ? new Date(value).toLocaleString('en-US', { timeZone: 'UTC' }) : 'Not reported';
}

function shareUrl(canonicalUrl: string, thresholds: SlaThresholds): string {
  const url = new URL(canonicalUrl);
  url.searchParams.set('maxTtft', String(thresholds.maxTtft));
  url.searchParams.set('minThroughput', String(thresholds.minThroughput));
  return url.toString();
}

function inspectionRecord(row: SlaEvidenceRow): InspectionRecord {
  return {
    modelId: row.id,
    modelSlug: row.slug,
    modelName: row.name,
    provider: row.provider,
    host: null,
    inputPrice: null,
    outputPrice: null,
    cachePrice: null,
    ttft: row.ttft,
    throughput: row.throughput,
    context: null,
    capability: null,
    evidenceStatus: row.evidenceStatus,
    sourceLabel: row.sourceLabel,
    sourceUrl: row.sourceUrl,
    effectiveAt: row.observedAt,
  };
}

function applyBrowserState(url: string, thresholds: SlaThresholds): void {
  if (typeof window === 'undefined') return;
  const next = new URL(url);
  if (next.origin === window.location.origin) {
    window.history.replaceState(window.history.state, '', `${next.pathname}${next.search}${next.hash}`);
  }
  window.dispatchEvent(new CustomEvent('tokenbench:analytics', {
    detail: { name: 'sla_thresholds_applied', route: next.pathname, maxTtft: thresholds.maxTtft, minThroughput: thresholds.minThroughput },
  }));
}

export interface SlaLeaderboardProps {
  readonly evidence: readonly SlaEvidenceRow[];
  readonly canonicalUrl: string;
  readonly initialThresholds?: SlaThresholds;
  readonly onApplied?: (thresholds: SlaThresholds) => void;
}

export function SlaLeaderboard({
  evidence,
  canonicalUrl,
  initialThresholds = DEFAULT_SLA_THRESHOLDS,
  onApplied,
}: SlaLeaderboardProps) {
  const initial = validThresholds(initialThresholds) ? initialThresholds : DEFAULT_SLA_THRESHOLDS;
  const [draft, setDraft] = useState<SlaThresholds>(initial);
  const [applied, setApplied] = useState<SlaThresholds>(initial);
  const [hasApplied, setHasApplied] = useState(false);
  const [notice, setNotice] = useState('');
  const [inspected, setInspected] = useState<SlaEvidenceRow | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { selection, setSelection } = useCompareState();
  const classifications = useMemo(() => evidence.map((row) => ({ row, status: classifySlaEvidence(row, applied) })), [applied, evidence]);
  const preview = useMemo(() => evidence.map((row) => classifySlaEvidence(row, draft)), [draft, evidence]);
  const passCount = classifications.filter(({ status }) => status === 'pass').length;
  const incompleteCount = classifications.filter(({ status }) => status === 'incomplete').length;
  const previewPassCount = preview.filter((status) => status === 'pass').length;
  const previewIncompleteCount = preview.filter((status) => status === 'incomplete').length;
  const ttftData = evidence.filter((row) => finite(row.ttft)).map((row) => ({ label: row.name, value: row.ttft! }));
  const throughputData = evidence.filter((row) => finite(row.throughput)).map((row) => ({ label: row.name, value: row.throughput! }));
  const appliedUrl = shareUrl(canonicalUrl, applied);

  const commit = () => {
    if (!validThresholds(draft)) {
      setNotice('Enter a TTFT above 0 seconds and a throughput from 0 to 100000 tok/s.');
      return;
    }
    setApplied(draft);
    setHasApplied(true);
    setNotice(`Applied TTFT ≤ ${draft.maxTtft}s and throughput ≥ ${draft.minThroughput} tok/s.`);
    onApplied?.(draft);
    applyBrowserState(shareUrl(canonicalUrl, draft), draft);
  };

  const compare = (row: SlaEvidenceRow) => {
    const result = addCompareModel(selection, row.id);
    if (result.kind === 'added') {
      setSelection(result.state);
      setNotice(`Added ${row.name} to comparison.`);
    } else if (result.kind === 'duplicate') {
      setNotice(`${row.name} is already in comparison.`);
    } else {
      setNotice('Comparison holds three models. Remove one before adding another.');
    }
  };

  return <div className="content-stack sla-leaderboard">
    <section className="panel sla-controls" aria-labelledby="sla-controls-heading">
      <div className="panel-heading"><div><span className="eyebrow">Published endpoint evidence</span><h2 id="sla-controls-heading">Set service-level thresholds</h2><p>Draft values preview locally. Apply commits a shareable URL; neither source measurements nor incomplete rows are changed.</p></div></div>
      <form method="get" action={new URL(canonicalUrl).pathname} onSubmit={(event) => { event.preventDefault(); commit(); }}>
        <div className="sla-control-grid">
          <label><span>Maximum TTFT in seconds</span><input aria-label="Maximum TTFT in seconds" name="maxTtft" type="number" min="0.01" max="60" step="0.01" value={draft.maxTtft} onChange={(event) => setDraft((current) => ({ ...current, maxTtft: Number(event.target.value) }))} /></label>
          <label><span>Maximum TTFT slider</span><input aria-label="Maximum TTFT slider" type="range" min="0.01" max="5" step="0.01" value={Math.min(5, Math.max(0.01, draft.maxTtft))} onChange={(event) => setDraft((current) => ({ ...current, maxTtft: Number(event.target.value) }))} /></label>
          <label><span>Minimum throughput in tok/s</span><input aria-label="Minimum throughput in tok/s" name="minThroughput" type="number" min="0" max="100000" step="1" value={draft.minThroughput} onChange={(event) => setDraft((current) => ({ ...current, minThroughput: Number(event.target.value) }))} /></label>
          <label><span>Minimum throughput slider</span><input aria-label="Minimum throughput slider" type="range" min="0" max="500" step="1" value={Math.min(500, Math.max(0, draft.minThroughput))} onChange={(event) => setDraft((current) => ({ ...current, minThroughput: Number(event.target.value) }))} /></label>
        </div>
        <div className="sla-control-actions"><button className="button" type="submit" onClick={(event) => { event.preventDefault(); commit(); }}>Apply SLA thresholds</button><button className="button button-secondary" type="button" onClick={() => { setDraft(DEFAULT_SLA_THRESHOLDS); setNotice('Reset the local threshold preview. Apply to update the shared result.'); }}>Reset</button></div>
      </form>
      {!sameThresholds(draft, applied) ? <p className="sla-preview" role="status">Preview: {previewPassCount} pass · {previewIncompleteCount} incomplete</p> : null}
      {notice ? <p role="status" aria-live="polite">{notice}</p> : null}
      {hasApplied ? <label className="sla-share-url"><span>Share URL</span><input aria-label="Share URL" readOnly value={appliedUrl} /></label> : null}
    </section>

    <section className="panel sla-summary" aria-label="SLA eligibility summary"><strong>{passCount} pass · {incompleteCount} incomplete</strong><p>Pass requires TTFT ≤ {applied.maxTtft}s and throughput ≥ {applied.minThroughput} tok/s. Missing measurement remains incomplete.</p></section>

    <section className="sla-card-grid" aria-label="SLA model cards">
      {classifications.map(({ row, status }) => <article className={`panel sla-card sla-${status}`} key={row.id}>
        <div><span className="eyebrow">{status}</span><h3>{row.name}</h3><p>{row.provider}</p></div>
        <dl><div><dt>TTFT</dt><dd>{metric(row.ttft, 's')}</dd></div><div><dt>Throughput</dt><dd>{metric(row.throughput, ' tok/s')}</dd></div><div><dt>Observed</dt><dd>{formatTimestamp(row.observedAt)}</dd></div></dl>
        <div className="sla-row-actions"><button ref={triggerRef} className="button button-secondary button-small" type="button" onClick={() => setInspected(row)}>Inspect {row.name}</button><button className="button button-small" type="button" onClick={() => compare(row)}>Compare {row.name}</button></div>
      </article>)}
    </section>

    <section className="panel sla-results"><h2>SLA eligibility</h2><div className="sla-table-wrap"><table aria-label="SLA eligibility"><thead><tr><th>Model</th><th>Status</th><th>TTFT</th><th>Throughput</th><th>Conditions</th><th>Timestamp</th><th>Actions</th></tr></thead><tbody>{classifications.map(({ row, status }) => <tr key={row.id}><th scope="row"><a href={`/models/${row.slug}/`}>{row.name}</a><small>{row.provider}</small></th><td>{status}</td><td>{metric(row.ttft, 's')}</td><td>{metric(row.throughput, ' tok/s')}</td><td>{row.conditions ?? 'Not reported'}</td><td><time dateTime={row.observedAt ?? undefined}>{formatTimestamp(row.observedAt)}</time></td><td><button className="button button-small" type="button" onClick={() => compare(row)}>Compare {row.name}</button></td></tr>)}</tbody></table></div></section>

    <section className="panel sla-metric-panel" aria-labelledby="sla-ttft-heading"><h2 id="sla-ttft-heading">TTFT evidence</h2><p>Only published TTFT values are plotted; the table keeps missing values explicit.</p>{ttftData.length ? <ScoreBarChart data={ttftData} ariaLabel="TTFT by model" unit="seconds" /> : <p>No published TTFT measurements are available.</p>}<div className="sla-table-wrap"><table aria-label="TTFT evidence"><thead><tr><th>Model</th><th>TTFT</th></tr></thead><tbody>{evidence.map((row) => <tr key={row.id}><th scope="row">{row.name}</th><td>{metric(row.ttft, 's')}</td></tr>)}</tbody></table></div></section>

    <section className="panel sla-metric-panel" aria-labelledby="sla-throughput-heading"><h2 id="sla-throughput-heading">Throughput evidence</h2><p>Only published throughput values are plotted; the table keeps missing values explicit.</p>{throughputData.length ? <ScoreBarChart data={throughputData} ariaLabel="Throughput by model" unit="tok/s" /> : <p>No published throughput measurements are available.</p>}<div className="sla-table-wrap"><table aria-label="Throughput evidence"><thead><tr><th>Model</th><th>Throughput</th></tr></thead><tbody>{evidence.map((row) => <tr key={row.id}><th scope="row">{row.name}</th><td>{metric(row.throughput, ' tok/s')}</td></tr>)}</tbody></table></div></section>

    {inspected ? <InspectionCard record={inspectionRecord(inspected)} onClose={() => setInspected(null)} returnFocusRef={triggerRef} /> : null}
  </div>;
}
