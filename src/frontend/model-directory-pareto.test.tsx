import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CompareProvider } from './compare-state';
import { ModelDirectoryPareto, applyParetoVisibility, buildModelParetoRows } from './model-directory-pareto';
import type { ModelDirectoryEntry } from './model-directory-contracts';

vi.mock('./charts/chart-js', () => ({ createTokenBenchChart: vi.fn(() => ({ destroy: vi.fn() })) }));

const UPDATED_AT = '2026-08-10T01:00:00.000Z';

function entry(modelId: string, overrides: Partial<ModelDirectoryEntry> = {}): ModelDirectoryEntry {
  return {
    modelKey: modelId, canonicalSlug: modelId, displayName: modelId, creator: 'Provider', sourceType: 'Proprietary', reasoningType: null,
    familyId: null, variantId: null, firstSeenRevision: 'r1', firstSeenAt: UPDATED_AT, lastSeenRevision: 'r1', lastSeenAt: UPDATED_AT,
    latestProfileRevision: 'r1', status: 'current', sourceId: 'benchlm', sourceModelId: modelId, updatedAt: UPDATED_AT,
    weeklyRank: 1, overallScore: 80, overallRank: 1, strongestCategory: null,
    representativePrice: { sourceId: 'openrouter', providerId: 'provider', routeId: `route:${modelId}`, sourceModelId: modelId, canonicalSlug: modelId, inputUsdPerMillion: 1, cachedInputUsdPerMillion: null, outputUsdPerMillion: 4, contextWindowTokens: 128000, maxInputTokens: null, maxOutputTokens: 16000, inputModalities: ['text'], outputModalities: ['text'], supportedParameters: ['tools'], verificationStatus: 'primary', sourceArtifactId: 'openrouter-models', sourceUrl: 'https://openrouter.ai/models', observedAt: UPDATED_AT },
    evidenceStatus: 'supported', profileRevision: 'r1', profileFallback: 'none', profilePublishedAt: UPDATED_AT, profileCheckedAt: UPDATED_AT,
    ...overrides,
  };
}

describe('model directory Pareto', () => {
  it('excludes missing axes without turning them into zero-valued points', () => {
    const rows = buildModelParetoRows([
      entry('frontier'),
      entry('dominated', { overallScore: 70, representativePrice: { ...entry('dominated').representativePrice!, inputUsdPerMillion: 2, outputUsdPerMillion: 5 } }),
      entry('missing-price', { representativePrice: null }),
    ], { inputWeight: 3, outputWeight: 1 });
    expect(rows.excluded.map((row) => row.modelId)).toContain('missing-price');
    expect(rows.plotted.every((row) => Number.isFinite(row.cost) && Number.isFinite(row.score))).toBe(true);
    expect(applyParetoVisibility(rows.plotted, true).every((row) => row.frontier)).toBe(true);
  });

  it('makes the frontier filter, exact table, inspection, and compare action available together', () => {
    render(<CompareProvider><ModelDirectoryPareto models={[entry('alpha'), entry('beta', { overallScore: 70 })]} /></CompareProvider>);
    expect(screen.getByRole('table', { name: 'Pareto values' })).toHaveTextContent('alpha');
    fireEvent.click(screen.getByRole('button', { name: 'Frontier only' }));
    expect(screen.getByRole('table', { name: 'Pareto values' })).toHaveTextContent('alpha');
    fireEvent.click(screen.getByRole('button', { name: 'Inspect alpha' }));
    expect(screen.getByRole('dialog', { name: 'alpha' })).toHaveTextContent('Model inspection');
    fireEvent.click(screen.getByRole('button', { name: 'Close inspection' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compare alpha' }));
    expect(screen.getByRole('status')).toHaveTextContent('Added alpha to comparison');
  });
});
