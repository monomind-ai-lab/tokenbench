import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  modelPath,
  POPULAR_MODEL_LIMIT,
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
    // A slug that already carries valid percent escapes is passed through, so
    // one decodeURIComponent in the route handler returns the stored slug.
    expect(modelPath('model%20name')).toBe('/models/model%20name/');
  });

  describe('modelPath percent-encoded slugs', () => {
    it('does not re-encode a slug that already contains percent escapes', () => {
      // Directory slugs are built by sourceSpecificModelKey(), which already
      // encodeURIComponent()s the upstream model id. Encoding again produced
      // %252F and a live 404 for ~3,079 sitemap URLs.
      expect(modelPath('source-litellm-libertai%2Fgemma-4-31b-it'))
        .toBe('/models/source-litellm-libertai%2Fgemma-4-31b-it/');
    });

    it('emits the stored slug verbatim as the single route segment', () => {
      // The stored slug IS the wire form: /api/benchmarks/models/<slug> and
      // /models/<slug>/ both return 200 for this exact string in production.
      // Decoding it once yields the upstream id ("…1024-x-1024/dall-e-2"),
      // which is why the segment must not be encoded a second time.
      const stored = 'source-litellm-1024-x-1024%2Fdall-e-2';
      expect(modelPath(stored)).toBe(`/models/${stored}/`);
      expect(decodeURIComponent(stored)).toBe('source-litellm-1024-x-1024/dall-e-2');
    });

    it('still encodes a raw slug that has never been encoded', () => {
      expect(modelPath('claude fable')).toBe('/models/claude%20fable/');
    });

    it('still rejects a slug containing a literal path separator', () => {
      expect(() => modelPath('a/b')).toThrow('model slug must be one route segment');
    });
  });

  describe('modelPath against real production slug shapes', () => {
    // Sampled from benchmark_model_directory / the live sitemap on 2026-08-13.
    const productionSlugs = [
      'gemma-4-31b',
      'claude-fable',
      'source-litellm-bedrock_mantle%2Fgoogle.gemma-4-31b',
      'source-litellm-libertai%2Fgemma-4-31b-it',
      'source-litellm-1024-x-1024%2F50-steps%2Fbedrock%2Famazon.nova-canvas-v1%3A0',
      'source-openrouter-cohere%2Fnorth-mini-code%3Afree',
      'source-openrouter-google%2Flyria-3-pro-preview',
    ];

    it('emits the stored slug as the route segment for every shape', () => {
      for (const slug of productionSlugs) {
        expect(modelPath(slug)).toBe(`/models/${slug}/`);
      }
    });

    it('never emits a double-encoded escape', () => {
      for (const slug of productionSlugs) {
        expect(modelPath(slug)).not.toMatch(/%25[0-9A-Fa-f]{2}/u);
      }
    });
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

  it('keeps the weekly list at 100 even when a larger cohort is ingested', () => {
    // The ingested evidence cohort runs to the upstream ceiling (200), but the
    // weekly ranked list must stay inside the schema CHECK of 1..100.
    const cohort = Array.from({ length: 200 }, (_, index) => ({
      modelKey: `model-${index + 1}`,
      rank: index + 1,
    }));
    const selected = selectPopularModelRanks('2026-08-10T00:00:00.000Z', cohort);

    expect(selected).toHaveLength(POPULAR_MODEL_LIMIT);
    expect(POPULAR_MODEL_LIMIT).toBe(100);
    expect(Math.max(...selected.map((row) => row.rank))).toBe(100);
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
