import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BENCHLM_ARTIFACTS,
  BENCHLM_URLS,
  SourceRateLimitedError,
  assembleBenchLmStep,
  normalizeSourceStep,
  retrieveBenchLmArtifactStep,
  retrieveLiteLlmStep,
  retrieveLmArenaPageStep,
  retrieveLmArenaRevisionStep,
  type BenchLmArtifact,
  type CandidateArtifact,
  type CandidateObjectStore,
} from './source-steps';

const CYCLE_ID = '3f1d0f1a-2b3c-4d5e-8f90-a1b2c3d4e5f6';
const OBSERVED_AT = '2026-08-16T02:15:00.000Z';
const CANDIDATE_PREFIX = `benchmark-candidates/${CYCLE_ID}/`;
const LMARENA_REVISION = '4e52c8e709c90a4cad8498d9db5aad11709b04e0';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

interface StoredObject {
  bytes: Uint8Array;
  customMetadata: Record<string, string>;
}

interface MemoryStore extends CandidateObjectStore {
  readonly objects: Map<string, StoredObject>;
  readonly writes: string[];
  seed(key: string, bytes: Uint8Array, customMetadata?: Record<string, string>): void;
}

function memoryStore(): MemoryStore {
  const objects = new Map<string, StoredObject>();
  const writes: string[] = [];
  return {
    objects,
    writes,
    seed(key, bytes, customMetadata = {}) {
      objects.set(key, { bytes, customMetadata });
    },
    async get(key) {
      const object = objects.get(key);
      if (!object) return null;
      return {
        arrayBuffer: async () => object.bytes.slice().buffer as ArrayBuffer,
        customMetadata: object.customMetadata,
      };
    },
    async put(key, value, options) {
      writes.push(key);
      objects.set(key, {
        bytes: new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)),
        customMetadata: options?.customMetadata ?? {},
      });
      return undefined;
    },
  };
}

interface RecordingFetch {
  impl: typeof fetch;
  readonly calls: { url: string; headers: Record<string, string>; redirect: string | undefined }[];
}

function recordingFetch(responses: readonly Response[]): RecordingFetch {
  const queue = [...responses];
  const calls: RecordingFetch['calls'] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(input),
      headers: Object.fromEntries([...headers].map(([name, value]) => [name.toLowerCase(), value])),
      redirect: init?.redirect,
    });
    const next = queue.shift();
    if (!next) throw new Error(`unexpected upstream request ${String(input)}`);
    return next;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(new TextEncoder().encode(JSON.stringify(value)), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function encode(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function decodeStored(store: MemoryStore, key: string): unknown {
  const object = store.objects.get(key);
  if (!object) throw new Error(`missing stored object ${key}`);
  return JSON.parse(new TextDecoder().decode(object.bytes));
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function benchLmFixture(artifact: BenchLmArtifact): Record<string, unknown> {
  return JSON.parse(readFileSync(
    resolve(process.cwd(), `workers/benchmark-ingest/test-fixtures/benchlm/${artifact}.json`),
    'utf8',
  )) as Record<string, unknown>;
}

const BENCHLM_HEADERS: Record<BenchLmArtifact, { etag: string | null; lastModified: string | null }> = {
  leaderboard: { etag: 'W/"leaderboard"', lastModified: null },
  models: { etag: 'W/"models"', lastModified: null },
  pricing: { etag: 'W/"pricing"', lastModified: null },
  comparisons: { etag: 'W/"comparisons"', lastModified: null },
  benchmarks: { etag: 'W/"benchmarks"', lastModified: null },
  'public-leaderboard': { etag: 'W/"public"', lastModified: 'Mon, 10 Aug 2026 00:00:00 GMT' },
};

async function retrieveAllBenchLmArtifacts(
  store: MemoryStore,
  overrides: Partial<Record<BenchLmArtifact, Record<string, unknown>>> = {},
): Promise<Record<BenchLmArtifact, CandidateArtifact>> {
  const entries: [BenchLmArtifact, CandidateArtifact][] = [];
  for (const artifact of BENCHLM_ARTIFACTS) {
    const payload = overrides[artifact] ?? benchLmFixture(artifact);
    const fetcher = recordingFetch([jsonResponse(payload, {
      headers: {
        'content-type': 'application/json',
        ...(BENCHLM_HEADERS[artifact].etag ? { etag: BENCHLM_HEADERS[artifact].etag } : {}),
        ...(BENCHLM_HEADERS[artifact].lastModified
          ? { 'last-modified': BENCHLM_HEADERS[artifact].lastModified as string }
          : {}),
      },
    })]);
    entries.push([artifact, await retrieveBenchLmArtifactStep({
      cycleId: CYCLE_ID,
      store,
      fetchImpl: fetcher.impl,
      observedAt: OBSERVED_AT,
      artifact,
    })]);
    expect(fetcher.calls).toHaveLength(1);
  }
  return Object.fromEntries(entries) as Record<BenchLmArtifact, CandidateArtifact>;
}

const LITELLM_PAYLOAD = {
  sample_spec: { litellm_provider: 'example', mode: 'chat' },
  'zeta/model': {
    litellm_provider: 'zeta',
    mode: 'chat',
    input_cost_per_token: 0.000002,
    output_cost_per_token: 0.000008,
    max_input_tokens: 100000,
    max_output_tokens: 8000,
    internal_only_field: 'drop me',
  },
  'alpha/model': {
    litellm_provider: 'alpha',
    mode: 'chat',
    input_cost_per_token: 0.000001,
    output_cost_per_token: 0.000004,
    max_input_tokens: 200000,
  },
  fallback_generalizations: { rules: [] },
};

const EXPECTED_LITELLM_PROJECTION = {
  'alpha/model': {
    litellm_provider: 'alpha',
    mode: 'chat',
    input_cost_per_token: 0.000001,
    output_cost_per_token: 0.000004,
    max_input_tokens: 200000,
  },
  'zeta/model': {
    litellm_provider: 'zeta',
    mode: 'chat',
    input_cost_per_token: 0.000002,
    output_cost_per_token: 0.000008,
    max_input_tokens: 100000,
    max_output_tokens: 8000,
  },
};

function arenaRow(index: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    model_name: `arena-model-${index}`,
    organization: 'Acme',
    license: 'proprietary',
    rating: 1500 - index,
    rating_lower: 1490 - index,
    rating_upper: 1510 - index,
    variance: 1.5,
    vote_count: 1000 - index,
    rank: index + 1,
    category: 'overall',
    leaderboard_publish_date: '2026-08-05',
    tainted_field: 'ignored',
    ...overrides,
  };
}

function arenaPage(offset: number, rowCount: number, total: number): Record<string, unknown> {
  return {
    features: [{ name: 'model_name' }],
    num_rows_total: total,
    rows: Array.from({ length: rowCount }, (_unused, index) => ({
      row_idx: offset + index,
      row: arenaRow(offset + index),
      truncated_cells: [],
    })),
  };
}

function arenaPageResponse(offset: number, rowCount: number, total: number, revision = LMARENA_REVISION): Response {
  return jsonResponse(arenaPage(offset, rowCount, total), {
    headers: { 'content-type': 'application/json', 'x-revision': revision, etag: 'W/"arena"' },
  });
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('benchmark source-step constants', () => {
  it('exposes the exact six ordered BenchLM artifacts and their official URLs', () => {
    expect(BENCHLM_ARTIFACTS).toEqual([
      'leaderboard',
      'models',
      'pricing',
      'comparisons',
      'benchmarks',
      'public-leaderboard',
    ]);
    expect(BENCHLM_URLS).toEqual({
      leaderboard: 'https://benchlm.ai/data/leaderboard.json',
      models: 'https://benchlm.ai/data/models.json',
      pricing: 'https://benchlm.ai/data/pricing.json',
      comparisons: 'https://benchlm.ai/data/comparisons.json',
      benchmarks: 'https://benchlm.ai/data/benchmarks.json',
      'public-leaderboard': 'https://benchlm.ai/api/data/leaderboard?mode=bench-align-v5&limit=200',
    });
  });
});

// ---------------------------------------------------------------------------
// retrieveBenchLmArtifactStep
// ---------------------------------------------------------------------------

describe('retrieveBenchLmArtifactStep', () => {
  it('makes exactly one upstream request and writes one attempt-owned candidate artifact', async () => {
    const store = memoryStore();
    const payload = benchLmFixture('models');
    const bytes = encode(payload);
    const fetcher = recordingFetch([jsonResponse(payload, {
      headers: { 'content-type': 'application/json', etag: 'W/"models"' },
    })]);

    const artifact = await retrieveBenchLmArtifactStep({
      cycleId: CYCLE_ID,
      store,
      fetchImpl: fetcher.impl,
      observedAt: OBSERVED_AT,
      artifact: 'models',
    });

    expect(fetcher.calls).toHaveLength(1);
    expect(fetcher.calls[0].url).toBe(BENCHLM_URLS.models);
    expect(artifact).toEqual({
      artifactId: 'models',
      key: `${CANDIDATE_PREFIX}benchlm/raw/models/${sha256(bytes).slice('sha256:'.length)}.json`,
      contentHash: sha256(bytes),
      originalContentHash: sha256(bytes),
      byteLength: bytes.byteLength,
      sourceUrl: BENCHLM_URLS.models,
      etag: 'W/"models"',
      lastModified: null,
      upstreamRevision: null,
      schemaVersion: null,
    });
    expect(store.writes).toEqual([artifact.key]);
    expect(store.objects.get(artifact.key)?.bytes).toEqual(bytes);
  });

  it('sends conditional validators and reuses a 304 only after exact stored byte and hash validation', async () => {
    const store = memoryStore();
    const projection = encode(benchLmFixture('pricing'));
    const previous: CandidateArtifact = {
      artifactId: 'pricing',
      key: 'benchmarks/benchlm/pricing/projected/v2/active.json',
      contentHash: sha256(projection),
      originalContentHash: 'sha256:'.concat('a'.repeat(64)),
      byteLength: projection.byteLength,
      sourceUrl: BENCHLM_URLS.pricing,
      etag: 'W/"pricing-active"',
      lastModified: 'Sat, 08 Aug 2026 00:00:00 GMT',
      upstreamRevision: null,
      schemaVersion: 'v2',
    };
    store.seed(previous.key, projection, {
      content_hash: previous.contentHash,
      original_content_hash: previous.originalContentHash,
    });
    const fetcher = recordingFetch([new Response(null, { status: 304 })]);

    const artifact = await retrieveBenchLmArtifactStep({
      cycleId: CYCLE_ID,
      store,
      fetchImpl: fetcher.impl,
      observedAt: OBSERVED_AT,
      artifact: 'pricing',
      previous,
    });

    expect(fetcher.calls).toHaveLength(1);
    expect(fetcher.calls[0].headers['if-none-match']).toBe('W/"pricing-active"');
    expect(fetcher.calls[0].headers['if-modified-since']).toBe('Sat, 08 Aug 2026 00:00:00 GMT');
    expect(artifact).toEqual({
      ...previous,
      key: `${CANDIDATE_PREFIX}benchlm/projected/pricing/${sha256(projection).slice('sha256:'.length)}.json`,
    });
    expect(store.writes).toEqual([artifact.key]);
  });

  it('refuses to reuse a 304 whose stored bytes no longer hash to the recorded content hash', async () => {
    const store = memoryStore();
    const previous: CandidateArtifact = {
      artifactId: 'pricing',
      key: 'benchmarks/benchlm/pricing/projected/v2/active.json',
      contentHash: `sha256:${'b'.repeat(64)}`,
      originalContentHash: `sha256:${'a'.repeat(64)}`,
      byteLength: 2,
      sourceUrl: BENCHLM_URLS.pricing,
      etag: 'W/"pricing-active"',
      lastModified: null,
      upstreamRevision: null,
      schemaVersion: 'v2',
    };
    store.seed(previous.key, new TextEncoder().encode('{}'), {
      content_hash: previous.contentHash,
      original_content_hash: previous.originalContentHash,
    });
    const fetcher = recordingFetch([new Response(null, { status: 304 })]);

    await expect(retrieveBenchLmArtifactStep({
      cycleId: CYCLE_ID,
      store,
      fetchImpl: fetcher.impl,
      observedAt: OBSERVED_AT,
      artifact: 'pricing',
      previous,
    })).rejects.toThrow(/content hash does not match exact bytes/i);
    expect(store.writes).toEqual([]);
  });

  it('rejects a 304 that has no immutable candidate to reuse', async () => {
    const store = memoryStore();
    const fetcher = recordingFetch([new Response(null, { status: 304 })]);

    await expect(retrieveBenchLmArtifactStep({
      cycleId: CYCLE_ID,
      store,
      fetchImpl: fetcher.impl,
      observedAt: OBSERVED_AT,
      artifact: 'leaderboard',
    })).rejects.toThrow(/304 without an immutable/i);
  });

  it('throws a typed rate-limit error carrying the provider reset and never retries', async () => {
    const store = memoryStore();
    const fetcher = recordingFetch([new Response(null, {
      status: 429,
      headers: { 'retry-after': '3600', ratelimit: 'limit=100, remaining=0, t=1786025700' },
    })]);

    const error = await retrieveBenchLmArtifactStep({
      cycleId: CYCLE_ID,
      store,
      fetchImpl: fetcher.impl,
      observedAt: OBSERVED_AT,
      artifact: 'leaderboard',
    }).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(SourceRateLimitedError);
    const rateLimited = error as SourceRateLimitedError;
    expect(rateLimited.sourceId).toBe('benchlm');
    expect(rateLimited.artifactId).toBe('leaderboard');
    expect(rateLimited.status).toBe(429);
    expect(rateLimited.retryAfter).toBe('3600');
    expect(rateLimited.rateLimit).toBe('limit=100, remaining=0, t=1786025700');
    expect(rateLimited.providerRetryAtMs).toBe(Date.parse(OBSERVED_AT) + 3_600_000);
    expect(fetcher.calls).toHaveLength(1);
    expect(store.writes).toEqual([]);
  });

  it('fails a transient upstream status after exactly one request instead of retrying in place', async () => {
    const store = memoryStore();
    const fetcher = recordingFetch([new Response(null, { status: 503 })]);

    await expect(retrieveBenchLmArtifactStep({
      cycleId: CYCLE_ID,
      store,
      fetchImpl: fetcher.impl,
      observedAt: OBSERVED_AT,
      artifact: 'leaderboard',
    })).rejects.toThrow(/returned 503/);
    expect(fetcher.calls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// assembleBenchLmStep
// ---------------------------------------------------------------------------

describe('assembleBenchLmStep', () => {
  it('assembles the six retrieved artifacts into one bounded attempt-owned bundle partition', async () => {
    const store = memoryStore();
    const artifacts = await retrieveAllBenchLmArtifacts(store);

    const partition = await assembleBenchLmStep({ cycleId: CYCLE_ID, store, artifacts });

    expect(partition.kind).toBe('benchlm-bundle');
    expect(partition.index).toBe(0);
    expect(partition.rowCount).toBe(6);
    expect(partition.key.startsWith(`${CANDIDATE_PREFIX}benchlm/bundle/`)).toBe(true);
    const bundle = decodeStored(store, partition.key) as {
      schemaVersion: string;
      cycleId: string;
      generatedAt: string;
      artifacts: CandidateArtifact[];
    };
    expect(bundle.schemaVersion).toBe('benchlm-bundle-v1');
    expect(bundle.cycleId).toBe(CYCLE_ID);
    expect(bundle.generatedAt).toBe('2026-08-05T06:25:54.198Z');
    expect(bundle.artifacts.map((artifact) => artifact.artifactId)).toEqual([...BENCHLM_ARTIFACTS]);
    for (const artifact of bundle.artifacts) {
      expect(artifact.key.startsWith(`${CANDIDATE_PREFIX}benchlm/projected/`)).toBe(true);
      expect(artifact.schemaVersion).toBe('v2');
      const stored = store.objects.get(artifact.key);
      expect(stored).toBeDefined();
      expect(sha256(stored?.bytes as Uint8Array)).toBe(artifact.contentHash);
      expect((stored?.bytes as Uint8Array).byteLength).toBe(artifact.byteLength);
    }
    expect(store.writes.every((key) => key.startsWith(CANDIDATE_PREFIX))).toBe(true);
  });

  it('rejects a bundle whose artifacts disagree on generatedAt before any normalization', async () => {
    const store = memoryStore();
    const mixed = { ...benchLmFixture('pricing'), generatedAt: '2026-08-06T06:25:54.198Z' };
    const artifacts = await retrieveAllBenchLmArtifacts(store, { pricing: mixed });

    await expect(assembleBenchLmStep({ cycleId: CYCLE_ID, store, artifacts }))
      .rejects.toThrow(/generatedAt values must match/i);
  });

  it('rejects an incomplete BenchLM artifact set', async () => {
    const store = memoryStore();
    const artifacts = await retrieveAllBenchLmArtifacts(store);
    const incomplete = { ...artifacts } as Record<string, CandidateArtifact>;
    delete incomplete.comparisons;

    await expect(assembleBenchLmStep({
      cycleId: CYCLE_ID,
      store,
      artifacts: incomplete as Record<BenchLmArtifact, CandidateArtifact>,
    })).rejects.toThrow(/comparisons/i);
  });
});

// ---------------------------------------------------------------------------
// retrieveLiteLlmStep
// ---------------------------------------------------------------------------

describe('retrieveLiteLlmStep', () => {
  it('makes one request and stores the exact bounded LiteLLM projection', async () => {
    const store = memoryStore();
    const raw = encode(LITELLM_PAYLOAD);
    const projected = encode(EXPECTED_LITELLM_PROJECTION);
    const fetcher = recordingFetch([new Response(raw, {
      status: 200,
      headers: { 'content-type': 'application/json', etag: '"litellm-1"' },
    })]);

    const artifact = await retrieveLiteLlmStep({
      cycleId: CYCLE_ID,
      store,
      fetchImpl: fetcher.impl,
      observedAt: OBSERVED_AT,
    });

    expect(fetcher.calls).toHaveLength(1);
    expect(fetcher.calls[0].url)
      .toBe('https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json');
    expect(artifact.artifactId).toBe('model-prices');
    expect(artifact.contentHash).toBe(sha256(projected));
    expect(artifact.originalContentHash).toBe(sha256(raw));
    expect(artifact.byteLength).toBe(projected.byteLength);
    expect(artifact.etag).toBe('"litellm-1"');
    expect(artifact.schemaVersion).toBeNull();
    expect(artifact.key).toBe(`${CANDIDATE_PREFIX}litellm/model-prices/${sha256(projected).slice('sha256:'.length)}.json`);
    expect(store.objects.get(artifact.key)?.bytes).toEqual(projected);
  });

  it('reuses a 304 only when the stored candidate is still the exact safe projection', async () => {
    const store = memoryStore();
    const projected = encode(EXPECTED_LITELLM_PROJECTION);
    const previous: CandidateArtifact = {
      artifactId: 'model-prices',
      key: 'benchmarks/litellm/model-prices/active.json',
      contentHash: sha256(projected),
      originalContentHash: `sha256:${'c'.repeat(64)}`,
      byteLength: projected.byteLength,
      sourceUrl: 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json',
      etag: '"litellm-active"',
      lastModified: null,
      upstreamRevision: null,
      schemaVersion: null,
    };
    store.seed(previous.key, projected, {
      content_hash: previous.contentHash,
      original_content_hash: previous.originalContentHash,
    });
    const fetcher = recordingFetch([new Response(null, { status: 304 })]);

    const artifact = await retrieveLiteLlmStep({
      cycleId: CYCLE_ID,
      store,
      fetchImpl: fetcher.impl,
      observedAt: OBSERVED_AT,
      previous,
    });

    expect(artifact).toEqual({
      ...previous,
      key: `${CANDIDATE_PREFIX}litellm/model-prices/${sha256(projected).slice('sha256:'.length)}.json`,
    });
    expect(fetcher.calls[0].headers['if-none-match']).toBe('"litellm-active"');
    expect(store.writes).toEqual([artifact.key]);
  });

  it('rejects a 304 whose stored candidate is not the exact safe projection', async () => {
    const store = memoryStore();
    const contaminated = encode({ ...EXPECTED_LITELLM_PROJECTION, extra: { litellm_provider: 'x', secret: 1 } });
    const previous: CandidateArtifact = {
      artifactId: 'model-prices',
      key: 'benchmarks/litellm/model-prices/active.json',
      contentHash: sha256(contaminated),
      originalContentHash: `sha256:${'c'.repeat(64)}`,
      byteLength: contaminated.byteLength,
      sourceUrl: 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json',
      etag: '"litellm-active"',
      lastModified: null,
      upstreamRevision: null,
      schemaVersion: null,
    };
    store.seed(previous.key, contaminated, {
      content_hash: previous.contentHash,
      original_content_hash: previous.originalContentHash,
    });
    const fetcher = recordingFetch([new Response(null, { status: 304 })]);

    await expect(retrieveLiteLlmStep({
      cycleId: CYCLE_ID,
      store,
      fetchImpl: fetcher.impl,
      observedAt: OBSERVED_AT,
      previous,
    })).rejects.toThrow(/exact safe projection/i);
  });

  it('throws a typed rate-limit error without a nested retry', async () => {
    const store = memoryStore();
    const fetcher = recordingFetch([new Response(null, {
      status: 429,
      headers: { 'retry-after': 'Sun, 16 Aug 2026 03:15:00 GMT' },
    })]);

    const error = await retrieveLiteLlmStep({
      cycleId: CYCLE_ID,
      store,
      fetchImpl: fetcher.impl,
      observedAt: OBSERVED_AT,
    }).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(SourceRateLimitedError);
    expect((error as SourceRateLimitedError).providerRetryAtMs)
      .toBe(Date.parse('2026-08-16T03:15:00.000Z'));
    expect(fetcher.calls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// retrieveLmArenaRevisionStep
// ---------------------------------------------------------------------------

describe('retrieveLmArenaRevisionStep', () => {
  it('resolves one frozen dataset revision with a single request', async () => {
    const store = memoryStore();
    const fetcher = recordingFetch([jsonResponse({ id: 'lmarena-ai/leaderboard-dataset', sha: LMARENA_REVISION })]);

    const revision = await retrieveLmArenaRevisionStep({
      cycleId: CYCLE_ID,
      store,
      fetchImpl: fetcher.impl,
      observedAt: OBSERVED_AT,
    });

    expect(revision).toBe(LMARENA_REVISION);
    expect(fetcher.calls).toHaveLength(1);
    expect(fetcher.calls[0].url).toBe('https://huggingface.co/api/datasets/lmarena-ai/leaderboard-dataset');
    expect(store.writes).toEqual([]);
  });

  it('rejects a dataset info document without a 40-character lowercase sha', async () => {
    const fetcher = recordingFetch([jsonResponse({ sha: 'not-a-commit' })]);

    await expect(retrieveLmArenaRevisionStep({
      cycleId: CYCLE_ID,
      store: memoryStore(),
      fetchImpl: fetcher.impl,
      observedAt: OBSERVED_AT,
    })).rejects.toThrow(/40-character lowercase sha/i);
  });
});

// ---------------------------------------------------------------------------
// retrieveLmArenaPageStep — dataset viewer
// ---------------------------------------------------------------------------

describe('retrieveLmArenaPageStep dataset-viewer transport', () => {
  it('retrieves exactly one 100-row page per alarm and reports pagination progress', async () => {
    const store = memoryStore();
    const fetcher = recordingFetch([arenaPageResponse(0, 100, 150)]);

    const output = await retrieveLmArenaPageStep({
      cycleId: CYCLE_ID,
      store,
      fetchImpl: fetcher.impl,
      observedAt: OBSERVED_AT,
      subset: 'text_style_control',
      offset: 0,
      upstreamRevision: LMARENA_REVISION,
    });

    expect(fetcher.calls).toHaveLength(1);
    expect(fetcher.calls[0].url).toContain('offset=0&length=100');
    expect(output.kind).toBe('page');
    if (output.kind !== 'page') throw new Error('expected a page output');
    expect(output.rowCount).toBe(100);
    expect(output.declaredTotal).toBe(150);
    expect(output.complete).toBe(false);
    expect(output.artifact.artifactId)
      .toBe('text_style_control:latest:overall:rows-0-100');
    expect(output.artifact.upstreamRevision).toBe(LMARENA_REVISION);
    expect(output.artifact.key.startsWith(`${CANDIDATE_PREFIX}lmarena/text_style_control/offset-0/`)).toBe(true);
    const projection = decodeStored(store, output.artifact.key) as { rows: unknown[]; num_rows_total: number };
    expect(projection.num_rows_total).toBe(150);
    expect(projection.rows).toHaveLength(100);
    expect(Object.keys((projection.rows[0] as { row: Record<string, unknown> }).row))
      .not.toContain('tainted_field');
  });

  it('marks the final short page complete against the declared total', async () => {
    const store = memoryStore();
    const fetcher = recordingFetch([arenaPageResponse(100, 50, 150)]);

    const output = await retrieveLmArenaPageStep({
      cycleId: CYCLE_ID,
      store,
      fetchImpl: fetcher.impl,
      observedAt: OBSERVED_AT,
      subset: 'text_style_control',
      offset: 100,
      upstreamRevision: LMARENA_REVISION,
      declaredTotal: 150,
    });

    if (output.kind !== 'page') throw new Error('expected a page output');
    expect(output.rowCount).toBe(50);
    expect(output.complete).toBe(true);
  });

  it('rejects a page whose x-revision is not the frozen upstream revision', async () => {
    const fetcher = recordingFetch([arenaPageResponse(0, 100, 100, 'f'.repeat(40))]);

    await expect(retrieveLmArenaPageStep({
      cycleId: CYCLE_ID,
      store: memoryStore(),
      fetchImpl: fetcher.impl,
      observedAt: OBSERVED_AT,
      subset: 'text_style_control',
      offset: 0,
      upstreamRevision: LMARENA_REVISION,
    })).rejects.toThrow(/x-revision/i);
  });

  it('rejects a page that disagrees with the previously declared num_rows_total', async () => {
    const fetcher = recordingFetch([arenaPageResponse(100, 100, 400)]);

    await expect(retrieveLmArenaPageStep({
      cycleId: CYCLE_ID,
      store: memoryStore(),
      fetchImpl: fetcher.impl,
      observedAt: OBSERVED_AT,
      subset: 'text_style_control',
      offset: 100,
      upstreamRevision: LMARENA_REVISION,
      declaredTotal: 150,
    })).rejects.toThrow(/disagree on num_rows_total/i);
  });

  it('rejects a page that is missing rows required by num_rows_total', async () => {
    const fetcher = recordingFetch([arenaPageResponse(0, 40, 150)]);

    await expect(retrieveLmArenaPageStep({
      cycleId: CYCLE_ID,
      store: memoryStore(),
      fetchImpl: fetcher.impl,
      observedAt: OBSERVED_AT,
      subset: 'text_style_control',
      offset: 0,
      upstreamRevision: LMARENA_REVISION,
    })).rejects.toThrow(/missing rows required by num_rows_total/i);
  });

  it('refuses a cursor beyond the 200-page hard bound without making a request', async () => {
    const fetcher = recordingFetch([]);

    await expect(retrieveLmArenaPageStep({
      cycleId: CYCLE_ID,
      store: memoryStore(),
      fetchImpl: fetcher.impl,
      observedAt: OBSERVED_AT,
      subset: 'text_style_control',
      offset: 20_000,
      upstreamRevision: LMARENA_REVISION,
      declaredTotal: 40_000,
    })).rejects.toThrow(/bounded page limit/i);
    expect(fetcher.calls).toEqual([]);
  });

  it('refuses a cursor at or beyond the declared total without making a request', async () => {
    const fetcher = recordingFetch([]);

    await expect(retrieveLmArenaPageStep({
      cycleId: CYCLE_ID,
      store: memoryStore(),
      fetchImpl: fetcher.impl,
      observedAt: OBSERVED_AT,
      subset: 'text_style_control',
      offset: 200,
      upstreamRevision: LMARENA_REVISION,
      declaredTotal: 150,
    })).rejects.toThrow(/cursor/i);
    expect(fetcher.calls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// retrieveLmArenaPageStep — pinned Hub Parquet fallback
// ---------------------------------------------------------------------------

describe('retrieveLmArenaPageStep pinned Hub Parquet fallback', () => {
  const parquetBytes = new Uint8Array([0x50, 0x41, 0x52, 0x31, 0x00, 0x01, 0x02, 0x03]);
  const parquetDigest = sha256(parquetBytes);
  const downloadUrl = `https://cdn-lfs.hf.co/datasets/lmarena-ai/leaderboard-dataset/${'ab'.repeat(20)}`;

  function resolverResponse(): Response {
    return new Response(null, {
      status: 302,
      headers: {
        location: downloadUrl,
        'x-repo-commit': LMARENA_REVISION,
        'x-linked-etag': `"${parquetDigest.slice('sha256:'.length)}"`,
      },
    });
  }

  async function readParquetRows(): Promise<Record<string, unknown>[]> {
    return Array.from({ length: 3 }, (_unused, index) => ({
      model_name: `arena-model-${index}`,
      organization: 'Acme',
      license: 'proprietary',
      rating: 1500 - index,
      rating_lower: 1490 - index,
      rating_upper: 1510 - index,
      variance: 1.5,
      vote_count: 1000 - index,
      rank: index + 1,
      category: 'overall',
      leaderboard_publish_date: '2026-08-05',
    }));
  }

  it('resolves the pinned download in one request as a distinct resumable output', async () => {
    const store = memoryStore();
    const fetcher = recordingFetch([resolverResponse()]);

    const output = await retrieveLmArenaPageStep({
      cycleId: CYCLE_ID,
      store,
      fetchImpl: fetcher.impl,
      observedAt: OBSERVED_AT,
      subset: 'text_style_control',
      offset: 0,
      upstreamRevision: LMARENA_REVISION,
      transport: 'hub-parquet-resolve',
    });

    expect(fetcher.calls).toHaveLength(1);
    expect(fetcher.calls[0].redirect).toBe('manual');
    expect(output.kind).toBe('resolved');
    if (output.kind !== 'resolved') throw new Error('expected a resolved output');
    expect(output.download).toEqual({
      subset: 'text_style_control',
      upstreamRevision: LMARENA_REVISION,
      downloadUrl,
      originalContentHash: parquetDigest,
      etag: `"${parquetDigest.slice('sha256:'.length)}"`,
    });
    expect(store.writes).toEqual([]);
  });

  it('downloads the pinned parquet in a second single-request step and writes bounded pages', async () => {
    const store = memoryStore();
    const fetcher = recordingFetch([new Response(parquetBytes, { status: 200 })]);

    const output = await retrieveLmArenaPageStep({
      cycleId: CYCLE_ID,
      store,
      fetchImpl: fetcher.impl,
      observedAt: OBSERVED_AT,
      subset: 'text_style_control',
      offset: 0,
      upstreamRevision: LMARENA_REVISION,
      transport: 'hub-parquet-download',
      download: {
        subset: 'text_style_control',
        upstreamRevision: LMARENA_REVISION,
        downloadUrl,
        originalContentHash: parquetDigest,
        etag: null,
      },
      readParquetRows,
    });

    expect(fetcher.calls).toHaveLength(1);
    expect(fetcher.calls[0].url).toBe(downloadUrl);
    expect(output.kind).toBe('pages');
    if (output.kind !== 'pages') throw new Error('expected a pages output');
    expect(output.declaredTotal).toBe(3);
    expect(output.artifacts).toHaveLength(1);
    expect(output.artifacts[0].artifactId)
      .toBe('text_style_control:latest:overall:hub-parquet:rows-0-100');
    expect(output.artifacts[0].upstreamRevision).toBe(LMARENA_REVISION);
    expect(output.artifacts[0].schemaVersion).toBe('hub-parquet-v1');
    expect(output.artifacts[0].originalContentHash).toBe(parquetDigest);
    expect(store.writes.every((key) => key.startsWith(CANDIDATE_PREFIX))).toBe(true);
  });

  it('rejects a resolver whose commit does not match the frozen revision', async () => {
    const fetcher = recordingFetch([new Response(null, {
      status: 302,
      headers: {
        location: downloadUrl,
        'x-repo-commit': 'f'.repeat(40),
        'x-linked-etag': `"${parquetDigest.slice('sha256:'.length)}"`,
      },
    })]);

    await expect(retrieveLmArenaPageStep({
      cycleId: CYCLE_ID,
      store: memoryStore(),
      fetchImpl: fetcher.impl,
      observedAt: OBSERVED_AT,
      subset: 'text_style_control',
      offset: 0,
      upstreamRevision: LMARENA_REVISION,
      transport: 'hub-parquet-resolve',
    })).rejects.toThrow(/x-repo-commit/i);
  });

  it('rejects a resolver download location on an untrusted host', async () => {
    const fetcher = recordingFetch([new Response(null, {
      status: 302,
      headers: {
        location: 'https://evil.example.com/leak.parquet',
        'x-repo-commit': LMARENA_REVISION,
        'x-linked-etag': `"${parquetDigest.slice('sha256:'.length)}"`,
      },
    })]);

    await expect(retrieveLmArenaPageStep({
      cycleId: CYCLE_ID,
      store: memoryStore(),
      fetchImpl: fetcher.impl,
      observedAt: OBSERVED_AT,
      subset: 'text_style_control',
      offset: 0,
      upstreamRevision: LMARENA_REVISION,
      transport: 'hub-parquet-resolve',
    })).rejects.toThrow(/untrusted download location/i);
  });

  it('rejects a downloaded parquet whose digest does not match the pinned resolver digest', async () => {
    const fetcher = recordingFetch([new Response(new Uint8Array([9, 9, 9]), { status: 200 })]);

    await expect(retrieveLmArenaPageStep({
      cycleId: CYCLE_ID,
      store: memoryStore(),
      fetchImpl: fetcher.impl,
      observedAt: OBSERVED_AT,
      subset: 'text_style_control',
      offset: 0,
      upstreamRevision: LMARENA_REVISION,
      transport: 'hub-parquet-download',
      download: {
        subset: 'text_style_control',
        upstreamRevision: LMARENA_REVISION,
        downloadUrl,
        originalContentHash: parquetDigest,
        etag: null,
      },
      readParquetRows,
    })).rejects.toThrow(/pinned resolver digest/i);
  });
});

// ---------------------------------------------------------------------------
// normalizeSourceStep
// ---------------------------------------------------------------------------

describe('normalizeSourceStep', () => {
  it('normalizes the assembled BenchLM bundle into one canonical candidate partition', async () => {
    const store = memoryStore();
    const artifacts = await retrieveAllBenchLmArtifacts(store);
    const bundle = await assembleBenchLmStep({ cycleId: CYCLE_ID, store, artifacts });
    store.writes.length = 0;

    const partition = await normalizeSourceStep({
      source: 'benchlm',
      cycleId: CYCLE_ID,
      store,
      observedAt: OBSERVED_AT,
      index: 0,
      bundle,
    });

    expect(partition.kind).toBe('normalized');
    expect(partition.index).toBe(0);
    expect(partition.key).toBe(`${CANDIDATE_PREFIX}normalized/0/${partition.contentHash.slice('sha256:'.length)}.json`);
    expect(store.writes).toEqual([partition.key]);
    const payload = decodeStored(store, partition.key) as {
      schemaVersion: string;
      source: string;
      batch: { sources: { artifactId: string; snapshotKey: string; observedAt: string }[]; models: unknown[] };
    };
    expect(payload.schemaVersion).toBe('normalized-source-v1');
    expect(payload.source).toBe('benchlm');
    expect(payload.batch.sources.map((source) => source.artifactId).sort())
      .toEqual([...BENCHLM_ARTIFACTS].sort());
    for (const source of payload.batch.sources) {
      expect(source.observedAt).toBe(OBSERVED_AT);
      expect(source.snapshotKey.startsWith(`${CANDIDATE_PREFIX}benchlm/projected/`)).toBe(true);
    }
    expect(payload.batch.models.length).toBeGreaterThan(0);
    expect(partition.rowCount).toBeGreaterThan(0);
  });

  it('normalizes a LiteLLM candidate artifact into corroborating price evidence', async () => {
    const store = memoryStore();
    const raw = encode(LITELLM_PAYLOAD);
    const fetcher = recordingFetch([new Response(raw, { status: 200, headers: { etag: '"litellm-1"' } })]);
    const artifact = await retrieveLiteLlmStep({
      cycleId: CYCLE_ID,
      store,
      fetchImpl: fetcher.impl,
      observedAt: OBSERVED_AT,
    });
    store.writes.length = 0;

    const partition = await normalizeSourceStep({
      source: 'litellm',
      cycleId: CYCLE_ID,
      store,
      observedAt: OBSERVED_AT,
      index: 1,
      artifact,
    });

    const payload = decodeStored(store, partition.key) as {
      batch: {
        sources: { sourceId: string; snapshotKey: string; contentHash: string }[];
        priceChecks: { sourceModelId: string; verificationStatus: string; inputUsdPerMillion: number }[];
      };
    };
    expect(partition.index).toBe(1);
    expect(payload.batch.sources).toEqual([expect.objectContaining({
      sourceId: 'litellm',
      snapshotKey: artifact.key,
      contentHash: artifact.contentHash,
    })]);
    expect(payload.batch.priceChecks.map((check) => check.sourceModelId))
      .toEqual(['alpha/model', 'zeta/model']);
    expect(payload.batch.priceChecks[0]).toMatchObject({
      verificationStatus: 'corroborating',
      inputUsdPerMillion: 1,
    });
    expect(store.writes).toEqual([partition.key]);
  });

  it('normalizes an LMArena page candidate with its exact page provenance', async () => {
    const store = memoryStore();
    const fetcher = recordingFetch([arenaPageResponse(0, 100, 100)]);
    const output = await retrieveLmArenaPageStep({
      cycleId: CYCLE_ID,
      store,
      fetchImpl: fetcher.impl,
      observedAt: OBSERVED_AT,
      subset: 'text_style_control',
      offset: 0,
      upstreamRevision: LMARENA_REVISION,
    });
    if (output.kind !== 'page') throw new Error('expected a page output');
    store.writes.length = 0;

    const partition = await normalizeSourceStep({
      source: 'lmarena',
      cycleId: CYCLE_ID,
      store,
      observedAt: OBSERVED_AT,
      index: 2,
      artifact: output.artifact,
      subset: 'text_style_control',
      offset: 0,
    });

    const payload = decodeStored(store, partition.key) as {
      batch: {
        sources: { sourceId: string; artifactId: string; snapshotKey: string; upstreamRevision: string }[];
        metrics: { metricKey: string; rank: number }[];
      };
    };
    expect(payload.batch.sources).toEqual([expect.objectContaining({
      sourceId: 'lmarena',
      artifactId: 'text_style_control:latest:overall:rows-0-100',
      snapshotKey: output.artifact.key,
      upstreamRevision: LMARENA_REVISION,
    })]);
    expect(payload.batch.metrics).toHaveLength(100);
    expect(payload.batch.metrics[0].metricKey).toBe('lmarena:text_style_control:overall');
    expect(store.writes).toEqual([partition.key]);
  });

  it('writes every normalized partition inside the attempt-owned candidate namespace only', async () => {
    const store = memoryStore();
    const raw = encode(LITELLM_PAYLOAD);
    const fetcher = recordingFetch([new Response(raw, { status: 200 })]);
    const artifact = await retrieveLiteLlmStep({
      cycleId: CYCLE_ID,
      store,
      fetchImpl: fetcher.impl,
      observedAt: OBSERVED_AT,
    });

    await normalizeSourceStep({
      source: 'litellm',
      cycleId: CYCLE_ID,
      store,
      observedAt: OBSERVED_AT,
      index: 0,
      artifact,
    });

    expect(store.writes.length).toBeGreaterThan(0);
    expect(store.writes.every((key) => key.startsWith(CANDIDATE_PREFIX))).toBe(true);
  });

  it('refuses a candidate artifact whose stored bytes no longer match its recorded hash', async () => {
    const store = memoryStore();
    const raw = encode(LITELLM_PAYLOAD);
    const fetcher = recordingFetch([new Response(raw, { status: 200 })]);
    const artifact = await retrieveLiteLlmStep({
      cycleId: CYCLE_ID,
      store,
      fetchImpl: fetcher.impl,
      observedAt: OBSERVED_AT,
    });
    store.seed(artifact.key, new TextEncoder().encode('{"tampered":true}'), {
      content_hash: artifact.contentHash,
      original_content_hash: artifact.originalContentHash,
    });

    await expect(normalizeSourceStep({
      source: 'litellm',
      cycleId: CYCLE_ID,
      store,
      observedAt: OBSERVED_AT,
      index: 0,
      artifact,
    })).rejects.toThrow(/content hash does not match exact bytes/i);
  });
});
