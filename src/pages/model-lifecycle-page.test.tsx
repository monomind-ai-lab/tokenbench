import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModelDirectoryRecord } from '../frontend/model-directory-contracts';
import { ModelLifecycleApp, ModelLifecyclePage } from './model-lifecycle-page';

const records = [{
  modelKey: 'benchlm:current-model', canonicalSlug: 'current-model', displayName: 'Current Model', creator: 'Provider A', sourceType: 'Proprietary', reasoningType: null,
  familyId: null, variantId: null, firstSeenRevision: 'r1', firstSeenAt: '2026-08-01T00:00:00.000Z', lastSeenRevision: 'r2', lastSeenAt: '2026-08-10T00:00:00.000Z', latestProfileRevision: 'r2', status: 'current' as const, sourceId: 'benchlm' as const, sourceModelId: 'current-model', updatedAt: '2026-08-10T00:00:00.000Z',
}, {
  modelKey: 'benchlm:archived-model', canonicalSlug: 'archived-model', displayName: 'Archived Model', creator: 'Provider B', sourceType: 'Proprietary', reasoningType: null,
  familyId: null, variantId: null, firstSeenRevision: 'r1', firstSeenAt: '2026-07-01T00:00:00.000Z', lastSeenRevision: 'r1', lastSeenAt: '2026-07-20T00:00:00.000Z', latestProfileRevision: 'r1', status: 'archived' as const, sourceId: 'benchlm' as const, sourceModelId: 'archived-model', updatedAt: '2026-07-20T00:00:00.000Z',
}] as const satisfies readonly ModelDirectoryRecord[];

const envelopeRecords = records.map((record) => ({
  ...record,
  weeklyRank: null, overallScore: null, overallRank: null, strongestCategory: null, representativePrice: null,
  evidenceStatus: 'source_only' as const, profileRevision: record.latestProfileRevision, profileFallback: 'none' as const, profilePublishedAt: null, profileCheckedAt: record.updatedAt,
}));

describe('Model Lifecycle Radar', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('renders validated directory identities and only evidence-backed lifecycle facts', () => {
    render(<ModelLifecyclePage records={records} />);

    expect(screen.getByRole('heading', { name: 'Model Lifecycle Radar' })).toBeInTheDocument();
    expect(screen.getAllByText('Current Model')).toHaveLength(2);
    expect(screen.getAllByText('Archived Model')).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'View model profile' })[0]).toHaveAttribute('href', '/models/current-model/');
    expect(screen.getAllByText('Announcement date')).toHaveLength(4);
    expect(screen.getAllByText('Deprecation date')).toHaveLength(4);
    expect(screen.getAllByText('Retirement date')).toHaveLength(4);
    expect(screen.getAllByText('Unavailable')).toHaveLength(28);
    expect(screen.queryByText('Release date')).not.toBeInTheDocument();
    expect(screen.queryByText('opencodex/gpt-5.6-terra')).not.toBeInTheDocument();
  });

  it('keeps the mobile ledger fact-equivalent with the desktop table', () => {
    render(<ModelLifecyclePage records={records} />);

    const table = within(screen.getByTestId('lifecycle-desktop-table'));
    const cards = within(screen.getByTestId('lifecycle-mobile-cards'));
    expect(table.getAllByText('Announcement date')).toHaveLength(2);
    expect(cards.getAllByText('Announcement date')).toHaveLength(2);
    expect(table.getAllByText('Migration target')).toHaveLength(2);
    expect(cards.getAllByText('Migration target')).toHaveLength(2);
  });

  it('renders exact selector group labels and leaves the permanent action group non-interactive', () => {
    render(<ModelLifecyclePage records={records} />);

    const groups = within(screen.getByLabelText('Lifecycle groups'));
    expect(groups.getByText('Action required (0)')).toBeInTheDocument();
    expect(groups.getByText('Upcoming changes (0)')).toBeInTheDocument();
    expect(groups.getByText('Monitoring (1)')).toBeInTheDocument();
    expect(groups.getByText('Archived (1)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Action required (0)' })).not.toBeInTheDocument();
  });

  it('keeps later lifecycle groups as collapsible buttons with their current expansion state', () => {
    render(<ModelLifecyclePage records={records} />);

    for (const name of ['Upcoming changes (0)', 'Monitoring (1)', 'Archived (1)']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-expanded', 'false');
    }
    fireEvent.click(screen.getByRole('button', { name: 'Upcoming changes (0)' }));
    expect(screen.getByRole('button', { name: 'Upcoming changes (0)' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('bounds long ledgers and filters current or archived records without losing the full count', () => {
    const longRecords = Array.from({ length: 24 }, (_, index): ModelDirectoryRecord => ({
      ...records[index % records.length]!,
      modelKey: `benchlm:model-${index}`,
      canonicalSlug: `model-${index}`,
      displayName: `Model ${index}`,
      sourceModelId: `model-${index}`,
      status: index < 18 ? 'current' : 'archived',
    }));
    render(<ModelLifecyclePage records={longRecords} />);

    expect(screen.getByText('Showing 20 of 24 records')).toBeInTheDocument();
    expect(screen.queryAllByText('Model 23')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Show 4 more records' }));
    expect(screen.getAllByText('Model 23')).toHaveLength(2);

    fireEvent.click(screen.getByRole('radio', { name: 'Archived (6)' }));
    expect(screen.getByText('Showing 6 of 6 archived records')).toBeInTheDocument();
    expect(screen.getAllByText('Model 23')).toHaveLength(2);
    expect(screen.queryAllByText('Model 0')).toHaveLength(0);
  });

  it('lets headings carry the hierarchy without decorative eyebrow labels', () => {
    render(<ModelLifecyclePage records={records} />);
    expect(screen.queryByText('Evidence Ledger')).not.toBeInTheDocument();
    expect(screen.queryByText('Model records')).not.toBeInTheDocument();
  });

  it('loads and renders validated all-status directory evidence', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      revision: 'r2', publishedAt: '2026-08-10T00:00:00.000Z', freshness: { status: 'fresh', checkedAt: '2026-08-10T00:00:00.000Z' }, attribution: [], data: { week: null, models: envelopeRecords, nextCursor: null },
    }), { status: 200 })));
    render(<ModelLifecycleApp />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading validated lifecycle records');
    await waitFor(() => expect(screen.getAllByText('Archived Model')).toHaveLength(2));
    expect(fetch).toHaveBeenCalledWith('/api/benchmarks/models?status=all&limit=100', expect.objectContaining({ headers: { accept: 'application/json' } }));
  });

  it('keeps an explicit error state when lifecycle evidence cannot be validated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    render(<ModelLifecycleApp />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Lifecycle evidence is temporarily unavailable'));
  });

  it('keeps a valid empty lifecycle envelope distinct from a request error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      revision: 'r2', publishedAt: '2026-08-10T00:00:00.000Z', freshness: { status: 'fresh', checkedAt: '2026-08-10T00:00:00.000Z' }, attribution: [], data: { week: null, models: [], nextCursor: null },
    }), { status: 200 })));
    render(<ModelLifecycleApp />);
    await waitFor(() => expect(screen.getByText('No validated lifecycle records are available.')).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
