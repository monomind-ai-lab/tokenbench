import { describe, expect, it } from 'vitest';
import type { CachedLeaderboardPaginationProjection } from '../../src/benchmarks/api-projections';
import { LEADERBOARD_DEFINITIONS, type LeaderboardEntry } from '../../src/benchmarks/leaderboards';
import {
  parseCompleteLeaderboardProjection,
  readCompleteLeaderboardProjection,
} from './benchmark-leaderboard-projection';

const REVISION = 'benchmark-revision-1';
const CHECKED_AT = '2026-08-06T00:00:00.000Z';
const PUBLISHED_AT = '2026-08-06T00:05:00.000Z';

function entry(): LeaderboardEntry {
  const metric = {
    modelKey: 'alpha',
    metricKey: 'benchlm:category:coding',
    category: 'coding',
    value: 90,
    rawValue: null,
    rank: null,
    lower: null,
    upper: null,
    voteCount: null,
    unit: 'score' as const,
    sourceId: 'benchlm' as const,
    sourceUpdatedAt: CHECKED_AT,
    sourceModelId: 'alpha',
    sourceArtifactId: 'benchlm-coding',
    rankingEligible: true,
    methodology: 'benchlm_raw_composite' as const,
    observationCount: null,
    sessionCount: null,
  };
  return {
    model: {
      modelKey: 'alpha',
      slug: 'alpha',
      name: 'Alpha',
      creator: 'Provider A',
      sourceType: 'Proprietary',
      reasoningType: null,
      releaseDate: null,
      contextWindowTokens: 128_000,
      evidenceStatus: 'supported',
      rankingEligible: true,
      confidenceLower: null,
      confidenceUpper: null,
      benchmarkCount: 1,
      sourceId: 'benchlm',
      sourceModelId: 'alpha',
      sourceArtifactId: 'benchlm-models',
    },
    metric,
    metrics: [metric],
    primaryPrice: {
      modelKey: 'alpha',
      sourceId: 'openrouter',
      providerId: 'openrouter',
      inputUsdPerMillion: 1,
      cachedInputUsdPerMillion: null,
      outputUsdPerMillion: 5,
      contextWindowTokens: 128_000,
      verificationStatus: 'primary',
      routeId: 'openrouter:alpha',
      sourceModelId: 'alpha',
      canonicalSlug: 'alpha',
      maxInputTokens: null,
      maxOutputTokens: null,
      inputModalities: ['text'],
      outputModalities: ['text'],
      supportedParameters: null,
      sourceArtifactId: 'openrouter-models',
    },
    blendedCostPerMillion: 3,
    contextWindowTokens: 128_000,
    sourceRank: null,
    onValueFrontier: false,
  };
}

function source(sourceId: 'benchlm' | 'openrouter', artifactId: string) {
  return {
    sourceId,
    artifactId,
    sourceUrl: sourceId === 'benchlm' ? 'https://benchlm.ai/data' : 'https://openrouter.ai/models',
    observedAt: CHECKED_AT,
    etag: null,
    lastModified: null,
    upstreamRevision: null,
    schemaVersion: 'v1',
    snapshotKey: `snapshots/${artifactId}.json`,
    contentHash: `sha256:${'a'.repeat(64)}`,
    originalContentHash: `sha256:${'b'.repeat(64)}`,
    licenseId: sourceId === 'benchlm' ? 'MIT' as const : 'OpenRouter-ToS' as const,
    attributionText: sourceId === 'benchlm' ? 'Data from BenchLM.ai' : 'Catalog and pricing data from OpenRouter',
  };
}

function projection(): CachedLeaderboardPaginationProjection {
  const rows = [entry()];
  return {
    revision: {
      revision: REVISION,
      generatedAt: CHECKED_AT,
      publishedAt: PUBLISHED_AT,
      checkedAt: CHECKED_AT,
      publicationState: 'published',
      contentHash: `sha256:${'c'.repeat(64)}`,
      catalogRevision: 'catalog-revision-1',
      openrouterContentHash: `sha256:${'d'.repeat(64)}`,
    },
    sources: [
      source('benchlm', 'benchlm-models'),
      source('benchlm', 'benchlm-coding'),
      source('openrouter', 'openrouter-models'),
    ],
    leaderboard: {
      key: 'llm-coding',
      profile: 'balanced',
      definition: LEADERBOARD_DEFINITIONS['llm-coding'],
      entries: rows,
    },
    entries: rows,
  };
}

function projectionWithEntries(entries: readonly LeaderboardEntry[]): CachedLeaderboardPaginationProjection {
  const base = projection();
  return {
    ...base,
    leaderboard: { ...base.leaderboard, entries },
    entries,
  };
}

function projectionBodyWithSources(sources: readonly unknown[]): string {
  return JSON.stringify({ ...projection(), sources });
}

function entryWithIdentity(index: number): LeaderboardEntry {
  const fixture = entry();
  const modelKey = `model-${String(index).padStart(4, '0')}`;
  const metric = { ...fixture.metric!, modelKey, sourceModelId: modelKey };
  return {
    ...fixture,
    model: {
      ...fixture.model,
      modelKey,
      slug: modelKey,
      name: `Model ${index}`,
      sourceModelId: modelKey,
    },
    metric,
    metrics: [metric],
    primaryPrice: {
      ...fixture.primaryPrice!,
      modelKey,
      routeId: `openrouter:${modelKey}`,
      sourceModelId: modelKey,
    },
  };
}

function estimatedEntry(modelKey: string): LeaderboardEntry {
  const fixture = entry();
  const metric = {
    ...fixture.metric!,
    modelKey,
    sourceModelId: modelKey,
    rankingEligible: false,
  };
  return {
    ...fixture,
    model: {
      ...fixture.model,
      modelKey,
      slug: modelKey,
      name: modelKey,
      sourceModelId: modelKey,
      evidenceStatus: 'estimated',
      rankingEligible: false,
    },
    metric,
    metrics: [metric],
    primaryPrice: null,
    blendedCostPerMillion: null,
    sourceRank: null,
    onValueFrontier: false,
  };
}

interface CacheFixture {
  readonly fresh?: string;
  readonly stale?: string;
  readonly cacheRevision?: string;
}

function cacheDatabase(bodies: CacheFixture) {
  const calls: Array<{ readonly sql: string; readonly values: readonly unknown[] }> = [];
  return {
    calls,
    db: {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            calls.push({ sql, values });
            return {
              all: async () => {
                const cutoff = values[2];
                const useFresh = typeof cutoff === 'string' && cutoff <= CHECKED_AT;
                const variant = useFresh ? 'fresh' : 'stale';
                const body = bodies[variant];
                return {
                  results: body === undefined ? [] : [{
                    revision: bodies.cacheRevision ?? REVISION,
                    variant,
                    chunk_index: 0,
                    etag: `"${variant}-projection"`,
                    body,
                  }],
                };
              },
            };
          },
        };
      },
    },
  };
}

describe('complete leaderboard projection cache reader', () => {
  it('reads the complete active projection once without scanning benchmark fact tables', async () => {
    const fixture = cacheDatabase({ fresh: JSON.stringify(projection()) });

    const result = await readCompleteLeaderboardProjection(
      fixture.db,
      'llm-coding',
      'balanced',
      false,
      Date.parse('2026-08-06T01:00:00.000Z'),
    );

    expect(fixture.calls).toHaveLength(1);
    expect(fixture.calls[0]?.sql).toContain('api_response_entries');
    expect(fixture.calls[0]?.sql).not.toContain('benchmark_models');
    expect(fixture.calls[0]?.values.slice(0, 2)).toEqual([
      'benchmarks',
      'leaderboard-projection:llm-coding:balanced:0',
    ]);
    expect(result).toMatchObject({
      revision: REVISION,
      publishedAt: PUBLISHED_AT,
      freshness: { status: 'fresh', checkedAt: CHECKED_AT },
      data: {
        key: 'llm-coding',
        profile: 'balanced',
        entries: [{ model: { name: 'Alpha' }, metric: { value: 90 } }],
      },
    });
  });

  it('accepts a published BenchLM source rank when it matches the primary metric', () => {
    const fixture = entry();
    const metric = { ...fixture.metric!, rank: 23 };
    const ranked = { ...fixture, metric, metrics: [metric], sourceRank: 23 };

    expect(parseCompleteLeaderboardProjection(
      JSON.stringify(projectionWithEntries([ranked])),
      'llm-coding',
      'balanced',
    ).entries[0]).toMatchObject({ sourceRank: 23, metric: { rank: 23 } });
  });

  it('preserves the selected stale envelope metadata', async () => {
    const fixture = cacheDatabase({ stale: JSON.stringify(projection()) });

    const result = await readCompleteLeaderboardProjection(
      fixture.db,
      'llm-coding',
      'balanced',
      false,
      Date.parse('2026-08-08T00:00:01.000Z'),
    );

    expect(result?.freshness).toEqual({
      status: 'stale',
      checkedAt: CHECKED_AT,
      message: 'Published benchmark revision has not refreshed within 36 hours.',
    });
    expect(result?.publishedAt).toBe(PUBLISHED_AT);
  });

  it('accepts the publisher storage-revision suffix while preserving the benchmark revision', async () => {
    const fixture = cacheDatabase({
      fresh: JSON.stringify(projection()),
      cacheRevision: `${REVISION}+cache-20260806000000000-attempt-1`,
    });

    const result = await readCompleteLeaderboardProjection(
      fixture.db,
      'llm-coding',
      'balanced',
      false,
      Date.parse('2026-08-06T01:00:00.000Z'),
    );

    expect(result?.revision).toBe(REVISION);
  });

  it('fails closed for corrupted cache bytes or a mismatched cache revision', async () => {
    const malformed = cacheDatabase({ fresh: '{not-json' });
    const validProjection = projection();
    const wrongRevision = {
      ...validProjection,
      revision: { ...validProjection.revision, revision: 'other-revision' },
    };
    const mismatched = cacheDatabase({ fresh: JSON.stringify(wrongRevision) });

    await expect(readCompleteLeaderboardProjection(
      malformed.db,
      'llm-coding',
      'balanced',
      false,
      Date.parse('2026-08-06T01:00:00.000Z'),
    )).rejects.toThrow(/cached leaderboard/i);
    await expect(readCompleteLeaderboardProjection(
      mismatched.db,
      'llm-coding',
      'balanced',
      false,
      Date.parse('2026-08-06T01:00:00.000Z'),
    )).rejects.toThrow(/revision/i);
  });

  it.each([
    ['contentHash', `sha256:${'c'.repeat(63)}`],
    ['openrouterContentHash', `sha256:${'D'.repeat(64)}`],
  ] as const)('rejects a revision whose %s is not an exact lowercase SHA-256 digest', (key, hash) => {
    const base = projection();
    const corrupt = { ...base, revision: { ...base.revision, [key]: hash } };

    expect(() => parseCompleteLeaderboardProjection(
      JSON.stringify(corrupt),
      'llm-coding',
      'balanced',
    )).toThrow(/revision/i);
  });

  it('returns null when the complete projection is not published', async () => {
    const fixture = cacheDatabase({});

    await expect(readCompleteLeaderboardProjection(
      fixture.db,
      'llm-coding',
      'balanced',
      false,
      Date.parse('2026-08-06T01:00:00.000Z'),
    )).resolves.toBeNull();
  });

  it('rejects a coding projection carrying an overall metric row', () => {
    const coding = entry();
    const overallMetric = {
      ...coding.metric!,
      metricKey: 'benchlm:overall:raw',
      category: 'overall',
    };
    const wrongRouteEntry = { ...coding, metric: overallMetric, metrics: [overallMetric] };

    expect(() => parseCompleteLeaderboardProjection(
      JSON.stringify(projectionWithEntries([wrongRouteEntry])),
      'llm-coding',
      'balanced',
    )).toThrow(/route invariants/i);
  });

  it('rejects top-level rows that do not exactly match the selected base projection', () => {
    const base = projection();
    const changed = entry();
    const changedMetric = { ...changed.metric!, value: 91 };
    const mismatched = {
      ...base,
      entries: [{ ...changed, metric: changedMetric, metrics: [changedMetric] }],
    };

    expect(() => parseCompleteLeaderboardProjection(
      JSON.stringify(mismatched),
      'llm-coding',
      'balanced',
    )).toThrow(/entry variant/i);
  });

  it('rejects a non-estimated suffix in the estimated projection variant', () => {
    const base = projection();
    const extra = entry();
    const extraMetric = { ...extra.metric!, modelKey: 'beta', sourceModelId: 'beta' };
    const extraSupported = {
      ...extra,
      model: { ...extra.model, modelKey: 'beta', slug: 'beta', name: 'Beta', sourceModelId: 'beta' },
      metric: extraMetric,
      metrics: [extraMetric],
      primaryPrice: { ...extra.primaryPrice!, modelKey: 'beta', routeId: 'openrouter:beta', sourceModelId: 'beta' },
    };
    const wrongVariant = { ...base, entries: [...base.entries, extraSupported] };

    expect(() => parseCompleteLeaderboardProjection(
      JSON.stringify(wrongVariant),
      'llm-coding',
      'balanced',
      true,
    )).toThrow(/entry variant/i);
  });

  it('rejects a non-canonical estimated-entry suffix order', () => {
    const base = projection();
    const wrongOrder = {
      ...base,
      entries: [...base.entries, estimatedEntry('zeta'), estimatedEntry('beta')],
    };

    expect(() => parseCompleteLeaderboardProjection(
      JSON.stringify(wrongOrder),
      'llm-coding',
      'balanced',
      true,
    )).toThrow(/entry variant/i);
  });

  it('accepts a canonical estimated-entry suffix', () => {
    const base = projection();
    const selected = { ...base, entries: [...base.entries, estimatedEntry('beta'), estimatedEntry('zeta')] };

    expect(parseCompleteLeaderboardProjection(
      JSON.stringify(selected),
      'llm-coding',
      'balanced',
      true,
    ).entries.map((row) => row.model.modelKey)).toEqual(['alpha', 'beta', 'zeta']);
  });

  it.each([
    ['estimated-only', [estimatedEntry('beta')]],
    ['mixed', [entry(), estimatedEntry('beta')]],
  ] as const)('rejects an %s canonical base projection when estimated rows are excluded', (_label, rows) => {
    expect(() => parseCompleteLeaderboardProjection(
      JSON.stringify(projectionWithEntries(rows)),
      'llm-coding',
      'balanced',
      false,
    )).toThrow(/entry variant/i);
  });

  it('rejects duplicate model identities in complete projection rows', () => {
    const duplicated = projectionWithEntries([entry(), entry()]);

    expect(() => parseCompleteLeaderboardProjection(
      JSON.stringify(duplicated),
      'llm-coding',
      'balanced',
    )).toThrow(/duplicate leaderboard entry/i);
  });

  it('rejects route rows with the wrong metric source or evidence status', () => {
    const coding = entry();
    const wrongSourceMetric = {
      ...coding.metric!,
      sourceId: 'lmarena' as const,
      unit: 'arena_score' as const,
      methodology: 'bradley_terry' as const,
      rank: 1,
    };
    const wrongSource = projectionWithEntries([{
      ...coding,
      metric: wrongSourceMetric,
      metrics: [wrongSourceMetric],
      sourceRank: 1,
    }]);
    const wrongEvidenceEntry = { ...coding, model: { ...coding.model, evidenceStatus: 'source_only' as const } };

    expect(() => parseCompleteLeaderboardProjection(
      JSON.stringify(wrongSource),
      'llm-coding',
      'balanced',
    )).toThrow(/route invariants/i);
    expect(() => parseCompleteLeaderboardProjection(
      JSON.stringify(projectionWithEntries([wrongEvidenceEntry])),
      'llm-coding',
      'balanced',
    )).toThrow(/route invariants/i);
  });

  it('rejects structurally corrupt price evidence inside an entry', () => {
    const corrupt = { ...entry(), primaryPrice: {} } as unknown as LeaderboardEntry;

    expect(() => parseCompleteLeaderboardProjection(
      JSON.stringify(projectionWithEntries([corrupt])),
      'llm-coding',
      'balanced',
    )).toThrow(/route invariants/i);
  });

  it.each([
    ['missing snapshot key', { ...source('benchlm', 'benchlm-models'), snapshotKey: undefined }],
    ['invalid content hash', { ...source('benchlm', 'benchlm-models'), contentHash: 'sha256:pending' }],
    ['invalid original content hash', { ...source('benchlm', 'benchlm-models'), originalContentHash: 'not-a-hash' }],
    ['mismatched license', { ...source('benchlm', 'benchlm-models'), licenseId: 'OpenRouter-ToS' }],
    ['non-HTTPS URL', { ...source('benchlm', 'benchlm-models'), sourceUrl: 'http://benchlm.example/data' }],
    ['oversized attribution', { ...source('benchlm', 'benchlm-models'), attributionText: 'x'.repeat(65_537) }],
  ])('rejects source evidence with a %s', (_label, corruptSource) => {
    const base = projection();
    expect(() => parseCompleteLeaderboardProjection(
      projectionBodyWithSources([corruptSource, ...base.sources.slice(1)]),
      'llm-coding',
      'balanced',
    )).toThrow(/source evidence/i);
  });

  it.each(['etag', 'lastModified', 'upstreamRevision', 'schemaVersion'] as const)(
    'rejects a non-nullable-string source %s',
    (key) => {
      const base = projection();
      const corruptSource = { ...base.sources[0], [key]: 42 };

      expect(() => parseCompleteLeaderboardProjection(
        projectionBodyWithSources([corruptSource, ...base.sources.slice(1)]),
        'llm-coding',
        'balanced',
      )).toThrow(/source evidence/i);
    },
  );

  it('rejects duplicate source artifact identities', () => {
    const base = projection();

    expect(() => parseCompleteLeaderboardProjection(
      projectionBodyWithSources([...base.sources, base.sources[0]]),
      'llm-coding',
      'balanced',
    )).toThrow(/source evidence/i);
  });

  it('accepts the exact entry cap and rejects one additional entry', () => {
    const exactRows = Array.from({ length: 4_096 }, (_, index) => entryWithIdentity(index));
    const exact = parseCompleteLeaderboardProjection(
      JSON.stringify(projectionWithEntries(exactRows)),
      'llm-coding',
      'balanced',
    );

    expect(exact.entries).toHaveLength(4_096);
    expect(() => parseCompleteLeaderboardProjection(
      JSON.stringify(projectionWithEntries([...exactRows, entryWithIdentity(4_096)])),
      'llm-coding',
      'balanced',
    )).toThrow(/entry count exceeds/i);
  });

  it('rejects value rows without the required exact hosted-price evidence', () => {
    const fixture = entry();
    const overallMetric = {
      ...fixture.metric!,
      metricKey: 'benchlm:overall:raw',
      category: 'overall',
    };
    const invalidValueEntry = {
      ...fixture,
      metric: overallMetric,
      metrics: [overallMetric],
      primaryPrice: null,
      blendedCostPerMillion: null,
    };
    const base = projection();
    const invalidValueProjection: CachedLeaderboardPaginationProjection = {
      ...base,
      leaderboard: {
        key: 'llm-value',
        profile: 'balanced',
        definition: LEADERBOARD_DEFINITIONS['llm-value'],
        entries: [invalidValueEntry],
      },
      entries: [invalidValueEntry],
    };

    expect(() => parseCompleteLeaderboardProjection(
      JSON.stringify(invalidValueProjection),
      'llm-value',
      'balanced',
    )).toThrow(/route invariants/i);
  });

  it('accepts valid materialized entry invariants for every route kind', () => {
    const base = projection();
    const fixture = entry();
    const routeProjection = (
      key: keyof typeof LEADERBOARD_DEFINITIONS,
      routeEntry: LeaderboardEntry,
    ): CachedLeaderboardPaginationProjection => ({
      ...base,
      leaderboard: {
        key,
        profile: 'balanced',
        definition: LEADERBOARD_DEFINITIONS[key],
        entries: [routeEntry],
      },
      entries: [routeEntry],
    });
    const lmarenaMetric = {
      ...fixture.metric!,
      metricKey: 'lmarena:text_style_control:overall',
      category: 'text',
      sourceId: 'lmarena' as const,
      unit: 'arena_score' as const,
      methodology: 'bradley_terry' as const,
      rank: 1,
    };
    const overallMetric = { ...fixture.metric!, metricKey: 'benchlm:overall:raw', category: 'overall' };
    const multimodalMetric = { ...fixture.metric!, metricKey: 'benchlm:category:multimodalGrounded', category: 'multimodalGrounded' };
    const cases = [
      ['llm-human-preference', { ...fixture, metric: lmarenaMetric, metrics: [lmarenaMetric], sourceRank: 1 }],
      ['llm-value', { ...fixture, metric: overallMetric, metrics: [overallMetric], blendedCostPerMillion: 2, onValueFrontier: true }],
      ['llm-pricing-context', { ...fixture, metric: null, metrics: [], blendedCostPerMillion: 2 }],
      ['multimodal-vision-documents', { ...fixture, metric: multimodalMetric, metrics: [multimodalMetric] }],
    ] as const;

    for (const [key, routeEntry] of cases) {
      expect(parseCompleteLeaderboardProjection(
        JSON.stringify(routeProjection(key, routeEntry)),
        key,
        'balanced',
      ).entries).toHaveLength(1);
    }
  });
});
