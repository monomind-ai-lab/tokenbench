import { describe, expect, it } from 'vitest';
import type { ModelProfileSnapshotData } from '../../src/benchmarks/model-profile';
import {
  readDurableModelProfile,
  readModelDirectory,
  type ModelDirectoryQuery,
} from './model-directory-db';

const NOW = '2026-08-11T18:00:00.000Z';
const WEEK = '2026-08-10T00:00:00.000Z';

function profile(slug: string, revision = 'rev-2'): ModelProfileSnapshotData {
  return {
    identity: {
      modelKey: `benchlm:${slug}`,
      slug,
      displayName: slug === 'alpha' ? 'Alpha' : slug,
      creator: 'Provider',
      sourceType: 'Proprietary',
      reasoningType: null,
      familyId: null,
      variantId: null,
      releaseDate: null,
    },
    revision: {
      revision,
      generatedAt: NOW,
      publishedAt: NOW,
      checkedAt: NOW,
    },
    summary: {
      overallScore: 81.48,
      preferenceRating: null,
      overallRank: 4,
      evidenceStatus: 'supported',
      benchmarkCount: 2,
      coverage: { benchmarkCount: 2, categoryCount: 2, rankedCategoryCount: 2, sourceCount: 1 },
      generatedAt: NOW,
      publishedAt: NOW,
      checkedAt: NOW,
      strongestEvidence: 'Public overall score 81.48 at source rank #4.',
      validateBeforeChoosing: 'Validate current route pricing before choosing.',
    },
    radar: [
      { key: 'overall', label: 'Overall', percentile: 90, rank: 4, fieldSize: 31 },
      { key: 'coding', label: 'Coding', percentile: 93.33, rank: 3, fieldSize: 31 },
    ],
    categories: [
      {
        key: 'overall', metricKey: 'benchlm:overall:raw', label: 'Overall', score: 81.48,
        rawScore: 81, rank: 4, fieldSize: 31, percentile: 90, evidenceStatus: 'supported',
        benchmarkCount: 2, rankingEligible: true, unit: 'score', sourceId: 'benchlm',
      },
      {
        key: 'coding', metricKey: 'benchlm:category:coding', label: 'Coding', score: 77.95,
        rawScore: null, rank: 3, fieldSize: 31, percentile: 93.33, evidenceStatus: 'supported',
        benchmarkCount: 2, rankingEligible: true, unit: 'score', sourceId: 'benchlm',
      },
    ],
    priceRoutes: [{
      sourceId: 'openrouter', providerId: 'openai', routeId: `openrouter:${slug}`,
      sourceModelId: `provider/${slug}`, canonicalSlug: slug, inputUsdPerMillion: 1,
      cachedInputUsdPerMillion: null, cacheWriteUsdPerMillion: null, outputUsdPerMillion: 4, contextWindowTokens: 128_000,
      maxInputTokens: null, maxOutputTokens: 16_000, inputModalities: ['text'],
      outputModalities: ['text'], supportedParameters: ['tools'], createdAt: null, expirationDate: null,
      knowledgeCutoff: null, tokenizer: null, instructionFormat: null, isModerated: null,
      perRequestLimitsJson: null, verificationStatus: 'primary',
      sourceArtifactId: 'openrouter-models', sourceUrl: 'https://openrouter.ai/models', observedAt: NOW,
    }],
    specifications: {
      contextWindowTokens: 128_000, maxInputTokens: null, maxOutputTokens: 16_000,
      inputModalities: ['text'], outputModalities: ['text'], supportedParameters: ['tools'],
      releaseDate: null, sourceType: 'Proprietary', selfHostingAvailable: null,
    },
    ledger: [{
      metricKey: 'benchlm:overall:raw', category: 'overall', benchmarkName: 'Overall',
      displayValue: 81.48, rawValue: 81, unit: 'score', rank: 4,
      bestVerifiedComparison: null, gap: null, weight: null, evidenceStatus: 'supported',
      observedAt: NOW, sourceId: 'benchlm', sourceArtifactId: 'benchlm-models',
      sourceUrl: 'https://benchlm.ai/leaderboard',
    }],
    comparisons: [],
    sources: [{
      sourceId: 'benchlm', artifactId: 'benchlm-models', sourceUrl: 'https://benchlm.ai/leaderboard',
      observedAt: NOW, attributionText: 'BenchLM public leaderboard',
    }],
  };
}

function directoryRow(slug: string, status: 'current' | 'archived' = 'current') {
  return {
    model_key: `benchlm:${slug}`,
    canonical_slug: slug,
    display_name: slug === 'alpha' ? 'Alpha' : slug,
    creator: 'Provider',
    source_type: 'Proprietary',
    reasoning_type: null,
    family_id: null,
    variant_id: null,
    first_seen_revision: 'rev-1',
    first_seen_at: NOW,
    last_seen_revision: status === 'current' ? 'rev-2' : 'rev-1',
    last_seen_at: NOW,
    latest_profile_revision: slug === 'alpha' ? 'rev-3' : 'rev-2',
    status,
    source_id: 'benchlm',
    source_model_id: `provider/${slug}`,
    updated_at: NOW,
    weekly_rank: slug === 'alpha' ? 1 : null,
  };
}

function database() {
  const currentRows = Array.from({ length: 100 }, (_, index) => directoryRow(index === 0 ? 'alpha' : `model-${index + 1}`));
  const retained = directoryRow('retained-fixture', 'archived');
  const snapshots = [
    ...currentRows.map((row) => ({
      model_key: row.model_key,
      revision: 'rev-2',
      profile_json: JSON.stringify(profile(row.canonical_slug)),
      generated_at: NOW,
      profile_order: 1,
    })),
    {
      model_key: retained.model_key,
      revision: 'rev-2',
      profile_json: JSON.stringify(profile(retained.canonical_slug)),
      generated_at: NOW,
      profile_order: 1,
    },
  ];
  return {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async all() {
              if (sql.includes('benchmark_popular_model_weeks')) {
                return { results: [{
                  week_start: WEEK,
                  benchmark_revision: 'rev-2',
                  source_snapshot_id: 'benchlm-public',
                  methodology_version: 'bench-align-v5',
                  generated_at: NOW,
                }] };
              }
              if (sql.includes('COUNT(*) AS size')) {
                return { results: [{ size: currentRows.length }] };
              }
              if (sql.includes('benchmark_model_slug_aliases')) {
                const alias = values[0];
                return { results: alias === 'old-alpha' ? [{ model_key: 'benchlm:alpha' }] : [] };
              }
              if (sql.includes('benchmark_model_directory')) {
                if (sql.includes('canonical_slug = ?')) {
                  const slug = values[0];
                  const row = [...currentRows, retained].find((candidate) => candidate.canonical_slug === slug);
                  return { results: row ? [row] : [] };
                }
                if (sql.includes('model_key = ?')) {
                  const modelKey = values[0];
                  const row = [...currentRows, retained].find((candidate) => candidate.model_key === modelKey);
                  return { results: row ? [row] : [] };
                }
                if (values.includes('archived')) return { results: [retained] };
                return { results: currentRows };
              }
              if (sql.includes('benchmark_model_profile_snapshots')) {
                if (values.includes('benchlm:alpha') && sql.includes('CASE WHEN revision')) {
                  return { results: [
                    { model_key: 'benchlm:alpha', revision: 'rev-3', profile_json: '{bad-json', generated_at: NOW },
                    { model_key: 'benchlm:alpha', revision: 'rev-2', profile_json: JSON.stringify(profile('alpha')), generated_at: NOW },
                  ] };
                }
                return { results: snapshots };
              }
              throw new Error(`Unexpected query: ${sql}`);
            },
          };
        },
      };
    },
  };
}

const DEFAULT_QUERY: ModelDirectoryQuery = {
  q: '', creator: null, sourceType: null, evidenceStatus: null,
  status: 'current', limit: 100, cursor: null,
};

describe('durable model directory reads', () => {
  it('names the cohort it served, so a null cursor is not read as "this is everything"', async () => {
    const db = database();

    // The unfiltered default is served from the curated weekly ranks. Its cursor
    // correctly goes null at the cohort's last row, which is indistinguishable
    // from the end of the catalogue unless the response says which it returned.
    const weekly = await readModelDirectory(db, DEFAULT_QUERY);
    expect(weekly.data.cohort).toMatchObject({ kind: 'weekly-popular', catalogueQuery: 'status=all' });
    expect(weekly.data.cohort.size).toBe(weekly.data.models.length);

    // Any request that leaves the curated cohort must say so, so a client can
    // tell a curated subset from the full directory without inferring it.
    for (const query of [
      { ...DEFAULT_QUERY, status: 'all' as const },
      { ...DEFAULT_QUERY, q: 'alpha' },
      { ...DEFAULT_QUERY, sourceType: 'Open Weight' as const },
    ]) {
      const result = await readModelDirectory(db, query);
      expect(result.data.cohort.kind).toBe('catalogue');
      expect(result.data.cohort.catalogueQuery).toBeNull();
    }
  });

  it('returns the current weekly top 100 while searching retained archived records', async () => {
    const db = database();
    const weekly = await readModelDirectory(db, DEFAULT_QUERY);
    expect(weekly.data.models).toHaveLength(100);
    expect(weekly.data.models[0]).toMatchObject({
      canonicalSlug: 'alpha',
      weeklyRank: 1,
      overallScore: 81.48,
      categories: profile('alpha').categories,
      strongestCategory: profile('alpha').categories[1],
    });

    const archived = await readModelDirectory(db, {
      ...DEFAULT_QUERY,
      q: 'retained-fixture',
      status: 'archived',
    });
    expect(archived.data.models[0]).toMatchObject({
      canonicalSlug: 'retained-fixture',
      status: 'archived',
      weeklyRank: null,
    });
  });

  it('falls back from malformed latest JSON to the prior valid profile', async () => {
    const result = await readDurableModelProfile(database(), 'alpha');
    expect(result).toMatchObject({ selectedRevision: 'rev-2', fallback: 'prior-profile' });
    expect(result?.profile.identity.slug).toBe('alpha');
  });

  it('resolves aliases without inventing records and returns null for unknown slugs', async () => {
    const alias = await readDurableModelProfile(database(), 'old-alpha');
    expect(alias).toMatchObject({ aliasFrom: 'old-alpha', directory: { canonicalSlug: 'alpha' } });
    await expect(readDurableModelProfile(database(), 'not-present')).resolves.toBeNull();
  });
});
