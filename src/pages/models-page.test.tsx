import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CompareProvider } from '../frontend/compare-state';
import { parseModelDirectoryEnvelope, type ModelDirectoryEnvelope } from '../frontend/model-directory-contracts';
import { ModelsPage, ModelsApp } from './models-page';

vi.mock('../frontend/charts/chart-js', () => ({ createTokenBenchChart: vi.fn(() => ({ destroy: vi.fn() })) }));

const UPDATED_AT = '2026-08-10T01:00:00.000Z';

function model(slug: string, name: string, overrides: Record<string, unknown> = {}) {
  return {
    modelKey: `benchlm:${slug}`, canonicalSlug: slug, displayName: name, creator: 'OpenAI', sourceType: 'Proprietary', reasoningType: null,
    familyId: null, variantId: null, firstSeenRevision: 'benchlm-r1', firstSeenAt: UPDATED_AT, lastSeenRevision: 'benchlm-r1', lastSeenAt: UPDATED_AT,
    latestProfileRevision: 'benchlm-r1', status: 'current', sourceId: 'benchlm', sourceModelId: slug, updatedAt: UPDATED_AT,
    weeklyRank: 1, overallScore: 81.48, overallRank: 1,
    strongestCategory: { key: 'coding', metricKey: 'benchlm:category:coding', label: 'Coding', score: 77.95, rawScore: null, rank: 3, fieldSize: 31, percentile: 93.33, evidenceStatus: 'supported', benchmarkCount: 12, rankingEligible: true, unit: 'score', sourceId: 'benchlm' },
    representativePrice: { sourceId: 'openrouter', providerId: 'openai', routeId: `openrouter:${slug}`, sourceModelId: slug, canonicalSlug: slug, inputUsdPerMillion: 1, cachedInputUsdPerMillion: null, outputUsdPerMillion: 4, contextWindowTokens: 128000, maxInputTokens: null, maxOutputTokens: 16000, inputModalities: ['text'], outputModalities: ['text'], supportedParameters: ['tools'], verificationStatus: 'primary', sourceArtifactId: 'openrouter-models', sourceUrl: 'https://openrouter.ai/models', observedAt: UPDATED_AT },
    evidenceStatus: 'supported', profileRevision: 'benchlm-r1', profileFallback: 'none', profilePublishedAt: UPDATED_AT, profileCheckedAt: UPDATED_AT,
    ...overrides,
  };
}

function directoryEnvelope(rows = [model('gpt-5-6-sol', 'GPT-5.6 Sol')]): ModelDirectoryEnvelope {
  return parseModelDirectoryEnvelope({
    revision: 'benchlm-r1', publishedAt: UPDATED_AT, freshness: { status: 'fresh', checkedAt: UPDATED_AT },
    attribution: [{ sourceId: 'benchlm', label: 'BenchLM', url: 'https://benchlm.ai/leaderboard', updatedAt: UPDATED_AT }],
    data: { week: { weekStart: '2026-08-10T00:00:00.000Z', benchmarkRevision: 'benchlm-r1', sourceSnapshotId: 'benchlm-public', methodologyVersion: 'bench-align-v5', generatedAt: UPDATED_AT }, models: rows, nextCursor: null },
  })!;
}

describe('popular models directory', () => {
  it('keeps table and mobile cards fact-equivalent', () => {
    render(<ModelsPage envelope={directoryEnvelope()} />);
    const cards = screen.getByTestId('models-mobile-cards');
    expect(within(cards).getAllByRole('link', { name: 'GPT-5.6 Sol' })).toHaveLength(1);
    expect(within(cards).getAllByText('81.48')).toHaveLength(1);
    expect(within(cards).getAllByText('Coding · 77.95')).toHaveLength(1);
  });

  it('links every model row and card to the model profile page', () => {
    const firstRender = render(<ModelsPage envelope={directoryEnvelope([model('gpt-5-6-sol', 'GPT-5.6 Sol'), model('claude-sonnet-5', 'Claude Sonnet 5')])} />);
    const links = within(screen.getByTestId('models-mobile-cards')).getAllByRole('link').filter((link) => link.classList.contains('model-name-link'));
    expect(links).toHaveLength(2);
    expect(links.every((link) => link.getAttribute('href')?.startsWith('/models/'))).toBe(true);
    firstRender.unmount();
    render(<ModelsPage envelope={directoryEnvelope([model('gpt-5-6-sol', 'GPT-5.6 Sol'), model('claude-sonnet-5', 'Claude Sonnet 5')])} query={{ q: '', creator: null, provider: null, modality: null, sourceType: null, evidenceStatus: null, status: 'current', sort: 'rank', view: 'table', page: 1 }} />);
    const table = screen.getByTestId('models-desktop-table');
    expect(within(table).getByRole('link', { name: 'GPT-5.6 Sol' })).toHaveAttribute('href', '/models/gpt-5-6-sol/');
    expect(within(table).getByRole('link', { name: 'Claude Sonnet 5' })).toHaveAttribute('href', '/models/claude-sonnet-5/');
    const rows = within(table).getAllByRole('row');
    expect(rows.length).toBeGreaterThan(2);
  });

  it('renders retained records with an explicit archived state', () => {
    render(<ModelsPage envelope={directoryEnvelope([model('retained-model', 'Retained Model', { status: 'archived', weeklyRank: null, overallScore: null, overallRank: null })])} query={{ q: '', creator: null, provider: null, modality: null, sourceType: null, evidenceStatus: null, status: 'archived', sort: 'rank', view: 'cards', page: 1 }} />);
    expect(screen.getAllByText('Archived', { selector: '.model-status' })).toHaveLength(1);
    expect(screen.getAllByText('Not in current top 100')).toHaveLength(1);
  });

  it('keeps compare selection explicit when a fourth catalog model is requested', () => {
    render(<CompareProvider><ModelsPage envelope={directoryEnvelope([
      model('alpha', 'Alpha'), model('beta', 'Beta'), model('gamma', 'Gamma'), model('delta', 'Delta'),
    ])} /></CompareProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Compare Alpha from catalog' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compare Beta from catalog' }));
    expect(screen.getByRole('complementary', { name: 'Model comparator' })).toHaveTextContent('2 models selected');
    expect(screen.getByRole('img', { name: 'Six-axis comparison radar' })).toBeInTheDocument();
    expect(screen.getByText(/Score delta/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Compare Gamma from catalog' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compare Delta from catalog' }));
    expect(screen.getByRole('dialog', { name: 'Choose a model to replace' })).toHaveTextContent('Alpha');
    fireEvent.click(screen.getByRole('button', { name: 'Replace Alpha with Delta' }));
    expect(screen.getByRole('complementary', { name: 'Model comparator' })).toHaveTextContent('Delta');
  });

  it('preserves the visible envelope when a filtered search fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);
    window.history.replaceState({}, '', '/models/');
    render(<ModelsApp initialEnvelope={directoryEnvelope()} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search retained models' }), { target: { value: 'missing' } });
    fireEvent.submit(screen.getByRole('searchbox', { name: 'Search retained models' }).closest('form')!);
    await waitFor(() => expect(screen.getAllByRole('status').some((status) => status.textContent?.includes('Search unavailable'))).toBe(true));
    expect(within(screen.getByTestId('models-mobile-cards')).getAllByRole('link', { name: 'GPT-5.6 Sol' })).toHaveLength(1);
    expect(screen.getByText('Search unavailable. Showing the last validated model list.')).toBeInTheDocument();
  });
});
