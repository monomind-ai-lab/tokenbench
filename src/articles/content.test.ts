import { describe, expect, it } from 'vitest';
import { ARTICLE_BY_SLUG, ARTICLES, articlePath } from './content';

const CURRENT_ARTICLE_SLUGS = [
  'track-claude-code-usage',
  'monitor-openai-codex-usage',
  'openrouter-guide-model-routing-cost-controls',
  'legitimate-free-ai-api-access-credits',
  'reduce-llm-api-costs-caching-batch-output-limits',
  'hybrid-router',
  'routing-decision-record',
  'model-selection-unknowns',
] as const;

describe('unified article content', () => {
  it('keeps every current article card in a typed, canonical article index', () => {
    expect(ARTICLES.map((article) => article.slug)).toEqual(CURRENT_ARTICLE_SLUGS);
    expect(ARTICLES.filter((article) => article.channel === 'guides')).toHaveLength(6);
    expect(ARTICLES.filter((article) => article.channel === 'insights')).toHaveLength(2);
    expect(ARTICLES.filter((article) => article.channel === 'news')).toHaveLength(0);

    for (const slug of CURRENT_ARTICLE_SLUGS) {
      const article = ARTICLE_BY_SLUG.get(slug);
      expect(article).toBeDefined();
      expect(articlePath(slug)).toBe(`/articles/${slug}/`);
      expect(article?.sections.length).toBeGreaterThan(0);
    }
  });
});
