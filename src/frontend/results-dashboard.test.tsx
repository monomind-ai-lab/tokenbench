import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildCalculatorSnapshot } from './calculator-state';
import { FRONTEND_TEST_CATALOG } from './test-fixtures';
import { ResultsDashboard } from './results-dashboard';

const directOffer = FRONTEND_TEST_CATALOG.modelOffers[0];
const workload = {
  conversationsPerDay: 10,
  messagesPerConversation: 8,
  inputTokensPerMessage: 750,
  outputTokensPerMessage: 250,
  activeDaysPerMonth: 25,
};

function snapshot() {
  return buildCalculatorSnapshot({
    modelOffers: [directOffer], selectedModelIds: [directOffer.id], modelMixBasisPoints: { [directOffer.id]: 10_000 }, workload, selectedPlan: FRONTEND_TEST_CATALOG.plans[0],
  });
}

function zeroWorkloadSnapshot() {
  return buildCalculatorSnapshot({
    modelOffers: [directOffer], selectedModelIds: [directOffer.id], modelMixBasisPoints: { [directOffer.id]: 10_000 },
    workload: { conversationsPerDay: 0, messagesPerConversation: 0, inputTokensPerMessage: 0, outputTokensPerMessage: 0, activeDaysPerMonth: 0 },
    selectedPlan: FRONTEND_TEST_CATALOG.plans[0],
  });
}

describe('calculator results dashboard', () => {
  it('shows finite cost facts while capacity remains not verified', () => {
    render(<ResultsDashboard selectedPlan={FRONTEND_TEST_CATALOG.plans[0]} snapshot={snapshot()} hasAvailableModels />);
    const apiCost = screen.getByText('API-equivalent monthly cost').parentElement!;
    const breakeven = screen.getByText('Breakeven messages per day').parentElement!;
    const efficiency = screen.getByText('Efficiency').parentElement!;
    const capacity = screen.getByText('Capacity evidence').parentElement!;
    expect(within(apiCost).getByText('$7.00')).toBeInTheDocument();
    expect(within(breakeven).getByText(/messages\/day/i)).toBeInTheDocument();
    expect(within(efficiency).getByText(/%/)).toBeInTheDocument();
    expect(within(capacity).getByText('Not independently verified')).toBeInTheDocument();
  });

  it('uses exactly one cost recommendation sentence and does not gate arithmetic on evidence', () => {
    render(<ResultsDashboard selectedPlan={FRONTEND_TEST_CATALOG.plans[0]} snapshot={snapshot()} hasAvailableModels />);
    expect(screen.getByText('API is cheaper on a token-equivalent basis.')).toBeInTheDocument();
    expect(screen.queryByText(/Choose a subscription with published capacity/)).not.toBeInTheDocument();
  });

  it('labels undefined zero-workload decision metrics as unavailable', () => {
    render(<ResultsDashboard selectedPlan={FRONTEND_TEST_CATALOG.plans[0]} snapshot={zeroWorkloadSnapshot()} hasAvailableModels />);
    expect(within(screen.getByText('Breakeven messages per day').parentElement!).getByText('Unavailable')).toBeInTheDocument();
    expect(within(screen.getByText('Breakeven monthly tokens').parentElement!).getByText('Unavailable')).toBeInTheDocument();
    expect(within(screen.getByText('Efficiency').parentElement!).getByText('Unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Not calculated')).not.toBeInTheDocument();
  });

  it('shows a finite breakeven monthly tokens value when the plan has fixed token capacity', () => {
    const fixedPlanSnapshot = buildCalculatorSnapshot({
      modelOffers: [directOffer], selectedModelIds: [directOffer.id], modelMixBasisPoints: { [directOffer.id]: 10_000 }, workload, selectedPlan: FRONTEND_TEST_CATALOG.plans[1],
    });
    render(<ResultsDashboard selectedPlan={FRONTEND_TEST_CATALOG.plans[1]} snapshot={fixedPlanSnapshot} hasAvailableModels />);
    expect(within(screen.getByText('Breakeven monthly tokens').parentElement!).getByText('11.4M')).toBeInTheDocument();
  });

  it('does not present a token breakeven for a plan with variable capacity', () => {
    render(<ResultsDashboard selectedPlan={FRONTEND_TEST_CATALOG.plans[0]} snapshot={snapshot()} hasAvailableModels />);
    expect(within(screen.getByText('Breakeven monthly tokens').parentElement!).getByText('Unavailable')).toBeInTheDocument();
  });

  it('does not claim equal costs when no subscription plan is selected', () => {
    const noPlanSnapshot = buildCalculatorSnapshot({ modelOffers: [directOffer], selectedModelIds: [directOffer.id], modelMixBasisPoints: { [directOffer.id]: 10_000 }, workload });
    render(<ResultsDashboard snapshot={noPlanSnapshot} hasAvailableModels />);
    expect(screen.getAllByText('Select a paid individual plan to compare.').length).toBeGreaterThan(0);
    expect(screen.queryByText('The token-equivalent costs are equal.')).not.toBeInTheDocument();
  });

  it('separates published source prices from derived scenario costs and carries timestamped assumptions', () => {
    const auditSnapshot = buildCalculatorSnapshot({
      modelOffers: [directOffer], selectedModelIds: [directOffer.id], modelMixBasisPoints: { [directOffer.id]: 10_000 },
      workload: { conversationsPerDay: 10, messagesPerConversation: 2, inputTokensPerMessage: 750, outputTokensPerMessage: 250, activeDaysPerMonth: 20 },
      selectedPlan: FRONTEND_TEST_CATALOG.plans[1], calculationTimestamp: '2026-08-14T00:00:00.000Z',
    });
    render(<ResultsDashboard catalog={FRONTEND_TEST_CATALOG} hasAvailableModels selectedPlan={FRONTEND_TEST_CATALOG.plans[1]} snapshot={auditSnapshot} />);
    expect(screen.getByRole('heading', { name: 'Published source prices' })).toBeVisible();
    expect(screen.getByText('Published input price')).toBeVisible();
    expect(screen.getByText('Scenario input cost')).toBeVisible();
    expect(screen.getByText('Calculation assumptions')).toBeVisible();
  });
});
