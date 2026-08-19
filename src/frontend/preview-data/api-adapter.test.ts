import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createValidatedPreviewDataAdapter, type PreviewDataTransport } from './api-adapter';
import { ACCEPTED_CUSTOM_RANKING_QUERY, ACCEPTED_LIFECYCLE_AS_OF, ACCEPTED_SUBSCRIPTION_QUERY } from './contracts';

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
        lifecycle: { asOf: ACCEPTED_LIFECYCLE_AS_OF, horizonDays: 30 },
        rankings: {},
        comparison: { modelIds: ['alpha', 'beta', 'gamma'] },
        subscription: ACCEPTED_SUBSCRIPTION_QUERY,
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
    const rankings = await adapter.rankings(ACCEPTED_CUSTOM_RANKING_QUERY);

    expect(comparison.data?.models.map((model) => model.id)).toEqual(['alpha', 'beta', 'gamma']);
    expect(rankings.effectiveAt).toBeNull();
    expect(new Set(rankings.provenance.map((source) => source.effectiveAt))).toEqual(new Set([
      '2026-08-18T00:00:00.000Z',
      '2026-08-17T00:00:00.000Z',
    ]));
  });

  it('preserves an accepted retired lifecycle state without relabeling it as scheduled', async () => {
    const lifecycle = evidence<Record<string, unknown>>('responses/lifecycle.json');
    lifecycle.data = {
      asOf: '2026-08-18T00:00:00.000Z',
      horizonDays: 30,
      models: [{
        identity: { configurationId: 'provider-0:alpha', displayName: 'ALPHA', organization: 'Provider 0', slug: 'alpha' },
        status: { availability: 'available', sourceRefs: ['fixture:primary-2026-08-18'], value: 'retired' },
        events: [],
        replacement: {
          availability: 'unavailable',
          value: null,
          reason: 'No accepted replacement evidence.',
          sourceRefs: ['fixture:primary-2026-08-18'],
        },
      }],
    };
    const adapter = createValidatedPreviewDataAdapter({
      request(method) {
        return Promise.resolve(method === 'lifecycle' ? lifecycle : evidence('responses/models.json'));
      },
    });

    await expect(adapter.lifecycle({ asOf: '2026-08-18T00:00:00.000Z', horizonDays: 30 })).resolves.toMatchObject({
      data: { models: [expect.objectContaining({ lifecycle: expect.objectContaining({ value: expect.objectContaining({ status: 'Retired' }) }) })] },
    });
  });

  it('keeps benchmark-only ranking rows usable when no catalog route has been joined', async () => {
    const rankings = evidence<Record<string, unknown>>('responses/rankings.json');
    const data = rankings.data as { rows: { model: Record<string, unknown> }[] };
    for (const row of data.rows) {
      row.model.selectedRouteId = null;
      row.model.selectedRoute = null;
    }
    const adapter = createValidatedPreviewDataAdapter({
      request(method) {
        return Promise.resolve(method === 'rankings' ? rankings : evidence('responses/models.json'));
      },
    });

    const result = await adapter.rankings({});

    expect(result.data?.models).toHaveLength(3);
    expect(result.data?.models[0]?.model.capability.availability).toBe('available');
    expect(result.data?.models[0]?.model.routePricing).toEqual({
      availability: 'unavailable',
      reason: 'No accepted route price is available.',
    });
    expect(result.data?.models[0]?.model.runtime).toEqual({
      availability: 'unavailable',
      reason: 'No accepted runtime observation is available.',
    });
  });
});
