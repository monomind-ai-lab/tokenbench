import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

const prototypeRoot = resolve('prototypes/ui-revamp-3');
const pagePath = resolve(prototypeRoot, 'cost-calculator.html');
const scriptPath = resolve(prototypeRoot, 'cost-calculator.js');

type PreviewPage = {
  dom: JSDOM;
  document: Document;
  window: Window & typeof globalThis;
  blobs: Blob[];
  print: ReturnType<typeof vi.fn>;
  copy: ReturnType<typeof vi.fn>;
};

function previewPage(url = 'https://tokenbench.test/cost/calculator'): PreviewPage {
  expect(existsSync(pagePath)).toBe(true);
  expect(existsSync(scriptPath)).toBe(true);

  const dom = new JSDOM(readFileSync(pagePath, 'utf8'), { runScripts: 'dangerously', url });
  const { window } = dom;
  const blobs: Blob[] = [];
  const print = vi.fn();
  const copy = vi.fn().mockResolvedValue(undefined);

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  });
  Object.defineProperty(window, 'print', { configurable: true, value: print });
  Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
  Object.defineProperty(window.URL, 'createObjectURL', {
    configurable: true,
    value: (blob: Blob) => {
      blobs.push(blob);
      return `blob:tokenbench-${blobs.length}`;
    },
  });
  Object.defineProperty(window.URL, 'revokeObjectURL', { configurable: true, value: () => {} });
  Object.defineProperty(window.HTMLAnchorElement.prototype, 'click', { configurable: true, value: () => {} });

  window.eval(readFileSync(resolve(prototypeRoot, 'data.js'), 'utf8'));
  window.eval(readFileSync(resolve(prototypeRoot, 'common.js'), 'utf8'));
  window.eval(readFileSync(scriptPath, 'utf8'));

  return { dom, document: window.document, window, blobs, print, copy };
}

function setField(page: PreviewPage, name: string, value: string | boolean) {
  const field = page.document.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
  expect(field).not.toBeNull();
  if (field instanceof page.window.HTMLInputElement && field.type === 'checkbox') {
    field.checked = Boolean(value);
  } else {
    field.value = String(value);
  }
  field.dispatchEvent(new page.window.Event('input', { bubbles: true }));
  field.dispatchEvent(new page.window.Event('change', { bubbles: true }));
}

function resultValue(page: PreviewPage, selector: string) {
  const result = page.document.querySelector<HTMLElement>(selector);
  expect(result).not.toBeNull();
  return Number(result?.dataset.value);
}

function readBlob(window: Window, blob: Blob) {
  return new Promise<string>((resolveText, reject) => {
    const reader = new window.FileReader();
    reader.addEventListener('load', () => resolveText(String(reader.result)));
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsText(blob);
  });
}

describe('monthly cost calculator preview', () => {
  it('renders the labeled default workload and source-versus-derived evidence tables', () => {
    const page = previewPage();

    expect(page.document.querySelector('main#monthly-cost-calculator')).not.toBeNull();
    for (const name of [
      'tier',
      'model',
      'conversationsPerDay',
      'messagesPerConversation',
      'activeDays',
      'inputTokensPerMessage',
      'outputTokensPerMessage',
      'cacheReadShare',
      'cacheWriteShare',
      'longContext',
    ]) {
      const field = page.document.querySelector<HTMLElement>(`[name="${name}"]`);
      expect(field?.id).toBeTruthy();
      expect(page.document.querySelector(`label[for="${field?.id}"]`)).not.toBeNull();
    }
    expect(page.document.querySelector('table[data-evidence="source-price"] caption')?.textContent).toMatch(/source price/i);
    expect(page.document.querySelector('table[data-evidence="derived-monthly"] caption')?.textContent).toMatch(/derived monthly/i);
  });

  it('calculates an auditable monthly API estimate from source rates', () => {
    const page = previewPage();
    setField(page, 'model', 'gpt-4o');
    setField(page, 'conversationsPerDay', '2');
    setField(page, 'messagesPerConversation', '3');
    setField(page, 'activeDays', '10');
    setField(page, 'inputTokensPerMessage', '1000');
    setField(page, 'outputTokensPerMessage', '500');
    setField(page, 'cacheReadShare', '20');
    setField(page, 'cacheWriteShare', '10');

    expect(resultValue(page, '#api-monthly-total')).toBeCloseTo(0.435, 8);
    expect(resultValue(page, '[data-line-item="input-standard"]')).toBeCloseTo(0.105, 8);
    expect(resultValue(page, '[data-line-item="cache-read"]')).toBeCloseTo(0.015, 8);
    expect(resultValue(page, '[data-line-item="cache-write"]')).toBeCloseTo(0.015, 8);
    expect(resultValue(page, '[data-line-item="output"]')).toBeCloseTo(0.3, 8);

    setField(page, 'longContext', true);
    expect(resultValue(page, '#api-monthly-total')).toBeCloseTo(0.5025, 8);
  });

  it('round-trips valid shared URL state through the calculator controls', () => {
    const first = previewPage();
    setField(first, 'tier', 'team');
    setField(first, 'model', 'claude-3-5-sonnet');
    setField(first, 'conversationsPerDay', '7');
    setField(first, 'messagesPerConversation', '9');
    setField(first, 'activeDays', '18');
    setField(first, 'inputTokensPerMessage', '2400');
    setField(first, 'outputTokensPerMessage', '900');
    setField(first, 'cacheReadShare', '30');
    setField(first, 'cacheWriteShare', '10');
    setField(first, 'longContext', true);

    expect(first.window.location.search).toContain('model=claude-3-5-sonnet');
    expect(first.window.location.search).toContain('longContext=1');

    const second = previewPage(first.window.location.href);
    expect(second.document.querySelector<HTMLSelectElement>('[name="tier"]')?.value).toBe('team');
    expect(second.document.querySelector<HTMLSelectElement>('[name="model"]')?.value).toBe('claude-3-5-sonnet');
    expect(second.document.querySelector<HTMLInputElement>('[name="conversationsPerDay"]')?.value).toBe('7');
    expect(second.document.querySelector<HTMLInputElement>('[name="cacheReadShare"]')?.value).toBe('30');
    expect(second.document.querySelector<HTMLInputElement>('[name="longContext"]')?.checked).toBe(true);
  });

  it('exports the current estimate as an accessible CSV download', async () => {
    const page = previewPage();
    page.document.querySelector<HTMLButtonElement>('#download-csv')?.click();

    expect(page.blobs).toHaveLength(1);
    await expect(readBlob(page.window, page.blobs[0]!)).resolves.toContain('line_item,monthly_tokens,source_rate_per_million,monthly_cost_usd');
    expect(page.document.querySelector('#calculator-action-status')?.textContent).toMatch(/csv download prepared/i);
  });

  it('prints and copies the shareable URL with status feedback', async () => {
    const page = previewPage();
    page.document.querySelector<HTMLButtonElement>('#print-calculator')?.click();
    expect(page.print).toHaveBeenCalledOnce();
    expect(page.document.querySelector('#calculator-action-status')?.textContent).toMatch(/print dialog/i);

    page.document.querySelector<HTMLButtonElement>('#copy-calculator-link')?.click();
    expect(page.document.querySelector('#calculator-action-status')?.textContent).toMatch(/copying share link/i);
    expect(page.copy).toHaveBeenCalledWith(expect.stringContaining('model='));
    await vi.waitFor(() => expect(page.document.querySelector('#calculator-action-status')?.textContent).toMatch(/share link copied/i));
  });
});
