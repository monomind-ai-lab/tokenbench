import { describe, expect, it } from 'vitest';
import { weightedRankingCsv, weightedRankingShareUrl } from './weighted-ranking-export';
import { DEFAULT_WEIGHTED_RANKING_STATE } from './weighted-ranking-state';

describe('weighted ranking exports', () => {
  it('exports exact score, cost, frontier, and SLA evidence in cheapest-first order', () => {
    const csv = weightedRankingCsv([
      { id: 'slow', name: 'Slow', provider: 'Provider A', score: 90, cost: 3, meetsSla: false, frontier: true },
      { id: 'fast', name: 'Fast', provider: 'Provider B', score: 80, cost: 1, meetsSla: true, frontier: true },
    ]);

    expect(csv).toBe([
      'Cost rank,Model,Provider,Weighted score,Evaluation cost / success $,Weighted frontier,SLA result',
      '1,Fast,Provider B,80.0,1,Yes,Pass',
      '2,Slow,Provider A,90.0,3,Yes,Outside threshold',
    ].join('\n'));
  });

  it('preserves the current workbench query and requested section in share links', () => {
    const state = { ...DEFAULT_WEIGHTED_RANKING_STATE, minThroughput: 65 };
    expect(weightedRankingShareUrl('https://tokenbench.test/make-it-yours/', state, 'weighted-score-cost').href)
      .toBe('https://tokenbench.test/make-it-yours/?access=all&outside=1&ttft=0.80&tps=65&view=rows&weights=reasoning%3A20.00%2Ccoding%3A20.00%2Cagentic-coding%3A20.00%2Cmathematics%3A15.00%2Cdata-analysis%3A10.00%2Clanguage%3A5.00%2Cinstruction-following%3A10.00#weighted-score-cost');
  });
});
