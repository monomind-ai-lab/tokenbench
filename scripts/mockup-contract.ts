import { JSDOM } from 'jsdom';

export interface MockupExpectation {
  readonly h1: string;
  readonly requiredSections?: readonly string[];
}

const contractMarkers = ['THESIS:', 'OWN-WORLD:', 'STORY:', 'FIRST VIEWPORT:', 'FORM:', 'FINISH:'];
const runtimeResourceSelectors = [
  ['link[href]', ['href']],
  ['script[src]', ['src']],
  ['img[src], img[srcset]', ['src', 'srcset']],
  ['source[src], source[srcset]', ['src', 'srcset']],
  ['video[src], video[poster]', ['src', 'poster']],
  ['audio[src]', ['src']],
  ['iframe[src]', ['src']],
  ['track[src]', ['src']],
  ['embed[src]', ['src']],
  ['object[data]', ['data']],
] as const;

function isExternalRuntimeUrl(value: string): boolean {
  return /^(?:https?:)?\/\//i.test(value.trim());
}

function hasExternalRuntimeUrl(value: string, attribute: string): boolean {
  if (attribute !== 'srcset') return isExternalRuntimeUrl(value);
  return value.split(',').some((candidate) => isExternalRuntimeUrl(candidate.trim().split(/\s+/, 1)[0]));
}

export function validateMockupHtml(html: string, expected: MockupExpectation): string[] {
  const document = new JSDOM(html).window.document;
  const errors: string[] = [];
  const first = [...document.body.childNodes].find((node) => node.nodeType !== 3 || node.textContent?.trim());
  if (first?.nodeType !== 8 || !contractMarkers.every((marker) => first.textContent?.includes(marker))) errors.push('missing direction contract');
  if (!document.querySelector('link[href="tokenbench-mockup.css"]')) errors.push('missing shared stylesheet');
  if (!document.querySelector('script[src="tokenbench-mockup.js"]')) errors.push('missing shared behavior');
  if (document.querySelector('h1')?.textContent?.trim() !== expected.h1) errors.push(`expected H1: ${expected.h1}`);
  if (!document.querySelector('.skip-link[href="#page-content"]')) errors.push('missing skip link');
  const primaryNav = document.querySelector('nav[aria-label="Primary navigation"]');
  if (!primaryNav) errors.push('missing primary navigation');
  else if (!primaryNav.matches('.primary-nav[data-primary-nav]')) errors.push('missing primary navigation behavior hook');
  if (!document.querySelector('[data-menu-toggle]')) errors.push('missing menu toggle behavior hook');
  if (!document.querySelector('[data-theme-toggle][aria-label]')) errors.push('missing semantic theme toggle');
  for (const section of expected.requiredSections ?? []) if (!document.querySelector(`[data-mockup-section="${section}"]`)) errors.push(`missing section: ${section}`);
  for (const [selector, attributes] of runtimeResourceSelectors) {
    for (const element of document.querySelectorAll(selector)) {
      for (const attribute of attributes) {
        const value = element.getAttribute(attribute);
        if (value && hasExternalRuntimeUrl(value, attribute)) errors.push(`external runtime asset: ${element.outerHTML}`);
      }
    }
  }
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
  const uncommentedCss = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const importRanges: Array<readonly [number, number]> = [];
  const importPattern = /@import\s+(?:url\(\s*)?(?:(["'])(.*?)\1|([^\s;()]+))\s*\)?\s*;/gi;
  for (const match of uncommentedCss.matchAll(importPattern)) {
    if (isExternalRuntimeUrl(match[2] ?? match[3] ?? '')) {
      errors.push(`external runtime asset: ${match[0].trim()}`);
      importRanges.push([match.index ?? 0, (match.index ?? 0) + match[0].length]);
    }
  }
  const urlPattern = /url\(\s*(?:(["'])(.*?)\1|([^\s)]+))\s*\)/gi;
  for (const match of uncommentedCss.matchAll(urlPattern)) {
    const index = match.index ?? 0;
    if (!importRanges.some(([start, end]) => index >= start && index < end) && isExternalRuntimeUrl(match[2] ?? match[3] ?? '')) errors.push(`external runtime asset: ${match[0]}`);
  }
  return errors;
}
