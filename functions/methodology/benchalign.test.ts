import { describe, expect, it, vi } from 'vitest';
import { onRequest } from './benchalign';

describe('removed preview BenchAlign methodology route', () => {
  it('returns a non-cacheable 404 instead of a retained static page on the ui-revamp-3 branch', async () => {
    const next = vi.fn();

    const response = await onRequest({ env: { CF_PAGES_BRANCH: 'ui-revamp-3' }, next });

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('location')).toBeNull();
    expect(await response.text()).toBe('Not Found');
    expect(next).not.toHaveBeenCalled();
  });

  it('preserves the existing static response outside the ui-revamp-3 branch', async () => {
    const staticResponse = new Response('Existing methodology page');
    const next = vi.fn().mockResolvedValue(staticResponse);

    const response = await onRequest({ env: { CF_PAGES_BRANCH: 'production' }, next });

    expect(response).toBe(staticResponse);
    expect(next).toHaveBeenCalledOnce();
  });
});
