import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

const prototypeRoot = resolve('prototypes/ui-revamp-3');
const pagePath = resolve(prototypeRoot, 'cost-calculator.html');
const scriptPath = resolve(prototypeRoot, 'cost-calculator.js');
const stylePath = resolve(prototypeRoot, 'styles.css');

type PreviewPage = {
  dom: JSDOM;
  document: Document;
  window: Window & typeof globalThis;
  blobs: Blob[];
  chartConfigs: ChartConfig[];
  print: ReturnType<typeof vi.fn>;
  copy: ReturnType<typeof vi.fn>;
};

type ChartConfig = {
  data: {
    datasets: { label: string; data: { x: number; y: number }[] }[];
  };
};

function previewPage(url = 'https://tokenbench.test/subscribe-vs-api', { withChart = true }: { withChart?: boolean } = {}): PreviewPage {
  expect(existsSync(pagePath)).toBe(true);
  expect(existsSync(scriptPath)).toBe(true);

  const dom = new JSDOM(readFileSync(pagePath, 'utf8'), { runScripts: 'dangerously', url });
  const { window } = dom;
  const blobs: Blob[] = [];
  const chartConfigs: ChartConfig[] = [];
  const charts = new Map<HTMLCanvasElement, { destroy: () => void }>();
  const print = vi.fn();
  const copy = vi.fn().mockResolvedValue(undefined);

  class Chart {
    constructor(readonly canvas: HTMLCanvasElement, readonly config: ChartConfig) {
      chartConfigs.push(config);
      charts.set(canvas, this);
    }

    destroy() {
      charts.delete(this.canvas);
    }

    static getChart(canvas: HTMLCanvasElement) {
      return charts.get(canvas) ?? null;
    }
  }

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  });
  if (withChart) Object.defineProperty(window, 'Chart', { configurable: true, value: Chart });
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

  return { dom, document: window.document, window, blobs, chartConfigs, print, copy };
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

function setModels(page: PreviewPage, modelIds: string[]) {
  const models = page.document.querySelector<HTMLSelectElement>('[name="models"]');
  expect(models).not.toBeNull();
  for (const option of [...models!.options]) option.selected = modelIds.includes(option.value);
  models!.dispatchEvent(new page.window.Event('input', { bubbles: true }));
  models!.dispatchEvent(new page.window.Event('change', { bubbles: true }));
}

function resultValue(page: PreviewPage, selector: string) {
  const result = page.document.querySelector<HTMLElement>(selector);
  expect(result).not.toBeNull();
  return Number(result?.dataset.value);
}

function readBlob(window: Window, blob: Blob) {
  return new Promise<string>((resolveText, reject) => {
    const reader = new (window as unknown as typeof globalThis).FileReader();
    reader.addEventListener('load', () => resolveText(String(reader.result)));
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsText(blob);
  });
}

describe('monthly cost calculator preview', () => {
  it('combines the monthly scenario with a seat and token-domain breakeven analysis', () => {
    const page = previewPage();

    const seats = page.document.querySelector<HTMLInputElement>('#breakeven-seats');
    const subscription = page.document.querySelector<HTMLInputElement>('#breakeven-seat-price');
    const tokenVolume = page.document.querySelector<HTMLInputElement>('#breakeven-token-volume');
    expect([seats?.min, seats?.max]).toEqual(['1', '50']);
    expect(subscription?.value).toBe('20');
    expect([tokenVolume?.min, tokenVolume?.max]).toEqual(['0', '300']);
    expect(page.document.querySelector('#breakeven-table')).not.toBeNull();
    expect(page.document.querySelector('#breakeven-workload-estimate')?.textContent).toMatch(/tokens from the current message workload/i);

    setModels(page, ['gpt-4o']);
    setField(page, 'conversationsPerDay', '2');
    setField(page, 'messagesPerConversation', '3');
    setField(page, 'activeDays', '10');
    setField(page, 'inputTokensPerMessage', '1000');
    setField(page, 'outputTokensPerMessage', '500');
    setField(page, 'cacheReadShare', '20');
    setField(page, 'cacheWriteShare', '10');
    setField(page, 'seats', '1');
    setField(page, 'tokenVolume', '5');

    expect(page.document.querySelector('#breakeven-crossover')?.textContent).toContain('4.14M tokens');
    expect(page.document.querySelector('#breakeven-lower-cost')?.textContent).toMatch(/API is lower cost below 4\.14M tokens/i);
    expect(page.document.querySelector('#breakeven-effective-rate')?.textContent).toContain('$4.83 / 1M');
    expect(page.document.querySelector('#breakeven-table')?.textContent).toMatch(/Selected volume.*5M.*\$20\.00.*\$24\.17.*Monthly subscription/is);
    expect(page.document.querySelector('#breakeven-table')?.textContent).toMatch(/Crossover.*4\.14M.*\$20\.00.*\$20\.00.*Equal/is);
    expect(new URL(page.window.location.href).searchParams.get('seats')).toBe('1');
    expect(new URL(page.window.location.href).searchParams.get('tokenVolume')).toBe('5');
  });

  it('keeps the Chart.js crossover curve and exact table on the same workload basis', () => {
    const page = previewPage();
    setModels(page, ['gpt-4o']);
    setField(page, 'conversationsPerDay', '2');
    setField(page, 'messagesPerConversation', '3');
    setField(page, 'activeDays', '10');
    setField(page, 'inputTokensPerMessage', '1000');
    setField(page, 'outputTokensPerMessage', '500');
    setField(page, 'cacheReadShare', '20');
    setField(page, 'cacheWriteShare', '10');
    setField(page, 'seats', '1');

    const chart = page.chartConfigs.at(-1);
    const monthlySubscription = chart?.data.datasets.find(dataset => dataset.label === 'Monthly subscription');
    const api = chart?.data.datasets.find(dataset => dataset.label === 'API usage');
    expect(monthlySubscription?.data.slice(0, 2)).toEqual([{ x: 0, y: 20 }, { x: 25, y: 20 }]);
    expect(api?.data.slice(0, 2)).toEqual([{ x: 0, y: 0 }, expect.objectContaining({ x: 25 })]);
    expect(api?.data[1]?.y).toBeCloseTo(120.83333333333334, 10);
    expect(page.document.querySelector('#breakeven-table')?.textContent).toMatch(/25M.*\$20\.00.*\$120\.83.*Monthly subscription/is);
  });

  it('derives the crossover per-seat price from the selected provider plan', () => {
    const page = previewPage();
    setField(page, 'provider', 'anthropic');
    setField(page, 'plan', 'anthropic-max');

    const subscription = page.document.querySelector<HTMLInputElement>('#breakeven-seat-price');
    expect(subscription?.readOnly).toBe(true);
    expect(subscription?.value).toBe('100');
    expect(page.document.querySelector('#breakeven-seat-price-note')?.textContent).toMatch(/Claude Max.*\$100\.00.*per seat/i);
    expect(page.document.querySelector('#breakeven-saas-cost')?.textContent).toBe('$100.00');
    expect(new URL(page.window.location.href).searchParams.has('subscriptionPrice')).toBe(false);
  });

  it('keeps character estimates non-destructive until applied to message token controls', () => {
    const page = previewPage();
    setField(page, 'inputTokensPerMessage', '999');
    setField(page, 'outputTokensPerMessage', '888');
    setField(page, 'contentType', 'code');
    setField(page, 'inputCharactersPerMessage', '1200');
    setField(page, 'outputCharactersPerMessage', '600');

    expect(page.document.querySelector<HTMLInputElement>('[name="inputTokensPerMessage"]')?.value).toBe('999');
    expect(page.document.querySelector('#character-token-estimate')?.textContent).toMatch(/3 characters per token.*400 input.*200 output/i);
    page.document.querySelector<HTMLButtonElement>('#use-character-estimate')?.click();
    expect(page.document.querySelector<HTMLInputElement>('[name="inputTokensPerMessage"]')?.value).toBe('400');
    expect(page.document.querySelector<HTMLInputElement>('[name="outputTokensPerMessage"]')?.value).toBe('200');
    expect(page.document.querySelector('#calculator-action-status')?.textContent).toMatch(/character estimate applied/i);
  });

  it('keeps selected-volume and crossover samples in the semantic table without Chart.js', () => {
    const page = previewPage('https://tokenbench.test/subscribe-vs-api', { withChart: false });
    setModels(page, ['gpt-4o']);
    setField(page, 'conversationsPerDay', '2');
    setField(page, 'messagesPerConversation', '3');
    setField(page, 'activeDays', '10');
    setField(page, 'inputTokensPerMessage', '1000');
    setField(page, 'outputTokensPerMessage', '500');
    setField(page, 'cacheReadShare', '20');
    setField(page, 'cacheWriteShare', '10');
    setField(page, 'tokenVolume', '5');

    const rows = [...page.document.querySelectorAll('#breakeven-table tbody tr')].map(row => row.textContent?.replace(/\s+/g, ' ').trim() ?? '');
    expect(rows).toEqual(expect.arrayContaining([
      expect.stringMatching(/Crossover.*4\.14M.*\$20\.00.*\$20\.00.*Equal/i),
      expect.stringMatching(/Selected volume.*5M.*\$20\.00.*\$24\.17.*Monthly subscription/i),
    ]));
    expect(rows.indexOf(rows.find(row => /Crossover/i.test(row))!)).toBeLessThan(rows.indexOf(rows.find(row => /Selected volume/i.test(row))!));
    expect(page.document.querySelector('#breakeven-chart')?.hasAttribute('hidden')).toBe(true);
    expect(page.document.querySelector('#breakeven-lower-cost')?.textContent).toMatch(/API is lower cost below/i);
    expect(page.document.querySelector('#breakeven-table')?.textContent).toMatch(/display.*round/i);
  });

  it('guides the scenario through provider, provider-dependent plan, model mix, and message-level workload', () => {
    const page = previewPage();

    expect(page.document.querySelector('main#monthly-cost-calculator')).not.toBeNull();
    for (const name of [
      'provider',
      'plan',
      'models',
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
    expect(page.document.querySelector('#cost-calculator-form')?.textContent).toMatch(/1\.\s*Choose a provider and plan/i);
    expect(page.document.querySelector('#cost-calculator-form')?.textContent).toMatch(/2\.\s*Choose models you actually use/i);
    expect(page.document.querySelector('#cost-calculator-form')?.textContent).toMatch(/3\.\s*Set a message-level workload/i);

    setField(page, 'provider', 'anthropic');
    const plans = page.document.querySelector<HTMLSelectElement>('[name="plan"]');
    expect([...plans!.options].map((option) => option.value)).toEqual(['anthropic-pro', 'anthropic-max']);
    expect(page.window.location.search).toContain('provider=anthropic');
    expect(page.window.location.search).toContain('plan=anthropic-pro');

    setModels(page, ['claude-3-5-sonnet', 'deepseek-v3']);
    expect(page.document.querySelectorAll('[data-model-share]').length).toBe(2);
    expect(page.document.querySelector<HTMLInputElement>('[data-model-share="claude-3-5-sonnet"]')?.value).toBe('50');
    expect(page.document.querySelector<HTMLInputElement>('[data-model-share="deepseek-v3"]')?.value).toBe('50');
    expect(page.window.location.search).toContain('models=claude-3-5-sonnet%2Cdeepseek-v3');
    expect(page.window.location.search).toContain('mix=claude-3-5-sonnet%3A50%2Cdeepseek-v3%3A50');

    setModels(page, ['claude-3-5-sonnet', 'deepseek-v3', 'deepseek-r1', 'gpt-4o', 'gemini-1-5-pro']);
    expect([...page.document.querySelector<HTMLSelectElement>('[name="models"]')!.selectedOptions]).toHaveLength(4);
    expect(page.document.querySelectorAll('[data-model-share]')).toHaveLength(4);

    expect(page.document.querySelector('table[data-evidence="source-price"] caption')?.textContent).toMatch(/source price/i);
    expect(page.document.querySelector('table[data-evidence="derived-monthly"] caption')?.textContent).toMatch(/derived monthly/i);
  });

  it('calculates an auditable monthly API estimate from source rates', () => {
    const page = previewPage();
    setModels(page, ['gpt-4o']);
    setField(page, 'conversationsPerDay', '2');
    setField(page, 'messagesPerConversation', '3');
    setField(page, 'activeDays', '10');
    setField(page, 'inputTokensPerMessage', '1000');
    setField(page, 'outputTokensPerMessage', '500');
    setField(page, 'cacheReadShare', '20');
    setField(page, 'cacheWriteShare', '10');

    expect(resultValue(page, '#api-monthly-total')).toBeCloseTo(0.435, 8);
    expect(resultValue(page, '[data-line-item="gpt-4o-input-standard"]')).toBeCloseTo(0.105, 8);
    expect(resultValue(page, '[data-line-item="gpt-4o-cache-read"]')).toBeCloseTo(0.015, 8);
    expect(resultValue(page, '[data-line-item="gpt-4o-cache-write"]')).toBeCloseTo(0.015, 8);
    expect(resultValue(page, '[data-line-item="gpt-4o-output"]')).toBeCloseTo(0.3, 8);

    setField(page, 'longContext', true);
    expect(resultValue(page, '#api-monthly-total')).toBeCloseTo(0.5025, 8);
  });

  it('round-trips valid shared URL state through the calculator controls', () => {
    const first = previewPage();
    setField(first, 'provider', 'anthropic');
    setField(first, 'plan', 'anthropic-max');
    setModels(first, ['claude-3-5-sonnet', 'deepseek-v3']);
    setField(first, 'conversationsPerDay', '7');
    setField(first, 'messagesPerConversation', '9');
    setField(first, 'activeDays', '18');
    setField(first, 'inputTokensPerMessage', '2400');
    setField(first, 'outputTokensPerMessage', '900');
    setField(first, 'cacheReadShare', '30');
    setField(first, 'cacheWriteShare', '10');
    setField(first, 'longContext', true);

    expect(first.window.location.search).toContain('provider=anthropic');
    expect(first.window.location.search).toContain('plan=anthropic-max');
    expect(first.window.location.search).toContain('models=claude-3-5-sonnet%2Cdeepseek-v3');
    expect(first.window.location.search).toContain('longContext=1');

    const second = previewPage(first.window.location.href);
    expect(second.document.querySelector<HTMLSelectElement>('[name="provider"]')?.value).toBe('anthropic');
    expect(second.document.querySelector<HTMLSelectElement>('[name="plan"]')?.value).toBe('anthropic-max');
    expect([...second.document.querySelector<HTMLSelectElement>('[name="models"]')!.selectedOptions].map((option) => option.value)).toEqual(['claude-3-5-sonnet', 'deepseek-v3']);
    expect(second.document.querySelector<HTMLInputElement>('[name="conversationsPerDay"]')?.value).toBe('7');
    expect(second.document.querySelector<HTMLInputElement>('[name="cacheReadShare"]')?.value).toBe('30');
    expect(second.document.querySelector<HTMLInputElement>('[name="longContext"]')?.checked).toBe(true);
  });

  it('normalizes an invalid numeric input before deriving totals or sharing state', () => {
    const page = previewPage();
    const conversations = page.document.querySelector<HTMLInputElement>('[name="conversationsPerDay"]');
    expect(conversations).not.toBeNull();
    conversations!.value = '10001';
    conversations!.dispatchEvent(new page.window.Event('input', { bubbles: true }));

    expect(conversations?.value).toBe('5');
    expect(page.document.querySelector('#calculator-validation-status')?.textContent).toMatch(/invalid.*reset/i);
    expect(new URL(page.window.location.href).searchParams.get('conversationsPerDay')).toBe('5');
    expect(page.document.querySelector('[data-line-item$="-input-standard"]')?.textContent).toContain('792,000');
  });

  it('exports the current estimate as an accessible CSV download', async () => {
    const page = previewPage();
    page.document.querySelector<HTMLButtonElement>('#download-csv')?.click();

    expect(page.blobs).toHaveLength(1);
    await expect(readBlob(page.window, page.blobs[0]!)).resolves.toContain('line_item,monthly_tokens,source_rate_per_million,monthly_cost_usd');
    await expect(readBlob(page.window, page.blobs[0]!)).resolves.toContain('"breakeven_monthly_tokens_millions","monthly_subscription_usd","api_usage_usd","lower_cost"');
    expect(page.document.querySelector('#calculator-action-status')?.textContent).toMatch(/csv download prepared/i);
  });

  it('prints and copies the shareable URL with status feedback', async () => {
    const page = previewPage();
    page.document.querySelector<HTMLButtonElement>('#print-calculator')?.click();
    expect(page.print).toHaveBeenCalledOnce();
    expect(page.document.querySelector('#calculator-action-status')?.textContent).toMatch(/print dialog/i);

    page.document.querySelector<HTMLButtonElement>('#copy-calculator-link')?.click();
    expect(page.document.querySelector('#calculator-action-status')?.textContent).toMatch(/copying share link/i);
    expect(page.copy).toHaveBeenCalledWith(expect.stringContaining('models='));
    await vi.waitFor(() => expect(page.document.querySelector('#calculator-action-status')?.textContent).toMatch(/share link copied/i));
  });

  it('keeps required section headings print-visible while scoping the action toolbar away', () => {
    const page = previewPage();
    const printSafeToolbars = page.document.querySelectorAll('.calculator-print-safe.toolbar');
    expect(printSafeToolbars.length).toBeGreaterThanOrEqual(6);
    expect(page.document.querySelector('.calculator-action-controls.toolbar')).not.toHaveClass('calculator-print-safe');
    expect(page.document.querySelector('style[data-calculator-print]')?.textContent).toContain('.calculator-print-safe.toolbar');
  });

  it('uses the approved tokenized calculator layout for guided steps and model ratios', () => {
    const styles = readFileSync(stylePath, 'utf8');
    expect(styles).toMatch(/\.calculator-guided-steps\s*\{[^}]*gap:\s*16px/s);
    expect(styles).toMatch(/\.calculator-step-number\s*\{[^}]*color:\s*var\(--accent-text\)/s);
    expect(styles).toMatch(/\.calculator-model-mix-row\s*\{[^}]*border-top:\s*1px solid var\(--line\)/s);
    expect(styles).toContain('.calculator-model-step-grid');
  });
});
