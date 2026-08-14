import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CustomLeaderboard, type CustomLeaderboardModel } from './custom-leaderboard';

const models: readonly CustomLeaderboardModel[] = [
  {
    id: 'balanced', slug: 'balanced', name: 'Balanced', provider: 'Example',
    scores: { agentic: 80, coding: 90, reasoning: 70, math: 75, multimodal: 60 }, throughput: 100,
    observedAt: '2026-08-14T00:00:00.000Z', sourceLabel: 'Published evidence', sourceUrl: 'https://example.com/balanced', evidenceStatus: 'supported',
  },
  {
    id: 'fast', slug: 'fast', name: 'Fast', provider: 'Example',
    scores: { agentic: 70, coding: 70, reasoning: 70, math: 70, multimodal: 70 }, throughput: 200,
    observedAt: '2026-08-14T00:00:00.000Z', sourceLabel: 'Published evidence', sourceUrl: 'https://example.com/fast', evidenceStatus: 'supported',
  },
];

describe('CustomLeaderboard', () => {
  it('refuses zero-sum weights and only shares validated applied integer state', () => {
    const onApplied = vi.fn();
    render(<CustomLeaderboard models={models} canonicalUrl="https://tokenbench.test/leaderboards/custom/" onApplied={onApplied} />);

    expect(screen.getByRole('table', { name: 'Custom leaderboard results' })).toHaveTextContent('Balanced');
    expect(screen.getByText(/Throughput normalization: 2 eligible published models, min 100 tok\/s, max 200 tok\/s\./)).toBeInTheDocument();

    for (const domain of ['Agentic', 'Coding', 'Reasoning', 'Math', 'Multimodal', 'Throughput']) {
      fireEvent.change(screen.getByLabelText(`${domain} weight`), { target: { value: '0' } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Apply custom weights' }));

    expect(screen.getByRole('alert')).toHaveTextContent('At least one weight must be greater than zero');
    expect(onApplied).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Share URL')).not.toBeInTheDocument();
  });

  it('equalizes exact integer weights and exposes each score contribution', () => {
    render(<CustomLeaderboard models={models} canonicalUrl="https://tokenbench.test/leaderboards/custom/" />);

    fireEvent.click(screen.getByRole('button', { name: 'Equalize weights' }));
    expect(screen.getByText('Weight sum: 100')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apply custom weights' }));

    expect(screen.getByRole('table', { name: 'Custom leaderboard results' })).toHaveTextContent('Composite');
    expect(screen.getByRole('table', { name: 'Balanced contribution rows' })).toHaveTextContent('Throughput');
    expect(screen.getByLabelText('Share URL')).toHaveValue('https://tokenbench.test/leaderboards/custom/?agentic=17&coding=17&reasoning=17&math=17&multimodal=16&throughput=16');
  });
});
