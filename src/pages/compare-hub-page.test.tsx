import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompareHubPage } from './compare-hub-page';

const UPDATED_AT = '2026-08-05T12:00:00.000Z';

function directoryEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    revision: 'published-r1',
    publishedAt: UPDATED_AT,
    freshness: { status: 'fresh', checkedAt: UPDATED_AT },
    data: {
      compareDirectory: {
        models: [
          { slug: 'model-a', name: 'Model A', creator: 'Provider A', sourceType: 'Proprietary', evidenceStatus: 'supported', utilitySelectable: true, metricCategories: ['coding'] },
          { slug: 'model-b', name: 'Model B', creator: 'Provider B', sourceType: 'Proprietary', evidenceStatus: 'estimated', utilitySelectable: true, metricCategories: ['coding'] },
          { slug: 'generalist', name: 'Generalist', creator: 'Provider C', sourceType: 'Open Weight', evidenceStatus: 'source_only', utilitySelectable: true, metricCategories: ['multimodal'] },
        ],
        indexablePairs: [{ pairSlug: 'model-a-vs-model-b', modelASlug: 'model-a', modelBSlug: 'model-b', featuredRank: 1, sharedMetricCount: 2 }],
      },
    },
    ...overrides,
  };
}

function respondWithDirectory(payload = directoryEnvelope()) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 })));
}

afterEach(() => vi.unstubAllGlobals());

describe('CompareHubPage', () => {
  it('offers popular models immediately and omits internal metadata and category filters', async () => {
    respondWithDirectory();
    render(<CompareHubPage />);

    expect(await screen.findByRole('heading', { name: 'Compare models side by side', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Choose two models to compare benchmark performance, API pricing, context limits, and evidence coverage.')).toBeInTheDocument();
    expect(screen.getByText('Step 1')).toBeInTheDocument();
    expect(screen.getByText('Step 2')).toBeInTheDocument();
    fireEvent.focus(screen.getAllByRole('combobox')[0]);
    expect((await screen.findAllByRole('option')).length).toBeGreaterThan(1);
    expect(screen.queryByLabelText('Metric category')).not.toBeInTheDocument();
    expect(screen.queryByText(/Published revision:/)).not.toBeInTheDocument();
  });

  it('keeps reviewed model pairs as canonical one-click shortcuts', async () => {
    respondWithDirectory();
    render(<CompareHubPage />);

    expect(await screen.findByRole('link', { name: 'Model A vs Model B' })).toHaveAttribute('href', '/compare/model-a-vs-model-b');
  });

  it('places a compact general alert opt-in beside model selection in one tools group', async () => {
    respondWithDirectory();
    render(<CompareHubPage />);

    const tools = await screen.findByRole('group', { name: 'Comparison tools' });
    const selectorPanel = within(tools).getByRole('region', { name: 'Choose a model pair' });
    const alertsPanel = within(tools).getByRole('complementary', { name: 'Model and price alerts' });
    const alerts = within(alertsPanel).getByRole('checkbox', { name: 'Notify me when new models are added to TokenBench.' });
    expect(alerts).not.toBeChecked();
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();
    expect(Array.from(tools.children)).toEqual([selectorPanel, alertsPanel]);
  });

  it('does not create selection controls when the published directory is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Benchmark data unavailable' }), { status: 503 })));
    render(<CompareHubPage />);

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Unavailable'));
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
