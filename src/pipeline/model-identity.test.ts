import { describe, expect, it } from 'vitest';
import { publishableModelIdentity, type ModelSourceIdentity } from './model-identity';

function identity(overrides: Partial<ModelSourceIdentity> = {}): ModelSourceIdentity {
  return {
    sourceId: 'livebench',
    sourceModelId: 'openai/gpt-4.1',
    modelConfigurationId: 'openai:gpt-4.1',
    matchKind: 'exact',
    reviewStatus: 'verified',
    reviewedBy: null,
    evidenceUrl: null,
    effectiveFromRevision: 'livebench-2026-06-25',
    effectiveToRevision: null,
    ...overrides,
  };
}

describe('reviewed model-source identities', () => {
  it('prevents an unreviewed fuzzy proposal from becoming a published mapping', () => {
    expect(publishableModelIdentity(identity({
      modelConfigurationId: null,
      matchKind: 'proposal',
      reviewStatus: 'needs_review',
    }))).toBe(false);
  });

  it('keeps an unmatched LiveBench configuration valid but unpublished', () => {
    expect(publishableModelIdentity(identity({
      modelConfigurationId: null,
      matchKind: 'proposal',
      reviewStatus: 'needs_review',
    }))).toBe(false);
  });

  it('allows verified exact and fully reviewed mappings', () => {
    expect(publishableModelIdentity(identity())).toBe(true);
    expect(publishableModelIdentity(identity({
      matchKind: 'reviewed',
      reviewedBy: 'alice',
      evidenceUrl: 'https://review.example/model/openai-gpt-4-1',
    }))).toBe(true);
  });

  it.each([
    ['exact', { modelConfigurationId: null }],
    ['exact', { modelConfigurationId: '' }],
    ['reviewed', {
      modelConfigurationId: null,
      matchKind: 'reviewed' as const,
      reviewedBy: 'alice',
      evidenceUrl: 'https://review.example/model/openai-gpt-4-1',
    }],
    ['reviewed', {
      modelConfigurationId: '',
      matchKind: 'reviewed' as const,
      reviewedBy: 'alice',
      evidenceUrl: 'https://review.example/model/openai-gpt-4-1',
    }],
  ])('never publishes a verified %s identity without a target configuration', (_matchKind, overrides) => {
    expect(publishableModelIdentity(identity(overrides))).toBe(false);
  });

  it('never publishes incomplete reviewed or closed mappings', () => {
    expect(publishableModelIdentity(identity({ matchKind: 'reviewed' }))).toBe(false);
    expect(publishableModelIdentity(identity({ effectiveToRevision: 'livebench-2026-07-01' }))).toBe(false);
  });
});
