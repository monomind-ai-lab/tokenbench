import { describe, expect, it } from 'vitest';
import { fixtureAdapter } from './fixture-adapter';

describe('fixtureAdapter', () => {
  it('preserves unavailable facts instead of inventing values', async () => {
    const result = await fixtureAdapter.lifecycle({ horizonDays: 90 });

    expect(result.contractVersion).toBe('ui-data-contract/v1');
    expect(result.data?.models[0]?.replacement).toEqual({
      availability: 'unavailable',
      reason: 'No approved replacement source',
    });
  });

  it('keeps fetched and mixed effective times distinct', async () => {
    const result = await fixtureAdapter.comparison({ modelIds: ['gpt-4o', 'deepseek-v3'] });

    expect(result.fetchedAt).toMatch(/Z$/);
    expect(new Set(result.provenance.map((source) => source.effectiveAt)).size).toBeGreaterThan(1);
  });

  it('returns an unavailable profile contract for an unknown slug', async () => {
    const result = await fixtureAdapter.profile('not-an-approved-fixture');

    expect(result).toMatchObject({
      contractVersion: 'ui-data-contract/v1',
      status: 'unavailable',
      data: null,
      reason: 'No approved fixture for not-an-approved-fixture',
    });
  });

  it('marks absent cache-write and sunset facts unavailable', async () => {
    const result = await fixtureAdapter.profile('gpt-4o');

    expect(result.data?.model.routePricing).toMatchObject({
      availability: 'available',
      value: {
        cache: {
          availability: 'available',
          value: {
            writeUsdPerMillion: {
              availability: 'unavailable',
              reason: 'No approved cache-write price source',
            },
          },
        },
      },
    });
    expect(result.data?.model.lifecycle).toMatchObject({
      availability: 'available',
      value: {
        sunsetOn: {
          availability: 'unavailable',
          reason: 'No approved sunset source',
        },
      },
    });
  });

  it('does not substitute another model when subscription economics are unavailable', async () => {
    const result = await fixtureAdapter.subscription({ modelId: 'not-an-approved-fixture' });

    expect(result.data?.selectedModelTaskEconomics).toEqual({
      availability: 'unavailable',
      reason: 'No approved model task-economics source',
    });
  });
});
