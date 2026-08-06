import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { validateMockupHtml } from './mockup-contract';

const hubPath = resolve('.stitch/designs/compare-hub.html');
const detailPath = resolve('.stitch/designs/compare-detail.html');
const hubHtml = readFileSync(hubPath, 'utf8');
const detailHtml = readFileSync(detailPath, 'utf8');
const compareMockups = [{ html: hubHtml, htmlPath: hubPath }, { html: detailHtml, htmlPath: detailPath }];

describe('compare mockups', () => {
  it('uses the production TokenBench chrome and local brand asset', () => {
    for (const { html, htmlPath } of compareMockups) {
      const document = new JSDOM(html).window.document;
      const home = document.querySelector<HTMLAnchorElement>('a[aria-label="TokenBench home"]');
      const brandImage = home?.querySelector<HTMLImageElement>('img');
      const footer = document.querySelector('footer');

      expect(brandImage).not.toBeNull();
      const logoSrc = brandImage?.getAttribute('src') ?? '';
      const resolvedLogoPath = fileURLToPath(new URL(logoSrc, pathToFileURL(htmlPath)));
      expect(resolvedLogoPath).toBe(resolve('public/brand/monomind-tokenbench.png'));
      expect(brandImage?.getAttribute('alt')).toBe('MonoMind monogram');
      expect(existsSync(resolvedLogoPath)).toBe(true);
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

  it('exposes complete, honest provenance metadata for the comparison pair', () => {
    const document = new JSDOM(detailHtml).window.document;
    const provenance = document.querySelector<HTMLElement>('[data-mockup-section="provenance"]');
    const metadata = provenance?.querySelector<HTMLDListElement>('dl.provenance-metadata');

    expect(metadata).not.toBeNull();

    const fields = [...metadata!.querySelectorAll(':scope > div')];
    expect(fields.map((field) => field.querySelector('dt')?.textContent?.trim())).toEqual([
      'Source',
      'Publication time',
      'Freshness',
      'Methodology',
    ]);

    const values = new Map(fields.map((field) => [field.querySelector('dt')?.textContent?.trim(), field.querySelector('dd')]));
    expect(values.get('Source')?.textContent).toContain('BenchLM');
    expect(values.get('Source')?.textContent).toContain('OpenRouter');

    for (const label of ['Publication time', 'Freshness']) {
      const value = values.get(label);
      expect(value?.hasAttribute('data-missing')).toBe(true);
      expect(value?.textContent?.trim()).toBe('Unavailable');
    }

    expect(values.get('Methodology')?.textContent?.trim()).toBe('No active revision');
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
