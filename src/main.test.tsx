import { beforeEach, describe, expect, it, vi } from 'vitest';

const startPreviewRouteMock = vi.hoisted(() => vi.fn());

vi.mock('./preview/client-resolver', () => ({ startPreviewRoute: startPreviewRouteMock }));

describe('browser entrypoint', () => {
  beforeEach(() => {
    vi.resetModules();
    startPreviewRouteMock.mockClear();
    document.body.innerHTML = '<div id="root"><main>Server fallback</main></div>';
    window.history.replaceState({}, '', '/popular-models/');
  });

  it('delegates browser startup to the manifest client resolver', async () => {
    await import('./main.tsx');

    expect(startPreviewRouteMock).toHaveBeenCalledWith(document, window.location);
  });
});
