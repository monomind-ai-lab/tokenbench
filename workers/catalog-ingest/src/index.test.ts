import { describe, expect, it, vi } from 'vitest';
import { BOOTSTRAP_CATALOG } from '../../../src/catalog/bootstrap';
import worker, {
  buildManualSubscriptionSource,
  buildManualSubscriptionSources,
  combineOpenCodeSource,
  parseOpenCodeCatalog,
  parseOpenRouterModels,
  prepareOpenCodeModels,
  prepareOpenCodePricing,
  prepareOpenRouterSource,
  projectOpenRouterModelsPayload,
  publishCatalogApiCache,
  publishValidatedSource,
  readBoundedResponseBytes,
  recordRefreshFailure,
} from './index';

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
  response,
}: {
  database: ReturnType<typeof createStatefulD1>;
  json?: () => Promise<unknown>;
  put?: (
    key: string,
    value: string | ArrayBufferView,
    options?: { httpMetadata?: { contentType: string }; customMetadata?: Record<string, string> },
  ) => Promise<unknown>;
  response?: Response;
}) {
  try {
    const preparedResponse = response ?? new Response(JSON.stringify(await json()), {
      headers: { 'content-type': 'application/json' },
    });
    if (!preparedResponse.ok) throw new Error(`Catalog source returned ${preparedResponse.status}`);
    const originalBytes = await readBoundedResponseBytes(preparedResponse, 'OpenRouter');
    const originalText = new TextDecoder('utf-8', { fatal: true }).decode(originalBytes);
    const payload = JSON.parse(originalText) as unknown;
    const projected = projectOpenRouterModelsPayload(payload);
    await publishValidatedSource({
      db: database.db,
      snapshots: { put },
      source: parseOpenRouterModels(projected, '2026-08-03T00:00:00.000Z'),
      rawPayload: payload,
      originalPayloadBytes: originalBytes,
      now: '2026-08-03T00:00:00.000Z',
    });
  } catch (error) {
    await recordRefreshFailure(database.db, 'openrouter-models', error, '2026-08-03T00:00:00.000Z');
  }
}

describe('catalog ingestion', () => {
  it('prepares the exact projected OpenRouter candidate and response validators', async () => {
    const raw = JSON.stringify({
      data: [{
        id: 'openai/gpt-4o',
        name: 'GPT-4o',
        description: 'must not be retained',
        pricing: { prompt: '0.0000025', completion: '0.00001' },
      }],
    });
    const prepared = await prepareOpenRouterSource(new Response(raw, {
      headers: { etag: '"router-v1"', 'last-modified': 'Wed, 12 Aug 2026 00:00:00 GMT' },
    }), '2026-08-12T00:20:00.000Z');

    expect(new TextDecoder().decode(prepared.projectedBytes)).toBe(
      '{"data":[{"id":"openai/gpt-4o","name":"GPT-4o","pricing":{"prompt":"0.0000025","completion":"0.00001"}}]}',
    );
    expect(prepared.parsed.modelOffers).toHaveLength(1);
    expect(prepared.originalContentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(prepared.etag).toBe('"router-v1"');
    expect(prepared.lastModified).toBe('Wed, 12 Aug 2026 00:00:00 GMT');
  });

  it('prepares OpenCode models and pricing independently before combining them', async () => {
    const models = await prepareOpenCodeModels(new Response(JSON.stringify(openCodeModelsPayload), {
      headers: { etag: '"models-v1"' },
    }));
    const pricing = await prepareOpenCodePricing(new Response(openCodePricingHtml, {
      headers: { etag: '"pricing-v1"' },
    }));
    const combined = combineOpenCodeSource(models, pricing, '2026-08-12T00:20:00.000Z');

    expect(models.etag).toBe('"models-v1"');
    expect(pricing.etag).toBe('"pricing-v1"');
    expect(combined.parsed.modelOffers).toEqual([
      expect.objectContaining({ id: 'opencode:opencode/zen:opencode_zen' }),
    ]);
    expect(JSON.parse(new TextDecoder().decode(combined.projectedBytes))).toEqual({
      models: openCodeModelsPayload,
      pricingHtml: openCodePricingHtml,
    });
  });

  it('materializes every catalog response before switching the cache pointer', async () => {
    const batches: Statement[][] = [];
    const revision = { revision: 'rev-1', published_at: '2099-01-01T00:00:00.000Z', checked_at: '2099-01-01T00:00:00.000Z' };
    const sourceRow = {
      id: 'openrouter-models', provider_id: 'openrouter', source_url: 'https://openrouter.ai/api/v1/models',
      observed_at: '2026-08-06T01:00:00.000Z', source_kind: 'official_json', confidence: 'official',
      snapshot_key: 'openrouter-models/2026-08-06/hash.json', content_hash: `sha256:${'a'.repeat(64)}`,
      parser_version: 'adapter-v1', evidence_locator: null, review_status: 'verified',
    };
    const modelRow = {
      id: 'openai:gpt-4o:openrouter', provider_id: 'openai', display_name: 'GPT-4o', model_id: 'openai/gpt-4o',
      pricing_basis: 'openrouter', route: 'openrouter', currency: 'USD', unit: 'micro_dollars_per_million_tokens',
      input_micro_dollars_per_million: 2_500_000, cached_input_micro_dollars_per_million: null,
      output_micro_dollars_per_million: 10_000_000, context_window_tokens: 128_000, max_output_tokens: 16_000,
      availability: 'available', source_id: 'openrouter-models',
    };
    const database = {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            const statement = { sql, values };
            return {
              ...statement,
              async all() {
                if (sql.includes('catalog_revisions')) return { results: [revision] };
                if (sql.includes('source_records')) return { results: [sourceRow] };
                if (sql.includes('plan_offers')) return { results: [] };
                if (sql.includes('model_offers')) return { results: [modelRow] };
                return { results: [] };
              },
            };
          },
        };
      },
      async batch(statements: unknown[]) { batches.push(statements as Statement[]); },
    };

    await publishCatalogApiCache(database, '2026-08-06T01:00:00.000Z');

    expect(batches).toHaveLength(1);
    const statements = batches[0];
    const entryIndexes = statements.flatMap((statement, index) => statement.sql.includes('INSERT INTO api_response_entries') ? [index] : []);
    const pointerIndex = statements.findIndex((statement) => statement.sql.includes('INSERT INTO api_response_publication_state'));
    expect(entryIndexes.length).toBeGreaterThan(0);
    expect(pointerIndex).toBeGreaterThan(Math.max(...entryIndexes));
    const entryValues = statements
      .filter((statement) => statement.sql.includes('INSERT INTO api_response_entries'))
      .flatMap((statement) => Array.from({ length: statement.values.length / 7 }, (_, index) => statement.values.slice(index * 7, index * 7 + 7)));
    const expectedResponseRevision = `rev-1+manual-${BOOTSTRAP_CATALOG.revision}`;
    const expectedCacheKey = `catalog:bootstrap:${BOOTSTRAP_CATALOG.revision}`;
    const wholeCatalogFresh = entryValues.find((values) => values[2] === expectedCacheKey && values[3] === 'fresh');
    const wholeCatalogStale = entryValues.find((values) => values[2] === expectedCacheKey && values[3] === 'stale');
    expect(wholeCatalogFresh?.[2]).toBe(expectedCacheKey);
    expect(wholeCatalogStale?.[2]).toBe(expectedCacheKey);
    expect(JSON.parse(String(wholeCatalogFresh?.[6]))).toMatchObject({
      revision: expectedResponseRevision,
      freshness: { status: 'fresh' },
    });
    expect(JSON.parse(String(wholeCatalogStale?.[6]))).toMatchObject({ freshness: { status: 'stale' } });
    const pointer = statements[pointerIndex]!;
    expect(pointer.sql).toContain('SELECT');
    expect(pointer.sql).toContain('catalog_publication_state');
    expect(pointer.sql).toContain('active_revision = ?');
    expect(pointer.values).toEqual([
      'catalog',
      expectedResponseRevision,
      '2026-08-06T01:00:00.000Z',
      'rev-1',
      'rev-1',
    ]);
    expect(statements.length).toBeLessThanOrEqual(7);
  });

  it('retains the prior complete cache pointer when a stale materialization loses its catalog CAS', async () => {
    const state = {
      activeCatalogRevision: 'rev-a',
      activeCacheRevision: 'cache-known-good',
      entryStatementCount: 0,
    };
    let pointerStatement: Statement | undefined;
    const revision = { revision: 'rev-a', published_at: '2026-08-06T00:00:00.000Z', checked_at: '2026-08-06T01:00:00.000Z' };
    const sourceRow = {
      id: 'source-a', provider_id: 'provider-a', source_url: 'https://example.com/catalog',
      observed_at: '2026-08-06T01:00:00.000Z', source_kind: 'official_json', confidence: 'official',
      snapshot_key: null, content_hash: 'sha256:abc', parser_version: 'adapter-v1', evidence_locator: null, review_status: 'verified',
    };
    const modelRow = {
      id: 'provider-a:model-a:direct', provider_id: 'provider-a', display_name: 'Model A', model_id: 'model-a',
      pricing_basis: 'direct_provider_api', route: 'direct_provider', currency: 'USD', unit: 'micro_dollars_per_million_tokens',
      input_micro_dollars_per_million: 1_000_000, cached_input_micro_dollars_per_million: null,
      output_micro_dollars_per_million: 2_000_000, context_window_tokens: null, max_output_tokens: null,
      availability: 'available', source_id: 'source-a',
    };
    const database = {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            const statement = { sql, values };
            return {
              ...statement,
              async all() {
                if (sql.startsWith('SELECT active_revision FROM catalog_publication_state')) {
                  return { results: [{ active_revision: state.activeCatalogRevision }] };
                }
                if (sql.includes('catalog_revisions')) return { results: [revision] };
                if (sql.includes('source_records')) return { results: [sourceRow] };
                if (sql.includes('plan_offers')) return { results: [] };
                if (sql.includes('model_offers')) return { results: [modelRow] };
                return { results: [] };
              },
            };
          },
        };
      },
      async batch(statements: unknown[]) {
        // A newer cron has committed its facts and catalog pointer after this
        // invocation read rev-a, but before this cache transaction begins.
        state.activeCatalogRevision = 'rev-b';
        for (const statement of statements as Statement[]) {
          if (statement.sql.includes('INSERT INTO api_response_entries')) state.entryStatementCount += 1;
          if (!statement.sql.includes('INSERT INTO api_response_publication_state')) continue;
          pointerStatement = statement;
          const exactCatalogCas = statement.sql.includes('catalog_publication_state')
            && statement.sql.includes('active_revision = ?')
            && statement.values.slice(-2).every((value) => value === 'rev-a');
          // This small D1 model applies the production statement's conditional
          // upsert: a missing/wrong guard behaves like the old unconditional write.
          if (!exactCatalogCas || state.activeCatalogRevision === 'rev-a') {
            state.activeCacheRevision = String(statement.values[1]);
          }
        }
      },
    };

    await publishCatalogApiCache(database, '2026-08-06T01:00:00.000Z');

    expect(state.entryStatementCount).toBeGreaterThan(0);
    expect(pointerStatement?.values.slice(-2)).toEqual(['rev-a', 'rev-a']);
    expect(state.activeCacheRevision).toBe('cache-known-good');
  });

  it('projects OpenRouter before parsing, hashing, and R2 storage', async () => {
    const contaminated = {
      data: [{
        id: 'openai/gpt-4o',
        canonical_slug: 'openai/gpt-4o',
        name: 'GPT-4o',
        created: 1_724_065_600,
        description: 'Compared by Artificial Analysis',
        context_length: 128_000,
        architecture: {
          modality: 'text->text',
          input_modalities: ['text'],
          output_modalities: ['text'],
          tokenizer: 'o200k_base',
          instruct_type: null,
          unreviewed_architecture_fact: 'remove me',
        },
        pricing: {
          prompt: '0.0000025',
          completion: '0.00001',
          input_cache_read: '0.00000125',
          input_cache_write: '0.000003',
          unreviewed_pricing_fact: 'remove me',
        },
        top_provider: {
          context_length: 128_000,
          max_completion_tokens: 16_000,
          is_moderated: false,
          unreviewed_provider_fact: 'remove me',
        },
        per_request_limits: null,
        supported_parameters: ['tools'],
        expiration_date: null,
        knowledge_cutoff: '2024-06',
        benchmarks: { artificial_analysis: { score: 99 } },
        unknown_top_level_fact: 'remove me',
      }],
      unknown_envelope_fact: 'remove me',
    };
    const expectedBytes = new TextEncoder().encode('{"data":[{"id":"openai/gpt-4o","canonical_slug":"openai/gpt-4o","name":"GPT-4o","created":1724065600,"context_length":128000,"architecture":{"modality":"text->text","input_modalities":["text"],"output_modalities":["text"],"tokenizer":"o200k_base","instruct_type":null},"pricing":{"prompt":"0.0000025","completion":"0.00001","input_cache_read":"0.00000125","input_cache_write":"0.000003"},"top_provider":{"context_length":128000,"max_completion_tokens":16000,"is_moderated":false},"per_request_limits":null,"supported_parameters":["tools"],"expiration_date":null,"knowledge_cutoff":"2024-06"}]}');
    const projected = projectOpenRouterModelsPayload(contaminated);
    expect(new TextEncoder().encode(JSON.stringify(projected))).toEqual(expectedBytes);

    const parsedBeforeStorage = parseOpenRouterModels(projected, '2026-08-05T00:00:00.000Z');
    const stored: Array<string | ArrayBufferView> = [];
    const database = createStatefulD1();
    await publishValidatedSource({
      db: database.db,
      snapshots: { put: async (_key: string, value: string | ArrayBufferView) => { stored.push(value); } },
      source: parsedBeforeStorage,
      rawPayload: contaminated,
      originalPayloadBytes: new TextEncoder().encode(JSON.stringify(contaminated)),
      now: '2026-08-05T00:00:00.000Z',
    });

    const storedBytes = stored[0] instanceof Uint8Array
      ? stored[0]
      : new TextEncoder().encode(String(stored[0]));
    expect(storedBytes).toEqual(expectedBytes);
    const storedText = new TextDecoder().decode(storedBytes);
    expect(storedText).not.toMatch(/benchmarks|artificial[ _-]?analysis|unknown_/i);
    expect(parseOpenRouterModels(JSON.parse(storedText), '2026-08-05T00:00:00.000Z').modelOffers)
      .toEqual(parsedBeforeStorage.modelOffers);
  });

  it('preserves the source-published hugging_face_id so open-weight identity survives ingest', () => {
    // The only structural cross-source key OpenRouter publishes. Dropping it at
    // the projection boundary forces any later join back onto display names.
    const projected = projectOpenRouterModelsPayload({
      data: [{
        id: 'qwen/qwen3-27b',
        canonical_slug: 'qwen/qwen3-27b',
        name: 'Qwen3 27B',
        created: 1_724_065_600,
        context_length: 262_144,
        hugging_face_id: 'Qwen/Qwen3-27B',
      }],
    });

    expect(projected.data[0].hugging_face_id).toBe('Qwen/Qwen3-27B');
  });

  it('omits hugging_face_id entirely when the source does not publish one', () => {
    const projected = projectOpenRouterModelsPayload({
      data: [{ id: 'openai/gpt-4o', name: 'GPT-4o', created: 1, context_length: 2 }],
    });

    expect(Object.prototype.hasOwnProperty.call(projected.data[0], 'hugging_face_id')).toBe(false);
  });

  it('records the exact upstream OpenRouter byte hash only as projected-snapshot provenance', async () => {
    const rawText = '{\n  "data": [ { "id": "openai/gpt-4o", "name": "GPT-4o", "pricing": { "prompt": "0.0000025", "completion": "0.00001" }, "benchmarks": { "artificial_analysis": { "score": 99 } } } ]\n}';
    const rawBytes = new TextEncoder().encode(rawText);
    const expectedOriginalHash = `sha256:${[...new Uint8Array(await crypto.subtle.digest('SHA-256', rawBytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
    const writes: Array<{ value: string | ArrayBufferView; options?: { customMetadata?: Record<string, string> } }> = [];
    const database = createStatefulD1();

    await runScheduledOpenRouter({
      database,
      response: new Response(rawText, { headers: { 'content-type': 'application/json' } }),
      put: async (_key: string, value: string | ArrayBufferView, options?: { customMetadata?: Record<string, string> }) => {
        writes.push({ value, options });
      },
    });

    expect(writes).toHaveLength(1);
    expect(writes[0].options?.customMetadata?.original_content_hash).toBe(expectedOriginalHash);
    const storedText = typeof writes[0].value === 'string'
      ? writes[0].value
      : new TextDecoder().decode(writes[0].value);
    expect(storedText).toBe('{"data":[{"id":"openai/gpt-4o","name":"GPT-4o","pricing":{"prompt":"0.0000025","completion":"0.00001"}}]}');
  });

  it('stops a chunked oversized OpenRouter response before buffering every byte', async () => {
    const database = createStatefulD1();
    const totalChunks = 64;
    let emittedChunks = 0;
    let cancelled = false;
    const response = new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        if (emittedChunks === totalChunks) {
          controller.close();
          return;
        }
        emittedChunks += 1;
        controller.enqueue(new Uint8Array(1024 * 1024));
      },
      cancel() {
        cancelled = true;
      },
    }));

    await runScheduledOpenRouter({ database, response });

    expect(cancelled).toBe(true);
    expect(emittedChunks).toBeLessThan(totalChunks);
    expect(stateSnapshot(database)).toMatchObject({
      activeRevision: 'rev-known-good',
      refreshState: { lastError: expect.stringContaining('response exceeds 8388608 byte limit') },
    });
  });

  it('parses official OpenRouter pricing into integer micro-dollars per million', () => {
    expect(parseOpenRouterModels({ data: [{ id: 'openai/gpt-4o', name: 'GPT-4o', context_length: 128_000, top_provider: { max_completion_tokens: 16_000 }, pricing: { prompt: '0.0000025', completion: '0.00001', input_cache_read: '0.00000125', input_cache_write: '0.000003' } }] }, '2026-08-03T00:00:00.000Z'))
      .toMatchObject({ modelOffers: [{ id: 'openai:openai/gpt-4o:openrouter', inputMicroDollarsPerMillion: 2_500_000, cachedInputMicroDollarsPerMillion: 1_250_000, cacheWriteMicroDollarsPerMillion: 3_000_000, outputMicroDollarsPerMillion: 10_000_000, contextWindowTokens: 128_000, maxOutputTokens: 16_000, availability: 'available' }] });
  });

  it('retains official OpenRouter expiration dates and derives availability at observation time', () => {
    const parsed = parseOpenRouterModels({ data: [
      { id: 'openai/future', name: 'Future model', expiration_date: '2026-09-30', pricing: { prompt: '0.000001', completion: '0.000002' } },
      { id: 'openai/expired', name: 'Expired model', expiration_date: '2026-08-01', pricing: { prompt: '0.000001', completion: '0.000002' } },
    ] }, '2026-08-21T00:00:00.000Z');

    expect(parsed.modelOffers).toEqual([
      expect.objectContaining({ modelId: 'openai/future', expirationDate: '2026-09-30', availability: 'available' }),
      expect.objectContaining({ modelId: 'openai/expired', expirationDate: '2026-08-01', availability: 'deprecated' }),
    ]);
    expect(() => parseOpenRouterModels({ data: [
      { id: 'openai/invalid', name: 'Invalid model', expiration_date: '2026-02-30', pricing: { prompt: '0.000001', completion: '0.000002' } },
    ] }, '2026-08-21T00:00:00.000Z')).toThrow('expiration_date must be a valid calendar date or null');
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
        expect.objectContaining({ id: 'openai:go', monthlyCostMicroDollars: 8_000_000, sourceId: 'openai-subscription' }),
        expect.objectContaining({ id: 'openai:plus', monthlyCostMicroDollars: 20_000_000, sourceId: 'openai-subscription' }),
        expect.objectContaining({ id: 'openai:pro-5x', monthlyCostMicroDollars: 100_000_000, sourceId: 'openai-subscription' }),
      ]) });

    expect(buildManualSubscriptionSources('openai', '2026-08-12T00:00:00.000Z'))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ source: expect.objectContaining({ id: 'openai-api', confidence: 'manual_verified' }), plans: [], modelOffers: expect.arrayContaining([
          expect.objectContaining({ id: 'openai:gpt-5.6-sol:direct', sourceId: 'openai-api' }),
          expect.objectContaining({ id: 'openai:gpt-5.6-terra:direct', sourceId: 'openai-api' }),
          expect.objectContaining({ id: 'openai:gpt-5.6-luna:direct', sourceId: 'openai-api' }),
        ]) }),
      ]));
  });

  it('retains only currently verified manual subscription prices', () => {
    expect(buildManualSubscriptionSource('alibaba', '2026-08-03T00:00:00.000Z').plans)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: 'alibaba:coding-plan-pro', monthlyCostMicroDollars: 50_000_000 })]));
    expect(buildManualSubscriptionSources('alibaba', '2026-08-03T00:00:00.000Z').map(({ source, plans }) => [source.id, plans.map((plan) => plan.id)]))
      .toEqual(expect.arrayContaining([
        ['alibaba-subscription', ['alibaba:coding-plan-pro']],
        ['alibaba-token-subscription', ['alibaba:token-plan-lite', 'alibaba:token-plan-standard', 'alibaba:token-plan-pro']],
      ]));
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
      originalPayloadBytes: new TextEncoder().encode(JSON.stringify(openRouterPayload)),
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

  it('dispatches the scheduled event to the singleton coordinator only', async () => {
    const start = vi.fn(async () => ({ status: 'started' }));
    const getByName = vi.fn(() => ({ start }));

    await worker.scheduled({ scheduledTime: Date.parse('2026-08-12T00:20:00.000Z') }, {
      CATALOG_DB: {} as never,
      SOURCE_SNAPSHOTS: {} as never,
      AUTOMATED_SOURCE_IDS: 'openrouter-models,opencode-zen',
      INGEST_COORDINATOR: { getByName },
    });

    expect(getByName).toHaveBeenCalledWith('daily-catalog');
    expect(start).toHaveBeenCalledWith({ scheduledTime: Date.parse('2026-08-12T00:20:00.000Z') });
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

  it('keeps the public fetch surface closed', () => {
    expect(worker.fetch().status).toBe(405);
  });
});
