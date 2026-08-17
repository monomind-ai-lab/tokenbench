import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fixtureAdapter } from '../frontend/preview-data/adapter';
import { previewRoutes } from '../preview/route-manifest';
import { LifecycleRadarPage, parseLifecycleRadarPageData } from './lifecycle-radar-page';

describe('LifecycleRadarPage', () => {
  it('rejects incomplete lifecycle rows before hydration', () => {
    expect(parseLifecycleRadarPageData({
      contractVersion: 'ui-data-contract/v1',
      status: 'partial',
      fetchedAt: '2026-08-17T00:00:00.000Z',
      provenance: [],
      data: { models: [{ modelId: 'partial' }] },
    })).toBeNull();
  });

  it('delivers the lifecycle radar through React with explicit unavailable replacement evidence', async () => {
    const route = previewRoutes.find((candidate) => candidate.id === 'model-lifecycle');
    const match = route?.match(new URL('https://tokenbench.test/model-lifecycle'));
    const data = await fixtureAdapter.lifecycle({ horizonDays: 90 });
    if (!route || !match) throw new Error('Lifecycle preview route is unavailable');

    render(<LifecycleRadarPage match={match} data={data} />);

    expect(route.delivery).toBe('react');
    expect(route.documentReadiness).toEqual({ status: 'ready' });
    expect(screen.getByRole('heading', { level: 1, name: 'Production model lifecycle & retirement radar' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'GPT-4 Turbo' })).toBeInTheDocument();
    expect(screen.getByText('No approved replacement source')).toBeInTheDocument();
    expect(screen.getAllByText(/Effective 2026-08-11/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('list', { name: 'Lifecycle timeline' })).toBeInTheDocument();
  });

  it('switches between lifecycle cards and the semantic table without inferring a replacement', async () => {
    const data = await fixtureAdapter.lifecycle({ horizonDays: 90 });
    const match = {
      routeId: 'model-lifecycle' as const,
      pathname: '/model-lifecycle',
      search: new URLSearchParams(),
      hash: '',
      params: {},
    };

    render(<LifecycleRadarPage match={match} data={data} />);

    fireEvent.click(screen.getByRole('button', { name: 'Table view' }));
    expect(screen.getByRole('table', { name: 'Lifecycle events' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'No approved replacement source' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cards view' }));
    expect(screen.queryByRole('table', { name: 'Lifecycle events' })).toBeNull();
  });
});
