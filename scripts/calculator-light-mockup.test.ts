import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { validateMockupHtml } from './mockup-contract';

const htmlPath = resolve('.stitch/designs/calculator-light.html');
const html = readFileSync(htmlPath, 'utf8');
const calculatorCss = readFileSync('.stitch/designs/calculator-mockup.css', 'utf8');
const document = new JSDOM(html).window.document;

function choiceLabels(legend: string): string[] {
  const fieldset = [...document.querySelectorAll('fieldset')]
    .find((item) => item.querySelector('legend')?.textContent?.trim() === legend);
  return [...fieldset?.querySelectorAll('.choice-label') ?? []].map((item) => item.textContent?.trim() ?? '');
}

describe('light calculator mockup', () => {
  it('uses the shared TokenBench shell and complete decision topology', () => {
    expect(validateMockupHtml(html, {
      h1: 'Subscription vs API value calculator',
      requiredSections: ['selections', 'results', 'subscription-pricing', 'api-pricing', 'recommendation'],
    })).toEqual([]);
    expect(html).not.toContain('AI Cost Engine');
    expect([...document.querySelectorAll('nav a')].map((item) => item.textContent?.trim())).toEqual(['Tools', 'Compare', 'Leaderboards', 'Guides']);
  });

  it('keeps one accessible language control in the production shell', () => {
    const languageControls = document.querySelectorAll('header select[aria-label="Language"]');
    expect(languageControls).toHaveLength(1);
    expect(languageControls[0]?.closest('.language-control')).not.toBeNull();
  });

  it('keeps decisive non-color states and the dark result hierarchy', () => {
    expect(document.querySelectorAll('.mockup-choice[aria-checked="true"]')).toHaveLength(4);
    expect(document.querySelector('.value-summary-card')).not.toBeNull();
    expect(document.querySelector('.trend-chart[role="img"][aria-label]')).not.toBeNull();
    expect(document.querySelectorAll('table thead th[scope="col"]')).toHaveLength(8);
  });

  it('matches the production brand lockup and evidence footer', () => {
    const logo = document.querySelector<HTMLImageElement>('.brand-home img');
    const logoSrc = logo?.getAttribute('src') ?? '';
    const resolvedLogoPath = fileURLToPath(new URL(logoSrc, pathToFileURL(htmlPath)));
    expect(resolvedLogoPath).toBe(resolve('public/brand/monomind-tokenbench.png'));
    expect(existsSync(resolvedLogoPath)).toBe(true);
    expect(logo?.getAttribute('alt')).toBe('MonoMind monogram');
    expect(document.querySelector('.brand-name')?.textContent?.trim()).toBe('TokenBench');
    expect(document.querySelector('.brand-tagline')?.textContent?.trim()).toBe('The Decision Engine for AI Costs & Model Benchmarks');
    expect([...document.querySelectorAll('.mockup-footer a')].map((item) => ({
      label: item.textContent?.trim(),
      href: item.getAttribute('href'),
    }))).toEqual([
      { label: 'Powered by MonoMind AI Lab', href: 'https://monomind.one/' },
      { label: 'Sources', href: '/sources/' },
      { label: 'Methodology', href: '/methodology/' },
    ]);
  });

  it('retains the exact incumbent provider, plan, and model labels', () => {
    expect(choiceLabels('Provider selection')).toEqual(['Alibaba Cloud (Qwen)', 'OpenAI (GPT-4o)', 'Anthropic (Claude)', 'Google Cloud (Gemini)']);
    expect(choiceLabels('Plan selection')).toEqual(['Starter ($100/mo)', 'Enterprise ($2,000/mo)', 'Unlimited ($8,500/mo)']);
    expect(choiceLabels('Model selection')).toEqual(['Qwen-Max', 'Qwen-Plus', 'Qwen-Turbo', 'Qwen-Long', 'GPT-4o', 'Claude 3.5 Sonnet', 'Llama 3.1 70B']);
  });

  it('resolves every same-page navigation target', () => {
    expect([...document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')].map((link) => ({
      href: link.getAttribute('href'),
      resolves: Boolean(document.getElementById(link.hash.slice(1))),
    }))).toEqual([
      { href: '#page-content', resolves: true },
      { href: '#selections', resolves: true },
    ]);
  });

  it('offers distinct selection-review and methodology recommendation actions', () => {
    const actions = [...document.querySelectorAll<HTMLAnchorElement>('.recommendation-actions[role="group"] a')];
    expect(actions).toHaveLength(2);
    expect(actions.map((action) => ({
      label: action.textContent?.trim(),
      href: action.getAttribute('href'),
      priority: action.getAttribute('data-action-priority'),
    }))).toEqual([
      { label: 'Review selections', href: '#selections', priority: 'primary' },
      { label: 'Review methodology', href: '/methodology/', priority: 'secondary' },
    ]);
  });

  it('synchronizes row treatment when native selections change', () => {
    const interactiveHtml = html.replace('</head>', `<style>${calculatorCss}</style></head>`);
    const dom = new JSDOM(interactiveHtml, { runScripts: 'dangerously', url: 'https://tokenbench.test/' });
    const interactiveDocument = dom.window.document;
    const openAi = interactiveDocument.querySelector<HTMLInputElement>('input[name="provider"][value="openai"]');
    const alibaba = interactiveDocument.querySelector<HTMLInputElement>('input[name="provider"][value="alibaba"]');
    const turbo = interactiveDocument.querySelector<HTMLInputElement>('input[name="model"][value="qwen-turbo"]');
    const max = interactiveDocument.querySelector<HTMLInputElement>('input[name="model"][value="qwen-max"]');

    openAi?.click();
    turbo?.click();
    max?.click();

    const openAiRow = openAi?.closest('.mockup-choice');
    const alibabaRow = alibaba?.closest('.mockup-choice');
    const turboRow = turbo?.closest('.mockup-choice');
    const maxRow = max?.closest('.mockup-choice');
    expect([openAiRow, alibabaRow, turboRow, maxRow].map((row) => row?.getAttribute('aria-checked'))).toEqual(['true', 'false', 'true', 'false']);
    expect([...interactiveDocument.querySelectorAll('.mockup-choice')].every((row) => {
      const input = row.querySelector<HTMLInputElement>('input[type="radio"], input[type="checkbox"]');
      return row.getAttribute('aria-checked') === String(input?.checked);
    })).toBe(true);
    expect(openAiRow?.querySelector('.choice-check')).not.toBeNull();
    expect(turboRow?.querySelector('.choice-check')).not.toBeNull();
    expect(dom.window.getComputedStyle(openAiRow?.querySelector('.choice-check') as Element).visibility).toBe('visible');
    expect(dom.window.getComputedStyle(alibabaRow?.querySelector('.choice-check') as Element).visibility).toBe('hidden');
    expect(dom.window.getComputedStyle(openAiRow?.querySelector('.choice-label') as Element).fontWeight).toBe('750');
  });
});
