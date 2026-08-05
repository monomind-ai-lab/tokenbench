import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { validateMockupHtml } from './mockup-contract';

const directoryHtml = readFileSync('.stitch/designs/leaderboards-directory.html', 'utf8');
const valueHtml = readFileSync('.stitch/designs/leaderboard-value.html', 'utf8');

describe('leaderboard mockups', () => {
  it('exposes every registered evidence lens without embedding ranks', () => {
    const document = new JSDOM(directoryHtml).window.document;
    expect(validateMockupHtml(directoryHtml, { h1: 'AI model leaderboards', requiredSections: ['directory', 'related', 'monomind'] })).toEqual([]);
    expect(document.querySelectorAll('[data-leaderboard-route]')).toHaveLength(12);
    expect(document.querySelector('[data-rank]')).toBeNull();
  });

  it('keeps desktop rows and mobile cards fact-equivalent and estimates unranked', () => {
    const document = new JSDOM(valueHtml).window.document;
    expect(validateMockupHtml(valueHtml, { h1: 'AI model value frontier', requiredSections: ['route-summary', 'filters', 'rankings', 'related', 'monomind'] })).toEqual([]);
    expect(document.querySelectorAll('table thead th[scope="col"]')).toHaveLength(7);
    expect(document.querySelectorAll('tbody tr')).toHaveLength(document.querySelectorAll('[data-mobile-rank-card]').length);
    expect(document.querySelector('[data-estimated] [data-rank]')?.textContent?.trim()).toBe('Unranked');
    expect(valueHtml).toContain('never presents an opaque universal value score');
    expect(valueHtml).not.toMatch(/Best overall/i);
  });
});
