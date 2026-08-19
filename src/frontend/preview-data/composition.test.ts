import { describe, expect, it, vi } from 'vitest';
import { createUiDataComposition, type UiDataCompositionOptions } from './composition';

describe('UI data composition', () => {
  it('uses retained evidence only when preview evidence mode is explicit', async () => {
    const adapter = createUiDataComposition({ target: 'preview', mode: 'evidence' });

    const result = await adapter.models({});

    expect(result).toMatchObject({
      contractVersion: 'ui-data-contract/v1',
      status: 'available',
      data: { models: expect.arrayContaining([expect.objectContaining({ id: 'alpha' })]) },
    });
  });

  it('rejects evidence mode for production composition', () => {
    const invalid = { target: 'production', mode: 'evidence' } as unknown as UiDataCompositionOptions;
    expect(() => createUiDataComposition(invalid))
      .toThrow('Production UI data composition requires HTTP mode.');
  });

  it('requires an explicit HTTP base URL', () => {
    const missingBaseUrl = { target: 'production', mode: 'http' } as unknown as UiDataCompositionOptions;
    expect(() => createUiDataComposition(missingBaseUrl))
      .toThrow('HTTP UI data composition requires an explicit baseUrl.');
    expect(() => createUiDataComposition({ target: 'production', mode: 'http', baseUrl: 'file:///tmp/evidence.json' }))
      .toThrow('HTTP UI data composition baseUrl must use http or https.');
  });

  it('propagates production transport failures without fixture fallback', async () => {
    const failure = new Error('upstream unavailable');
    const fetchImpl = vi.fn().mockRejectedValue(failure);
    const adapter = createUiDataComposition({
      target: 'production',
      mode: 'http',
      baseUrl: 'https://data.tokenbench.invalid',
      fetchImpl,
    });

    await expect(adapter.models({})).rejects.toBe(failure);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
