import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEvidenceTransport } from './evidence-transport';

function evidence<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), 'contracts/ui-data-contract/v1/evidence', path), 'utf8')) as T;
}

describe('accepted evidence transport', () => {
  it('reads only the retained accepted response artifacts for deterministic preview input', async () => {
    const transport = createEvidenceTransport();

    await expect(transport.request('models', {})).resolves.toEqual(evidence('responses/models.json'));
    await expect(transport.request('profile', { slug: 'alpha' })).resolves.toEqual(evidence('responses/profile.json'));
    await expect(transport.request('lifecycle', { horizonDays: 30 })).resolves.toEqual(evidence('responses/lifecycle.json'));
    await expect(transport.request('rankings', {})).resolves.toEqual(evidence('responses/rankings.json'));
    await expect(transport.request('comparison', { modelIds: ['alpha', 'beta', 'gamma'] })).resolves.toEqual(evidence('responses/comparison.json'));
    await expect(transport.request('subscription', {})).resolves.toEqual(evidence('responses/subscription.json'));
  });

  it('selects retained mixed-source and unavailable evidence only when those deterministic cases are explicit', async () => {
    const transport = createEvidenceTransport({ profile: 'unavailable', rankings: 'mixed-source' });

    const rankings = await transport.request('rankings', {});
    const profile = await transport.request('profile', { slug: 'alpha' });

    expect(rankings).toEqual(evidence('responses/rankings.mixed-source.json'));
    expect(profile).toEqual(evidence('responses/profile.unavailable.json'));
  });
});
