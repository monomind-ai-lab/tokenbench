import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { LEADERBOARD_ROUTES } from '../src/routing/routes';
import { validateMockupHtml } from './mockup-contract';

const directoryHtml = readFileSync('.stitch/designs/leaderboards-directory.html', 'utf8');
const valueHtml = readFileSync('.stitch/designs/leaderboard-value.html', 'utf8');
const expectedRoutePaths = [
  '/leaderboards/llm/overall/',
  '/leaderboards/llm/coding/',
  '/leaderboards/llm/agentic/',
  '/leaderboards/llm/human-preference/',
  '/leaderboards/llm/value/',
  '/leaderboards/llm/pricing-context/',
  '/leaderboards/multimodal/vision-documents/',
  '/leaderboards/media/text-to-image/',
  '/leaderboards/media/image-editing/',
  '/leaderboards/media/text-to-video/',
  '/leaderboards/media/image-to-video/',
  '/leaderboards/media/video-editing/',
] as const;

function normalizeText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function normalizedModelLabel(element: Element | null): string {
  if (!element) return '';
  const clone = element.cloneNode(true) as Element;
  clone.querySelector('.leaderboard-estimate-label')?.remove();
  return normalizeText(clone.textContent);
}

function desktopRowFacts(row: HTMLTableRowElement): string[] {
  return [...row.cells].map((cell, index) => index === 1
    ? normalizedModelLabel(cell)
    : normalizeText(cell.textContent));
}

function mobileCardFacts(card: Element): string[] {
  return [
    normalizeText(card.querySelector('[data-rank]')?.textContent),
    normalizedModelLabel(card.querySelector('h3')),
    ...[...card.querySelectorAll('dd')].map((value) => normalizeText(value.textContent)),
  ];
}

describe('leaderboard mockups', () => {
  it('maps every registered evidence lens to its exact canonical path, href, and summary without ranks', () => {
    const document = new JSDOM(directoryHtml).window.document;
    const registeredRoutes = Object.values(LEADERBOARD_ROUTES);
    const renderedRoutes = [...document.querySelectorAll('[data-leaderboard-route]')].map((card) => ({
      pathname: card.getAttribute('data-leaderboard-route'),
      href: card.querySelector('a')?.getAttribute('href'),
      summary: normalizeText(card.querySelector('p')?.textContent),
    }));

    expect(validateMockupHtml(directoryHtml, { h1: 'AI model leaderboards', requiredSections: ['directory', 'related', 'monomind'] })).toEqual([]);
    expect(registeredRoutes.map((route) => route.pathname)).toEqual(expectedRoutePaths);
    expect(renderedRoutes).toHaveLength(12);
    expect(renderedRoutes).toEqual(registeredRoutes.map((route) => ({
      pathname: route.pathname,
      href: route.pathname,
      summary: route.seo.summary,
    })));
    expect(document.querySelector('[data-rank]')).toBeNull();
  });

  it('keeps all seven desktop row facts equivalent to every mobile card', () => {
    const document = new JSDOM(valueHtml).window.document;
    const desktopRows = [...document.querySelectorAll<HTMLTableRowElement>('tbody tr')];
    const mobileCards = [...document.querySelectorAll('[data-mobile-rank-card]')];
    const desktopFacts = desktopRows.map(desktopRowFacts);
    const mobileFacts = mobileCards.map(mobileCardFacts);

    expect(validateMockupHtml(valueHtml, { h1: 'AI model value frontier', requiredSections: ['route-summary', 'filters', 'rankings', 'related', 'monomind'] })).toEqual([]);
    expect([...document.querySelectorAll('table thead th[scope="col"]')].map((header) => normalizeText(header.textContent))).toEqual([
      'Rank',
      'Model label',
      'Workload lens',
      'Capability evidence',
      'Workload price',
      'Freshness',
      'Evidence state',
    ]);
    expect(desktopRows).toHaveLength(mobileCards.length);
    expect(desktopFacts.every((facts) => facts.length === 7)).toBe(true);
    expect(mobileFacts.every((facts) => facts.length === 7)).toBe(true);
    expect(mobileFacts).toEqual(desktopFacts);

    const bodyText = normalizeText(document.body.textContent);
    expect(bodyText).toContain('never presents an opaque universal value score');
    expect(bodyText).not.toMatch(/Best overall/i);
  });

  it('keeps both estimated representations literally unranked', () => {
    const document = new JSDOM(valueHtml).window.document;
    const desktopEstimated = document.querySelectorAll('tbody tr[data-estimated]');
    const mobileEstimated = document.querySelectorAll('[data-mobile-rank-card][data-estimated]');

    expect(desktopEstimated).toHaveLength(1);
    expect(mobileEstimated).toHaveLength(1);
    expect([
      normalizeText(desktopEstimated[0].querySelector('[data-rank]')?.textContent),
      normalizeText(mobileEstimated[0].querySelector('[data-rank]')?.textContent),
    ]).toEqual(['Unranked', 'Unranked']);
  });

  it('shares a visible illustrative-data disclosure with the table and mobile cards', () => {
    const document = new JSDOM(valueHtml).window.document;
    const disclosure = document.querySelector<HTMLElement>('[data-evidence-disclosure]');
    const disclosureId = disclosure?.id ?? '';
    const disclosureText = normalizeText(disclosure?.textContent);

    expect(disclosure).not.toBeNull();
    expect(disclosureId).not.toBe('');
    expect(disclosure?.hasAttribute('hidden')).toBe(false);
    expect(disclosureText).toMatch(/illustrative/i);
    expect(disclosureText).toMatch(/no active revision is represented/i);
    expect(document.querySelector('.leaderboard-table')?.getAttribute('aria-describedby')).toBe(disclosureId);
    expect(document.querySelector('.leaderboard-mobile-cards')?.getAttribute('aria-describedby')).toBe(disclosureId);
  });
});
