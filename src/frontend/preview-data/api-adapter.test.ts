import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createValidatedPreviewDataAdapter, type PreviewDataTransport } from './api-adapter';

function evidence<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), 'contracts/ui-data-contract/v1/evidence', path), 'utf8')) as T;
}

function acceptedTransport(): PreviewDataTransport {
  return {
    request(method) {
      const byMethod = {
        models: 'responses/models.json',
        profile: 'responses/profile.json',
        lifecycle: 'responses/lifecycle.json',
        rankings: 'responses/rankings.mixed-source.json',
        comparison: 'responses/comparison.json',
        subscription: 'responses/subscription.json',
      } as const;
      return Promise.resolve(evidence(byMethod[method]));
    },
  };
}

describe('validated preview data adapter', () => {
  it.each(['models', 'profile', 'lifecycle', 'rankings', 'comparison', 'subscription'] as const)(
    'maps accepted %s evidence to page-facing view models without exposing raw envelopes',
    async (method) => {
      const adapter = createValidatedPreviewDataAdapter(acceptedTransport());
      const queries = {
        models: {},
        profile: 'alpha',
        lifecycle: { horizonDays: 30 },
        rankings: {},
        comparison: { modelIds: ['alpha', 'beta', 'gamma'] },
        subscription: {},
      } as const;

      const result = await adapter[method](queries[method] as never);

      expect(result.contractVersion).toBe('ui-data-contract/v1');
      expect(result).not.toHaveProperty('method');
      expect(result).not.toHaveProperty('sources');
    },
  );

  it('preserves ordered comparison slugs and each mixed-source effective time through the page view model', async () => {
    const adapter = createValidatedPreviewDataAdapter(acceptedTransport());
    const comparison = await adapter.comparison({ modelIds: ['alpha', 'beta', 'gamma'] });
    const rankings = await adapter.rankings({});

    expect(comparison.data?.models.map((model) => model.id)).toEqual(['alpha', 'beta', 'gamma']);
    expect(rankings.effectiveAt).toBeNull();
    expect(new Set(rankings.provenance.map((source) => source.effectiveAt))).toEqual(new Set([
      '2026-08-18T00:00:00.000Z',
      '2026-08-17T00:00:00.000Z',
    ]));
  });
});
