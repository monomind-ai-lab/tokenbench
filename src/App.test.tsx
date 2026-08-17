import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { FRONTEND_TEST_CATALOG } from './frontend/test-fixtures';
import './index.css';

describe('calculator application flow', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/subscribe-vs-api/');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(FRONTEND_TEST_CATALOG), {
      status: 200,
      headers: { 'content-type': 'application/json', etag: `"${FRONTEND_TEST_CATALOG.revision}"` },
    })));
  });

  it('starts with message-level workload inputs and a visible arithmetic recommendation', async () => {
    render(<App />);
    for (const name of ['Conversations per day', 'Messages per conversation', 'Average input tokens per message', 'Average output tokens per message', 'Active days per month']) {
      expect(await screen.findByRole('spinbutton', { name })).toBeInTheDocument();
    }
    expect(screen.getByText('Advanced model mapping')).toBeInTheDocument();
    expect((await screen.findAllByText(/token-equivalent basis/)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('Capacity evidence')).length).toBeGreaterThan(0);
  });
});
