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
    providerId: 'openrouter',
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
    modelKey: 'fixture:beta', slug: 'beta', name: '=unsafe formula', sourceModelId: 'beta', contextWindowTokens: null,
  });
  const estimated = model({
    modelKey: 'fixture:estimated', slug: 'estimated', name: 'Estimated', sourceModelId: 'estimated', evidenceStatus: 'estimated',
  });
  return {
    revision: revision(),
    sources: [
      source(),
      source({
        sourceId: 'openrouter', artifactId: 'catalog:catalog_fixture', sourceUrl: 'https://example.test/catalog',
        licenseId: 'OpenRouter-ToS', attributionText: 'Fixture catalog evidence', snapshotKey: 'fixtures/catalog.json',
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
      metric({ metricKey: 'benchlm:category:multimodal', category: 'multimodal', value: 84 }),
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
    modelOffers: [],
    provenance: [],
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
      providerId: 'openrouter',
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
      .toMatchObject({ inputUsdPerMillion: null, outputUsdPerMillion: null, contextWindowTokens: null, routeId: null });
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
    expect(html).not.toMatch(/https?:\/\//);
  });

  it('renders newsletter facts and stable subject previews from only the document and changes', () => {
    const document = buildCheatsheet(benchmarkFixture(), catalogFixture());
    const changes = changesFixture();

    expect(renderNewsletterHtml(document, changes)).toContain('benchmark_fixture');
    expect(renderNewsletterHtml(document, changes)).toContain('1 new model');
    expect(renderNewsletterHtml(document, changes)).toContain('1 verified price drop');
    expect(subjectPreviewSet(document, changes)).toEqual([
      {
        subject: 'TokenBench August 2026: 1 new model and 1 verified price drop',
        previewText: 'Frozen benchmark revision benchmark_fixture with current category ranks, per-1M rates, and context windows.',
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
