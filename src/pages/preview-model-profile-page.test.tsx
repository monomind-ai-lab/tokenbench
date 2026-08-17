import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fixtureAdapter } from '../frontend/preview-data/adapter';
import { previewRoutes } from '../preview/route-manifest';
import { parsePreviewModelProfilePageData, PreviewModelProfilePage } from './preview-model-profile-page';

describe('PreviewModelProfilePage', () => {
  it('rejects an incomplete profile row before hydration', () => {
    expect(parsePreviewModelProfilePageData({
      contractVersion: 'ui-data-contract/v1',
      status: 'partial',
      fetchedAt: '2026-08-17T00:00:00.000Z',
      provenance: [],
      data: { model: { id: 'partial' } },
    })).toBeNull();
  });

  it('keeps the query-profile route React-delivered without replacing it with the canonical SSR detail route', async () => {
    const route = previewRoutes.find((candidate) => candidate.id === 'model-profile');
    const match = route?.match(new URL('https://tokenbench.test/model-profile?model=gpt-4o'));
    const data = await fixtureAdapter.profile('gpt-4o');
    if (!route || !match) throw new Error('Model profile preview route is unavailable');

    render(<PreviewModelProfilePage match={match} data={data} />);

    expect(route.delivery).toBe('react');
    expect(route.documentReadiness).toEqual({ status: 'ready' });
    const hero = screen.getByRole('banner', { name: 'GPT-4o profile' });
    expect(within(hero).getByRole('heading', { level: 1, name: 'GPT-4o' })).toBeInTheDocument();
    expect(within(hero).getByText('Current')).toBeInTheDocument();
    expect(within(hero).getByRole('link', { name: 'Add to comparison' })).toHaveAttribute('href', '/compare?models=gpt-4o');
    expect(screen.queryByRole('link', { name: /canonical model profile/i })).toBeNull();
  });

  it('renders radar, SLA, source, and effective-time evidence from the fixture contract', async () => {
    const data = await fixtureAdapter.profile('gpt-4o');
    const match = {
      routeId: 'model-profile' as const,
      pathname: '/model-profile',
      search: new URLSearchParams('model=gpt-4o'),
      hash: '',
      params: {},
    };

    render(<PreviewModelProfilePage match={match} data={data} />);

    expect(screen.getByRole('img', { name: 'Capability radar' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Runtime SLA evidence', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Time to first token (p50)')).toBeInTheDocument();
    expect(screen.getAllByText(/Illustrative prototype data/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Effective 2026-08-12/i)).toBeInTheDocument();
    expect(screen.getByText('No approved cache-write price source')).toBeInTheDocument();
  });
});
