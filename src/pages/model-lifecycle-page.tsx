import { useEffect, useMemo, useState } from 'react';
import {
  groupLifecycleRecords,
  type LifecycleGroupId,
  type LifecycleRecord,
} from '../benchmarks/lifecycle-view';
import { AppShell } from '../frontend/app-shell';
import { modelPath, parseModelDirectoryEnvelope, type ModelDirectoryRecord } from '../frontend/model-directory-contracts';
import { useSitePreferences } from '../frontend/site-preferences';
import { ROUTE_PATHS } from '../routing/routes';

const UNAVAILABLE = 'Unavailable';
const PAGE_SIZE = 20;
type LifecycleStatusFilter = 'all' | ModelDirectoryRecord['status'];
type Horizon = '30' | '90' | '180' | 'all';

interface LifecycleControls {
  readonly search: string;
  readonly provider: string;
  readonly status: LifecycleStatusFilter;
  readonly horizon: Horizon;
}

function formatDate(value: string | null): string {
  if (value === null || !Number.isFinite(Date.parse(value))) return UNAVAILABLE;
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
}

function lifecycleRecord(record: ModelDirectoryRecord & Partial<LifecycleRecord>): LifecycleRecord {
  return {
    modelKey: record.modelKey,
    canonicalSlug: record.canonicalSlug,
    displayName: record.displayName,
    creator: record.creator,
    status: record.status,
    announcementDate: record.announcementDate ?? null,
    deprecationDate: record.deprecationDate ?? null,
    retirementDate: record.retirementDate ?? null,
    replacement: record.replacement ?? null,
  };
}

function controlsFromLocation(): LifecycleControls {
  if (typeof window === 'undefined') return { search: '', provider: '', status: 'all', horizon: '90' };
  const search = new URLSearchParams(window.location.search);
  const status = search.get('status');
  const horizon = search.get('horizon');
  return {
    search: search.get('q') ?? '',
    provider: search.get('provider') ?? '',
    status: status === 'current' || status === 'archived' ? status : 'all',
    horizon: horizon === '30' || horizon === '180' || horizon === 'all' ? horizon : '90',
  };
}

function syncControls(controls: LifecycleControls) {
  if (typeof window === 'undefined') return;
  const search = new URLSearchParams();
  if (controls.search) search.set('q', controls.search);
  if (controls.provider) search.set('provider', controls.provider);
  if (controls.status !== 'all') search.set('status', controls.status);
  if (controls.horizon !== '90') search.set('horizon', controls.horizon);
  const query = search.toString();
  window.history.replaceState(window.history.state, '', `${ROUTE_PATHS.modelLifecycle}${query ? `?${query}` : ''}${window.location.hash}`);
}

function LifecycleFacts({ record }: { readonly record: LifecycleRecord }) {
  const ledgerFacts = [
    ['Announcement date', formatDate(record.announcementDate)],
    ['Deprecation date', formatDate(record.deprecationDate)],
    ['Retirement date', formatDate(record.retirementDate)],
    ['Migration target', record.replacement ? <a href={record.replacement.sourceUrl} target="_blank" rel="noreferrer">Recommended replacement: {record.replacement.replacementId}</a> : UNAVAILABLE],
    ['Migration evidence', record.replacement ? `Sourced ${formatDate(record.replacement.observedAt)}` : UNAVAILABLE],
    ['Cost delta', UNAVAILABLE],
    ['Speed delta', UNAVAILABLE],
  ] as const;
  return <dl className="lifecycle-facts">{ledgerFacts.map(([label, value]) => <div key={label}>
    <dt>{label}</dt><dd>{value}</dd>
  </div>)}</dl>;
}

function LifecycleTable({ records }: { readonly records: readonly LifecycleRecord[] }) {
  return <div className="lifecycle-desktop-table" data-testid="lifecycle-desktop-table">
    <table aria-label="Model lifecycle evidence ledger"><thead><tr><th scope="col">Model</th><th scope="col">Lifecycle evidence</th><th scope="col">Evidence boundary</th></tr></thead>
      <tbody>{records.map((record) => <tr key={record.modelKey}><th scope="row"><strong>{record.displayName}</strong><a href={modelPath(record.canonicalSlug)}>View model profile</a></th><td><LifecycleFacts record={record} /></td><td>Lifecycle dates and migration claims require their own source evidence.</td></tr>)}</tbody>
    </table>
  </div>;
}

function LifecycleCards({ records }: { readonly records: readonly LifecycleRecord[] }) {
  return <ul className="lifecycle-mobile-cards" data-testid="lifecycle-mobile-cards">{records.map((record) => <li key={record.modelKey}>
    <strong>{record.displayName}</strong><a href={modelPath(record.canonicalSlug)}>View model profile</a><LifecycleFacts record={record} />
    <p>Lifecycle dates and migration claims require their own source evidence.</p>
  </li>)}</ul>;
}

function groupLabel(id: LifecycleGroupId, count: number): string {
  return `${id.replaceAll('_', ' ')} (${count})`;
}

export function ModelLifecyclePage({ records }: { readonly records: readonly (ModelDirectoryRecord & Partial<LifecycleRecord>)[] }) {
  const [controls, setControls] = useState<LifecycleControls>(controlsFromLocation);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<LifecycleGroupId>>(() => new Set(['action_required']));
  const lifecycleRecords = useMemo(() => records.map(lifecycleRecord), [records]);
  const providers = useMemo(() => [...new Set(lifecycleRecords.map((record) => record.creator))].sort(), [lifecycleRecords]);
  const statusCounts = {
    current: lifecycleRecords.filter((record) => record.status === 'current').length,
    archived: lifecycleRecords.filter((record) => record.status === 'archived').length,
  };
  const now = new Date();
  const horizonDays = controls.horizon === 'all' ? 36_500 : Number(controls.horizon);
  const filteredRecords = lifecycleRecords.filter((record) => {
    const query = controls.search.trim().toLocaleLowerCase();
    return (controls.status === 'all' || record.status === controls.status)
      && (!controls.provider || record.creator === controls.provider)
      && (!query || [record.displayName, record.creator, record.canonicalSlug].some((value) => value.toLocaleLowerCase().includes(query)));
  });
  const groups = groupLifecycleRecords(filteredRecords, now, horizonDays);
  const visibleRecords = filteredRecords.slice(0, visibleCount);
  const remainingCount = filteredRecords.length - visibleRecords.length;
  const filterLabel = controls.status === 'all' ? 'records' : `${controls.status} records`;
  const setNextControls = (next: LifecycleControls) => {
    setControls(next);
    setVisibleCount(PAGE_SIZE);
    syncControls(next);
  };

  return <div className="content-stack lifecycle-page">
    <section className="lifecycle-hero panel"><h1>Model Lifecycle Radar</h1>
      <p>Track separately sourced announcement, deprecation, and retirement facts. Missing lifecycle, migration, cost, and speed evidence remains unavailable rather than inferred.</p>
      <a className="button" href={ROUTE_PATHS.models}>Browse model directory</a>
    </section>
    <section className="lifecycle-ledger" aria-labelledby="lifecycle-ledger-heading"><div className="lifecycle-ledger-heading"><h2 id="lifecycle-ledger-heading">Lifecycle evidence</h2><p>Source-host differences and missing conditions block migration deltas; current and archived retention alone does not establish a lifecycle date.</p></div>{records.length === 0 ? <p className="models-unavailable">No validated lifecycle records are available.</p> : <>
      <form className="lifecycle-ledger-toolbar" onSubmit={(event) => event.preventDefault()}>
        <label>Search models<input type="search" value={controls.search} onChange={(event) => setNextControls({ ...controls, search: event.target.value })} /></label>
        <label>Provider<select value={controls.provider} onChange={(event) => setNextControls({ ...controls, provider: event.target.value })}><option value="">All providers</option>{providers.map((provider) => <option key={provider} value={provider}>{provider}</option>)}</select></label>
        <fieldset><legend>Filter lifecycle status</legend>{([
          ['all', `All (${lifecycleRecords.length})`],
          ['current', `Current (${statusCounts.current})`],
          ['archived', `Archived (${statusCounts.archived})`],
        ] as const).map(([value, label]) => <label key={value}><input type="radio" name="lifecycle-status" value={value} checked={controls.status === value} onChange={() => setNextControls({ ...controls, status: value })} /><span>{label}</span></label>)}</fieldset>
        <label>Change horizon<select value={controls.horizon} onChange={(event) => setNextControls({ ...controls, horizon: event.target.value as Horizon })}><option value="30">30 days</option><option value="90">90 days</option><option value="180">180 days</option><option value="all">All future dates</option></select></label>
        <p aria-live="polite">Showing {visibleRecords.length} of {filteredRecords.length} {filterLabel}</p>
      </form>
      <div className="lifecycle-groups" aria-label="Lifecycle groups">{groups.map((group) => <section key={group.id} className={`lifecycle-group lifecycle-group-${group.id}`}>
        <button className="lifecycle-group-toggle" type="button" aria-expanded={group.id === 'action_required' || expandedGroups.has(group.id)} onClick={() => setExpandedGroups((current) => {
          if (group.id === 'action_required') return current;
          const next = new Set(current);
          if (next.has(group.id)) next.delete(group.id); else next.add(group.id);
          return next;
        })}>{groupLabel(group.id, group.records.length)}</button>
        {group.id === 'action_required' || expandedGroups.has(group.id) ? <p>{group.records.length ? `${group.records.length} record${group.records.length === 1 ? '' : 's'} in this evidence group.` : 'No records in this evidence group.'}</p> : null}
      </section>)}</div>
      <LifecycleTable records={visibleRecords} /><LifecycleCards records={visibleRecords} />
      {remainingCount > 0 ? <div className="lifecycle-load-more"><button className="button button-secondary" type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>Show {Math.min(PAGE_SIZE, remainingCount)} more records</button></div> : null}
    </>}</section>
  </div>;
}

export function ModelLifecycleApp() {
  const { theme, language, toggleTheme, changeLanguage } = useSitePreferences();
  const [records, setRecords] = useState<readonly ModelDirectoryRecord[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/benchmarks/models?status=all&limit=100', { headers: { accept: 'application/json' }, signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`lifecycle request failed: ${response.status}`);
        const envelope = parseModelDirectoryEnvelope(await response.json());
        if (!envelope) throw new Error('lifecycle response failed validation');
        if (!controller.signal.aborted) setRecords(envelope.data.models);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, []);

  return <AppShell theme={theme} language={language} activePage="models" onThemeToggle={toggleTheme} onLanguageChange={changeLanguage}>
    {records === null && !error ? <p className="models-unavailable" role="status">Loading validated lifecycle records.</p> : null}
    {error ? <p className="models-unavailable" role="alert">Lifecycle evidence is temporarily unavailable. Please retry from the model directory.</p> : null}
    {records !== null ? <ModelLifecyclePage records={records} /> : null}
  </AppShell>;
}
