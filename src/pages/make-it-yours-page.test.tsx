import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureAdapter } from '../frontend/preview-data/adapter';
import { ACCEPTED_CUSTOM_RANKING_QUERY, type PreviewDataAdapter, type RankingQuery } from '../frontend/preview-data/contracts';
import { previewRoutes } from '../preview/route-manifest';
import { MakeItYoursPage, parseMakeItYoursPageData } from './make-it-yours-page';

const chartConfigurations = vi.hoisted(() => new Map<string, { readonly labels: readonly string[]; readonly backgroundColors: readonly string[] }>());

vi.mock('../frontend/popular-models/chart-canvas', () => ({
  PopularChartCanvas: ({ ariaLabel, configuration }: {
    readonly ariaLabel: string;
    readonly configuration: { readonly data: { readonly labels?: unknown; readonly datasets: readonly { readonly backgroundColor?: unknown }[] } };
  }) => {
    chartConfigurations.set(ariaLabel, {
      labels: Array.isArray(configuration.data.labels) ? configuration.data.labels.filter((label): label is string => typeof label === 'string') : [],
      backgroundColors: Array.isArray(configuration.data.datasets[0]?.backgroundColor) ? configuration.data.datasets[0].backgroundColor.filter((color): color is string => typeof color === 'string') : [],
    });
    return <div role="img" aria-label={ariaLabel} />;
  },
}));

describe('MakeItYoursPage', () => {
  beforeEach(() => { chartConfigurations.clear(); });

  it('delivers a static React weighted leaderboard with semantic ranking and SLA tables', async () => {
    const route = previewRoutes.find((candidate) => candidate.id === 'make-it-yours');
    const match = route?.match(new URL('https://tokenbench.test/make-it-yours/'));
    const data = await fixtureAdapter.rankings({});
    if (!route || !match) throw new Error('Make it yours preview route is unavailable');

    render(<MakeItYoursPage match={match} data={data} />);

    expect(parseMakeItYoursPageData(data)).toEqual(data);
    expect(route.delivery).toBe('react');
    expect(route.documentReadiness).toEqual({ status: 'ready' });
    expect(screen.getByRole('heading', { level: 1, name: 'Make it yours' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Weighted ranking evidence' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Exact TTFT measurements' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Exact throughput measurements' })).toBeInTheDocument();
  });

  it('shows a recoverable warning and pauses results for zero weights', async () => {
    const data = await fixtureAdapter.rankings({});
    const match = { routeId: 'make-it-yours' as const, pathname: '/make-it-yours/', search: new URLSearchParams(), hash: '', params: {} };

    render(<MakeItYoursPage match={match} data={data} />);
    for (const label of ['Reasoning', 'Coding', 'Agentic-coding', 'Mathematics', 'Data-analysis', 'Language', 'Instruction-following']) {
      fireEvent.change(screen.getByRole('slider', { name: `${label} weight` }), { target: { value: '0' } });
    }

    expect(screen.getByRole('alert')).toHaveTextContent('At least one capability weight must be greater than zero.');
    expect(screen.getByText('Ranking is paused until at least one capability weight is above zero.')).toBeInTheDocument();
  });

  it('labels the reset action with the actual established default distribution', async () => {
    const data = await fixtureAdapter.rankings({});
    const match = { routeId: 'make-it-yours' as const, pathname: '/make-it-yours/', search: new URLSearchParams(), hash: '', params: {} };

    render(<MakeItYoursPage match={match} data={data} />);

    expect(screen.getByRole('button', { name: 'Reset default weights' })).toBeInTheDocument();
  });

  it('submits the accepted custom ranking matrix verbatim instead of rebuilding it from slider DOM state', async () => {
    const requests: RankingQuery[] = [];
    const adapter: PreviewDataAdapter = {
      ...fixtureAdapter,
      rankings(query) {
        requests.push(query);
        return fixtureAdapter.rankings(query);
      },
    };
    const data = await fixtureAdapter.rankings({});
    const match = { routeId: 'make-it-yours' as const, pathname: '/make-it-yours/', search: new URLSearchParams(), hash: '', params: {} };

    render(<MakeItYoursPage match={match} data={data} adapter={adapter} />);
    fireEvent.change(screen.getByRole('slider', { name: 'Agentic-coding weight' }), { target: { value: '100' } });

    await waitFor(() => expect(requests).toEqual([ACCEPTED_CUSTOM_RANKING_QUERY]));
  });

  it('uses direct-loaded model selections for the 2–4 model tray and in-depth comparison link', async () => {
    const data = await fixtureAdapter.rankings({});
    const match = {
      routeId: 'make-it-yours' as const,
      pathname: '/make-it-yours/',
      search: new URLSearchParams('models=gpt-4o,deepseek-v3'),
      hash: '',
      params: {},
    };

    render(<MakeItYoursPage match={match} data={data} />);

    const tray = screen.getByRole('region', { name: 'Quick comparison' });
    expect(within(tray).getByRole('link', { name: 'Open in-depth comparison' }))
      .toHaveAttribute('href', '/compare?models=gpt-4o%2Cdeepseek-v3');
  });

  it('provides keyboard alternatives and metric-specific semantic SLA evidence', async () => {
    const data = structuredClone(await fixtureAdapter.rankings({}));
    const gpt4o = data.data?.models.find((entry) => entry.model.id === 'gpt-4o');
    if (!gpt4o || gpt4o.model.runtime.availability !== 'available') throw new Error('Expected GPT-4o runtime fixture');
    (gpt4o.model.runtime.value as { outputTokensPerSecond: number }).outputTokensPerSecond = 50;
    const match = { routeId: 'make-it-yours' as const, pathname: '/make-it-yours/', search: new URLSearchParams(), hash: '', params: {} };

    render(<MakeItYoursPage match={match} data={data} />);

    const rankingSelection = screen.getByRole('listbox', { name: 'Weighted model ranking chart model selection' });
    expect(rankingSelection).toHaveAttribute('aria-activedescendant', expect.stringMatching(/^[A-Za-z][A-Za-z0-9_-]*$/));
    expect(screen.getByRole('listbox', { name: 'TTFT chart model selection' })).toBeInTheDocument();
    expect(screen.getByRole('listbox', { name: 'Throughput chart model selection' })).toBeInTheDocument();
    const ttftRow = within(screen.getByRole('table', { name: 'Exact TTFT measurements' })).getByRole('row', { name: /GPT-4o/ });
    const throughputRow = within(screen.getByRole('table', { name: 'Exact throughput measurements' })).getByRole('row', { name: /GPT-4o/ });
    expect(within(ttftRow).getAllByRole('cell')[1]).toHaveTextContent('Pass');
    expect(within(throughputRow).getAllByRole('cell')[1]).toHaveTextContent('Outside threshold');

    const ttftChart = chartConfigurations.get('Time-to-first-token measurements by model');
    const gpt4oIndex = ttftChart?.labels.indexOf('GPT-4o') ?? -1;
    expect(gpt4oIndex).toBeGreaterThanOrEqual(0);
    expect(ttftChart?.backgroundColors[gpt4oIndex]).toBe('#4f46e5');
  });
});
