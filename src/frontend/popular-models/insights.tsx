import { useEffect, useMemo, useState } from 'react';
import type {
  ChartConfiguration,
  ChartDataset,
  PointStyle,
  ScatterDataPoint,
  TooltipItem,
} from 'chart.js';
import { PopularChartCanvas } from './chart-canvas';
import {
  PopularModelComparisonWorkspace,
  type PopularComparisonMetric,
} from './comparison-workspace';
import { useSiteTheme } from '../site-preferences';
import { POPULAR_CATEGORY_KEYS, POPULAR_CATEGORY_LABELS } from './fixtures';
import { normalizePopularComparisonSelection } from './scoring';
import { PopularSectionActions } from './section-actions';
import type { BenchmarkCategoryKey, PopularModelFixture } from './types';

interface PopularInsightsSectionProps {
  readonly models: readonly PopularModelFixture[];
  readonly onCopyLink: (sectionId: string) => void;
  readonly onDownloadPng: (sectionId: string) => void;
  readonly onDownloadCsv: (models: readonly PopularModelFixture[]) => void;
}

type InsightCategory = BenchmarkCategoryKey | 'overall';

interface PopularChartTheme {
  readonly text: string;
  readonly muted: string;
  readonly outline: string;
  readonly surface: string;
  readonly surfaceLow: string;
  readonly primary: string;
  readonly primaryStrong: string;
  readonly tertiary: string;
  readonly warning: string;
  readonly danger: string;
  readonly fieldOutline: string;
  readonly fontBody: string;
  readonly fontLabel: string;
}

interface FrontierPoint extends ScatterDataPoint {
  readonly model: PopularModelFixture;
}

const PROVIDER_TOKEN_KEYS = [
  'primary',
  'primaryStrong',
  'tertiary',
  'warning',
  'danger',
  'muted',
  'text',
  'fieldOutline',
] as const satisfies readonly (keyof PopularChartTheme)[];

const POINT_STYLES: readonly PointStyle[] = ['circle', 'rectRounded', 'triangle', 'rectRot', 'crossRot', 'star', 'rect', 'cross'];
const MAX_PROFILE_COMPARISON_MODELS = 4;
const POPULAR_RADAR_LABELS = ['Reasoning', 'Coding', 'Agentic', 'Mathematics', 'Data analysis', 'Language', 'Instruction'] as const;

function cssValue(styles: CSSStyleDeclaration, property: string): string {
  return styles.getPropertyValue(property).trim();
}

function readChartTheme(): PopularChartTheme {
  if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') {
    return {
      text: '', muted: '', outline: '', surface: '', surfaceLow: '', primary: '', primaryStrong: '',
      tertiary: '', warning: '', danger: '', fieldOutline: '', fontBody: '', fontLabel: '',
    };
  }
  const tokenSource = document.querySelector('.popular-models-page') ?? document.documentElement;
  const styles = getComputedStyle(tokenSource);
  return {
    text: cssValue(styles, '--text'),
    muted: cssValue(styles, '--muted'),
    outline: cssValue(styles, '--outline'),
    surface: cssValue(styles, '--surface'),
    surfaceLow: cssValue(styles, '--surface-low'),
    primary: cssValue(styles, '--primary'),
    primaryStrong: cssValue(styles, '--primary-strong'),
    tertiary: cssValue(styles, '--tertiary'),
    warning: cssValue(styles, '--warning'),
    danger: cssValue(styles, '--danger'),
    fieldOutline: cssValue(styles, '--field-outline'),
    fontBody: cssValue(styles, '--font-body'),
    fontLabel: cssValue(styles, '--font-label'),
  };
}

function scoreFor(model: PopularModelFixture, category: InsightCategory): number {
  return category === 'overall' ? model.overallScore : model.categoryScores[category];
}

function modelHref(model: PopularModelFixture): string {
  return `/model-profile?model=${encodeURIComponent(model.slug)}`;
}

function formatScore(value: number): string {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

function formatCost(value: number): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: value < 1 ? 3 : 2 }).format(value);
}

function valueFrontier(models: readonly PopularModelFixture[], category: InsightCategory): readonly PopularModelFixture[] {
  const sorted = [...models].sort((left, right) => left.costPerSuccessfulTask - right.costPerSuccessfulTask || scoreFor(right, category) - scoreFor(left, category));
  let bestScore = Number.NEGATIVE_INFINITY;
  return sorted.filter((model) => {
    const score = scoreFor(model, category);
    if (score <= bestScore) return false;
    bestScore = score;
    return true;
  });
}

function chartTextOptions(theme: PopularChartTheme) {
  return {
    color: theme.muted,
    font: { family: theme.fontLabel },
  };
}

export function PopularInsightsSection({ models, onCopyLink, onDownloadPng, onDownloadCsv }: PopularInsightsSectionProps) {
  const siteTheme = useSiteTheme();
  const [activeCategory, setActiveCategory] = useState<InsightCategory>('overall');
  const [selectedModelIds, setSelectedModelIds] = useState<readonly string[]>(() => normalizePopularComparisonSelection([
    ...models,
  ].sort((left, right) => right.overallScore - left.overallScore).slice(0, 2).map((model) => model.id), models));
  const [compactChartLabels, setCompactChartLabels] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 600px)').matches);
  const [theme, setTheme] = useState<PopularChartTheme>(readChartTheme);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setTheme(readChartTheme()));
    return () => window.cancelAnimationFrame(frame);
  }, [siteTheme]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 600px)');
    const update = () => setCompactChartLabels(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const organizations = useMemo(() => [...new Set(models.map((model) => model.organization))], [models]);
  const providerStyle = (organization: string) => {
    const index = Math.max(organizations.indexOf(organization), 0);
    return {
      color: theme[PROVIDER_TOKEN_KEYS[index % PROVIDER_TOKEN_KEYS.length]],
      pointStyle: POINT_STYLES[Math.floor(index / PROVIDER_TOKEN_KEYS.length) % POINT_STYLES.length],
    };
  };
  const selectedModels = selectedModelIds.map((id) => models.find((model) => model.id === id)).filter((model): model is PopularModelFixture => Boolean(model));
  const availableModels = models.filter((model) => !selectedModelIds.includes(model.id));
  const frontier = valueFrontier(models, activeCategory);

  const scatterConfiguration = useMemo<ChartConfiguration<'scatter'>>(() => {
    const providerDatasets: ChartDataset<'scatter', FrontierPoint[]>[] = organizations.map((organization) => {
      const style = providerStyle(organization);
      return {
        label: organization,
        data: models.filter((model) => model.organization === organization).map((model) => ({
          x: model.costPerSuccessfulTask,
          y: scoreFor(model, activeCategory),
          model,
        })),
        backgroundColor: style.color,
        borderColor: style.color,
        pointStyle: style.pointStyle,
        pointRadius: 5,
        pointHoverRadius: 8,
      };
    });
    return {
      type: 'scatter',
      data: {
        datasets: [
          ...providerDatasets,
          {
            type: 'line',
            label: 'Value frontier',
            data: frontier.map((model) => ({ x: model.costPerSuccessfulTask, y: scoreFor(model, activeCategory), model })),
            borderColor: theme.text,
            backgroundColor: theme.text,
            borderDash: [6, 4],
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.18,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'nearest' },
        onClick: (_event, elements) => {
          const first = elements[0];
          if (!first) return;
          const dataset = providerDatasets[first.datasetIndex];
          const point = dataset?.data[first.index];
          if (point?.model) window.location.assign(modelHref(point.model));
        },
        plugins: {
          legend: { position: 'bottom', labels: { ...chartTextOptions(theme), usePointStyle: true, boxWidth: 10, padding: 32 } },
          tooltip: {
            callbacks: {
              title: (items: TooltipItem<'scatter'>[]) => (items[0]?.raw as FrontierPoint | undefined)?.model.name ?? items[0]?.dataset.label ?? '',
              label: (item: TooltipItem<'scatter'>) => {
                const point = item.raw as FrontierPoint;
                return `${formatScore(point.y)} score · ${formatCost(point.x)} / successful task`;
              },
            },
          },
        },
        scales: {
          x: {
            type: 'logarithmic',
            title: { display: true, text: 'Cost per successful task (log scale)', ...chartTextOptions(theme) },
            ticks: { ...chartTextOptions(theme), autoSkip: true, maxRotation: 0, maxTicksLimit: 8, callback: (value) => formatCost(Number(value)) },
            grid: { color: theme.outline },
          },
          y: {
            title: { display: true, text: activeCategory === 'overall' ? 'Overall score' : POPULAR_CATEGORY_LABELS[activeCategory], ...chartTextOptions(theme) },
            ticks: chartTextOptions(theme),
            grid: { color: theme.outline },
          },
        },
      },
    };
  }, [activeCategory, frontier, models, organizations, theme]);

  const costRankedModels = useMemo(() => [...models].sort((left, right) => left.costPerSuccessfulTask - right.costPerSuccessfulTask), [models]);
  const costConfiguration = useMemo<ChartConfiguration<'bar'>>(() => ({
    type: 'bar',
    data: {
      labels: costRankedModels.map((model) => compactChartLabels && model.name.length > 18 ? `${model.name.slice(0, 17)}…` : model.name),
      datasets: [{
        label: 'Cost per successful task',
        data: costRankedModels.map((model) => model.costPerSuccessfulTask),
        backgroundColor: costRankedModels.map((model) => providerStyle(model.organization).color),
        borderColor: costRankedModels.map((model) => providerStyle(model.organization).color),
        borderWidth: 1,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => costRankedModels[items[0]?.dataIndex ?? -1]?.name ?? '',
            label: (item) => {
              const model = costRankedModels[item.dataIndex];
              return model
                ? [`${formatCost(model.costPerSuccessfulTask)} / successful task`, `${formatCost(model.outputCostPerMillion)} / 1M output tokens`, `${model.verbosityTokens.toLocaleString()} median output tokens`]
                : '';
            },
          },
        },
      },
      scales: {
        x: { beginAtZero: true, ticks: { ...chartTextOptions(theme), maxTicksLimit: 6, callback: (value) => formatCost(Number(value)) }, grid: { color: theme.outline } },
        y: { ticks: chartTextOptions(theme), grid: { display: false } },
      },
    },
  }), [compactChartLabels, costRankedModels, organizations, theme]);

  const radarConfiguration = useMemo<ChartConfiguration<'radar'>>(() => ({
    type: 'radar',
    data: {
      labels: POPULAR_RADAR_LABELS,
      datasets: selectedModels.map((model, index) => {
        const style = providerStyle(model.organization);
        const comparisonColors = [theme.primaryStrong, theme.tertiary, theme.warning, theme.danger] as const;
        const comparisonColor = comparisonColors[index % comparisonColors.length];
        return {
          label: model.name,
          data: POPULAR_CATEGORY_KEYS.map((category) => model.categoryScores[category]),
          borderColor: comparisonColor,
          backgroundColor: `color-mix(in srgb, ${comparisonColor} 18%, ${theme.surface})`,
          pointBackgroundColor: comparisonColor,
          pointStyle: POINT_STYLES[index],
          borderDash: index === 0 ? [] : index === 1 ? [6, 4] : [2, 3],
          borderWidth: 2,
          pointRadius: 3,
        };
      }),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { ...chartTextOptions(theme), usePointStyle: true, boxWidth: 10, padding: 32 } } },
      scales: {
        r: {
          suggestedMin: 0,
          suggestedMax: 100,
          angleLines: { color: theme.outline },
          grid: { color: theme.outline },
          pointLabels: chartTextOptions(theme),
          ticks: { ...chartTextOptions(theme), backdropColor: theme.surface, showLabelBackdrop: true },
        },
      },
    },
  }), [organizations, selectedModels, theme]);

  const comparisonEconomicsCharts = useMemo(() => {
    const comparisonColors = [theme.primaryStrong, theme.tertiary, theme.warning, theme.danger] as const;
    const metrics = [
      {
        label: 'Cost / successful task',
        ariaLabel: `Cost per successful task comparison for ${selectedModels.map((model) => model.name).join(', ')}`,
        values: selectedModels.map((model) => model.costPerSuccessfulTask),
        format: formatCost,
      },
      {
        label: 'Output cost / 1M tokens',
        ariaLabel: `Output cost per million tokens comparison for ${selectedModels.map((model) => model.name).join(', ')}`,
        values: selectedModels.map((model) => model.outputCostPerMillion),
        format: formatCost,
      },
      {
        label: 'Median output tokens',
        ariaLabel: `Median output token comparison for ${selectedModels.map((model) => model.name).join(', ')}`,
        values: selectedModels.map((model) => model.verbosityTokens),
        format: (value: number) => `${value.toLocaleString()} tokens`,
      },
    ] as const;

    return metrics.map((metric) => ({
      label: metric.label,
      ariaLabel: metric.ariaLabel,
      configuration: {
        type: 'bar',
        data: {
          labels: selectedModels.map((model) => compactChartLabels && model.name.length > 12 ? `${model.name.slice(0, 11)}…` : model.name),
          datasets: [{
            label: metric.label,
            data: metric.values,
            backgroundColor: selectedModels.map((_model, index) => comparisonColors[index % comparisonColors.length]),
            borderColor: selectedModels.map((_model, index) => comparisonColors[index % comparisonColors.length]),
            borderWidth: 1,
            borderRadius: 4,
          }],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (item) => metric.format(Number(item.raw)) } },
          },
          scales: {
            x: { beginAtZero: true, ticks: { ...chartTextOptions(theme), maxTicksLimit: 5, callback: (value) => metric.format(Number(value)) }, grid: { color: theme.outline } },
            y: { ticks: chartTextOptions(theme), grid: { display: false } },
          },
        },
      } satisfies ChartConfiguration<'bar'>,
    }));
  }, [compactChartLabels, selectedModels, theme]);

  const comparisonProfileRows = POPULAR_CATEGORY_KEYS.map((category) => ({
    id: category,
    label: POPULAR_CATEGORY_LABELS[category],
    value: (model: PopularModelFixture) => formatScore(model.categoryScores[category]),
  })) satisfies readonly PopularComparisonMetric[];
  const comparisonDecisionRows = [
    { id: 'overall', label: 'Overall score', value: (model: PopularModelFixture) => formatScore(model.overallScore) },
    { id: 'task-cost', label: 'Cost / successful task', value: (model: PopularModelFixture) => formatCost(model.costPerSuccessfulTask) },
    { id: 'output-cost', label: 'Output / 1M tokens', value: (model: PopularModelFixture) => formatCost(model.outputCostPerMillion) },
    { id: 'verbosity', label: 'Median output', value: (model: PopularModelFixture) => `${model.verbosityTokens.toLocaleString()} tokens` },
    { id: 'access', label: 'Access', value: (model: PopularModelFixture) => model.openWeights ? 'Open weights' : 'Closed' },
    { id: 'finetune', label: 'Finetuning', value: (model: PopularModelFixture) => model.finetune ? 'Supported' : 'Not in fixture' },
  ] satisfies readonly PopularComparisonMetric[];
  const comparisonDetailRows = [
    ...comparisonProfileRows,
    { id: 'organization', label: 'Provider', value: (model: PopularModelFixture) => model.organization },
    ...comparisonDecisionRows,
    { id: 'fixture-status', label: 'Evidence status', value: () => 'Illustrative UI fixture' },
  ] satisfies readonly PopularComparisonMetric[];

  const addModel = (modelId: string) => {
    if (!modelId || selectedModelIds.length >= MAX_PROFILE_COMPARISON_MODELS || selectedModelIds.includes(modelId)) return;
    setSelectedModelIds((current) => normalizePopularComparisonSelection([...current, modelId], models));
  };
  const removeModel = (id: string) => setSelectedModelIds((current) => current.length <= 2 ? current : current.filter((candidate) => candidate !== id));

  return <section id="popular-models-insights" className="popular-models-section popular-models-insights" aria-labelledby="popular-models-insights-heading">
    <div className="popular-models-heading-row">
      <div><h2 id="popular-models-insights-heading"><span className="popular-models-section-index">02</span><span>Insights</span></h2><p>Interrogate the relationship between benchmark quality, task cost, and category shape.</p></div>
      <PopularSectionActions
        label="Popular model insights"
        onCopyLink={() => onCopyLink('popular-models-insights')}
        onDownloadPng={() => onDownloadPng('popular-models-insights')}
        onDownloadCsv={() => onDownloadCsv(models)}
      />
    </div>

    <div className="popular-models-insight-category-tabs" role="group" aria-label="Insight score category">
      <button className="popular-models-category-tab popular-models-touch-target" type="button" aria-pressed={activeCategory === 'overall'} onClick={() => setActiveCategory('overall')}>Overall</button>
      {POPULAR_CATEGORY_KEYS.map((category) => <button key={category} className="popular-models-category-tab popular-models-touch-target" type="button" aria-pressed={activeCategory === category} onClick={() => setActiveCategory(category)}>{POPULAR_CATEGORY_LABELS[category]}</button>)}
    </div>

    <div className="popular-models-insights-grid">
      <article className="popular-models-insight-panel popular-models-scatter-panel">
        <div className="popular-models-chart-heading"><div><h3>Quality vs. cost</h3><p>Logarithmic task cost with the efficiency frontier traced across stronger scores.</p></div><span>Click a point for its profile</span></div>
        <div className="popular-models-chart-wrap popular-models-scatter-chart"><PopularChartCanvas ariaLabel="Quality versus cost scatter plot with model providers and a value frontier" configuration={scatterConfiguration} /></div>
        <details className="popular-models-chart-data"><summary>Exact quality and cost values</summary><div className="popular-models-chart-table-wrap"><table><thead><tr><th scope="col">Model</th><th scope="col">Provider</th><th scope="col">Score</th><th scope="col">Cost / task</th><th scope="col">Frontier</th></tr></thead><tbody>{[...models].sort((left, right) => scoreFor(right, activeCategory) - scoreFor(left, activeCategory)).map((model) => <tr key={model.id}><th scope="row"><a href={modelHref(model)}>{model.name}</a></th><td>{model.organization}</td><td>{formatScore(scoreFor(model, activeCategory))}</td><td>{formatCost(model.costPerSuccessfulTask)}</td><td>{frontier.some((candidate) => candidate.id === model.id) ? 'Yes' : 'No'}</td></tr>)}</tbody></table></div></details>
      </article>

      <article className="popular-models-insight-panel popular-models-cost-panel">
        <div className="popular-models-chart-heading"><div><h3>Cost ranking</h3><p>Cheapest to most expensive per successful task.</p></div><span>Pricing and verbosity are listed below</span></div>
        <div className="popular-models-chart-wrap popular-models-cost-chart"><PopularChartCanvas ariaLabel="Horizontal ranking of models by cost per successful task" configuration={costConfiguration} /></div>
        <details className="popular-models-chart-data"><summary>Exact cost ranking</summary><div className="popular-models-chart-table-wrap"><table><thead><tr><th scope="col">Rank</th><th scope="col">Model</th><th scope="col">Cost / task</th><th scope="col">Output / 1M</th><th scope="col">Verbosity</th></tr></thead><tbody>{costRankedModels.map((model, index) => <tr key={model.id}><td>{index + 1}</td><th scope="row"><a href={modelHref(model)}>{model.name}</a></th><td>{formatCost(model.costPerSuccessfulTask)}</td><td>{formatCost(model.outputCostPerMillion)}</td><td>{model.verbosityTokens.toLocaleString()} tokens</td></tr>)}</tbody></table></div></details>
      </article>
    </div>

    <PopularModelComparisonWorkspace
      availableModels={availableModels}
      decisionRows={comparisonDecisionRows}
      detailRows={comparisonDetailRows}
      economicsCharts={comparisonEconomicsCharts}
      maxModels={MAX_PROFILE_COMPARISON_MODELS}
      onAdd={addModel}
      onRemove={removeModel}
      profileRows={comparisonProfileRows}
      radarConfiguration={radarConfiguration}
      selectedModels={selectedModels}
    />
  </section>;
}
