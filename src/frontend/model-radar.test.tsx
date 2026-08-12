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
    expect(document.querySelector('.model-radar-boundary')).not.toBeNull();
    expect(document.querySelector('.model-radar-evidence')).toBeNull();
  });

  it('draws a filled evidence web when at least three axes are measured', () => {
    render(<ModelRadar axes={[
      { key: 'overall', label: 'Overall', percentile: 90, rank: 4, fieldSize: 31 },
      { key: 'coding', label: 'Coding', percentile: 93.333, rank: 3, fieldSize: 31 },
      { key: 'knowledge', label: 'Knowledge', percentile: 60, rank: 12, fieldSize: 31 },
    ]} />);
    expect(document.querySelector('.model-radar-evidence')).not.toBeNull();
    expect(document.querySelectorAll('.model-radar-point')).toHaveLength(3);
  });
});
