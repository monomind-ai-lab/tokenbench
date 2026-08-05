import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { validateMockupHtml } from './mockup-contract';

const html = readFileSync('.stitch/designs/calculator-light.html', 'utf8');
const document = new JSDOM(html).window.document;

describe('light calculator mockup', () => {
  it('uses the shared TokenBench shell and complete decision topology', () => {
    expect(validateMockupHtml(html, {
      h1: 'Subscription vs API value calculator',
      requiredSections: ['selections', 'results', 'subscription-pricing', 'api-pricing', 'recommendation'],
    })).toEqual([]);
    expect(html).not.toContain('AI Cost Engine');
    expect([...document.querySelectorAll('nav a')].map((item) => item.textContent?.trim())).toEqual(['Tools', 'Compare', 'Leaderboards', 'Guides']);
  });

  it('keeps decisive non-color states and the dark result hierarchy', () => {
    expect(document.querySelectorAll('.mockup-choice[aria-checked="true"]')).toHaveLength(4);
    expect(document.querySelector('.value-summary-card')).not.toBeNull();
    expect(document.querySelector('.trend-chart[role="img"][aria-label]')).not.toBeNull();
    expect(document.querySelectorAll('table thead th[scope="col"]')).toHaveLength(8);
  });
});
