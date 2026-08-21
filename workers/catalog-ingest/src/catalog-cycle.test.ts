import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import type { CatalogResponse } from '../../../src/catalog/contracts';
import {
  CATALOG_CYCLE_STEPS,
  buildCatalogCandidateStatements,
  buildCatalogPublicationStatements,
  catalogCandidateCacheRevision,
  runCatalogCycleStep,
} from './catalog-cycle';
import { createCatalogCycle } from './coordinator';
import { buildManualSubscriptionSources } from '../../../src/catalog/manual-manifests';
import { SUBSCRIPTION_SOURCE_CONFIGS, type SubscriptionCrawlResult } from './subscription-crawler';

interface Statement { sql: string; values: unknown[] }
type SqlValue = string | number | bigint | Uint8Array | null;

function database() {
  return {
    prepare(sql: string) {
      return { bind: (...values: unknown[]): Statement => ({ sql, values }) };
    },
    batch: async () => undefined,
  };
}

const candidate: CatalogResponse = {
  revision: 'catalog_abc',
  publishedAt: '2026-08-12T00:20:00.000Z',
  freshness: { status: 'fresh', checkedAt: '2026-08-12T00:20:00.000Z' },
  provenance: [{
    id: 'source-a',
    providerId: 'provider-a',
    sourceUrl: 'https://example.com/catalog',
    observedAt: '2026-08-12T00:20:00.000Z',
    sourceKind: 'official_json',
    confidence: 'official',
  }],
  plans: [],
  modelOffers: [{
    id: 'provider-a:model-a:direct',
    providerId: 'provider-a',
    displayName: 'Model A',
    modelId: 'model-a',
    pricingBasis: 'direct_provider_api',
    route: 'direct_provider',
    currency: 'USD',
    unit: 'micro_dollars_per_million_tokens',
    inputMicroDollarsPerMillion: 1_000_000,
    outputMicroDollarsPerMillion: 2_000_000,
    sourceId: 'source-a',
  }],
};

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
  ]) {
    sqlite.exec(readFileSync(resolve(process.cwd(), 'migrations', file), 'utf8'));
  }
  interface SqlStatement extends Statement {
    all<T = unknown>(): Promise<{ results: T[] }>;
  }
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
        for (const statement of statements as Statement[]) {
          sqlite.prepare(statement.sql).run(...statement.values as SqlValue[]);
        }
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { sqlite, db };
}

function seedPublishedCatalog(
  db: ReturnType<typeof sqliteD1>['db'],
  catalog: CatalogResponse,
  snapshotKeys: Readonly<Record<string, string>>,
) {
  const cycleId = 'prior-cycle';
  const statements = buildCatalogCandidateStatements({
    db,
    catalog,
    cycleId,
    snapshotKeys,
    createdAt: catalog.publishedAt,
  });
  return db.batch([
    ...statements,
    ...buildCatalogPublicationStatements({
      db,
      catalogRevision: catalog.revision,
      cacheRevision: catalogCandidateCacheRevision(catalog.revision, cycleId),
      frozenCatalogRevision: null,
      cycleId,
      sourceIds: catalog.provenance.map((source) => source.id),
      now: catalog.publishedAt,
    }),
  ]);
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
        : new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
      objects.set(key, { bytes, customMetadata: options?.customMetadata });
    },
    async get(key: string) {
      const object = objects.get(key);
      if (!object) return null;
      return {
        customMetadata: object.customMetadata,
        async arrayBuffer() { return object.bytes.slice().buffer; },
      };
    },
    async head(key: string) {
      const object = objects.get(key);
      return object ? { customMetadata: object.customMetadata } : null;
    },
  };
}

const openRouterPayload = {
  data: [{ id: 'openai/gpt-4o', name: 'GPT-4o', pricing: { prompt: '0.0000025', completion: '0.00001' } }],
};
const openCodeModelsPayload = { data: [{ id: 'opencode/zen', object: 'model', owned_by: 'opencode' }] };
const openCodePricingHtml = `
  <table><tr><th>Model</th><th>Model ID</th><th>Endpoint</th><th>AI SDK Package</th></tr>
    <tr><td>Zen</td><td>opencode/zen</td><td>https://opencode.ai/zen/v1/responses</td><td>@ai-sdk/openai</td></tr></table>
  <table><tr><th>Model</th><th>Input</th><th>Output</th><th>Cached Read</th><th>Cached Write</th></tr>
    <tr><td>Zen</td><td>$1.00</td><td>$2.00</td><td>$0.20</td><td>-</td></tr></table>`;

describe('catalog cycle contract', () => {
  it('uses the approved one-step-per-alarm order', () => {
    expect(CATALOG_CYCLE_STEPS).toEqual([
      'acquire',
      'retrieve-openrouter',
      'retrieve-opencode-models',
      'retrieve-opencode-pricing',
      'prepare-manual',
      'retrieve-subscriptions',
      'stage',
      'validate',
      'publish',
      'receipt',
    ]);
  });

  it('makes every staged cache revision attempt-owned and catalog-prefixed', () => {
    expect(catalogCandidateCacheRevision('catalog_abc', '550e8400-e29b-41d4-a716-446655440000'))
      .toBe('catalog_abc+cache-550e8400-e29b-41d4-a716-446655440000');
  });

  it('stages complete catalog facts and response bodies without moving public pointers', () => {
    const statements = buildCatalogCandidateStatements({
      db: database(),
      catalog: candidate,
      cycleId: '550e8400-e29b-41d4-a716-446655440000',
      snapshotKeys: { 'source-a': 'catalog-candidates/cycle/source-a.json' },
      createdAt: '2026-08-12T00:20:00.000Z',
    }) as Statement[];

    expect(statements.some(({ sql }) => sql.includes('catalog_revisions'))).toBe(true);
    expect(statements.some(({ sql }) => sql.includes('source_records'))).toBe(true);
    expect(statements.some(({ sql }) => sql.includes('model_offers'))).toBe(true);
    expect(statements.some(({ sql }) => sql.includes('api_response_entries'))).toBe(true);
    expect(statements.some(({ sql }) => sql.includes('catalog_publication_state'))).toBe(false);
    expect(statements.some(({ sql }) => sql.includes('api_response_publication_state'))).toBe(false);
  });

  it('publishes catalog and cache pointers in one frozen-revision-guarded batch', () => {
    const statements = buildCatalogPublicationStatements({
      db: database(),
      catalogRevision: candidate.revision,
      cacheRevision: catalogCandidateCacheRevision(candidate.revision, '550e8400-e29b-41d4-a716-446655440000'),
      cycleId: '550e8400-e29b-41d4-a716-446655440000',
      frozenCatalogRevision: 'catalog_previous',
      now: '2026-08-12T00:35:00.000Z',
    }) as Statement[];

    expect(statements.at(-2)?.sql).toContain('catalog_publication_state');
    expect(statements.at(-2)?.sql).toContain('active_revision = ?');
    expect(statements.at(-2)?.values).toContain('catalog_previous');
    expect(statements.at(-1)?.sql).toContain('api_response_publication_state');
    expect(statements.at(-1)?.sql).toContain('catalog_publication_state');
    expect(statements.at(-1)?.values).toContain(candidate.revision);
  });

  it('makes pending catalog rows attempt-owned and enforces published pointer targets in SQLite', async () => {
    const harness = sqliteD1();
    using database = harness.sqlite;
    const { db } = harness;
    const cycleId = '550e8400-e29b-41d4-a716-446655440000';
    const candidateStatements = buildCatalogCandidateStatements({
      db,
      catalog: candidate,
      cycleId,
      snapshotKeys: { 'source-a': 'catalog-candidates/cycle/source-a.json' },
      createdAt: '2026-08-12T00:20:00.000Z',
    });
    await db.batch(candidateStatements);

    expect(database.prepare('SELECT publication_attempt_id FROM catalog_revisions WHERE revision = ?')
      .get(candidate.revision)).toEqual({ publication_attempt_id: cycleId });
    expect(() => database.prepare(`INSERT INTO catalog_publication_state
      (singleton, active_revision, updated_at) VALUES (1, ?, ?)`)
      .run(candidate.revision, '2026-08-12T00:20:00.000Z')).toThrow('published revision');
  });

  it('runs a complete cold-start cycle with one serial request per retrieval alarm', async () => {
    const harness = sqliteD1();
    using database = harness.sqlite;
    const { db } = harness;
    const r2 = memoryR2();
    const cycleId = '550e8400-e29b-41d4-a716-446655440000';
    let cycle = createCatalogCycle(Date.parse('2026-08-12T00:20:00.000Z'), cycleId);
    await db.batch([db.prepare(`INSERT INTO ingestion_cycles
      (scope, cycle_id, cadence_key, state, phase, cursor, attempt, manifest_key,
       started_at, updated_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      cycle.scope, cycle.cycleId, cycle.cadenceKey, cycle.state, cycle.phase,
      cycle.cursor, cycle.attempt, cycle.manifestKey, cycle.startedAt,
      cycle.updatedAt, cycle.expiresAt,
    )]);
    const requests: string[] = [];
    const fetchImpl = vi.fn(async (request: RequestInfo | URL) => {
      const url = String(request);
      requests.push(url);
      if (url.includes('openrouter.ai')) return Response.json(openRouterPayload);
      if (url.includes('/zen/v1/models')) return Response.json(openCodeModelsPayload);
      return new Response(openCodePricingHtml, { headers: { 'content-type': 'text/html' } });
    });
    const env = {
      CATALOG_DB: db,
      SOURCE_SNAPSHOTS: r2,
      AUTOMATED_SOURCE_IDS: 'openrouter-models,opencode-zen',
    };
    let nowMs = Date.parse('2026-08-12T00:20:00.000Z');
    for (let index = 0; index < CATALOG_CYCLE_STEPS.length; index += 1) {
      const result = await runCatalogCycleStep({ cycle, env, fetchImpl, nowMs, jitterMs: 0 });
      if (result.kind === 'terminal') {
        expect(index).toBe(CATALOG_CYCLE_STEPS.length - 1);
        expect(result.status).toBe('published');
        cycle = result.cycle;
        break;
      }
      expect(result.kind).toBe('advanced');
      cycle = result.cycle;
      nowMs += 15_000;
      if (index < 7) {
        const pointer = db.prepare('SELECT active_revision FROM catalog_publication_state').bind();
        expect((await pointer.all()).results).toEqual([]);
      }
    }

    expect(requests).toEqual([
      'https://openrouter.ai/api/v1/models',
      'https://opencode.ai/zen/v1/models',
      'https://opencode.ai/docs/zen/',
    ]);
    expect(cycle.state).toBe('published');
    expect((await db.prepare('SELECT active_revision FROM catalog_publication_state').bind().all()).results)
      .toEqual([{ active_revision: cycle.finalRevision }]);
    expect((await db.prepare("SELECT active_revision FROM api_response_publication_state WHERE scope = 'catalog'").bind().all()).results)
      .toEqual([expect.objectContaining({ active_revision: expect.stringContaining('+cache-') })]);
  });

  it('stores bounded subscription HTML and a crawl receipt before staging', async () => {
    const harness = sqliteD1();
    using database = harness.sqlite;
    const { db } = harness;
    const r2 = memoryR2();
    const startedAt = Date.parse('2026-08-21T00:20:00.000Z');
    const initial = createCatalogCycle(startedAt, '550e8400-e29b-41d4-a716-446655440000');
    const cycle = { ...initial, phase: 'retrieve-subscriptions' as const, cursor: 5 };
    await db.batch([db.prepare(`INSERT INTO ingestion_cycles
      (scope, cycle_id, cadence_key, state, phase, cursor, attempt, manifest_key,
       started_at, updated_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      cycle.scope, cycle.cycleId, cycle.cadenceKey, cycle.state, cycle.phase,
      cycle.cursor, cycle.attempt, cycle.manifestKey, cycle.startedAt,
      cycle.updatedAt, cycle.expiresAt,
    )]);
    const baselineKey = `catalog-candidates/${cycle.cycleId}/baseline.json`;
    await r2.put(baselineKey, JSON.stringify(null));
    await r2.put(cycle.manifestKey!, JSON.stringify({
      schemaVersion: 1,
      cycleId: cycle.cycleId,
      cadenceKey: cycle.cadenceKey,
      observedAt: cycle.startedAt,
      baselineKey,
      frozenCatalogRevision: null,
      validators: {},
      artifacts: {},
    }));
    const rawHtml = new TextEncoder().encode('<html><body>ChatGPT Pro</body></html>');
    const crawlSubscriptionsImpl = async (): Promise<SubscriptionCrawlResult> => ({
      rawBytes: rawHtml,
      record: {
        sourceId: SUBSCRIPTION_SOURCE_CONFIGS[0].sourceId,
        providerId: SUBSCRIPTION_SOURCE_CONFIGS[0].providerId,
        url: SUBSCRIPTION_SOURCE_CONFIGS[0].url,
        observedAt: cycle.startedAt,
        state: 'baseline',
        statusCode: 200,
        contentHash: 'sha256:test-subscription',
        etag: null,
        lastModified: null,
        priceObservations: [],
      },
    });
    const result = await runCatalogCycleStep({
      cycle,
      env: {
        CATALOG_DB: db,
        SOURCE_SNAPSHOTS: r2,
        AUTOMATED_SUBSCRIPTION_SOURCE_IDS: SUBSCRIPTION_SOURCE_CONFIGS[0].sourceId,
      },
      crawlSubscriptionsImpl,
      nowMs: startedAt,
    });
    expect(result.kind).toBe('advanced');
    expect(result.cycle.phase).toBe('stage');
    expect([...r2.objects.keys()].some((key) => key.includes('/subscriptions/openai-subscription/'))).toBe(true);
    const manifestBytes = r2.objects.get(cycle.manifestKey!)?.bytes;
    const manifest = JSON.parse(new TextDecoder().decode(manifestBytes ?? new Uint8Array())) as { artifacts: Record<string, { key: string }> };
    expect(manifest.artifacts.subscriptions).toBeDefined();
  });

  it('honors the complete 429 reset and does not fetch twice in one alarm', async () => {
    const harness = sqliteD1();
    using database = harness.sqlite;
    const { db } = harness;
    const r2 = memoryR2();
    const startedAt = Date.parse('2026-08-12T00:20:00.000Z');
    const initial = createCatalogCycle(startedAt, '550e8400-e29b-41d4-a716-446655440000');
    const cycle = { ...initial, phase: 'retrieve-openrouter', cursor: 1 };
    await db.batch([db.prepare(`INSERT INTO ingestion_cycles
      (scope, cycle_id, cadence_key, state, phase, cursor, attempt, manifest_key,
       started_at, updated_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      cycle.scope, cycle.cycleId, cycle.cadenceKey, cycle.state, cycle.phase,
      cycle.cursor, cycle.attempt, cycle.manifestKey, cycle.startedAt,
      cycle.updatedAt, cycle.expiresAt,
    )]);
    await r2.put(cycle.manifestKey!, JSON.stringify({
      schemaVersion: 1,
      cycleId: cycle.cycleId,
      cadenceKey: cycle.cadenceKey,
      observedAt: cycle.startedAt,
      baselineKey: `catalog-candidates/${cycle.cycleId}/baseline.json`,
      frozenCatalogRevision: null,
      validators: {},
      artifacts: {},
    }));
    const fetchImpl = vi.fn(async () => new Response(null, {
      status: 429,
      headers: { 'Retry-After': '3600' },
    }));

    const result = await runCatalogCycleStep({
      cycle,
      env: { CATALOG_DB: db, SOURCE_SNAPSHOTS: r2, AUTOMATED_SOURCE_IDS: 'openrouter-models' },
      fetchImpl,
      nowMs: startedAt,
      jitterMs: 5_000,
    });

    expect(result).toMatchObject({
      kind: 'retry',
      alarmAt: startedAt + 3_605_000,
      errorCode: 'rate_limited',
      cycle: { state: 'retry_wait', attempt: 1 },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('makes the third failed retrieval attempt terminal and keeps all pointers empty', async () => {
    const harness = sqliteD1();
    using database = harness.sqlite;
    const { db } = harness;
    const r2 = memoryR2();
    const startedAt = Date.parse('2026-08-12T00:20:00.000Z');
    const initial = createCatalogCycle(startedAt, '550e8400-e29b-41d4-a716-446655440000');
    const cycle = { ...initial, phase: 'retrieve-openrouter', cursor: 1, attempt: 2 };
    await db.batch([db.prepare(`INSERT INTO ingestion_cycles
      (scope, cycle_id, cadence_key, state, phase, cursor, attempt, manifest_key,
       started_at, updated_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      cycle.scope, cycle.cycleId, cycle.cadenceKey, cycle.state, cycle.phase,
      cycle.cursor, cycle.attempt, cycle.manifestKey, cycle.startedAt,
      cycle.updatedAt, cycle.expiresAt,
    )]);
    await r2.put(cycle.manifestKey!, JSON.stringify({
      schemaVersion: 1,
      cycleId: cycle.cycleId,
      cadenceKey: cycle.cadenceKey,
      observedAt: cycle.startedAt,
      baselineKey: `catalog-candidates/${cycle.cycleId}/baseline.json`,
      frozenCatalogRevision: null,
      validators: {},
      artifacts: {},
    }));

    const result = await runCatalogCycleStep({
      cycle,
      env: { CATALOG_DB: db, SOURCE_SNAPSHOTS: r2, AUTOMATED_SOURCE_IDS: 'openrouter-models' },
      fetchImpl: async () => new Response(null, { status: 503 }),
      nowMs: startedAt,
      jitterMs: 0,
    });

    expect(result).toMatchObject({ kind: 'terminal', status: 'failed', cycle: { attempt: 3 } });
    expect((await db.prepare('SELECT * FROM catalog_publication_state').bind().all()).results).toEqual([]);
    expect((await db.prepare('SELECT * FROM api_response_publication_state').bind().all()).results).toEqual([]);
  });

  it('expires before retrying and performs no upstream request', async () => {
    const harness = sqliteD1();
    using database = harness.sqlite;
    const { db } = harness;
    const r2 = memoryR2();
    const startedAt = Date.parse('2026-08-12T00:20:00.000Z');
    const initial = createCatalogCycle(startedAt, '550e8400-e29b-41d4-a716-446655440000');
    const cycle = { ...initial, phase: 'retrieve-openrouter', cursor: 1 };
    await db.batch([db.prepare(`INSERT INTO ingestion_cycles
      (scope, cycle_id, cadence_key, state, phase, cursor, attempt, manifest_key,
       started_at, updated_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      cycle.scope, cycle.cycleId, cycle.cadenceKey, cycle.state, cycle.phase,
      cycle.cursor, cycle.attempt, cycle.manifestKey, cycle.startedAt,
      cycle.updatedAt, cycle.expiresAt,
    )]);
    const fetchImpl = vi.fn();

    const result = await runCatalogCycleStep({
      cycle,
      env: { CATALOG_DB: db, SOURCE_SNAPSHOTS: r2, AUTOMATED_SOURCE_IDS: 'openrouter-models' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      nowMs: Date.parse(cycle.expiresAt),
    });

    expect(result).toMatchObject({ kind: 'terminal', status: 'expired' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sends persisted conditional validators and publishes unchanged freshness without a new catalog revision', async () => {
    const harness = sqliteD1();
    using database = harness.sqlite;
    const { db } = harness;
    const r2 = memoryR2();
    const publishedAt = '2026-08-11T00:20:00.000Z';
    const routerBytes = new TextEncoder().encode(JSON.stringify(openRouterPayload));
    const routerKey = 'openrouter-models/2026-08-11/router.json';
    const openCodeCombined = new TextEncoder().encode(JSON.stringify({
      models: openCodeModelsPayload,
      pricingHtml: openCodePricingHtml,
    }));
    const openCodeKey = 'opencode-zen/2026-08-11/opencode.json';
    await r2.put(routerKey, routerBytes, {
      customMetadata: { etag: '"router-v1"', last_modified: 'Tue, 11 Aug 2026 00:00:00 GMT' },
    });
    await r2.put(openCodeKey, openCodeCombined, {
      customMetadata: {
        models_etag: '"models-v1"',
        pricing_etag: '"pricing-v1"',
      },
    });
    const prior: CatalogResponse = {
      revision: 'catalog_prior',
      publishedAt,
      freshness: { status: 'fresh', checkedAt: publishedAt },
      provenance: [
        {
          id: 'openrouter-models', providerId: 'openrouter', sourceUrl: 'https://openrouter.ai/api/v1/models',
          observedAt: publishedAt, sourceKind: 'official_json', confidence: 'official', snapshotKey: routerKey,
        },
        {
          id: 'opencode-zen', providerId: 'opencode', sourceUrl: 'https://opencode.ai/docs/zen/',
          observedAt: publishedAt, sourceKind: 'official_html', confidence: 'official', snapshotKey: openCodeKey,
        },
      ],
      plans: [],
      modelOffers: [
        {
          id: 'openai:openai/gpt-4o:openrouter', providerId: 'openai', displayName: 'GPT-4o', modelId: 'openai/gpt-4o',
          pricingBasis: 'openrouter', route: 'openrouter', currency: 'USD', unit: 'micro_dollars_per_million_tokens',
          inputMicroDollarsPerMillion: 2_500_000, outputMicroDollarsPerMillion: 10_000_000, sourceId: 'openrouter-models',
        },
        {
          id: 'opencode:opencode/zen:opencode_zen', providerId: 'opencode', displayName: 'Zen', modelId: 'opencode/zen',
          pricingBasis: 'opencode_zen', route: 'opencode_zen', currency: 'USD', unit: 'micro_dollars_per_million_tokens',
          inputMicroDollarsPerMillion: 1_000_000, cachedInputMicroDollarsPerMillion: 200_000,
          outputMicroDollarsPerMillion: 2_000_000, sourceId: 'opencode-zen',
        },
      ],
    };
    const manualSources = buildManualSubscriptionSources('kimi', publishedAt);
    prior.provenance.push(...manualSources.map(({ source }) => source));
    prior.plans.push(...manualSources.flatMap(({ plans }) => plans));
    prior.modelOffers.push(...manualSources.flatMap(({ modelOffers }) => modelOffers));
    await seedPublishedCatalog(db, prior, {
      'openrouter-models': routerKey,
      'opencode-zen': openCodeKey,
    });
    const cycleId = '550e8400-e29b-41d4-a716-446655440000';
    let cycle = createCatalogCycle(Date.parse('2026-08-12T00:20:00.000Z'), cycleId);
    await db.batch([db.prepare(`INSERT INTO ingestion_cycles
      (scope, cycle_id, cadence_key, state, phase, cursor, attempt, manifest_key,
       started_at, updated_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      cycle.scope, cycle.cycleId, cycle.cadenceKey, cycle.state, cycle.phase,
      cycle.cursor, cycle.attempt, cycle.manifestKey, cycle.startedAt,
      cycle.updatedAt, cycle.expiresAt,
    )]);
    const observedHeaders: Array<{ url: string; etag: string | null; modified: string | null }> = [];
    const fetchImpl = vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      observedHeaders.push({
        url: String(request),
        etag: headers.get('If-None-Match'),
        modified: headers.get('If-Modified-Since'),
      });
      return new Response(null, { status: 304 });
    });
    const env = {
      CATALOG_DB: db,
      SOURCE_SNAPSHOTS: r2,
      AUTOMATED_SOURCE_IDS: 'openrouter-models,opencode-zen',
    };
    let nowMs = Date.parse('2026-08-12T00:20:00.000Z');
    for (let index = 0; index < CATALOG_CYCLE_STEPS.length; index += 1) {
      const result = await runCatalogCycleStep({ cycle, env, fetchImpl, nowMs, jitterMs: 0 });
      cycle = result.cycle;
      if (result.kind === 'terminal') {
        expect(result.status).toBe('unchanged');
        break;
      }
      nowMs += 15_000;
    }

    expect(observedHeaders).toEqual([
      { url: 'https://openrouter.ai/api/v1/models', etag: '"router-v1"', modified: 'Tue, 11 Aug 2026 00:00:00 GMT' },
      { url: 'https://opencode.ai/zen/v1/models', etag: '"models-v1"', modified: null },
      { url: 'https://opencode.ai/docs/zen/', etag: '"pricing-v1"', modified: null },
    ]);
    expect(cycle.finalRevision).toBe(prior.revision);
    expect(database.prepare('SELECT COUNT(*) AS count FROM catalog_revisions').get()).toEqual({ count: 1 });
    expect(database.prepare('SELECT checked_at FROM catalog_revisions WHERE revision = ?').get(prior.revision))
      .toEqual({ checked_at: expect.stringMatching(/^2026-08-12T/) });
    expect(database.prepare('SELECT source_id, last_success_at FROM source_refresh_state ORDER BY source_id').all())
      .toEqual([
        { source_id: 'kimi-subscription', last_success_at: expect.stringMatching(/^2026-08-12T/) },
        { source_id: 'opencode-zen', last_success_at: expect.stringMatching(/^2026-08-12T/) },
        { source_id: 'openrouter-models', last_success_at: expect.stringMatching(/^2026-08-12T/) },
      ]);
  });
});
