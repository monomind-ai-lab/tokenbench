import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseLiteLlmPrices } from './litellm';

function loadFixture<T>(relativePath: string): T {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8')) as T;
}

const observedAt = '2026-08-05T00:00:00.000Z';
const fixture = loadFixture<{ payload: Record<string, unknown> }>('../test-fixtures/litellm.json');

describe('LiteLLM normalization', () => {
  it('ignores sample_spec and converts per-token prices to per-million corroborating evidence', () => {
    const batch = parseLiteLlmPrices(fixture.payload, observedAt);
    const priced = batch.priceChecks.find((record) => record.sourceModelId === 'azure/codex-mini');
    const unpriced = batch.priceChecks.find((record) => record.sourceModelId === '1024-x-1024/dall-e-2');

    expect(batch.models).toHaveLength(2);
    expect(batch.models.map((model) => model.sourceModelId)).not.toContain('sample_spec');
    expect(batch.sources).toEqual([expect.objectContaining({
      sourceId: 'litellm',
      artifactId: 'model-prices',
      licenseId: 'MIT',
      attributionText: 'LiteLLM corroboration',
    })]);
    expect(priced).toMatchObject({
      sourceId: 'litellm',
      providerId: 'azure',
      routeId: 'litellm:azure:azure%2Fcodex-mini:responses',
      inputUsdPerMillion: 1.5,
      cachedInputUsdPerMillion: 0.375,
      outputUsdPerMillion: 6,
      contextWindowTokens: 200000,
      maxInputTokens: 200000,
      maxOutputTokens: 100000,
      inputModalities: ['text', 'image'],
      outputModalities: null,
      verificationStatus: 'corroborating',
      sourceArtifactId: 'model-prices',
    });
    expect(unpriced).toMatchObject({
      inputUsdPerMillion: null,
      cachedInputUsdPerMillion: null,
      outputUsdPerMillion: null,
      contextWindowTokens: null,
      maxInputTokens: null,
      maxOutputTokens: null,
    });
  });

  it('uses max_tokens only as a legacy fallback and normalizes non-positive limits to null', () => {
    const batch = parseLiteLlmPrices({
      'legacy-model': {
        litellm_provider: 'example',
        mode: 'chat',
        max_tokens: 4096,
      },
      'unavailable-limit-model': {
        litellm_provider: 'example',
        mode: 'chat',
        max_input_tokens: 0,
        max_output_tokens: -1,
      },
    }, observedAt);
    const legacy = batch.priceChecks.find((record) => record.sourceModelId === 'legacy-model');
    const unavailable = batch.priceChecks.find((record) => record.sourceModelId === 'unavailable-limit-model');

    expect(legacy).toMatchObject({
      contextWindowTokens: 4096,
      maxInputTokens: 4096,
      maxOutputTokens: 4096,
    });
    expect(unavailable).toMatchObject({
      contextWindowTokens: null,
      maxInputTokens: null,
      maxOutputTokens: null,
    });
  });

  it('rejects invalid or negative supplied prices instead of coercing them', () => {
    expect(() => parseLiteLlmPrices({
      'bad-price': {
        litellm_provider: 'example',
        mode: 'chat',
        input_cost_per_token: -0.000001,
      },
    }, observedAt)).toThrow(/input_cost_per_token must be a non-negative finite number/i);
    expect(() => parseLiteLlmPrices({
      'nan-price': {
        litellm_provider: 'example',
        mode: 'chat',
        output_cost_per_token: Number.NaN,
      },
    }, observedAt)).toThrow(/output_cost_per_token must be a non-negative finite number/i);
  });

  it('ignores the non-model fallback metadata carried by the official source', () => {
    const batch = parseLiteLlmPrices({
      fallback_generalizations: { rules: [] },
      'priced-model': {
        litellm_provider: 'example',
        mode: 'chat',
        input_cost_per_token: 0,
        output_cost_per_token: 0,
      },
    }, observedAt);

    expect(batch.models.map((model) => model.sourceModelId)).toEqual(['priced-model']);
    expect(batch.priceChecks[0]).toMatchObject({
      inputUsdPerMillion: 0,
      outputUsdPerMillion: 0,
    });
  });
});
