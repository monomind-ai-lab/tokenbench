import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { validateMockupHtml } from './mockup-contract';

const hubHtml = readFileSync('.stitch/designs/compare-hub.html', 'utf8');
const detailHtml = readFileSync('.stitch/designs/compare-detail.html', 'utf8');

describe('compare mockups', () => {
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
