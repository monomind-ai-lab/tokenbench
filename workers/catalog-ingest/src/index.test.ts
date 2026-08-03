import { describe, expect, it } from 'vitest';
import { buildManualSubscriptionSource, parseOpenCodeModels, parseOpenRouterModels, publishValidatedSource } from './index';

describe('catalog ingestion', () => {
  it('parses official OpenRouter pricing into integer micro-dollars per million', () => {
    expect(parseOpenRouterModels({ data: [{ id: 'openai/gpt-4o', name: 'GPT-4o', pricing: { prompt: '0.0000025', completion: '0.00001', input_cache_read: '0.00000125' } }] }, '2026-08-03T00:00:00.000Z'))
      .toMatchObject({ modelOffers: [{ id: 'openai:openai/gpt-4o:openrouter', inputMicroDollarsPerMillion: 2_500_000, cachedInputMicroDollarsPerMillion: 1_250_000, outputMicroDollarsPerMillion: 10_000_000 }] });
  });

  it('rejects malformed official adapter payloads', () => {
    expect(() => parseOpenCodeModels({ data: [{ id: 'missing-prices', name: 'Missing prices' }] }, '2026-08-03T00:00:00.000Z'))
      .toThrow('OpenCode model pricing is required');
  });

  it('accepts equivalent official decimal price strings with trailing zero precision', () => {
    const payload = { data: [{ id: 'openai/gpt-4o', name: 'GPT-4o', pricing: { prompt: '0.000002500000000', completion: '0.000010000000000' } }] };
    expect(parseOpenRouterModels(payload, '2026-08-03T00:00:00.000Z').modelOffers[0])
      .toMatchObject({ inputMicroDollarsPerMillion: 2_500_000, outputMicroDollarsPerMillion: 10_000_000 });
  });

  it('builds source-linked manually verified subscription offers instead of an empty source', () => {
    expect(buildManualSubscriptionSource('openai', '2026-08-03T00:00:00.000Z'))
      .toMatchObject({ source: { id: 'openai-subscription', confidence: 'manual_verified' }, plans: expect.arrayContaining([expect.objectContaining({ id: 'openai:plus', monthlyCostMicroDollars: 20_000_000, sourceId: 'openai-subscription' })]) });
  });

  it('snapshots validated evidence before atomically publishing a revision', async () => {
    const calls: string[] = [];
    const result = await publishValidatedSource({
      db: {
        prepare(sql: string) { return { bind: () => ({ sql }) }; },
        batch: async (statements: { sql: string }[]) => { calls.push(...statements.map(({ sql }) => sql)); },
      },
      snapshots: { put: async (key: string) => { calls.push(`snapshot:${key}`); } },
      source: { source: { id: 'openrouter-models', providerId: 'openrouter', sourceUrl: 'https://openrouter.ai/api/v1/models', observedAt: '2026-08-03T00:00:00.000Z', sourceKind: 'official_json', confidence: 'official' }, plans: [], modelOffers: [] },
      rawPayload: { data: [] },
      now: '2026-08-03T00:00:00.000Z',
    });
    expect(calls[0]).toMatch(/^snapshot:openrouter-models\/2026-08-03\//);
    expect(calls.join('\n')).toContain("publication_state = 'published'");
    expect(result.revision).toMatch(/^rev_/);
  });

  it('leaves the last-known-good revision active when snapshotting fails', async () => {
    await expect(publishValidatedSource({
      db: { prepare: () => ({ bind: () => ({}) }), batch: async () => { throw new Error('must not publish'); } },
      snapshots: { put: async () => { throw new Error('R2 unavailable'); } },
      source: { source: { id: 'openrouter-models', providerId: 'openrouter', sourceUrl: 'https://openrouter.ai/api/v1/models', observedAt: '2026-08-03T00:00:00.000Z', sourceKind: 'official_json', confidence: 'official' }, plans: [], modelOffers: [] },
      rawPayload: { data: [] }, now: '2026-08-03T00:00:00.000Z',
    })).rejects.toThrow('R2 unavailable');
  });

  it('copies other validated source records into the candidate revision before publication', async () => {
    const calls: string[] = [];
    await publishValidatedSource({
      db: { prepare(sql: string) { return { bind: () => ({ sql }) }; }, batch: async (statements: { sql: string }[]) => { calls.push(...statements.map(({ sql }) => sql)); } },
      snapshots: { put: async () => undefined },
      source: { source: { id: 'openrouter-models', providerId: 'openrouter', sourceUrl: 'https://openrouter.ai/api/v1/models', observedAt: '2026-08-03T00:00:00.000Z', sourceKind: 'official_json', confidence: 'official' }, plans: [], modelOffers: [] },
      rawPayload: { data: [] }, now: '2026-08-03T00:00:00.000Z',
    });
    expect(calls.join('\n')).toContain('INSERT INTO model_offers (revision, id, provider_id, display_name, model_id, pricing_basis');
    expect(calls.join('\n')).toContain('source_id != ?');
  });
});
