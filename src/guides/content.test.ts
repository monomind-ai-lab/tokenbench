import { describe, expect, it } from 'vitest';
import { LEADERBOARD_ROUTES } from '../routing/routes';
import { articlePath, GUIDES, GUIDE_BY_SLUG, legacyGuidePath } from './content';

const expectedContextualLeaderboards = {
  'track-claude-code-usage': ['llm-pricing-context'],
  'monitor-openai-codex-usage': ['llm-pricing-context'],
  'openrouter-guide-model-routing-cost-controls': ['llm-pricing-context'],
  'legitimate-free-ai-api-access-credits': ['llm-pricing-context'],
  'reduce-llm-api-costs-caching-batch-output-limits': ['llm-coding', 'llm-value'],
} as const;

describe('guide catalog', () => {
  it('publishes five complete, uniquely routed guides', () => {
    expect(GUIDES).toHaveLength(5);
    expect(new Set(GUIDES.map((guide) => guide.slug)).size).toBe(5);
    for (const guide of GUIDES) {
      expect(guide.title.length).toBeGreaterThan(20);
      expect(guide.seoTitle.length).toBeLessThanOrEqual(60);
      expect(guide.description.length).toBeGreaterThanOrEqual(120);
      expect(guide.description.length).toBeLessThanOrEqual(160);
      expect(guide.sections.length).toBeGreaterThanOrEqual(4);
      expect(new Set(guide.sections.map((section) => section.id)).size).toBe(guide.sections.length);
    }
  });

  it('gives each guide a canonical article detail route while retaining its legacy guide path', () => {
    for (const guide of GUIDES) {
      expect(articlePath(guide.slug)).toBe(`/articles/${guide.slug}/`);
      expect(legacyGuidePath(guide.slug)).toBe(`/guides/${guide.slug}/`);
    }
  });

  it('uses official HTTPS sources and valid cross-links', () => {
    for (const guide of GUIDES) {
      const sources = guide.sections.flatMap((section) => section.sources ?? []);
      expect(sources.length).toBeGreaterThan(0);
      expect(sources.every((source) => source.url.startsWith('https://'))).toBe(true);
      expect(guide.relatedSlugs).toHaveLength(3);
      expect(guide.relatedSlugs.every((slug) => slug !== guide.slug && GUIDE_BY_SLUG.has(slug))).toBe(true);
    }
  });

  it('gives every article an honest, route-registry-backed leaderboard context', () => {
    for (const guide of GUIDES) {
      const expectedKeys = expectedContextualLeaderboards[guide.slug as keyof typeof expectedContextualLeaderboards];
      expect(guide.contextualLinks?.map((link) => link.leaderboard)).toEqual(expectedKeys);
      for (const link of guide.contextualLinks ?? []) {
        expect(LEADERBOARD_ROUTES[link.leaderboard]).toBeDefined();
      }
    }
  });
});
