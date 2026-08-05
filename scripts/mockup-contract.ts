import { JSDOM } from 'jsdom';

export interface MockupExpectation {
  readonly h1: string;
  readonly requiredSections?: readonly string[];
}

const contractMarkers = ['THESIS:', 'OWN-WORLD:', 'STORY:', 'FIRST VIEWPORT:', 'FORM:', 'FINISH:'];

export function validateMockupHtml(html: string, expected: MockupExpectation): string[] {
  const document = new JSDOM(html).window.document;
  const errors: string[] = [];
  const first = document.body.firstChild;
  if (first?.nodeType !== 8 || !contractMarkers.every((marker) => first.textContent?.includes(marker))) errors.push('missing direction contract');
  if (!document.querySelector('link[href="tokenbench-mockup.css"]')) errors.push('missing shared stylesheet');
  if (!document.querySelector('script[src="tokenbench-mockup.js"]')) errors.push('missing shared behavior');
  if (document.querySelector('h1')?.textContent?.trim() !== expected.h1) errors.push(`expected H1: ${expected.h1}`);
  if (!document.querySelector('.skip-link[href="#page-content"]')) errors.push('missing skip link');
  if (!document.querySelector('nav[aria-label="Primary navigation"]')) errors.push('missing primary navigation');
  if (!document.querySelector('[data-theme-toggle][aria-label]')) errors.push('missing semantic theme toggle');
  for (const section of expected.requiredSections ?? []) if (!document.querySelector(`[data-mockup-section="${section}"]`)) errors.push(`missing section: ${section}`);
  for (const element of document.querySelectorAll('link[href^="http"], script[src^="http"], img[src^="http"]')) errors.push(`external runtime asset: ${element.outerHTML}`);
  return errors;
}

const cssRequirements = [
  ['#0f0f0f', 'missing dark canvas #0f0f0f'],
  ['#181818', 'missing dark surface #181818'],
  ['#0007cd', 'missing primary #0007cd'],
  ['#f7f8fc', 'missing light canvas #f7f8fc'],
  ['#ffffff', 'missing light surface #ffffff'],
  ['#e0e5ff', 'missing selected surface #e0e5ff'],
] as const;

export function validateMockupCss(css: string): string[] {
  const errors: string[] = cssRequirements.filter(([value]) => !css.toLowerCase().includes(value)).map(([, error]) => error);
  if (!/min-height:\s*44px/i.test(css)) errors.push('missing 44px target rule');
  if (!/:focus-visible/i.test(css)) errors.push('missing focus-visible rule');
  if (!/@media\s*\([^)]*max-width:\s*767px/i.test(css)) errors.push('missing mobile shell rule');
  return errors;
}
