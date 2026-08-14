import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildCalculatorSnapshot } from './calculator-state';
import { BreakevenDashboard } from './breakeven-dashboard';
import { FRONTEND_TEST_CATALOG } from './test-fixtures';
const offer = FRONTEND_TEST_CATALOG.modelOffers[0];
const workload = { conversationsPerDay: 10, messagesPerConversation: 8, inputTokensPerMessage: 750, outputTokensPerMessage: 250, activeDaysPerMonth: 25 };
const snapshot = (conversationsPerDay = 10) => buildCalculatorSnapshot({ modelOffers: [offer], selectedModelIds: [offer.id], modelMixBasisPoints: { [offer.id]: 10_000 }, workload: { ...workload, conversationsPerDay }, selectedPlan: { ...FRONTEND_TEST_CATALOG.plans[1], supportedModelIds: [offer.modelId] } });

vi.mock('./charts/chart-js', () => ({ createTokenBenchChart: vi.fn(() => ({ destroy: vi.fn() })) }));

describe('BreakevenDashboard', () => {
  it('renders Chart.js enhancement and exact samples from one fee selector while capacity remains independent', () => {
    render(<BreakevenDashboard snapshot={snapshot()} hasAvailableModels />);

    expect(screen.getByRole('heading', { name: 'Fee crossover by monthly token volume' })).toBeVisible();
    expect(screen.getByRole('table', { name: 'Breakeven cost samples' })).toHaveTextContent('300M');
    expect(screen.getByText(/Subscription capacity evidence/i)).toBeVisible();
    expect(screen.getByText(/rounding is display-only/i)).toBeVisible();
  });

  it('renders unavailable when no published model route is available', () => {
    render(<BreakevenDashboard snapshot={snapshot()} hasAvailableModels={false} />);
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.getByText(/No verified models/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
