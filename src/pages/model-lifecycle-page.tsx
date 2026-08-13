import { useEffect, useState } from 'react';
import { AppShell } from '../frontend/app-shell';
import { modelPath, parseModelDirectoryEnvelope, type ModelDirectoryRecord } from '../frontend/model-directory-contracts';
import { useSitePreferences } from '../frontend/site-preferences';
import { ROUTE_PATHS } from '../routing/routes';

const UNAVAILABLE = 'Unavailable';
const PAGE_SIZE = 20;
type LifecycleStatusFilter = 'all' | ModelDirectoryRecord['status'];

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
}

function LifecycleFacts({ record }: { readonly record: ModelDirectoryRecord }) {
  const ledgerFacts = [
    ['Current vs archived', record.status === 'current' ? 'Current' : 'Archived'],
    ['First seen', formatDate(record.firstSeenAt)],
    ['Last seen', formatDate(record.lastSeenAt)],
    ['Retirement date', UNAVAILABLE],
    ['Migration target', UNAVAILABLE],
    ['Cost delta', UNAVAILABLE],
    ['Speed delta', UNAVAILABLE],
  ] as const;
  return <dl className="lifecycle-facts">{ledgerFacts.map(([label, value]) => <div key={label}>
    <dt>{label}</dt><dd>{value}</dd>
  </div>)}</dl>;
}

function LifecycleTable({ records }: { readonly records: readonly ModelDirectoryRecord[] }) {
  return <div className="lifecycle-desktop-table" data-testid="lifecycle-desktop-table">
    <table aria-label="Model lifecycle evidence ledger"><thead><tr><th scope="col">Model</th><th scope="col">Lifecycle evidence</th><th scope="col">Evidence boundary</th></tr></thead>
      <tbody>{records.map((record) => <tr key={record.modelKey}><th scope="row"><strong>{record.displayName}</strong><a href={modelPath(record.canonicalSlug)}>View model profile</a></th><td><LifecycleFacts record={record} /></td><td>Catalog and model-directory facts only</td></tr>)}</tbody>
    </table>
  </div>;
}

function LifecycleCards({ records }: { readonly records: readonly ModelDirectoryRecord[] }) {
  return <ul className="lifecycle-mobile-cards" data-testid="lifecycle-mobile-cards">{records.map((record) => <li key={record.modelKey}>
    <strong>{record.displayName}</strong><a href={modelPath(record.canonicalSlug)}>View model profile</a><LifecycleFacts record={record} />
    <p>Catalog and model-directory facts only</p>
  </li>)}</ul>;
}

export function ModelLifecyclePage({ records }: { readonly records: readonly ModelDirectoryRecord[] }) {
  const [statusFilter, setStatusFilter] = useState<LifecycleStatusFilter>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const statusCounts = {
    current: records.filter((record) => record.status === 'current').length,
    archived: records.filter((record) => record.status === 'archived').length,
  };
  const filteredRecords = statusFilter === 'all' ? records : records.filter((record) => record.status === statusFilter);
  const visibleRecords = filteredRecords.slice(0, visibleCount);
  const remainingCount = filteredRecords.length - visibleRecords.length;
  const filterLabel = statusFilter === 'all' ? 'records' : `${statusFilter} records`;
  const selectFilter = (nextFilter: LifecycleStatusFilter) => {
    setStatusFilter(nextFilter);
    setVisibleCount(PAGE_SIZE);
  };

  return <div className="content-stack lifecycle-page">
    <section className="lifecycle-hero panel"><h1>Model Lifecycle Radar</h1>
      <p>Track retained current and archived model records. Missing release, retirement, migration, cost, and speed evidence remains unavailable until a validated directory or profile fact supports it.</p>
      <a className="button" href={ROUTE_PATHS.models}>Browse model directory</a>
    </section>
    <section className="lifecycle-ledger" aria-labelledby="lifecycle-ledger-heading"><div className="lifecycle-ledger-heading"><h2 id="lifecycle-ledger-heading">Current vs archived</h2><p>The timeline is intentionally evidence-limited: it does not infer a release, retirement, migration, or performance change.</p></div>{records.length === 0 ? <p className="models-unavailable">No validated lifecycle records are available.</p> : <>
      <div className="lifecycle-ledger-toolbar">
        <fieldset><legend>Filter lifecycle status</legend>{([
          ['all', `All (${records.length})`],
          ['current', `Current (${statusCounts.current})`],
          ['archived', `Archived (${statusCounts.archived})`],
        ] as const).map(([value, label]) => <label key={value}><input type="radio" name="lifecycle-status" value={value} checked={statusFilter === value} onChange={() => selectFilter(value)} /><span>{label}</span></label>)}</fieldset>
        <p aria-live="polite">Showing {visibleRecords.length} of {filteredRecords.length} {filterLabel}</p>
      </div>
      <LifecycleTable records={visibleRecords} /><LifecycleCards records={visibleRecords} />
      {remainingCount > 0 ? <div className="lifecycle-load-more"><button className="button button-secondary" type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>Show {Math.min(PAGE_SIZE, remainingCount)} more records</button></div> : null}
    </>}</section>
  </div>;
}

export function ModelLifecycleApp() {
  const { theme, language, toggleTheme, changeLanguage } = useSitePreferences();
  const [records, setRecords] = useState<readonly ModelDirectoryRecord[] | null>(null);

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
        if (!controller.signal.aborted) setRecords([]);
      });
    return () => controller.abort();
  }, []);

  return <AppShell theme={theme} language={language} activePage="models" onThemeToggle={toggleTheme} onLanguageChange={changeLanguage}>
    {records === null ? <p className="models-unavailable" role="status">Loading validated lifecycle records.</p> : null}
    <ModelLifecyclePage records={records ?? []} />
  </AppShell>;
}
