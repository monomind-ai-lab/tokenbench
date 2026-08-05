import { existsSync, readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { validateMockupHtml } from './mockup-contract';

const hubHtml = readFileSync('.stitch/designs/compare-hub.html', 'utf8');
const detailHtml = readFileSync('.stitch/designs/compare-detail.html', 'utf8');
const compareMockups = [hubHtml, detailHtml];

describe('compare mockups', () => {
  it('uses the production TokenBench chrome and local brand asset', () => {
    for (const html of compareMockups) {
      const document = new JSDOM(html).window.document;
      const home = document.querySelector<HTMLAnchorElement>('a[aria-label="TokenBench home"]');
      const brandImage = home?.querySelector<HTMLImageElement>('img');
      const footer = document.querySelector('footer');

      expect(brandImage).not.toBeNull();
      expect(brandImage?.getAttribute('src')).toBe('/brand/monomind-tokenbench.png');
      expect(brandImage?.getAttribute('alt')).toBe('MonoMind monogram');
      expect(existsSync(`public${brandImage?.getAttribute('src') ?? ''}`)).toBe(true);
      expect(home?.textContent).toContain('TokenBench');
      expect(home?.textContent).toContain('The Decision Engine for AI Costs & Model Benchmarks');
      expect(document.querySelector('select[aria-label="Language"]')).not.toBeNull();
      expect([...footer?.querySelectorAll('a') ?? []].map((link) => [link.textContent?.trim(), link.getAttribute('href')])).toEqual([
        ['Powered by MonoMind AI Lab', 'https://monomind.one/'],
        ['Sources', '/sources/'],
        ['Methodology', '/methodology/'],
      ]);
      expect(footer?.textContent).toContain('Source-aware decision support.');
      expect(footer?.textContent).toContain('Verify provider evidence before purchasing.');
    }
  });

  it('keeps the empty reviewed-pair state honest', () => {
    const document = new JSDOM(hubHtml).window.document;
    expect(validateMockupHtml(hubHtml, { h1: 'Compare AI models', requiredSections: ['workspace', 'reviewed-matchups', 'guides', 'evidence-legend'] })).toEqual([]);
    expect(document.querySelector('[data-reviewed-pairs]')?.textContent).toContain('No reviewed matchups published yet');
    expect(document.querySelectorAll('[data-reviewed-pairs] a[href^="/compare/"]')).toHaveLength(0);
    expect(document.querySelector<HTMLButtonElement>('[data-compare-action]')?.disabled).toBe(true);
  });

  it('shows a neutral evidence-aware pair without a synthetic winner', () => {
    const document = new JSDOM(detailHtml).window.document;
    expect(validateMockupHtml(detailHtml, { h1: 'Claude 3.7 Sonnet vs GPT-4o', requiredSections: ['model-pair', 'metrics', 'workload', 'pricing-context', 'subscription-match', 'provenance', 'related-comparisons'] })).toEqual([]);
    expect(document.querySelector('[data-winner]')).toBeNull();
    expect(document.querySelectorAll('[data-missing]').length).toBeGreaterThan(0);
    expect([...document.querySelectorAll('[data-missing]')].every((node) => node.textContent?.trim() === 'Unavailable')).toBe(true);
    expect(detailHtml).toContain('No verified subscription match');
  });
});
