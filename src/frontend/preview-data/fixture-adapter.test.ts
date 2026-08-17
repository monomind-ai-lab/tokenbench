import { describe, expect, it } from 'vitest';
import { createFixtureAdapter, fixtureAdapter } from './fixture-adapter';

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

  it('preserves the requested comparison order', async () => {
    const result = await fixtureAdapter.comparison({ modelIds: ['deepseek-v3', 'gpt-4o'] });
    const slugs = result.data?.models.map((model) => model.identity.availability === 'available' ? model.identity.value.slug : null);

    expect(slugs).toEqual(['deepseek-v3', 'gpt-4o']);
  });

  it('filters lifecycle records from the fetched reference time', async () => {
    const adapter = createFixtureAdapter(() => new Date('2026-08-16T00:00:00.000Z'));

    expect((await adapter.lifecycle({ horizonDays: 44 })).data?.models).toEqual([]);
    expect((await adapter.lifecycle({ horizonDays: 45 })).data?.models).toHaveLength(1);
    const expired = await createFixtureAdapter(() => new Date('2026-10-01T00:00:00.000Z'))
      .lifecycle({ horizonDays: 90 });
    expect(expired).toMatchObject({
      data: { models: [] },
      provenance: [],
    });
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

  it('supplies explicitly labelled illustrative capability evidence for the preview frontier and radar', async () => {
    const result = await fixtureAdapter.profile('gpt-4o');

    expect(result.data?.model.capability).toMatchObject({
      availability: 'available',
      provenance: { label: 'Illustrative prototype data' },
      value: {
        compositeScore: expect.any(Number),
        radar: expect.arrayContaining([
          expect.objectContaining({ label: 'Reasoning', percentile: expect.any(Number) }),
        ]),
      },
    });
  });

  it('supplies the approved top-20 ranking fixture with every weighted capability explicitly evidenced', async () => {
    const result = await fixtureAdapter.rankings({ limit: 20 });
    const claude = result.data?.models.find((entry) => entry.model.id === 'claude-3-5-sonnet')?.model;

    expect(result.data?.models).toHaveLength(20);
    expect(claude?.capability).toMatchObject({
      availability: 'available',
      provenance: { label: 'Illustrative prototype data' },
      value: {
        radar: expect.arrayContaining([
          expect.objectContaining({ key: 'agentic', percentile: 92 }),
          expect.objectContaining({ key: 'coding', percentile: 94 }),
          expect.objectContaining({ key: 'reasoning', percentile: 90 }),
          expect.objectContaining({ key: 'math', percentile: 88 }),
          expect.objectContaining({ key: 'multimodal', percentile: 89 }),
          expect.objectContaining({ key: 'throughput', percentile: 68.33333333333333 }),
        ]),
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

  it('supplies typed long-context price evidence for the subscription comparison', async () => {
    const result = await fixtureAdapter.subscription({ modelId: 'gpt-4o' });
    const pricing = result.data?.models.find((model) => model.id === 'gpt-4o')?.routePricing;

    expect(pricing).toMatchObject({
      availability: 'available',
      value: {
        longContextInputUsdPerMillion: {
          availability: 'available',
          value: 5,
          provenance: {
            label: 'Illustrative prototype data',
            effectiveAt: '2026-08-13T00:00:00.000Z',
          },
        },
      },
    });
  });
});
