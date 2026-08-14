import { describe, expect, it } from 'vitest';
import { buildBreakevenResult, type BreakevenScenario } from './breakeven-state';

const scenario: BreakevenScenario = {
  seats: 10,
  feePerSeat: 20,
  maxTokensMillions: 300,
  inputShare: 0.75,
  inputPricePerMillion: 0.27,
  outputPricePerMillion: 1.10,
  capacityTokens: null,
};

describe('buildBreakevenResult', () => {
  it('keeps an out-of-domain fee crossover separate from unavailable capacity evidence', () => {
    const result = buildBreakevenResult(scenario);

    expect(result).toMatchObject({
      kind: 'available',
      subscriptionFee: 200,
      crossoverInDomain: false,
      capacity: { kind: 'unavailable' },
    });
    if (result.kind !== 'available') throw new Error('Expected a fee result');
    expect(result.crossoverMillions).toBeCloseTo(418.8481675, 6);
    expect(result.message).toMatch(/outside the displayed 0–300M range/i);
    expect(result.points.at(-1)).toMatchObject({ tokensMillions: 300, cheaper: 'api' });
  });

  it('rejects invalid display-domain and price dimensions instead of treating them as zero', () => {
    expect(buildBreakevenResult({ ...scenario, seats: 0 })).toMatchObject({
      kind: 'unavailable', reason: 'invalid_seats',
    });
    expect(buildBreakevenResult({ ...scenario, outputPricePerMillion: null })).toMatchObject({
      kind: 'unavailable', reason: 'partial_prices',
    });
  });
});
