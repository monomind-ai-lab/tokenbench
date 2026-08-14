import { describe, expect, it } from 'vitest';
import {
  isEditorialComparisonPair,
} from './comparison-allowlist';
import {
  resolvedModelKey,
  resolveCanonicalModelKey,
  sourceSpecificModelKey,
} from './model-aliases';
import {
  compareUtf8Binary,
  createComparisonPairSlugResolver,
  isCanonicalIsoTimestamp,
  resolveComparisonPairSlug,
  type BenchmarkComparisonPair,
  type BenchmarkModel,
  validateBenchmarkComparisonPair,
  validateIndexableComparisonPairRoute,
  validateNormalizedSourceBatch,
} from './contracts';
import { subscriptionPlanIdsForModel } from './subscription-model-map';

const observedAt = '2026-08-05T00:00:00.000Z';
const projectedHash = `sha256:${'a'.repeat(64)}`;
const originalHash = `sha256:${'b'.repeat(64)}`;

const validBatch = {
  sources: [
    {
      sourceId: 'benchlm',
      artifactId: 'leaderboard-v1',
      sourceUrl: 'https://benchlm.ai/data/leaderboard.json',
      observedAt,
      etag: null,
      lastModified: null,
      upstreamRevision: null,
      schemaVersion: '1.0',
      snapshotKey: 'benchmarks/benchlm/leaderboard-v1.json',
      contentHash: projectedHash,
      originalContentHash: originalHash,
      licenseId: 'MIT',
      attributionText: 'Data from BenchLM.ai',
    },
    {
      sourceId: 'openrouter',
      artifactId: 'models-r1',
      sourceUrl: 'https://openrouter.ai/api/v1/models',
      observedAt,
      etag: '"models-r1"',
      lastModified: null,
      upstreamRevision: 'catalog-r1',
      schemaVersion: null,
      snapshotKey: 'catalog/openrouter/models-r1.json',
      contentHash: `sha256:${'c'.repeat(64)}`,
      originalContentHash: `sha256:${'d'.repeat(64)}`,
      licenseId: 'OpenRouter-ToS',
      attributionText: 'Catalog and pricing data from OpenRouter',
    },
  ],
  models: [
    {
      modelKey: 'openai:gpt-4o',
      slug: 'gpt-4o',
      name: 'GPT-4o',
      creator: 'OpenAI',
      sourceType: 'Proprietary',
      reasoningType: null,
      releaseDate: null,
      contextWindowTokens: null,
      evidenceStatus: 'supported',
      rankingEligible: true,
      confidenceLower: null,
      confidenceUpper: null,
      benchmarkCount: 1,
      sourceId: 'benchlm',
      sourceModelId: 'openai/gpt-4o',
      sourceArtifactId: 'leaderboard-v1',
    },
  ],
  metrics: [
    {
      modelKey: 'openai:gpt-4o',
      metricKey: 'benchlm:overall:raw',
      category: 'overall',
      value: 75.5,
      rawValue: 75.0,
      rank: 1,
      lower: null,
      upper: null,
      voteCount: null,
      unit: 'score',
      sourceId: 'benchlm',
      sourceUpdatedAt: observedAt,
      sourceModelId: 'openai/gpt-4o',
      sourceArtifactId: 'leaderboard-v1',
      rankingEligible: true,
      methodology: 'benchlm_raw_composite',
      observationCount: null,
      sessionCount: null,
    },
  ],
  priceChecks: [
    {
      modelKey: 'openai:gpt-4o',
      sourceId: 'openrouter',
      providerId: 'openrouter',
      inputUsdPerMillion: 0,
      cachedInputUsdPerMillion: null,
      outputUsdPerMillion: 10,
      contextWindowTokens: 128_000,
      verificationStatus: 'primary',
      routeId: 'openrouter:openai/gpt-4o',
      sourceModelId: 'openai/gpt-4o',
      canonicalSlug: 'gpt-4o',
      maxInputTokens: null,
      maxOutputTokens: 16_000,
      inputModalities: ['text'],
      outputModalities: ['text'],
      supportedParameters: ['tools'],
      sourceArtifactId: 'models-r1',
    },
  ],
  comparisonSeeds: [],
};

const lmArenaSource = {
  sourceId: 'lmarena',
  artifactId: 'text-style-control-r1',
  sourceUrl: 'https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset',
  observedAt,
  etag: null,
  lastModified: null,
  upstreamRevision: 'lmarena-r1',
  schemaVersion: null,
  snapshotKey: 'benchmarks/lmarena/text-style-control-r1.json',
  contentHash: `sha256:${'e'.repeat(64)}`,
  originalContentHash: `sha256:${'f'.repeat(64)}`,
  licenseId: 'CC-BY-4.0',
  attributionText: 'Arena ratings from LMArena',
};

function lmArenaMetric(methodology: 'bradley_terry' | 'ips') {
  return {
    ...validBatch.metrics[0],
    metricKey: methodology === 'bradley_terry'
      ? 'lmarena:text_style_control:overall'
      : 'lmarena:agent:overall:ips',
    unit: methodology === 'bradley_terry' ? 'arena_score' : 'score',
    rawValue: null,
    sourceId: 'lmarena',
    sourceArtifactId: 'text-style-control-r1',
    methodology,
  };
}

function batchWithComparison() {
  const secondModel = {
    ...validBatch.models[0],
    modelKey: 'anthropic:claude-3-7-sonnet',
    slug: 'claude-3-7-sonnet',
    name: 'Claude 3.7 Sonnet',
    sourceModelId: 'anthropic/claude-3-7-sonnet',
  };

  return {
    ...validBatch,
    models: [...validBatch.models, secondModel],
    comparisonSeeds: [{
      pairSlug: 'claude-3-7-sonnet-vs-gpt-4o',
      modelAKey: 'anthropic:claude-3-7-sonnet',
      modelBKey: 'openai:gpt-4o',
      sourceId: 'benchlm',
      sourceArtifactId: 'leaderboard-v1',
      sourceModelAId: 'anthropic/claude-3-7-sonnet',
      sourceModelBId: 'openai/gpt-4o',
      featuredRank: 1,
    }],
  };
}

describe('benchmark contracts', () => {
  it.each([
    null,
    'not-a-timestamp',
    '2026-02-30T00:00:00.000Z',
  ])('rejects non-canonical timestamp value %s', (value) => {
    expect(isCanonicalIsoTimestamp(value)).toBe(false);
  });

  it.each([
    '2026-02-28T00:00:00Z',
    '2024-02-29T23:59:59.123Z',
  ])('accepts canonical timestamp %s', (value) => {
    expect(isCanonicalIsoTimestamp(value)).toBe(true);
  });

  it('accepts a source-linked batch and preserves explicit nulls and zero-price evidence', () => {
    const result = validateNormalizedSourceBatch(validBatch);

    expect(result.models[0].contextWindowTokens).toBeNull();
    expect(result.metrics[0].lower).toBeNull();
    expect(result.priceChecks[0].inputUsdPerMillion).toBe(0);
    expect(result.priceChecks[0].cachedInputUsdPerMillion).toBeNull();
    expect(result.sources[0].etag).toBeNull();
    expect(result.sources[0]).toMatchObject({ contentHash: projectedHash, originalContentHash: originalHash });
  });

  it('accepts an additive exact rank field size and rejects contradictory evidence', () => {
    expect(validateNormalizedSourceBatch({
      ...validBatch,
      metrics: [{ ...validBatch.metrics[0], rankFieldSize: 5 }],
    }).metrics[0].rankFieldSize).toBe(5);
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      metrics: [{ ...validBatch.metrics[0], rank: 6, rankFieldSize: 5 }],
    })).toThrow('metrics[0].rank exceeds metrics[0].rankFieldSize');
  });

  it('requires real, separate SHA-256 evidence hashes for every source artifact', () => {
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      sources: [{ ...validBatch.sources[0], contentHash: 'sha256:pending-models' }, validBatch.sources[1]],
    })).toThrow('sources[0].contentHash must be a sha256: digest');
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      sources: [{ ...validBatch.sources[0], originalContentHash: 'not-a-hash' }, validBatch.sources[1]],
    })).toThrow('sources[0].originalContentHash must be a sha256: digest');
  });

  it('rejects source records with prohibited Artificial Analysis identifiers or URLs', () => {
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      sources: [{ ...validBatch.sources[0], sourceId: 'aa-feed' }],
    })).toThrow(/prohibited/i);
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      sources: [{ ...validBatch.sources[0], sourceUrl: 'https://artificialanalysis.ai/data' }],
    })).toThrow(/prohibited/i);
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      metrics: [{ ...validBatch.metrics[0], metricKey: 'aa:overall' }],
    })).toThrow(/prohibited/i);
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      metrics: [{ ...validBatch.metrics[0], metricKey: 'benchlm:aa:overall' }],
    })).toThrow(/prohibited/i);
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      metrics: [{ ...validBatch.metrics[0], category: 'Artificial Analysis composite' }],
    })).toThrow(/prohibited/i);
  });

  it.each([
    'aabogus:overall',
    'AABogus:overall',
    'benchlm:aabogus:overall',
    'lmarena:AABogus:overall',
    'benchlm/aabogus/overall',
    'lmarena/AABogus/overall',
  ])('rejects benchmark metric namespace %s when an AA prefix is disguised', (metricKey) => {
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      metrics: [{ ...validBatch.metrics[0], metricKey }],
    })).toThrow(/prohibited/i);
  });

  it('accepts benign model identifiers whose spelling begins with aa', () => {
    const modelKey = 'aardvark:model-v1';
    const sourceModelId = 'provider/aardvark-model-v1';
    const result = validateNormalizedSourceBatch({
      ...validBatch,
      models: [{ ...validBatch.models[0], modelKey, slug: 'aardvark-model-v1', sourceModelId }],
      metrics: [{ ...validBatch.metrics[0], modelKey, sourceModelId }],
      priceChecks: [{
        ...validBatch.priceChecks[0],
        modelKey,
        sourceModelId,
        canonicalSlug: 'aardvark-model-v1',
        routeId: 'openrouter:provider/aardvark-model-v1',
      }],
    });

    expect(result.models[0].sourceModelId).toBe(sourceModelId);
  });

  it('rejects missing, non-finite, or negative numeric evidence instead of coercing it', () => {
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      priceChecks: [{ ...validBatch.priceChecks[0], inputUsdPerMillion: undefined }],
    })).toThrow('priceChecks[0].inputUsdPerMillion must be a finite number or null');
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      metrics: [{ ...validBatch.metrics[0], value: Number.NaN }],
    })).toThrow('metrics[0].value must be a finite number');
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      priceChecks: [{ ...validBatch.priceChecks[0], outputUsdPerMillion: -0.01 }],
    })).toThrow('priceChecks[0].outputUsdPerMillion must be a non-negative finite number or null');
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      models: [{ ...validBatch.models[0], contextWindowTokens: -1 }],
    })).toThrow('models[0].contextWindowTokens must be a positive integer or null');
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      metrics: [{ ...validBatch.metrics[0], voteCount: -1 }],
    })).toThrow('metrics[0].voteCount must be a non-negative integer or null');
  });

  it('rejects zero context and token limits while preserving unavailable nulls', () => {
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      models: [{ ...validBatch.models[0], contextWindowTokens: 0 }],
    })).toThrow('models[0].contextWindowTokens must be a positive integer or null');
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      priceChecks: [{ ...validBatch.priceChecks[0], contextWindowTokens: 0 }],
    })).toThrow('priceChecks[0].contextWindowTokens must be a positive integer or null');
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      priceChecks: [{ ...validBatch.priceChecks[0], maxInputTokens: 0 }],
    })).toThrow('priceChecks[0].maxInputTokens must be a positive integer or null');
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      priceChecks: [{ ...validBatch.priceChecks[0], maxOutputTokens: 0 }],
    })).toThrow('priceChecks[0].maxOutputTokens must be a positive integer or null');
    expect(validateNormalizedSourceBatch({
      ...validBatch,
      priceChecks: [{
        ...validBatch.priceChecks[0],
        contextWindowTokens: null,
        maxInputTokens: null,
        maxOutputTokens: null,
      }],
    }).priceChecks[0].contextWindowTokens).toBeNull();
  });

  it('rejects negative metric values and confidence bounds', () => {
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      metrics: [{ ...validBatch.metrics[0], value: -0.01 }],
    })).toThrow('metrics[0].value must be a non-negative finite number');
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      metrics: [{ ...validBatch.metrics[0], lower: -1, upper: 1 }],
    })).toThrow('metrics[0].lower must be a non-negative finite number');
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      models: [{ ...validBatch.models[0], confidenceLower: -1, confidenceUpper: 1 }],
    })).toThrow('models[0].confidenceLower must be a non-negative finite number');
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      sources: [...validBatch.sources, lmArenaSource],
      metrics: [{ ...lmArenaMetric('bradley_terry'), value: -0.01 }],
    })).toThrow('metrics[0].value must be a non-negative finite number');
  });

  it('preserves finite signed IPS scores and confidence bounds from Agent Arena', () => {
    const metric = {
      ...lmArenaMetric('ips'),
      value: -0.0019042599988607666,
      lower: -0.010797532242106361,
      upper: 0.006989012244384828,
      voteCount: null,
      observationCount: 1_845_220,
      sessionCount: 19_135,
    };

    const result = validateNormalizedSourceBatch({
      ...validBatch,
      sources: [...validBatch.sources, lmArenaSource],
      metrics: [metric],
    });

    expect(result.metrics[0]).toMatchObject({
      methodology: 'ips',
      value: metric.value,
      lower: metric.lower,
      upper: metric.upper,
    });
  });

  it('accepts evidence counts only for their matching arena methodology', () => {
    const standardMetric = {
      ...lmArenaMetric('bradley_terry'),
      voteCount: 200,
      observationCount: null,
      sessionCount: null,
    };
    const agentMetric = {
      ...lmArenaMetric('ips'),
      voteCount: null,
      observationCount: 100,
      sessionCount: 20,
    };
    expect(validateNormalizedSourceBatch({
      ...validBatch,
      sources: [...validBatch.sources, lmArenaSource],
      metrics: [standardMetric, agentMetric],
    }).metrics).toHaveLength(2);
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      sources: [...validBatch.sources, lmArenaSource],
      metrics: [{ ...standardMetric, observationCount: 1 }],
    })).toThrow('metrics[0].observationCount and metrics[0].sessionCount are only valid for ips');
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      sources: [...validBatch.sources, lmArenaSource],
      metrics: [{ ...agentMetric, voteCount: 1 }],
    })).toThrow('metrics[0].voteCount is only valid for bradley_terry');
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      metrics: [{ ...validBatch.metrics[0], methodology: 'bradley_terry' }],
    })).toThrow('metrics[0].methodology bradley_terry requires sourceId lmarena');
  });

  it('rejects incomplete or inverted confidence intervals', () => {
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      models: [{ ...validBatch.models[0], confidenceLower: 80, confidenceUpper: 70 }],
    })).toThrow('models[0].confidenceLower must be less than or equal to models[0].confidenceUpper');
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      metrics: [{ ...validBatch.metrics[0], lower: 70, upper: null }],
    })).toThrow('metrics[0] confidence bounds must both be null or finite numbers');
  });

  it('rejects facts that cannot be traced to their declared source artifact', () => {
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      priceChecks: [{ ...validBatch.priceChecks[0], sourceArtifactId: 'not-stored' }],
    })).toThrow('priceChecks[0].sourceArtifactId must refer to a source artifact for openrouter');
  });

  it('rejects duplicate normalized identities', () => {
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      models: [...validBatch.models, validBatch.models[0]],
    })).toThrow('Duplicate model key: openai:gpt-4o');
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      metrics: [...validBatch.metrics, validBatch.metrics[0]],
    })).toThrow('Duplicate metric identity: openai:gpt-4o/benchlm:overall:raw');
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      priceChecks: [...validBatch.priceChecks, validBatch.priceChecks[0]],
    })).toThrow('Duplicate price-check identity: openai:gpt-4o/openrouter/openrouter/openrouter:openai/gpt-4o');
  });

  it('accepts only lexically ordered canonical comparison pairs', () => {
    expect(validateNormalizedSourceBatch(batchWithComparison()).comparisonSeeds[0].pairSlug)
      .toBe('claude-3-7-sonnet-vs-gpt-4o');
    expect(() => validateNormalizedSourceBatch({
      ...batchWithComparison(),
      comparisonSeeds: [{
        ...batchWithComparison().comparisonSeeds[0],
        modelAKey: 'openai:gpt-4o',
        modelBKey: 'anthropic:claude-3-7-sonnet',
        pairSlug: 'gpt-4o-vs-claude-3-7-sonnet',
        sourceModelAId: 'openai/gpt-4o',
        sourceModelBId: 'anthropic/claude-3-7-sonnet',
      }],
    })).toThrow('comparisonSeeds[0].modelAKey must sort before comparisonSeeds[0].modelBKey');
  });

  it('uses UTF-8 binary model-key ordering rather than JavaScript UTF-16 ordering for canonical pairs', () => {
    // U+10000 sorts before U+E000 as UTF-16 code units (a surrogate sorts
    // before E000), but SQLite BINARY/UTF-8 sorts U+E000 first (EE < F0).
    const utf8First = 'provider:\uE000';
    const utf16First = 'provider:\u{10000}';
    expect(utf16First < utf8First).toBe(true);
    expect(compareUtf8Binary(utf8First, utf16First)).toBeLessThan(0);

    const unicodeModels = [
      { ...validBatch.models[0], modelKey: utf8First, slug: 'private-use', sourceModelId: 'provider/private-use' },
      { ...validBatch.models[0], modelKey: utf16First, slug: 'astral', sourceModelId: 'provider/astral' },
    ];
    const seed = {
      pairSlug: 'private-use-vs-astral',
      modelAKey: utf8First,
      modelBKey: utf16First,
      sourceId: 'benchlm',
      sourceArtifactId: 'leaderboard-v1',
      sourceModelAId: 'provider/private-use',
      sourceModelBId: 'provider/astral',
      featuredRank: 1,
    };

    expect(validateNormalizedSourceBatch({
      ...validBatch,
      models: [...validBatch.models, ...unicodeModels],
      comparisonSeeds: [seed],
    }).comparisonSeeds[0]).toMatchObject(seed);
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      models: [...validBatch.models, ...unicodeModels],
      comparisonSeeds: [{ ...seed, modelAKey: utf16First, modelBKey: utf8First, pairSlug: 'astral-vs-private-use' }],
    })).toThrow('comparisonSeeds[0].modelAKey must sort before comparisonSeeds[0].modelBKey');
  });

  it('requires at least two shared safe metrics before a comparison is indexable', () => {
    const pair = {
      pairSlug: 'claude-3-7-sonnet-vs-gpt-4o',
      modelAKey: 'anthropic:claude-3-7-sonnet',
      modelBKey: 'openai:gpt-4o',
      indexable: true,
      eligibilityReason: 'eligible',
      featuredRank: null,
      sharedMetricCount: 0,
    };

    expect(() => validateBenchmarkComparisonPair(pair))
      .toThrow('sharedMetricCount must be at least 2 when indexable');
    expect(validateBenchmarkComparisonPair({ ...pair, sharedMetricCount: 2 }).indexable).toBe(true);
    expect(validateBenchmarkComparisonPair({ ...pair, indexable: false }).sharedMetricCount).toBe(0);
  });

  it('keeps nonindexable comparison records permissive while rejecting unsafe indexable URL segments', () => {
    const pair = {
      pairSlug: 'claude/3-vs-gpt-4o',
      modelAKey: 'anthropic:claude-3-7-sonnet',
      modelBKey: 'openai:gpt-4o',
      indexable: true,
      eligibilityReason: 'eligible',
      featuredRank: null,
      sharedMetricCount: 2,
    };

    expect(() => validateBenchmarkComparisonPair(pair))
      .toThrow('indexable pairSlug must be a route-safe URL segment');
    expect(validateBenchmarkComparisonPair({ ...pair, indexable: false }).pairSlug).toBe('claude/3-vs-gpt-4o');
  });

  it('shares one unique route resolver between publication and Pages validation', () => {
    const template = validBatch.models[0] as BenchmarkModel;
    const models: BenchmarkModel[] = [
      { ...template, modelKey: 'provider:a', slug: 'a', sourceModelId: 'provider/a' },
      { ...template, modelKey: 'provider:b', slug: 'a-vs-b', sourceModelId: 'provider/b' },
      { ...template, modelKey: 'provider:c', slug: 'b-vs-c', sourceModelId: 'provider/c' },
      { ...template, modelKey: 'provider:d', slug: 'c', sourceModelId: 'provider/d' },
    ];
    const ambiguous = validateBenchmarkComparisonPair({
      pairSlug: 'a-vs-b-vs-c',
      modelAKey: 'provider:a',
      modelBKey: 'provider:c',
      indexable: true,
      eligibilityReason: 'eligible',
      featuredRank: null,
      sharedMetricCount: 2,
    });

    expect(resolveComparisonPairSlug(models, ambiguous.pairSlug)).toBeNull();
    expect(() => validateIndexableComparisonPairRoute(models, ambiguous))
      .toThrow('must resolve uniquely through the comparison route');
  });

  it('reuses one supplied route resolver across a batch of indexable pairs', () => {
    const template = validBatch.models[0] as BenchmarkModel;
    const models: BenchmarkModel[] = [
      { ...template, modelKey: 'provider:a', slug: 'a', sourceModelId: 'provider/a' },
      { ...template, modelKey: 'provider:b', slug: 'b', sourceModelId: 'provider/b' },
      { ...template, modelKey: 'provider:c', slug: 'c', sourceModelId: 'provider/c' },
    ];
    const pairs: BenchmarkComparisonPair[] = [
      validateBenchmarkComparisonPair({ pairSlug: 'a-vs-b', modelAKey: 'provider:a', modelBKey: 'provider:b', indexable: true, eligibilityReason: 'eligible', featuredRank: null, sharedMetricCount: 2 }),
      validateBenchmarkComparisonPair({ pairSlug: 'a-vs-c', modelAKey: 'provider:a', modelBKey: 'provider:c', indexable: true, eligibilityReason: 'eligible', featuredRank: null, sharedMetricCount: 2 }),
    ];
    let constructions = 0;
    let resolutions = 0;
    const resolver = (() => {
      constructions += 1;
      const actual = createComparisonPairSlugResolver(models);
      return (pairSlug: string) => {
        resolutions += 1;
        return actual(pairSlug);
      };
    })();
    pairs.forEach((pair) => validateIndexableComparisonPairRoute(models, pair, resolver));

    expect(constructions).toBe(1);
    expect(resolutions).toBe(pairs.length);
  });

  it('uses stable-slug ordering for the public pair while retaining modelKey-ordered persisted records', () => {
    const template = validBatch.models[0] as BenchmarkModel;
    const models: BenchmarkModel[] = [
      { ...template, modelKey: 'provider:alpha', slug: 'zeta', sourceModelId: 'provider/alpha' },
      { ...template, modelKey: 'provider:beta', slug: 'alpha', sourceModelId: 'provider/beta' },
    ];
    const persisted = validateBenchmarkComparisonPair({
      pairSlug: 'alpha-vs-zeta',
      modelAKey: 'provider:alpha',
      modelBKey: 'provider:beta',
      indexable: true,
      eligibilityReason: 'eligible',
      featuredRank: 1,
      sharedMetricCount: 2,
    });

    expect(resolveComparisonPairSlug(models, 'zeta-vs-alpha')).toMatchObject({
      canonicalPairSlug: 'alpha-vs-zeta',
      modelA: { modelKey: 'provider:beta', slug: 'alpha' },
      modelB: { modelKey: 'provider:alpha', slug: 'zeta' },
    });
    expect(() => validateIndexableComparisonPairRoute(models, persisted)).not.toThrow();
  });
  it('validates optional family and variant identities without allowing prohibited source text', () => {
    const withFamily = {
      ...validBatch,
      models: [{ ...validBatch.models[0], familyId: 'gpt-5', variantId: 'sol' }],
    };
    expect(validateNormalizedSourceBatch(withFamily).models[0]).toMatchObject({
      familyId: 'gpt-5',
      variantId: 'sol',
    });
    expect(() => validateNormalizedSourceBatch({
      ...withFamily,
      models: [{ ...withFamily.models[0], familyId: 'Artificial Analysis' }],
    })).toThrow(/prohibited/i);
  });
});


describe('exact-review model policy', () => {
  it('does not fuzzy-match an unreviewed source identifier and creates a stable source-specific key', () => {
    expect(resolveCanonicalModelKey('openrouter', 'OpenAI/GPT-4o')).toBeNull();
    expect(sourceSpecificModelKey('openrouter', 'OpenAI/GPT-4o')).toBe('source:openrouter:OpenAI%2FGPT-4o');
    expect(resolvedModelKey('openrouter', 'OpenAI/GPT-4o')).toBe('source:openrouter:OpenAI%2FGPT-4o');
  });

  it('treats absent checked-in comparison and subscription entries as unverified', () => {
    expect(isEditorialComparisonPair('claude-3-7-sonnet-vs-gpt-4o')).toBe(false);
    expect(subscriptionPlanIdsForModel('openai:gpt-4o')).toEqual([]);
  });

  it.each([
    ['toString', 'source:openrouter:toString'],
    ['constructor', 'source:openrouter:constructor'],
    ['__proto__', 'source:openrouter:__proto__'],
  ])('keeps prototype-like key %s source-specific and unsubscribed', (sourceModelId, expectedKey) => {
    expect(resolveCanonicalModelKey('openrouter', sourceModelId)).toBeNull();
    expect(resolvedModelKey('openrouter', sourceModelId)).toBe(expectedKey);
    expect(subscriptionPlanIdsForModel(sourceModelId)).toEqual([]);
  });

  it.each([
    ['toString', 'name'],
    ['constructor', 'prototype'],
    ['__proto__', 'hasOwnProperty'],
  ])('does not read inherited source map key %s', (sourceId, sourceModelId) => {
    expect(resolveCanonicalModelKey(sourceId as never, sourceModelId)).toBeNull();
  });
});
