import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fixtureAdapter } from '../frontend/preview-data/adapter';
import { ACCEPTED_SUBSCRIPTION_QUERY, type SubscriptionQuery, type UiDataContractV1, type SubscriptionData } from '../frontend/preview-data/contracts';
import { createEvidenceTransport } from '../frontend/preview-data/evidence-transport';
import { createPreviewDataGateway } from '../frontend/preview-data/gateway';
import { previewRoutes } from '../preview/route-manifest';
import { SubscribeVsApiPage, parseSubscribeVsApiPageData } from './subscribe-vs-api-page';

async function acceptedSubscriptionData(): Promise<UiDataContractV1<SubscriptionData>> {
  return createPreviewDataGateway(createEvidenceTransport()).subscription(ACCEPTED_SUBSCRIPTION_QUERY);
}

function calculationAdapter(data: UiDataContractV1<SubscriptionData>) {
  const subscription = vi.fn(async (_query: SubscriptionQuery) => data);
  return { adapter: { ...fixtureAdapter, subscription }, subscription };
}

function unavailableSubscription(reason: string): UiDataContractV1<SubscriptionData> {
  return {
    contractVersion: 'ui-data-contract/v1',
    status: 'unavailable',
    reason,
    fetchedAt: '2026-08-18T00:00:00.000Z',
    effectiveAt: null,
    data: null,
    provenance: [],
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

describe('SubscribeVsApiPage', () => {
  it('requires explicit adapter injection at the page boundary', () => {
    const match = { routeId: 'subscribe-vs-api' as const, pathname: '/subscribe-vs-api', search: new URLSearchParams(), hash: '', params: {} };

    // @ts-expect-error The page must never silently fall back to fixture transport data.
    const element = <SubscribeVsApiPage match={match} data={null} />;

    expect(element.type).toBe(SubscribeVsApiPage);
  });

  it('delivers a typed React crossover analysis with matching semantic values', async () => {
    const route = previewRoutes.find((candidate) => candidate.id === 'subscribe-vs-api');
    const match = route?.match(new URL('https://tokenbench.test/subscribe-vs-api'));
    const data = await acceptedSubscriptionData();
    const { adapter } = calculationAdapter(data);
    if (!route || !match) throw new Error('Subscribe versus API preview route is unavailable');

    const { container } = render(<SubscribeVsApiPage match={match} data={data} adapter={adapter} />);

    expect(parseSubscribeVsApiPageData(data)).toEqual(data);
    expect(route.delivery).toBe('react');
    expect(route.documentReadiness).toEqual({ status: 'ready' });
    expect(screen.getByRole('heading', { level: 1, name: 'Should you subscribe or pay as you go?' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Exact API and Monthly subscription crossover values' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Selected model source prices' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Derived monthly API line items' })).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'Exact API and Monthly subscription crossover values' })).getByText(/40M tokens/i)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/SaaS/i);
  });

  it('keeps cache allocations within the adjusted input-token total', async () => {
    const data = await acceptedSubscriptionData();
    const { adapter } = calculationAdapter(data);
    const match = { routeId: 'subscribe-vs-api' as const, pathname: '/subscribe-vs-api', search: new URLSearchParams(), hash: '', params: {} };

    render(<SubscribeVsApiPage match={match} data={data} adapter={adapter} />);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Cache-read share' }), { target: { value: '100' } });

    expect(screen.getByRole('spinbutton', { name: 'Cache-read share' })).toHaveValue(90);
    expect(screen.getByRole('table', { name: 'Exact API and Monthly subscription crossover values' })).toBeInTheDocument();
  });

  it('normalizes direct-loaded cache shares before calculating the crossover', async () => {
    const data = await acceptedSubscriptionData();
    const { adapter } = calculationAdapter(data);
    const match = {
      routeId: 'subscribe-vs-api' as const,
      pathname: '/subscribe-vs-api',
      search: new URLSearchParams('cacheReadShare=100'),
      hash: '',
      params: {},
    };

    render(<SubscribeVsApiPage match={match} data={data} adapter={adapter} />);

    expect(screen.getByRole('spinbutton', { name: 'Cache-read share' })).toHaveValue(90);
    expect(screen.getByRole('spinbutton', { name: 'Cache-write share' })).toHaveValue(10);
    expect(screen.getByRole('table', { name: 'Exact API and Monthly subscription crossover values' })).toBeInTheDocument();
  });

  it('renders accepted source provenance and unavailable long-context evidence', async () => {
    const data = await acceptedSubscriptionData();
    const { adapter } = calculationAdapter(data);
    const match = { routeId: 'subscribe-vs-api' as const, pathname: '/subscribe-vs-api', search: new URLSearchParams(), hash: '', params: {} };

    render(<SubscribeVsApiPage match={match} data={data} adapter={adapter} />);
    fireEvent.click(screen.getByLabelText(/Long-context workload/i));

    const sourcePrices = screen.getByRole('table', { name: 'Selected model source prices' });
    expect(within(sourcePrices).getAllByText('Long-context input')).not.toHaveLength(0);
    expect(within(sourcePrices).getAllByText('Unavailable; standard input used in scenario')).not.toHaveLength(0);
    const derived = screen.getByRole('table', { name: 'Derived monthly API line items' });
    expect(within(derived).getAllByRole('row')).not.toHaveLength(1);

    const provenance = screen.getByRole('region', { name: 'Source provenance' });
    expect(within(provenance).getAllByText('Deterministic primary contract fixture')).not.toHaveLength(0);
    expect(within(provenance).getAllByText('fixture-primary-r1 · /data')).not.toHaveLength(0);
    expect(within(provenance).getAllByText(/No accepted long-context input price is available/)).not.toHaveLength(0);
    expect(within(provenance).getAllByText('2026-08-18T00:00:00.000Z')).not.toHaveLength(0);
  });

  it('rejects incomplete route-pricing evidence before hydration', async () => {
    const data = structuredClone(await fixtureAdapter.subscription({}));
    const pricing = data.data?.models[0]?.routePricing;
    if (!pricing || pricing.availability !== 'available') throw new Error('Expected route-pricing fixture');
    delete (pricing.value as { cache?: unknown }).cache;

    expect(parseSubscribeVsApiPageData(data)).toBeNull();
  });

  it('reports a recoverable share failure when clipboard access is unavailable', async () => {
    const data = await acceptedSubscriptionData();
    const { adapter } = calculationAdapter(data);
    const match = { routeId: 'subscribe-vs-api' as const, pathname: '/subscribe-vs-api', search: new URLSearchParams(), hash: '', params: {} };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });

    render(<SubscribeVsApiPage match={match} data={data} adapter={adapter} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The link could not be copied');
  });

  it('loads a catalog through the injected adapter and submits updated scenarios through the calculation boundary', async () => {
    const data = await acceptedSubscriptionData();
    const { adapter, subscription } = calculationAdapter(data);
    const match = { routeId: 'subscribe-vs-api' as const, pathname: '/subscribe-vs-api', search: new URLSearchParams(), hash: '', params: {} };

    render(<SubscribeVsApiPage match={match} data={data} adapter={adapter} />);

    await waitFor(() => expect(subscription).toHaveBeenCalledWith({ operation: 'catalog' }));
    fireEvent.change(screen.getByRole('slider', { name: 'Subscription seats' }), { target: { value: '3' } });
    await waitFor(() => expect(subscription).toHaveBeenLastCalledWith(expect.objectContaining({ operation: 'calculate', seats: 3 })));
  });

  it('renders the injected adapter calculation failure instead of keeping a locally derived result', async () => {
    const data = await acceptedSubscriptionData();
    const unavailableCalculation = {
      contractVersion: 'ui-data-contract/v1' as const,
      status: 'unavailable' as const,
      reason: 'No accepted calculation evidence matches this scenario.',
      fetchedAt: '2026-08-18T00:00:00.000Z',
      effectiveAt: null,
      data: null,
      provenance: [],
    };
    const subscription = vi.fn(async (query: { readonly operation?: string }) => query.operation === 'catalog' ? data : unavailableCalculation);
    const adapter = { ...fixtureAdapter, subscription };
    const match = { routeId: 'subscribe-vs-api' as const, pathname: '/subscribe-vs-api', search: new URLSearchParams(), hash: '', params: {} };

    render(<SubscribeVsApiPage match={match} data={data} adapter={adapter} />);

    await waitFor(() => expect(subscription).toHaveBeenCalledWith({ operation: 'catalog' }));
    fireEvent.change(screen.getByRole('slider', { name: 'Subscription seats' }), { target: { value: '3' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('No accepted calculation evidence matches this scenario.');
  });

  it('clears an initial calculation and renders an explicit error when catalog loading rejects', async () => {
    const data = await acceptedSubscriptionData();
    const subscription = vi.fn(async () => { throw new Error('catalog network failure'); });
    const adapter = { ...fixtureAdapter, subscription };
    const match = { routeId: 'subscribe-vs-api' as const, pathname: '/subscribe-vs-api', search: new URLSearchParams(), hash: '', params: {} };

    render(<SubscribeVsApiPage match={match} data={data} adapter={adapter} />);

    expect(screen.getByRole('table', { name: 'Exact API and Monthly subscription crossover values' })).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Subscription catalog request failed.');
    expect(screen.queryByRole('table', { name: 'Exact API and Monthly subscription crossover values' })).not.toBeInTheDocument();
  });

  it('clears a stale calculation and renders an explicit error when calculate rejects', async () => {
    const data = await acceptedSubscriptionData();
    const subscription = vi.fn(async (query: SubscriptionQuery) => {
      if (query.operation === 'catalog') return data;
      throw new Error('calculation network failure');
    });
    const adapter = { ...fixtureAdapter, subscription };
    const match = { routeId: 'subscribe-vs-api' as const, pathname: '/subscribe-vs-api', search: new URLSearchParams(), hash: '', params: {} };

    render(<SubscribeVsApiPage match={match} data={data} adapter={adapter} />);

    expect(screen.getByRole('table', { name: 'Exact API and Monthly subscription crossover values' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('slider', { name: 'Subscription seats' }), { target: { value: '3' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Subscription calculation request failed.');
    expect(screen.queryByRole('table', { name: 'Exact API and Monthly subscription crossover values' })).not.toBeInTheDocument();
  });

  it('keeps the newest calculation response when older requests resolve later', async () => {
    const data = await acceptedSubscriptionData();
    const calculations: ReturnType<typeof deferred<UiDataContractV1<SubscriptionData>>>[] = [];
    const subscription = vi.fn((query: SubscriptionQuery) => {
      if (query.operation === 'catalog') return Promise.resolve(data);
      const request = deferred<UiDataContractV1<SubscriptionData>>();
      calculations.push(request);
      return request.promise;
    });
    const adapter = { ...fixtureAdapter, subscription };
    const match = { routeId: 'subscribe-vs-api' as const, pathname: '/subscribe-vs-api', search: new URLSearchParams(), hash: '', params: {} };

    render(<SubscribeVsApiPage match={match} data={data} adapter={adapter} />);

    fireEvent.change(screen.getByRole('slider', { name: 'Subscription seats' }), { target: { value: '3' } });
    fireEvent.change(screen.getByRole('slider', { name: 'Subscription seats' }), { target: { value: '4' } });
    await waitFor(() => expect(calculations).toHaveLength(2));
    await act(async () => { calculations[1]!.resolve(unavailableSubscription('Newest calculation result.')); });
    expect(await screen.findByRole('alert')).toHaveTextContent('Newest calculation result.');
    await act(async () => { calculations[0]!.resolve(unavailableSubscription('Older calculation result.')); });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Newest calculation result.'));
  });
});
