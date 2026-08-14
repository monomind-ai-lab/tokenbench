import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LeaderboardEntry } from '../../benchmarks/leaderboards';
import { LeaderboardVerticalChart } from './leaderboard-vertical-chart';

function chartEntry(index: number): LeaderboardEntry {
  const modelKey = `model-${index}`;
  const metric = {
    modelKey,
    metricKey: 'benchlm:category:coding',
    category: 'coding',
    value: 100 - index,
    rawValue: null,
    rank: index + 1,
    lower: null,
    upper: null,
    voteCount: null,
    unit: 'score' as const,
    sourceId: 'benchlm' as const,
    sourceUpdatedAt: '2026-08-14T00:00:00.000Z',
    sourceModelId: modelKey,
    sourceArtifactId: 'benchlm-models',
    rankingEligible: true,
    methodology: 'benchlm_raw_composite' as const,
    observationCount: null,
    sessionCount: null,
  };
  return {
    model: {
      modelKey,
      slug: modelKey,
      name: `Model ${index}`,
      creator: index === 0 ? 'OpenAI' : 'Example Labs',
      sourceType: 'Proprietary',
      reasoningType: index === 0 ? 'Reasoning model' : null,
      releaseDate: null,
      contextWindowTokens: 128_000,
      evidenceStatus: 'supported',
      rankingEligible: true,
      confidenceLower: null,
      confidenceUpper: null,
      benchmarkCount: 1,
      sourceId: 'benchlm',
      sourceModelId: modelKey,
      sourceArtifactId: 'benchlm-models',
    },
    metric,
    metrics: [metric],
    primaryPrice: null,
    blendedCostPerMillion: null,
    contextWindowTokens: 128_000,
    sourceRank: index + 1,
    onValueFrontier: false,
  };
}

describe('LeaderboardVerticalChart', () => {
  it('renders a Top 20 vertical index with provider and reasoning evidence', () => {
    render(<LeaderboardVerticalChart
      title="Coding"
      entries={Array.from({ length: 25 }, (_, index) => chartEntry(index))}
    />);

    expect(screen.getByRole('img', { name: /Coding Top 20 vertical index/i })).toBeInTheDocument();
    expect(screen.getByText('Reasoning model')).toBeInTheDocument();
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
  });
});
