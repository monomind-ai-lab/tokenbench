import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { IngestionCycle, IngestionStepReceipt } from './checkpointed-ingestion';
import {
  RETRY_BACKOFF_DELAYS_MS,
  assertCycleTransition,
  nextRetryAlarmAt,
  providerRetryAt,
} from './checkpointed-ingestion';

const NOW = Date.parse('2026-08-12T00:00:00.000Z');
const CYCLE_STATES = ['idle', 'running', 'retry_wait', 'ready_to_publish', 'published', 'failed', 'expired'] as const;

describe('providerRetryAt', () => {
  it('parses Retry-After as delta seconds (boundary)', () => {
    const retry = new Headers({ 'Retry-After': '3600' });
    expect(providerRetryAt(retry, NOW)).toBe(Date.parse('2026-08-12T01:00:00.000Z'));
  });

  it('parses Retry-After as an HTTP-date in the future', () => {
    const retry = new Headers({ 'Retry-After': 'Wed, 12 Aug 2026 00:05:00 GMT' });
    expect(providerRetryAt(retry, NOW)).toBe(Date.parse('2026-08-12T00:05:00.000Z'));
  });

  it('returns null for malformed, negative, or past Retry-After values', () => {
    expect(providerRetryAt(new Headers({ 'Retry-After': 'abc' }), NOW)).toBeNull();
    expect(providerRetryAt(new Headers({ 'Retry-After': '-5' }), NOW)).toBeNull();
    expect(providerRetryAt(new Headers({ 'Retry-After': 'Tue, 11 Aug 2026 00:00:00 GMT' }), NOW)).toBeNull();
    expect(providerRetryAt(new Headers({}), NOW)).toBeNull();
  });

  it('parses the Hugging Face RateLimit reset t= epoch-seconds token', () => {
    const resetSeconds = Math.floor(NOW / 1000) + 600;
    const headers = new Headers({ 'RateLimit': `limit=5000, remaining=0, resets_at=${resetSeconds}, t=${resetSeconds}` });
    expect(providerRetryAt(headers, NOW)).toBe(resetSeconds * 1000);
  });

  it('returns null for a non-future or missing RateLimit t= token', () => {
    const pastSeconds = Math.floor(NOW / 1000) - 60;
    expect(providerRetryAt(new Headers({ 'RateLimit': `t=${pastSeconds}` }), NOW)).toBeNull();
    expect(providerRetryAt(new Headers({ 'RateLimit': 'limit=5' }), NOW)).toBeNull();
    expect(providerRetryAt(new Headers({ 'RateLimit': 't=abc' }), NOW)).toBeNull();
  });

  it('applies no ten-second cap to a long provider reset', () => {
    const headers = new Headers({ 'Retry-After': '7200' });
    expect(providerRetryAt(headers, NOW)).toBe(NOW + 7_200_000);
  });
});

describe('nextRetryAlarmAt', () => {
  it('retains the approved progressive fallback schedule', () => {
    expect(RETRY_BACKOFF_DELAYS_MS).toEqual([60_000, 300_000, 1_800_000]);
  });

  it('returns the later of fallback and provider reset, plus validated jitter (boundary)', () => {
    expect(nextRetryAlarmAt({ attempt: 1, nowMs: 0, providerRetryAtMs: 3_600_000, jitterMs: 5_000 }))
      .toBe(3_605_000);
  });

  it('schedules retries only after attempts one and two, for three total requests', () => {
    expect(nextRetryAlarmAt({ attempt: 1, nowMs: 0, providerRetryAtMs: null, jitterMs: 0 })).toBe(60_000);
    expect(nextRetryAlarmAt({ attempt: 2, nowMs: 0, providerRetryAtMs: null, jitterMs: 0 })).toBe(300_000);
    expect(() => nextRetryAlarmAt({ attempt: 3, nowMs: 0, providerRetryAtMs: null, jitterMs: 0 }))
      .toThrow('attempt limit');
    expect(() => nextRetryAlarmAt({ attempt: 4, nowMs: 0, providerRetryAtMs: null, jitterMs: 0 }))
      .toThrow('attempt limit');
  });

  it('rejects a non-positive consumed-attempt count', () => {
    expect(() => nextRetryAlarmAt({ attempt: 0, nowMs: 0, providerRetryAtMs: null, jitterMs: 0 }))
      .toThrow('attempt limit');
  });

  it('treats an earlier provider reset as irrelevant', () => {
    expect(nextRetryAlarmAt({ attempt: 1, nowMs: 1_000, providerRetryAtMs: 2_000, jitterMs: 0 }))
      .toBe(61_000);
  });

  it('rejects jitter outside the required zero-to-fifteen-second band', () => {
    for (const jitterMs of [-1, 15_001, Number.POSITIVE_INFINITY, Number.NaN]) {
      expect(() => nextRetryAlarmAt({ attempt: 1, nowMs: 0, providerRetryAtMs: null, jitterMs }))
        .toThrow('jitter');
    }
  });

  it('accepts jitter at both bounds', () => {
    expect(nextRetryAlarmAt({ attempt: 1, nowMs: 1_000, providerRetryAtMs: 2_000, jitterMs: 15_000 }))
      .toBe(76_000);
    expect(nextRetryAlarmAt({ attempt: 1, nowMs: 1_000, providerRetryAtMs: 2_000, jitterMs: 0 }))
      .toBe(61_000);
  });
});

describe('assertCycleTransition', () => {
  it('accepts the legal transitions', () => {
    expect(() => assertCycleTransition('idle', 'running')).not.toThrow();
    expect(() => assertCycleTransition('running', 'running')).not.toThrow();
    expect(() => assertCycleTransition('running', 'retry_wait')).not.toThrow();
    expect(() => assertCycleTransition('retry_wait', 'running')).not.toThrow();
    expect(() => assertCycleTransition('running', 'ready_to_publish')).not.toThrow();
    expect(() => assertCycleTransition('ready_to_publish', 'published')).not.toThrow();
    expect(() => assertCycleTransition('idle', 'expired')).not.toThrow();
    expect(() => assertCycleTransition('failed', 'expired')).not.toThrow();
  });

  it('accepts same-state no-ops for replayed persisted states', () => {
    for (const state of CYCLE_STATES) {
      expect(() => assertCycleTransition(state, state)).not.toThrow();
    }
  });

  it('rejects illegal cross-state transitions', () => {
    expect(() => assertCycleTransition('idle', 'published')).toThrow(/illegal cycle transition/);
    expect(() => assertCycleTransition('idle', 'ready_to_publish')).toThrow();
    expect(() => assertCycleTransition('running', 'published')).toThrow();
    expect(() => assertCycleTransition('published', 'running')).toThrow();
    expect(() => assertCycleTransition('published', 'ready_to_publish')).toThrow();
    expect(() => assertCycleTransition('failed', 'running')).toThrow();
    expect(() => assertCycleTransition('expired', 'running')).toThrow();
  });
});

describe('ingestion receipt migration', () => {
  const migration = readFileSync(
    resolve(process.cwd(), 'migrations/0010_ingestion_cycles.sql'),
    'utf8',
  );

  function migratedDatabase(): DatabaseSync {
    const database = new DatabaseSync(':memory:');
    database.exec('PRAGMA foreign_keys = ON');
    database.exec(migration);
    return database;
  }

  interface CycleFixture {
    scope: string;
    cycleId: string;
    cadenceKey: string;
    state: string;
    phase: string;
    cursor: number;
    attempt: number;
    startedAt: string;
    updatedAt: string;
    expiresAt: string;
  }

  const validCycle: CycleFixture = {
    scope: 'catalog',
    cycleId: 'cycle-valid',
    cadenceKey: '2026-08-12',
    state: 'running',
    phase: 'acquire',
    cursor: 0,
    attempt: 0,
    startedAt: '2026-08-12T00:00:00.000Z',
    updatedAt: '2026-08-12T00:00:00.000Z',
    expiresAt: '2026-08-12T12:00:00.000Z',
  };

  function insertCycle(database: DatabaseSync, overrides: Partial<CycleFixture> = {}): void {
    const cycle = { ...validCycle, ...overrides };
    database.prepare(`
      INSERT INTO ingestion_cycles (
        scope, cycle_id, cadence_key, state, phase, cursor, attempt,
        started_at, updated_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      cycle.scope,
      cycle.cycleId,
      cycle.cadenceKey,
      cycle.state,
      cycle.phase,
      cycle.cursor,
      cycle.attempt,
      cycle.startedAt,
      cycle.updatedAt,
      cycle.expiresAt,
    );
  }

  it('defines both shared receipt tables and the composite cascade', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS ingestion_cycles');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS ingestion_cycle_steps');
    expect(migration).toContain('PRIMARY KEY (scope, cycle_id)');
    expect(migration).toContain(
      'FOREIGN KEY (scope, cycle_id) REFERENCES ingestion_cycles(scope, cycle_id) ON DELETE CASCADE',
    );
  });

  it('uses the approved cycle and step attempt bounds', () => {
    expect(migration).toContain(
      'attempt INTEGER NOT NULL CHECK (attempt BETWEEN 0 AND 3)',
    );
    expect(migration).toContain(
      'attempt INTEGER NOT NULL CHECK (attempt BETWEEN 1 AND 3)',
    );
    expect(migration).not.toContain('[PERSON_NAME]');
  });

  it('defines the cadence and expiration lookup indexes', () => {
    expect(migration).toContain('ingestion_cycles_scope_cadence_state_idx');
    expect(migration).toContain('(scope, cadence_key, state, updated_at DESC)');
    expect(migration).toContain('ingestion_cycles_scope_state_expires_idx');
    expect(migration).toContain('(scope, state, expires_at)');
  });

  it('applies both receipt tables with every required column and index', () => {
    using database = migratedDatabase();
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all())
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'ingestion_cycles' }),
        expect.objectContaining({ name: 'ingestion_cycle_steps' }),
      ]));

    expect(database.prepare('PRAGMA table_info(ingestion_cycles)').all().map((row) => row.name))
      .toEqual(expect.arrayContaining([
        'scope', 'cycle_id', 'cadence_key', 'state', 'phase', 'cursor', 'attempt',
        'frozen_catalog_revision', 'frozen_benchmark_revision', 'manifest_key',
        'started_at', 'updated_at', 'completed_at', 'expires_at', 'next_retry_at',
        'final_revision', 'result_json', 'error_code', 'error_source_id',
        'error_artifact_id',
      ]));
    expect(database.prepare('PRAGMA table_info(ingestion_cycle_steps)').all().map((row) => row.name))
      .toEqual(expect.arrayContaining([
        'scope', 'cycle_id', 'phase', 'cursor', 'status', 'attempt', 'started_at',
        'completed_at', 'output_count', 'error_code',
      ]));
    expect(database.prepare('PRAGMA index_list(ingestion_cycles)').all().map((row) => row.name))
      .toEqual(expect.arrayContaining([
        'ingestion_cycles_scope_cadence_state_idx',
        'ingestion_cycles_scope_state_expires_idx',
      ]));
  });

  it('enforces cycle scope, state, cursor, attempt, and result-json constraints', () => {
    using database = migratedDatabase();
    for (const overrides of [
      { scope: 'unknown' },
      { state: 'unknown' },
      { cursor: -1 },
      { attempt: -1 },
      { attempt: 4 },
    ]) {
      expect(() => insertCycle(database, {
        ...overrides,
        cycleId: `invalid-${String(Object.values(overrides)[0])}`,
      })).toThrow();
    }

    insertCycle(database);
    expect(() => database.prepare(
      "UPDATE ingestion_cycles SET result_json = 'not-json' WHERE cycle_id = ?",
    ).run(validCycle.cycleId)).toThrow();
    expect(() => database.prepare(
      'UPDATE ingestion_cycles SET result_json = ? WHERE cycle_id = ?',
    ).run(JSON.stringify({ payload: 'x'.repeat(65_536) }), validCycle.cycleId)).toThrow();
  });

  it('enforces step status, attempt, output count, and composite cascade', () => {
    using database = migratedDatabase();
    insertCycle(database);
    const insertStep = database.prepare(`
      INSERT INTO ingestion_cycle_steps (
        scope, cycle_id, phase, cursor, status, attempt, started_at, output_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    expect(() => insertStep.run('catalog', validCycle.cycleId, 'acquire', 0, 'unknown', 1, validCycle.startedAt, 0))
      .toThrow();
    expect(() => insertStep.run('catalog', validCycle.cycleId, 'acquire', 0, 'running', 0, validCycle.startedAt, 0))
      .toThrow();
    expect(() => insertStep.run('catalog', validCycle.cycleId, 'acquire', 0, 'running', 4, validCycle.startedAt, 0))
      .toThrow();
    expect(() => insertStep.run('catalog', validCycle.cycleId, 'acquire', 0, 'running', 1, validCycle.startedAt, -1))
      .toThrow();
    expect(() => insertStep.run('benchmarks', validCycle.cycleId, 'acquire', 0, 'running', 1, validCycle.startedAt, 0))
      .toThrow();

    insertStep.run('catalog', validCycle.cycleId, 'acquire', 0, 'completed', 1, validCycle.startedAt, 1);
    database.prepare('DELETE FROM ingestion_cycles WHERE scope = ? AND cycle_id = ?')
      .run('catalog', validCycle.cycleId);
    expect(database.prepare('SELECT COUNT(*) AS count FROM ingestion_cycle_steps').get())
      .toEqual(expect.objectContaining({ count: 0 }));
  });
});

describe('shared cycle and receipt contracts', () => {
  const cycle: IngestionCycle = {
    schemaVersion: 1,
    scope: 'catalog',
    cycleId: 'cycle-1',
    cadenceKey: '2026-08-12',
    state: 'running',
    phase: 'acquire',
    cursor: 0,
    attempt: 1,
    startedAt: '2026-08-12T00:00:00.000Z',
    updatedAt: '2026-08-12T00:00:00.000Z',
    expiresAt: '2026-08-12T12:00:00.000Z',
    nextRetryAt: null,
    frozenCatalogRevision: null,
    frozenBenchmarkRevision: null,
    manifestKey: null,
    finalRevision: null,
    errorCode: null,
    errorSourceId: null,
    errorArtifactId: null,
  };

  const receipt: IngestionStepReceipt = {
    scope: 'catalog',
    cycleId: 'cycle-1',
    phase: 'acquire',
    cursor: 0,
    status: 'completed',
    attempt: 1,
    startedAt: '2026-08-12T00:00:00.000Z',
    completedAt: '2026-08-12T00:00:01.000Z',
    outputCount: 42,
    errorCode: null,
  };

  it('exposes the immutable shared contract shapes', () => {
    expect(cycle.schemaVersion).toBe(1);
    expect(receipt.status).toBe('completed');
  });
});
