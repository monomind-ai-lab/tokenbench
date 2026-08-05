import { beforeEach, describe, expect, it, vi } from 'vitest';

const rootRenderer = vi.hoisted(() => vi.fn());
const createRootMock = vi.hoisted(() => vi.fn(() => ({ render: rootRenderer })));

vi.mock('react-dom/client', () => ({ createRoot: createRootMock }));
vi.mock('./App.tsx', () => ({ default: () => null }));
vi.mock('./GuidesApp.tsx', () => ({ default: () => null }));

describe('leaderboard browser entrypoint', () => {
  beforeEach(() => {
    vi.resetModules();
    createRootMock.mockClear();
    rootRenderer.mockClear();
    document.body.innerHTML = '<div id="root"><div class="static-page-shell">Crawlable fallback</div></div>';
    window.history.replaceState({}, '', '/leaderboards/llm/coding/');
  });

  it('replaces the crawlable leaderboard shell before mounting the interactive app', async () => {
    await import('./main.tsx');

    const root = document.getElementById('root')!;
    expect(root).toBeEmptyDOMElement();
    expect(createRootMock).toHaveBeenCalledWith(root);
    expect(rootRenderer).toHaveBeenCalledTimes(1);
  });
});
