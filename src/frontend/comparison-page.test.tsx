import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ComparisonPage } from './comparison-page';
import { CompareHubPage } from '../pages/compare-hub-page';
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
    modelKey, metricKey: 'benchlm:category:coding', category: 'coding', value, rank: null, lower: null, upper: null,
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
      { modelKey: modelA.modelKey, checks: [price(modelA.modelKey, 2, 8)] },
      { modelKey: modelB.modelKey, checks: [price(modelB.modelKey, 1, 4)] },
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

function directoryEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    revision: 'published-r1',
    publishedAt: UPDATED_AT,
    freshness: { status: 'fresh', checkedAt: UPDATED_AT },
    attribution: [],
    data: {
      compareDirectory: {
        models: [
          { slug: 'model-a', name: 'Model A', creator: 'Provider A', sourceType: 'Proprietary', evidenceStatus: 'supported', metricCategories: ['coding', 'overall'] },
          { slug: 'model-b', name: 'Model B', creator: 'Provider B', sourceType: 'Proprietary', evidenceStatus: 'supported', metricCategories: ['coding'] },
          { slug: 'vision', name: 'Vision', creator: 'Provider B', sourceType: 'Open Weight', evidenceStatus: 'source_only', metricCategories: ['multimodal'] },
        ],
        indexablePairs: [{ pairSlug: 'model-a-vs-model-b', modelASlug: 'model-a', modelBSlug: 'model-b', featuredRank: 1, sharedMetricCount: 2 }],
      },
    },
    ...overrides,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('comparison detail page', () => {
  it('uses the server view model without fetching while workload profile costs recalculate', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    render(<ComparisonPage viewModel={viewModel()} />);

    expect(screen.getByRole('heading', { name: 'Model A vs Model B', level: 1 })).toBeVisible();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getAllByText('benchlm:category:coding')[0]).toBeVisible();
    expect(screen.getByText('openrouter:provider:model-a')).toBeVisible();
    expect(screen.getAllByText('128,000 tokens')[0]).toBeVisible();
    expect(screen.getByText('No verified subscription match')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open subscription vs. API calculator' })).toHaveAttribute('href', '/tools/subscriptions-vs-apis/');
    expect(screen.getByTestId('workload-cost-provider:model-a')).toHaveTextContent('$3.50 / 1M');

    fireEvent.click(screen.getByLabelText('Output-heavy'));

    expect(screen.getByTestId('workload-cost-provider:model-a')).toHaveTextContent('$5.00 / 1M');
    expect(screen.getByRole('link', { name: 'Data from BenchLM' })).toHaveAttribute('href', 'https://benchlm.example/models');
  });

  it('encodes related comparison paths and refuses non-HTTPS attribution targets', () => {
    const model = viewModel();
    render(<ComparisonPage viewModel={{
      ...model,
      attribution: [{ ...model.attribution[0], sourceUrl: 'javascript:alert(1)' }, model.attribution[1]],
      relatedPairs: [{ ...model.relatedPairs[0], pairSlug: 'model-b-vs-other?next=/' }],
    }} />);

    expect(screen.getByRole('link', { name: 'Model B vs Other' })).toHaveAttribute('href', '/compare/model-b-vs-other%3Fnext%3D%2F');
    expect(screen.queryByRole('link', { name: 'Data from BenchLM' })).not.toBeInTheDocument();
    expect(screen.getByText('Data from BenchLM')).toBeVisible();
  });

  it('keeps route context separate from a model-declared context and keys metric identities completely', () => {
    const model = viewModel();
    render(<ComparisonPage viewModel={{
      ...model,
      metricRows: [
        ...model.metricRows,
        {
          ...model.metricRows[0],
          category: 'reasoning',
          unit: 'arena_score',
          methodology: 'bradley_terry',
        },
      ],
      priceChecks: [
        {
          ...model.priceChecks[0],
          checks: [{ ...model.priceChecks[0].checks[0], contextWindowTokens: 64_000 }],
        },
        model.priceChecks[1],
      ],
    }} />);

    expect(screen.getByRole('table', { name: 'Source metric comparison' })).toBeVisible();
    expect(within(screen.getByRole('table', { name: 'Route pricing and context comparison' })).getByText('64,000')).toBeVisible();
    expect(screen.getAllByText('benchlm:category:coding')).toHaveLength(4);
  });

  it('uses safe stable identity IDs and disambiguates duplicate model names in comparison table headings', () => {
    const model = viewModel();
    const duplicateNameModel = {
      ...model.models[1],
      modelKey: 'provider:other model/\u{1f916}',
      name: model.models[0].name,
      slug: 'other-model',
    };
    render(<ComparisonPage viewModel={{
      ...model,
      models: [model.models[0], duplicateNameModel],
      priceChecks: [model.priceChecks[0], { ...model.priceChecks[1], modelKey: duplicateNameModel.modelKey, checks: [] }],
      metricRows: [{
        ...model.metricRows[0],
        modelB: { ...model.metricRows[0].modelB!, modelKey: duplicateNameModel.modelKey, sourceModelId: duplicateNameModel.sourceModelId },
      }],
    }} />);

    expect(screen.getAllByRole('columnheader', { name: 'Model A (model-a)' })).toHaveLength(2);
    expect(screen.getAllByRole('columnheader', { name: 'Model A (other-model)' })).toHaveLength(2);
    const identityIds = screen.getAllByRole('heading', { level: 3, name: 'Model A' }).map((heading) => heading.id);
    expect(identityIds).toHaveLength(2);
    expect(identityIds).toEqual(expect.arrayContaining([expect.stringMatching(/^comparison-model-[a-f0-9]+$/)]));
    expect(identityIds.join(' ')).not.toContain('provider:other model');
  });
});

describe('compare hub', () => {
  it('keeps its one page heading mounted during loading and unavailable states', async () => {
    let finish: ((response: Response) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
    const { unmount } = render(<CompareHubPage />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading published benchmark directory');
    expect(screen.getAllByRole('heading', { level: 1, name: 'Compare AI models' })).toHaveLength(1);
    finish?.(new Response(JSON.stringify({ error: 'Benchmark data unavailable' }), { status: 503 }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Unavailable'));
    expect(screen.getAllByRole('heading', { level: 1, name: 'Compare AI models' })).toHaveLength(1);
    unmount();
  });

  it('shows an evidence-backed directory, filters choices, swaps selections, and links a reviewed pair canonically', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(directoryEnvelope()), { status: 200 })));
    render(<CompareHubPage />);

    const first = await screen.findByRole('combobox', { name: 'First model' });
    const second = screen.getByRole('combobox', { name: 'Second model' });
    expect(screen.getByText('Published revision: published-r1')).toBeVisible();

    fireEvent.change(screen.getByRole('combobox', { name: 'Provider or creator' }), { target: { value: 'Provider B' } });
    expect(screen.getByRole('option', { name: /Vision/ })).toBeVisible();
    expect(screen.queryByRole('option', { name: /Model A/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Provider or creator' }), { target: { value: '' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Metric category' }), { target: { value: 'coding' } });
    expect(screen.queryByRole('option', { name: /Vision/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Metric category' }), { target: { value: '' } });

    fireEvent.change(first, { target: { value: 'model-a' } });
    fireEvent.change(second, { target: { value: 'model-b' } });
    expect(screen.getByRole('link', { name: 'Compare selected models' })).toHaveAttribute('href', '/compare/model-a-vs-model-b');
    fireEvent.click(screen.getByRole('button', { name: 'Swap selected models' }));
    expect(first).toHaveValue('model-b');
    expect(second).toHaveValue('model-a');
    expect(screen.getByRole('link', { name: 'Model A vs Model B' })).toHaveAttribute('href', '/compare/model-a-vs-model-b');
    expect(screen.getByText('Publication time')).toBeVisible();
    expect(screen.getByText('Checked at')).toBeVisible();
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

  it('keeps duplicate display names distinct by their canonical model slugs', async () => {
    const duplicateModels = [
      { slug: 'alpha-model', name: 'Shared Model', creator: 'Provider A', sourceType: 'Proprietary', evidenceStatus: 'supported', metricCategories: ['coding'] },
      { slug: 'zeta-model', name: 'Shared Model', creator: 'Provider B', sourceType: 'Proprietary', evidenceStatus: 'supported', metricCategories: ['coding'] },
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(directoryEnvelope({
      data: { compareDirectory: { models: duplicateModels, indexablePairs: [{ pairSlug: 'alpha-model-vs-zeta-model', modelASlug: 'alpha-model', modelBSlug: 'zeta-model', featuredRank: 1, sharedMetricCount: 2 }] } },
    })), { status: 200 })));
    render(<CompareHubPage />);

    const first = await screen.findByRole('combobox', { name: 'First model' });
    const second = screen.getByRole('combobox', { name: 'Second model' });
    expect(screen.getByRole('option', { name: 'Shared Model · Provider A · alpha-model' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'Shared Model · Provider B · zeta-model' })).toBeVisible();
    fireEvent.change(first, { target: { value: 'zeta-model' } });
    fireEvent.change(second, { target: { value: 'alpha-model' } });

    expect(screen.getByRole('link', { name: 'Compare selected models' })).toHaveAttribute('href', '/compare/alpha-model-vs-zeta-model');
  });

  it('follows the combobox listbox keyboard pattern without nested option controls', async () => {
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
    expect(screen.getByRole('option', { name: 'Model A · Provider A' }).querySelector('button')).toBeNull();
    fireEvent.focus(second);
    fireEvent.keyDown(second, { key: 'Escape' });
    expect(second).toHaveAttribute('aria-expanded', 'false');
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
      slug: `model-${index}`, name: `Model ${index}`, creator: 'Provider', sourceType: 'Proprietary', evidenceStatus: 'supported', metricCategories: ['coding'],
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
