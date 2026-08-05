import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseBenchLm,
  prepareBenchLm,
  rehydrateBenchLmProjections,
  type PreparedBenchLmPayloads,
  type RawBenchLmPayloads,
  type StoredBenchLmProjections,
} from './benchlm';

const observedAt = '2026-08-05T12:00:00.000Z';
const artifactNames = ['leaderboard', 'models', 'pricing', 'comparisons', 'benchmarks'] as const;
type ArtifactName = typeof artifactNames[number];

const fixtureHeaders = {
  leaderboard: { etag: 'W/"943db87a096566b2b719e7d2f55da91d"', lastModified: null },
  models: { etag: 'W/"329d611c37eaed33623407f995bb74ff"', lastModified: null },
  pricing: { etag: 'W/"9b3ed2fff10ed67eb64fa9f20d76b555"', lastModified: null },
  comparisons: { etag: 'W/"21d8cd43230a3ff98a46c6df85018303"', lastModified: null },
  benchmarks: { etag: 'W/"66c477d29bffa6d3e88cd79c8b07a002"', lastModified: null },
} as const;

function fixturePath(artifact: ArtifactName): string {
  return resolve(process.cwd(), `workers/benchmark-ingest/test-fixtures/benchlm/${artifact}.json`);
}

function fixture(artifact: ArtifactName): unknown {
  return JSON.parse(readFileSync(fixturePath(artifact), 'utf8'));
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

function rawBundleFromPayloads(source: ReturnType<typeof payloads>): RawBenchLmPayloads {
  return Object.fromEntries(artifactNames.map((artifact) => [artifact, {
    bytes: new TextEncoder().encode(JSON.stringify(source[artifact])),
    headers: { ...fixtureHeaders[artifact] },
  }])) as unknown as RawBenchLmPayloads;
}

function rawBundleFromFixtureFiles(): RawBenchLmPayloads {
  return Object.fromEntries(artifactNames.map((artifact) => [artifact, {
    bytes: new Uint8Array(readFileSync(fixturePath(artifact))),
    headers: { ...fixtureHeaders[artifact] },
  }])) as unknown as RawBenchLmPayloads;
}

async function parsePayloads(source = payloads()) {
  return parseBenchLm(await prepareBenchLm(rawBundleFromPayloads(source)), observedAt);
}

function storedFromPrepared(prepared: PreparedBenchLmPayloads): StoredBenchLmProjections {
  return Object.fromEntries(artifactNames.map((artifact) => [artifact, {
    projectedBytes: new Uint8Array(prepared[artifact].projectedBytes),
    projectedSha256: prepared[artifact].projectedSha256,
    originalSha256: prepared[artifact].originalSha256,
    headers: { ...prepared[artifact].headers },
  }])) as unknown as StoredBenchLmProjections;
}

describe('parseBenchLm', () => {
  it('normalizes only safe BenchLM evidence with byte-derived artifact provenance', async () => {
    const raw = rawBundleFromFixtureFiles();
    const prepared = await prepareBenchLm(raw);
    const batch = await parseBenchLm(prepared, observedAt);

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
    expect(batch.metrics.some((metric) => metric.sourceModelId === 'model-a' && metric.metricKey.includes('reasoning')))
      .toBe(false);
    expect(batch.comparisonSeeds[0]).toMatchObject({
      pairSlug: 'model-a-vs-model-b',
      sourceArtifactId: 'comparisons',
      sourceModelAId: 'model-a',
      sourceModelBId: 'model-b',
    });

    const leaderboardHash = createHash('sha256').update(prepared.leaderboard.projectedBytes).digest('hex');
    const originalLeaderboardHash = createHash('sha256').update(raw.leaderboard.bytes).digest('hex');
    expect(batch.sources[0]).toMatchObject({
      artifactId: 'leaderboard',
      attributionText: 'Data from BenchLM.ai',
      etag: fixtureHeaders.leaderboard.etag,
      contentHash: `sha256:${leaderboardHash}`,
      originalContentHash: `sha256:${originalLeaderboardHash}`,
      snapshotKey: `benchmarks/benchlm/leaderboard/projected/${leaderboardHash}.json`,
    });
    expect(batch.priceChecks).toEqual([expect.objectContaining({
      modelKey: 'source:benchlm:model-a',
      inputUsdPerMillion: 2.5,
      cachedInputUsdPerMillion: 1.25,
      outputUsdPerMillion: 10,
      sourceArtifactId: 'pricing',
    })]);
  });

  it('never derives a metric from prohibited display, rank, interval, or external fields', async () => {
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

    const prepared = await prepareBenchLm(rawBundleFromPayloads(source));
    const batch = await parseBenchLm(prepared, observedAt);
    const serialized = JSON.stringify(batch);
    const projected = new TextDecoder().decode(prepared.models.projectedBytes);

    expect(batch.metrics.find((metric) => metric.metricKey === 'benchlm:overall:raw')?.value).toBe(82.25);
    expect(`${serialized}\n${projected}`).not.toMatch(/999999|999998|scoreInterval90|overallRank|categoryRanks/);
    expect(`${serialized}\n${projected}`).not.toContain('forbidden-external-group');
  });

  it('omits a category until its safe definitions are present', async () => {
    const source = payloads();
    const benchmarks = source.benchmarks as { items: Array<Record<string, unknown>> };
    benchmarks.items = benchmarks.items.filter((definition) => definition.category !== 'coding');

    const batch = await parsePayloads(source);

    expect(batch.metrics.some((metric) => metric.metricKey === 'benchlm:category:coding')).toBe(false);
  });

  it('fails before persistence when a prohibited definition has a non-zero weight', async () => {
    const source = payloads();
    const benchmarks = source.benchmarks as { items: Array<Record<string, unknown>> };
    benchmarks.items.push({
      category: 'coding',
      benchmarkKey: 'aa-contaminated',
      name: 'prohibited source',
      paperUrl: 'https://example.org/prohibited',
      weight: 1,
    });

    await expect(prepareBenchLm(rawBundleFromPayloads(source))).rejects.toThrow(/prohibited benchmark definition/i);
  });

  it('fails when identifying text or a source URL marks a definition as prohibited', async () => {
    const identifiedByText = payloads();
    ((identifiedByText.benchmarks as { items: Array<Record<string, unknown>> }).items[0]).categoryLabel = 'Artificial Analysis composite';
    await expect(prepareBenchLm(rawBundleFromPayloads(identifiedByText))).rejects
      .toThrow(/prohibited benchmark definition/i);

    const identifiedByUrl = payloads();
    ((identifiedByUrl.benchmarks as { items: Array<Record<string, unknown>> }).items[0]).sourceUrl = 'https://artificialanalysis.ai/benchmark';
    await expect(prepareBenchLm(rawBundleFromPayloads(identifiedByUrl))).rejects
      .toThrow(/prohibited benchmark definition/i);
  });

  it('rejects a changed schema version and any speed payload', async () => {
    const changed = payloads();
    (changed.models as { schemaVersion: string }).schemaVersion = '2.0';
    await expect(prepareBenchLm(rawBundleFromPayloads(changed))).rejects.toThrow(/schemaVersion/i);

    const raw = rawBundleFromPayloads(payloads());
    await expect(prepareBenchLm({ ...raw, speed: { bytes: new Uint8Array(), headers: {} } } as never)).rejects
      .toThrow(/speed\.json is prohibited/i);
  });

  it('rejects malformed numeric evidence instead of treating it as unavailable', async () => {
    const malformed = payloads();
    ((malformed.models as { items: Array<Record<string, unknown>> }).items[0]).contextWindowTokens = '128000';

    await expect(prepareBenchLm(rawBundleFromPayloads(malformed))).rejects
      .toThrow(/contextWindowTokens must be an integer or null/i);
  });

  it('maps current nullable enums without making source-only rows rankable', async () => {
    const batch = await parsePayloads();
    const pendingSourceType = batch.models.find((model) => model.sourceModelId === 'kimi-3');
    const nullEvidence = batch.models.find((model) => model.sourceModelId === 'sakana-fugu-ultra');

    expect(pendingSourceType).toMatchObject({ sourceType: 'Unknown', evidenceStatus: 'supported' });
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

  it('rejects unreviewed non-null source and evidence enum values', async () => {
    const unknownSourceType = payloads();
    ((unknownSourceType.models as { items: Array<Record<string, unknown>> }).items[0]).sourceType = 'Experimental';
    await expect(prepareBenchLm(rawBundleFromPayloads(unknownSourceType))).rejects.toThrow(/sourceType/i);

    const unknownEvidence = payloads();
    ((unknownEvidence.models as { items: Array<Record<string, unknown>> }).items[0]).evidenceStatus = 'pending';
    await expect(prepareBenchLm(rawBundleFromPayloads(unknownEvidence))).rejects.toThrow(/evidenceStatus/i);
  });

  it('keeps a safe category rankable when overall evidence is unavailable', async () => {
    const source = payloads();
    const sourceModel = (source.models as { items: Array<Record<string, unknown>> }).items[0];
    sourceModel.rankingEligible = false;
    (sourceModel.scores as Record<string, unknown>).rawOverallScore = null;
    (sourceModel.ranking as { categoryRankingEligible: Record<string, boolean> }).categoryRankingEligible.coding = true;

    const batch = await parsePayloads(source);
    const model = batch.models.find((record) => record.sourceModelId === 'model-a');
    const overall = batch.metrics.find((metric) => metric.sourceModelId === 'model-a' && metric.category === 'overall');
    const coding = batch.metrics.find((metric) => metric.sourceModelId === 'model-a' && metric.category === 'coding');

    expect(model?.rankingEligible).toBe(false);
    expect(overall).toBeUndefined();
    expect(coding).toMatchObject({ value: 80.25, rankingEligible: true });
  });
});

describe('prepareBenchLm', () => {
  it('strips every case and whitespace variant of external categories before persistence', async () => {
    const source = payloads();
    const model = (source.models as { items: Array<Record<string, unknown>> }).items[0];
    (model.ranking as Record<string, unknown>).categoryRankingEligible = {
      coding: true,
      reasoning: false,
      External: true,
      ' external ': true,
      EXTERNAL: true,
      ' Mixed Safe ': true,
    };
    (model.scores as Record<string, unknown>).displayCategoryScores = {
      coding: 79.5,
      reasoning: null,
      External: 9101,
      ' external ': 9102,
      EXTERNAL: 9103,
      ' Mixed Safe ': 9301,
    };
    (model.scores as Record<string, unknown>).verifiedDisplayCategoryScores = {
      coding: 80.25,
      reasoning: null,
      External: 9201,
      ' external ': 9202,
      EXTERNAL: 9203,
      ' Mixed Safe ': 9302,
    };
    (source.benchmarks as { items: Array<Record<string, unknown>> }).items.push(
      { category: 'External', benchmarkKey: 'mixed-case-group', weight: 1 },
      { category: ' external ', benchmarkKey: 'whitespace-group', weight: 1 },
      { category: ' Mixed Safe ', benchmarkKey: 'mixed-safe', weight: 1 },
    );

    const prepared = await prepareBenchLm(rawBundleFromPayloads(source));
    const batch = await parseBenchLm(prepared, observedAt);
    const projectedModel = prepared.models.payload.items[0] as {
      ranking: { categoryRankingEligible: Record<string, boolean> };
      scores: {
        displayCategoryScores: Record<string, number | null>;
        verifiedDisplayCategoryScores: Record<string, number | null>;
      };
    };
    const projectedBenchmarkCategories = prepared.benchmarks.payload.items
      .map((item) => (item as { category: string }).category);
    const projectedText = `${new TextDecoder().decode(prepared.models.projectedBytes)}\n${new TextDecoder().decode(prepared.benchmarks.projectedBytes)}`;

    expect(projectedModel.ranking.categoryRankingEligible).toEqual({
      ' Mixed Safe ': true,
      coding: true,
      reasoning: false,
    });
    expect(projectedModel.scores.displayCategoryScores).toEqual({
      ' Mixed Safe ': 9301,
      coding: 79.5,
      reasoning: null,
    });
    expect(projectedModel.scores.verifiedDisplayCategoryScores).toEqual({
      ' Mixed Safe ': 9302,
      coding: 80.25,
      reasoning: null,
    });
    expect(projectedBenchmarkCategories).toEqual(['coding', 'reasoning', ' Mixed Safe ']);
    expect(projectedText).not.toMatch(/external/i);
    expect(batch.metrics.find((metric) => metric.sourceModelId === 'model-a' && metric.category === 'coding'))
      .toMatchObject({ value: 80.25, rankingEligible: true });
    expect(batch.metrics.find((metric) => metric.sourceModelId === 'model-a' && metric.category === ' Mixed Safe '))
      .toMatchObject({ value: 9302, rankingEligible: true });
    expect(batch.metrics.some((metric) => metric.category.trim().toLowerCase() === 'external')).toBe(false);
    expect(batch.metrics.some((metric) => [9101, 9102, 9103, 9201, 9202, 9203].includes(metric.value)))
      .toBe(false);
  });

  it('couples every provenance digest to the exact raw and projected bytes', async () => {
    const raw = rawBundleFromFixtureFiles();
    const prepared = await prepareBenchLm(raw);

    for (const artifact of artifactNames) {
      expect(prepared[artifact]).toMatchObject({
        originalSha256: createHash('sha256').update(raw[artifact].bytes).digest('hex'),
        projectedSha256: createHash('sha256').update(prepared[artifact].projectedBytes).digest('hex'),
        headers: fixtureHeaders[artifact],
      });
    }
  });

  it('sorts projected map keys by code unit for runtime-independent hashes', async () => {
    const forward = payloads();
    const reversed = payloads();
    const reversedModel = (reversed.models as { items: Array<Record<string, unknown>> }).items[0];
    (reversedModel.ranking as Record<string, unknown>).categoryRankingEligible = {
      reasoning: false,
      coding: true,
    };
    (reversedModel.scores as Record<string, unknown>).displayCategoryScores = {
      reasoning: null,
      coding: 79.5,
    };
    (reversedModel.scores as Record<string, unknown>).verifiedDisplayCategoryScores = {
      reasoning: null,
      coding: 80.25,
    };

    const forwardPrepared = await prepareBenchLm(rawBundleFromPayloads(forward));
    const reversedPrepared = await prepareBenchLm(rawBundleFromPayloads(reversed));

    expect(reversedPrepared.models.projectedSha256).toBe(forwardPrepared.models.projectedSha256);
  });

  it('preserves nullable pricing slugs found in the official export', async () => {
    const source = payloads();
    ((source.pricing as { items: Array<Record<string, unknown>> }).items[0]).slug = null;

    const prepared = await prepareBenchLm(rawBundleFromPayloads(source));

    expect((prepared.pricing.payload.items[0] as Record<string, unknown>).slug).toBeNull();
  });

  it('hashes exact raw and projected bytes and ignores fake embedded provenance', async () => {
    const source = payloads();
    (source.models as Record<string, unknown>).tokenbenchFixtureMetadata = {
      projectedSha256: 'f'.repeat(64),
      originalSha256: 'e'.repeat(64),
      responseHeaders: { etag: 'fake', lastModified: 'fake' },
    };
    const models = (source.models as { items: Array<Record<string, unknown>> }).items;
    models[0].displayScore = 999999;
    models[0].unknownField = 'must-not-persist';
    models[0].benchmarks = { external: { marker: 'must-not-persist' } };
    (models[0].scores as Record<string, unknown>).displayScore = 999999;
    (models[0].scores as Record<string, unknown>).overallScore = 999999;
    const benchmarks = (source.benchmarks as { items: Array<Record<string, unknown>> }).items;
    benchmarks.push({
      category: 'coding',
      benchmarkKey: 'aa-zero-weight',
      name: 'Artificial Analysis marker',
      weight: 0,
    });
    benchmarks.push({ category: 'external', benchmarkKey: 'external-group', weight: 0 });
    const raw = rawBundleFromPayloads(source);
    const expectedOriginalModelsHash = createHash('sha256').update(raw.models.bytes).digest('hex');

    const prepared = await prepareBenchLm(raw);
    const batch = await parseBenchLm(prepared, observedAt);
    const allProjectedText = artifactNames
      .map((artifact) => new TextDecoder().decode(prepared[artifact].projectedBytes))
      .join('\n');

    expect(prepared.models.originalSha256).toBe(expectedOriginalModelsHash);
    expect(prepared.models.originalSha256).not.toBe('e'.repeat(64));
    expect(prepared.models.projectedSha256).not.toBe('f'.repeat(64));
    for (const artifact of artifactNames) {
      expect(prepared[artifact].projectedSha256)
        .toBe(createHash('sha256').update(prepared[artifact].projectedBytes).digest('hex'));
      expect(batch.sources.find((record) => record.artifactId === artifact)).toMatchObject({
        contentHash: `sha256:${prepared[artifact].projectedSha256}`,
        originalContentHash: `sha256:${prepared[artifact].originalSha256}`,
      });
    }
    expect(allProjectedText).not.toMatch(/displayScore|overallRank|scoreInterval90|unknownField|tokenbenchFixtureMetadata/);
    expect(allProjectedText).not.toContain('must-not-persist');
    expect(allProjectedText.toLowerCase()).not.toContain('artificial analysis');
    expect(allProjectedText).not.toContain('"external"');
  });

  it('rejects projected-byte and safe-field mutations carrying stale provenance', async () => {
    const prepared = await prepareBenchLm(rawBundleFromPayloads(payloads()));
    prepared.models.projectedBytes[0] ^= 0xff;
    await expect(parseBenchLm(prepared, observedAt)).rejects.toThrow(/content hash|projected bytes|provenance/i);

    const fresh = await prepareBenchLm(rawBundleFromPayloads(payloads()));
    const forgedPayload = JSON.parse(JSON.stringify(fresh.models.payload)) as typeof fresh.models.payload;
    ((forgedPayload.items[0] as Record<string, unknown>).scores as Record<string, unknown>).rawOverallScore = 999999;
    const forged = {
      ...fresh,
      models: { ...fresh.models, payload: forgedPayload },
    };
    await expect(parseBenchLm(forged as PreparedBenchLmPayloads, observedAt)).rejects
      .toThrow(/preparation boundary|provenance/i);
  });

  it('rejects raw objects that did not pass a preparation boundary', async () => {
    await expect(parseBenchLm(payloads() as never, observedAt)).rejects.toThrow(/preparation boundary/i);
  });
});

describe('rehydrateBenchLmProjections', () => {
  it('re-hashes canonical R2 bytes before normalizing a stored snapshot', async () => {
    const prepared = await prepareBenchLm(rawBundleFromPayloads(payloads()));
    const rehydrated = await rehydrateBenchLmProjections(storedFromPrepared(prepared));
    const batch = await parseBenchLm(rehydrated, observedAt);

    expect(batch.models).toHaveLength(4);
    expect(batch.sources.find((source) => source.artifactId === 'models')).toMatchObject({
      contentHash: `sha256:${prepared.models.projectedSha256}`,
      originalContentHash: `sha256:${prepared.models.originalSha256}`,
    });
  });

  it('rejects a stored safe-field mutation with a stale content hash', async () => {
    const prepared = await prepareBenchLm(rawBundleFromPayloads(payloads()));
    const stored = storedFromPrepared(prepared);
    const modelProjection = JSON.parse(new TextDecoder().decode(stored.models.projectedBytes)) as {
      items: Array<{ scores: { rawOverallScore: number } }>;
    };
    modelProjection.items[0].scores.rawOverallScore = 999999;
    const mutated = {
      ...stored,
      models: {
        ...stored.models,
        projectedBytes: new TextEncoder().encode(JSON.stringify(modelProjection)),
      },
    };

    await expect(rehydrateBenchLmProjections(mutated)).rejects.toThrow(/content hash/i);
  });

  it('rejects unsafe or non-canonical stored bytes even with a matching hash', async () => {
    const prepared = await prepareBenchLm(rawBundleFromPayloads(payloads()));
    const stored = storedFromPrepared(prepared);
    const unsafeProjection = JSON.parse(new TextDecoder().decode(stored.models.projectedBytes)) as {
      items: Array<Record<string, unknown>>;
    };
    unsafeProjection.items[0].displayScore = 999999;
    const unsafeBytes = new TextEncoder().encode(JSON.stringify(unsafeProjection));
    const mutated = {
      ...stored,
      models: {
        ...stored.models,
        projectedBytes: unsafeBytes,
        projectedSha256: createHash('sha256').update(unsafeBytes).digest('hex'),
      },
    };

    await expect(rehydrateBenchLmProjections(mutated)).rejects.toThrow(/canonical safe projection/i);
  });
});
