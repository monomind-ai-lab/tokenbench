import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { classifySlaEvidence, SlaLeaderboard, type SlaEvidenceRow } from './sla-leaderboard';

const OBSERVED_AT = '2026-08-14T00:00:00.000Z';

const evidence: readonly SlaEvidenceRow[] = [
  {
    id: 'alpha', slug: 'alpha', name: 'Alpha', provider: 'Example', ttft: 0.8, throughput: 60,
    conditions: 'Published 128-token streaming test.', observedAt: OBSERVED_AT,
    sourceLabel: 'Example provider evidence', sourceUrl: 'https://example.com/alpha', evidenceStatus: 'supported',
  },
  {
    id: 'partial', slug: 'partial', name: 'Partial', provider: 'Example', ttft: null, throughput: 80,
    conditions: null, observedAt: OBSERVED_AT,
    sourceLabel: 'Example provider evidence', sourceUrl: 'https://example.com/partial', evidenceStatus: 'supported',
  },
  {
    id: 'slow', slug: 'slow', name: 'Slow', provider: 'Example', ttft: 0.9, throughput: 80,
    conditions: 'Published 128-token streaming test.', observedAt: OBSERVED_AT,
    sourceLabel: 'Example provider evidence', sourceUrl: 'https://example.com/slow', evidenceStatus: 'supported',
  },
];

describe('classifySlaEvidence', () => {
  it('keeps the exact boundary and incomplete evidence distinct', () => {
    expect(classifySlaEvidence({ ttft: 0.8, throughput: 60 }, { maxTtft: 0.8, minThroughput: 60 })).toBe('pass');
    expect(classifySlaEvidence({ ttft: null, throughput: 80 }, { maxTtft: 0.8, minThroughput: 60 })).toBe('incomplete');
    expect(classifySlaEvidence({ ttft: 0.9, throughput: 80 }, { maxTtft: 0.8, minThroughput: 60 })).toBe('fail');
  });
});

describe('SlaLeaderboard', () => {
  it('previews thresholds locally but shares and records only the applied thresholds', () => {
    const onApplied = vi.fn();
    render(<SlaLeaderboard evidence={evidence} canonicalUrl="https://tokenbench.test/leaderboards/sla/" onApplied={onApplied} />);

    expect(screen.getByText('1 pass · 1 incomplete')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'SLA eligibility' })).getByText('Partial')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'TTFT by model' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Throughput by model' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Maximum TTFT in seconds'), { target: { value: '0.7' } });
    expect(screen.getByText('Preview: 0 pass · 1 incomplete')).toBeInTheDocument();
    expect(onApplied).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Apply SLA thresholds' }));
    expect(onApplied).toHaveBeenCalledWith({ maxTtft: 0.7, minThroughput: 60 });
    expect(screen.getByLabelText('Share URL')).toHaveValue('https://tokenbench.test/leaderboards/sla/?maxTtft=0.7&minThroughput=60');
  });
});
