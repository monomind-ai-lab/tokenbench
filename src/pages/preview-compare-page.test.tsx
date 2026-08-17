import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fixtureAdapter } from '../frontend/preview-data/adapter';
import { previewRoutes } from '../preview/route-manifest';
import { parsePreviewComparePageData, PreviewComparePage } from './preview-compare-page';

vi.mock('../frontend/popular-models/chart-canvas', () => ({
  PopularChartCanvas: ({ ariaLabel }: { readonly ariaLabel: string }) => <div role="img" aria-label={ariaLabel} />,
}));

describe('PreviewComparePage', () => {
  it('rejects an incomplete comparison payload before hydration', () => {
    expect(parsePreviewComparePageData({
      contractVersion: 'ui-data-contract/v1',
      status: 'partial',
      fetchedAt: '2026-08-17T00:00:00.000Z',
      provenance: [],
      data: { models: [{ id: 'partial' }] },
    })).toBeNull();
  });

  it('delivers the preview compare route through React with query-order matrix and semantic chart alternatives', async () => {
    const route = previewRoutes.find((candidate) => candidate.id === 'compare');
    const match = route?.match(new URL('https://tokenbench.test/compare?models=gpt-4o,deepseek-v3'));
    const data = await fixtureAdapter.comparison({ modelIds: ['gpt-4o', 'deepseek-v3'] });
    if (!route || !match) throw new Error('Compare preview route is unavailable');

    render(<PreviewComparePage match={match} data={data} />);

    expect(route.delivery).toBe('react');
    expect(route.documentReadiness).toEqual({ status: 'ready' });
    expect(screen.getByText('Review result')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'GPT-4o vs DeepSeek V3' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Capability comparison radar/i })).toBeInTheDocument();
    const exactCapability = screen.getByRole('region', { name: 'Exact capability comparison' });
    expect(within(exactCapability).getByRole('columnheader', { name: 'GPT-4o' })).toBeInTheDocument();
    expect(within(exactCapability).getByRole('columnheader', { name: 'DeepSeek V3' })).toBeInTheDocument();
    expect(within(exactCapability).getByRole('rowheader', { name: 'Reasoning' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Decision deltas' })).toBeInTheDocument();
    expect(screen.getByText('Tabulated specs for quick comparison.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Time to first token comparison/i })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Throughput comparison/i })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Cost comparison/i })).toBeInTheDocument();
  });

  it('adds a model only once, updates its canonical query, and focuses the results after comparison', async () => {
    const data = await fixtureAdapter.comparison({ modelIds: [] });
    const match = {
      routeId: 'compare' as const,
      pathname: '/compare',
      search: new URLSearchParams(),
      hash: '',
      params: {},
    };
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    render(<PreviewComparePage match={match} data={data} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add a model' }));
    fireEvent.click(await screen.findByRole('option', { name: /GPT-4o/ }));
    expect(screen.getByRole('link', { name: 'GPT-4o' })).toBeInTheDocument();
    expect(screen.queryAllByRole('link', { name: 'GPT-4o' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Add a model' }));
    expect(screen.queryByRole('option', { name: /GPT-4o/ })).toBeNull();
    fireEvent.click(screen.getByRole('option', { name: /DeepSeek V3/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Compare 2 models' }));

    expect(window.location.search).toBe('?models=gpt-4o%2Cdeepseek-v3');
    expect(scrollIntoView).toHaveBeenCalled();
  });
});
