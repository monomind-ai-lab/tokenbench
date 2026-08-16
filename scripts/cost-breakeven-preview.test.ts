import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

const prototypeRoot = resolve('prototypes/ui-revamp-3');
const htmlPath = resolve(prototypeRoot, 'cost-breakeven.html');
const scriptPath = resolve(prototypeRoot, 'cost-breakeven.js');

type ChartConfig = {
  readonly data: {
    readonly datasets: readonly {
      readonly label: string;
      readonly data: readonly { readonly x: number; readonly y: number }[];
    }[];
  };
};

function renderBreakeven(search = '') {
  if (!existsSync(htmlPath) || !existsSync(scriptPath)) return null;

  const html = readFileSync(htmlPath, 'utf8')
    .replace(/<script src="https:\/\/cdn\.jsdelivr\.net[^>]*><\/script>/u, '<script></script>')
    .replace(/<script src="data\.js[^>]*><\/script>/u, `<script>${readFileSync(resolve(prototypeRoot, 'data.js'), 'utf8')}</script>`)
    .replace('<script src="common.js"></script>', '<script>function setupShell(){} function colors(){return { accentText: "#6d28d9", ink: "#111827", line: "#d1d5db", muted: "#6b7280", plum: "#6d28d9" };} function chart(canvas, config){if(!canvas)return null;if(typeof Chart === "undefined"){canvas.hidden=true;return null;}const old=Chart.getChart(canvas);if(old)old.destroy();return new Chart(canvas, config);}</script>')
    .replace('<script src="cost-breakeven.js"></script>', `<script>${readFileSync(scriptPath, 'utf8')}</script>`);
  const chartConfigs: ChartConfig[] = [];
  const charts = new Map<HTMLCanvasElement, { destroy: () => void }>();
  const dom = new JSDOM(html, {
    beforeParse(window) {
      class Chart {
        readonly canvas: HTMLCanvasElement;

        constructor(canvas: HTMLCanvasElement, config: ChartConfig) {
          this.canvas = canvas;
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

      window.Chart = Chart;
      window.matchMedia = () => ({ matches: true }) as MediaQueryList;
      window.URL.createObjectURL = () => 'blob:tokenbench-test';
      window.URL.revokeObjectURL = () => undefined;
      window.HTMLElement.prototype.scrollIntoView = () => undefined;
      let printCalls = 0;
      window.print = () => { printCalls += 1; };
      (window as unknown as { __printCalls: () => number }).__printCalls = () => printCalls;
    },
    runScripts: 'dangerously',
    url: `https://preview.tokenbench.test/cost/breakeven${search}`,
  });

  return { chartConfigs, document: dom.window.document, window: dom.window };
}

function requirePage(search = '') {
  const page = renderBreakeven(search);
  expect(page, 'the breakeven preview document and runtime must exist').not.toBeNull();
  return page!;
}

function exactRows(document: Document) {
  return [...document.querySelectorAll<HTMLTableRowElement>('#breakeven-table tbody tr')].map((row) =>
    [...row.cells].map((cell) => cell.textContent?.trim() ?? ''),
  );
}

describe('cost breakeven preview', () => {
  it('keeps auditable seat, subscription, token, and model boundaries', () => {
    const { document } = requirePage();
    const seats = document.querySelector<HTMLInputElement>('#breakeven-seats');
    const tokenVolume = document.querySelector<HTMLInputElement>('#breakeven-token-volume');
    const subscription = document.querySelector<HTMLInputElement>('#breakeven-seat-price');
    const modelNames = [...document.querySelectorAll<HTMLSelectElement>('#breakeven-model option')]
      .map((option) => option.textContent?.trim());

    expect(document.querySelector('#breakeven-calculator')).not.toBeNull();
    expect([seats?.min, seats?.max]).toEqual(['1', '50']);
    expect([tokenVolume?.min, tokenVolume?.max]).toEqual(['0', '300']);
    expect(subscription?.value).toBe('20');
    expect(modelNames).toEqual(expect.arrayContaining(['DeepSeek V3 — DeepSeek', 'Claude 3.5 Sonnet — Anthropic', 'GPT-4o — OpenAI']));
  });

  it('calculates the crossover from SaaS seats and the selected fixture API prices', () => {
    const { document, window } = requirePage('?seats=5&seatPrice=20&model=claude-3-5-sonnet&inputShare=70&cacheReads=0&cacheWrites=0');

    expect(document.querySelector('#breakeven-crossover')?.textContent).toContain('15.15M tokens');
    expect(document.querySelector('#breakeven-lower-cost')?.textContent).toContain('API is lower cost below 15.15M tokens');
    expect(document.querySelector('#breakeven-effective-rate')?.textContent).toContain('$6.60 / 1M');
    expect(window.location.search).toContain('model=claude-3-5-sonnet');
  });

  it('normalizes an invalid shared state to the supported model and token boundaries', () => {
    const { document, window } = requirePage('?model=not-a-fixture&seats=100&tokenVolume=500');

    expect(document.querySelector<HTMLSelectElement>('#breakeven-model')?.value).toBe('claude-3-5-sonnet');
    expect(document.querySelector<HTMLInputElement>('#breakeven-seats')?.value).toBe('50');
    expect(document.querySelector<HTMLInputElement>('#breakeven-token-volume')?.value).toBe('300');
    expect(window.location.search).toContain('model=claude-3-5-sonnet');
    expect(window.location.search).toContain('seats=50');
    expect(window.location.search).toContain('tokenVolume=300');
  });

  it('discloses standard-input fallback whenever fixture cache prices are unavailable', () => {
    const { document } = requirePage('?model=phi-4&cacheReads=20&cacheWrites=20');
    const source = document.querySelector('#breakeven-source')?.textContent ?? '';
    const priceEvidence = document.querySelector('#breakeven-price-table')?.textContent ?? '';
    const formula = document.querySelector('#breakeven-formula')?.textContent ?? '';
    const assumptions = document.querySelector('#breakeven-assumptions')?.textContent ?? '';

    expect(source).toMatch(/cache-read price unavailable.*standard input/iu);
    expect(source).toMatch(/cache-write price unavailable.*standard input/iu);
    expect(priceEvidence).toMatch(/cache-read.*standard input/iu);
    expect(priceEvidence).toMatch(/cache-write.*standard input/iu);
    expect(formula).toMatch(/cache-read price unavailable.*standard input/iu);
    expect(formula).toMatch(/cache-write price unavailable.*standard input/iu);
    expect(assumptions).toMatch(/cache-read price unavailable.*standard input/iu);
    expect(assumptions).toMatch(/cache-write price unavailable.*standard input/iu);
  });

  it('describes a zero-price SaaS baseline without a negative token region', () => {
    const { document } = requirePage('?seats=5&seatPrice=0&model=claude-3-5-sonnet');
    const lowerCost = document.querySelector('#breakeven-lower-cost')?.textContent ?? '';

    expect(document.querySelector('#breakeven-crossover')?.textContent).toContain('0M tokens');
    expect(lowerCost).not.toMatch(/below 0M tokens/iu);
    expect(lowerCost).toMatch(/equal at 0M tokens.*lower cost for positive token volumes/iu);
  });

  it('announces print preparation before invoking the browser print action', () => {
    const { document, window } = requirePage();
    document.querySelector<HTMLButtonElement>('#breakeven-print')?.click();

    expect(document.querySelector('#breakeven-action-status')?.textContent).toMatch(/preparing.*print/iu);
    expect((window as unknown as { __printCalls: () => number }).__printCalls()).toBe(1);
  });

  it('keeps sampled chart curve values identical to the accessible evidence table', () => {
    const { chartConfigs, document } = requirePage('?seats=5&seatPrice=20&model=claude-3-5-sonnet&inputShare=70&cacheReads=0&cacheWrites=0');
    const chart = chartConfigs.at(-1);
    const saas = chart?.data.datasets.find((dataset) => dataset.label === 'SaaS subscription');
    const api = chart?.data.datasets.find((dataset) => dataset.label === 'API usage');
    const rows = exactRows(document);

    expect(rows).toEqual([
      ['0M', '$100.00', '$0.00', 'API'],
      ['25M', '$100.00', '$165.00', 'SaaS'],
      ['50M', '$100.00', '$330.00', 'SaaS'],
      ['100M', '$100.00', '$660.00', 'SaaS'],
      ['150M', '$100.00', '$990.00', 'SaaS'],
      ['200M', '$100.00', '$1,320.00', 'SaaS'],
      ['250M', '$100.00', '$1,650.00', 'SaaS'],
      ['300M', '$100.00', '$1,980.00', 'SaaS'],
    ]);
    expect(saas?.data.map((point) => [point.x, point.y])).toEqual([[0, 100], [25, 100], [50, 100], [100, 100], [150, 100], [200, 100], [250, 100], [300, 100]]);
    expect(api?.data.map((point) => [point.x, point.y])).toEqual([[0, 0], [25, 165], [50, 330], [100, 660], [150, 990], [200, 1320], [250, 1650], [300, 1980]]);
  });

  it('preserves the exact table when Chart.js is unavailable', () => {
    const page = renderBreakeven('?seats=5&seatPrice=20&model=claude-3-5-sonnet&inputShare=70&cacheReads=0&cacheWrites=0');
    expect(page, 'the preview must exist before its no-Chart fallback can be checked').not.toBeNull();
    if (!page) return;
    delete (page.window as unknown as { Chart?: unknown }).Chart;
    (page.window as unknown as { renderPage: () => void }).renderPage();

    expect(exactRows(page.document)[1]).toEqual(['25M', '$100.00', '$165.00', 'SaaS']);
    expect(page.document.querySelector('#breakeven-table')).not.toBeNull();
  });
});
