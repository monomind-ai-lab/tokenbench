import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  modelPath,
  selectPopularModelRanks,
  weekStartUtc,
} from './model-directory';

describe('model directory contracts', () => {
  it.each([
    ['2026-08-10T00:00:00.000Z', '2026-08-10T00:00:00.000Z'],
    ['2026-08-16T23:59:59.999Z', '2026-08-10T00:00:00.000Z'],
    ['2026-08-17T00:00:00.000Z', '2026-08-17T00:00:00.000Z'],
  ])('maps %s to UTC week %s', (value, expected) => {
    expect(weekStartUtc(value)).toBe(expected);
  });

  it('builds one-segment canonical model paths', () => {
    expect(modelPath('gpt-5-6-sol')).toBe('/models/gpt-5-6-sol/');
    expect(modelPath('model%20name')).toBe('/models/model%2520name/');
  });

  it('rejects unsafe model route slugs', () => {
    expect(() => modelPath('unsafe/slug')).toThrow('model slug must be one route segment');
    expect(() => modelPath('')).toThrow('model slug must be one route segment');
    expect(() => modelPath('..')).toThrow('model slug must be one route segment');
  });

  it('keeps unique model and rank rows within the weekly top 100', () => {
    expect(selectPopularModelRanks('2026-08-10T00:00:00.000Z', [
      { modelKey: 'bravo', rank: 2 },
      { modelKey: 'alpha', rank: 1 },
      { modelKey: 'alpha', rank: 3 },
      { modelKey: 'duplicate-rank', rank: 1 },
      { modelKey: 'out-of-range', rank: 101 },
    ])).toEqual([
      { weekStart: '2026-08-10T00:00:00.000Z', rank: 1, modelKey: 'alpha' },
      { weekStart: '2026-08-10T00:00:00.000Z', rank: 2, modelKey: 'bravo' },
    ]);
  });

  it('defines durable directory, profile, membership, alias, and weekly rank tables', () => {
    const migration = readFileSync(resolve(process.cwd(), 'migrations/0009_model_directory.sql'), 'utf8');
    for (const table of [
      'benchmark_model_directory',
      'benchmark_model_profile_snapshots',
      'benchmark_model_revision_membership',
      'benchmark_model_slug_aliases',
      'benchmark_popular_model_weeks',
      'benchmark_popular_model_ranks',
    ]) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(migration).toContain('length(CAST(profile_json AS BLOB)) <= 524288');
    expect(migration).toContain("status IN ('current', 'archived')");
    expect(migration).toContain('rank BETWEEN 1 AND 100');
    expect(migration).toContain('idx_benchmark_model_directory_status_creator_source');
    expect(migration).toContain('idx_benchmark_model_directory_sitemap');
  });
});
