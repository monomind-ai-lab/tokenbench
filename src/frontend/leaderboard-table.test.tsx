import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
import {
  leaderboardFilterCapabilities,
  type LeaderboardQueryCapabilities,
} from './leaderboard-filter-state';
import { LeaderboardTable } from './leaderboard-table';
import '../index.css';

const ISO_TIME = '2026-08-05T12:00:00.000Z';

function entry(overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  const defaultMetric: NonNullable<LeaderboardEntry['metric']> = {
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
  };
  const metric = overrides.metric === undefined ? defaultMetric : overrides.metric;
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
    primaryPrice: null,
    blendedCostPerMillion: null,
    contextWindowTokens: null,
    sourceRank: null,
    onValueFrontier: false,
    ...overrides,
    metric,
    metrics: overrides.metrics ?? (metric === null ? [] : [{ ...metric }]),
  };
}

function primaryOpenRouterPrice(): NonNullable<LeaderboardEntry['primaryPrice']> {
  return {
    modelKey: 'model-a',
    sourceId: 'openrouter',
    providerId: 'openrouter',
    inputUsdPerMillion: 1,
    cachedInputUsdPerMillion: null,
    outputUsdPerMillion: 5,
    contextWindowTokens: 128_000,
    verificationStatus: 'primary',
    routeId: 'openrouter:model-a',
    sourceModelId: 'model-a',
    canonicalSlug: 'model-a',
    maxInputTokens: 126_000,
    maxOutputTokens: 2_000,
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportedParameters: ['temperature'],
    sourceArtifactId: 'openrouter-models',
  };
}

const DEFAULT_FILTERS: LeaderboardFilterState = {
  query: '',
  profile: 'balanced',
  priceMode: 'representative',
  metricKey: null,
  sort: 'score-desc',
  providers: [],
  sourceTypes: [],
  evidence: null,
  priceMinimum: null,
  priceMaximum: null,
  includeEstimated: false,
};

const PROFILE_FILTERS: LeaderboardFilterState = { ...DEFAULT_FILTERS, priceMode: 'profile' };

const RICH_FILTER_CAPABILITIES: LeaderboardQueryCapabilities = {
  dataReady: true,
  defaultProfile: 'balanced',
  defaultSort: 'score-desc',
  supportsProfile: false,
  supportsEstimated: true,
  supportsLifecycle: false,
  priceMode: 'representative',
  supportsPrice: true,
  priceValues: [0.125, 5, 1_000],
  metricKeys: ['benchlm:category:coding', 'benchlm:category:reasoning'],
  sorts: ['score-desc', 'price-asc'],
  providers: ['Provider A', 'Provider B'],
  sourceTypes: ['Open Weight', 'Proprietary'],
  evidenceStatuses: ['supported', 'source_only'],
};

function apiEnvelope(
  key: LeaderboardKey,
  profile: 'inputHeavy' | 'balanced' | 'outputHeavy' = 'balanced',
  entries: readonly LeaderboardEntry[] = [entry()],
  freshness: { status: 'fresh' | 'stale'; checkedAt: string; message?: string } = { status: 'fresh', checkedAt: ISO_TIME },
  completeEntries: readonly LeaderboardEntry[] = entries,
  total = entries.length,
) {
  const definitions: Partial<Record<LeaderboardKey, Record<string, unknown>>> = {
    'llm-coding': { kind: 'benchlm', sourceId: 'benchlm', metricKeys: ['benchlm:category:coding'], defaultSort: 'score-desc' },
    'llm-value': { kind: 'value', sourceId: 'benchlm', metricKeys: ['benchlm:overall:raw'], defaultSort: 'pareto-score-desc' },
    'llm-human-preference': { kind: 'lmarena', sourceId: 'lmarena', metricKeys: ['lmarena:text_style_control:overall'], defaultSort: 'rank-asc' },
    'media-text-to-image': { kind: 'lmarena', sourceId: 'lmarena', metricKeys: ['lmarena:text_to_image:overall'], defaultSort: 'rank-asc' },
  };
  const sourceAttribution = key === 'llm-human-preference' || key.startsWith('media-')
    ? { sourceId: 'lmarena', label: 'Arena ratings from LMArena', url: 'https://lmarena.ai/leaderboard', updatedAt: ISO_TIME }
    : { sourceId: 'benchlm', label: 'Data from BenchLM.ai', url: 'https://benchlm.ai/data', updatedAt: ISO_TIME };
  const attribution = key === 'llm-value'
    ? [
      sourceAttribution,
      { sourceId: 'openrouter', label: 'Catalog and pricing data from OpenRouter', url: 'https://openrouter.ai/models', updatedAt: ISO_TIME },
    ]
    : [sourceAttribution];
  return {
    revision: 'published-revision-1',
    publishedAt: ISO_TIME,
    freshness,
    attribution,
    data: {
      key,
      profile,
      definition: definitions[key] ?? definitions['llm-coding'],
      entries,
      capabilities: leaderboardFilterCapabilities(key, completeEntries),
      pagination: { limit: 50, total, nextCursor: null },
    },
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Mirrors the bounded API contract so route tests never reintroduce page-local filtering. */
function leaderboardApiResponse(
  input: string,
  key: LeaderboardKey,
  completeEntries: readonly LeaderboardEntry[],
  freshness: { status: 'fresh' | 'stale'; checkedAt: string; message?: string } = { status: 'fresh', checkedAt: ISO_TIME },
) {
  const url = new URL(input, 'https://tokenbench.test');
  const capabilities = leaderboardFilterCapabilities(key, completeEntries);
  const filters = parseLeaderboardFilters(url.search, key, completeEntries, capabilities);
  const filtered = visibleLeaderboardEntries(completeEntries, filters, key);
  const requestedLimit = Number(url.searchParams.get('limit') ?? '50');
  const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : 50;
  return jsonResponse(apiEnvelope(
    key,
    filters.profile,
    filtered.slice(0, limit),
    freshness,
    completeEntries,
    filtered.length,
  ));
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
  />);
  return onSortChange;
}

describe('LeaderboardTable', () => {
  it('renders an accessible semantic table with nulls explicitly unavailable without duplicating provenance', () => {
    const onSortChange = renderTable();

    const table = screen.getByRole('table', { name: 'Coding benchmark' });
    expect(within(table).getByRole('columnheader', { name: 'Position' })).toHaveAttribute('scope', 'col');
    expect(within(table).getByRole('columnheader', { name: 'Model' })).toHaveAttribute('scope', 'col');
    expect(within(table).getByRole('columnheader', { name: 'Metric' })).toHaveAttribute('scope', 'col');
    expect(within(table).getByRole('columnheader', { name: 'Blended cost' })).toHaveAttribute('scope', 'col');
    expect(within(table).getByRole('columnheader', { name: 'Metric' })).toHaveAttribute('aria-sort', 'descending');
    expect(within(table).getAllByText('Unavailable').length).toBeGreaterThan(1);
    expect(screen.queryByRole('link', { name: 'Data from BenchLM.ai' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Leaderboard evidence')).not.toBeInTheDocument();

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

    const metricSort = screen.getByRole('button', { name: 'Use source lens order' });
    expect(metricSort.closest('th')).toHaveAttribute('aria-sort', 'other');
    expect(screen.getAllByText('BenchLM multimodal').length).toBeGreaterThan(1);
    expect(screen.getAllByText('LMArena vision').length).toBeGreaterThan(1);
    const cards = document.querySelector<HTMLOListElement>('.leaderboard-card-list');
    expect(cards).not.toBeNull();
    const cardRows = within(cards!).getAllByRole('listitem', { hidden: true });
    expect(cardRows[0]).toHaveTextContent('Vision Model');
    expect(cardRows[0]).toHaveTextContent('BenchLM multimodal');
    expect(cardRows[0]).toHaveTextContent('LMArena vision');
  });

  it('keeps a provider mark and its textual label in equivalent desktop and mobile model rows', () => {
    renderTable('llm-coding', 'score-desc', [entry({
      model: { ...entry().model, creator: 'OpenAI' },
    })]);

    const table = screen.getByRole('table', { name: 'Coding benchmark' });
    const cards = document.querySelector<HTMLOListElement>('.leaderboard-card-list');
    expect(cards).not.toBeNull();
    expect(within(table).getByText('OpenAI')).toBeInTheDocument();
    expect(within(cards!).getByText('OpenAI')).toBeInTheDocument();
    expect(table.querySelectorAll('.provider-mark')).toHaveLength(1);
    expect(cards!.querySelectorAll('.provider-mark')).toHaveLength(1);
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

  it.each([
    ['llm-reasoning', 'benchlm:category:reasoning', 'reasoning', 'BenchLM reasoning', 'Top Reasoning'],
    ['llm-knowledge', 'benchlm:category:knowledge', 'knowledge', 'BenchLM knowledge', 'Top Knowledge'],
  ] as const)('uses semantic category-lens labels and a specific top badge for %s', (key, metricKey, category, label, badge) => {
    const metric = {
      ...entry().metric!,
      metricKey,
      category,
    };

    renderTable(key, 'score-desc', [entry({ metric, metrics: [metric] })]);

    expect(screen.getAllByText(label).length).toBeGreaterThan(1);
    expect(screen.getAllByText(badge).length).toBeGreaterThan(0);
    expect(screen.queryByText('Top Capability')).not.toBeInTheDocument();
    expect(screen.queryByText(/BenchAlign/i)).not.toBeInTheDocument();
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

  it('describes the default Pareto order when it cannot truthfully be assigned to one column', () => {
    renderTable('llm-value', 'pareto-score-desc', [entry({ onValueFrontier: true })]);

    const table = screen.getByRole('table', { name: 'Value frontier' });
    expect(table).toHaveAttribute('aria-describedby', 'leaderboard-order-llm-value');
    expect(screen.getByText('Current order: value-frontier entries first, then metric score descending, blended cost ascending, and canonical model slug.'))
      .toHaveAttribute('id', 'leaderboard-order-llm-value');
  });

  it('does not expose table-header sort controls that the route data cannot support', () => {
    const capabilities = leaderboardFilterCapabilities('llm-coding', [entry()]);
    const CapabilityTable = LeaderboardTable as unknown as (props: {
      readonly keyName: LeaderboardKey;
      readonly entries: readonly LeaderboardEntry[];
      readonly sort: LeaderboardSort;
      readonly onSortChange: (sort: LeaderboardSort) => void;
      readonly capabilities: typeof capabilities;
    }) => ReturnType<typeof LeaderboardTable>;

    render(<CapabilityTable
      keyName="llm-coding"
      entries={[entry()]}
      sort="score-desc"
      onSortChange={vi.fn()}
      capabilities={capabilities}
    />);

    expect(screen.getByRole('button', { name: 'Sort by metric' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sort by position' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sort by blended cost' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sort by context window' })).not.toBeInTheDocument();
  });
});

describe('LeaderboardFilters', () => {
  it('renders the approved common rows before supplementary controls', () => {
    const { container } = render(<LeaderboardFilters
      keyName="llm-coding"
      filters={DEFAULT_FILTERS}
      onChange={vi.fn()}
      capabilities={RICH_FILTER_CAPABILITIES}
    />);

    const rows = [...container.querySelectorAll('.leaderboard-filters > [class*="leaderboard-filter-"]')]
      .map((element) => element.className);
    expect(rows).toEqual([
      'leaderboard-filter-search-row',
      'leaderboard-filter-selector-row',
      'leaderboard-filter-provider-row',
      'leaderboard-filter-range-row',
      'leaderboard-filter-supplementary-row',
    ]);
    const rangeRow = container.querySelector('.leaderboard-filter-range-row');
    const supplementaryRow = container.querySelector('.leaderboard-filter-supplementary-row');
    const estimated = screen.getByRole('checkbox', { name: 'Include estimated models' });
    expect(estimated.closest('.leaderboard-filter-range-row')).toBe(rangeRow);
    expect(estimated.closest('.leaderboard-filter-supplementary-row')).toBeNull();
    expect(screen.getByRole('group', { name: 'Source type' }).closest('.leaderboard-filter-supplementary-row'))
      .toBe(supplementaryRow);
  });

  it('uses human metric labels while preserving canonical option values', () => {
    render(<LeaderboardFilters
      keyName="llm-coding"
      filters={DEFAULT_FILTERS}
      onChange={vi.fn()}
      capabilities={RICH_FILTER_CAPABILITIES}
    />);

    expect(screen.getByRole('option', { name: 'Coding' })).toHaveValue('benchlm:category:coding');
    expect(screen.queryByText('benchlm:category:coding')).not.toBeInTheDocument();
  });

  it('exposes providers as pressed toggle buttons and preserves sorted OR state', () => {
    const onChange = vi.fn();
    render(<LeaderboardFilters
      keyName="llm-coding"
      filters={{ ...DEFAULT_FILTERS, providers: ['Provider B'] }}
      onChange={onChange}
      capabilities={RICH_FILTER_CAPABILITIES}
    />);

    const providerA = screen.getByRole('button', { name: 'Provider A' });
    const providerB = screen.getByRole('button', { name: 'Provider B' });
    expect(providerA).toHaveAttribute('aria-pressed', 'false');
    expect(providerB).toHaveAttribute('aria-pressed', 'true');
    expect(providerB.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(providerB.firstElementChild?.tagName).toBe('svg');
    fireEvent.click(providerA);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      providers: ['Provider A', 'Provider B'],
    }));
  });

  it('clamps range handles and clears both bounds at the full endpoints', () => {
    const onChange = vi.fn();
    const { rerender } = render(<LeaderboardFilters
      keyName="llm-coding"
      filters={{ ...DEFAULT_FILTERS, priceMinimum: 3, priceMaximum: 900 }}
      onChange={onChange}
      capabilities={RICH_FILTER_CAPABILITIES}
    />);

    const minimum = screen.getByRole('slider', { name: 'Minimum price per 1M tokens' });
    fireEvent.change(minimum, { target: { value: '4' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      priceMinimum: 900,
      priceMaximum: 900,
    }));
    fireEvent.change(minimum, { target: { value: '0' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      priceMinimum: null,
      priceMaximum: 900,
    }));

    rerender(<LeaderboardFilters
      keyName="llm-coding"
      filters={{ ...DEFAULT_FILTERS, priceMinimum: null, priceMaximum: 900 }}
      onChange={onChange}
      capabilities={RICH_FILTER_CAPABILITIES}
    />);
    fireEvent.change(screen.getByRole('slider', { name: 'Maximum price per 1M tokens' }), {
      target: { value: '3' },
    });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      priceMinimum: null,
      priceMaximum: null,
    }));
  });

  it('uses source-neutral estimated copy', () => {
    render(<LeaderboardFilters
      keyName="llm-coding"
      filters={DEFAULT_FILTERS}
      onChange={vi.fn()}
      capabilities={RICH_FILTER_CAPABILITIES}
    />);

    expect(screen.getByRole('checkbox', { name: 'Include estimated models' })).toBeInTheDocument();
    expect(screen.getByText('Estimated entries stay unranked and do not receive leader badges.')).toBeInTheDocument();
    expect(screen.queryByText(/BenchLM/i)).not.toBeInTheDocument();
  });

  it('shows one published price without sliders and omits an unavailable price fieldset', () => {
    const { rerender } = render(<LeaderboardFilters
      keyName="llm-coding"
      filters={DEFAULT_FILTERS}
      onChange={vi.fn()}
      capabilities={{ ...RICH_FILTER_CAPABILITIES, priceValues: [2] }}
    />);

    const priceFieldset = screen.getByRole('group', { name: 'Price per 1M' });
    expect(within(priceFieldset).queryAllByRole('slider')).toHaveLength(0);
    expect(within(priceFieldset).getByText('$2.00').tagName).toBe('OUTPUT');

    rerender(<LeaderboardFilters
      keyName="llm-coding"
      filters={DEFAULT_FILTERS}
      onChange={vi.fn()}
      capabilities={{ ...RICH_FILTER_CAPABILITIES, supportsPrice: false, priceValues: [] }}
    />);
    expect(screen.queryByRole('group', { name: 'Price per 1M' })).not.toBeInTheDocument();
  });

  it('orders Sort before Evidence when there is no Metric lens selector', () => {
    const { container } = render(<LeaderboardFilters
      keyName="llm-coding"
      filters={DEFAULT_FILTERS}
      onChange={vi.fn()}
      capabilities={{ ...RICH_FILTER_CAPABILITIES, metricKeys: ['benchlm:category:coding'] }}
    />);

    const selectorRow = container.querySelector('.leaderboard-filter-selector-row');
    expect(selectorRow).not.toBeNull();
    expect([...selectorRow!.children].map((control) => control.querySelector('span')?.textContent))
      .toEqual(['Sort leaderboard', 'Evidence']);
  });

  it('keeps Workload profile and Source type in the final supplementary row', () => {
    const { container } = render(<LeaderboardFilters
      keyName="llm-value"
      filters={PROFILE_FILTERS}
      onChange={vi.fn()}
      capabilities={{ ...RICH_FILTER_CAPABILITIES, supportsProfile: true, priceMode: 'profile' }}
    />);

    const supplementaryRow = container.querySelector('.leaderboard-filter-supplementary-row');
    expect(supplementaryRow).not.toBeNull();
    expect(screen.getByRole('group', { name: 'Workload profile' }).closest('.leaderboard-filter-supplementary-row'))
      .toBe(supplementaryRow);
    expect(screen.getByRole('group', { name: 'Source type' }).closest('.leaderboard-filter-supplementary-row'))
      .toBe(supplementaryRow);
    expect(supplementaryRow).toBe(container.querySelector('.leaderboard-filters')?.lastElementChild);
  });

  it('keeps only request-defining controls available while capabilities load', () => {
    const loadingCapabilities: LeaderboardQueryCapabilities = {
      ...RICH_FILTER_CAPABILITIES,
      dataReady: false,
      supportsPrice: null,
      priceValues: null,
      providers: null,
      sourceTypes: null,
      evidenceStatuses: null,
    };
    render(<LeaderboardFilters
      keyName="llm-coding"
      filters={DEFAULT_FILTERS}
      onChange={vi.fn()}
      capabilities={loadingCapabilities}
    />);

    expect(screen.getByRole('searchbox', { name: 'Search model or provider' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Include estimated models' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Providers' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Price per 1M' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Metric lens' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Sort leaderboard' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Evidence' })).not.toBeInTheDocument();
  });

  it('uses native controls for search, workload profile, sorting, and explicit estimated evidence', () => {
    const onChange = vi.fn();
    render(<LeaderboardFilters
      keyName="llm-value"
      filters={PROFILE_FILTERS}
      onChange={onChange}
      capabilities={{ ...RICH_FILTER_CAPABILITIES, supportsProfile: true, priceMode: 'profile' }}
    />);

    const search = screen.getByRole('searchbox', { name: 'Search model or provider' });
    const profile = screen.getByRole('radio', { name: 'Input-heavy' });
    const sort = screen.getByRole('combobox', { name: 'Sort leaderboard' });
    const includeEstimated = screen.getByRole('checkbox', { name: 'Include estimated models' });
    expect(profile).toHaveAttribute('type', 'radio');
    expect(sort.tagName).toBe('SELECT');

    fireEvent.change(search, { target: { value: 'provider a' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...PROFILE_FILTERS, query: 'provider a' });
    fireEvent.click(profile);
    expect(onChange).toHaveBeenLastCalledWith({ ...PROFILE_FILTERS, profile: 'inputHeavy' });
    fireEvent.change(sort, { target: { value: 'price-asc' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...PROFILE_FILTERS, sort: 'price-asc' });
    fireEvent.click(includeEstimated);
    expect(onChange).toHaveBeenLastCalledWith({ ...PROFILE_FILTERS, includeEstimated: true });
  });

  it('omits the estimated-model control on pure LMArena and pricing routes', () => {
    const { rerender } = render(<LeaderboardFilters keyName="llm-human-preference" filters={DEFAULT_FILTERS} onChange={vi.fn()} />);
    expect(screen.queryByRole('checkbox', { name: 'Include estimated models' })).not.toBeInTheDocument();

    rerender(<LeaderboardFilters keyName="llm-pricing-context" filters={DEFAULT_FILTERS} onChange={vi.fn()} />);
    expect(screen.queryByRole('checkbox', { name: 'Include estimated models' })).not.toBeInTheDocument();
  });

  it('preserves normalized route profile, filters, and sort state in the URL query', () => {
    const parsed = parseLeaderboardFilters(
      '?profile=outputHeavy&sort=price-asc&q=Provider%20A&estimated=1',
      'llm-value',
    );

    expect(parsed).toEqual({
      profile: 'outputHeavy',
      priceMode: 'profile',
      sort: 'price-asc',
      query: 'Provider A',
      metricKey: null,
      providers: [],
      sourceTypes: [],
      evidence: null,
      priceMinimum: null,
      priceMaximum: null,
      includeEstimated: true,
    });
    expect(serializeLeaderboardFilters(parsed)).toBe('profile=outputHeavy&sort=price-asc&q=Provider+A&estimated=1');
  });

  it('filters estimated records only behind the explicit control and sorts matches deterministically', () => {
    const alpha = entry({ model: { ...entry().model, slug: 'alpha', name: 'Alpha', creator: 'Provider A' }, metric: { ...entry().metric!, value: 91 } });
    const beta = entry({ model: { ...entry().model, modelKey: 'beta', slug: 'beta', name: 'Beta', creator: 'Provider B', evidenceStatus: 'estimated' }, metric: { ...entry().metric!, modelKey: 'beta', sourceModelId: 'beta', value: 99 } });
    const filtered = visibleLeaderboardEntries([beta, alpha], { ...DEFAULT_FILTERS, query: 'provider' }, 'llm-coding');

    expect(filtered.map((item) => item.model.slug)).toEqual(['alpha']);
    expect(visibleLeaderboardEntries([beta, alpha], { ...DEFAULT_FILTERS, includeEstimated: true }, 'llm-coding')
      .map((item) => item.model.slug)).toEqual(['alpha', 'beta']);
  });

  it('preserves Task 10 lens-group order for the multimodal default instead of comparing raw source scales', () => {
    const benchLm = entry({
      model: { ...entry().model, modelKey: 'benchlm-model', slug: 'benchlm-model' },
      metric: {
        ...entry().metric!,
        modelKey: 'benchlm-model',
        sourceModelId: 'benchlm-model',
        metricKey: 'benchlm:category:multimodal',
        category: 'multimodal',
        value: 70,
      },
    });
    const vision = entry({
      model: {
        ...entry().model,
        modelKey: 'vision-model',
        slug: 'vision-model',
        sourceId: 'lmarena',
        evidenceStatus: 'source_only',
      },
      metric: {
        ...entry().metric!,
        modelKey: 'vision-model',
        sourceModelId: 'vision-model',
        metricKey: 'lmarena:vision_style_control:overall',
        value: 1_200,
        rank: 2,
        unit: 'arena_score',
        sourceId: 'lmarena',
        methodology: 'bradley_terry',
      },
      sourceRank: 2,
    });
    const document = entry({
      model: {
        ...entry().model,
        modelKey: 'document-model',
        slug: 'document-model',
        sourceId: 'lmarena',
        evidenceStatus: 'source_only',
      },
      metric: {
        ...entry().metric!,
        modelKey: 'document-model',
        sourceModelId: 'document-model',
        metricKey: 'lmarena:document_style_control:overall',
        value: 1_100,
        rank: 1,
        unit: 'arena_score',
        sourceId: 'lmarena',
        methodology: 'bradley_terry',
      },
      sourceRank: 1,
    });

    expect(visibleLeaderboardEntries(
      [benchLm, vision, document],
      DEFAULT_FILTERS,
      'multimodal-vision-documents',
    ).map((item) => item.model.slug)).toEqual(['benchlm-model', 'vision-model', 'document-model']);
  });

  it('labels the multimodal default sort as source lens order', () => {
    render(<LeaderboardFilters
      keyName="multimodal-vision-documents"
      filters={DEFAULT_FILTERS}
      onChange={vi.fn()}
      capabilities={{
        ...RICH_FILTER_CAPABILITIES,
        metricKeys: [
          'benchlm:category:multimodal',
          'lmarena:vision_style_control:overall',
          'lmarena:document_style_control:overall',
        ],
        sorts: ['score-desc', 'rank-asc'],
      }}
    />);

    expect(screen.getByRole('option', { name: 'Source lens order' })).toBeInTheDocument();
  });

  it('applies provider, source, evidence, price, and metric filters before deterministic sorting', () => {
    const alpha = entry({
      model: {
        ...entry().model,
        modelKey: 'alpha',
        slug: 'alpha',
        name: 'Alpha',
        creator: 'Provider A',
        sourceType: 'Open Weight',
      },
      metric: { ...entry().metric!, modelKey: 'alpha', sourceModelId: 'alpha', value: 91 },
      primaryPrice: { ...primaryOpenRouterPrice(), modelKey: 'alpha', sourceModelId: 'alpha', canonicalSlug: 'alpha' },
      blendedCostPerMillion: 2,
    });
    const beta = entry({
      model: {
        ...entry().model,
        modelKey: 'beta',
        slug: 'beta',
        name: 'Beta',
        creator: 'Provider B',
      },
      metric: { ...entry().metric!, modelKey: 'beta', sourceModelId: 'beta', value: 99 },
      primaryPrice: { ...primaryOpenRouterPrice(), modelKey: 'beta', sourceModelId: 'beta', canonicalSlug: 'beta' },
      blendedCostPerMillion: 2,
    });
    const sourceOnly = entry({
      model: {
        ...entry().model,
        modelKey: 'source-only',
        slug: 'source-only',
        name: 'Source only',
        creator: 'Provider A',
        evidenceStatus: 'source_only',
      },
      metric: { ...entry().metric!, modelKey: 'source-only', sourceModelId: 'source-only', value: 100 },
      primaryPrice: { ...primaryOpenRouterPrice(), modelKey: 'source-only', sourceModelId: 'source-only', canonicalSlug: 'source-only' },
      blendedCostPerMillion: 1,
    });

    const filters = {
      ...DEFAULT_FILTERS,
      metricKey: 'benchlm:category:coding',
      providers: ['Provider A'],
      sourceTypes: ['Open Weight'],
      evidence: 'supported',
      priceMinimum: 0,
      priceMaximum: 5,
    } as unknown as LeaderboardFilterState;

    expect(visibleLeaderboardEntries([beta, sourceOnly, alpha], filters, 'llm-value').map((item) => item.model.slug))
      .toEqual(['alpha']);
  });

  it('uses the fixed 50/50 representative primary price outside value and pricing routes', () => {
    const representativeOnly = entry({
      model: { ...entry().model, modelKey: 'representative', slug: 'representative' },
      metric: { ...entry().metric!, modelKey: 'representative', sourceModelId: 'representative' },
      primaryPrice: {
        ...primaryOpenRouterPrice(),
        modelKey: 'representative',
        sourceModelId: 'representative',
        canonicalSlug: 'representative',
        inputUsdPerMillion: 1,
        outputUsdPerMillion: 9,
      },
      blendedCostPerMillion: null,
    });
    const filters = {
      ...DEFAULT_FILTERS,
      priceMinimum: 5,
      priceMaximum: 5,
    } as unknown as LeaderboardFilterState;

    expect(visibleLeaderboardEntries([representativeOnly], filters, 'llm-coding').map((item) => [item.model.slug, item.blendedCostPerMillion]))
      .toEqual([['representative', 5]]);
  });

  it('omits profile controls and normalizes a hidden non-default profile on non-pricing routes', () => {
    render(<LeaderboardFilters keyName="llm-coding" filters={{ ...DEFAULT_FILTERS, profile: 'outputHeavy' }} onChange={vi.fn()} />);

    expect(screen.queryByRole('radio', { name: 'Input-heavy' })).not.toBeInTheDocument();
    expect(parseLeaderboardFilters('?profile=outputHeavy&sort=score-desc', 'llm-coding')).toMatchObject({
      profile: 'balanced',
      sort: 'score-desc',
    });
  });

  it('renders only controls supported by the current route data and updates CSV-backed selections', () => {
    const alpha = entry({
      model: { ...entry().model, modelKey: 'alpha', slug: 'alpha', creator: 'Provider A', sourceType: 'Open Weight' },
      metric: { ...entry().metric!, modelKey: 'alpha', sourceModelId: 'alpha' },
      primaryPrice: { ...primaryOpenRouterPrice(), modelKey: 'alpha', sourceModelId: 'alpha', canonicalSlug: 'alpha' },
      blendedCostPerMillion: null,
    });
    const beta = entry({
      model: { ...entry().model, modelKey: 'beta', slug: 'beta', creator: 'Provider B' },
      metric: { ...entry().metric!, modelKey: 'beta', sourceModelId: 'beta' },
      primaryPrice: { ...primaryOpenRouterPrice(), modelKey: 'beta', sourceModelId: 'beta', canonicalSlug: 'beta' },
      blendedCostPerMillion: null,
    });
    const capabilities = leaderboardFilterCapabilities('llm-coding', [alpha, beta]);
    const onChange = vi.fn();
    const RichFilters = LeaderboardFilters as unknown as (props: {
      readonly keyName: LeaderboardKey;
      readonly filters: LeaderboardFilterState;
      readonly onChange: (filters: LeaderboardFilterState) => void;
      readonly capabilities: typeof capabilities;
    }) => ReturnType<typeof LeaderboardFilters>;

    render(<RichFilters
      keyName="llm-coding"
      filters={{ ...DEFAULT_FILTERS, metricKey: null, providers: [], sourceTypes: [], evidence: null, priceMinimum: null, priceMaximum: null } as unknown as LeaderboardFilterState}
      onChange={onChange}
      capabilities={capabilities}
    />);

    expect(screen.getByRole('group', { name: 'Providers' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Source type' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Evidence' })).toBeInTheDocument();
    const priceFieldset = screen.getByRole('group', { name: 'Price per 1M' });
    expect(within(priceFieldset).queryByRole('slider')).not.toBeInTheDocument();
    expect(within(priceFieldset).getByText('$3.00').tagName).toBe('OUTPUT');
    expect(screen.queryByRole('radio', { name: 'Input-heavy' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Lifecycle' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Source rank' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Provider B' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ providers: ['Provider B'] }));
  });

  it('keeps a long unbroken provider label accessible from its toggle button', () => {
    const longProvider = 'ProviderWithAnExtremelyLongUnbrokenDisplayName';
    const longEntry = entry({ model: { ...entry().model, creator: longProvider } });
    const otherEntry = entry({
      model: { ...entry().model, modelKey: 'other', slug: 'other', creator: 'Provider A' },
      metric: { ...entry().metric!, modelKey: 'other', sourceModelId: 'other' },
    });

    render(<LeaderboardFilters
      keyName="llm-coding"
      filters={DEFAULT_FILTERS}
      onChange={vi.fn()}
      capabilities={leaderboardFilterCapabilities('llm-coding', [longEntry, otherEntry])}
    />);

    expect(screen.getByRole('button', { name: longProvider })).toHaveTextContent(longProvider);
  });
});

describe('leaderboard routes and the Home decision snapshot', () => {
  it('mounts a category page from its registered route with normalized controls, attribution, related routes, and the MonoMind CTA', async () => {
    const entries = [entry()];
    const fetchMock = vi.fn((input: string) => Promise.resolve(leaderboardApiResponse(input, 'llm-coding', entries)));
    vi.stubGlobal('fetch', fetchMock);
    window.history.replaceState({}, '', '/leaderboards/llm/coding/?profile=outputHeavy&sort=price-asc&q=provider&estimated=1');

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Coding benchmark', level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('checkbox', { name: 'Include estimated models' })).toBeChecked();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/benchmarks/leaderboards/llm-coding?profile=balanced&sort=score-desc&q=provider&estimated=1&limit=50');
    expect(within(screen.getByLabelText('Published leaderboard evidence')).getByRole('link', { name: 'Data from BenchLM.ai' })).toHaveAttribute('href', 'https://benchlm.ai/data');
    expect(screen.getByRole('heading', { name: 'Related leaderboards', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Talk to MonoMind' })).toHaveAttribute('href', 'https://monomind.one/');
  });

  it('restores and canonically replaces a shared query without exposing unsupported controls', async () => {
    const alpha = entry({
      model: { ...entry().model, modelKey: 'alpha', slug: 'alpha', name: 'Alpha', creator: 'Provider A', sourceType: 'Open Weight' },
      metric: { ...entry().metric!, modelKey: 'alpha', sourceModelId: 'alpha', value: 90 },
      primaryPrice: null,
      blendedCostPerMillion: null,
    });
    const beta = entry({
      model: { ...entry().model, modelKey: 'beta', slug: 'beta', name: 'Beta', creator: 'Provider B' },
      metric: { ...entry().metric!, modelKey: 'beta', sourceModelId: 'beta', value: 80 },
      primaryPrice: null,
      blendedCostPerMillion: null,
    });
    vi.stubGlobal('fetch', vi.fn((input: string) => Promise.resolve(leaderboardApiResponse(input, 'llm-coding', [alpha, beta]))));
    window.history.replaceState({}, '', '/leaderboards/llm/coding/?utm_source=newsletter&profile=outputHeavy&provider=Provider+B');
    const replaceState = vi.spyOn(window.history, 'replaceState');

    render(<App />);

    expect(await screen.findByRole('group', { name: 'Providers' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Provider B' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('radio', { name: 'Input-heavy' })).not.toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: 'Minimum price per 1M tokens' })).not.toBeInTheDocument();
    await waitFor(() => expect(window.location.search).toBe('?profile=balanced&sort=score-desc&provider=Provider+B'));

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search model or provider' }), { target: { value: 'alpha' } });
    await waitFor(() => expect(window.location.search).toBe('?profile=balanced&sort=score-desc&q=alpha&provider=Provider+B'));
    expect(replaceState).toHaveBeenCalled();
    replaceState.mockRestore();
  });

  it('preserves a supported data-dependent sort until route capabilities load and when the URL is reopened', async () => {
    const alpha = entry({
      model: { ...entry().model, modelKey: 'alpha', slug: 'alpha', name: 'Alpha', contextWindowTokens: 32_000 },
      metric: { ...entry().metric!, modelKey: 'alpha', sourceModelId: 'alpha', value: 99 },
      contextWindowTokens: 32_000,
    });
    const beta = entry({
      model: { ...entry().model, modelKey: 'beta', slug: 'beta', name: 'Beta', contextWindowTokens: 128_000 },
      metric: { ...entry().metric!, modelKey: 'beta', sourceModelId: 'beta', value: 80 },
      contextWindowTokens: 128_000,
    });
    let resolveResponse: ((response: Response) => void) | undefined;
    let pendingRequest = '';
    let firstRequest = true;
    vi.stubGlobal('fetch', vi.fn((input: string) => {
      if (!firstRequest) return Promise.resolve(leaderboardApiResponse(input, 'llm-coding', [alpha, beta]));
      firstRequest = false;
      return new Promise<Response>((resolve) => {
        pendingRequest = input;
        resolveResponse = resolve;
      });
    }));
    window.history.replaceState({}, '', '/leaderboards/llm/coding/?profile=balanced&sort=context-desc');

    const firstRender = render(<App />);

    expect(window.location.search).toBe('?profile=balanced&sort=context-desc');
    resolveResponse?.(leaderboardApiResponse(pendingRequest, 'llm-coding', [alpha, beta]));
    const firstTable = await screen.findByRole('table', { name: 'Coding benchmark' });
    await waitFor(() => expect(within(firstTable).getAllByRole('row')[1]).toHaveTextContent('Beta'));
    expect(window.location.search).toBe('?profile=balanced&sort=context-desc');

    firstRender.unmount();
    vi.stubGlobal('fetch', vi.fn((input: string) => Promise.resolve(leaderboardApiResponse(input, 'llm-coding', [alpha, beta]))));
    render(<App />);

    const reopened = await screen.findByRole('table', { name: 'Coding benchmark' });
    await waitFor(() => expect(within(reopened).getAllByRole('row')[1]).toHaveTextContent('Beta'));
    expect(window.location.search).toBe('?profile=balanced&sort=context-desc');
  });

  it('applies canonical popstate query, profile, controls, and rows without a replace loop', async () => {
    const valueEntry = (
      modelKey: string,
      name: string,
      creator: string,
      profile: 'balanced' | 'outputHeavy',
    ) => {
      const inputUsdPerMillion = modelKey === 'alpha' ? 1 : 3;
      const outputUsdPerMillion = modelKey === 'alpha' ? 5 : 1;
      const blendedCostPerMillion = profile === 'balanced'
        ? inputUsdPerMillion * 0.75 + outputUsdPerMillion * 0.25
        : (inputUsdPerMillion + outputUsdPerMillion) / 2;
      return entry({
        model: { ...entry().model, modelKey, slug: modelKey, name, creator },
        metric: { ...entry().metric!, modelKey, sourceModelId: modelKey, metricKey: 'benchlm:overall:raw', category: 'overall' },
        primaryPrice: {
          ...primaryOpenRouterPrice(),
          modelKey,
          sourceModelId: modelKey,
          canonicalSlug: modelKey,
          inputUsdPerMillion,
          outputUsdPerMillion,
        },
        blendedCostPerMillion,
        contextWindowTokens: 128_000,
        onValueFrontier: true,
      });
    };
    const fetchMock = vi.fn((input: string) => {
      const profile = String(input).includes('profile=outputHeavy') ? 'outputHeavy' : 'balanced';
      const completeEntries = [
        valueEntry('alpha', 'Alpha', 'Provider A', profile),
        valueEntry('beta', 'Beta', 'Provider B', profile),
      ];
      return Promise.resolve(leaderboardApiResponse(input, 'llm-value', completeEntries));
    });
    vi.stubGlobal('fetch', fetchMock);
    window.history.replaceState({}, '', '/leaderboards/llm/value/?profile=balanced&sort=pareto-score-desc');
    const replaceState = vi.spyOn(window.history, 'replaceState');

    render(<App />);
    expect(await screen.findByRole('group', { name: 'Providers' })).toBeInTheDocument();
    replaceState.mockClear();

    window.history.pushState({}, '', '/leaderboards/llm/value/?profile=outputHeavy&sort=price-asc&q=Beta&provider=Provider+B');
    window.dispatchEvent(new PopStateEvent('popstate'));

    await waitFor(() => expect(screen.getByRole('radio', { name: 'Output-heavy' })).toBeChecked());
    expect(screen.getByRole('searchbox', { name: 'Search model or provider' })).toHaveValue('Beta');
    expect(screen.getByRole('button', { name: 'Provider B' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findAllByText('Beta')).toHaveLength(2);
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.at(-1)?.[0]).toContain('profile=outputHeavy');
    expect(replaceState).not.toHaveBeenCalled();
    replaceState.mockRestore();
  });

  it('removes its popstate listener when the leaderboard page unmounts', async () => {
    vi.stubGlobal('fetch', vi.fn((input: string) => Promise.resolve(leaderboardApiResponse(input, 'llm-coding', [entry()]))));
    window.history.replaceState({}, '', '/leaderboards/llm/coding/');
    const addEventListener = vi.spyOn(window, 'addEventListener');
    const removeEventListener = vi.spyOn(window, 'removeEventListener');

    const mounted = render(<App />);
    await screen.findByRole('table', { name: 'Coding benchmark' });
    const popstateListener = addEventListener.mock.calls.find(([type]) => type === 'popstate')?.[1];

    expect(popstateListener).toBeTypeOf('function');
    mounted.unmount();
    expect(removeEventListener).toHaveBeenCalledWith('popstate', popstateListener);
    addEventListener.mockRestore();
    removeEventListener.mockRestore();
  });

  it('restores a provider name containing a comma without splitting the value', async () => {
    const incorporated = entry({
      model: { ...entry().model, modelKey: 'inc', slug: 'inc', name: 'Incorporated Model', creator: 'Provider, Inc.' },
      metric: { ...entry().metric!, modelKey: 'inc', sourceModelId: 'inc' },
    });
    const other = entry({
      model: { ...entry().model, modelKey: 'other', slug: 'other', name: 'Other Model', creator: 'Provider A' },
      metric: { ...entry().metric!, modelKey: 'other', sourceModelId: 'other' },
    });
    vi.stubGlobal('fetch', vi.fn((input: string) => Promise.resolve(leaderboardApiResponse(input, 'llm-coding', [incorporated, other]))));
    window.history.replaceState({}, '', '/leaderboards/llm/coding/?profile=balanced&sort=score-desc&provider=Provider%2C+Inc.');

    render(<App />);

    expect(await screen.findByRole('button', { name: 'Provider, Inc.' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(screen.getAllByText('Incorporated Model')).toHaveLength(2));
    await waitFor(() => expect(screen.queryAllByText('Other Model')).toHaveLength(0));
    expect(window.location.search).toBe('?profile=balanced&sort=score-desc&provider=Provider%2C+Inc.');
  });

  it('shows cached stale rows with an explicit freshness warning', async () => {
    vi.stubGlobal('fetch', vi.fn((input: string) => Promise.resolve(leaderboardApiResponse(
      input,
      'llm-coding',
      [entry()],
      { status: 'stale', checkedAt: '2026-08-01T00:00:00.000Z', message: 'Refresh overdue.' },
    ))));
    window.history.replaceState({}, '', '/leaderboards/llm/coding/');

    render(<App />);

    expect(await screen.findByRole('status')).toHaveTextContent('Stale benchmark data');
    expect(screen.getByRole('table', { name: 'Coding benchmark' })).toBeInTheDocument();
    expect(screen.getAllByText('Model A')).toHaveLength(2);
  });

  it('keeps stale envelope metadata, source links, and cached rows visible together', async () => {
    vi.stubGlobal('fetch', vi.fn((input: string) => Promise.resolve(leaderboardApiResponse(
      input,
      'llm-coding',
      [entry()],
      { status: 'stale', checkedAt: '2026-08-01T00:00:00.000Z', message: 'Refresh overdue.' },
    ))));
    window.history.replaceState({}, '', '/leaderboards/llm/coding/');

    render(<App />);

    const evidence = await screen.findByLabelText('Published leaderboard evidence');
    expect(evidence).toHaveTextContent('Published');
    expect(evidence).toHaveTextContent('Checked');
    expect(evidence).toHaveTextContent('Stale');
    expect(evidence).toHaveTextContent('2026');
    expect(within(evidence).getByRole('link', { name: 'Data from BenchLM.ai' })).toHaveAttribute('href', 'https://benchlm.ai/data');
    expect(screen.getByRole('table', { name: 'Coding benchmark' })).toBeInTheDocument();
    expect(screen.getAllByText('Model A')).toHaveLength(2);
  });

  it('keeps ready revision evidence visible when filters match zero rows', async () => {
    vi.stubGlobal('fetch', vi.fn((input: string) => Promise.resolve(leaderboardApiResponse(input, 'llm-coding', [entry()]))));
    window.history.replaceState({}, '', '/leaderboards/llm/coding/?q=no-such-model');

    render(<App />);

    expect(await screen.findByRole('status')).toHaveTextContent('No published entries match these filters');
    const evidence = screen.getByLabelText('Published leaderboard evidence');
    expect(evidence).toHaveTextContent('Published');
    expect(evidence).toHaveTextContent('Checked');
    expect(evidence).toHaveTextContent('Fresh');
    expect(evidence).toHaveTextContent('2026');
    expect(within(evidence).getByRole('link', { name: 'Data from BenchLM.ai' }))
      .toHaveAttribute('href', 'https://benchlm.ai/data');
    expect(screen.queryByRole('table', { name: 'Coding benchmark' })).not.toBeInTheDocument();
    expect(screen.queryByText('Model A')).not.toBeInTheDocument();
  });

  it('renders the directory with concise registered category links without fixture rankings', () => {
    window.history.replaceState({}, '', '/leaderboards/');

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Model leaderboards', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View Coding benchmark' })).toHaveAttribute('href', '/leaderboards/llm/coding/');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders the approved Home snapshot instead of independent cached teaser rows', () => {
    render(<HomePage />);

    expect(screen.getByRole('region', { name: 'Live decision snapshot' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'See the market at a glance', level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Overall Model Value', level: 3 })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Human Preference', level: 3 })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Image Generation', level: 3 })).not.toBeInTheDocument();
  });
});
