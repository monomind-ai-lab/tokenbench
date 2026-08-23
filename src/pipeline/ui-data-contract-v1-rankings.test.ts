import { describe, expect, it } from 'vitest';
import type { EvidenceValue, SourceAttribution } from './ui-data-contract-v1-core';
import type { ModelSummary, TaskFact } from './ui-data-contract-v1-models';
import {
  buildCustomRankingsData,
  normalizeRankingsRequest,
  parseRankingsBody,
  validateRankingsData,
} from './ui-data-contract-v1-rankings';
import { createUiDataContractV1SchemaValidator } from './ui-data-contract-v1-schema';

const source: SourceAttribution = {
  sourceRef: 'livebench:2026-08-01',
  fieldGroup: '/data/rankings',
  sourceId: 'livebench',
  sourceRevision: '2026-08-01',
  label: 'LiveBench 2026-08-01',
  url: 'https://example.test/livebench/2026-08-01',
  licenseId: 'Apache-2.0',
  observedAt: '2026-08-18T00:00:00.000Z',
  effectiveAt: '2026-08-01T00:00:00.000Z',
};

const sources = [source] as const;
const mirrorSource: SourceAttribution = {
  ...source,
  sourceRef: 'livebench:mirror-2026-08-01',
  sourceRevision: 'mirror-2026-08-01',
  label: 'LiveBench mirror 2026-08-01',
  url: 'https://mirror.example.test/livebench/2026-08-01',
};
const allSources = [source, mirrorSource] as const;

function available<T>(value: T): EvidenceValue<T> {
  return { availability: 'available', value, sourceRefs: [source.sourceRef] };
}

function unavailable<T>(reason: string): EvidenceValue<T> {
  return { availability: 'unavailable', value: null, reason, sourceRefs: [source.sourceRef] };
}

function model(slug: string, options: {
  readonly openWeights?: boolean;
  readonly providerId?: string;
  readonly organization?: string;
  readonly isDerivativeFinetune?: boolean;
} = {}): ModelSummary {
  const selectedRoute = {
    routeId: `${slug}-direct`,
    providerId: options.providerId ?? 'openai',
    status: 'available' as const,
    inputMicroDollarsPerMillion: available(2_500_000),
    outputMicroDollarsPerMillion: available(10_000_000),
    cacheReadMicroDollarsPerMillion: available(1_250_000),
    cacheWriteMicroDollarsPerMillion: available(2_500_000),
    contextWindowTokens: available(128_000),
    maxOutputTokens: available(16_384),
    inputModalities: ['text'] as const,
    outputModalities: ['text'] as const,
    ttftP50Ms: available(280),
    tpsP50: available(85),
    uptimeBasisPoints: available(9_999),
    runtimeObservation: available({
      windowStartedAt: '2026-08-17T00:00:00.000Z',
      windowEndedAt: '2026-08-18T00:00:00.000Z',
      sampleSize: 100,
      ttftPercentile: 'p50' as const,
      tpsPercentile: 'p50' as const,
    }),
    pricingTiers: [{
      pricingTierId: 'standard',
      minimumContextTokens: 1,
      maximumContextTokens: null,
      inputMicroDollarsPerMillion: available(2_500_000),
      outputMicroDollarsPerMillion: available(10_000_000),
      cacheReadMicroDollarsPerMillion: available(1_250_000),
      cacheWriteMicroDollarsPerMillion: available(2_500_000),
    }],
  };
  return {
    identity: {
      configurationId: `openai:${slug}`,
      slug,
      displayName: slug.toUpperCase(),
      organization: options.organization ?? 'OpenAI',
    },
    openWeights: available(options.openWeights ?? false),
    isDerivativeFinetune: options.isDerivativeFinetune ?? false,
    baseModelSlug: options.isDerivativeFinetune ? available('base-model') : null,
    overall: {
      dimensionId: 'overall',
      label: 'Overall',
      score: available(87.5),
      rank: available(1),
      fieldSize: available(10),
    },
    categories: [{
      dimensionId: 'coding',
      label: 'Coding',
      score: available(90),
      rank: available(1),
      fieldSize: available(10),
    }],
    selectedRouteId: selectedRoute.routeId,
    selectedRoutePolicy: 'lowest available price',
    selectedRoute,
    lifecycleStatus: available('current'),
  };
}

function taskEconomics(): TaskFact {
  return {
    taskId: 'coding-hard',
    label: 'Coding Hard',
    categoryId: 'coding',
    score: available(90),
    questionCount: available(100),
    evaluationCostUsd: available(1.25),
    inputPriceUsdPerMillion: available(2.5),
    outputPriceUsdPerMillion: available(10),
    equivalentSuccesses: available(90),
    costPerSuccessfulEvaluationUsd: available(0.014),
    meanInputTokens: available(4_000),
    meanOutputTokens: available(800),
  };
}

const dimensionSet = {
  revision: 'livebench-rankings-2026-08-18',
  transformationVersion: 'utility-v1',
  dimensions: [
    {
      dimensionId: 'coding',
      label: 'Coding',
      kind: 'benchmark' as const,
      unit: 'score' as const,
      utilityAnchor: { best: 100, worst: 0, transform: 'identity' as const },
    },
    {
      dimensionId: 'reasoning',
      label: 'Reasoning',
      kind: 'benchmark' as const,
      unit: 'score' as const,
      utilityAnchor: { best: 100, worst: 0, transform: 'identity' as const },
    },
    {
      dimensionId: 'tps',
      label: 'Tokens per second',
      kind: 'tps' as const,
      unit: 'tokens_per_second' as const,
      utilityAnchor: { best: 100, worst: 10, transform: 'log' as const },
    },
  ],
} as const;

function customRequest(
  weights: Readonly<Record<string, number>>,
  overrides: { readonly includeIneligible?: boolean; readonly limit?: number } = {},
) {
  return {
    operation: 'custom' as const,
    dimensionSetRevision: dimensionSet.revision,
    weights: Object.fromEntries(dimensionSet.dimensions.map(({ dimensionId }) => [dimensionId, weights[dimensionId] ?? 0])),
    filters: {
      access: 'all' as const,
      providerIds: [],
      excludeDerivativeFinetunes: false,
      requiredInputModalities: [],
      maxInputMicroDollarsPerMillion: null,
      maxOutputMicroDollarsPerMillion: null,
      minTpsP50: null,
      maxTtftP50Ms: null,
      minContextWindowTokens: null,
      minMaxOutputTokens: null,
    },
    includeIneligible: overrides.includeIneligible ?? true,
    limit: overrides.limit ?? 100,
  };
}

function customRequestWith(values: Record<string, unknown>) {
  return { ...customRequest({ coding: 100 }), ...values };
}

function candidate(slug: string, values: Readonly<Record<string, EvidenceValue<number>>>) {
  return { model: model(slug), values };
}

const candidates = [
  candidate('code-specialist', { coding: available(95), reasoning: available(50), tps: available(80) }),
  candidate('reasoning-specialist', { coding: available(50), reasoning: available(95), tps: available(80) }),
];

const missingTpsCandidate = candidate('missing-tps', {
  coding: available(90),
  reasoning: available(90),
  tps: unavailable('No runtime observation is available.'),
});

const taxonomy = [{
  categoryId: 'coding',
  label: 'Coding',
  tasks: [{ taskId: 'coding-hard', label: 'Coding Hard' }],
}] as const;

function leaderboardData(options: {
  readonly sourceRanks: readonly number[];
  readonly total: number;
  readonly nextCursor: string | null;
  readonly modelSlugs?: readonly string[];
}) {
  return {
    operation: 'leaderboard' as const,
    release: {
      releaseId: 'livebench-2026-08-01',
      releaseOn: '2026-08-01',
      licenseId: 'Apache-2.0' as const,
      sourceRefs: [source.sourceRef],
    },
    taxonomy,
    rows: options.sourceRanks.map((sourceRank, index) => ({
      sourceRank,
      model: model(options.modelSlugs?.[index] ?? `popular-${index + 1}`),
      taskEconomics: [taskEconomics()],
      costPerSuccessfulEvaluationUsd: available(0.014),
      meanOutputTokens: available(800),
      pareto: index === 0,
    })),
    total: options.total,
    nextCursor: options.nextCursor,
  };
}

function customAuthority(data: ReturnType<typeof buildCustomRankingsData>, overrides: {
  readonly expectedTotalEligible?: number;
  readonly expectedTotalIneligible?: number;
} = {}) {
  return {
    operation: 'custom' as const,
    dimensionSet,
    expectedTotalEligible: overrides.expectedTotalEligible ?? data.totalEligible,
    expectedTotalIneligible: overrides.expectedTotalIneligible ?? data.totalIneligible,
  };
}

function leaderboardAuthority(data: ReturnType<typeof leaderboardData>, overrides: {
  readonly resolvedReleaseId?: string;
  readonly authoritativeTaxonomy?: typeof taxonomy;
  readonly authoritativeReleaseSourceRef?: string;
  readonly expectedFilteredTotal?: number;
  readonly expectedOrderedPageModelSlugs?: readonly string[];
  readonly expectedNextCursor?: string | null;
} = {}) {
  return {
    operation: 'leaderboard' as const,
    resolvedReleaseId: overrides.resolvedReleaseId ?? 'livebench-2026-08-01',
    taxonomy: overrides.authoritativeTaxonomy ?? taxonomy,
    authoritativeReleaseSourceRef: overrides.authoritativeReleaseSourceRef ?? source.sourceRef,
    expectedFilteredTotal: overrides.expectedFilteredTotal ?? data.total,
    expectedOrderedPageModelSlugs: overrides.expectedOrderedPageModelSlugs ?? data.rows.map((row) => row.model.identity.slug),
    expectedNextCursor: overrides.expectedNextCursor === undefined ? data.nextCursor : overrides.expectedNextCursor,
  };
}

describe('UI data contract v1 rankings', () => {
  it('keeps Popular Models release, license, taxonomy, rank order, and limit together', () => {
    const request = normalizeRankingsRequest({
      operation: 'leaderboard',
      releaseId: null,
      filters: { organizationIds: [], openWeights: 'all', excludeDerivativeFinetunes: true },
      limit: 2,
      cursor: null,
    });
    const candidateData = leaderboardData({ sourceRanks: [1, 2], total: 3, nextCursor: 'bmV4dA' });
    const data = validateRankingsData(request, candidateData, sources, leaderboardAuthority(candidateData));
    expect(data.operation).toBe('leaderboard');
    if (data.operation !== 'leaderboard') throw new Error('Expected leaderboard data.');
    expect(data.release.licenseId).toBe('Apache-2.0');
    expect(data.rows).toHaveLength(2);
  });

  it('changes the winner with the exact submitted matrix', () => {
    const coding = buildCustomRankingsData(customRequest({ coding: 100, reasoning: 0 }), dimensionSet, candidates);
    const reasoning = buildCustomRankingsData(customRequest({ coding: 0, reasoning: 100 }), dimensionSet, candidates);
    expect(coding.rows[0]?.model.identity.slug).not.toBe(reasoning.rows[0]?.model.identity.slug);
    expect(coding.submittedWeights).toEqual({ coding: 100, reasoning: 0, tps: 0 });
    expect(coding.normalizedWeights).toEqual({ coding: 1, reasoning: 0, tps: 0 });
    expect(coding.rows[0]).toMatchObject({
      total: 95,
      dimensions: expect.arrayContaining([
        expect.objectContaining({ dimensionId: 'coding', utility: 95, contribution: 95 }),
      ]),
    });
    const balanced = buildCustomRankingsData(customRequest({ coding: 50, reasoning: 50 }), dimensionSet, candidates);
    expect(balanced.rows[0]).toMatchObject({
      total: 72.5,
      dimensions: expect.arrayContaining([
        expect.objectContaining({ dimensionId: 'coding', utility: 95, contribution: 47.5 }),
        expect.objectContaining({ dimensionId: 'reasoning', utility: 50, contribution: 25 }),
      ]),
    });
  });

  it('keeps missing zero-weight input eligible but rejects missing positive input', () => {
    const zero = buildCustomRankingsData(customRequest({ coding: 100, tps: 0 }), dimensionSet, [missingTpsCandidate]);
    expect(zero.rows[0]).toMatchObject({
      eligible: true,
      dimensions: expect.arrayContaining([expect.objectContaining({ dimensionId: 'tps', utility: null, contribution: 0 })]),
    });
    const positive = buildCustomRankingsData(customRequest({ coding: 50, tps: 50 }), dimensionSet, [missingTpsCandidate]);
    expect(positive.rows[0]).toMatchObject({ eligible: false, total: null, rank: null, pareto: null });
  });

  it('bounds body, dimensions, duplicate modalities, and final row count', () => {
    expect(() => parseRankingsBody(new Uint8Array(65_537), dimensionSet))
      .toThrowError(expect.objectContaining({ code: 'invalid_request' }));
    expect(() => normalizeRankingsRequest(customRequestWith({
      filters: { ...customRequest({ coding: 100 }).filters, requiredInputModalities: ['image', 'image'] },
    }), dimensionSet)).toThrow();
    expect(buildCustomRankingsData(
      customRequest({ coding: 100 }, { limit: 1, includeIneligible: true }), dimensionSet, candidates,
    ).rows).toHaveLength(1);
  });

  it('rejects incomplete, unknown, and non-positive custom matrices before ranking', () => {
    expect(() => normalizeRankingsRequest({
      ...customRequest({ coding: 100 }),
      weights: { coding: 100, reasoning: 0 },
    }, dimensionSet)).toThrowError(expect.objectContaining({ code: 'invalid_request' }));
    expect(() => normalizeRankingsRequest({
      ...customRequest({ coding: 100 }),
      weights: { coding: 100, reasoning: 0, tps: 0, unknown: 0 },
    }, dimensionSet)).toThrowError(expect.objectContaining({ code: 'invalid_request' }));
    expect(() => normalizeRankingsRequest(customRequest({ coding: 0, reasoning: 0, tps: 0 }), dimensionSet))
      .toThrowError(expect.objectContaining({ code: 'invalid_request' }));
  });

  it.each([
    ['weight minimum', (request: any) => { request.weights = { coding: 0, reasoning: 100, tps: 0 }; }, true],
    ['weight maximum', (request: any) => { request.weights.coding = 100; }, true],
    ['weight below minimum', (request: any) => { request.weights.coding = -1; }, false],
    ['weight above maximum', (request: any) => { request.weights.coding = 101; }, false],
    ['limit minimum', (request: any) => { request.limit = 1; }, true],
    ['limit maximum', (request: any) => { request.limit = 100; }, true],
    ['fractional limit', (request: any) => { request.limit = 1.5; }, false],
    ['limit above maximum', (request: any) => { request.limit = 101; }, false],
    ['input money zero', (request: any) => { request.filters.maxInputMicroDollarsPerMillion = 0; }, true],
    ['input money safe maximum', (request: any) => { request.filters.maxInputMicroDollarsPerMillion = Number.MAX_SAFE_INTEGER; }, true],
    ['negative input money', (request: any) => { request.filters.maxInputMicroDollarsPerMillion = -1; }, false],
    ['fractional input money', (request: any) => { request.filters.maxInputMicroDollarsPerMillion = 0.5; }, false],
    ['unsafe input money', (request: any) => { request.filters.maxInputMicroDollarsPerMillion = Number.MAX_SAFE_INTEGER + 1; }, false],
    ['output money zero', (request: any) => { request.filters.maxOutputMicroDollarsPerMillion = 0; }, true],
    ['output money safe maximum', (request: any) => { request.filters.maxOutputMicroDollarsPerMillion = Number.MAX_SAFE_INTEGER; }, true],
    ['negative output money', (request: any) => { request.filters.maxOutputMicroDollarsPerMillion = -1; }, false],
    ['fractional output money', (request: any) => { request.filters.maxOutputMicroDollarsPerMillion = 0.5; }, false],
    ['unsafe output money', (request: any) => { request.filters.maxOutputMicroDollarsPerMillion = Number.MAX_SAFE_INTEGER + 1; }, false],
    ['TPS minimum', (request: any) => { request.filters.minTpsP50 = 0; }, true],
    ['TPS maximum', (request: any) => { request.filters.minTpsP50 = 1_000_000; }, true],
    ['negative TPS', (request: any) => { request.filters.minTpsP50 = -1; }, false],
    ['TPS above maximum', (request: any) => { request.filters.minTpsP50 = 1_000_000.1; }, false],
    ['TTFT minimum', (request: any) => { request.filters.maxTtftP50Ms = 0; }, true],
    ['TTFT maximum', (request: any) => { request.filters.maxTtftP50Ms = 86_400_000; }, true],
    ['negative TTFT', (request: any) => { request.filters.maxTtftP50Ms = -1; }, false],
    ['fractional TTFT', (request: any) => { request.filters.maxTtftP50Ms = 0.5; }, false],
    ['TTFT above maximum', (request: any) => { request.filters.maxTtftP50Ms = 86_400_001; }, false],
    ['context-token minimum', (request: any) => { request.filters.minContextWindowTokens = 1; }, true],
    ['context-token safe maximum', (request: any) => { request.filters.minContextWindowTokens = Number.MAX_SAFE_INTEGER; }, true],
    ['zero context tokens', (request: any) => { request.filters.minContextWindowTokens = 0; }, false],
    ['fractional context tokens', (request: any) => { request.filters.minContextWindowTokens = 1.5; }, false],
    ['unsafe context tokens', (request: any) => { request.filters.minContextWindowTokens = Number.MAX_SAFE_INTEGER + 1; }, false],
    ['maximum-output-token minimum', (request: any) => { request.filters.minMaxOutputTokens = 1; }, true],
    ['maximum-output-token safe maximum', (request: any) => { request.filters.minMaxOutputTokens = Number.MAX_SAFE_INTEGER; }, true],
    ['zero maximum-output tokens', (request: any) => { request.filters.minMaxOutputTokens = 0; }, false],
    ['fractional maximum-output tokens', (request: any) => { request.filters.minMaxOutputTokens = 1.5; }, false],
    ['unsafe maximum-output tokens', (request: any) => { request.filters.minMaxOutputTokens = Number.MAX_SAFE_INTEGER + 1; }, false],
  ])('matches JSON Schema numeric semantics for custom ranking $0', (_label, mutate, accepted) => {
    const request = structuredClone(customRequest({ coding: 100 })) as any;
    mutate(request);
    const validate = createUiDataContractV1SchemaValidator('#/$defs/customRankingsRequest');

    expect(validate(request)).toBe(accepted);
    if (accepted) {
      expect(normalizeRankingsRequest(request, dimensionSet)).toMatchObject(request);
    } else {
      expect(() => normalizeRankingsRequest(request, dimensionSet))
        .toThrowError(expect.objectContaining({ code: 'invalid_request' }));
    }
  });

  it('matches JSON Schema Unicode identifier lengths and unbounded ranking labels', () => {
    const astralRevision = `${'r'.repeat(255)}😀`;
    const astralDimensionSet = { ...dimensionSet, revision: astralRevision };
    const astralRequest = {
      ...customRequest({ coding: 100 }),
      dimensionSetRevision: astralRevision,
    };
    const validateRequest = createUiDataContractV1SchemaValidator('#/$defs/customRankingsRequest');

    expect(Array.from(astralRevision)).toHaveLength(256);
    expect(astralRevision).toHaveLength(257);
    expect(validateRequest(astralRequest)).toBe(true);
    expect(normalizeRankingsRequest(astralRequest, astralDimensionSet)).toMatchObject(astralRequest);

    const request = normalizeRankingsRequest(customRequest({ coding: 100 }), dimensionSet);
    if (request.operation !== 'custom') throw new Error('Expected a custom request.');
    const data = structuredClone(buildCustomRankingsData(request, dimensionSet, [candidates[0]!])) as any;
    data.dimensionSet.dimensions[0].label = 'L'.repeat(257);
    const validateData = createUiDataContractV1SchemaValidator('#/$defs/customRankingsData');

    expect(validateData(data)).toBe(true);
    expect(validateRankingsData(request, data, sources, {
      operation: 'custom',
      dimensionSet: data.dimensionSet,
      expectedTotalEligible: data.totalEligible,
      expectedTotalIneligible: data.totalIneligible,
    })).toEqual(data);
  });

  it('rejects wrong revisions, excessive dimensions, and invalid weight values', () => {
    expect(() => normalizeRankingsRequest({
      ...customRequest({ coding: 100 }),
      dimensionSetRevision: 'wrong-revision',
    }, dimensionSet)).toThrowError(expect.objectContaining({ code: 'invalid_request' }));

    const excessiveDimensionSet = {
      revision: 'too-many-dimensions',
      transformationVersion: 'utility-v1',
      dimensions: Array.from({ length: 33 }, (_, index) => ({
        dimensionId: `dimension-${index + 1}`,
        label: `Dimension ${index + 1}`,
        kind: 'benchmark' as const,
        unit: 'score' as const,
        utilityAnchor: { best: 100, worst: 0, transform: 'identity' as const },
      })),
    };
    expect(() => normalizeRankingsRequest({
      ...customRequest({ coding: 100 }),
      dimensionSetRevision: excessiveDimensionSet.revision,
      weights: Object.fromEntries(excessiveDimensionSet.dimensions.map((dimension, index) => [dimension.dimensionId, index === 0 ? 100 : 0])),
    }, excessiveDimensionSet)).toThrowError(expect.objectContaining({ code: 'invalid_request' }));

    for (const weight of [-1, Number.NaN, Number.POSITIVE_INFINITY, 101]) {
      expect(() => normalizeRankingsRequest({
        ...customRequest({ coding: 100 }),
        weights: { coding: weight, reasoning: 0, tps: 0 },
      }, dimensionSet)).toThrowError(expect.objectContaining({ code: 'invalid_request' }));
    }
  });

  it('keeps rank ties deterministic, computes Pareto only from positive dimensions, and slices after ordering', () => {
    const ties = buildCustomRankingsData(customRequest({ coding: 100 }), dimensionSet, [
      candidate('zeta', { coding: available(80), reasoning: available(0), tps: available(10) }),
      candidate('alpha', { coding: available(80), reasoning: available(100), tps: available(100) }),
      candidate('middle', { coding: available(70), reasoning: available(100), tps: available(100) }),
    ]);
    expect(ties.rows.map((row) => [row.model.identity.slug, row.rank, row.pareto])).toEqual([
      ['alpha', 1, true],
      ['zeta', 1, true],
      ['middle', 3, false],
    ]);

    const ordered = buildCustomRankingsData(customRequest({ coding: 100, tps: 100 }, { limit: 1, includeIneligible: true }), dimensionSet, [
      candidate('a-missing', { coding: available(100), reasoning: available(0), tps: unavailable('No runtime observation is available.') }),
      candidate('z-eligible', { coding: available(10), reasoning: available(0), tps: available(10) }),
    ]);
    expect(ordered.rows.map((row) => row.model.identity.slug)).toEqual(['z-eligible']);
    expect(ordered).toMatchObject({ totalEligible: 1, totalIneligible: 1, truncated: true });
  });

  it('validates exact custom output totals, anchors, source evidence, and response limits', () => {
    const request = normalizeRankingsRequest(customRequest({ coding: 50, reasoning: 50 }), dimensionSet);
    if (request.operation !== 'custom') throw new Error('Expected custom request.');
    const data = buildCustomRankingsData(request, dimensionSet, candidates);
    const authority = customAuthority(data);
    expect(validateRankingsData(request, data, sources, authority)).toEqual(data);
    expect(data.rows.every((row) => Math.abs((row.dimensions.reduce((sum, dimension) => sum + (dimension.contribution ?? 0), 0)) - (row.total ?? 0)) < 1e-9)).toBe(true);

    expect(() => validateRankingsData(request, {
      ...data,
      rows: data.rows.slice(0, 1),
      truncated: false,
    }, sources, authority)).toThrowError(expect.objectContaining({ code: 'invalid_response' }));
    expect(() => validateRankingsData(request, {
      ...data,
      dimensionSet: {
        ...data.dimensionSet,
        dimensions: [{ ...data.dimensionSet.dimensions[0], utilityAnchor: null }, ...data.dimensionSet.dimensions.slice(1)],
      },
    }, sources, authority)).toThrowError(expect.objectContaining({ code: 'invalid_response' }));
  });

  it.each([
    {
      name: 'access',
      filters: { access: 'open_weights' },
      prepare: (entry: any) => { entry.model.openWeights.value = true; },
      mutate: (row: any) => { row.model.openWeights.value = false; },
    },
    {
      name: 'provider',
      filters: { providerIds: ['openai'] },
      prepare: () => {},
      mutate: (row: any) => { row.model.selectedRoute.providerId = 'other-provider'; },
    },
    {
      name: 'derivative',
      filters: { excludeDerivativeFinetunes: true },
      prepare: () => {},
      mutate: (row: any) => {
        row.model.isDerivativeFinetune = true;
        row.model.baseModelSlug = available('base-model');
      },
    },
    {
      name: 'input modality',
      filters: { requiredInputModalities: ['image'] },
      prepare: (entry: any) => { entry.model.selectedRoute.inputModalities = ['text', 'image']; },
      mutate: (row: any) => { row.model.selectedRoute.inputModalities = ['text']; },
    },
    {
      name: 'input price',
      filters: { maxInputMicroDollarsPerMillion: 2_500_000 },
      prepare: () => {},
      mutate: (row: any) => { row.model.selectedRoute.inputMicroDollarsPerMillion.value = 2_500_001; },
    },
    {
      name: 'output price',
      filters: { maxOutputMicroDollarsPerMillion: 10_000_000 },
      prepare: () => {},
      mutate: (row: any) => { row.model.selectedRoute.outputMicroDollarsPerMillion.value = 10_000_001; },
    },
    {
      name: 'TTFT runtime',
      filters: { maxTtftP50Ms: 280 },
      prepare: () => {},
      mutate: (row: any) => { row.model.selectedRoute.ttftP50Ms.value = 281; },
    },
    {
      name: 'TPS runtime',
      filters: { minTpsP50: 85 },
      prepare: () => {},
      mutate: (row: any) => { row.model.selectedRoute.tpsP50.value = 84; },
    },
    {
      name: 'context window',
      filters: { minContextWindowTokens: 128_000 },
      prepare: () => {},
      mutate: (row: any) => { row.model.selectedRoute.contextWindowTokens.value = 127_999; },
    },
    {
      name: 'maximum output tokens',
      filters: { minMaxOutputTokens: 16_384 },
      prepare: () => {},
      mutate: (row: any) => { row.model.selectedRoute.maxOutputTokens.value = 16_383; },
    },
  ])('rejects a custom response row excluded by the submitted $name filter at the runtime boundary', ({ filters, prepare, mutate }) => {
    const candidateForFilter = structuredClone(candidates[0]!) as any;
    candidateForFilter.model = model('filter-candidate', {
      openWeights: true,
      providerId: 'openai',
      isDerivativeFinetune: false,
    });
    prepare(candidateForFilter);
    const request = normalizeRankingsRequest({
      ...customRequest({ coding: 100 }),
      filters: { ...customRequest({ coding: 100 }).filters, ...filters },
    }, dimensionSet);
    if (request.operation !== 'custom') throw new Error('Expected a custom request.');
    const data = buildCustomRankingsData(request, dimensionSet, [candidateForFilter]);
    const response = structuredClone(data) as any;
    mutate(response.rows[0]);

    expect(() => validateRankingsData(request, response, sources, customAuthority(data)))
      .toThrowError(expect.objectContaining({ code: 'invalid_response' }));
  });

  it('binds every custom dimension-set fact to published authority', () => {
    const request = normalizeRankingsRequest(customRequest({ coding: 100 }), dimensionSet);
    if (request.operation !== 'custom') throw new Error('Expected custom request.');
    const data = buildCustomRankingsData(request, dimensionSet, [candidates[0]!]);
    const authority = customAuthority(data);
    const codingResult = data.rows[0]!.dimensions[0]!;
    const selfConsistentAnchorSubstitution = {
      ...data,
      dimensionSet: {
        ...data.dimensionSet,
        dimensions: [{
          ...data.dimensionSet.dimensions[0]!,
          utilityAnchor: { best: 200, worst: 0, transform: 'identity' as const },
        }, ...data.dimensionSet.dimensions.slice(1)],
      },
      rows: [{
        ...data.rows[0]!,
        total: 47.5,
        dimensions: [{ ...codingResult, utility: 47.5, contribution: 47.5 }, ...data.rows[0]!.dimensions.slice(1)],
      }],
    };
    const selfConsistentKindAndUnitSubstitution = {
      ...data,
      dimensionSet: {
        ...data.dimensionSet,
        dimensions: [{
          ...data.dimensionSet.dimensions[0]!,
          kind: 'tps' as const,
          unit: 'tokens_per_second' as const,
          utilityAnchor: { best: 100, worst: 10, transform: 'log' as const },
        }, ...data.dimensionSet.dimensions.slice(1)],
      },
      rows: [{
        ...data.rows[0]!,
        total: 97.77236052888476,
        dimensions: [{
          ...codingResult,
          utility: 97.77236052888476,
          contribution: 97.77236052888476,
        }, ...data.rows[0]!.dimensions.slice(1)],
      }],
    };
    for (const candidateData of [
      { ...data, dimensionSet: { ...data.dimensionSet, revision: 'substituted-revision' } },
      { ...data, dimensionSet: { ...data.dimensionSet, transformationVersion: 'substituted-utility-v2' } },
      { ...data, dimensionSet: { ...data.dimensionSet, dimensions: [{ ...data.dimensionSet.dimensions[0]!, label: 'Substituted' }, ...data.dimensionSet.dimensions.slice(1)] } },
      selfConsistentAnchorSubstitution,
      selfConsistentKindAndUnitSubstitution,
    ]) {
      expect(() => validateRankingsData(request, candidateData, sources, authority))
        .toThrowError(expect.objectContaining({ code: 'invalid_response' }));
    }
  });

  it('rejects authority dimensions outside their kind-specific numeric domain', () => {
    const outOfRangeDimensionSet = {
      ...dimensionSet,
      dimensions: [{
        ...dimensionSet.dimensions[0],
        utilityAnchor: { best: 101, worst: 0, transform: 'identity' as const },
      }, ...dimensionSet.dimensions.slice(1)],
    };
    const request = normalizeRankingsRequest(customRequest({ coding: 100 }), dimensionSet);
    if (request.operation !== 'custom') throw new Error('Expected custom request.');
    const data = buildCustomRankingsData(request, dimensionSet, [candidates[0]!]);
    const authority = {
      operation: 'custom' as const,
      dimensionSet: outOfRangeDimensionSet,
      expectedTotalEligible: data.totalEligible,
      expectedTotalIneligible: data.totalIneligible,
    };

    expect(() => validateRankingsData(request, data, sources, authority))
      .toThrowError(expect.objectContaining({ code: 'invalid_response' }));
  });

  it('rejects false ineligibility and binds counts and truncation to custom authority', () => {
    const request = normalizeRankingsRequest(customRequest({ coding: 100 }), dimensionSet);
    if (request.operation !== 'custom') throw new Error('Expected custom request.');
    const data = buildCustomRankingsData(request, dimensionSet, [candidates[0]!]);
    const falselyIneligible = {
      ...data,
      rows: [{
        ...data.rows[0]!,
        dimensions: data.rows[0]!.dimensions.map((dimension) => (
          dimension.dimensionId === 'coding' ? { ...dimension, utility: null, contribution: null } : dimension
        )),
        total: null,
        rank: null,
        pareto: null,
        eligible: false,
        ineligibilityReasons: ['Claimed unavailable input.'],
      }],
      totalEligible: 0,
      totalIneligible: 1,
      truncated: false,
    };
    expect(() => validateRankingsData(request, falselyIneligible, sources, customAuthority(falselyIneligible)))
      .toThrowError(expect.objectContaining({ code: 'invalid_response' }));
    expect(() => validateRankingsData(request, falselyIneligible, sources, customAuthority(data)))
      .toThrowError(expect.objectContaining({ code: 'invalid_response' }));

    const eligibleOnlyRequest = normalizeRankingsRequest(
      customRequest({ coding: 100, tps: 100 }, { includeIneligible: false }), dimensionSet,
    );
    if (eligibleOnlyRequest.operation !== 'custom') throw new Error('Expected custom request.');
    const eligibleOnly = buildCustomRankingsData(eligibleOnlyRequest, dimensionSet, [candidates[0]!, missingTpsCandidate]);
    const authority = customAuthority(eligibleOnly);
    for (const candidateData of [
      { ...eligibleOnly, totalEligible: eligibleOnly.totalEligible + 1 },
      { ...eligibleOnly, totalIneligible: eligibleOnly.totalIneligible + 1 },
      { ...eligibleOnly, truncated: true },
      { ...eligibleOnly, rows: [] },
    ]) {
      expect(() => validateRankingsData(eligibleOnlyRequest, candidateData, sources, authority))
        .toThrowError(expect.objectContaining({ code: 'invalid_response' }));
    }
  });

  it('rejects an ineligible visible row when authority declares only eligible rows', () => {
    const request = normalizeRankingsRequest(
      customRequest({ coding: 50, tps: 50 }, { includeIneligible: true, limit: 1 }), dimensionSet,
    );
    if (request.operation !== 'custom') throw new Error('Expected custom request.');
    const ineligible = buildCustomRankingsData(request, dimensionSet, [missingTpsCandidate]);
    const contradictory = {
      ...ineligible,
      totalEligible: 1,
      totalIneligible: 0,
      truncated: false,
    };

    expect(() => validateRankingsData(request, contradictory, sources, customAuthority(contradictory)))
      .toThrowError(expect.objectContaining({ code: 'invalid_response' }));
  });

  it('requires a truncated visible page to preserve the complete eligible prefix', () => {
    const request = normalizeRankingsRequest(
      customRequest({ coding: 50, tps: 50 }, { includeIneligible: true, limit: 2 }), dimensionSet,
    );
    if (request.operation !== 'custom') throw new Error('Expected custom request.');
    const canonical = buildCustomRankingsData(request, dimensionSet, [...candidates, missingTpsCandidate]);
    const full = buildCustomRankingsData(
      { ...request, limit: 3 }, dimensionSet, [...candidates, missingTpsCandidate],
    );
    const wrongPrefix = {
      ...canonical,
      rows: [canonical.rows[0]!, full.rows[2]!],
    };

    expect(canonical).toMatchObject({ totalEligible: 2, totalIneligible: 1, truncated: true });
    expect(() => validateRankingsData(request, wrongPrefix, sources, customAuthority(canonical)))
      .toThrowError(expect.objectContaining({ code: 'invalid_response' }));
  });

  it('requires leaderboard pagination and filters to bind to the returned rows', () => {
    const request = normalizeRankingsRequest({
      operation: 'leaderboard',
      releaseId: 'livebench-2026-08-01',
      filters: { organizationIds: ['OpenAI'], openWeights: 'exclude', excludeDerivativeFinetunes: true },
      limit: 2,
      cursor: 'cHJldg',
    });
    const data = leaderboardData({ sourceRanks: [1, 2], total: 2, nextCursor: null });
    const authority = leaderboardAuthority(data);
    const result = validateRankingsData(request, data, sources, authority);
    if (result.operation !== 'leaderboard') throw new Error('Expected leaderboard data.');
    expect(result.nextCursor).toBeNull();
    expect(() => validateRankingsData(request, { ...data, nextCursor: 'bmV4dA' }, sources, authority))
      .toThrowError(expect.objectContaining({ code: 'invalid_response' }));
    expect(() => validateRankingsData(request, {
      ...data,
      rows: [{ ...data.rows[0], sourceRank: 2 }, { ...data.rows[1], sourceRank: 1 }],
    }, sources, authority)).toThrowError(expect.objectContaining({ code: 'invalid_response' }));
  });

  it.each([
    ['cost per successful evaluation above one billion USD', (data: any) => {
      data.rows[0].costPerSuccessfulEvaluationUsd.value = 1_000_000_001;
    }],
    ['fractional mean output tokens', (data: any) => {
      data.rows[0].meanOutputTokens.value = 1.5;
    }],
  ])('rejects leaderboard %s', (_name, mutate) => {
    const request = normalizeRankingsRequest({
      operation: 'leaderboard',
      releaseId: null,
      filters: { organizationIds: [], openWeights: 'all', excludeDerivativeFinetunes: false },
      limit: 1,
      cursor: null,
    });
    const data = leaderboardData({ sourceRanks: [1], total: 1, nextCursor: null });
    const authority = leaderboardAuthority(data);
    mutate(data);

    expect(() => validateRankingsData(request, data, sources, authority))
      .toThrowError(expect.objectContaining({ code: 'invalid_response' }));
  });

  it('binds resolved release, complete taxonomy, source, filtered total, page, and cursor to leaderboard authority', () => {
    const request = normalizeRankingsRequest({
      operation: 'leaderboard',
      releaseId: null,
      filters: { organizationIds: [], openWeights: 'all', excludeDerivativeFinetunes: false },
      limit: 2,
      cursor: null,
    });
    const data = leaderboardData({ sourceRanks: [1, 2], total: 3, nextCursor: 'bmV4dA' });
    const authority = leaderboardAuthority(data);
    expect(validateRankingsData(request, data, allSources, authority)).toEqual(data);

    const extraTaxonomy = [...taxonomy, {
      categoryId: 'reasoning',
      label: 'Reasoning',
      tasks: [{ taskId: 'reasoning-hard', label: 'Reasoning Hard' }],
    }];
    for (const candidateData of [
      { ...data, release: { ...data.release, releaseId: 'livebench-2026-07-01' } },
      { ...data, taxonomy: extraTaxonomy },
      { ...data, release: { ...data.release, sourceRefs: [mirrorSource.sourceRef] } },
      { ...data, total: 4 },
      leaderboardData({ sourceRanks: [1, 2], total: 3, nextCursor: 'bmV4dA', modelSlugs: ['other-1', 'other-2'] }),
      { ...data, nextCursor: 'bmV4dB' },
    ]) {
      expect(() => validateRankingsData(request, candidateData, allSources, authority))
        .toThrowError(expect.objectContaining({ code: 'invalid_response' }));
    }
  });

  it('enforces every leaderboard filter and validates a resumable cursor page', () => {
    const filteredRequest = normalizeRankingsRequest({
      operation: 'leaderboard',
      releaseId: 'livebench-2026-08-01',
      filters: { organizationIds: ['OpenAI'], openWeights: 'exclude', excludeDerivativeFinetunes: true },
      limit: 1,
      cursor: null,
    });
    const filteredData = leaderboardData({ sourceRanks: [1], total: 1, nextCursor: null });
    const filteredAuthority = leaderboardAuthority(filteredData);
    expect(validateRankingsData(filteredRequest, filteredData, sources, filteredAuthority)).toEqual(filteredData);
    for (const invalidModel of [
      model('wrong-organization', { organization: 'Other' }),
      model('open-model', { openWeights: true }),
      model('derivative-model', { isDerivativeFinetune: true }),
    ]) {
      expect(() => validateRankingsData(filteredRequest, {
        ...filteredData,
        rows: [{ ...filteredData.rows[0]!, model: invalidModel }],
      }, sources, filteredAuthority)).toThrowError(expect.objectContaining({ code: 'invalid_response' }));
    }

    const resumedRequest = normalizeRankingsRequest({
      operation: 'leaderboard',
      releaseId: null,
      filters: { organizationIds: [], openWeights: 'all', excludeDerivativeFinetunes: false },
      limit: 2,
      cursor: 'bmV4dA',
    });
    const resumedData = leaderboardData({ sourceRanks: [3], total: 3, nextCursor: null, modelSlugs: ['popular-3'] });
    const resumedAuthority = leaderboardAuthority(resumedData);
    expect(validateRankingsData(resumedRequest, resumedData, sources, resumedAuthority)).toEqual(resumedData);
    const repeatedPage = leaderboardData({ sourceRanks: [2], total: 3, nextCursor: null, modelSlugs: ['popular-2'] });
    expect(() => validateRankingsData(resumedRequest, repeatedPage, sources, resumedAuthority))
      .toThrowError(expect.objectContaining({ code: 'invalid_response' }));
  });

  it('exposes rankings from the public contract boundary', async () => {
    const contract = await import('./ui-data-contract-v1');
    expect(contract.buildCustomRankingsData).toBe(buildCustomRankingsData);
  });
});
