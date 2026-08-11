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
});
