import { describe, expect, it } from 'vitest';
import {
  BENCHMARK_CRON,
  BENCHMARK_FRESHNESS_WINDOW_MS,
  CATALOG_CRON,
  CATALOG_FRESHNESS_WINDOW_MS,
  benchmarkCadenceKey,
  catalogCadenceKey,
  cycleDue,
} from './cadence';

describe('cadence constants', () => {
  it('exports the exact cron schedules', () => {
    expect(CATALOG_CRON).toBe('20 0 * * *');
    expect(BENCHMARK_CRON).toBe('15 2 * * SUN');
  });

  it('exports the exact freshness windows', () => {
    expect(CATALOG_FRESHNESS_WINDOW_MS).toBe(36 * 60 * 60 * 1_000);
    expect(BENCHMARK_FRESHNESS_WINDOW_MS).toBe(8 * 24 * 60 * 60 * 1_000);
  });
});

describe('catalogCadenceKey', () => {
  it('derives the UTC calendar date key at the day boundary', () => {
    expect(catalogCadenceKey('2026-08-12T23:59:59.999Z')).toBe('2026-08-12');
    expect(catalogCadenceKey('2026-08-12T00:00:00.000Z')).toBe('2026-08-12');
  });

  it('pads month and day to two digits', () => {
    expect(catalogCadenceKey('2026-01-05T00:00:00.000Z')).toBe('2026-01-05');
    expect(catalogCadenceKey('2026-12-31T23:00:00.000Z')).toBe('2026-12-31');
  });
});

describe('benchmarkCadenceKey', () => {
  it('derives the Sunday-anchored weekly key at the boundary', () => {
    expect(benchmarkCadenceKey('2026-08-16T01:00:00.000Z')).toBe('2026-W33');
  });

  it('keeps every day of a Sunday-week under one key', () => {
    expect(benchmarkCadenceKey('2026-08-16T00:00:00.000Z')).toBe('2026-W33');
    expect(benchmarkCadenceKey('2026-08-22T23:59:59.999Z')).toBe('2026-W33');
  });

  it('numbers the first week of the year as W01', () => {
    expect(benchmarkCadenceKey('2026-01-05T00:00:00.000Z')).toBe('2026-W01');
  });
});

describe('cycleDue', () => {
  it('is due when there is no completed key or the next key is strictly newer', () => {
    expect(cycleDue(null, '2026-W33')).toBe(true);
    expect(cycleDue('2026-W32', '2026-W33')).toBe(true);
  });

  it('is not due for the same or an older key', () => {
    expect(cycleDue('2026-W33', '2026-W33')).toBe(false);
    expect(cycleDue('2026-W34', '2026-W33')).toBe(false);
  });
});
