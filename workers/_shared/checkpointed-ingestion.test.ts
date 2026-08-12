import { describe, expect, it } from 'vitest';
import type { IngestionCycle, IngestionStepReceipt } from './checkpointed-ingestion';
import {
  assertCycleTransition,
  nextRetryAlarmAt,
  providerRetryAt,
} from './checkpointed-ingestion';

const NOW = Date.parse('2026-08-12T00:00:00.000Z');

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
  it('returns the later of fallback and provider reset, plus injected jitter (boundary)', () => {
    expect(nextRetryAlarmAt({ attempt: 1, nowMs: 0, providerRetryAtMs: 3_600_000, jitterMs: 5_000 }))
      .toBe(3_605_000);
  });

  it('uses 1/5/30-minute fallbacks and rejects at the three-attempt cap', () => {
    expect(nextRetryAlarmAt({ attempt: 0, nowMs: 0, providerRetryAtMs: null, jitterMs: 0 })).toBe(60_000);
    expect(nextRetryAlarmAt({ attempt: 1, nowMs: 0, providerRetryAtMs: null, jitterMs: 0 })).toBe(300_000);
    expect(nextRetryAlarmAt({ attempt: 2, nowMs: 0, providerRetryAtMs: null, jitterMs: 0 })).toBe(1_800_000);
    expect(() => nextRetryAlarmAt({ attempt: 3, nowMs: 0, providerRetryAtMs: null, jitterMs: 0 }))
      .toThrow('attempt limit');
    expect(() => nextRetryAlarmAt({ attempt: 4, nowMs: 0, providerRetryAtMs: null, jitterMs: 0 }))
      .toThrow('attempt limit');
  });

  it('treats an earlier provider reset as irrelevant and bounds jitter to 0-15s', () => {
    expect(nextRetryAlarmAt({ attempt: 0, nowMs: 1_000, providerRetryAtMs: 2_000, jitterMs: 0 }))
      .toBe(61_000);
    expect(nextRetryAlarmAt({ attempt: 0, nowMs: 1_000, providerRetryAtMs: 2_000, jitterMs: 15_000 }))
      .toBe(76_000);
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

  it('rejects illegal transitions', () => {
    expect(() => assertCycleTransition('idle', 'published')).toThrow(/illegal cycle transition/);
    expect(() => assertCycleTransition('idle', 'ready_to_publish')).toThrow();
    expect(() => assertCycleTransition('running', 'published')).toThrow();
    expect(() => assertCycleTransition('published', 'running')).toThrow();
    expect(() => assertCycleTransition('published', 'ready_to_publish')).toThrow();
    expect(() => assertCycleTransition('failed', 'running')).toThrow();
    expect(() => assertCycleTransition('expired', 'running')).toThrow();
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
