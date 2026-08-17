import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

const commonScript = readFileSync(resolve('prototypes/ui-revamp-3/common.js'), 'utf8');

function renderFooter() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'https://preview.tokenbench.test/',
  });

  dom.window.eval(commonScript);
  (dom.window as unknown as { setupGlobalFooter: () => void }).setupGlobalFooter();

  return dom.window.document.querySelector<HTMLElement>('footer.articles-footer');
}

describe('shared prototype footer', () => {
  it('separates Explore destinations from article channels', () => {
    const footer = renderFooter();
    expect(footer).not.toBeNull();

    const columns = [...footer!.querySelectorAll<HTMLElement>('.articles-footer-links')];
    expect(columns).toHaveLength(2);

    const [explore, articles] = columns;
    expect(explore.getAttribute('aria-label')).toBe('Explore');
    expect([...explore.querySelectorAll('a')].map((link) => link.textContent?.trim())).toEqual([
      'Models workbench',
      'Subscribe vs API',
      'Popular models',
      'Make it yours',
      'Compare models',
    ]);

    expect(articles.getAttribute('aria-label')).toBe('Articles');
    expect(articles.querySelector('strong')?.textContent?.trim()).toBe('Articles');
    expect([...articles.querySelectorAll('a')].map((link) => ({
      label: link.textContent?.trim(),
      href: link.getAttribute('href'),
    }))).toEqual([
      { label: 'Guides', href: '/articles?channel=guides' },
      { label: 'Insights', href: '/articles?channel=insights' },
      { label: 'News', href: '/articles?channel=news' },
    ]);
  });
});
