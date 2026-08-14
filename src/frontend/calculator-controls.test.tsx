import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ConversationWorkload } from '../catalog/subscription-api-calculator';
import { CalculatorControls } from './calculator-controls';
import { FRONTEND_TEST_CATALOG } from './test-fixtures';

const directOffer = FRONTEND_TEST_CATALOG.modelOffers[0];
const workload: ConversationWorkload = {
  conversationsPerDay: 10,
  messagesPerConversation: 8,
  inputTokensPerMessage: 750,
  outputTokensPerMessage: 250,
  activeDaysPerMonth: 25,
};

function renderControls(overrides: Record<string, unknown> = {}) {
  const props = {
    catalog: FRONTEND_TEST_CATALOG,
    providerIds: ['provider-a'],
    selectedProviderId: 'provider-a',
    selectedPlanId: FRONTEND_TEST_CATALOG.plans[0].id,
    selectedModelIds: [directOffer.id],
    modelMixBasisPoints: { [directOffer.id]: 10_000 },
    workload,
    onProviderChange: vi.fn(),
    onPlanChange: vi.fn(),
    onModelToggle: vi.fn(),
    onModelShareChange: vi.fn(),
    onWorkloadChange: vi.fn(),
    onMappingModeChange: vi.fn(),
    ...overrides,
  };
  return { ...render(<CalculatorControls {...props} />), props };
}

describe('calculator controls', () => {
  it('exposes five labelled numeric workload inputs and an Advanced override', () => {
    renderControls();
    for (const name of ['Conversations per day', 'Messages per conversation', 'Average input tokens per message', 'Average output tokens per message', 'Active days per month']) {
      expect(screen.getByRole('spinbutton', { name })).toBeInTheDocument();
    }
    expect(screen.getByText('Advanced model mapping')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Expected monthly usage/i)).not.toBeInTheDocument();
  });

  it('reports a single primary input change without deriving a hidden monthly token field', () => {
    const { props } = renderControls();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Conversations per day' }), { target: { value: '12' } });
    expect(props.onWorkloadChange).toHaveBeenCalledWith({ ...workload, conversationsPerDay: 12 });
  });

  it('keeps Advanced model mapping open by default', () => {
    renderControls();
    expect(screen.queryByRole('status', { name: 'Default API mapping' })).not.toBeInTheDocument();
    expect(screen.getByText('Advanced model mapping').closest('details')).toHaveAttribute('open');
  });

  it('hides the usage mix selector until two or more models are selected', () => {
    renderControls();
    expect(screen.queryByRole('group', { name: 'Model usage mix' })).not.toBeInTheDocument();

    renderControls({ selectedModelIds: [directOffer.id, FRONTEND_TEST_CATALOG.modelOffers[1].id] });
    expect(screen.getByRole('group', { name: 'Model usage mix' })).toBeInTheDocument();
    expect(screen.getByText('100% total')).toBeInTheDocument();
  });

  it('discloses character estimation and keeps a manual monthly-token override until reset', () => {
    const onCostUsageChange = vi.fn();
    renderControls({
      costUsage: { characterCount: 40_000, charactersPerToken: 4, manualMonthlyTokens: null, cacheReadBasisPoints: 0, cacheWriteTokens: 0, longContextTokens: 0 },
      onCostUsageChange,
    });

    expect(screen.getByRole('spinbutton', { name: 'Text or code characters per month' })).toHaveValue(40_000);
    expect(screen.getByText(/estimated at 4 characters per token/i)).toBeVisible();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Manual monthly token override' }), { target: { value: '8500' } });
    expect(onCostUsageChange).toHaveBeenCalledWith(expect.objectContaining({ manualMonthlyTokens: 8_500 }));
    expect(screen.getByRole('button', { name: 'Reset manual token override' })).toBeInTheDocument();
  });

  it('emits one bounded cost input event at the field interaction point', () => {
    const listener = vi.fn();
    window.addEventListener('tokenbench:analytics', listener);
    renderControls();

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Conversations per day' }), { target: { value: '12' } });

    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ name: 'cost_input_changed', field: 'workload', route: '/cost/calculator/' });
    window.removeEventListener('tokenbench:analytics', listener);
  });

  it('reports only a bounded validation reason when a numeric field is invalid', () => {
    const listener = vi.fn();
    window.addEventListener('tokenbench:analytics', listener);
    renderControls();

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Conversations per day' }), { target: { value: '1.5' } });

    expect((listener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ name: 'cost_validation_failed', reason: 'invalid', route: '/cost/calculator/' });
    window.removeEventListener('tokenbench:analytics', listener);
  });
});
