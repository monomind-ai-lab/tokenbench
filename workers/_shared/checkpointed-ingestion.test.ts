import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
