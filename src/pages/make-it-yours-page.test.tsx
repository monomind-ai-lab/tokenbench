import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fixtureAdapter } from '../frontend/preview-data/adapter';
import { previewRoutes } from '../preview/route-manifest';
import { MakeItYoursPage, parseMakeItYoursPageData } from './make-it-yours-page';

describe('MakeItYoursPage', () => {
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
    expect(screen.getByRole('table', { name: 'Exact SLA measurements' })).toBeInTheDocument();
  });

  it('shows a recoverable warning and pauses results for zero weights', async () => {
    const data = await fixtureAdapter.rankings({});
    const match = { routeId: 'make-it-yours' as const, pathname: '/make-it-yours/', search: new URLSearchParams(), hash: '', params: {} };

    render(<MakeItYoursPage match={match} data={data} />);
    for (const label of ['Agentic', 'Coding', 'Reasoning', 'Math', 'Multimodal', 'Throughput']) {
      fireEvent.change(screen.getByRole('slider', { name: `${label} weight` }), { target: { value: '0' } });
    }

    expect(screen.getByRole('alert')).toHaveTextContent('At least one capability weight must be greater than zero.');
    expect(screen.getByText('Ranking is paused until at least one capability weight is above zero.')).toBeInTheDocument();
  });
});
