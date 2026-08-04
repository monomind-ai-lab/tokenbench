import { describe, expect, it } from 'vitest';
import { GUIDES, GUIDE_BY_SLUG } from './content';

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

  it('uses official HTTPS sources and valid cross-links', () => {
    for (const guide of GUIDES) {
      const sources = guide.sections.flatMap((section) => section.sources ?? []);
      expect(sources.length).toBeGreaterThan(0);
      expect(sources.every((source) => source.url.startsWith('https://'))).toBe(true);
      expect(guide.relatedSlugs).toHaveLength(3);
      expect(guide.relatedSlugs.every((slug) => slug !== guide.slug && GUIDE_BY_SLUG.has(slug))).toBe(true);
    }
  });
});
