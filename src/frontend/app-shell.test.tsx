import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { FRONTEND_TEST_CATALOG } from './test-fixtures';
import '../index.css';

function respondWithCatalog(catalog = FRONTEND_TEST_CATALOG) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(catalog), {
    status: 200,
    headers: { 'content-type': 'application/json', etag: `"${catalog.revision}"` },
  })));
}

describe('responsive calculator app shell', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.theme = 'light';
    respondWithCatalog();
  });

  it('renders derived metrics, evidence links, and separated pricing basis comparisons', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: /API[- ]equivalent value/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Direct provider API', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'OpenRouter API', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'OpenCode Zen', level: 3 })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /evidence/i }).length).toBeGreaterThan(0);
    expect(screen.getByText('Availability: available')).toBeInTheDocument();
  });

  it('does not present API-only model owners as subscription plan providers', async () => {
    const apiOnlyOffer = {
      ...FRONTEND_TEST_CATALOG.modelOffers[1],
      id: 'provider-b:beta:openrouter',
      providerId: 'provider-b',
      displayName: 'Beta via OpenRouter',
      modelId: 'beta',
    };
    respondWithCatalog({
      ...FRONTEND_TEST_CATALOG,
      modelOffers: [...FRONTEND_TEST_CATALOG.modelOffers, apiOnlyOffer],
    });
    render(<App />);

    await screen.findByRole('heading', { name: /API[- ]equivalent value/i });
    const providerGroup = screen.getByRole('group', { name: /Provider selection/i });
    expect(within(providerGroup).getByRole('radio', { name: 'Provider A' })).toBeInTheDocument();
    expect(within(providerGroup).queryByRole('radio', { name: 'Provider B' })).not.toBeInTheDocument();
  });

  it('limits plan selection to paid individual subscriptions', async () => {
    respondWithCatalog({
      ...FRONTEND_TEST_CATALOG,
      plans: [
        ...FRONTEND_TEST_CATALOG.plans,
        { ...FRONTEND_TEST_CATALOG.plans[0], id: 'provider-a:free', displayName: 'Free', monthlyCostMicroDollars: 0 },
        { ...FRONTEND_TEST_CATALOG.plans[0], id: 'provider-a:team', displayName: 'Team', monthlyCostMicroDollars: 90_000_000 },
      ],
    });
    render(<App />);

    await screen.findByRole('heading', { name: /API Equivalent Value/i });
    const planGroup = screen.getByRole('group', { name: /Plan Selection/i });
    expect(within(planGroup).getByRole('radio', { name: /Starter/i })).toBeInTheDocument();
    expect(within(planGroup).queryByRole('radio', { name: /Free/i })).not.toBeInTheDocument();
    expect(within(planGroup).queryByRole('radio', { name: /Team/i })).not.toBeInTheDocument();
  });

  it('redistributes selected model usage and changes derived values when a preset is edited', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: /API[- ]equivalent value/i });

    const modelGroup = screen.getByRole('group', { name: /Model selection/i });
    const checkboxes = within(modelGroup).getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);
    const usageMix = screen.getByRole('group', { name: /Model usage mix/i });
    expect(within(usageMix).getByLabelText(/Alpha Direct/)).toHaveAttribute('aria-valuenow', '50');

    expect(screen.getByRole('button', { name: /Balanced/i })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Input-heavy/i }));
    expect(screen.getByRole('button', { name: /Balanced/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /Input-heavy/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText(/Input share/i)).toHaveAttribute('aria-valuenow', '80');
    fireEvent.change(screen.getByLabelText(/Expected monthly usage/i), { target: { value: '3000000' } });
    expect(screen.getByLabelText(/Expected monthly usage/i)).toHaveValue(3000000);
    expect(screen.getByRole('button', { name: /Input-heavy/i })).toHaveAttribute('aria-pressed', 'false');

    const usageRange = screen.getByRole('slider', { name: /Monthly usage range/i });
    fireEvent.change(usageRange, { target: { value: '50000000' } });
    expect(screen.getByLabelText(/Expected monthly usage/i)).toHaveValue(50000000);
    expect(usageRange).toHaveAttribute('aria-valuetext', '50,000,000 tokens');
  });

  it('keeps calculator state while switching language and persists the dark theme', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: /API[- ]equivalent value/i });
    const usage = screen.getByLabelText(/Expected monthly usage/i);
    fireEvent.change(usage, { target: { value: '4200000' } });
    fireEvent.click(screen.getByRole('button', { name: /Toggle dark theme/i }));
    fireEvent.change(screen.getByRole('combobox', { name: /Language/i }), { target: { value: 'zh-TW' } });

    expect(usage).toHaveValue(4200000);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('ai-cost-engine:theme')).toBe('dark');
    expect(screen.getByRole('button', { name: /Toggle light theme/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('combobox', { name: /Language/i })).toHaveValue('zh-TW');
  });

  it('shows actionable retry UI for a failed catalog request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/catalog/i);
    const retry = screen.getByRole('button', { name: /Retry loading catalog/i });
    respondWithCatalog();
    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByRole('heading', { name: /API[- ]equivalent value/i })).toBeInTheDocument());
  });

  it('renders comparison offers as compact cards at a 320px viewport', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 });
    render(<App />);
    await screen.findByRole('heading', { name: /API[- ]equivalent value/i });
    expect(document.querySelector('[data-layout="compact"]')).toBeInTheDocument();
    expect(screen.getAllByTestId('offer-card').length).toBeGreaterThan(0);
  });

  it('gives every range control a minimum 44px touch target', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: /API[- ]equivalent value/i });

    const ranges = screen.getAllByRole('slider');
    expect(ranges.length).toBeGreaterThan(0);
    expect(ranges.every((range) => window.getComputedStyle(range).minHeight === '44px')).toBe(true);
  });

  it('shows savings and separate full-width plan and API pricing panels with selected models highlighted', async () => {
    render(<App />);
    const savingsHeading = await screen.findByRole('heading', { name: /Est\. Monthly Savings/i });
    expect(savingsHeading).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Cost-first recommendation/i })).not.toBeInTheDocument();

    const planHeading = screen.getByRole('heading', { name: /Individual Subscription Plans/i });
    const apiHeading = screen.getByRole('heading', { name: /^API Prices$/i });
    const planPanel = planHeading.closest('section');
    const apiPanel = apiHeading.closest('section');
    expect(planPanel).not.toBe(apiPanel);
    expect(apiPanel?.querySelectorAll('tr[data-selected="true"]')).toHaveLength(3);
    expect(apiPanel?.querySelectorAll('tr[data-selected="true"] .selected-badge')).toHaveLength(3);
  });
});
