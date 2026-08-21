import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { CatalogResponse } from '../../../src/catalog/contracts';
import type { IngestionCycle } from '../../_shared/checkpointed-ingestion';
import {
  CATALOG_CYCLE_STEPS,
  buildCatalogCandidateStatements,
  buildCatalogPublicationStatements,
  catalogCandidateCacheRevision,
  runCatalogCycleStep,
  type CatalogCycleStep,
} from './catalog-cycle';
import { CatalogIngestCoordinator, type CatalogIngestEnv } from './coordinator';

const STARTED_AT = Date.parse('2026-08-12T00:20:00.000Z');
const CYCLE_ID = '11111111-2222-4333-8444-555555555555';
const PRIOR_CYCLE_ID = '00000000-1111-4222-8333-444444444444';
const CYCLE_KEY = 'catalog-cycle';
type SqlValue = string | number | bigint | Uint8Array | null;

interface SqlStatement {
  readonly sql: string;
  readonly values: unknown[];
  all<T = unknown>(): Promise<{ results: T[] }>;
}

function sqliteD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const file of [
    '0001_catalog.sql',
    '0002_catalog_metadata.sql',
    '0003_official_html_sources.sql',
    '0004_benchmarks.sql',
    '0005_api_response_cache.sql',
    '0006_benchmark_publication_ownership.sql',
    '0007_benchmark_metric_raw_value.sql',
    '0008_plan_entitlement_evidence.sql',
    '0009_model_directory.sql',
    '0010_ingestion_cycles.sql',
    '0011_catalog_publication_ownership.sql',
    '0012_benchmark_metric_rank_field_size.sql',
    '0015_catalog_model_expiration.sql',
    '0016_catalog_cache_write_rate.sql',
  ]) sqlite.exec(readFileSync(resolve(process.cwd(), 'migrations', file), 'utf8'));
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]): SqlStatement {
          return {
            sql,
            values,
            async all<T>() {
              return { results: sqlite.prepare(sql).all(...values as SqlValue[]) as T[] };
            },
          };
        },
      };
    },
    async batch(statements: unknown[]) {
      sqlite.exec('BEGIN');
      try {
        for (const statement of statements as SqlStatement[]) {
          sqlite.prepare(statement.sql).run(...statement.values as SqlValue[]);
        }
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
      return [];
    },
  };
  return { sqlite, db };
}

function memoryR2() {
  const objects = new Map<string, { bytes: Uint8Array; customMetadata?: Record<string, string> }>();
  return {
    objects,
    async put(
      key: string,
      value: string | ArrayBufferView,
      options?: { customMetadata?: Record<string, string> },
    ) {
      const bytes = typeof value === 'string'
        ? new TextEncoder().encode(value)
        : new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
      objects.set(key, { bytes, customMetadata: options?.customMetadata });
    },
    async get(key: string) {
      const object = objects.get(key);
      if (!object) return null;
      return {
        customMetadata: object.customMetadata,
        async arrayBuffer() {
          return object.bytes.buffer.slice(
            object.bytes.byteOffset,
            object.bytes.byteOffset + object.bytes.byteLength,
          ) as ArrayBuffer;
        },
      };
    },
    async head(key: string) {
      const object = objects.get(key);
      return object ? { customMetadata: object.customMetadata } : null;
    },
  };
}

function durableStorage() {
  const values = new Map<string, unknown>();
  let alarm: number | null = null;
  return {
    values,
    get alarm() { return alarm; },
    async get<T>(key: string) { return values.get(key) as T | undefined; },
    async put<T>(key: string, value: T) { values.set(key, value); },
    async delete(key: string) { return values.delete(key); },
    async setAlarm(when: number | Date) { alarm = when instanceof Date ? when.getTime() : when; },
    async deleteAlarm() { alarm = null; },
  };
}

const priorCatalog: CatalogResponse = {
  revision: 'catalog-prior',
  publishedAt: '2026-08-11T00:20:00.000Z',
  freshness: { status: 'fresh', checkedAt: '2026-08-11T00:20:00.000Z' },
  provenance: [{
    id: 'prior-source',
    providerId: 'prior',
    sourceUrl: 'https://example.com/prior.json',
    observedAt: '2026-08-11T00:20:00.000Z',
    sourceKind: 'official_json',
    confidence: 'official',
  }],
  plans: [],
  modelOffers: [{
    id: 'prior:model:direct',
    providerId: 'prior',
    displayName: 'Prior Model',
    modelId: 'prior-model',
    pricingBasis: 'direct_provider_api',
    route: 'direct_provider',
    currency: 'USD',
    unit: 'micro_dollars_per_million_tokens',
    inputMicroDollarsPerMillion: 1_000_000,
    outputMicroDollarsPerMillion: 2_000_000,
    sourceId: 'prior-source',
  }],
};

async function seedPreviousPublication(
  db: ReturnType<typeof sqliteD1>['db'],
  r2: ReturnType<typeof memoryR2>,
): Promise<void> {
  const priorKey = 'catalog/prior.json';
  await r2.put(priorKey, JSON.stringify({ prior: true }));
  await db.batch([
    ...buildCatalogCandidateStatements({
      db,
      catalog: priorCatalog,
      cycleId: PRIOR_CYCLE_ID,
      snapshotKeys: { 'prior-source': priorKey },
      createdAt: priorCatalog.publishedAt,
    }),
    ...buildCatalogPublicationStatements({
      db,
      catalogRevision: priorCatalog.revision,
      cacheRevision: catalogCandidateCacheRevision(priorCatalog.revision, PRIOR_CYCLE_ID),
      frozenCatalogRevision: null,
      cycleId: PRIOR_CYCLE_ID,
      sourceIds: ['prior-source'],
      now: priorCatalog.publishedAt,
    }),
  ]);
}

const openRouterPayload = {
  data: [{
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    expiration_date: '2026-09-30',
    pricing: { prompt: '0.0000025', completion: '0.00001' },
  }],
};
const openCodeModelsPayload = { data: [{ id: 'opencode/zen', object: 'model', owned_by: 'opencode' }] };
const openCodePricingHtml = `
  <table><tr><th>Model</th><th>Model ID</th><th>Endpoint</th><th>AI SDK Package</th></tr>
    <tr><td>Zen</td><td>opencode/zen</td><td>https://opencode.ai/zen/v1/responses</td><td>@ai-sdk/openai</td></tr></table>
  <table><tr><th>Model</th><th>Input</th><th>Output</th><th>Cached Read</th><th>Cached Write</th></tr>
    <tr><td>Zen</td><td>$1.00</td><td>$2.00</td><td>$0.20</td><td>-</td></tr></table>`;

function retryingFetch() {
  const attempts = new Map<string, number>();
  return async (request: RequestInfo | URL): Promise<Response> => {
    const url = String(request);
    const attempt = (attempts.get(url) ?? 0) + 1;
    attempts.set(url, attempt);
    if (attempt === 1) return new Response(null, { status: 503 });
    if (url.includes('openrouter.ai')) return Response.json(openRouterPayload);
    if (url.includes('/zen/v1/models')) return Response.json(openCodeModelsPayload);
    return new Response(openCodePricingHtml, { headers: { 'content-type': 'text/html' } });
  };
}

function activePublicationReadable(sqlite: DatabaseSync): boolean {
  const catalog = sqlite.prepare(`SELECT revisions.revision FROM catalog_publication_state publication
    JOIN catalog_revisions revisions ON revisions.revision = publication.active_revision
    WHERE publication.singleton = 1 AND revisions.publication_state = 'published'`).get();
  const cache = sqlite.prepare(`SELECT COUNT(*) AS n FROM api_response_publication_state state
    JOIN api_response_entries entry ON entry.scope = state.scope AND entry.revision = state.active_revision
    WHERE state.scope = 'catalog'`).get() as { n: number } | undefined;
  return Boolean(catalog) && Number(cache?.n ?? 0) > 0;
}

function currentCycle(storage: ReturnType<typeof durableStorage>): IngestionCycle {
  const cycle = storage.values.get(CYCLE_KEY) as IngestionCycle | undefined;
  if (!cycle) throw new Error('catalog cycle is missing');
  return cycle;
}

describe('catalog production-cycle restart harness', () => {
  it('reconstructs at every phase, retries every upstream retrieval, and never opens a pointer gap', async () => {
    const { sqlite, db } = sqliteD1();
    using database = sqlite;
    const r2 = memoryR2();
    await seedPreviousPublication(db, r2);
    const storage = durableStorage();
    const fetchImpl = retryingFetch();
    let nowMs = STARTED_AT;
    const runStep = (input: Parameters<typeof runCatalogCycleStep>[0]) => runCatalogCycleStep({
      ...input,
      fetchImpl,
      jitterMs: 0,
    });
    const dependencies = {
      now: () => nowMs,
      randomUUID: () => CYCLE_ID,
      runStep,
      log: () => undefined,
    };
    const env = {
      CATALOG_DB: db,
      SOURCE_SNAPSHOTS: r2,
      AUTOMATED_SOURCE_IDS: 'openrouter-models,opencode-zen',
    } as unknown as CatalogIngestEnv;
    await new CatalogIngestCoordinator({ storage } as never, env, dependencies)
      .start({ scheduledTime: STARTED_AT });

    let pointerGapCount = 0;
    let alarms = 0;
    const processFailures = new Set<CatalogCycleStep>();
    while (storage.alarm !== null) {
      const cycle = currentCycle(storage);
      const phase = cycle.phase as CatalogCycleStep;
      if (!processFailures.has(phase)) {
        // The handler disappears after observing its durable cursor. The next
        // alarm reconstructs it from persisted DO/D1/R2 state.
        processFailures.add(phase);
        void new CatalogIngestCoordinator({ storage } as never, env, dependencies);
        if (!activePublicationReadable(database)) pointerGapCount += 1;
      }
      nowMs = Math.max(nowMs + 1, storage.alarm);
      await new CatalogIngestCoordinator({ storage } as never, env, dependencies).alarm();
      if (!activePublicationReadable(database)) pointerGapCount += 1;
      if (currentCycle(storage).state === 'failed' || currentCycle(storage).state === 'expired') {
        throw new Error(`catalog full-cycle failed at ${phase}/${cycle.cursor}: ${currentCycle(storage).errorCode}`);
      }
      alarms += 1;
      if (alarms > 40) throw new Error(`catalog full-cycle exceeded its alarm bound at ${phase}/${cycle.cursor}`);
    }

    const publication = {
      pointerGapCount,
      foreignAttemptRows: Number((database.prepare(`SELECT COUNT(*) AS n FROM catalog_revisions
        WHERE publication_state = 'pending' AND publication_attempt_id <> ?`).get(CYCLE_ID) as { n: number }).n),
    };
    const finalRevision = currentCycle(storage).finalRevision;

    expect(processFailures).toEqual(new Set(CATALOG_CYCLE_STEPS));
    expect(publication.pointerGapCount).toBe(0);
    expect(publication.foreignAttemptRows).toBe(0);
    expect(finalRevision).not.toBe(priorCatalog.revision);
    expect(database.prepare('SELECT active_revision FROM catalog_publication_state WHERE singleton = 1').get())
      .toEqual({ active_revision: finalRevision });
    expect(database.prepare(`SELECT expiration_date FROM model_offers
      WHERE revision = ? AND model_id = 'openai/gpt-4o'`).get(finalRevision))
      .toEqual({ expiration_date: '2026-09-30' });
    expect(database.prepare(`SELECT state, phase FROM ingestion_cycles
      WHERE scope = 'catalog' AND cycle_id = ?`).get(CYCLE_ID))
      .toEqual({ state: 'published', phase: 'receipt' });
  });
});
