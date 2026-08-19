import { describe, expect, it } from 'vitest';
import { validateLiveBenchRelease } from './contracts';

describe('validateLiveBenchRelease', () => {
  it('requires a complete score and economics matrix', () => {
    expect(() => validateLiveBenchRelease({
      schemaVersion: 1,
      releaseId: '2026-06-25',
      sourceCommit: 'a'.repeat(40),
      observedAt: '2026-08-17T00:17:00.000Z',
      categories: [{ categoryId: 'reasoning', label: 'Reasoning', taskIds: ['task-a'] }],
      tasks: [{ taskId: 'task-a', label: 'task-a', categoryId: 'reasoning' }],
      models: [{
        configurationId: 'model-a',
        sourceModelId: 'model-a',
        displayName: 'Model A',
        organization: 'Example',
        openWeights: null,
        reasoner: null,
        isDerivativeFinetune: false,
        baseConfigurationId: null,
        lineageSourceUrl: null,
      }],
      taskScores: [],
      taskEconomics: [],
    })).toThrow(/score matrix/i);
  });
});
