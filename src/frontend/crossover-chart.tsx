import type { ChartConfiguration } from 'chart.js';
import type { CrossoverDomainPoint } from '../catalog/subscription-api-calculator';
import { PopularChartCanvas } from './popular-models/chart-canvas';

export function crossoverChartConfiguration(domain: readonly CrossoverDomainPoint[]): ChartConfiguration<'line'> {
  return {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'Monthly subscription',
          data: domain.map((point) => ({ x: point.tokens, y: point.monthlySubscriptionUsd })),
          borderColor: '#172033',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 3,
          tension: 0,
        },
        {
          label: 'API usage',
          data: domain.map((point) => ({ x: point.tokens, y: point.apiUsd })),
          borderColor: '#4f46e5',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 3,
          tension: 0,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      parsing: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { usePointStyle: true } },
        tooltip: {
          callbacks: {
            title: (items) => `${formatMillions(Number(items[0]?.parsed.x ?? 0))} tokens`,
            label: (item) => `${item.dataset.label}: ${formatUsd(Number(item.parsed.y))}`,
          },
        },
      },
      scales: {
        x: { type: 'linear', title: { display: true, text: 'Monthly tokens' }, ticks: { callback: (value) => formatMillions(Number(value)) } },
        y: { title: { display: true, text: 'Monthly cost (USD)' }, ticks: { callback: (value) => formatUsd(Number(value)) } },
      },
    },
  };
}

function formatMillions(tokens: number): string {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(tokens / 1_000_000)}M`;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function CrossoverChart({ domain }: { readonly domain: readonly CrossoverDomainPoint[] }) {
  return <PopularChartCanvas
    ariaLabel="API usage and Monthly subscription cost across zero to 300 million monthly tokens"
    className="crossover-chart-canvas"
    configuration={crossoverChartConfiguration(domain)}
  />;
}
