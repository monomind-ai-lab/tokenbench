import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtureAdapter } from '../frontend/preview-data/adapter';
import { previewRoutes } from '../preview/route-manifest';
import { parsePreviewComparePageData, PreviewComparePage } from './preview-compare-page';

vi.mock('../frontend/popular-models/chart-canvas', () => ({
  PopularChartCanvas: ({ ariaLabel }: { readonly ariaLabel: string }) => <div role="img" aria-label={ariaLabel} />,
}));

const toPngMock = vi.hoisted(() => vi.fn());
vi.mock('html-to-image', () => ({ toPng: toPngMock }));

afterEach(() => {
  vi.restoreAllMocks();
  toPngMock.mockReset();
});

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

  it('renders the representative default comparison in the no-JavaScript static tree', async () => {
    const data = await fixtureAdapter.comparison({ modelIds: ['gpt-4o', 'deepseek-v3'] });
    const match = {
      routeId: 'compare' as const,
      pathname: '/compare',
      search: new URLSearchParams(),
      hash: '',
      params: {},
    };

    const html = renderToStaticMarkup(<PreviewComparePage match={match} data={data} />);

    expect(html).toContain('Review result');
    expect(html).toContain('GPT-4o vs DeepSeek V3');
    expect(html).toContain('aria-label="Exact capability comparison"');
    expect(html).toContain('Runtime and route economics');
    expect(html).toContain('Decision deltas');
  });

  it('takes the first static comparison tree from the validated payload order', async () => {
    const data = await fixtureAdapter.comparison({ modelIds: ['deepseek-v3', 'gpt-4o'] });
    const match = { routeId: 'compare' as const, pathname: '/compare', search: new URLSearchParams(), hash: '', params: {} };

    expect(renderToStaticMarkup(<PreviewComparePage match={match} data={data} />)).toContain('DeepSeek V3 vs GPT-4o');
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
    const data = await fixtureAdapter.comparison({ modelIds: ['gpt-4o', 'deepseek-v3'] });
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

    fireEvent.click(screen.getByRole('button', { name: 'Remove GPT-4o from comparison' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add a model' }));
    fireEvent.click(await screen.findByRole('option', { name: /GPT-4o/ }));
    expect(await screen.findByRole('link', { name: 'GPT-4o' })).toBeInTheDocument();
    expect(screen.queryAllByRole('link', { name: 'GPT-4o' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Add a model' }));
    expect(screen.queryByRole('option', { name: /GPT-4o/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Compare 2 models' }));

    expect(window.location.search).toBe('?models=deepseek-v3%2Cgpt-4o');
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('synchronizes a valid direct query after first rendering the static default without hydration warnings', async () => {
    const data = await fixtureAdapter.comparison({ modelIds: ['gpt-4o', 'deepseek-v3'] });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    window.history.replaceState({}, '', '/compare?models=deepseek-v3,gpt-4o');

    render(<PreviewComparePage match={{ routeId: 'compare', pathname: '/compare', search: new URLSearchParams('models=deepseek-v3,gpt-4o'), hash: '', params: {} }} data={data} />);

    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'DeepSeek V3 vs GPT-4o' })).toBeInTheDocument());
    expect(window.location.search).toBe('?models=deepseek-v3%2Cgpt-4o');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('preserves the static payload order when a direct comparison query is incomplete', async () => {
    const data = await fixtureAdapter.comparison({ modelIds: ['deepseek-v3', 'gpt-4o'] });
    window.history.replaceState({}, '', '/compare?models=gpt-4o');

    render(<PreviewComparePage match={{ routeId: 'compare', pathname: '/compare', search: new URLSearchParams('models=gpt-4o'), hash: '', params: {} }} data={data} />);

    await waitFor(() => expect(window.location.search).toBe('?models=deepseek-v3%2Cgpt-4o'));
    expect(screen.getByRole('heading', { level: 2, name: 'DeepSeek V3 vs GPT-4o' })).toBeInTheDocument();
  });

  it('preserves unavailable selected IDs in every comparison column and captured export content', async () => {
    const data = await fixtureAdapter.comparison({ modelIds: ['gpt-4o', 'deepseek-v3'] });
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:comparison');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    toPngMock.mockResolvedValue('data:image/png;base64,comparison');
    const match = { routeId: 'compare' as const, pathname: '/compare', search: new URLSearchParams('models=unknown-model,deepseek-v3,gpt-4o'), hash: '', params: {} };

    render(<PreviewComparePage match={match} data={data} />);

    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: '3-model comparison' })).toBeInTheDocument());
    const selected = screen.getByRole('list', { name: 'Selected comparison models' });
    expect(within(selected).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Unavailable model (unknown-model)',
      'DeepSeek V3',
      'GPT-4o',
    ]);
    const capability = screen.getByRole('region', { name: 'Exact capability comparison' });
    expect(within(capability).getAllByRole('columnheader').slice(1).map((header) => header.textContent)).toEqual([
      'Unavailable model (unknown-model)',
      'DeepSeek V3DeepSeek',
      'GPT-4oOpenAI',
    ]);
    expect(within(capability).getByRole('rowheader', { name: 'Reasoning' }).parentElement).toHaveTextContent('Unavailable — No approved fixture for unknown-model');
    const economics = screen.getByRole('region', { name: 'Exact runtime and route economics' });
    expect(within(economics).getAllByRole('columnheader').slice(1).map((header) => header.textContent)).toEqual([
      'Unavailable model (unknown-model)',
      'DeepSeek V3DeepSeek',
      'GPT-4oOpenAI',
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Download comparison data as CSV' }));
    const csv = await (createObjectUrl.mock.calls[0]?.[0] as Blob).text();
    expect(csv).toContain('Metric,Unavailable model (unknown-model),DeepSeek V3,GPT-4o');
    expect(csv).toContain('Reasoning,Unavailable — No approved fixture for unknown-model,83.0,91.0');

    fireEvent.click(screen.getByRole('button', { name: 'Download comparison image as PNG' }));
    await waitFor(() => expect(toPngMock).toHaveBeenCalled());
    expect(toPngMock.mock.calls[0]?.[0]).toHaveTextContent('Unavailable model (unknown-model)');
    expect(toPngMock.mock.calls[0]?.[0]).toHaveTextContent('No approved fixture for unknown-model');
  });
});
