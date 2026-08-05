import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBenchLm } from './benchlm';

const observedAt = '2026-08-05T12:00:00.000Z';
const artifactNames = ['leaderboard', 'models', 'pricing', 'comparisons', 'benchmarks'] as const;

const projectedHashes = {
  leaderboard: '81e4d55d97ccc5ce117bdecf329853fb174b3042a6be0df803c65d4743fb93c7',
  models: '097167f10974af0504210c82b25c5cdff2f65642ad5e32eeab3139e367e0176c',
  pricing: 'a55a21f484ebf14a91c876ec27df8d61687823e0c267468c2f4661b8c7715f74',
  comparisons: '65f2217749005eab1b6ddb79a9e93dc182fa032e2252216f125ba38cb6a18f5e',
  benchmarks: 'b113c3d220c6d177ae67f3b1b266c018110460d2d4f014836716e84d8d705180',
} as const;

function fixture(name: 'leaderboard' | 'models' | 'pricing' | 'comparisons' | 'benchmarks'): unknown {
  return JSON.parse(readFileSync(resolve(process.cwd(), `workers/benchmark-ingest/test-fixtures/benchlm/${name}.json`), 'utf8'));
}

function payloads() {
  return {
    leaderboard: fixture('leaderboard'),
    models: fixture('models'),
    pricing: fixture('pricing'),
    comparisons: fixture('comparisons'),
    benchmarks: fixture('benchmarks'),
  };
}

function fixtureMetadata(source: ReturnType<typeof payloads>, artifact: typeof artifactNames[number]) {
  return (source[artifact] as {
    tokenbenchFixtureMetadata: {
      projectionFormat: string;
      projectedSha256: string;
      originalSha256: string;
      responseHeaders: { etag: string | null; lastModified: string | null };
    };
  }).tokenbenchFixtureMetadata;
}

function refreshProjectedHash(source: ReturnType<typeof payloads>, artifact: typeof artifactNames[number]): void {
  const payload = source[artifact] as { schemaVersion: string; generatedAt: string; items: unknown[] };
  const projectedBytes = JSON.stringify({
    schemaVersion: payload.schemaVersion,
    generatedAt: payload.generatedAt,
    items: payload.items,
  });
  fixtureMetadata(source, artifact).projectedSha256 = createHash('sha256').update(projectedBytes, 'utf8').digest('hex');
}

describe('parseBenchLm', () => {
  it('normalizes only safe BenchLM evidence with artifact provenance', () => {
    const batch = parseBenchLm(payloads(), observedAt);

    expect(batch.models[0]).toMatchObject({
      evidenceStatus: 'supported',
      rankingEligible: true,
      contextWindowTokens: 128000,
      sourceId: 'benchlm',
      sourceArtifactId: 'models',
    });
    expect(batch.models[1]).toMatchObject({
      evidenceStatus: 'estimated',
      rankingEligible: false,
      contextWindowTokens: null,
    });
    expect(batch.metrics.find((metric) => metric.metricKey === 'benchlm:overall:raw')).toMatchObject({
      category: 'overall',
      value: 82.25,
      unit: 'score',
      methodology: 'benchlm_raw_composite',
      rankingEligible: true,
      lower: null,
      upper: null,
      sourceArtifactId: 'models',
    });
    expect(batch.metrics.find((metric) => metric.metricKey === 'benchlm:category:coding')).toMatchObject({
      value: 80.25,
      rankingEligible: true,
    });
    expect(batch.metrics.some((metric) => metric.sourceModelId === 'model-a' && metric.metricKey.includes('reasoning'))).toBe(false);
    expect(batch.comparisonSeeds[0]).toMatchObject({
      pairSlug: 'model-a-vs-model-b',
      sourceArtifactId: 'comparisons',
      sourceModelAId: 'model-a',
      sourceModelBId: 'model-b',
    });
    expect(batch.sources[0]).toMatchObject({
      artifactId: 'leaderboard',
      attributionText: 'Data from BenchLM.ai',
      etag: 'W/"943db87a096566b2b719e7d2f55da91d"',
      contentHash: `sha256:${projectedHashes.leaderboard}`,
      originalContentHash: 'sha256:2e8855fc364abdff6a60cb6f46d175e068df033229063f16fa2899f8f8accbf6',
      snapshotKey: `benchmarks/benchlm/leaderboard/projected/${projectedHashes.leaderboard}.json`,
    });
    expect(batch.priceChecks).toEqual([expect.objectContaining({
      modelKey: 'source:benchlm:model-a',
      inputUsdPerMillion: 2.5,
      cachedInputUsdPerMillion: 1.25,
      outputUsdPerMillion: 10,
      sourceArtifactId: 'pricing',
    })]);
  });

  it('never derives a BenchLM metric from prohibited display or rank fields', () => {
    const source = payloads();
    const models = source.models as { items: Array<Record<string, unknown>> };
    models.items[0].displayScore = 999999;
    models.items[0].provisionalDisplayScore = 999998;
    models.items[0].overallRank = 1;
    models.items[0].scoreInterval90 = { lower: 1, upper: 999999 };
    models.items[0].benchmarks = { external: { marker: 'forbidden-external-group' } };
    (models.items[0].ranking as Record<string, unknown>).categoryRanks = { coding: 1 };
    (models.items[0].scores as Record<string, unknown>).displayScore = 999999;
    (models.items[0].scores as Record<string, unknown>).overallScore = 999999;
    (models.items[0].scores as Record<string, unknown>).verifiedDisplayScore = 999999;

    const batch = parseBenchLm(source, observedAt);
    const serialized = JSON.stringify(batch);

    expect(batch.metrics.find((metric) => metric.metricKey === 'benchlm:overall:raw')?.value).toBe(82.25);
    expect(serialized).not.toContain('999999');
    expect(serialized).not.toContain('999998');
    expect(serialized).not.toContain('scoreInterval90');
    expect(serialized).not.toContain('overallRank');
    expect(serialized).not.toContain('categoryRanks');
    expect(serialized).not.toContain('forbidden-external-group');
  });

  it('omits a category until its safe definitions are present', () => {
    const source = payloads();
    const benchmarks = source.benchmarks as { items: Array<Record<string, unknown>> };
    benchmarks.items = benchmarks.items.filter((definition) => definition.category !== 'coding');

    const batch = parseBenchLm(source, observedAt);

    expect(batch.metrics.some((metric) => metric.metricKey === 'benchlm:category:coding')).toBe(false);
  });

  it('fails before persistence when a prohibited definition has a non-zero weight', () => {
    const source = payloads();
    const benchmarks = source.benchmarks as { items: Array<Record<string, unknown>> };
    benchmarks.items.push({
      category: 'coding',
      benchmarkKey: 'aa-contaminated',
      name: 'prohibited source',
      paperUrl: 'https://example.org/prohibited',
      weight: 1,
    });

    expect(() => parseBenchLm(source, observedAt)).toThrow(/prohibited benchmark definition/i);
  });

  it('fails when identifying text or a source URL marks a definition as prohibited', () => {
    const identifiedByText = payloads();
    ((identifiedByText.benchmarks as { items: Array<Record<string, unknown>> }).items[0]).categoryLabel = 'Artificial Analysis composite';
    expect(() => parseBenchLm(identifiedByText, observedAt)).toThrow(/prohibited benchmark definition/i);

    const identifiedByUrl = payloads();
    ((identifiedByUrl.benchmarks as { items: Array<Record<string, unknown>> }).items[0]).sourceUrl = 'https://artificialanalysis.ai/benchmark';
    expect(() => parseBenchLm(identifiedByUrl, observedAt)).toThrow(/prohibited benchmark definition/i);
  });

  it('rejects a changed schema version and any speed payload', () => {
    const changed = payloads();
    (changed.models as { schemaVersion: string }).schemaVersion = '2.0';
    expect(() => parseBenchLm(changed, observedAt)).toThrow(/schemaVersion/i);

    expect(() => parseBenchLm({ ...payloads(), speed: { schemaVersion: '1.0', items: [] } } as never, observedAt))
      .toThrow(/speed\.json is prohibited/i);
  });

  it('rejects malformed numeric evidence instead of silently treating it as unavailable', () => {
    const malformed = payloads();
    ((malformed.models as { items: Array<Record<string, unknown>> }).items[0]).contextWindowTokens = '128000';

    expect(() => parseBenchLm(malformed, observedAt)).toThrow(/contextWindowTokens must be an integer or null/i);
  });

  it('emits distinct projected and original hashes for every artifact', () => {
    const source = payloads();
    const batch = parseBenchLm(source, observedAt);

    expect(batch.sources).toHaveLength(5);
    for (const artifact of artifactNames) {
      const metadata = fixtureMetadata(source, artifact);
      expect(batch.sources.find((record) => record.artifactId === artifact)).toMatchObject({
        contentHash: `sha256:${metadata.projectedSha256}`,
        originalContentHash: `sha256:${metadata.originalSha256}`,
        etag: metadata.responseHeaders.etag,
        lastModified: metadata.responseHeaders.lastModified,
        snapshotKey: `benchmarks/benchlm/${artifact}/projected/${metadata.projectedSha256}.json`,
      });
    }
  });

  it.each(artifactNames)('rejects %s before normalization when artifact metadata is missing', (artifact) => {
    const source = payloads();
    delete (source[artifact] as { tokenbenchFixtureMetadata?: unknown }).tokenbenchFixtureMetadata;

    expect(() => parseBenchLm(source, observedAt)).toThrow(new RegExp(`BenchLM ${artifact}\\.tokenbenchFixtureMetadata`));
  });

  it('rejects malformed or non-lowercase artifact hashes', () => {
    const badProjected = payloads();
    fixtureMetadata(badProjected, 'models').projectedSha256 = 'A'.repeat(64);
    expect(() => parseBenchLm(badProjected, observedAt)).toThrow(/projectedSha256/i);

    const badOriginal = payloads();
    fixtureMetadata(badOriginal, 'models').originalSha256 = 'not-a-hash';
    expect(() => parseBenchLm(badOriginal, observedAt)).toThrow(/originalSha256/i);
  });

  it('keeps fixture projected hashes coupled to exact deterministic projection bytes', () => {
    const source = payloads();
    for (const artifact of artifactNames) {
      const payload = source[artifact] as { schemaVersion: string; generatedAt: string; items: unknown[] };
      const projectedBytes = JSON.stringify({
        schemaVersion: payload.schemaVersion,
        generatedAt: payload.generatedAt,
        items: payload.items,
      });
      const metadata = fixtureMetadata(source, artifact);

      expect(metadata.projectionFormat).toBe('UTF-8 JSON.stringify({schemaVersion,generatedAt,items})');
      expect(createHash('sha256').update(projectedBytes, 'utf8').digest('hex')).toBe(projectedHashes[artifact]);
      expect(metadata.projectedSha256).toBe(projectedHashes[artifact]);
    }
  });

  it('maps current BenchLM nullable enums without making source-only rows rankable', () => {
    const batch = parseBenchLm(payloads(), observedAt);
    const pendingSourceType = batch.models.find((model) => model.sourceModelId === 'kimi-3');
    const nullEvidence = batch.models.find((model) => model.sourceModelId === 'sakana-fugu-ultra');

    expect(pendingSourceType).toMatchObject({
      sourceType: 'Unknown',
      evidenceStatus: 'supported',
    });
    expect(nullEvidence).toMatchObject({
      sourceType: 'Proprietary',
      evidenceStatus: 'source_only',
      rankingEligible: false,
    });
    expect(batch.metrics.filter((metric) => metric.sourceModelId === 'sakana-fugu-ultra'))
      .toEqual(expect.arrayContaining([expect.objectContaining({ rankingEligible: false })]));
    expect(batch.metrics.filter((metric) => metric.sourceModelId === 'sakana-fugu-ultra')
      .every((metric) => metric.rankingEligible === false)).toBe(true);
  });

  it('rejects unreviewed non-null source and evidence enum values', () => {
    const unknownSourceType = payloads();
    ((unknownSourceType.models as { items: Array<Record<string, unknown>> }).items[0]).sourceType = 'Experimental';
    expect(() => parseBenchLm(unknownSourceType, observedAt)).toThrow(/sourceType/i);

    const unknownEvidence = payloads();
    ((unknownEvidence.models as { items: Array<Record<string, unknown>> }).items[0]).evidenceStatus = 'pending';
    expect(() => parseBenchLm(unknownEvidence, observedAt)).toThrow(/evidenceStatus/i);
  });

  it('keeps a safe category rankable when overall evidence is unavailable', () => {
    const source = payloads();
    const sourceModel = (source.models as { items: Array<Record<string, unknown>> }).items[0];
    sourceModel.rankingEligible = false;
    (sourceModel.scores as Record<string, unknown>).rawOverallScore = null;
    (sourceModel.ranking as { categoryRankingEligible: Record<string, boolean> }).categoryRankingEligible.coding = true;
    refreshProjectedHash(source, 'models');

    const batch = parseBenchLm(source, observedAt);
    const model = batch.models.find((record) => record.sourceModelId === 'model-a');
    const overall = batch.metrics.find((metric) => metric.sourceModelId === 'model-a' && metric.category === 'overall');
    const coding = batch.metrics.find((metric) => metric.sourceModelId === 'model-a' && metric.category === 'coding');

    expect(model?.rankingEligible).toBe(false);
    expect(overall).toBeUndefined();
    expect(coding).toMatchObject({ value: 80.25, rankingEligible: true });
  });
});
