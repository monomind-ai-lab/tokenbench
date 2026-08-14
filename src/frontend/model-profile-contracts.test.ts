import { describe, expect, it } from 'vitest';
import { parseModelProfileViewModel } from './model-profile-contracts';
import { modelProfileViewModelFixture } from './model-profile-test-fixture';

describe('model profile frontend contract', () => {
  it('accepts a complete durable profile and rejects mismatched identity', () => {
    const fixture = modelProfileViewModelFixture();
    expect(parseModelProfileViewModel(fixture)).toEqual(fixture);
    expect(parseModelProfileViewModel({
      ...fixture,
      profile: { ...fixture.profile, identity: { ...fixture.profile.identity, slug: 'different' } },
    })).toBeNull();
  });

  it('preserves endpoint provenance rows and rejects a row without a host identity', () => {
    const fixture = modelProfileViewModelFixture();
    const endpointEvidence = [{
      endpointId: 'openrouter:openai/gpt-5-6-sol', hostId: 'openrouter', native: false,
      availability: 'available', inputPrice: 5, outputPrice: 30, cacheReadPrice: null, cacheWritePrice: null,
      longContextRule: 'Published route context: 400,000 tokens.', ttft: null, throughput: null,
      conditions: null, effectiveAt: '2026-08-11T18:00:00.000Z',
    }];
    const envelope = { ...fixture, endpointEvidence };

    expect(parseModelProfileViewModel(envelope)).toEqual(envelope);
    expect(parseModelProfileViewModel({
      ...envelope,
      endpointEvidence: [{ ...endpointEvidence[0], hostId: '' }],
    })).toBeNull();
  });
});
