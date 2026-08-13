import { describe, expect, it, vi } from 'vitest';
import type { PricePerformanceEnvelope } from '../src/benchmarks/price-performance-contracts';

const pricePerformanceApi = vi.hoisted(() => vi.fn());

vi.mock('./api/benchmarks/price-performance', () => ({ onRequestGet: pricePerformanceApi }));

import { onRequestGet } from './llm-price-performance';

const CHECKED_AT = '2026-08-11T20:48:20.302Z';

function envelope(stale = false): PricePerformanceEnvelope {
  return {
    revision: 'benchmark-price-performance-r1',
    publishedAt: CHECKED_AT,
    freshness: stale
      ? { status: 'stale', checkedAt: CHECKED_AT, message: 'Showing the last published revision.' }
      : { status: 'fresh', checkedAt: CHECKED_AT },
    attribution: [
      { sourceId: 'benchlm', label: 'BenchLM', url: 'https://benchlm.ai/models/gpt-5-6-sol', updatedAt: CHECKED_AT },
      { sourceId: 'openrouter', label: 'OpenRouter', url: 'https://openrouter.ai/models/openai/gpt-5-6-sol', updatedAt: CHECKED_AT },
    ],
    data: {
      scoreMethodology: {
        overall: 'BenchLM public overall composite score.',
        agentic: 'BenchLM public agentic capability score.',
        coding: 'BenchLM public coding capability score.',
        reasoning: 'BenchLM public reasoning capability score.',
        knowledge: 'BenchLM public knowledge capability score.',
        multimodal: 'BenchLM public multimodal capability score.',
        mathematics: 'BenchLM public mathematics capability score.',
        multilingual: 'BenchLM public multilingual capability score.',
        'instruction-following': 'BenchLM public instruction-following capability score.',
      },
      costDefinitions: {
        output: 'Published output USD per one million tokens',
        blended3To1: '(3 × input USD/M + output USD/M) / 4',
      },
      capabilities: {
        scoreLanes: ['overall', 'agentic', 'coding', 'reasoning', 'knowledge', 'multimodal', 'mathematics', 'multilingual', 'instruction-following'],
        costBases: ['output', 'blended-3-1'],
        creators: ['OpenAI'],
        sourceTypes: ['Proprietary'],
        evidenceStatuses: ['supported'],
        statuses: ['current', 'archived'],
      },
      points: [{
        modelKey: 'benchlm:openai:gpt-5-6-sol',
        slug: 'gpt-5-6-sol',
        displayName: 'GPT-5.6 Sol',
        creator: 'OpenAI',
        familyId: 'openai:gpt-5-6',
        status: 'current',
        sourceType: 'Proprietary',
        evidenceStatus: 'supported',
        scores: {
          overall: 81.48,
          agentic: 84,
          coding: 77.95,
          reasoning: 82,
          knowledge: 80,
          multimodal: 75,
          mathematics: 83,
          multilingual: 79,
          'instruction-following': 86,
        },
        route: {
          sourceId: 'openrouter',
          providerId: 'openai',
          routeId: 'openai:gpt-5-6-sol',
          sourceModelId: 'openai/gpt-5-6-sol',
          canonicalSlug: 'gpt-5-6-sol',
          sourceArtifactId: 'openrouter-catalog',
          inputUsdPerMillion: 2,
          cachedInputUsdPerMillion: null,
          outputUsdPerMillion: 8,
          contextWindowTokens: 200_000,
          verificationStatus: 'primary',
          maxInputTokens: null,
          maxOutputTokens: 32_000,
          inputModalities: ['text'],
          outputModalities: ['text'],
          supportedParameters: ['tools'],
        },
      }],
    },
  };
}

function context(search = '') {
  return {
    request: new Request(`https://tokenbench.monomind.one/llm-price-performance/${search}`),
    env: { CATALOG_DB: {} as never },
  };
}

describe('price-performance SSR handler', () => {
  it('renders substantive default evidence and complete page metadata before JavaScript', async () => {
    pricePerformanceApi.mockResolvedValue(Response.json(envelope()));
    const response = await onRequestGet(context());
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('<h1 id="price-performance-heading">LLM Price vs. Performance Benchmark</h1>');
    expect(html).toContain('GPT-5.6 Sol');
    expect(html).toContain('81.5');
    expect(html).toContain('Pareto');
    expect(html).toContain('<title>LLM Price vs Performance | TokenBench</title>');
    expect(html).toContain('<meta name="description"');
    expect(html).toContain('<meta name="robots" content="index,follow,max-image-preview:large">');
    expect(html).toContain('<link rel="canonical" href="https://tokenbench.monomind.one/llm-price-performance/">');
    expect(html).toContain('<meta property="og:title"');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain('"@type":"WebPage"');
    expect(html).toContain('"@type":"Dataset"');
    expect(html).toContain('"version":"benchmark-price-performance-r1"');
    expect(html).toContain('id="price-performance-initial-data" type="application/json"');
  });

  it('keeps filtered requests canonically based at the single indexable page', async () => {
    pricePerformanceApi.mockResolvedValue(Response.json(envelope()));
    const response = await onRequestGet(context('?lane=coding&basis=blended-3-1'));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('<link rel="canonical" href="https://tokenbench.monomind.one/llm-price-performance/">');
    expect(html).not.toContain('canonical" href="https://tokenbench.monomind.one/llm-price-performance/?');
  });

  it('server-renders the last valid stale projection without removing evidence', async () => {
    pricePerformanceApi.mockResolvedValue(Response.json(envelope(true)));
    const response = await onRequestGet(context());
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('Stale benchmark data');
    expect(html).toContain('Showing the last published revision.');
    expect(html).toContain('GPT-5.6 Sol');
  });

  it('escapes hydration JSON so model text cannot terminate its script element', async () => {
    const value = envelope();
    const unsafe: PricePerformanceEnvelope = {
      ...value,
      data: {
        ...value.data,
        points: value.data.points.map((point) => ({
          ...point,
          displayName: 'GPT </script><script>unsafe()</script>\u2028\u2029',
        })),
      },
    };
    pricePerformanceApi.mockResolvedValue(Response.json(unsafe));

    const html = await (await onRequestGet(context())).text();

    const payload = html.match(/<script id="price-performance-initial-data" type="application\/json">([\s\S]*?)<\/script>/u)?.[1] ?? '';
    expect(payload).toContain('\\u003c/script\\u003e');
    expect(payload).toContain('\\u2028\\u2029');
    expect(payload).not.toContain('</script>');
  });

  it('returns an honest, fully described noindex 503 when no valid projection exists', async () => {
    pricePerformanceApi.mockResolvedValue(new Response('Unavailable', { status: 503 }));
    const response = await onRequestGet(context());
    const html = await response.text();

    expect(response.status).toBe(503);
    expect(response.headers.get('x-robots-tag')).toContain('noindex');
    expect(html).toContain('<h1>LLM price vs performance is temporarily unavailable</h1>');
    expect(html).toContain('<meta name="description"');
    expect(html).toContain('<meta name="robots" content="noindex,follow,max-image-preview:large">');
    expect(html).toContain('<link rel="canonical" href="https://tokenbench.monomind.one/llm-price-performance/">');
    expect(html).toContain('<meta property="og:title"');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
  });
});
