import { describe, expect, it } from 'vitest';
import type { AppRoute } from '../routing/routes';
import { metadataForRoute } from './metadata';

const origin = 'https://tokenbench.monomind.one';

const fixedRouteCases: Array<{ route: AppRoute; canonical: string }> = [
  { route: { kind: 'home' }, canonical: origin },
  { route: { kind: 'guides' }, canonical: `${origin}/guides/` },
  { route: { kind: 'guides', slug: 'track-claude-code-usage' }, canonical: `${origin}/guides/track-claude-code-usage/` },
  { route: { kind: 'guides', slug: 'monitor-openai-codex-usage' }, canonical: `${origin}/guides/monitor-openai-codex-usage/` },
  { route: { kind: 'guides', slug: 'openrouter-guide-model-routing-cost-controls' }, canonical: `${origin}/guides/openrouter-guide-model-routing-cost-controls/` },
  { route: { kind: 'guides', slug: 'legitimate-free-ai-api-access-credits' }, canonical: `${origin}/guides/legitimate-free-ai-api-access-credits/` },
  { route: { kind: 'guides', slug: 'reduce-llm-api-costs-caching-batch-output-limits' }, canonical: `${origin}/guides/reduce-llm-api-costs-caching-batch-output-limits/` },
  { route: { kind: 'tools' }, canonical: `${origin}/tools/` },
  { route: { kind: 'calculator' }, canonical: `${origin}/tools/subscriptions-vs-apis/` },
  { route: { kind: 'compareHub' }, canonical: `${origin}/compare/` },
  { route: { kind: 'leaderboards' }, canonical: `${origin}/leaderboards/` },
  { route: { kind: 'methodologyBenchAlign' }, canonical: `${origin}/methodology/benchalign/` },
  { route: { kind: 'leaderboard', key: 'llm-overall' }, canonical: `${origin}/leaderboards/llm/overall/` },
  { route: { kind: 'leaderboard', key: 'llm-coding' }, canonical: `${origin}/leaderboards/llm/coding/` },
  { route: { kind: 'leaderboard', key: 'llm-agentic' }, canonical: `${origin}/leaderboards/llm/agentic/` },
  { route: { kind: 'leaderboard', key: 'llm-human-preference' }, canonical: `${origin}/leaderboards/llm/human-preference/` },
  { route: { kind: 'leaderboard', key: 'llm-value' }, canonical: `${origin}/leaderboards/llm/value/` },
  { route: { kind: 'leaderboard', key: 'llm-pricing-context' }, canonical: `${origin}/leaderboards/llm/pricing-context/` },
  { route: { kind: 'leaderboard', key: 'multimodal-vision-documents' }, canonical: `${origin}/leaderboards/multimodal/vision-documents/` },
  { route: { kind: 'leaderboard', key: 'media-text-to-image' }, canonical: `${origin}/leaderboards/media/text-to-image/` },
  { route: { kind: 'leaderboard', key: 'media-image-editing' }, canonical: `${origin}/leaderboards/media/image-editing/` },
  { route: { kind: 'leaderboard', key: 'media-text-to-video' }, canonical: `${origin}/leaderboards/media/text-to-video/` },
  { route: { kind: 'leaderboard', key: 'media-image-to-video' }, canonical: `${origin}/leaderboards/media/image-to-video/` },
  { route: { kind: 'leaderboard', key: 'media-video-editing' }, canonical: `${origin}/leaderboards/media/video-editing/` },
];

describe('route metadata registry', () => {
  it('gives every fixed page unique, canonical TokenBench search and social metadata', () => {
    const metadata = fixedRouteCases.map(({ route }) => metadataForRoute(route));

    expect(new Set(metadata.map((page) => page.title)).size).toBe(fixedRouteCases.length);
    expect(new Set(metadata.map((page) => page.description)).size).toBe(fixedRouteCases.length);
    expect(new Set(metadata.map((page) => page.canonical)).size).toBe(fixedRouteCases.length);
    expect(new Set(metadata.map((page) => page.h1)).size).toBe(fixedRouteCases.length);

    for (const [index, page] of metadata.entries()) {
      expect(page.title).toContain('TokenBench');
      expect(page.description.length).toBeGreaterThan(70);
      expect(page.canonical).toBe(fixedRouteCases[index].canonical);
      expect(page.canonical.startsWith(origin)).toBe(true);
      expect(page.canonical).not.toContain('ai-plans.monomind.one');
      expect(page.h1.length).toBeGreaterThan(12);
      expect(page.openGraph.title).toBe(page.title);
      expect(page.openGraph.description).toBe(page.description);
      expect(page.openGraph.url).toBe(page.canonical);
      expect(page.openGraph.image.startsWith(origin)).toBe(true);
      expect(page.twitter.title).toBe(page.title);
      expect(page.twitter.description).toBe(page.description);
      expect(page.twitter.image.startsWith(origin)).toBe(true);
    }
  });

  it('uses article metadata for guide articles without losing their topical H1s', () => {
    const page = metadataForRoute({ kind: 'guides', slug: 'track-claude-code-usage' });

    expect(page.openGraph.type).toBe('article');
    expect(page.h1).toBe('How to Track Claude Code Usage, Tokens, and Spend');
    expect(page.canonical).toBe(`${origin}/guides/track-claude-code-usage/`);
  });

  it('keeps dynamic comparison canonical and Open Graph URLs slashless', () => {
    const page = metadataForRoute({ kind: 'comparison', pair: 'a-vs-b' });

    expect(page.canonical).toBe(`${origin}/compare/a-vs-b`);
    expect(page.openGraph.url).toBe(`${origin}/compare/a-vs-b`);
  });
});
