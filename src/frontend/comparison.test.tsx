import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PlanOffer } from '../catalog/contracts';
import type { ConversationWorkload } from '../catalog/subscription-api-calculator';
import { Comparison } from './comparison';
import { FRONTEND_TEST_CATALOG } from './test-fixtures';

const directOffer = FRONTEND_TEST_CATALOG.modelOffers[0];
const workload: ConversationWorkload = {
  conversationsPerDay: 10,
  messagesPerConversation: 8,
  inputTokensPerMessage: 750,
  outputTokensPerMessage: 250,
  activeDaysPerMonth: 25,
};

function plan(id: string, monthlyCostMicroDollars: number): PlanOffer {
  return {
    ...FRONTEND_TEST_CATALOG.plans[1],
    id,
    displayName: id,
    monthlyCostMicroDollars,
    supportedModelIds: [directOffer.modelId],
  };
}

describe('same-workload plan comparison', () => {
  it('calculates each paid individual plan with its own direct default offer', () => {
    const catalog = {
      ...FRONTEND_TEST_CATALOG,
      plans: [plan('Lower plan', 5_000_000), plan('Higher plan', 20_000_000)],
    };
    render(<Comparison
      catalog={catalog}
      selectedProviderId="provider-a"
      selectedModelIds={[directOffer.id]}
      selectedPlanId="Lower plan"
      workload={workload}
      modelMixBasisPoints={{ [directOffer.id]: 10_000 }}
    />);

    const table = screen.getByRole('table', { name: 'Same-workload plan comparison' });
    expect(within(table).getByText('Lower plan')).toBeInTheDocument();
    expect(within(table).getByText('Higher plan')).toBeInTheDocument();
    expect(within(table).getAllByText('$7.00').length).toBeGreaterThan(0);
    expect(within(table).getByText('Subscription is cheaper on a token-equivalent basis.')).toBeInTheDocument();
  });
});
