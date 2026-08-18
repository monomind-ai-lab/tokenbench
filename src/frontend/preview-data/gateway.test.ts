import { describe, expect, it } from 'vitest';
import { createEvidenceTransport } from './evidence-transport';
import { createPreviewDataGateway } from './gateway';
import { ACCEPTED_LIFECYCLE_AS_OF, ACCEPTED_SUBSCRIPTION_QUERY } from './contracts';

describe('preview data gateway', () => {
  it('validates deterministic accepted evidence before mapping it to page-facing data', async () => {
    const adapter = createPreviewDataGateway(createEvidenceTransport());
    const models = await adapter.models({});
    const profile = await adapter.profile('alpha');
    const lifecycle = await adapter.lifecycle({ asOf: ACCEPTED_LIFECYCLE_AS_OF, horizonDays: 30 });
    const rankings = await adapter.rankings({});
    const comparison = await adapter.comparison({ modelIds: ['alpha', 'beta', 'gamma'] });
    const subscription = await adapter.subscription(ACCEPTED_SUBSCRIPTION_QUERY);

    for (const result of [models, profile, lifecycle, rankings, comparison, subscription]) {
      expect(result.contractVersion).toBe('ui-data-contract/v1');
      expect(result).not.toHaveProperty('method');
    }
  });

  it('returns the explicit accepted unavailable profile rather than a fixture fallback', async () => {
    const adapter = createPreviewDataGateway(createEvidenceTransport({ profile: 'unavailable' }));

    await expect(adapter.profile('alpha')).resolves.toMatchObject({ status: 'unavailable', data: null });
  });

  it('rejects deterministic evidence whose retained normalized request does not match the caller request', async () => {
    const adapter = createPreviewDataGateway(createEvidenceTransport());

    await expect(adapter.profile('gpt-4o')).resolves.toMatchObject({
      status: 'unavailable',
      data: null,
      reason: expect.stringMatching(/does not match/i),
    });
    await expect(adapter.subscription({ operation: 'catalog' })).resolves.toMatchObject({
      status: 'unavailable',
      data: null,
      reason: expect.stringMatching(/does not match/i),
    });
  });
});
