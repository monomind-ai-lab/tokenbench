import { describe, expect, it } from 'vitest';
import { INSIGHTS, insightPath } from '../articles/content';
import { GUIDES, guidePath } from '../guides/content';
import { FIXED_ROUTES, LEADERBOARD_ROUTES, matchRoute, pathnameForRoute, ROUTE_PATHS, staticHtmlEntries, type LeaderboardKey } from './routes';

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

const fixedRouteCases: Array<readonly [string, object]> = [
  ['/', { kind: 'home' }],
  ['/articles', { kind: 'articles' }],
  ['/articles/guides', { kind: 'guides' }],
  ['/articles/insights', { kind: 'insights' }],
  ...GUIDES.map((guide) => [guidePath(guide.slug).slice(0, -1), { kind: 'guides', slug: guide.slug }] as const),
  ...INSIGHTS.map((insight) => [insightPath(insight.slug).slice(0, -1), { kind: 'insightDetail', slug: insight.slug }] as const),
  ['/tools', { kind: 'tools' }],
  ['/cost', { kind: 'cost' }],
  ['/cost/calculator', { kind: 'calculator' }],
  ['/cost/breakeven', { kind: 'breakeven' }],
  ['/compare', { kind: 'compareHub' }],
  ['/llm-price-performance', { kind: 'pricePerformance' }],
  ['/newsletter/confirmed', { kind: 'newsletterConfirmed' }],
  ['/welcome', { kind: 'welcome' }],
  ['/privacy', { kind: 'privacy' }],
  ['/leaderboards', { kind: 'leaderboards' }],
  ['/models', { kind: 'models' }],
  ['/models/lifecycle', { kind: 'modelLifecycle' }],
  ['/leaderboards/llm/overall', { kind: 'redirect', to: '/leaderboards/overall/' }],
  ['/leaderboards/llm/coding', { kind: 'redirect', to: '/leaderboards/coding/' }],
  ['/leaderboards/llm/agentic', { kind: 'redirect', to: '/leaderboards/agentic/' }],
  ['/leaderboards/llm/reasoning', { kind: 'redirect', to: '/leaderboards/reasoning/' }],
  ['/leaderboards/llm/knowledge', { kind: 'leaderboard', key: 'llm-knowledge' }],
  ['/leaderboards/llm/human-preference', { kind: 'leaderboard', key: 'llm-human-preference' }],
  ['/leaderboards/llm/value', { kind: 'leaderboard', key: 'llm-value' }],
  ['/leaderboards/llm/pricing-context', { kind: 'leaderboard', key: 'llm-pricing-context' }],
  ['/leaderboards/multimodal/vision-documents', { kind: 'redirect', to: '/leaderboards/multimodal/' }],
  ['/leaderboards/media/text-to-image', { kind: 'leaderboard', key: 'media-text-to-image' }],
  ['/leaderboards/media/image-editing', { kind: 'leaderboard', key: 'media-image-editing' }],
  ['/leaderboards/media/text-to-video', { kind: 'leaderboard', key: 'media-text-to-video' }],
  ['/leaderboards/media/image-to-video', { kind: 'leaderboard', key: 'media-image-to-video' }],
  ['/leaderboards/media/video-editing', { kind: 'leaderboard', key: 'media-video-editing' }],
];

describe('TokenBench route registry', () => {
  it('matches every fixed route with and without its trailing slash', () => {
    for (const [pathname, expected] of fixedRouteCases) {
      if (pathname === '/') {
        expect(matchRoute('/')).toEqual(expected);
        continue;
      }

      expect(matchRoute(pathname)).toEqual(expected);
      expect(matchRoute(`${pathname}/`)).toEqual(expected);
    }
  });

  it('redirects legacy comparisons while matching the canonical pair route', () => {
    const expected = { kind: 'comparison', pair: 'claude-4-vs-gpt-5' };

    expect(matchRoute('/models/compare/claude-4-vs-gpt-5')).toEqual(expected);
    expect(matchRoute('/models/compare/claude-4-vs-gpt-5/')).toEqual(expected);
    expect(matchRoute('/compare/claude-4-vs-gpt-5')).toEqual({ kind: 'redirect', to: '/models/compare/claude-4-vs-gpt-5/' });
    expect(matchRoute('/compare/claude-4-vs-gpt-5/')).toEqual({ kind: 'redirect', to: '/models/compare/claude-4-vs-gpt-5/' });
    expect(matchRoute('/compare/')).toEqual({ kind: 'compareHub' });
  });

  it('canonicalizes V2.1 comparison and leaderboard destinations', () => {
    expect(pathnameForRoute({ kind: 'comparison', pair: 'alpha-vs-beta' }))
      .toBe('/models/compare/alpha-vs-beta/');
    expect(matchRoute('/models/compare/alpha-vs-beta/')).toEqual({ kind: 'comparison', pair: 'alpha-vs-beta' });
    expect(matchRoute('/compare/alpha-vs-beta/')).toEqual({ kind: 'redirect', to: '/models/compare/alpha-vs-beta/' });
    expect(matchRoute('/leaderboards/sla/')).toEqual({ kind: 'leaderboardSla' });
    expect(matchRoute('/leaderboards/custom/')).toEqual({ kind: 'leaderboardCustom' });
    expect(matchRoute('/leaderboards/coding/')).toEqual({ kind: 'leaderboardCategory', category: 'coding' });
    expect(matchRoute('/leaderboards/llm/coding/')).toEqual({ kind: 'redirect', to: '/leaderboards/coding/' });
  });

  it('keeps insight detail paths distinct from the insight index', () => {
    expect(matchRoute(insightPath(INSIGHTS[0].slug))).toEqual({ kind: 'insightDetail', slug: INSIGHTS[0].slug });
    expect(matchRoute('/articles/insights/benchmark-update/')).toEqual({ kind: 'notFound' });
    expect(pathnameForRoute({ kind: 'insightDetail', slug: 'benchmark update' }))
      .toBe('/articles/insights/benchmark%20update/');
  });

  it('matches durable model profiles as one decoded route segment', () => {
    expect(matchRoute('/models/gpt-5-6-sol')).toEqual({ kind: 'modelProfile', slug: 'gpt-5-6-sol' });
    expect(matchRoute('/models/gpt-5-6-sol/')).toEqual({ kind: 'modelProfile', slug: 'gpt-5-6-sol' });
    expect(matchRoute('/models/encoded%20model/')).toEqual({ kind: 'modelProfile', slug: 'encoded model' });
  });

  it('publishes the approved decision hierarchy and canonical redirects', () => {
    expect(ROUTE_PATHS.methodologyBenchAlign).toBe('/methodology/benchalign/');
    expect(matchRoute('/methodology/benchalign/')).toEqual({ kind: 'methodologyBenchAlign' });
    expect(matchRoute('/leaderboard')).toEqual({ kind: 'redirect', to: '/leaderboards/' });
    expect(matchRoute('/leaderboard/llm/coding')).toEqual({ kind: 'redirect', to: '/leaderboards/coding/' });
    expect(matchRoute('/leaderboard/llm/reasoning')).toEqual({ kind: 'redirect', to: '/leaderboards/reasoning/' });
    expect(matchRoute('/leaderboard/llm/knowledge')).toEqual({ kind: 'redirect', to: '/leaderboards/llm/knowledge/' });
    expect(matchRoute('/leaderboard/not-a-real-route/')).toEqual({ kind: 'notFound' });
    expect(matchRoute('/tools/')).toEqual({ kind: 'tools' });
    expect(LEADERBOARD_ROUTES['llm-overall'].navigationLabel).toBe('Overall benchmarks');
    expect(LEADERBOARD_ROUTES['llm-agentic'].navigationLabel).toBe('Agentic performance');
  });

  it('does not turn unknown fixed-path candidates into published pages', () => {
    expect(matchRoute('/articles/guides/not-a-guide/')).toEqual({ kind: 'notFound' });
    expect(matchRoute('/leaderboards/llm/not-a-metric/')).toEqual({ kind: 'notFound' });
  });

  it('derives every Vite input from the fixed registry without a dynamic comparison page', () => {
    const inputs = staticHtmlEntries('/generated-tokenbench');

    expect(Object.keys(inputs).sort()).toEqual(FIXED_ROUTES.map((route) => route.id).sort());
    for (const guide of GUIDES) expect(Object.values(inputs)).toContain(`/generated-tokenbench${guidePath(guide.slug)}index.html`);
    for (const insight of INSIGHTS) expect(Object.values(inputs)).toContain(`/generated-tokenbench${insightPath(insight.slug)}index.html`);
    expect(inputs.home).toBe('/generated-tokenbench/index.html');
    expect(Object.values(inputs)).not.toContain('/generated-tokenbench/compare/claude-4-vs-gpt-5/index.html');
    expect(Object.values(inputs)).toContain('/generated-tokenbench/leaderboards/math/index.html');
    expect(Object.values(inputs)).toContain('/generated-tokenbench/leaderboards/sla/index.html');
  });

  it('keeps human-readable navigation labels on the single leaderboard registry', () => {
    expect(LEADERBOARD_ROUTES['llm-overall'].navigationLabel).toBe('Overall benchmarks');
    expect(LEADERBOARD_ROUTES['llm-reasoning'].navigationLabel).toBe('Reasoning');
    expect(LEADERBOARD_ROUTES['llm-knowledge'].navigationLabel).toBe('Knowledge');
    expect(LEADERBOARD_ROUTES['media-text-to-video'].navigationLabel).toBe('Text to video');
  });

  it('keeps every semantic leaderboard document title tied to its canonical H1', () => {
    expect(Object.fromEntries(
      Object.entries(LEADERBOARD_ROUTES).map(([key, route]) => [key, route.seo.h1]),
    )).toEqual(APPROVED_LEADERBOARD_TITLES);

    for (const [key, h1] of Object.entries(APPROVED_LEADERBOARD_TITLES) as Array<[LeaderboardKey, string]>) {
      expect(LEADERBOARD_ROUTES[key].seo.title).toBe(`${h1} | TokenBench`);
    }
  });
});
