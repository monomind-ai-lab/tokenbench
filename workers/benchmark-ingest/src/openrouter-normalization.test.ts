import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { projectOpenRouterModelsPayload } from '../../catalog-ingest/src/index';
import { normalizeOpenRouterCatalogStep } from './openrouter-normalization';

const CYCLE_ID = '11111111-2222-4333-8444-555555555555';
const OBSERVED_AT = '2026-08-12T00:00:00.000Z';

function hash(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function storeWith(key: string, bytes: Uint8Array, originalContentHash: string) {
  const objects = new Map([[key, { bytes, customMetadata: { original_content_hash: originalContentHash } }]]);
  return {
    objects,
    async get(candidate: string) {
      const object = objects.get(candidate);
      if (!object) return null;
      return {
        arrayBuffer: async () => object.bytes.slice().buffer as ArrayBuffer,
        customMetadata: object.customMetadata,
      };
    },
    async put(candidate: string, value: ArrayBufferView, options?: { customMetadata?: Record<string, string> }) {
      const view = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      objects.set(candidate, { bytes: view.slice(), customMetadata: options?.customMetadata as { original_content_hash: string } });
    },
  };
}

describe('normalizeOpenRouterCatalogStep', () => {
  it('normalizes the exact frozen safe catalog into one candidate partition', async () => {
    const projection = projectOpenRouterModelsPayload({ data: [{
      id: 'openai/gpt-5.6-sol',
      name: 'GPT-5.6 Sol',
      created: 1_775_366_400,
      context_length: 256_000,
      expiration_date: '2026-12-31',
      knowledge_cutoff: '2025-06',
      supported_parameters: ['tools', 'response_format'],
      per_request_limits: { max_requests: 10 },
      pricing: { prompt: '0.000002', completion: '0.000008', input_cache_write: '0.000003' },
      architecture: { input_modalities: ['text'], output_modalities: ['text'], tokenizer: 'o200k_base', instruct_type: 'chatml' },
      top_provider: { max_completion_tokens: 32_768, is_moderated: true },
    }] });
    const bytes = new TextEncoder().encode(JSON.stringify(projection));
    const contentHash = hash(bytes);
    const originalContentHash = `sha256:${'b'.repeat(64)}`;
    const key = 'catalog/openrouter.json';
    const store = storeWith(key, bytes, originalContentHash);

    const partition = await normalizeOpenRouterCatalogStep({
      cycleId: CYCLE_ID,
      store,
      index: 2,
      catalog: {
        revision: 'catalog-rev', sourceUrl: 'https://openrouter.ai/api/v1/models', observedAt: OBSERVED_AT,
        snapshotKey: key, contentHash, originalContentHash,
      },
    });

    const output = store.objects.get(partition.key);
    const payload = JSON.parse(new TextDecoder().decode(output?.bytes)) as {
      source: string;
      batch: { sources: unknown[]; models: { name: string }[]; priceChecks: unknown[] };
    };
    expect(payload.source).toBe('openrouter');
    expect(payload.batch.sources).toHaveLength(1);
    expect(payload.batch.models).toContainEqual(expect.objectContaining({ name: 'GPT-5.6 Sol' }));
    expect(payload.batch.priceChecks).toEqual([expect.objectContaining({
      cacheWriteUsdPerMillion: 3,
      createdAt: '2026-04-05T05:20:00.000Z',
      expirationDate: '2026-12-31',
      knowledgeCutoff: '2025-06',
      tokenizer: 'o200k_base',
      instructionFormat: 'chatml',
      isModerated: true,
      perRequestLimitsJson: '{"max_requests":10}',
      supportedParameters: ['tools', 'response_format'],
    })]);
  });

  it('rejects mismatched frozen catalog bytes before writing a candidate', async () => {
    const bytes = new TextEncoder().encode('{"data":[]}');
    const store = storeWith('catalog/openrouter.json', bytes, `sha256:${'b'.repeat(64)}`);
    await expect(normalizeOpenRouterCatalogStep({
      cycleId: CYCLE_ID,
      store,
      index: 0,
      catalog: {
        revision: 'catalog-rev', sourceUrl: 'https://openrouter.ai/api/v1/models', observedAt: OBSERVED_AT,
        snapshotKey: 'catalog/openrouter.json', contentHash: `sha256:${'a'.repeat(64)}`,
        originalContentHash: `sha256:${'b'.repeat(64)}`,
      },
    })).rejects.toThrow('content hash');
  });
});
