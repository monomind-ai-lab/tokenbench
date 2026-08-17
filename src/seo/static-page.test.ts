import { describe, expect, it } from 'vitest';
import { staticChrome } from './static-page';

describe('static site chrome', () => {
  it('links and marks the price-performance decision surface in crawlable HTML', () => {
    const html = staticChrome('<main id="page-content">Evidence</main>', 'pricePerformance');

    expect(html).toContain('id="primary-models-menu"');
    expect(html).toContain('aria-current="page">Models');
    expect(html).toContain('id="primary-articles-panel"');
    expect(html).toContain('href="/articles?channel=guides"');
    expect(html).toContain('<a href="/llm-price-performance/">Price vs performance</a>');
    expect(html).toContain('<a href="/models">Models workbench</a>');
    expect(html).toContain('<a href="/compare">Compare models</a>');
    expect(html).toContain('<a href="/make-it-yours/">Make it yours</a>');
    expect(html).toContain('<a href="/articles">Articles</a>');
    expect(html).toContain('aria-label="Newsletter signup"');
    expect(html).toContain('LLM API Cost &amp; Benchmark Cheatsheet');
    expect(html).not.toContain('href="/leaderboards/"');
  });
});
