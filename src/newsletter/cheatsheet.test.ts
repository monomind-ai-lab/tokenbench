import { describe, expect, it } from 'vitest';
import type { BenchmarkProjectionSnapshot } from '../benchmarks/api-projections';
import type {
  BenchmarkComparisonPair,
  BenchmarkMetric,
  BenchmarkModel,
  BenchmarkPriceCheck,
  BenchmarkRevision,
  BenchmarkSourceRecord,
} from '../benchmarks/contracts';
import type { CatalogResponse } from '../catalog/contracts';
import type { RevisionChanges } from './revision-diff';
import {
  buildCheatsheet,
  normalizePdfMetadata,
  renderCheatsheetCsv,
  renderCheatsheetHtml,
  renderNewsletterHtml,
  subjectPreviewSet,
} from './cheatsheet';

type FrozenSnapshot = BenchmarkProjectionSnapshot & { readonly revision: BenchmarkRevision };

const SHA = `sha256:${'a'.repeat(64)}`;

function source(overrides: Partial<BenchmarkSourceRecord> = {}): BenchmarkSourceRecord {
  return {
    sourceId: 'benchlm',
    artifactId: 'benchlm-fixture',
    sourceUrl: 'https://example.test/benchlm',
    observedAt: '2026-08-01T00:00:00.000Z',
    etag: null,
    lastModified: null,
    upstreamRevision: null,
    schemaVersion: 'fixture-v1',
    snapshotKey: 'fixtures/benchlm.json',
    contentHash: SHA,
    originalContentHash: SHA,
    licenseId: 'MIT',
    attributionText: 'Fixture BenchLM evidence',
    ...overrides,
  };
}

function model(overrides: Partial<BenchmarkModel> = {}): BenchmarkModel {
  return {
    modelKey: 'fixture:alpha',
    slug: 'alpha',
    name: 'Alpha <trusted>',
    creator: 'Fixture Labs',
    sourceType: 'Proprietary',
    reasoningType: null,
    releaseDate: null,
    contextWindowTokens: 65_536,
    evidenceStatus: 'supported',
    rankingEligible: true,
    confidenceLower: null,
    confidenceUpper: null,
    benchmarkCount: 6,
    sourceId: 'benchlm',
    sourceModelId: 'alpha',
    sourceArtifactId: 'benchlm-fixture',
    ...overrides,
  };
}

function metric(overrides: Partial<BenchmarkMetric> = {}): BenchmarkMetric {
  return {
    modelKey: 'fixture:alpha',
    metricKey: 'benchlm:overall:raw',
    category: 'overall',
    value: 91.5,
    rawValue: null,
    rank: null,
    lower: null,
    upper: null,
    voteCount: null,
    unit: 'score',
    sourceId: 'benchlm',
    sourceUpdatedAt: '2026-08-01T00:00:00.000Z',
    sourceModelId: 'alpha',
    sourceArtifactId: 'benchlm-fixture',
    rankingEligible: true,
    methodology: 'benchlm_raw_composite',
    observationCount: null,
    sessionCount: null,
    ...overrides,
  };
}

function price(overrides: Partial<BenchmarkPriceCheck> = {}): BenchmarkPriceCheck {
  return {
    modelKey: 'fixture:alpha',
    sourceId: 'openrouter',
    providerId: 'openai',
    inputUsdPerMillion: 1.25,
    cachedInputUsdPerMillion: null,
    outputUsdPerMillion: 5.5,
    contextWindowTokens: 128_000,
    verificationStatus: 'primary',
    routeId: 'openrouter:alpha',
    sourceModelId: 'alpha',
    canonicalSlug: 'alpha',
    maxInputTokens: null,
    maxOutputTokens: null,
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportedParameters: [],
    sourceArtifactId: 'catalog:catalog_fixture',
    ...overrides,
  };
}

function catalogOffer(
  providerId: 'openai' | 'anthropic',
  modelId: string,
  routeId: string,
): CatalogResponse['modelOffers'][number] {
  return {
    id: routeId,
    providerId,
    displayName: modelId,
    modelId,
    pricingBasis: 'openrouter',
    route: 'openrouter',
    currency: 'USD',
    unit: 'micro_dollars_per_million_tokens',
    inputMicroDollarsPerMillion: 1_250_000,
    outputMicroDollarsPerMillion: 5_500_000,
    contextWindowTokens: 128_000,
    sourceId: 'openrouter-models',
  };
}

function revision(): BenchmarkRevision {
  return {
    revision: 'benchmark_fixture',
    generatedAt: '2026-08-01T00:00:00.000Z',
    publishedAt: '2026-08-01T00:00:00.000Z',
    checkedAt: '2026-08-01T00:00:00.000Z',
    publicationState: 'published',
    contentHash: SHA,
    catalogRevision: 'catalog_fixture',
    openrouterContentHash: SHA,
  };
}

function benchmarkFixture(overrides: Partial<FrozenSnapshot> = {}): FrozenSnapshot {
  const alpha = model();
  const beta = model({
    modelKey: 'fixture:beta', slug: 'beta', name: '=unsafe formula', sourceModelId: 'beta', contextWindowTokens: 32_768,
  });
  const estimated = model({
    modelKey: 'fixture:estimated', slug: 'estimated', name: 'Estimated', sourceModelId: 'estimated', evidenceStatus: 'estimated',
  });
  return {
    revision: revision(),
    sources: [
      source(),
      source({
        sourceId: 'lmarena', artifactId: 'lmarena-fixture', sourceUrl: 'https://example.test/lmarena',
        licenseId: 'CC-BY-4.0', attributionText: 'Fixture LMArena evidence', snapshotKey: 'fixtures/lmarena.json',
      }),
      source({
        sourceId: 'openrouter', artifactId: 'catalog:catalog_fixture', sourceUrl: 'https://example.test/catalog',
        licenseId: 'OpenRouter-ToS', attributionText: 'Fixture catalog evidence', snapshotKey: 'fixtures/catalog.json',
        upstreamRevision: 'catalog_fixture', contentHash: SHA, originalContentHash: SHA,
      }),
    ],
    models: [alpha, beta, alpha, estimated],
    metrics: [
      metric(),
      metric({ modelKey: beta.modelKey, sourceModelId: 'beta', value: 89 }),
      metric({ modelKey: estimated.modelKey, sourceModelId: 'estimated', value: 99 }),
      metric({ metricKey: 'benchlm:category:agentic', category: 'agentic', value: 88 }),
      metric({ metricKey: 'benchlm:category:coding', category: 'coding', value: 87 }),
      metric({ metricKey: 'benchlm:category:reasoning', category: 'reasoning', value: 86 }),
      metric({ metricKey: 'benchlm:category:knowledge', category: 'knowledge', value: 85 }),
      metric({ metricKey: 'benchlm:category:multimodalGrounded', category: 'multimodalGrounded', value: 84 }),
      metric({
        metricKey: 'lmarena:vision_style_control:overall', category: 'multimodal', value: 1234, rank: 7,
        unit: 'arena_score', sourceId: 'lmarena', sourceModelId: 'alpha-lmarena',
        sourceArtifactId: 'lmarena-fixture', methodology: 'bradley_terry',
      }),
    ],
    priceChecks: [price()],
    comparisonPairs: [] as BenchmarkComparisonPair[],
    ...overrides,
  };
}

function catalogFixture(overrides: Partial<CatalogResponse> = {}): CatalogResponse {
  return {
    revision: 'catalog_fixture',
    publishedAt: '2026-08-01T00:00:00.000Z',
    freshness: { status: 'fresh', checkedAt: '2026-08-01T00:00:00.000Z' },
    plans: [],
    modelOffers: [catalogOffer('openai', 'alpha', 'openrouter:alpha')],
    provenance: [{
      id: 'openrouter-models',
      providerId: 'openrouter',
      sourceUrl: 'https://example.test/catalog',
      observedAt: '2026-08-01T00:00:00.000Z',
      sourceKind: 'official_json',
      confidence: 'official',
      snapshotKey: 'fixtures/catalog.json',
      contentHash: SHA,
      parserVersion: 'fixture-v1',
      reviewStatus: 'verified',
    }],
    ...overrides,
  };
}

function changesFixture(overrides: Partial<RevisionChanges> = {}): RevisionChanges {
  return {
    fromRevision: 'benchmark_previous',
    toRevision: 'benchmark_fixture',
    dedupeKey: 'fixture-dedupe',
    newModels: [{ id: 'new-alpha', modelKey: 'fixture:new-model' }],
    priceDrops: [{
      id: 'price-alpha',
      modelKey: 'fixture:alpha',
      providerId: 'openai',
      routeId: 'openrouter:alpha',
      previousInputUsdPerMillion: 2,
      currentInputUsdPerMillion: 1.25,
      previousOutputUsdPerMillion: 6,
      currentOutputUsdPerMillion: 5.5,
    }],
    ...overrides,
  };
}

describe('monthly cheatsheet facts', () => {
  it.each([
    ['openai', 'openai/gpt-alpha', 'openrouter:openai/gpt-alpha'],
    ['anthropic', 'anthropic/claude-alpha', 'openrouter:anthropic/claude-alpha'],
  ] as const)('accepts %s as the model-owner provider on a bound OpenRouter route', (providerId, sourceModelId, routeId) => {
    const snapshot = benchmarkFixture({
      priceChecks: [price({ providerId, sourceModelId, routeId, canonicalSlug: sourceModelId })],
    });
    const catalog = catalogFixture({
      modelOffers: [catalogOffer(providerId, sourceModelId, routeId)],
    });

    expect(buildCheatsheet(snapshot, catalog).categories[0].entries[0]).toMatchObject({
      modelKey: 'fixture:alpha',
      routeId,
      inputUsdPerMillion: 1.25,
      outputUsdPerMillion: 5.5,
    });
  });

  it.each([
    ['missing route', []],
    ['wrong owner provider', [{ ...catalogOffer('openai', 'alpha', 'openrouter:alpha'), providerId: 'anthropic' }]],
    ['wrong source model', [{ ...catalogOffer('openai', 'alpha', 'openrouter:alpha'), modelId: 'openai/other' }]],
    ['wrong exact input rate', [{ ...catalogOffer('openai', 'alpha', 'openrouter:alpha'), inputMicroDollarsPerMillion: 9_000_000 }]],
    ['wrong cached-input availability', [{ ...catalogOffer('openai', 'alpha', 'openrouter:alpha'), cachedInputMicroDollarsPerMillion: 0 }]],
    ['wrong route context', [{ ...catalogOffer('openai', 'alpha', 'openrouter:alpha'), contextWindowTokens: 64_000 }]],
  ] as const)('fails closed when the bound OpenRouter price has a %s in the catalog artifact', (_label, modelOffers) => {
    expect(() => buildCheatsheet(benchmarkFixture(), catalogFixture({ modelOffers: [...modelOffers] })))
      .toThrow(/OpenRouter price.*catalog offer/i);
  });

  it('builds supported, deduplicated top-ten rows in the approved category order', () => {
    const document = buildCheatsheet(benchmarkFixture(), catalogFixture());

    expect(document.revision).toBe('benchmark_fixture');
    expect(document.categories.map((category) => category.key)).toEqual([
      'llm-overall',
      'llm-agentic',
      'llm-coding',
      'llm-reasoning',
      'multimodal-vision-documents',
      'llm-knowledge',
    ]);
    expect(document.categories.map((category) => category.status)).toEqual([
      'validated-ranking', 'validated-ranking', 'validated-ranking',
      'evidence-lens', 'evidence-lens', 'evidence-lens',
    ]);
    expect(document.categories.map((category) => category.positionLabel)).toEqual([
      'TokenBench category rank', 'TokenBench category rank', 'TokenBench category rank',
      'Evidence position', 'Evidence position', 'Evidence position',
    ]);
    expect(document.categories.every((category) => category.entries.length <= 10)).toBe(true);
    expect(document.categories.flatMap((category) => category.entries).every((entry) => entry.evidenceStatus === 'supported')).toBe(true);
    expect(document.categories[0].entries).toEqual(expect.arrayContaining([expect.objectContaining({
      rank: 1,
      modelKey: 'fixture:alpha',
      inputUsdPerMillion: 1.25,
      outputUsdPerMillion: 5.5,
      contextWindowTokens: 128_000,
      routeId: 'openrouter:alpha',
    })]));
    expect(document.categories[0].entries.filter((entry) => entry.modelKey === 'fixture:alpha')).toHaveLength(1);
    expect(document.categories[0].entries.find((entry) => entry.modelKey === 'fixture:beta'))
      .toMatchObject({ inputUsdPerMillion: null, outputUsdPerMillion: null, contextWindowTokens: 32_768, routeId: null });
  });

  it('preserves every multimodal evidence lens and keeps source ranks separate from evidence positions', () => {
    const document = buildCheatsheet(benchmarkFixture(), catalogFixture());
    const multimodal = document.categories.find((category) => category.key === 'multimodal-vision-documents');
    const alpha = multimodal?.entries.find((entry) => entry.modelKey === 'fixture:alpha');

    expect(multimodal).toMatchObject({ status: 'evidence-lens', positionLabel: 'Evidence position' });
    expect(alpha?.lenses).toEqual([
      expect.objectContaining({
        metricKey: 'benchlm:category:multimodalGrounded', score: 84, methodologyLabel: 'BenchLM raw composite', sourceRank: null,
      }),
      expect.objectContaining({
        metricKey: 'lmarena:vision_style_control:overall', score: 1234,
        methodologyLabel: 'LMArena Bradley-Terry', sourceRank: 7,
      }),
    ]);
  });

  it.each([
    ['benchmark hash', benchmarkFixture({ revision: { ...revision(), openrouterContentHash: `sha256:${'b'.repeat(64)}` } }), catalogFixture()],
    ['upstream revision', benchmarkFixture({
      sources: benchmarkFixture().sources.map((record) => record.sourceId === 'openrouter'
        ? { ...record, upstreamRevision: 'stale_catalog' }
        : record),
    }), catalogFixture()],
    ['source artifact', benchmarkFixture({
      sources: benchmarkFixture().sources.map((record) => record.sourceId === 'openrouter'
        ? { ...record, artifactId: 'catalog:stale_catalog' }
        : record),
    }), catalogFixture()],
    ['snapshot key', benchmarkFixture({
      sources: benchmarkFixture().sources.map((record) => record.sourceId === 'openrouter'
        ? { ...record, snapshotKey: 'fixtures/stale-catalog.json' }
        : record),
    }), catalogFixture()],
    ['freshness', benchmarkFixture(), catalogFixture({
      freshness: { status: 'stale', checkedAt: '2026-08-01T00:00:00.000Z', message: 'Refresh overdue' },
    })],
  ])('fails closed when the OpenRouter %s is not bound to the catalog revision', (_label, snapshot, catalog) => {
    expect(() => buildCheatsheet(snapshot, catalog)).toThrow(/OpenRouter.*(?:hash|revision|snapshot|fresh)/i);
  });

  it('fails closed when an OpenRouter price row points at a stale source artifact', () => {
    const snapshot = benchmarkFixture({
      priceChecks: [price({ sourceArtifactId: 'catalog:stale_catalog' })],
    });

    expect(() => buildCheatsheet(snapshot, catalogFixture())).toThrow(/OpenRouter price.*artifact/i);
  });

  it('keeps hosted-route context unavailable when the selected catalog route omits it', () => {
    const snapshot = benchmarkFixture({
      priceChecks: [price({ contextWindowTokens: null })],
    });
    const offer = catalogOffer('openai', 'alpha', 'openrouter:alpha');
    const { contextWindowTokens: _omitted, ...offerWithoutContext } = offer;

    const document = buildCheatsheet(snapshot, catalogFixture({ modelOffers: [offerWithoutContext] }));
    const alpha = document.categories[0].entries.find((entry) => entry.modelKey === 'fixture:alpha');

    expect(alpha).toMatchObject({
      routeId: 'openrouter:alpha',
      inputUsdPerMillion: 1.25,
      outputUsdPerMillion: 5.5,
      contextWindowTokens: null,
    });
    expect(renderCheatsheetCsv(document)).toContain(',openrouter:alpha,1.25,5.5,Unavailable,supported');
    expect(renderCheatsheetHtml(document)).toMatch(/openrouter:alpha[\s\S]{0,300}Unavailable/u);
  });

  it('renders factual CSV and accessible HTML without spreadsheet or markup injection', () => {
    const document = buildCheatsheet(benchmarkFixture(), catalogFixture());
    const csv = renderCheatsheetCsv(document);
    const html = renderCheatsheetHtml(document);

    expect(csv).toContain("'=unsafe formula");
    expect(csv).toContain('Unavailable');
    expect(html).toContain('<main');
    expect(html).toContain('<caption>BenchAlign leaders</caption>');
    expect(html).toContain('Alpha &lt;trusted&gt;');
    expect(html).not.toContain('Alpha <trusted>');
    expect(html).toContain('@media print');
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain("default-src 'none'");
    expect(html).toContain('Evidence position');
    expect(html).toContain('Evidence lens - not a validated TokenBench category rank');
    expect(html).toContain('Validated TokenBench category ranking');
    expect(html).toContain('lmarena:vision_style_control:overall');
    expect(html).toContain('source rank 7');
    expect(csv.split('\r\n')[0]).toContain('category_status');
    expect(csv.split('\r\n')[0]).toContain('position_label');
    expect(csv).toContain('evidence-lens');
    expect(csv).toContain('lmarena:vision_style_control:overall');
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/[—–]/u);
  });

  it('keeps frozen revision, model, price, and context facts equal across CSV and HTML output', () => {
    const document = buildCheatsheet(benchmarkFixture(), catalogFixture());
    const csv = renderCheatsheetCsv(document);
    const html = renderCheatsheetHtml(document);

    for (const output of [csv, html]) {
      expect(output).toContain(document.revision);
      expect(output).toContain('fixture:alpha');
      expect(output).toContain('1.25');
      expect(output).toContain('5.5');
    }
    expect(csv).toContain('128000');
    expect(html).toContain('128,000');
  });

  it('renders newsletter facts and stable subject previews from only the document and changes', () => {
    const document = buildCheatsheet(benchmarkFixture(), catalogFixture());
    const changes = changesFixture();

    const newsletter = renderNewsletterHtml(document, changes);
    expect(newsletter).toContain('benchmark_fixture');
    expect(newsletter).toContain('1 new model');
    expect(newsletter).toContain('1 verified price drop');
    expect(newsletter).toContain('Content-Security-Policy');
    expect(subjectPreviewSet(document, changes)).toEqual([
      {
        subject: 'TokenBench August 2026: 1 new model and 1 verified price drop',
        previewText: 'Frozen benchmark revision benchmark_fixture with validated ranks, evidence lenses, per-1M rates, and context windows.',
      },
      {
        subject: 'TokenBench August 2026 monthly model cheatsheet',
        previewText: 'Frozen benchmark revision benchmark_fixture: 1 new model and 1 verified price drop.',
      },
    ]);
  });

  it('normalizes mutable PDF date fields to the frozen UTC timestamp without changing byte length', () => {
    const sourceBytes = new TextEncoder().encode("%PDF-1.4\n/CreationDate (D:20260806123456+08'00')\n/ModDate (D:20260806123456+08'00')\n");
    const result = normalizePdfMetadata(sourceBytes, '2026-08-01T00:00:00.000Z');
    const text = new TextDecoder().decode(result);

    expect(result).toHaveLength(sourceBytes.length);
    expect(text).toContain("/CreationDate (D:20260801000000+00'00')");
    expect(text).toContain("/ModDate (D:20260801000000+00'00')");
  });
});
