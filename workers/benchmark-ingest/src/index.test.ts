import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { BenchmarkComparisonPair, NormalizedSourceBatch } from '../../../src/benchmarks/contracts';
import worker, { buildPublicationStatements, deriveComparisonPairs, refreshBenchmarkRevision } from './index';

const observedAt = '2026-08-05T12:00:00.000Z';
const benchLmArtifacts = ['leaderboard', 'models', 'pricing', 'comparisons', 'benchmarks'] as const;
type BenchLmArtifact = typeof benchLmArtifacts[number];

interface Statement {
  sql: string;
  values: unknown[];
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}

interface RecordedStatement {
  sql: string;
  values: unknown[];
}

interface ApiResponseCacheChunk {
  scope: string;
  revision: string;
  cacheKey: string;
  variant: 'fresh' | 'stale';
  chunkIndex: number;
  etag: string;
  body: string;
}

interface SourceRow {
  sourceId: string;
  artifactId: string;
  sourceUrl: string;
  observedAt: string;
  etag: string | null;
  lastModified: string | null;
  upstreamRevision: string | null;
  schemaVersion: string | null;
  snapshotKey: string;
  contentHash: string;
  originalContentHash: string;
}

interface RevisionRow {
  revision: string;
  generatedAt: string;
  publishedAt: string | null;
  checkedAt: string;
  publicationState: 'pending' | 'published' | 'superseded';
  contentHash: string;
  catalogRevision: string;
  openrouterContentHash: string;
}

interface RefreshRow {
  lastSuccessAt: string | null;
  lastRevision: string | null;
  lastError: string | null;
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function fixture(name: BenchLmArtifact): string {
  return readFileSync(`workers/benchmark-ingest/test-fixtures/benchlm/${name}.json`, 'utf8');
}

const liteLlmFixture = JSON.parse(readFileSync('workers/benchmark-ingest/test-fixtures/litellm.json', 'utf8')) as {
  payload: Record<string, unknown>;
};

const openRouterRaw = '{\n  "data": [{"id":"openai/gpt-4o","name":"GPT-4o","context_length":128000,"pricing":{"prompt":"0.0000025","completion":"0.00001"},"benchmarks":{"artificial_analysis":{"score":99}}}]\n}';
const openRouterProjected = '{"data":[{"id":"openai/gpt-4o","name":"GPT-4o","context_length":128000,"pricing":{"prompt":"0.0000025","completion":"0.00001"}}]}';
const openRouterSnapshotKey = 'openrouter-models/2026-08-05/openrouter-projected.json';

function arenaRows(subset: string, offset = 0, count = 1): unknown[] {
  return Array.from({ length: count }, (_, index) => {
    const rowIdx = offset + index;
    const common = {
      model_name: `${subset}-model-${rowIdx}`,
      organization: 'Example Org',
      license: 'Proprietary',
      rank: rowIdx + 1,
      category: 'overall',
      leaderboard_publish_date: '2026-08-05',
    };
    const row = subset === 'agent'
      ? { ...common, score: 0.25, score_ci_lower: 0.1, score_ci_upper: 0.4, observation_count: 11, session_count: 3 }
      : { ...common, rating: 1_200, rating_lower: 1_190, rating_upper: 1_210, variance: 1, vote_count: 10 };
    return { row_idx: rowIdx, row, truncated_cells: [] };
  });
}

function arenaResponse(
  subset: string,
  offset = 0,
  count = 1,
  revision = 'lmarena-revision',
  total: number | null = offset + count,
): Response {
  return new Response(JSON.stringify({
    rows: arenaRows(subset, offset, count),
    ...(total === null ? {} : { num_rows_total: total }),
  }), {
    headers: { 'content-type': 'application/json', etag: `"${subset}-${offset}-etag"`, 'x-revision': revision },
  });
}

function requestHeaders(init: RequestInit | undefined): Headers {
  return new Headers(init?.headers);
}

function healthyFetch(options: {
  onRequest?: (url: URL, init: RequestInit | undefined) => Response | Promise<Response | undefined> | undefined;
} = {}): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const intercepted = await options.onRequest?.(url, init);
    if (intercepted) return intercepted;
    if (url.hostname === 'benchlm.ai') {
      const artifact = url.pathname.match(/\/([^/]+)\.json$/)?.[1] as BenchLmArtifact | undefined;
      if (!artifact || !benchLmArtifacts.includes(artifact)) throw new Error(`Unexpected BenchLM URL ${url}`);
      return new Response(fixture(artifact), {
        headers: { 'content-type': 'application/json', etag: `"${artifact}-etag"` },
      });
    }
    if (url.hostname === 'raw.githubusercontent.com') {
      return new Response(JSON.stringify(liteLlmFixture.payload), {
        headers: { 'content-type': 'application/json', etag: '"litellm-etag"' },
      });
    }
    if (url.hostname === 'datasets-server.huggingface.co') {
      const subset = url.searchParams.get('config');
      const offset = Number(url.searchParams.get('offset'));
      if (!subset || !Number.isSafeInteger(offset)) throw new Error(`Unexpected LMArena URL ${url}`);
      return arenaResponse(subset, offset);
    }
    throw new Error(`Unexpected fetch URL ${url}`);
  }) as typeof fetch;
}

const hubRevision = '0123456789abcdef0123456789abcdef01234567';

function hubParquetRows(subset: string): Record<string, unknown>[] {
  const count = subset === 'text_style_control' ? 101 : 1;
  const common = (index: number) => ({
    model_name: `${subset}-overall-${index + 1}`,
    organization: 'Example Org',
    license: 'Proprietary',
    rank: BigInt(index + 1),
    category: 'overall',
    leaderboard_publish_date: '2026-08-05',
  });
  const extraCategory = { ...common(count), model_name: `${subset}-excluded`, category: 'creative_writing' };
  if (subset === 'agent') {
    return [
      ...Array.from({ length: count }, (_, index) => ({
        ...common(index), score: 0.25, score_ci_lower: 0.1, score_ci_upper: 0.4, observation_count: 11n, session_count: 3n,
      })),
      { ...extraCategory, score: 0.2, score_ci_lower: 0.1, score_ci_upper: 0.3, observation_count: 10n, session_count: 2n },
    ];
  }
  const standardRows = [
    ...Array.from({ length: count }, (_, index) => ({
      ...common(index), rating: 1_200, rating_lower: 1_190, rating_upper: 1_210, variance: 1, vote_count: 10n,
    })),
    { ...extraCategory, rating: 1_100, rating_lower: 1_090, rating_upper: 1_110, variance: 1, vote_count: 9n },
  ];
  if (subset === 'webdev') {
    standardRows[0] = { ...standardRows[0], model_name: 'webdev-ambiguous' };
    standardRows.push(
      { ...standardRows[0], rating: 1_150, rank: 2n, vote_count: 20n },
      { ...standardRows[0], model_name: 'webdev-unique', rank: 3n },
    );
  }
  return standardRows;
}

function hubFallbackFetch(options: {
  wrongCommitFor?: string;
  wrongDigestFor?: string;
  downloadHost?: string;
} = {}): typeof fetch {
  const downloadHost = options.downloadHost ?? 'cdn.hf.co';
  const primary = healthyFetch({
    onRequest(url) {
      if (url.hostname === 'datasets-server.huggingface.co') return new Response('unavailable', { status: 503 });
      return undefined;
    },
  });
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname === 'huggingface.co' && url.pathname === '/api/datasets/lmarena-ai/leaderboard-dataset') {
      return new Response(JSON.stringify({ sha: hubRevision }), { headers: { 'content-type': 'application/json' } });
    }
    const resolve = url.pathname.match(/^\/datasets\/lmarena-ai\/leaderboard-dataset\/resolve\/([a-f0-9]{40})\/([^/]+)\/latest-00000-of-00001\.parquet$/);
    if (url.hostname === 'huggingface.co' && resolve) {
      const parquetBytes = new TextEncoder().encode(resolve[2]);
      const linkedDigest = resolve[2] === options.wrongDigestFor
        ? 'f'.repeat(64)
        : sha256(parquetBytes).slice('sha256:'.length);
      return new Response(null, {
        status: 302,
        headers: {
          location: `https://${downloadHost}/${resolve[2]}.parquet`,
          'x-linked-etag': `"${linkedDigest}"`,
          'x-repo-commit': resolve[2] === options.wrongCommitFor ? 'f'.repeat(40) : resolve[1],
        },
      });
    }
    if (url.hostname === downloadHost) {
      if (init?.redirect === 'error') {
        throw new TypeError('Invalid redirect value: Cloudflare Workers supports follow or manual');
      }
      return new Response(new TextEncoder().encode(url.pathname.slice(1, -'.parquet'.length)));
    }
    return primary(input, init);
  }) as typeof fetch;
}

function createR2(events: string[]) {
  const objects = new Map<string, { bytes: Uint8Array; customMetadata: Record<string, string> }>();
  const bucket = {
    async put(
      key: string,
      value: string | ArrayBufferView,
      options?: { customMetadata?: Record<string, string> },
    ) {
      events.push(`r2:${key}`);
      const bytes = typeof value === 'string'
        ? new TextEncoder().encode(value)
        : new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
      objects.set(key, { bytes, customMetadata: { ...(options?.customMetadata ?? {}) } });
      return {};
    },
    async get(key: string) {
      const object = objects.get(key);
      if (!object) return null;
      return {
        customMetadata: { ...object.customMetadata },
        async arrayBuffer() {
          return object.bytes.slice().buffer;
        },
      };
    },
  };
  return { bucket, objects, events };
}

function createDatabase(options: {
  activeBenchmark?: RevisionRow;
  activeSources?: SourceRow[];
  failPublicationBatch?: boolean;
  catalogSnapshotKey?: string;
  catalogContentHash?: string;
}, events: string[]) {
  const catalogSnapshotKey = options.catalogSnapshotKey ?? openRouterSnapshotKey;
  const catalogContentHash = options.catalogContentHash ?? sha256(new TextEncoder().encode(openRouterProjected));
  const state = {
    catalog: {
      revision: 'catalog-rev-1',
      sourceUrl: 'https://openrouter.ai/api/v1/models',
      observedAt,
      snapshotKey: catalogSnapshotKey,
      contentHash: catalogContentHash,
    },
    activeRevision: options.activeBenchmark?.revision ?? null as string | null,
    revisions: options.activeBenchmark ? [structuredClone(options.activeBenchmark)] : [] as RevisionRow[],
    sourceRows: new Map<string, SourceRow[]>(options.activeBenchmark
      ? [[options.activeBenchmark.revision, structuredClone(options.activeSources ?? [])]]
      : []),
    refreshRows: new Map<string, RefreshRow>(),
    batchCalls: 0,
    publicationBatchCalls: 0,
    publicationStatements: [] as RecordedStatement[],
  };

  function readFirst<T>(sql: string, values: unknown[]): T | null {
    if (sql.includes('catalog_publication_state')) return structuredClone(state.catalog) as T;
    if (sql.includes('benchmark_publication_state')) {
      const active = state.revisions.find((record) => record.revision === state.activeRevision);
      return active ? structuredClone(active) as T : null;
    }
    return null;
  }

  function readAll<T>(sql: string, values: unknown[]): T[] {
    if (sql.includes('benchmark_source_records')) {
      return structuredClone(state.sourceRows.get(String(values[0])) ?? []) as T[];
    }
    return [];
  }

  function statement(sql: string, values: unknown[] = []): Statement {
    return {
      sql,
      values,
      bind(...next: unknown[]) { return statement(sql, next); },
      async first<T>() { return readFirst<T>(sql, values); },
      async all<T>() { return { results: readAll<T>(sql, values) }; },
    };
  }

  function apply(draft: typeof state, next: Statement): void {
    const { sql, values } = next;
    if (sql.startsWith('INSERT INTO benchmark_revisions')) {
      draft.revisions.push({
        revision: String(values[0]), generatedAt: String(values[1]), publishedAt: values[2] === null ? null : String(values[2]),
        checkedAt: String(values[3]), publicationState: String(values[4]) as RevisionRow['publicationState'],
        contentHash: String(values[5]), catalogRevision: String(values[6]), openrouterContentHash: String(values[7]),
      });
    } else if (sql.startsWith('INSERT INTO benchmark_source_records')) {
      const revision = String(values[0]);
      const rows = draft.sourceRows.get(revision) ?? [];
      const sourceRows = sql.includes('json_each')
        ? JSON.parse(String(values[1])) as Array<Record<string, unknown>>
        : [{
          sourceId: values[1], artifactId: values[2], sourceUrl: values[3], observedAt: values[4],
          etag: values[5], lastModified: values[6], upstreamRevision: values[7], schemaVersion: values[8],
          snapshotKey: values[9], contentHash: values[10], originalContentHash: values[11],
        }];
      for (const source of sourceRows) {
        rows.push({
          sourceId: String(source.sourceId), artifactId: String(source.artifactId), sourceUrl: String(source.sourceUrl), observedAt: String(source.observedAt),
          etag: source.etag === null ? null : String(source.etag), lastModified: source.lastModified === null ? null : String(source.lastModified),
          upstreamRevision: source.upstreamRevision === null ? null : String(source.upstreamRevision), schemaVersion: source.schemaVersion === null ? null : String(source.schemaVersion),
          snapshotKey: String(source.snapshotKey), contentHash: String(source.contentHash), originalContentHash: String(source.originalContentHash),
        });
      }
      draft.sourceRows.set(revision, rows);
    } else if (sql.includes("UPDATE benchmark_revisions SET publication_state = 'superseded'")) {
      draft.revisions.forEach((record) => {
        if (record.publicationState === 'published') record.publicationState = 'superseded';
      });
    } else if (sql.includes("UPDATE benchmark_revisions SET publication_state = 'published'")) {
      const revision = draft.revisions.find((record) => record.revision === String(values[1]));
      if (revision) {
        revision.publicationState = 'published';
        revision.publishedAt = String(values[0]);
      }
    } else if (sql.includes('benchmark_publication_state')) {
      draft.activeRevision = String(values[0]);
    } else if (sql.startsWith('UPDATE benchmark_revisions SET checked_at')) {
      const revision = draft.revisions.find((record) => record.revision === String(values[1]));
      if (revision) revision.checkedAt = String(values[0]);
    } else if (sql.includes('benchmark_refresh_state') && sql.includes('json_each')) {
      for (const source of JSON.parse(String(values.at(-1))) as Array<Record<string, unknown>>) {
        const key = `${source.sourceId}:${source.artifactId}`;
        draft.refreshRows.set(key, { lastSuccessAt: String(values[0]), lastRevision: String(values[1]), lastError: null });
      }
    } else if (sql.includes('benchmark_refresh_state')) {
      const key = `${values[0]}:${values[1]}`;
      if (sql.includes('last_error = excluded.last_error')) {
        draft.refreshRows.set(key, { lastSuccessAt: null, lastRevision: null, lastError: String(values[2]) });
      } else {
        draft.refreshRows.set(key, { lastSuccessAt: String(values[2]), lastRevision: String(values[3]), lastError: null });
      }
    }
  }

  const db = {
    prepare(sql: string) { return statement(sql); },
    async batch(statements: Statement[]) {
      state.batchCalls += 1;
      const isPublication = statements.some((item) => item.sql.startsWith('INSERT INTO benchmark_revisions'));
      if (isPublication) {
        state.publicationBatchCalls += 1;
        state.publicationStatements = statements.map((item) => ({ sql: item.sql, values: [...item.values] }));
        events.push('d1:publication');
      } else {
        events.push('d1:refresh');
      }
      if (isPublication && options.failPublicationBatch) throw new Error('D1 batch rolled back');
      const draft = structuredClone(state);
      for (const item of statements) apply(draft, item);
      Object.assign(state, draft);
      return [];
    },
  };
  return { db, state };
}

function dependencies(fetchImpl: typeof fetch, now = () => observedAt) {
  const timeouts: number[] = [];
  const retries: number[] = [];
  return {
    dependencies: {
      fetchImpl,
      readParquetRows: async () => { throw new Error('unexpected Hub Parquet decode'); },
      now,
      createAbortController: () => new AbortController(),
      setTimeoutImpl: (_handler: () => void, timeout: number) => {
        timeouts.push(timeout);
        return timeout as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeoutImpl: () => undefined,
      sleep: async (timeout: number) => { retries.push(timeout); },
      random: () => 0,
    },
    timeouts,
    retries,
  };
}

function seededEnvironment(options: Parameters<typeof createDatabase>[0] = {}) {
  const events: string[] = [];
  const r2 = createR2(events);
  const db = createDatabase(options, events);
  const rawBytes = new TextEncoder().encode(openRouterRaw);
  r2.objects.set(db.state.catalog.snapshotKey, {
    bytes: new TextEncoder().encode(openRouterProjected),
    customMetadata: { original_content_hash: sha256(rawBytes) },
  });
  return { env: { CATALOG_DB: db.db, SOURCE_SNAPSHOTS: r2.bucket }, db, r2, events };
}

function liveScaleBatch(): { batch: NormalizedSourceBatch; pairs: BenchmarkComparisonPair[] } {
  const sourceHash = `sha256:${'a'.repeat(64)}`;
  const benchLmSource = {
    sourceId: 'benchlm' as const,
    artifactId: 'live-scale',
    sourceUrl: 'https://benchlm.ai/data/live-scale.json',
    observedAt,
    etag: null,
    lastModified: null,
    upstreamRevision: observedAt,
    schemaVersion: '1.0',
    snapshotKey: 'benchmarks/benchlm/live-scale.json',
    contentHash: sourceHash,
    originalContentHash: sourceHash,
    licenseId: 'MIT' as const,
    attributionText: 'Data from BenchLM.ai',
  };
  const liteLlmSource = {
    sourceId: 'litellm' as const,
    artifactId: 'live-scale-litellm',
    sourceUrl: 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json',
    observedAt,
    etag: null,
    lastModified: null,
    upstreamRevision: null,
    schemaVersion: null,
    snapshotKey: 'benchmarks/litellm/live-scale.json',
    contentHash: sourceHash,
    originalContentHash: sourceHash,
    licenseId: 'MIT' as const,
    attributionText: 'LiteLLM corroboration',
  };
  const modelKey = (index: number) => `model-${String(index).padStart(3, '0')}`;
  const benchLmModels = Array.from({ length: 378 }, (_, index) => ({
    modelKey: modelKey(index), slug: modelKey(index), name: `Model ${index}`, creator: 'BenchLM',
    sourceType: 'Proprietary' as const, reasoningType: null, releaseDate: null, contextWindowTokens: 128_000,
    evidenceStatus: 'supported' as const, rankingEligible: true, confidenceLower: null, confidenceUpper: null,
    benchmarkCount: 1, sourceId: 'benchlm' as const, sourceModelId: modelKey(index), sourceArtifactId: 'live-scale',
  }));
  const metrics = Array.from({ length: 859 }, (_, index) => ({
    modelKey: modelKey(index % benchLmModels.length), metricKey: `benchlm:live:${String(index).padStart(4, '0')}`,
    category: 'coding', value: index + 1, rank: null, lower: null, upper: null, voteCount: null,
    unit: 'score' as const, sourceId: 'benchlm' as const, sourceUpdatedAt: observedAt,
    sourceModelId: modelKey(index % benchLmModels.length), sourceArtifactId: 'live-scale', rankingEligible: true,
    methodology: 'benchlm_raw_composite' as const, observationCount: null, sessionCount: null,
  }));
  const benchLmPrices = Array.from({ length: 217 }, (_, index) => ({
    modelKey: modelKey(index % benchLmModels.length), sourceId: 'benchlm' as const, providerId: 'benchlm',
    inputUsdPerMillion: 1, cachedInputUsdPerMillion: null, outputUsdPerMillion: 2, contextWindowTokens: 128_000,
    verificationStatus: 'primary' as const, routeId: `route-${index}`, sourceModelId: modelKey(index % benchLmModels.length),
    canonicalSlug: null, maxInputTokens: 128_000, maxOutputTokens: null, inputModalities: null,
    outputModalities: null, supportedParameters: null, sourceArtifactId: 'live-scale',
  }));
  // Task 7 observed 2,986 LiteLLM models and price checks. Deliberately wide
  // string/array fields force more than one <=1.5MB JSON parameter per table.
  const wideMetadata = 'x'.repeat(700);
  const liteModelKey = (index: number) => `litellm-${String(index).padStart(4, '0')}`;
  const liteLlmModels = Array.from({ length: 2_986 }, (_, index) => ({
    modelKey: liteModelKey(index), slug: liteModelKey(index), name: `LiteLLM ${index} ${wideMetadata}`, creator: 'LiteLLM',
    sourceType: 'Unknown' as const, reasoningType: null, releaseDate: null, contextWindowTokens: 128_000,
    evidenceStatus: 'source_only' as const, rankingEligible: false, confidenceLower: null, confidenceUpper: null,
    benchmarkCount: 0, sourceId: 'litellm' as const, sourceModelId: liteModelKey(index), sourceArtifactId: 'live-scale-litellm',
  }));
  const liteLlmPrices = Array.from({ length: 2_986 }, (_, index) => ({
    modelKey: liteModelKey(index), sourceId: 'litellm' as const, providerId: 'litellm',
    inputUsdPerMillion: 1, cachedInputUsdPerMillion: null, outputUsdPerMillion: 2, contextWindowTokens: 128_000,
    verificationStatus: 'corroborating' as const, routeId: `litellm-route-${index}`, sourceModelId: liteModelKey(index),
    canonicalSlug: null, maxInputTokens: 128_000, maxOutputTokens: null, inputModalities: ['text'],
    outputModalities: ['text'], supportedParameters: [wideMetadata], sourceArtifactId: 'live-scale-litellm',
  }));
  const pairs = Array.from({ length: 400 }, (_, index) => {
    const left = index < 377 ? 0 : 1;
    const right = index < 377 ? index + 1 : index - 375;
    return {
      pairSlug: `${modelKey(left)}-vs-${modelKey(right)}`,
      modelAKey: modelKey(left), modelBKey: modelKey(right), indexable: false,
      eligibilityReason: 'live-scale serialization test', featuredRank: null, sharedMetricCount: 0,
    };
  });
  return {
    batch: {
      sources: [benchLmSource, liteLlmSource], models: [...benchLmModels, ...liteLlmModels], metrics,
      priceChecks: [...benchLmPrices, ...liteLlmPrices], comparisonSeeds: [],
    },
    pairs,
  };
}

function jsonRowsFor(statements: readonly { sql: string; values: unknown[] }[], table: string): Record<string, unknown>[] {
  return statements
    .filter((statement) => statement.sql.includes(`INSERT INTO ${table}`))
    .flatMap((statement) => JSON.parse(String(statement.values.at(-1))) as Record<string, unknown>[]);
}

function apiResponseCacheChunks(statements: readonly RecordedStatement[]): readonly ApiResponseCacheChunk[] {
  return statements
    .filter((statement) => statement.sql.includes('INSERT INTO api_response_entries'))
    .flatMap((statement) => {
      if (statement.values.length % 7 !== 0) throw new Error('cache entry statement must contain seven values per row');
      return Array.from({ length: statement.values.length / 7 }, (_, index) => {
        const values = statement.values.slice(index * 7, index * 7 + 7);
        return {
          scope: String(values[0]),
          revision: String(values[1]),
          cacheKey: String(values[2]),
          variant: values[3] as ApiResponseCacheChunk['variant'],
          chunkIndex: Number(values[4]),
          etag: String(values[5]),
          body: String(values[6]),
        };
      });
    });
}

function joinedCachedResponse(
  chunks: readonly ApiResponseCacheChunk[],
  cacheKey: string,
  variant: ApiResponseCacheChunk['variant'],
): { etag: string; body: string } {
  const responseChunks = chunks
    .filter((chunk) => chunk.scope === 'benchmarks' && chunk.cacheKey === cacheKey && chunk.variant === variant)
    .slice()
    .sort((left, right) => left.chunkIndex - right.chunkIndex);
  if (responseChunks.length === 0) throw new Error(`missing ${cacheKey}/${variant} cache response`);
  const etag = responseChunks[0].etag;
  responseChunks.forEach((chunk, index) => {
    if (chunk.chunkIndex !== index || chunk.etag !== etag) throw new Error(`invalid ${cacheKey}/${variant} cache chunks`);
  });
  return { etag, body: responseChunks.map((chunk) => chunk.body).join('') };
}

describe('atomic benchmark ingestion', () => {
  it('publishes complete Hub-Parquet overall snapshots after exhausted transient Dataset Viewer failures', async () => {
    const { env, db, r2 } = seededEnvironment();
    const transport = dependencies(hubFallbackFetch());
    const result = await refreshBenchmarkRevision(env, {
      ...transport.dependencies,
      readParquetRows: async (bytes: ArrayBuffer) => hubParquetRows(new TextDecoder().decode(bytes)),
    });

    expect(result).toMatchObject({ status: 'published', error: null, revision: expect.any(String) });
    const sources = db.state.sourceRows.get(result.revision as string) ?? [];
    const arenaSources = sources.filter((source) => source.sourceId === 'lmarena');
    expect(arenaSources).toHaveLength(12);
    expect(arenaSources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        artifactId: 'text_style_control:latest:overall:hub-parquet:rows-0-100',
        sourceUrl: `https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset/resolve/${hubRevision}/text_style_control/latest-00000-of-00001.parquet?download=true`,
        upstreamRevision: hubRevision,
        originalContentHash: sha256(new TextEncoder().encode('text_style_control')),
      }),
      expect.objectContaining({ artifactId: 'text_style_control:latest:overall:hub-parquet:rows-100-200' }),
    ]));
    const textMetric = jsonRowsFor(db.state.publicationStatements, 'benchmark_metrics')
      .find((metric) => metric.metricKey === 'lmarena:text_style_control:overall');
    expect(textMetric).toMatchObject({ value: 1_200, voteCount: 10, rank: 1 });
    expect(jsonRowsFor(db.state.publicationStatements, 'benchmark_metrics')
      .some((metric) => metric.metricKey === 'lmarena:text_style_control:creative_writing')).toBe(false);
    const webdevMetrics = jsonRowsFor(db.state.publicationStatements, 'benchmark_metrics')
      .filter((metric) => metric.metricKey === 'lmarena:webdev:overall');
    expect(webdevMetrics.some((metric) => metric.sourceModelId === 'webdev-ambiguous')).toBe(false);
    expect(webdevMetrics.some((metric) => metric.sourceModelId === 'webdev-unique')).toBe(true);
    const finalTextPage = arenaSources.find((source) => source.artifactId === 'text_style_control:latest:overall:hub-parquet:rows-100-200');
    const finalTextSnapshot = finalTextPage ? r2.objects.get(finalTextPage.snapshotKey) : undefined;
    const finalTextProjection = JSON.parse(new TextDecoder().decode(finalTextSnapshot?.bytes)) as { rows: unknown[]; num_rows_total: number };
    expect(finalTextProjection).toMatchObject({ num_rows_total: 101 });
    expect(finalTextProjection.rows).toHaveLength(1);
    expect(finalTextProjection.rows[0]).toMatchObject({ row_idx: 100 });
    for (const source of arenaSources) {
      const snapshot = r2.objects.get(source.snapshotKey);
      expect(snapshot).toBeDefined();
      expect(snapshot?.customMetadata.original_content_hash).toBe(source.originalContentHash);
    }
  });

  it('rejects a Hub-Parquet file whose resolver revision differs from the selected dataset commit', async () => {
    const previous: RevisionRow = {
      revision: 'benchmark-known-good', generatedAt: observedAt, publishedAt: observedAt, checkedAt: observedAt,
      publicationState: 'published', contentHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      catalogRevision: 'catalog-rev-1', openrouterContentHash: sha256(new TextEncoder().encode(openRouterProjected)),
    };
    const { env, db } = seededEnvironment({ activeBenchmark: previous });
    const transport = dependencies(hubFallbackFetch({ wrongCommitFor: 'agent' }));
    const result = await refreshBenchmarkRevision(env, {
      ...transport.dependencies,
      readParquetRows: async (bytes: ArrayBuffer) => hubParquetRows(new TextDecoder().decode(bytes)),
    });

    expect(result).toMatchObject({ status: 'failed', revision: null, error: expect.stringMatching(/x-repo-commit/i) });
    expect(db.state.activeRevision).toBe(previous.revision);
    expect(db.state.publicationBatchCalls).toBe(0);
  });

  it('rejects Hub-Parquet bytes whose SHA-256 differs from the pinned resolver digest', async () => {
    const previous: RevisionRow = {
      revision: 'benchmark-known-good', generatedAt: observedAt, publishedAt: observedAt, checkedAt: observedAt,
      publicationState: 'published', contentHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      catalogRevision: 'catalog-rev-1', openrouterContentHash: sha256(new TextEncoder().encode(openRouterProjected)),
    };
    const { env, db } = seededEnvironment({ activeBenchmark: previous });
    const transport = dependencies(hubFallbackFetch({ wrongDigestFor: 'agent' }));
    const result = await refreshBenchmarkRevision(env, {
      ...transport.dependencies,
      readParquetRows: async (bytes: ArrayBuffer) => hubParquetRows(new TextDecoder().decode(bytes)),
    });

    expect(result).toMatchObject({ status: 'failed', revision: null, error: expect.stringMatching(/sha-256|digest/i) });
    expect(db.state.activeRevision).toBe(previous.revision);
    expect(db.state.publicationBatchCalls).toBe(0);
  });

  it('accepts the official cdn-lfs.huggingface.co Hub download host', async () => {
    const { env } = seededEnvironment();
    const transport = dependencies(hubFallbackFetch({ downloadHost: 'cdn-lfs.huggingface.co' }));
    const result = await refreshBenchmarkRevision(env, {
      ...transport.dependencies,
      readParquetRows: async (bytes: ArrayBuffer) => hubParquetRows(new TextDecoder().decode(bytes)),
    });

    expect(result).toMatchObject({ status: 'published', error: null, revision: expect.any(String) });
  });

  it('rejects a Hub resolver download outside the explicit Hugging Face CDN policy', async () => {
    const previous: RevisionRow = {
      revision: 'benchmark-known-good', generatedAt: observedAt, publishedAt: observedAt, checkedAt: observedAt,
      publicationState: 'published', contentHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      catalogRevision: 'catalog-rev-1', openrouterContentHash: sha256(new TextEncoder().encode(openRouterProjected)),
    };
    const { env, db } = seededEnvironment({ activeBenchmark: previous });
    const transport = dependencies(hubFallbackFetch({ downloadHost: 'downloads.example.com' }));
    const result = await refreshBenchmarkRevision(env, {
      ...transport.dependencies,
      readParquetRows: async (bytes: ArrayBuffer) => hubParquetRows(new TextDecoder().decode(bytes)),
    });

    expect(result).toMatchObject({ status: 'failed', revision: null, error: expect.stringMatching(/untrusted download location/i) });
    expect(db.state.activeRevision).toBe(previous.revision);
    expect(db.state.publicationBatchCalls).toBe(0);
  });

  it('retries an interrupted Dataset Viewer body before activating Hub-Parquet fallback', async () => {
    let viewerRequests = 0;
    const fallback = hubFallbackFetch();
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname === 'datasets-server.huggingface.co') {
        viewerRequests += 1;
        const body = new ReadableStream({
          start(controller) {
            controller.error(new TypeError('connection reset'));
          },
        });
        return new Response(body, { status: 200, headers: { 'x-revision': 'interrupted' } });
      }
      return fallback(input, init);
    }) as typeof fetch;
    const { env } = seededEnvironment();
    const transport = dependencies(fetchImpl);
    const result = await refreshBenchmarkRevision(env, {
      ...transport.dependencies,
      readParquetRows: async (bytes: ArrayBuffer) => hubParquetRows(new TextDecoder().decode(bytes)),
    });

    expect(result).toMatchObject({ status: 'published', error: null, revision: expect.any(String) });
    expect(viewerRequests).toBeGreaterThanOrEqual(3);
  });

  it.each([401, 403])('does not attempt Hub-Parquet fallback after a non-retryable Dataset Viewer %i', async (status) => {
    let hubRequests = 0;
    const fetchImpl = healthyFetch({
      onRequest(url) {
        if (url.hostname === 'huggingface.co') {
          hubRequests += 1;
          return new Response('unexpected Hub fallback', { status: 500 });
        }
        if (url.hostname === 'datasets-server.huggingface.co') return new Response('denied', { status });
        return undefined;
      },
    });
    const { env, db } = seededEnvironment();
    const result = await refreshBenchmarkRevision(env, dependencies(fetchImpl).dependencies);

    expect(result).toMatchObject({ status: 'failed', revision: null, error: expect.stringMatching(new RegExp(`returned ${status}`)) });
    expect(hubRequests).toBe(0);
    expect(db.state.publicationBatchCalls).toBe(0);
  });

  it('does not attempt Hub-Parquet fallback for a schema-invalid Dataset Viewer 200 response', async () => {
    let hubRequests = 0;
    const fetchImpl = healthyFetch({
      onRequest(url) {
        if (url.hostname === 'huggingface.co') {
          hubRequests += 1;
          return new Response('unexpected Hub fallback', { status: 500 });
        }
        if (url.hostname === 'datasets-server.huggingface.co') {
          return new Response(JSON.stringify({ rows: [], num_rows_total: 1 }), { headers: { 'x-revision': 'schema-invalid' } });
        }
        return undefined;
      },
    });
    const { env, db } = seededEnvironment();
    const result = await refreshBenchmarkRevision(env, dependencies(fetchImpl).dependencies);

    expect(result).toMatchObject({ status: 'failed', revision: null, error: expect.stringMatching(/missing rows|required/i) });
    expect(hubRequests).toBe(0);
    expect(db.state.publicationBatchCalls).toBe(0);
  });

  it('does not attempt Hub-Parquet fallback after an oversized Dataset Viewer response body', async () => {
    let hubRequests = 0;
    const fetchImpl = healthyFetch({
      onRequest(url) {
        if (url.hostname === 'huggingface.co') {
          hubRequests += 1;
          return new Response('unexpected Hub fallback', { status: 500 });
        }
        if (url.hostname === 'datasets-server.huggingface.co') {
          return new Response('{}', {
            headers: {
              'content-length': String(2 * 1024 * 1024 + 1),
              'x-revision': 'oversized-response',
            },
          });
        }
        return undefined;
      },
    });
    const { env, db } = seededEnvironment();
    const result = await refreshBenchmarkRevision(env, dependencies(fetchImpl).dependencies);

    expect(result).toMatchObject({ status: 'failed', revision: null, error: expect.stringMatching(/response body is invalid.*exceeds/i) });
    expect(hubRequests).toBe(0);
    expect(db.state.publicationBatchCalls).toBe(0);
  });

  it('derives canonical pairs in SQLite UTF-8 BINARY order when JavaScript UTF-16 order disagrees', () => {
    // U+10000 begins with a UTF-16 surrogate (so JS sorts it first), while
    // U+E000 has the lower UTF-8 byte sequence used by D1 SQLite BINARY.
    const utf8First = 'provider:\uE000';
    const utf16First = 'provider:\u{10000}';
    const { batch } = liveScaleBatch();
    const template = batch.models[0];
    const pairs = deriveComparisonPairs({
      ...batch,
      models: [
        { ...template, modelKey: utf8First, slug: 'private-use', sourceModelId: 'private-use' },
        { ...template, modelKey: utf16First, slug: 'astral', sourceModelId: 'astral' },
      ],
      metrics: [],
      priceChecks: [],
      comparisonSeeds: [{
        pairSlug: 'private-use-vs-astral',
        modelAKey: utf8First,
        modelBKey: utf16First,
        sourceId: 'benchlm',
        sourceArtifactId: 'comparisons',
        sourceModelAId: 'private-use',
        sourceModelBId: 'astral',
        featuredRank: 1,
      }],
    });

    expect(pairs).toEqual([expect.objectContaining({
      pairSlug: 'private-use-vs-astral',
      modelAKey: utf8First,
      modelBKey: utf16First,
    })]);
  });

  it('downgrades a quality-eligible but unroutable upstream pair instead of failing the publication refresh', () => {
    const { batch } = liveScaleBatch();
    const modelTemplate = batch.models[0];
    const metricTemplate = batch.metrics[0];
    const left = { ...modelTemplate, modelKey: 'provider:unsafe-left', slug: 'unsafe/left', sourceModelId: 'unsafe-left' };
    const right = { ...modelTemplate, modelKey: 'provider:unsafe-right', slug: 'right', sourceModelId: 'unsafe-right' };
    const metrics = ['benchlm:overall:raw', 'benchlm:category:coding', 'benchlm:category:reasoning']
      .flatMap((metricKey) => [left, right].map((model) => ({
        ...metricTemplate,
        modelKey: model.modelKey,
        metricKey,
        category: metricKey.split(':').at(-1)!,
        sourceModelId: model.sourceModelId,
      })));

    const pairs = deriveComparisonPairs({
      ...batch,
      models: [left, right],
      metrics,
      priceChecks: [],
      comparisonSeeds: [{
        pairSlug: 'unsafe/left-vs-right',
        modelAKey: left.modelKey,
        modelBKey: right.modelKey,
        sourceId: 'benchlm',
        sourceArtifactId: 'comparisons',
        sourceModelAId: left.sourceModelId,
        sourceModelBId: right.sourceModelId,
        featuredRank: 1,
      }],
    });

    expect(pairs).toEqual([expect.objectContaining({
      pairSlug: 'unsafe/left-vs-right',
      indexable: false,
      eligibilityReason: 'route-ineligible',
      sharedMetricCount: 2,
    })]);
  });

  it('serializes live-scale facts into a safe number of bounded D1 queries without dropping rows', () => {
    const { db } = createDatabase({}, []);
    const { batch, pairs } = liveScaleBatch();
    const statements = buildPublicationStatements(db, 'benchmark-live-scale', observedAt, observedAt,
      `sha256:${'b'.repeat(64)}`, {
        revision: 'catalog-rev-1', sourceUrl: 'https://openrouter.ai/api/v1/models', observedAt,
        snapshotKey: openRouterSnapshotKey, contentHash: sha256(new TextEncoder().encode(openRouterProjected)),
      }, batch, pairs) as unknown as Statement[];

    // Three D1 reads precede this one transactional batch. Stay well below the 1,000-query Worker Paid cap.
    expect(3 + statements.length).toBeLessThanOrEqual(903);
    expect(3 + statements.length + 1).toBeLessThanOrEqual(904); // a failed batch can still write bounded last_error.
    expect(statements.every((statement) => statement.values.length <= 100)).toBe(true);
    expect(statements.every((statement) => new TextEncoder().encode(statement.sql).byteLength <= 100 * 1024)).toBe(true);
    expect(statements.flatMap((statement) => statement.values)
      .filter((value): value is string => typeof value === 'string')
      .every((value) => new TextEncoder().encode(value).byteLength <= 2 * 1024 * 1024)).toBe(true);
    expect(jsonRowsFor(statements, 'benchmark_source_records')).toHaveLength(batch.sources.length);
    const modelStatements = statements.filter((statement) => statement.sql.includes('INSERT INTO benchmark_models'));
    const priceStatements = statements.filter((statement) => statement.sql.includes('INSERT INTO benchmark_price_checks'));
    expect(modelStatements.length).toBeGreaterThan(1);
    expect(priceStatements.length).toBeGreaterThan(1);
    expect(jsonRowsFor(statements, 'benchmark_models')).toHaveLength(378 + 2_986);
    expect(jsonRowsFor(statements, 'benchmark_metrics')).toHaveLength(859);
    expect(jsonRowsFor(statements, 'benchmark_price_checks')).toHaveLength(217 + 2_986);
    expect(jsonRowsFor(statements, 'benchmark_comparison_pairs')).toHaveLength(400);
    expect(new Set(jsonRowsFor(statements, 'benchmark_models').map((row) => row.modelKey)))
      .toEqual(new Set(batch.models.map((model) => model.modelKey)));
    expect(new Set(jsonRowsFor(statements, 'benchmark_price_checks').map((row) => row.routeId)))
      .toEqual(new Set(batch.priceChecks.map((price) => price.routeId)));
  });

  it('writes exact projected evidence before one transactional publication batch', async () => {
    const { env, db, r2, events } = seededEnvironment();
    const transport = dependencies(healthyFetch());

    const result = await refreshBenchmarkRevision(env, transport.dependencies);

    expect(result).toMatchObject({ status: 'published', checkedAt: observedAt, error: null, revision: expect.any(String) });
    expect(db.state.batchCalls).toBe(1);
    expect(db.state.publicationBatchCalls).toBe(1);
    const publicationIndex = events.indexOf('d1:publication');
    const evidenceEvents = events.filter((event) => event.startsWith('r2:benchmarks/'));
    expect(publicationIndex).toBeGreaterThanOrEqual(0);
    expect(evidenceEvents).not.toHaveLength(0);
    expect(evidenceEvents.every((event) => events.indexOf(event) < publicationIndex)).toBe(true);
    expect(events.filter((event) => event === 'd1:publication')).toHaveLength(1);

    const factTables = [
      'benchmark_source_records',
      'benchmark_models',
      'benchmark_metrics',
      'benchmark_price_checks',
      'benchmark_comparison_pairs',
    ];
    for (const table of factTables) {
      expect(db.state.publicationStatements.some((statement) => statement.sql.includes(`INSERT INTO ${table}`))).toBe(true);
    }
    const pointerIndex = db.state.publicationStatements.findIndex((statement) => statement.sql.includes('benchmark_publication_state'));
    const finalFactIndex = Math.max(...factTables.map((table) => db.state.publicationStatements
      .map((statement, index) => statement.sql.includes(`INSERT INTO ${table}`) ? index : -1)
      .reduce((last, index) => Math.max(last, index), -1)));
    expect(pointerIndex).toBeGreaterThan(finalFactIndex);

    const modelsSnapshot = [...r2.objects.entries()].find(([key]) => key.includes('/benchlm/models/projected/'));
    expect(modelsSnapshot).toBeDefined();
    const storedModels = new TextDecoder().decode(modelsSnapshot?.[1].bytes);
    expect(storedModels).not.toMatch(/artificial[ _-]?analysis|benchmarks\.external|displayScore/i);
    const modelSource = jsonRowsFor(db.state.publicationStatements, 'benchmark_source_records')
      .find((source) => source.sourceId === 'benchlm' && source.artifactId === 'models');
    expect(modelSource?.contentHash).toBe(sha256(modelsSnapshot?.[1].bytes ?? new Uint8Array()));
    expect(db.state.activeRevision).toBe(result.revision);

    const sourceRows = db.state.sourceRows.get(result.revision as string) ?? [];
    expect(sourceRows).toHaveLength(evidenceEvents.length + 1); // the active OpenRouter catalog is pre-existing evidence.
    for (const source of sourceRows) {
      const snapshot = r2.objects.get(source.snapshotKey);
      expect(snapshot, `${source.sourceId}/${source.artifactId} R2 snapshot`).toBeDefined();
      expect(sha256(snapshot?.bytes ?? new Uint8Array())).toBe(source.contentHash);
      expect(snapshot?.customMetadata.original_content_hash).toBe(source.originalContentHash);
    }
    expect(sourceRows.some((source) => source.contentHash !== source.originalContentHash)).toBe(true);
  });

  it('materializes fresh and stale benchmark API responses before moving the response-cache pointer', async () => {
    const { env, db } = seededEnvironment();

    const result = await refreshBenchmarkRevision(env, dependencies(healthyFetch()).dependencies);

    expect(result).toMatchObject({ status: 'published', revision: expect.any(String) });
    const chunks = apiResponseCacheChunks(db.state.publicationStatements);
    const summaryFresh = joinedCachedResponse(chunks, 'summary', 'fresh');
    const summaryStale = joinedCachedResponse(chunks, 'summary', 'stale');
    const overallFresh = joinedCachedResponse(chunks, 'leaderboard:llm-overall:balanced:50::0', 'fresh');
    const estimatedFresh = joinedCachedResponse(chunks, 'leaderboard:llm-overall:balanced:50::1', 'fresh');
    const paginationProjection = joinedCachedResponse(
      chunks,
      'leaderboard-projection:llm-overall:balanced:0',
      'fresh',
    );

    expect(JSON.parse(summaryFresh.body)).toMatchObject({
      revision: result.revision,
      freshness: { status: 'fresh', checkedAt: observedAt },
      data: { compareDirectory: expect.any(Object) },
    });
    expect(JSON.parse(summaryStale.body)).toMatchObject({
      revision: result.revision,
      freshness: { status: 'stale', checkedAt: observedAt, message: 'Published benchmark revision has not refreshed within 36 hours.' },
    });
    expect(JSON.parse(overallFresh.body)).toMatchObject({
      data: { key: 'llm-overall', profile: 'balanced', pagination: { limit: 50 } },
    });
    expect(JSON.parse(estimatedFresh.body)).toMatchObject({
      data: { key: 'llm-overall', profile: 'balanced', pagination: { limit: 50 } },
    });
    expect(JSON.parse(paginationProjection.body)).toMatchObject({
      revision: { revision: result.revision },
      leaderboard: { profile: 'balanced' },
      entries: expect.any(Array),
    });
    expect(summaryFresh.etag).not.toBe(summaryStale.etag);
    expect(db.state.publicationStatements
      .filter((statement) => statement.sql.includes('INSERT INTO api_response_entries'))
      .every((statement) => statement.values.length <= 100)).toBe(true);

    const finalEntryIndex = Math.max(...db.state.publicationStatements
      .map((statement, index) => statement.sql.includes('INSERT INTO api_response_entries') ? index : -1));
    const cachePointerIndex = db.state.publicationStatements
      .findIndex((statement) => statement.sql.includes('api_response_publication_state'));
    expect(cachePointerIndex).toBeGreaterThan(finalEntryIndex);
    expect(db.state.publicationStatements.filter((statement) => statement.sql.includes('DELETE FROM api_response_')))
      .toHaveLength(2);
  });

  it('leaves a failed publication batch invisible while allowing immutable R2 orphan evidence', async () => {
    const previous: RevisionRow = {
      revision: 'benchmark-known-good', generatedAt: observedAt, publishedAt: observedAt, checkedAt: observedAt,
      publicationState: 'published', contentHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      catalogRevision: 'catalog-rev-1', openrouterContentHash: sha256(new TextEncoder().encode(openRouterProjected)),
    };
    const { env, db, r2, events } = seededEnvironment({ activeBenchmark: previous, failPublicationBatch: true });
    const objectsBefore = r2.objects.size;

    const result = await refreshBenchmarkRevision(env, dependencies(healthyFetch()).dependencies);

    expect(result.status).toBe('failed');
    expect(db.state.activeRevision).toBe(previous.revision);
    expect(db.state.revisions).toEqual([previous]);
    expect(db.state.publicationBatchCalls).toBe(1);
    expect(events.filter((event) => event === 'd1:publication')).toHaveLength(1);
    expect(events.indexOf('d1:publication')).toBeGreaterThan(events.findIndex((event) => event.startsWith('r2:benchmarks/')));
    expect(r2.objects.size).toBeGreaterThan(objectsBefore);
    expect([...db.state.refreshRows.values()].some((row) => row.lastError?.includes('D1 batch rolled back'))).toBe(true);
  });

  it('preserves the prior pointer when a required LMArena page has a non-retryable failure', async () => {
    const previous: RevisionRow = {
      revision: 'benchmark-known-good', generatedAt: observedAt, publishedAt: observedAt, checkedAt: observedAt,
      publicationState: 'published', contentHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      catalogRevision: 'catalog-rev-1', openrouterContentHash: sha256(new TextEncoder().encode(openRouterProjected)),
    };
    const { env, db } = seededEnvironment({ activeBenchmark: previous });
    const transport = dependencies(healthyFetch({
      onRequest(url) {
        return url.hostname === 'datasets-server.huggingface.co' && url.searchParams.get('config') === 'agent'
          ? new Response('unavailable', { status: 401 })
          : undefined;
      },
    }));

    const result = await refreshBenchmarkRevision(env, transport.dependencies);

    expect(result.status).toBe('failed');
    expect(db.state.activeRevision).toBe('benchmark-known-good');
    expect(db.state.revisions).toHaveLength(1);
    expect(db.state.publicationStatements).toHaveLength(0);
    expect([...db.state.refreshRows.values()].some((row) => row.lastError?.includes('401'))).toBe(true);
  });

  it('reuses 304 snapshots and only updates checked_at for unchanged combined content', async () => {
    const { env, db, r2, events } = seededEnvironment();
    let lmArena304Responses = 0;
    const fetchImpl = healthyFetch({
      onRequest(url, init) {
        if ((url.hostname === 'benchlm.ai' || url.hostname === 'raw.githubusercontent.com')
          && requestHeaders(init).get('if-none-match')) {
          return new Response(null, { status: 304 });
        }
        if (url.hostname === 'datasets-server.huggingface.co' && requestHeaders(init).get('if-none-match')) {
          lmArena304Responses += 1;
          return new Response(null, { status: 304 });
        }
        return undefined;
      },
    });
    const first = await refreshBenchmarkRevision(env, dependencies(fetchImpl).dependencies);
    const firstObjectCount = r2.objects.size;
    const eventCountAfterFirst = events.length;
    const second = await refreshBenchmarkRevision(env, dependencies(fetchImpl, () => '2026-08-05T13:00:00.000Z').dependencies);

    expect(first.status).toBe('published');
    expect(second).toMatchObject({ status: 'unchanged', revision: first.revision, error: null });
    expect(db.state.revisions).toHaveLength(1);
    expect(db.state.revisions[0].checkedAt).toBe('2026-08-05T13:00:00.000Z');
    expect(lmArena304Responses).toBeGreaterThan(0);
    expect(r2.objects.size).toBe(firstObjectCount);
    expect(events.slice(eventCountAfterFirst)).toEqual(['d1:refresh']);
  });

  it('publishes a new immutable revision when unchanged source artifacts were hashed before the derivation schema version', async () => {
    const { env, db, events } = seededEnvironment();
    const first = await refreshBenchmarkRevision(env, dependencies(healthyFetch()).dependencies);
    if (!first.revision) throw new Error('expected the initial benchmark revision');
    const legacyArtifacts = (db.state.sourceRows.get(first.revision) ?? [])
      .map((source) => ({ sourceId: source.sourceId, artifactId: source.artifactId, contentHash: source.contentHash }))
      .sort((left, right) => {
        const leftIdentity = `${left.sourceId}\u0000${left.artifactId}`;
        const rightIdentity = `${right.sourceId}\u0000${right.artifactId}`;
        return leftIdentity < rightIdentity ? -1 : leftIdentity > rightIdentity ? 1 : 0;
      });
    const legacyContentHash = sha256(new TextEncoder().encode(JSON.stringify({
      catalogRevision: db.state.catalog.revision,
      openrouterContentHash: db.state.catalog.contentHash,
      artifacts: legacyArtifacts,
    })));
    const legacyRevision = db.state.revisions.find((revision) => revision.revision === first.revision);
    if (!legacyRevision) throw new Error('expected the active revision record');
    const legacyRevisionId = `benchmark_${legacyContentHash.slice('sha256:'.length, 'sha256:'.length + 32)}`;
    const legacySources = db.state.sourceRows.get(first.revision);
    if (!legacySources) throw new Error('expected active source records');
    db.state.sourceRows.delete(first.revision);
    db.state.sourceRows.set(legacyRevisionId, legacySources);
    legacyRevision.revision = legacyRevisionId;
    legacyRevision.contentHash = legacyContentHash;
    db.state.activeRevision = legacyRevisionId;
    const eventsAfterLegacyRevision = events.length;

    const refreshed = await refreshBenchmarkRevision(
      env,
      dependencies(healthyFetch(), () => '2026-08-05T13:00:00.000Z').dependencies,
    );

    expect(refreshed).toMatchObject({ status: 'published', error: null, revision: expect.any(String) });
    expect(refreshed.revision).not.toBe(legacyRevisionId);
    expect(db.state.revisions).toHaveLength(2);
    expect(db.state.revisions.find((revision) => revision.revision === legacyRevisionId)?.publicationState).toBe('superseded');
    expect(db.state.revisions.find((revision) => revision.revision === refreshed.revision)?.contentHash).toBe(legacyContentHash);
    expect(events.slice(eventsAfterLegacyRevision)).toContain('d1:publication');
  });

  it('publishes a BenchLM bundle that combines immutable 304 projections with a fresh 200 artifact', async () => {
    const { env, db } = seededEnvironment();
    const first = await refreshBenchmarkRevision(env, dependencies(healthyFetch()).dependencies);
    const changedPricing = JSON.parse(fixture('pricing')) as { items: Array<Record<string, unknown>> };
    changedPricing.items[0].inputPrice = 2.75;
    const fetchImpl = healthyFetch({
      onRequest(url, init) {
        if (!requestHeaders(init).get('if-none-match')) return undefined;
        if (url.hostname === 'benchlm.ai') {
          const artifact = url.pathname.match(/\/([^/]+)\.json$/)?.[1];
          if (artifact === 'pricing') {
            return new Response(JSON.stringify(changedPricing), {
              headers: { etag: '"pricing-new-etag"' },
            });
          }
          return new Response(null, { status: 304 });
        }
        if (url.hostname === 'raw.githubusercontent.com' || url.hostname === 'datasets-server.huggingface.co') {
          return new Response(null, { status: 304 });
        }
        return undefined;
      },
    });

    const second = await refreshBenchmarkRevision(env, dependencies(fetchImpl, () => '2026-08-05T13:00:00.000Z').dependencies);

    expect(first.status).toBe('published');
    expect(second).toMatchObject({ status: 'published', error: null, revision: expect.any(String) });
    expect(second.revision).not.toBe(first.revision);
    const firstSources = db.state.sourceRows.get(first.revision as string) ?? [];
    const secondSources = db.state.sourceRows.get(second.revision as string) ?? [];
    const secondBenchLm = secondSources.filter((source) => source.sourceId === 'benchlm');
    expect(secondBenchLm).toHaveLength(5);
    expect(secondBenchLm.every((source) => source.upstreamRevision === '2026-08-05T06:25:54.198Z')).toBe(true);
    for (const artifact of benchLmArtifacts.filter((artifact) => artifact !== 'pricing')) {
      expect(secondBenchLm.find((source) => source.artifactId === artifact)?.snapshotKey)
        .toBe(firstSources.find((source) => source.sourceId === 'benchlm' && source.artifactId === artifact)?.snapshotKey);
    }
    expect(secondBenchLm.find((source) => source.artifactId === 'pricing')?.snapshotKey)
      .not.toBe(firstSources.find((source) => source.sourceId === 'benchlm' && source.artifactId === 'pricing')?.snapshotKey);
    expect(db.state.revisions.find((revision) => revision.revision === second.revision)?.generatedAt)
      .toBe('2026-08-05T06:25:54.198Z');
  });

  it('does not overwrite immutable R2 provenance when only projected-away BenchLM bytes change', async () => {
    const { env, db, r2, events } = seededEnvironment();
    const first = await refreshBenchmarkRevision(env, dependencies(healthyFetch()).dependencies);
    const firstSources = db.state.sourceRows.get(first.revision as string) ?? [];
    const firstModels = firstSources.find((source) => source.sourceId === 'benchlm' && source.artifactId === 'models');
    if (!firstModels) throw new Error('expected initial BenchLM models provenance');
    const originalSnapshot = r2.objects.get(firstModels.snapshotKey);
    const originalMetadata = originalSnapshot?.customMetadata.original_content_hash;
    const originalBytes = originalSnapshot?.bytes.slice();
    const changedModels = JSON.parse(fixture('models')) as { items: Array<Record<string, unknown>> };
    changedModels.items[0].unreviewed_upstream_field = 'changed-but-projected-away';
    const changedRawHash = sha256(new TextEncoder().encode(JSON.stringify(changedModels)));
    const eventsAfterFirst = events.length;
    const fetchImpl = healthyFetch({
      onRequest(url, init) {
        if (url.hostname === 'benchlm.ai' && url.pathname.endsWith('/models.json')) {
          return new Response(JSON.stringify(changedModels), { headers: { etag: '"models-upstream-only-change"' } });
        }
        if (requestHeaders(init).get('if-none-match')
          && (url.hostname === 'raw.githubusercontent.com' || url.hostname === 'datasets-server.huggingface.co')) {
          return new Response(null, { status: 304 });
        }
        return undefined;
      },
    });

    const second = await refreshBenchmarkRevision(env, dependencies(fetchImpl, () => '2026-08-05T13:00:00.000Z').dependencies);

    expect(first.status).toBe('published');
    expect(second).toMatchObject({ status: 'unchanged', revision: first.revision, error: null });
    expect(changedRawHash).not.toBe(firstModels.originalContentHash);
    const storedSnapshot = r2.objects.get(firstModels.snapshotKey);
    expect(storedSnapshot?.bytes).toEqual(originalBytes);
    expect(storedSnapshot?.customMetadata.original_content_hash).toBe(originalMetadata);
    expect(storedSnapshot?.customMetadata.original_content_hash).toBe(firstModels.originalContentHash);
    expect(events.slice(eventsAfterFirst)).toEqual(['d1:refresh']);
  });

  it('rejects a contaminated legacy OpenRouter snapshot before upstream fetches', async () => {
    const legacyBytes = new TextEncoder().encode(openRouterRaw);
    const { env, db, r2 } = seededEnvironment({
      catalogContentHash: sha256(legacyBytes),
    });
    r2.objects.set(openRouterSnapshotKey, {
      bytes: legacyBytes,
      customMetadata: { original_content_hash: sha256(legacyBytes) },
    });
    const fetchImpl = vi.fn(healthyFetch());

    const result = await refreshBenchmarkRevision(env, dependencies(fetchImpl).dependencies);

    expect(result.status).toBe('failed');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(db.state.activeRevision).toBeNull();
  });

  it('rejects a contaminated legacy BenchLM projection when 304 asks for reuse', async () => {
    const { env, db, r2 } = seededEnvironment();
    const first = await refreshBenchmarkRevision(env, dependencies(healthyFetch()).dependencies);
    const modelsKey = [...r2.objects.keys()].find((key) => key.includes('/benchlm/models/projected/'));
    if (!modelsKey) throw new Error('expected BenchLM models evidence');
    const contaminated = JSON.parse(new TextDecoder().decode(r2.objects.get(modelsKey)?.bytes)) as Record<string, unknown>;
    (contaminated.items as Array<Record<string, unknown>>)[0].benchmarks = { artificial_analysis: { score: 1 } };
    r2.objects.set(modelsKey, { bytes: new TextEncoder().encode(JSON.stringify(contaminated)), customMetadata: {} });
    const fetchImpl = healthyFetch({
      onRequest(url, init) {
        return (url.hostname === 'benchlm.ai' || url.hostname === 'raw.githubusercontent.com')
          && requestHeaders(init).get('if-none-match')
          ? new Response(null, { status: 304 })
          : undefined;
      },
    });

    const second = await refreshBenchmarkRevision(env, dependencies(fetchImpl).dependencies);

    expect(first.status).toBe('published');
    expect(second.status).toBe('failed');
    expect(db.state.activeRevision).toBe(first.revision);
  });

  it('bounds timeouts, retries 429 with Retry-After, and identifies TokenBench requests', async () => {
    let leaderboardAttempts = 0;
    const fetchImpl = healthyFetch({
      onRequest(url, init) {
        if (url.pathname.endsWith('/leaderboard.json') && ++leaderboardAttempts === 1) {
          return new Response('rate limited', { status: 429, headers: { 'retry-after': '1' } });
        }
        expect(requestHeaders(init).get('user-agent')).toContain('TokenBench');
        return undefined;
      },
    });
    const { env } = seededEnvironment();
    const transport = dependencies(fetchImpl);

    const result = await refreshBenchmarkRevision(env, transport.dependencies);

    expect(result.status).toBe('published');
    expect(leaderboardAttempts).toBe(2);
    expect(transport.timeouts).toContain(20_000);
    expect(transport.retries).toEqual([1_000]);
  });

  it('aborts an actually pending request at the timeout boundary and records the bounded exhausted error', async () => {
    let leaderboardAttempts = 0;
    let timeoutAborts = 0;
    const timeoutHandlers: Array<() => void> = [];
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(_input));
      if (!url.pathname.endsWith('/leaderboard.json')) return healthyFetch()(_input, init);
      if (++leaderboardAttempts > 3) throw new Error('unexpected fourth leaderboard attempt');
      const signal = init?.signal;
      if (!signal) throw new Error('expected an abort signal');
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        const timeout = timeoutHandlers.at(-1);
        if (!timeout) throw new Error('expected timeout handler before fetch');
        timeoutAborts += 1;
        timeout();
      });
    });
    const retries: number[] = [];
    const { env, db } = seededEnvironment();

    const result = await refreshBenchmarkRevision(env, {
      fetchImpl: fetchImpl as typeof fetch,
      readParquetRows: async () => { throw new Error('unexpected Hub Parquet decode'); },
      now: () => observedAt,
      createAbortController: () => new AbortController(),
      setTimeoutImpl: (handler) => {
        timeoutHandlers.push(handler);
        return timeoutHandlers.length as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeoutImpl: () => undefined,
      sleep: async (timeout) => { retries.push(timeout); },
      random: () => 0,
    });

    expect(result.status).toBe('failed');
    expect(leaderboardAttempts).toBe(3);
    expect(timeoutAborts).toBe(3);
    expect(timeoutHandlers).toHaveLength(7); // five first-pass BenchLM requests plus two leaderboard retries.
    expect(retries).toEqual([250, 500]);
    expect(result.error).toContain('timed out after 20000ms');
    const error = [...db.state.refreshRows.values()].find((row) => row.lastError !== null)?.lastError;
    expect(error).toContain('timed out after 20000ms');
    expect(error?.length).toBeLessThanOrEqual(1_000);
  });

  it('keeps a stalled benchmark body inside the 20-second retry deadline without leaking timers', async () => {
    let leaderboardAttempts = 0;
    let stalledBodyReads = 0;
    let cancelledBodies = 0;
    let missingDeadlines = 0;
    let nextTimerId = 0;
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
    const controllers: AbortController[] = [];
    const activeTimers = new Map<AbortSignal, { id: number; handler: () => void; timeout: number }>();
    const clearedTimers: number[] = [];
    const retries: number[] = [];
    const releaseStalledBodies = new Set<() => void>();
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (!url.pathname.endsWith('/leaderboard.json')) return healthyFetch()(input, init);
      leaderboardAttempts += 1;
      const signal = init?.signal;
      if (!signal) throw new Error('expected an abort signal for the stalled response');
      let releasePull: ((fallback: boolean) => void) | undefined;
      return new Response(new ReadableStream<Uint8Array>({
        pull(controller) {
          stalledBodyReads += 1;
          const timer = activeTimers.get(signal);
          if (timer) queueMicrotask(timer.handler);
          else missingDeadlines += 1;
          return new Promise<void>((resolve) => {
            let released = false;
            releasePull = (fallback) => {
              if (released) return;
              released = true;
              releaseStalledBodies.delete(release);
              if (fallback) {
                controller.enqueue(new TextEncoder().encode('{}'));
                controller.close();
              }
              resolve();
            };
            const release = () => releasePull?.(true);
            releaseStalledBodies.add(release);
            fallbackTimer ??= setTimeout(() => {
              for (const release of releaseStalledBodies) release();
            }, 25);
          });
        },
        cancel() {
          cancelledBodies += 1;
          releasePull?.(false);
        },
      }), { headers: { etag: `"stalled-${leaderboardAttempts}"` } });
    });
    const { env, db } = seededEnvironment();

    try {
      const result = await refreshBenchmarkRevision(env, {
        fetchImpl: fetchImpl as typeof fetch,
        readParquetRows: async () => { throw new Error('unexpected Hub Parquet decode'); },
        now: () => observedAt,
        createAbortController: () => {
          const controller = new AbortController();
          controllers.push(controller);
          return controller;
        },
        setTimeoutImpl: (handler, timeout) => {
          const controller = controllers.at(-1);
          if (!controller) throw new Error('expected a controller before scheduling the deadline');
          const id = ++nextTimerId;
          activeTimers.set(controller.signal, { id, handler, timeout });
          return id as unknown as ReturnType<typeof setTimeout>;
        },
        clearTimeoutImpl: (timeout) => {
          const id = Number(timeout);
          const owner = [...activeTimers.entries()].find(([, timer]) => timer.id === id)?.[0];
          if (owner) activeTimers.delete(owner);
          clearedTimers.push(id);
        },
        sleep: async (timeout) => { retries.push(timeout); },
        random: () => 0,
      });

      expect(result.status).toBe('failed');
      expect(leaderboardAttempts).toBe(3);
      expect(stalledBodyReads).toBe(3);
      expect(cancelledBodies).toBe(3);
      expect(missingDeadlines).toBe(0);
      expect(retries).toEqual([250, 500]);
      expect(clearedTimers).toHaveLength(nextTimerId);
      expect(activeTimers).toHaveLength(0);
      expect(result.error).toContain('timed out after 20000ms');
      expect(result.error?.length).toBeLessThanOrEqual(1_000);
      expect([...db.state.refreshRows.values()].some((row) => row.lastError === result.error)).toBe(true);
    } finally {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      for (const release of releaseStalledBodies) release();
    }
  });

  it('stops retrying a persistent 429 after the bounded retry budget and records last_error', async () => {
    let leaderboardAttempts = 0;
    const fetchImpl = healthyFetch({
      onRequest(url) {
        if (url.pathname.endsWith('/leaderboard.json')) {
          leaderboardAttempts += 1;
          return new Response('rate limited', { status: 429, headers: { 'retry-after': '1' } });
        }
        return undefined;
      },
    });
    const { env, db } = seededEnvironment();
    const transport = dependencies(fetchImpl);

    const result = await refreshBenchmarkRevision(env, transport.dependencies);

    expect(result.status).toBe('failed');
    expect(leaderboardAttempts).toBe(3);
    expect(transport.retries).toEqual([1_000, 1_000]);
    const error = [...db.state.refreshRows.values()].find((row) => row.lastError !== null)?.lastError;
    expect(error).toContain('returned 429');
    expect(error?.length).toBeLessThanOrEqual(1_000);
  });

  it.each([
    ['401', () => new Response('unauthorized', { status: 401 })],
    ['403', () => new Response('forbidden', { status: 403 })],
    ['oversized', () => new Response('{}', { headers: { 'content-length': String(100 * 1024 * 1024) } })],
    ['schema', () => new Response('{"schemaVersion":"wrong","generatedAt":"2026-08-05T00:00:00.000Z","items":[]}')],
  ])('records a bounded last_error for %s failures', async (_label, response) => {
    const { env, db } = seededEnvironment();
    const result = await refreshBenchmarkRevision(env, dependencies(healthyFetch({
      onRequest(url) { return url.pathname.endsWith('/leaderboard.json') ? response() : undefined; },
    })).dependencies);

    expect(result.status).toBe('failed');
    const error = [...db.state.refreshRows.values()].find((row) => row.lastError !== null)?.lastError;
    expect(error).toBeTruthy();
    expect(error?.length).toBeLessThanOrEqual(1_000);
  });

  it.each([
    ['duplicate row identity', () => new Response(JSON.stringify({ rows: [arenaRows('text_style_control', 0, 1)[0], arenaRows('text_style_control', 0, 1)[0]] }), { headers: { 'x-revision': 'same' } })],
    ['declared total row-count mismatch', () => new Response(JSON.stringify({
      rows: [arenaRows('text_style_control', 61, 1)[0], arenaRows('text_style_control', 73, 1)[0]],
      num_rows_total: 3,
    }), { headers: { 'x-revision': 'same' } })],
  ])('aborts publication on LMArena %s', async (_label, response) => {
    const { env, db } = seededEnvironment();
    const result = await refreshBenchmarkRevision(env, dependencies(healthyFetch({
      onRequest(url) {
        if (url.hostname !== 'datasets-server.huggingface.co') return undefined;
        const subset = url.searchParams.get('config');
        return subset === 'text_style_control'
          ? response()
          : arenaResponse(subset ?? 'agent', Number(url.searchParams.get('offset')), 1, 'same');
      },
    })).dependencies);

    expect(result.status).toBe('failed');
    expect(db.state.activeRevision).toBeNull();
  });

  it('rejects a short LMArena page sequence without a verified total instead of treating it as EOF', async () => {
    const previous: RevisionRow = {
      revision: 'benchmark-known-good', generatedAt: observedAt, publishedAt: observedAt, checkedAt: observedAt,
      publicationState: 'published', contentHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      catalogRevision: 'catalog-rev-1', openrouterContentHash: sha256(new TextEncoder().encode(openRouterProjected)),
    };
    const requestedOffsets: number[] = [];
    const { env, db } = seededEnvironment({ activeBenchmark: previous });

    const result = await refreshBenchmarkRevision(env, dependencies(healthyFetch({
      onRequest(url) {
        if (url.hostname !== 'datasets-server.huggingface.co') return undefined;
        const subset = url.searchParams.get('config') ?? 'agent';
        const offset = Number(url.searchParams.get('offset'));
        if (subset !== 'text_style_control') return arenaResponse(subset, offset, 1, 'common-lmarena-revision', 1);
        requestedOffsets.push(offset);
        if (offset === 0) return arenaResponse(subset, offset, 100, 'common-lmarena-revision', null);
        if (offset === 100) return arenaResponse(subset, offset, 1, 'common-lmarena-revision', null);
        // This later page exists at the same revision, but a malicious short
        // page at offset 100 must never be trusted to terminate pagination.
        return arenaResponse(subset, offset, 1, 'common-lmarena-revision');
      },
    })).dependencies);

    expect(result.status).toBe('failed');
    expect(requestedOffsets).toEqual([0]);
    expect(db.state.activeRevision).toBe(previous.revision);
    expect(db.state.publicationBatchCalls).toBe(0);
    expect(result.error).toMatch(/num_rows_total|total/i);
  });

  it('accepts sparse Dataset Viewer row_idx values when the declared filtered-row total is complete', async () => {
    const sparseRows = [arenaRows('text_style_control', 61, 1)[0], arenaRows('text_style_control', 73, 1)[0]];
    const { env } = seededEnvironment();
    const result = await refreshBenchmarkRevision(env, dependencies(healthyFetch({
      onRequest(url) {
        if (url.hostname !== 'datasets-server.huggingface.co') return undefined;
        const subset = url.searchParams.get('config') ?? 'agent';
        if (subset === 'text_style_control') {
          return new Response(JSON.stringify({ rows: sparseRows, num_rows_total: 2 }), {
            headers: { etag: '"sparse"', 'x-revision': 'same' },
          });
        }
        return arenaResponse(subset, Number(url.searchParams.get('offset')), 1, 'same', 1);
      },
    })).dependencies);

    expect(result.status).toBe('published');
  });

  it('fetches all LMArena pages announced by a >100-row total with a common revision and no more than six in flight', async () => {
    const offsetsBySubset = new Map<string, number[]>();
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchImpl = healthyFetch({
      async onRequest(url) {
        if (url.hostname !== 'datasets-server.huggingface.co') return undefined;
        const subset = url.searchParams.get('config');
        const offset = Number(url.searchParams.get('offset'));
        if (!subset || !Number.isSafeInteger(offset)) throw new Error(`Unexpected LMArena URL ${url}`);
        const offsets = offsetsBySubset.get(subset) ?? [];
        offsets.push(offset);
        offsetsBySubset.set(subset, offsets);
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise<void>((resolve) => queueMicrotask(resolve));
        inFlight -= 1;
        if (subset === 'text_style_control' && offset === 0) {
          return arenaResponse(subset, offset, 100, 'common-lmarena-revision', 101);
        }
        if (subset === 'text_style_control' && offset === 100) {
          return arenaResponse(subset, offset, 1, 'common-lmarena-revision', 101);
        }
        return arenaResponse(subset, offset, 1, 'common-lmarena-revision', 1);
      },
    });
    const { env, db } = seededEnvironment();

    const result = await refreshBenchmarkRevision(env, dependencies(fetchImpl).dependencies);

    expect(result.status).toBe('published');
    expect(offsetsBySubset.get('text_style_control')).toEqual([0, 100]);
    expect(maxInFlight).toBeLessThanOrEqual(6);
    const sources = db.state.sourceRows.get(result.revision as string) ?? [];
    expect(sources.filter((source) => source.sourceId === 'lmarena' && source.artifactId.startsWith('text_style_control:'))
      .map((source) => source.artifactId)).toEqual([
      'text_style_control:latest:overall:rows-0-100',
      'text_style_control:latest:overall:rows-100-200',
    ]);
    expect(sources.filter((source) => source.sourceId === 'lmarena').every((source) => source.upstreamRevision === 'common-lmarena-revision')).toBe(true);
  });

  it('accepts a complete LMArena subset at the exact 200-page safety cap', async () => {
    const requestedOffsets: number[] = [];
    const { env, db } = seededEnvironment();
    const result = await refreshBenchmarkRevision(env, dependencies(healthyFetch({
      onRequest(url) {
        if (url.hostname !== 'datasets-server.huggingface.co') return undefined;
        const subset = url.searchParams.get('config') ?? 'agent';
        const offset = Number(url.searchParams.get('offset'));
        if (subset !== 'text_style_control') {
          return arenaResponse(subset, offset, 1, 'common-lmarena-revision', 1);
        }
        requestedOffsets.push(offset);
        return arenaResponse(subset, offset, 100, 'common-lmarena-revision', 20_000);
      },
    })).dependencies);

    expect(result.status).toBe('published');
    expect(requestedOffsets).toHaveLength(200);
    expect(requestedOffsets[0]).toBe(0);
    expect(requestedOffsets.at(-1)).toBe(19_900);
    const sources = db.state.sourceRows.get(result.revision as string) ?? [];
    expect(sources.filter((source) => source.sourceId === 'lmarena'
      && source.artifactId.startsWith('text_style_control:'))).toHaveLength(200);
    const summaryChunks = apiResponseCacheChunks(db.state.publicationStatements)
      .filter((chunk) => chunk.cacheKey === 'summary' && chunk.variant === 'fresh');
    expect(summaryChunks.length).toBeGreaterThan(1);
    expect(JSON.parse(joinedCachedResponse(summaryChunks, 'summary', 'fresh').body)).toMatchObject({
      revision: result.revision,
      data: { compareDirectory: { models: expect.any(Array) } },
    });
  });

  it('preserves the active revision when a declared LMArena total has a missing required page', async () => {
    const previous: RevisionRow = {
      revision: 'benchmark-known-good', generatedAt: observedAt, publishedAt: observedAt, checkedAt: observedAt,
      publicationState: 'published', contentHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      catalogRevision: 'catalog-rev-1', openrouterContentHash: sha256(new TextEncoder().encode(openRouterProjected)),
    };
    const { env, db } = seededEnvironment({ activeBenchmark: previous });
    const result = await refreshBenchmarkRevision(env, dependencies(healthyFetch({
      onRequest(url) {
        if (url.hostname !== 'datasets-server.huggingface.co') return undefined;
        const subset = url.searchParams.get('config');
        const offset = Number(url.searchParams.get('offset'));
        if (subset !== 'text_style_control') return arenaResponse(subset ?? 'agent', offset, 1, 'common-lmarena-revision', 1);
        return offset === 0
          ? arenaResponse('text_style_control', 0, 100, 'common-lmarena-revision', 101)
          : arenaResponse('text_style_control', 100, 0, 'common-lmarena-revision', 101);
      },
    })).dependencies);

    expect(result.status).toBe('failed');
    expect(db.state.activeRevision).toBe(previous.revision);
    expect(db.state.publicationBatchCalls).toBe(0);
    expect([...db.state.refreshRows.values()].some((row) => row.lastError?.includes('missing'))).toBe(true);
  });

  it('aborts publication when LMArena pages do not share one non-null x-revision', async () => {
    const { env, db } = seededEnvironment();
    const result = await refreshBenchmarkRevision(env, dependencies(healthyFetch({
      onRequest(url) {
        return url.hostname === 'datasets-server.huggingface.co'
          ? arenaResponse(url.searchParams.get('config') ?? 'text_style_control', 0, 1,
            url.searchParams.get('config') === 'agent' ? 'other-revision' : 'first-revision')
          : undefined;
      },
    })).dependencies);

    expect(result.status).toBe('failed');
    expect(db.state.activeRevision).toBeNull();
  });

  it('exposes only scheduled ingestion and does not expose a public refresh route', async () => {
    const { env, db } = seededEnvironment();
    let scheduled: Promise<unknown> | undefined;
    vi.stubGlobal('fetch', healthyFetch());
    try {
      await worker.scheduled(
        { cron: '15 */12 * * *', scheduledTime: Date.now(), noRetry: () => undefined },
        env,
        { waitUntil(promise: Promise<unknown>) { scheduled = promise; } },
      );
      await scheduled;
      expect(db.state.activeRevision).not.toBeNull();

      const response = await worker.fetch(new Request('https://worker.example/refresh', { method: 'POST' }), env, {
        waitUntil: () => undefined,
      });
      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
