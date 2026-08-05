import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from '../App';
import type { LeaderboardEntry, LeaderboardSort } from '../benchmarks/leaderboards';
import { HomePage } from '../pages/home-page';
import type { LeaderboardKey } from '../routing/routes';
import {
  LeaderboardFilters,
  parseLeaderboardFilters,
  serializeLeaderboardFilters,
  visibleLeaderboardEntries,
  type LeaderboardFilterState,
} from './leaderboard-filters';
import { LeaderboardTable } from './leaderboard-table';

const ISO_TIME = '2026-08-05T12:00:00.000Z';

function entry(overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    model: {
      modelKey: 'model-a',
      slug: 'model-a',
      name: 'Model A',
      creator: 'Provider A',
      sourceType: 'Proprietary',
      reasoningType: null,
      releaseDate: null,
      contextWindowTokens: null,
      evidenceStatus: 'supported',
      rankingEligible: true,
      confidenceLower: null,
      confidenceUpper: null,
      benchmarkCount: 1,
      sourceId: 'benchlm',
      sourceModelId: 'model-a',
      sourceArtifactId: 'benchlm-models',
    },
    metric: {
      modelKey: 'model-a',
      metricKey: 'benchlm:category:coding',
      category: 'coding',
      value: 83.2,
      rank: null,
      lower: null,
      upper: null,
      voteCount: null,
      unit: 'score',
      sourceId: 'benchlm',
      sourceUpdatedAt: ISO_TIME,
      sourceModelId: 'model-a',
      sourceArtifactId: 'benchlm-models',
      rankingEligible: true,
      methodology: 'benchlm_raw_composite',
      observationCount: null,
      sessionCount: null,
    },
    metrics: [],
    primaryPrice: null,
    blendedCostPerMillion: null,
    contextWindowTokens: null,
    sourceRank: null,
    onValueFrontier: false,
    ...overrides,
  };
}

const DEFAULT_FILTERS: LeaderboardFilterState = {
  query: '',
  profile: 'balanced',
  sort: 'score-desc',
  includeEstimated: false,
};

function apiEnvelope(
  key: LeaderboardKey,
  profile: 'inputHeavy' | 'balanced' | 'outputHeavy' = 'balanced',
  entries: readonly LeaderboardEntry[] = [entry()],
  freshness: { status: 'fresh' | 'stale'; checkedAt: string; message?: string } = { status: 'fresh', checkedAt: ISO_TIME },
) {
  const definitions: Partial<Record<LeaderboardKey, Record<string, unknown>>> = {
    'llm-coding': { kind: 'benchlm', sourceId: 'benchlm', metricKeys: ['benchlm:category:coding'], defaultSort: 'score-desc' },
    'llm-value': { kind: 'value', sourceId: 'benchlm', metricKeys: ['benchlm:overall:raw'], defaultSort: 'pareto-score-desc' },
    'llm-human-preference': { kind: 'lmarena', sourceId: 'lmarena', metricKeys: ['lmarena:text_style_control:overall'], defaultSort: 'rank-asc' },
    'media-text-to-image': { kind: 'lmarena', sourceId: 'lmarena', metricKeys: ['lmarena:text_to_image:overall'], defaultSort: 'rank-asc' },
  };
  return {
    revision: 'published-revision-1',
    publishedAt: ISO_TIME,
    freshness,
    attribution: [{ sourceId: 'benchlm', label: 'Data from BenchLM.ai', url: 'https://benchlm.ai/data', updatedAt: ISO_TIME }],
    data: { key, profile, definition: definitions[key] ?? definitions['llm-coding'], entries },
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function renderTable(
  key: LeaderboardKey = 'llm-coding',
  sort: LeaderboardSort = 'score-desc',
  entries: readonly LeaderboardEntry[] = [entry()],
) {
  const onSortChange = vi.fn();
  render(<LeaderboardTable
    keyName={key}
    entries={entries}
    sort={sort}
    onSortChange={onSortChange}
    publishedAt={ISO_TIME}
    freshness={{ status: 'fresh', checkedAt: ISO_TIME }}
    attribution={[{
      sourceId: 'benchlm',
      label: 'Data from BenchLM.ai',
      url: 'https://benchlm.ai/data',
      updatedAt: ISO_TIME,
    }]}
  />);
  return onSortChange;
}

describe('LeaderboardTable', () => {
  it('renders an accessible semantic table with nulls explicitly unavailable and source attribution', () => {
    const onSortChange = renderTable();

    const table = screen.getByRole('table', { name: 'AI coding model benchmarks' });
    expect(within(table).getByRole('columnheader', { name: 'Position' })).toHaveAttribute('scope', 'col');
    expect(within(table).getByRole('columnheader', { name: 'Model' })).toHaveAttribute('scope', 'col');
    expect(within(table).getByRole('columnheader', { name: 'Metric' })).toHaveAttribute('scope', 'col');
    expect(within(table).getByRole('columnheader', { name: 'Blended cost' })).toHaveAttribute('scope', 'col');
    expect(within(table).getByRole('columnheader', { name: 'Metric' })).toHaveAttribute('aria-sort', 'descending');
    expect(within(table).getAllByText('Unavailable').length).toBeGreaterThan(1);
    expect(screen.getByRole('link', { name: 'Data from BenchLM.ai' })).toHaveAttribute('href', 'https://benchlm.ai/data');
    expect(screen.getByLabelText('Leaderboard evidence')).toHaveTextContent('Published');
    expect(screen.getByLabelText('Leaderboard evidence')).toHaveTextContent('2026');

    fireEvent.click(within(table).getByRole('button', { name: 'Sort by metric' }));
    expect(onSortChange).toHaveBeenCalledWith('score-desc');
  });

  it('keeps separate source lenses separate and renders the same ordered rows as mobile cards', () => {
    const multiLens = entry({
      model: { ...entry().model, modelKey: 'vision-model', slug: 'vision-model', name: 'Vision Model', sourceId: 'benchlm' },
      metrics: [
        { ...entry().metric!, metricKey: 'benchlm:category:multimodal', category: 'multimodal', value: 72, sourceId: 'benchlm' },
        {
          ...entry().metric!,
          metricKey: 'lmarena:vision_style_control:overall',
          category: 'overall',
          value: 1_204,
          rank: 2,
          unit: 'arena_score',
          sourceId: 'lmarena',
          methodology: 'bradley_terry',
        },
      ],
    });
    renderTable('multimodal-vision-documents', 'score-desc', [multiLens]);

    expect(screen.getAllByText('BenchLM multimodal').length).toBeGreaterThan(1);
    expect(screen.getAllByText('LMArena vision').length).toBeGreaterThan(1);
    const cards = screen.getByRole('list', { name: 'Vision and document AI benchmark cards' });
    expect(within(cards).getAllByRole('listitem')[0]).toHaveTextContent('Vision Model');
    expect(within(cards).getAllByRole('listitem')[0]).toHaveTextContent('BenchLM multimodal');
    expect(within(cards).getAllByRole('listitem')[0]).toHaveTextContent('LMArena vision');
  });

  it.each([
    ['llm-overall', 'score-desc', 'Top Capability'],
    ['llm-coding', 'score-desc', 'Top Coding'],
    ['llm-human-preference', 'rank-asc', 'Arena Leader'],
    ['llm-value', 'pareto-score-desc', 'Value Frontier'],
  ] as const)('uses the metric-specific %s badge without a generic best label', (key, sort, badge) => {
    const ranked = key === 'llm-human-preference'
      ? entry({
        model: { ...entry().model, sourceId: 'lmarena', evidenceStatus: 'source_only' },
        metric: {
          ...entry().metric!,
          metricKey: 'lmarena:text_style_control:overall',
          sourceId: 'lmarena',
          unit: 'arena_score',
          methodology: 'bradley_terry',
          rank: 1,
        },
        sourceRank: 1,
      })
      : entry({ onValueFrontier: key === 'llm-value' });

    renderTable(key, sort, [ranked]);

    expect(screen.getAllByText(badge).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Best$/i)).not.toBeInTheDocument();
  });

  it('keeps an estimated record visibly unranked and without metric or value badges', () => {
    const estimated = entry({
      model: { ...entry().model, evidenceStatus: 'estimated', name: 'Estimated Model' },
      blendedCostPerMillion: 0.5,
      onValueFrontier: true,
    });
    renderTable('llm-value', 'pareto-score-desc', [estimated]);

    expect(screen.getAllByText('Unranked').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(1);
    expect(screen.queryByText('Value Frontier')).not.toBeInTheDocument();
    expect(screen.queryByText('BenchLM coding')).not.toBeInTheDocument();
  });
});

describe('LeaderboardFilters', () => {
  it('uses native controls for search, workload profile, sorting, and explicit estimated evidence', () => {
    const onChange = vi.fn();
    render(<LeaderboardFilters keyName="llm-value" filters={DEFAULT_FILTERS} onChange={onChange} />);

    const search = screen.getByRole('searchbox', { name: 'Search model or provider' });
    const profile = screen.getByRole('radio', { name: 'Input-heavy' });
    const sort = screen.getByRole('combobox', { name: 'Sort leaderboard' });
    const includeEstimated = screen.getByRole('checkbox', { name: 'Include estimated BenchLM models' });
    expect(profile).toHaveAttribute('type', 'radio');
    expect(sort.tagName).toBe('SELECT');

    fireEvent.change(search, { target: { value: 'provider a' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_FILTERS, query: 'provider a' });
    fireEvent.click(profile);
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_FILTERS, profile: 'inputHeavy' });
    fireEvent.change(sort, { target: { value: 'price-asc' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_FILTERS, sort: 'price-asc' });
    fireEvent.click(includeEstimated);
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_FILTERS, includeEstimated: true });
  });

  it('omits the estimated-model control on pure LMArena and pricing routes', () => {
    const { rerender } = render(<LeaderboardFilters keyName="llm-human-preference" filters={DEFAULT_FILTERS} onChange={vi.fn()} />);
    expect(screen.queryByRole('checkbox', { name: 'Include estimated BenchLM models' })).not.toBeInTheDocument();

    rerender(<LeaderboardFilters keyName="llm-pricing-context" filters={DEFAULT_FILTERS} onChange={vi.fn()} />);
    expect(screen.queryByRole('checkbox', { name: 'Include estimated BenchLM models' })).not.toBeInTheDocument();
  });

  it('preserves normalized route profile, filters, and sort state in the URL query', () => {
    const parsed = parseLeaderboardFilters(
      '?profile=outputHeavy&sort=price-asc&q=Provider%20A&estimated=1',
      'llm-value',
    );

    expect(parsed).toEqual({
      profile: 'outputHeavy',
      sort: 'price-asc',
      query: 'Provider A',
      includeEstimated: true,
    });
    expect(serializeLeaderboardFilters(parsed)).toBe('profile=outputHeavy&sort=price-asc&q=Provider+A&estimated=1');
  });

  it('filters estimated records only behind the explicit control and sorts matches deterministically', () => {
    const alpha = entry({ model: { ...entry().model, slug: 'alpha', name: 'Alpha', creator: 'Provider A' }, metric: { ...entry().metric!, value: 91 } });
    const beta = entry({ model: { ...entry().model, modelKey: 'beta', slug: 'beta', name: 'Beta', creator: 'Provider B', evidenceStatus: 'estimated' }, metric: { ...entry().metric!, modelKey: 'beta', sourceModelId: 'beta', value: 99 } });
    const filtered = visibleLeaderboardEntries([beta, alpha], { ...DEFAULT_FILTERS, query: 'provider' });

    expect(filtered.map((item) => item.model.slug)).toEqual(['alpha']);
    expect(visibleLeaderboardEntries([beta, alpha], { ...DEFAULT_FILTERS, includeEstimated: true })
      .map((item) => item.model.slug)).toEqual(['alpha', 'beta']);
  });
});

describe('leaderboard routes and honest home teasers', () => {
  it('mounts a category page from its registered route with normalized controls, attribution, related routes, and the MonoMind CTA', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(apiEnvelope('llm-coding', 'outputHeavy')));
    vi.stubGlobal('fetch', fetchMock);
    window.history.replaceState({}, '', '/leaderboards/llm/coding/?profile=outputHeavy&sort=price-asc&q=provider&estimated=1');

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'AI coding model benchmarks', level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('checkbox', { name: 'Include estimated BenchLM models' })).toBeChecked();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/benchmarks/leaderboards/llm-coding?profile=outputHeavy&limit=50&includeEstimated=1');
    expect(screen.getByRole('link', { name: 'Data from BenchLM.ai' })).toHaveAttribute('href', 'https://benchlm.ai/data');
    expect(screen.getByRole('heading', { name: 'Related leaderboards', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Talk to MonoMind' })).toHaveAttribute('href', 'https://monomind.one/');
  });

  it('shows a stale benchmark state instead of presenting stale rows as current rankings', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(apiEnvelope(
      'llm-coding',
      'balanced',
      [entry()],
      { status: 'stale', checkedAt: '2026-08-01T00:00:00.000Z', message: 'Refresh overdue.' },
    ))));
    window.history.replaceState({}, '', '/leaderboards/llm/coding/');

    render(<App />);

    expect(await screen.findByRole('status')).toHaveTextContent('Stale benchmark data');
    expect(screen.queryByRole('table', { name: 'AI coding model benchmarks' })).not.toBeInTheDocument();
  });

  it('renders the directory with registered category links without fixture rankings', () => {
    window.history.replaceState({}, '', '/leaderboards/');

    render(<App />);

    expect(screen.getByRole('heading', { name: 'AI model leaderboards', level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'AI coding model benchmarks' }).some((link) => link.getAttribute('href') === '/leaderboards/llm/coding/')).toBe(true);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('labels live llm-value rows as overall model value and keeps stale teasers unavailable', async () => {
    const fetchMock = vi.fn((input: string) => {
      if (input.includes('llm-value')) return Promise.resolve(jsonResponse(apiEnvelope('llm-value', 'balanced', [
        entry({ model: { ...entry().model, name: 'Overall Value Model' }, metric: { ...entry().metric!, metricKey: 'benchlm:overall:raw', value: 90 } }),
      ])));
      if (input.includes('llm-human-preference')) return Promise.resolve(jsonResponse(apiEnvelope('llm-human-preference', 'balanced', [
        entry({ model: { ...entry().model, name: 'Human Preference Model', sourceId: 'lmarena', evidenceStatus: 'source_only' }, metric: { ...entry().metric!, sourceId: 'lmarena', metricKey: 'lmarena:text_style_control:overall', unit: 'arena_score', methodology: 'bradley_terry', rank: 1 } }),
      ])));
      return Promise.resolve(jsonResponse(apiEnvelope(
        'media-text-to-image',
        'balanced',
        [entry({ model: { ...entry().model, name: 'Stale Image Model', sourceId: 'lmarena', evidenceStatus: 'source_only' }, metric: { ...entry().metric!, sourceId: 'lmarena', metricKey: 'lmarena:text_to_image:overall', unit: 'arena_score', methodology: 'bradley_terry', rank: 1 } })],
        { status: 'stale', checkedAt: '2026-08-01T00:00:00.000Z' },
      )));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<HomePage />);

    expect(await screen.findByRole('heading', { name: 'Overall Model Value', level: 3 })).toBeInTheDocument();
    expect(await screen.findByText(/Overall Value Model/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Coding Value', level: 3 })).not.toBeInTheDocument();
    expect(await screen.findByText(/Stale benchmark data/)).toBeInTheDocument();
    expect(screen.queryByText('Stale Image Model')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.every(([url]) => String(url).startsWith('/api/benchmarks/leaderboards/'))).toBe(true);
  });
});
