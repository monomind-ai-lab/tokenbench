import { describe, expect, it } from 'vitest';
import { INSIGHTS, insightPath } from '../articles/content';
import { GUIDES, guidePath } from '../guides/content';
import { LEADERBOARD_CATEGORIES, type AppRoute, type LeaderboardKey } from '../routing/routes';
import { metadataForRoute } from './metadata';

const origin = 'https://tokenbench.monomind.one';
const HOME_H1 = 'Transparent AI Costs. Verified Benchmarks.';
const HOME_SUBCOPY = 'The free decision engine for your AI stack. Evaluate exact model pricing and source-backed performance data so you can choose the best LLM for your workload.';

const APPROVED_LEADERBOARD_TITLES = {
  'llm-overall': 'Overall benchmarks',
  'llm-coding': 'Coding benchmark',
  'llm-agentic': 'Agentic performance',
  'llm-reasoning': 'Reasoning',
  'llm-knowledge': 'Knowledge',
  'llm-human-preference': 'Human preference',
  'llm-value': 'Value frontier',
  'llm-pricing-context': 'Pricing and context',
  'multimodal-vision-documents': 'Multimodal',
  'media-text-to-image': 'Text to image',
  'media-image-editing': 'Image editing',
  'media-text-to-video': 'Text to video',
  'media-image-to-video': 'Image to video',
  'media-video-editing': 'Video editing',
} as const satisfies Record<LeaderboardKey, string>;

const fixedRouteCases: Array<{ route: AppRoute; canonical: string }> = [
  { route: { kind: 'home' }, canonical: origin },
  { route: { kind: 'cost' }, canonical: `${origin}/cost/` },
  { route: { kind: 'calculator' }, canonical: `${origin}/cost/calculator/` },
  { route: { kind: 'breakeven' }, canonical: `${origin}/cost/breakeven/` },
  { route: { kind: 'articles' }, canonical: `${origin}/articles/` },
  { route: { kind: 'guides' }, canonical: `${origin}/articles/guides/` },
  { route: { kind: 'insights' }, canonical: `${origin}/articles/insights/` },
  ...GUIDES.map((guide) => ({ route: { kind: 'guides' as const, slug: guide.slug }, canonical: `${origin}${guidePath(guide.slug)}` })),
  ...INSIGHTS.map((insight) => ({ route: { kind: 'insightDetail' as const, slug: insight.slug }, canonical: `${origin}${insightPath(insight.slug)}` })),
  { route: { kind: 'tools' }, canonical: `${origin}/tools/` },
  { route: { kind: 'compareHub' }, canonical: `${origin}/compare/` },
  { route: { kind: 'pricePerformance' }, canonical: `${origin}/llm-price-performance/` },
  { route: { kind: 'newsletterConfirmed' }, canonical: `${origin}/newsletter/confirmed/` },
  { route: { kind: 'welcome' }, canonical: `${origin}/welcome/` },
  { route: { kind: 'privacy' }, canonical: `${origin}/privacy/` },
  { route: { kind: 'leaderboards' }, canonical: `${origin}/leaderboards/` },
  ...LEADERBOARD_CATEGORIES.map((category) => ({
    route: { kind: 'leaderboardCategory' as const, category },
    canonical: `${origin}/leaderboards/${category}/`,
  })),
  { route: { kind: 'leaderboardSla' }, canonical: `${origin}/leaderboards/sla/` },
  { route: { kind: 'leaderboardCustom' }, canonical: `${origin}/leaderboards/custom/` },
  { route: { kind: 'models' }, canonical: `${origin}/models/` },
  { route: { kind: 'modelLifecycle' }, canonical: `${origin}/models/lifecycle/` },
  { route: { kind: 'methodologyBenchAlign' }, canonical: `${origin}/methodology/benchalign/` },
  { route: { kind: 'leaderboard', key: 'llm-overall' }, canonical: `${origin}/leaderboards/llm/overall/` },
  { route: { kind: 'leaderboard', key: 'llm-coding' }, canonical: `${origin}/leaderboards/llm/coding/` },
  { route: { kind: 'leaderboard', key: 'llm-agentic' }, canonical: `${origin}/leaderboards/llm/agentic/` },
  { route: { kind: 'leaderboard', key: 'llm-reasoning' }, canonical: `${origin}/leaderboards/llm/reasoning/` },
  { route: { kind: 'leaderboard', key: 'llm-knowledge' }, canonical: `${origin}/leaderboards/llm/knowledge/` },
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
  it('keeps canonical Home metadata aligned with the approved decision copy', () => {
    const page = metadataForRoute({ kind: 'home' });

    expect(page.h1).toBe(HOME_H1);
    expect(page.description).toBe(HOME_SUBCOPY);
    expect(page.openGraph.description).toBe(HOME_SUBCOPY);
    expect(page.twitter.description).toBe(HOME_SUBCOPY);
  });

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
      expect(page.h1.trim().length).toBeGreaterThanOrEqual(3);
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
    const guide = GUIDES[0];
    const page = metadataForRoute({ kind: 'guides', slug: guide.slug });

    expect(page.openGraph.type).toBe('article');
    expect(page.h1).toBe(guide.title);
    expect(page.canonical).toBe(`${origin}${guidePath(guide.slug)}`);
  });

  it('uses article metadata for every insight detail with its canonical record path', () => {
    for (const insight of INSIGHTS) {
      const page = metadataForRoute({ kind: 'insightDetail', slug: insight.slug });
      expect(page.openGraph.type).toBe('article');
      expect(page.h1).toBe(insight.title);
      expect(page.canonical).toBe(`${origin}${insightPath(insight.slug)}`);
    }
  });

  it('keeps the crawlable leaderboard heading aligned with the interactive directory', () => {
    const page = metadataForRoute({ kind: 'leaderboards' });

    expect(page.h1).toBe('Model leaderboards');
    expect(page.canonical).toBe(`${origin}/leaderboards/`);
  });

  it('publishes unique crawlable metadata for the price-performance decision surface', () => {
    const page = metadataForRoute({ kind: 'pricePerformance' });

    expect(page.title).toBe('LLM Price vs Performance | TokenBench');
    expect(page.h1).toBe('LLM Price vs. Performance Benchmark');
    expect(page.description).toContain('API price');
    expect(page.description).toContain('Pareto');
    expect(page.canonical).toBe(`${origin}/llm-price-performance/`);
    expect(page.robots).toBe('index,follow');
    expect(page.openGraph.url).toBe(page.canonical);
    expect(page.twitter.title).toBe(page.title);
  });

  it('uses every approved succinct leaderboard title for document and social metadata', () => {
    for (const [key, h1] of Object.entries(APPROVED_LEADERBOARD_TITLES) as Array<[LeaderboardKey, string]>) {
      const page = metadataForRoute({ kind: 'leaderboard', key });
      const title = `${h1} | TokenBench`;
      expect(page.h1).toBe(h1);
      expect(page.title).toBe(title);
      expect(page.openGraph.title).toBe(title);
      expect(page.twitter.title).toBe(title);
    }
  });

  it('publishes noindex confirmation metadata on the canonical confirmation path', () => {
    const page = metadataForRoute({ kind: 'newsletterConfirmed' });

    expect(page.canonical).toBe(`${origin}/newsletter/confirmed/`);
    expect(page.openGraph.url).toBe(`${origin}/newsletter/confirmed/`);
    expect(page.robots).toBe('noindex,follow');
    expect(page.title).toContain('TokenBench');
    expect(page.openGraph.title).toBe(page.title);
    expect(page.twitter.title).toBe(page.title);
  });

  it('keeps dynamic comparison metadata on the canonical trailing-slash model route', () => {
    const page = metadataForRoute({ kind: 'comparison', pair: 'a-vs-b' });

    expect(page.canonical).toBe(`${origin}/models/compare/a-vs-b/`);
    expect(page.openGraph.url).toBe(`${origin}/models/compare/a-vs-b/`);
  });

  it('gives dynamic model profiles a unique canonical and complete social metadata', () => {
    const page = metadataForRoute({ kind: 'modelProfile', slug: 'gpt-5-6-sol' });
    expect(page.canonical).toBe(`${origin}/models/gpt-5-6-sol/`);
    expect(page.title).toContain('gpt 5 6 sol');
    expect(page.description.length).toBeGreaterThan(70);
    expect(page.robots).toBe('index,follow');
    expect(page.openGraph.url).toBe(page.canonical);
    expect(page.twitter.title).toBe(page.title);
  });

  it('publishes canonical metadata for the model lifecycle radar', () => {
    const page = metadataForRoute({ kind: 'modelLifecycle' });
    expect(page.title).toBe('Model Lifecycle Radar | TokenBench');
    expect(page.canonical).toBe(`${origin}/models/lifecycle/`);
    expect(page.description).toContain('current and archived');
    expect(page.description).not.toContain('opencodex');
  });

  it.each([
    ['llm-reasoning', 'Reasoning'],
    ['llm-knowledge', 'Knowledge'],
  ] as const)('labels %s as a category evidence lens rather than a BenchAlign ranking', (key, label) => {
    const page = metadataForRoute({ kind: 'leaderboard', key });

    expect(page.title).toContain(label);
    expect(page.description).toContain('category evidence lens');
    expect(page.description).toContain('not a validated BenchAlign ranking');
    expect(page.canonical).toBe(`${origin}/leaderboards/llm/${label.toLowerCase()}/`);
  });
});

  it('describes the calculator with message-level workload and directional pricing facts', () => {
    const page = metadataForRoute({ kind: 'calculator' });
    expect(page.description).toContain('conversations');
    expect(page.description).toContain('messages');
    expect(page.description).toContain('input and output tokens');
    expect(page.description).toContain('API-equivalent pricing');
    expect(page.canonical).toBe(`${origin}/cost/calculator/`);
  });
