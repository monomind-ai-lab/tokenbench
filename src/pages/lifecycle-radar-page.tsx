import { useEffect, useState, type ReactNode } from 'react';
import { fixtureAdapter } from '../frontend/preview-data/adapter';
import type { LifecycleData, LifecycleModel, PreviewDataAdapter, UiDataContractV1 } from '../frontend/preview-data/contracts';
import type { PreviewPageProps } from '../preview/route-types';

type LifecycleContract = UiDataContractV1<LifecycleData>;
type LifecycleView = 'cards' | 'table';
type LifecycleHorizon = 'all' | '90' | '60';

interface LifecycleRadarPageProps extends PreviewPageProps {
  readonly adapter?: PreviewDataAdapter;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function provenance(value: unknown): boolean {
  return isRecord(value)
    && text(value.id)
    && text(value.label)
    && (value.kind === 'illustrative_prototype' || value.kind === 'approved_manual' || value.kind === 'accepted_pipeline')
    && (value.effectiveAt === null || text(value.effectiveAt))
    && text(value.note);
}

function evidence(value: unknown, validValue: (candidate: unknown) => boolean): boolean {
  if (!isRecord(value)) return false;
  if (value.availability === 'unavailable') return text(value.reason);
  return value.availability === 'available' && validValue(value.value) && provenance(value.provenance);
}

function lifecycle(value: unknown): boolean {
  return isRecord(value)
    && (value.status === 'Current' || value.status === 'Retirement scheduled')
    && evidence(value.sunsetOn, text);
}

function lifecycleModel(value: unknown): boolean {
  return isRecord(value)
    && text(value.modelId)
    && evidence(value.identity, (identity) => isRecord(identity) && text(identity.slug) && text(identity.name) && text(identity.provider))
    && evidence(value.lifecycle, lifecycle)
    && evidence(value.replacement, (replacement) => isRecord(replacement) && text(replacement.modelId) && text(replacement.migrationNote));
}

function isContract(value: unknown): value is LifecycleContract {
  return isRecord(value)
    && value.contractVersion === 'ui-data-contract/v1'
    && (value.status === 'available' || value.status === 'partial' || value.status === 'unavailable')
    && typeof value.fetchedAt === 'string'
    && Array.isArray(value.provenance)
    && (value.data === null || (isRecord(value.data) && Array.isArray(value.data.models) && value.data.models.every(lifecycleModel)));
}

/** Validates the static lifecycle payload before client hydration uses it. */
export function parseLifecycleRadarPageData(value: unknown): LifecycleContract | null {
  return isContract(value) ? value : null;
}

function identity(model: LifecycleModel) {
  return model.identity.availability === 'available' ? model.identity.value : null;
}

function sunset(model: LifecycleModel): string | null {
  if (model.lifecycle.availability !== 'available' || model.lifecycle.value.sunsetOn.availability !== 'available') return null;
  return model.lifecycle.value.sunsetOn.value;
}

function replacement(model: LifecycleModel): ReactNode {
  if (model.replacement.availability === 'unavailable') return <span className="evidence-unavailable">{model.replacement.reason}</span>;
  return `${model.replacement.value.modelId} — ${model.replacement.value.migrationNote}`;
}

function source(model: LifecycleModel): ReactNode {
  if (model.lifecycle.availability !== 'available') return null;
  const provenance = model.lifecycle.provenance;
  return <p className="fixture">{provenance.label} · Effective {provenance.effectiveAt?.slice(0, 10) ?? 'time unavailable'}</p>;
}

function LifecycleCards({ models }: { readonly models: readonly LifecycleModel[] }) {
  return <div className="grid-2" aria-label="Lifecycle event cards">{models.map((model) => {
    const entry = identity(model);
    const lifecycle = model.lifecycle.availability === 'available' ? model.lifecycle.value : null;
    return <article className="panel" key={model.modelId}><p className="eyebrow">{entry?.provider ?? 'Unavailable'}</p><h3>{entry?.name ?? model.modelId}</h3><dl><div><dt>Status</dt><dd>{lifecycle?.status ?? 'Unavailable'}</dd></div><div><dt>Sunset</dt><dd>{sunset(model) ?? 'Unavailable'}</dd></div><div><dt>Replacement</dt><dd>{replacement(model)}</dd></div></dl>{source(model)}</article>;
  })}</div>;
}

function LifecycleTable({ models }: { readonly models: readonly LifecycleModel[] }) {
  return <div role="region" aria-label="Lifecycle events table" tabIndex={0}><table aria-label="Lifecycle events"><thead><tr><th scope="col">Model</th><th scope="col">Status</th><th scope="col">Sunset</th><th scope="col">Replacement</th><th scope="col">Evidence</th></tr></thead><tbody>{models.map((model) => {
    const entry = identity(model);
    const lifecycle = model.lifecycle.availability === 'available' ? model.lifecycle.value : null;
    return <tr key={model.modelId}><th scope="row">{entry?.name ?? model.modelId}</th><td>{lifecycle?.status ?? 'Unavailable'}</td><td>{sunset(model) ?? 'Unavailable'}</td><td>{replacement(model)}</td><td>{source(model)}</td></tr>;
  })}</tbody></table></div>;
}

function horizonDays(horizon: LifecycleHorizon): number {
  return horizon === 'all' ? 36500 : Number(horizon);
}

export function LifecycleRadarPage({ data, adapter = fixtureAdapter }: LifecycleRadarPageProps) {
  const [horizon, setHorizon] = useState<LifecycleHorizon>('90');
  const [view, setView] = useState<LifecycleView>('cards');
  const [contract, setContract] = useState<LifecycleContract | null>(() => parseLifecycleRadarPageData(data));
  useEffect(() => {
    let active = true;
    void adapter.lifecycle({ horizonDays: horizonDays(horizon) }).then((next) => { if (active) setContract(next); });
    return () => { active = false; };
  }, [adapter, horizon]);
  if (contract === null) return <p role="status">Loading lifecycle evidence.</p>;
  if (contract.status === 'unavailable' || contract.data === null) return <section className="panel" role="alert"><h1>Lifecycle evidence unavailable</h1><p>{contract.reason ?? 'No approved lifecycle evidence is available.'}</p></section>;
  const models = contract.data.models;
  return <div className="content-stack lifecycle-radar-page">
    <header className="panel"><p className="eyebrow">Models / Lifecycle radar</p><h1>Production model lifecycle &amp; retirement radar</h1><p>See retirement deadlines, sourced replacement paths and the operational delta before an endpoint disappears.</p><p className="fixture">Illustrative prototype data · unavailable replacements remain unavailable rather than inferred.</p></header>
    <section className="panel" aria-labelledby="retirement-watchlist-heading"><div className="panel-heading"><div><h2 id="retirement-watchlist-heading">Retirement watchlist</h2><p>A replacement is a sourced route, not an automatic recommendation.</p></div></div><label htmlFor="lifecycle-horizon">Horizon</label><select id="lifecycle-horizon" value={horizon} onChange={(event) => setHorizon(event.currentTarget.value as LifecycleHorizon)}><option value="all">All notices</option><option value="90">Next 90 days</option><option value="60">Next 60 days</option></select><button type="button" aria-pressed={view === 'cards'} onClick={() => setView('cards')}>Cards view</button><button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>Table view</button><p className="fixture" role="status">{models.length} source-backed illustrative notice{models.length === 1 ? '' : 's'} shown.</p>{models.length === 0 ? <p role="status">No illustrative notices fall inside this horizon.</p> : view === 'cards' ? <LifecycleCards models={models} /> : <LifecycleTable models={models} />}</section>
    <section className="grid-2"><section className="panel" aria-labelledby="lifecycle-timeline-heading"><h2 id="lifecycle-timeline-heading">Release timeline</h2><ol aria-label="Lifecycle timeline">{models.map((model) => <li key={model.modelId}><time dateTime={sunset(model) ?? undefined}>{sunset(model) ?? 'Unavailable'}</time><div><strong>{identity(model)?.name ?? model.modelId}</strong><p>{model.lifecycle.availability === 'available' ? model.lifecycle.value.status : 'Lifecycle unavailable'}</p>{source(model)}</div></li>)}</ol></section><section className="panel"><h2>Evidence boundary</h2><dl><div><dt>Lifecycle authority</dt><dd>Provider announcement or changelog snapshot</dd></div><div><dt>Unknown replacements</dt><dd>Shown as unavailable; never inferred from disappearance.</dd></div><div><dt>Freshness</dt><dd>Per-event effective time, not page-build time.</dd></div></dl></section></section>
  </div>;
}
