import { describe, expect, it } from 'vitest';
import { staticChrome } from './static-page';

describe('static site chrome', () => {
  it('links and marks the price-performance decision surface in crawlable HTML', () => {
    const html = staticChrome('<main id="page-content">Evidence</main>', 'pricePerformance');

    expect(html).toContain('<a href="/llm-price-performance/" aria-current="page">Price vs Performance</a>');
    expect(html).toContain('<a href="/llm-price-performance/">Price vs performance</a>');
    expect(html).toContain('<a href="/#catalog">Models</a>');
    expect(html).toContain('<a href="/compare">Compare</a>');
    expect(html).toContain('<a href="/make-it-yours">Make it yours</a>');
    expect(html).not.toContain('href="/leaderboards/"');
  });
});
