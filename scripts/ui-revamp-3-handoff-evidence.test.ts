import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

const prototypeRoot = resolve('prototypes/ui-revamp-3');
const compareHtml = readFileSync(resolve(prototypeRoot, 'compare.html'), 'utf8');
const dataScript = readFileSync(resolve(prototypeRoot, 'data.js'), 'utf8');
const commonScript = readFileSync(resolve(prototypeRoot, 'common.js'), 'utf8');
const styles = readFileSync(resolve(prototypeRoot, 'styles.css'), 'utf8');

type ChartConfig = {
  readonly type: string;
  readonly data: {
    readonly labels: readonly string[];
    readonly datasets: readonly { readonly label: string }[];
  };
};

type ChartInstance = {
  readonly canvas: HTMLCanvasElement;
  readonly config: ChartConfig;
};

function renderComparison(modelIds: readonly string[]) {
  const chartConfigs: ChartConfig[] = [];
  const chartRegistry = new Map<HTMLCanvasElement, ChartInstance>();
  const html = compareHtml
    .replace(/<script src="https:\/\/cdn\.jsdelivr\.net[^>]*><\/script>/u, '<script></script>')
    .replace(/<script src="data\.js[^>]*><\/script>/u, () => `<script>${dataScript}</script>`)
    .replace('<script src="common.js"></script>', () => `<script>${commonScript}</script>`);
  const dom = new JSDOM(html, {
    beforeParse(window) {
      class Chart {
        readonly canvas: HTMLCanvasElement;
        readonly config: ChartConfig;

        constructor(canvas: HTMLCanvasElement, config: ChartConfig) {
          this.canvas = canvas;
          this.config = config;
          chartConfigs.push(config);
          chartRegistry.set(canvas, this);
        }

        destroy() {
          if (chartRegistry.get(this.canvas) === this) chartRegistry.delete(this.canvas);
        }

        static getChart(canvas: HTMLCanvasElement) {
          return chartRegistry.get(canvas) ?? null;
        }
      }

      window.Chart = Chart;
      window.matchMedia = () => ({ matches: true }) as MediaQueryList;
      window.requestAnimationFrame = (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      };
      window.HTMLElement.prototype.scrollIntoView = () => undefined;
    },
    runScripts: 'dangerously',
    url: `https://preview.tokenbench.test/compare?models=${modelIds.join(',')}`,
  });

  return {
    chartConfigs,
    document: dom.window.document,
    liveCharts: () => [...chartRegistry.values()],
    rerender: () => (dom.window as unknown as { renderPage: () => void }).renderPage(),
  };
}

function exactRow(document: Document, label: string) {
  const row = [...document.querySelectorAll('[aria-label="Itemized model comparison"] tbody tr')]
    .find((candidate) => candidate.querySelector('th')?.textContent?.trim() === label);
  expect(row, `expected exact comparison row ${label}`).toBeDefined();
  return [...row!.querySelectorAll('td')].map((cell) => cell.textContent?.trim());
}

function mobileExactRow(document: Document, label: string) {
  const card = [...document.querySelectorAll('[aria-label="Itemized model comparison by metric"] .comparison-metric-card')]
    .find((candidate) => candidate.querySelector('h4')?.textContent?.trim() === label);
  expect(card, `expected mobile exact comparison row ${label}`).toBeDefined();
  return [...card!.querySelectorAll('dd')].map((cell) => cell.textContent?.trim());
}

function gridColumnsFor(selector: string, mediaCondition?: string) {
  const document = new JSDOM(`<style>${styles}</style>`).window.document;
  const rules = [...document.styleSheets[0]!.cssRules];
  const candidateRules = mediaCondition
    ? rules.flatMap((rule) => {
      const mediaRule = rule as CSSMediaRule;
      return mediaRule.conditionText === mediaCondition ? [...mediaRule.cssRules] : [];
    })
    : rules;
  const styleRule = candidateRules.find((rule) => (rule as CSSStyleRule).selectorText === selector) as CSSStyleRule | undefined;
  return styleRule?.style.getPropertyValue('grid-template-columns');
}

describe('ui-revamp-3 comparison handoff evidence', () => {
  it('shows openWeights false Popular Models handoffs as Closed without inventing Proprietary', () => {
    const { document } = renderComparison(['claude-opus-4-1', 'gpt-5']);

    expect(exactRow(document, 'Access')).toEqual(['Closed', 'Closed']);
    expect(document.querySelector('[aria-label="Itemized model comparison"]')?.textContent).not.toContain('Proprietary');
  });

  it('splits mixed blended and successful-task cost evidence in exact rows and charts', () => {
    const { chartConfigs, document } = renderComparison(['gpt-4o', 'claude-opus-4-1']);

    expect(exactRow(document, 'Blended cost / 1M')).toEqual(['$4.38', 'Unavailable']);
    expect(exactRow(document, 'Cost per successful task')).toEqual(['Unavailable', '$9.50']);
    expect(mobileExactRow(document, 'Blended cost / 1M')).toEqual(['$4.38', 'Unavailable']);
    expect(mobileExactRow(document, 'Cost per successful task')).toEqual(['Unavailable', '$9.50']);

    const costCharts = chartConfigs.filter((config) => config.type === 'bar' && /cost/iu.test(config.data.datasets[0]?.label ?? ''));
    expect(costCharts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        data: expect.objectContaining({
          labels: ['GPT-4o'],
          datasets: [expect.objectContaining({ label: 'Blended cost ($ / 1M)' })],
        }),
      }),
      expect.objectContaining({
        data: expect.objectContaining({
          labels: ['Claude Opus 4.1'],
          datasets: [expect.objectContaining({ label: 'Cost per successful task' })],
        }),
      }),
    ]));
  });

  it.each([
    {
      label: 'single-basis',
      modelIds: ['gpt-4o', 'deepseek-v3'],
      mixed: false,
      peerLabels: ['Blended cost ($ / 1M)', 'TTFT (seconds)', 'Throughput (tok/s)'],
    },
    {
      label: 'mixed-basis',
      modelIds: ['gpt-4o', 'claude-opus-4-1'],
      mixed: true,
      peerLabels: ['Blended cost ($ / 1M)', 'Cost per successful task', 'TTFT (seconds)', 'Throughput (tok/s)'],
    },
  ])('renders $label runtime charts as balanced peer cells', ({ modelIds, mixed, peerLabels }) => {
    const { document } = renderComparison(modelIds);
    const runtimeGrid = document.querySelector<HTMLElement>('.compare-bars')!;
    const peerCells = [...runtimeGrid.querySelectorAll<HTMLElement>(':scope > .compare-bar-cell')];

    expect(runtimeGrid.classList.contains('has-mixed-cost-bases')).toBe(mixed);
    expect(peerCells.map((cell) => cell.querySelector(':scope > .label')?.textContent?.trim())).toEqual(peerLabels);
  });

  it('uses two desktop columns and the established one-column mobile stack for mixed cost bases', () => {
    const selector = '.compare-bars.has-mixed-cost-bases';

    expect(gridColumnsFor(selector)).toBe('repeat(2, minmax(0, 1fr))');
    expect(gridColumnsFor(selector, '(max-width: 800px)')).toBe('1fr');
  });

  it.each([
    { label: 'same-basis', modelIds: ['gpt-4o', 'deepseek-v3'], expectedCostCharts: 1 },
    { label: 'mixed-basis', modelIds: ['gpt-4o', 'claude-opus-4-1'], expectedCostCharts: 2 },
  ])('destroys detached cost charts across repeated $label renders', ({ modelIds, expectedCostCharts }) => {
    const comparison = renderComparison(modelIds);

    comparison.rerender();
    comparison.rerender();

    const connectedCanvases = [...comparison.document.querySelectorAll<HTMLCanvasElement>('.compare-bars [data-cost-basis] canvas')];
    const liveCostCharts = comparison.liveCharts().filter((instance) => /cost/iu.test(instance.config.data.datasets[0]?.label ?? ''));
    expect(liveCostCharts.map((instance) => instance.canvas.id)).toEqual(connectedCanvases.map((canvas) => canvas.id));
    expect(liveCostCharts).toHaveLength(expectedCostCharts);
    expect(liveCostCharts.every((instance) => instance.canvas.isConnected)).toBe(true);
  });
});
