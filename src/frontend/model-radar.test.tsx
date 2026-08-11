import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ModelRadar } from './model-radar';
import { modelProfileViewModelFixture } from './model-profile-test-fixture';

describe('ModelRadar', () => {
  it('keeps missing axes unavailable instead of turning them into zero', () => {
    render(<ModelRadar axes={modelProfileViewModelFixture().profile.radar} />);
    expect(screen.getByRole('region', { name: 'Capability radar' })).toHaveTextContent('Coding percentile');
    expect(screen.getByText('Multimodal: Unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Multimodal: 0th percentile')).not.toBeInTheDocument();
  });
});
