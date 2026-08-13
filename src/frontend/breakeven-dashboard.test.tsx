import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildCalculatorSnapshot } from './calculator-state';
import { BreakevenDashboard } from './breakeven-dashboard';
import { FRONTEND_TEST_CATALOG } from './test-fixtures';
const offer = FRONTEND_TEST_CATALOG.modelOffers[0];
const workload = { conversationsPerDay: 10, messagesPerConversation: 8, inputTokensPerMessage: 750, outputTokensPerMessage: 250, activeDaysPerMonth: 25 };
const snapshot = (conversationsPerDay = 10) => buildCalculatorSnapshot({ modelOffers: [offer], selectedModelIds: [offer.id], modelMixBasisPoints: { [offer.id]: 10_000 }, workload: { ...workload, conversationsPerDay }, selectedPlan: { ...FRONTEND_TEST_CATALOG.plans[1], supportedModelIds: [offer.modelId] } });
describe('BreakevenDashboard', () => {
  it('renders SVG and exact table from one crossover-centered series with a flat plan line', () => { const value = snapshot(); render(<BreakevenDashboard snapshot={value} hasAvailableModels />); expect(screen.getByTestId('breakeven-api-series')).toBeInTheDocument(); const line = screen.getByTestId('breakeven-plan-series'); expect(line).toHaveAttribute('y1', line.getAttribute('y2')); expect(screen.getAllByTestId('breakeven-api-point')).toHaveLength(5); const table = screen.getByRole('table'); expect(table).toBeInTheDocument(); expect(table).toHaveTextContent(value.breakEvenTokens!.toLocaleString()); });
  it('renders unavailable for a non-positive workload', () => { render(<BreakevenDashboard snapshot={snapshot(0)} hasAvailableModels />); expect(screen.getByText('Unavailable')).toBeInTheDocument(); expect(screen.getByText(/positive workload/i)).toBeInTheDocument(); expect(screen.queryByRole('table')).not.toBeInTheDocument(); });
});
