import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompareHubPage } from '../pages/compare-hub-page';
import { ComparisonPage } from './comparison-page';
import type { ComparisonViewModel } from './comparison-contracts';

const UPDATED_AT = '2026-08-05T12:00:00.000Z';

function viewModel(): ComparisonViewModel {
  const modelA = {
    modelKey: 'provider:model-a', slug: 'model-a', name: 'Model A', creator: 'Provider A', sourceType: 'Proprietary' as const,
    reasoningType: null, releaseDate: null, contextWindowTokens: 128_000, evidenceStatus: 'supported' as const,
    rankingEligible: true, confidenceLower: null, confidenceUpper: null, benchmarkCount: 1, sourceId: 'benchlm' as const,
    sourceModelId: 'model-a', sourceArtifactId: 'benchlm-models',
  };
  const modelB = {
    ...modelA,
    modelKey: 'provider:model-b', slug: 'model-b', name: 'Model B', creator: 'Provider B', sourceModelId: 'model-b',
  };
  const metric = (modelKey: string, value: number) => ({
    modelKey, metricKey: 'benchlm:category:coding', category: 'coding', value, rawValue: null, rank: null, lower: null, upper: null,
    voteCount: null, unit: 'score' as const, sourceId: 'benchlm' as const, sourceUpdatedAt: UPDATED_AT,
    sourceModelId: modelKey, sourceArtifactId: 'benchlm-models', rankingEligible: true,
    methodology: 'benchlm_raw_composite' as const, observationCount: null, sessionCount: null,
  });
  const price = (modelKey: string, inputUsdPerMillion: number, outputUsdPerMillion: number) => ({
    modelKey, sourceId: 'openrouter' as const, providerId: 'openrouter', inputUsdPerMillion, cachedInputUsdPerMillion: null,
    outputUsdPerMillion, contextWindowTokens: 128_000, verificationStatus: 'primary' as const, routeId: `openrouter:${modelKey}`,
    sourceModelId: modelKey, canonicalSlug: null, maxInputTokens: 120_000, maxOutputTokens: 8_000,
    inputModalities: ['text'], outputModalities: ['text'], supportedParameters: ['tools'], sourceArtifactId: 'openrouter-catalog',
  });
  return {
    revision: 'published-r1',
    publishedAt: UPDATED_AT,
    freshness: { status: 'fresh', checkedAt: UPDATED_AT },
    canonicalPath: '/compare/model-a-vs-model-b',
    models: [modelA, modelB],
    metricRows: [{
      metricKey: 'benchlm:category:coding', category: 'coding', unit: 'score', sourceId: 'benchlm', methodology: 'benchlm_raw_composite',
      modelA: metric(modelA.modelKey, 88.5), modelB: metric(modelB.modelKey, 76.2),
    }],
    priceChecks: [
      { modelKey: modelA.modelKey, selectedRouteId: `openrouter:${modelA.modelKey}`, checks: [price(modelA.modelKey, 2, 8)] },
      { modelKey: modelB.modelKey, selectedRouteId: `openrouter:${modelB.modelKey}`, checks: [price(modelB.modelKey, 1, 4)] },
    ],
    attribution: [
      {
        sourceId: 'benchlm', artifactId: 'benchlm-models', sourceUrl: 'https://benchlm.example/models', observedAt: UPDATED_AT,
        etag: null, lastModified: null, upstreamRevision: null, schemaVersion: null, snapshotKey: 'benchlm/models.json',
        contentHash: `sha256:${'a'.repeat(64)}`, originalContentHash: `sha256:${'b'.repeat(64)}`, licenseId: 'MIT', attributionText: 'Data from BenchLM',
      },
      {
        sourceId: 'openrouter', artifactId: 'openrouter-catalog', sourceUrl: 'https://openrouter.example/models', observedAt: UPDATED_AT,
        etag: null, lastModified: null, upstreamRevision: null, schemaVersion: null, snapshotKey: 'openrouter/models.json',
        contentHash: `sha256:${'c'.repeat(64)}`, originalContentHash: `sha256:${'d'.repeat(64)}`, licenseId: 'OpenRouter-ToS', attributionText: 'OpenRouter catalog',
      },
    ],
    indexable: false,
    methodology: [
      { sourceId: 'benchlm', methodology: 'benchlm_raw_composite' },
    ],
    relatedPairs: [{
      pairSlug: 'model-b-vs-other', modelA: modelB, modelB: { ...modelA, modelKey: 'provider:other', slug: 'other', name: 'Other', sourceModelId: 'other' },
      featuredRank: 1, sharedMetricCount: 1,
    }],
    subscriptionMatch: null,
  };
}

function denseComparisonViewModel(): ComparisonViewModel {
  const model = viewModel();
  const [modelA, modelB] = model.models;
  const metricTemplateA = model.metricRows[0]!.modelA!;
  const metricTemplateB = model.metricRows[0]!.modelB!;
  const sharedMetrics = [
    ['coding', 88.5, 76.2],
    ['knowledge', 81.2, 82.4],
    ['multimodal', 79.1, 75.5],
    ['reasoning', 84.3, 83.7],
  ] as const;
  const directRoute = {
    ...model.priceChecks[0].checks[0]!,
    sourceId: 'benchlm' as const,
    providerId: 'provider-a-direct',
    routeId: 'direct:model-a',
    sourceArtifactId: 'benchlm-models',
    inputUsdPerMillion: 0.5,
    outputUsdPerMillion: null,
    contextWindowTokens: 64_000,
  };

  return {
    ...model,
    models: [{ ...modelA, benchmarkCount: sharedMetrics.length }, { ...modelB, benchmarkCount: sharedMetrics.length }],
    metricRows: sharedMetrics.map(([category, modelAValue, modelBValue]) => {
      const metricKey = `benchlm:category:${category}`;
      return {
        metricKey,
        category,
        unit: 'score' as const,
        sourceId: 'benchlm' as const,
        methodology: 'benchlm_raw_composite' as const,
        modelA: { ...metricTemplateA, metricKey, category, value: modelAValue },
        modelB: { ...metricTemplateB, metricKey, category, value: modelBValue },
      };
    }),
    priceChecks: [
      { modelKey: modelA.modelKey, selectedRouteId: directRoute.routeId, checks: [model.priceChecks[0].checks[0]!, directRoute] },
      model.priceChecks[1],
    ],
  };
}

function largeComparisonViewModel(): ComparisonViewModel {
  const base = denseComparisonViewModel();
  const [modelA, modelB] = base.models;
  const metricTemplateA = base.metricRows[0]!.modelA!;
  const metricTemplateB = base.metricRows[0]!.modelB!;
  const categories = [
    'published-evidence-category-00-with-full-name',
    'published-evidence-category-01-with-full-name',
    'published-evidence-category-02-with-full-name',
    'published-evidence-category-03-with-full-name',
    'published-evidence-category-04-with-full-name',
    'published-evidence-category-05-with-full-name',
    'published-evidence-category-06-with-full-name',
    'published-evidence-category-07-with-full-name',
    'published-evidence-category-08-with-full-name',
    'published-evidence-category-09-with-full-name',
  ] as const;

  return {
    ...base,
    models: [{ ...modelA, benchmarkCount: categories.length }, { ...modelB, benchmarkCount: categories.length }],
    metricRows: categories.map((category, index) => {
      const metricKey = `benchlm:category:${category}`;
      const modelAWins = index % 2 === 0;
      return {
        metricKey,
        category,
        unit: 'score' as const,
        sourceId: 'benchlm' as const,
        methodology: 'benchlm_raw_composite' as const,
        modelA: { ...metricTemplateA, metricKey, category, value: modelAWins ? 90 : 80 },
        modelB: { ...metricTemplateB, metricKey, category, value: modelAWins ? 80 : 90 },
      };
    }),
  };
}

function directoryEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    revision: 'published-r1',
    publishedAt: UPDATED_AT,
    freshness: { status: 'fresh', checkedAt: UPDATED_AT },
    attribution: [],
    data: {
      compareDirectory: {
        models: [
          { slug: 'model-a', name: 'Model A', creator: 'Provider A', sourceType: 'Proprietary', evidenceStatus: 'supported', utilitySelectable: true, metricCategories: ['coding', 'overall'] },
          { slug: 'model-b', name: 'Model B', creator: 'Provider B', sourceType: 'Proprietary', evidenceStatus: 'supported', utilitySelectable: true, metricCategories: ['coding'] },
          { slug: 'vision', name: 'Vision', creator: 'Provider B', sourceType: 'Open Weight', evidenceStatus: 'source_only', utilitySelectable: true, metricCategories: ['multimodal'] },
        ],
        indexablePairs: [{ pairSlug: 'model-a-vs-model-b', modelASlug: 'model-a', modelBSlug: 'model-b', featuredRank: 1, sharedMetricCount: 2 }],
      },
    },
    ...overrides,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('comparison detail page', () => {
  it('renders the approved result hierarchy without repeated source fields or workload controls', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    render(<ComparisonPage viewModel={denseComparisonViewModel()} />);

    const sourceMetrics = screen.getByRole('table', { name: 'Source metric comparison' });
    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
    expect(screen.getByRole('heading', { name: 'Key implications' })).toBeVisible();
    expect(screen.getByRole('img', { name: /shared metric radar/i })).toBeVisible();
    expect(within(sourceMetrics).getByRole('rowheader', { name: 'Coding' })).toBeVisible();
    expect(within(sourceMetrics).queryByText('benchlm:category:coding')).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Source' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Workload view' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Not verified').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('heading', { name: 'Evidence provenance' })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: 'Model A' }).every((link) => link.getAttribute('href') === '/models/model-a/')).toBe(true);
    expect(screen.getAllByRole('link', { name: 'Model B' }).every((link) => link.getAttribute('href') === '/models/model-b/')).toBe(true);
    expect(headings.indexOf('Key implications')).toBeLessThan(headings.indexOf('Shared metric view'));
    expect(headings.indexOf('Shared metric view')).toBeLessThan(headings.indexOf('Source metrics'));
    expect(headings.indexOf('Source metrics')).toBeLessThan(headings.indexOf('Pricing and context'));
    expect(headings.indexOf('Pricing and context')).toBeLessThan(headings.indexOf('Evidence provenance'));

    fireEvent.click(screen.getByRole('button', { name: 'Share result' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://tokenbench.monomind.one/compare/model-a-vs-model-b'));
  });

  it('retains every full source metric row when compact highlights omit category names', () => {
    render(<ComparisonPage viewModel={largeComparisonViewModel()} />);

    const sourceMetrics = screen.getByRole('table', { name: 'Source metric comparison' });
    const highlights = screen.getByRole('heading', { name: 'Key implications' }).closest('section');
    expect(within(sourceMetrics).getAllByRole('rowheader').map((row) => row.textContent)).toEqual([
      'Published Evidence Category 00 With Full Name',
      'Published Evidence Category 01 With Full Name',
      'Published Evidence Category 02 With Full Name',
      'Published Evidence Category 03 With Full Name',
      'Published Evidence Category 04 With Full Name',
      'Published Evidence Category 05 With Full Name',
      'Published Evidence Category 06 With Full Name',
      'Published Evidence Category 07 With Full Name',
      'Published Evidence Category 08 With Full Name',
      'Published Evidence Category 09 With Full Name',
    ]);
    expect(highlights).toHaveTextContent('and 2 more categories');
  });

  it('changes selected route operational values without changing metric claims or the canonical share URL', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<ComparisonPage viewModel={denseComparisonViewModel()} />);

    const pricingTable = screen.getByRole('table', { name: 'Route pricing and context comparison' });
    const highlights = screen.getByRole('heading', { name: 'Key implications' }).closest('section');
    const scoreEvidence = 'Across compatible supported BenchLM categories, Model A has higher scores in Coding, Multimodal, and Reasoning; Model B has a higher score in Knowledge.';
    expect(highlights).not.toBeNull();
    expect(highlights!).toHaveTextContent(scoreEvidence);
    expect(within(pricingTable).getByRole('row', { name: /Input API price/ })).toHaveTextContent('$0.5');

    fireEvent.change(screen.getByLabelText('Model A pricing route'), { target: { value: 'openrouter:provider:model-a' } });

    expect(within(pricingTable).getByRole('row', { name: /Input API price/ })).toHaveTextContent('$2');
    expect(within(pricingTable).getByRole('row', { name: /Output API price/ })).toHaveTextContent('$8');
    expect(highlights!).toHaveTextContent(scoreEvidence);
    expect(within(screen.getByRole('table', { name: 'Source metric comparison' })).getByRole('rowheader', { name: 'Coding' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Evidence provenance' }).closest('section')).toHaveTextContent('Model A — route openrouter:provider:model-a · source openrouter · provider openrouter');

    fireEvent.click(screen.getByRole('button', { name: 'Share result' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://tokenbench.monomind.one/compare/model-a-vs-model-b'));
  });

  it('updates sparse-pair pricing claims when the controlled route changes', () => {
    const model = viewModel();
    const directRoute = {
      ...model.priceChecks[0].checks[0]!,
      routeId: 'direct:model-a',
      providerId: 'provider-a-direct',
      inputUsdPerMillion: 0.5,
      outputUsdPerMillion: null,
    };
    render(<ComparisonPage viewModel={{
      ...model,
      priceChecks: [
        { ...model.priceChecks[0], selectedRouteId: directRoute.routeId, checks: [directRoute, ...model.priceChecks[0].checks] },
        model.priceChecks[1],
      ],
    }} />);

    const highlights = screen.getByRole('heading', { name: 'Key implications' }).closest('section');
    expect(highlights).not.toBeNull();
    expect(within(highlights!).getByText(/^Input API price:/)).toHaveTextContent('Model A has the lower verified rate');

    fireEvent.change(screen.getByLabelText('Model A pricing route'), { target: { value: 'openrouter:provider:model-a' } });

    expect(within(highlights!).getByText(/^Input API price:/)).toHaveTextContent('Model B has the lower verified rate');
    expect(highlights!).not.toHaveTextContent('Input API price: Model A has the lower verified rate');
  });

  it('shows the selected route verification status and updates it when the route changes', () => {
    const model = denseComparisonViewModel();
    const directRoute = { ...model.priceChecks[0].checks.find((route) => route.routeId === 'direct:model-a')!, verificationStatus: 'conflict' as const };
    render(<ComparisonPage viewModel={{
      ...model,
      priceChecks: [
        { ...model.priceChecks[0], checks: model.priceChecks[0].checks.map((route) => route.routeId === directRoute.routeId ? directRoute : route) },
        model.priceChecks[1],
      ],
    }} />);

    const routePicker = screen.getByLabelText('Model A pricing route');
    expect(within(routePicker).getByRole('option', { name: /direct:model-a · conflict/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Model B pricing route')).toHaveTextContent('primary');
    expect(routePicker.closest('label')).toHaveTextContent('Conflicting source evidence');

    fireEvent.change(screen.getByLabelText('Model A pricing route'), { target: { value: 'openrouter:provider:model-a' } });

    expect(routePicker).toHaveValue('openrouter:provider:model-a');
    expect(routePicker.closest('label')).toHaveTextContent('Primary source');
  });

  it('omits the cached input row until one selected route publishes that rate', () => {
    const model = viewModel();
    render(<ComparisonPage viewModel={model} />);

    const pricingTable = screen.getByRole('table', { name: 'Route pricing and context comparison' });
    expect(within(pricingTable).queryByRole('rowheader', { name: 'Cached input API price' })).not.toBeInTheDocument();
  });

  it('shows the cached input row when either selected route publishes that rate', () => {
    const model = viewModel();
    render(<ComparisonPage viewModel={{
      ...model,
      priceChecks: [
        { ...model.priceChecks[0], checks: model.priceChecks[0].checks.map((check) => ({ ...check, cachedInputUsdPerMillion: 0.5 })) },
        model.priceChecks[1],
      ],
    }} />);

    const pricingTable = screen.getByRole('table', { name: 'Route pricing and context comparison' });
    const cachedRow = within(pricingTable).getByRole('rowheader', { name: 'Cached input API price' }).closest('tr');
    expect(cachedRow).toHaveTextContent('$0.5');
    expect(cachedRow).toHaveTextContent('Not verified');
  });

  it('keeps exact selected-route provenance and missing route fields distinct from unavailable evidence', () => {
    const model = denseComparisonViewModel();
    render(<ComparisonPage viewModel={model} />);

    const provenance = screen.getByRole('heading', { name: 'Evidence provenance' }).closest('section');
    const pricingTable = screen.getByRole('table', { name: 'Route pricing and context comparison' });
    const mobilePricing = screen.getByLabelText('Pricing and context, ordered cards');
    expect(provenance).not.toBeNull();
    expect(provenance!).toHaveTextContent('Model A — route direct:model-a · source benchlm · provider provider-a-direct');
    expect(within(pricingTable).getByRole('row', { name: /Output API price/ })).toHaveTextContent('Not verified');
    expect(within(mobilePricing).queryByText('Source')).not.toBeInTheDocument();
    expect(within(pricingTable).queryByRole('columnheader', { name: 'Source' })).not.toBeInTheDocument();
  });

  it('does not infer an operational route when the view model publishes no selected route ID', () => {
    const model = viewModel();
    render(<ComparisonPage viewModel={{
      ...model,
      priceChecks: [{ ...model.priceChecks[0], selectedRouteId: null }, model.priceChecks[1]],
    }} />);

    const pricingTable = screen.getByRole('table', { name: 'Route pricing and context comparison' });
    const provenance = screen.getByRole('heading', { name: 'Evidence provenance' }).closest('section');
    expect(within(pricingTable).getByRole('row', { name: /Input API price/ })).toHaveTextContent('Not verified');
    expect(within(pricingTable).getByRole('row', { name: /Input API price/ })).not.toHaveTextContent('Unavailable');
    expect(provenance).toHaveTextContent('Model A — Not published');
  });

  it('uses a readable metric list when a radar is ineligible and distinguishes missing facts', () => {
    const model = viewModel();
    const sharedRoute = {
      ...model.priceChecks[0].checks[0]!,
      sourceId: 'benchlm' as const,
      providerId: 'provider-a',
      routeId: 'direct:shared',
      sourceArtifactId: 'benchlm-models',
    };
    render(<ComparisonPage viewModel={{
      ...model,
      metricRows: [{ ...model.metricRows[0]!, modelB: null }],
      priceChecks: [
        { modelKey: model.models[0].modelKey, selectedRouteId: null, checks: [sharedRoute, { ...sharedRoute, providerId: 'provider-z' }] },
        { ...model.priceChecks[1], selectedRouteId: null, checks: [] },
      ],
    }} />);

    const provenance = screen.getByRole('heading', { name: 'Evidence provenance' }).closest('section');
    const pricingTable = screen.getByRole('table', { name: 'Route pricing and context comparison' });
    expect(screen.queryByRole('img', { name: /shared metric radar/i })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Comparable metric detail' })).toBeVisible();
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Not verified').length).toBeGreaterThan(0);
    expect(within(pricingTable).getByRole('row', { name: /Input API price/ })).toHaveTextContent('Unavailable');
    expect(within(pricingTable).getByRole('row', { name: /Input API price/ })).toHaveTextContent('Not verified');
    expect(provenance).not.toBeNull();
    expect(provenance!).toHaveTextContent('Route selection is ambiguous');
  });

  it('uses only result-page records for quick pair switching', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    render(<ComparisonPage viewModel={viewModel()} />);

    const first = screen.getByRole('combobox', { name: 'First model' });
    const second = screen.getByRole('combobox', { name: 'Second model' });
    fireEvent.focus(first);
    fireEvent.change(first, { target: { value: '' } });
    expect(screen.getByRole('option', { name: 'Other · Provider A · Supported evidence' })).toBeVisible();
    fireEvent.change(first, { target: { value: 'model-b' } });
    fireEvent.change(second, { target: { value: 'other' } });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'View selected comparison' })).toHaveAttribute('href', '/compare/model-b-vs-other');
  });

  it('omits the source records ledger and renders exactly one provenance disclosure', () => {
    const model = viewModel();
    render(<ComparisonPage viewModel={{
      ...model,
      attribution: [{ ...model.attribution[0], sourceUrl: 'javascript:alert(1)' }, model.attribution[1]],
    }} />);

    const provenance = screen.getByRole('heading', { name: 'Evidence provenance' }).closest('section');
    expect(provenance).not.toBeNull();
    expect(screen.queryByText('Source records')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Data from BenchLM' })).not.toBeInTheDocument();
    expect(document.querySelectorAll('.comparison-provenance')).toHaveLength(1);
  });
});

describe('compare hub', () => {
  it('keeps the approved heading mounted during loading and unavailable states', async () => {
    let finish: ((response: Response) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
    const { unmount } = render(<CompareHubPage />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading published benchmark directory');
    expect(screen.getAllByRole('heading', { level: 1, name: 'Compare models side by side' })).toHaveLength(1);
    finish?.(new Response(JSON.stringify({ error: 'Benchmark data unavailable' }), { status: 503 }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Unavailable'));
    expect(screen.getAllByRole('heading', { level: 1, name: 'Compare models side by side' })).toHaveLength(1);
    unmount();
  });

  it('uses the approved unfiltered picker and preserves reviewed pair navigation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(directoryEnvelope()), { status: 200 })));
    render(<CompareHubPage />);

    const first = await screen.findByRole('combobox', { name: 'First model' });
    const second = screen.getByRole('combobox', { name: 'Second model' });
    expect(screen.queryByLabelText('Provider or creator')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Metric category')).not.toBeInTheDocument();
    expect(screen.queryByText(/Published revision:/)).not.toBeInTheDocument();
    fireEvent.focus(first);
    expect(screen.getByRole('option', { name: 'Vision · Provider B · Source-only record' })).toBeVisible();

    fireEvent.change(first, { target: { value: 'model-a' } });
    fireEvent.change(second, { target: { value: 'model-b' } });
    expect(screen.getByRole('link', { name: 'Compare selected models' })).toHaveAttribute('href', '/compare/model-a-vs-model-b');
    fireEvent.click(screen.getByRole('button', { name: 'Swap selected models' }));
    expect(first).toHaveValue('model-b');
    expect(second).toHaveValue('model-a');
    expect(screen.getByRole('link', { name: 'Model A vs Model B' })).toHaveAttribute('href', '/compare/model-a-vs-model-b');
  });

  it('keeps duplicate display names distinct with canonical slugs and evidence state', async () => {
    const duplicateModels = [
      { slug: 'alpha-model', name: 'Shared Model', creator: 'Provider A', sourceType: 'Proprietary', evidenceStatus: 'supported', utilitySelectable: true, metricCategories: ['coding'] },
      { slug: 'zeta-model', name: 'Shared Model', creator: 'Provider B', sourceType: 'Proprietary', evidenceStatus: 'supported', utilitySelectable: true, metricCategories: ['coding'] },
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(directoryEnvelope({
      data: { compareDirectory: { models: duplicateModels, indexablePairs: [{ pairSlug: 'alpha-model-vs-zeta-model', modelASlug: 'alpha-model', modelBSlug: 'zeta-model', featuredRank: 1, sharedMetricCount: 2 }] } },
    })), { status: 200 })));
    render(<CompareHubPage />);

    const first = await screen.findByRole('combobox', { name: 'First model' });
    const second = screen.getByRole('combobox', { name: 'Second model' });
    fireEvent.focus(first);
    expect(screen.getByRole('option', { name: 'Shared Model · Provider A · alpha-model · Supported evidence' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'Shared Model · Provider B · zeta-model · Supported evidence' })).toBeVisible();
    fireEvent.change(first, { target: { value: 'zeta-model' } });
    fireEvent.change(second, { target: { value: 'alpha-model' } });

    expect(screen.getByRole('link', { name: 'Compare selected models' })).toHaveAttribute('href', '/compare/alpha-model-vs-zeta-model');
  });

  it('follows the combobox listbox keyboard pattern with complete option names', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(directoryEnvelope()), { status: 200 })));
    render(<CompareHubPage />);

    const first = await screen.findByRole('combobox', { name: 'First model' });
    const second = screen.getByRole('combobox', { name: 'Second model' });
    fireEvent.focus(first);
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(first).toHaveAttribute('aria-activedescendant', 'comparison-model-option-0');
    fireEvent.keyDown(first, { key: 'Enter' });
    expect(first).toHaveValue('model-a');
    fireEvent.focus(second);
    fireEvent.keyDown(second, { key: 'ArrowDown' });
    fireEvent.keyDown(second, { key: 'ArrowDown' });
    fireEvent.keyDown(second, { key: 'Enter' });
    expect(second).toHaveValue('model-b');
    expect(screen.getByRole('link', { name: 'Compare selected models' })).toHaveAttribute('href', '/compare/model-a-vs-model-b');
    fireEvent.focus(first);
    expect(screen.getByRole('option', { name: 'Model A · Provider A · Supported evidence' }).querySelector('button')).toBeNull();
    fireEvent.focus(second);
    fireEvent.keyDown(second, { key: 'Escape' });
    expect(second).toHaveAttribute('aria-expanded', 'false');
  });

  it('does not create a comparison navigation target until two distinct known models are selected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(directoryEnvelope()), { status: 200 })));
    render(<CompareHubPage />);

    const first = await screen.findByRole('combobox', { name: 'First model' });
    const second = screen.getByRole('combobox', { name: 'Second model' });
    fireEvent.change(first, { target: { value: 'model-a' } });
    fireEvent.change(second, { target: { value: 'model-a' } });

    expect(screen.queryByRole('link', { name: 'Compare selected models' })).not.toBeInTheDocument();
    expect(screen.getByText('Choose two different known models to continue.')).toBeVisible();
  });

  it('retains a reviewed complex-slug pair without exposing that model as a utility selection', async () => {
    const directoryModels = [
      { slug: 'a', name: 'A', creator: 'Provider A', sourceType: 'Proprietary', evidenceStatus: 'supported', utilitySelectable: true, metricCategories: ['coding'] },
      { slug: 'a-vs-b', name: 'Complex', creator: 'Provider B', sourceType: 'Proprietary', evidenceStatus: 'supported', utilitySelectable: false, metricCategories: ['coding'] },
      { slug: 'd', name: 'D', creator: 'Provider D', sourceType: 'Proprietary', evidenceStatus: 'supported', utilitySelectable: true, metricCategories: ['coding'] },
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(directoryEnvelope({
      data: { compareDirectory: { models: directoryModels, indexablePairs: [{ pairSlug: 'a-vs-b-vs-d', modelASlug: 'a-vs-b', modelBSlug: 'd', featuredRank: 1, sharedMetricCount: 2 }] } },
    })), { status: 200 })));
    render(<CompareHubPage />);

    const first = await screen.findByRole('combobox', { name: 'First model' });
    const second = screen.getByRole('combobox', { name: 'Second model' });
    fireEvent.focus(first);
    expect(screen.queryByRole('option', { name: /Complex/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Complex vs D' })).toHaveAttribute('href', '/compare/a-vs-b-vs-d');

    fireEvent.change(first, { target: { value: 'a-vs-b' } });
    fireEvent.change(second, { target: { value: 'd' } });
    expect(screen.queryByRole('link', { name: 'Compare selected models' })).not.toBeInTheDocument();
  });

  it('rejects malformed directory timestamps and pair identities instead of creating links', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(directoryEnvelope({
      publishedAt: '2026-08-05 12:00:00',
      data: { compareDirectory: { models: directoryEnvelope().data.compareDirectory.models, indexablePairs: [] } },
    })), { status: 200 })));
    const { unmount } = render(<CompareHubPage />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Unavailable'));
    unmount();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(directoryEnvelope({
      data: {
        compareDirectory: {
          models: directoryEnvelope().data.compareDirectory.models,
          indexablePairs: [{ pairSlug: 'wrong-pair', modelASlug: 'model-a', modelBSlug: 'model-b', featuredRank: 1, sharedMetricCount: 1 }],
        },
      },
    })), { status: 200 })));
    render(<CompareHubPage />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Unavailable'));
  });

  it('caps the popular reviewed index at twelve server-ordered pairs', async () => {
    const models = Array.from({ length: 13 }, (_, index) => ({
      slug: `model-${index}`, name: `Model ${index}`, creator: 'Provider', sourceType: 'Proprietary', evidenceStatus: 'supported', utilitySelectable: true, metricCategories: ['coding'],
    }));
    const indexablePairs = Array.from({ length: 12 }, (_, index) => ({
      pairSlug: `model-${index}-vs-model-${index + 1}`,
      modelASlug: `model-${index}`,
      modelBSlug: `model-${index + 1}`,
      featuredRank: index + 1,
      sharedMetricCount: 2,
    }));
    indexablePairs.push({ pairSlug: 'model-0-vs-model-12', modelASlug: 'model-0', modelBSlug: 'model-12', featuredRank: 13, sharedMetricCount: 2 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(directoryEnvelope({
      data: { compareDirectory: { models, indexablePairs } },
    })), { status: 200 })));
    render(<CompareHubPage />);

    await screen.findByRole('combobox', { name: 'First model' });
    expect(screen.getAllByRole('link', { name: /Model \d+ vs Model \d+/ })).toHaveLength(12);
    expect(screen.queryByRole('link', { name: 'Model 0 vs Model 12' })).not.toBeInTheDocument();
  });

  it('keeps loading, no-reviewed-pairs, stale, and unavailable states explicit', async () => {
    let finish: ((response: Response) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
    const { unmount } = render(<CompareHubPage />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading published benchmark directory');
    finish?.(new Response(JSON.stringify(directoryEnvelope({ freshness: { status: 'stale', checkedAt: UPDATED_AT, message: 'Published benchmark revision is stale.' }, data: { compareDirectory: { models: [], indexablePairs: [] } } })), { status: 200 }));
    await waitFor(() => expect(screen.getByText('No reviewed matchups published yet')).toBeVisible());
    expect(screen.getByText('Published benchmark revision is stale.')).toBeVisible();
    unmount();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Benchmark data unavailable' }), { status: 503 })));
    render(<CompareHubPage />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Unavailable'));
  });
});
