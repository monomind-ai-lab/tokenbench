import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBenchLm } from './benchlm';

const observedAt = '2026-08-05T12:00:00.000Z';

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
    expect(batch.metrics.some((metric) => metric.metricKey.includes('reasoning'))).toBe(false);
    expect(batch.comparisonSeeds[0]).toMatchObject({
      pairSlug: 'model-a-vs-model-b',
      sourceArtifactId: 'comparisons',
      sourceModelAId: 'model-a',
      sourceModelBId: 'model-b',
    });
    expect(batch.sources[0]).toMatchObject({
      artifactId: 'leaderboard',
      attributionText: 'Data from BenchLM.ai',
      etag: '"943db87a096566b2b719e7d2f55da91d"',
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
});
