import { beforeEach, describe, expect, it, vi } from 'vitest';
import { within } from '@testing-library/dom';
import type { ActiveBenchmarkSnapshot } from '../_shared/benchmark-db';
import type {
  BenchmarkComparisonPair,
  BenchmarkMetric,
  BenchmarkModel,
  BenchmarkPriceCheck,
  BenchmarkSourceRecord,
} from '../../src/benchmarks/contracts';

const readActiveComparisonSnapshot = vi.hoisted(() => vi.fn());

vi.mock('../_shared/benchmark-db', async () => {
  const actual = await vi.importActual<typeof import('../_shared/benchmark-db')>('../_shared/benchmark-db');
  return { ...actual, readActiveComparisonSnapshot };
});

import { onRequestGet } from './[pair]';

const UPDATED_AT = '2026-08-05T12:00:00.000Z';
const THEME_BOOTSTRAP = "<script>try{var theme=localStorage.getItem('tokenbench:theme'),explicit=localStorage.getItem('tokenbench:theme:explicit')==='true';if(theme==='dark'&&explicit){document.documentElement.dataset.theme='dark'}else{if(theme==='dark')localStorage.removeItem('tokenbench:theme');document.documentElement.dataset.theme='light'}}catch(e){document.documentElement.dataset.theme='light'}</script>";

function model(modelKey: string, slug: string, name: string, creator = 'Example Labs'): BenchmarkModel {
  return {
    modelKey,
    slug,
    name,
    creator,
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
    sourceModelId: modelKey,
    sourceArtifactId: 'benchlm-models',
  };
}

function metric(modelKey: string, value: number): BenchmarkMetric {
  return {
    modelKey,
    metricKey: 'benchlm:category:coding',
    category: 'coding',
    value,
    rank: null,
    lower: null,
    upper: null,
    voteCount: null,
    unit: 'score',
    sourceId: 'benchlm',
    sourceUpdatedAt: UPDATED_AT,
    sourceModelId: modelKey,
    sourceArtifactId: 'benchlm-models',
    rankingEligible: true,
    methodology: 'benchlm_raw_composite',
    observationCount: null,
    sessionCount: null,
  };
}

function price(modelKey: string, input: number, output: number): BenchmarkPriceCheck {
  return {
    modelKey,
    sourceId: 'openrouter',
    providerId: 'openrouter',
    inputUsdPerMillion: input,
    cachedInputUsdPerMillion: null,
    outputUsdPerMillion: output,
    contextWindowTokens: 128_000,
    verificationStatus: 'primary',
    routeId: `openrouter:${modelKey}`,
    sourceModelId: modelKey,
    canonicalSlug: null,
    maxInputTokens: 120_000,
    maxOutputTokens: 8_000,
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportedParameters: ['tools'],
    sourceArtifactId: 'openrouter-catalog',
  };
}

function source(sourceId: BenchmarkSourceRecord['sourceId'], artifactId: string, sourceUrl: string, attributionText: string): BenchmarkSourceRecord {
  return {
    sourceId,
    artifactId,
    sourceUrl,
    observedAt: UPDATED_AT,
    etag: null,
    lastModified: null,
    upstreamRevision: null,
    schemaVersion: null,
    snapshotKey: `${sourceId}/${artifactId}.json`,
    contentHash: `sha256:${sourceId === 'benchlm' ? 'a'.repeat(64) : 'b'.repeat(64)}`,
    originalContentHash: `sha256:${sourceId === 'benchlm' ? 'c'.repeat(64) : 'd'.repeat(64)}`,
    licenseId: sourceId === 'benchlm' ? 'MIT' : 'OpenRouter-ToS',
    attributionText,
  };
}

function pair(indexable: boolean): BenchmarkComparisonPair {
  return {
    // Model-key binary ordering is alpha then beta, even though the displayed
    // slugs intentionally order as zeta then alpha.
    pairSlug: 'zeta-vs-alpha',
    modelAKey: 'provider:alpha',
    modelBKey: 'provider:beta',
    indexable,
    eligibilityReason: indexable ? 'Reviewed pair' : 'Utility pair only',
    featuredRank: indexable ? 1 : null,
    sharedMetricCount: 2,
  };
}

function snapshot(overrides: Partial<ActiveBenchmarkSnapshot> = {}): ActiveBenchmarkSnapshot {
  const alpha = model('provider:alpha', 'zeta', 'Model A', 'Alpha Labs');
  const beta = model('provider:beta', 'alpha', 'Model B', 'Beta Labs');
  const ambiguousModels = [
    model('provider:a', 'a', 'A'),
    model('provider:ab', 'a-vs-b', 'A vs B'),
    model('provider:bc', 'b-vs-c', 'B vs C'),
    model('provider:c', 'c', 'C'),
  ];

  return {
    revision: {
      revision: 'published-r1',
      generatedAt: UPDATED_AT,
      publishedAt: UPDATED_AT,
      checkedAt: UPDATED_AT,
      publicationState: 'published',
      contentHash: `sha256:${'0'.repeat(64)}`,
      catalogRevision: 'catalog-r1',
      openrouterContentHash: `sha256:${'1'.repeat(64)}`,
    },
    sources: [
      source('benchlm', 'benchlm-models', 'https://benchlm.example/models', 'Data from BenchLM'),
      source('openrouter', 'openrouter-catalog', 'https://openrouter.example/models', 'OpenRouter catalog'),
    ],
    models: [alpha, beta, ...ambiguousModels],
    metrics: [metric(alpha.modelKey, 88.5), metric(beta.modelKey, 76.2)],
    priceChecks: [price(alpha.modelKey, 2, 8), price(beta.modelKey, 1, 4)],
    comparisonPairs: [pair(true)],
    ...overrides,
  };
}

async function request(pairValue: string, pathname = `/compare/${pairValue}`, parameter: string | undefined = undefined): Promise<Response> {
  const requestObject = new Request(`https://tokenbench.monomind.one${pathname}`);
  const remainder = new URL(requestObject.url).pathname.slice('/compare/'.length);
  const encodedSegment = remainder.endsWith('/') ? remainder.slice(0, -1) : remainder;
  return onRequestGet({
    request: requestObject,
    env: { CATALOG_DB: {} as never },
    // Pages supplies the raw encoded route parameter. Tests can deliberately
    // override it to prove the handler does not trust a mismatched value.
    params: { pair: parameter === undefined ? encodedSegment : parameter },
  });
}

function initialViewModel(html: string): {
  metricRows: Array<{ metricKey: string; sourceId: string; methodology: string }>;
  relatedPairs: Array<{ pairSlug: string; modelA: BenchmarkModel; modelB: BenchmarkModel }>;
  attribution: Array<{ sourceId: string; artifactId: string }>;
  priceChecks: Array<{ modelKey: string; selectedRouteId: string | null; checks: BenchmarkPriceCheck[] }>;
} {
  const payload = html.match(/<script id="comparison-initial-data" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
  if (!payload) throw new Error('Expected the comparison hydration payload');
  return JSON.parse(payload) as {
    metricRows: Array<{ metricKey: string; sourceId: string; methodology: string }>;
    relatedPairs: Array<{ pairSlug: string; modelA: BenchmarkModel; modelB: BenchmarkModel }>;
    attribution: Array<{ sourceId: string; artifactId: string }>;
    priceChecks: Array<{ modelKey: string; selectedRouteId: string | null; checks: BenchmarkPriceCheck[] }>;
  };
}

function renderedRoot(html: string): HTMLElement {
  const rootStart = html.indexOf('<div id="root">');
  const payloadStart = html.indexOf('<script id="comparison-initial-data"');
  if (rootStart === -1 || payloadStart === -1 || payloadStart <= rootStart) {
    throw new Error('Expected rendered comparison root before hydration payload');
  }
  const shell = document.createElement('div');
  shell.innerHTML = html.slice(rootStart, payloadStart);
  const root = shell.querySelector<HTMLElement>('#root');
  if (!root) throw new Error('Expected rendered comparison root');
  return root;
}

function executeThemeBootstrap(html: string, initialStorage: Readonly<Record<string, string>>): {
  readonly theme: string | undefined;
  readonly storedTheme: string | null;
  readonly explicitMarker: string | null;
} {
  const script = html.match(/<script>(try\{[\s\S]*?)<\/script>/)?.[1];
  if (!script) throw new Error('Expected an inline theme bootstrap');
  const values = new Map(Object.entries(initialStorage));
  const bootstrapDocument = { documentElement: { dataset: {} as Record<string, string> } };
  const bootstrapStorage = {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };

  new Function('document', 'localStorage', script)(bootstrapDocument, bootstrapStorage);

  return {
    theme: bootstrapDocument.documentElement.dataset.theme,
    storedTheme: bootstrapStorage.getItem('tokenbench:theme'),
    explicitMarker: bootstrapStorage.getItem('tokenbench:theme:explicit'),
  };
}

describe('dynamic comparison Pages Function', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.setSystemTime(new Date('2026-08-05T18:00:00.000Z'));
    readActiveComparisonSnapshot.mockResolvedValue(snapshot());
  });

  it('renders the model-key canonical pair as complete crawlable HTML without upstream access', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await request('zeta-vs-alpha');
    const html = await response.text();
    const root = renderedRoot(html);
    const rendered = within(root);
    const provenance = rendered.getByRole('heading', { name: 'Evidence provenance' }).closest('section');
    const rootWithoutProvenance = root.cloneNode(true) as HTMLElement;
    rootWithoutProvenance.querySelector('.comparison-provenance')?.remove();
    const data = initialViewModel(html);

    expect(response.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(rendered.getByRole('heading', { level: 1, name: 'Model A vs Model B' })).toBeTruthy();
    expect(rendered.getByRole('heading', { name: 'Key implications' })).toBeTruthy();
    expect(rendered.queryByRole('heading', { name: 'Evidence highlights' })).toBeNull();
    expect(within(rendered.getByRole('table', { name: 'Source metric comparison' })).getByRole('rowheader', { name: 'Coding' })).toBeTruthy();
    const pricingTable = rendered.getByRole('table', { name: 'Route pricing and context comparison' });
    expect(within(pricingTable).queryByRole('rowheader', { name: 'Verification status' })).toBeNull();
    expect(within(pricingTable).queryByRole('rowheader', { name: 'Maximum input' })).toBeNull();
    expect(within(pricingTable).queryByRole('rowheader', { name: 'Maximum output' })).toBeNull();
    expect(within(pricingTable).queryByRole('rowheader', { name: 'Supported parameters' })).toBeNull();
    expect(root.querySelectorAll('.comparison-provenance')).toHaveLength(1);
    expect(provenance).not.toBeNull();
    expect(rootWithoutProvenance.textContent).not.toContain('benchlm:category:coding');
    expect(rootWithoutProvenance.textContent).not.toContain('benchlm_raw_composite');
    expect(rootWithoutProvenance.textContent).not.toContain('benchlm-models');
    expect(rootWithoutProvenance.textContent).not.toMatch(/\bbenchlm\b/);
    expect(rootWithoutProvenance.textContent).not.toContain('Workload');
    expect(data.metricRows[0]).toMatchObject({ metricKey: 'benchlm:category:coding', sourceId: 'benchlm', methodology: 'benchlm_raw_composite' });
    expect(html).toContain('<title>Model A vs Model B: Cost, Coding &amp; Benchmarks | TokenBench</title>');
    expect(html).toContain('<html lang="en" data-theme="light">');
    expect(html).toContain(THEME_BOOTSTRAP);
    expect(html).toContain('<link rel="canonical" href="https://tokenbench.monomind.one/compare/zeta-vs-alpha">');
    expect(html).toContain('<meta name="robots" content="index,follow">');
    expect(rendered.getByRole('heading', { name: 'Switch model pair' })).toBeTruthy();
    expect(html).not.toContain('No verified subscription match');
    expect(html).not.toContain('Related comparisons');
    expect(html).toContain('id="comparison-initial-data" type="application/json"');
    expect(html.indexOf('id="comparison-initial-data"')).toBeGreaterThan(html.indexOf('</div>'));
    expect(html).toContain('"@type":"WebPage"');
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).not.toContain('Product');
    expect(html).not.toContain('Review');
  });

  it('redirects a reverse pair and a trailing slash to the slashless canonical model-key path', async () => {
    const reverse = await request('alpha-vs-zeta');
    const trailing = await request('zeta-vs-alpha', '/compare/zeta-vs-alpha/');

    expect(reverse.status).toBe(301);
    expect(reverse.headers.get('location')).toBe('/compare/zeta-vs-alpha');
    expect(trailing.status).toBe(301);
    expect(trailing.headers.get('location')).toBe('/compare/zeta-vs-alpha');
  });

  it('uses the shared UTF-8 binary canonical ordering for model keys that disagree with JavaScript UTF-16 order', async () => {
    // U+10000 has a leading surrogate that sorts before U+E000 in JS, while
    // SQLite BINARY and the shared comparator order U+E000 before U+10000.
    const utf8First = 'provider:\uE000';
    const utf16First = 'provider:\u{10000}';
    const privateUse = model(utf8First, 'private-use', 'Private use model');
    const astral = model(utf16First, 'astral', 'Astral model');
    const base = snapshot();
    readActiveComparisonSnapshot.mockResolvedValue(snapshot({
      models: [...base.models, privateUse, astral],
      comparisonPairs: [{
        pairSlug: 'private-use-vs-astral',
        modelAKey: utf8First,
        modelBKey: utf16First,
        indexable: true,
        eligibilityReason: 'Reviewed Unicode pair',
        featuredRank: 1,
        sharedMetricCount: 2,
      }],
    }));

    const reverse = await request('astral-vs-private-use');
    const canonical = await request('private-use-vs-astral');

    expect(reverse.status).toBe(301);
    expect(reverse.headers.get('location')).toBe('/compare/private-use-vs-astral');
    expect(canonical.status).toBe(200);
    expect((await canonical.text()).replaceAll('<!-- -->', '')).toContain('<h1 id="comparison-detail-heading">Private use model vs Astral model</h1>');
  });

  it('accepts the raw percent-encoded Pages parameter exactly once, including literal percent, Unicode, spaces, query, and fragment markers', async () => {
    const base = snapshot();
    const modelA = model('provider:unicode-a', '模型 %25 ?#', 'Unicode A');
    const modelB = model('provider:unicode-b', 'b#eta', 'Unicode B');
    const pairSlug = `${modelA.slug}-vs-${modelB.slug}`;
    readActiveComparisonSnapshot.mockResolvedValueOnce(snapshot({ models: [...base.models, modelA, modelB] }));

    const response = await request(pairSlug, `/compare/${encodeURIComponent(pairSlug)}`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain(`<link rel="canonical" href="https://tokenbench.monomind.one/compare/${encodeURIComponent(pairSlug)}">`);
    expect(html).toContain(`"canonicalPath":"/compare/${encodeURIComponent(pairSlug)}"`);
  });

  it('rejects malformed, double-decoded, mismatched, and slash-bearing route parameters', async () => {
    const base = snapshot();
    const slashModel = model('provider:slash', 'slash/part', 'Slash model');
    const plainModel = model('provider:plain', 'plain', 'Plain model');
    readActiveComparisonSnapshot.mockResolvedValue(snapshot({ models: [...base.models, slashModel, plainModel] }));

    const malformed = await request('ignored', '/compare/zeta%ZZ-vs-alpha');
    const mismatched = await request('zeta-vs-alpha', '/compare/zeta-vs-alpha', 'alpha-vs-zeta');
    const doubleDecoded = await request('zeta-vs-alpha', '/compare/zeta-vs-alpha', 'zeta%2Dvs%2Dalpha');
    const encodedSlash = await request(
      `${slashModel.slug}-vs-${plainModel.slug}`,
      `/compare/${encodeURIComponent(`${slashModel.slug}-vs-${plainModel.slug}`)}`,
    );

    for (const response of [malformed, mismatched, doubleDecoded, encodedSlash]) {
      expect(response.status).toBe(404);
      expect(await response.text()).toContain('<meta name="robots" content="noindex,follow">');
    }
  });

  it('returns safe noindex 404s for self, unknown, malformed, control, slash, and ambiguous pair parameters', async () => {
    for (const pairValue of ['zeta-vs-zeta', 'missing-vs-zeta', 'zeta', 'zeta-vs-', 'zeta\u0000-vs-alpha', 'zeta/vs-alpha', 'a-vs-b-vs-c']) {
      const response = await request(pairValue);
      const html = await response.text();

      expect(response.status, pairValue).toBe(404);
      expect(html, pairValue).toContain('<html lang="en" data-theme="light">');
      expect(html, pairValue).toContain(THEME_BOOTSTRAP);
      expect(html, pairValue).toContain('<meta name="robots" content="noindex,follow">');
      expect(html, pairValue).not.toContain('rel="canonical"');
      expect(html, pairValue).not.toContain('application/ld+json');
    }
  });

  it('migrates bare legacy dark storage in every non-hydrated error shell while preserving explicit dark', async () => {
    const notFound = await request('missing-vs-zeta');
    readActiveComparisonSnapshot.mockResolvedValueOnce(null);
    const unavailable = await request('zeta-vs-alpha');

    for (const response of [notFound, unavailable]) {
      const html = await response.text();

      expect(executeThemeBootstrap(html, { 'tokenbench:theme': 'dark' })).toEqual({
        theme: 'light',
        storedTheme: null,
        explicitMarker: null,
      });
      expect(executeThemeBootstrap(html, {
        'tokenbench:theme': 'dark',
        'tokenbench:theme:explicit': 'true',
      })).toEqual({
        theme: 'dark',
        storedTheme: 'dark',
        explicitMarker: 'true',
      });
    }
  });

  it('keeps valid persisted nonindexable and unpersisted pairs useful but noindex', async () => {
    readActiveComparisonSnapshot.mockResolvedValueOnce(snapshot({ comparisonPairs: [pair(false)] }));
    const nonindexable = await request('zeta-vs-alpha');

    readActiveComparisonSnapshot.mockResolvedValueOnce(snapshot({ comparisonPairs: [] }));
    const unpersisted = await request('zeta-vs-alpha');

    expect(nonindexable.status).toBe(200);
    expect((await nonindexable.text())).toContain('<meta name="robots" content="noindex,follow">');
    expect(unpersisted.status).toBe(200);
    expect((await unpersisted.text())).toContain('<meta name="robots" content="noindex,follow">');
  });

  it('requires the exact canonical persisted pair record before marking a utility page indexable', async () => {
    readActiveComparisonSnapshot.mockResolvedValueOnce(snapshot({
      comparisonPairs: [{ ...pair(true), pairSlug: 'alpha-vs-zeta' }],
    }));

    const response = await request('zeta-vs-alpha');

    expect(response.status).toBe(200);
    expect((await response.text())).toContain('<meta name="robots" content="noindex,follow">');
  });

  it('keeps related comparisons to a small deterministic set that shares a displayed model', async () => {
    const base = snapshot();
    const extraModels = Array.from({ length: 8 }, (_, index) => model(`provider:gamma-${index}`, `gamma-${index}`, `Gamma ${index}`));
    const delta = model('provider:delta', 'delta', 'Delta');
    const epsilon = model('provider:epsilon', 'epsilon', 'Epsilon');
    const connectedPairs = extraModels.map((related, index) => ({
      pairSlug: index % 2 === 0 ? `zeta-vs-${related.slug}` : `alpha-vs-${related.slug}`,
      modelAKey: index % 2 === 0 ? 'provider:alpha' : 'provider:beta',
      modelBKey: related.modelKey,
      indexable: true,
      eligibilityReason: 'Reviewed pair',
      featuredRank: index + 1,
      sharedMetricCount: 2,
    } satisfies BenchmarkComparisonPair));
    readActiveComparisonSnapshot.mockResolvedValueOnce(snapshot({
      models: [...base.models, ...extraModels, delta, epsilon],
      comparisonPairs: [
        pair(true),
        ...connectedPairs,
        {
          pairSlug: 'delta-vs-epsilon',
          modelAKey: delta.modelKey,
          modelBKey: epsilon.modelKey,
          indexable: true,
          eligibilityReason: 'Reviewed but unrelated',
          featuredRank: null,
          sharedMetricCount: 2,
        },
      ],
    }));

    const response = await request('zeta-vs-alpha');
    const data = initialViewModel(await response.text());
    const currentKeys = new Set(['provider:alpha', 'provider:beta']);

    expect(response.status).toBe(200);
    expect(data.relatedPairs.map((related) => related.pairSlug)).toEqual(connectedPairs.slice(0, 6).map((related) => related.pairSlug));
    expect(data.relatedPairs).toHaveLength(6);
    expect(data.relatedPairs.every((related) => currentKeys.has(related.modelA.modelKey) || currentKeys.has(related.modelB.modelKey))).toBe(true);
    expect(data.relatedPairs.map((related) => related.pairSlug)).not.toContain('delta-vs-epsilon');
  });

  it('serializes attribution only for source artifacts referenced by the displayed pair', async () => {
    const base = snapshot();
    readActiveComparisonSnapshot.mockResolvedValueOnce(snapshot({
      sources: [...base.sources, source('benchlm', 'unrelated-benchlm', 'https://benchlm.example/unrelated', 'Unrelated BenchLM record')],
    }));

    const response = await request('zeta-vs-alpha');
    const data = initialViewModel(await response.text());

    expect(response.status).toBe(200);
    expect(data.attribution.map(({ sourceId, artifactId }) => ({ sourceId, artifactId }))).toEqual([
      { sourceId: 'benchlm', artifactId: 'benchlm-models' },
      { sourceId: 'openrouter', artifactId: 'openrouter-catalog' },
    ]);
  });

  it('publishes every source-backed verified price route and selects a partial direct route', async () => {
    const base = snapshot();
    const direct = {
      ...price('provider:alpha', 2, 8),
      sourceId: 'benchlm' as const,
      providerId: 'alpha-labs',
      routeId: 'direct:alpha',
      outputUsdPerMillion: null,
      contextWindowTokens: 256_000,
      maxInputTokens: 240_000,
      maxOutputTokens: 16_000,
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
      supportedParameters: ['tools', 'json_schema'],
      sourceArtifactId: 'direct-pricing',
    } satisfies BenchmarkPriceCheck;
    const missingArtifact = {
      ...direct,
      routeId: 'direct:missing-artifact',
      sourceArtifactId: 'missing-artifact',
    } satisfies BenchmarkPriceCheck;
    readActiveComparisonSnapshot.mockResolvedValueOnce(snapshot({
      sources: [...base.sources, source('benchlm', 'direct-pricing', 'https://alpha.example/pricing', 'Alpha pricing')],
      priceChecks: [
        price('provider:alpha', 2, 8),
        direct,
        missingArtifact,
        price('provider:beta', 1, 4),
      ],
    }));

    const response = await request('zeta-vs-alpha');
    const data = initialViewModel(await response.text());
    const alphaPrices = data.priceChecks.find((group) => group.modelKey === 'provider:alpha');

    expect(response.status).toBe(200);
    expect(alphaPrices).toMatchObject({ modelKey: 'provider:alpha', selectedRouteId: 'direct:alpha' });
    expect(alphaPrices?.checks[0]).toMatchObject({
      routeId: 'direct:alpha',
      inputUsdPerMillion: 2,
      cachedInputUsdPerMillion: null,
      outputUsdPerMillion: null,
      contextWindowTokens: 256_000,
      maxInputTokens: 240_000,
      maxOutputTokens: 16_000,
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
      supportedParameters: ['tools', 'json_schema'],
      verificationStatus: 'primary',
    });
    expect(alphaPrices?.checks.map((check) => check.routeId)).toEqual(['direct:alpha', 'openrouter:provider:alpha']);
    expect(data.attribution.map(({ sourceId, artifactId }) => ({ sourceId, artifactId }))).toEqual([
      { sourceId: 'benchlm', artifactId: 'benchlm-models' },
      { sourceId: 'benchlm', artifactId: 'direct-pricing' },
      { sourceId: 'openrouter', artifactId: 'openrouter-catalog' },
    ]);
  });

  it('publishes duplicate route-ID facts deterministically without an ambiguous selection', async () => {
    const base = snapshot();
    const duplicateRoute = (providerId: string, sourceArtifactId: string): BenchmarkPriceCheck => ({
      ...price('provider:alpha', 2, 8),
      sourceId: 'benchlm',
      providerId,
      routeId: 'direct:shared',
      sourceArtifactId,
    });
    readActiveComparisonSnapshot.mockResolvedValueOnce(snapshot({
      sources: [
        ...base.sources,
        source('benchlm', 'direct-a', 'https://alpha.example/a', 'Alpha A pricing'),
        source('benchlm', 'direct-z', 'https://alpha.example/z', 'Alpha Z pricing'),
      ],
      priceChecks: [
        duplicateRoute('z-provider', 'direct-z'),
        duplicateRoute('a-provider', 'direct-a'),
        price('provider:alpha', 2, 8),
        price('provider:beta', 1, 4),
      ],
    }));

    const response = await request('zeta-vs-alpha');
    const data = initialViewModel(await response.text());

    expect(response.status).toBe(200);
    expect(data.priceChecks[0]).toMatchObject({
      modelKey: 'provider:alpha',
      selectedRouteId: null,
    });
    expect(data.priceChecks[0].checks.map((check) => [check.routeId, check.providerId])).toEqual([
      ['direct:shared', 'a-provider'],
      ['direct:shared', 'z-provider'],
      ['openrouter:provider:alpha', 'openrouter'],
    ]);
  });

  it('escapes untrusted names, URLs, JSON script data, and JSON-LD without creating executable markup', async () => {
    const base = snapshot();
    const malicious = snapshot({
      models: [
        { ...base.models[0], name: 'Model </script><img src=x onerror=alert(1)>' },
        base.models[1],
        ...base.models.slice(2),
      ],
      sources: [
        { ...base.sources[0], sourceUrl: 'javascript:alert(1)', attributionText: 'BenchLM </script><svg onload=alert(1)>' },
        base.sources[1],
      ],
    });
    readActiveComparisonSnapshot.mockResolvedValueOnce(malicious);

    const response = await request('zeta-vs-alpha');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<svg onload');
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('</script><img');
    expect(html).toContain('\\u003c/script\\u003e');
    expect(html).not.toContain('\u2028');
    expect(html).not.toContain('\u2029');
  });

  it('returns a safe noindex 503 when there is no publication-pointer-selected revision', async () => {
    readActiveComparisonSnapshot.mockResolvedValueOnce(null);

    const response = await request('zeta-vs-alpha');
    const html = await response.text();

    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(html).toContain('<html lang="en" data-theme="light">');
    expect(html).toContain(THEME_BOOTSTRAP);
    expect(html).toContain('Comparison temporarily unavailable');
    expect(html).toContain('<meta name="robots" content="noindex,follow">');
    expect(html).not.toContain('rel="canonical"');
    expect(html).not.toContain('application/ld+json');
  });

  it('returns an explicit noindex 503 for snapshot and SSR failures without mislabelling them as absent pairs', async () => {
    readActiveComparisonSnapshot.mockRejectedValueOnce(new Error('D1 temporarily unavailable'));
    const snapshotFailure = await request('zeta-vs-alpha');

    const invalidPublication = snapshot();
    readActiveComparisonSnapshot.mockResolvedValueOnce({
      ...invalidPublication,
      revision: { ...invalidPublication.revision, publishedAt: null },
    });
    const renderFailure = await request('zeta-vs-alpha');

    for (const response of [snapshotFailure, renderFailure]) {
      const html = await response.text();
      expect(response.status).toBe(503);
      expect(response.headers.get('x-robots-tag')).toBe('noindex, follow');
      expect(html).toContain('<html lang="en" data-theme="light">');
      expect(html).toContain(THEME_BOOTSTRAP);
      expect(html).toContain('<meta name="robots" content="noindex,follow">');
      expect(html).toContain('Comparison temporarily unavailable');
      expect(html).not.toContain('Comparison not found');
      expect(html).not.toContain('rel="canonical"');
      expect(html).not.toContain('application/ld+json');
    }
  });
});
