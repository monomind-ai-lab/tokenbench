import { describe, expect, it } from 'vitest';
import type { BenchmarkPriceCheck, BenchmarkSourceId, BenchmarkSourceRecord } from './contracts';
import { comparisonPriceRoutes, defaultComparisonPriceRoute } from './comparison-pricing';

function source(
  artifactId: string,
  observedAt: string,
  sourceId: BenchmarkSourceId = 'openrouter',
): BenchmarkSourceRecord {
  return {
    sourceId,
    artifactId,
    sourceUrl: `https://${sourceId}.example/${artifactId}`,
    observedAt,
    etag: null,
    lastModified: null,
    upstreamRevision: null,
    schemaVersion: null,
    snapshotKey: `${sourceId}/${artifactId}.json`,
    contentHash: `sha256:${'a'.repeat(64)}`,
    originalContentHash: `sha256:${'b'.repeat(64)}`,
    licenseId: sourceId === 'openrouter' ? 'OpenRouter-ToS' : 'MIT',
    attributionText: `${sourceId} source`,
  };
}

function price(overrides: Partial<BenchmarkPriceCheck> = {}): BenchmarkPriceCheck {
  return {
    modelKey: 'provider:alpha',
    sourceId: 'openrouter',
    providerId: 'provider',
    inputUsdPerMillion: 1,
    cachedInputUsdPerMillion: null,
    outputUsdPerMillion: 4,
    contextWindowTokens: null,
    verificationStatus: 'primary',
    routeId: 'direct:alpha',
    sourceModelId: 'alpha',
    canonicalSlug: null,
    maxInputTokens: null,
    maxOutputTokens: null,
    inputModalities: null,
    outputModalities: null,
    supportedParameters: null,
    sourceArtifactId: 'default',
    ...overrides,
  };
}

function sourcesByArtifactId(...sources: readonly BenchmarkSourceRecord[]): ReadonlyMap<string, BenchmarkSourceRecord> {
  return new Map(sources.map((record) => [record.artifactId, record]));
}

describe('comparison price-route selection', () => {
  it('prefers a verified direct route without requiring both list rates', () => {
    const direct = price({
      sourceId: 'benchlm',
      sourceArtifactId: 'direct',
      providerId: 'provider',
      routeId: 'direct:alpha',
      inputUsdPerMillion: 2,
      outputUsdPerMillion: null,
    });
    const selected = defaultComparisonPriceRoute('provider:alpha', [
      price({ providerId: 'openrouter', routeId: 'openrouter:alpha', sourceArtifactId: 'router', inputUsdPerMillion: 1, outputUsdPerMillion: 3 }),
      direct,
    ], sourcesByArtifactId(
      source('router', '2026-08-05T00:00:00.000Z'),
      source('direct', '2026-08-05T00:00:00.000Z', 'benchlm'),
    ));

    expect(selected).toBe(direct);
    expect(selected?.outputUsdPerMillion).toBeNull();
  });

  it('orders primary direct routes by source observation before binary route ID', () => {
    const input = [
      price({ sourceId: 'benchlm', sourceArtifactId: 'old', routeId: 'direct:old' }),
      price({ sourceId: 'benchlm', sourceArtifactId: 'new-z', routeId: 'direct:z' }),
      price({ sourceId: 'benchlm', sourceArtifactId: 'new-private-use', routeId: 'direct:\uE000' }),
      price({ sourceId: 'benchlm', sourceArtifactId: 'new-astral', routeId: 'direct:\u{10000}' }),
      price({ sourceArtifactId: 'router', providerId: 'openrouter', routeId: 'openrouter:alpha' }),
      price({ sourceId: 'benchlm', sourceArtifactId: 'corroborating', routeId: 'direct:corroborating', verificationStatus: 'corroborating' }),
    ];
    const result = comparisonPriceRoutes('provider:alpha', input, sourcesByArtifactId(
      source('old', '2026-08-01T00:00:00.000Z', 'benchlm'),
      source('new-z', '2026-08-05T00:00:00.000Z', 'benchlm'),
      source('new-private-use', '2026-08-05T00:00:00.000Z', 'benchlm'),
      source('new-astral', '2026-08-05T00:00:00.000Z', 'benchlm'),
      source('router', '2026-08-06T00:00:00.000Z'),
      source('corroborating', '2026-08-07T00:00:00.000Z', 'benchlm'),
    ));

    expect(result.map((entry) => entry.routeId)).toEqual([
      'direct:z',
      'direct:\uE000',
      'direct:\u{10000}',
      'direct:old',
      'openrouter:alpha',
      'direct:corroborating',
    ]);
    expect(input.map((entry) => entry.routeId)).toEqual([
      'direct:old',
      'direct:z',
      'direct:\uE000',
      'direct:\u{10000}',
      'openrouter:alpha',
      'direct:corroborating',
    ]);
  });

  it('falls back through known router identifiers while retaining partial facts', () => {
    const result = comparisonPriceRoutes('provider:alpha', [
      price({ providerId: 'openai', routeId: 'openai:alpha:openrouter', sourceArtifactId: 'openrouter', inputUsdPerMillion: null }),
      price({ providerId: 'opencode', routeId: 'opencode:alpha:opencode_zen', sourceArtifactId: 'opencode', inputUsdPerMillion: null, outputUsdPerMillion: null }),
      price({ routeId: 'direct:conflict', sourceArtifactId: 'conflict', verificationStatus: 'conflict' }),
      price({ routeId: 'direct:missing', sourceArtifactId: 'missing' }),
      price({ modelKey: 'provider:other', routeId: 'direct:other', sourceArtifactId: 'openrouter' }),
    ], sourcesByArtifactId(
      source('openrouter', '2026-08-01T00:00:00.000Z'),
      source('opencode', '2026-08-02T00:00:00.000Z'),
      source('conflict', '2026-08-03T00:00:00.000Z'),
    ));

    expect(result.map((entry) => entry.routeId)).toEqual([
      'opencode:alpha:opencode_zen',
      'openai:alpha:openrouter',
    ]);
    expect(result[0]).toMatchObject({ inputUsdPerMillion: null, outputUsdPerMillion: null });
    expect(defaultComparisonPriceRoute('provider:missing', result, sourcesByArtifactId())).toBeNull();
  });

  it('resolves same-named source artifacts by their source identity', () => {
    const result = comparisonPriceRoutes('provider:alpha', [
      price({ sourceId: 'benchlm', providerId: 'provider', routeId: 'direct:alpha', sourceArtifactId: 'pricing' }),
      price({ sourceId: 'openrouter', providerId: 'openrouter', routeId: 'openrouter:alpha', sourceArtifactId: 'pricing' }),
    ], new Map([
      ['benchlm\u0000pricing', source('pricing', '2026-08-05T00:00:00.000Z', 'benchlm')],
      ['openrouter\u0000pricing', source('pricing', '2026-08-05T00:00:00.000Z', 'openrouter')],
    ]));

    expect(result.map((entry) => entry.routeId)).toEqual(['direct:alpha', 'openrouter:alpha']);
  });

  it('rejects a source timestamp that Date.parse would normalize across the calendar', () => {
    const result = comparisonPriceRoutes('provider:alpha', [
      price({ sourceArtifactId: 'rollover', routeId: 'direct:rollover' }),
    ], sourcesByArtifactId(source('rollover', '2026-02-30T00:00:00.000Z')));

    expect(result).toEqual([]);
  });

  it('orders duplicate route IDs totally and refuses an ambiguous default after reversal', () => {
    const sameRouteA = price({
      sourceId: 'benchlm',
      providerId: 'a-provider',
      routeId: 'direct:shared',
      sourceArtifactId: 'z-artifact',
    });
    const sameRouteB = price({
      sourceId: 'benchlm',
      providerId: 'a-provider',
      routeId: 'direct:shared',
      sourceArtifactId: 'a-artifact',
    });
    const sameRouteC = price({
      sourceId: 'benchlm',
      providerId: 'z-provider',
      routeId: 'direct:shared',
      sourceArtifactId: 'm-artifact',
    });
    const input = [sameRouteC, sameRouteA, sameRouteB];
    const sources = sourcesByArtifactId(
      source('z-artifact', '2026-08-05T00:00:00.000Z', 'benchlm'),
      source('a-artifact', '2026-08-05T00:00:00.000Z', 'benchlm'),
      source('m-artifact', '2026-08-05T00:00:00.000Z', 'benchlm'),
    );

    const forward = comparisonPriceRoutes('provider:alpha', input, sources);
    const reversed = comparisonPriceRoutes('provider:alpha', [...input].reverse(), sources);

    expect(forward.map((entry) => [entry.providerId, entry.sourceArtifactId])).toEqual([
      ['a-provider', 'a-artifact'],
      ['a-provider', 'z-artifact'],
      ['z-provider', 'm-artifact'],
    ]);
    expect(reversed).toEqual(forward);
    expect(defaultComparisonPriceRoute('provider:alpha', input, sources)).toBeNull();
    expect(defaultComparisonPriceRoute('provider:alpha', [...input].reverse(), sources)).toBeNull();
  });
});
