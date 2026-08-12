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
    mappingMode: 'default' as const,
    defaultApiEquivalentOffer: directOffer,
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

  it('keeps Advanced model mapping open by default and discloses the visible default route', () => {
    renderControls();
    const mapping = screen.getByRole('status', { name: 'Default API mapping' });
    expect(mapping).toHaveTextContent(directOffer.displayName);
    expect(screen.getByText('Advanced model mapping').closest('details')).toHaveAttribute('open');
  });

  it('hides the usage mix selector until two or more models are selected', () => {
    renderControls();
    expect(screen.queryByRole('group', { name: 'Model usage mix' })).not.toBeInTheDocument();

    renderControls({ selectedModelIds: [directOffer.id, FRONTEND_TEST_CATALOG.modelOffers[1].id] });
    expect(screen.getByRole('group', { name: 'Model usage mix' })).toBeInTheDocument();
    expect(screen.getByText('100% total')).toBeInTheDocument();
  });
});
