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

describe('comparison', () => {
  it('omits the removed same-workload table while keeping the plan and API price tables', () => {
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

    expect(screen.queryByRole('table', { name: 'Same-workload plan comparison' })).not.toBeInTheDocument();
    expect(screen.getByRole('table', { name: /paid individual subscription plans/i })).toBeInTheDocument();
    expect(screen.getAllByRole('table', { name: /model pricing/i }).length).toBeGreaterThan(0);
  });

  it('omits API route groups that have no verified offers', () => {
    const catalog = {
      ...FRONTEND_TEST_CATALOG,
      modelOffers: FRONTEND_TEST_CATALOG.modelOffers.filter((offer) => offer.pricingBasis === 'openrouter'),
    };
    render(<Comparison
      catalog={catalog}
      selectedProviderId="provider-a"
      selectedModelIds={[directOffer.id]}
      selectedPlanId="provider-a:starter"
      workload={workload}
      modelMixBasisPoints={{ [directOffer.id]: 10_000 }}
    />);

    expect(screen.queryByText('No Direct provider API offers')).not.toBeInTheDocument();
    expect(screen.queryByText('No OpenCode Zen offers')).not.toBeInTheDocument();
    expect(screen.getByText('OpenRouter API')).toBeInTheDocument();
  });
});
