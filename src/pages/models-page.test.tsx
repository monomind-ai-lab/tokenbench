import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { parseModelDirectoryEnvelope, type ModelDirectoryEnvelope } from '../frontend/model-directory-contracts';
import { ModelsPage, ModelsApp } from './models-page';

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
    expect(screen.getAllByRole('link', { name: 'GPT-5.6 Sol' })).toHaveLength(2);
    expect(screen.getAllByText('81.48')).toHaveLength(2);
    expect(screen.getAllByText('Coding · 77.95')).toHaveLength(2);
  });

  it('renders retained records with an explicit archived state', () => {
    render(<ModelsPage envelope={directoryEnvelope([model('retained-model', 'Retained Model', { status: 'archived', weeklyRank: null, overallScore: null, overallRank: null })])} />);
    expect(screen.getAllByText('Archived', { selector: '.model-status' })).toHaveLength(2);
    expect(screen.getAllByText('Not in current top 100')).toHaveLength(2);
  });

  it('preserves the visible envelope when a filtered search fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);
    window.history.replaceState({}, '', '/models/');
    render(<ModelsApp initialEnvelope={directoryEnvelope()} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search retained models' }), { target: { value: 'missing' } });
    fireEvent.submit(screen.getByRole('searchbox', { name: 'Search retained models' }).closest('form')!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getAllByRole('link', { name: 'GPT-5.6 Sol' })).toHaveLength(2);
    expect(screen.getByRole('status')).toHaveTextContent('Search unavailable');
  });
});
