import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fixtureAdapter } from '../frontend/preview-data/adapter';
import { previewRoutes } from '../preview/route-manifest';
import { SubscribeVsApiPage, parseSubscribeVsApiPageData } from './subscribe-vs-api-page';

describe('SubscribeVsApiPage', () => {
  it('delivers a typed React crossover analysis with matching semantic values', async () => {
    const route = previewRoutes.find((candidate) => candidate.id === 'subscribe-vs-api');
    const match = route?.match(new URL('https://tokenbench.test/subscribe-vs-api?seats=12&tokenVolume=120000000'));
    const data = await fixtureAdapter.subscription({ seats: 12 });
    if (!route || !match) throw new Error('Subscribe versus API preview route is unavailable');

    const { container } = render(<SubscribeVsApiPage match={match} data={data} />);

    expect(parseSubscribeVsApiPageData(data)).toEqual(data);
    expect(route.delivery).toBe('react');
    expect(route.documentReadiness).toEqual({ status: 'ready' });
    expect(screen.getByRole('heading', { level: 1, name: 'Should you subscribe or pay as you go?' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Exact API and Monthly subscription crossover values' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Selected model source prices' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Derived monthly API line items' })).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'Exact API and Monthly subscription crossover values' })).getByText(/120M tokens/i)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/SaaS/i);
  });

  it('keeps cache allocations within the adjusted input-token total', async () => {
    const data = await fixtureAdapter.subscription({ seats: 1 });
    const match = { routeId: 'subscribe-vs-api' as const, pathname: '/subscribe-vs-api', search: new URLSearchParams(), hash: '', params: {} };

    render(<SubscribeVsApiPage match={match} data={data} />);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Cache-read share' }), { target: { value: '100' } });

    expect(screen.getByRole('spinbutton', { name: 'Cache-read share' })).toHaveValue(95);
    expect(screen.getByRole('table', { name: 'Exact API and Monthly subscription crossover values' })).toBeInTheDocument();
  });

  it('rejects incomplete route-pricing evidence before hydration', async () => {
    const data = structuredClone(await fixtureAdapter.subscription({}));
    const pricing = data.data?.models[0]?.routePricing;
    if (!pricing || pricing.availability !== 'available') throw new Error('Expected route-pricing fixture');
    delete (pricing.value as { cache?: unknown }).cache;

    expect(parseSubscribeVsApiPageData(data)).toBeNull();
  });

  it('reports a recoverable share failure when clipboard access is unavailable', async () => {
    const data = await fixtureAdapter.subscription({});
    const match = { routeId: 'subscribe-vs-api' as const, pathname: '/subscribe-vs-api', search: new URLSearchParams(), hash: '', params: {} };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });

    render(<SubscribeVsApiPage match={match} data={data} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The link could not be copied');
  });
});
