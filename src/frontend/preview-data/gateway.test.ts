import { describe, expect, it } from 'vitest';
import { createEvidenceTransport } from './evidence-transport';
import { createPreviewDataGateway } from './gateway';

describe('preview data gateway', () => {
  it('validates deterministic accepted evidence before mapping it to page-facing data', async () => {
    const adapter = createPreviewDataGateway(createEvidenceTransport());
    const models = await adapter.models({});
    const profile = await adapter.profile('alpha');
    const lifecycle = await adapter.lifecycle({ horizonDays: 30 });
    const rankings = await adapter.rankings({});
    const comparison = await adapter.comparison({ modelIds: ['alpha', 'beta', 'gamma'] });
    const subscription = await adapter.subscription({});

    for (const result of [models, profile, lifecycle, rankings, comparison, subscription]) {
      expect(result.contractVersion).toBe('ui-data-contract/v1');
      expect(result).not.toHaveProperty('method');
    }
  });

  it('returns the explicit accepted unavailable profile rather than a fixture fallback', async () => {
    const adapter = createPreviewDataGateway(createEvidenceTransport({ profile: 'unavailable' }));

    await expect(adapter.profile('alpha')).resolves.toMatchObject({ status: 'unavailable', data: null });
  });
});
