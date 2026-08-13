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

  it('distinguishes a measured last place from a missing axis', () => {
    // A 0 percentile is a real measurement, but plotting it at the polygon
    // centre makes it indistinguishable from an axis with no evidence.
    render(<ModelRadar axes={[
      { key: 'overall', label: 'Overall', percentile: 90, rank: 4, fieldSize: 31 },
      { key: 'coding', label: 'Coding', percentile: 60, rank: 12, fieldSize: 31 },
      { key: 'vision', label: 'Vision', percentile: 0, rank: 31, fieldSize: 31 },
      { key: 'math', label: 'Math', percentile: null, rank: null, fieldSize: null },
    ]} />);

    // The measured last-place axis still reports its rank in the text list.
    expect(screen.getByText(/Rank #31 of 31/)).toBeInTheDocument();
    expect(screen.getByText('Math: Unavailable')).toBeInTheDocument();

    // It must render a visible marker; only the unmeasured axis has none.
    expect(document.querySelectorAll('.model-radar-point')).toHaveLength(3);
    const measuredZero = document.querySelector('.model-radar-point-floor');
    expect(measuredZero).not.toBeNull();
  });
});
