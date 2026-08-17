import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
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
    const document = new JSDOM(html).window.document;
    const footer = document.querySelector('footer.app-footer');
    const explore = footer?.querySelector('nav[aria-label="Explore"]');
    const articleChannels = footer?.querySelector('nav[aria-label="Articles"]');
    expect(explore?.querySelector('a[href="/articles"]')).toBeNull();
    expect([...articleChannels?.querySelectorAll('a') ?? []].map((link) => ({
      label: link.textContent,
      href: link.getAttribute('href'),
    }))).toEqual([
      { label: 'Guides', href: '/articles?channel=guides' },
      { label: 'Insights', href: '/articles?channel=insights' },
      { label: 'News', href: '/articles?channel=news' },
    ]);
    expect(html).toContain('aria-label="Newsletter signup"');
    expect(html).toContain('LLM API Cost &amp; Benchmark Cheatsheet');
    expect(html).not.toContain('href="/leaderboards/"');

    const popularModelsHtml = staticChrome('<main id="page-content">Evidence</main>', 'popularModels');
    expect(popularModelsHtml).toContain('id="primary-leaderboards-menu"');
    expect(popularModelsHtml).toContain('aria-current="page">Leaderboards');
  });
});
