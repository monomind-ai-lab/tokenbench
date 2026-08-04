import { describe, expect, it, vi } from 'vitest';
import worker, { buildManualSubscriptionSource, parseOpenCodeCatalog, parseOpenRouterModels, publishValidatedSource, recordRefreshFailure } from './index';

interface Statement { sql: string; values: unknown[] }
interface RefreshState { lastSuccessAt: string | null; lastRevision: string | null; lastError: string | null }

function createStatefulD1(options: { failAfterStatement?: number } = {}) {
  const state = {
    activeRevision: 'rev-known-good',
    revisions: { 'rev-known-good': 'published' as const } as Record<string, 'published' | 'pending' | 'superseded'>,
    rows: ['rev-known-good:seed'],
    refreshState: {
      'openrouter-models': { lastSuccessAt: '2026-08-03T00:00:00.000Z', lastRevision: 'rev-known-good', lastError: null },
    } as Record<string, RefreshState>,
    batchCalls: 0,
  };
  let lastStagedState: typeof state | undefined;

  const apply = (draft: typeof state, statement: Statement) => {
    const { sql, values } = statement;
    if (sql.startsWith('INSERT INTO catalog_revisions')) {
      draft.revisions[String(values[0])] = 'pending';
    } else if (sql.includes('INSERT INTO source_records') && sql.includes('VALUES')) {
      draft.rows.push(`${values[0]}:source:${values[1]}`);
    } else if (sql.includes('INSERT INTO plan_offers') && sql.includes('VALUES')) {
      draft.rows.push(`${values[0]}:plan:${values[1]}`);
    } else if (sql.includes('INSERT INTO model_offers') && sql.includes('VALUES')) {
      draft.rows.push(`${values[0]}:model:${values[1]}`);
    } else if (sql.includes("UPDATE catalog_revisions SET publication_state = 'superseded'")) {
      Object.keys(draft.revisions).forEach((revision) => {
        if (draft.revisions[revision] === 'published') draft.revisions[revision] = 'superseded';
      });
    } else if (sql.includes("UPDATE catalog_revisions SET publication_state = 'published'")) {
      draft.revisions[String(values[0])] = 'published';
    } else if (sql.includes('catalog_publication_state')) {
      draft.activeRevision = String(values[0]);
    } else if (sql.includes('source_refresh_state')) {
      const sourceId = String(values[0]);
      const refresh = draft.refreshState[sourceId] ?? { lastSuccessAt: null, lastRevision: null, lastError: null };
      if (sql.includes('last_error = excluded.last_error')) {
        refresh.lastError = String(values[1]);
      } else {
        refresh.lastSuccessAt = String(values[1]);
        refresh.lastRevision = String(values[2]);
        refresh.lastError = null;
      }
      draft.refreshState[sourceId] = refresh;
    }
  };

  return {
    state,
    db: {
      prepare(sql: string) { return { bind: (...values: unknown[]) => ({ sql, values }) }; },
      async batch(statements: unknown[]) {
        state.batchCalls += 1;
        const draft = structuredClone(state);
        for (const [index, statement] of (statements as Statement[]).entries()) {
          apply(draft, statement);
          if (options.failAfterStatement === index + 1) {
            lastStagedState = structuredClone(draft);
            throw new Error('D1 transaction rolled back');
          }
        }
        Object.assign(state, draft);
      },
    },
    get lastStagedState() { return lastStagedState; },
  };
}

function stateSnapshot(database: ReturnType<typeof createStatefulD1>) {
  return {
    activeRevision: database.state.activeRevision,
    pendingRevisionIds: Object.entries(database.state.revisions).filter(([, publicationState]) => publicationState === 'pending').map(([revision]) => revision),
    candidateRows: database.state.rows.filter((row) => row.startsWith('rev_')),
    refreshState: database.state.refreshState['openrouter-models'],
  };
}

const openRouterPayload = { data: [{ id: 'openai/gpt-4o', name: 'GPT-4o', pricing: { prompt: '0.0000025', completion: '0.00001' } }] };
const openCodeModelsPayload = { data: [{ id: 'opencode/zen', object: 'model', owned_by: 'opencode' }] };
const openCodePricingHtml = `
  <table><tr><th>Model</th><th>Model ID</th><th>Endpoint</th><th>AI SDK Package</th></tr>
    <tr><td>Zen</td><td>opencode/zen</td><td>https://opencode.ai/zen/v1/responses</td><td>@ai-sdk/openai</td></tr></table>
  <table><tr><th>Model</th><th>Input</th><th>Output</th><th>Cached Read</th><th>Cached Write</th></tr>
    <tr><td>Zen</td><td>$1.00</td><td>$2.00</td><td>$0.20</td><td>-</td></tr></table>`;

async function runScheduledOpenRouter({
  database,
  json = async () => openRouterPayload,
  put = async () => undefined,
}: {
  database: ReturnType<typeof createStatefulD1>;
  json?: () => Promise<unknown>;
  put?: () => Promise<unknown>;
}) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({ ok: true, status: 200, json })) as unknown as typeof fetch;
  let work: Promise<unknown> | undefined;
  try {
    await worker.scheduled(
      { cron: '0 */6 * * *' },
      { CATALOG_DB: database.db, SOURCE_SNAPSHOTS: { put }, AUTOMATED_SOURCE_IDS: 'openrouter-models' },
      { waitUntil: (promise) => { work = promise; } },
    );
    await work;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

describe('catalog ingestion', () => {
  it('parses official OpenRouter pricing into integer micro-dollars per million', () => {
    expect(parseOpenRouterModels({ data: [{ id: 'openai/gpt-4o', name: 'GPT-4o', context_length: 128_000, top_provider: { max_completion_tokens: 16_000 }, pricing: { prompt: '0.0000025', completion: '0.00001', input_cache_read: '0.00000125' } }] }, '2026-08-03T00:00:00.000Z'))
      .toMatchObject({ modelOffers: [{ id: 'openai:openai/gpt-4o:openrouter', inputMicroDollarsPerMillion: 2_500_000, cachedInputMicroDollarsPerMillion: 1_250_000, outputMicroDollarsPerMillion: 10_000_000, contextWindowTokens: 128_000, maxOutputTokens: 16_000, availability: 'available' }] });
  });

  it('rejects malformed official adapter payloads', () => {
    expect(() => parseOpenCodeCatalog({ data: [{ object: 'model' }] }, openCodePricingHtml, '2026-08-03T00:00:00.000Z'))
      .toThrow('OpenCode model id is required');
  });

  it('uses the Zen pay-as-you-go catalog instead of the separate OpenCode Go subscription route', () => {
    expect(parseOpenCodeCatalog(openCodeModelsPayload, openCodePricingHtml, '2026-08-03T00:00:00.000Z'))
      .toMatchObject({
        source: { sourceUrl: 'https://opencode.ai/docs/zen/', sourceKind: 'official_html' },
        modelOffers: [{ inputMicroDollarsPerMillion: 1_000_000, cachedInputMicroDollarsPerMillion: 200_000, outputMicroDollarsPerMillion: 2_000_000 }],
      });
  });

  it('rejects zero-offer upstream payloads so they cannot replace a last-known-good revision', () => {
    expect(() => parseOpenRouterModels({ data: [] }, '2026-08-03T00:00:00.000Z'))
      .toThrow('OpenRouter payload must contain at least one model offer');
    expect(() => parseOpenCodeCatalog({ data: [] }, openCodePricingHtml, '2026-08-03T00:00:00.000Z'))
      .toThrow('OpenCode pricing tables contain no exact available offers');
  });

  it('excludes OpenRouter meta-routes whose official price is the -1 sentinel', () => {
    expect(parseOpenRouterModels({ data: [
      ...openRouterPayload.data,
      { id: 'openrouter/auto', name: 'Auto Router', pricing: { prompt: '-1', completion: '-1' } },
    ] }, '2026-08-03T00:00:00.000Z').modelOffers).toHaveLength(1);
  });

  it('maps known OpenRouter model owners to stable subscription provider identities', () => {
    const parsed = parseOpenRouterModels({ data: [
      { id: 'qwen/qwen-plus', name: 'Qwen Plus', pricing: { prompt: '0.000001', completion: '0.000002' } },
      { id: 'x-ai/grok', name: 'Grok', pricing: { prompt: '0.000001', completion: '0.000002' } },
      { id: 'moonshotai/kimi', name: 'Kimi', pricing: { prompt: '0.000001', completion: '0.000002' } },
      { id: 'z-ai/glm', name: 'GLM', pricing: { prompt: '0.000001', completion: '0.000002' } },
    ] }, '2026-08-03T00:00:00.000Z');

    expect(parsed.modelOffers.map((offer) => [offer.modelId, offer.providerId])).toEqual([
      ['qwen/qwen-plus', 'alibaba'],
      ['x-ai/grok', 'xai'],
      ['moonshotai/kimi', 'kimi'],
      ['z-ai/glm', 'zai'],
    ]);
  });

  it('accepts equivalent official decimal price strings with trailing zero precision', () => {
    const payload = { data: [{ id: 'openai/gpt-4o', name: 'GPT-4o', pricing: { prompt: '0.000002500000000', completion: '0.000010000000000' } }] };
    expect(parseOpenRouterModels(payload, '2026-08-03T00:00:00.000Z').modelOffers[0])
      .toMatchObject({ inputMicroDollarsPerMillion: 2_500_000, outputMicroDollarsPerMillion: 10_000_000 });
  });

  it('builds source-linked manually verified subscription offers instead of an empty source', () => {
    expect(buildManualSubscriptionSource('openai', '2026-08-03T00:00:00.000Z'))
      .toMatchObject({ source: { id: 'openai-subscription', confidence: 'manual_verified' }, plans: expect.arrayContaining([
        expect.objectContaining({ id: 'openai:plus', monthlyCostMicroDollars: 20_000_000, sourceId: 'openai-subscription' }),
        expect.objectContaining({ id: 'openai:pro-5x', monthlyCostMicroDollars: 100_000_000, sourceId: 'openai-subscription' }),
      ]) });
  });

  it('retains only currently verified manual subscription prices', () => {
    expect(buildManualSubscriptionSource('alibaba', '2026-08-03T00:00:00.000Z').plans)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: 'alibaba:coding-plan-pro', monthlyCostMicroDollars: 50_000_000 })]));
    expect(buildManualSubscriptionSource('google', '2026-08-03T00:00:00.000Z').plans)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: 'google:ai-pro', monthlyCostMicroDollars: 19_990_000 })]));
    expect(buildManualSubscriptionSource('xai', '2026-08-03T00:00:00.000Z').plans)
      .toEqual([expect.objectContaining({ id: 'xai:supergrok', monthlyCostMicroDollars: 30_000_000 })]);
    expect(buildManualSubscriptionSource('kimi', '2026-08-03T00:00:00.000Z').plans)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: 'kimi:vivace', monthlyCostMicroDollars: 199_000_000 })]));
    expect(buildManualSubscriptionSource('zai', '2026-08-03T00:00:00.000Z').plans)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: 'zai:max', monthlyCostMicroDollars: 160_000_000 })]));
  });

  it('snapshots source data before publishing one atomic candidate revision', async () => {
    const database = createStatefulD1();
    const snapshots: string[] = [];
    const parsed = parseOpenRouterModels(openRouterPayload, '2026-08-03T00:00:00.000Z');
    const result = await publishValidatedSource({
      db: database.db,
      snapshots: { put: async (key: string) => { snapshots.push(key); } },
      source: parsed,
      rawPayload: openRouterPayload,
      now: '2026-08-03T00:00:00.000Z',
    });
    expect(snapshots[0]).toMatch(/^openrouter-models\/2026-08-03\//);
    expect(stateSnapshot(database)).toEqual({
      activeRevision: result.revision,
      pendingRevisionIds: [],
      candidateRows: expect.arrayContaining([`${result.revision}:source:openrouter-models`, `${result.revision}:model:openai:openai/gpt-4o:openrouter`]),
      refreshState: { lastSuccessAt: '2026-08-03T00:00:00.000Z', lastRevision: result.revision, lastError: null },
    });
  });

  it.each([
    ['malformed JSON/HTML', async () => { throw new Error('unexpected HTML response'); }, 'unexpected HTML response'],
    ['changed schema', async () => ({ models: [] }), 'OpenRouter payload must contain data'],
    ['duplicate offer IDs', async () => ({ data: [
      ...openRouterPayload.data,
      { ...openRouterPayload.data[0], name: 'Duplicate GPT-4o' },
    ] }), 'Duplicate model offer id: openai:openai/gpt-4o:openrouter'],
  ])('preserves active revision, candidate rows, and prior refresh facts for %s', async (_caseName, json, expectedError) => {
    const database = createStatefulD1();
    await runScheduledOpenRouter({ database, json });
    expect(stateSnapshot(database)).toEqual({
      activeRevision: 'rev-known-good',
      pendingRevisionIds: [],
      candidateRows: [],
      refreshState: { lastSuccessAt: '2026-08-03T00:00:00.000Z', lastRevision: 'rev-known-good', lastError: expect.stringContaining(expectedError) },
    });
  });

  it('records scheduled R2 snapshot failure while preserving the published revision and pending state', async () => {
    const database = createStatefulD1();
    await runScheduledOpenRouter({ database, put: async () => { throw new Error('R2 unavailable'); } });
    expect(stateSnapshot(database)).toEqual({
      activeRevision: 'rev-known-good',
      pendingRevisionIds: [],
      candidateRows: [],
      refreshState: { lastSuccessAt: '2026-08-03T00:00:00.000Z', lastRevision: 'rev-known-good', lastError: 'R2 unavailable' },
    });
  });

  it('rolls back a D1 failure after candidate rows, publication state, and active-pointer mutations are staged', async () => {
    const database = createStatefulD1({ failAfterStatement: 9 });
    await runScheduledOpenRouter({ database });
    expect(database.state.batchCalls).toBe(2);
    const staged = (database as unknown as { lastStagedState?: { activeRevision: string; revisions: Record<string, string>; rows: string[] } }).lastStagedState;
    expect(staged).toMatchObject({
      activeRevision: expect.stringMatching(/^rev_/),
      revisions: expect.objectContaining({ 'rev-known-good': 'superseded' }),
    });
    expect(staged?.rows).toEqual(expect.arrayContaining([
      expect.stringMatching(/^rev_.+:source:openrouter-models$/),
      expect.stringMatching(/^rev_.+:model:openai:openai\/gpt-4o:openrouter$/),
    ]));
    expect(stateSnapshot(database)).toEqual({
      activeRevision: 'rev-known-good',
      pendingRevisionIds: [],
      candidateRows: [],
      refreshState: { lastSuccessAt: '2026-08-03T00:00:00.000Z', lastRevision: 'rev-known-good', lastError: 'D1 transaction rolled back' },
    });
  });

  it('uses the AbortController timeout and keeps the published transaction state intact', async () => {
    vi.useFakeTimers();
    const database = createStatefulD1();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((_url, init) => new Promise((_resolve, reject) => {
      (init?.signal as AbortSignal).addEventListener('abort', () => reject(new Error(String(init?.signal?.reason))));
    })) as typeof fetch;
    let work: Promise<unknown> | undefined;
    try {
      await worker.scheduled(
        { cron: '0 */6 * * *' },
        { CATALOG_DB: database.db, SOURCE_SNAPSHOTS: { put: async () => undefined }, AUTOMATED_SOURCE_IDS: 'openrouter-models' },
        { waitUntil: (promise) => { work = promise; } },
      );
      await vi.advanceTimersByTimeAsync(20_000);
      await work;
      expect(stateSnapshot(database)).toEqual({
        activeRevision: 'rev-known-good',
        pendingRevisionIds: [],
        candidateRows: [],
        refreshState: { lastSuccessAt: '2026-08-03T00:00:00.000Z', lastRevision: 'rev-known-good', lastError: expect.stringContaining('upstream timeout') },
      });
    } finally {
      globalThis.fetch = originalFetch;
      vi.useRealTimers();
    }
  });

  it('invokes the Workers global fetch with the required global receiver', async () => {
    const database = createStatefulD1();
    const originalFetch = globalThis.fetch;
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    globalThis.fetch = vi.fn(function (this: unknown) {
      if (this !== globalThis) throw new Error('Illegal invocation');
      return Promise.resolve({ ok: true, status: 200, json: async () => openRouterPayload } as Response);
    }) as unknown as typeof fetch;
    globalThis.setTimeout = vi.fn(function (this: unknown, handler: () => void, timeout?: number) {
      if (this !== globalThis) throw new Error('Illegal invocation');
      return originalSetTimeout(handler, timeout);
    }) as unknown as typeof setTimeout;
    globalThis.clearTimeout = vi.fn(function (this: unknown, timeout?: ReturnType<typeof setTimeout>) {
      if (this !== globalThis) throw new Error('Illegal invocation');
      return originalClearTimeout(timeout);
    }) as unknown as typeof clearTimeout;
    let work: Promise<unknown> | undefined;
    try {
      await worker.scheduled(
        { cron: '0 */6 * * *' },
        { CATALOG_DB: database.db, SOURCE_SNAPSHOTS: { put: async () => undefined }, AUTOMATED_SOURCE_IDS: 'openrouter-models' },
        { waitUntil: (promise) => { work = promise; } },
      );
      await work;
      expect(database.state.refreshState['openrouter-models'].lastError).toBeNull();
      expect(database.state.refreshState['openrouter-models'].lastRevision).toMatch(/^rev_/);
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });

  it('records an explicit refresh failure in the stateful D1 harness without publication', async () => {
    const database = createStatefulD1();
    await recordRefreshFailure(database.db, 'openrouter-models', 'timeout', '2026-08-03T00:00:00.000Z');
    expect(stateSnapshot(database)).toMatchObject({
      activeRevision: 'rev-known-good',
      pendingRevisionIds: [],
      candidateRows: [],
      refreshState: { lastSuccessAt: '2026-08-03T00:00:00.000Z', lastRevision: 'rev-known-good', lastError: 'timeout' },
    });
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

  it('refreshes both official catalogs for a dashboard test event with no cron expression', async () => {
    const database = createStatefulD1();
    const originalFetch = globalThis.fetch;
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const sourceUrl = String(url);
      return {
        ok: true,
        status: 200,
        json: async () => sourceUrl.includes('openrouter.ai') ? openRouterPayload : openCodeModelsPayload,
        text: async () => openCodePricingHtml,
      };
    });
    globalThis.fetch = fetchImpl as unknown as typeof fetch;
    let work: Promise<unknown> | undefined;
    try {
      await worker.scheduled({}, {
        CATALOG_DB: database.db,
        SOURCE_SNAPSHOTS: { put: async () => undefined },
        AUTOMATED_SOURCE_IDS: 'openrouter-models,opencode-zen',
      }, { waitUntil: (promise) => { work = promise; } });
      await work;
      expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
        'https://openrouter.ai/api/v1/models',
        'https://opencode.ai/zen/v1/models',
        'https://opencode.ai/docs/zen/',
      ]);
      expect(database.state.rows).toEqual(expect.arrayContaining([
        expect.stringMatching(/:source:openrouter-models$/),
        expect.stringMatching(/:source:opencode-zen$/),
        expect.stringMatching(/:source:alibaba-subscription$/),
        expect.stringMatching(/:source:anthropic-subscription$/),
        expect.stringMatching(/:source:openai-subscription$/),
        expect.stringMatching(/:plan:anthropic:pro$/),
      ]));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
