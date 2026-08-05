import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { LEADERBOARD_ROUTES } from '../src/routing/routes';
import { validateMockupHtml } from './mockup-contract';

const directoryHtml = readFileSync('.stitch/designs/leaderboards-directory.html', 'utf8');
const compareHtml = readFileSync('.stitch/designs/compare-detail.html', 'utf8');
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

function headerControlFacts(document: Document) {
  const menuButton = document.querySelector<HTMLButtonElement>('button.header-tool.menu-button[data-menu-toggle]');
  const languageSelect = document.querySelector<HTMLSelectElement>('label.language-control select[aria-label="Language"]');
  const themeButton = document.querySelector<HTMLButtonElement>('button.header-tool.icon-button[data-theme-toggle]');

  return {
    menu: {
      ariaControls: menuButton?.getAttribute('aria-controls'),
      ariaExpanded: menuButton?.getAttribute('aria-expanded'),
      ariaLabel: menuButton?.getAttribute('aria-label'),
      hasIcon: !!menuButton?.querySelector('svg[aria-hidden="true"]'),
    },
    language: languageSelect
      ? {
        hasIcon: !!languageSelect.closest('.language-control')?.querySelector('svg[aria-hidden="true"]'),
        hasScreenReaderLabel: normalizeText(languageSelect.closest('.language-control')?.querySelector('.sr-only')?.textContent),
        options: [...languageSelect.options].map((option) => ({ value: option.value, text: normalizeText(option.textContent) })),
      }
      : null,
    theme: {
      ariaLabel: themeButton?.getAttribute('aria-label'),
      hasIcon: !!themeButton?.querySelector('svg[aria-hidden="true"]'),
      screenReaderLabel: normalizeText(themeButton?.querySelector('.sr-only')?.textContent),
    },
  };
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

  it('keeps the approved seven-field evidence schema equivalent on desktop and mobile', () => {
    const document = new JSDOM(valueHtml).window.document;
    const desktopRows = [...document.querySelectorAll<HTMLTableRowElement>('tbody tr')];
    const mobileCards = [...document.querySelectorAll('[data-mobile-rank-card]')];
    const desktopFacts = desktopRows.map(desktopRowFacts);
    const mobileFacts = mobileCards.map(mobileCardFacts);

    expect(validateMockupHtml(valueHtml, { h1: 'AI model value frontier', requiredSections: ['route-summary', 'filters', 'rankings', 'related', 'monomind'] })).toEqual([]);
    expect([...document.querySelectorAll('table thead th[scope="col"]')].map((header) => normalizeText(header.textContent))).toEqual([
      'Rank / status',
      'Model / provider',
      'Capability evidence',
      'Workload price',
      'Declared context',
      'Evidence state',
      'Source / publication / freshness',
    ]);
    expect(desktopRows).toHaveLength(mobileCards.length);
    expect(desktopFacts.every((facts) => facts.length === 7)).toBe(true);
    expect(mobileFacts.every((facts) => facts.length === 7)).toBe(true);
    expect(mobileFacts).toEqual(desktopFacts);
    expect(desktopFacts).toEqual([
      [
        'Unavailable',
        'OpenAI GPT-4o Provider: OpenAI',
        'Unavailable',
        'Unavailable',
        'Unavailable',
        'Unavailable',
        'Source: Unavailable Publication: Unavailable Freshness: Unavailable',
      ],
      [
        'Unavailable',
        'Anthropic Claude 3.5 Sonnet Provider: Anthropic',
        'Unavailable',
        'Unavailable',
        'Unavailable',
        'Unavailable',
        'Source: Unavailable Publication: Unavailable Freshness: Unavailable',
      ],
      [
        'Unavailable',
        'Google Gemini 1.5 Pro Provider: Google',
        'Unavailable',
        'Unavailable',
        'Unavailable',
        'Unavailable',
        'Source: Unavailable Publication: Unavailable Freshness: Unavailable',
      ],
      [
        'Unranked',
        'BenchLM estimated preview Provider: Unavailable',
        'Unavailable',
        'Unavailable',
        'Unavailable',
        'Estimated preview',
        'Source: BenchLM Publication: Unavailable Freshness: Unavailable',
      ],
    ]);

    const bodyText = normalizeText(document.body.textContent);
    expect(bodyText).not.toMatch(/Best overall/i);
  });

  it('uses a visible methodology statement to reject an opaque universal value score', () => {
    const document = new JSDOM(valueHtml).window.document;
    const methodology = document.querySelector<HTMLElement>('aside.leaderboard-value-methodology[data-value-methodology]');

    expect(methodology).not.toBeNull();
    expect(methodology?.hasAttribute('hidden')).toBe(false);
    expect(methodology?.getAttribute('aria-hidden')).not.toBe('true');
    expect(normalizeText(methodology?.textContent)).toMatch(/does not calculate an opaque universal value score/i);
  });

  it('uses the same semantic header controls as compare, including its language selector', () => {
    const valueDocument = new JSDOM(valueHtml).window.document;
    const compareDocument = new JSDOM(compareHtml).window.document;

    expect(headerControlFacts(valueDocument)).toEqual(headerControlFacts(compareDocument));
    expect(valueDocument.querySelector('label.language-control select[aria-label="Language"]')).not.toBeNull();
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
    expect(disclosureText).toMatch(/no active revision exists/i);
    expect(disclosureText).toMatch(/ordinary entries[^.]*Unavailable[^.]*rank, capability, workload price, declared context, source, publication, and freshness/i);
    expect(disclosureText).toMatch(/estimated preview[^.]*Unranked[^.]*Estimated preview/i);
    expect(disclosureText).toMatch(/BenchLM[^.]*source/i);
    expect(disclosureText).toMatch(/publication and freshness[^.]*Unavailable/i);
    expect(disclosureText).toMatch(/neither a published result nor a winner claim/i);
    expect(document.querySelector('.leaderboard-table')?.getAttribute('aria-describedby')).toBe(disclosureId);
    expect(document.querySelector('.leaderboard-mobile-cards')?.getAttribute('aria-describedby')).toBe(disclosureId);
  });
});
