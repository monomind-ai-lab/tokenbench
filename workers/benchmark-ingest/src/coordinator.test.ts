import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { IngestionCycle } from '../../_shared/checkpointed-ingestion';
import {
  parseBenchmarkCandidateManifest,
  readCandidateManifest,
  type BenchmarkCandidateManifestV1,
  type CandidateR2Bucket,
} from './candidate-storage';
import { LMARENA_SUBSETS } from './lmarena';
import {
  SourceRateLimitedError,
  type CandidateArtifact,
  type CandidatePartition,
} from './source-steps';
import {
  BENCHMARK_CYCLE_EXPIRY_MS,
  BENCHMARK_STEP_DELAY_MS,
  BenchmarkIngestCoordinator,
  createBenchmarkCycle,
  type BenchmarkIngestEnv,
  type CoordinatorDependencies,
} from './coordinator';

const CYCLE_ID = '3f1d0f1a-2b3c-4d5e-8f90-a1b2c3d4e5f6';
const CATALOG_REVISION = 'catalog-2026-08-16';
const PREV_BENCHMARK_REVISION = 'bench-2026-08-09';
const LMARENA_REVISION = '4e52c8e709c90a4cad8498d9db5aad11709b04e0';
const CYCLE_KEY = 'benchmark-cycle';
const CHECKPOINT_KEY = 'benchmark-checkpoint';
const SUNDAY = Date.parse('2026-08-16T02:15:00.000Z');

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

function hex(seed: string): string {
  return createHash('sha256').update(seed).digest('hex');
}

function artifact(subKey: string, artifactId: string, extra: Partial<CandidateArtifact> = {}): CandidateArtifact {
  const seed = `${subKey}:${artifactId}`;
  return {
    artifactId,
    key: `benchmark-candidates/${CYCLE_ID}/${subKey}`,
    contentHash: `sha256:${hex(seed)}`,
    originalContentHash: `sha256:${hex(`${seed}:original`)}`,
    byteLength: 128,
    sourceUrl: 'https://example.com/source.json',
    etag: null,
    lastModified: null,
    upstreamRevision: null,
    schemaVersion: null,
    ...extra,
  };
}

function partition(subKey: string, kind: CandidatePartition['kind'], index: number, rowCount: number): CandidatePartition {
  const seed = `${subKey}:${index}`;
  return {
    partitionId: `${kind}:${index}`,
    kind,
    index,
    key: `benchmark-candidates/${CYCLE_ID}/${subKey}`,
    contentHash: `sha256:${hex(seed)}`,
    byteLength: 256,
    rowCount,
  };
}

interface StoredObject { bytes: Uint8Array; customMetadata: Record<string, string> }

function memoryStore(): CandidateR2Bucket & { objects: Map<string, StoredObject>; writes: string[] } {
  const objects = new Map<string, StoredObject>();
  const writes: string[] = [];
  return {
    objects,
    writes,
    async get(key: string) {
      const object = objects.get(key);
      if (!object) return null;
      return {
        arrayBuffer: async () => object.bytes.slice().buffer as ArrayBuffer,
        customMetadata: object.customMetadata,
      };
    },
    async put(key: string, value: ArrayBufferView, options?: { customMetadata?: Record<string, string> }) {
      writes.push(key);
      const view = value as unknown as { buffer: ArrayBuffer; byteOffset: number; byteLength: number };
      objects.set(key, {
        bytes: new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)),
        customMetadata: options?.customMetadata ?? {},
      });
      return undefined;
    },
  };
}

interface D1Seed {
  catalogRevision?: string | null;
  benchmarkRevision?: string | null;
  sourceRecords?: Record<string, unknown>[];
  publishedReceipt?: boolean;
}

interface Statement { sql: string; values: unknown[] }

function fakeD1(seed: D1Seed = {}) {
  const writes: Statement[] = [];
  const bound = (sql: string, values: unknown[]) => ({
    sql,
    values,
    async first<T>() {
      if (sql.includes('catalog_publication_state')) {
        return (seed.catalogRevision ? {
          revision: seed.catalogRevision,
          sourceUrl: 'https://openrouter.ai/api/v1/models',
          observedAt: new Date(SUNDAY).toISOString(),
          snapshotKey: 'catalog/openrouter.json',
          contentHash: `sha256:${hex('catalog')}`,
        } : null) as T | null;
      }
      if (sql.includes('benchmark_publication_state')) {
        return (seed.benchmarkRevision ? { revision: seed.benchmarkRevision } : null) as T | null;
      }
      if (sql.includes('ingestion_cycles') && sql.includes("'published'")) {
        return (seed.publishedReceipt ? { cycle_id: 'prior' } : null) as T | null;
      }
      return null;
    },
    async all<T>() {
      if (sql.includes('benchmark_source_records')) {
        return { results: (seed.sourceRecords ?? []) as T[] };
      }
      return { results: [] as T[] };
    },
  });
  return {
    writes,
    prepare(sql: string) {
      return { bind: (...values: unknown[]) => bound(sql, values) };
    },
    async batch(statements: Statement[]) {
      writes.push(...statements.map((statement) => ({ sql: statement.sql, values: statement.values })));
    },
  };
}

interface StepCall { name: string; args: Record<string, unknown> }

function fakeSteps(overrides: Partial<Record<string, (args: Record<string, unknown>) => unknown>> = {}) {
  const calls: StepCall[] = [];
  const record = (name: string, args: Record<string, unknown>, result: unknown) => {
    calls.push({ name, args });
    const override = overrides[name];
    if (override) return override(args);
    return result;
  };
  const steps = {
    retrieveBenchLmArtifactStep: async (input: Record<string, unknown>) =>
      record('retrieveBenchLmArtifactStep', input,
        artifact(`benchlm/raw/${String(input.artifact)}/${hex(String(input.artifact))}.json`, String(input.artifact))),
    assembleBenchLmStep: async (input: Record<string, unknown>) =>
      record('assembleBenchLmStep', input, partition('benchlm/bundle/bundle.json', 'benchlm-bundle', 0, 6)),
    retrieveLiteLlmStep: async (input: Record<string, unknown>) =>
      record('retrieveLiteLlmStep', input, artifact('litellm/model-prices.json', 'model-prices', {
        sourceUrl: 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json',
      })),
    retrieveLmArenaRevisionStep: async (input: Record<string, unknown>) =>
      record('retrieveLmArenaRevisionStep', input, LMARENA_REVISION),
    retrieveLmArenaPageStep: async (input: Record<string, unknown>) => {
      const subset = String(input.subset);
      const offset = Number(input.offset);
      return record('retrieveLmArenaPageStep', input, {
        kind: 'page',
        subset,
        offset,
        artifact: artifact(`lmarena/${subset}/offset-${offset}/page.json`,
          `${subset}:latest:overall:rows-${offset}-${offset + 100}`,
          { upstreamRevision: String(input.upstreamRevision) }),
        rowCount: 100,
        declaredTotal: 100,
        complete: true,
      });
    },
    normalizeSourceStep: async (input: Record<string, unknown>) =>
      record('normalizeSourceStep', input,
        partition(`normalized/${Number(input.index)}/part.json`, 'normalized', Number(input.index), 42)),
    normalizeOpenRouterCatalogStep: async (input: Record<string, unknown>) =>
      record('normalizeOpenRouterCatalogStep', input,
        partition(`normalized/${Number(input.index)}/openrouter.json`, 'normalized', Number(input.index), 42)),
  };
  return { steps: steps as unknown as CoordinatorDependencies['steps'], calls };
}

function storage(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial));
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

function environment(seed: D1Seed = {}) {
  const db = fakeD1(seed);
  const store = memoryStore();
  const catalogBytes = new TextEncoder().encode('{"catalog":true}');
  store.objects.set('catalog/openrouter.json', {
    bytes: catalogBytes,
    customMetadata: { original_content_hash: `sha256:${hex('catalog-raw')}` },
  });
  const env = { CATALOG_DB: db, SOURCE_SNAPSHOTS: store } as unknown as BenchmarkIngestEnv;
  return { env, db, store };
}

let nowMs = SUNDAY;
function baseDeps(steps: CoordinatorDependencies['steps'], log?: (record: Record<string, unknown>) => void): Partial<CoordinatorDependencies> {
  return {
    now: () => nowMs,
    randomUUID: () => CYCLE_ID,
    jitterMs: () => 5_000,
    steps,
    log: log ?? (() => undefined),
  };
}

function cycleOf(store: ReturnType<typeof storage>): IngestionCycle {
  return store.values.get(CYCLE_KEY) as IngestionCycle;
}

async function fireAlarm(durable: ReturnType<typeof storage>, env: BenchmarkIngestEnv, deps: Partial<CoordinatorDependencies>) {
  const coordinator = new BenchmarkIngestCoordinator({ storage: durable } as never, env, deps);
  await coordinator.alarm();
}

// ---------------------------------------------------------------------------
// Cycle identity
// ---------------------------------------------------------------------------

describe('createBenchmarkCycle', () => {
  it('creates a UUID-owned 24-hour benchmark cycle for one ISO-week cadence key', () => {
    const cycle = createBenchmarkCycle(SUNDAY, CYCLE_ID);
    expect(cycle).toMatchObject({
      scope: 'benchmarks',
      cycleId: CYCLE_ID,
      cadenceKey: '2026-W33',
      phase: 'acquire',
      cursor: 0,
      attempt: 0,
      state: 'running',
      manifestKey: `benchmark-candidates/${CYCLE_ID}/manifest.json`,
    });
    expect(Date.parse(cycle.expiresAt) - SUNDAY).toBe(BENCHMARK_CYCLE_EXPIRY_MS);
    expect(BENCHMARK_CYCLE_EXPIRY_MS).toBe(24 * 60 * 60 * 1_000);
  });
});

// ---------------------------------------------------------------------------
// start + cadence guard
// ---------------------------------------------------------------------------

describe('BenchmarkIngestCoordinator.start', () => {
  it('starts one ISO-week cadence, mirrors a D1 receipt, and schedules the first alarm', async () => {
    nowMs = SUNDAY;
    const durable = storage();
    const { env, db } = environment({ catalogRevision: CATALOG_REVISION });
    const { steps } = fakeSteps();
    const coordinator = new BenchmarkIngestCoordinator({ storage: durable } as never, env, baseDeps(steps));

    const first = await coordinator.start({ scheduledTime: SUNDAY });
    const second = await coordinator.start({ scheduledTime: Date.parse('2026-08-16T04:00:00.000Z') });

    expect(first.status).toBe('started');
    expect(second.status).toBe('already-running');
    expect(db.writes.some(({ sql }) => sql.includes('INSERT INTO ingestion_cycles'))).toBe(true);
    expect(durable.alarm).toBe(SUNDAY);
  });

  it('does not start a cadence key that already has a published receipt', async () => {
    nowMs = SUNDAY;
    const durable = storage();
    const { env, db } = environment({ catalogRevision: CATALOG_REVISION, publishedReceipt: true });
    const { steps } = fakeSteps();
    const coordinator = new BenchmarkIngestCoordinator({ storage: durable } as never, env, baseDeps(steps));

    const result = await coordinator.start({ scheduledTime: SUNDAY });

    expect(result.status).toBe('already-completed');
    expect(db.writes).toEqual([]);
    expect(durable.alarm).toBeNull();
  });

  it('expires a different-cadence active receipt before starting the next week', async () => {
    nowMs = SUNDAY;
    const prior = createBenchmarkCycle(SUNDAY, '11111111-2222-4333-8444-555555555555');
    const durable = storage({ [CYCLE_KEY]: prior });
    const { env, db } = environment({ catalogRevision: CATALOG_REVISION });
    const { steps } = fakeSteps();
    const nextSunday = Date.parse('2026-08-23T02:15:00.000Z');
    const coordinator = new BenchmarkIngestCoordinator({ storage: durable } as never, env, baseDeps(steps));

    const result = await coordinator.start({ scheduledTime: nextSunday });

    expect(result.status).toBe('started');
    expect(result.cycle.cadenceKey).toBe('2026-W34');
    expect(db.writes[0]).toMatchObject({
      sql: expect.stringContaining('UPDATE ingestion_cycles'),
      values: expect.arrayContaining(['expired', 'cadence_superseded', prior.cycleId]),
    });
    expect(db.writes[1]?.sql).toContain('INSERT INTO ingestion_cycles');
  });
});

// ---------------------------------------------------------------------------
// acquire freeze
// ---------------------------------------------------------------------------

describe('acquire phase', () => {
  it('freezes the active catalog and benchmark revisions and advances without writing a manifest', async () => {
    nowMs = SUNDAY;
    const durable = storage({ [CYCLE_KEY]: createBenchmarkCycle(SUNDAY, CYCLE_ID) });
    const { env, store } = environment({ catalogRevision: CATALOG_REVISION, benchmarkRevision: PREV_BENCHMARK_REVISION });
    const { steps, calls } = fakeSteps();

    await fireAlarm(durable, env, baseDeps(steps));

    const cycle = cycleOf(durable);
    expect(cycle.phase).toBe('retrieve-benchlm');
    expect(cycle.cursor).toBe(0);
    expect(cycle.frozenCatalogRevision).toBe(CATALOG_REVISION);
    expect(cycle.frozenBenchmarkRevision).toBe(PREV_BENCHMARK_REVISION);
    expect(calls).toEqual([]);
    expect(store.objects.has(`benchmark-candidates/${CYCLE_ID}/manifest.json`)).toBe(false);
  });

  it('passes frozen active validators and exact prior R2 bytes into conditional retrieval', async () => {
    nowMs = SUNDAY;
    const priorBytes = new TextEncoder().encode('{"prior":true}');
    const priorHash = `sha256:${hex('{"prior":true}')}`;
    const durable = storage({ [CYCLE_KEY]: createBenchmarkCycle(SUNDAY, CYCLE_ID) });
    const { env, store } = environment({
      catalogRevision: CATALOG_REVISION,
      benchmarkRevision: PREV_BENCHMARK_REVISION,
      sourceRecords: [{
        sourceId: 'benchlm',
        artifactId: 'leaderboard',
        sourceUrl: 'https://benchlm.ai/data/leaderboard.json',
        etag: '"prior-etag"',
        lastModified: null,
        snapshotKey: 'benchmarks/benchlm/leaderboard/prior.json',
        contentHash: priorHash,
        originalContentHash: priorHash,
        upstreamRevision: null,
        schemaVersion: null,
      }],
    });
    store.objects.set('benchmarks/benchlm/leaderboard/prior.json', {
      bytes: priorBytes,
      customMetadata: { original_content_hash: priorHash },
    });
    const { steps, calls } = fakeSteps();

    await fireAlarm(durable, env, baseDeps(steps));
    await fireAlarm(durable, env, baseDeps(steps));

    expect(calls[0].name).toBe('retrieveBenchLmArtifactStep');
    expect(calls[0].args.previous).toMatchObject({
      artifactId: 'leaderboard',
      key: 'benchmarks/benchlm/leaderboard/prior.json',
      byteLength: priorBytes.byteLength,
      etag: '"prior-etag"',
    });
  });

  it('fails terminally when no active catalog revision exists', async () => {
    nowMs = SUNDAY;
    const durable = storage({ [CYCLE_KEY]: createBenchmarkCycle(SUNDAY, CYCLE_ID) });
    const { env } = environment({ catalogRevision: null });
    const { steps } = fakeSteps();

    await fireAlarm(durable, env, baseDeps(steps));

    expect(cycleOf(durable).state).toBe('failed');
    expect(durable.alarm).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Full weekly retrieval
// ---------------------------------------------------------------------------

async function driveToDerive(seed: D1Seed = { catalogRevision: CATALOG_REVISION, benchmarkRevision: PREV_BENCHMARK_REVISION }) {
  nowMs = SUNDAY;
  const durable = storage({ [CYCLE_KEY]: createBenchmarkCycle(SUNDAY, CYCLE_ID) });
  const { env, db, store } = environment(seed);
  const { steps, calls } = fakeSteps();
  const perAlarm: number[] = [];
  for (let i = 0; i < 60; i += 1) {
    const before = calls.length;
    await fireAlarm(durable, env, baseDeps(steps));
    perAlarm.push(calls.length - before);
    const cycle = cycleOf(durable);
    if (cycle.phase === 'derive' || cycle.state === 'failed' || cycle.state === 'expired') break;
  }
  return { durable, db, store, calls, perAlarm };
}

describe('weekly retrieval end to end', () => {
  it('runs every retrieval phase one bounded step per alarm and hands off to derive', async () => {
    const { durable, store, calls, perAlarm } = await driveToDerive();

    const cycle = cycleOf(durable);
    expect(cycle.phase).toBe('derive');
    expect(cycle.state).toBe('running');
    expect(durable.alarm).not.toBeNull();
    expect(Math.max(...perAlarm)).toBeLessThanOrEqual(1);

    // one revision lookup shared by all subsets
    const pageCalls = calls.filter((call) => call.name === 'retrieveLmArenaPageStep');
    expect(pageCalls).toHaveLength(LMARENA_SUBSETS.length);
    for (const call of pageCalls) {
      expect(call.args.upstreamRevision).toBe(LMARENA_REVISION);
    }
    expect(calls.filter((call) => call.name === 'retrieveLmArenaRevisionStep')).toHaveLength(1);

    const checkpoint = durable.values.get(CHECKPOINT_KEY) as { manifestContentHash: string };
    const manifest = await readCandidateManifest(store as CandidateR2Bucket, CYCLE_ID, checkpoint.manifestContentHash);
    expect(manifest.benchLm).toHaveLength(6);
    expect(manifest.liteLlm).not.toBeNull();
    expect(manifest.lmArena).toHaveLength(LMARENA_SUBSETS.length);
    expect(manifest.lmArenaRevision).toBe(LMARENA_REVISION);
    expect(manifest.normalizedPartitions).toHaveLength(3 + LMARENA_SUBSETS.length);
    expect(manifest.frozenCatalogRevision).toBe(CATALOG_REVISION);
    expect(manifest.previousBenchmarkRevision).toBe(PREV_BENCHMARK_REVISION);
  });

  it('writes a strict manifest only after six BenchLM artifacts and keeps it strict thereafter', async () => {
    nowMs = SUNDAY;
    const durable = storage({ [CYCLE_KEY]: createBenchmarkCycle(SUNDAY, CYCLE_ID) });
    const { env, store } = environment({ catalogRevision: CATALOG_REVISION });
    const { steps } = fakeSteps();
    const manifestKey = `benchmark-candidates/${CYCLE_ID}/manifest.json`;

    for (let i = 0; i < 40; i += 1) {
      await fireAlarm(durable, env, baseDeps(steps));
      const cycle = cycleOf(durable);
      const checkpoint = durable.values.get(CHECKPOINT_KEY) as
        | { benchLm: unknown[]; manifestContentHash: string | null }
        | undefined;
      if (cycle.phase === 'retrieve-benchlm' || (cycle.phase === 'assemble-benchlm' && cycle.cursor === 0)) {
        // before assembly completes, no strict manifest exists
        if ((checkpoint?.benchLm.length ?? 0) < 6) {
          expect(store.objects.has(manifestKey)).toBe(false);
        }
      }
      if (checkpoint?.manifestContentHash) {
        const manifest = await readCandidateManifest(store as CandidateR2Bucket, CYCLE_ID, checkpoint.manifestContentHash);
        expect(manifest.benchLm).toHaveLength(6);
        expect(() => parseBenchmarkCandidateManifest(manifest as unknown)).not.toThrow();
      }
      if (cycle.phase === 'derive' || cycle.state !== 'running') break;
    }
    expect(cycleOf(durable).phase).toBe('derive');
  });

  it('does not write benchmark publication pointers', async () => {
    const { db } = await driveToDerive();
    const pointerSql = db.writes.filter(({ sql }) =>
      /benchmark_publication_state|api_response_publication_state|catalog_publication_state/i.test(sql));
    expect(pointerSql).toEqual([]);
    expect(db.writes.some(({ sql }) => sql.includes('ingestion_cycle_steps'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Pagination across multiple pages
// ---------------------------------------------------------------------------

describe('LMArena pagination', () => {
  it('retrieves one page per alarm across a multi-page subset before advancing', async () => {
    nowMs = SUNDAY;
    const firstSubset = LMARENA_SUBSETS[0];
    const overrides: Partial<Record<string, (args: Record<string, unknown>) => unknown>> = {
      retrieveLmArenaPageStep: (input) => {
        const subset = String(input.subset);
        const offset = Number(input.offset);
        const total = subset === firstSubset ? 250 : 100;
        const remaining = total - offset;
        const rowCount = Math.min(100, remaining);
        return {
          kind: 'page',
          subset,
          offset,
          artifact: artifact(`lmarena/${subset}/offset-${offset}/page.json`,
            `${subset}:latest:overall:rows-${offset}-${offset + rowCount}`,
            { upstreamRevision: String(input.upstreamRevision) }),
          rowCount,
          declaredTotal: total,
          complete: offset + rowCount >= total,
        };
      },
    };
    const durable = storage({ [CYCLE_KEY]: {
      ...createBenchmarkCycle(SUNDAY, CYCLE_ID),
      phase: 'retrieve-lmarena-pages',
      cursor: 0,
      frozenCatalogRevision: CATALOG_REVISION,
    } });
    // seed a checkpoint positioned at the start of pagination
    durable.values.set(CHECKPOINT_KEY, {
      schemaVersion: 1,
      cycleId: CYCLE_ID,
      observedAt: new Date(SUNDAY).toISOString(),
      frozenCatalogRevision: CATALOG_REVISION,
      frozenBenchmarkRevision: null,
      validators: [],
      benchLm: [...Array(6)].map((_unused, i) => artifact(`benchlm/raw/a${i}/${i}.json`,
        ['leaderboard', 'models', 'pricing', 'comparisons', 'benchmarks', 'public-leaderboard'][i])),
      benchLmBundle: partition('benchlm/bundle/b.json', 'benchlm-bundle', 0, 6),
      liteLlm: artifact('litellm/p.json', 'model-prices', { sourceUrl: 'https://example.com/p.json' }),
      lmArenaRevision: LMARENA_REVISION,
      lmArena: [],
      lmArenaProgress: { subsetIndex: 0, offset: 0, declaredTotal: null, transport: 'dataset-viewer', download: null, pageCount: 0 },
      normalizedPartitions: [],
      manifestContentHash: null,
    });
    const { env } = environment({ catalogRevision: CATALOG_REVISION });
    const { steps, calls } = fakeSteps(overrides);

    // three alarms for the first subset (0, 100, 200) then it advances
    await fireAlarm(durable, env, baseDeps(steps));
    await fireAlarm(durable, env, baseDeps(steps));
    await fireAlarm(durable, env, baseDeps(steps));

    const pageCalls = calls.filter((call) => call.name === 'retrieveLmArenaPageStep');
    expect(pageCalls.map((call) => call.args.offset)).toEqual([0, 100, 200]);
    const checkpoint = durable.values.get(CHECKPOINT_KEY) as { lmArenaProgress: { subsetIndex: number } };
    expect(checkpoint.lmArenaProgress.subsetIndex).toBe(1);
  });

  it('falls back to the pinned parquet resolve/download modes when the dataset viewer fails', async () => {
    nowMs = SUNDAY;
    let attempt = 0;
    const overrides: Partial<Record<string, (args: Record<string, unknown>) => unknown>> = {
      retrieveLmArenaPageStep: (input) => {
        attempt += 1;
        const transport = String(input.transport ?? 'dataset-viewer');
        if (transport === 'dataset-viewer') {
          const error = new Error('dataset-viewer 503');
          throw error;
        }
        if (transport === 'hub-parquet-resolve') {
          return {
            kind: 'resolved',
            download: {
              subset: String(input.subset),
              upstreamRevision: String(input.upstreamRevision),
              downloadUrl: 'https://cdn-lfs.hf.co/x',
              originalContentHash: `sha256:${hex('parquet')}`,
              etag: null,
            },
          };
        }
        return {
          kind: 'pages',
          subset: String(input.subset),
          artifacts: [artifact(`lmarena/${String(input.subset)}/hub/o0.json`,
            `${String(input.subset)}:latest:overall:hub-parquet:rows-0-100`,
            { upstreamRevision: String(input.upstreamRevision), schemaVersion: 'hub-parquet-v1' })],
          declaredTotal: 100,
        };
      },
    };
    const baseCheckpoint = {
      schemaVersion: 1,
      cycleId: CYCLE_ID,
      observedAt: new Date(SUNDAY).toISOString(),
      frozenCatalogRevision: CATALOG_REVISION,
      frozenBenchmarkRevision: null,
      validators: [],
      benchLm: [...Array(6)].map((_unused, i) => artifact(`benchlm/raw/a${i}/${i}.json`,
        ['leaderboard', 'models', 'pricing', 'comparisons', 'benchmarks', 'public-leaderboard'][i])),
      benchLmBundle: partition('benchlm/bundle/b.json', 'benchlm-bundle', 0, 6),
      liteLlm: artifact('litellm/p.json', 'model-prices', { sourceUrl: 'https://example.com/p.json' }),
      lmArenaRevision: LMARENA_REVISION,
      lmArena: [],
      lmArenaProgress: { subsetIndex: 0, offset: 0, declaredTotal: null, transport: 'dataset-viewer', download: null, pageCount: 0 },
      normalizedPartitions: [],
      manifestContentHash: null,
    };
    const durable = storage({
      [CYCLE_KEY]: {
        ...createBenchmarkCycle(SUNDAY, CYCLE_ID),
        phase: 'retrieve-lmarena-pages',
        cursor: 0,
        frozenCatalogRevision: CATALOG_REVISION,
      },
      [CHECKPOINT_KEY]: baseCheckpoint,
    });
    const { env } = environment({ catalogRevision: CATALOG_REVISION });
    const { steps, calls } = fakeSteps(overrides);

    // alarm 1: dataset-viewer fails at offset 0 -> transport flips to resolve
    await fireAlarm(durable, env, baseDeps(steps));
    let checkpoint = durable.values.get(CHECKPOINT_KEY) as { lmArenaProgress: { transport: string; download: unknown } };
    expect(checkpoint.lmArenaProgress.transport).toBe('hub-parquet-resolve');

    // alarm 2: resolve, transport becomes download
    nowMs = SUNDAY + 30 * 60 * 1_000;
    await fireAlarm(durable, env, baseDeps(steps));
    checkpoint = durable.values.get(CHECKPOINT_KEY) as { lmArenaProgress: { transport: string; download: unknown } };
    expect(checkpoint.lmArenaProgress.transport).toBe('hub-parquet-download');
    expect(checkpoint.lmArenaProgress.download).not.toBeNull();

    // alarm 3: download produces pages and advances subset
    nowMs = SUNDAY + 60 * 60 * 1_000;
    await fireAlarm(durable, env, baseDeps(steps));
    const done = durable.values.get(CHECKPOINT_KEY) as { lmArenaProgress: { subsetIndex: number }; lmArena: unknown[] };
    expect(done.lmArenaProgress.subsetIndex).toBe(1);
    expect(done.lmArena).toHaveLength(1);
    expect(calls.filter((call) => call.name === 'retrieveLmArenaPageStep')).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Retry / rate-limit / expiry
// ---------------------------------------------------------------------------

describe('retry, rate limits, and expiry', () => {
  it('persists a full provider reset on 429 and does not retry inside the alarm', async () => {
    nowMs = SUNDAY;
    const providerReset = SUNDAY + 3_600_000;
    let firstArtifactCalls = 0;
    const overrides = {
      retrieveBenchLmArtifactStep: () => {
        firstArtifactCalls += 1;
        throw new SourceRateLimitedError('benchlm', 'leaderboard', '3600', null, providerReset);
      },
    };
    const durable = storage({ [CYCLE_KEY]: {
      ...createBenchmarkCycle(SUNDAY, CYCLE_ID),
      phase: 'retrieve-benchlm',
      cursor: 0,
      frozenCatalogRevision: CATALOG_REVISION,
    } });
    durable.values.set(CHECKPOINT_KEY, acquireCheckpoint());
    const { env } = environment({ catalogRevision: CATALOG_REVISION });
    const { steps } = fakeSteps(overrides);

    await fireAlarm(durable, env, baseDeps(steps));

    const cycle = cycleOf(durable);
    expect(cycle.state).toBe('retry_wait');
    expect(cycle.attempt).toBe(1);
    expect(cycle.errorCode).toBe('rate_limited');
    expect(Date.parse(cycle.nextRetryAt as string)).toBe(providerReset + 5_000);
    expect(firstArtifactCalls).toBe(1);
    expect(durable.alarm).toBe(providerReset + 5_000);
  });

  it('fails the cycle after three attempts on the same source artifact', async () => {
    const overrides = {
      retrieveBenchLmArtifactStep: () => { throw new Error('upstream boom'); },
    };
    const durable = storage({ [CYCLE_KEY]: {
      ...createBenchmarkCycle(SUNDAY, CYCLE_ID),
      phase: 'retrieve-benchlm',
      cursor: 0,
      frozenCatalogRevision: CATALOG_REVISION,
    } });
    durable.values.set(CHECKPOINT_KEY, acquireCheckpoint());
    const { env } = environment({ catalogRevision: CATALOG_REVISION });
    const { steps, calls } = fakeSteps(overrides);

    nowMs = SUNDAY;
    await fireAlarm(durable, env, baseDeps(steps)); // attempt 1 -> retry_wait
    nowMs = Date.parse(cycleOf(durable).nextRetryAt as string) + 1;
    await fireAlarm(durable, env, baseDeps(steps)); // attempt 2 -> retry_wait
    nowMs = Date.parse(cycleOf(durable).nextRetryAt as string) + 1;
    await fireAlarm(durable, env, baseDeps(steps)); // attempt 3 -> failed

    const cycle = cycleOf(durable);
    expect(cycle.state).toBe('failed');
    expect(cycle.attempt).toBe(3);
    expect(calls.filter((call) => call.name === 'retrieveBenchLmArtifactStep')).toHaveLength(3);
    expect(durable.alarm).toBeNull();
  });

  it('expires a cycle past its 24-hour deadline over any retry', async () => {
    const cycle = createBenchmarkCycle(SUNDAY, CYCLE_ID);
    const durable = storage({ [CYCLE_KEY]: { ...cycle, phase: 'retrieve-benchlm', frozenCatalogRevision: CATALOG_REVISION } });
    durable.values.set(CHECKPOINT_KEY, acquireCheckpoint());
    const { env } = environment({ catalogRevision: CATALOG_REVISION });
    const { steps, calls } = fakeSteps();

    nowMs = Date.parse(cycle.expiresAt) + 1;
    await fireAlarm(durable, env, baseDeps(steps));

    expect(cycleOf(durable).state).toBe('expired');
    expect(calls).toEqual([]);
    expect(durable.alarm).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Resume, replay, logs
// ---------------------------------------------------------------------------

describe('resume, replay, and logging', () => {
  it('resumes the persisted cursor after coordinator reconstruction', async () => {
    nowMs = SUNDAY;
    const durable = storage({ [CYCLE_KEY]: {
      ...createBenchmarkCycle(SUNDAY, CYCLE_ID),
      phase: 'retrieve-benchlm',
      cursor: 3,
      frozenCatalogRevision: CATALOG_REVISION,
    } });
    const checkpoint = acquireCheckpoint();
    checkpoint.benchLm = [...Array(3)].map((_unused, i) => artifact(`benchlm/raw/a${i}/${i}.json`,
      ['leaderboard', 'models', 'pricing'][i]));
    durable.values.set(CHECKPOINT_KEY, checkpoint);
    const { env } = environment({ catalogRevision: CATALOG_REVISION });
    const { steps, calls } = fakeSteps();

    await fireAlarm(durable, env, baseDeps(steps));

    expect(calls).toHaveLength(1);
    expect(calls[0].args.artifact).toBe('comparisons');
    expect(cycleOf(durable).cursor).toBe(4);
  });

  it('replays a bounded step idempotently from the same snapshot', async () => {
    nowMs = SUNDAY;
    const snapshotCycle = {
      ...createBenchmarkCycle(SUNDAY, CYCLE_ID),
      phase: 'retrieve-benchlm' as const,
      cursor: 0,
      frozenCatalogRevision: CATALOG_REVISION,
    };
    const runOnce = async () => {
      const durable = storage({ [CYCLE_KEY]: { ...snapshotCycle } });
      durable.values.set(CHECKPOINT_KEY, acquireCheckpoint());
      const { env } = environment({ catalogRevision: CATALOG_REVISION });
      const { steps } = fakeSteps();
      await fireAlarm(durable, env, baseDeps(steps));
      return durable;
    };
    const a = await runOnce();
    const b = await runOnce();

    const cpA = a.values.get(CHECKPOINT_KEY) as { benchLm: CandidateArtifact[] };
    const cpB = b.values.get(CHECKPOINT_KEY) as { benchLm: CandidateArtifact[] };
    expect(cpA.benchLm).toEqual(cpB.benchLm);
    expect(cycleOf(a)).toEqual(cycleOf(b));
  });

  it('catches an alarm failure, persists a bounded code, and removes the alarm without leaking payloads', async () => {
    nowMs = SUNDAY;
    const durable = storage({ [CYCLE_KEY]: {
      ...createBenchmarkCycle(SUNDAY, CYCLE_ID),
      phase: 'assemble-benchlm',
      cursor: 0,
      frozenCatalogRevision: CATALOG_REVISION,
    } });
    durable.values.set(CHECKPOINT_KEY, {
      ...acquireCheckpoint(),
      benchLm: [...Array(6)].map((_unused, i) => artifact(`benchlm/raw/a${i}/${i}.json`,
        ['leaderboard', 'models', 'pricing', 'comparisons', 'benchmarks', 'public-leaderboard'][i])),
    });
    const { env, db } = environment({ catalogRevision: CATALOG_REVISION });
    const { steps } = fakeSteps({
      assembleBenchLmStep: () => { throw new Error('secret response body 0xdeadbeef'); },
    });

    await fireAlarm(durable, env, baseDeps(steps));

    const cycle = cycleOf(durable);
    expect(cycle.state).toBe('failed');
    expect(JSON.stringify(db.writes)).not.toContain('secret response body');
    expect(durable.alarm).toBeNull();
  });

  it('emits bounded structured logs without payloads or response bodies', async () => {
    nowMs = SUNDAY;
    const durable = storage({ [CYCLE_KEY]: createBenchmarkCycle(SUNDAY, CYCLE_ID) });
    const { env } = environment({ catalogRevision: CATALOG_REVISION });
    const records: Record<string, unknown>[] = [];
    const { steps } = fakeSteps();

    await fireAlarm(durable, env, baseDeps(steps, (record) => records.push(record)));

    expect(records.length).toBeGreaterThan(0);
    expect(JSON.stringify(records)).not.toMatch(/payload|response|body|secret/i);
    for (const record of records) {
      expect(record).toHaveProperty('event');
      expect(record).toHaveProperty('cycleId');
      expect(record).toHaveProperty('phase');
    }
  });
});

function acquireCheckpoint() {
  return {
    schemaVersion: 1 as const,
    cycleId: CYCLE_ID,
    observedAt: new Date(SUNDAY).toISOString(),
    frozenCatalogRevision: CATALOG_REVISION,
    frozenBenchmarkRevision: null,
    frozenOpenRouterCatalog: {
      revision: CATALOG_REVISION,
      sourceUrl: 'https://openrouter.ai/api/v1/models',
      observedAt: new Date(SUNDAY).toISOString(),
      snapshotKey: 'catalog/openrouter.json',
      contentHash: `sha256:${hex('catalog')}`,
      originalContentHash: `sha256:${hex('catalog-raw')}`,
    },
    validators: [] as unknown[],
    benchLm: [] as CandidateArtifact[],
    benchLmBundle: null as CandidatePartition | null,
    liteLlm: null as CandidateArtifact | null,
    lmArenaRevision: null as string | null,
    lmArena: [] as unknown[],
    lmArenaProgress: { subsetIndex: 0, offset: 0, declaredTotal: null, transport: 'dataset-viewer' as const, download: null, pageCount: 0 },
    normalizedPartitions: [] as CandidatePartition[],
    manifestContentHash: null as string | null,
    derived: null,
    cacheRevision: null,
  };
}
