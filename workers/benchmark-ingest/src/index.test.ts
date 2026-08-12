import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { BenchmarkComparisonPair, NormalizedSourceBatch } from '../../../src/benchmarks/contracts';
import * as benchmarkIngest from './index';
import worker, {
  buildPublicationStatementPlan,
  buildUnchangedPublicationStatementPlan,
  deriveComparisonPairs,
  executePublicationStatementPlan,
  refreshBenchmarkRevision,
} from './index';

const observedAt = '2026-08-05T12:00:00.000Z';
const benchLmArtifacts = ['leaderboard', 'models', 'pricing', 'comparisons', 'benchmarks', 'public-leaderboard'] as const;
type BenchLmArtifact = typeof benchLmArtifacts[number];

interface Statement {
  sql: string;
  values: unknown[];
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
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
  publicationAttemptId?: string | null;
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

function arenaRowWithModelName(value: unknown, modelName: string): unknown {
  const envelope = value as { row_idx: number; row: Record<string, unknown>; truncated_cells: unknown[] };
  return { ...envelope, row: { ...envelope.row, model_name: modelName } };
}

function arenaPageResponse(
  subset: string,
  offset: number,
  rows: unknown[],
  total: number,
  revision = 'lmarena-revision',
): Response {
  return new Response(JSON.stringify({ rows, num_rows_total: total }), {
    headers: { 'content-type': 'application/json', etag: `"${subset}-${offset}-etag"`, 'x-revision': revision },
  });
}

function requestHeaders(init: RequestInit | undefined): Headers {
  return new Headers(init?.headers);
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

function requiredExport<T>(name: string): T {
  const value = (benchmarkIngest as Record<string, unknown>)[name];
  expect(value).toBeTypeOf('function');
  return value as T;
}

function previousBenchLmSources(observedAt: string): Map<string, { observedAt: string; snapshotKey: string }> {
  return new Map(benchLmArtifacts.map((artifact) => [`benchlm\u0000${artifact}`, {
    observedAt,
    snapshotKey: `benchmarks/benchlm/${artifact}/projected/v2/test/original/test.json`,
  }]));
}

function healthyFetch(options: {
  onRequest?: (url: URL, init: RequestInit | undefined) => Response | Promise<Response | undefined> | undefined;
} = {}): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const intercepted = await options.onRequest?.(url, init);
    if (intercepted) return intercepted;
    if (url.hostname === 'benchlm.ai') {
      const artifact = url.pathname === '/api/data/leaderboard' && url.searchParams.get('mode') === 'bench-align-v5'
        ? 'public-leaderboard'
        : url.pathname.match(/\/([^/]+)\.json$/)?.[1] as BenchLmArtifact | undefined;
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
  failPublicationBatchNumber?: number;
  maxBatchSerializedBytes?: number;
  activeApiResponseRevision?: string;
  activeApiResponseBodies?: string[];
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
    activeApiResponseRevision: options.activeApiResponseRevision ?? null as string | null,
    apiResponseRevisions: new Set(options.activeApiResponseRevision ? [options.activeApiResponseRevision] : []),
    apiResponseEntries: new Map(options.activeApiResponseRevision
      ? [[options.activeApiResponseRevision, [...(options.activeApiResponseBodies ?? [])]]]
      : [] as Array<[string, string[]]>),
    revisions: options.activeBenchmark ? [structuredClone(options.activeBenchmark)] : [] as RevisionRow[],
    sourceRows: new Map<string, SourceRow[]>(options.activeBenchmark
      ? [[options.activeBenchmark.revision, structuredClone(options.activeSources ?? [])]]
      : []),
    refreshRows: new Map<string, RefreshRow>(),
    batchCalls: 0,
    publicationBatchCalls: 0,
    publicationStatements: [] as RecordedStatement[],
    batchSerializedBytes: [] as number[],
    batchStatements: [] as RecordedStatement[][],
    queryCount: 0,
  };

  function readFirst<T>(sql: string, values: unknown[]): T | null {
    if (sql.includes('catalog_publication_state')) return structuredClone(state.catalog) as T;
    if (sql.includes('benchmark_publication_state')) {
      const active = state.revisions.find((record) => record.revision === state.activeRevision);
      return active ? structuredClone(active) as T : null;
    }
    if (sql.includes('FROM benchmark_refresh_state')) {
      const row = state.refreshRows.get('benchlm:daily-network-check-v2');
      return row ? structuredClone(row) as T : null;
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
      async first<T>() {
        state.queryCount += 1;
        return readFirst<T>(sql, values);
      },
      async all<T>() {
        state.queryCount += 1;
        return { results: readAll<T>(sql, values) };
      },
      async run() {
        state.queryCount += 1;
        const key = 'benchlm:daily-network-check-v2';
        if (sql.includes('benchlm daily-check claim')) {
          const lease = String(values[0]);
          const checkedAt = String(values[1]);
          const existing = state.refreshRows.get(key);
          const leaseExpiry = existing?.lastError?.match(/^benchlm-daily-lease-v2:([^|]+)\|/)?.[1] ?? null;
          const checkedAtMs = Date.parse(checkedAt);
          const activeLease = leaseExpiry !== null
            && Number.isFinite(checkedAtMs)
            && Date.parse(leaseExpiry) > checkedAtMs;
          const successfulToday = existing?.lastSuccessAt?.slice(0, 10) === checkedAt.slice(0, 10);
          if (successfulToday || activeLease) return { meta: { changes: 0 } };
          state.refreshRows.set(key, {
            lastSuccessAt: existing?.lastSuccessAt ?? null,
            lastRevision: existing?.lastRevision ?? null,
            lastError: lease,
          });
          return { meta: { changes: 1 } };
        }
        if (sql.includes('benchlm daily-check complete')) {
          const checkedAt = String(values[0]);
          const lease = String(values[1]);
          const existing = state.refreshRows.get(key);
          if (existing?.lastError !== lease) return { meta: { changes: 0 } };
          state.refreshRows.set(key, { lastSuccessAt: checkedAt, lastRevision: null, lastError: null });
          return { meta: { changes: 1 } };
        }
        if (sql.includes('benchlm daily-check release')) {
          const lease = String(values[0]);
          const existing = state.refreshRows.get(key);
          if (existing?.lastError !== lease) return { meta: { changes: 0 } };
          state.refreshRows.set(key, {
            lastSuccessAt: existing.lastSuccessAt,
            lastRevision: existing.lastRevision,
            lastError: null,
          });
          return { meta: { changes: 1 } };
        }
        return { meta: { changes: 0 } };
      },
    };
  }

  function apply(draft: typeof state, next: Statement): void {
    const { sql, values } = next;
    if (sql.startsWith('INSERT INTO benchmark_revisions')) {
      if (draft.revisions.some((record) => record.revision === String(values[0]))) {
        throw new Error('D1 UNIQUE constraint failed: benchmark_revisions.revision');
      }
      draft.revisions.push({
        revision: String(values[0]), generatedAt: String(values[1]), publishedAt: values[2] === null ? null : String(values[2]),
        checkedAt: String(values[3]), publicationState: String(values[4]) as RevisionRow['publicationState'],
        contentHash: String(values[5]), catalogRevision: String(values[6]), openrouterContentHash: String(values[7]),
        publicationAttemptId: String(values[8]),
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
    } else if (sql.startsWith('DELETE FROM benchmark_revisions')) {
      const revision = String(values[0]);
      const existing = draft.revisions.find((record) => record.revision === revision);
      const ownershipMatches = sql.includes('publication_attempt_id')
        ? existing?.publicationAttemptId === String(values[1])
        : existing !== undefined && existing.checkedAt < String(values[1]);
      if (existing?.publicationState === 'pending' && ownershipMatches) {
        draft.revisions = draft.revisions.filter((record) => record.revision !== revision);
        draft.sourceRows.delete(revision);
      }
    } else if (sql.includes("UPDATE benchmark_revisions SET publication_state = 'superseded'")) {
      draft.revisions.forEach((record) => {
        if (record.publicationState === 'published') record.publicationState = 'superseded';
      });
    } else if (sql.includes("UPDATE benchmark_revisions SET publication_state = 'published'")) {
      const revision = draft.revisions.find((record) => record.revision === String(values[1]));
      if (revision?.publicationAttemptId === String(values[2])) {
        revision.publicationState = 'published';
        revision.publishedAt = String(values[0]);
      }
    } else if (sql.includes('benchmark_publication_state')) {
      const target = draft.revisions.find((record) => record.revision === String(values[0]));
      if (target?.publicationState !== 'published') {
        throw new Error('benchmark publication pointer requires a published revision');
      }
      draft.activeRevision = target.revision;
    } else if (sql.startsWith('INSERT INTO api_response_revisions')) {
      draft.apiResponseRevisions.add(String(values[1]));
    } else if (sql.startsWith('INSERT INTO api_response_entries')) {
      for (let offset = 0; offset < values.length; offset += 7) {
        const revision = String(values[offset + 1]);
        const bodies = draft.apiResponseEntries.get(revision) ?? [];
        bodies.push(String(values[offset + 6]));
        draft.apiResponseEntries.set(revision, bodies);
      }
    } else if (sql.startsWith('DELETE FROM api_response_entries')) {
      draft.apiResponseEntries.delete(String(values[1]));
    } else if (sql.startsWith('INSERT INTO api_response_publication_state')) {
      const target = String(values[1]);
      if (String(values[0]) === 'benchmarks'
        && (draft.activeRevision === null || !target.startsWith(`${draft.activeRevision}+cache-`))) {
        throw new Error('benchmark cache pointer must match the active benchmark revision');
      }
      draft.activeApiResponseRevision = target;
    } else if (sql.startsWith('DELETE FROM api_response_revisions')) {
      const candidateRevision = String(values[1]);
      if (candidateRevision !== draft.activeApiResponseRevision) {
        draft.apiResponseRevisions.delete(candidateRevision);
        draft.apiResponseEntries.delete(candidateRevision);
      }
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
      state.queryCount += statements.length;
      const recorded = statements.map((item) => ({ sql: item.sql, values: [...item.values] }));
      const serializedBytes = new TextEncoder().encode(JSON.stringify(recorded)).byteLength;
      state.batchSerializedBytes.push(serializedBytes);
      state.batchStatements.push(recorded);
      if (options.maxBatchSerializedBytes !== undefined && serializedBytes > options.maxBatchSerializedBytes) {
        throw new Error(`D1 RPC payload exceeded ${options.maxBatchSerializedBytes} test bytes`);
      }
      state.batchCalls += 1;
      const isPublication = statements.some((item) => item.sql.includes('benchmark_revisions')
        || item.sql.includes('benchmark_source_records')
        || item.sql.includes('benchmark_models')
        || item.sql.includes('benchmark_metrics')
        || item.sql.includes('benchmark_price_checks')
        || item.sql.includes('benchmark_comparison_pairs')
        || item.sql.includes('benchmark_publication_state')
        || item.sql.includes('api_response_revisions')
        || item.sql.includes('api_response_entries')
        || item.sql.includes('api_response_publication_state'));
      if (isPublication) {
        state.publicationBatchCalls += 1;
        state.publicationStatements.push(...statements.map((item) => ({ sql: item.sql, values: [...item.values] })));
        events.push('d1:publication');
      } else {
        events.push('d1:refresh');
      }
      if (isPublication && (options.failPublicationBatch && state.publicationBatchCalls === 1
        || options.failPublicationBatchNumber === state.publicationBatchCalls)) {
        throw new Error('D1 batch rolled back');
      }
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
  let publicationAttempt = 0;
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
      publicationAttemptId: () => `test-attempt-${++publicationAttempt}`,
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
    category: 'coding', value: index + 1, rawValue: null, rank: null, lower: null, upper: null, voteCount: null,
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
  // Keep the fixture above D1's 32 MiB aggregate RPC ceiling once the fresh
  // and stale summary/projection bodies are materialized.
  const wideMetadata = 'x'.repeat(3_500);
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
    const plan = buildPublicationStatementPlan(db, 'benchmark-live-scale', observedAt, observedAt,
      `sha256:${'b'.repeat(64)}`, {
        revision: 'catalog-rev-1', sourceUrl: 'https://openrouter.ai/api/v1/models', observedAt,
        snapshotKey: openRouterSnapshotKey, contentHash: sha256(new TextEncoder().encode(openRouterProjected)),
      }, batch, pairs);
    const statements = [...plan.staging, ...plan.commit] as unknown as Statement[];

    // Three D1 reads precede the staged statements and final pointer commit.
    // Stay well below the 1,000-query Worker Paid cap.
    expect(3 + plan.staging.length + plan.commit.length).toBeLessThanOrEqual(903);
    expect(3 + plan.staging.length + plan.commit.length + plan.cleanup.length + 1).toBeLessThanOrEqual(911);
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

  it('stages a live-scale publication below the D1 RPC limit and commits both pointers last', async () => {
    const d1RpcLimitBytes = 32 * 1024 * 1024;
    const d1RpcSafetyBudgetBytes = 16 * 1024 * 1024;
    const { db, state } = createDatabase({ maxBatchSerializedBytes: d1RpcSafetyBudgetBytes }, []);
    const { batch, pairs } = liveScaleBatch();
    const plan = buildPublicationStatementPlan(db, 'benchmark-live-scale', observedAt, observedAt,
      `sha256:${'b'.repeat(64)}`, {
        revision: 'catalog-rev-1', sourceUrl: 'https://openrouter.ai/api/v1/models', observedAt,
        snapshotKey: openRouterSnapshotKey, contentHash: sha256(new TextEncoder().encode(openRouterProjected)),
      }, batch, pairs);
    const plannedStatements = [...plan.staging, ...plan.commit] as unknown as Statement[];
    const unbatchedBytes = new TextEncoder().encode(JSON.stringify(
      plannedStatements.map((item) => ({ sql: item.sql, values: item.values })),
    )).byteLength;

    expect(unbatchedBytes).toBeGreaterThan(d1RpcLimitBytes);
    await executePublicationStatementPlan(db, plan);

    expect(state.batchStatements.length).toBeGreaterThan(1);
    expect(Math.max(...state.batchSerializedBytes)).toBeLessThanOrEqual(d1RpcSafetyBudgetBytes);
    const pointerSql = (statement: RecordedStatement) => statement.sql.startsWith('INSERT INTO api_response_publication_state')
      || statement.sql.startsWith('INSERT INTO benchmark_publication_state');
    expect(state.batchStatements.slice(0, -1).flat().some(pointerSql)).toBe(false);
    expect(state.batchStatements.at(-1)?.filter(pointerSql)).toHaveLength(2);
    expect(state.activeRevision).toBe('benchmark-live-scale');
  });

  it('cleans staged rows and keeps both prior pointers when a later publication RPC fails', async () => {
    const previous: RevisionRow = {
      revision: 'benchmark-known-good', generatedAt: observedAt, publishedAt: observedAt, checkedAt: observedAt,
      publicationState: 'published', contentHash: `sha256:${'a'.repeat(64)}`,
      catalogRevision: 'catalog-rev-1', openrouterContentHash: sha256(new TextEncoder().encode(openRouterProjected)),
    };
    const previousApiRevision = 'benchmark-known-good+cache-20260805000000000';
    const { db, state } = createDatabase({
      activeBenchmark: previous,
      activeApiResponseRevision: previousApiRevision,
      failPublicationBatchNumber: 3,
    }, []);
    const { batch, pairs } = liveScaleBatch();
    const plan = buildPublicationStatementPlan(db, 'benchmark-live-scale', observedAt, observedAt,
      `sha256:${'b'.repeat(64)}`, {
        revision: 'catalog-rev-1', sourceUrl: 'https://openrouter.ai/api/v1/models', observedAt,
        snapshotKey: openRouterSnapshotKey, contentHash: sha256(new TextEncoder().encode(openRouterProjected)),
      }, batch, pairs);

    await expect(executePublicationStatementPlan(db, plan)).rejects.toThrow('D1 batch rolled back');

    expect(state.activeRevision).toBe(previous.revision);
    expect(state.activeApiResponseRevision).toBe(previousApiRevision);
    expect([...state.apiResponseRevisions]).toEqual([previousApiRevision]);
    expect(state.revisions).toEqual([previous]);
  });

  it('prevents an overlapping attempt from deleting another attempt pending revision', async () => {
    const { db, state } = createDatabase({}, []);
    const fixtureBatch = liveScaleBatch().batch;
    const batch: NormalizedSourceBatch = {
      sources: fixtureBatch.sources,
      models: fixtureBatch.models.slice(0, 2),
      metrics: fixtureBatch.metrics.slice(0, 2),
      priceChecks: fixtureBatch.priceChecks.slice(0, 2),
      comparisonSeeds: [],
    };
    const catalog = {
      revision: 'catalog-rev-1', sourceUrl: 'https://openrouter.ai/api/v1/models', observedAt,
      snapshotKey: openRouterSnapshotKey, contentHash: sha256(new TextEncoder().encode(openRouterProjected)),
    };
    const first = buildPublicationStatementPlan(db, 'benchmark-overlap', observedAt, observedAt,
      `sha256:${'b'.repeat(64)}`, catalog, batch, [], true, 'attempt-a');
    const second = buildPublicationStatementPlan(db, 'benchmark-overlap', observedAt, observedAt,
      `sha256:${'b'.repeat(64)}`, catalog, batch, [], true, 'attempt-b');

    await db.batch(first.staging as Statement[]);
    await expect(executePublicationStatementPlan(db, second)).rejects.toThrow('UNIQUE constraint');

    expect(state.revisions).toEqual([expect.objectContaining({
      revision: 'benchmark-overlap',
      publicationState: 'pending',
      publicationAttemptId: 'attempt-a',
    })]);
    expect(state.sourceRows.get('benchmark-overlap')).toHaveLength(batch.sources.length);

    await db.batch(first.commit as Statement[]);
    expect(state.activeRevision).toBe('benchmark-overlap');
  });

  it('aborts a stale owner commit after its pending revision is reclaimed', async () => {
    const previous: RevisionRow = {
      revision: 'benchmark-known-good', generatedAt: observedAt, publishedAt: observedAt, checkedAt: observedAt,
      publicationState: 'published', contentHash: `sha256:${'a'.repeat(64)}`,
      catalogRevision: 'catalog-rev-1', openrouterContentHash: sha256(new TextEncoder().encode(openRouterProjected)),
    };
    const previousApiRevision = 'benchmark-known-good+cache-initial';
    const previousBodies = ['known-good-cache-body'];
    const { db, state } = createDatabase({
      activeBenchmark: previous,
      activeApiResponseRevision: previousApiRevision,
      activeApiResponseBodies: previousBodies,
    }, []);
    const fixtureBatch = liveScaleBatch().batch;
    const batch: NormalizedSourceBatch = {
      sources: fixtureBatch.sources,
      models: fixtureBatch.models.slice(0, 2),
      metrics: fixtureBatch.metrics.slice(0, 2),
      priceChecks: fixtureBatch.priceChecks.slice(0, 2),
      comparisonSeeds: [],
    };
    const catalog = {
      revision: 'catalog-rev-1', sourceUrl: 'https://openrouter.ai/api/v1/models', observedAt,
      snapshotKey: openRouterSnapshotKey, contentHash: sha256(new TextEncoder().encode(openRouterProjected)),
    };
    const stale = buildPublicationStatementPlan(db, 'benchmark-reclaimed', observedAt, observedAt,
      `sha256:${'b'.repeat(64)}`, catalog, batch, [], true, 'attempt-stale');
    const replacement = buildPublicationStatementPlan(db, 'benchmark-reclaimed', observedAt,
      '2026-08-05T12:21:00.000Z', `sha256:${'b'.repeat(64)}`, catalog, batch, [], true, 'attempt-replacement');

    await db.batch(stale.staging as Statement[]);
    await db.batch(replacement.staging as Statement[]);
    await expect(db.batch(stale.commit as Statement[]))
      .rejects.toThrow('benchmark publication pointer requires a published revision');

    expect(state.activeRevision).toBe(previous.revision);
    expect(state.activeApiResponseRevision).toBe(previousApiRevision);
    expect(state.apiResponseEntries.get(previousApiRevision)).toEqual(previousBodies);
    expect(state.revisions).toEqual([
      previous,
      expect.objectContaining({
        revision: 'benchmark-reclaimed', publicationState: 'pending', publicationAttemptId: 'attempt-replacement',
      }),
    ]);

    await db.batch(replacement.commit as Statement[]);
    expect(state.activeRevision).toBe('benchmark-reclaimed');
    expect(state.activeApiResponseRevision).toContain('attempt-replacement');
  });

  it('aborts an older unchanged cache commit after a changed revision publishes', async () => {
    const previous: RevisionRow = {
      revision: 'benchmark-r0', generatedAt: observedAt, publishedAt: observedAt, checkedAt: observedAt,
      publicationState: 'published', contentHash: `sha256:${'a'.repeat(64)}`,
      catalogRevision: 'catalog-rev-1', openrouterContentHash: sha256(new TextEncoder().encode(openRouterProjected)),
    };
    const previousApiRevision = 'benchmark-r0+cache-initial';
    const fixtureBatch = liveScaleBatch().batch;
    const batch: NormalizedSourceBatch = {
      sources: fixtureBatch.sources,
      models: fixtureBatch.models.slice(0, 2),
      metrics: fixtureBatch.metrics.slice(0, 2),
      priceChecks: fixtureBatch.priceChecks.slice(0, 2),
      comparisonSeeds: [],
    };
    const { db, state } = createDatabase({
      activeBenchmark: previous,
      activeSources: batch.sources,
      activeApiResponseRevision: previousApiRevision,
      activeApiResponseBodies: ['r0-complete-cache'],
    }, []);
    const snapshot = {
      revision: previous,
      sources: batch.sources,
      models: batch.models,
      metrics: batch.metrics,
      priceChecks: batch.priceChecks,
      comparisonPairs: [],
    };
    const unchanged = buildUnchangedPublicationStatementPlan(db, snapshot, 'attempt-unchanged');
    const changed = buildPublicationStatementPlan(db, 'benchmark-r1', observedAt,
      '2026-08-05T13:00:00.000Z', `sha256:${'b'.repeat(64)}`, {
        revision: 'catalog-rev-1', sourceUrl: 'https://openrouter.ai/api/v1/models', observedAt,
        snapshotKey: openRouterSnapshotKey, contentHash: sha256(new TextEncoder().encode(openRouterProjected)),
      }, batch, [], true, 'attempt-changed');

    await db.batch(unchanged.staging as Statement[]);
    await executePublicationStatementPlan(db, changed);
    const changedApiRevision = state.activeApiResponseRevision;
    const changedBodies = structuredClone(state.apiResponseEntries.get(changedApiRevision ?? '') ?? []);

    await expect(db.batch(unchanged.commit as Statement[]))
      .rejects.toThrow('benchmark cache pointer must match the active benchmark revision');

    expect(state.activeRevision).toBe('benchmark-r1');
    expect(state.activeApiResponseRevision).toBe(changedApiRevision);
    expect(state.apiResponseEntries.get(changedApiRevision ?? '')).toEqual(changedBodies);
    expect(changedBodies.length).toBeGreaterThan(0);

    await db.batch(unchanged.cleanup as Statement[]);
    expect([...state.apiResponseRevisions]).not.toContainEqual(expect.stringContaining('attempt-unchanged'));
  });

  it('bootstraps durable profiles and the current UTC week when an active revision is unchanged', async () => {
    const { env, db } = seededEnvironment();
    const first = await refreshBenchmarkRevision(
      env,
      dependencies(healthyFetch(), () => '2026-08-09T12:00:00.000Z').dependencies,
    );
    const statementCountAfterFirst = db.state.publicationStatements.length;
    const second = await refreshBenchmarkRevision(
      env,
      dependencies(healthyFetch(), () => '2026-08-10T01:00:00.000Z').dependencies,
    );
    const statements = db.state.publicationStatements.slice(statementCountAfterFirst);
    const membership = statements.find((statement) => statement.sql.includes('benchmark_model_revision_membership'));
    const profile = statements.find((statement) => statement.sql.includes('benchmark_model_profile_snapshots'));
    const directory = statements.find((statement) => statement.sql.includes('INSERT INTO benchmark_model_directory'));
    const week = statements.find((statement) => statement.sql.includes('benchmark_popular_model_weeks'));
    const ranks = statements.find((statement) => statement.sql.includes('benchmark_popular_model_ranks'));

    expect(first.status).toBe('published');
    expect(second).toMatchObject({ status: 'unchanged', revision: first.revision, error: null });
    expect(membership).toBeDefined();
    expect(profile).toBeDefined();
    expect(directory).toBeDefined();
    expect(week?.values[0]).toBe('2026-08-10T00:00:00.000Z');
    expect(ranks).toBeDefined();
  });

  it('keeps the active cache complete when a same-timestamp unchanged commit fails', async () => {
    const { env, db } = seededEnvironment({ failPublicationBatchNumber: 4 });
    const transport = dependencies(healthyFetch(), () => observedAt);
    const first = await refreshBenchmarkRevision(env, transport.dependencies);
    const activeApiRevision = db.state.activeApiResponseRevision;
    const activeBodies = structuredClone(db.state.apiResponseEntries.get(activeApiRevision ?? '') ?? []);

    const second = await refreshBenchmarkRevision(env, transport.dependencies);

    expect(first.status).toBe('published');
    expect(second.status).toBe('failed');
    expect(db.state.activeRevision).toBe(first.revision);
    expect(db.state.activeApiResponseRevision).toBe(activeApiRevision);
    expect(db.state.apiResponseEntries.get(activeApiRevision ?? '')).toEqual(activeBodies);
    expect(activeBodies.length).toBeGreaterThan(0);
    expect([...db.state.apiResponseRevisions]).toEqual([activeApiRevision]);
    expect(db.state.publicationStatements.some((statement) => (
      statement.sql.startsWith('DELETE FROM benchmark_model_profile_snapshots')
      || statement.sql.startsWith('DELETE FROM benchmark_model_revision_membership')
    ))).toBe(false);
  });

  it('writes exact projected evidence before staged publication and commits the pointers last', async () => {
    const { env, db, r2, events } = seededEnvironment();
    const transport = dependencies(healthyFetch());

    const result = await refreshBenchmarkRevision(env, transport.dependencies);

    expect(result).toMatchObject({ status: 'published', checkedAt: observedAt, error: null, revision: expect.any(String) });
    expect(db.state.batchCalls).toBeGreaterThan(1);
    expect(db.state.publicationBatchCalls).toBe(db.state.batchCalls);
    const publicationIndex = events.indexOf('d1:publication');
    const manifestEvents = events.filter((event) => event.startsWith('r2:benchmarks/benchlm/daily-check/'));
    const evidenceEvents = events.filter((event) => event.startsWith('r2:benchmarks/')
      && !event.startsWith('r2:benchmarks/benchlm/daily-check/'));
    expect(publicationIndex).toBeGreaterThanOrEqual(0);
    expect(evidenceEvents).not.toHaveLength(0);
    expect(evidenceEvents.every((event) => events.indexOf(event) < publicationIndex)).toBe(true);
    expect(manifestEvents).toHaveLength(1);
    expect(events.indexOf(manifestEvents[0])).toBeLessThan(publicationIndex);
    expect(events.filter((event) => event === 'd1:publication')).toHaveLength(db.state.publicationBatchCalls);

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
    // displayScore is now a published, projected field; contaminated sources
    // and external benchmark groups must still never reach the snapshot.
    expect(storedModels).not.toMatch(/artificial[ _-]?analysis|benchmarks\.external/i);
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
  it('persists durable profiles before atomic directory and weekly pointer updates', async () => {
    const { env, db } = seededEnvironment();
    const result = await refreshBenchmarkRevision(env, dependencies(healthyFetch()).dependencies);

    expect(result).toMatchObject({ status: 'published', revision: expect.any(String), error: null });
    const statements = db.state.publicationStatements;
    const indexOf = (fragment: string, start = 0) => statements.findIndex(
      (statement, index) => index >= start && statement.sql.includes(fragment),
    );
    const membership = indexOf('benchmark_model_revision_membership');
    const profile = indexOf('benchmark_model_profile_snapshots', membership + 1);
    const slugCheck = indexOf('SELECT CASE WHEN EXISTS', profile + 1);
    const directory = indexOf('INSERT INTO benchmark_model_directory', slugCheck + 1);
    const archive = indexOf("status = 'archived'", directory + 1);
    const week = indexOf('benchmark_popular_model_weeks', archive + 1);
    const ranks = indexOf('benchmark_popular_model_ranks', week + 1);
    const pointer = indexOf('benchmark_publication_state', ranks + 1);
    expect(profile).toBeGreaterThan(membership);
    expect(slugCheck).toBeGreaterThan(profile);
    expect(directory).toBeGreaterThan(slugCheck);
    expect(archive).toBeGreaterThan(directory);
    expect(week).toBeGreaterThan(archive);
    expect(ranks).toBeGreaterThan(week);
    expect(pointer).toBeGreaterThan(ranks);
  });

  it('cleans revision-scoped directory rows when publication staging fails', async () => {
    const { env, db } = seededEnvironment({ failPublicationBatch: true });
    const result = await refreshBenchmarkRevision(env, dependencies(healthyFetch()).dependencies);

    expect(result.status).toBe('failed');
    const cleanup = db.state.publicationStatements.filter((statement) => (
      statement.sql.startsWith('DELETE FROM benchmark_model_profile_snapshots')
      || statement.sql.startsWith('DELETE FROM benchmark_model_revision_membership')
    ));
    expect(cleanup).toHaveLength(2);
    expect(cleanup.every((statement) => statement.values.length > 0)).toBe(true);
  });
  it('materializes fresh and stale benchmark API responses before moving the response-cache pointer', async () => {
    const { env, db } = seededEnvironment();

    const result = await refreshBenchmarkRevision(env, dependencies(healthyFetch()).dependencies);

    expect(result).toMatchObject({ status: 'published', revision: expect.any(String) });
    const chunks = apiResponseCacheChunks(db.state.publicationStatements);
    const summaryFresh = joinedCachedResponse(chunks, 'summary', 'fresh');
    const summaryStale = joinedCachedResponse(chunks, 'summary', 'stale');
    const overallFresh = joinedCachedResponse(chunks, 'leaderboard:v2:llm-overall:balanced:50::0', 'fresh');
    const estimatedFresh = joinedCachedResponse(chunks, 'leaderboard:v2:llm-overall:balanced:50::1', 'fresh');
    const paginationProjection = joinedCachedResponse(
      chunks,
      'leaderboard-projection:llm-overall:balanced:0',
      'fresh',
    );
    const freshSummaryData = (JSON.parse(summaryFresh.body) as { data: Record<string, unknown> }).data;
    const staleSummaryData = (JSON.parse(summaryStale.body) as { data: Record<string, unknown> }).data;

    expect(JSON.parse(summaryFresh.body)).toMatchObject({
      revision: result.revision,
      freshness: { status: 'fresh', checkedAt: observedAt },
      data: { compareDirectory: expect.any(Object) },
    });
    expect(JSON.parse(summaryStale.body)).toMatchObject({
      revision: result.revision,
      freshness: { status: 'stale', checkedAt: observedAt, message: 'Published weekly benchmark evidence has not refreshed within 8 days.' },
    });
    expect((freshSummaryData.decisionPicks as Array<Record<string, unknown>>).map((group) => group.key)).toEqual([
      'llm-overall',
      'llm-agentic',
      'llm-coding',
      'llm-reasoning',
      'multimodal-vision-documents',
      'llm-knowledge',
    ]);
    expect((freshSummaryData.decisionPicks as Array<{ entries: Array<{ evidenceStatus: string }> }>)
      .flatMap((group) => group.entries)
      .every((entry) => entry.evidenceStatus === 'supported')).toBe(true);
    expect(freshSummaryData.homeDecisionSnapshot).toMatchObject({
      benchAlignLeader: expect.objectContaining({ status: expect.stringMatching(/^(ready|unavailable)$/) }),
      valueFrontierLeader: expect.objectContaining({ status: expect.stringMatching(/^(ready|unavailable)$/) }),
      lowestVerifiedRepresentativeRate: expect.objectContaining({ status: expect.stringMatching(/^(ready|unavailable)$/) }),
      pricePerformancePoints: expect.any(Array),
    });
    expect(staleSummaryData.decisionPicks).toEqual(freshSummaryData.decisionPicks);
    expect(staleSummaryData.homeDecisionSnapshot).toEqual(freshSummaryData.homeDecisionSnapshot);
    expect(JSON.parse(overallFresh.body)).toMatchObject({
      data: {
        key: 'llm-overall',
        profile: 'balanced',
        pagination: { limit: 50 },
        capabilities: { dataReady: true, supportsPrice: false, priceValues: [] },
      },
    });
    expect(JSON.parse(estimatedFresh.body)).toMatchObject({
      data: {
        key: 'llm-overall',
        profile: 'balanced',
        pagination: { limit: 50 },
        capabilities: { dataReady: true, supportsPrice: false, priceValues: [] },
      },
    });
    expect(JSON.parse(paginationProjection.body)).toMatchObject({
      revision: { revision: result.revision },
      leaderboard: { profile: 'balanced' },
      entries: expect.any(Array),
    });
    const pricePerformanceFresh = joinedCachedResponse(chunks, 'price-performance:complete:v1', 'fresh');
    const pricePerformanceStale = joinedCachedResponse(chunks, 'price-performance:complete:v1', 'stale');
    expect(pricePerformanceFresh).toBeDefined();
    expect(pricePerformanceFresh?.body).toBeDefined();
    const pricePerformanceBody = JSON.parse(pricePerformanceFresh?.body ?? '') as {
      freshness: { status: string };
      data: { scoreMethodology: unknown; costDefinitions: unknown; capabilities: unknown; points: unknown[] };
    };
    expect(pricePerformanceBody.freshness.status).toBe('fresh');
    expect(pricePerformanceBody.data.scoreMethodology).toBeDefined();
    expect(pricePerformanceBody.data.capabilities).toBeDefined();
    expect(Array.isArray(pricePerformanceBody.data.points)).toBe(true);
    expect(JSON.parse(pricePerformanceStale?.body ?? '')).toMatchObject({
      revision: result.revision,
      freshness: { status: 'stale' },
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
    expect(db.state.publicationBatchCalls).toBe(2);
    expect(events.filter((event) => event === 'd1:publication')).toHaveLength(2);
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
    const second = await refreshBenchmarkRevision(env, dependencies(fetchImpl, () => '2026-08-06T13:00:00.000Z').dependencies);

    expect(first.status).toBe('published');
    expect(second).toMatchObject({ status: 'unchanged', revision: first.revision, error: null });
    expect(db.state.revisions).toHaveLength(1);
    expect(db.state.revisions[0].checkedAt).toBe('2026-08-06T13:00:00.000Z');
    expect(lmArena304Responses).toBeGreaterThan(0);
    expect(r2.objects.size).toBe(firstObjectCount + 1);
    const secondEvents = events.slice(eventCountAfterFirst);
    expect(secondEvents.filter((event) => event.startsWith('r2:benchmarks/benchlm/daily-check/'))).toHaveLength(1);
    expect(secondEvents.slice(-2)).toEqual(['d1:publication', 'd1:publication']);
    expect(db.state.refreshRows.get('benchlm:daily-network-check-v2')).toEqual({
      lastSuccessAt: '2026-08-06T13:00:00.000Z',
      lastRevision: null,
      lastError: null,
    });
  });

  it('reuses immutable BenchLM projections on a second UTC-day run while refreshing other sources', async () => {
    const { env } = seededEnvironment();
    const fetchImpl = vi.fn(healthyFetch());

    const first = await refreshBenchmarkRevision(
      env,
      dependencies(fetchImpl, () => '2026-08-06T00:15:00.000Z').dependencies,
    );
    expect(first.error).toBeNull();
    fetchImpl.mockClear();

    const second = await refreshBenchmarkRevision(
      env,
      dependencies(fetchImpl, () => '2026-08-06T12:15:00.000Z').dependencies,
    );

    expect(second.error).toBeNull();
    expect(fetchImpl.mock.calls.some(([url]) => new URL(String(url)).hostname === 'benchlm.ai')).toBe(false);
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes('lmarena'))).toBe(true);
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes('litellm'))).toBe(true);
  });

  it('refetches legacy same-day BenchLM projections after a projection schema upgrade', async () => {
    const { env, db } = seededEnvironment();
    const first = await refreshBenchmarkRevision(
      env,
      dependencies(healthyFetch(), () => '2026-08-06T00:15:00.000Z').dependencies,
    );
    if (!first.revision) throw new Error('expected the initial benchmark revision');
    const firstSources = db.state.sourceRows.get(first.revision) ?? [];
    for (const source of firstSources.filter((value) => value.sourceId === 'benchlm')) {
      source.snapshotKey = source.snapshotKey.replace('/projected/v2/', '/projected/');
    }
    db.state.refreshRows.delete('benchlm:daily-network-check');
    db.state.refreshRows.delete('benchlm:daily-network-check-v2');
    db.state.refreshRows.set('benchlm:daily-network-check', {
      lastSuccessAt: '2026-08-06T00:15:00.000Z',
      lastRevision: null,
      lastError: null,
    });

    const changedModels = JSON.parse(fixture('models')) as {
      items: Array<{ scores: { displayScore: number | null } }>;
    };
    changedModels.items[0].scores.displayScore = 82.48;
    const fetchImpl = vi.fn(healthyFetch({
      onRequest(url) {
        return url.hostname === 'benchlm.ai' && url.pathname.endsWith('/models.json')
          ? new Response(JSON.stringify(changedModels), { headers: { etag: '"models-v2-etag"' } })
          : undefined;
      },
    }));

    const second = await refreshBenchmarkRevision(
      env,
      dependencies(fetchImpl, () => '2026-08-06T12:15:00.000Z').dependencies,
    );

    expect(second).toMatchObject({ status: 'published', revision: expect.any(String), error: null });
    expect(second.revision).not.toBe(first.revision);
    expect(fetchImpl.mock.calls.filter(([url]) => new URL(String(url)).hostname === 'benchlm.ai')).toHaveLength(6);
    const secondSources = db.state.sourceRows.get(second.revision as string) ?? [];
    expect(secondSources.filter((source) => source.sourceId === 'benchlm')
      .every((source) => source.snapshotKey.includes('/projected/v2/'))).toBe(true);
    expect(db.state.refreshRows.get('benchlm:daily-network-check-v2')).toEqual({
      lastSuccessAt: '2026-08-06T12:15:00.000Z',
      lastRevision: null,
      lastError: null,
    });
  });

  it('does not fetch BenchLM again when complete stored projections were observed on the same UTC day', () => {
    const benchLmFetchDue = requiredExport<(previous: ReadonlyMap<string, { observedAt: string; snapshotKey: string }>, checkedAt: string) => boolean>('benchLmFetchDue');

    expect(benchLmFetchDue(previousBenchLmSources('2026-08-06T00:15:00.000Z'), '2026-08-06T12:15:00.000Z')).toBe(false);
  });

  it('checks BenchLM again on the next UTC day', () => {
    const benchLmFetchDue = requiredExport<(previous: ReadonlyMap<string, { observedAt: string; snapshotKey: string }>, checkedAt: string) => boolean>('benchLmFetchDue');

    expect(benchLmFetchDue(previousBenchLmSources('2026-08-06T00:15:00.000Z'), '2026-08-07T00:15:00.000Z')).toBe(true);
  });

  it('checks BenchLM when a required stored projection is missing', () => {
    const benchLmFetchDue = requiredExport<(previous: ReadonlyMap<string, { observedAt: string; snapshotKey: string }>, checkedAt: string) => boolean>('benchLmFetchDue');
    const previous = previousBenchLmSources('2026-08-06T00:15:00.000Z');
    previous.delete('benchlm\u0000models');

    expect(benchLmFetchDue(previous, '2026-08-06T12:15:00.000Z')).toBe(true);
  });

  it('checks BenchLM when a required stored observation timestamp is invalid', () => {
    const benchLmFetchDue = requiredExport<(previous: ReadonlyMap<string, { observedAt: string; snapshotKey: string }>, checkedAt: string) => boolean>('benchLmFetchDue');
    const previous = previousBenchLmSources('2026-08-06T00:15:00.000Z');
    previous.set('benchlm\u0000models', {
      observedAt: 'not-a-timestamp',
      snapshotKey: 'benchmarks/benchlm/models/projected/v2/test/original/test.json',
    });

    expect(benchLmFetchDue(previous, '2026-08-06T12:15:00.000Z')).toBe(true);
  });

  it('allows only one concurrent daily network-check lease', async () => {
    const claimBenchLmDailyCheck = requiredExport<(db: unknown, checkedAt: string, leaseId: string) => Promise<boolean>>('claimBenchLmDailyCheck');
    const { db } = seededEnvironment();

    const [first, second] = await Promise.all([
      claimBenchLmDailyCheck(db.db, '2026-08-06T00:15:00.000Z', 'lease-a'),
      claimBenchLmDailyCheck(db.db, '2026-08-06T00:15:00.000Z', 'lease-b'),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
  });

  it('reclaims an expired daily network-check lease', async () => {
    const claimBenchLmDailyCheck = requiredExport<(db: unknown, checkedAt: string, leaseId: string) => Promise<boolean>>('claimBenchLmDailyCheck');
    const { db } = seededEnvironment();

    await expect(claimBenchLmDailyCheck(db.db, '2026-08-06T00:15:00.000Z', 'lease-a')).resolves.toBe(true);
    await expect(claimBenchLmDailyCheck(db.db, '2026-08-06T00:30:00.000Z', 'lease-b')).resolves.toBe(true);
  });

  it('does not let a timed-out daily-check loser overwrite the winner lease', async () => {
    const claimBenchLmDailyCheck = requiredExport<(db: unknown, checkedAt: string, leaseId: string) => Promise<boolean>>('claimBenchLmDailyCheck');
    const { env, db } = seededEnvironment();

    await expect(claimBenchLmDailyCheck(db.db, '2026-08-06T00:15:00.000Z', 'winner')).resolves.toBe(true);
    const result = await refreshBenchmarkRevision(
      env,
      dependencies(healthyFetch(), () => '2026-08-06T00:16:00.000Z').dependencies,
    );

    expect(result).toMatchObject({
      status: 'failed',
      error: 'BenchLM daily network check did not complete within 10000ms',
    });
    expect(db.state.refreshRows.get('benchlm:daily-network-check-v2')).toEqual({
      lastSuccessAt: null,
      lastRevision: null,
      lastError: 'benchlm-daily-lease-v2:2026-08-06T00:30:00.000Z|winner',
    });
  });

  it('keeps worst-case daily-check loser queries plus maximum publication below the invocation limit', async () => {
    const claimBenchLmDailyCheck = requiredExport<(db: unknown, checkedAt: string, leaseId: string) => Promise<boolean>>('claimBenchLmDailyCheck');
    const { env, db } = seededEnvironment();
    const initial = await refreshBenchmarkRevision(
      env,
      dependencies(healthyFetch(), () => '2026-08-05T00:15:00.000Z').dependencies,
    );
    expect(initial.status).toBe('published');
    await expect(claimBenchLmDailyCheck(db.db, '2026-08-06T00:15:00.000Z', 'winner-budget')).resolves.toBe(true);
    const queryCountBeforeLoser = db.state.queryCount;
    const publicationBatchesBeforeLoser = db.state.publicationBatchCalls;

    const result = await refreshBenchmarkRevision(
      env,
      dependencies(healthyFetch(), () => '2026-08-06T00:16:00.000Z').dependencies,
    );
    const loserInvocationQueries = db.state.queryCount - queryCountBeforeLoser;
    const { batch, pairs } = liveScaleBatch();
    const plan = buildPublicationStatementPlan(db.db, 'benchmark-live-scale-budget', observedAt, observedAt,
      `sha256:${'b'.repeat(64)}`, {
        revision: 'catalog-rev-1', sourceUrl: 'https://openrouter.ai/api/v1/models', observedAt,
        snapshotKey: openRouterSnapshotKey, contentHash: sha256(new TextEncoder().encode(openRouterProjected)),
      }, batch, pairs);

    expect(result.status).toBe('failed');
    // The measured loser path includes its one failure-state query. Combining
    // it with the largest accepted publication and real cleanup plan models a
    // commit failure after every allowed publication statement was attempted.
    expect(loserInvocationQueries + 900 + plan.cleanup.length).toBeLessThanOrEqual(1_000);
    expect(db.state.publicationBatchCalls).toBe(publicationBatchesBeforeLoser);
  });

  it('releases a claimed daily network-check lease after a handled BenchLM failure', async () => {
    const claimBenchLmDailyCheck = requiredExport<(db: unknown, checkedAt: string, leaseId: string) => Promise<boolean>>('claimBenchLmDailyCheck');
    const { env, db } = seededEnvironment();
    const result = await refreshBenchmarkRevision(env, dependencies(healthyFetch({
      onRequest(url) {
        return url.hostname === 'benchlm.ai' ? new Response('denied', { status: 401 }) : undefined;
      },
    }), () => '2026-08-06T00:15:00.000Z').dependencies);

    expect(result.status).toBe('failed');
    await expect(claimBenchLmDailyCheck(db.db, '2026-08-06T00:15:00.000Z', 'lease-after-failure')).resolves.toBe(true);
  });

  it('does not refetch a verified BenchLM bundle when a later LMArena failure is retried the same UTC day', async () => {
    const { env, db, r2 } = seededEnvironment();
    const initial = await refreshBenchmarkRevision(
      env,
      dependencies(healthyFetch(), () => '2026-08-05T00:15:00.000Z').dependencies,
    );
    const changedPricing = JSON.parse(fixture('pricing')) as { items: Array<Record<string, unknown>> };
    changedPricing.items[0].inputPrice = 2.75;
    const failedFetch = vi.fn(healthyFetch({
      onRequest(url) {
        if (url.hostname === 'benchlm.ai' && url.pathname.endsWith('/pricing.json')) {
          return new Response(JSON.stringify(changedPricing), { headers: { etag: '"pricing-new-etag"' } });
        }
        if (url.hostname === 'datasets-server.huggingface.co' && url.searchParams.get('config') === 'agent') {
          return new Response('denied', { status: 401 });
        }
        return undefined;
      },
    }));
    const failed = await refreshBenchmarkRevision(
      env,
      dependencies(failedFetch, () => '2026-08-06T00:15:00.000Z').dependencies,
    );

    expect(failed.status).toBe('failed');
    expect(db.state.refreshRows.get('benchlm:daily-network-check-v2')).toEqual({
      lastSuccessAt: '2026-08-06T00:15:00.000Z',
      lastRevision: null,
      lastError: null,
    });
    expect(r2.objects.has('benchmarks/benchlm/daily-check/v2/2026-08-06T00:15:00.000Z.json')).toBe(true);

    const retryFetch = vi.fn(healthyFetch());

    const retried = await refreshBenchmarkRevision(
      env,
      dependencies(retryFetch, () => '2026-08-06T00:30:00.000Z').dependencies,
    );

    expect(initial.status).toBe('published');
    expect(retried).toMatchObject({ status: 'published', error: null, revision: expect.any(String) });
    expect(retryFetch.mock.calls.some(([url]) => new URL(String(url)).hostname === 'benchlm.ai')).toBe(false);
    const retriedPricing = (db.state.sourceRows.get(retried.revision as string) ?? [])
      .find((source) => source.sourceId === 'benchlm' && source.artifactId === 'pricing');
    expect(retriedPricing?.etag).toBe('"pricing-new-etag"');
  });

  it('waits for the daily-check winner before publishing changed non-BenchLM content', async () => {
    const { env, db } = seededEnvironment();
    const initial = await refreshBenchmarkRevision(
      env,
      dependencies(healthyFetch(), () => '2026-08-05T00:15:00.000Z').dependencies,
    );
    expect(initial.status).toBe('published');

    const changedPricing = JSON.parse(fixture('pricing')) as { items: Array<Record<string, unknown>> };
    changedPricing.items[0].inputPrice = 2.75;
    const changedLiteLlm = structuredClone(liteLlmFixture.payload) as Record<string, Record<string, unknown>>;
    changedLiteLlm['azure/codex-mini'].input_cost_per_token = 0.0000025;

    const winnerPricingRequested = deferred<void>();
    const winnerPricingResponse = deferred<Response>();
    const winnerFetch = vi.fn(healthyFetch({
      onRequest(url) {
        if (url.hostname === 'benchlm.ai' && url.pathname.endsWith('/pricing.json')) {
          winnerPricingRequested.resolve(undefined);
          return winnerPricingResponse.promise;
        }
        return undefined;
      },
    }));
    const loserWaiting = deferred<void>();
    const releaseLoserWait = deferred<void>();
    const loserReachedLiteLlm = deferred<void>();
    const loserLiteLlmResponse = deferred<Response>();
    const loserFetch = vi.fn(healthyFetch({
      onRequest(url) {
        if (url.hostname === 'raw.githubusercontent.com') {
          loserReachedLiteLlm.resolve(undefined);
          return loserLiteLlmResponse.promise;
        }
        return undefined;
      },
    }));
    const winnerTransport = dependencies(winnerFetch, () => '2026-08-06T00:15:00.000Z');
    const loserTransport = dependencies(loserFetch, () => '2026-08-06T00:16:00.000Z');
    const winnerPromise = refreshBenchmarkRevision(env, {
      ...winnerTransport.dependencies,
      publicationAttemptId: () => 'overlap-winner',
    });
    await winnerPricingRequested.promise;

    const loserPromise = refreshBenchmarkRevision(env, {
      ...loserTransport.dependencies,
      publicationAttemptId: () => 'overlap-loser',
      sleep: async () => {
        loserWaiting.resolve(undefined);
        await releaseLoserWait.promise;
      },
    });
    const loserPhase = await Promise.race([
      loserWaiting.promise.then(() => 'waiting' as const),
      loserReachedLiteLlm.promise.then(() => 'downstream' as const),
    ]);

    winnerPricingResponse.resolve(new Response(JSON.stringify(changedPricing), {
      headers: { etag: '"pricing-overlap-etag"' },
    }));
    const winner = await winnerPromise;
    releaseLoserWait.resolve(undefined);
    await loserReachedLiteLlm.promise;
    loserLiteLlmResponse.resolve(new Response(JSON.stringify(changedLiteLlm), {
      headers: { etag: '"litellm-overlap-etag"' },
    }));
    const loser = await loserPromise;

    expect(loserPhase).toBe('waiting');
    expect(winner).toMatchObject({ status: 'published', error: null, revision: expect.any(String) });
    expect(loser).toMatchObject({ status: 'published', error: null, revision: expect.any(String) });
    expect(loserFetch.mock.calls.some(([url]) => new URL(String(url)).hostname === 'benchlm.ai')).toBe(false);
    const winnerPricing = (db.state.sourceRows.get(winner.revision as string) ?? [])
      .find((source) => source.sourceId === 'benchlm' && source.artifactId === 'pricing');
    const finalSources = db.state.sourceRows.get(db.state.activeRevision as string) ?? [];
    const finalPricing = finalSources.find((source) => source.sourceId === 'benchlm' && source.artifactId === 'pricing');
    const finalLiteLlm = finalSources.find((source) => source.sourceId === 'litellm');
    expect(finalPricing).toMatchObject({
      etag: '"pricing-overlap-etag"',
      contentHash: winnerPricing?.contentHash,
      snapshotKey: winnerPricing?.snapshotKey,
    });
    expect(finalLiteLlm?.etag).toBe('"litellm-overlap-etag"');
  });

  it('fails safely without a BenchLM request when a same-day stored projection is missing', async () => {
    const { env, db, r2 } = seededEnvironment();
    const fetchImpl = vi.fn(healthyFetch());
    const first = await refreshBenchmarkRevision(
      env,
      dependencies(fetchImpl, () => '2026-08-06T00:15:00.000Z').dependencies,
    );
    const models = (db.state.sourceRows.get(first.revision as string) ?? [])
      .find((source) => source.sourceId === 'benchlm' && source.artifactId === 'models');
    if (!models) throw new Error('expected stored BenchLM models projection');
    r2.objects.delete(models.snapshotKey);
    fetchImpl.mockClear();

    const second = await refreshBenchmarkRevision(
      env,
      dependencies(fetchImpl, () => '2026-08-06T12:15:00.000Z').dependencies,
    );

    expect(second).toMatchObject({ status: 'failed', revision: null, error: expect.stringMatching(/immutable snapshot is missing/i) });
    expect(db.state.activeRevision).toBe(first.revision);
    expect(fetchImpl.mock.calls.some(([url]) => new URL(String(url)).hostname === 'benchlm.ai')).toBe(false);
  });

  it('fails safely without a BenchLM request when a same-day stored projection is corrupt', async () => {
    const { env, db, r2 } = seededEnvironment();
    const fetchImpl = vi.fn(healthyFetch());
    const first = await refreshBenchmarkRevision(
      env,
      dependencies(fetchImpl, () => '2026-08-06T00:15:00.000Z').dependencies,
    );
    const models = (db.state.sourceRows.get(first.revision as string) ?? [])
      .find((source) => source.sourceId === 'benchlm' && source.artifactId === 'models');
    if (!models) throw new Error('expected stored BenchLM models projection');
    const stored = r2.objects.get(models.snapshotKey);
    if (!stored) throw new Error('expected stored BenchLM models bytes');
    stored.bytes[0] ^= 0xff;
    fetchImpl.mockClear();

    const second = await refreshBenchmarkRevision(
      env,
      dependencies(fetchImpl, () => '2026-08-06T12:15:00.000Z').dependencies,
    );

    expect(second).toMatchObject({ status: 'failed', revision: null, error: expect.stringMatching(/content hash/i) });
    expect(db.state.activeRevision).toBe(first.revision);
    expect(fetchImpl.mock.calls.some(([url]) => new URL(String(url)).hostname === 'benchlm.ai')).toBe(false);
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

    const second = await refreshBenchmarkRevision(env, dependencies(fetchImpl, () => '2026-08-06T13:00:00.000Z').dependencies);

    expect(first.status).toBe('published');
    expect(second).toMatchObject({ status: 'published', error: null, revision: expect.any(String) });
    expect(second.revision).not.toBe(first.revision);
    const firstSources = db.state.sourceRows.get(first.revision as string) ?? [];
    const secondSources = db.state.sourceRows.get(second.revision as string) ?? [];
    const secondBenchLm = secondSources.filter((source) => source.sourceId === 'benchlm');
    expect(secondBenchLm).toHaveLength(6);
    expect(secondBenchLm.find((source) => source.artifactId === 'public-leaderboard')?.upstreamRevision)
      .toBe('2026-08-10-8c567bd96953b15d');
    expect(secondBenchLm.filter((source) => source.artifactId !== 'public-leaderboard')
      .every((source) => source.upstreamRevision === '2026-08-05T06:25:54.198Z')).toBe(true);
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

    const second = await refreshBenchmarkRevision(env, dependencies(fetchImpl, () => '2026-08-06T13:00:00.000Z').dependencies);

    expect(first.status).toBe('published');
    expect(second).toMatchObject({ status: 'unchanged', revision: first.revision, error: null });
    expect(changedRawHash).not.toBe(firstModels.originalContentHash);
    const storedSnapshot = r2.objects.get(firstModels.snapshotKey);
    expect(storedSnapshot?.bytes).toEqual(originalBytes);
    expect(storedSnapshot?.customMetadata.original_content_hash).toBe(originalMetadata);
    expect(storedSnapshot?.customMetadata.original_content_hash).toBe(firstModels.originalContentHash);
    const secondEvents = events.slice(eventsAfterFirst);
    expect(secondEvents.filter((event) => event.startsWith('r2:'))).toHaveLength(2);
    expect(secondEvents).not.toContain(`r2:${firstModels.snapshotKey}`);
    expect(secondEvents.slice(-2)).toEqual(['d1:publication', 'd1:publication']);
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

    const second = await refreshBenchmarkRevision(
      env,
      dependencies(fetchImpl, () => '2026-08-06T12:00:00.000Z').dependencies,
    );

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
      publicationAttemptId: () => 'timeout-attempt',
    });

    expect(result.status).toBe('failed');
    expect(leaderboardAttempts).toBe(3);
    expect(timeoutAborts).toBe(3);
    expect(timeoutHandlers).toHaveLength(8); // six first-pass BenchLM requests plus two leaderboard retries.
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
        publicationAttemptId: () => 'stalled-attempt',
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

  it('excludes same-page ambiguous Dataset Viewer WebDev identities without dropping snapshot provenance', async () => {
    const ambiguousModel = 'gpt-5.3-codex (codex-harness)';
    const firstRows = arenaRows('webdev', 0, 100);
    firstRows[56] = arenaRowWithModelName(firstRows[56], ambiguousModel);
    firstRows[71] = arenaRowWithModelName(firstRows[71], ambiguousModel);
    const finalRows = arenaRows('webdev', 100, 10);
    const { env, db, r2 } = seededEnvironment();
    const result = await refreshBenchmarkRevision(env, dependencies(healthyFetch({
      onRequest(url) {
        if (url.hostname !== 'datasets-server.huggingface.co') return undefined;
        const subset = url.searchParams.get('config') ?? 'agent';
        const offset = Number(url.searchParams.get('offset'));
        if (subset === 'webdev') {
          return offset === 0
            ? arenaPageResponse(subset, offset, firstRows, 110, 'same-page-revision')
            : arenaPageResponse(subset, offset, finalRows, 110, 'same-page-revision');
        }
        if (subset === 'text_style_control') {
          return arenaPageResponse(
            subset,
            offset,
            [arenaRowWithModelName(arenaRows(subset, 0, 1)[0], ambiguousModel)],
            1,
            'same-page-revision',
          );
        }
        return arenaResponse(subset, offset, 1, 'same-page-revision', 1);
      },
    })).dependencies);

    expect(result.status).toBe('published');
    const metrics = jsonRowsFor(db.state.publicationStatements, 'benchmark_metrics')
      .filter((metric) => metric.metricKey === 'lmarena:webdev:overall');
    expect(metrics).not.toContainEqual(expect.objectContaining({
      modelKey: 'source:lmarena:gpt-5.3-codex%20(codex-harness)',
      sourceModelId: ambiguousModel,
    }));
    expect(metrics).toContainEqual(expect.objectContaining({ sourceModelId: 'webdev-model-0', rank: 1 }));
    expect(jsonRowsFor(db.state.publicationStatements, 'benchmark_metrics')).toContainEqual(expect.objectContaining({
      metricKey: 'lmarena:text_style_control:overall',
      sourceModelId: ambiguousModel,
    }));

    const sources = (db.state.sourceRows.get(result.revision as string) ?? [])
      .filter((candidate) => candidate.sourceId === 'lmarena' && candidate.artifactId.startsWith('webdev:'));
    expect(sources.map((source) => source.artifactId)).toEqual([
      'webdev:latest:overall:rows-0-100',
      'webdev:latest:overall:rows-100-200',
    ]);
    expect(sources.every((source) => source.upstreamRevision === 'same-page-revision')).toBe(true);
    const firstSnapshot = r2.objects.get(sources[0]?.snapshotKey ?? 'missing');
    const firstProjection = JSON.parse(new TextDecoder().decode(firstSnapshot?.bytes)) as {
      rows: { row: { model_name: string } }[];
      num_rows_total: number;
    };
    expect(firstProjection.num_rows_total).toBe(110);
    expect(firstProjection.rows[56]).toMatchObject({ row: { model_name: ambiguousModel, rank: 57 } });
    expect(firstProjection.rows[71]).toMatchObject({ row: { model_name: ambiguousModel, rank: 72 } });
    expect(firstProjection.rows.filter((row) => row.row.model_name === ambiguousModel)).toHaveLength(2);
    expect(r2.objects.get(sources[1]?.snapshotKey ?? 'missing')).toBeDefined();
  });

  it('excludes cross-page ambiguous Dataset Viewer WebDev identities without dropping page snapshots', async () => {
    const ambiguousModel = 'gpt-5.3-codex (codex-harness)';
    const firstRows = arenaRows('webdev', 0, 100);
    firstRows[0] = arenaRowWithModelName(firstRows[0], ambiguousModel);
    const finalRows = [arenaRowWithModelName(arenaRows('webdev', 100, 1)[0], ambiguousModel)];
    const { env, db, r2 } = seededEnvironment();
    const result = await refreshBenchmarkRevision(env, dependencies(healthyFetch({
      onRequest(url) {
        if (url.hostname !== 'datasets-server.huggingface.co') return undefined;
        const subset = url.searchParams.get('config') ?? 'agent';
        const offset = Number(url.searchParams.get('offset'));
        if (subset !== 'webdev') return arenaResponse(subset, offset, 1, 'cross-page-revision', 1);
        return offset === 0
          ? arenaPageResponse(subset, offset, firstRows, 101, 'cross-page-revision')
          : arenaPageResponse(subset, offset, finalRows, 101, 'cross-page-revision');
      },
    })).dependencies);

    expect(result.status).toBe('published');
    const metrics = jsonRowsFor(db.state.publicationStatements, 'benchmark_metrics')
      .filter((metric) => metric.metricKey === 'lmarena:webdev:overall');
    expect(metrics).not.toContainEqual(expect.objectContaining({
      modelKey: 'source:lmarena:gpt-5.3-codex%20(codex-harness)',
      sourceModelId: ambiguousModel,
    }));
    expect(metrics).toContainEqual(expect.objectContaining({ sourceModelId: 'webdev-model-1', rank: 2 }));

    const sources = (db.state.sourceRows.get(result.revision as string) ?? [])
      .filter((candidate) => candidate.sourceId === 'lmarena' && candidate.artifactId.startsWith('webdev:'));
    expect(sources.map((source) => source.artifactId)).toEqual([
      'webdev:latest:overall:rows-0-100',
      'webdev:latest:overall:rows-100-200',
    ]);
    const snapshots = sources.map((source) => JSON.parse(new TextDecoder().decode(r2.objects.get(source.snapshotKey)?.bytes)) as {
      rows: { row: { model_name: string } }[];
    });
    expect(snapshots.map((snapshot) => snapshot.rows.some((row) => row.row.model_name === ambiguousModel)))
      .toEqual([true, true]);
  });

  it('fails explicitly when a Dataset Viewer subset has no usable model identities', async () => {
    const ambiguousModel = 'gpt-5.3-codex (codex-harness)';
    const rows = arenaRows('webdev', 0, 2).map((row) => arenaRowWithModelName(row, ambiguousModel));
    const { env, db } = seededEnvironment();
    const result = await refreshBenchmarkRevision(env, dependencies(healthyFetch({
      onRequest(url) {
        if (url.hostname !== 'datasets-server.huggingface.co') return undefined;
        const subset = url.searchParams.get('config') ?? 'agent';
        const offset = Number(url.searchParams.get('offset'));
        return subset === 'webdev'
          ? arenaPageResponse(subset, offset, rows, 2, 'no-usable-revision')
          : arenaResponse(subset, offset, 1, 'no-usable-revision', 1);
      },
    })).dependencies);

    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/lmarena subset webdev.*no usable.*identit/i);
    expect(db.state.publicationBatchCalls).toBe(0);
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
    // This intentionally exercises 200 sequential pages plus complete response
    // materialization. It runs near 30s on the release machine, so retain a
    // bounded 60s budget for full-suite worker contention without weakening
    // any production assertion.
  }, 60_000);

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

  it('awaits scheduled ingestion and does not expose a public refresh route', async () => {
    const { env, db } = seededEnvironment();
    const waitUntil = vi.fn();
    vi.stubGlobal('fetch', healthyFetch());
    try {
      await worker.scheduled(
        { cron: '15 */12 * * *', scheduledTime: Date.now(), noRetry: () => undefined },
        env,
        { waitUntil },
      );
      expect(waitUntil).not.toHaveBeenCalled();
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
