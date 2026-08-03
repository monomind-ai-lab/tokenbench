import { describe, expect, it, vi } from 'vitest';
import worker, { buildManualSubscriptionSource, parseOpenCodeModels, parseOpenRouterModels, publishValidatedSource, recordRefreshFailure } from './index';

describe('catalog ingestion', () => {
  it('parses official OpenRouter pricing into integer micro-dollars per million', () => {
    expect(parseOpenRouterModels({ data: [{ id: 'openai/gpt-4o', name: 'GPT-4o', pricing: { prompt: '0.0000025', completion: '0.00001', input_cache_read: '0.00000125' } }] }, '2026-08-03T00:00:00.000Z'))
      .toMatchObject({ modelOffers: [{ id: 'openai:openai/gpt-4o:openrouter', inputMicroDollarsPerMillion: 2_500_000, cachedInputMicroDollarsPerMillion: 1_250_000, outputMicroDollarsPerMillion: 10_000_000 }] });
  });

  it('rejects malformed official adapter payloads', () => {
    expect(() => parseOpenCodeModels({ data: [{ id: 'missing-prices', name: 'Missing prices' }] }, '2026-08-03T00:00:00.000Z'))
      .toThrow('OpenCode model pricing is required');
  });

  it('uses the Zen pay-as-you-go catalog instead of the separate OpenCode Go subscription route', () => {
    expect(parseOpenCodeModels({ data: [{ id: 'opencode/zen', name: 'Zen', pricing: { input: '0.000001', output: '0.000002' } }] }, '2026-08-03T00:00:00.000Z').source.sourceUrl)
      .toBe('https://opencode.ai/zen/v1/models');
  });

  it('rejects zero-offer upstream payloads so they cannot replace a last-known-good revision', () => {
    expect(() => parseOpenRouterModels({ data: [] }, '2026-08-03T00:00:00.000Z'))
      .toThrow('OpenRouter payload must contain at least one model offer');
    expect(() => parseOpenCodeModels({ data: [] }, '2026-08-03T00:00:00.000Z'))
      .toThrow('OpenCode payload must contain at least one model offer');
  });

  it('accepts equivalent official decimal price strings with trailing zero precision', () => {
    const payload = { data: [{ id: 'openai/gpt-4o', name: 'GPT-4o', pricing: { prompt: '0.000002500000000', completion: '0.000010000000000' } }] };
    expect(parseOpenRouterModels(payload, '2026-08-03T00:00:00.000Z').modelOffers[0])
      .toMatchObject({ inputMicroDollarsPerMillion: 2_500_000, outputMicroDollarsPerMillion: 10_000_000 });
  });

  it('builds source-linked manually verified subscription offers instead of an empty source', () => {
    expect(buildManualSubscriptionSource('openai', '2026-08-03T00:00:00.000Z'))
      .toMatchObject({ source: { id: 'openai-subscription', confidence: 'manual_verified' }, plans: expect.arrayContaining([expect.objectContaining({ id: 'openai:pro-5x', monthlyCostMicroDollars: 100_000_000, sourceId: 'openai-subscription' })]) });
  });

  it('retains only currently verified manual subscription prices', () => {
    expect(buildManualSubscriptionSource('alibaba', '2026-08-03T00:00:00.000Z').plans)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: 'alibaba:coding-plan-pro', monthlyCostMicroDollars: 50_000_000 })]));
    expect(buildManualSubscriptionSource('xai', '2026-08-03T00:00:00.000Z').plans).toEqual([]);
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

  it('records an actionable source refresh error without publishing a replacement revision', async () => {
    const calls: string[] = [];
    await recordRefreshFailure({ prepare(sql: string) { return { bind: (...values: unknown[]) => ({ sql, values }) }; }, batch: async (statements: { sql: string; values: unknown[] }[]) => { calls.push(...statements.map(({ sql, values }) => `${sql}:${values.join('|')}`)); } }, 'opencode-zen', 'timeout', '2026-08-03T00:00:00.000Z');
    expect(calls.join('\n')).toContain('last_error');
    expect(calls.join('\n')).not.toContain("publication_state = 'published'");
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

  it.each([
    ['malformed JSON', async () => { throw new Error('unexpected HTML response'); }, 'unexpected HTML response'],
    ['changed schema', async () => ({ models: [] }), 'OpenRouter payload must contain data'],
    ['duplicate offer ids', async () => ({ data: [
      { id: 'openai/gpt-4o', name: 'GPT-4o', pricing: { prompt: '0.0000025', completion: '0.00001' } },
      { id: 'openai/gpt-4o', name: 'GPT-4o duplicate', pricing: { prompt: '0.0000025', completion: '0.00001' } },
    ] }), 'Duplicate model offer id: openai:openai/gpt-4o:openrouter'],
  ])('preserves active publication and records refresh state for %s upstream data', async (_caseName, json, expectedError) => {
    const state = { activeRevision: 'rev-known-good', lastError: '' };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: true, status: 200, json })) as unknown as typeof fetch;
    const db = {
      prepare(sql: string) { return { bind: (...values: unknown[]) => ({ sql, values }) }; },
      async batch(statements: { sql: string; values: unknown[] }[]) {
        const joined = statements.map(({ sql }) => sql).join('\n');
        if (joined.includes('source_refresh_state')) state.lastError = String(statements[0].values.at(-1));
        else throw new Error('unexpected publication attempt');
      },
    };
    let work: Promise<unknown> | undefined;
    try {
      await worker.scheduled({ cron: '0 */6 * * *' }, { CATALOG_DB: db, SOURCE_SNAPSHOTS: { put: async () => undefined }, AUTOMATED_SOURCE_IDS: 'openrouter-models' }, { waitUntil: (promise) => { work = promise; } });
      await work;
      expect(state).toEqual({ activeRevision: 'rev-known-good', lastError: expect.stringContaining(expectedError) });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('uses the AbortController timeout and leaves state unchanged when the upstream stalls', async () => {
    vi.useFakeTimers();
    const state = { activeRevision: 'rev-known-good', lastError: '' };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((_url, init) => new Promise((_resolve, reject) => {
      (init?.signal as AbortSignal).addEventListener('abort', () => reject(new Error(String(init?.signal?.reason))));
    })) as typeof fetch;
    const db = {
      prepare(sql: string) { return { bind: (...values: unknown[]) => ({ sql, values }) }; },
      async batch(statements: { sql: string; values: unknown[] }[]) { state.lastError = String(statements[0].values.at(-1)); },
    };
    let work: Promise<unknown> | undefined;
    try {
      await worker.scheduled({ cron: '0 */6 * * *' }, { CATALOG_DB: db, SOURCE_SNAPSHOTS: { put: async () => undefined }, AUTOMATED_SOURCE_IDS: 'openrouter-models' }, { waitUntil: (promise) => { work = promise; } });
      await vi.advanceTimersByTimeAsync(20_000);
      await work;
      expect(state).toEqual({ activeRevision: 'rev-known-good', lastError: expect.stringContaining('upstream timeout') });
    } finally {
      globalThis.fetch = originalFetch;
      vi.useRealTimers();
    }
  });

  it('treats D1 publication as atomic: a failed candidate keeps the active revision and records the error', async () => {
    const state = { activeRevision: 'rev-known-good', lastError: '' };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: true, status: 200, json: async () => ({ data: [{ id: 'openai/gpt-4o', name: 'GPT-4o', pricing: { prompt: '0.0000025', completion: '0.00001' } }] }) })) as unknown as typeof fetch;
    const db = {
      prepare(sql: string) { return { bind: (...values: unknown[]) => ({ sql, values }) }; },
      async batch(statements: { sql: string; values: unknown[] }[]) {
        const joined = statements.map(({ sql }) => sql).join('\n');
        if (joined.includes('publication_state')) throw new Error('D1 transaction rolled back');
        state.lastError = String(statements[0].values.at(-1));
      },
    };
    let work: Promise<unknown> | undefined;
    try {
      await worker.scheduled({ cron: '0 */6 * * *' }, { CATALOG_DB: db, SOURCE_SNAPSHOTS: { put: async () => undefined }, AUTOMATED_SOURCE_IDS: 'openrouter-models' }, { waitUntil: (promise) => { work = promise; } });
      await work;
      expect(state).toEqual({ activeRevision: 'rev-known-good', lastError: 'D1 transaction rolled back' });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('does not fetch an upstream catalog until its source is explicitly allowlisted', async () => {
    const fetchImpl = vi.fn();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl as unknown as typeof fetch;
    const errors: string[] = [];
    let work: Promise<unknown> | undefined;
    try {
      await worker.scheduled({ cron: '0 */6 * * *' }, {
        CATALOG_DB: {
          prepare(sql: string) { return { bind: (...values: unknown[]) => ({ sql, values }) }; },
          async batch(statements: { values: unknown[] }[]) { errors.push(String(statements[0].values.at(-1))); },
        },
        SOURCE_SNAPSHOTS: { put: async () => undefined },
      }, { waitUntil: (promise) => { work = promise; } });
      await work;
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(errors).toEqual(['openrouter-models is not allowlisted for automated refresh']);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
