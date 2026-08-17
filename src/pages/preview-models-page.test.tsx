import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fixtureAdapter } from '../frontend/preview-data/adapter';
import { previewRoutes } from '../preview/route-manifest';
import { parsePreviewModelsPageData, PreviewModelsPage } from './preview-models-page';

describe('PreviewModelsPage', () => {
  it('rejects incomplete model rows before hydration', () => {
    expect(parsePreviewModelsPageData({
      contractVersion: 'ui-data-contract/v1',
      status: 'partial',
      fetchedAt: '2026-08-17T00:00:00.000Z',
      provenance: [],
      data: { models: [{ id: 'partial' }] },
    })).toBeNull();
  });

  it('delivers the Models workbench through React and preserves the catalog anchor', async () => {
    const route = previewRoutes.find((candidate) => candidate.id === 'models');
    const match = route?.match(new URL('https://tokenbench.test/models#catalog'));
    const data = await fixtureAdapter.models({});
    if (!route || !match) throw new Error('Models preview route is unavailable');

    render(<PreviewModelsPage match={match} data={data} />);

    expect(route.delivery).toBe('react');
    expect(route.documentReadiness).toEqual({ status: 'ready' });
    expect(screen.getByRole('heading', { level: 1, name: 'Models workbench' })).toBeInTheDocument();
    expect(document.getElementById('catalog')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Price–performance frontier' })).toBeInTheDocument();
    expect(document.querySelector('[data-frontier-connection]')).toBeInTheDocument();
    expect(screen.getByText(/Frontier models from lowest cost to highest capability/i)).toBeInTheDocument();
  });

  it('filters, sorts, changes catalog views, and only shows the comparison tray with two selections', async () => {
    const data = await fixtureAdapter.models({});
    const match = {
      routeId: 'models' as const,
      pathname: '/models',
      search: new URLSearchParams(),
      hash: '#catalog',
      params: {},
    };

    render(<PreviewModelsPage match={match} data={data} />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search model or provider' }), { target: { value: 'deepseek' } });
    expect(screen.getByRole('heading', { name: 'DeepSeek V3', level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'GPT-4o', level: 3 })).toBeNull();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search model or provider' }), { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: 'Table view' }));
    expect(screen.getByRole('table', { name: 'Model catalog' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cards view' }));

    fireEvent.click(screen.getByRole('button', { name: 'Select GPT-4o for comparison' }));
    expect(screen.queryByRole('region', { name: 'Compare selected models' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Select DeepSeek V3 for comparison' }));
    const tray = screen.getByRole('region', { name: 'Compare selected models' });
    expect(within(tray).getByText('2 of 4 models selected.')).toBeInTheDocument();
    expect(within(tray).getByRole('link', { name: 'Open comparison' })).toHaveAttribute('href', '/compare?models=gpt-4o%2Cdeepseek-v3');
  });
});
