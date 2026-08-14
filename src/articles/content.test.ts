import { describe, expect, it } from 'vitest';
import { INSIGHT_CATEGORIES, INSIGHTS, REQUIRED_GUIDE_TOPICS } from './content';
import { GUIDES } from '../guides/content';

describe('V2.1 editorial inventory', () => {
  it('publishes the exact eight required guide topics with durable decision evidence', () => {
    expect(GUIDES).toHaveLength(8);
    expect(GUIDES.map((guide) => guide.topic)).toEqual(REQUIRED_GUIDE_TOPICS);
    for (const guide of GUIDES) {
      expect(guide.channel).toBe('guide');
      expect(guide.decisionQuestion).not.toBe('');
      expect(guide.assumptions.length).toBeGreaterThan(0);
      expect(guide.framework.length).toBeGreaterThan(0);
      expect(guide.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(guide.relatedDecisionLinks.length).toBeGreaterThan(0);
      expect(guide.factBlocks.length).toBeGreaterThan(0);
      expect(guide.interpretationBlocks.length).toBeGreaterThan(0);
      expect(guide.factBlocks.every((block) => block.sources.length > 0 && block.sources.every((source) => source.effectiveAt !== null || source.evidenceStatus === 'undated'))).toBe(true);
    }
  });

  it('has a factual and interpreted, evidence-dated insight for each required category', () => {
    expect(INSIGHT_CATEGORIES).toEqual([
      'Releases',
      'Benchmark Analyses',
      'Pricing Changes',
      'Lifecycle Announcements',
      'Ecosystem/Technical Insights',
    ]);
    expect(new Set(INSIGHTS.map((insight) => insight.category))).toEqual(new Set(INSIGHT_CATEGORIES));
    for (const insight of INSIGHTS) {
      expect(insight.channel).toBe('insight');
      expect(insight.factBlocks.length).toBeGreaterThan(0);
      expect(insight.interpretationBlocks.length).toBeGreaterThan(0);
      expect(insight.evidenceTimeline.length).toBeGreaterThan(0);
      expect(insight.evidenceTimeline.every((entry) => entry.effectiveAt || entry.evidenceStatus === 'undated')).toBe(true);
    }
  });
});
