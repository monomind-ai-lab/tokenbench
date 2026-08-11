import { describe, expect, it } from 'vitest';
import * as runtimeTypes from './types';
import { BOOTSTRAP_CATALOG } from './catalog/bootstrap';
import { validateCatalogResponse } from './catalog/validation';

describe('legacy frontend type module', () => {
  it('exports language choices only and the production bootstrap is source-linked', () => {
    expect(runtimeTypes).not.toHaveProperty('PROVIDERS');
    expect(validateCatalogResponse(BOOTSTRAP_CATALOG)).toBe(BOOTSTRAP_CATALOG);
    expect(BOOTSTRAP_CATALOG.modelOffers.filter((offer) => offer.providerId === 'openai'))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ modelId: 'gpt-5.6-sol', inputMicroDollarsPerMillion: 5_000_000, outputMicroDollarsPerMillion: 30_000_000 }),
        expect.objectContaining({ modelId: 'gpt-5.6-terra', inputMicroDollarsPerMillion: 2_500_000, outputMicroDollarsPerMillion: 15_000_000 }),
        expect.objectContaining({ modelId: 'gpt-5.6-luna', inputMicroDollarsPerMillion: 1_000_000, outputMicroDollarsPerMillion: 6_000_000 }),
      ]));
  });
});
