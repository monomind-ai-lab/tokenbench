import { describe, expect, it } from 'vitest';
import { modelBrand, providerBrand } from './provider-brands';

describe('providerBrand', () => {
  it('uses only reviewed domains and deterministic fallbacks', () => {
    expect(providerBrand('openai')).toEqual({ domain: 'openai.com', label: 'OpenAI', fallback: 'O' });
    expect(providerBrand('unknown-lab')).toEqual({ domain: null, label: 'Unknown lab', fallback: 'U' });
  });

  it('does not infer a brand for an unreviewed model family', () => {
    expect(modelBrand('unknown/model')).toBeNull();
  });
});
