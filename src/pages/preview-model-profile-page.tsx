import { useEffect, useState, type ReactNode } from 'react';
import { ModelRadar } from '../frontend/model-radar';
import { fixtureAdapter } from '../frontend/preview-data/adapter';
import type { EvidenceValue, PreviewDataAdapter, PreviewModel, PreviewModelProfileData, Provenance, UiDataContractV1 } from '../frontend/preview-data/contracts';
import type { PreviewPageProps } from '../preview/route-types';

type ProfileContract = UiDataContractV1<PreviewModelProfileData>;

interface PreviewModelProfilePageProps extends PreviewPageProps {
  readonly adapter?: PreviewDataAdapter;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
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

function previewModel(value: unknown): boolean {
  const identity = (candidate: unknown) => isRecord(candidate) && text(candidate.slug) && text(candidate.name) && text(candidate.provider);
  const benchmark = (candidate: unknown) => isRecord(candidate)
    && text(candidate.releaseOn)
    && Array.isArray(candidate.subtasks)
    && candidate.subtasks.every((subtask) => isRecord(subtask) && text(subtask.id) && text(subtask.label));
  const capability = (candidate: unknown) => isRecord(candidate)
    && finiteNumber(candidate.compositeScore)
    && Array.isArray(candidate.radar)
    && candidate.radar.every((axis) => isRecord(axis)
      && text(axis.key)
      && text(axis.label)
      && (axis.percentile === null || finiteNumber(axis.percentile))
      && (axis.rank === null || Number.isSafeInteger(axis.rank))
      && (axis.fieldSize === null || Number.isSafeInteger(axis.fieldSize)));
  const cachePricing = (candidate: unknown) => isRecord(candidate)
    && evidence(candidate.readUsdPerMillion, finiteNumber)
    && evidence(candidate.writeUsdPerMillion, finiteNumber);
  const routePricing = (candidate: unknown) => isRecord(candidate)
    && text(candidate.route)
    && finiteNumber(candidate.inputUsdPerMillion)
    && finiteNumber(candidate.outputUsdPerMillion)
    && evidence(candidate.cache, cachePricing);
  const taskEconomics = (candidate: unknown) => isRecord(candidate)
    && finiteNumber(candidate.costUsdPerSuccessfulTask)
    && text(candidate.workload);
  const runtime = (candidate: unknown) => isRecord(candidate)
    && finiteNumber(candidate.ttftP50Seconds)
    && finiteNumber(candidate.outputTokensPerSecond)
    && text(candidate.conditions);
  const lifecycle = (candidate: unknown) => isRecord(candidate)
    && (candidate.status === 'Current' || candidate.status === 'Retirement scheduled')
    && evidence(candidate.sunsetOn, text);
  return isRecord(value)
    && text(value.id)
    && evidence(value.identity, identity)
    && evidence(value.access, (access) => access === 'Proprietary' || access === 'Open weights')
    && evidence(value.benchmark, benchmark)
    && evidence(value.capability, capability)
    && evidence(value.routePricing, routePricing)
    && evidence(value.taskEconomics, taskEconomics)
    && evidence(value.runtime, runtime)
    && evidence(value.lifecycle, lifecycle);
}

function isContract(value: unknown): value is ProfileContract {
  return isRecord(value)
    && value.contractVersion === 'ui-data-contract/v1'
    && (value.status === 'available' || value.status === 'partial' || value.status === 'unavailable')
    && typeof value.fetchedAt === 'string'
    && Array.isArray(value.provenance)
    && (value.data === null || (isRecord(value.data) && previewModel(value.data.model)));
}

/** Validates the static profile payload before client hydration uses it. */
export function parsePreviewModelProfilePageData(value: unknown): ProfileContract | null {
  return isContract(value) ? value : null;
}

function unavailable(reason: string): ReactNode {
  return <span className="evidence-unavailable">{reason}</span>;
}

function sourceLine(label: string, effectiveAt: string | null): ReactNode {
  return <p className="fixture">{label} · Effective {effectiveAt?.slice(0, 10) ?? 'time unavailable'}</p>;
}

function modelIdentity(model: PreviewModel) {
  return model.identity.availability === 'available' ? model.identity.value : null;
}

function evidenceValue<T>(evidence: EvidenceValue<T>): T | null {
  return evidence.availability === 'available' ? evidence.value : null;
}

function evidenceProvenance<T>(evidence: EvidenceValue<T>): Provenance | null {
  return evidence.availability === 'available' ? evidence.provenance : null;
}

function evidenceReason<T>(evidence: EvidenceValue<T>): string {
  return evidence.availability === 'unavailable' ? evidence.reason : 'Unavailable';
}

function currency(value: number): string {
  return `$${value.toFixed(2)}`;
}

function ProfileBody({ model }: { readonly model: PreviewModel }) {
  const identity = modelIdentity(model);
  if (!identity) return <section className="panel" role="alert"><h1>Model profile unavailable</h1><p>Model identity is unavailable in this preview contract.</p></section>;
  const capability = evidenceValue(model.capability);
  const capabilityProvenance = evidenceProvenance(model.capability);
  const runtime = evidenceValue(model.runtime);
  const runtimeProvenance = evidenceProvenance(model.runtime);
  const pricing = evidenceValue(model.routePricing);
  const pricingProvenance = evidenceProvenance(model.routePricing);
  const lifecycle = evidenceValue(model.lifecycle);
  const lifecycleProvenance = evidenceProvenance(model.lifecycle);
  return <div className="content-stack preview-model-profile-page">
    <header className="panel" aria-label={`${identity.name} profile`}>
      <p className="eyebrow">Models / {identity.provider}</p>
      <div><h1>{identity.name}</h1>{lifecycle ? <span className="tag profile-status">{lifecycle.status}</span> : null}</div>
      <p>Capability, route economics, service-level measurements and lifecycle evidence in one model-specific decision record.</p>
      {sourceLine(model.identity.provenance.label, model.identity.provenance.effectiveAt)}
      <a className="button" href={`/compare?models=${encodeURIComponent(identity.slug)}`}>Add to comparison</a>
    </header>
    <section className="panel" aria-labelledby="profile-summary-heading"><h2 id="profile-summary-heading">Illustrative profile summary</h2><dl><div><dt>Composite capability</dt><dd>{capability ? capability.compositeScore.toFixed(1) : unavailable(evidenceReason(model.capability))}</dd></div><div><dt>Representative task cost</dt><dd>{model.taskEconomics.availability === 'available' ? currency(model.taskEconomics.value.costUsdPerSuccessfulTask) : unavailable(model.taskEconomics.reason)}</dd></div></dl></section>
    <section className="grid-2">
      <div className="panel"><div role="img" aria-label="Capability radar">{capability ? <ModelRadar axes={capability.radar} /> : <p>{unavailable(evidenceReason(model.capability))}</p>}</div>{capabilityProvenance ? sourceLine(capabilityProvenance.label, capabilityProvenance.effectiveAt) : null}</div>
      <section className="panel" aria-labelledby="runtime-sla-heading"><h2 id="runtime-sla-heading">Runtime SLA evidence</h2>{runtime ? <><p>Time to first token (p50)</p><meter min={0} max={2} value={runtime.ttftP50Seconds}>{runtime.ttftP50Seconds}s</meter><strong>{runtime.ttftP50Seconds.toFixed(2)}s</strong><p>Output throughput</p><meter min={0} max={200} value={runtime.outputTokensPerSecond}>{runtime.outputTokensPerSecond} tok/s</meter><strong>{runtime.outputTokensPerSecond.toFixed(0)} tok/s</strong><p>{runtime.conditions}</p>{runtimeProvenance ? sourceLine(runtimeProvenance.label, runtimeProvenance.effectiveAt) : null}</> : <p>{unavailable(evidenceReason(model.runtime))}</p>}</section>
    </section>
    <section className="grid-2">
      <section className="panel" aria-labelledby="route-evidence-heading"><h2 id="route-evidence-heading">Route pricing evidence</h2>{pricing ? <dl><div><dt>Representative route</dt><dd>{pricing.route}</dd></div><div><dt>Input / 1M</dt><dd>{currency(pricing.inputUsdPerMillion)}</dd></div><div><dt>Output / 1M</dt><dd>{currency(pricing.outputUsdPerMillion)}</dd></div><div><dt>Cache write</dt><dd>{pricing.cache.availability === 'available' && pricing.cache.value.writeUsdPerMillion.availability === 'available' ? currency(pricing.cache.value.writeUsdPerMillion.value) : pricing.cache.availability === 'available' ? unavailable(evidenceReason(pricing.cache.value.writeUsdPerMillion)) : unavailable(pricing.cache.reason)}</dd></div></dl> : <p>{unavailable(evidenceReason(model.routePricing))}</p>}{pricingProvenance ? sourceLine(pricingProvenance.label, pricingProvenance.effectiveAt) : null}</section>
      <section className="panel" aria-labelledby="lifecycle-evidence-heading"><h2 id="lifecycle-evidence-heading">Lifecycle &amp; sunset</h2>{lifecycle ? <dl><div><dt>Status</dt><dd>{lifecycle.status}</dd></div><div><dt>Sunset</dt><dd>{lifecycle.sunsetOn.availability === 'available' ? lifecycle.sunsetOn.value : unavailable(lifecycle.sunsetOn.reason)}</dd></div></dl> : <p>{unavailable(evidenceReason(model.lifecycle))}</p>}{lifecycleProvenance ? sourceLine(lifecycleProvenance.label, lifecycleProvenance.effectiveAt) : null}<a href="/model-lifecycle">Open the full lifecycle radar</a></section>
    </section>
  </div>;
}

export function PreviewModelProfilePage({ match, data, adapter = fixtureAdapter }: PreviewModelProfilePageProps) {
  const requestedSlug = match.search.get('model')?.trim() || 'gpt-4o';
  const [contract, setContract] = useState<ProfileContract | null>(() => parsePreviewModelProfilePageData(data));
  useEffect(() => {
    let active = true;
    void adapter.profile(requestedSlug).then((next) => { if (active) setContract(next); });
    return () => { active = false; };
  }, [adapter, requestedSlug]);
  if (contract === null) return <p role="status">Loading illustrative model profile.</p>;
  if (contract.status === 'unavailable' || contract.data === null) return <section className="panel" role="alert"><h1>Model profile unavailable</h1><p>{contract.reason ?? 'No approved preview profile is available for this model.'}</p></section>;
  return <ProfileBody model={contract.data.model} />;
}
